---
title: KI-Mündliche-Prüfungssimulation — Funktionsweise (vollständige Referenz)
scope: Produkt / Technik — wie es funktioniert & bewertet
status: aktiv (Admin-only Soft-Launch)
last_verified: 2026-06-19
---

# Mündliche Prüfungssimulation — wie sie funktioniert & bewertet

> **Diese Datei ist die zentrale, vollständige Referenz** für alles, was die mündliche
> Prüfungssimulation in diesem Projekt betrifft: Ablauf, Architektur, Sprach-KI, Bewertung,
> Datenmodell, Gating, Dateien, Secrets, Analytics, Betrieb & Fehlersuche.
>
> Verwandt: [Vision/Produkt-Spec](ki-muendliche-pruefungssimulation.md) ·
> [Umsetzung/As-Built & Phasen](ki-muendliche-pruefungssimulation-umsetzung.md) ·
> [Edge Functions](../agents/04-edge-functions.md) · [Datenmodell](../agents/03-datenmodell.md)

---

## 1. Was es ist (in einem Satz)

Der Nutzer **spricht** mit einer KI-Prüfer-Stimme („Herr Müller"), die praxisnahe §34a-Fallbeispiele
stellt und dynamisch nachfragt; danach bewertet ein zweites KI-Modell (OpenAI) das Gesprächs-Transkript
und liefert Score, Pass/Fail (Grenze **50 %**), Themen-Scores, Stärken/Lücken, Musterantworten,
„roter Faden" und den nächsten Übungsschritt.

Zwei KI-Bausteine, klar getrennt:
- **ElevenLabs Conversational AI** → führt das Live-Gespräch (Sprache rein/raus). Bewertet **nicht**.
- **OpenAI Responses API** (`OPENAI_MODEL`, Default `gpt-4.1`) → bewertet **nach** dem Gespräch das Transkript als Structured Output.

---

## 2. Nutzer-Ablauf (User Journey)

```
/exam  ──(Admin)──▶  Karte "Mündliche Prüfung"  ──▶  /oral-exam (Intro)
   │
   │  Intro: Kurzinfo + Test-Modus-Wahl (Free/Premium, Admin) + "Mündliche Prüfung starten" (alle Themen)
   │  Vor dem Start: Pflicht-Popup zu ruhigem Raum, Hintergrundgeräuschen und Mikrofon-Zugriff
   ▼
/oral-exam/live
   │  1. Mikrofon-Freigabe (Browser-Prompt)
   │  2. Verbindung zum Prüfer (ElevenLabs WebSocket)
   │  3. Gespräch: Prüfer stellt Fallbeispiel → Nutzer spricht → Prüfer fragt nach …
   │     - Live-Transkript läuft mit
   │     - Countdown (Free 3 Min / Voll 8-12 Min als technischer Backstop)
   │     - "Prüfung beenden" jederzeit, oder Timeout, oder Prüfer beendet
   ▼  finish(): Session beenden → Transkript an Bewertung schicken
/oral-exam/results/:sessionId
   │  Score + Bestanden/Nicht bestanden, KI-Zusammenfassung, Pro-Antwort-Bewertung
   │  (+ Empfehlungen), Audio-Player, Themen-Balken, Stärken/Lücken,
   │  Musterantworten, roter Faden, nächster Schritt
   ▼  "Nochmal üben" → /oral-exam   |   "Verlauf" → /oral-exam/history
```

---

## 3. Architektur & Datenfluss (As-Built)

```
Browser (React 19 SPA)                         Supabase Edge (Deno)            Externe KI
──────────────────────                         ────────────────────           ──────────
OralExamIntro
  startOralExamSession(focusTopic)
     └─ supabase.functions.invoke ───────────▶ oral-exam-session
                                                 · JWT prüfen (verify_jwt)
                                                 · Admin-Gate (Soft-Launch)
                                                 · Modus/Premium bestimmen
                                                 · Zeile in oral_exam_sessions (running)
                                                 · Signed URL holen ──────────▶ ElevenLabs
                                                                                 get-signed-url
     ◀── { sessionId, mode, maxDurationSec, signedUrl, dynamicVariables inkl. session_seed } ──┘

OralExamLive (@elevenlabs/react)
  useConversation.startSession({ signedUrl, connectionType:'websocket', dynamicVariables })
     ◀────────── WebSocket: Sprache rein/raus, Turn-Taking ──────────────────▶ ElevenLabs Agent
     · onConnect → conversationId merken                                        (Herr Müller)
     · onMessage → Live-Transkript (Fallback)
     · Timer/Beenden/onDisconnect → finish()

  evaluateOralExam(sessionId, transcript, durationS, conversationId)
     └─ supabase.functions.invoke ───────────▶ oral-exam-evaluation
                                                 · Idempotenz-Check (schon done?)
                                                 · Transkript autoritativ holen ─▶ ElevenLabs
                                                   (Fallback: Client-Transkript)   conversations/{id}
                                                · Transkript früh speichern
                                                · Bewerten ───────────────────▶ OpenAI Responses API
                                                · in oral_exam_sessions schreiben (done)
                                                · bei KI-Fehler: evaluation_failed + Retry im Verlauf
     ◀── { result: {…Bewertung…} } ─────────────────────────────────────────┘

OralExamResults  → liest result (aus Navigation-State) oder lädt Zeile per RLS aus DB
OralExamHistory  → listOralExamSessions() per RLS
```

**Designentscheidung (statt Webhooks):** Das maßgebliche Transkript wird in der Auswertung
**serverseitig per ElevenLabs Conversation-API** geholt (mit kurzen Retries), Client-Transkript nur als
Fallback. Damit ist die Bewertung robust gegen unvollständige Client-Daten — ohne ElevenLabs-Dashboard-
Webhook-Konfiguration.

---

## 4. Schritt 1 — `oral-exam-session` (Gespräch starten)

Datei: [`supabase/functions/oral-exam-session/index.ts`](../../supabase/functions/oral-exam-session/index.ts) · `verify_jwt = true`

**Request** (`POST`, JWT im `Authorization`-Header — von `supabase.functions.invoke` automatisch):
```json
{ "focus_topic": "Umgang mit Menschen / Deeskalation" }   // optional, null = alle Themen
```
> Hinweis: Das Backend akzeptiert `focus_topic` weiterhin, aber die **UI bietet aktuell keine
> Schwerpunkt-Auswahl** an — der Start sendet immer `null` (alle Themen). Die Themen-Konstante
> `ORAL_EXAM_FOCUS_TOPICS` in `types.ts` bleibt für eine spätere Reaktivierung erhalten.

**Ablauf serverseitig:**
1. **Auth:** Nutzer aus JWT auflösen → kein Nutzer ⇒ `401 {error:"unauthorized"}`.
2. **Admin-Gate (Soft-Launch):** Nur `m.almajzoub1@gmail.com` darf ⇒ sonst `403 {error:"feature_not_available"}`.
3. **Premium/Modus:** Admin darf den Modus explizit wählen (`requested_mode` = `free_test_3q`/`full_simulation`,
   für Tests beider Abläufe); sonst Admin ⇒ `full_simulation`. (Für späteren öffentlichen Launch: `isUserPremium()`
   prüft `subscriptions`, `user_profiles.is_premium`, aktive `access_grants`; `requested_mode` ist für
   Nicht-Admins wirkungslos.)
4. **Free-Gating:** Nicht-Premium mit bereits 1 abgeschlossenem Gratis-Test ⇒ `200 {paywallRequired:true}`.
5. **Session anlegen:** Zeile in `oral_exam_sessions` mit `status='running'`.
6. **Signed URL:** von ElevenLabs holen (`xi-api-key` bleibt serverseitig).
7. **Session-Seed:** zufälliger `session_seed` wird erzeugt und als Dynamic Variable an ElevenLabs
   übergeben, damit neue Sessions andere Fälle/Reihenfolgen nutzen.

**Erfolg (`200`):**
```json
{
  "sessionId": "uuid",
  "mode": "full_simulation",            // | "free_test_3q"
  "maxDurationSec": 720,          // 720 (voll) | 180 (free)
  "signedUrl": "wss://…",
  "dynamicVariables": { "mode": "full_simulation", "focus_topic": "alle", "candidate_name": "Max", "session_seed": "a1b2c3d4" }
}
```

**Modi & Limits:**
| Modus | Dauer-Limit (Client-Timer) | Wer |
|---|---|---|
| `free_test_3q` | 180 s | eingeloggt, ohne Premium (1× gratis) |
| `full_simulation` | 720 s | Premium / Admin |

> Echte Kosten-Backstops: Client-Timer **und** Max-Dauer des ElevenLabs-Agents (720 s).

---

## 5. Die Sprach-KI — ElevenLabs Agent „Herr Müller"

- **Conversational-AI-Agent** bei ElevenLabs (Voice rein/raus, Turn-Taking, Barge-in).
- Sprache **Deutsch**, Modell `eleven_flash_v2_5` (niedrige Latenz), Max-Dauer 720 s als Kosten-Backstop.
- **`agent_id` ist KEIN Repo-Wert** — liegt als Supabase-Secret `ELEVENLABS_AGENT_ID`.
- **Dynamic Variables** (vom Backend gesetzt, im Agent-Prompt nutzbar): `mode`, `focus_topic`,
  `candidate_name`, `session_seed` → erlauben Personalisierung, Modus-abhängiges Verhalten
  (3 Fälle vs. volle Simulation) und abwechslungsreiche Fallauswahl pro Session.
- Aktueller Agent-Stand (verifiziert 2026-06-19): `full_simulation`, 6 Hauptfälle, 1-2 Rückfragen,
  `temperature=0.7`, `max_duration_seconds=720`, abwechslungsreiche Szenarien per `{{session_seed}}`.
- **Rolle des Agents:** stellt praxisnahe Fallbeispiele, fragt dynamisch nach („Warum?", „Und wenn …?"),
  benotet **nicht laut** (Bewertung passiert separat in Schritt 3), beendet neutral.

**Frontend-Anbindung** ([`OralExamLive.tsx`](../../src/components/pages/OralExamLive.tsx)) via
`@elevenlabs/react` (v1.7):
- Muss in `<ConversationProvider>` gewrappt sein; `useConversation({ onConnect, onMessage, onDisconnect, onError })`.
- Start: zuerst `getUserMedia({audio:true})` (saubere Mikro-Freigabe), dann
  `startSession({ signedUrl, connectionType:'websocket', dynamicVariables })`.
- Wenn die Mikrofon-Freigabe verweigert wird, zeigt die UI einen Fehler mit Retry-Button. Der Retry
  wird durch einen Nutzerklick ausgelöst, damit iOS, Android und Desktop-Browser die Berechtigungsabfrage
  erneut anzeigen können, sofern der Browser sie nicht dauerhaft blockiert hat.
- `onConnect({conversationId})` → ID merken (für die Auswertung).
- `onMessage({message, role})` → Live-Transkript; `role:'agent'`→`examiner`, sonst `candidate`.
- Regie-/Emotions-Tags in eckigen Klammern (`[happy]`, `[slow]` usw.) werden aus UI-Transkript und
  Bewertungs-Transkript entfernt.
- Sprechstatus: „Der Prüfer spricht…" basiert primär auf `getOutputVolume()` und nicht allein auf
  Transkript-Events. „Du sprichst…" basiert auf `getInputVolume()`.
- Layout: Der Live-Screen ist ein fixierter `100dvh`-Layer. Die Seite selbst scrollt nicht; nur das
  Transkriptfenster ist scrollbar und scrollt bei jeder neuen Nachricht automatisch zum letzten Text.
- Beenden: „Prüfung beenden", Timer-Ablauf oder `onDisconnect` ⇒ `finish()` (doppelter Aufruf wird
  hart verhindert). Verlassen ohne Abschluss ⇒ `abortOralExamSession` + `endSession`.

