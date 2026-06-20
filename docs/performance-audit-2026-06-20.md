# Performance-Audit der 34a Master Webapp

Datum: 2026-06-20  
Scope: React-SPA in `src/`, Supabase-Datenpfade, Edge-Function-Nutzung, lokaler Produktionsbuild über `npm run build` und `npm run preview`.

## 1. Gesamtbewertung

**Gesamtnote: befriedigend bis kritisch, abhängig vom Gerät.**

Für Desktop-Nutzer wirkt die App nach dem ersten Laden überwiegend stabil und bedienbar. Auf mobilen Erstbesuchen ist die Performance jedoch nicht auf dem Niveau, das sich hochwertig anfühlt. Besonders kritisch ist der erste sichtbare, echte Inhalt: Unter Lighthouse-Mobile-Throttling kam der Largest Contentful Paint erst nach ca. **22,7 s**. Das ist für echte Nutzer und Conversion zu langsam.

Die App hat bereits sinnvolle Ansätze: Vite-Produktionsbuild, HashRouter, Code-Splitting für viele Seiten, Dashboard-Skeleton, lokaler Daten-Cache und parallelisierte Supabase-Abfragen. Das Problem liegt nicht in fehlender Grundarchitektur, sondern in zu viel JavaScript und externen Ressourcen im frühen Startpfad sowie in einem zu schweren initialen Daten- und Provider-Setup.

**Kurzurteil:**

- Desktop warm/cached: wahrscheinlich okay.
- Desktop cold: akzeptabel, aber nicht schnell.
- Mobile cold: kritisch.
- Interaktion nach geladener App: meist solide, einzelne Routen können durch schwere Komponenten/Requests verzögern.
- Stabilität: grundsätzlich ordentlich, aber mehrere Provider-/Datenabhängigkeiten machen den Start fragil.

## 2. Messbasis

Gemessen wurde gegen den lokalen Produktions-Preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

### Lighthouse-Ergebnisse

| Profil | Performance | FCP | LCP | Speed Index | TBT | CLS | Main Thread |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop | 65/100 | 1,59 s | 4,28 s | 3,52 s | 0 ms | 0,0005 | 0,46 s |
| Mobile throttled | 57/100 | 6,62 s | 22,65 s | 7,60 s | 120 ms | 0,0036 | 1,75 s |

Interpretation:

- **CLS ist sehr gut.** Layout springt kaum.
- **TBT ist akzeptabel bis gut.** Die App blockiert nach Start nicht extrem.
- **FCP/LCP sind das Hauptproblem.** Nutzer warten zu lange auf echten Inhalt, vor allem mobil.
- **Gefühlte Geschwindigkeit ist besser als LCP**, weil Skeletons früh erscheinen. Das kaschiert Wartezeit, löst sie aber nicht.

### Bundle-Größen aus dem Produktionsbuild

Gesamt `dist/assets`: ca. **3,69 MB minifiziert**, ca. **944 KB gzip**.

Größte Chunks:

| Chunk | Größe gzip | Bewertung |
|---|---:|---|
| `ui-*.js` | 204 KB | kritisch, zu groß für gemeinsamen UI-/Icon-Pfad |
| `analytics-*.js` | 141 KB | kritisch, sollte nicht früh blockieren |
| `OralExamLive-*.js` | 132 KB | okay, wenn nur auf Live-Route geladen |
| `App-*.js` | 106 KB | zu schwer für App-Shell |
| `charts-*.js` | 101 KB | okay, wenn nur Statistik lädt |
| `index-*.js` | 58 KB | okay |
| `supabase-*.js` | 45 KB | erwartbar |
| CSS | 25 KB | okay |

Lighthouse meldet zusätzlich ca. **418-423 KB ungenutztes JavaScript** beim initialen Dashboard, inklusive Stripe, App, Analytics, Supabase und UI.

## 3. Bewertung nach Bereichen

### Ladezeit der Website/App

**Bewertung: kritisch auf Mobile, mittel auf Desktop.**

Die App lädt beim Start zu viele Dinge, bevor der Nutzer wirklich mit dem Produkt arbeitet:

