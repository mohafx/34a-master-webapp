---
title: Testing
scope: vitest-Setup, vorhandene Tests, Befehle
last_verified: 2026-06-20
---

# Testing

Test-Runner: **vitest** (mit `jsdom`, `@testing-library/react` + `jest-dom`). Konfiguration in
`vite.config.ts`. Tests liegen in `tests/`.

## Befehle (aus `package.json`)

```bash
npm run test:transition-access            # tests/transitionAccess.test.ts
npm run test:oral-exam-entitlement        # Ticketzählung / Free-Premium-Gating der mündlichen Prüfung
npm run test:oral-exam-routing            # Mini-/Full-Agent-Routing der mündlichen Prüfung
npm run test:oral-exam-scenarios          # Kuratierter Szenario-Pool der mündlichen Prüfung
npm run test:question-pipeline            # question-explanation-pipeline.validation.test.ts
npm run test:written-regen-pipeline       # written-exam-regeneration.validation.test.ts
npm run test:written-regen-integration    # written-exam-regeneration.integration.test.ts
```

Für Ad-hoc-Läufe direkt: `npx vitest run <pfad>` oder `npx vitest` (Watch).

## Vorhandene Tests (`tests/`)

| Datei | Fokus |
|-------|-------|
| `transitionAccess.test.ts` | Paywall-Zugriffs-Grants (`transition-access`) |
| `oralExamEntitlement.test.ts` | Prüfungstickets: Free 1 Mini, Premium 10 Vollsimulationen, `connected_at` zählt |
| `oralExamRouting.test.ts` | Auswahl Mini-/Full-ElevenLabs-Agent |
| `oralExamScenarios.test.ts` | Vollständigkeit und Grundvalidierung des kuratierten Szenario-Pools |
| `question-explanation-pipeline.validation.test.ts` | Erklärungs-Pipeline-Validierung |
| `written-exam-regeneration.validation.test.ts` | Schriftliche-Prüfung-Regen (Validierung) |
| `written-exam-regeneration.integration.test.ts` | Schriftliche-Prüfung-Regen (Integration) |
| `lernplanGenerator.test.ts` | Lernplan-Generierung |
| `writtenExamAnswers.test.ts`, `writtenExamMixedIds.test.ts`, `writtenExamSelection.test.ts` | Logik der schriftlichen Prüfung |

> Hinweis: Es gibt **keinen** generischen `npm test`-Alias — gezielt die `test:*`-Befehle oder
> `npx vitest` nutzen. Tests/Artefakte in `testsprite_tests/` ignorieren (kein aktiver Code).

## Typecheck-Hinweis

`npx tsc --noEmit` läuft aktuell repo-weit nicht sauber durch, weil Skripte und Supabase-Edge-
Functions mit Node-TypeScript geprüft werden und dadurch bekannte Altfehler melden (u. a. Deno-
Imports, Supabase-Generics und Pipeline-Skripttypen). Bei kleinen Frontend-Stabilitätsfixes zusätzlich
zum Build gezielt prüfen:

```bash
npx tsc --noEmit --pretty false 2>&1 | rg 'src/(App\.tsx|components/ErrorBoundary\.tsx|components/pages/Statistics\.tsx)'
npm run build
```

Für berührte Featurebereiche weiterhin die passenden Vitest-Skripte ausführen.

## Verwandt

- Pipelines, die hier getestet werden: [06-skripte-und-pipelines.md](06-skripte-und-pipelines.md).
- Frontend-Verhalten verifizieren: `preview_*`-Tools (siehe `CLAUDE.md`).
