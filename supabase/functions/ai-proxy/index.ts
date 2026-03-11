import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";
const ADMIN_EMAIL = "m.almajzoub1@gmail.com";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ UTILS ============

// Robust JSON repair for truncated or malformed LLM output
function repairTruncatedJson(jsonString: string): string {
    let s = jsonString.replace(/```json\n?|\n?```/g, '').trim();
    try { JSON.parse(s); return s; } catch (_) { /* continue */ }
    s = s.replace(/,\s*$/, '');
    const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        s += '"';
    }
    let openBraces = 0, openBrackets = 0;
    let inString = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) inString = !inString;
        if (!inString) {
            if (ch === '{') openBraces++;
            else if (ch === '}') openBraces--;
            else if (ch === '[') openBrackets++;
            else if (ch === ']') openBrackets--;
        }
    }
    s = s.replace(/,\s*$/, '');
    while (openBrackets > 0) { s += ']'; openBrackets--; }
    while (openBraces > 0) { s += '}'; openBraces--; }
    return s;
}

// ============ GEMINI API HELPER ============

async function callGemini(prompt: string, maxTokens = 2000, model = 'gemini-2.5-flash', useSearch = false): Promise<{ success: boolean; text?: string; error?: string }> {
    if (!GOOGLE_AI_API_KEY) {
        console.warn("GOOGLE_AI_API_KEY not set");
        return { success: false, error: "Configuration Error: GOOGLE_AI_API_KEY is missing in Supabase Secrets." };
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`;
        const body: any = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: maxTokens,
                responseMimeType: "application/json",
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        if (useSearch) {
            body.tools = [{ googleSearch: {} }];
        }

        const response = await fetch(
            url,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
        );

        if (response.ok) {
            const data = await response.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text;

            if (!text) {
                const finishReason = candidate?.finishReason || 'UNKNOWN';
                console.warn("Gemini no text. Finish reason:", finishReason, JSON.stringify(data));
                return { success: false, error: `Gemini filtered response. Reason: ${finishReason}` };
            }

            return { success: true, text };
        } else {
            const errorText = await response.text();
            console.warn("Gemini failed:", response.status, errorText);
            return { success: false, error: `Gemini API Error (${response.status}): ${errorText.substring(0, 200)}` };
        }
    } catch (error: any) {
        console.warn("Gemini error:", error?.message);
        return { success: false, error: `Network Exception: ${error?.message}` };
    }
}

// ============ UNIFIED QUALITY ANALYSIS HANDLER ============

async function handleQualityAnalysis(params: any): Promise<any> {
    const { questionText, answers, topic, questionType } = params;

    const answersText = answers.map((a: any) =>
        `${a.letter}) [${a.isCorrect ? 'RICHTIG' : 'FALSCH'}] ${a.text}`
    ).join('\n');

    const answerLetters = answers.map((a: any) => a.letter).join(', ');

    const prompt = `Du bist ein hochqualifizierter, erfahrener IHK-Prüfer mit Spezialisierung auf die Sachkundeprüfung nach § 34a GewO. 
Deine Aufgabe ist die rigorose Qualitätskontrolle von Multiple-Choice-Prüfungsfragen für eine Lernplattform.

VERHALTENSREGELN & TONFALL:
- Antworte absolut faktenbasiert, seriös, juristisch präzise und selbstbewusst.
- Unterscheide in deinen Analysen strikt zwischen gesicherten Fakten (Gesetzestexte, BGH-Rechtsprechung), typischen Prüfungserfahrungen und unsicheren Schätzungen.
- Nenne bei rechtlichen Einordnungen immer eine realistische Einschätzung der Sicherheit in Prozent (z.B. "100 % gesicherter Fakt", "90 % typische Prüfungsfalle").
- Erfinde niemals Fakten. Fehlen Angaben im Sachverhalt (z.B. Alter, Vorsatz, Berechtigung), weise darauf hin und erkläre, welche Daten für eine präzise rechtliche Einordnung fehlen.
- Prüfungsfragen der IHK haben ein hohes sprachliches Niveau ("Amtsdeutsch"). Umgangssprache oder offensichtliche Scherzantworten in den Auswahlmöglichkeiten (Distraktoren) sind strengstens zu verbieten und umzuformulieren.
- Falsche Antworten (Distraktoren) müssen juristisch plausibel klingen, um das echte Wissen der Prüflinge zu testen.

📌 THEMA: ${topic}
📌 FRAGETYP: ${questionType || 'Single Choice'}

📝 FRAGETEXT:
${questionText}

🔢 ANTWORTEN (Original):
${answersText}

AUFBAU DEINER ANTWORT (ZWINGEND als JSON mit genau 2 Feldern: "analysis" und "optimized_question"):

Das Feld "analysis" ist ein langer Markdown-String mit folgender Struktur:

### 1. Gesamtbewertung
Erstelle eine Markdown-Tabelle mit den Kriterien: "Rechtslage", "Prüfungsrelevanz", "Logik & Fallen" und "Formulierung". Vergib Bewertungen (z.B. ✅ Korrekt, ⚠️ Fehlerhaft, 🔴 Zu leicht) und einen kurzen Status.

---

### 2. Juristische Analyse & Fakten-Check
- Zerlege den Sachverhalt rechtlich (Tatbestand, Rechtswidrigkeit, Schuld bzw. relevante BGB/StGB/GewO/DGUV-Normen).
- Gib an, wie sicher diese rechtliche Einordnung ist (in %).
- Erkläre präzise, warum die richtigen Antworten richtig und die falschen falsch sind.
- Decke juristische Unschärfen in der Formulierung auf.

---

### 3. Kritik an den Antwortmöglichkeiten (Distraktoren)
- Bewerte den Schwierigkeitsgrad. Sind die falschen Antworten zu offensichtlich?
- Entsprechen sie dem typischen IHK-Niveau?

---

Das Feld "optimized_question" ist ein JSON-Objekt mit einer komplett überarbeiteten Version der Frage und aller Antwortmöglichkeiten. Ergänze, falls zutreffend, die entsprechenden Paragrafen in den Antworten. WICHTIG: Füge KEIN "(RICHTIG)" an korrekte Antworten an. Erkläre fallbezogene Distraktoren NICHT innerhalb des Antworttextes. Die Textfelder müssen die reinen Antwortoptionen enthalten.
Format:
{
  "question_text_de": "Optimierter Fragetext ...",
  "answers": {
    "${answers[0]?.letter || 'A'}": { "text_de": "...", "isCorrect": false },
    "${answers[1]?.letter || 'B'}": { "text_de": "...", "isCorrect": true }
  },
  "correct_answer": "B"
}

WICHTIG:
- Deine GESAMTE Antwort MUSS valides JSON sein mit genau den zwei Feldern "analysis" (String) und "optimized_question" (Objekt).
- KEINE Markdown-Codeblöcke um das JSON herum.
- Im "analysis"-Feld nutze Markdown-Formatierung (Tabellen, Fett, Listen etc.).
- Im "optimized_question"-Feld nutze die gleichen Antwort-Buchstaben wie das Original (${answerLetters}).
- "correct_answer" MUSS die korrekten Buchstaben als kommaseparierter String sein (z.B. "B" oder "A,C").
- Der Fragetyp ist ENTWEDER "Single Choice" (genau 1 richtige Antwort) ODER "Multiple Choice" (GENAU 2 richtige Antworten).
- Es darf NIEMALS 3, 4 oder alle Antworten richtig sein. Das verstößt gegen IHK-Standards.
- Wenn die Originalfrage mehr als 2 richtige Antworten hat, MUSST du in der "analysis" (Gesamtbewertung) darauf hinweisen, dass dies falsch ist, und in der "optimized_question" zwingend eine Version mit maximal 2 richtigen Antworten erstellen.`;

    const result = await callGemini(prompt, 8192, 'gemini-3-flash-preview', false);

    if (result.success && result.text) {
        const cleanText = result.text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();

        // Attempt 1: Direct parse
        try {
            const parsed = JSON.parse(cleanText);
            if (parsed.analysis && parsed.optimized_question) {
                return parsed;
            }
        } catch (_) { /* continue */ }

        // Attempt 2: Extract JSON object
        try {
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.analysis && parsed.optimized_question) {
                    return parsed;
                }
            }
        } catch (_) { /* continue */ }

        // Attempt 3: Repair truncated JSON
        try {
            const repaired = repairTruncatedJson(cleanText);
            const parsed = JSON.parse(repaired);
            if (parsed.analysis) {
                return parsed;
            }
        } catch (repairErr: any) {
            console.error("All JSON parse attempts failed.", repairErr.message);
            console.error("RAW TEXT:", result.text.substring(0, 1000));

            // Attempt 4: Try to extract analysis field at least
            const analysisMatch = cleanText.match(/"analysis"\s*:\s*"([\s\S]*?)(?:","optimized_question"|"\s*})/);
            if (analysisMatch) {
                return {
                    analysis: analysisMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                    optimized_question: null
                };
            }

            return {
                analysis: '## ⚠️ Fehler\n\nDie KI-Antwort konnte nicht vollständig verarbeitet werden. Bitte erneut versuchen.',
                optimized_question: null
            };
        }
    }

    return {
        analysis: `## ❌ Fehler\n\n${result.error || 'Unbekannter Fehler bei der KI-Anfrage.'}`,
        optimized_question: null
    };
}

