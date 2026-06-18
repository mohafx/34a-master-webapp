import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Startet eine mündliche Prüfungssimulation:
//  1. Auth prüfen (nur eingeloggte Nutzer)
//  2. Premium serverseitig ermitteln (autoritativ — schützt den teuren full_5min-Modus)
//  3. Free-Nutzer: genau 1 abgeschlossener Gratis-Test erlaubt, sonst paywallRequired
//  4. Session-Zeile anlegen (status=running)
//  5. ElevenLabs Signed URL holen (API-Key bleibt geheim)
// Siehe docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID") || "";

// Soft-Launch: Feature vorerst nur für das Admin-Konto (Test-Phase). Für öffentlichen Launch entfernen.
const ADMIN_EMAILS = ["m.almajzoub1@gmail.com"];
function isAdminEmail(email?: string | null): boolean {
    return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// Dauer-Limits (Sekunden) je Modus — Client-Timer + ElevenLabs-Agent-Maxdauer sind die echten Kosten-Backstops.
const MAX_DURATION_FREE = 180;
const MAX_DURATION_FULL = 300;

const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Spiegelt src/utils/subscription.ts::hasPremiumAccess serverseitig.
function subscriptionGrantsPremium(sub: any): boolean {
    if (!sub) return false;
    if (sub.status === "active" || sub.status === "trialing") return true;
    if (sub.status === "canceled" && sub.current_period_end) {
        return new Date(sub.current_period_end) > new Date();
    }
    return false;
}

async function isUserPremium(userId: string): Promise<boolean> {
    // 1) Stripe-Subscription
    const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("status, plan, provider, current_period_end")
        .eq("user_id", userId)
        .maybeSingle();
    if (subscriptionGrantsPremium(sub)) return true;

    // 2) Denormalisiertes Flag (von checkout-finalization gesetzt)
    const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("is_premium")
        .eq("id", userId)
        .maybeSingle();
    if (profile?.is_premium === true) return true;

    // 3) Aktiver Transition-Grant
    const { data: grant } = await supabaseAdmin
        .from("access_grants")
        .select("status, ends_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (grant && (!grant.ends_at || new Date(grant.ends_at) > new Date())) return true;

    return false;
}

async function getCandidateFirstName(userId: string): Promise<string> {
    const { data } = await supabaseAdmin
        .from("user_profiles")
        .select("full_name, first_name")
        .eq("id", userId)
        .maybeSingle();
    const raw = (data?.first_name || data?.full_name || "").toString().trim();
    if (!raw) return "";
    return raw.split(/\s+/)[0];
}

async function fetchElevenLabsSignedUrl(): Promise<string> {
    const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${ELEVENLABS_AGENT_ID}`,
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
        if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
            throw new Error("Configuration Error: ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID missing in Supabase Secrets.");
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

        // Soft-Launch: nur Admin-Konto (Test-Phase)
        if (!isAdminEmail(user.email)) {
            return new Response(JSON.stringify({ error: "feature_not_available" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
            });
        }

        const body = await req.json().catch(() => ({}));
        const focusTopic: string | null = body?.focus_topic ?? null;
        // Admin-Test: erlaubt explizite Modus-Wahl (free_test_3q | full_5min), um beide Abläufe zu testen.
        const requestedMode: string | null =
            body?.requested_mode === "free_test_3q" || body?.requested_mode === "full_5min"
                ? body.requested_mode
                : null;

        const admin = isAdminEmail(user.email);
        // Admin im Test = voller Modus & unbegrenzt. isUserPremium bleibt für den späteren öffentlichen Launch erhalten.
        const premium = admin ? true : await isUserPremium(user.id);

        // Free-Gating: genau 1 abgeschlossener Gratis-Test (Admin ausgenommen, damit beide Modi testbar bleiben).
        if (!premium) {
            const { count } = await supabaseAdmin
                .from("oral_exam_sessions")
                .select("id", { count: "exact", head: true })
                .eq("user_id", user.id)
                .eq("mode", "free_test_3q")
                .eq("status", "done");
            if ((count ?? 0) >= 1) {
                return new Response(JSON.stringify({ paywallRequired: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                });
            }
        }

        // Admin darf den Modus explizit wählen; sonst ergibt er sich aus dem Premium-Status.
        const mode = admin && requestedMode ? requestedMode : premium ? "full_5min" : "free_test_3q";
        const maxDurationSec = mode === "full_5min" ? MAX_DURATION_FULL : MAX_DURATION_FREE;

        // Session anlegen
        const { data: session, error: insertError } = await supabaseAdmin
            .from("oral_exam_sessions")
            .insert({
                user_id: user.id,
                mode,
                focus_topic: focusTopic,
                status: "running",
            })
            .select("id")
            .single();
        if (insertError || !session) {
            throw new Error(`Session konnte nicht angelegt werden: ${insertError?.message}`);
        }

        const candidateName = await getCandidateFirstName(user.id);
        const signedUrl = await fetchElevenLabsSignedUrl();

        return new Response(
            JSON.stringify({
                sessionId: session.id,
                mode,
                maxDurationSec,
                signedUrl,
                dynamicVariables: {
                    mode,
                    focus_topic: focusTopic ?? "alle",
                    candidate_name: candidateName,
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
