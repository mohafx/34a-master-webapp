import { supabase } from '../lib/supabase';
import type {
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
// damit wir Fehlercodes wie "feature_not_available" auswerten können.
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

export class OralExamFeatureUnavailableError extends Error {
    constructor() {
        super('feature_not_available');
        this.name = 'OralExamFeatureUnavailableError';
    }
}

export class OralExamPaywallError extends Error {
    constructor() {
        super('paywallRequired');
        this.name = 'OralExamPaywallError';
    }
}

/**
 * Startet eine mündliche Prüfungssimulation. Legt serverseitig eine Session an
 * und liefert die ElevenLabs Signed URL + Dynamic Variables zurück.
 * @param requestedMode optionaler Modus-Override — nur für Admins wirksam (Test beider Abläufe),
 *   sonst ergibt sich der Modus serverseitig aus dem Premium-Status.
 * @throws OralExamFeatureUnavailableError wenn kein Admin (Soft-Launch-Gate)
 * @throws OralExamPaywallError wenn Free-Kontingent (1 Gratis-Test) aufgebraucht
 */
export async function startOralExamSession(
    focusTopic?: string | null,
    requestedMode?: 'free_test_3q' | 'full_5min' | null
): Promise<OralExamStartResponse> {
    const { data, error } = await supabase.functions.invoke('oral-exam-session', {
        body: {
            focus_topic: focusTopic ?? null,
            requested_mode: requestedMode ?? null,
        },
    });

    if (error) {
        const body = await readFunctionErrorBody(error);
        if (body?.error === 'feature_not_available') {
            throw new OralExamFeatureUnavailableError();
        }
        if (body?.error === 'unauthorized') {
            throw new Error('Bitte melde dich an, um die mündliche Prüfung zu starten.');
        }
        throw new Error(body?.error || error.message || 'Mündliche Prüfung konnte nicht gestartet werden.');
    }

    // paywallRequired wird mit Status 200 zurückgegeben → landet in data.
    if (data?.paywallRequired) {
        throw new OralExamPaywallError();
    }

    if (!data?.sessionId || !data?.signedUrl) {
        throw new Error('Unerwartete Antwort vom Server (keine Session/Signed-URL).');
    }

    return data as OralExamStartResponse;
}

/**
 * Lässt das Transkript serverseitig (Gemini) bewerten und speichert das Ergebnis.
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

/** Markiert eine laufende Session als abgebrochen (z. B. bei Verlassen ohne Auswertung). */
export async function abortOralExamSession(sessionId: string): Promise<void> {
    const { error } = await supabase
        .from(ORAL_EXAM_TABLE)
        .update({ status: 'aborted', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('status', 'running');

    if (error) {
        console.error('abortOralExamSession error:', error.message);
    }
}
