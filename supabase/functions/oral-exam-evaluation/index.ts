import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Bewertet das Transkript einer mündlichen Prüfungssimulation mit OpenAI und schreibt
// das Ergebnis in oral_exam_sessions. Für JEDEN eingeloggten Nutzer.
// Siehe docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("openai_key") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";

const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const evaluationSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        overall_score_pct: { type: "integer", minimum: 0, maximum: 100 },
        passed: { type: "boolean" },
        summary: { type: "string" },
        topic_scores: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    topic: { type: "string" },
                    score_pct: { type: "integer", minimum: 0, maximum: 100 },
                    comment: { type: "string" },
                },
                required: ["topic", "score_pct", "comment"],
            },
        },
        answer_evaluations: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    question: { type: "string" },
                    candidate_answer: { type: "string" },
                    score_pct: { type: "integer", minimum: 0, maximum: 100 },
                    verdict: { type: "string", enum: ["correct", "partial", "wrong"] },
                    recommendation: { type: "string" },
                },
                required: ["question", "candidate_answer", "score_pct", "verdict", "recommendation"],
            },
        },
        strengths: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
        model_answers: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    scenario: { type: "string" },
                    musterantwort: { type: "string" },
                },
                required: ["scenario", "musterantwort"],
            },
        },
        roter_faden: { type: "array", items: { type: "string" } },
        next_step: { type: "string" },
    },
    required: [
        "overall_score_pct",
        "passed",
        "summary",
        "topic_scores",
        "answer_evaluations",
        "strengths",
        "gaps",
        "model_answers",
        "roter_faden",
        "next_step",
    ],
};

function extractOpenAIText(data: any): string | null {
    if (typeof data?.output_text === "string") return data.output_text;
    const chunks: string[] = [];
    for (const item of data?.output ?? []) {
        for (const content of item?.content ?? []) {
            const text = content?.text ?? content?.output_text;
            if (typeof text === "string") chunks.push(text);
        }
    }
    return chunks.length > 0 ? chunks.join("") : null;
}

async function callOpenAI(prompt: string, maxTokens = 8192): Promise<string | null> {
    if (!OPENAI_API_KEY) {
        console.error("OpenAI: OPENAI_API_KEY fehlt.");
        return null;
    }
    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            input: [
                {
                    role: "system",
                    content: "Du bist ein erfahrener IHK-Prüfer für die Sachkundeprüfung nach §34a GewO. Antworte ausschließlich mit JSON im vorgegebenen Schema.",
                },
                { role: "user", content: prompt },
            ],
            max_output_tokens: maxTokens,
            temperature: 0.3,
            text: {
                format: {
                    type: "json_schema",
                    name: "oral_exam_evaluation",
                    schema: evaluationSchema,
                    strict: true,
                },
            },
        }),
    });
    if (!res.ok) {
        console.error("OpenAI HTTP error:", res.status, await res.text());
        return null;
    }
    const data = await res.json();
    const text = extractOpenAIText(data);
    if (!text) {
        console.error("OpenAI lieferte keinen Text. status:", data?.status, "incomplete_details:", JSON.stringify(data?.incomplete_details ?? {}));
    }
    return text;
}

function parseEvaluation(text: string): any {
    const clean = text.trim();
    try {
        return JSON.parse(clean);
    } catch (_) {
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try { return JSON.parse(clean.slice(start, end + 1)); } catch (_) { /* give up */ }
        }
    }
    return null;
}

// Holt das authoritative Transkript direkt von ElevenLabs (Retries, falls noch "processing").
async function fetchElevenLabsTranscript(conversationId?: string): Promise<{ role: "examiner" | "candidate"; text: string }[] | null> {
    if (!ELEVENLABS_API_KEY || !conversationId) return null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
                headers: { "xi-api-key": ELEVENLABS_API_KEY },
            });
            if (res.ok) {
                const data = await res.json();
                const raw = Array.isArray(data?.transcript) ? data.transcript : [];
                const turns = raw
                    .map((t: any) => ({
                        role: (t.role === "agent" ? "examiner" : "candidate") as "examiner" | "candidate",
                        text: (t.message ?? t.text ?? "").toString(),
                    }))
                    .filter((t: any) => t.text.trim().length > 0);
                if (turns.length > 0) return turns;
            }
        } catch (_) { /* retry */ }
        // Steigende Wartezeit: 1s, 2s, 3s, 4s, 5s — ElevenLabs braucht nach Gesprächsende kurz zum Verarbeiten.
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    return null;
}

