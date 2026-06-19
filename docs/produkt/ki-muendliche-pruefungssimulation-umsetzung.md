---
title: KI-Mündliche-Prüfungssimulation — Umsetzung (As-Built) & Phasen
scope: Produkt / Technische Umsetzung
status: Phase 5 — Frontend gebaut, Admin-only Soft-Launch, Live-Flow stabilisiert
last_verified: 2026-06-19
last_updated: 2026-06-19
---

# Mündliche Prüfungssimulation — Wie es gebaut ist & wo wir stehen

> Konkrete Umsetzung der [Vision-Spec](ki-muendliche-pruefungssimulation.md). Beschreibt den
> **tatsächlich gebauten Stand** (As-Built).

## ⚠️ Wichtige Korrektur zur Historie (2026-06-18)

Beim Wiederaufgreifen war der Stand **nicht** wie zuvor dokumentiert („Frontend vollständig gebaut").
Verifiziert:

- **Live-Backend** (Supabase `fcwyavxxcblcbdezobgz`) war deployt: Tabelle `oral_exam_sessions`,
  Edge Functions `oral-exam-session` + `oral-exam-evaluation`, Migration angewandt.
- **Frontend war zu 0 % vorhanden**, und der **Backend-Quellcode lag nicht im Repo** (nur eine
  verwaiste `drop_oral_exam_tables.sql`). Beides wurde am 2026-06-18 nachgebaut bzw. aus der
  Live-Umgebung ins Repo zurückgeholt.
- Der real angewandte Migrations-Timestamp ist `20260616175910` (nicht `20260616000000`).
- `user_profiles` hat **nicht** `is_premium`/`first_name`/`full_name` — die entsprechenden
  Premium-/Namens-Pfade in `oral-exam-session` greifen daher erst nach DB-Erweiterung (relevant für
  den späteren öffentlichen Launch, nicht für den Admin-Test).
- `elevenlabs-closer-webhook` im selben Projekt ist eine **fremde, verwaiste** Function (Umzugsfirmen-
  Leads) — kein Teil dieser App.

---

## 1. Phasen

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Vision + Daten-/Markt-Recherche | ✅ |
| 1 | Backend live deployt (Tabelle + 2 Edge Functions + ElevenLabs-Agent + Secrets) | ✅ |
| 2 | **Frontend gebaut + Backend-Quellcode/Migration ins Repo geholt** | ✅ ← **HIER** (2026-06-18) |
| 3 | Lokaler Live-Test als Admin (localhost, Mikrofon) | ⏳ |
| 4 | Öffentlicher Launch (Admin-Gate raus + `user_profiles` erweitern + Prod-Deploy) | ⬜ |
| 5 | Ausbau: 15-Min-Modus, mehrere Prüfer, kuratierter Szenario-Pool | ⬜ |

---

## 2. Architektur (As-Built)

```
Browser (React 19 SPA)
  /exam → Karte "Mündliche Prüfung" (nur Admin sichtbar) → /oral-exam (AdminGuard)
  │
  ├─(1) OralExamIntro → startOralExamSession(focusTopic)
  │        → POST oral-exam-session (Edge, verify_jwt, Admin-Gate)
  │        → { sessionId, mode, maxDurationSec, signedUrl, dynamicVariables }
  │
  ├─(2) OralExamLive (@elevenlabs/react: ConversationProvider + useConversation)
  │        · startSession({ signedUrl, connectionType:'websocket', dynamicVariables })
  │        · Mikro rein / Prüferstimme raus, onConnect→conversationId, onMessage→Live-Transkript
  │        · Timer (maxDurationSec) / "Beenden" / onDisconnect → finish()
  │
  ├─(3) finish() → evaluateOralExam(sessionId, transcript, durationS, conversationId)
  │        → POST oral-exam-evaluation (idempotent; Transkript autoritativ von ElevenLabs,
  │          Fallback Client/gespeichertes Transkript; OpenAI Structured Output → speichern)
  │
  └─(4) OralExamResults (/oral-exam/results/:sessionId) → Score, Themen, Stärken/Lücken,
         Musterantworten, roter Faden, next_step.  OralExamHistory listet vergangene Läufe.
```

## 3. Dateien im Repo

**Frontend (`src/`)**
- Pages: `components/pages/OralExam{Intro,Live,Results,History}.tsx`
- Service: `services/oralExam.ts` (`startOralExamSession`, `evaluateOralExam`,
  `retryOralExamEvaluation`, `getOralExamSession`, `listOralExamSessions`, `abortOralExamSession`)
- Typen: `OralExam*` in `types.ts`
- Routen: `App.tsx` — `/oral-exam`, `/oral-exam/live`, `/oral-exam/results/:sessionId`,
  `/oral-exam/history`, **alle in `<AdminGuard>`**
- Einstieg (ExamSelection): **ein Button** „Schriftliche Prüfungssimulation" öffnet ein Modal
  (Mini / Voll). Karte „Mündliche Prüfung" erscheint nur wenn `isAdminEmail(user?.email)`.
- Verlauf: `components/pages/WrittenExamHistory.tsx` zeigt **schriftliche + mündliche** Sessions
  (mündliche Sektion nur für Admin sichtbar). `OralExamHistory.tsx` weiterhin unter
  `/oral-exam/history` erreichbar (intern).
- `OralExamIntro.tsx` hat **keinen** „Frühere Durchläufe"-Button mehr.
- `OralExamIntro.tsx` zeigt vor dem Start ein Pflicht-Popup „Für beste Ergebnisse" (ruhiger Raum,
  keine Hintergrundgeräusche, Mikrofon-Zugriff bestätigen). Erst nach „Verstanden, starten" wird die
  Session vorbereitet.
