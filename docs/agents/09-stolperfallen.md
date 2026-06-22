---
title: Stolperfallen (Gotchas)
scope: Bekannte Fallen, die teure Fehler verursachen
last_verified: 2026-06-22
---

# Stolperfallen (immer überfliegen)

## 1. Aktiver Code ist immer `src/`
Das frühere Legacy-Duplikat `app-src/` (eigene `node_modules/`, `local_archive/`) wurde am
2026-06-15 aus dem Projekt entfernt (verschoben nach `../_legacy_app-src_archive/`). Sollte es je
wieder auftauchen: ignorieren, nicht editieren, nicht in Suchen einbeziehen.

## 2. Keine `*" 2".tsx`-Duplikate
Versehentliche Kopien (`Dashboard 2.tsx`, `Profile 2.tsx`, `LessonQuiz 2.tsx`) wurden entfernt; sie
waren tot (nirgends importiert). **Lege keine neuen `" 2"`-Dateien an** — immer die Variante ohne
`" 2"` (`Dashboard.tsx`, …) bearbeiten.

## 3. HashRouter ⇒ Auth-Tokens im URL-Hash
Routing läuft über `HashRouter`; dadurch stehen auch Supabase-Auth-Tokens im Hash
(`#access_token=…&type=recovery`). Login-, Reset- und Bestätigungs-Flows sind dadurch fragil.
- `src/App.tsx` rendert oberhalb des Routers ⇒ `useLocation()` dort nicht nutzbar; stattdessen
  `isAuthFlowRoute()` (liest `window.location.hash`).
- `detectSessionInUrl: true` in `src/lib/supabase.ts` zieht die Tokens aus dem Hash.
- Vor Änderungen [02-routing-und-auth.md](02-routing-und-auth.md) lesen. (Diese Flows waren bereits
  mehrfach Bug-Quelle, siehe Commit `fix: Behebe alle 4 gemeldeten Auth-Probleme`.)

## 4. Frontend- vs. Server-Secrets nicht verwechseln
- `VITE_*`-Variablen landen im **Client-Bundle** (öffentlich sichtbar) — dort nur Publishable/Anon-Keys.
- Geheime Keys (`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_AI_API_KEY`) gehören
  **nur** in Edge Functions (`Deno.env.get`). Nie ins Frontend, nie in Docs/Commits.

## 5. Payment-Finalisierung ist idempotent — nicht umgehen
`stripe-webhook` und `verify-checkout` nutzen beide `_shared/checkout-finalization.ts` und die
Tabelle `processed_checkout_sessions` gegen Doppelverarbeitung. Beim Anpassen der Bezahl-Flows die
Idempotenz erhalten (siehe [05-payments-stripe.md](05-payments-stripe.md)).

## 5b. Premium-Status nie aus einer einzelnen Subscription-Zeile ableiten
`subscriptions` ist keine verlässliche `.single()`-Quelle für Premium. Schema-Drift, alte Zeilen,
Refunds oder künftige Provider können mehrere oder widersprüchliche Zustände erzeugen. Die
autoritative Quelle ist `entitlement-status` (`_shared/entitlement-status.ts`). Frontend-Fallbacks
müssen mehrere Zeilen sortieren und `refunded`/`free` explizit ausschließen.

Nach bezahlter Checkout-Rückkehr muss der Client den Status erneut laden/pollen. Eine erfolgreiche
Stripe-Zahlung ohne frischen Frontend-State war bereits echte Fehlerursache: Nutzer zahlte, DB war
aktiv, UI blieb Free.

## 6. Migrationen nur in `supabase/migrations/`
`database/` speichert keine aktiven Migrationen mehr ([`database/README.md`](../../database/README.md)).
Neue Schemaänderungen ausschließlich als Migration in `supabase/migrations/` anlegen; vorher
`list_tables` (Supabase-MCP) lesen.

