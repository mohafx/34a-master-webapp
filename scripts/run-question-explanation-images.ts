import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildLocalQuestionImageBrief,
  buildQuestionImageMigrationSql,
  buildQuestionImagePrompt,
  createGermanSlug,
  parseApprovedQuestionIds,
  prepareQuestionImageTargets,
  validateManifestEntry,
  type LessonRow,
  type QuestionImageBrief,
  type QuestionImageManifest,
  type QuestionImageManifestEntry,
  type QuestionRow,
  type QuestionWithLesson,
} from "./question-explanation-image-utils.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

type Stage = "generate" | "commit";

interface Args {
  stage: Stage;
  moduleOrderIndex: number;
  onlyMissing: boolean;
  limit: number;
  dryRun: boolean;
  manifestPath: string;
  approvedFilePath: string;
  overwriteApproved: boolean;
  outputRoot: string;
  questionId: string;
  referenceImagePaths: string[];
  concurrency: number;
}

const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "1536x864";
const DEFAULT_QUALITY = "medium";
const DEFAULT_OUTPUT_ROOT = "local_archive/question_explanation_images";
const DEFAULT_OPENAI_TIMEOUT_MS = 180_000;
const DEFAULT_REFERENCE_IMAGE_PATHS = [
  "public/question-explanations/öffentliches-recht-privatrecht.png",
  "public/question-explanations/private-sicherheit-befugnisse.png",
];

function parseArgs(): Args {
  const defaults: Args = {
    stage: "generate",
    moduleOrderIndex: 1,
    onlyMissing: true,
    limit: 0,
    dryRun: false,
    manifestPath: "",
    approvedFilePath: "",
    overwriteApproved: false,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    questionId: "",
    referenceImagePaths: [],
    concurrency: 1,
  };

  const parseBool = (value: string): boolean => ["1", "true", "yes"].includes(value.trim().toLowerCase());

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--stage=")) defaults.stage = arg.split("=")[1] as Stage;
    else if (arg.startsWith("--module-order=")) defaults.moduleOrderIndex = Number(arg.split("=")[1]);
    else if (arg === "--only-missing") defaults.onlyMissing = true;
    else if (arg === "--include-existing") defaults.onlyMissing = false;
    else if (arg.startsWith("--count=")) defaults.limit = Number(arg.split("=")[1]);
    else if (arg === "--dry-run") defaults.dryRun = true;
    else if (arg.startsWith("--dry-run=")) defaults.dryRun = parseBool(arg.split("=")[1] || "false");
    else if (arg.startsWith("--manifest=")) defaults.manifestPath = arg.split("=").slice(1).join("=");
    else if (arg.startsWith("--approved-file=")) defaults.approvedFilePath = arg.split("=").slice(1).join("=");
    else if (arg === "--overwrite-approved") defaults.overwriteApproved = true;
    else if (arg.startsWith("--output-root=")) defaults.outputRoot = arg.split("=").slice(1).join("=") || DEFAULT_OUTPUT_ROOT;
    else if (arg.startsWith("--question-id=")) defaults.questionId = arg.split("=").slice(1).join("=");
    else if (arg.startsWith("--reference-image=")) defaults.referenceImagePaths.push(arg.split("=").slice(1).join("="));
    else if (arg.startsWith("--concurrency=")) defaults.concurrency = Number(arg.split("=")[1]);
  }

  if (!["generate", "commit"].includes(defaults.stage)) {
    throw new Error("--stage must be generate or commit.");
  }
  if (!Number.isFinite(defaults.moduleOrderIndex) || defaults.moduleOrderIndex <= 0) {
    throw new Error("--module-order must be a positive number.");
  }
  if (!Number.isFinite(defaults.limit) || defaults.limit < 0) {
    throw new Error("--count must be 0 or a positive number.");
  }
  if (!Number.isFinite(defaults.concurrency) || defaults.concurrency < 1) {
    throw new Error("--concurrency must be a positive number.");
  }
  if (defaults.stage === "commit" && !defaults.manifestPath) {
    throw new Error("--manifest is required for --stage=commit.");
  }
  if (defaults.stage === "commit" && !defaults.approvedFilePath) {
    throw new Error("--approved-file is required for --stage=commit.");
  }

  return defaults;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stampForPath(value = nowIso()): string {
  return value.replace(/[:.]/g, "-");
}

function getEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function getIntEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getSupabaseConfig() {
  const url = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const key =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("Supabase_Service_Role_Key") ||
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or Supabase_Service_Role_Key).");

  return { url, key };
}

