import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOralExamEntitlement } from "../_shared/oral-exam-entitlement.ts";

// Startet eine mündliche Prüfungssimulation:
//  1. Auth prüfen (nur eingeloggte Nutzer)
//  2. Prüfungstickets serverseitig ermitteln (autoritativ — schützt den teuren full_simulation-Modus)
//  3. Free-Nutzer: 1 Mini-Simulation; Premium: 10 Vollsimulationen pro Zeitraum
//  4. ElevenLabs Signed URL holen (API-Key bleibt geheim)
//  5. Danach Session-Zeile anlegen (status=pending; Ticket zählt erst bei connected_at)
// Siehe docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID") || "";
const ELEVENLABS_AGENT_ID_MINI = Deno.env.get("ELEVENLABS_AGENT_ID_MINI") || ELEVENLABS_AGENT_ID;
const ELEVENLABS_AGENT_ID_FULL = Deno.env.get("ELEVENLABS_AGENT_ID_FULL") || "";

// Admin-Allowlist (gespiegelt zu src/utils/userRoles.ts). Nur Admins dürfen den Modus frei wählen.
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "m.almajzoub1@gmail.com")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
function isAdminEmail(email?: string | null): boolean {
    return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// Dauer-Limits (Sekunden) je Modus — fachlich begrenzt der Agent über Fälle/Rückfragen.
// Die Zeit ist nur ein technischer Kosten-Backstop.
const MAX_DURATION_FREE = 180;
const MAX_DURATION_FULL = 1200;

interface OralExamScenario {
    id: string;
    title: string;
    topic: string;
    brief: string;
    expected: string;
}

const ORAL_EXAM_SCENARIOS: OralExamScenario[] = [
    {
        id: "zutritt-ohne-ausweis",
        title: "Zutritt ohne Ausweis",
        topic: "Zutrittskontrolle / Hausrecht",
        brief: "Ein Besucher möchte in ein bewachtes Objekt, hat aber keinen Ausweis dabei und wird ungeduldig.",
        expected: "Hausrecht anwenden, Zutritt verweigern, ruhig kommunizieren, Auftraggeber-/Objektregeln beachten, Eskalation vermeiden.",
    },
    {
        id: "aggressiver-kunde",
        title: "Aggressiver Kunde im Eingangsbereich",
        topic: "Umgang mit Menschen / Deeskalation",
        brief: "Ein Kunde schreit im Eingangsbereich, beleidigt Mitarbeitende und kommt körperlich näher.",
        expected: "Eigensicherung, Abstand, ruhige Ansprache, Grenzen setzen, Hilfe nachfordern, Polizei nur bei konkreter Gefahr/Straftat.",
    },
    {
        id: "ladendiebstahl-beobachtet",
        title: "Beobachteter Ladendiebstahl",
        topic: "Jedermannsrechte / Strafrecht",
        brief: "Du beobachtest, wie eine Person Ware einsteckt und ohne zu zahlen den Kassenbereich verlassen will.",
        expected: "Tatsachenbasis, vorläufige Festnahme nach § 127 StPO nur bei Voraussetzungen, verhältnismäßig handeln, Polizei informieren.",
    },
    {
        id: "fundgeldboerse",
        title: "Gefundene Geldbörse",
        topic: "BGB / Fundsachen",
        brief: "Bei einem Rundgang findest du eine Geldbörse mit Bargeld und Ausweisen in einem Einkaufszentrum.",
        expected: "Nicht behalten, Fund sichern, dokumentieren, an Fundbüro/Verantwortliche übergeben, Datenschutz beachten.",
    },
    {
        id: "randalierer-parkplatz",
        title: "Randalierer auf dem Parkplatz",
        topic: "Gefahrensituation / Notwehr und Nothilfe",
        brief: "Auf einem privaten Parkplatz beschädigt eine Person Fahrzeuge und bedroht einen Passanten.",
        expected: "Eigene Sicherheit, Lage melden, Polizei rufen, Nothilfe nur erforderlich und verhältnismäßig, keine Selbstjustiz.",
    },
    {
        id: "datenschutz-kamera",
        title: "Kameraaufnahme herausgeben",
        topic: "Datenschutz / Videoüberwachung",
        brief: "Ein Kunde verlangt von dir sofort eine Kopie einer Kameraaufnahme, weil sein Fahrrad verschwunden ist.",
        expected: "Keine eigenmächtige Herausgabe, Datenschutz und Zuständigkeit beachten, an Verantwortliche verweisen, Vorgang dokumentieren.",
    },
    {
        id: "alkoholisierter-gast",
        title: "Alkoholisierter Gast bei Veranstaltung",
        topic: "Veranstaltungsschutz / Deeskalation",
        brief: "Ein stark alkoholisierter Gast verweigert den Anweisungen des Sicherheitspersonals zu folgen.",
        expected: "Ruhig bleiben, Verstärkung holen, Hausrecht erklären, sichere Entfernung organisieren, körperliche Mittel nur als letztes Mittel.",
    },
    {
        id: "brandmeldealarm",
        title: "Brandmeldealarm im Objekt",
        topic: "Sicherheitstechnik / Verhalten bei Gefahr",
        brief: "Während deiner Schicht löst die Brandmeldeanlage aus, mehrere Personen fragen dich, ob sie bleiben dürfen.",
        expected: "Alarmplan befolgen, Evakuierung unterstützen, Feuerwehr/Leitstelle, keine Entwarnung ohne Freigabe, Ruhe bewahren.",
    },
    {
        id: "verdaechtige-tasche",
        title: "Herrenlose Tasche",
        topic: "Öffentliche Sicherheit und Ordnung",
        brief: "In einer Eingangshalle steht seit längerer Zeit eine herrenlose Tasche, niemand fühlt sich verantwortlich.",
        expected: "Absperren/Abstand, nicht öffnen, Meldung an Verantwortliche/Polizei, Personen fernhalten, Beobachtungen dokumentieren.",
    },
    {
        id: "mitarbeiter-will-daten",
        title: "Mitarbeiter verlangt Besucherdaten",
        topic: "Datenschutz / Auftragsgrenzen",
        brief: "Ein Mitarbeiter bittet dich, ihm die Besucherliste mit privaten Kontaktdaten zu schicken.",
        expected: "Zweckbindung und Berechtigung prüfen, keine ungeprüfte Weitergabe, Datenschutzverantwortliche/Objektleitung einbeziehen.",
    },
    {
        id: "notwehr-grenze",
        title: "Grenze der Notwehr",
        topic: "Strafrecht / Verhältnismäßigkeit",
        brief: "Eine Person schubst dich leicht und läuft weg. Ein Kollege will hinterherlaufen und sie zu Boden bringen.",
        expected: "Gegenwärtigkeit prüfen, keine Vergeltung, Verhältnismäßigkeit, Beobachten/Melden statt unnötiger Gewalt.",
    },
    {
        id: "gewerberecht-befugnisse",
        title: "Befugnisse des Sicherheitsdienstes",
        topic: "Gewerberecht / Abgrenzung zur Polizei",
        brief: "Ein Besucher sagt: 'Sie sind doch keine Polizei, Sie dürfen mir gar nichts sagen.'",
        expected: "Private Rechte erklären, Hausrecht/Auftrag, keine hoheitlichen Polizeibefugnisse, sachlich bleiben.",
    },
];

const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getCandidateFirstName(userId: string): Promise<string> {
    const { data } = await supabaseAdmin
        .from("user_profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
    const raw = (data?.display_name || "").toString().trim();
    if (!raw) return "";
    return raw.split(/\s+/)[0];
}

function pickRandom<T>(items: T[]): T {
    return items[crypto.getRandomValues(new Uint32Array(1))[0] % items.length];
}

async function selectScenario(userId: string, mode: string, requestedFocusTopic: string | null): Promise<OralExamScenario> {
    const candidates = requestedFocusTopic
        ? ORAL_EXAM_SCENARIOS.filter((scenario) => scenario.topic.toLowerCase().includes(requestedFocusTopic.toLowerCase()))
        : ORAL_EXAM_SCENARIOS;

    const pool = candidates.length > 0 ? candidates : ORAL_EXAM_SCENARIOS;

    const { data: recentSessions } = await supabaseAdmin
        .from("oral_exam_sessions")
        .select("focus_topic")
        .eq("user_id", userId)
        .eq("mode", mode)
        .order("created_at", { ascending: false })
        .limit(4);

    const recentIds = new Set(
        (recentSessions ?? [])
            .map((session) => String(session.focus_topic ?? ""))
            .map((value) => value.replace(/^scenario:/, ""))
            .filter(Boolean),
    );
    const freshPool = pool.filter((scenario) => !recentIds.has(scenario.id));

    return pickRandom(freshPool.length > 0 ? freshPool : pool);
}

async function fetchElevenLabsSignedUrl(agentId: string): Promise<string> {
    const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
        { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
    );
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`ElevenLabs signed-url failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    if (!data?.signed_url) throw new Error("ElevenLabs returned no signed_url");
    return data.signed_url as string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        if (!ELEVENLABS_API_KEY || (!ELEVENLABS_AGENT_ID_MINI && !ELEVENLABS_AGENT_ID_FULL)) {
            throw new Error("Configuration Error: ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID_MINI/FULL missing in Supabase Secrets.");
        }

        // Auth: Nutzer aus JWT auflösen
        const authClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
        );
        const { data: { user } } = await authClient.auth.getUser();
        if (!user) {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 401,
            });
        }

        const body = await req.json().catch(() => ({}));
        const focusTopic: string | null = body?.focus_topic ?? null;
        const requestedMode: string | null = body?.requested_mode ?? null;

        const [entitlement, candidateName] = await Promise.all([
            getOralExamEntitlement(supabaseAdmin, user.id),
            getCandidateFirstName(user.id)
        ]);

        if (entitlement.remaining <= 0) {
            return new Response(
                JSON.stringify(entitlement.isPremium ? { ticketLimitReached: true, entitlement } : { paywallRequired: true, entitlement }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
            );
        }

        // Admins dürfen den Modus frei wählen (Mini vs. volle Simulation) — für Testzwecke.
        // Alle anderen Nutzer bekommen den Modus aus ihrer Berechtigung.
        let mode = entitlement.mode;
        if (isAdminEmail(user.email) && (requestedMode === "free_test_3q" || requestedMode === "full_simulation")) {
            mode = requestedMode;
        }
        const maxDurationSec = mode === "full_simulation" ? MAX_DURATION_FULL : MAX_DURATION_FREE;

        const agentId = mode === "full_simulation" ? ELEVENLABS_AGENT_ID_FULL : ELEVENLABS_AGENT_ID_MINI;
        if (!agentId) {
            throw new Error(`Configuration Error: ElevenLabs Agent ID for mode "${mode}" is missing in secrets.`);
        }

        const [scenario, signedUrl] = await Promise.all([
            selectScenario(user.id, mode, focusTopic),
            fetchElevenLabsSignedUrl(agentId)
        ]);
        const sessionSeed = crypto.randomUUID().slice(0, 8);

        // Session als 'pending' anlegen: reserviert nur. Ein Ticket zählt erst, wenn die Session
        // real verbindet (connected_at wird vom Client bei ElevenLabs onConnect gesetzt).
        const { data: session, error: insertError } = await supabaseAdmin
            .from("oral_exam_sessions")
            .insert({
                user_id: user.id,
                mode,
                focus_topic: `scenario:${scenario.id}`,
                status: "pending",
            })
            .select("id")
            .single();
        if (insertError || !session) {
            throw new Error(`Session konnte nicht angelegt werden: ${insertError?.message}`);
        }

        return new Response(
            JSON.stringify({
                sessionId: session.id,
                mode,
                maxDurationSec,
                signedUrl,
                entitlement: {
                    ...entitlement,
                    used: entitlement.used,
                    remaining: entitlement.remaining,
                },
                dynamicVariables: {
                    mode,
                    focus_topic: `${scenario.topic}: ${scenario.brief}`,
                    scenario_id: scenario.id,
                    scenario_title: scenario.title,
                    scenario_topic: scenario.topic,
                    scenario_brief: scenario.brief,
                    scenario_expected: scenario.expected,
                    candidate_name: candidateName,
                    session_seed: sessionSeed,
                },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error: any) {
        console.error("oral-exam-session error:", error?.message);
        return new Response(JSON.stringify({ error: error?.message || "unknown" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
