---
title: Datenmodell
scope: Supabase-Tabellen, types.ts, Preview-Views, RLS
last_verified: 2026-06-19
---

# Datenmodell

Quelle der Wahrheit für das Schema: `supabase/migrations/`. Zugriff im Frontend ausschließlich über
`src/services/database.ts` (und verwandte Services), nie direkt aus Komponenten.

## Tabellen

Aus `src/services/database.ts` (`supabase.from('…')`) referenziert:

| Tabelle | Zweck |
|---------|-------|
| `modules` | Lernmodule (oberste Inhaltsebene) |
| `lessons` | Lektionen innerhalb eines Moduls |
| `questions` / `questions_preview` | Übungs-/Prüfungsfragen; `_preview` = öffentliche Vorschau |
| `flashcards` / `flashcards_preview` | Lernkarten; `_preview` = öffentliche Vorschau |
| `user_profiles` | Profil-/Stammdaten pro Nutzer |
| `user_progress` | Fortschritt (Fragen) |
| `user_lesson_progress` | Abschluss-Status pro Lektion |
| `user_lesson_quiz_results` | Ergebnisse der Lektions-Quizze |
| `user_flashcard_progress` | Lernkarten-Fortschritt |
| `user_bookmarks` | Lesezeichen auf Fragen |
| `user_lernplans` | Generierte Lernpläne (siehe `lernplanGenerator.ts`) |
| `written_exam_questions` | Fragen der schriftlichen Prüfung |
| `written_exam_sessions` | Prüfungs-Sessions/Versuche |
| `oral_exam_sessions` | Mündliche Prüfungssimulation: Sessions, Transkript, KI-Bewertung (inkl. `summary`/`answer_evaluations` im `feedback`-JSON) & `audio_path` (RLS: nur eigene Zeilen). Audio im privaten Storage-Bucket `oral-exam-audio` (RLS: nur eigener Ordner). Details: [../produkt/ki-muendliche-pruefungssimulation-funktionsweise.md](../produkt/ki-muendliche-pruefungssimulation-funktionsweise.md) |
| `waitlist` | Warteliste / Lead-Capture |

> Die `_preview`-Tabellen/Views liefern öffentlich sichtbare Inhalte (Free-Tier); die vollständigen
> `questions`/`flashcards` sind über RLS bzw. Premium-Logik geschützt. Vor Annahmen über
> Sichtbarkeit immer die zugehörige Migration prüfen.

### Prüfungstickets für mündliche Simulation

- Free-Nutzer haben 1 `free_test_3q`-Session pro Account.
- Premium-Nutzer haben 10 `full_simulation`-Sessions pro Abo-Zeitraum.
- Verbrauch wird über gestartete Zeilen in `oral_exam_sessions` gezählt (`mode` + `created_at`), unabhängig davon, ob die Session später `done`, `aborted` oder `evaluation_failed` wird.
- `subscriptions.current_period_start` und `subscriptions.current_period_end` bilden das Ticketfenster für Stripe-Premium. Für aktive `access_grants` gelten `starts_at`/`ends_at`.

### Erklärungsgrafiken für Quizfragen

`questions` kann optional eine Erklärungsgrafik anzeigen. Die Felder wurden für den schrittweisen
Rollout der Infografiken ergänzt:

| Spalte | Zweck |
|--------|-------|
| `question_explanation_image_url` | Öffentliche Asset-URL, die oberhalb der Erklärung gerendert wird |
| `question_explanation_image_alt_de` | Deutscher Alt-Text für Barrierefreiheit und Kontext |
| `question_explanation_image_prompt` | Prompt-/Quellnotiz zur Nachvollziehbarkeit der Bildgenerierung |

Die App mappt diese Felder auf `Question.explanationImageUrl` und `Question.explanationImageAltDE`.
Die Anzeige passiert zentral in `src/components/pages/ExplanationRenderer.tsx`. Aktuelle Projekt-Doku
und Status: [`../produkt/quiz-erklaerungsbilder-rollout.md`](../produkt/quiz-erklaerungsbilder-rollout.md).

## Typen (`src/types.ts`)

Zentrale exportierte Typen:

- `enum QuestionType`, `interface Question`, `interface Answer`, `interface Flashcard`
- `interface Module`, `interface Lesson`
- `interface User`, `interface UserSettings`, `interface UserProgress`, `enum AppLanguage`
- `interface WrittenExamQuestion`, `interface WrittenExamSession`
- `const TOPIC_DISTRIBUTION` / `MINI_EXAM_TOPIC_DISTRIBUTION`, `type WrittenExamTopic`
  (Themen-Verteilung der schriftlichen Prüfung)

## Migrationen

- Verzeichnis: `supabase/migrations/` (chronologisch, `YYYYMMDDHHMMSS_*.sql`).
- Policy: **Neue Migrationen nur hier anlegen** — `database/` und Alt-SQL sind archiviert
  ([`database/README.md`](../../database/README.md)).
- Mit Supabase-MCP arbeiten: vor Änderungen `list_tables`, dann `apply_migration`.

## Verwandt

- Schriftliche-Prüfung-Logik: `src/services/writtenExam.ts`, [05-payments-stripe.md](05-payments-stripe.md) (Gating).
- Inhalts-Regeneration (Fragen/Erklärungen): [06-skripte-und-pipelines.md](06-skripte-und-pipelines.md).
- Erklärungsgrafiken für Quizfragen: [../produkt/quiz-erklaerungsbilder-rollout.md](../produkt/quiz-erklaerungsbilder-rollout.md).
