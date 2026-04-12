import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Action = "dry_run" | "apply" | "status";

type Candidate = {
  user_id: string;
  user_email: string | null;
  answered_questions: number;
  active_days_7: number;
  last_activity_at: string;
};

const SOURCE = "paywall_transition_2026_04";
const DEFAULT_GRANT_DAYS = 7;
const DEFAULT_MIN_QUESTIONS = 10;
const DEFAULT_MIN_ACTIVE_DAYS = 5;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const transitionSecret = Deno.env.get("TRANSITION_ACCESS_SECRET") ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-transition-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireSecret(req: Request) {
  const provided = req.headers.get("x-transition-secret") || "";
  if (!transitionSecret || provided !== transitionSecret) {
    throw new Error("Unauthorized transition access request");
  }
}

function requireCutoff(body: Record<string, unknown>) {
  const cutoff = String(body.cutoffAt || Deno.env.get("TRANSITION_CUTOFF_AT") || "").trim();
  if (!cutoff) {
    throw new Error("Missing TRANSITION_CUTOFF_AT or request body cutoffAt");
  }

  const parsed = new Date(cutoff);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid cutoff timestamp: ${cutoff}`);
  }

  return parsed.toISOString();
}

async function getCandidates(body: Record<string, unknown>): Promise<Candidate[]> {
  const cutoffAt = requireCutoff(body);
  const minQuestions = Number(body.minQuestions || DEFAULT_MIN_QUESTIONS);
  const minActiveDays = Number(body.minActiveDays || DEFAULT_MIN_ACTIVE_DAYS);

  const { data, error } = await supabaseAdmin.rpc("get_paywall_transition_candidates", {
    p_cutoff_at: cutoffAt,
    p_source: SOURCE,
    p_min_questions: minQuestions,
    p_min_active_days: minActiveDays,
  });

  if (error) throw error;
  return (data || []) as Candidate[];
}

async function countGrants() {
  const nowIso = new Date().toISOString();

  const [total, active, expired, revoked] = await Promise.all([
    supabaseAdmin
      .from("access_grants")
      .select("id", { count: "exact", head: true })
      .eq("source", SOURCE),
    supabaseAdmin
      .from("access_grants")
      .select("id", { count: "exact", head: true })
      .eq("source", SOURCE)
      .eq("status", "active")
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso),
    supabaseAdmin
      .from("access_grants")
      .select("id", { count: "exact", head: true })
      .eq("source", SOURCE)
      .eq("status", "active")
      .lte("ends_at", nowIso),
    supabaseAdmin
      .from("access_grants")
      .select("id", { count: "exact", head: true })
      .eq("source", SOURCE)
      .eq("status", "revoked"),
  ]);

  for (const result of [total, active, expired, revoked]) {
    if (result.error) throw result.error;
  }

  return {
    total: total.count || 0,
    active: active.count || 0,
    expired: expired.count || 0,
    revoked: revoked.count || 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    requireSecret(req);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "dry_run") as Action;

    if (!["dry_run", "apply", "status"].includes(action)) {
      return json({ ok: false, error: `Unsupported action: ${action}` }, 400);
    }

    const candidates = await getCandidates(body);

    if (action === "dry_run") {
      return json({
        ok: true,
        action,
        source: SOURCE,
        eligibleCount: candidates.length,
        candidates,
      });
    }

    if (action === "status") {
      const grants = await countGrants();
      return json({
        ok: true,
        action,
        source: SOURCE,
        eligibleCount: candidates.length,
        grants,
      });
    }

    const grantDays = Number(body.grantDays || DEFAULT_GRANT_DAYS);
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + grantDays * 24 * 60 * 60 * 1000);

    const rows = candidates.map((candidate) => ({
      user_id: candidate.user_id,
      type: "premium_transition",
      source: SOURCE,
      status: "active",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      metadata: {
        user_email: candidate.user_email,
        answered_questions: Number(candidate.answered_questions),
        active_days_7: Number(candidate.active_days_7),
        last_activity_at: candidate.last_activity_at,
      },
    }));

    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("access_grants")
        .upsert(rows, {
          onConflict: "user_id,source",
          ignoreDuplicates: true,
        });

      if (error) throw error;
    }

    const grants = await countGrants();
    return json({
      ok: true,
      action,
      source: SOURCE,
      eligibleCount: candidates.length,
      attemptedInsertCount: rows.length,
      grantDays,
      grants,
    });
  } catch (error) {
    console.error("[transition-access] Error:", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown transition access error",
    }, 500);
  }
});