- `src/App.tsx` importiert viele Seiten direkt statt lazy: Dashboard, ModuleList, ModuleDetail, QuestionView, Profile, PracticeSelection, ModuleQuestionsList, ExamIntro und mehrere Legal/Auth-Seiten (`src/App.tsx:23-45`).
- `PaywallDialog` wird in der App-Shell importiert (`src/App.tsx:10`), obwohl er nur bei Paywall-Bedarf sichtbar ist.
- Über `PaywallDialog -> PaywallView -> EmbeddedPayment` wird Stripe-Code in den Importgraphen gezogen (`src/components/PaywallDialog.tsx:1`, `src/components/PaywallView.tsx:10`, `src/components/EmbeddedPayment.tsx:2`).
- Lighthouse sieht `https://js.stripe.com/clover/stripe.js` bereits beim initialen Dashboard und bewertet davon ca. 172 KB als ungenutzt.

**Nutzerwirkung:** Erstbesucher sehen zwar Skeletons, aber echte Inhalte kommen mobil zu spät. Das wirkt weniger hochwertig und kann gerade bei Werbe-/TikTok-Traffic Conversion kosten.

### Erste sichtbare Inhalte

**Bewertung: mittel.**

Die App zeigt während `authLoading || dataLoading` einen Dashboard-Skeleton (`src/App.tsx:843-870`). Das hilft der gefühlten Geschwindigkeit. Der Skeleton ersetzt aber nicht den eigentlichen Content und kann bei langsamer Datenbankverbindung wie ein Ladezustand ohne Fortschritt wirken.

Positiv:

- Skeleton statt leerer weißer Seite.
- Sehr geringe Layout-Verschiebung.

Negativ:

- Der Start hängt am Auth-, Subscription- und Datenstatus.
- Nach 5 s gibt es zwar intern eine Slow-Loading-Message-Logik (`src/App.tsx:820-840`), für normale Ladezustände bleibt der Nutzer aber im Skeleton.

### Smoothness der Bedienung

**Bewertung: überwiegend gut, mit punktuellen Risiken.**

Nach dem Start ist TBT niedrig. Das spricht dafür, dass Klicks und kleine Interaktionen nicht dauerhaft blockieren. Risiken bestehen bei:

- Dashboard-Moduswechsel mit 600-ms-Transitions (`src/components/pages/Dashboard.tsx:255-266`).
- Routenwechsel: `ScrollToTop` iteriert über `document.querySelectorAll('*')` und setzt Scrollpositionen für alle Elemente (`src/App.tsx:1055-1065`). Das ist bei wachsendem DOM unnötig teuer und kann auf schwächeren Geräten Ruckeln verursachen.
- Große Listen, Statistik und Lernplan werden nicht sichtbar virtualisiert. Aktuell vermutlich noch okay, aber bei mehr Content/History kann es spürbar werden.

### Reaktionszeit bei Klicks, Navigation und Interaktionen

**Bewertung: gut bis mittel.**

Viele Nutzeraktionen sind optimistisch umgesetzt, z. B. Fragen beantworten und Fortschritt speichern. Das ist gut für gefühlte Geschwindigkeit.

Kritische Stellen:

- `answerQuestion` aktualisiert UI sofort, speichert danach im Hintergrund. Gut.
- `toggleBookmark` lädt nach dem Toggle die Bookmarks erneut aus Supabase. Das kann den Bookmark-Klick bei schlechter Verbindung weniger direkt wirken lassen.
- `saveProgress` macht erst Select, dann Update/Insert (`src/services/database.ts:501-538`). Für einzelne Fragen okay, aber es verdoppelt Request-Arbeit. Nicht kritisch, aber bei Vielnutzung unnötig.

### API-Anfragen und Dauer

**Bewertung: mittel.**

Der initiale Datenprovider lädt beim Cache-Miss parallel:

- Module
- alle Fragen
- Fragen-Preview
- alle Flashcards
- Flashcards-Preview

Siehe `src/contexts/DataCacheContext.tsx:179-188`.

