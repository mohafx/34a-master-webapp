---
title: Quiz-Erklärungsgrafiken Rollout
status: Self-Service live im Test
last_updated: 2026-06-22
owner: Content / Produkt
---

# Quiz-Erklärungsgrafiken Rollout

## Ziel

Für alle Quizfragen sollen passende Erklärungsgrafiken entstehen. Die Bilder sollen die gespeicherte
Explanation leichter verständlich machen, **ohne** nur die richtige Antwort zu markieren. Sie werden
oberhalb des Erklärungstextes angezeigt.

## Aktueller Status

Die ursprünglichen fest verknüpften Erklärungsgrafiken wurden zurückgesetzt. Quiz-Erklärbilder werden
jetzt per Self-Service im UI erzeugt: Bei Fragen ohne Bild erscheint „Erklärbild erstellen“. Die
erste erfolgreiche Generierung speichert genau ein PNG in Supabase Storage und verknüpft die URL in
`public.questions`; danach sehen alle Nutzer dieses Bild und der Erstellen-Button verschwindet.

Admin-Konten (`m.almajzoub1@gmail.com`) sehen bei vorhandenen Bildern zusätzlich:

- `Bild löschen` — entfernt Storage-Objekt und DB-Verknüpfung.
- `Bild regenerieren` — löscht das vorhandene Bild und erzeugt sofort ein neues.

Serverseitig erzwingt die Edge Function `generate-question-image`, dass normale Nutzer vorhandene
Bilder nicht neu generieren können. Admin-Aktionen werden per Supabase-JWT und Admin-Mail geprüft.

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

Aktuelle Image-API-Settings:

| Variable | Standard | Zweck |
|----------|----------|-------|
| `OPENAI_API_KEY` | erforderlich für echte Bildgenerierung | OpenAI API-Key, nur lokal/serverseitig, nie mit `VITE_` |
| `QUESTION_IMAGE_MODEL` | `gpt-image-2` | GPT-Image-Modell |
| `QUESTION_IMAGE_SIZE` | `1024x1024` | quadratische mobile-first Ausgabe |
| `QUESTION_IMAGE_QUALITY` | `medium` | Bildqualität |
| `QUESTION_IMAGE_TIMEOUT_MS` | `180000` | Timeout pro OpenAI-Aufruf |
| `QUESTION_IMAGE_BRIEF_MODEL` | leer | Optionales Textmodell für JSON-Briefs; leer nutzt lokale Heuristik |

Die Edge Function nutzt `/v1/images/edits`, sobald Referenzbilder abrufbar sind; Fallback ohne
Referenzen wäre `/v1/images/generations` mit `n=1`. Aktuell sind vier Referenzbilder in
`public/question-explanations/` und remote unter `question-explanations/_references/` aktiv:

- `185563F2-94F9-4EB0-A1CF-97DD8EAC5CF6.PNG`
- `C6438977-F0F0-4A8E-8D05-4B60409DBF73.PNG`
- `E574E446-36EC-4DBA-9DC2-DA3469C02259.PNG`
- `F28B7702-F43D-4152-8498-463ADD7DC86C.PNG`

## Technische Umsetzung

Neue optionale Spalten in `public.questions`:

| Spalte | Inhalt |
|--------|--------|
| `question_explanation_image_url` | Öffentliche URL zum Bild |
| `question_explanation_image_alt_de` | Deutscher Alt-Text |
| `question_explanation_image_prompt` | Prompt-/Quellnotiz |
| `question_explanation_image_status` | Reservefeld für Status/Lock-Migration |
| `question_explanation_image_locked_at` | Reservefeld für Status/Lock-Migration |

Frontend-Mapping:

- `src/types.ts`: `Question.explanationImageUrl`, `Question.explanationImageAltDE`
- `src/contexts/DataCacheContext.tsx`: Mapping aus Supabase-Daten und Cache-Version
- `src/components/pages/QuestionView.tsx`: Übergabe an `ExplanationRenderer`
- `src/components/pages/ExplanationRenderer.tsx`: Rendering des Bildes, Self-Service-Button und Admin-Aktionen
- `src/services/questionImages.ts`: Aufruf von `generate-question-image`
- `supabase/functions/generate-question-image/`: serverseitige Generierung, Cache, Admin-Delete und Admin-Regenerate

Referenzbilder liegen im Repo unter:

```text
public/question-explanations/
```

Generierte Nutzerbilder liegen im Supabase Storage Bucket:

```text
question-explanations/<question-id>.png
```

## Workflow pro Frage

1. Nutzer beantwortet eine Frage und sieht die Erklärung.
2. Wenn kein Bild verknüpft ist, zeigt `ExplanationRenderer` den Button `Erklärbild erstellen`.
3. `generate-question-image` lädt Frage, Erklärung und Referenzbilder.
4. Die Function erzeugt ein Bild per OpenAI Image API und lädt es nach Supabase Storage.
5. Die Function setzt `question_explanation_image_url`, Alt-Text und Prompt-Notiz in `questions`.
6. Weitere Nutzer erhalten das gespeicherte Bild; neue Generierung ist blockiert.
7. Admins können das Bild löschen oder regenerieren.

## Bildstil

Die Grafiken sollen zur bestehenden App passen:

- heller App-Look, keine dunklen Hintergründe
- weiße Cards mit großen Rundungen und weichen Schatten
- primäres Blau exakt `#4E81EE` für Header, Badges, Pfeile und Highlights
- feste Farben: Grün `#10B981`, Orange `#F59E0B`, Haupttext `#0F172A`, Sekundärtext `#475569`, Hintergrund `#F8FAFC`
- Slate-Typografie, klare Hierarchie, große lesbare Texte
- mobile-first: lieber optionale Bereiche wie „Merksatz“, „Wichtig“ oder „Praxis-Tipp“ weglassen, statt Text zu verkleinern oder zu quetschen
- Schrift nicht strecken, stauchen, verzerren oder künstlich kondensieren
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
Match the attached reference images, but override all blue accents with exactly #4E81EE. Use a
bright mobile-first German learning-app UI: background #F8FAFC, white rounded cards, soft shadow,
fixed rounded modern sans-serif typography, main text #0F172A, secondary text #475569, positive
accents #10B981 and small warning/tip accents #F59E0B. Do not stretch, squeeze, warp, skew or
condense text. If space is tight, remove optional sections such as Merksatz, Wichtig or Praxis-Tipp.

Composition:
Square 1:1 card. Use a #4E81EE rounded header band with a short German title. Prefer header plus
at most two main content cards. Add at most one optional bottom note only if all text remains large
and mobile-readable.

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
- Optional später dedizierte Supabase-Trackingtabellen für Bild-Jobs ergänzen. Aktuell nutzt die
  Function `question_explanation_image_prompt` als einfachen Lock-/Audit-Marker.
