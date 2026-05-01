import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { capturePostHogEvent } from "../_shared/posthog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedEvents = new Set([
  "user_signed_up_server",
  "user_logged_in_server",
  "tiktok_funnel_viewed",
  "tiktok_funnel_started",
  "tiktok_language_toggled",
  "tiktok_funnel_cta_clicked",
  "tiktok_questions_loading_started",
  "tiktok_questions_loading_completed",
  "tiktok_questions_loading_failed",
  "tiktok_test_started",
  "tiktok_question_viewed",
  "tiktok_answer_selected",
  "tiktok_answer_changed",
  "tiktok_question_next_clicked",
  "tiktok_question_timeout",
  "tiktok_test_completed",
  "tiktok_analysis_started",
  "tiktok_analysis_step_viewed",
  "tiktok_analysis_completed",
  "tiktok_result_viewed",
  "tiktok_weak_topics_shown",
  "tiktok_plan_preview_viewed",
  "tiktok_plan_unlock_clicked",
  "tiktok_result_register_clicked",
  "tiktok_basis_continue_clicked",
  "tiktok_paywall_opened",
  "tiktok_paywall_terms_toggled",
  "tiktok_paywall_checkout_clicked",
  "tiktok_guest_email_started",
  "tiktok_guest_email_submitted",
  "tiktok_guest_email_failed",
  "tiktok_existing_account_login_prompted",
  "tiktok_checkout_session_created",
  "tiktok_checkout_embedded_loaded",
  "tiktok_checkout_completed_client",
  "tiktok_checkout_poll_started",
  "tiktok_checkout_poll_success",
  "tiktok_checkout_poll_failed",
]);

function isTikTokEvent(event: string): boolean {
  return event.startsWith("tiktok_");
}

function sanitizeProperties(properties: unknown): Record<string, unknown> {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }

  const blockedKeys = new Set(["password", "token", "access_token", "refresh_token"]);
  return Object.fromEntries(
    Object.entries(properties as Record<string, unknown>)
      .filter(([key]) => !blockedKeys.has(key.toLowerCase()))
      .map(([key, value]) => {
        if (typeof value === "string" && value.length > 500) {
          return [key, value.slice(0, 500)];
        }
        return [key, value];
      }),
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { event, properties } = await req.json();
    if (!allowedEvents.has(event)) {
      return new Response(JSON.stringify({ error: "Event not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanProperties = sanitizeProperties(properties);
    const authHeader = req.headers.get("Authorization");
    let user = null;

    if (authHeader) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: { headers: { Authorization: authHeader } },
          auth: { autoRefreshToken: false, persistSession: false },
        },
      );

      const { data, error: authError } = await supabaseClient.auth.getUser();
      if (!authError && data.user) {
        user = data.user;
      }
    }

    if (!user && !isTikTokEvent(event)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user && isTikTokEvent(event) && cleanProperties.funnel !== "tiktok_pruefungscheck") {
      return new Response(JSON.stringify({ error: "Event not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = user?.app_metadata?.provider || cleanProperties.method || "anonymous";
    const distinctId = user?.id || String(cleanProperties.session_funnel_id || cleanProperties.anonymous_id || "server");
    const setProperties = user
      ? {
        email: user.email,
        created_at: user.created_at,
        auth_provider: provider,
        registration_source: cleanProperties.source || null,
      }
      : undefined;

    await capturePostHogEvent(event, {
      distinctId,
      properties: {
        ...cleanProperties,
        email: user?.email || cleanProperties.email,
        user_id: user?.id || cleanProperties.user_id,
        created_at: user?.created_at,
        auth_provider: provider,
        anonymous_funnel: !user,
      },
      set: setProperties,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[track-server-event] Error:", error);
    return new Response(JSON.stringify({ error: "Tracking failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