Das ist besser als sequentiell, aber der Payload ist für den Erststart groß. Danach wird in `localStorage` gecacht (`src/contexts/DataCacheContext.tsx:48-95`), was wiederkehrende Besuche deutlich verbessert.

Risiken:

- Erstbesuch ohne Cache ist schwer.
- Premium-Status kann Cache-Refresh erzwingen (`src/contexts/DataCacheContext.tsx:136-159`).
- Netzwerkfehler oder langsame Supabase-Antworten blockieren die App bis zu 60 s (`src/contexts/DataCacheContext.tsx:170-176`).

### Langsame oder unnötige Requests

**Bewertung: kritisch für initiale externe Requests.**

Unnötig oder zu früh:

- Stripe-Script beim ersten Dashboard-Besuch.
- Mehrere Google-Font-Stylesheets im `index.html`: Inter, Public Sans, Material Icons, Material Symbols zweimal (`index.html:9-13`).
- Analytics-Bundle im frühen App-Bundle, obwohl PostHog erst nach Consent initialisiert (`src/contexts/PostHogProvider.tsx:180-218`).
- Sentry wird direkt im Einstiegspunkt importiert und initialisiert (`src/index.tsx:3-25`).

Das heißt nicht, dass Stripe, Fonts, Sentry oder PostHog falsch sind. Sie sind nur zu früh im kritischen Pfad.

### Frontend-Performance

**Bewertung: mittel.**

Hauptursachen:

- Zu große gemeinsame Chunks.
- Namespace-Imports von `lucide-react`, z. B. `import * as Icons` in mehreren Dateien. Besonders relevant ist `src/App.tsx:20`. Weitere dynamische Icon-Lookups finden sich in Module-/Lernplan-/Listen-Seiten. Das verhindert sauberes Tree-Shaking und erklärt den großen `ui`-Chunk.
- Markdown/Remark und Icon-Bibliothek liegen im gemeinsamen `ui`-Chunk. Für Erklärungen und Admin-Analysen sinnvoll, aber nicht zwingend für den Startscreen.
- Die App-Shell enthält zu viele Feature-Komponenten.

### Backend-/Datenbank-Performance

**Bewertung: nicht abschließend messbar, aber mehrere Risiken erkennbar.**

Ohne Produktions-Query-Logs oder Supabase-Explain-Pläne kann keine harte DB-Latenz bewertet werden. Aus dem Code sind aber diese Punkte relevant:

- `getAllQuestions()` und `getAllFlashcards()` lesen vollständige Tabellen mit `select('*')` (`src/services/database.ts:155-163`, `src/services/database.ts:220-235`).
- `getQuestionsPreview()` und `getFlashcardsPreview()` werden zusätzlich geladen. Das kann fachlich nötig sein, wirkt aber beim Start doppelt.
- History-/Statistikfunktionen lesen teils vollständige Nutzerhistorien und aggregieren im Client (`src/services/database.ts:426-488`).
- Einige Queries hängen stark an Indizes: `user_id`, `completed_at`, `started_at`, `total_questions`, `lesson_id`, `module_id`, `order_index`. Nicht alle Indexdefinitionen sind im Repo eindeutig sichtbar.

Pragmatische Einschätzung: Die aktuelle Datenmenge scheint klein genug. Das Risiko wächst mit Nutzern, Prüfungsverläufen und Frage-/Bildbestand.

### Mobile Performance

**Bewertung: kritisch.**

Mobile ist der wichtigste Schwachpunkt:

- FCP ca. 6,6 s.
- LCP ca. 22,7 s.
- 8 Long Tasks im Mobile-Lighthouse, u. a. App-JS, Stripe und unattributable Tasks.
- Main-Thread-Arbeit ca. 1,75 s.

Für Nutzer fühlt sich das so an: Die App öffnet, etwas lädt, aber der eigentliche Wert kommt zu spät. Gerade wenn Traffic aus Social Ads kommt, ist das ein Conversion-Problem.

### Desktop Performance

**Bewertung: brauchbar, aber nicht hochwertig schnell.**

Desktop hat bessere Werte:

- FCP ca. 1,6 s.
- LCP ca. 4,3 s.
- TBT 0 ms.
- CLS sehr gut.

