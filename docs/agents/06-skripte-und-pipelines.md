---
title: Skripte & Inhalts-Pipelines
scope: scripts/, npm-Befehle, Pipeline-Runner
last_verified: 2026-06-18
---

# Skripte & Inhalts-Pipelines

Operative Skripte liegen in `scripts/`. Detail-Doku: [`scripts/README.md`](../../scripts/README.md)
(hier nicht dupliziert). Diese Seite ordnet sie den npm-Befehlen zu.

## npm-Befehle → Skript

| Befehl | Skript | Zweck |
|--------|--------|-------|
| `npm run pilot:explanations` | `scripts/run-explanation-pilot.ts` | Erklärungs-Pipeline (lokal-first) |
| `npm run pilot:explanations:edge` | `scripts/run-explanation-pilot-edge.ts` | Erklärungs-Pipeline über Edge Function |
| `npm run pilot:question-images` | `scripts/run-question-explanation-images.ts` | Quiz-Erklärungsgrafiken (OpenAI Image API + Review-Gate) |
| `npm run pilot:lesson-images` | `scripts/run-lesson-image-pilot.ts` | Lektionsbilder (Worker-API + Supabase Storage) |
| `npm run pilot:written-regen` | `scripts/run-written-regeneration.ts` | Schriftliche-Prüfung-Fragen regenerieren |
| `npm run transition:dry-run\|apply\|status` | `scripts/transition-access.mjs` | Paywall-Zugriffs-Grants (Trockenlauf/Anwenden/Status) |
| `npm run analytics:backfill-stripe:dry-run\|apply` | `scripts/backfill-stripe-posthog.mjs` | Stripe-Daten nach PostHog backfillen |

Weitere Helfer (ohne npm-Alias): `scripts/admin_configure_free_tier.ts`,
`scripts/fix-missing-written-regeneration.mjs`, `scripts/read-batch.ts`,
`scripts/question-explanation-image-utils.ts`, `scripts/lesson-image-style-presets.ts`,
`scripts/test_connections.js`.

## Quiz-Erklärungsgrafiken

Für Erklärungsgrafiken zu einzelnen Quizfragen gibt es eine lokale Batch-Pipeline mit Review-Gate.
Sie nutzt die OpenAI Image API (`gpt-image-2` per Default), nicht die ChatGPT-App. `OPENAI_API_KEY`
darf nur lokal/serverseitig stehen und nie als `VITE_`-Variable ins Frontend gelangen.

1. Frage und gespeicherte Explanation aus Supabase lesen.
2. Bild-Brief, Prompt, `manifest.json` und `review.md` erzeugen.
3. App-nahe PNG-Kandidaten unter `local_archive/question_explanation_images/<run-id>/` generieren.
4. Nutzer prüft und gibt Frage-IDs in `approved.json` frei.
5. Commit-Stage kopiert nur freigegebene PNGs nach `public/question-explanations/`.
6. Commit-Stage erzeugt eine Migration mit `question_explanation_image_url`, Alt-Text und Prompt-Notiz.
7. `supabase db push --dry-run` und danach `supabase db push` bleiben bewusst separate Schritte.

Status, Prompt-Template und Namenskonventionen stehen in
[`../produkt/quiz-erklaerungsbilder-rollout.md`](../produkt/quiz-erklaerungsbilder-rollout.md).

## Ausführung

- TS-Runner laufen über `ts-node --esm` (siehe `package.json`-Scripts). Node 22.
- Argumente werden durchgereicht, z. B.:
  ```bash
  npm run pilot:explanations -- --module-order=1 --count=5
  npm run pilot:question-images -- --module-order=1 --count=2 --dry-run --stage=generate
  npm run pilot:lesson-images -- --module-order=1 --lesson-order=1 --count=1 --style=sachkunde_real_clean
  ```
- Output-Reviews landen standardmäßig in `local_archive/batch_reviews/`
  (Override: `EXPLANATION_REVIEW_OUTPUT_DIR`). **`local_archive/` ist lokal/archiviert — nicht
  als aktiven Code behandeln.**

## Verwandt

- Zugehörige Edge Functions: [04-edge-functions.md](04-edge-functions.md).
- Datenbankseite (regenerierte Inhalte): [03-datenmodell.md](03-datenmodell.md).
- Tests zu Pipelines: [08-testing.md](08-testing.md).
