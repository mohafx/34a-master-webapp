import Stripe from "https://esm.sh/stripe@14.21.0";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { capturePostHog, capturePostHogEvent, identifyPostHogUser } from "./posthog.ts";

export type CheckoutMode = "guest" | "authenticated";

export interface FinalizeCheckoutResult {
    userId: string | null;
    checkoutMode: CheckoutMode;
    isGuest: boolean;
    email: string | null;
    plan: string;
    isPremium: boolean;
}

interface FinalizeCheckoutOptions {
    session: Stripe.Checkout.Session;
    stripe: Stripe;
    supabaseAdmin: SupabaseClient;
    supabaseAuthClient: SupabaseClient;
    source: "stripe_webhook" | "verify_checkout";
}

function getStripeId(value: string | { id?: string } | null | undefined): string {
    if (!value) return "";
    return typeof value === "string" ? value : value.id || "";
}

export function getCheckoutMode(session: Stripe.Checkout.Session): CheckoutMode {
    return session.metadata?.guest_checkout === "true" ? "guest" : "authenticated";
}

export function getUserEmail(session: Stripe.Checkout.Session): string | null {
    return session.customer_details?.email || session.customer_email || session.metadata?.guest_email || null;
}

export function normalizePlan(planType: string | undefined | null): string {
    return planType && planType !== "monthly" ? planType : "6months";
}

async function ensureProcessedCheckoutSession(
    supabaseAdmin: SupabaseClient,
    session: Stripe.Checkout.Session,
    userId: string | null,
) {
    const { error } = await supabaseAdmin
        .from("processed_checkout_sessions")
        .upsert({
            checkout_session_id: session.id,
            user_id: userId,
            checkout_mode: getCheckoutMode(session),
            session_status: session.status,
            payment_status: session.payment_status,
            plan: normalizePlan(session.metadata?.plan_type),
            amount_total: session.amount_total,
            currency: session.currency,
            guest_email: getUserEmail(session),
            updated_at: new Date().toISOString(),
        }, { onConflict: "checkout_session_id" });

    if (error) {
        console.error("[checkout-finalization] Failed to upsert processed checkout session:", error);
        throw error;
    }
}

async function claimSideEffect(
    supabaseAdmin: SupabaseClient,
    sessionId: string,
    effect: "posthog" | "guest_email",
): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc("claim_checkout_session_side_effect", {
        p_checkout_session_id: sessionId,
        p_effect: effect,
    });

    if (error) {
        console.error(`[checkout-finalization] Failed to claim ${effect}:`, error);
        throw error;
    }

    return data === true;
}

async function upsertSubscription({
    supabaseAdmin,
    userId,
    userEmail,
    subscriptionId,
    customerId,
    status,
    plan,
    currentPeriodEnd,
}: {
    supabaseAdmin: SupabaseClient;
    userId: string;
    userEmail: string | null;
    subscriptionId: string;
    customerId: string;
    status: string;
    plan: string;
    currentPeriodEnd: Date;
}) {
    const { data: existing, error: selectError } = await supabaseAdmin
        .from("subscriptions")
        .select("id,current_period_end")
        .eq("user_id", userId)
        .maybeSingle();

    if (selectError) {
        throw selectError;
    }

    const payload = {
        status,
        plan,
        provider: "stripe",
        provider_customer_id: customerId || "unknown",
        provider_subscription_id: subscriptionId,
        user_email: userEmail,
        current_period_end: currentPeriodEnd.toISOString(),
        updated_at: new Date().toISOString(),
    };

    if (existing) {
        const existingPeriodEnd = existing.current_period_end
            ? new Date(existing.current_period_end)
            : new Date(0);

        if (currentPeriodEnd < existingPeriodEnd && status !== "past_due" && status !== "canceled") {
            console.log(`[checkout-finalization] Skipping older subscription update for ${userId}`);
            return;
        }

        const { error } = await supabaseAdmin
            .from("subscriptions")
            .update(payload)
            .eq("id", existing.id);
        if (error) throw error;
        return;
    }

    const { error } = await supabaseAdmin
        .from("subscriptions")
        .insert({
            user_id: userId,
            ...payload,
        });
    if (error) throw error;
}

async function sendGuestRegistrationEmail(
    supabaseAuthClient: SupabaseClient,
    email: string,
): Promise<void> {
    const siteUrl = Deno.env.get("SITE_URL") || "https://34a-master.app";
    const { error } = await supabaseAuthClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/#/complete-registration`,
    });

    if (error) {
        console.error(`[checkout-finalization] Failed to send recovery email to ${email}:`, error);
        throw error;
    }
}