function getOpenAiApiKey(): string {
  const key = getEnv("OPENAI_API_KEY") || getEnv("openai_key") || getEnv("OpenAI_API_KEY");
  if (!key) throw new Error("Missing OPENAI_API_KEY. Keep it local/server-side; do not use a VITE_ key.");
  return key;
}

async function fetchModuleQuestions(params: {
  supabase: ReturnType<typeof createClient>;
  moduleOrderIndex: number;
}): Promise<{ module: { id: string; title_de: string; order_index: number }; lessons: LessonRow[]; questions: QuestionRow[] }> {
  const { data: moduleRow, error: moduleErr } = await params.supabase
    .from("modules")
    .select("id,title_de,order_index")
    .eq("order_index", params.moduleOrderIndex)
    .single();
  if (moduleErr || !moduleRow) {
    throw new Error(`Cannot load module by order_index=${params.moduleOrderIndex}: ${moduleErr?.message || "not found"}`);
  }

  const { data: lessons, error: lessonsErr } = await params.supabase
    .from("lessons")
    .select("id,title_de,order_index")
    .eq("module_id", moduleRow.id)
    .order("order_index", { ascending: true });
  if (lessonsErr) throw new Error(`Cannot load lessons for module ${moduleRow.id}: ${lessonsErr.message}`);

  const { data: questions, error: questionsErr } = await params.supabase
    .from("questions")
    .select("id,lesson_id,order_index,global_order_index,text_de,explanation_de,question_explanation_image_url,correct_answer,answer_a_de,answer_b_de,answer_c_de,answer_d_de,answer_e_de,answer_f_de")
    .eq("module_id", moduleRow.id);
  if (questionsErr) throw new Error(`Cannot load questions for module ${moduleRow.id}: ${questionsErr.message}`);

  return {
    module: moduleRow as { id: string; title_de: string; order_index: number },
    lessons: (lessons || []) as LessonRow[],
    questions: (questions || []) as QuestionRow[],
  };
}

async function buildBrief(question: QuestionWithLesson, dryRun: boolean): Promise<QuestionImageBrief> {
  const briefModel = getEnv("QUESTION_IMAGE_BRIEF_MODEL");
  if (dryRun || !briefModel || briefModel.toLowerCase() === "off") {
    return buildLocalQuestionImageBrief(question);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getIntEnv("QUESTION_IMAGE_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS));
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: briefModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Erstelle ein JSON-Briefing für eine deutsche §34a Quiz-Erklärungsgrafik.",
                  "Schema: {\"title\":\"...\",\"allowedText\":[\"...\"],\"altText\":\"...\",\"slug\":\"...\"}.",
                  "Regeln: 1-6 kurze deutsche Bildtexte, keine Antwortbuchstaben A-F, keine englischen Begriffe, echte Umlaute, Slug kleingeschrieben mit Bindestrichen.",
                  `Frage: ${question.text_de}`,
                  `Erklärung: ${question.explanation_de || ""}`,
                ].join("\n"),
              },
            ],
          },
        ],
        text: { format: { type: "json_object" } },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI brief API timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI brief API error ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload: any = await response.json();
  const rawText = payload?.output_text || payload?.output?.flatMap((item: any) => item?.content || [])?.find((item: any) => item?.type === "output_text")?.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("OpenAI brief response did not contain output_text.");
  }

  const parsed = JSON.parse(rawText) as Partial<QuestionImageBrief>;
  const fallback = buildLocalQuestionImageBrief(question);
  return {
    title: parsed.title || fallback.title,
    allowedText: Array.isArray(parsed.allowedText) && parsed.allowedText.length > 0 ? parsed.allowedText.slice(0, 6) : fallback.allowedText,
    altText: parsed.altText || fallback.altText,
    slug: createGermanSlug(parsed.slug || fallback.slug),
  };
}

