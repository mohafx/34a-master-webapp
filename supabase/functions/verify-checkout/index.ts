import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
    finalizePaidCheckoutSession,
    getCheckoutMode,
    getUserEmail,
    normalizePlan,
} from "../_shared/checkout-finalization.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20",
});

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}

/**
 * Verifies a Stripe Checkout Session and finalizes successful payments.
 * This endpoint is intentionally session-based so the frontend can recover
 * when Embedded Checkout shows success but does not invoke its callback.
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { sessionId } = await req.json();

        if (!sessionId || typeof sessionId !== "string") {
            return jsonResponse({ error: "sessionId is required", isSuccess: false }, 400);
        }

        console.log(`[verify-checkout] Checking session: ${sessionId}`);

        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["subscription", "payment_intent"],
        });

        const checkoutMode = getCheckoutMode(session);
        const isGuest = checkoutMode === "guest";
        const email = getUserEmail(session);
        const plan = normalizePlan(session.metadata?.plan_type);
        const isSuccess = session.status === "complete" && session.payment_status === "paid";

        let subscriptionStatus: string | null = null;
        if (session.subscription) {
            const subscription = typeof session.subscription === "string"
                ? await stripe.subscriptions.retrieve(session.subscription)
                : session.subscription;
            subscriptionStatus = subscription.status;
        }

        let paymentIntentStatus: string | null = null;
        if (session.payment_intent) {
            const paymentIntent = typeof session.payment_intent === "string"
                ? await stripe.paymentIntents.retrieve(session.payment_intent)
                : session.payment_intent;
            paymentIntentStatus = paymentIntent.status;
        }

        let isPremium = (subscriptionStatus === "active" || subscriptionStatus === "trialing") ||
            (session.mode === "payment" && session.payment_status === "paid");
        let entitlement: Record<string, unknown> | null = null;

        if (isSuccess) {
            const result = await finalizePaidCheckoutSession({
                session,
                stripe,
                supabaseAdmin,
                supabaseAuthClient,
                source: "verify_checkout",
            });
            isPremium = result.isPremium;
            entitlement = result.entitlement ?? null;
        }

        const response = {
            sessionId,
            isSuccess,
            isPremium,
            sessionStatus: session.status,
            paymentStatus: session.payment_status,
            subscriptionStatus,
            paymentIntentStatus,
            mode: session.mode,
            checkoutMode,
            isGuest,
            email,
            plan,
            entitlement,
        };

        console.log("[verify-checkout] Result:", response);
        return jsonResponse(response);
    } catch (error: any) {
        console.error("[verify-checkout] Error:", error);

        if (error.code === "resource_missing") {
            return jsonResponse({
                isSuccess: false,
                isPremium: false,
                error: "Session not found",
                sessionStatus: "not_found",
            });
        }

        return jsonResponse({ error: error.message, isSuccess: false, isPremium: false }, 400);
    }
});
