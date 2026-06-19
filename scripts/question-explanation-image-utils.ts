export interface LessonRow {
  id: string;
  order_index: number | null;
  title_de: string | null;
}

export interface QuestionRow {
  id: string;
  lesson_id: string | null;
  order_index: number | null;
  global_order_index?: number | null;
  text_de: string;
  explanation_de: string | null;
  question_explanation_image_url?: string | null;
  correct_answer?: string | null;
  answer_a_de?: string | null;
  answer_b_de?: string | null;
  answer_c_de?: string | null;
  answer_d_de?: string | null;
  answer_e_de?: string | null;
  answer_f_de?: string | null;
}

export interface QuestionWithLesson extends QuestionRow {
  lesson_order_index: number | null;
  lesson_title_de: string | null;
}

export interface QuestionImageBrief {
  title: string;
  allowedText: string[];
  altText: string;
  slug: string;
}

export interface QuestionImageManifestEntry {
  questionId: string;
  moduleOrderIndex: number;
  lessonOrderIndex: number | null;
  lessonTitle: string | null;
  questionOrderIndex: number | null;
  globalOrderIndex: number | null;
  questionText: string;
  explanationDE: string | null;
  title: string;
  allowedText: string[];
  altText: string;
  slug: string;
  assetFileName: string;
  assetUrl: string;
  prompt: string;
  candidatePath: string | null;
  status: "generated" | "dry_run";
}

export interface QuestionImageManifest {
  version: 1;
  runId: string;
  moduleOrderIndex: number;
  generatedAt: string;
  model: string;
  size: string;
  quality: string;
  referenceImagePaths?: string[];
  dryRun: boolean;
  entries: QuestionImageManifestEntry[];
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

export function prepareQuestionImageTargets(params: {
  questions: QuestionRow[];
  lessons: LessonRow[];
  onlyMissing: boolean;
  limit: number;
}): QuestionWithLesson[] {
  const lessonById = new Map(params.lessons.map((lesson) => [lesson.id, lesson]));
  let rows = params.questions.map((question) => {
    const lesson = question.lesson_id ? lessonById.get(question.lesson_id) : undefined;
    return {
      ...question,
      lesson_order_index: lesson?.order_index ?? null,
      lesson_title_de: lesson?.title_de ?? null,
    };
  });

  if (params.onlyMissing) {
    rows = rows.filter((question) => !question.question_explanation_image_url);
  }

  rows.sort((a, b) => {
    const lessonA = a.lesson_order_index ?? Number.MAX_SAFE_INTEGER;
    const lessonB = b.lesson_order_index ?? Number.MAX_SAFE_INTEGER;
    if (lessonA !== lessonB) return lessonA - lessonB;

    const orderA = a.global_order_index ?? a.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.global_order_index ?? b.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    return a.id.localeCompare(b.id);
  });

  return params.limit > 0 ? rows.slice(0, params.limit) : rows;
}

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

function collectAllowedText(question: QuestionWithLesson): string[] {
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

function deriveTitle(question: QuestionWithLesson): string {
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

export function buildLocalQuestionImageBrief(question: QuestionWithLesson): QuestionImageBrief {
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

export function buildQuestionImagePrompt(question: QuestionWithLesson, brief: QuestionImageBrief): string {
  const exactTextList = [brief.title, ...brief.allowedText]
    .filter((item, index, all) => item && all.indexOf(item) === index)
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    "Use case: scientific-educational",
    "Asset type: modern illustration card for a German §34a learning app explanation area",
    "",
    "Primary request:",
    `Create an app-style explanation illustration for the quiz topic "${brief.title}".`,
    "The image must explain the concept behind the stored explanation, not reveal answer letters or simply mark the correct choices.",
    "",
    "Question context:",
    `Question: ${stripMarkdown(question.text_de)}`,
    `Stored explanation: ${truncate(stripMarkdown(question.explanation_de || ""), 1200)}`,
    "",
    "Style:",
    "Match the attached reference images very closely. They define the exact visual family: white or very light grey background, generous whitespace, rounded white cards, soft shadows, thin blue/green outlines, flat app-style icons, and bold slate typography #0F172A.",
    "Do NOT create a generic poster, marketing hero, dark/blue full-bleed banner, or cinematic illustration. The result must look like the same German learning-app infographic series as the references.",
    "Use primary blue #2563EB / #3B82F6 and emerald green accents only for category distinction. Keep icons simple, lucide-style, and centered inside pale circular or rounded-square icon tiles.",
    "",
    "Composition:",
    "16:9 horizontal infographic. Prefer a clear two-column or flowchart layout like the references: category cards, arrows or dashed connector lines, and a bottom rule/merksatz pill when helpful.",
    "Do not place a large centered title pill at the top. If a label is needed, integrate it as a small section label inside the relevant card or omit it.",
    "Keep the layout open and balanced. No crowded text, no tiny labels, no decorative blobs. All text must be large enough to read on mobile.",
    "",
    "Text constraints:",
    "Use only these German texts:",
    exactTextList,
    "Use real German characters such as ä, ö, ü, ß. No extra text.",
    "",
    "Avoid:",
    "Answer letters, explicit solution markers, long legal paragraphs, small unreadable labels, photorealistic people, aggressive scenes, dark theme, decorative blobs, watermark, logo, English words.",
  ].join("\n");
}

export function validateManifestEntry(entry: Pick<QuestionImageManifestEntry, "questionId" | "allowedText" | "assetUrl" | "assetFileName">): string[] {
  const issues: string[] = [];
  if (!entry.questionId) issues.push("questionId fehlt.");
  if (!entry.assetUrl.startsWith("/question-explanations/")) {
    issues.push(`assetUrl muss mit /question-explanations/ beginnen: ${entry.assetUrl}`);
  }
  if (!entry.assetFileName.endsWith(".png")) {
    issues.push(`assetFileName muss auf .png enden: ${entry.assetFileName}`);
  }
  if (entry.allowedText.length === 0 || entry.allowedText.length > 6) {
    issues.push(`allowedText muss 1 bis 6 Einträge haben: ${entry.allowedText.length}`);
  }
  for (const text of entry.allowedText) {
    if (hasAnswerLetterLabel(text)) issues.push(`allowedText enthält Antwortbuchstaben: ${text}`);
  }
  return issues;
}

export function parseApprovedQuestionIds(raw: unknown): Set<string> {
  if (Array.isArray(raw)) {
    return new Set(raw.filter((item): item is string => typeof item === "string" && item.trim()).map((item) => item.trim()));
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const approved = Array.isArray(record.approved) ? record.approved : Array.isArray(record.questionIds) ? record.questionIds : [];
    return new Set(approved.filter((item): item is string => typeof item === "string" && item.trim()).map((item) => item.trim()));
  }

  return new Set();
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildQuestionImageMigrationSql(entries: Pick<QuestionImageManifestEntry, "questionId" | "assetUrl" | "altText" | "prompt">[]): string {
  return entries
    .map((entry) => [
      "UPDATE public.questions",
      "SET",
      `  question_explanation_image_url = ${sqlString(entry.assetUrl)},`,
      `  question_explanation_image_alt_de = ${sqlString(entry.altText)},`,
      `  question_explanation_image_prompt = ${sqlString(`Automatisierter Review-Batch: ${truncate(entry.prompt, 900)}`)}`,
      `WHERE id = ${sqlString(entry.questionId)};`,
    ].join("\n"))
    .join("\n\n");
}
