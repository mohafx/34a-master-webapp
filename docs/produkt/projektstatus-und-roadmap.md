# Projektstatus und Roadmap

Dieses Dokument fasst den aktuellen Entwicklungsstand der **34a Master Webapp** zusammen und definiert die nächsten Schritte für den Launch und die Weiterentwicklung.

---

## 1. Aktueller Projektstatus (Stand: Juni 2026)

Das Projekt ist eine moderne **React 19 SPA** (Vite 6, Tailwind CSS 3, HashRouter) mit einem **Supabase-Backend** (Auth, Postgres, Edge Functions, Storage).

### Kernfunktionen & Features:
*   **Schriftlicher Prüfungstrainer:** Vollwertige Prüfungssimulation (82 Fragen, gewichtete IHK-Themenverteilung, Zeitlimit, detaillierte Auswertung, Verlauf und Speicherung).
*   **Mündlicher Prüfungstrainer (KI-Simulation):**
    *   **Live-Gespräch:** Interaktive Sprachsimulation mit ElevenLabs Agent „Herr Müller“ (geringe Latenz, deutsche Stimme, pegelreaktive Benutzer-Sprechanimation).
    *   **KI-Auswertung:** Detaillierte structured JSON-Bewertung durch OpenAI (`gpt-4.1`) nach echten IHK-Maßstäben (Gesamtnote, Bestehensschwelle 50 %, prozentuale Bewertung je Antwort, Stärken/Lücken, Musterantworten).
    *   **Audio-Archivierung:** Vollständiges Gesprächs-Audio wird serverseitig geladen und in einem privaten S3-Bucket (`oral-exam-audio`) gesichert. Der Player auf der Ergebnisseite lädt das Audio sicher per signierter URL.
    *   **Optimierungen (2026-06-19):** Behebung des Router-State-Syncs bei wiederholten Auswertungen (Retry) und Einführung einer Trophäen-Karte sowie exklusiver Filter (Schriftlich/Mündlich) im Verlauf.
    *   **Launch-Gating (aktualisiert 2026-06-20):** Die mündliche Prüfung ist lokal für alle Nutzer sichtbar: Gäste sehen die Karte und müssen sich registrieren, Free-Nutzer haben 1 Mini-Simulation, Premium-Nutzer 10 Prüfungstickets pro Abo-Zeitraum. Das Backend setzt die Tickets über `oral-exam-session` autoritativ durch; `oral-exam-entitlement` liefert den UI-Status. Tickets zählen erst ab echter ElevenLabs-Verbindung (`connected_at`). Supabase ist aktualisiert und verifiziert.
    *   **Prod-Launch (2026-06-20):** `c06097b` — Mündliche Prüfung für alle Nutzer freigeschaltet (nicht mehr Admin-only). PostHog-Tracking für den kompletten Oral-Exam-Funnel hinzugefügt (`548ab0e`). Redeploy mit PostHog-Host-Fix (`fffe945`).
    *   **Stabilisierung (2026-06-20):** `8357acf` — Connect-basierte Tickets live, Erklärungsbilder-Rollout, Entitlement-Period-Start fixiert.
*   **Lerninhalte & Lektionsfluss:**
    *   **Nutzerfeedback-Fix (2026-06-20):** Drei gemeldete StGB-Fragen korrigiert (`questions.correct_answer`: Wodka = C, Schlagstock/Platzwunde = B, Fahrradschloss = B,D) und die Fahrradschloss-Erklärung in Deutsch/Arabisch angepasst. Zusätzlich bleibt bei der letzten Frage einer Lektion die Erklärung sichtbar/öffnbar; die Lektion schließt erst nach Klick auf „Lektion abschließen“. Cache-Version `v3`, Migration `20260620182122` remote angewendet.
