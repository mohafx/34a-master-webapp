---
title: KI-Mündliche-Prüfungssimulation — Umsetzung (As-Built) & Phasen
scope: Produkt / Technische Umsetzung
status: Phase 5 — Frontend gebaut, Admin-only Soft-Launch, bereit für lokalen Live-Test
last_verified: 2026-06-18
last_updated: 2026-06-18
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
  │          Fallback Client; Gemini 2.5-flash → JSON → speichern)
  │
  └─(4) OralExamResults (/oral-exam/results/:sessionId) → Score, Themen, Stärken/Lücken,
         Musterantworten, roter Faden, next_step.  OralExamHistory listet vergangene Läufe.
```

## 3. Dateien im Repo

**Frontend (`src/`)**
- Pages: `components/pages/OralExam{Intro,Live,Results,History}.tsx`
- Service: `services/oralExam.ts` (`startOralExamSession`, `evaluateOralExam`, `getOralExamSession`,
  `listOralExamSessions`, `abortOralExamSession`)
- Typen: `OralExam*` in `types.ts`
- Routen: `App.tsx` — `/oral-exam`, `/oral-exam/live`, `/oral-exam/results/:sessionId`,
  `/oral-exam/history`, **alle in `<AdminGuard>`**
- Einstieg (ExamSelection): **ein Button** „Schriftliche Prüfungssimulation" öffnet ein Modal
  (Mini / Voll). Karte „Mündliche Prüfung" erscheint nur wenn `isAdminEmail(user?.email)`.
- Verlauf: `components/pages/WrittenExamHistory.tsx` zeigt **schriftliche + mündliche** Sessions
  (mündliche Sektion nur für Admin sichtbar). `OralExamHistory.tsx` weiterhin unter
  `/oral-exam/history` erreichbar (intern).
- `OralExamIntro.tsx` hat **keinen** „Frühere Durchläufe"-Button mehr.
- Analytics: Events `oral_exam_started` / `oral_exam_completed` in `contexts/PostHogProvider.tsx`
- Dependency: `@elevenlabs/react`

**Backend (`supabase/`)**
- `functions/oral-exam-session/index.ts`, `functions/oral-exam-evaluation/index.ts`
  (exakt der live deployte Stand)
- `migrations/20260616175910_create_oral_exam_sessions.sql` (idempotent, = Live-Schema)

## 4. ElevenLabs-Agent
- „34a Master – Mündliche Prüfung (Dr. Klaus Wagner)", Sprache **de**, Modell `eleven_flash_v2_5`.
- `agent_id` liegt als Supabase-Secret `ELEVENLABS_AGENT_ID` (nicht im Repo).
- Dynamic Variables: `mode`, `focus_topic`, `candidate_name`.

## 5. Gating
| Nutzer | Verhalten (Soft-Launch) |
|---|---|
| Admin (`m.almajzoub1@gmail.com`) | Voller Zugriff, `full_5min`, unbegrenzt |
| Alle anderen / ausgeloggt | Karte unsichtbar, `/oral-exam*` → Redirect, Backend `403` |

## 6. Auswertungs-JSON (Gemini)
`{ overall_score_pct, passed, topic_scores[{topic,score_pct,comment}], strengths[], gaps[],
model_answers[{scenario,musterantwort}], roter_faden[], next_step }`. Bestehensgrenze 50 %.

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