## 6b. Public-Data-API-Grants nie implizit lassen
Der Supabase-`anon`-Key ist öffentlich. Sicherheit entsteht daher ausschließlich über explizite
Grants und RLS. Neue `public`-Tabellen/Funktionen dürfen nicht automatisch für `anon` oder
`authenticated` erreichbar sein; Migration `20260622000944_lock_down_public_content_rls.sql` revoked
die Default-Privileges für Browser-Rollen. Falls eine alte Baseline-Policy nicht in den sichtbaren
Migrationen steht, muss sie explizit über `pg_policies` entfernt werden
(`20260622001323_remove_legacy_public_content_policies.sql`).

Bei neuen Inhalts- oder Pipeline-Tabellen immer im selben Migrationsfile festlegen:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- konkrete `GRANT SELECT` nur für benötigte Browser-Lesewege
- keine Browser-`INSERT`/`UPDATE`/`DELETE`-Rechte, außer es gibt eine enge RLS-Policy
- operative Tabellen standardmäßig `service_role`-only

Vorsicht bei Views: Postgres-Views können RLS umgehen. Keine Views mit Antwortschlüsseln,
Erklärungen oder internem Pipeline-Status an `anon`/`authenticated` grant-en.

Nach RLS-Lockdowns auch den Browser-Cache prüfen: `DataCacheProvider` speichert Fragen/Lernkarten im
LocalStorage. Wenn vorher vollständige Inhalte im Cache landen konnten, muss die Cache-Version erhöht
werden, sonst sehen Bestandsnutzer alte Daten bis zum Cache-Ablauf weiter.

Die kostenlose Mini-Prüfung darf nicht direkt aus `written_exam_questions` lesen, weil diese Tabelle
Premium-/Admin-gated ist. Für Gäste nutzt sie Practice-Fragen aus `questions` mit `question:`-IDs.

## 7. Kein generischer `npm test`
Es gibt nur gezielte `npm run test:*`-Befehle. Für alles andere `npx vitest`
([08-testing.md](08-testing.md)).

## 8. Veraltete Links im root `README.md`
Der root `README.md` verweist auf `../docs/`-Pfade, die teils nicht (mehr) existieren. Für
Agenten-Kontext stattdessen `AGENTS.md` und `docs/agents/` nutzen.

## 9. Modale in CSS-`transform`-Eltern → `createPortal` pflicht
`FreestyleDashboardContent` (und andere Wrapper) nutzen `transform: scale(...)`. Das erzeugt einen
neuen Stacking Context — Modal-Overlays (`position: fixed`) bleiben darin gefangen und bedecken die
Seite nicht vollständig. **Fix:** `createPortal(modalJsx, document.body)` in `Dashboard.tsx` für das
Exam-Auswahl-Modal. Bei jedem neuen Modal innerhalb eines `transform`-Elternelements dasselbe tun.

## 10. Back-Buttons: `navigate(-1)` statt hartcodierter Route
`navigate('/exam')` in Intro-Seiten führt immer zur Prüfungsauswahl, egal woher der Nutzer kam.
Alle Zurück-Buttons in `MiniExamIntro`, `ExamIntro` und `OralExamIntro` nutzen `navigate(-1)`.
Bei neuen Intro-/Interstitial-Seiten dasselbe Muster verwenden.

## 11. Sentry: Chunk-/MIME-Fehler nicht blind als Codebug behandeln
Sentry-Issues wie `Failed to fetch dynamically imported module`, `Importing a module script failed`
oder `'text/html' is not a valid JavaScript MIME type` entstehen meist nach Deployments, wenn ein
alter Browser-Tab noch auf nicht mehr vorhandene Vite-Assets zeigt. `ErrorBoundary` erkennt diese
Klasse und lädt die Seite pro Fehlersignatur genau einmal automatisch neu (`sessionStorage`-Guard);
erst danach bleibt der normale Fehlerbildschirm sichtbar. Keine aggressiven Cache-/Service-Worker-
Umbauten ohne Reproduktion.

## 12. Provider-Fehler nur minimal entschärfen
`useApp`, `useDataCache`, `useSubscription` und `useAuth` sollen echte Provider-Fehler weiterhin
sichtbar machen. Aktueller Kompromiss: `AppContext.Provider` umfasst auch frühe Rückgaben in
`AppContent` (Loading, Datenfehler, Onboarding). Keine stillen Default-Kontexte für Auth/Payment/Data
einführen, weil das echte Zustandsfehler verstecken kann.
