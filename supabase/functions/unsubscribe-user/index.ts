import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const email = url.searchParams.get("email");

    if (!email) {
      return new Response(
        "<html><body><h3>Fehler: Keine E-Mail-Adresse angegeben.</h3></body></html>",
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } 
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find user by email in auth.users
    // Note: listUsers is paginated, but for our database scale (347 users) it works in one go.
    // To be safe, we list users and find a match.
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000
    });
    
    if (listError) throw listError;

    const user = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return new Response(
        `<html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Abmeldung fehlgeschlagen</title>
            <style>
              body { font-family: -apple-system, sans-serif; background-color: #f4f5f7; padding: 40px 20px; text-align: center; color: #374151; }
              .card { max-width: 450px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
              h3 { color: #dc2626; margin-top: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h3>Abmeldung nicht möglich</h3>
              <p>Die E-Mail-Adresse <strong>${email}</strong> wurde in unserem System nicht gefunden.</p>
            </div>
          </body>
        </html>`,
        { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } 
        }
      );
    }

    // Update user_profiles to set unsubscribed_from_marketing = true
    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ unsubscribed_from_marketing: true })
      .eq("id", user.id);

    if (updateError) throw updateError;

    // Return a beautiful confirmation HTML page
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Erfolgreich abgemeldet</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #f4f5f7;
              margin: 0;
              padding: 40px 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 80dvh;
              color: #374151;
            }
            .card {
              max-width: 480px;
              width: 100%;
              background-color: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 16px;
              padding: 40px 30px;
              text-align: center;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            }
            .icon-wrapper {
              width: 56px;
              height: 56px;
              border-radius: 50%;
              background-color: #d1fae5;
              color: #059669;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 24px;
            }
            h2 {
              color: #111827;
              font-size: 22px;
              margin-top: 0;
              margin-bottom: 12px;
              font-weight: 800;
              letter-spacing: -0.5px;
            }
            p {
              font-size: 15px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 24px;
            }
            .back-button {
              display: inline-block;
              background-color: #2563eb;
              color: #ffffff !important;
              font-weight: 700;
              text-decoration: none;
              padding: 12px 28px;
              border-radius: 10px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-wrapper">✓</div>
            <h2>Erfolgreich abgemeldet</h2>
            <p>Du hast dich erfolgreich von unserem Newsletter und Werbe-E-Mails abgemeldet.<br>Für die E-Mail-Adresse <strong>${email}</strong> wird in Zukunft keine Werbung mehr gesendet.</p>
            <a href="https://app.34a-master.de" class="back-button">Zurück zur App</a>
          </div>
        </body>
      </html>`,
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } 
      }
    );

  } catch (error) {
    console.error("Error unsubscribing user:", error);
    return new Response(
      `<html><body><h3>Interner Fehler bei der Abmeldung: ${error.message}</h3></body></html>`,
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } 
      }
    );
  }
});
