---
title: KI-Mündliche-Prüfungssimulation — Umsetzung (As-Built) & Phasen
scope: Produkt / Technische Umsetzung
status: Phase 4 — Public-Launch-Gating mit Prüfungstickets implementiert
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
- `user_profiles` hat **nicht** `is_premium`/`first_name`/`full_name`; der öffentliche Launch-Pfad nutzt
  deshalb `subscriptions`/`access_grants` für Premium und `display_name` als Kandidatenname.
- `elevenlabs-closer-webhook` im selben Projekt ist eine **fremde, verwaiste** Function (Umzugsfirmen-
  Leads) — kein Teil dieser App.

---

## 1. Phasen

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Vision + Daten-/Markt-Recherche | ✅ |
| 1 | Backend live deployt (Tabelle + 2 Edge Functions + ElevenLabs-Agent + Secrets) | ✅ |
| 2 | **Frontend gebaut + Backend-Quellcode/Migration ins Repo geholt** | ✅ ← **HIER** (2026-06-18) |
| 3 | Lokaler Live-Test als Admin (localhost, Mikrofon) | ✅ |
| 4 | Öffentlicher Launch mit Registrierung + Prüfungstickets + Prod-Deploy | ✅ Code vorbereitet / ⏳ Deployment |
| 5 | Ausbau: UI-Optimierungen, Flashcards/RAG für ElevenLabs, 15-Min-Modus, mehrere Prüfer, kuratierter Szenario-Pool | ⬜ |

---

## 2. Architektur (As-Built)

```
Browser (React 19 SPA)
  /exam → Karte "Mündliche Prüfung" (öffentlich sichtbar; Gäste → Registrierung) → /oral-exam
  │
  ├─(1) OralExamIntro → getOralExamEntitlement()
  │        → POST oral-exam-entitlement (Edge, verify_jwt)
  │        → { isPremium, mode, used, limit, remaining, windowEndsAt }
  │
  ├─(2) Start → startOralExamSession(focusTopic)
  │        → POST oral-exam-session (Edge, verify_jwt, Prüfungstickets)
  │        → Signed URL holen → Session anlegen → { sessionId, mode, maxDurationSec, signedUrl, dynamicVariables, entitlement }
  │
  ├─(3) OralExamLive (@elevenlabs/react: ConversationProvider + useConversation)
  │        · startSession({ signedUrl, connectionType:'websocket', dynamicVariables })
  │        · Mikro rein / Prüferstimme raus, onConnect→conversationId, onMessage→Live-Transkript
  │        · Timer (maxDurationSec) / "Beenden" / onDisconnect → finish()
  │
  ├─(4) finish() → evaluateOralExam(sessionId, transcript, durationS, conversationId)
  │        → POST oral-exam-evaluation (idempotent; Transkript autoritativ von ElevenLabs,
  │          Fallback Client/gespeichertes Transkript; OpenAI Structured Output → speichern)
  │
  └─(5) OralExamResults (/oral-exam/results/:sessionId) → Score, Themen, Stärken/Lücken,
         Musterantworten, roter Faden, next_step.  OralExamHistory listet vergangene Läufe.
```

## 3. Dateien im Repo

**Frontend (`src/`)**
- Pages: `components/pages/OralExam{Intro,Live,Results,History}.tsx`
- Service: `services/oralExam.ts` (`getOralExamEntitlement`, `startOralExamSession`, `evaluateOralExam`,
  `retryOralExamEvaluation`, `getOralExamSession`, `listOralExamSessions`, `abortOralExamSession`)
- Typen: `OralExam*` in `types.ts`
- Routen: `App.tsx` — `/oral-exam`, `/oral-exam/live`, `/oral-exam/results/:sessionId`,
  `/oral-exam/history`, öffentlich erreichbar; Start erfordert Auth in der Edge Function.
- Einstieg (ExamSelection): **ein Button** „Schriftliche Prüfungssimulation" öffnet ein Modal
  (Mini / Voll). Karte „Mündliche Prüfung" ist öffentlich sichtbar; Gäste öffnen den Registrierungsdialog.