async function generateOpenAiImage(params: {
  prompt: string;
  model: string;
  size: string;
  quality: string;
  referenceImagePaths: string[];
}): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getIntEnv("QUESTION_IMAGE_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS));
  let response: Response;
  const resolvedReferences = params.referenceImagePaths
    .map((imagePath) => path.resolve(process.cwd(), imagePath))
    .filter((imagePath) => fs.existsSync(imagePath));

  try {
    if (resolvedReferences.length > 0) {
      const form = new FormData();
      form.set("model", params.model);
      form.set("prompt", params.prompt);
      form.set("size", params.size);
      form.set("quality", params.quality);
      form.set("output_format", "png");
      for (const imagePath of resolvedReferences) {
        const bytes = fs.readFileSync(imagePath);
        const blob = new Blob([bytes], { type: "image/png" });
        form.append("image[]", blob, path.basename(imagePath));
      }

      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey()}`,
        },
        body: form,
        signal: controller.signal,
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          prompt: params.prompt,
          size: params.size,
          quality: params.quality,
          output_format: "png",
          n: 1,
        }),
        signal: controller.signal,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI image API timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI image API error ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload: any = await response.json();
  const base64 = payload?.data?.[0]?.b64_json;
  if (typeof base64 !== "string" || !base64.trim()) {
    throw new Error("OpenAI image response did not contain data[0].b64_json.");
  }

  return new Uint8Array(Buffer.from(base64, "base64"));
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeReviewFile(filePath: string, manifest: QuestionImageManifest) {
  const lines: string[] = [
    `# Quiz-Erklärungsgrafiken Review`,
    "",
    `- Run: \`${manifest.runId}\``,
    `- Modul: ${manifest.moduleOrderIndex}`,
    `- Model: \`${manifest.model}\``,
    `- Referenzen: ${(manifest.referenceImagePaths || []).map((item) => `\`${item}\``).join(", ") || "-"}`,
    `- Dry-run: ${manifest.dryRun ? "ja" : "nein"}`,
    `- Kandidaten: ${manifest.entries.length}`,
    "",
    "## Review-Tabelle",
    "",
    "| Freigabe | Frage-ID | Fragetext | Lektion | Titel | Asset | Kandidat |",
    "|----------|----------|-----------|---------|-------|-------|----------|",
  ];

  for (const entry of manifest.entries) {
    lines.push(
      `| [ ] | \`${entry.questionId}\` | ${entry.questionText.replace(/\|/g, "\\|")} | ${entry.lessonOrderIndex ?? "-"} ${entry.lessonTitle || ""} | ${entry.title} | \`${entry.assetUrl}\` | ${entry.candidatePath ? `\`${entry.candidatePath}\`` : "_dry-run_"} |`,
    );
  }

  lines.push("", "## Bildprüfung", "");
  for (const entry of manifest.entries) {
    lines.push(
      `### ${entry.questionId}`,
      "",
      `**Frage:** ${entry.questionText}`,
      "",
      `**Geplanter Asset-Pfad:** \`${entry.assetUrl}\``,
      "",
    );
    if (entry.candidatePath) {
      lines.push(`![${entry.questionId}](${entry.candidatePath})`, "");
    } else {
      lines.push("_Dry-run: kein Bild erzeugt._", "");
    }
  }

  lines.push(
    "",
    "## approved.json Vorlage",
    "",
    "Nach der Prüfung eine Datei im selben Ordner anlegen:",
    "",
    "```json",
    JSON.stringify({ approved: [] }, null, 2),
    "```",
  );

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

