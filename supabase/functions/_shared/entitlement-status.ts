export type PremiumEntitlementSource = "stripe" | "transition" | null;

export interface PremiumEntitlementStatus {
    isPremium: boolean;
    source: PremiumEntitlementSource;
    plan: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    subscription: Record<string, unknown> | null;
    transitionGrant: Record<string, unknown> | null;
    diagnostics: {
        evaluatedAt: string;
        reason: string;
        subscriptionCount: number;
        activeSubscriptionCount: number;
        transitionGrantCount: number;
    };
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const NON_PREMIUM_STATUSES = new Set(["free", "refunded", "incomplete", "incomplete_expired", "unpaid"]);

export function subscriptionGrantsPremium(sub: any, now = new Date()): boolean {
    if (!sub) return false;
    const status = String(sub.status ?? "");
    if (NON_PREMIUM_STATUSES.has(status)) return false;
    if (ACTIVE_STATUSES.has(status)) return true;
    if (status === "canceled" && sub.current_period_end) {
        return new Date(sub.current_period_end).getTime() > now.getTime();
    }
    return false;
}

export function pickPremiumSubscription(subscriptions: any[] = [], now = new Date()): any | null {
    return subscriptions.find((sub) => subscriptionGrantsPremium(sub, now)) ?? null;
}

export function grantIsActive(grant: any, now = new Date()): boolean {
    if (!grant || grant.status !== "active") return false;
    const startsAt = grant.starts_at ? new Date(grant.starts_at).getTime() : Number.NEGATIVE_INFINITY;
    const endsAt = grant.ends_at ? new Date(grant.ends_at).getTime() : Number.POSITIVE_INFINITY;
    const nowTime = now.getTime();
    return startsAt <= nowTime && endsAt > nowTime;
}

function countActiveSubscriptions(subscriptions: any[] = [], now = new Date()): number {
    return subscriptions.filter((sub) => subscriptionGrantsPremium(sub, now)).length;
}

export async function getPremiumEntitlementStatus(
    supabaseAdmin: any,
    userId: string,
    now = new Date(),
): Promise<PremiumEntitlementStatus> {
    const evaluatedAt = now.toISOString();

    const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
        .from("subscriptions")
        .select("id,user_id,user_email,status,plan,provider,provider_customer_id,provider_subscription_id,current_period_start,current_period_end,created_at,updated_at")
        .eq("user_id", userId)
        .order("current_period_end", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(10);

    if (subscriptionError) {
        throw new Error(`Premium-Status konnte nicht geladen werden: ${subscriptionError.message}`);
    }

    const subscriptionRows = subscriptions ?? [];
    const premiumSubscription = pickPremiumSubscription(subscriptionRows, now);

    if (premiumSubscription) {
        return {
            isPremium: true,
            source: "stripe",
            plan: premiumSubscription.plan ?? null,
            periodStart: premiumSubscription.current_period_start ?? premiumSubscription.created_at ?? null,
            periodEnd: premiumSubscription.current_period_end ?? null,
            subscription: premiumSubscription,
            transitionGrant: null,
            diagnostics: {
                evaluatedAt,
                reason: "active_subscription",
                subscriptionCount: subscriptionRows.length,
                activeSubscriptionCount: countActiveSubscriptions(subscriptionRows, now),
                transitionGrantCount: 0,
            },
        };
    }

    const { data: grants, error: grantError } = await supabaseAdmin
        .from("access_grants")
        .select("id,user_id,type,source,status,starts_at,ends_at,first_seen_at,last_notice_at,last_notice_stage,created_at,metadata")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);

    if (grantError) {
        throw new Error(`Zugriffs-Grant konnte nicht geladen werden: ${grantError.message}`);
    }

    const grantRows = grants ?? [];
    const activeGrant = grantRows.find((grant) => grantIsActive(grant, now)) ?? null;

    if (activeGrant) {
        return {
            isPremium: true,
            source: "transition",
            plan: "transition",
            periodStart: activeGrant.starts_at ?? activeGrant.created_at ?? null,
            periodEnd: activeGrant.ends_at ?? null,
            subscription: null,
            transitionGrant: activeGrant,
            diagnostics: {
                evaluatedAt,
                reason: "active_transition_grant",
                subscriptionCount: subscriptionRows.length,
                activeSubscriptionCount: 0,
                transitionGrantCount: grantRows.length,
            },
        };
    }

    return {
        isPremium: false,
        source: null,
        plan: null,
        periodStart: null,
        periodEnd: null,
        subscription: null,
        transitionGrant: null,
        diagnostics: {
            evaluatedAt,
            reason: subscriptionRows.length > 0 || grantRows.length > 0 ? "no_active_entitlement" : "no_entitlement_rows",
            subscriptionCount: subscriptionRows.length,
            activeSubscriptionCount: 0,
            transitionGrantCount: grantRows.length,
        },
    };
}
