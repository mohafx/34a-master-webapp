---
title: Payments & Premium (Stripe)
scope: Checkout, Guest, Portal, Webhook, Subscription-Sync, Gating
last_verified: 2026-06-21
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
   `_shared/checkout-finalization.ts`) und gibt den aktuellen `entitlement` zurück.
5. Parallel/zusätzlich bestätigt `stripe-webhook` den Kauf serverseitig.
6. `PaymentSuccess.tsx` pollt `refreshSubscription()` gegen `entitlement-status`, bis Premium
   sichtbar ist oder ein klarer Pending-Zustand angezeigt wird.

### Gast-Kauf (ohne Account)
1. `create-guest-checkout` → Checkout.
2. Rückkehr auf `/guest-payment-success` (`GuestPaymentSuccess.tsx`).
3. Finalisierung + spätere Account-Verknüpfung (`complete-registration`-Flow).

### Verwaltung / Kündigung
- `create-portal-session` → Stripe Customer Portal.

### Status-Abgleich
- `sync-subscription` gleicht den Subscription-Status mit Stripe ab (z. B. bei App-Start /
  manueller Resynchronisierung).
- `entitlement-status` ist die autoritative Premium-Quelle für eingeloggte Nutzer. Die Function
  liest per Service Role robuste Subscription- und Transition-Grant-Daten und liefert
  `isPremium`, `source`, `plan`, `periodStart`, `periodEnd`, `subscription`, `transitionGrant` und
  `diagnostics`.
- Das Frontend speichert nach Checkout-Rückkehr die `session_id` kurzzeitig in `localStorage`
  (`src/utils/paymentRecovery.ts`). Wenn ein eingeloggter Nutzer danach noch `isPremium=false`
  sieht, startet `SubscriptionContext` ein Self-Healing: `verify-checkout` → `sync-subscription` →
  erneuter `entitlement-status`-Fetch.

## Idempotenz & Webhook

- `stripe-webhook` und `verify-checkout` teilen sich `_shared/checkout-finalization.ts`
  (`finalizePaidCheckoutSession`).
- Doppelverarbeitung wird über die Tabelle `processed_checkout_sessions` verhindert
  (Migration `20260527125326_create_processed_checkout_sessions.sql`).
- Stripe-Webhooks selbst sind zusätzlich über `processed_stripe_events` idempotent.
- Jede erfolgreiche Checkout-Finalisierung schreibt einen Eintrag in `payment_audit_events`.
  Kritisch ist `checkout_finalized_without_premium`: Stripe/Checkout war bezahlt, aber der
  serverseitige Entitlement-Check sieht keinen Premium-Zugang.
- Fehlende User-Zuordnung nach bezahlter Session wird als `checkout_missing_user_id` mit
  `severity='critical'` auditiert.

## Refunds / Disputes

- Refunds und Disputes entziehen Premium sofort: `stripe-webhook` setzt `subscriptions.status` auf
  `refunded` und `current_period_end = now()`.
- `hasPremiumAccess()` und `entitlement-status` behandeln `refunded` immer als non-premium.
- `canceled` bleibt nur für echte Kündigungen bis zum bezahlten Periodenende gültig.

## Premium-Gating im Frontend

- `src/contexts/SubscriptionContext.tsx` liefert `isPremium` / `isSubscriptionLoading`.
- Der Context liest primär `entitlement-status`; direkter Tabellenzugriff ist nur Fallback, falls
  die Edge Function beim Rollout temporär nicht erreichbar ist.
- `PaymentSuccess.tsx` zeigt bei bezahlter, aber noch nicht sichtbarer Freischaltung nicht mehr
  pauschal „Zahlung nicht abgeschlossen”, sondern „Zahlung bestätigt” / „Zugang wird
  synchronisiert”.
- Im Profil gibt es für Free-Status den Button „Einkäufe wiederherstellen”, der
  `sync-subscription` und danach den Entitlement-Fetch ausführt.
- `AppContext` (in `src/App.tsx`) exponiert `openPaywall(featureName?)` und `isPremium`;
  Komponenten gaten Features darüber.

## Monitoring / Audit

Wichtige SQL-Prüfungen:

```sql
select event_type, severity, status, count(*)
from public.payment_audit_events
group by event_type, severity, status
order by severity desc, event_type;
```

```sql
select *
from public.payment_audit_events
where severity in ('critical', 'error')
  and status = 'open'
order by created_at desc
limit 50;
```

PostHog-Event bei serverseitigem Mismatch: `premium_entitlement_mismatch_server`.

## Secrets / Preise

- `STRIPE_SECRET_KEY` (Server), `VITE_STRIPE_PUBLISHABLE_KEY` (Frontend).
- Preis-IDs: `STRIPE_PRICE_MONTHLY_ID`, `STRIPE_PRICE_6MONTHS_ID` (Server).
- **Nie** Secret-Werte in Code/Docs. Preis-IDs sind umgebungsspezifisch.

## Verwandt

- Zugriffs-Migration (Bestandsnutzer): `transition-access` Function + `npm run transition:*`
  ([06-skripte-und-pipelines.md](06-skripte-und-pipelines.md)).
- Stripe→PostHog-Backfill: `scripts/backfill-stripe-posthog.mjs` (`npm run analytics:backfill-stripe:*`).
