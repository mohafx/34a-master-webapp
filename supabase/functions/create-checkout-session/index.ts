import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20", // Use latest API version
});

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    userEmail: string | null | undefined,
    payload: any,
): Promise<string | null> {
    if (!payload?.planJson || payload?.source !== "tiktok_funnel") return null;

    const { data, error } = await supabaseAdmin
        .from("user_lernplans")
        .insert({
            user_id: userId,
            user_email: userEmail || null,
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
        console.error("[checkout] Failed to create pending TikTok Lernplan:", error);
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
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 1. Get the user from the authorization header
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            {
                global: {
                    headers: { Authorization: req.headers.get("Authorization")! },
                },
            }
        );

        const {
            data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
            throw new Error("Nicht authentifiziert");
        }

        // 2. Parse request body
        const { priceId, tiktokPlanPayload } = await req.json();

        if (!priceId) {
            throw new Error("Price ID fehlt");
        }

        // MAP internal price IDs to Stripe Price IDs
        const PRICE_MAPPING = {
            '6months': Deno.env.get("STRIPE_PRICE_6MONTHS_ID") || "price_1SgXd94CFd3pD2h0Nah9Fnkz",
        };

        const stripePriceId = PRICE_MAPPING[priceId as keyof typeof PRICE_MAPPING];

        if (!stripePriceId || stripePriceId.startsWith("price_1Q")) {
            console.warn(`Warning: Using placeholder or undefined price ID for ${priceId}`);
        }

        if (!stripePriceId) {
            throw new Error(`Ungültiger Preis-Plan: ${priceId}`);
        }

        // 3. Create Stripe Checkout Session (Embedded)
        // 6-Months = one-time payment
        console.log("Creating Embedded Session with price:", stripePriceId, "for user:", user.id, "mode: payment");

        const tiktokLernplanId = await createPendingTikTokLernplan(user.id, user.email, tiktokPlanPayload);
        const metadata: Record<string, string> = {
            user_id: user.id,
            plan_type: priceId,
        };
        if (tiktokLernplanId) {
            metadata.tiktok_lernplan_id = tiktokLernplanId;
        }

        const session = await stripe.checkout.sessions.create({
            // Note: payment_method_types is required for embedded checkout
            // Apple Pay/Google Pay appear automatically on compatible devices when 'card' is included
            payment_method_types: ["card", "paypal", "klarna"],
            line_items: [
                {
                    price: stripePriceId,
                    quantity: 1,
                },
            ],
            mode: "payment",
            ui_mode: 'embedded',
            return_url: `${req.headers.get("origin")}/#/profile?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            customer_email: user.email,
            customer_creation: 'always',
            client_reference_id: user.id,
            metadata,
            payment_intent_data: {
                metadata,
            }
        });

        console.log("Embedded Session created:", session.id);
        if (tiktokLernplanId) {
            await capturePostHog("tiktok_checkout_session_created_server", user.id, {
                tiktok_lernplan_id: tiktokLernplanId,
                checkout_session_id: session.id,
                payment_status: session.payment_status,
                test_score: typeof tiktokPlanPayload?.testScore === "number" ? tiktokPlanPayload.testScore : null,
                test_total: typeof tiktokPlanPayload?.testTotal === "number" ? tiktokPlanPayload.testTotal : null,
                weak_topic_count: Array.isArray(tiktokPlanPayload?.weakTopics) ? tiktokPlanPayload.weakTopics.length : 0,
            });
        }

        // 4. Return the client secret
        return new Response(
            JSON.stringify({ clientSecret: session.client_secret }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error: any) {
        console.error("Checkout error:", error);
        // Include full error details for debugging
        const errorResponse = {
            error: error.message,
            type: error.type || 'unknown',
            code: error.code || null,
            details: error.raw?.message || error.statusCode || null,
            stack: error.stack?.split('\n').slice(0, 3).join(' | ') || null
        };
        console.error("Error response:", JSON.stringify(errorResponse));
        return new Response(
            JSON.stringify(errorResponse),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});
