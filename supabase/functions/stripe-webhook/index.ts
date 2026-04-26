import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Use Service Role to bypass RLS when updating subscriptions
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

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
    const subscriptionId = session.subscription as string;
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

    // Handle subscription mode
    if (session.mode === 'subscription' && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await upsertSubscription({
            userId,
            subscriptionId,
            customerId: session.customer as string,
            status: subscription.status,
            plan: planType,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        });
        console.log(`[webhook] Subscription created for user ${userId}`);
        return;
    }

    // Handle payment mode (one-time purchase like 6 months)
    if (session.mode === 'payment' && session.payment_status === 'paid') {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);

        await upsertSubscription({
            userId,
            subscriptionId: 'payment_' + session.id,
            customerId: session.customer as string || 'unknown',
            status: 'active',
            plan: planType === 'monthly' ? '6months' : planType,
            currentPeriodEnd: expiresAt,
        });
        console.log(`[webhook] One-time payment recorded for user ${userId}`);

        // Send recovery email for guest checkout users so they can set a password
        if (session.metadata?.guest_checkout === 'true' && session.customer_email) {
            try {
                const siteUrl = Deno.env.get("SITE_URL") || "https://34a-master.app";
                const { error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'recovery',
                    email: session.customer_email,
                    options: {
                        redirectTo: `${siteUrl}/#/complete-registration`,
                    }
                });
                if (recoveryError) {
                    console.error(`[webhook] Failed to send recovery email to ${session.customer_email}:`, recoveryError);
                } else {
                    console.log(`[webhook] Recovery email sent to ${session.customer_email} for guest checkout`);
                }
            } catch (emailErr: any) {
                // Non-fatal — payment was still successful
                console.error(`[webhook] Error sending recovery email:`, emailErr?.message);
            }
        }
        return;
    }

    console.log(`[webhook] Session mode ${session.mode} not handled or payment not complete`);
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
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });
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
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        });

        console.log(`[webhook] Renewed subscription for user ${userId}`);
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
        // Mark as refunded (could add 'refunded' status or just cancel)
        await supabaseAdmin
            .from('subscriptions')
            .update({
                status: 'canceled',
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', sub.user_id);

        console.log(`[webhook] Marked user ${sub.user_id} as canceled due to refund`);
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
    currentPeriodEnd,
}: {
    userId: string;
    subscriptionId: string;
    customerId: string;
    status: string;
    plan: string;
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
            current_period_end: currentPeriodEnd.toISOString(),
        });

        if (insertError) {
            console.error("[webhook] Error inserting subscription:", insertError);
        } else {
            console.log(`[webhook] Inserted subscription for user ${userId}: ${status}`);
        }
    }
}
