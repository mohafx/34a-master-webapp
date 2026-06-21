import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { capturePostHog, capturePostHogEvent, identifyPostHogUser } from "../_shared/posthog.ts";
import { finalizePaidCheckoutSession } from "../_shared/checkout-finalization.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Use Service Role to bypass RLS when updating subscriptions
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// =====================================================
// IDEMPOTENCY: Check if event was already processed
// =====================================================
async function isEventProcessed(eventId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('processed_stripe_events')
        .select('event_id')
        .eq('event_id', eventId)
        .maybeSingle();
    return !!data;
}

async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('processed_stripe_events')
        .insert({ event_id: eventId, event_type: eventType })
        .select()
        .maybeSingle();

    if (error && !error.message.includes('duplicate')) {
        console.error('[webhook] Error marking event as processed:', error);
    }
}

async function activateTikTokLernplan(tiktokLernplanId: string | undefined, userId: string): Promise<void> {
    if (!tiktokLernplanId) return;

    const { data, error } = await supabaseAdmin
        .from('user_lernplans')
        .update({
            status: 'active',
            activated_at: new Date().toISOString(),
        })
        .eq('id', tiktokLernplanId)
        .eq('user_id', userId)
        .select('id,status,test_score,test_total,weak_topics')
        .maybeSingle();

    if (error) {
        console.error(`[webhook] Failed to activate TikTok Lernplan ${tiktokLernplanId}:`, error);
        await capturePostHog("tiktok_plan_activation_failed", userId, {
            tiktok_lernplan_id: tiktokLernplanId,
            plan_status: "activation_failed",
            error_message: error.message,
        });
        return;
    }

    await capturePostHog("tiktok_plan_activated", userId, {
        tiktok_lernplan_id: tiktokLernplanId,
        plan_status: data?.status || "active",
        test_score: data?.test_score ?? null,
        test_total: data?.test_total ?? null,
        weak_topic_count: Array.isArray(data?.weak_topics) ? data.weak_topics.length : 0,
    });
    console.log(`[webhook] TikTok Lernplan activated: ${tiktokLernplanId}`);
}

async function sendGuestRegistrationEmail(email: string): Promise<void> {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("[webhook] Cannot send guest registration email: missing SUPABASE_URL or SUPABASE_ANON_KEY");
        return;
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://34a-master.app";
    const { error } = await supabaseAuthClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/#/complete-registration`,
    });

    if (error) {
        console.error(`[webhook] Failed to send recovery email to ${email}:`, error);
        return;
    }

    console.log(`[webhook] Recovery email sent to ${email} for guest checkout`);
}

// =====================================================
// USER LOOKUP: Find user_id from various sources
// =====================================================
async function findUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
    // 1. Try metadata first (most reliable)
    if (subscription.metadata?.user_id) {
        return subscription.metadata.user_id;
    }

    // 2. Try to find by provider_subscription_id in our DB
    const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('provider_subscription_id', subscription.id)
        .maybeSingle();

    if (existingSub?.user_id) {
        return existingSub.user_id;
    }

    // 3. Try to find by customer_id
    const { data: customerSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('provider_customer_id', subscription.customer as string)
        .maybeSingle();

    if (customerSub?.user_id) {
        return customerSub.user_id;
    }

    return null;
}

async function findUserIdForInvoice(invoice: Stripe.Invoice): Promise<string | null> {
    // Get subscription from invoice
    if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        return findUserIdForSubscription(subscription);
    }

    // Fallback: find by customer_id
    const { data: customerSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('provider_customer_id', invoice.customer as string)
        .maybeSingle();

    return customerSub?.user_id || null;
}

function getCheckoutMode(session: Stripe.Checkout.Session): "guest" | "authenticated" {
    return session.metadata?.guest_checkout === "true" ? "guest" : "authenticated";
}

