---
title: Payments & Premium (Stripe)
scope: Checkout, Guest, Portal, Webhook, Subscription-Sync, Gating
last_verified: 2026-06-15
---

# Payments & Premium (Stripe)

Premium-Zugang wird über Stripe verkauft. Frontend nutzt `@stripe/stripe-js` /
`@stripe/react-stripe-js`; die eigentliche Logik liegt in Edge Functions
([04-edge-functions.md](04-edge-functions.md)).

## Flows

### Eingeloggter Kauf
1. Frontend ruft `create-checkout-session` → Stripe-Checkout-URL.
2. Nutzer zahlt bei Stripe.
3. Rückkehr auf Route `/payment-success` (`PaymentSuccess.tsx`).
4. `verify-checkout` finalisiert (idempotent über `processed_checkout_sessions`,
   `_shared/checkout-finalization.ts`).
5. Parallel/zusätzlich bestätigt `stripe-webhook` den Kauf serverseitig.

### Gast-Kauf (ohne Account)
1. `create-guest-checkout` → Checkout.
2. Rückkehr auf `/guest-payment-success` (`GuestPaymentSuccess.tsx`).
3. Finalisierung + spätere Account-Verknüpfung (`complete-registration`-Flow).

### Verwaltung / Kündigung
- `create-portal-session` → Stripe Customer Portal.

### Status-Abgleich
- `sync-subscription` gleicht den Subscription-Status mit Stripe ab (z. B. bei App-Start /
  manueller Resynchronisierung).

## Idempotenz & Webhook

- `stripe-webhook` und `verify-checkout` teilen sich `_shared/checkout-finalization.ts`
  (`finalizePaidCheckoutSession`).
- Doppelverarbeitung wird über die Tabelle `processed_checkout_sessions` verhindert
  (Migration `20260527125326_create_processed_checkout_sessions.sql`).

## Premium-Gating im Frontend

- `src/contexts/SubscriptionContext.tsx` liefert `isPremium` / `isSubscriptionLoading`.
- `AppContext` (in `src/App.tsx`) exponiert `openPaywall(featureName?)` und `isPremium`;
  Komponenten gaten Features darüber.

## Secrets / Preise

- `STRIPE_SECRET_KEY` (Server), `VITE_STRIPE_PUBLISHABLE_KEY` (Frontend).
- Preis-IDs: `STRIPE_PRICE_MONTHLY_ID`, `STRIPE_PRICE_6MONTHS_ID` (Server).
- **Nie** Secret-Werte in Code/Docs. Preis-IDs sind umgebungsspezifisch.

## Verwandt

- Zugriffs-Migration (Bestandsnutzer): `transition-access` Function + `npm run transition:*`
  ([06-skripte-und-pipelines.md](06-skripte-und-pipelines.md)).
- Stripe→PostHog-Backfill: `scripts/backfill-stripe-posthog.mjs` (`npm run analytics:backfill-stripe:*`).