Das ist bedienbar, aber nicht „snappy“. Der Desktop profitiert stark von CPU und Netz. Die Probleme sind dieselben, nur weniger sichtbar.

### Wiederkehrende Performance-Probleme

**Bewertung: mittel.**

Wiederkehrende Nutzer profitieren vom `localStorage`-Cache. Trotzdem bleiben diese Probleme:

- Bei Cache-Ablauf nach 1 h wird wieder umfangreich geladen.
- `localStorage` kann groß werden, weil Fragen/Flashcards komplett serialisiert werden.
- Bei Deployment/Chunk-Änderungen kann alter Cache plus neue Datenstruktur zu Fehlern führen; Schema-Version `v3` hilft, muss aber diszipliniert gepflegt werden.
- Analytics/Monitoring/Stripe bleiben als Startpfad-Thema bestehen.

### UX-Probleme durch Wartezeiten

**Bewertung: mittel bis kritisch.**

Die UI kaschiert Ladezeit gut, aber echte Nutzer merken:

- Erstbesuch fühlt sich auf Mobile langsam an.
- Bei langsamer Datenbank bleibt nur ein Skeleton.
- Mündliche Prüfung hat naturgemäß lange Provider-Pfade: Supabase Edge Function, ElevenLabs Signed URL, Mikrofon, WebSocket, Evaluation über OpenAI und optional Audio-Speicherung. Das ist produktbedingt, muss aber mit klaren Zuständen kommuniziert werden.
- Checkout darf nicht durch Stripe-Vorladen die App bremsen, sollte aber nach CTA sofort reagieren.

## 4. Konkrete Schwachstellen

### P0: Stripe wird zu früh geladen

**Befund:** Stripe erscheint im initialen Lighthouse-Request-Set und wird als größter ungenutzter JS-Block markiert. Der Importpfad ist App-Shell -> PaywallDialog -> PaywallView -> EmbeddedPayment -> `@stripe/stripe-js`.

**Nutzerwirkung:** Jeder Erstbesucher zahlt Kosten für Checkout-Code, auch ohne Kaufabsicht.

**Priorität:** kritisch.

### P0: Mobile LCP ist viel zu spät

**Befund:** Mobile LCP ca. 22,7 s.  
**Nutzerwirkung:** Die App wirkt auf schwächeren Geräten langsam und weniger vertrauenswürdig.  
**Priorität:** kritisch.

### P1: Gemeinsamer UI-/Icon-Chunk ist zu groß

**Befund:** `ui-*.js` ca. 204 KB gzip, 998 KB minifiziert. Namespace-Imports und dynamische Icon-Lookups ziehen viele Icons hinein.  
**Nutzerwirkung:** Langsamer Start, besonders Mobile.  
**Priorität:** hoch.

### P1: Analytics und Monitoring liegen früh im Startpfad

**Befund:** `analytics-*.js` ca. 141 KB gzip. Sentry wird in `src/index.tsx` direkt importiert und initialisiert. PostHog wird statisch importiert, obwohl Tracking erst nach Consent aktiv wird.  
**Nutzerwirkung:** Startkosten ohne direkten Erstscreen-Nutzen.  
**Priorität:** hoch.

### P1: Initialer Datenload ist zu breit

**Befund:** Bei Cache-Miss werden fünf Supabase-Datenquellen parallel vollständig geladen.  
**Nutzerwirkung:** Erstbesuch hängt an Datenbank und Netzwerk.  
**Priorität:** hoch.

### P2: Google-Fonts und Material-Icon-Fonts sind mehrfach extern

**Befund:** Fünf Font-Stylesheets im HTML-Head, inklusive doppelter Material-Symbol-Familie.  
**Nutzerwirkung:** Mehr Roundtrips, potenziell später Text/Icon-Paint.  
**Priorität:** mittel.

### P2: Routenwechsel setzt Scrollpositionen aller Elemente

**Befund:** `document.querySelectorAll('*')` auf jeder Routenänderung.  
**Nutzerwirkung:** Kann bei großem DOM Ruckeln erzeugen.  
**Priorität:** mittel.