async function capturePaymentSucceeded(
    session: Stripe.Checkout.Session,
    userId: string,
    source = "stripe_webhook",
) {
    const planType = session.metadata?.plan_type || "monthly";
    const checkoutMode = getCheckoutMode(session);
    const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const sessionFunnelId = session.metadata?.session_funnel_id;

    await identifyPostHogUser(userId, sessionFunnelId, {
        source,
        checkout_session_id: session.id,
        funnel: session.metadata?.funnel,
    });

    await capturePostHogEvent("payment_succeeded_server", {
        distinctId: userId,
        timestamp: paidAt,
        properties: {
            checkout_session_id: session.id,
            payment_status: session.payment_status,
            plan: planType,
            checkout_mode: checkoutMode,
            email: session.customer_email || session.metadata?.guest_email,
            source,
            tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
            session_funnel_id: sessionFunnelId,
            funnel: session.metadata?.funnel,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
            amount_total: session.amount_total,
            currency: session.currency,
        },
        set: {
            email: session.customer_email || session.metadata?.guest_email || null,
            is_premium: true,
            premium_source: "stripe",
            premium_plan: planType,
            last_payment_at: paidAt,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
        },
        setOnce: {
            first_payment_at: paidAt,
            first_paid_plan: planType,
            first_checkout_mode: checkoutMode,
        },
    });

    if (session.metadata?.tiktok_lernplan_id || session.metadata?.funnel === "tiktok_pruefungscheck") {
        await capturePostHogEvent("tiktok_payment_succeeded_server", {
            distinctId: userId,
            timestamp: paidAt,
            properties: {
                funnel: "tiktok_pruefungscheck",
                funnel_version: "2026-04-29",
                source,
                tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
                checkout_session_id: session.id,
                payment_status: session.payment_status,
                plan_status: "payment_succeeded",
                session_funnel_id: sessionFunnelId,
                checkout_mode: checkoutMode,
            },
        });
    }
}

// =====================================================
// MAIN WEBHOOK HANDLER
// =====================================================
serve(async (req) => {
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
        return new Response("No signature", { status: 400 });
    }

    try {
        const body = await req.text();
        let event: Stripe.Event;

        try {
            event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        console.log(`[webhook] Received event: ${event.type} (${event.id})`);

        // IDEMPOTENCY CHECK: Skip if already processed
        if (await isEventProcessed(event.id)) {
            console.log(`[webhook] Event ${event.id} already processed, skipping`);
            return new Response(JSON.stringify({ received: true, skipped: true }), {
                headers: { "Content-Type": "application/json" },
                status: 200,
            });
        }

        // Handle the event
        switch (event.type) {
            // ===== CHECKOUT EVENTS =====
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutSessionCompleted(session);
                break;
            }

            // Async payment methods (Klarna, SEPA, etc.)
            case "checkout.session.async_payment_succeeded": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log(`[webhook] Async payment succeeded: ${session.id}`);
                await handleCheckoutSessionCompleted(session);
                break;
            }

            case "checkout.session.async_payment_failed": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log(`[webhook] Async payment FAILED: ${session.id}`);
                await capturePostHog("payment_failed_server", session.client_reference_id || session.metadata?.user_id, {
                    tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
                    checkout_session_id: session.id,
                    payment_status: session.payment_status,
                    plan: session.metadata?.plan_type,
                    checkout_mode: session.metadata?.guest_checkout === "true" ? "guest" : "authenticated",
                    email: session.customer_email,
                    session_funnel_id: session.metadata?.session_funnel_id,
                    funnel: session.metadata?.funnel,
                    source: "stripe_webhook",
                    stripe_event_id: event.id,
                    stripe_event_type: event.type,
                });
                await capturePostHog("tiktok_payment_failed_server", session.client_reference_id || session.metadata?.user_id, {
                    funnel: "tiktok_pruefungscheck",
                    funnel_version: "2026-04-29",
                    source: "stripe_webhook",
                    tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
                    checkout_session_id: session.id,
                    payment_status: session.payment_status,
                    session_funnel_id: session.metadata?.session_funnel_id,
                    plan_status: "pending_payment",
                });
                // Don't activate - just log. User will need to retry.
                break;
            }

            // ===== SUBSCRIPTION EVENTS =====
            case "customer.subscription.created": {
                const subscription = event.data.object as Stripe.Subscription;
                console.log(`[webhook] Subscription created: ${subscription.id}`);
                await handleSubscriptionUpdated(subscription);
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdated(subscription);
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(subscription);
                break;
            }

            // ===== INVOICE EVENTS (CRITICAL FOR RENEWALS) =====
            case "invoice.paid": {
                const invoice = event.data.object as Stripe.Invoice;
                await handleInvoicePaid(invoice);
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                await handleInvoicePaymentFailed(invoice);
                break;
            }

            // ===== REFUND/DISPUTE EVENTS =====
            case "charge.refunded": {
                const charge = event.data.object as Stripe.Charge;
                await handleChargeRefunded(charge);
                break;
            }

            case "charge.dispute.created": {
                const dispute = event.data.object as Stripe.Dispute;
                await handleDisputeCreated(dispute);
                break;
            }

            default:
                console.log(`[webhook] Unhandled event type ${event.type}`);
        }

        // Mark event as processed
        await markEventProcessed(event.id, event.type);

        return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        });
    } catch (err: any) {
        console.error(`[webhook] Error processing: ${err.message}`);
        return new Response(`Error: ${err.message}`, { status: 500 });
    }
});

