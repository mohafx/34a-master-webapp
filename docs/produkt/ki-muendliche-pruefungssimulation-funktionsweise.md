---
title: KI-Mündliche-Prüfungssimulation — Funktionsweise (vollständige Referenz)
scope: Produkt / Technik — wie es funktioniert & bewertet
status: aktiv (Admin-only Soft-Launch)
last_verified: 2026-06-18
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

Der Nutzer **spricht** mit einer KI-Prüfer-Stimme („Dr. Klaus Wagner"), die praxisnahe §34a-Fallbeispiele
stellt und dynamisch nachfragt; danach bewertet ein zweites KI-Modell (Gemini) das Gesprächs-Transkript
und liefert Score, Pass/Fail (Grenze **50 %**), Themen-Scores, Stärken/Lücken, Musterantworten,
„roter Faden" und den nächsten Übungsschritt.

Zwei KI-Bausteine, klar getrennt:
- **ElevenLabs Conversational AI** → führt das Live-Gespräch (Sprache rein/raus). Bewertet **nicht**.
- **Google Gemini** (`gemini-2.5-flash`) → bewertet **nach** dem Gespräch das Transkript.

---

## 2. Nutzer-Ablauf (User Journey)

```
/exam  ──(Admin)──▶  Karte "Mündliche Prüfung"  ──▶  /oral-exam (Intro)
   │
   │  Intro: Kurzinfo + "Mündliche Prüfung starten" (startet immer mit allen Themen)
   ▼
/oral-exam/live
   │  1. Mikrofon-Freigabe (Browser-Prompt)
   │  2. Verbindung zum Prüfer (ElevenLabs WebSocket)
   │  3. Gespräch: Prüfer stellt Fallbeispiel → Nutzer spricht → Prüfer fragt nach …
   │     - Live-Transkript läuft mit
   │     - Countdown (Free 3 Min / Voll 5 Min)
   │     - "Prüfung beenden" jederzeit, oder Timeout, oder Prüfer beendet
   ▼  finish(): Session beenden → Transkript an Bewertung schicken
/oral-exam/results/:sessionId
   │  Score + Bestanden/Nicht bestanden, Themen-Balken, Stärken/Lücken,
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
     ◀── { sessionId, mode, maxDurationSec, signedUrl, dynamicVariables } ──┘

OralExamLive (@elevenlabs/react)
  useConversation.startSession({ signedUrl, connectionType:'websocket', dynamicVariables })
     ◀────────── WebSocket: Sprache rein/raus, Turn-Taking ──────────────────▶ ElevenLabs Agent
     · onConnect → conversationId merken                                        (Dr. Klaus Wagner)
     · onMessage → Live-Transkript (Fallback)
     · Timer/Beenden/onDisconnect → finish()

  evaluateOralExam(sessionId, transcript, durationS, conversationId)
     └─ supabase.functions.invoke ───────────▶ oral-exam-evaluation
                                                 · Idempotenz-Check (schon done?)
                                                 · Transkript autoritativ holen ─▶ ElevenLabs
                                                   (Fallback: Client-Transkript)   conversations/{id}
                                                 · Bewerten ───────────────────▶ Gemini 2.5-flash
                                                 · in oral_exam_sessions schreiben (done)
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
3. **Premium/Modus:** Admin ⇒ immer `full_5min`. (Für späteren öffentlichen Launch: `isUserPremium()`
   prüft `subscriptions`, `user_profiles.is_premium`, aktive `access_grants`.)
4. **Free-Gating:** Nicht-Premium mit bereits 1 abgeschlossenem Gratis-Test ⇒ `200 {paywallRequired:true}`.
5. **Session anlegen:** Zeile in `oral_exam_sessions` mit `status='running'`.
6. **Signed URL:** von ElevenLabs holen (`xi-api-key` bleibt serverseitig).

**Erfolg (`200`):**
```json
{
  "sessionId": "uuid",
  "mode": "full_5min",            // | "free_test_3q"
  "maxDurationSec": 300,          // 300 (voll) | 180 (free)
  "signedUrl": "wss://…",
  "dynamicVariables": { "mode": "full_5min", "focus_topic": "alle", "candidate_name": "Max" }
}
```

**Modi & Limits:**
| Modus | Dauer-Limit (Client-Timer) | Wer |
|---|---|---|
| `free_test_3q` | 180 s | eingeloggt, ohne Premium (1× gratis) |
| `full_5min` | 300 s | Premium / Admin |

> Echte Kosten-Backstops: Client-Timer **und** Max-Dauer des ElevenLabs-Agents (360 s).

---

## 5. Die Sprach-KI — ElevenLabs Agent „Dr. Klaus Wagner"

- **Conversational-AI-Agent** bei ElevenLabs (Voice rein/raus, Turn-Taking, Barge-in).
- Sprache **Deutsch**, Modell `eleven_flash_v2_5` (niedrige Latenz), Max-Dauer 360 s als Kosten-Backstop.
- **`agent_id` ist KEIN Repo-Wert** — liegt als Supabase-Secret `ELEVENLABS_AGENT_ID`.
- **Dynamic Variables** (vom Backend gesetzt, im Agent-Prompt nutzbar): `mode`, `focus_topic`,
  `candidate_name` → erlauben Personalisierung & Modus-abhängiges Verhalten (3 Fragen vs. ~5 Min).
- **Rolle des Agents:** stellt praxisnahe Fallbeispiele, fragt dynamisch nach („Warum?", „Und wenn …?"),
  benotet **nicht laut** (Bewertung passiert separat in Schritt 3), beendet neutral.

**Frontend-Anbindung** ([`OralExamLive.tsx`](../../src/components/pages/OralExamLive.tsx)) via
`@elevenlabs/react` (v1.7):
- Muss in `<ConversationProvider>` gewrappt sein; `useConversation({ onConnect, onMessage, onDisconnect, onError })`.
- Start: zuerst `getUserMedia({audio:true})` (saubere Mikro-Freigabe), dann
  `startSession({ signedUrl, connectionType:'websocket', dynamicVariables })`.
- `onConnect({conversationId})` → ID merken (für die Auswertung).
- `onMessage({message, role})` → Live-Transkript; `role:'agent'`→`examiner`, sonst `candidate`.
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
   (kein zweiter Gemini-Aufruf, keine Kosten).
3. **Transkript bestimmen:** zuerst **autoritativ von ElevenLabs** (`GET /v1/convai/conversations/{id}`,
   bis zu 3 Versuche à 1,5 s, falls noch „processing"); Fallback = Client-Transkript. Leer ⇒ Fehler.
4. **Bewertung (Gemini):** `gemini-2.5-flash`, `temperature 0.3`, `responseMimeType: application/json`,
   alle Safety-Settings auf `BLOCK_NONE` (Prüfungsinhalte können Gewalt/Recht berühren).
5. **Speichern:** `status='done'`, `ended_at`, `duration_s`, `transcript`, `overall_score_pct`,
   `passed`, `topic_scores`, `feedback` in `oral_exam_sessions`.

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
  "topic_scores": [{ "topic": "…", "score_pct": 0-100, "comment": "1 Satz" }],
  "strengths": ["…"],
  "gaps": ["…"],
  "model_answers": [{ "scenario": "…", "musterantwort": "…" }],
  "roter_faden": ["2-3 Sätze für die echte Prüfung"],
  "next_step": "1 konkreter nächster Übungsschritt"
}
```

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
| `mode` | text | `free_test_3q` \| `full_5min` |
| `focus_topic` | text \| null | gewählter Schwerpunkt |
| `status` | text (default `running`) | `running` \| `done` \| `aborted` |
| `started_at` | timestamptz (default `now()`) | Start |
| `ended_at` | timestamptz \| null | Ende |
| `duration_s` | int \| null | Gesprächsdauer |
| `transcript` | jsonb \| null | `[{role, text}]` |
| `overall_score_pct` | int \| null | Gesamt-Score |
| `passed` | bool \| null | bestanden (≥50 %) |
| `topic_scores` | jsonb \| null | `[{topic, score_pct, comment}]` |
| `feedback` | jsonb \| null | `{strengths, gaps, model_answers, roter_faden, next_step}` |
| `created_at` | timestamptz (default `now()`) | Anlage |

**Index:** `oral_exam_sessions_user_created_idx (user_id, created_at DESC)` (für Verlaufsliste).
**RLS-Policies:** `select/insert/update` jeweils `auth.uid() = user_id`. (Edge Functions nutzen den
Service-Role-Key und umgehen RLS bewusst.)

---

## 8. Gating-Übersicht

| Nutzer | Heute (Admin-only Soft-Launch) |
|---|---|
| Admin (`m.almajzoub1@gmail.com`) | Karte sichtbar; voller Zugriff `full_5min`, unbegrenzt |
| Eingeloggt, kein Admin | Karte **unsichtbar**; `/oral-exam*` → Redirect; Backend `403 feature_not_available` |
| Ausgeloggt | wie oben (kein Zugriff) |

Das Gating ist an **drei Stellen** verankert (alle drei müssen für den öffentlichen Launch fallen):
1. **Frontend-Karte:** `showOralExam = isAdminEmail(user?.email)` in [`ExamSelection.tsx`](../../src/components/pages/ExamSelection.tsx)
2. **Routen:** `<AdminGuard>` um `/oral-exam*` in [`App.tsx`](../../src/App.tsx)
3. **Backend:** `ADMIN_EMAILS`-Check in `oral-exam-session`

Die Logik für den **öffentlichen** Betrieb (1 Gratis-Test → Paywall, Premium = `full_5min`) ist bereits
eingebaut und greift automatisch, sobald das Admin-Gate entfernt wird.

---

## 9. Frontend-Dateien (Überblick)

| Datei | Rolle |
|---|---|
| [`src/components/pages/OralExamIntro.tsx`](../../src/components/pages/OralExamIntro.tsx) | Einstieg, Schwerpunktwahl, Start; behandelt `feature_not_available`/`paywallRequired` |
| [`src/components/pages/OralExamLive.tsx`](../../src/components/pages/OralExamLive.tsx) | Live-Gespräch (ElevenLabs), Mikro, Timer, Transkript, `finish()` |
| [`src/components/pages/OralExamResults.tsx`](../../src/components/pages/OralExamResults.tsx) | Auswertung (Score, Themen-Balken, Stärken/Lücken, Musterantworten, roter Faden) |
| [`src/components/pages/OralExamHistory.tsx`](../../src/components/pages/OralExamHistory.tsx) | Verlauf der eigenen Durchläufe |
| [`src/services/oralExam.ts`](../../src/services/oralExam.ts) | API: `startOralExamSession`, `evaluateOralExam`, `getOralExamSession`, `listOralExamSessions`, `abortOralExamSession` + Fehlerklassen |
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
| `ELEVENLABS_AGENT_ID` | `oral-exam-session` | welcher Agent (Dr. Klaus Wagner) |
| `GOOGLE_AI_API_KEY` | `oral-exam-evaluation` | Gemini-Bewertung |
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
| „Kein Transkript verfügbar" | Gespräch zu kurz / leer; ElevenLabs-Conversation noch nicht fertig (Retry greift) |
| Auswertung schlägt fehl | `GOOGLE_AI_API_KEY` fehlt/ungültig; Gemini-Antwort kein valides JSON |
| Session bleibt `running` | Abbruch ohne `finish()` → wird per `abortOralExamSession` auf `aborted` gesetzt |

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
