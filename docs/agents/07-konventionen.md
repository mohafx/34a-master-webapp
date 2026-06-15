---
title: Konventionen
scope: Code-Stil, Muster, Naming, Sprache, Commits
last_verified: 2026-06-15
---

# Konventionen

## Sprache

- **Code, Bezeichner, Kommentare:** überwiegend Englisch.
- **Domänenbegriffe bleiben deutsch:** `34a`, `Lernplan`, `Modul`, `Sachkunde`, `Widerruf`, etc.
- **Nutzer-Texte:** zweisprachig DE/AR (`AppLanguage`, vgl. Felder wie `{ de, ar }` in Dialogen).
- **Dokumentation (`AGENTS.md`, `docs/agents/`):** Deutsch.
- **Commit-Messages:** Deutsch, Conventional-Commit-Präfix, z. B.
  `fix: Behebe alle 4 gemeldeten Auth-Probleme`, `feat: update price to 39€`.

## Code-Muster

- **Komponenten:** Funktionskomponenten + Hooks. Seiten in `src/components/pages/`,
  Wiederverwendbares in `src/components/{ui,layout,...}/`.
- **State:** globaler `AppContext` in `src/App.tsx`; Querschnitt über Contexts in `src/contexts/`
  (`AuthContext`, `SubscriptionContext`, `DataCacheContext`, `ToastContext`, `PostHogProvider`).
- **Datenzugriff:** ausschließlich über `src/services/` (v. a. `database.ts`), nicht direkt aus
  Komponenten. Services kapseln `supabase.from(...)`.
- **Supabase-Client:** immer das Singleton aus `src/lib/supabase.ts` importieren, keinen zweiten
  Client erzeugen.
- **Fehler/Monitoring:** defensiv loggen (Sentry), App nicht crashen lassen (vgl. `useApp()`-Guard
  in `src/App.tsx`).
- **Sanitizing:** HTML/Markdown über `dompurify` + `react-markdown`/`remark-gfm` rendern.

## Styling

- Tailwind CSS 3 (`tailwind.config.js`), `@tailwindcss/typography`. Utility-First, keine separaten
  CSS-Module außer `src/index.css`.

## TypeScript

- `tsconfig.json`, `typescript ~5.8`. Domänen-Typen zentral in `src/types.ts` / `src/types/`
  pflegen statt lokal duplizieren.

## Dateien

- Keine `*" 2".tsx`-Duplikate neu anlegen; bestehende sind Altlasten (siehe
  [09-stolperfallen.md](09-stolperfallen.md)).