// =====================================================
// EVENT HANDLERS
// =====================================================

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id || session.metadata?.user_id;
    const planType = session.metadata?.plan_type || 'monthly';

    if (!userId) {
        console.error("[webhook] No user_id found in session metadata or client_reference_id");
        return;
    }

    // CRITICAL: For async payments (Klarna), only activate if payment_status is 'paid'
    if (session.payment_status !== 'paid') {
        console.log(`[webhook] Session ${session.id} payment_status is ${session.payment_status}, waiting for async_payment_succeeded`);
        return;
    }

    console.log(`[webhook] handleCheckoutSessionCompleted: userId=${userId}, mode=${session.mode}, plan=${planType}`);
    await finalizePaidCheckoutSession({
        session,
        stripe,
        supabaseAdmin,
        supabaseAuthClient,
        source: "stripe_webhook",
    });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = await findUserIdForSubscription(subscription);

    if (!userId) {
        console.error("[webhook] Could not find user_id for subscription update", subscription.id);
        return;
    }

    // Determine effective status
    let effectiveStatus = subscription.status;
    if (subscription.cancel_at_period_end && subscription.status === 'active') {
        effectiveStatus = 'canceled';
        console.log(`[webhook] Subscription ${subscription.id} set to cancel at period end`);
    }

    await upsertSubscription({
        userId,
        subscriptionId: subscription.id,
        customerId: subscription.customer as string,
        status: effectiveStatus,
        plan: subscription.metadata?.plan_type || 'monthly',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    await capturePostHog("subscription_updated_server", userId, {
        provider_subscription_id: subscription.id,
        provider_customer_id: subscription.customer as string,
        status: effectiveStatus,
        plan: subscription.metadata?.plan_type || 'monthly',
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        source: "stripe_webhook",
    });

    if (effectiveStatus === "canceled") {
        await capturePostHog("subscription_canceled_server", userId, {
            provider_subscription_id: subscription.id,
            provider_customer_id: subscription.customer as string,
            status: effectiveStatus,
            plan: subscription.metadata?.plan_type || 'monthly',
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            source: "stripe_webhook",
        });
    }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = await findUserIdForSubscription(subscription);

    if (!userId) {
        console.error("[webhook] Could not find user_id for subscription deletion", subscription.id);
        return;
    }

    // Mark as canceled with existing period end (for grace period access)
    await supabaseAdmin
        .from('subscriptions')
        .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    console.log(`[webhook] Subscription deleted for user ${userId}`);
    await capturePostHog("subscription_canceled_server", userId, {
        provider_subscription_id: subscription.id,
        provider_customer_id: subscription.customer as string,
        status: "canceled",
        plan: subscription.metadata?.plan_type || 'monthly',
        source: "stripe_webhook",
    });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
    console.log(`[webhook] Invoice paid: ${invoice.id}`);

    const userId = await findUserIdForInvoice(invoice);
    if (!userId) {
        console.error("[webhook] Could not find user_id for invoice.paid", invoice.id);
        return;
    }

    // Get subscription to update period end
    if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);

        await upsertSubscription({
            userId,
            subscriptionId: subscription.id,
            customerId: subscription.customer as string,
            status: 'active', // Renewal successful = active
            plan: subscription.metadata?.plan_type || 'monthly',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        });

        console.log(`[webhook] Renewed subscription for user ${userId}`);
        await capturePostHog("subscription_updated_server", userId, {
            provider_subscription_id: subscription.id,
            provider_customer_id: subscription.customer as string,
            status: "active",
            plan: subscription.metadata?.plan_type || 'monthly',
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            source: "stripe_webhook",
            stripe_invoice_id: invoice.id,
        });
    }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    console.log(`[webhook] Invoice payment FAILED: ${invoice.id}`);

    const userId = await findUserIdForInvoice(invoice);
    if (!userId) {
        console.error("[webhook] Could not find user_id for invoice.payment_failed", invoice.id);
        return;
    }

    // Set status to past_due
    const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    if (error) {
        console.error("[webhook] Error setting past_due:", error);
    } else {
        console.log(`[webhook] Marked user ${userId} as past_due due to payment failure`);
        await capturePostHog("payment_failed_server", userId, {
            status: "past_due",
            provider_customer_id: invoice.customer as string,
            source: "stripe_webhook",
            stripe_invoice_id: invoice.id,
        });
    }
}