---

## 6. Schritt 3 — `oral-exam-evaluation` (Bewertung)

Datei: [`supabase/functions/oral-exam-evaluation/index.ts`](../../supabase/functions/oral-exam-evaluation/index.ts) · `verify_jwt = true`

**Request** (`POST`):
```json
{
  "sessionId": "uuid",
  "transcript": [{ "role": "examiner", "text": "…" }, { "role": "candidate", "text": "…" }],
  "durationS": 247,
  "conversationId": "elevenlabs-conv-id"
}
```

**Ablauf:**
1. **Auth** (JWT) → kein Nutzer ⇒ `401`.
2. **Idempotenz:** Ist die Session bereits `done`, wird das **vorhandene** Ergebnis zurückgegeben
   (kein zweiter OpenAI-Aufruf, keine Kosten).
3. **Transkript bestimmen:** zuerst **autoritativ von ElevenLabs** (`GET /v1/convai/conversations/{id}`,
   bis zu 5 Versuche mit steigender Wartezeit, falls noch „processing"); Fallback = Client-Transkript,
   danach ggf. bereits gespeichertes Transkript. Leer ⇒ Fehler.
4. **Transkript früh speichern:** Sobald ein Transkript vorhanden ist, wird es in `oral_exam_sessions.transcript`
   gesichert. Dadurch kann eine spätere Provider-/JSON-Störung über die Ergebnisseite erneut ausgewertet werden.
5. **Bewertung (OpenAI):** Responses API, `OPENAI_MODEL` (Default `gpt-4.1`), `temperature 0.3`,
   `max_output_tokens 8192`, Structured Output per JSON Schema.
6. **Audio sichern (best-effort):** vollständiges Gesprächs-Audio von ElevenLabs
   (`GET /v1/convai/conversations/{id}/audio`, `audio/mpeg`) → privater Bucket `oral-exam-audio`
   unter `{user_id}/{sessionId}.mp3`; Pfad in `audio_path`. Audio-Fehler lassen die Bewertung nicht scheitern.
7. **Speichern:** `status='done'`, `ended_at`, `duration_s`, `transcript`, `overall_score_pct`,
   `passed`, `topic_scores`, `feedback` (inkl. `summary` + `answer_evaluations`), `audio_path` in `oral_exam_sessions`.
8. **Fehler speichern:** Wenn die KI-Auswertung nach vorhandenem Transkript scheitert, wird
   `status='evaluation_failed'` mit `feedback.error`/`feedback.retryable=true` gespeichert. Verlauf und
   Ergebnisseite zeigen die Session als fehlgeschlagen und bieten „Auswertung erneut versuchen“ an.

**Bewertungs-Maßstab (Prompt):** „erfahrener IHK-Prüfer", **fair, aber nach echten IHK-Maßstäben**.
Bewertet **nicht nur Faktenwissen**, sondern auch **Praxis-Angemessenheit, Deeskalations-Haltung,
Struktur und Begründung**. **Bestehensgrenze: 50 %.** Regeln: nur tatsächlich vorgekommene Themen
bewerten, juristisch korrekt bleiben (keine erfundenen Rechtsgrundlagen), bei kaum Gesagtem niedriger
Score + Erklärung in `gaps`, `passed` muss konsistent zu `overall_score_pct` sein (≥50 ⇒ true).

**Ergebnis-JSON (`result`)** — gleichzeitig der Inhalt der Ergebnis-Seite:
```json
{
  "overall_score_pct": 0-100,
  "passed": true|false,                  // serverseitig erzwungen: overall_score_pct >= 50
  "summary": "2-4 Sätze: wie die Prüfung lief, bestanden/nicht, Hauptschwächen",
  "topic_scores": [{ "topic": "…", "score_pct": 0-100, "comment": "1 Satz" }],
  "answer_evaluations": [{ "question": "…", "candidate_answer": "…", "score_pct": 0-100, "verdict": "correct|partial|wrong", "recommendation": "nur bei partial/wrong" }],
  "strengths": ["…"],
  "gaps": ["…"],
  "model_answers": [{ "scenario": "…", "musterantwort": "…" }],
  "roter_faden": ["2-3 Sätze für die echte Prüfung"],
  "next_step": "1 konkreter nächster Übungsschritt",
  "audio_path": "{user_id}/{sessionId}.mp3 | null"
}
```
> `summary` (KI-Gesamt-Zusammenfassung) und `answer_evaluations` (**Pro-Antwort-Bewertung**: je
> Prüfer-Frage Score + `verdict` + Empfehlung) liegen in der DB im `feedback`-JSON. Die
> Ergebnis-Seite zeigt sie als „Zusammenfassung des Prüfers", „Deine Antworten im Detail" und (falls
> `audio_path` gesetzt) einen Audio-Player über eine **signierte URL** (`getOralExamAudioUrl`, 1 h).
> Die Zusammenfassung ist visuell mit der Score-Karte verbunden und nutzt eine hellere Variante der
> Bestanden-/Nicht-bestanden-Farbe.

> Der Score wird serverseitig auf 0–100 geklemmt/gerundet und `passed = overall_score_pct >= 50`
> **autoritativ** neu gesetzt (unabhängig davon, was das Modell für `passed` lieferte).

---

## 7. Datenmodell — Tabelle `oral_exam_sessions`

Migration: [`supabase/migrations/20260616175910_create_oral_exam_sessions.sql`](../../supabase/migrations/20260616175910_create_oral_exam_sessions.sql)
· **RLS aktiv** (jeder sieht/ändert nur eigene Zeilen).

| Spalte | Typ | Bedeutung |
|---|---|---|
| `id` | uuid (PK, default `gen_random_uuid()`) | Session-ID |
| `user_id` | uuid (FK → `auth.users`, NOT NULL) | Besitzer |
| `mode` | text | `free_test_3q` \| `full_simulation` |
| `focus_topic` | text \| null | gewählter Schwerpunkt |
| `status` | text (default `running`) | `running` \| `done` \| `aborted` \| `evaluation_failed` |
| `started_at` | timestamptz (default `now()`) | Start |
| `ended_at` | timestamptz \| null | Ende |
| `duration_s` | int \| null | Gesprächsdauer |
| `transcript` | jsonb \| null | `[{role, text}]` |
| `overall_score_pct` | int \| null | Gesamt-Score |
| `passed` | bool \| null | bestanden (≥50 %) |
| `topic_scores` | jsonb \| null | `[{topic, score_pct, comment}]` |
| `feedback` | jsonb \| null | `{summary, strengths, gaps, answer_evaluations, model_answers, roter_faden, next_step}` |
| `audio_path` | text \| null | Pfad im privaten Bucket `oral-exam-audio` (`{user_id}/{sessionId}.mp3`) |
| `created_at` | timestamptz (default `now()`) | Anlage |

**Audio-Storage:** privater Bucket `oral-exam-audio` (Migration `20260618210000_oral_exam_audio.sql`),
RLS-Policy `oral_exam_audio_read_own` erlaubt SELECT nur im eigenen Ordner; Upload via Service-Role
in der Edge Function (umgeht RLS), Wiedergabe via signierter URL.

**Index:** `oral_exam_sessions_user_created_idx (user_id, created_at DESC)` (für Verlaufsliste).
**RLS-Policies:** `select/insert/update` jeweils `auth.uid() = user_id`. (Edge Functions nutzen den
Service-Role-Key und umgehen RLS bewusst.)

---

## 8. Gating-Übersicht

| Nutzer | Heute (Admin-only Soft-Launch) |
|---|---|
| Admin (`m.almajzoub1@gmail.com`) | Karte sichtbar; voller Zugriff `full_simulation`, unbegrenzt |
| Eingeloggt, kein Admin | Karte **unsichtbar**; `/oral-exam*` → Redirect; Backend `403 feature_not_available` |
| Ausgeloggt | wie oben (kein Zugriff) |

Das Gating ist an **drei Stellen** verankert (alle drei müssen für den öffentlichen Launch fallen):
1. **Frontend-Karte:** `showOralExam = isAdminEmail(user?.email)` in [`ExamSelection.tsx`](../../src/components/pages/ExamSelection.tsx)
2. **Routen:** `<AdminGuard>` um `/oral-exam*` in [`App.tsx`](../../src/App.tsx)
3. **Backend:** `ADMIN_EMAILS`-Check in `oral-exam-session`

Die Logik für den **öffentlichen** Betrieb (1 Gratis-Test → Paywall, Premium = `full_simulation`) ist bereits
eingebaut und greift automatisch, sobald das Admin-Gate entfernt wird.

---

## 9. Frontend-Dateien (Überblick)

| Datei | Rolle |
|---|---|
| [`src/components/pages/OralExamIntro.tsx`](../../src/components/pages/OralExamIntro.tsx) | Einstieg, Test-Modus-Wahl (Free/Premium), Start; behandelt `feature_not_available`/`paywallRequired` |
| [`src/components/pages/OralExamLive.tsx`](../../src/components/pages/OralExamLive.tsx) | Live-Gespräch (ElevenLabs), Mikro, Timer, Transkript, Sprech-Animationen, `finish()` |
| [`src/components/pages/OralExamResults.tsx`](../../src/components/pages/OralExamResults.tsx) | Auswertung (Score, KI-Zusammenfassung, Pro-Antwort-Bewertung, Audio-Player, Themen-Balken, Stärken/Lücken, Musterantworten, roter Faden) + Fehlerzustand mit Retry |
| [`src/components/pages/OralExamHistory.tsx`](../../src/components/pages/OralExamHistory.tsx) | Verlauf der eigenen Durchläufe |
| [`src/services/oralExam.ts`](../../src/services/oralExam.ts) | API: `startOralExamSession`, `evaluateOralExam`, `getOralExamSession`, `listOralExamSessions`, `abortOralExamSession`, `getOralExamAudioUrl` + Fehlerklassen |
| [`src/types.ts`](../../src/types.ts) | `OralExam*`-Typen + `ORAL_EXAM_FOCUS_TOPICS` |
| [`src/components/pages/ExamSelection.tsx`](../../src/components/pages/ExamSelection.tsx) | Einstiegskarte (Admin-gated) |
| [`src/App.tsx`](../../src/App.tsx) | Routen (lazy, in `<AdminGuard>`) |
| [`src/contexts/PostHogProvider.tsx`](../../src/contexts/PostHogProvider.tsx) | Analytics-Events |
| Reuse | [`isAdminEmail`](../../src/utils/userRoles.ts), [`AdminGuard`](../../src/components/pages/admin/AdminGuard.tsx) |

Dependency: `@elevenlabs/react` (Hook `useConversation` + `ConversationProvider`).

---

## 10. Analytics (PostHog)

| Event | Wann | Properties |
|---|---|---|
| `oral_exam_started` | Beim erfolgreichen Start (Intro) | `mode`, `topic` |
| `oral_exam_completed` | Beim Anzeigen einer fertigen Auswertung | `score`, `passed`, `mode` |

> Hinweis: PostHog ist auf **localhost deaktiviert** (siehe `PostHogProvider.initializePostHog`) — Events
> erscheinen nur in Produktion.

---

## 11. Secrets (Supabase Function Secrets — nie im Repo/Frontend)

| Secret | Genutzt von | Zweck |
|---|---|---|
| `ELEVENLABS_API_KEY` | beide oral-Functions | Signed URL holen / Transkript abrufen |
| `ELEVENLABS_AGENT_ID` | `oral-exam-session` | welcher Agent (Herr Müller) |
| `OPENAI_API_KEY` | `oral-exam-evaluation` | OpenAI-Bewertung |
| `OPENAI_MODEL` | `oral-exam-evaluation` | optional, Default `gpt-4.1` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | beide | DB-Zugriff / Auth |
| `ALLOWED_ORIGIN` | beide | CORS |

Status: live gesetzt und funktionsfähig (belegt durch erfolgreiche Session-Zeilen in der DB).

---

## 12. Betrieb & Fehlersuche

**Lokaler Admin-Test:** `npm run dev` → als `m.almajzoub1@gmail.com` einloggen → `/exam` →
„Mündliche Prüfung" → Mikro erlauben → sprechen → beenden → Auswertung.

**Diagnose via Supabase-MCP:**
- Edge-Logs: `get_logs` (Service `edge-function`) für `oral-exam-session` / `oral-exam-evaluation`.
- DB prüfen: `execute_sql` →
  `SELECT id,status,mode,overall_score_pct,passed,duration_s,created_at FROM oral_exam_sessions ORDER BY created_at DESC LIMIT 10;`

**Häufige Fälle:**
| Symptom | Ursache / Lösung |
|---|---|
| `403 feature_not_available` | Kein Admin — erwartet im Soft-Launch |
| `paywallRequired` | Nicht-Premium nach Gratis-Test (öffentlicher Launch) |
| Kein Ton / keine Verbindung | Mikro-Freigabe verweigert; `ELEVENLABS_*`-Secrets prüfen; `signedUrl` abgelaufen |
| Gleiche Fragen im Dev-Mock | Erwartet: `?devMock=1` nutzt feste lokale Testdaten, keine echte ElevenLabs-Session |
| Gleiche Fragen in Live-Sessions | Agent-Prompt/Temperature/`session_seed` prüfen; Stand 2026-06-19 nutzt `temperature=0.7` und `session_seed` |
| Status zeigt falschen Sprecher | `getOutputVolume()`/`getInputVolume()` prüfen; Transkript-Events dürfen nicht allein als Audio-Status dienen |
| „Kein Transkript verfügbar" | Gespräch zu kurz / leer; ElevenLabs-Conversation noch nicht fertig (Retry greift) |
| Auswertung schlägt fehl | `OPENAI_API_KEY` fehlt/ungültig; OpenAI-Antwort nicht schema-valide; Session wird bei vorhandenem Transkript `evaluation_failed` |
| Session bleibt `running` / `aborted` | Altfall oder Abbruch ohne erfolgreiche Auswertung → wird im Verlauf sichtbar; ohne gespeichertes Transkript ist nur „Neue Prüfung starten“ möglich |

---

## 13. Checkliste öffentlicher Launch (noch offen)

1. **`user_profiles` erweitern** um `is_premium`, `first_name`, `full_name` — sonst greifen der
   Premium-Check (Pfad 2) und `candidate_name` für Nicht-Admins nicht (aktuell fehlen diese Spalten).
2. **Admin-Gate entfernen** an allen drei Stellen (Karte, `AdminGuard`-Routen, `ADMIN_EMAILS` in
   `oral-exam-session`).
3. **`oral-exam-session` neu deployen** (nach Gate-Entfernung) + **Frontend-Prod-Deploy**.
4. Optional Phase 5: 15-Min-Modus, mehrere Prüfer-Personas, kuratierter Szenario-Pool
   (juristische Endkontrolle), echte Post-Call-Webhooks.

---

## 14. Abgrenzung — was NICHT dazugehört

Im selben Supabase-Projekt liegt eine **verwaiste Fremd-Function** `elevenlabs-closer-webhook`
(B2B-Lead-System „AI-Call-Agent für Umzugsfirmen", erwartet `closer_*`-Tabellen, die es nicht gibt).
Sie hat **nichts** mit der mündlichen Prüfung zu tun → ignorieren, nicht anfassen.
