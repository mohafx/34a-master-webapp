import { supabase } from '../lib/supabase';
import type {
    OralExamEntitlement,
    OralExamEvaluation,
    OralExamSession,
    OralExamStartResponse,
    OralExamTranscriptTurn,
} from '../types';

// Service für die KI-gestützte mündliche Prüfungssimulation.
// Ruft die (bereits live deployten) Edge Functions oral-exam-session /
// oral-exam-evaluation auf (JWT wird von supabase.functions.invoke automatisch
// mitgesendet) und liest Sessions per RLS direkt aus oral_exam_sessions.
// Vertrag: docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

const ORAL_EXAM_TABLE = 'oral_exam_sessions';

// supabase.functions.invoke liefert bei non-2xx einen FunctionsHttpError, dessen
// Body in error.context (Response) steckt. Diese Helfer holt das JSON heraus,
// damit wir Fehlercodes wie "paywallRequired" / "ticketLimitReached" auswerten können.
async function readFunctionErrorBody(error: any): Promise<any | null> {
    try {
        const ctx = error?.context;
        if (ctx && typeof ctx.json === 'function') {
            return await ctx.json();
        }
    } catch (_) {
        /* ignore */
    }
    return null;
}

export class OralExamPaywallError extends Error {
    entitlement?: OralExamEntitlement;

    constructor(entitlement?: OralExamEntitlement) {
        super('paywallRequired');
        this.name = 'OralExamPaywallError';
        this.entitlement = entitlement;
    }
}

export class OralExamTicketLimitError extends Error {
    entitlement?: OralExamEntitlement;

    constructor(entitlement?: OralExamEntitlement) {
        super('ticketLimitReached');
        this.name = 'OralExamTicketLimitError';
        this.entitlement = entitlement;
    }
}

/**
 * Startet eine mündliche Prüfungssimulation. Legt serverseitig eine Session an
 * und liefert die ElevenLabs Signed URL + Dynamic Variables zurück.
 * @throws OralExamPaywallError wenn Free-Kontingent (1 Gratis-Test) aufgebraucht
 * @throws OralExamTicketLimitError wenn das Premium-Kontingent aufgebraucht ist
 */
export async function startOralExamSession(
    focusTopic?: string | null,
    requestedMode?: 'free_test_3q' | 'full_simulation' | null,
): Promise<OralExamStartResponse> {
    const { data, error } = await supabase.functions.invoke('oral-exam-session', {
        body: {
            focus_topic: focusTopic ?? null,
            requested_mode: requestedMode ?? null,
        },
    });

    if (error) {
        const body = await readFunctionErrorBody(error);
        if (body?.error === 'unauthorized') {
            throw new Error('Bitte melde dich an, um die mündliche Prüfung zu starten.');
        }
        throw new Error(body?.error || error.message || 'Mündliche Prüfung konnte nicht gestartet werden.');
    }

    // paywallRequired wird mit Status 200 zurückgegeben → landet in data.
    if (data?.paywallRequired) {
        throw new OralExamPaywallError(data.entitlement);
    }
    if (data?.ticketLimitReached) {
        throw new OralExamTicketLimitError(data.entitlement);
    }

    if (!data?.sessionId || !data?.signedUrl) {
        throw new Error('Unerwartete Antwort vom Server (keine Session/Signed-URL).');
    }

    return data as OralExamStartResponse;
}

/** Lädt Prüfungstickets/Startberechtigung, ohne eine ElevenLabs-Session anzulegen. */
export async function getOralExamEntitlement(): Promise<OralExamEntitlement> {
    const { data, error } = await supabase.functions.invoke('oral-exam-entitlement');

    if (error) {
        const body = await readFunctionErrorBody(error);
        if (body?.error === 'unauthorized') {
            throw new Error('Bitte melde dich an, um die mündliche Prüfung zu starten.');
        }
        throw new Error(body?.error || error.message || 'Prüfungstickets konnten nicht geladen werden.');
    }

    if (!data?.entitlement) {
        throw new Error('Unerwartete Antwort vom Server (keine Prüfungstickets).');
    }

    return data.entitlement as OralExamEntitlement;
}