### P2: Statistik/History kann mit Nutzerhistorie wachsen

**Befund:** Vollständige Nutzerhistorien werden clientseitig aggregiert.  
**Nutzerwirkung:** Für Power-User später langsamer Statistik-Screen.  
**Priorität:** mittel.

### P3: Bildassets sind groß, aber aktuell nicht der Hauptstartfehler

**Befund:** `public/question-explanations` enthält mehrere PNGs um 1,0-1,3 MB. Erklärungsbilder werden lazy geladen.  
**Nutzerwirkung:** Beim Öffnen von Erklärungen können Bilder langsam erscheinen und Datenvolumen kosten.  
**Priorität:** nice-to-have bis mittel, abhängig von Nutzung.

## 5. Priorisierung nach Nutzer- und Conversion-Auswirkung

| Priorität | Maßnahme | Nutzerwirkung | Risiko |
|---|---|---|---|
| P0 | Stripe/Paywall/EmbeddedPayment nur bei tatsächlicher Paywall/Checkout lazy laden | schnellerer Erststart, bessere Conversion | niedrig-mittel |
| P0 | Mobile-Startpfad reduzieren: App-Shell kleiner, weniger eager pages | stark bessere mobile Erstwahrnehmung | mittel |
| P1 | `lucide-react` Namespace-Imports entfernen oder Icon-Registry gezielt bauen | kleinerer UI-Chunk | mittel |
| P1 | PostHog und möglichst Sentry lazy/idle laden, ohne Fehlertracking zu verlieren | weniger initiale JS-Arbeit | mittel |
| P1 | Datenload staffeln: Startscreen braucht nicht sofort alle Fragen und Flashcards | echte Inhalte früher | mittel |
| P2 | Font-Setup verschlanken | weniger externe Roundtrips | niedrig |
| P2 | ScrollToTop vereinfachen | weniger Ruckeln bei Navigation | niedrig |
| P2 | Statistik/History serverseitig begrenzen oder aggregieren | bessere Skalierung | mittel |
| P3 | Erklärungsbilder in WebP/AVIF und responsive Größen | weniger Datenvolumen in Lernflows | niedrig |

## 6. Kritik an aktuellen Performance-Problemen

Die App macht mehrere Dinge gleichzeitig richtig und falsch:

- Richtig: Code-Splitting ist vorhanden.
- Falsch: Zu viele zentrale Imports hebeln den Effekt teilweise wieder aus.
- Richtig: Der Datenload ist parallel.
- Falsch: Er lädt beim Erststart zu viel.
- Richtig: Skeletons verbessern die Wahrnehmung.
- Falsch: Skeletons verdecken, dass echter Content mobil viel zu spät kommt.
- Richtig: Monitoring und Analytics sind produktiv wichtig.
- Falsch: Ihre Bibliotheken liegen zu früh im kritischen Startpfad.
- Richtig: Stripe ist sauber gekapselt.
- Falsch: Diese Kapsel hängt trotzdem am initialen App-Importgraphen.

Das ist kein Fall für einen großen Architekturumbau. Es sind mehrere gezielte Startpfad-Korrekturen.

## 7. Risiken, falls nichts verbessert wird

- Mobile Nutzer springen ab, bevor sie den echten Produktwert sehen.
- Paid-Traffic verliert Effizienz, weil Ladezeit vor Vertrauen/CTA liegt.
- Checkout-Skript kostet Performance auch bei Nutzern ohne Kaufabsicht.
- Mit wachsender Datenmenge werden Erststart und Statistik langsamer.
- Die App fühlt sich trotz guter Funktionalität weniger hochwertig an.
- Performance-Probleme werden schwerer zu erkennen, wenn sie durch Skeletons kaschiert werden.

## 8. Konkrete Empfehlungen

### 1. Paywall und Stripe aus dem initialen Bundle entfernen

Empfehlung:

- `PaywallDialog` in `src/App.tsx` per `lazy(() => import('./components/PaywallDialog'))` laden.
- `PaywallView` und besonders `EmbeddedPayment` erst importieren, wenn die Paywall wirklich geöffnet ist.
- `@stripe/stripe-js` erst laden, wenn ein `clientSecret` existiert und Checkout angezeigt wird.

