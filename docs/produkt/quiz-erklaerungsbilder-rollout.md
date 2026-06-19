---
title: Quiz-Erklärungsgrafiken Rollout
status: in Arbeit
last_updated: 2026-06-18
owner: Content / Produkt
---

# Quiz-Erklärungsgrafiken Rollout

## Ziel

Für alle Quizfragen sollen passende Erklärungsgrafiken entstehen. Die Bilder sollen die gespeicherte
Explanation leichter verständlich machen, **ohne** nur die richtige Antwort zu markieren. Sie werden
oberhalb des Erklärungstextes angezeigt.

## Aktueller Status

Modul 1 „Öffentliche Sicherheit und Ordnung“: **51 Quizfragen**, davon **3 mit Erklärungsgrafik**
und **48 offen**. Die ersten drei Grafiken sind freigegeben, im Repo gespeichert und per Supabase
Migration verknüpft.

| Reihenfolge | Frage-ID | Thema | Asset | Status |
|-------------|----------|-------|-------|--------|
| 1 | `a2396f6a-ae9e-42c0-bb5f-21790c40a73d` | Schutzgüter der Öffentlichen Sicherheit | `/question-explanations/öffentliche-sicherheit-schutzgüter.png` | freigegeben, gespeichert, in DB verknüpft |
| 2 | `61105670-c58d-4002-bd95-0754045201cc` | Befugnisse privater Sicherheitsmitarbeiter | `/question-explanations/private-sicherheit-befugnisse.png` | freigegeben, gespeichert, in DB verknüpft |
| 3 | `039f7735-96c5-4cb3-9c72-52beec7381a5` | Öffentliches Recht vs. Privatrecht | `/question-explanations/öffentliches-recht-privatrecht.png` | freigegeben, gespeichert, in DB verknüpft |
| 4+ | offen | weitere Quizfragen in UI-Reihenfolge | offen | noch zu generieren |

## Automatisierter Batchlauf Modul 1

Der Modul-1-Rollout läuft über `npm run pilot:question-images`. Die Pipeline nutzt die OpenAI
Image API, nicht die ChatGPT-App. Standardmodell ist `gpt-image-2`, weil die offizielle OpenAI-Doku
für einzelne Bildgenerierung die Image API empfiehlt und `gpt-image-2` als aktuelles GPT-Image-Modell
führt: <https://developers.openai.com/api/docs/guides/image-generation>.

Wichtig: Die Pipeline schreibt in `--stage=generate` **nicht** in Supabase und verändert keine
freigegebenen Assets. Kandidaten und Review-Dateien landen unter `local_archive/question_explanation_images/`
und sind git-ignored. Erst `--stage=commit` kopiert freigegebene PNGs nach
`public/question-explanations/` und erzeugt eine neue Migration. `supabase db push` bleibt ein
separater, sichtbarer Schritt.

Dry-run ohne OpenAI-Kosten:

```bash
npm run pilot:question-images -- --module-order=1 --count=2 --dry-run --stage=generate
```

Batch-Kandidaten für alle fehlenden Modul-1-Fragen:

```bash
npm run pilot:question-images -- --module-order=1 --only-missing --stage=generate
```

Nach Review `approved.json` im Run-Ordner anlegen:

```json
{
  "approved": [
    "question-id-1",
    "question-id-2"
  ]
}
```

Freigegebene Bilder übernehmen und Migration erstellen:

```bash
npm run pilot:question-images -- --stage=commit --manifest=local_archive/question_explanation_images/<run-id>/manifest.json --approved-file=local_archive/question_explanation_images/<run-id>/approved.json
supabase db push --dry-run
supabase db push
npm run build
```

Lokale Env-Variablen:

| Variable | Standard | Zweck |
|----------|----------|-------|
| `OPENAI_API_KEY` | erforderlich für echte Bildgenerierung | OpenAI API-Key, nur lokal/serverseitig, nie mit `VITE_` |
| `QUESTION_IMAGE_MODEL` | `gpt-image-2` | GPT-Image-Modell |
| `QUESTION_IMAGE_SIZE` | `1536x864` | 16:9-Ausgabe, beide Kanten Vielfache von 16 |
| `QUESTION_IMAGE_QUALITY` | `medium` | Bildqualität |
| `QUESTION_IMAGE_TIMEOUT_MS` | `180000` | Timeout pro OpenAI-Aufruf |
| `QUESTION_IMAGE_BRIEF_MODEL` | leer | Optionales Textmodell für JSON-Briefs; leer nutzt lokale Heuristik |

## Technische Umsetzung

Neue optionale Spalten in `public.questions`:

| Spalte | Inhalt |
|--------|--------|
| `question_explanation_image_url` | Öffentliche URL zum Bild |
| `question_explanation_image_alt_de` | Deutscher Alt-Text |
| `question_explanation_image_prompt` | Prompt-/Quellnotiz |

Frontend-Mapping:

- `src/types.ts`: `Question.explanationImageUrl`, `Question.explanationImageAltDE`
- `src/contexts/DataCacheContext.tsx`: Mapping aus Supabase-Daten und Cache-Version
- `src/components/pages/QuestionView.tsx`: Übergabe an `ExplanationRenderer`
- `src/components/pages/ExplanationRenderer.tsx`: Rendering des optionalen Bildes oberhalb des Textes

Assets liegen im Repo unter:

```text
public/question-explanations/
```

Die URL in Supabase ist relativ, z. B.:

```text
/question-explanations/private-sicherheit-befugnisse.png
```

## Workflow pro Frage

1. Nächste Frage in UI-Reihenfolge bestimmen.
2. Frage, Antwortoptionen und `explanation_de` read-only aus Supabase laden.
3. Bild-Brief und Prompt erzeugen.
4. Grafik mit OpenAI `gpt-image-2` generieren.
5. Nutzer prüft das Bild im Review-Ordner.
6. Nur bei Freigabe: PNG unter `public/question-explanations/` speichern.
7. Migration anlegen, die nur freigegebene Fragen aktualisiert.
8. `supabase db push` ausführen.
9. Read-only prüfen:
   - DB-Felder sind gesetzt.
   - lokale Asset-URL liefert `200 OK`.
10. `npm run build` ausführen.

## Bildstil

Die Grafiken sollen zur bestehenden App passen:

- heller App-Look, keine dunklen Hintergründe
- weiße Cards mit großen Rundungen und weichen Schatten
- kräftiges Blau wie `#3B82F6` / `#2563EB`
- Slate-Typografie, klare Hierarchie, große lesbare Texte
- einfache App-Icons/Kacheln statt komplexer Poster
- wenig Text, keine langen Rechtserklärungen im Bild
- deutsche Umlaute korrekt schreiben: `ä`, `ö`, `ü`, `ß`

Nicht verwenden:

- Antwortbuchstaben wie A/B/C als Lösungshinweis
- Check-/X-Markierungen als reine Quizlösung, außer bewusst als UI-Zustand
- englische Begriffe
- Fotorealismus, Waffen-/Gewaltszenen, Wasserzeichen, Logos
- winzige Texte, die mobil nicht lesbar sind

## Standard-System-Prompt für neue Bilder

```text
Use case: scientific-educational
Asset type: modern illustration card for a German §34a learning app explanation area

Primary request:
Create an app-style explanation illustration for the quiz topic "<THEMA>". The image must explain the concept behind the stored explanation, not reveal answer letters or simply mark the correct choices.

Style:
Match a bright modern German learning app UI. Background #F0F4F8, main white card with very large rounded corners (24-32px), soft shadow, bold slate typography #0F172A, primary blue #3B82F6 / #2563EB, pale blue icon backgrounds, subtle emerald accents only when they help understanding. Lots of whitespace, large readable German text, clean rounded icon tiles. It should look like a native 34a Master app card, not a corporate infographic.

Composition:
16:9 horizontal card. Use a strong blue rounded header band with a short German title. Below it, use 2-6 rounded UI tiles or a simple split layout that explains the concept visually. Use modern lucide-style line icons. Keep the layout mobile-readable.

Text constraints:
Use only these German texts:
<EXAKTE_TEXTLISTE>
Use real German characters such as ä, ö, ü, ß. No extra text.

Avoid:
Answer letters, explicit solution markers, long legal paragraphs, small unreadable labels, photorealistic people, aggressive scenes, dark theme, decorative blobs, watermark, logo, English words.
```

## Prompt-Checkliste vor Generierung

- Thema aus der gespeicherten Explanation ableiten, nicht nur aus der Frage.
- Bild soll eine Erklärung sein, kein Lösungsspoiler.
- Exakte Textliste vorgeben.
- Wenn Abgrenzung wichtig ist, lieber zwei Bereiche zeigen, z. B. „darf“ vs. „Behörden“.
- Fachbegriffe kurz halten und in App-Kacheln aufteilen.

## Namenskonvention

Dateien:

```text
public/question-explanations/<kurzer-deutscher-slug>.png
```

Migrationen:

```text
supabase/migrations/YYYYMMDDHHMMSS_add_<topic>_explanation_image.sql
```

SQL-Muster:

```sql
UPDATE public.questions
SET
  question_explanation_image_url = '/question-explanations/<asset>.png',
  question_explanation_image_alt_de = '<deutscher Alt-Text>',
  question_explanation_image_prompt = '<Quelle/Prompt-Notiz>'
WHERE id = '<question-id>';
```

## Offene Punkte

- Optional später eine Admin-Ansicht für fehlende Erklärungsgrafiken bauen.
- Optional später Supabase-Trackingtabellen für Bild-Jobs ergänzen. Aktuell reicht der lokale
  `manifest.json`-Reviewlauf, weil vor DB-Schreibzugriff manuell freigegeben wird.