/**
 * Lässt das Transkript serverseitig (OpenAI) bewerten und speichert das Ergebnis.
 * Idempotent: ist die Session bereits ausgewertet, kommt das vorhandene Ergebnis.
 */
export async function evaluateOralExam(
    sessionId: string,
    transcript: OralExamTranscriptTurn[],
    durationS: number,
    conversationId?: string
): Promise<OralExamEvaluation> {
    const { data, error } = await supabase.functions.invoke('oral-exam-evaluation', {
        body: { sessionId, transcript, durationS, conversationId },
    });

    if (error) {
        const body = await readFunctionErrorBody(error);
        throw new Error(body?.error || error.message || 'Auswertung fehlgeschlagen.');
    }

    if (!data?.result) {
        throw new Error('Auswertung konnte nicht erzeugt werden.');
    }

    return data.result as OralExamEvaluation;
}

/**
 * Versucht eine fehlgeschlagene Auswertung erneut. Das funktioniert nur, wenn
 * die Edge Function beim ursprünglichen Versuch bereits ein Transkript speichern konnte.
 */
export async function retryOralExamEvaluation(sessionId: string): Promise<OralExamEvaluation> {
    const session = await getOralExamSession(sessionId);
    if (!session) {
        throw new Error('Prüfung nicht gefunden.');
    }
    if (!Array.isArray(session.transcript) || session.transcript.length === 0) {
        throw new Error('Für diese Prüfung ist kein Transkript gespeichert. Bitte starte eine neue Prüfung.');
    }
    return evaluateOralExam(
        sessionId,
        session.transcript,
        session.duration_s ?? 0,
    );
}

/** Lädt eine einzelne Session (RLS schützt → nur eigene Zeilen sichtbar). */
export async function getOralExamSession(sessionId: string): Promise<OralExamSession | null> {
    const { data, error } = await supabase
        .from(ORAL_EXAM_TABLE)
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

    if (error) {
        console.error('getOralExamSession error:', error.message);
        return null;
    }
    return (data as OralExamSession) ?? null;
}

/**
 * Erzeugt eine signierte URL (1 h gültig) für das gespeicherte Gesprächs-Audio.
 * Bucket ist privat; RLS erlaubt nur den eigenen Ordner. Gibt null zurück, wenn
 * kein Audio vorhanden ist oder die URL nicht erstellt werden kann.
 */
export async function getOralExamAudioUrl(audioPath?: string | null): Promise<string | null> {
    if (!audioPath) return null;
    const { data, error } = await supabase.storage
        .from('oral-exam-audio')
        .createSignedUrl(audioPath, 3600);
    if (error) {
        console.error('getOralExamAudioUrl error:', error.message);
        return null;
    }
    return data?.signedUrl ?? null;
}

/** Listet die eigenen Sessions, neueste zuerst. */
export async function listOralExamSessions(limit = 20): Promise<OralExamSession[]> {
    const { data, error } = await supabase
        .from(ORAL_EXAM_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('listOralExamSessions error:', error.message);
        return [];
    }
    return (data as OralExamSession[]) ?? [];
}

/**
 * Bestätigt, dass die Session real verbunden hat (ElevenLabs onConnect).
 * Setzt connected_at → ab hier zählt das Ticket. Nur pending → running.
 */
export async function confirmOralExamSession(sessionId: string): Promise<void> {
    const { error } = await supabase
        .from(ORAL_EXAM_TABLE)
        .update({ status: 'running', connected_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('status', 'pending');

    if (error) {
        console.error('confirmOralExamSession error:', error.message);
    }
}

/**
 * Markiert eine noch nicht ausgewertete Session als abgebrochen (Verlassen ohne Auswertung).
 * Gilt für pending (nie verbunden) UND running (verbunden, aber abgebrochen). Die Ticketzählung
 * bleibt korrekt, weil sie an connected_at hängt, nicht am Status.
 */
export async function abortOralExamSession(sessionId: string): Promise<void> {
    const { error } = await supabase
        .from(ORAL_EXAM_TABLE)
        .update({ status: 'aborted', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['pending', 'running']);

    if (error) {
        console.error('abortOralExamSession error:', error.message);
    }
}
