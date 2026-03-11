import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2024-06-20",
});

const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // CORS Preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
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

        if (!user) {
            throw new Error("Nicht authentifiziert");
        }

        // 2. Get Customer ID from Database (Service Role needed to read other people's subs if RLS blocked? 
        // Actually authenticated user can read their own sub via RLS usually. Let's use service role to be safe/fast.)
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('provider_customer_id')
            .eq('user_id', user.id)
            .single();

        if (subError || !subscription || !subscription.provider_customer_id) {
            throw new Error("Kein verknüpfter Stripe-Account gefunden.");
        }

        // 3. Get or Create Portal Configuration (Auto-Enable Cancellation)
        let configurationId: string | undefined;

        try {
            // Find existing config tagged for our app
            const configs = await stripe.billingPortal.configurations.list({
                limit: 5,
                is_active: true,
            });

            const existingConfig = configs.data.find((c: any) => c.metadata?.app === '34a-master');

            if (existingConfig) {
                configurationId = existingConfig.id;
                console.log("Using existing portal config:", configurationId);
            } else {
                // Create new config with cancellation enabled
                console.log("Creating new portal config...");
                const newConfig = await stripe.billingPortal.configurations.create({
                    business_profile: {
                        headline: 'Dein Abo verwalten',
                    },
                    features: {
                        subscription_cancel: {
                            enabled: true,
                            mode: 'at_period_end', // Cancel at end of period is standard saas behavior
                            cancellation_reason: {
                                enabled: true,
                                options: ['too_expensive', 'missing_features', 'switched_service', 'other'],
                            },
                        },
                        invoice_history: { enabled: true },
                        payment_method_update: { enabled: true },
                    },
                    metadata: {
                        app: '34a-master'
                    }
                });
                configurationId = newConfig.id;
                console.log("Created new portal config:", configurationId);
            }
        } catch (configError) {
            console.error("Error managing portal config, falling back to default:", configError);
        }

        // 4. Create Portal Session
        const sessionParams: any = {
            customer: subscription.provider_customer_id,
            return_url: `${req.headers.get("origin")}/#/profile?portal=return`,
        };

        if (configurationId) {
            sessionParams.configuration = configurationId;
        }

        const session = await stripe.billingPortal.sessions.create(sessionParams);


        return new Response(
            JSON.stringify({ url: session.url }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );

    } catch (error: any) {
        console.error(error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});
