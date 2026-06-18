---
title: KI-Mündliche-Prüfungssimulation — Produkt-Spec (Vision)
scope: Produkt / Vision
status: Entwurf
last_verified: 2026-06-18
---

# KI-Mündliche-Prüfungssimulation — wie Nutzer sie perfekt haben wollen

> **Zweck:** Das ideale Nutzererlebnis einer KI-gestützten Simulation der **mündlichen**
> §34a-Sachkundeprüfung beschreiben — bewusst **ohne** Rücksicht auf technische Machbarkeit. Nordstern-
> Vision, gegen die die (machbare) Umsetzung geschnitten wird. Der konkrete Bauplan/As-Built liegt in
> [ki-muendliche-pruefungssimulation-umsetzung.md](ki-muendliche-pruefungssimulation-umsetzung.md);
> die vollständige Funktions-/Bewertungs-Referenz in
> [ki-muendliche-pruefungssimulation-funktionsweise.md](ki-muendliche-pruefungssimulation-funktionsweise.md).

## 1. Warum dieses Feature (Evidenz)

- **Nachfrage in eigenen Daten (PostHog):** `/34a-pruefungssimulation` und `/muendliche-pruefung`
  gehören zu den meistbesuchten Seiten; Prüfungs-Verhalten ist sticky (schriftliche Prüfung ~66 %
  Abschluss, Quizze ~6,5× wiederholt); Paywall-Conversion 34–45 %.
- **Marktlücke:** Die meisten Wettbewerber bereiten nur den **schriftlichen** Teil vor. Der
  **mündliche** Teil mit Sprach-Ein-/Ausgabe und dynamischen Rückfragen ist die Ausnahme.
- **Strategische Wette:** Erstklassige mündliche Simulation = Kaufrechtfertigung **und** Marketing-Hook.

## 2. Was die echte mündliche Prüfung ausmacht

| Merkmal | Realität | Konsequenz für die Sim |
|---|---|---|
| Zulassung | Nur nach bestandener schriftlicher (≥50 %) | „Stufe 2" nach schriftlichem Training |
| Format | Gruppe bis 5, **~15 Min/Person** | Zeitgefühl & 15-Min-Modus |
| Bestehensgrenze | **≥50 %** | Transparentes Scoring, Pass/Fail sichtbar |
| Schwerpunkt | **Praxis-Fallbeispiele** | Szenario-getrieben, nicht Faktenabfrage |
| Kern-Themen | **Umgang mit Menschen**, Gefahrensituationen, **Deeskalation**, interkulturelle Kompetenz | priorisieren |
| Stil der Prüfer | Wollen Verständnis sehen; **bohren nach** | KI fragt dynamisch nach |
| Fragen | nicht vorab veröffentlicht | KI generiert variierende Szenarien |

**Psychologische Wahrheit:** Wer schriftlich besteht, besteht mündlich in >90 % der Fälle. Hauptgrund
fürs Durchfallen ist **„Blackout"/Nervosität**, nicht fehlendes Wissen → das Produkt verkauft primär
**Sicherheit & Routine im freien Sprechen**.

## 3. Zielnutzer
- **„Der Nervöse"** — braucht Wiederholung unter Druck, bis Sprechen Routine wird.
- **„Der Last-Minute-Driller"** — schnelle, realistische Durchläufe + klares Feedback.
- **„Der Gründliche"** — Abdeckungs-Tracking über alle Themen.

## 4. Leitprinzipien
1. Fühlt sich an wie die echte Prüfung, nicht wie ein Quiz.
2. **Sprechen statt Tippen** (Tippen als Fallback).
3. **Dynamische Rückfragen** wie ein echter Prüfer.
4. **Angst-Abbau durch Wiederholung** — beliebig oft, sichtbarer Fortschritt.
5. **Feedback, das schlauer macht** — Score je Thema, Musterantwort, nächster Schritt.
6. **Realismus zum Stichtag** (Format 2025+, Schwerpunkt Umgang/Deeskalation).

## 5. Idealer Ablauf
1. Einstieg (Schwierigkeit · Fokus · Dauer)
2. Setting-Aufbau (Prüfer-Persona begrüßt)
3. Fallbeispiel-Runde(n) mit Sprache + dynamischen Rückfragen
4. Abschluss (Bestanden/Nicht bestanden + Score)
5. Auswertung (Themen-Score, Transkript, was gefehlt hat, Musterantwort, roter Faden, nächster Schritt)
6. Fortschritt über Zeit (Verlauf, Themen-Abdeckung, „Prüfungsreife")

## 6. Inhaltliche Abdeckung (priorisiert)
1. Umgang mit Menschen / Deeskalation / interkulturelle Kompetenz
2. Verhalten in Gefahrensituationen
3. Recht der öffentlichen Sicherheit und Ordnung (Datenschutz, Versammlungsrecht, Abgrenzung Polizei ↔ privat)
4. Bürgerliches Recht (Hausrecht, Eigentum/Besitz)
5. Straf- und Verfahrensrecht (Notwehr, Notstand, Festnahme)
6. Gewerberecht / Datenschutz
7. Unfallverhütung / Umgang mit Waffen (sofern relevant)

## 7. Erfolgskriterien (PostHog)
- `oral_exam_started`, `oral_exam_completed` (+ `score`, `topic`, `mode`/`difficulty`, `duration`).
- Aktivierung (Anteil mit ≥1 Durchlauf), Wiederholung (Durchläufe/Nutzer), Conversion-Effekt mit/ohne
  Gratis-Durchlauf, Preis-Wirkung, wahrgenommener Nutzen (Ein-Klick-Umfrage).

## 8. Bewusst offen
- Gruppen-Simulation (mehrere Prüflinge) — v1 evtl. 1:1.
- Rechtliche Abgrenzung klar kommunizieren: „Simulation, keine offiziellen IHK-Fragen".
- Technische Machbarkeit (Latenz/Kosten/Modellwahl) → siehe Umsetzungs-Spec.
