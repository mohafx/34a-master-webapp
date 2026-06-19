---
title: KI-Mündliche-Prüfungssimulation — Funktionsweise (vollständige Referenz)
scope: Produkt / Technik — wie es funktioniert & bewertet
status: aktiv (Public-Launch-Gating mit Prüfungstickets)
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
/exam  ──▶  Karte "Mündliche Prüfung"  ──▶  Gast: Registrierung/Login
   │                                      └─▶  Eingeloggt: /oral-exam (Intro)
   │
   │  Intro: Kurzinfo + Prüfungstickets + "Mündliche Prüfung starten" (alle Themen)
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
  getOralExamEntitlement()
     └─ supabase.functions.invoke ───────────▶ oral-exam-entitlement
                                                 · JWT prüfen (verify_jwt)
                                                 · Premium/Ticketfenster bestimmen
                                                 · Verbrauch zählen
     ◀── { entitlement: { isPremium, mode, used, limit, remaining, windowEndsAt } }

  startOralExamSession(focusTopic)
     └─ supabase.functions.invoke ───────────▶ oral-exam-session
                                                 · JWT prüfen (verify_jwt)
                                                 · Prüfungstickets autoritativ prüfen
                                                 · Signed URL holen ──────────▶ ElevenLabs
                                                                                 get-signed-url
                                                 · Zeile in oral_exam_sessions (running)
     ◀── { sessionId, mode, maxDurationSec, signedUrl, dynamicVariables inkl. session_seed, entitlement } ──┘

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

## 4. Schritt 1 — Prüfungstickets laden und Gespräch starten

Dateien:
- [`supabase/functions/oral-exam-entitlement/index.ts`](../../supabase/functions/oral-exam-entitlement/index.ts) · `verify_jwt = true`
- [`supabase/functions/oral-exam-session/index.ts`](../../supabase/functions/oral-exam-session/index.ts) · `verify_jwt = true`
- Shared: [`supabase/functions/_shared/oral-exam-entitlement.ts`](../../supabase/functions/_shared/oral-exam-entitlement.ts)

### `oral-exam-entitlement`

Lädt den UI-Status, ohne eine ElevenLabs-Session anzulegen.

**Erfolg (`200`):**
```json
{
  "entitlement": {
    "isPremium": true,
    "mode": "full_simulation",
    "used": 2,
    "limit": 10,
    "remaining": 8,
    "windowStartsAt": "2026-06-01T00:00:00.000Z",
    "windowEndsAt": "2026-07-01T00:00:00.000Z"
  }
}
```

**Regeln:**
- Gäste bekommen `401 {error:"unauthorized"}`; das Frontend öffnet Registrierung/Login.
- Free-Nutzer: Limit 1, Modus `free_test_3q`.
- Premium-Nutzer: Limit 10, Modus `full_simulation`, gezählt im Abo-Zeitraum
  `subscriptions.current_period_start` bis `current_period_end`.
- Aktive `access_grants` zählen wie Premium im Grant-Fenster `starts_at` bis `ends_at`.

### `oral-exam-session`

**Request** (`POST`, JWT im `Authorization`-Header — von `supabase.functions.invoke` automatisch):
```json
{ "focus_topic": "Umgang mit Menschen / Deeskalation" }   // optional, null = alle Themen
```
> Hinweis: Das Backend akzeptiert `focus_topic` weiterhin, aber die **UI bietet aktuell keine
> Schwerpunkt-Auswahl** an — der Start sendet immer `null` (alle Themen). Die Themen-Konstante
> `ORAL_EXAM_FOCUS_TOPICS` in `types.ts` bleibt für eine spätere Reaktivierung erhalten.

**Ablauf serverseitig:**
1. **Auth:** Nutzer aus JWT auflösen → kein Nutzer ⇒ `401 {error:"unauthorized"}`.
2. **Prüfungstickets:** gleiche Logik wie `oral-exam-entitlement`.
3. **Limit erreicht:** Free ⇒ `200 {paywallRequired:true, entitlement}`; Premium ⇒
   `200 {ticketLimitReached:true, entitlement}`.
4. **Signed URL:** von ElevenLabs holen (`xi-api-key` bleibt serverseitig).
5. **Session anlegen:** Zeile in `oral_exam_sessions` mit `status='running'`. Das Ticket ist damit verbraucht.
6. **Fallauswahl:** Das Backend wählt ein konkretes Szenario aus dem kuratierten Pool, meidet die
   letzten Fälle dieses Nutzers und übergibt `scenario_*` plus `focus_topic` an ElevenLabs.
7. **Session-Seed:** zusätzlicher zufälliger `session_seed` wird erzeugt und als Dynamic Variable an
   ElevenLabs übergeben, damit Reihenfolge, Orte und Nachfragen weiter variieren können.