async function activateTikTokLernplan(
    supabaseAdmin: SupabaseClient,
    tiktokLernplanId: string | undefined,
    userId: string,
    shouldTrack: boolean,
): Promise<void> {
    if (!tiktokLernplanId) return;

    const { data, error } = await supabaseAdmin
        .from("user_lernplans")
        .update({
            status: "active",
            activated_at: new Date().toISOString(),
        })
        .eq("id", tiktokLernplanId)
        .eq("user_id", userId)
        .select("id,status,test_score,test_total,weak_topics")
        .maybeSingle();

    if (error) {
        console.error(`[checkout-finalization] Failed to activate TikTok Lernplan ${tiktokLernplanId}:`, error);
        if (shouldTrack) {
            await capturePostHog("tiktok_plan_activation_failed", userId, {
                tiktok_lernplan_id: tiktokLernplanId,
                plan_status: "activation_failed",
                error_message: error.message,
            });
        }
        return;
    }

    if (!shouldTrack) return;

    await capturePostHog("tiktok_plan_activated", userId, {
        tiktok_lernplan_id: tiktokLernplanId,
        plan_status: data?.status || "active",
        test_score: data?.test_score ?? null,
        test_total: data?.test_total ?? null,
        weak_topic_count: Array.isArray(data?.weak_topics) ? data.weak_topics.length : 0,
    });
}

async function capturePaymentSucceeded(
    session: Stripe.Checkout.Session,
    userId: string,
    source: "stripe_webhook" | "verify_checkout",
) {
    const plan = normalizePlan(session.metadata?.plan_type);
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
            plan,
            checkout_mode: checkoutMode,
            email: getUserEmail(session),
            source,
            tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
            session_funnel_id: sessionFunnelId,
            funnel: session.metadata?.funnel,
            stripe_customer_id: getStripeId(session.customer),
            stripe_payment_intent_id: getStripeId(session.payment_intent),
            amount_total: session.amount_total,
            currency: session.currency,
        },
        set: {
            email: getUserEmail(session),
            is_premium: true,
            premium_source: "stripe",
            premium_plan: plan,
            last_payment_at: paidAt,
            stripe_customer_id: getStripeId(session.customer),
        },
        setOnce: {
            first_payment_at: paidAt,
            first_paid_plan: plan,
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

export async function finalizePaidCheckoutSession({
    session,
    stripe,
    supabaseAdmin,
    supabaseAuthClient,
    source,
}: FinalizeCheckoutOptions): Promise<FinalizeCheckoutResult> {
    const userId = session.client_reference_id || session.metadata?.user_id || null;
    const checkoutMode = getCheckoutMode(session);
    const isGuest = checkoutMode === "guest";
    const email = getUserEmail(session);
    const plan = normalizePlan(session.metadata?.plan_type);

    await ensureProcessedCheckoutSession(supabaseAdmin, session, userId);

    if (!userId) {
        console.error(`[checkout-finalization] Successful session ${session.id} has no user_id`);
        return { userId, checkoutMode, isGuest, email, plan, isPremium: false };
    }

    if (session.mode === "payment") {
        const currentPeriodEnd = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000);
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);

        await upsertSubscription({
            supabaseAdmin,
            userId,
            userEmail: email,
            subscriptionId: `session_${session.id}`,
            customerId: getStripeId(session.customer),
            status: "active",
            plan,
            currentPeriodEnd,
        });
    } else if (session.mode === "subscription" && session.subscription) {
        const subscription = typeof session.subscription === "string"
            ? await stripe.subscriptions.retrieve(session.subscription)
            : session.subscription;
        const effectiveStatus = subscription.cancel_at_period_end && subscription.status === "active"
            ? "canceled"
            : subscription.status;

        await upsertSubscription({
            supabaseAdmin,
            userId,
            userEmail: email,
            subscriptionId: subscription.id,
            customerId: getStripeId(subscription.customer),
            status: effectiveStatus,
            plan: session.metadata?.plan_type || subscription.metadata?.plan_type || "monthly",
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        });
    }

    const shouldCapturePostHog = await claimSideEffect(supabaseAdmin, session.id, "posthog");
    if (shouldCapturePostHog) {
        await capturePaymentSucceeded(session, userId, source);
    }

    await activateTikTokLernplan(
        supabaseAdmin,
        session.metadata?.tiktok_lernplan_id,
        userId,
        shouldCapturePostHog,
    );

    if (isGuest && email) {
        const shouldSendEmail = await claimSideEffect(supabaseAdmin, session.id, "guest_email");
        if (shouldSendEmail) {
            await sendGuestRegistrationEmail(supabaseAuthClient, email);
        }
    }

    return { userId, checkoutMode, isGuest, email, plan, isPremium: true };
}
