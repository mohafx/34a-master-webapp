import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPremiumEntitlementStatus } from "../_shared/entitlement-status.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const authorization = req.headers.get("Authorization");
        if (!authorization) {
            return jsonResponse({ error: "unauthorized" }, 401);
        }

        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authorization } },
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: { user }, error: userError } = await authClient.auth.getUser();
        if (userError || !user) {
            return jsonResponse({ error: "unauthorized" }, 401);
        }

        const entitlement = await getPremiumEntitlementStatus(supabaseAdmin, user.id);
        return jsonResponse({ entitlement });
    } catch (error: any) {
        console.error("[entitlement-status] Error:", error);
        return jsonResponse({ error: error?.message || "unknown" }, 400);
    }
});