**Erfolg (`200`):**
```json
{
  "sessionId": "uuid",
  "mode": "full_simulation",            // | "free_test_3q"
  "maxDurationSec": 900,          // 900 (voll) | 180 (free)
  "signedUrl": "wss://…",
  "entitlement": { "isPremium": true, "used": 3, "limit": 10, "remaining": 7, "windowEndsAt": "…" },
  "dynamicVariables": {
    "mode": "full_simulation",
    "focus_topic": "Zutrittskontrolle / Hausrecht: Ein Besucher möchte ...",
    "scenario_id": "zutritt-ohne-ausweis",
    "scenario_title": "Zutritt ohne Ausweis",
    "scenario_topic": "Zutrittskontrolle / Hausrecht",
    "scenario_brief": "Ein Besucher möchte in ein bewachtes Objekt ...",
    "scenario_expected": "Hausrecht anwenden, Zutritt verweigern ...",
    "candidate_name": "Max",
    "session_seed": "a1b2c3d4"
  }
}
```

**Modi & Limits:**
| Modus | Dauer-Limit (Client-Timer) | Wer |
|---|---|---|
| `free_test_3q` | 180 s | eingeloggt, ohne Premium (1× gratis) |
| `full_simulation` | 900 s | Premium (10× pro Abo-Zeitraum) |

> Echte Kosten-Backstops: Client-Timer **und** Max-Dauer des ElevenLabs-Agents (900 s).
> Tickets werden beim Start verbraucht, nicht erst bei erfolgreicher Auswertung.

---

## 5. Die Sprach-KI — ElevenLabs Agent „Herr Müller"

- **Conversational-AI-Agent** bei ElevenLabs (Voice rein/raus, Turn-Taking, Barge-in).
- Sprache **Deutsch**, Modell `eleven_flash_v2_5` (niedrige Latenz), Max-Dauer 900 s als Kosten-Backstop.
- **`agent_id` ist KEIN Repo-Wert** — liegt als Supabase-Secret `ELEVENLABS_AGENT_ID`.
- **Dynamic Variables** (vom Backend gesetzt, im Agent-Prompt nutzbar): `mode`, `focus_topic`,
  `scenario_id`, `scenario_title`, `scenario_topic`, `scenario_brief`, `scenario_expected`,
  `candidate_name`, `session_seed` → erlauben Personalisierung, Modus-abhängiges Verhalten
  (Mini vs. volle Simulation) und konkrete abwechslungsreiche Fallauswahl pro Session.
- Aktueller Agent-Stand (2026-06-19): Backend wählt ein Szenario und meidet Wiederholungen; der Agent
  bekommt zusätzlich `{{session_seed}}` für Variation bei Reihenfolge, Orten und Nachfragen.
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

| Nutzer | Verhalten |
|---|---|
| Ausgeloggt | Karte sichtbar; Klick öffnet Registrierung/Login; Backend startet keine Session |
| Eingeloggt, Free | 1 Mini-Simulation (`free_test_3q`); danach `paywallRequired` |
| Eingeloggt, Premium | 10 Vollsimulationen (`full_simulation`) pro Abo-Zeitraum; danach `ticketLimitReached` |
| Aktiver Transition-Grant | Wie Premium; Ticketfenster aus `starts_at`/`ends_at` |

Das Gating ist serverseitig autoritativ in `oral-exam-session`; die UI spiegelt den Status aus
`oral-exam-entitlement`. Die Karte in [`ExamSelection.tsx`](../../src/components/pages/ExamSelection.tsx)
ist öffentlich sichtbar. Die Routen `/oral-exam*` sind nicht mehr in `<AdminGuard>`.

---

## 9. Frontend-Dateien (Überblick)

| Datei | Rolle |
|---|---|
| [`src/components/pages/OralExamIntro.tsx`](../../src/components/pages/OralExamIntro.tsx) | Einstieg, Prüfungsticket-Karte, Start; behandelt `paywallRequired`/`ticketLimitReached` |
| [`src/components/pages/OralExamLive.tsx`](../../src/components/pages/OralExamLive.tsx) | Live-Gespräch (ElevenLabs), Mikro, Timer, Transkript, Sprech-Animationen, `finish()` |
| [`src/components/pages/OralExamResults.tsx`](../../src/components/pages/OralExamResults.tsx) | Auswertung (Score, KI-Zusammenfassung, Pro-Antwort-Bewertung, Audio-Player, Themen-Balken, Stärken/Lücken, Musterantworten, roter Faden) + Fehlerzustand mit Retry |
| [`src/components/pages/OralExamHistory.tsx`](../../src/components/pages/OralExamHistory.tsx) | Verlauf der eigenen Durchläufe |
| [`src/services/oralExam.ts`](../../src/services/oralExam.ts) | API: `getOralExamEntitlement`, `startOralExamSession`, `evaluateOralExam`, `getOralExamSession`, `listOralExamSessions`, `abortOralExamSession`, `getOralExamAudioUrl` + Fehlerklassen |
| [`src/types.ts`](../../src/types.ts) | `OralExam*`-Typen + `ORAL_EXAM_FOCUS_TOPICS` |
| [`src/components/pages/ExamSelection.tsx`](../../src/components/pages/ExamSelection.tsx) | Öffentliche Einstiegskarte; Gäste → Registrierung |
| [`src/App.tsx`](../../src/App.tsx) | Routen (lazy, öffentlich für `/oral-exam*`) |
| [`src/contexts/PostHogProvider.tsx`](../../src/contexts/PostHogProvider.tsx) | Analytics-Events |
| Reuse | App-Kontext für Auth/Paywall, `SubscriptionContext` für Frontend-Premiumanzeige |

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
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | oral-Functions | DB-Zugriff / Auth |
| `ALLOWED_ORIGIN` | beide | CORS |