// ============ ARABIC TRANSLATION HANDLER ============

async function handleArabicTranslation(params: any): Promise<any> {
    const { questionText, answers, topic, questionType, existingArabic } = params;

    const answersText = answers.map((a: any) =>
        `${a.letter}) ${a.text}${a.existingAr ? `\n   [Bestehende AR-Übersetzung]: ${a.existingAr}` : ''}`
    ).join('\n');

    const hasExistingTranslation = existingArabic?.questionTextAr || answers.some((a: any) => a.existingAr);

    const prompt = `Du bist ein professioneller Übersetzer für juristische Fachsprache (Deutsch → Arabisch) mit Spezialisierung auf die Sachkundeprüfung nach § 34a GewO.

${hasExistingTranslation ? 'Es existiert bereits eine arabische Übersetzung. Bewerte deren Qualität und erstelle eine verbesserte Version.' : 'Es existiert noch keine arabische Übersetzung. Erstelle eine hochwertige Erstübersetzung.'}

STRIKTE ÜBERSETZUNGSREGELN:
1. Fließendes, gut verständliches modernes Hocharabisch (فصحى حديثة).
2. **SEHR WICHTIG:** Bei ALLEN juristischen und wichtigen Fachbegriffen MUSS der deutsche Begriff in Klammern hinter dem übersetzten Begriff stehen (z.B. "الأهلية القانونية (Rechtsfähigkeit)", "حق الدفاع الشرعي (Notwehr)", "القانون الجنائي (Strafrecht)").
3. Ausschließlich arabische und lateinische Schriftzeichen verwenden. KEINE Sonderzeichen aus anderen Sprachen (kein Thai, Hebräisch, Chinesisch etc.).
4. Die Übersetzung muss inhaltlich 100% dem deutschen Original entsprechen.
5. Juristische Präzision hat Vorrang vor wörtlicher Übersetzung.
6. Zahlen und Paragrafenangaben (z.B. § 34a GewO) bleiben in lateinischer Schrift.

📌 THEMA: ${topic}
📌 FRAGETYP: ${questionType || 'Single Choice'}

📝 FRAGETEXT (Deutsch):
${questionText}
${existingArabic?.questionTextAr ? `
📝 BESTEHENDE ÜBERSETZUNG (Arabisch):
${existingArabic.questionTextAr}` : ''}

🔢 ANTWORTEN:
${answersText}

AUFBAU DEINER ANTWORT (ZWINGEND als JSON mit genau 2 Feldern: "analysis" und "translated_question"):

Das Feld "analysis" ist ein Markdown-String mit folgender Struktur:

${hasExistingTranslation ? `### 1. Bewertung der bestehenden Übersetzung
Erstelle eine Markdown-Tabelle mit:
| Kriterium | Bewertung | Details |
- Sprachqualität (Hocharabisch)
- Fachbegriffe (deutsche Begriffe in Klammern?)
- Inhaltliche Korrektheit
- Zeichensatz (nur Arabisch + Latein?)

---

### 2. Gefundene Probleme
- Liste alle Fehler, fehlende Fachbegriffe in Klammern, stilistische Mängel auf.

---

### 3. Verbesserungen
- Erkläre, was in der neuen Version verbessert wurde.` : `### 1. Übersetzungsanalyse
- Welche Fachbegriffe wurden identifiziert?
- Welche besonderen Übersetzungsentscheidungen wurden getroffen?

---

### 2. Qualitätssicherung
- Alle Fachbegriffe mit deutschem Original in Klammern?
- Inhaltliche Vollständigkeit?
- Sprachliche Qualität?`}

Das Feld "translated_question" ist ein JSON-Objekt:
{
  "question_text_ar": "Arabische Übersetzung der Frage ...",
  "answers": {
    "${answers[0]?.letter || 'A'}": { "text_ar": "..." },
    "${answers[1]?.letter || 'B'}": { "text_ar": "..." }
  }
}

WICHTIG:
- Deine GESAMTE Antwort MUSS valides JSON sein mit genau den zwei Feldern "analysis" (String) und "translated_question" (Objekt).
- KEINE Markdown-Codeblöcke um das JSON herum.
- Im "analysis"-Feld nutze Markdown-Formatierung.
- Im "translated_question"-Feld nutze die gleichen Antwort-Buchstaben wie das Original.
- Jeder Fachbegriff MUSS den deutschen Begriff in Klammern enthalten.`;

    const result = await callGemini(prompt, 10000, 'gemini-2.5-flash', false);

    if (result.success && result.text) {
        const cleanText = result.text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
        console.log("Arabic translation raw text length:", cleanText.length);

        let parsedResult: any = null;

        // Attempt 1: Direct parse
        try {
            const parsed = JSON.parse(cleanText);
            if (parsed.analysis && parsed.translated_question) {
                return parsed;
            }
            if (parsed.analysis) parsedResult = parsed;
        } catch (_) { /* continue */ }

        // Attempt 2: Extract JSON object
        if (!parsedResult) {
            try {
                const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.analysis && parsed.translated_question) {
                        return parsed;
                    }
                    if (parsed.analysis) parsedResult = parsed;
                }
            } catch (_) { /* continue */ }
        }

        // Attempt 3: Repair truncated JSON
        if (!parsedResult) {
            try {
                const repaired = repairTruncatedJson(cleanText);
                const parsed = JSON.parse(repaired);
                if (parsed.analysis && parsed.translated_question) {
                    return parsed;
                }
                if (parsed.analysis) parsedResult = parsed;
            } catch (repairErr: any) {
                console.error("Arabic translation JSON repair failed:", repairErr.message);
            }
        }

        // Attempt 4: Extract analysis via regex if nothing worked
        if (!parsedResult) {
            const analysisMatch = cleanText.match(/"analysis"\s*:\s*"([\s\S]*?)(?:","translated_question"|"\s*})/);
            if (analysisMatch) {
                parsedResult = {
                    analysis: analysisMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                    translated_question: null
                };
            }
        }

        // If we got analysis but no translated_question, do a focused retry
        if (parsedResult && parsedResult.analysis && !parsedResult.translated_question) {
            console.log("Arabic translation: got analysis but no translated_question. Doing focused retry...");

            const retryPrompt = `Du bist ein professioneller Übersetzer (Deutsch → Arabisch) für die Sachkundeprüfung § 34a GewO.

Übersetze die folgende Frage und alle Antworten ins Arabische. Bei ALLEN Fachbegriffen MUSS der deutsche Begriff in Klammern stehen.

📝 FRAGETEXT: ${questionText}

🔢 ANTWORTEN:
${answersText}

Antworte NUR mit folgendem JSON-Objekt (KEIN anderer Text):
{
  "question_text_ar": "Arabische Übersetzung der Frage",
  "answers": {
    "${answers[0]?.letter || 'A'}": { "text_ar": "..." },
    "${answers[1]?.letter || 'B'}": { "text_ar": "..." }
  }
}`;

            const retryResult = await callGemini(retryPrompt, 4000, 'gemini-2.5-flash', false);
            if (retryResult.success && retryResult.text) {
                const retryClean = retryResult.text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
                try {
                    const retryParsed = JSON.parse(retryClean);
                    if (retryParsed.question_text_ar && retryParsed.answers) {
                        console.log("Focused retry succeeded!");
                        return {
                            analysis: parsedResult.analysis,
                            translated_question: retryParsed
                        };
                    }
                } catch (_) {
                    try {
                        const repaired = repairTruncatedJson(retryClean);
                        const retryParsed = JSON.parse(repaired);
                        if (retryParsed.question_text_ar) {
                            console.log("Focused retry succeeded after repair!");
                            return {
                                analysis: parsedResult.analysis,
                                translated_question: retryParsed
                            };
                        }
                    } catch (_) {
                        console.error("Focused retry parse also failed.");
                    }
                }
            }

            // Return with null translated_question as last resort
            return {
                analysis: parsedResult.analysis,
                translated_question: null
            };
        }

        if (parsedResult) return parsedResult;

        return {
            analysis: '## ⚠️ Fehler\n\nDie KI-Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen.',
            translated_question: null
        };
    }

    return {
        analysis: `## ❌ Fehler\n\n${result.error || 'Unbekannter Fehler bei der KI-Anfrage.'}`,
        translated_question: null
    };
}

// ============ MAIN HANDLER ============

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            {
                global: {
                    headers: { Authorization: req.headers.get("Authorization")! },
                },
            }
        );

        const { data: { user } } = await supabaseClient.auth.getUser();
        const { action, ...params } = await req.json();

        if (action !== 'quality-check' && action !== 'quality-analysis' && action !== 'arabic-translation') {
            throw new Error(`Unknown action: ${action}`);
        }

        if (!user || user.email !== ADMIN_EMAIL) {
            throw new Error('Unauthorized: Admin access required');
        }

        // Route to the appropriate handler
        const result = action === 'arabic-translation'
            ? await handleArabicTranslation(params)
            : await handleQualityAnalysis(params);

        return new Response(
            JSON.stringify({ result }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );

    } catch (error: any) {
        console.error("AI Proxy Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});