- Verlauf: `components/pages/WrittenExamHistory.tsx` zeigt **schriftliche + mündliche** Sessions
  für angemeldete Nutzer. `OralExamHistory.tsx` weiterhin unter `/oral-exam/history` erreichbar.
- `OralExamIntro.tsx` hat **keinen** „Frühere Durchläufe"-Button mehr.
- `OralExamIntro.tsx` zeigt statt Admin-Testmodus eine Prüfungsticket-Karte: Free `1/1` Mini,
  Premium `10/10` Vollsimulationen pro Abo-Zeitraum.
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
- `functions/oral-exam-entitlement/index.ts`, `functions/oral-exam-session/index.ts`,
  `functions/oral-exam-evaluation/index.ts`
- Shared Ticketlogik: `functions/_shared/oral-exam-entitlement.ts`
- `migrations/20260616175910_create_oral_exam_sessions.sql` (idempotent, = Live-Schema)
- `migrations/20260619170928_add_subscription_period_start.sql` (`subscriptions.current_period_start`
  für Premium-Ticketfenster)

## 4. ElevenLabs-Agent
- „34a Master – Mündliche Prüfung (**Herr Müller**)", Sprache **de**, Modell `eleven_flash_v2_5`.
- `agent_id` liegt als Supabase-Secret `ELEVENLABS_AGENT_ID` (nicht im Repo).
- Dynamic Variables: `mode`, `focus_topic`, `scenario_id`, `scenario_title`, `scenario_topic`,
  `scenario_brief`, `scenario_expected`, `candidate_name`, `session_seed`.
- Prüfer-Name (im Prompt **und** in der UI [`OralExamLive.tsx`]) = **Herr Müller**.
- Aktueller Stand (2026-06-19): `oral-exam-session` wählt ein konkretes Szenario aus einem kuratierten
  Pool, meidet die letzten Fälle des Nutzers und übergibt es an ElevenLabs. `session_seed` bleibt als
  zusätzliche Variation für Orte, Namen, Reihenfolge und Nachfragen. Der alte Modus `full_test_6q` ist
  entfernt.
- Root Cause für wiederholte gleiche Fallfragen (behoben 2026-06-19): Der live gespeicherte
  ElevenLabs-Agent hatte noch den alten Prompt (`full_test_6q`, keine `scenario_*`-Variablen,
  `temperature=0`). Das Backend sendete zwar neue Szenarien, der Agent nutzte sie aber nicht.
  Der Agent wurde per API aktualisiert: First Message enthält jetzt `{{scenario_brief}}`, der Prompt
  erzwingt den übergebenen ersten Fall und `temperature=0.7` ist aktiv.