Erwarteter Effekt: weniger initiales JS und kein Stripe-Request vor Kaufabsicht.

### 2. Initiale App-Shell verschlanken

Empfehlung:

- Nur Dashboard und wirklich sofort benötigte Auth-/Error-Komponenten eager lassen.
- `QuestionView`, `ModuleDetail`, `ModuleQuestionsList`, `Profile`, Legal-Seiten und Practice-Seiten lazy laden.
- Fallbacks route-spezifisch halten, nicht pauschal `SplashScreen`.

Erwarteter Effekt: schnellerer FCP/LCP, besonders mobil.

### 3. Icon-Imports gezielt bereinigen

Empfehlung:

- `import * as Icons from 'lucide-react'` aus häufig geladenen Seiten entfernen.
- Für dynamische Modul-Icons eine kleine explizite Registry bauen, z. B. nur die tatsächlich verwendeten Icon-Komponenten.
- Nicht alle Icons über Namespace in App- oder Hauptseiten importieren.

Erwarteter Effekt: deutlich kleinerer `ui`-Chunk.

### 4. Analytics und Monitoring entkoppeln

Empfehlung:

- PostHog erst nach Consent dynamisch importieren.
- Sentry entweder weiter früh laden, aber Replay/Tracing verzögert initialisieren, oder Sentry per dynamischem Import nach erstem Paint laden. Fehlertracking beim Bootstrap muss dabei bewusst abgesichert bleiben.

Erwarteter Effekt: weniger Main-Thread-Arbeit im Start.  
Risiko: Fehler-Monitoring darf nicht blind werden. Deshalb schrittweise und mit Sentry-Test prüfen.

### 5. Datenload nicht als Alles-oder-nichts-Start behandeln

Empfehlung:

- Für Dashboard initial nur Module, Lesson-Metadaten und minimale Frage-/Fortschrittszählungen laden.
- Vollständige Fragen/Antworten erst beim Üben/Lernen oder im Hintergrund nach erstem Content laden.
- Preview- und Full-Queries prüfen: Wenn beide nötig sind, sollte der Startscreen nur Preview/Metadaten brauchen.
- Cache weiter nutzen, aber Erstbesuch leichter machen.

Erwarteter Effekt: echter Inhalt erscheint früher; weniger Abhängigkeit von Supabase beim Start.

### 6. Font-Setup reduzieren

Empfehlung:

- Prüfen, ob `Public Sans` wirklich genutzt wird.
- Material Icons und Material Symbols nicht parallel mehrfach laden.
- Langfristig Icon-Font-Nutzung durch lucide-Komponenten oder lokale subset Fonts ersetzen.

Erwarteter Effekt: weniger externe Requests, weniger FOIT/FOUT-Risiko.

### 7. ScrollToTop vereinfachen

Empfehlung:

- Kein `querySelectorAll('*')` auf jeder Route.
- Nur relevante Scrollcontainer gezielt zurücksetzen.

Erwarteter Effekt: weniger potenzielle Ruckler bei Navigation.

### 8. Statistik/History skalierbarer machen

Empfehlung:

- Für Statistiken keine komplette Historie laden, wenn nur 30/90 Tage angezeigt werden.
- Später ggf. Supabase-View/RPC für aggregierte Tageswerte.

Erwarteter Effekt: bessere Performance für aktive Langzeitnutzer.

### 9. Erklärungsbilder optimieren

Empfehlung:

- PNGs in WebP/AVIF umwandeln.
- Responsive Varianten erzeugen.
- `loading="lazy"` beibehalten, `decoding="async"` überall setzen.

Erwarteter Effekt: bessere Lernflow-Performance und weniger Mobil-Datenverbrauch.

## 9. Kritisch vs. Nice-to-have

### Wirklich kritisch

- Mobile LCP und erster echter Content.
- Stripe/Checkout-Code im initialen Dashboard.
- Zu großer `ui`-Chunk durch Icon-/UI-Importmuster.
- Zu breiter Erst-Datenload.

### Wichtig, aber nicht akut kritisch

