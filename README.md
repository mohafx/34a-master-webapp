# 34a Master Webapp

Diese App liegt im Workspace bewusst im Unterordner `34a Master Webapp/app-src/`.

## Orientierung

- Gesamtsystem: [../../docs/README.md](../../docs/README.md)
- Webapp-Doku: [../docs/README.md](../docs/README.md)
- Einfacher Einstieg: [../docs/START_HERE_DE.md](../docs/START_HERE_DE.md)
- Struktur und Ordner: [../docs/ARCHITEKTUR_UND_ORDNER.md](../docs/ARCHITEKTUR_UND_ORDNER.md)
- Betrieb und Setups: [../docs/BETRIEB_UND_SETUPS.md](../docs/BETRIEB_UND_SETUPS.md)

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
npm install
npm run dev
```

## Wichtige Befehle

- `npm run dev` startet die App lokal
- `npm run build` baut das Produktions-Bundle
- `npm run preview` prüft das Build lokal
- `npm run pilot:explanations` startet die lokale Erklärungs-Pipeline
- `npm run pilot:explanations:edge` startet die Edge-Variante

## Hinweis

Alte oder ersetzte Dokumente liegen nicht mehr hier im Mittelpunkt, sondern im sichtbaren Archiv unter `../docs/archive/`.