- Follow-up-Fix (2026-06-19): Premium-Gespräche konnten bei sehr schlechten/kurzen Antworten zu früh
  enden, weil der Prompt widersprüchlich war („höchstens eine Rückfrage" vs. Premium 1-2 Rückfragen)
  und die Ende-Regel nicht hart an die Fallanzahl gekoppelt war. Der Agent-Prompt zählt Hauptfälle nun
  intern: `free_test_3q` endet nach genau 3 Hauptfällen, `full_simulation` nach genau 8 Hauptfällen.
  Free nutzt maximal 1 Rückfrage pro Hauptfall; Premium nutzt bis zu 3 Rückfragen pro Hauptfall.
  Bei schlechten Antworten oder „Ich weiß es nicht" darf der Agent nicht abbrechen, sondern muss zum
  nächsten Hauptfall gehen. Temperature wurde auf `0.45` gesetzt, weil Backend-Szenarien die Variation
  liefern und der Agent die Zählregeln verlässlicher befolgen soll. Der technische Premium-Backstop
  liegt jetzt bei 900 Sekunden.

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
- Im öffentlichen Ticketmodell greift der Premium-Hinweis für Free-Nutzer im Modus `free_test_3q`.

## 4c. Prüfungstickets (Public-Launch, 2026-06-19)
- Gäste sehen die Karte, müssen sich aber registrieren/anmelden, bevor eine Session gestartet wird.
- Free-Nutzer erhalten **1 Mini-Simulation** (`free_test_3q`, 180 Sekunden).
- Premium-Nutzer erhalten **10 Vollsimulationen pro Abo-Zeitraum** (`full_simulation`, 900 Sekunden).
- Ein Ticket wird beim Start reserviert: `oral-exam-session` holt zuerst die ElevenLabs Signed URL und
  legt danach die Session-Zeile an. Provider-/Secret-Fehler vor der Signed URL verbrauchen kein Ticket.
- Verbrauch wird über gestartete `oral_exam_sessions` gezählt, nicht nur über erfolgreich ausgewertete
  Sessions. Abgebrochene Sessions zählen, weil bereits KI-Kosten entstehen können.

## 4d. Sprech-Animationen (UI, `OralExamLive.tsx`)
- **Prüfer spricht**: primär über den hörbaren Ausgangspegel `getOutputVolume()` plus SDK-Modus
  (`isSpeaking`/`mode`) ermittelt. Dadurch hängt die Anzeige nicht an verspäteten oder vorgezogenen
  Transkript-Events.
- **Nutzer spricht**: `getInputVolume()` wird per `requestAnimationFrame` gepollt; ab Pegel > 0,025
  erscheint ein **pegelreaktiver emerald-Ring** (skaliert mit der Lautstärke) + Status „Du sprichst…".
  Bei stummem Mikro 0 → Status „Mikrofon stumm".

## 4e. Live-Flow-Stabilisierung (2026-06-19)
- `full_simulation` ist der kanonische Vollmodus; `full_5min` bleibt nur Legacy-kompatibel.
- `oral-exam-session` wählt pro Session ein konkretes Szenario und sendet zusätzlich einen zufälligen
  `session_seed` an ElevenLabs. Ursache für wiederholte gleiche Fälle war, dass vorher nur
  `focus_topic="alle"` plus Seed gesendet wurde; wenn der Agent-Prompt den Seed nicht stark auswertet,
  startet er deterministisch mit demselben Fall.
- Mikrofon-Zugriff wird vor dem ElevenLabs-Start explizit geprüft. Wenn der Browser den Zugriff nicht
  bestätigt, zeigt die UI einen Fehler mit „Mikrofon-Zugriff erneut erlauben".
- ElevenLabs-Regie-Tags wie `[happy]` werden im Live-Transkript und vor der Auswertung entfernt.
- DevPanel-Mock bleibt rein lokal (`?devMock=1`): kein Admin, keine Session, kein Mikrofon, kein
  ElevenLabs. Gleiche Fragen im Mock sind absichtlich feste Testdaten.

## 5. Gating
| Nutzer | Verhalten |
|---|---|
| Ausgeloggt | Karte sichtbar; Klick öffnet Registrierung/Login; keine Session wird angelegt |
| Eingeloggt, Free | 1 Mini-Simulation; danach `paywallRequired` und Paywall |
| Eingeloggt, Premium | 10 Vollsimulationen im aktuellen Abo-Zeitraum; danach `ticketLimitReached` |
| Transition-Grant | Zählt wie Premium innerhalb des Grant-Fensters (`starts_at`/`ends_at`) |

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
- **Deployment:** Migration `20260619170928_add_subscription_period_start.sql` anwenden,
  `oral-exam-entitlement`, `oral-exam-session`, `oral-exam-evaluation` und Stripe-Sync/Webhook-Functions
  deployen, danach Frontend-Prod-Deploy.
- **Launch-Test:** Echte Free-Registrierung, 1 Mini-Simulation, Paywall danach; echtes Premium-Konto mit
  10er-Zähler, Verbrauch nach Start, Blockade bei 0 Tickets.
- **Später:** UI-Optimierungen nach Nutzungsdaten, Flashcards/RAG für ElevenLabs, kuratierter Szenario-Pool.

## Verweise
- **Funktionsweise (vollständige Referenz):** [ki-muendliche-pruefungssimulation-funktionsweise.md](ki-muendliche-pruefungssimulation-funktionsweise.md)
- Vision: [ki-muendliche-pruefungssimulation.md](ki-muendliche-pruefungssimulation.md)
- Edge Functions: [../agents/04-edge-functions.md](../agents/04-edge-functions.md) · Datenmodell:
  [../agents/03-datenmodell.md](../agents/03-datenmodell.md)
