# 34a Master Webapp

Der aktive Frontend-Code liegt in `src/`. (`app-src/` ist ein ungenutztes Legacy-Duplikat.)

## Orientierung

- **KI-Agenten / Onboarding:** [AGENTS.md](AGENTS.md) und [docs/agents/](docs/agents/)
- Webapp-Doku: [../docs/README.md](../docs/README.md)
- Systemarchitektur: [../docs/SYSTEMARCHITEKTUR.md](../docs/SYSTEMARCHITEKTUR.md)
- Lokale Entwicklung: [../docs/LOKAL_ENTWICKLUNG.md](../docs/LOKAL_ENTWICKLUNG.md)

## Tech-Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Backend: Supabase
- Payments: Stripe
- Monitoring: Sentry und PostHog

## Wichtige Ordner in diesem App-Pfad

```text
src/                          Aktueller Frontend-Code
public/                       Statische Assets
supabase/functions/           Edge Functions
supabase/migrations/          Aktive Datenbank-Migrationen
scripts/                      Betriebs- und Pipeline-Skripte
```

## Schnellstart

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install
npm run dev
```

Die App erwartet lokal Node.js 22 und npm 10. Das ist zusätzlich über `.nvmrc`, `engines` und `volta` im Projekt hinterlegt.

## Wichtige Befehle

- `npm run dev` startet die App lokal
- `npm run build` baut das Produktions-Bundle
- `npm run preview` prüft das Build lokal
- `npm run pilot:explanations` startet die lokale Erklärungs-Pipeline
- `npm run pilot:explanations:edge` startet die Edge-Variante

## Hinweis

Alte oder ersetzte Dokumente liegen nicht mehr hier im Mittelpunkt, sondern im sichtbaren Archiv unter `../docs/archive/`.

---

## Aktueller Fokus (Q3 2026): Conversion & Monetarisierung

> Steuerungs-Doc: [`../FOKUS-CONVERSION-30-60-TAGE.md`](../FOKUS-CONVERSION-30-60-TAGE.md) ·
> PostHog-Dashboard: [Conversion & Monetarisierung](https://eu.posthog.com/project/113213/dashboard/763482)

**Lage (PostHog/GSC, Juni 2026):** Traffic explodiert (~350 Besucher/Tag, 8× seit April, gratis aus
SEO), aber nur **0,2–0,5 % der Besucher kaufen**. Der Engpass ist die Webapp-Monetarisierung, nicht
der Traffic. Funnel: nur **34 % der Quiz-Nutzer sehen die Paywall**, davon ~26 % starten Checkout.

**Fokus dieses Projekts (nicht: neue Features):**

1. **Paywall-Trigger reparieren** — jeder engagierte (Quiz-)Nutzer muss zuverlässig ein Angebot
   sehen. Trigger-Logik + Free-Limit prüfen. Ziel: Quiz→Paywall von 34 % → ≥ 60 %.
2. **Funnel-Tracking säubern** — `paywall_shown` konsistent feuern; Client-`identify` vor
   Server-`payment_succeeded_server`, damit Personen-Attribution im Funnel stimmt.
3. **Checkout-Abbruch senken** — Gast-Checkout-Friktion, Zahlarten, Preis-Sticker-Shock prüfen
   (heute Checkout→Zahlung stark abfallend).
4. **Offer/Preis-Test** — Bestehens-/Garantie-Framing, Bundle (schriftlich + KI-Mündlich),
   39 € vs. höher / Tiering. Zahlungsbereitschaft **messen**, nicht annehmen.
5. **Paywall-Messaging** — KI-Mündlich-Simulator + Lernplan als Bezahlgrund (der Markt verschenkt
   „viele Fragen" gratis — das ist kein Bezahlgrund).

**Bewusst geparkt:** neue Produktfeatures, B2B, Social — bis Conversion ≥ 1 % steht.

**Relevante Code-Stellen:** `src/contexts/SubscriptionContext.tsx` (Gating/`isPremium`),
Paywall-Dialoge in `App.tsx` + `components/`, `services/serverAnalytics.ts` (Event-Tracking),
Edge Functions `create-checkout-session` / `create-guest-checkout` / `stripe-webhook`.
