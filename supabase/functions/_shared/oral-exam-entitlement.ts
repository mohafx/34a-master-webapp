import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const ORAL_EXAM_FREE_LIMIT = 1;
export const ORAL_EXAM_PREMIUM_LIMIT = 10;

export type OralExamMode = "free_test_3q" | "full_simulation";

export interface OralExamEntitlement {
    isPremium: boolean;
    mode: OralExamMode;
    used: number;
    limit: number;
    bonusTickets: number;
    remaining: number;
    windowStartsAt: string | null;
    windowEndsAt: string | null;
}

export function subscriptionGrantsPremium(sub: any): boolean {
    if (!sub) return false;
    if (sub.status === "active" || sub.status === "trialing") return true;
    if (sub.status === "canceled" && sub.current_period_end) {
        return new Date(sub.current_period_end) > new Date();
    }
    return false;
}

export function grantIsActive(grant: any): boolean {
    return !!grant && grant.status === "active" && (!grant.ends_at || new Date(grant.ends_at) > new Date());
}

export function pickPremiumSubscription(subscriptions: any[]): any | null {
    const now = new Date();
    return (subscriptions ?? []).find((sub) => {
        if (sub.status === "active" || sub.status === "trialing") return true;
        if (sub.status === "canceled" && sub.current_period_end) {
            return new Date(sub.current_period_end) > now;
        }
        return false;
    }) ?? null;
}

async function countOralExamSessions(
    supabaseAdmin: SupabaseClient,
    userId: string,
    mode: OralExamMode,
    windowStartsAt?: string | null,
    windowEndsAt?: string | null,
): Promise<number> {
    // Ein Ticket zählt nur, wenn die Session real verbunden hat (connected_at gesetzt).
    // pending/nie-verbunden (Mic verweigert, Reload vor Connect) zählen NICHT.
    let query = supabaseAdmin
        .from("oral_exam_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("mode", mode)
        .not("connected_at", "is", null);

    if (windowStartsAt) {
        query = query.gte("connected_at", windowStartsAt);
    }
    if (windowEndsAt) {
        query = query.lte("connected_at", windowEndsAt);
    }

    const { count, error } = await query;
    if (error) {
        throw new Error(`Ticketverbrauch konnte nicht geladen werden: ${error.message}`);
    }
    return count ?? 0;
}

async function getActiveBonusTickets(
    supabaseAdmin: SupabaseClient,
    userId: string,
    mode: OralExamMode,
): Promise<number> {
    const { data, error } = await supabaseAdmin
        .from("oral_exam_ticket_grants")
        .select("bonus_tickets, starts_at, ends_at")
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("status", "active");

    if (error) {
        throw new Error(`Zusätzliche Prüfungstickets konnten nicht geladen werden: ${error.message}`);
    }

    const now = new Date();
    return (data ?? []).reduce((sum, grant) => {
        const startsAt = grant.starts_at ? new Date(grant.starts_at) : null;
        const endsAt = grant.ends_at ? new Date(grant.ends_at) : null;
        if (startsAt && startsAt > now) return sum;
        if (endsAt && endsAt <= now) return sum;
        return sum + Math.max(0, Number(grant.bonus_tickets ?? 0));
    }, 0);
}

export async function getOralExamEntitlement(
    supabaseAdmin: SupabaseClient,
    userId: string,
): Promise<OralExamEntitlement> {
    const { data: subscriptions, error: subError } = await supabaseAdmin
        .from("subscriptions")
        .select("status, plan, provider, current_period_start, current_period_end, created_at")
        .eq("user_id", userId)
        .order("current_period_end", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(10);
    if (subError) {
        throw new Error(`Premium-Status konnte nicht geladen werden: ${subError.message}`);
    }

    const sub = pickPremiumSubscription(subscriptions ?? []);
    if (subscriptionGrantsPremium(sub)) {
        const windowStartsAt = sub.current_period_start ?? sub.created_at ?? null;
        const windowEndsAt = sub.current_period_end ?? null;
        const bonusTickets = await getActiveBonusTickets(supabaseAdmin, userId, "full_simulation");
        const used = await countOralExamSessions(
            supabaseAdmin,
            userId,
            "full_simulation",
            windowStartsAt,
            windowEndsAt,
        );
        const limit = ORAL_EXAM_PREMIUM_LIMIT + bonusTickets;
        return {
            isPremium: true,
            mode: "full_simulation",
            used,
            limit,
            bonusTickets,
            remaining: Math.max(limit - used, 0),
            windowStartsAt,
            windowEndsAt,
        };
    }

    const { data: grant, error: grantError } = await supabaseAdmin
        .from("access_grants")
        .select("status, starts_at, ends_at, created_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (grantError) {
        throw new Error(`Zugriffs-Grant konnte nicht geladen werden: ${grantError.message}`);
    }

    if (grantIsActive(grant)) {
        const windowStartsAt = grant.starts_at ?? null;
        const windowEndsAt = grant.ends_at ?? null;
        const bonusTickets = await getActiveBonusTickets(supabaseAdmin, userId, "full_simulation");
        const used = await countOralExamSessions(
            supabaseAdmin,
            userId,
            "full_simulation",
            windowStartsAt,
            windowEndsAt,
        );
        const limit = ORAL_EXAM_PREMIUM_LIMIT + bonusTickets;
        return {
            isPremium: true,
            mode: "full_simulation",
            used,
            limit,
            bonusTickets,
            remaining: Math.max(limit - used, 0),
            windowStartsAt,
            windowEndsAt,
        };
    }

    const bonusTickets = await getActiveBonusTickets(supabaseAdmin, userId, "free_test_3q");
    const used = await countOralExamSessions(supabaseAdmin, userId, "free_test_3q");
    const limit = ORAL_EXAM_FREE_LIMIT + bonusTickets;
    return {
        isPremium: false,
        mode: "free_test_3q",
        used,
        limit,
        bonusTickets,
        remaining: Math.max(limit - used, 0),
        windowStartsAt: null,
        windowEndsAt: null,
    };
}
