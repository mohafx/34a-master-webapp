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

/**
 * Verifies a Stripe Checkout Session and returns its actual status.
 * This is used to prevent false success on Klarna cancel.
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { sessionId } = await req.json();

        if (!sessionId) {
            return new Response(
                JSON.stringify({ error: "sessionId is required" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            );
        }

        console.log(`[verify-checkout] Checking session: ${sessionId}`);

        // Retrieve the checkout session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['subscription', 'payment_intent']
        });

        console.log(`[verify-checkout] Session status: ${session.status}, payment_status: ${session.payment_status}`);

        // Determine if payment was actually successful
        const isSuccess =
            session.status === 'complete' &&
            session.payment_status === 'paid';

        // Get subscription status if exists
        let subscriptionStatus = null;
        if (session.subscription) {
            const subscription = typeof session.subscription === 'string'
                ? await stripe.subscriptions.retrieve(session.subscription)
                : session.subscription;
            subscriptionStatus = subscription.status;
            console.log(`[verify-checkout] Subscription status: ${subscriptionStatus}`);
        }

        // Get payment intent status if exists
        let paymentIntentStatus = null;
        if (session.payment_intent) {
            const pi = typeof session.payment_intent === 'string'
                ? await stripe.paymentIntents.retrieve(session.payment_intent)
                : session.payment_intent;
            paymentIntentStatus = pi.status;
            console.log(`[verify-checkout] PaymentIntent status: ${paymentIntentStatus}`);
        }

        const response = {
            sessionId,
            isSuccess,
            sessionStatus: session.status,
            paymentStatus: session.payment_status,
            subscriptionStatus,
            paymentIntentStatus,
            mode: session.mode,
            // Active subscription OR successful one-time payment counts as Premium
            isPremium: (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') ||
                (session.mode === 'payment' && session.payment_status === 'paid')
        };

        console.log(`[verify-checkout] Result:`, response);

        return new Response(
            JSON.stringify(response),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error(`[verify-checkout] Error:`, error);

        // Check if it's a Stripe "no such session" error
        if (error.code === 'resource_missing') {
            return new Response(
                JSON.stringify({
                    isSuccess: false,
                    error: 'Session not found',
                    sessionStatus: 'not_found'
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ error: error.message, isSuccess: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
});
