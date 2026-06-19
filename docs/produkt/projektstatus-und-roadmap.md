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
    *   **Launch-Gating (aktualisiert 2026-06-20):** Die mündliche Prüfung ist lokal für alle Nutzer sichtbar: Gäste sehen die Karte und müssen sich registrieren, Free-Nutzer haben 1 Mini-Simulation, Premium-Nutzer 10 Prüfungstickets pro Abo-Zeitraum. Das Backend setzt die Tickets über `oral-exam-session` autoritativ durch; `oral-exam-entitlement` liefert den UI-Status. Tickets zählen erst ab echter ElevenLabs-Verbindung (`connected_at`). Supabase ist aktualisiert und verifiziert (`connected_at` live, `oral-exam-audio` privat, Functions deployed); Frontend-Prod-Deploy und echter Provider-Smoke-Test stehen noch aus.

---

## 2. Nächste Aufgaben & Roadmap

Folgende Arbeitspakete sind für die kommenden Sprints geplant:

### Task 1: Bilder für Quiz-Erklärungen generieren
*   **Ziel:** Visuelle Unterstützung beim Lernen durch erklärende Grafiken/Infografiken in den Quizerklärungen.
*   **Umsetzung:** Aktivierung und Durchführung der `pilot:lesson-images`-Pipeline, um qualitativ hochwertige Bilder zu erzeugen und diese in der Datenbank (`questions.question_explanation_image_url`) zu hinterlegen. Der Dev-Panel-Switch ermöglicht das Ein-/Ausschalten zu Testzwecken.

### Task 2: Karteikarten für mündliches Training anpassen
*   **Ziel:** Die klassischen Karteikarten (Flashcards) umbauen, um sie als interaktives mündliches KI-Training zu nutzen.
*   **Umsetzung:** Benutzer sollen die Fragen auf den Karteikarten mündlich beantworten können, woraufhin eine KI die Antwort direkt analysiert und korrigiert (Sprach-zu-Text + kurzes KI-Feedback). Später können die Lernkarten zusätzlich als kuratierte RAG-/Wissensbasis für den ElevenLabs-Agenten dienen.

### Task 3: Mündliche Prüfungssimulation monetarisieren & launchen
*   **Ziel:** Die mündliche Prüfungssimulation als Premium-Feature etablieren.
*   **Umsetzung:**
    *   Tarifmodell ist festgelegt: Registrierung erforderlich, 1 Free-Mini-Simulation, Premium mit 10 Vollsimulationen pro Abo-Zeitraum.
    *   Prüfungstickets zählen erst ab erfolgreicher Verbindung zum ElevenLabs-Prüfer (`connected_at`), damit Mikrofon-Fehler oder Reloads vor der Verbindung kein Ticket verbrauchen.
    *   Vor Launch: Frontend in Produktion deployen und mit echten Free-/Premium-Konten testen. Supabase-Backend ist seit 2026-06-20 aktualisiert.

### Task 4: Paywall anpassen & neue Features integrieren
*   **Ziel:** Die Paywall-UI überarbeiten, um die neuen KI-Features prominent zu bewerben und höhere Conversion-Rates zu erzielen.
*   **Umsetzung:** Integration der Features (Mündliche Prüfung, Audio-Mitschnitt, KI-Feedback) in die Preistabellen und Paywall-Modals.

### Task 5: Mündliche KI-Features launchen, per E-Mail vermarkten & SEO-Seiten bauen
*   **Ziel:** Nutzerakquise und Reaktivierung bestehender Nutzer für das neue Feature.
*   **Umsetzung:**
    *   **Öffentlicher Launch:** Mündliche Prüfung öffentlich anzeigen, Registrierung als Einstieg nutzen, Ticketstatus in der UI erklären.
    *   **E-Mail-Kampagne:** Newsletter-Versand an Bestandsnutzer und Leads (Unter Beachtung der `docs/Email_Design_Guidelines.md`).
    *   **SEO-Pages:** Erstellung optimierter Landingpages (z. B. `/mündliche-ihk-pruefung-34a-simulator`), um organischen Traffic über Google zu generieren.

### Task 5b: UI-Optimierungen nach Launch
*   **Ziel:** Conversion und Abschlussquote der mündlichen Prüfung verbessern.
*   **Umsetzung:** Ticketkarte, Start-Dialog, Ergebnis-Statusblock, Verlauf und Paywall nach echten Nutzungsdaten iterieren.

### Task 6: Bewertungssystem (Reviews) aufbauen
*   **Ziel:** Social Proof durch Nutzerbewertungen generieren und direktes Feedback sammeln.
*   **Umsetzung:**
    *   Erstellung einer neuen Tabelle (`user_reviews` / `feedbacks`) in der Datenbank.
    *   Einbau eines Modals nach erfolgreichem Abschluss von Prüfungen (schriftlich/mündlich), bei dem Nutzer Sterne (1-5) und ein optionales Text-Feedback hinterlassen können.
