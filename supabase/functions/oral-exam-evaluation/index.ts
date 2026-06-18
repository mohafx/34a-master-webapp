import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Bewertet das Transkript einer mündlichen Prüfungssimulation mit Gemini und schreibt
// das Ergebnis in oral_exam_sessions. Für JEDEN eingeloggten Nutzer.
// Siehe docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";

const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function callGemini(prompt: string, maxTokens = 4096): Promise<string | null> {
    if (!GOOGLE_AI_API_KEY) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ],
        }),
    });
    if (!res.ok) {
        console.error("Gemini error:", res.status, await res.text());
        return null;
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
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

// Holt das authoritative Transkript direkt von ElevenLabs (kurze Retries, falls noch "processing").
async function fetchElevenLabsTranscript(conversationId?: string): Promise<{ role: "examiner" | "candidate"; text: string }[] | null> {
    if (!ELEVENLABS_API_KEY || !conversationId) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
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
        await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

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

        const { sessionId, transcript: clientTranscript, durationS, conversationId } = await req.json();
        if (!sessionId) {
            throw new Error("sessionId ist erforderlich.");
        }

        // Idempotenz: bereits ausgewertet? → vorhandenes Ergebnis zurückgeben (kein Doppel-Gemini).
        const { data: existing } = await supabaseAdmin
            .from("oral_exam_sessions")
            .select("status, overall_score_pct, passed, topic_scores, feedback")
            .eq("id", sessionId)
            .eq("user_id", user.id)
            .maybeSingle();
        if (existing?.status === "done") {
            return new Response(
                JSON.stringify({ result: { overall_score_pct: existing.overall_score_pct, passed: existing.passed, topic_scores: existing.topic_scores, ...(existing.feedback || {}) } }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
        }

        // Authoritatives Transkript bevorzugt von ElevenLabs; Fallback = Client-Transkript.
        let transcript = await fetchElevenLabsTranscript(conversationId);
        if (!transcript || transcript.length === 0) {
            transcript = Array.isArray(clientTranscript) ? clientTranscript : [];
        }
        if (transcript.length === 0) {
            throw new Error("Kein Transkript verfügbar.");
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
            '  "topic_scores": [{ "topic": "<Themengebiet>", "score_pct": <0-100>, "comment": "<1 Satz>" }],',
            '  "strengths": ["<kurzer Stichpunkt>"],',
            '  "gaps": ["<was gefehlt hat>"],',
            '  "model_answers": [{ "scenario": "<Szenario/Frage>", "musterantwort": "<ideale Antwort>" }],',
            '  "roter_faden": ["<2-3 Sätze für die echte Prüfung>"],',
            '  "next_step": "<1 konkreter nächster Übungsschritt>"',
            '}',
            "",
            "REGELN:",
            "- Nutze nur Themengebiete, die im Transkript tatsächlich vorkamen.",
            "- Bleibe juristisch korrekt; erfinde keine falschen Rechtsgrundlagen.",
            "- Wenn der Prüfling kaum etwas gesagt hat, vergib einen niedrigen Score und erkläre es in gaps.",
            "- passed MUSS konsistent mit overall_score_pct sein (>= 50 => true).",
        ].join("\n");

        const text = await callGemini(prompt, 4096);
        const evaluation = text ? parseEvaluation(text) : null;

        if (!evaluation || typeof evaluation.overall_score_pct !== "number") {
            throw new Error("Auswertung konnte nicht erzeugt werden. Bitte erneut versuchen.");
        }

        const overall = Math.max(0, Math.min(100, Math.round(evaluation.overall_score_pct)));
        const passed = overall >= 50;

        const { error: updateError } = await supabaseAdmin
            .from("oral_exam_sessions")
            .update({
                status: "done",
                ended_at: new Date().toISOString(),
                duration_s: typeof durationS === "number" ? Math.round(durationS) : null,
                transcript,
                overall_score_pct: overall,
                passed,
                topic_scores: Array.isArray(evaluation.topic_scores) ? evaluation.topic_scores : [],
                feedback: {
                    strengths: evaluation.strengths ?? [],
                    gaps: evaluation.gaps ?? [],
                    model_answers: evaluation.model_answers ?? [],
                    roter_faden: evaluation.roter_faden ?? [],
                    next_step: evaluation.next_step ?? "",
                },
            })
            .eq("id", sessionId)
            .eq("user_id", user.id);

        if (updateError) {
            console.error("oral-exam-evaluation update failed:", updateError.message);
            throw new Error("Ergebnis konnte nicht gespeichert werden.");
        }

        return new Response(
            JSON.stringify({ result: { ...evaluation, overall_score_pct: overall, passed } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error: any) {
        console.error("oral-exam-evaluation error:", error?.message);
        return new Response(JSON.stringify({ error: error?.message || "unknown" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
    }
});
