---
title: Architektur & Code-Layout
scope: Big Picture, src/-Struktur, Datenfluss
last_verified: 2026-06-15
---

# Architektur & Code-Layout

## Big Picture

```
Browser (React 19 SPA, HashRouter)
  │
  ├── Supabase JS Client (src/lib/supabase.ts)
  │     ├── Auth (E-Mail/Passwort, Recovery)  → siehe 02-routing-und-auth.md
  │     ├── Postgres (Tabellen + RLS)          → siehe 03-datenmodell.md
  │     └── Storage (Lektionsbilder)
  │
  ├── Supabase Edge Functions (Deno)           → siehe 04-edge-functions.md
  │     ├── Stripe-Checkout/Webhook/Portal      → siehe 05-payments-stripe.md
  │     ├── ai-proxy (Google AI)
  │     └── Inhalts-Pipelines (Erklärungen, schriftl. Prüfung)
  │
  ├── Stripe (Checkout, Customer Portal)
  ├── Sentry (Fehler-Monitoring)
  └── PostHog (Produkt-Analytics; auch serverseitig via track-server-event)
```

Die App ist eine reine Client-SPA ohne eigenen Node-Server. Sämtliche „Backend"-Logik läuft in
Supabase Edge Functions oder direkt gegen Supabase (mit RLS abgesichert).

## `src/`-Layout (aktiver Code)

| Pfad | Inhalt |
|------|--------|
| `src/App.tsx` | Wurzelkomponente: globaler `AppContext`, `HashRouter` + alle Routen, Auth-/Onboarding-/Paywall-Dialoge. Rendert **oberhalb** des Routers. |
| `src/index.tsx` | Einstiegspunkt (ReactDOM, Provider-Wrapping). |
| `src/types.ts` / `src/types/` | Zentrale Domänen-Typen (`Question`, `Flashcard`, `Module`, `Lesson`, `WrittenExamSession`, …). |
| `src/lib/supabase.ts` | Singleton Supabase-Client (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`). |
| `src/contexts/` | React-Contexts: `AuthContext`, `SubscriptionContext`, `DataCacheContext`, `ToastContext`, `PostHogProvider`. |
| `src/services/` | Datenzugriff & Domänenlogik: `database.ts`, `writtenExam.ts`, `lernplanGenerator.ts`, `lessonFlow.ts`, `gemini.ts`, `serverAnalytics.ts`, `mockData.ts`. |
| `src/components/pages/` | Seiten-Komponenten (≈30, 1:1 zu Routen), inkl. `admin/`. |
| `src/components/{auth,dashboard,layout,onboarding,ui,skeletons}/` | Wiederverwendbare UI-Bausteine. |
| `src/devpanel/`, `src/scripts/`, `src/utils/` | Dev-Tools, In-App-Hilfsskripte, Utilities. |

## Datenfluss (typisch)

1. Komponente in `src/components/pages/` ruft eine Funktion aus `src/services/` auf.
2. Service nutzt den Supabase-Client aus `src/lib/supabase.ts` (`supabase.from('…')`).
3. Ergebnisse werden teils über `DataCacheContext` gecacht.
4. Premium-Gating läuft über `SubscriptionContext` / `isPremium` (siehe 05-payments-stripe.md).

## Verwandt

- Gesamtsystem (menschorientiert): `../../../docs/SYSTEMARCHITEKTUR.md`
- Datenmodell-Details: [03-datenmodell.md](03-datenmodell.md)