- `OralExamLive.tsx` nutzt ein fixiertes `100dvh`-Layout: die Seite selbst scrollt nicht, nur das
  Transkriptfenster. Neue Prüfer-/Nutzer-Nachrichten scrollen automatisch zum letzten Text.
- `OralExamResults.tsx` verbindet Score-Karte und „Zusammenfassung des Prüfers" visuell zu einem
  Statusblock; die Zusammenfassung nutzt eine hellere Variante der Bestanden-/Nicht-bestanden-Farbe.
- Analytics: Events `oral_exam_started` / `oral_exam_completed` in `contexts/PostHogProvider.tsx`
- Dependency: `@elevenlabs/react`

**Backend (`supabase/`)**
- `functions/oral-exam-session/index.ts`, `functions/oral-exam-evaluation/index.ts`
  (exakt der live deployte Stand)
- `migrations/20260616175910_create_oral_exam_sessions.sql` (idempotent, = Live-Schema)

## 4. ElevenLabs-Agent
- „34a Master – Mündliche Prüfung (**Herr Müller**)", Sprache **de**, Modell `eleven_flash_v2_5`.
- `agent_id` liegt als Supabase-Secret `ELEVENLABS_AGENT_ID` (nicht im Repo).
- Dynamic Variables: `mode`, `focus_topic`, `candidate_name`, `session_seed`.
- Prüfer-Name (im Prompt **und** in der UI [`OralExamLive.tsx`]) = **Herr Müller**.
- Aktueller Agent-Stand (per API gesetzt und verifiziert 2026-06-19): `full_simulation`, 6 Hauptfälle,
  1-2 Rückfragen, `max_duration_seconds=720`, `temperature=0.7`, abwechslungsreiche Fallauswahl über
  `{{session_seed}}`. Der alte Modus `full_test_6q` ist entfernt.

### 4a. Ein Agent, kein zweiter (Architekturentscheidung 2026-06-18)
**Bewusst genau EIN Agent** statt getrennter Agenten für Abonnenten/Nicht-Abonnenten. Begründung:
der einzige Verhaltensunterschied ist der Schlusssatz — das löst die bereits übergebene
Dynamic-Variable `{{mode}}` (`free_test_3q` vs. `full_simulation`) im System-Prompt. Zwei Agenten würden
jede künftige Prompt-/Persona-Verbesserung verdoppeln (Drift-Gefahr) und eine zweite `agent_id`
erfordern. Erst splitten, falls die Modi inhaltlich stark auseinanderlaufen (anderer
Schwierigkeitsgrad/Themen-Tiefe).

