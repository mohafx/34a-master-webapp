---
title: Routing & Authentifizierung
scope: HashRouter, Routen, Supabase-Auth, Login/Reset-Flows
last_verified: 2026-06-20
---

# Routing & Authentifizierung

## HashRouter — die zentrale Eigenheit

Das Routing nutzt **`HashRouter`** (`react-router-dom` 7), definiert in `src/App.tsx`
(`import { HashRouter, ... }`, `<HashRouter>` ab ca. Zeile 878). Alle Routen leben hinter `#/`,
z. B. `https://app.example.com/#/dashboard`.

**Konsequenz:** Auch Supabase-**Auth-Tokens stehen im URL-Hash** (z. B. `#access_token=…&type=recovery`).
Hash- und Routing-Logik überschneiden sich daher — Änderungen an einem betreffen oft das andere.

> ⚠️ Bei jeder Änderung an Login, Passwort-Reset oder E-Mail-Bestätigung **vorsichtig** sein und
> [09-stolperfallen.md](09-stolperfallen.md) lesen. Diese Flows waren mehrfach Quelle von Bugs.

## Auth-Flow-Sonderbehandlung

`src/App.tsx` rendert den `AppContext` **oberhalb** des Routers — daher ist `useLocation()` dort
nicht verfügbar. Stattdessen wird der Hash direkt gelesen:

```ts
// src/App.tsx
const isAuthFlowRoute = (): boolean => {
  const hash = window.location.hash || '';
  return hash.startsWith('#/reset-password') || hash.includes('type=recovery');
};
```

Diese Funktion verhindert, dass z. B. Onboarding- oder „neuer Login"-Logik einen aktiven
Recovery-/Reset-Flow stört (verwendet in mehreren Guards, u. a. `isNewLogin && authUser && !isAuthFlowRoute()`).

## Supabase-Client-Auth

`src/lib/supabase.ts` konfiguriert:

```ts
auth: {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,   // liest Tokens aus dem URL-Hash
}
```

`detectSessionInUrl: true` ist genau der Mechanismus, der Tokens aus dem Hash zieht — wichtig im
Zusammenspiel mit dem HashRouter.

## Relevante Routen & Komponenten

- Auth/Flow: `/auth/callback` (`AuthCallback`), `/email-confirmation` (`EmailConfirmation`),
  `/reset-password` (`ResetPassword`), `/complete-registration` (`CompleteRegistration`).
- Payment-Rückkehr: `/payment-success`, `/guest-payment-success` (siehe 05-payments-stripe.md).
- Admin (geschützt durch `AdminGuard`): `/admin`, `/admin/written-exam[...]`.
- Prüfungs-Intros (jeweils Intro-Seite vor dem eigentlichen Modus):
  - `/exam/mini-intro` → `MiniExamIntro` (blau, Zap-Icon)
  - `/exam/intro` → `ExamIntro` (amber, GraduationCap-Icon)
  - `/oral-exam` → `OralExamIntro` (indigo, Mic-Icon) — auch Einstieg in die mündliche Prüfung
- Auth-UI-Komponenten in `src/components/auth/` (z. B. `AuthDialog`).
- Auth-State über `src/contexts/AuthContext.tsx`.

Catch-all `<Route path="*">` rendert das Dashboard.

## Verwandt

- Persönliche Memory-Notiz: „Auth: HashRouter + Supabase" (Supabase-Projekt-Ref, Regeln gegen
  kaputte Flows) — im `memory/`-Store, nicht im Repo.
- Edge Function `confirm-user` für serverseitige Bestätigung: [04-edge-functions.md](04-edge-functions.md).