async function runGenerate(args: Args) {
  const model = getEnv("QUESTION_IMAGE_MODEL", DEFAULT_MODEL);
  const size = getEnv("QUESTION_IMAGE_SIZE", DEFAULT_SIZE);
  const quality = getEnv("QUESTION_IMAGE_QUALITY", DEFAULT_QUALITY);
  const referenceImagePaths = args.referenceImagePaths.length > 0 ? args.referenceImagePaths : DEFAULT_REFERENCE_IMAGE_PATHS;
  const runId = `modul${args.moduleOrderIndex}_${stampForPath()}`;
  const outputDir = path.resolve(process.cwd(), args.outputRoot, runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key);
  const { module, lessons, questions } = await fetchModuleQuestions({ supabase, moduleOrderIndex: args.moduleOrderIndex });
  let selected = prepareQuestionImageTargets({
    questions,
    lessons,
    onlyMissing: args.onlyMissing,
    limit: args.limit,
  });
  if (args.questionId) {
    selected = selected.filter((question) => question.id === args.questionId);
    if (selected.length === 0) {
      throw new Error(`Question not selected or not found: ${args.questionId}`);
    }
  }

  const usedAssetFileNames = new Set<string>();

  const prepared = await Promise.all(selected.map(async (question) => {
    const brief = await buildBrief(question, args.dryRun);
    const prompt = buildQuestionImagePrompt(question, brief);
    let slug = brief.slug;
    let assetFileName = `${slug}.png`;
    if (usedAssetFileNames.has(assetFileName)) {
      slug = `${slug}-${question.id.slice(0, 8)}`;
      assetFileName = `${slug}.png`;
    }
    usedAssetFileNames.add(assetFileName);
    const assetUrl = `/question-explanations/${assetFileName}`;
    const candidatePath = args.dryRun ? null : path.join(outputDir, assetFileName);

    const entry: QuestionImageManifestEntry = {
      questionId: question.id,
      moduleOrderIndex: module.order_index,
      lessonOrderIndex: question.lesson_order_index,
      lessonTitle: question.lesson_title_de,
      questionOrderIndex: question.order_index,
      globalOrderIndex: question.global_order_index ?? null,
      questionText: question.text_de,
      explanationDE: question.explanation_de,
      title: brief.title,
      allowedText: brief.allowedText,
      altText: brief.altText,
      slug,
      assetFileName,
      assetUrl,
      prompt,
      candidatePath,
      status: args.dryRun ? "dry_run" : "generated",
    };

    const issues = validateManifestEntry(entry);
    if (issues.length > 0) {
      throw new Error(`Invalid manifest entry for ${question.id}: ${issues.join("; ")}`);
    }

    return entry;
  }));

  const entries = await mapWithConcurrency(prepared, args.dryRun ? 1 : args.concurrency, async (entry) => {
    if (!args.dryRun && entry.candidatePath) {
      const bytes = await generateOpenAiImage({ prompt: entry.prompt, model, size, quality, referenceImagePaths });
      fs.writeFileSync(entry.candidatePath, Buffer.from(bytes));
    }
    return entry;
  });

  const manifest: QuestionImageManifest = {
    version: 1,
    runId,
    moduleOrderIndex: module.order_index,
    generatedAt: nowIso(),
    model,
    size,
    quality,
    referenceImagePaths,
    dryRun: args.dryRun,
    entries,
  };

  writeJson(path.join(outputDir, "manifest.json"), manifest);
  writeJson(path.join(outputDir, "approved.template.json"), { approved: [] });
  writeReviewFile(path.join(outputDir, "review.md"), manifest);

  console.log(`Question image run written: ${outputDir}`);
  console.log(`Selected questions: ${entries.length}`);
  if (args.dryRun) console.log("Dry-run: no OpenAI image calls were made.");
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createMigrationFile(sql: string): string {
  const result = spawnSync("supabase", ["migration", "new", "add_question_explanation_images_modul_1_batch"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`supabase migration new failed: ${result.stderr || result.stdout}`);
  }

  const match = `${result.stdout}${result.stderr}`.match(/Created new migration at (.+\.sql)/);
  if (!match?.[1]) {
    throw new Error(`Cannot parse migration path from supabase output: ${result.stdout}${result.stderr}`);
  }

  const migrationPath = path.resolve(process.cwd(), match[1]);
  fs.writeFileSync(migrationPath, `${sql}\n`);
  return migrationPath;
}

async function runCommit(args: Args) {
  const manifest = readJson(path.resolve(process.cwd(), args.manifestPath)) as QuestionImageManifest;
  const approvedRaw = readJson(path.resolve(process.cwd(), args.approvedFilePath));
  const approvedIds = parseApprovedQuestionIds(approvedRaw);
  const approvedEntries = manifest.entries.filter((entry) => approvedIds.has(entry.questionId));

  if (approvedEntries.length === 0) {
    throw new Error("No approved entries found. Add question IDs to approved.json.");
  }

  for (const entry of approvedEntries) {
    if (!entry.candidatePath) throw new Error(`Approved entry has no candidatePath: ${entry.questionId}`);
    if (!fs.existsSync(entry.candidatePath)) throw new Error(`Candidate image missing: ${entry.candidatePath}`);
  }

  const targetDir = path.resolve(process.cwd(), "public/question-explanations");
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of approvedEntries) {
    const targetPath = path.join(targetDir, entry.assetFileName);
    if (fs.existsSync(targetPath) && !args.overwriteApproved) {
      throw new Error(`Target already exists: ${targetPath}. Use --overwrite-approved to replace it.`);
    }
    if (!args.dryRun) {
      fs.copyFileSync(entry.candidatePath as string, targetPath);
    }
  }

  const sql = buildQuestionImageMigrationSql(approvedEntries);
  if (args.dryRun) {
    console.log(sql);
    console.log(`Dry-run: would copy ${approvedEntries.length} approved image(s).`);
    return;
  }

  const migrationPath = createMigrationFile(sql);
  console.log(`Copied approved images: ${approvedEntries.length}`);
  console.log(`Migration written: ${migrationPath}`);
  console.log("Next: run `supabase db push --dry-run`, then `supabase db push` after review.");
}

async function main() {
  const args = parseArgs();
  if (args.stage === "generate") await runGenerate(args);
  else await runCommit(args);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(currentFile).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