async function handleChargeRefunded(charge: Stripe.Charge) {
    console.log(`[webhook] Charge refunded: ${charge.id}`);

    // Find user by customer
    const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('provider_customer_id', charge.customer as string)
        .maybeSingle();

    if (sub?.user_id) {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
            .from('subscriptions')
            .update({
                status: 'refunded',
                current_period_end: nowIso,
                updated_at: nowIso,
            })
            .eq('user_id', sub.user_id);

        console.log(`[webhook] Marked user ${sub.user_id} as refunded due to refund/dispute`);
        await supabaseAdmin.from("payment_audit_events").insert({
            user_id: sub.user_id,
            event_type: "premium_revoked_refund_or_dispute",
            source: "stripe_webhook",
            severity: "warning",
            details: {
                charge_id: charge.id,
                customer_id: charge.customer,
                payment_intent_id: charge.payment_intent,
                amount_refunded: charge.amount_refunded,
                refunded: charge.refunded,
            },
        });
    }
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
    console.log(`[webhook] Dispute created: ${dispute.id}`);

    // Get charge to find customer
    const charge = dispute.charge as Stripe.Charge;
    if (typeof charge === 'string') {
        // Need to retrieve full charge
        const fullCharge = await stripe.charges.retrieve(charge);
        await handleChargeRefunded(fullCharge); // Same treatment as refund
    } else if (charge) {
        await handleChargeRefunded(charge);
    }
}

// =====================================================
// UPSERT WITH OUT-OF-ORDER PROTECTION
// =====================================================
async function upsertSubscription({
    userId,
    subscriptionId,
    customerId,
    status,
    plan,
    currentPeriodStart,
    currentPeriodEnd,
}: {
    userId: string;
    subscriptionId: string;
    customerId: string;
    status: string;
    plan: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
}) {
    // Query existing subscription
    const { data: existing, error: selectError } = await supabaseAdmin
        .from('subscriptions')
        .select('id, current_period_end')
        .eq('user_id', userId)
        .maybeSingle();

    if (selectError) {
        console.error("[webhook] Error querying subscription:", selectError);
    }

    if (existing) {
        // OUT-OF-ORDER GUARD: Only update if new period_end >= existing
        // This prevents old events from overwriting newer data
        const existingPeriodEnd = existing.current_period_end
            ? new Date(existing.current_period_end)
            : new Date(0);

        if (currentPeriodEnd < existingPeriodEnd && status !== 'past_due' && status !== 'canceled') {
            console.log(`[webhook] Skipping update - existing period_end (${existingPeriodEnd.toISOString()}) > new (${currentPeriodEnd.toISOString()})`);
            return;
        }

        const { error: updateError } = await supabaseAdmin.from('subscriptions').update({
            status,
            plan,
            provider: 'stripe',
            provider_customer_id: customerId,
            provider_subscription_id: subscriptionId,
            current_period_start: currentPeriodStart.toISOString(),
            current_period_end: currentPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', existing.id);

        if (updateError) {
            console.error("[webhook] Error updating subscription:", updateError);
        } else {
            console.log(`[webhook] Updated subscription for user ${userId}: ${status}`);
        }
    } else {
        const { error: insertError } = await supabaseAdmin.from('subscriptions').insert({
            user_id: userId,
            status,
            plan,
            provider: 'stripe',
            provider_customer_id: customerId,
            provider_subscription_id: subscriptionId,
            current_period_start: currentPeriodStart.toISOString(),
            current_period_end: currentPeriodEnd.toISOString(),
        });

        if (insertError) {
            console.error("[webhook] Error inserting subscription:", insertError);
        } else {
            console.log(`[webhook] Inserted subscription for user ${userId}: ${status}`);
        }
    }
}
