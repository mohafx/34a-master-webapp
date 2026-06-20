# AGENTS.md — Einstieg für KI-Agenten

> Primärer Einstiegspunkt für KI-Agenten (Claude Code, Cursor, Copilot u. a.).
> Lies diese Datei **zuerst**, dann gezielt die Themen-Dateien unter [`docs/agents/`](docs/agents/).
> Halte dich an die Regeln im Block **„Nicht anfassen"** — sie verhindern teure Fehler.

## Was ist das?

**34a Master Webapp** ist ein Lern- und Prüfungstrainer für die **IHK-Sachkundeprüfung nach §34a
GewO** (Bewachungsgewerbe). Nutzer lernen über Module/Lektionen, üben mit Fragen und Lernkarten
(Flashcards), absolvieren Mini- und schriftliche Prüfungen und folgen einem generierten Lernplan.
Es ist eine **React-19-SPA** mit Supabase-Backend und Stripe-Bezahlschranke (Premium).

## Quick Facts

| Thema            | Wert                                                                 |
|------------------|----------------------------------------------------------------------|
| Frontend         | React 19, TypeScript, Vite 6, Tailwind CSS 3                         |
| Routing          | `react-router-dom` 7 mit **HashRouter** (Routen leben im URL-Hash)  |
| Backend          | Supabase (Auth, Postgres, Edge Functions, Storage)                  |
| Payments         | Stripe (Checkout, Customer Portal, Webhooks)                        |
| Monitoring       | Sentry (`@sentry/react`) + PostHog                                  |
| Runtime          | **Node 22 / npm 10** (`.nvmrc`, `engines`, `volta`)                 |
| **Aktiver Code** | **`src/`** (85 `.tsx`) — alles andere siehe „Nicht anfassen"        |

## ⛔ Nicht anfassen

Diese Pfade sind **kein aktiver Code**. Nicht editieren, nicht als Referenz fürs Code-Verständnis nutzen, nicht in Suchen einbeziehen:

- **`dist/`** — Build-Output (git-ignored).
- **`testsprite_tests/`** — Test-Tooling-Artefakte.
- **`node_modules/`**.
- **Keine `*" 2".tsx`-Duplikate neu anlegen.** Die alten (`Dashboard 2.tsx`, …) wurden entfernt;
  immer die Variante **ohne** `" 2"` bearbeiten.

> Das frühere Legacy-Duplikat `app-src/` wurde aus dem Projekt entfernt (verschoben nach
> `../_legacy_app-src_archive/`). Falls es wieder auftaucht: ignorieren, aktiver Code ist `src/`.

## Befehle

```bash
# Setup (Node 22 erforderlich)
npm install

# Entwicklung / Build
npm run dev          # Vite Dev-Server (--host)
npm run build        # Produktions-Bundle
npm run preview      # Build lokal prüfen

# Tests (vitest)
npm run test:oral-exam-entitlement
npm run test:oral-exam-routing
npm run test:oral-exam-scenarios
npm run test:transition-access
npm run test:question-pipeline
npm run test:written-regen-pipeline
npm run test:written-regen-integration

# Operative Pipelines (Details: scripts/README.md)
npm run pilot:explanations          # Erklärungs-Pipeline (lokal)
npm run pilot:explanations:edge     # Erklärungs-Pipeline (Edge)
npm run pilot:lesson-images         # Lektionsbilder-Pipeline
npm run pilot:written-regen         # Schriftliche-Prüfung-Regeneration
npm run transition:dry-run|apply|status   # Paywall-Zugriffs-Migration
```

## Environment

Env-Variablen liegen in `.env` / `.env.local` (**niemals committen, niemals Werte in Docs**).
Benötigte **Namen** (Werte aus dem lokalen Secret-Store):

