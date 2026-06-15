---
title: Skripte & Inhalts-Pipelines
scope: scripts/, npm-Befehle, Pipeline-Runner
last_verified: 2026-06-15
---

# Skripte & Inhalts-Pipelines

Operative Skripte liegen in `scripts/`. Detail-Doku: [`scripts/README.md`](../../scripts/README.md)
(hier nicht dupliziert). Diese Seite ordnet sie den npm-Befehlen zu.

## npm-Befehle → Skript

| Befehl | Skript | Zweck |
|--------|--------|-------|
| `npm run pilot:explanations` | `scripts/run-explanation-pilot.ts` | Erklärungs-Pipeline (lokal-first) |
| `npm run pilot:explanations:edge` | `scripts/run-explanation-pilot-edge.ts` | Erklärungs-Pipeline über Edge Function |
| `npm run pilot:lesson-images` | `scripts/run-lesson-image-pilot.ts` | Lektionsbilder (Worker-API + Supabase Storage) |
| `npm run pilot:written-regen` | `scripts/run-written-regeneration.ts` | Schriftliche-Prüfung-Fragen regenerieren |
| `npm run transition:dry-run\|apply\|status` | `scripts/transition-access.mjs` | Paywall-Zugriffs-Grants (Trockenlauf/Anwenden/Status) |
| `npm run analytics:backfill-stripe:dry-run\|apply` | `scripts/backfill-stripe-posthog.mjs` | Stripe-Daten nach PostHog backfillen |

Weitere Helfer (ohne npm-Alias): `scripts/admin_configure_free_tier.ts`,
`scripts/fix-missing-written-regeneration.mjs`, `scripts/read-batch.ts`,
`scripts/lesson-image-style-presets.ts`, `scripts/test_connections.js`.

## Ausführung

- TS-Runner laufen über `ts-node --esm` (siehe `package.json`-Scripts). Node 22.
- Argumente werden durchgereicht, z. B.:
  ```bash
  npm run pilot:explanations -- --module-order=1 --count=5
  npm run pilot:lesson-images -- --module-order=1 --lesson-order=1 --count=1 --style=sachkunde_real_clean
  ```
- Output-Reviews landen standardmäßig in `local_archive/batch_reviews/`
  (Override: `EXPLANATION_REVIEW_OUTPUT_DIR`). **`local_archive/` ist lokal/archiviert — nicht
  als aktiven Code behandeln.**

## Verwandt

- Zugehörige Edge Functions: [04-edge-functions.md](04-edge-functions.md).
- Datenbankseite (regenerierte Inhalte): [03-datenmodell.md](03-datenmodell.md).
- Tests zu Pipelines: [08-testing.md](08-testing.md).