*   **Performance & mobiler Cold-Start:**
    *   **Paywall-Code-Splitting (2026-06-21):** `PaywallDialog` und Onboarding-`PaywallView` werden lazy geladen; Stripe/Paywall-Code wird nicht mehr durch den Dashboard-Erststart erzwungen. `App.tsx` nutzt gezielte `lucide-react`-Imports statt Namespace-Import.
    *   **Zweistufiger DataCache (2026-06-21):** `DataCacheProvider` lädt blockierend nur Module, Fragen-Preview und Lernkarten-Preview. Das Dashboard wird danach freigegeben; vollständige Fragen/Lernkarten mit Antworten werden im Hintergrund geladen und mit `fullDataReady` markiert. Cache-Version `v4` verhindert Mischinterpretationen alter Daten. `QuestionView` startet keine Fragen aus Preview-Daten mit leeren Antworten, sondern nutzt dann die bestehende Supabase-Fallback-Abfrage.
    *   **Verifiziert lokal (2026-06-21):** `npm run build`, `npm run test:oral-exam-entitlement`, `npm run test:oral-exam-routing` und `npm run test:transition-access` grün. Produktions-Preview auf iPhone getestet: App öffnet, Dashboard/Navigation/Fragen funktionieren.
*   **Premium-/Payment-Stabilität:**
    *   **Stabilitätsfix nach Kundenbeschwerde (2026-06-21):** Bezahlter Premium-Zugang wird nicht mehr primär aus einer einzelnen `subscriptions`-Zeile im Frontend abgeleitet. Neue Edge Function `entitlement-status` ist autoritative Premium-Quelle für eingeloggte Nutzer und wertet `subscriptions` sowie `access_grants` robust aus.
    *   **Payment-Return gehärtet:** `PaymentSuccess` merkt sich die Checkout-`session_id`, verifiziert bezahlte Sessions erneut und pollt den Premium-Status, bis der Zugang sichtbar ist. Bei erfolgreicher Zahlung, aber noch nicht aktualisiertem Client-State, zeigt die App „Zahlung bestätigt” / „Zugang wird synchronisiert” statt einen falschen Zahlungsfehler.
    *   **Self-Healing:** `SubscriptionContext` startet bei `isPremium=false` und kürzlich gesehener Checkout-Session automatisch `verify-checkout`, `sync-subscription` und einen frischen Entitlement-Fetch. Im Profil gibt es für Free-Nutzer „Einkäufe wiederherstellen”.
    *   **Refund-/Dispute-Entzug:** Stripe-Refunds setzen `subscriptions.status='refunded'` und `current_period_end=now()`. `hasPremiumAccess()` und `entitlement-status` behandeln `refunded` immer als non-premium; echte Kündigungen bleiben nur bis Periodenende gültig.
    *   **Audit & Monitoring-Basis:** Neue Tabelle `payment_audit_events` protokolliert erfolgreiche Finalisierungen, kritische Mismatches (`checkout_finalized_without_premium`), fehlende User-Zuordnung und Refund-Entzug. Supabase-Migration und Edge Functions (`entitlement-status`, `verify-checkout`, `stripe-webhook`) wurden am 2026-06-21 produktiv deployed und remote verifiziert.
    *   **Regressionstests:** `npm run test:premium-entitlement` ergänzt Tests für Entitlement-Auswahl, Refund-Entzug, gekündigte Perioden und Pending-Payment-Recovery. Zusätzlich waren `npm run test:oral-exam-entitlement`, `npm run test:transition-access`, `npm run test:oral-exam-routing` und `npm run build` grün.

---

## 2. Nächste Aufgaben & Roadmap

Folgende Arbeitspakete sind für die kommenden Sprints geplant:

### Task 1: Bilder für Quiz-Erklärungen generieren
*   **Ziel:** Visuelle Unterstützung beim Lernen durch erklärende Grafiken/Infografiken in den Quizerklärungen.
*   **Umsetzung:** Aktivierung und Durchführung der `pilot:lesson-images`-Pipeline, um qualitativ hochwertige Bilder zu erzeugen und diese in der Datenbank (`questions.question_explanation_image_url`) zu hinterlegen. Der Dev-Panel-Switch ermöglicht das Ein-/Ausschalten zu Testzwecken.