- Frontend (Vite, `VITE_`-Präfix, im Bundle sichtbar): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`,
  `VITE_WHATSAPP_NUMBER`.
- Server/Edge (Supabase Function Secrets, **nie** im Frontend): `STRIPE_SECRET_KEY`,
  `STRIPE_PRICE_MONTHLY_ID`, `STRIPE_PRICE_6MONTHS_ID`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_AI_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `ALLOWED_ORIGIN`.

## Wissensbasis (`docs/agents/`)

| Datei | Inhalt |
|-------|--------|
| [01-architektur.md](docs/agents/01-architektur.md) | Big Picture, Stack, `src/`-Layout, Datenfluss |
| [02-routing-und-auth.md](docs/agents/02-routing-und-auth.md) | HashRouter, Routen, Supabase-Auth, **Hash-Token-Stolperfalle** |
| [03-datenmodell.md](docs/agents/03-datenmodell.md) | Supabase-Tabellen, `types.ts`, `_preview`-Views |
| [04-edge-functions.md](docs/agents/04-edge-functions.md) | Katalog der 13 Edge Functions |
| [05-payments-stripe.md](docs/agents/05-payments-stripe.md) | Checkout/Guest/Portal, Webhook, Subscription-Sync |
| [06-skripte-und-pipelines.md](docs/agents/06-skripte-und-pipelines.md) | `scripts/` + Pilot-Befehle |
| [07-konventionen.md](docs/agents/07-konventionen.md) | Code-Stil, Muster, Naming, Sprache, Commits |
| [08-testing.md](docs/agents/08-testing.md) | vitest-Setup, vorhandene Tests |
| [09-stolperfallen.md](docs/agents/09-stolperfallen.md) | Gesammelte Gotchas |
| [10-email-kampagnen.md](docs/agents/10-email-kampagnen.md) | E-Mail-Kampagnen, Resend & Opt-Out-Logik |

Verwandte menschorientierte Docs (Gesamtsystem, im Eltern-Ordner): `../docs/SYSTEMARCHITEKTUR.md`,
`../docs/LOKAL_ENTWICKLUNG.md`. Skript-/DB-Policies: [`scripts/README.md`](scripts/README.md),
[`database/README.md`](database/README.md).

## Produkt-Features (`docs/produkt/`)

| Datei | Inhalt |
|-------|--------|
| [ki-muendliche-pruefungssimulation-funktionsweise.md](docs/produkt/ki-muendliche-pruefungssimulation-funktionsweise.md) | **Mündliche Prüfung — vollständige Funktions-/Bewertungs-Referenz** (Ablauf, ElevenLabs+Gemini, Datenmodell, Gating, Secrets, Betrieb). Start hier. |
| [ki-muendliche-pruefungssimulation-umsetzung.md](docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md) | As-Built, Phasen & Launch-Checkliste |
| [ki-muendliche-pruefungssimulation.md](docs/produkt/ki-muendliche-pruefungssimulation.md) | Vision/Produkt-Spec |
| [projektstatus-und-roadmap.md](docs/produkt/projektstatus-und-roadmap.md) | **Projektstatus und Roadmap** — Festhalten des aktuellen Entwicklungsstands und anstehender Roadmap-Punkte. |

## Aufräumen (erledigt 2026-06-15)

- ✅ **`app-src/` entfernt** — verschoben nach `../_legacy_app-src_archive/` (reversibel; kann nach
  Sichtung endgültig gelöscht werden).
- ✅ **`*" 2".tsx`-Duplikate** in `src/components/pages/` entfernt (`Dashboard 2`, `Profile 2`,
  `LessonQuiz 2` — waren tot, nirgends importiert).
- ✅ **Root `README.md`** — tote `../docs/`-Links auf `AGENTS.md` / `docs/agents/` umgelenkt.
- ✅ **Dev-Panel bereinigt (2026-06-18):** Die Sektion „Übergang testen” (transition state testing) wurde aus dem Entwickler-Panel entfernt.
- ✅ **Inhaltsfehler behoben (2026-06-18):** Finderlohn § 971 BGB auf `MULTIPLE_CHOICE` geändert, Geldbörsen-Fund im Park auf Antwort D geändert samt neuer Erklärung, Selbsthilfe-Aussagen auf `SINGLE_CHOICE` geändert.
- ✅ **KI-Mündliche-Prüfungssimulation gebaut (2026-06-18):** Frontend vollständig (4 Pages, Service, Typen, Routen), Backend-Quellcode ins Repo geholt, Docs erstellt. Admin-only (AdminGuard + isAdminEmail, 3 Ebenen). ExamSelection: ein Schriftlich-Button mit Modal (Mini/Voll). Abgeschlossene Prüfungen zeigt schriftlich + mündlich. Frühere-Durchläufe-Button aus OralExamIntro entfernt.
- ✅ **Mündliche Prüfung erweitert (2026-06-18):** Prüfer „Herr Müller", Admin-Modus-Wahl (Free/Premium), Nutzer-Sprech-Animation, modus-abhängiger Premium-Hinweis im ElevenLabs-Prompt. Auswertung (oral-exam-evaluation v4): KI-Gesamt-Zusammenfassung + Pro-Antwort-Bewertung (Score/verdict/Empfehlung) im `feedback`-JSON; vollständiges Gesprächs-Audio serverseitig von ElevenLabs in privatem Bucket `oral-exam-audio` (`audio_path`, Migration `20260618210000`). Ursache des „Fehler nach jeder Session": leeres Transkript (simulierte Dev-Nutzer ohne echtes JWT) — KI war stets korrekt angebunden.
- ✅ **Mündliche Prüfung & Verlauf optimiert (2026-06-19):** Fehler beim Klick auf „Auswertung erneut versuchen“ in `OralExamResults.tsx` behoben (React-Router-State-Sync-Bug gelöst). Verlauf (`WrittenExamHistory.tsx`) umgestaltet: Statistikkarten aus dem dunklen Header entfernt, stattdessen eine Trophäen-Karte eingeführt. Darunter exklusive, interaktive Filter-Buttons („Schriftlich“ vs. „Mündlich“) mit Beitragszähler implementiert.
- ℹ️ **`.gitignore`** deckt `dist/`, `node_modules/` und `app-src/` bereits ab — keine Änderung nötig.