// Holt das vollständige Gesprächs-Audio (Prüfer + Prüfling) von ElevenLabs und legt es
// im privaten Bucket oral-exam-audio ab. Best-effort: Fehler dürfen die Auswertung NICHT scheitern lassen.
async function storeConversationAudio(
    conversationId: string | undefined,
    userId: string,
    sessionId: string,
): Promise<string | null> {
    if (!ELEVENLABS_API_KEY || !conversationId) return null;
    try {
        const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`, {
            headers: { "xi-api-key": ELEVENLABS_API_KEY },
        });
        if (!res.ok) {
            console.error("ElevenLabs audio fetch failed:", res.status);
            return null;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length === 0) return null;

        const path = `${userId}/${sessionId}.mp3`;
        const { error } = await supabaseAdmin.storage
            .from("oral-exam-audio")
            .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
        if (error) {
            console.error("Audio upload failed:", error.message);
            return null;
        }
        return path;
    } catch (e: any) {
        console.error("storeConversationAudio error:", e?.message);
        return null;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    let requestSessionId: string | null = null;
    let requestUserId: string | null = null;
    let requestDurationS: number | null = null;
    let resolvedTranscript: { role: "examiner" | "candidate"; text: string }[] | null = null;

    try {
        const authClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
        );
        const { data: { user } } = await authClient.auth.getUser();
        if (!user) {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
            });
        }
        requestUserId = user.id;

        const { sessionId, transcript: clientTranscript, durationS, conversationId } = await req.json();
        requestSessionId = sessionId ?? null;
        requestDurationS = typeof durationS === "number" ? Math.round(durationS) : null;
        if (!sessionId) {
            throw new Error("sessionId ist erforderlich.");
        }

        // Idempotenz: bereits ausgewertet? → vorhandenes Ergebnis zurückgeben (kein Doppel-OpenAI).
        const { data: existing } = await supabaseAdmin
            .from("oral_exam_sessions")
            .select("status, overall_score_pct, passed, topic_scores, feedback, audio_path, transcript, duration_s, connected_at")
            .eq("id", sessionId)
            .eq("user_id", user.id)
            .maybeSingle();
        if (existing?.status === "done") {
            return new Response(
                JSON.stringify({ result: { overall_score_pct: existing.overall_score_pct, passed: existing.passed, topic_scores: existing.topic_scores, audio_path: existing.audio_path, ...(existing.feedback || {}) } }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
        }

        // Authoritatives Transkript bevorzugt von ElevenLabs; Fallback = Client-Transkript.
        let transcript = await fetchElevenLabsTranscript(conversationId);
        if (!transcript || transcript.length === 0) {
            transcript = Array.isArray(clientTranscript) ? clientTranscript : [];
        }
        if ((!transcript || transcript.length === 0) && Array.isArray(existing?.transcript)) {
            transcript = existing.transcript;
        }
        if (transcript.length === 0) {
            throw new Error("Kein Transkript verfügbar.");
        }
        resolvedTranscript = transcript;

        // Transkript früh speichern, damit ein späterer KI-/Provider-Fehler retryfähig bleibt.
        const { error: transcriptUpdateError } = await supabaseAdmin
            .from("oral_exam_sessions")
            .update({
                transcript,
                duration_s: requestDurationS ?? existing?.duration_s ?? null,
            })
            .eq("id", sessionId)
            .eq("user_id", user.id);
        if (transcriptUpdateError) {
            console.error("oral-exam-evaluation transcript save failed:", transcriptUpdateError.message);
        }

        const transcriptText = transcript
            .map((t: any) => (t.role === "examiner" ? "PRÜFER: " : "PRÜFLING: ") + t.text)
            .join("\n");

        const prompt = [
            "Du bist ein erfahrener IHK-Prüfer der mündlichen §34a-Sachkundeprüfung (Bewachungsgewerbe).",
            "Bewerte das folgende Transkript einer mündlichen Prüfungssimulation FAIR, aber nach echten IHK-Maßstäben.",
            "Bestehensgrenze: 50 %. Bewerte nicht nur Faktenwissen, sondern auch Praxis-Angemessenheit, Deeskalations-Haltung, Struktur und Begründung der Antworten.",
            "",
            "TRANSKRIPT:",
            transcriptText,
            "",
            "Gib AUSSCHLIESSLICH valides JSON zurück mit GENAU dieser Struktur:",
            '{',
            '  "overall_score_pct": <0-100 Ganzzahl>,',
            '  "passed": <true wenn overall_score_pct >= 50, sonst false>,',
            '  "summary": "<2-4 Sätze: wie die Prüfung lief, ob bestanden und warum, wo die Hauptschwächen liegen>",',
            '  "topic_scores": [{ "topic": "<Themengebiet>", "score_pct": <0-100>, "comment": "<1 Satz>" }],',
            '  "answer_evaluations": [{ "question": "<Frage/Szenario des Prüfers>", "candidate_answer": "<kurze Zusammenfassung der Antwort des Prüflings>", "score_pct": <0-100>, "verdict": "correct|partial|wrong", "recommendation": "<bei partial/wrong: konkrete Verbesserung; bei correct: leerer String>" }],',
            '  "strengths": ["<kurzer Stichpunkt>"],',
            '  "gaps": ["<was gefehlt hat>"],',
            '  "model_answers": [{ "scenario": "<Szenario/Frage>", "musterantwort": "<ideale Antwort>" }],',
            '  "roter_faden": ["<2-3 Sätze für die echte Prüfung>"],',
            '  "next_step": "<1 konkreter nächster Übungsschritt>"',
            '}',
            "",
            "REGELN:",
            "- answer_evaluations: GENAU eine Zeile pro echter Frage des Prüfers, die der Prüfling beantwortet hat (in Reihenfolge des Gesprächs).",
            "- verdict='correct' nur bei fachlich richtiger, ausreichender Antwort; 'partial' bei teilweise richtig/unvollständig; 'wrong' bei falsch oder keine Antwort.",
            "- recommendation NUR bei verdict 'partial' oder 'wrong' füllen, sonst leerer String.",
            "- Nutze nur Themengebiete, die im Transkript tatsächlich vorkamen.",
            "- Bleibe juristisch korrekt; erfinde keine falschen Rechtsgrundlagen.",
            "- Wenn der Prüfling kaum etwas gesagt hat, vergib einen niedrigen Score und erkläre es in gaps.",
            "- passed MUSS konsistent mit overall_score_pct sein (>= 50 => true).",
        ].join("\n");

        const text = await callOpenAI(prompt, 8192);
        const evaluation = text ? parseEvaluation(text) : null;

        if (!evaluation || typeof evaluation.overall_score_pct !== "number") {
            await supabaseAdmin
                .from("oral_exam_sessions")
                .update({
                    status: "evaluation_failed",
                    ended_at: new Date().toISOString(),
                    duration_s: requestDurationS ?? existing?.duration_s ?? null,
                    connected_at: existing?.connected_at ?? new Date().toISOString(),
                    transcript,
                    feedback: {
                        error: "Auswertung konnte nicht erzeugt werden.",
                        retryable: true,
                    },
                })
                .eq("id", sessionId)
                .eq("user_id", user.id);
            throw new Error("Auswertung konnte nicht erzeugt werden. Bitte erneut versuchen.");
        }

        const overall = Math.max(0, Math.min(100, Math.round(evaluation.overall_score_pct)));
        const passed = overall >= 50;

        // Vollständiges Gesprächs-Audio sichern (best-effort; blockiert die Auswertung nicht).
        const audioPath = await storeConversationAudio(conversationId, user.id, sessionId);

        const feedback = {
            summary: typeof evaluation.summary === "string" ? evaluation.summary : "",
            strengths: evaluation.strengths ?? [],
            gaps: evaluation.gaps ?? [],
            answer_evaluations: Array.isArray(evaluation.answer_evaluations) ? evaluation.answer_evaluations : [],
            model_answers: evaluation.model_answers ?? [],
            roter_faden: evaluation.roter_faden ?? [],
            next_step: evaluation.next_step ?? "",
        };

        const { error: updateError } = await supabaseAdmin
            .from("oral_exam_sessions")
            .update({
                status: "done",
                ended_at: new Date().toISOString(),
                duration_s: requestDurationS ?? existing?.duration_s ?? null,
                connected_at: existing?.connected_at ?? new Date().toISOString(),
                transcript,
                overall_score_pct: overall,
                passed,
                topic_scores: Array.isArray(evaluation.topic_scores) ? evaluation.topic_scores : [],
                feedback,
                audio_path: audioPath,
            })
            .eq("id", sessionId)
            .eq("user_id", user.id);

        if (updateError) {
            console.error("oral-exam-evaluation update failed:", updateError.message);
            throw new Error("Ergebnis konnte nicht gespeichert werden.");
        }

        return new Response(
            JSON.stringify({ result: { ...evaluation, ...feedback, overall_score_pct: overall, passed, audio_path: audioPath } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error: any) {
        console.error("oral-exam-evaluation error:", error?.message);
        if (requestSessionId && requestUserId && resolvedTranscript?.length) {
            await supabaseAdmin
                .from("oral_exam_sessions")
                .update({
                    status: "evaluation_failed",
                    ended_at: new Date().toISOString(),
                    duration_s: requestDurationS,
                    connected_at: new Date().toISOString(),
                    transcript: resolvedTranscript,
                    feedback: {
                        error: error?.message || "unknown",
                        retryable: true,
                    },
                })
                .eq("id", requestSessionId)
                .eq("user_id", requestUserId);
        }
        return new Response(JSON.stringify({ error: error?.message || "unknown" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
    }
});
