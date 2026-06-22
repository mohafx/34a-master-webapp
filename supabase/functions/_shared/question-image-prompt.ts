// Pure, runtime-agnostic helpers for building the §34a quiz explanation image
// prompt. Mirrors scripts/question-explanation-image-utils.ts (Node side).
// Keep both in sync when the visual style changes.

export interface QuestionImageBrief {
  title: string;
  allowedText: string[];
  altText: string;
  slug: string;
}

export interface QuestionForImage {
  text_de: string;
  explanation_de: string | null;
  lesson_title_de?: string | null;
}

const ANSWER_LETTER_RE = /^(?:[A-Fa-f]|[A-Fa-f][).:-].*)$/;

const FALLBACK_TERMS = [
  "Öffentliches Recht",
  "Privatrecht",
  "hoheitliches Handeln",
  "Behörde",
  "Polizei",
  "Hausrecht",
  "Jedermannsrechte",
  "Notwehr",
  "Nothilfe",
  "Selbsthilfe",
  "Grundrechte",
  "Menschenwürde",
  "Rechtsstaat",
  "Gewaltmonopol",
  "Strafmonopol",
  "Legislative",
  "Exekutive",
  "Judikative",
  "Art. 1 GG",
  "Art. 2 GG",
  "Art. 10 GG",
  "Art. 13 GG",
  "§ 127 StPO",
];

