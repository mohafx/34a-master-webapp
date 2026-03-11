import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20",
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS headers - Safari requires explicit methods
const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        console.log("[sync-subscription] CORS preflight request received");
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    try {
        // 1. Authenticate User
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

        if (!user || !user.email) {
            throw new Error("Nicht authentifiziert oder keine E-mail vorhanden");
        }

        console.log(`[sync-subscription] Starting sync for user: ${user.email} (${user.id})`);

        // OPTIMIZED STRATEGY: Lookup by Customer Email
        // This avoids the 'recent 10 sessions' limit bug.

        console.log(`[sync-subscription] Searching for Stripe customers with email: ${user.email}`);

        const customers = await stripe.customers.list({
            email: user.email,
            limit: 5, // Handle edge case of duplicate customers
        });

        if (customers.data.length === 0) {
            // No customer found with this email
            console.log(`[sync-subscription] No Stripe customer found for email ${user.email}`);
            // As a fallback, check if we have any successful sessions with this client_reference_id
            // (In case email changed or mismatched)
            return await fallbackCheckByReferenceId(user.id, user.email);
        }

        console.log(`[sync-subscription] Found ${customers.data.length} customer(s). Checking for active plans...`);

        // Iterate through customers to find any active subscription or valid payment
        for (const customer of customers.data) {

            // 1. Check Subscriptions
            const subscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'all', // Fetch all to check for active/trailing
                limit: 5
            });

            // Find first active one
            const activeSub = subscriptions.data.find(sub =>
                sub.status === 'active' || sub.status === 'trialing'
            );

            if (activeSub) {
                console.log(`[sync-subscription] Found active subscription: ${activeSub.id}, cancel_at_period_end: ${activeSub.cancel_at_period_end}`);
                const planType = activeSub.metadata?.plan_type || 'monthly';

                // Check if subscription is set to cancel at period end
                let effectiveStatus: string = activeSub.status;
                if (activeSub.cancel_at_period_end && activeSub.status === 'active') {
                    effectiveStatus = 'canceled';
                    console.log(`[sync-subscription] Subscription is set to cancel at period end, marking as 'canceled'`);
                }

                await upsertSubscription({
                    userId: user.id,
                    userEmail: user.email,
                    subscriptionId: activeSub.id,
                    customerId: customer.id,
                    status: effectiveStatus,
                    plan: planType,
                    currentPeriodEnd: new Date(activeSub.current_period_end * 1000)
                });

                return new Response(
                    JSON.stringify({
                        message: effectiveStatus === 'canceled' ? "Abo-Kündigung erkannt" : "Abo erfolgreich synchronisiert",
                        restored: true,
                        details: {
                            plan: planType,
                            status: effectiveStatus,
                            cancelAtPeriodEnd: activeSub.cancel_at_period_end
                        }
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // 1b. Check for recently canceled subscriptions that still have valid period
            const canceledSub = subscriptions.data.find(sub => {
                if (sub.status !== 'canceled') return false;
                const periodEnd = new Date(sub.current_period_end * 1000);
                return periodEnd > new Date(); // Still in valid period
            });

            if (canceledSub) {
                console.log(`[sync-subscription] Found canceled subscription with valid period: ${canceledSub.id}, ends: ${new Date(canceledSub.current_period_end * 1000).toISOString()}`);
                const planType = canceledSub.metadata?.plan_type || 'monthly';

                await upsertSubscription({
                    userId: user.id,
                    userEmail: user.email,
                    subscriptionId: canceledSub.id,
                    customerId: customer.id,
                    status: 'canceled',
                    plan: planType,
                    currentPeriodEnd: new Date(canceledSub.current_period_end * 1000)
                });

                return new Response(
                    JSON.stringify({
                        message: "Gekündigtes Abo erkannt (Zugang bis Ablaufdatum)",
                        restored: true,
                        details: {
                            plan: planType,
                            status: 'canceled',
                            periodEnd: new Date(canceledSub.current_period_end * 1000).toISOString()
                        }
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // 2. Check One-Time Payments (Checkout Sessions) for this customer
            // specifically for the '6months' plan which is a "payment" mode
            const sessions = await stripe.checkout.sessions.list({
                customer: customer.id,
                limit: 10,
                // Expand payment_intent AND its latest_charge to be doubly sure about refunds
                expand: ['data.payment_intent', 'data.payment_intent.latest_charge']
            });

            // Filter for 'payment' mode which represents one-time purchases AND ensure paid status
            const paymentSessions = sessions.data.filter(s => s.mode === 'payment' && s.payment_status === 'paid');

            for (const session of paymentSessions) {
                // Check for refunds
                // Check for refunds on PaymentIntent
                const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
                const latestCharge = paymentIntent?.latest_charge as Stripe.Charge | null;

                // Check 1: PI Amount Refunded
                if (paymentIntent && paymentIntent.amount_refunded && paymentIntent.amount_refunded > 0) {
                    console.log(`[sync-subscription] Found partially/fully refunded PI ${paymentIntent.id}, skipping.`);
                    continue;
                }

                // Check 2: Latest Charge Refunded status (Boolean)
                if (latestCharge && (latestCharge.refunded || (latestCharge.amount_refunded && latestCharge.amount_refunded > 0))) {
                    console.log(`[sync-subscription] Found refunded Charge ${latestCharge.id}, skipping.`);
                    continue;
                }

                // Check logic for 6-months validity
                // We assume 6 months duration for one-time payments
                if (session.metadata?.plan_type === '6months' || session.amount_total === 4900) { // Check amount as fallback (49 EUR)

                    const created = new Date(session.created * 1000);
                    const expiresAt = new Date(created);
                    expiresAt.setMonth(expiresAt.getMonth() + 6);

                    if (expiresAt > new Date()) {
                        console.log(`[sync-subscription] Found valid 6-month payment from ${created.toISOString()}`);

                        await upsertSubscription({
                            userId: user.id,
                            userEmail: user.email,
                            subscriptionId: "session_" + session.id,
                            customerId: customer.id,
                            status: 'active',
                            plan: '6months',
                            currentPeriodEnd: expiresAt
                        });

                        return new Response(
                            JSON.stringify({
                                message: "6-Monats-Paket wiederhergestellt",
                                restored: true
                            }),
                            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                }
            }
        }

        console.log(`[sync-subscription] No active plans found for user ${user.email} across ${customers.data.length} customers.`);

        // CRITICAL FIX: If we checked Stripe and found nothing, we MUST invalidate the local subscription
        // otherwise a stale 'active' status in the DB will persist forever.
        await invalidateSubscription(user.id);

        return new Response(
            JSON.stringify({
                message: "Keine aktiven Abos oder gültigen Pakete gefunden.",
                restored: false,
                debug: {
                    email: user.email,
                    customersFound: customers.data.length
                }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error(`[sync-subscription] Error:`, error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
});

// Fallback: Search checkout sessions directly by email (for payments without customer creation)
async function fallbackCheckByReferenceId(userId: string, userEmail: string) {
    console.log(`[sync-subscription] Fallback: Searching checkout sessions for email ${userEmail}...`);

    try {
        // List recent paid checkout sessions (Stripe doesn't support filtering by email, so we fetch many and filter)
        const sessions = await stripe.checkout.sessions.list({
            limit: 100, // Fetch more to increase chances of finding the payment
            expand: ['data.payment_intent', 'data.payment_intent.latest_charge']
        });

        // Filter for sessions matching this user's email with successful payment
        const matchingSessions = sessions.data.filter(s =>
            s.customer_email === userEmail &&
            s.payment_status === 'paid' &&
            s.status === 'complete'
        );

        if (matchingSessions.length === 0) {
            console.log(`[sync-subscription] No paid sessions found for email ${userEmail}`);
            return new Response(
                JSON.stringify({
                    message: "Keine bezahlten Käufe mit dieser E-Mail gefunden.",
                    restored: false
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[sync-subscription] Found ${matchingSessions.length} paid session(s) for ${userEmail}`);

        // Find the most recent valid one-time payment (6months)
        let foundRefunded = false;

        for (const session of matchingSessions) {
            if (session.mode === 'payment') {
                // Check for refunds
                // Check for refunds
                const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
                const latestCharge = paymentIntent?.latest_charge as Stripe.Charge | null;

                let isRefunded = false;

                if (paymentIntent && paymentIntent.amount_refunded && paymentIntent.amount_refunded > 0) isRefunded = true;
                if (latestCharge && (latestCharge.refunded || (latestCharge.amount_refunded && latestCharge.amount_refunded > 0))) isRefunded = true;

                if (isRefunded) {
                    console.log(`[sync-subscription] Found refunded fallback session/charge ${session.id}, skipping.`);
                    foundRefunded = true;
                    continue;
                }

                // One-time payment - check if still valid (6 months from creation)
                const created = new Date(session.created * 1000);
                const expiresAt = new Date(created);
                expiresAt.setMonth(expiresAt.getMonth() + 6);

                if (expiresAt > new Date()) {
                    const planType = session.metadata?.plan_type || '6months';
                    console.log(`[sync-subscription] Found valid 6-month payment from ${created.toISOString()}, expires ${expiresAt.toISOString()}`);

                    await upsertSubscription({
                        userId,
                        userEmail,
                        subscriptionId: 'fallback_session_' + session.id,
                        customerId: (session.customer as string) || 'no_customer',
                        status: 'active',
                        plan: planType,
                        currentPeriodEnd: expiresAt
                    });

                    return new Response(
                        JSON.stringify({
                            message: "6-Monats-Paket erfolgreich wiederhergestellt!",
                            restored: true,
                            details: {
                                plan: planType,
                                status: 'active',
                                expiresAt: expiresAt.toISOString()
                            }
                        }),
                        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }
            }
        }

        if (foundRefunded) {
            // If we found a refunded payment, ensure we kill the access immediately
            await invalidateSubscription(userId);
            return new Response(
                JSON.stringify({
                    message: "Dein Kauf wurde storniert und rückerstattet.",
                    restored: false
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // No valid payment found
        console.log(`[sync-subscription] No valid/unexpired payments found for ${userEmail}`);

        // Force invalidation
        await invalidateSubscription(userId);

        return new Response(
            JSON.stringify({
                message: "Keine gültigen Käufe gefunden (möglicherweise abgelaufen).",
                restored: false
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error(`[sync-subscription] Fallback error:`, error);
        return new Response(
            JSON.stringify({
                message: "Fehler beim Suchen nach Käufen.",
                restored: false,
                error: error.message
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
}

async function upsertSubscription({
    userId,
    userEmail,
    subscriptionId,
    customerId,
    status,
    plan,
    currentPeriodEnd,
}: {
    userId: string;
    userEmail: string;
    subscriptionId: string;
    customerId: string;
    status: string;
    plan: string;
    currentPeriodEnd: Date;
}) {
    const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

    if (existing) {
        await supabaseAdmin.from('subscriptions').update({
            status,
            plan,
            provider: 'stripe',
            provider_customer_id: customerId,
            provider_subscription_id: subscriptionId,
            user_email: userEmail,
            current_period_end: currentPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
    } else {
        await supabaseAdmin.from('subscriptions').insert({
            user_id: userId,
            user_email: userEmail,
            status,
            plan,
            provider: 'stripe',
            provider_customer_id: customerId,
            provider_subscription_id: subscriptionId,
            current_period_end: currentPeriodEnd.toISOString(),
        });
    }
    console.log(`[sync-subscription] Updated subscription for user ${userId}: ${status}`);
}

async function invalidateSubscription(userId: string) {
    console.log(`[sync-subscription] INVALIDATING subscription for user ${userId} (no valid Stripe plan found)`);

    const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

    if (existing) {
        await supabaseAdmin.from('subscriptions').update({
            status: 'free', // Set to free/inactive
            plan: 'free',
            updated_at: new Date().toISOString(),
            current_period_end: new Date().toISOString() // Expire immediately
        }).eq('id', existing.id);
        console.log(`[sync-subscription] Successfully invalidated subscription for ${userId}`);
    } else {
        console.log(`[sync-subscription] No subscription to invalidate for ${userId}`);
    }
}
