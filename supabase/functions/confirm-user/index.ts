import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // SECURITY FIX: Only allow Service Role key (admin access only)
        const authHeader = req.headers.get("Authorization");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

        // Check if the Authorization header contains the service role key
        if (!authHeader || !authHeader.includes(serviceRoleKey)) {
            return new Response(
                JSON.stringify({ error: "Forbidden - Admin access only" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Get the email from query params or body
        const url = new URL(req.url);
        let email = url.searchParams.get("email");

        if (!email) {
            const body = await req.json().catch(() => ({}));
            email = body.email;
        }

        if (!email) {
            // List recent unconfirmed users if no email provided
            const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({
                perPage: 10,
            });

            if (listError) throw listError;

            const unconfirmed = users.users.filter(u => !u.email_confirmed_at);

            return new Response(
                JSON.stringify({
                    message: "Unconfirmed users found",
                    users: unconfirmed.map(u => ({ id: u.id, email: u.email, created: u.created_at }))
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Find user by email
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const user = users.users.find(u => u.email === email);
        if (!user) {
            return new Response(
                JSON.stringify({ error: "User not found", email }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Update user to confirm email
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            email_confirm: true
        });

        if (error) throw error;

        return new Response(
            JSON.stringify({
                message: "User confirmed successfully",
                user: { id: data.user.id, email: data.user.email, confirmed: data.user.email_confirmed_at }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