- Analytics/Sentry-Entkopplung.
- Font-Setup.
- ScrollToTop-Vereinfachung.
- Statistik-Queries skalieren.

### Nice-to-have

- Erklärungsbilder konvertieren, solange sie nicht im initialen Pfad liegen.
- Weitere CSS-Feinoptimierungen.
- Perfekte Lighthouse-100-Punkt-Jagd. Das wäre nicht produktiv, solange echte Nutzerpfade noch schwer sind.

## 10. Klare Optimierungsreihenfolge

1. **Stripe und Paywall lazy laden.** Schnellster, direktester Gewinn ohne Produktlogik umzubauen.
2. **Eager Page Imports in `App.tsx` reduzieren.** App-Shell kleiner machen.
3. **`lucide-react` Namespace-Imports ersetzen.** UI-Chunk verkleinern.
4. **PostHog nach Consent dynamisch importieren und Sentry-Replay/Tracing prüfen.** Monitoring behalten, Startkosten senken.
5. **Dashboard-Datenload splitten.** Erst Metadaten und Fortschritt, vollständige Fragen/Flashcards später.
6. **Fonts bereinigen.** Externe CSS-Requests reduzieren.
7. **ScrollToTop vereinfachen.**
8. **Statistik-/History-Queries bei Bedarf serverseitig aggregieren.**
9. **Erklärungsbilder konvertieren.**

## 11. Unterschiede zwischen gefühlter und tatsächlicher Geschwindigkeit

Die App fühlt sich besser an, als die Mobile-Messwerte zeigen, weil Skeletons und stabile Layouts früh sichtbar sind. Das ist gut für UX. Aber der echte Content kommt mobil zu spät. Für Nutzer ist der Unterschied:

- Gefühl: „Die App lädt immerhin.“
- Realität: „Ich kann noch nicht wirklich lernen/handeln.“

Das ist besonders relevant für Conversion. Skeletons halten Nutzer nur kurz. Wenn danach nicht schnell Nutzen sichtbar wird, sinkt Vertrauen.

## 12. Kurze Zusammenfassung für Nicht-Techniker

Die App ist funktional stabil und auf Desktop brauchbar schnell. Auf dem Handy lädt sie beim ersten Besuch aber zu schwer. Es werden zu früh Dinge geladen, die der Nutzer noch gar nicht braucht, zum Beispiel Checkout-/Stripe-Code, Analytics-Code, viele Icons und große Datenmengen.

Das größte Problem ist nicht ein einzelner Bug, sondern ein zu schwerer Start. Die App zeigt zwar Ladeplatzhalter, aber der echte Inhalt erscheint auf langsameren Handys zu spät. Das kann Nutzer und Käufer kosten.

Die wichtigsten Verbesserungen sind klar und überschaubar: Zahlungs-/Paywall-Code erst laden, wenn er gebraucht wird, den Startbildschirm kleiner machen, Icon- und Analytics-Code aus dem Startpfad nehmen und Daten schrittweise laden. Ein großer technischer Umbau ist dafür nicht nötig.

## Anhang: wichtigste Belege

- Build erfolgreich mit `npm run build`.
- Mobile Lighthouse: Performance 57/100, FCP 6,62 s, LCP 22,65 s, TBT 120 ms, CLS 0,0036.
- Desktop Lighthouse: Performance 65/100, FCP 1,59 s, LCP 4,28 s, TBT 0 ms, CLS 0,0005.
- Größter lokaler Chunk: `ui-*.js` ca. 204 KB gzip.
- Externer Stripe-Request im initialen Dashboard: `https://js.stripe.com/clover/stripe.js`.
- Frühe App-Imports: `src/App.tsx:23-45`.
- Paywall/Stripe-Importkette: `src/App.tsx:10`, `src/components/PaywallDialog.tsx:1`, `src/components/PaywallView.tsx:10`, `src/components/EmbeddedPayment.tsx:2`.
- Initialer Datenload: `src/contexts/DataCacheContext.tsx:179-188`.
- Font-Requests im HTML: `index.html:9-13`.
- Globaler Scroll-Reset: `src/App.tsx:1055-1065`.
