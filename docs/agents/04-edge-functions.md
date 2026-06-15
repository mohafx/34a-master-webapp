---
title: Supabase Edge Functions
scope: Katalog, Zweck, Secrets, Deploy
last_verified: 2026-06-15
---

# Supabase Edge Functions

Deno-Functions unter `supabase/functions/`. Jede hat eine `index.ts` mit `serve(...)`. Gemeinsamer
Code liegt in `supabase/functions/_shared/`.

## Katalog

| Function | Zweck | Wichtige Secrets |
|----------|-------|------------------|
| `create-checkout-session` | Stripe-Checkout für eingeloggte Nutzer starten | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*` |
| `create-guest-checkout` | Checkout für Gäste (ohne Account) | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*` |
| `create-portal-session` | Stripe Customer Portal (Verwaltung/Kündigung) | `STRIPE_SECRET_KEY` |
| `verify-checkout` | Checkout nach Rückkehr verifizieren & finalisieren (`_shared/checkout-finalization.ts`) | `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `stripe-webhook` | Stripe-Webhook-Events verarbeiten, Zugriff finalisieren (`_shared/checkout-finalization.ts`) | `STRIPE_SECRET_KEY`, Webhook-Secret, `SUPABASE_SERVICE_ROLE_KEY` |
| `sync-subscription` | Subscription-Status mit Stripe abgleichen | `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `confirm-user` | Serverseitige Nutzer-Bestätigung | `SUPABASE_SERVICE_ROLE_KEY` |
| `transition-access` | Paywall-Zugriffs-Migration (Grants) | `SUPABASE_SERVICE_ROLE_KEY` |
| `track-server-event` | Serverseitige PostHog-Events (z. B. `user_signed_up_server`) | `ALLOWED_ORIGIN`, PostHog-Keys |
| `ai-proxy` | Proxy zu Google AI (Schutz des API-Keys) | `GOOGLE_AI_API_KEY` |
| `question-explanation-pipeline` | Erklärungen zu Fragen generieren | `GOOGLE_AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `written-exam-regeneration-pipeline` | Schriftliche-Prüfung-Fragen regenerieren | `GOOGLE_AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `_shared/` | Geteilter Code: `checkout-finalization.ts`, `posthog.ts` | — |

## Konventionen

- Imports via URL (Deno): `https://deno.land/std@.../http/server.ts`, `https://esm.sh/stripe@14.21.0`,
  `https://esm.sh/@supabase/supabase-js@2.45.0`.
- Secrets über `Deno.env.get("…")` — **nie** `VITE_`-Variablen verwenden (die sind Frontend).
- Functions mit Service-Role-Key umgehen RLS — entsprechend vorsichtig.

## Deploy / Lokal

- Deploy via Supabase CLI (`supabase functions deploy <name>`) oder Supabase-MCP
  (`deploy_edge_function`). Config: `supabase/config.toml`.
- Function-Secrets werden im Supabase-Dashboard bzw. via CLI gesetzt, nicht aus `.env` gelesen.

## Verwandt

- Bezahl-Flows end-to-end: [05-payments-stripe.md](05-payments-stripe.md).
- Pipeline-Runner (rufen diese Functions / lokale Varianten auf): [06-skripte-und-pipelines.md](06-skripte-und-pipelines.md).
