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