### 4b. Modus-abhängiger Abschluss (im ElevenLabs-Prompt, per API gesetzt 2026-06-18)
Die `ENDE`-Sektion des System-Prompts verzweigt nach `{{mode}}`:
- `full_simulation`: neutraler Abschluss („…Prüfung ist hiermit beendet. Ihre Auswertung folgt gleich.").
- `free_test_3q`: zusätzlich ein **seriöser Premium-Hinweis** des Prüfers — die Mini-Simulation sei
  nur ein verkürzter Eindruck; die vollständige Simulation (volle Länge, mehrere Fallbeispiele, tiefe
  Rückfragen) sei Teil von **34a Master Premium**. Keine Bewertung/Note.
- Der Prompt liegt **nur bei ElevenLabs** (nicht im Repo). Änderungen via
  `PATCH /v1/convai/agents/{agent_id}` mit `conversation_config.agent.prompt.prompt` und dem
  `xi-api-key` (= Secret `ELEVENLABS_API_KEY`, nie committen).
- Im aktuellen Admin-Soft-Launch ist `mode` immer `full_simulation` → der Premium-Hinweis greift erst nach
  dem öffentlichen Launch für Free-Nutzer.

## 4c. Admin-Modus-Auswahl (Test, 2026-06-18)
Im Admin-Soft-Launch kann der Admin vor dem Start in `OralExamIntro` den Test-Modus wählen
(**Free** = `free_test_3q` / **Premium** = `full_simulation`), um beide Abläufe inkl. des modus-abhängigen
Prüfer-Abschlusses zu testen. Mechanik:
- `startOralExamSession(focusTopic, requestedMode)` schickt `requested_mode` im Body.
- `oral-exam-session` (v4) honoriert `requested_mode` **nur für Admins**; für alle anderen ergibt sich
  der Modus weiterhin aus dem Premium-Status. Nach dem öffentlichen Launch ist das Feld für
  Nicht-Admins wirkungslos (kein Missbrauch möglich).

## 4d. Sprech-Animationen (UI, `OralExamLive.tsx`)
- **Prüfer spricht**: primär über den hörbaren Ausgangspegel `getOutputVolume()` plus SDK-Modus
  (`isSpeaking`/`mode`) ermittelt. Dadurch hängt die Anzeige nicht an verspäteten oder vorgezogenen
  Transkript-Events.
- **Nutzer spricht**: `getInputVolume()` wird per `requestAnimationFrame` gepollt; ab Pegel > 0,025
  erscheint ein **pegelreaktiver emerald-Ring** (skaliert mit der Lautstärke) + Status „Du sprichst…".
  Bei stummem Mikro 0 → Status „Mikrofon stumm".

## 4e. Live-Flow-Stabilisierung (2026-06-19)
- `full_simulation` ist der kanonische Vollmodus; `full_5min` bleibt nur Legacy-kompatibel.
- `oral-exam-session` sendet pro Session einen zufälligen `session_seed` an ElevenLabs, damit Fälle,
  Reihenfolge, Orte und Personen variieren.
- Mikrofon-Zugriff wird vor dem ElevenLabs-Start explizit geprüft. Wenn der Browser den Zugriff nicht
  bestätigt, zeigt die UI einen Fehler mit „Mikrofon-Zugriff erneut erlauben".
- ElevenLabs-Regie-Tags wie `[happy]` werden im Live-Transkript und vor der Auswertung entfernt.
- DevPanel-Mock bleibt rein lokal (`?devMock=1`): kein Admin, keine Session, kein Mikrofon, kein
  ElevenLabs. Gleiche Fragen im Mock sind absichtlich feste Testdaten.

## 5. Gating
| Nutzer | Verhalten (Soft-Launch) |
|---|---|
| Admin (`m.almajzoub1@gmail.com`) | Voller Zugriff, **Modus frei wählbar** (Free/Premium), unbegrenzt |
| Alle anderen / ausgeloggt | Karte unsichtbar, `/oral-exam*` → Redirect, Backend `403` |

## 6. Auswertungs-JSON (OpenAI)
`{ overall_score_pct, passed, summary, topic_scores[{topic,score_pct,comment}],
answer_evaluations[{question,candidate_answer,score_pct,verdict,recommendation}], strengths[], gaps[],
model_answers[{scenario,musterantwort}], roter_faden[], next_step }`. Bestehensgrenze 50 %.
- `summary`: KI-Gesamt-Zusammenfassung (wie die Prüfung lief, bestanden/nicht, Hauptschwächen).
- `answer_evaluations`: **Pro-Antwort-Bewertung** — je Prüfer-Frage ein Score + `verdict`
  (`correct`/`partial`/`wrong`) + `recommendation` (nur bei partial/wrong).
- `summary` und `answer_evaluations` liegen im `feedback`-JSON (keine Schemaänderung nötig).
- Provider: `oral-exam-evaluation` nutzt `OPENAI_API_KEY` und optional `OPENAI_MODEL` (Default
  `gpt-4.1`). Die Antwort wird per JSON Schema erzwungen.

## 6a. Fehlerhafte Auswertungen & Retry
- Sobald `oral-exam-evaluation` ein Transkript bestimmen kann, speichert die Function es früh in
  `oral_exam_sessions.transcript`. Erst danach startet die KI-Auswertung.
- Scheitert die KI-Auswertung danach, wird die Session mit `status='evaluation_failed'`, `ended_at`,
  `duration_s`, `transcript` und `feedback.error`/`feedback.retryable=true` gespeichert.
- `OralExamResults` zeigt für `evaluation_failed` einen Fehlerzustand mit „Auswertung erneut versuchen“.
  Der Retry nutzt das gespeicherte Transkript und ruft dieselbe idempotente Edge Function erneut auf.
  (Behoben am 2026-06-19: Ein State-Sync-Problem bei gleichem Pfad gelöst, sodass nach erfolgreichem Retry das Ergebnis sofort gerendert wird).
- Alte Fehlversuche aus der Gemini-Key-Störung haben teils kein gespeichertes Transkript und keine
  `conversationId`; einige wurden durch den Client-Cleanup bereits als `aborted` markiert. Sie sind im
  Verlauf sichtbar, können aber nur über „Neue Prüfung starten“ wiederholt werden.
- `WrittenExamHistory` („Abgeschlossene Prüfungen“) zeigt mündliche `done`, `evaluation_failed`, `running`
  und `aborted`-Sessions an, damit Auswertungsfehler nicht verschwinden. (Aktualisiert am 2026-06-19:
  Statistikkarten für Schriftlich/Mündlich wurden aus dem Header entfernt und als exklusive Filter-Buttons darunter implementiert).

## 6b. Audio-Speicherung (serverseitig, 2026-06-18)
- Nach der Auswertung holt `oral-exam-evaluation` das **vollständige Gesprächs-Audio** (Prüfer + Prüfling)
  von ElevenLabs: `GET /v1/convai/conversations/{conversationId}/audio` (`audio/mpeg`, verifiziert).
- Ablage im **privaten** Bucket `oral-exam-audio`, Pfad `{user_id}/{sessionId}.mp3`; `audio_path` wird in
  der Session gespeichert. Best-effort: Audio-Fehler lassen die Auswertung nicht scheitern.
- Wiedergabe: `getOralExamAudioUrl()` (Service) erzeugt eine **signierte URL** (1 h); RLS-Policy
  `oral_exam_audio_read_own` erlaubt nur den eigenen Ordner. Player auf der Ergebnisseite.
- Migration: `supabase/migrations/20260618210000_oral_exam_audio.sql` (Spalte `audio_path` + Bucket + RLS).

## 7. Offene Schritte
- **Phase 3:** Lokaler Live-Test als Admin (localhost, Mikrofon). Logs via Supabase-MCP `get_logs`
  (edge-function), DB via `execute_sql` auf `oral_exam_sessions`.
- **Phase 4 (Launch):** Admin-Gate in `oral-exam-session` + `App.tsx` (`AdminGuard`) +
  `ExamSelection.tsx` (`showOralExam`) entfernen; **vorher** `user_profiles` um `is_premium`/
  `first_name`/`full_name` erweitern (oder den Premium-/Namens-Pfad auf `subscriptions`/`access_grants`
  reduzieren). Functions neu deployen, Frontend-Prod-Deploy.

## Verweise
- **Funktionsweise (vollständige Referenz):** [ki-muendliche-pruefungssimulation-funktionsweise.md](ki-muendliche-pruefungssimulation-funktionsweise.md)
- Vision: [ki-muendliche-pruefungssimulation.md](ki-muendliche-pruefungssimulation.md)
- Edge Functions: [../agents/04-edge-functions.md](../agents/04-edge-functions.md) · Datenmodell:
  [../agents/03-datenmodell.md](../agents/03-datenmodell.md)
