import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20",
});

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Admin client — bypasses RLS, needed to create users without auth
const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function capturePostHog(event: string, distinctId: string | undefined, properties: Record<string, unknown> = {}) {
    const apiKey = Deno.env.get("POSTHOG_PROJECT_API_KEY");
    const host = (Deno.env.get("POSTHOG_HOST") || "").replace(/\/$/, "");
    if (!apiKey || !host) return;

    try {
        await fetch(`${host}/capture/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                event,
                distinct_id: distinctId || "server",
                properties: {
                    funnel: "tiktok_pruefungscheck",
                    funnel_version: "2026-04-29",
                    source: "tiktok_result",
                    ...properties,
                },
            }),
        });
    } catch (error) {
        console.error(`[posthog] Failed to capture ${event}:`, error);
    }
}

async function createPendingTikTokLernplan(
    userId: string,
    userEmail: string,
    payload: any,
): Promise<string | null> {
    if (!payload?.planJson || payload?.source !== "tiktok_funnel") return null;

    const { data, error } = await supabaseAdmin
        .from("user_lernplans")
        .insert({
            user_id: userId,
            user_email: userEmail,
            source: "tiktok_funnel",
            status: "pending_payment",
            plan_json: payload.planJson,
            weak_topics: Array.isArray(payload.weakTopics) ? payload.weakTopics : [],
            test_score: typeof payload.testScore === "number" ? payload.testScore : null,
            test_total: typeof payload.testTotal === "number" ? payload.testTotal : null,
        })
        .select("id")
        .single();

    if (error) {
        console.error("[guest-checkout] Failed to create pending TikTok Lernplan:", error);
        await capturePostHog("tiktok_plan_activation_failed", userId, {
            plan_status: "pending_create_failed",
            test_score: typeof payload.testScore === "number" ? payload.testScore : null,
            test_total: typeof payload.testTotal === "number" ? payload.testTotal : null,
            weak_topic_count: Array.isArray(payload.weakTopics) ? payload.weakTopics.length : 0,
            error_message: error.message,
        });
        throw new Error("TikTok-Lernplan konnte nicht vorbereitet werden.");
    }

    await capturePostHog("tiktok_plan_pending_created", userId, {
        tiktok_lernplan_id: data?.id,
        plan_status: "pending_payment",
        test_score: typeof payload.testScore === "number" ? payload.testScore : null,
        test_total: typeof payload.testTotal === "number" ? payload.testTotal : null,
        weak_topic_count: Array.isArray(payload.weakTopics) ? payload.weakTopics.length : 0,
    });

    return data?.id || null;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Parse body — no auth header required for guest checkout
        const { email, priceId, tiktokPlanPayload } = await req.json();

        // --- Validate input ---
        if (!email || typeof email !== "string" || !email.includes("@")) {
            return new Response(
                JSON.stringify({ error: "INVALID_EMAIL", message: "Bitte gib eine gültige E-Mail-Adresse ein." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!priceId) {
            return new Response(
                JSON.stringify({ error: "MISSING_PRICE_ID", message: "Kein Plan ausgewählt." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // --- Map price ID ---
        const PRICE_MAPPING: Record<string, string> = {
            "6months": Deno.env.get("STRIPE_PRICE_6MONTHS_ID") || "price_1SgXd94CFd3pD2h0Nah9Fnkz",
        };

        const stripePriceId = PRICE_MAPPING[priceId];
        if (!stripePriceId) {
            return new Response(
                JSON.stringify({ error: "INVALID_PLAN", message: `Ungültiger Plan: ${priceId}` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // --- Check if email already has an account ---
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(
            (u) => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (existingUser) {
            return new Response(
                JSON.stringify({
                    error: "EMAIL_EXISTS",
                    message: "Diese E-Mail hat bereits ein Konto. Bitte melde dich an."
                }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // --- Create Supabase user (no password, auto-confirmed) ---
        const displayName = email.split("@")[0];
        const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true, // Auto-confirm — they'll set a password via recovery link
            user_metadata: {
                display_name: displayName,
                guest_checkout: true,
            },
        });

        if (createError || !newUserData?.user) {
            console.error("[guest-checkout] Error creating user:", createError);
            throw new Error(createError?.message || "Benutzer konnte nicht erstellt werden.");
        }

        const userId = newUserData.user.id;
        console.log(`[guest-checkout] Created user ${userId} for ${email}`);

        // --- Create user profile ---
        await supabaseAdmin.from("user_profiles").insert({
            id: userId,
            display_name: displayName,
        }).select().maybeSingle();
        // Ignore errors here — profile is not critical for checkout

        const tiktokLernplanId = await createPendingTikTokLernplan(userId, email, tiktokPlanPayload);
        const metadata: Record<string, string> = {
            user_id: userId,
            plan_type: priceId,
            guest_checkout: "true",
            guest_email: email,
        };
        if (tiktokLernplanId) {
            metadata.tiktok_lernplan_id = tiktokLernplanId;
        }

        // --- Create Stripe Checkout Session ---
        const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://34a-master.app";
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card", "paypal", "klarna"],
            line_items: [{ price: stripePriceId, quantity: 1 }],
            mode: "payment",
            ui_mode: "embedded",
            return_url: `${origin}/#/guest-payment-success?session_id={CHECKOUT_SESSION_ID}`,
            customer_email: email,
            customer_creation: "always",
            client_reference_id: userId,
            metadata,
            payment_intent_data: {
                metadata,
            },
        });

        console.log(`[guest-checkout] Stripe session created: ${session.id} for user ${userId}`);
        if (tiktokLernplanId) {
            await capturePostHog("tiktok_checkout_session_created_server", userId, {
                tiktok_lernplan_id: tiktokLernplanId,
                checkout_session_id: session.id,
                payment_status: session.payment_status,
                test_score: typeof tiktokPlanPayload?.testScore === "number" ? tiktokPlanPayload.testScore : null,
                test_total: typeof tiktokPlanPayload?.testTotal === "number" ? tiktokPlanPayload.testTotal : null,
                weak_topic_count: Array.isArray(tiktokPlanPayload?.weakTopics) ? tiktokPlanPayload.weakTopics.length : 0,
                guest_checkout: true,
            });
        }

        return new Response(
            JSON.stringify({ clientSecret: session.client_secret }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[guest-checkout] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