export function createGermanSlug(input: string, fallback = "quiz-erklaerung"): string {
  const slug = input
    .normalize("NFC")
    .toLowerCase()
    .replace(/§/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || fallback;
}

export function hasAnswerLetterLabel(value: string): boolean {
  return ANSWER_LETTER_RE.test(value.trim());
}

function stripMarkdown(value: string): string {
  return value
    .replace(/[`*_>#\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1).trim()}…`;
}

function shortLabel(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const clipped = value.slice(0, maxChars).replace(/\s+\S*$/u, "").trim();
  return clipped || value.slice(0, maxChars).trim();
}

function collectAllowedText(question: QuestionForImage): string[] {
  const haystack = `${question.text_de}\n${question.explanation_de || ""}`;
  const found: string[] = [];

  for (const term of FALLBACK_TERMS) {
    if (haystack.toLowerCase().includes(term.toLowerCase()) && !found.includes(term)) {
      found.push(term);
    }
    if (found.length >= 6) break;
  }

  if (found.length < 3 && question.lesson_title_de) {
    const lessonTitle = stripMarkdown(question.lesson_title_de);
    if (lessonTitle && !found.includes(lessonTitle)) found.unshift(shortLabel(lessonTitle, 28));
  }

  if (found.length < 3) {
    found.push("Merksatz", "Rechte prüfen", "Grenzen beachten");
  }

  return found
    .map((item) => shortLabel(item, 32))
    .filter((item, index, all) => item && !hasAnswerLetterLabel(item) && all.indexOf(item) === index)
    .slice(0, 6);
}

function deriveTitle(question: QuestionForImage): string {
  const text = stripMarkdown(question.text_de);
  const lower = text.toLowerCase();

  if (lower.includes("befugnis") || lower.includes("befugnisse")) return "Befugnisse im Dienst";
  if (lower.includes("polizei") && lower.includes("sicherheits")) return "Polizei oder Sicherheitsdienst?";
  if (lower.includes("öffentliches recht") || lower.includes("öffentlichen rechts")) return "Öffentliches Recht erkennen";
  if (lower.includes("öffentliche sicherheit") && lower.includes("zuständig")) return "Zuständigkeit klären";
  if (lower.includes("schutzgüter") || lower.includes("schutzgut")) return "Schutzgüter erkennen";
  if (lower.includes("strafzettel")) return "Keine Polizeibefugnisse";
  if (lower.includes("durchsuch")) return "Grenzen der Durchsuchung";
  if (lower.includes("hoheit")) return "Hoheitliches Handeln";
  if (lower.includes("privatrecht")) return "Privatrecht abgrenzen";

  return shortLabel(text.replace(/\?$/u, ""), 46);
}

export function buildLocalQuestionImageBrief(question: QuestionForImage): QuestionImageBrief {
  const title = deriveTitle(question);
  const allowedText = collectAllowedText(question);
  const slugSource = `${title} ${allowedText.slice(0, 2).join(" ")}`;
  const slug = createGermanSlug(slugSource);
  const altTopic = allowedText.length > 0 ? allowedText.join(", ") : title;

  return {
    title,
    allowedText,
    altText: `Infografik zur Quiz-Erklärung: ${altTopic}.`,
    slug,
  };
}

export function buildQuestionImagePrompt(question: QuestionForImage, brief: QuestionImageBrief): string {
  const suggestedTerms = [brief.title, ...brief.allowedText]
    .filter((item, index, all) => item && all.indexOf(item) === index)
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    "Use case: scientific-educational",
    "Asset type: a polished educational infographic card for a German §34a security-exam learning app ('Sachkundeprüfung 34a').",
    "",
    "Goal:",
    "Create the clearest possible explanatory infographic that teaches the concept behind this quiz question and its explanation.",
    "The image must help a learner UNDERSTAND the concept. It must NEVER reveal answer letters (A–F) or mark which option is correct.",
    "",
    "Question context (German):",
    `Question: ${stripMarkdown(question.text_de)}`,
    `Explanation: ${truncate(stripMarkdown(question.explanation_de || ""), 1400)}`,
    "",
    "Format & legibility (IMPORTANT):",
    "Square 1:1 canvas. The image is shown fairly small on a phone, so EVERYTHING must be large and easy to read:",
    "text should be roughly as large as normal app body text, icons and illustrations big and clear.",
    "Mobile-first rule: optimize for a small phone screen, not for desktop. Keep the amount of content modest: few sections, few words per point, lots of whitespace. Prefer 2–3 big blocks over many small ones. NEVER crowd the canvas or shrink text to fit.",
    "Hard content budget: header + at most 2 main content cards is usually enough. Optional bottom sections like 'Merksatz', 'Wichtig', 'Praxis-Tipp', examples, extra checklist rows or third content bands are allowed ONLY if there is clearly enough space with large readable text.",
    "If space is tight, OMIT optional sections entirely. It is better to remove 'Merksatz', 'Wichtig' or 'Praxis-Tipp' than to make text small, stretched, compressed, crowded or hard to read.",
    "Never include both 'Merksatz' and 'Wichtig' or 'Praxis-Tipp' when the layout already has 2 main cards. Choose at most one optional bottom note, and omit it if it reduces readability.",
    "",
    "Layout freedom (IMPORTANT):",
    "YOU decide the best visual format for THIS specific content. Pick whatever explains it most clearly, for example:",
    "a numbered 2–3 step process (1·2·3 with arrows), a two-column comparison, a decision flowchart, a short labeled checklist, or a single strong definition with a few supporting points.",
    "Do NOT force a fixed template and do NOT reuse the exact same composition every time. Use only the elements that genuinely help this topic and leave the rest out. Keep it uncluttered.",
    "",
    "Visual style (STRICT — must match the attached reference images, with the blue override below):",
    "- Clean, modern, friendly flat-vector learning-app style. Light background (#F8FAFC or white), generous whitespace.",
    "- Top header banner: ALWAYS use the exact solid primary blue #4E81EE (RGB 78,129,238). This overrides the blue in the reference images. Do NOT use the darker reference-image blue for the header, badges, arrows or highlights.",
    "- Header layout should still match the reference images: large rounded blue banner, white icon tile on the left, bold white German title, smaller white subtitle.",
    "- White rounded cards (large corner radius) with soft, subtle shadows and clear spacing.",
    "- For steps, use small solid-blue circular number badges (1, 2, 3) and thin blue chevron/arrow connectors between cards.",
    "- Friendly flat vector illustrations and simple characters are ENCOURAGED (undraw / lucide style), placed on pale circular backgrounds. People must be illustrated, NEVER photorealistic.",
    "- Optional full-width pale-blue 'Merksatz/Definition' pill with a small icon; highlight 1–3 key terms inside it in bold primary blue.",
    "- Color system: the primary blue is EXACTLY #4E81EE (RGB 78,129,238) — use this single blue for the header banner, number badges, arrows and highlighted key terms. Do NOT use a darker blue such as #2563EB or #1D4ED8, and do NOT use a different blue such as #3B82F6. Emerald green #10B981 for positive points and checkmarks; amber #F59E0B only for a small 'Praxis'/tip accent. Headings and body text in slate #0F172A / #475569.",
    "- Typography is FIXED and must match the attached reference images as closely as possible: use one rounded modern sans-serif family only (Inter / SF Pro / app UI style), very bold large title, semibold section headings, clean medium-weight body text, same spacing, hierarchy and line-height.",
    "- Text rendering must be natural and uniform. NEVER stretch, squeeze, warp, horizontally scale, vertically scale, bend, distort, skew or artificially condense any letters or words. No elongated text, no compressed text, no uneven letter widths, no perspective text, no text following curves.",
    "- If text does not fit, use fewer words, a line break, or a larger card. Do NOT shrink, stretch or condense the font to make text fit.",
    "- If a label or section is not essential, remove it. Never solve space problems by making text smaller or denser.",
    "- Do NOT use a different font style, condensed type, serif type, handwriting, decorative type, outlined type, shadow-heavy type, overly thin text, or all-caps body text.",
    "- All text must be crisp, straight, evenly spaced, and large enough to read comfortably on a phone.",
    "- Fixed colors: header/banner/badges/arrows/highlights #4E81EE only; positive/check accents #10B981 only; small warning/tip accents #F59E0B only; main text #0F172A; secondary text #475569; cards white; background #F8FAFC.",
    "Reproduce the card style, icon tiles, composition density and typography of the attached references faithfully. Only override the reference blue with #4E81EE.",
    "",
    "Text in the image (German):",
    "Write your own concise, correct German labels and short sentences derived from the explanation above.",
    "Use real German characters such as ä, ö, ü, ß. Keep text minimal: short headlines, a few words per point, one short Merksatz. No spelling mistakes, no English words.",
    "Suggested key terms you MAY use (optional, not mandatory):",
    suggestedTerms,
    "",
    "Avoid:",
    "Answer letters or option markers, the phrase 'richtige Antwort', long legal paragraphs, tiny unreadable text, photorealistic people, weapons-in-use or graphic/aggressive scenes, dark full-bleed theme, watermark, logo, English words.",
  ].join("\n");
}