### Task 2: Karteikarten für mündliches Training anpassen
*   **Ziel:** Die klassischen Karteikarten (Flashcards) umbauen, um sie als interaktives mündliches KI-Training zu nutzen.
*   **Umsetzung:** Benutzer sollen die Fragen auf den Karteikarten mündlich beantworten können, woraufhin eine KI die Antwort direkt analysiert und korrigiert (Sprach-zu-Text + kurzes KI-Feedback). Später können die Lernkarten zusätzlich als kuratierte RAG-/Wissensbasis für den ElevenLabs-Agenten dienen.

### Task 3: Mündliche Prüfungssimulation monetarisieren & launchen ✅
*   **Ziel:** Die mündliche Prüfungssimulation als Premium-Feature etablieren.
*   **Erledigt (2026-06-20):** Tarifmodell live — Registrierung erforderlich, 1 Free-Mini-Simulation, Premium 10 Vollsimulationen pro Abo-Zeitraum. Tickets zählen erst ab `connected_at`. Frontend in Produktion deployed, PostHog-Funnel-Tracking aktiv.

### Task 4: Paywall anpassen & neue Features integrieren ✅
*   **Ziel:** Die Paywall-UI überarbeiten, um die neuen KI-Features prominent zu bewerben und höhere Conversion-Rates zu erzielen.
*   **Erledigt (2026-06-20):** `33df7e2` — Exam-Intros-Redesign, Modal-Portal-Fix, Paywall-Conversion-Optimierung. `29adec0` — Paywall- und Dashboard-Messaging verfeinert.

### Task 5: Mündliche KI-Features launchen, per E-Mail vermarkten & SEO-Seiten bauen ✅
*   **Ziel:** Nutzerakquise und Reaktivierung bestehender Nutzer für das neue Feature.
*   **Erledigt:**
    *   **Öffentlicher Launch ✅ (2026-06-20):** Mündliche Prüfung für alle Nutzer sichtbar (`c06097b`).
    *   **E-Mail-Kampagne ✅ (2026-06-20):** `7bb5d5f` — E-Mail-Kampagne für mündliche Prüfungssimulation mit Abmelde-System gebaut. `f059e97` — Daily Limits und Duplikat-Prävention. `2e4eca5` — Dokumentiert in `docs/agents/10-email-kampagnen.md`.
    *   **SEO-Seiten ✅:** Seiten für die mündliche Prüfung sind gebaut und werden nicht mehr als offene Roadmap-Aufgabe geführt.

### Task 5b: UI-Optimierungen nach Launch
*   **Ziel:** Conversion und Abschlussquote der mündlichen Prüfung verbessern.
*   **Umsetzung:** Ticketkarte, Start-Dialog, Ergebnis-Statusblock, Verlauf und Paywall nach echten Nutzungsdaten iterieren.

### Task 5c: Mobiler Cold-Start und Startpfad-Performance ✅
*   **Ziel:** Den ersten sichtbaren App-Content auf mobilen Geräten früher anzeigen, ohne Premium-, Paywall-, Stripe- oder Entitlement-Logik zu verändern.
*   **Erledigt (2026-06-21):** DataCache auf zweistufigen Start umgestellt: Preview-Daten entsperren Dashboard/Listen früh, vollständige Antworten und Lernkarten werden im Hintergrund geladen. Quiz-Start ist gegen leere Preview-Antworten abgesichert. Paywall/Stripe bleiben unverändert und lazy geladen.
*   **Nächster Messschritt:** Nach Deployment Lighthouse/WebPageTest auf der echten Domain gegen den vorherigen Stand vergleichen, besonders First Contentful Paint, Largest Contentful Paint und mobile Total Blocking Time.

### Task 6: Bewertungssystem (Reviews) aufbauen
*   **Ziel:** Social Proof durch Nutzerbewertungen generieren und direktes Feedback sammeln.
*   **Umsetzung:**
    *   Erstellung einer neuen Tabelle (`user_reviews` / `feedbacks`) in der Datenbank.
    *   Einbau eines Modals nach erfolgreichem Abschluss von Prüfungen (schriftlich/mündlich), bei dem Nutzer Sterne (1-5) und ein optionales Text-Feedback hinterlassen können.
