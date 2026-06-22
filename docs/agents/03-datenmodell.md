---
title: Datenmodell
scope: Supabase-Tabellen, types.ts, Preview-Views, RLS
last_verified: 2026-06-22
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
| `subscriptions` | Stripe-/Provider-Premium-Zugang pro Nutzer; Status `refunded` entzieht Zugriff sofort |
| `access_grants` | Zeitlich begrenzte Grants, u. a. Transition-Zugriff |
| `processed_checkout_sessions` | Idempotenz/Audit für Checkout-Finalisierung |
| `processed_stripe_events` | Idempotenz für Stripe-Webhook-Events |
| `payment_audit_events` | Operatives Payment-/Premium-Audit, z. B. bezahlter Checkout ohne sichtbares Premium |
| `written_exam_questions` | Fragen der schriftlichen Prüfung |
| `written_exam_sessions` | Prüfungs-Sessions/Versuche |
| `oral_exam_sessions` | Mündliche Prüfungssimulation: Sessions, Transkript, KI-Bewertung (inkl. `summary`/`answer_evaluations` im `feedback`-JSON) & `audio_path` (RLS: nur eigene Zeilen). Audio im privaten Storage-Bucket `oral-exam-audio` (RLS: nur eigener Ordner). Details: [../produkt/ki-muendliche-pruefungssimulation-funktionsweise.md](../produkt/ki-muendliche-pruefungssimulation-funktionsweise.md) |
| `waitlist` | Warteliste / Lead-Capture |

> Die `_preview`-Tabellen/Views liefern öffentlich sichtbare Vorschau-Inhalte ohne Antwortschlüssel.
> Die vollständigen `questions`/`flashcards` sind per RLS auf `is_free = true`, aktive Premium-
> Entitlements oder Admin-Zugriff begrenzt. `written_exam_questions` ist für Browser-Clients nur mit
> Premium-/Admin-Entitlement lesbar. Vor Annahmen über Sichtbarkeit immer die zugehörige Migration
> prüfen.

### RLS-/Grant-Regeln für Inhaltsdaten

Migrationen `20260622000944_lock_down_public_content_rls.sql` und
`20260622001323_remove_legacy_public_content_policies.sql` schließen die vorher zu breite Data-API-
Oberfläche. Die zweite Migration entfernt zusätzlich ältere permissive Baseline-Policies, die nicht
mehr vollständig in der sichtbaren Migrationshistorie repräsentiert waren:

- Browser-Rollen (`anon`, `authenticated`) haben keine `INSERT`-/`UPDATE`-/`DELETE`-Rechte auf
  `questions`, `flashcards`, `lessons` oder `written_exam_questions`.
- `questions` und `flashcards` sind öffentlich nur für `is_free = true` vollständig lesbar; Premium-
  Inhalte brauchen ein aktives `subscriptions`-Entitlement oder einen aktiven `access_grants`-
  Übergangsgrant.
- `written_exam_questions` ist nicht anonym lesbar; authentifizierte Nutzer brauchen Premium/Admin.
- `lessons` bleibt vorerst öffentlich lesbar, weil die App noch kein `lessons_preview` nutzt. Writes
  sind trotzdem für Browser-Rollen gesperrt.
- Operative Pipeline-Tabellen (`question_explanation_*`, `written_exam_regen_*`,
  `lesson_image_*`) sind service-role-only.
- Der alte View `question_catalog_public` ist für `anon`/`authenticated` revoked, weil er
  Antwortschlüssel enthielt.
- Nach dem RLS-Lockdown wurde `DataCacheProvider` auf Cache-Version `v5` erhöht, damit alte
  LocalStorage-Vollinhalt-Caches (`v4`) nicht weiterverwendet werden.
- Die kostenlose Mini-Prüfung nutzt Practice-Fragen aus `questions` mit `question:`-IDs. Sie darf
  für Gäste nicht direkt aus `written_exam_questions` lesen.

### Prüfungstickets für mündliche Simulation

- Free-Nutzer haben 1 `free_test_3q`-Session pro Account.
- Premium-Nutzer haben 10 `full_simulation`-Sessions pro Abo-Zeitraum.
- Verbrauch wird über Zeilen in `oral_exam_sessions` mit gesetztem `connected_at` gezählt (`mode` + `connected_at`). Pending-Sessions ohne echte ElevenLabs-Verbindung verbrauchen kein Ticket. Verbundene Sessions zählen unabhängig davon, ob sie später `done`, `aborted` oder `evaluation_failed` werden.
- `subscriptions.current_period_start` und `subscriptions.current_period_end` bilden das Ticketfenster für Stripe-Premium. Für aktive `access_grants` gelten `starts_at`/`ends_at`.

### Premium-Entitlement

Autoritative Premium-Auswertung liegt in der Edge Function `entitlement-status` und dem geteilten
Code `supabase/functions/_shared/entitlement-status.ts`.

- `subscriptions.status in ('active', 'trialing')` gewährt Premium.
- `subscriptions.status = 'canceled'` gewährt Premium nur bis `current_period_end`.
- `subscriptions.status in ('free', 'refunded', 'incomplete', 'incomplete_expired', 'unpaid')`
  gewährt kein Premium.
- Aktive Transition-Grants gewähren Premium nur innerhalb `starts_at <= now < ends_at`.
- Frontend darf `subscriptions` nicht mit `.single()` als alleinige Premium-Quelle lesen; mehrere
  oder driftende Zeilen müssen robust sortiert/ausgewertet werden.

`payment_audit_events` ist RLS-geschützt und nur für Service Role gedacht. Wichtige Events:

| Event | Bedeutung |
|-------|-----------|
| `checkout_finalized_premium_active` | Bezahlter Checkout finalisiert und Premium ist serverseitig sichtbar |
| `checkout_finalized_without_premium` | Bezahlter Checkout finalisiert, aber Entitlement ist nicht aktiv |
| `checkout_missing_user_id` | Bezahlte Session ohne zuordenbaren Nutzer |
| `premium_revoked_refund_or_dispute` | Premium wurde durch Refund/Dispute entzogen |

### Erklärungsgrafiken für Quizfragen

`questions` kann optional eine Erklärungsgrafik anzeigen. Die Felder wurden für den schrittweisen
Rollout der Infografiken ergänzt:

| Spalte | Zweck |
|--------|-------|
| `question_explanation_image_url` | Öffentliche Asset-URL, die oberhalb der Erklärung gerendert wird |
| `question_explanation_image_alt_de` | Deutscher Alt-Text für Barrierefreiheit und Kontext |
| `question_explanation_image_prompt` | Prompt-/Quellnotiz zur Nachvollziehbarkeit der Bildgenerierung |
| `question_explanation_image_status` | Reservefeld für Status/Lock-Migration des Self-Service-Flows |
| `question_explanation_image_locked_at` | Reservefeld für Status/Lock-Migration des Self-Service-Flows |

Die App mappt diese Felder auf `Question.explanationImageUrl` und `Question.explanationImageAltDE`.
Die Anzeige, Self-Service-Erstellung und Admin-Aktionen passieren zentral in
`src/components/pages/ExplanationRenderer.tsx` über `src/services/questionImages.ts` und die Edge
Function `generate-question-image`. Bilder werden im öffentlichen Supabase-Storage-Bucket
`question-explanations` gespeichert; Referenzbilder liegen unter `_references/`, generierte Bilder
unter `<question-id>.png`. Aktuelle Projekt-Doku und Status:
[`../produkt/quiz-erklaerungsbilder-rollout.md`](../produkt/quiz-erklaerungsbilder-rollout.md).

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