Status: live gesetzt und funktionsfähig (belegt durch erfolgreiche Session-Zeilen in der DB).

---

## 12. Betrieb & Fehlersuche

**Lokaler Launch-Test:** `npm run dev` → Free-Account registrieren → `/exam` →
„Mündliche Prüfung" → Mini-Test starten → danach Paywall prüfen. Zusätzlich Premium-Account mit
10er-Ticketstatus testen.

**Diagnose via Supabase-MCP:**
- Edge-Logs: `get_logs` (Service `edge-function`) für `oral-exam-session` / `oral-exam-evaluation`.
- DB prüfen: `execute_sql` →
  `SELECT id,status,mode,overall_score_pct,passed,duration_s,created_at FROM oral_exam_sessions ORDER BY created_at DESC LIMIT 10;`

**Häufige Fälle:**
| Symptom | Ursache / Lösung |
|---|---|
| `401 unauthorized` | Gast oder abgelaufene Session — Registrierung/Login öffnen |
| `paywallRequired` | Free-Nutzer nach Gratis-Test |
| `ticketLimitReached` | Premium-Nutzer hat 10 Tickets im aktuellen Abo-Zeitraum verbraucht |
| Kein Ton / keine Verbindung | Mikro-Freigabe verweigert; `ELEVENLABS_*`-Secrets prüfen; `signedUrl` abgelaufen |
| Gleiche Fragen im Dev-Mock | Erwartet: `?devMock=1` nutzt feste lokale Testdaten, keine echte ElevenLabs-Session |
| Gleiche Fragen in Live-Sessions | Backend-Fallauswahl und Agent-Prompt prüfen: `oral-exam-session` muss wechselnde `scenario_*` Dynamic Variables liefern; Agent muss diese Variablen verwenden |
| Status zeigt falschen Sprecher | `getOutputVolume()`/`getInputVolume()` prüfen; Transkript-Events dürfen nicht allein als Audio-Status dienen |
| „Kein Transkript verfügbar" | Gespräch zu kurz / leer; ElevenLabs-Conversation noch nicht fertig (Retry greift) |
| Auswertung schlägt fehl | `OPENAI_API_KEY` fehlt/ungültig; OpenAI-Antwort nicht schema-valide; Session wird bei vorhandenem Transkript `evaluation_failed` |
| Session bleibt `running` / `aborted` | Altfall oder Abbruch ohne erfolgreiche Auswertung → wird im Verlauf sichtbar; ohne gespeichertes Transkript ist nur „Neue Prüfung starten“ möglich |

---

## 13. Checkliste öffentlicher Launch

1. Migration `20260619170928_add_subscription_period_start.sql` anwenden.
2. Functions deployen: `oral-exam-entitlement`, `oral-exam-session`, `oral-exam-evaluation`,
   plus geänderte Stripe-/Sync-Functions (`stripe-webhook`, `sync-subscription`, `verify-checkout`).
3. Frontend-Prod-Deploy.
4. Smoke-Test mit Gast, Free-Nutzer, Premium-Nutzer und ausgeschöpftem Premium-Kontingent.
5. Optional Phase 5: UI-Optimierungen, Flashcards/RAG für ElevenLabs, 15-Min-Modus, mehrere Prüfer,
   kuratierter Szenario-Pool, echte Post-Call-Webhooks.

---

## 14. Abgrenzung — was NICHT dazugehört

Im selben Supabase-Projekt liegt eine **verwaiste Fremd-Function** `elevenlabs-closer-webhook`
(B2B-Lead-System „AI-Call-Agent für Umzugsfirmen", erwartet `closer_*`-Tabellen, die es nicht gibt).
Sie hat **nichts** mit der mündlichen Prüfung zu tun → ignorieren, nicht anfassen.
