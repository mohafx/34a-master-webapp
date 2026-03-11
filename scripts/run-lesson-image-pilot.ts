import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_LESSON_IMAGE_STYLE_CODE,
  listLessonImageStyles,
  resolveLessonImageStyle,
} from "./lesson-image-style-presets.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

type JobStatus = "queued" | "retry" | "in_progress" | "committed" | "failed";
type RunStatus = "queued" | "in_progress" | "completed" | "failed" | "completed_with_errors";

interface Args {
  moduleOrderIndex: number | null;
  lessonOrderIndex: number | null;
  allModules: boolean;
  overwrite: boolean;
  limit: number;
  runId: string;
  maxIterations: number;
  sleepMs: number;
  styleCode: string;
  aspectRatio: string;
  seed: number | null;
  dryRun: boolean;
}

interface ModuleRow {
  id: string;
  order_index: number;
  title_de: string;
}

interface LessonRow {
  id: string;
  module_id: string;
  order_index: number;
  title_de: string;
  title_ar: string | null;
  content_de: string | null;
  image_url: string | null;
  image_status: string | null;
}

interface JobRow {
  id: string;
  run_id: string;
  lesson_id: string;
  status: JobStatus;
  attempts: number;
}

interface LessonContext {
  module: ModuleRow;
  lesson: LessonRow;
}

interface WorkerConfig {
  workerUrl: string;
  workerToken: string;
  modelCode: string;
  bucketName: string;
  timeoutMs: number;
  dryRun: boolean;
}

interface ImageGenerationOutput {
  bytes: Uint8Array;
  mimeType: string;
  sourceType: "mock" | "raw-image-response" | "base64" | "url-download";
  providerPayload: Record<string, unknown>;
}

interface ProcessResult {
  ok: boolean;
  status: string;
  message: string;
}

interface EnqueueResult {
  run_id: string;
  module: { id: string; order_index: number; title_de: string };
  selected_lesson_ids: string[];
  selected_count: number;
  style_code: string;
  model_code: string;
  bucket_name: string;
}

interface ExportResult {
  run: {
    id: string;
    status: string;
    module_order_index: number | null;
    target_count: number;
    success_count: number;
    failure_count: number;
    style_code: string;
    model_code: string;
    bucket_name: string;
    created_at: string;
    started_at?: string | null;
    finished_at?: string | null;
  };
  jobs: Array<{
    lesson_id: string;
    lesson_title_de: string;
    status: string;
    attempts: number;
    error_message: string | null;
  }>;
  items: Array<{
    lesson_id: string;
    lesson_title_de: string;
    old_image_url: string | null;
    new_image_url: string;
    image_path: string;
    prompt_used: string | null;
    style_code: string | null;
    model_code: string | null;
    written_at: string;
  }>;
}

const MAX_JOB_ATTEMPTS = 3;
const DEFAULT_IMAGE_MODEL_CODE = "nano-banane-pro";
const DEFAULT_IMAGE_BUCKET_NAME = "lesson-images";
const DEFAULT_WORKER_TIMEOUT_MS = 120_000;
const DEFAULT_STALE_LOCK_MS = 8 * 60 * 1000;
const DEFAULT_ACTOR_EMAIL = "local-image-batch@system";

function parseArgs(): Args {
  const defaults: Args = {
    moduleOrderIndex: null,
    lessonOrderIndex: null,
    allModules: true,
    overwrite: false,
    limit: 0,
    runId: "",
    maxIterations: 0,
    sleepMs: 400,
    styleCode: DEFAULT_LESSON_IMAGE_STYLE_CODE,
    aspectRatio: "16:9",
    seed: null,
    dryRun: false,
  };

  const parseBool = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  };

  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith("--module-order=")) {
      defaults.moduleOrderIndex = Number(arg.split("=")[1]);
      defaults.allModules = false;
    } else if (arg.startsWith("--lesson-order=")) {
      defaults.lessonOrderIndex = Number(arg.split("=")[1]);
      defaults.allModules = false;
    } else if (arg === "--all-modules") defaults.allModules = true;
    else if (arg.startsWith("--all-modules=")) defaults.allModules = parseBool(arg.split("=")[1] || "false");
    else if (arg === "--only-missing") defaults.overwrite = false;
    else if (arg === "--overwrite") defaults.overwrite = true;
    else if (arg.startsWith("--overwrite=")) defaults.overwrite = parseBool(arg.split("=")[1] || "false");
    else if (arg.startsWith("--count=")) defaults.limit = Number(arg.split("=")[1]);
    else if (arg.startsWith("--run-id=")) defaults.runId = arg.split("=")[1] || "";
    else if (arg.startsWith("--max-iterations=")) defaults.maxIterations = Number(arg.split("=")[1]);
    else if (arg.startsWith("--sleep-ms=")) defaults.sleepMs = Number(arg.split("=")[1]);
    else if (arg.startsWith("--style=")) defaults.styleCode = arg.split("=")[1] || defaults.styleCode;
    else if (arg.startsWith("--aspect-ratio=")) defaults.aspectRatio = arg.split("=")[1] || defaults.aspectRatio;
    else if (arg.startsWith("--seed=")) defaults.seed = Number(arg.split("=")[1]);
    else if (arg === "--dry-run") defaults.dryRun = true;
    else if (arg.startsWith("--dry-run=")) defaults.dryRun = parseBool(arg.split("=")[1] || "false");
  }

  if (defaults.lessonOrderIndex !== null && defaults.moduleOrderIndex === null) {
    throw new Error("If you set --lesson-order, please also set --module-order.");
  }

  return defaults;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string | null | undefined, maxChars: number): string {
  if (!value) return "";
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function sanitizeText(value: string): string {
  return value
    .replace(/[`*_>#\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePathPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function getIntEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getSupabaseConfig() {
  const url = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const key =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("Supabase_Service_Role_Key") ||
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL.");
  if (!key) {
    throw new Error(
      "Missing service key. Set SUPABASE_SERVICE_ROLE_KEY (or Supabase_Service_Role_Key).",
    );
  }

  return { url, key };
}

function getWorkerConfig(args: Args): WorkerConfig {
  const modelCode = getEnv("LESSON_IMAGE_MODEL_CODE") || getEnv("IMAGE_MODEL_CODE") || DEFAULT_IMAGE_MODEL_CODE;
  const bucketName = getEnv("LESSON_IMAGE_BUCKET") || DEFAULT_IMAGE_BUCKET_NAME;
  const timeoutMs = getIntEnv("LESSON_IMAGE_TIMEOUT_MS", DEFAULT_WORKER_TIMEOUT_MS);
  const workerUrl = getEnv("LESSON_IMAGE_WORKER_URL") || getEnv("IMAGE_WORKER_URL");
  const workerToken = getEnv("LESSON_IMAGE_WORKER_TOKEN") || getEnv("IMAGE_WORKER_TOKEN");

  if (!args.dryRun && !workerUrl) {
    throw new Error("Missing LESSON_IMAGE_WORKER_URL (or IMAGE_WORKER_URL).");
  }

  return {
    workerUrl,
    workerToken,
    modelCode,
    bucketName,
    timeoutMs,
    dryRun: args.dryRun,
  };
}

function getActorEmail(): string {
  return getEnv("LESSON_IMAGE_ACTOR_EMAIL", DEFAULT_ACTOR_EMAIL);
}

function nextStatusAfterFailure(attempts: number): JobStatus {
  return attempts >= MAX_JOB_ATTEMPTS ? "failed" : "retry";
}

function terminalRunStatus(status: string): boolean {
  return ["completed", "completed_with_errors", "failed"].includes(status);
}

async function resolveModuleOrderIndexes(
  supabase: ReturnType<typeof createClient>,
  args: Args,
): Promise<number[]> {
  if (!args.allModules && args.moduleOrderIndex !== null) {
    return [args.moduleOrderIndex];
  }

  const { data: modules, error } = await supabase
    .from("modules")
    .select("order_index")
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Cannot load modules: ${error.message}`);

  return (modules || [])
    .map((moduleRow) => moduleRow.order_index)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

async function ensureBucketExists(
  supabase: ReturnType<typeof createClient>,
  bucketName: string,
) {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    throw new Error(`Cannot list storage buckets: ${listErr.message}`);
  }

  const exists = (buckets || []).some((bucket: any) => bucket?.id === bucketName || bucket?.name === bucketName);
  if (exists) return;

  const { error: createErr } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: "20MB",
  });

  if (createErr && !/already exists/i.test(createErr.message || "")) {
    throw new Error(`Cannot create bucket "${bucketName}": ${createErr.message}`);
  }
}

async function enqueueRunForModule(
  supabase: ReturnType<typeof createClient>,
  moduleOrderIndex: number,
  args: Args,
  workerConfig: WorkerConfig,
): Promise<EnqueueResult | null> {
  const style = resolveLessonImageStyle(args.styleCode);
  const actorEmail = getActorEmail();

  const { data: moduleRow, error: moduleErr } = await supabase
    .from("modules")
    .select("id,order_index,title_de")
    .eq("order_index", moduleOrderIndex)
    .single();
  if (moduleErr || !moduleRow) {
    throw new Error(
      `Cannot load module by order_index=${moduleOrderIndex}: ${moduleErr?.message || "not found"}`,
    );
  }

  const { data: lessonRows, error: lessonsErr } = await supabase
    .from("lessons")
    .select("id,module_id,order_index,title_de,title_ar,content_de,image_url,image_status")
    .eq("module_id", moduleRow.id)
    .order("order_index", { ascending: true });
  if (lessonsErr) {
    throw new Error(`Cannot load lessons for module ${moduleRow.id}: ${lessonsErr.message}`);
  }

  let selected = (lessonRows || []) as LessonRow[];

  if (args.lessonOrderIndex !== null) {
    selected = selected.filter((lesson) => lesson.order_index === args.lessonOrderIndex);
  }

  if (!args.overwrite) {
    selected = selected.filter((lesson) => !lesson.image_url);
  }

  if (args.limit > 0) {
    selected = selected.slice(0, args.limit);
  }

  if (selected.length === 0) {
    return null;
  }

  const { data: runRows, error: runErr } = await supabase
    .from("lesson_image_runs")
    .insert({
      module_id: moduleRow.id,
      module_order_index: moduleRow.order_index,
      status: "queued",
      target_count: selected.length,
      style_code: style.code,
      model_code: workerConfig.modelCode,
      bucket_name: workerConfig.bucketName,
      created_by: actorEmail,
      created_at: nowIso(),
    })
    .select("id,module_id,module_order_index,target_count,style_code,model_code,bucket_name");
  if (runErr || !runRows || runRows.length === 0) {
    throw new Error(`Cannot create lesson image run: ${runErr?.message || "unknown error"}`);
  }
  const run = runRows[0];

  const jobs = selected.map((lesson) => ({
    run_id: run.id,
    lesson_id: lesson.id,
    status: "queued",
    attempts: 0,
    input_json: {
      module_id: moduleRow.id,
      module_order_index: moduleRow.order_index,
      lesson_id: lesson.id,
      lesson_order_index: lesson.order_index,
      lesson_title_de: lesson.title_de,
      style_code: style.code,
      aspect_ratio: args.aspectRatio,
      seed: args.seed,
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const { error: jobsErr } = await supabase.from("lesson_image_jobs").insert(jobs);
  if (jobsErr) {
    throw new Error(`Cannot create jobs for run ${run.id}: ${jobsErr.message}`);
  }

  const lessonIds = selected.map((lesson) => lesson.id);
  const { error: lessonUpdateErr } = await supabase
    .from("lessons")
    .update({
      image_status: "queued",
      image_style_code: style.code,
      image_model_code: workerConfig.modelCode,
    })
    .in("id", lessonIds);

  if (lessonUpdateErr) {
    throw new Error(`Run created but lesson status update failed: ${lessonUpdateErr.message}`);
  }

  return {
    run_id: run.id,
    module: {
      id: moduleRow.id,
      order_index: moduleRow.order_index,
      title_de: moduleRow.title_de,
    },
    selected_lesson_ids: lessonIds,
    selected_count: lessonIds.length,
    style_code: style.code,
    model_code: workerConfig.modelCode,
    bucket_name: workerConfig.bucketName,
  };
}

async function claimNextJob(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<JobRow | null> {
  const { data: candidates, error: candidatesErr } = await supabase
    .from("lesson_image_jobs")
    .select("id,run_id,lesson_id,status,attempts,created_at")
    .eq("run_id", runId)
    .in("status", ["queued", "retry"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (candidatesErr) {
    throw new Error(`Cannot fetch next lesson image job: ${candidatesErr.message}`);
  }

  if (!candidates || candidates.length === 0) return null;

  const candidate = candidates[0] as JobRow;
  const { data: claimedRows, error: claimErr } = await supabase
    .from("lesson_image_jobs")
    .update({
      status: "in_progress",
      attempts: candidate.attempts + 1,
      worker_id: crypto.randomUUID(),
      locked_at: nowIso(),
      error_message: null,
      updated_at: nowIso(),
    })
    .eq("id", candidate.id)
    .eq("status", candidate.status)
    .select("id,run_id,lesson_id,status,attempts");

  if (claimErr) {
    throw new Error(`Cannot claim lesson image job ${candidate.id}: ${claimErr.message}`);
  }

  if (!claimedRows || claimedRows.length === 0) {
    return null;
  }

  return claimedRows[0] as JobRow;
}

async function recoverStaleInProgressJobs(
  supabase: ReturnType<typeof createClient>,
  runId: string,
) {
  const staleMs = getIntEnv("LESSON_IMAGE_STALE_LOCK_MS", DEFAULT_STALE_LOCK_MS);
  const staleBeforeIso = new Date(Date.now() - staleMs).toISOString();

  const { data: staleRows, error: staleErr } = await supabase
    .from("lesson_image_jobs")
    .select("id,lesson_id,attempts,status,locked_at")
    .eq("run_id", runId)
    .eq("status", "in_progress")
    .lt("locked_at", staleBeforeIso);

  if (staleErr) {
    throw new Error(`Cannot query stale lesson image jobs: ${staleErr.message}`);
  }

  if (!staleRows || staleRows.length === 0) {
    return { recovered: 0, movedToRetry: 0, movedToFailed: 0 };
  }

  let movedToRetry = 0;
  let movedToFailed = 0;
  for (const row of staleRows) {
    const next = nextStatusAfterFailure(row.attempts);
    const { error: updateErr } = await supabase
      .from("lesson_image_jobs")
      .update({
        status: next,
        error_message: `Recovered stale lock from ${row.locked_at || "unknown time"}.`,
        updated_at: nowIso(),
      })
      .eq("id", row.id);
    if (updateErr) {
      throw new Error(`Cannot recover stale job ${row.id}: ${updateErr.message}`);
    }

    const lessonStatus = next === "failed" ? "failed" : "queued";
    const { error: lessonErr } = await supabase
      .from("lessons")
      .update({ image_status: lessonStatus })
      .eq("id", row.lesson_id);
    if (lessonErr) {
      throw new Error(`Cannot set lesson ${row.lesson_id} status during stale recovery: ${lessonErr.message}`);
    }

    if (next === "failed") movedToFailed++;
    else movedToRetry++;
  }

  return {
    recovered: staleRows.length,
    movedToRetry,
    movedToFailed,
  };
}

async function fetchLessonContext(
  supabase: ReturnType<typeof createClient>,
  lessonId: string,
): Promise<LessonContext> {
  const { data: lessonRow, error: lessonErr } = await supabase
    .from("lessons")
    .select("id,module_id,order_index,title_de,title_ar,content_de,image_url,image_status")
    .eq("id", lessonId)
    .single();
  if (lessonErr || !lessonRow) {
    throw new Error(`Cannot load lesson ${lessonId}: ${lessonErr?.message || "not found"}`);
  }

  const { data: moduleRow, error: moduleErr } = await supabase
    .from("modules")
    .select("id,order_index,title_de")
    .eq("id", lessonRow.module_id)
    .single();
  if (moduleErr || !moduleRow) {
    throw new Error(`Cannot load module for lesson ${lessonId}: ${moduleErr?.message || "not found"}`);
  }

  return {
    lesson: lessonRow as LessonRow,
    module: moduleRow as ModuleRow,
  };
}

function buildPrompt(context: LessonContext, styleCode: string): { prompt: string; negativePrompt: string } {
  const style = resolveLessonImageStyle(styleCode);
  const topic = sanitizeText(context.lesson.title_de || "");
  const moduleTitle = sanitizeText(context.module.title_de || "");
  const contentSummary = truncate(sanitizeText(context.lesson.content_de || ""), 1100);

  const prompt = [
    "Create one high quality lesson hero image for a German security training app (Sachkunde 34a).",
    "The image should visualize the topic, look professional, and be easy to understand.",
    "",
    `Module: ${moduleTitle}`,
    `Lesson: ${topic}`,
    `Summary: ${contentSummary || topic}`,
    "",
    "Visual requirements:",
    `- Mood: ${style.mood}`,
    `- Style: ${style.visualStyle}`,
    `- Lighting: ${style.lighting}`,
    `- Colors: ${style.colors}`,
    `- Composition: ${style.composition}`,
    "- Human figures, if used, should look natural and realistic.",
    "- No text in the image, no watermark, no logo.",
    "- Keep it suitable for a learning platform and all ages.",
  ].join("\n");

  const negativePrompt = `${style.negativePrompt}, text overlay, subtitles, signature, nsfw, violence, blood`;
  return { prompt, negativePrompt };
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("svg")) return "svg";
  return "png";
}

function decodeBase64Payload(input: string): { bytes: Uint8Array; mimeType: string } {
  let base64 = input.trim();
  let mimeType = "image/png";

  const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType;
    base64 = dataUrlMatch[2] || "";
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    throw new Error("Image base64 payload is empty.");
  }

  return { bytes: new Uint8Array(bytes), mimeType };
}

function readKnownImagePayload(payload: any): { base64?: string; url?: string } {
  const knownBase64 =
    payload?.image_base64 ||
    payload?.b64_json ||
    payload?.base64 ||
    payload?.data?.[0]?.b64_json ||
    payload?.data?.[0]?.base64 ||
    payload?.result?.image_base64 ||
    payload?.result?.b64_json ||
    payload?.result?.data?.[0]?.b64_json;

  if (typeof knownBase64 === "string" && knownBase64.trim()) {
    return { base64: knownBase64.trim() };
  }

  const knownUrl =
    payload?.image_url ||
    payload?.url ||
    payload?.result?.image_url ||
    payload?.result?.url ||
    payload?.data?.[0]?.url;

  if (typeof knownUrl === "string" && knownUrl.trim()) {
    return { url: knownUrl.trim() };
  }

  return {};
}

async function downloadImageFromUrl(
  imageUrl: string,
  timeoutMs: number,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(imageUrl, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Image URL download failed with ${response.status}.`);
    }

    const mimeType = response.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("Downloaded image is empty.");
    }

    return { bytes, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

function createMockImage(prompt: string): ImageGenerationOutput {
  const safeText = truncate(prompt, 160).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <circle cx="210" cy="210" r="120" fill="#38bdf8" fill-opacity="0.25"/>
  <circle cx="1040" cy="140" r="90" fill="#f59e0b" fill-opacity="0.22"/>
  <rect x="120" y="470" width="1040" height="160" rx="24" fill="#111827" fill-opacity="0.75"/>
  <text x="160" y="535" font-family="Arial, sans-serif" font-size="28" fill="#f8fafc">Mock Lesson Image (dry-run)</text>
  <text x="160" y="580" font-family="Arial, sans-serif" font-size="20" fill="#cbd5e1">${safeText}</text>
</svg>`.trim();

  return {
    bytes: new TextEncoder().encode(svg),
    mimeType: "image/svg+xml",
    sourceType: "mock",
    providerPayload: { mode: "dry-run" },
  };
}

async function generateImage(
  workerConfig: WorkerConfig,
  prompt: string,
  negativePrompt: string,
  aspectRatio: string,
  seed: number | null,
): Promise<ImageGenerationOutput> {
  if (workerConfig.dryRun) {
    return createMockImage(prompt);
  }

  const body: Record<string, unknown> = {
    model: workerConfig.modelCode,
    prompt,
    negative_prompt: negativePrompt,
    aspect_ratio: aspectRatio,
    format: "png",
  };
  if (seed !== null && Number.isFinite(seed)) {
    body.seed = seed;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (workerConfig.workerToken) {
    headers.Authorization = `Bearer ${workerConfig.workerToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), workerConfig.timeoutMs);

  let response: Response;
  try {
    response = await fetch(workerConfig.workerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Worker request timed out after ${workerConfig.timeoutMs}ms.`);
    }
    throw new Error(`Worker request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Worker API error ${response.status}: ${truncate(errorBody, 500)}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("Worker returned empty image.");
    return {
      bytes,
      mimeType: contentType,
      sourceType: "raw-image-response",
      providerPayload: { direct_image_response: true },
    };
  }

  const rawText = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(rawText);
  } catch (_) {
    throw new Error(`Worker returned non-JSON payload: ${truncate(rawText, 300)}`);
  }

  const extracted = readKnownImagePayload(payload);
  if (extracted.base64) {
    const decoded = decodeBase64Payload(extracted.base64);
    return {
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
      sourceType: "base64",
      providerPayload: payload,
    };
  }

  if (extracted.url) {
    const downloaded = await downloadImageFromUrl(extracted.url, workerConfig.timeoutMs);
    return {
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType,
      sourceType: "url-download",
      providerPayload: { ...payload, downloaded_from: extracted.url },
    };
  }

  throw new Error(
    "Worker response does not contain image_base64, b64_json, or image_url. Please adapt payload mapping.",
  );
}

async function uploadImageToStorage(params: {
  supabase: ReturnType<typeof createClient>;
  bucketName: string;
  moduleOrderIndex: number;
  lessonOrderIndex: number;
  lessonId: string;
  styleCode: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const extension = extensionForMimeType(params.mimeType);
  const stamp = nowIso().replace(/[:.]/g, "-");
  const moduleKey = String(params.moduleOrderIndex).padStart(2, "0");
  const lessonKey = String(params.lessonOrderIndex).padStart(2, "0");
  const styleKey = sanitizePathPart(params.styleCode || "style");
  const pathKey = `module-${moduleKey}/lesson-${lessonKey}/${stamp}_${styleKey}_${params.lessonId}.${extension}`;

  const { error: uploadErr } = await params.supabase.storage
    .from(params.bucketName)
    .upload(pathKey, params.bytes, {
      contentType: params.mimeType,
      cacheControl: "31536000",
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Storage upload failed: ${uploadErr.message}`);
  }

  const publicUrl = params.supabase.storage.from(params.bucketName).getPublicUrl(pathKey).data.publicUrl;
  if (!publicUrl) {
    throw new Error("Storage upload succeeded, but public URL could not be resolved.");
  }

  return { pathKey, publicUrl };
}

async function finalizeJobWithFailure(
  supabase: ReturnType<typeof createClient>,
  job: JobRow,
  errorMessage: string,
  outputJson: Record<string, unknown> | null = null,
  validationJson: Record<string, unknown> | null = null,
): Promise<JobStatus> {
  const nextStatus = nextStatusAfterFailure(job.attempts);

  const { error: updateErr } = await supabase
    .from("lesson_image_jobs")
    .update({
      status: nextStatus,
      error_message: errorMessage,
      output_json: outputJson,
      validation_json: validationJson,
      updated_at: nowIso(),
    })
    .eq("id", job.id);
  if (updateErr) {
    throw new Error(`Cannot update failed lesson image job ${job.id}: ${updateErr.message}`);
  }

  const lessonStatus = nextStatus === "failed" ? "failed" : "queued";
  const { error: lessonErr } = await supabase
    .from("lessons")
    .update({ image_status: lessonStatus })
    .eq("id", job.lesson_id);
  if (lessonErr) {
    throw new Error(`Cannot update lesson status after failure: ${lessonErr.message}`);
  }

  return nextStatus;
}

async function processSingleJob(
  supabase: ReturnType<typeof createClient>,
  job: JobRow,
  args: Args,
  workerConfig: WorkerConfig,
): Promise<ProcessResult> {
  try {
    const context = await fetchLessonContext(supabase, job.lesson_id);
    const runStyleCode = resolveLessonImageStyle(args.styleCode).code;
    const { prompt, negativePrompt } = buildPrompt(context, runStyleCode);

    const { error: inputErr } = await supabase
      .from("lesson_image_jobs")
      .update({
        input_json: {
          module_id: context.module.id,
          module_order_index: context.module.order_index,
          lesson_id: context.lesson.id,
          lesson_order_index: context.lesson.order_index,
          lesson_title_de: context.lesson.title_de,
          style_code: runStyleCode,
          aspect_ratio: args.aspectRatio,
          seed: args.seed,
          prompt,
          negative_prompt: negativePrompt,
        },
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    if (inputErr) {
      throw new Error(`Cannot save job input: ${inputErr.message}`);
    }

    const { error: lessonInProgressErr } = await supabase
      .from("lessons")
      .update({ image_status: "in_progress" })
      .eq("id", context.lesson.id);
    if (lessonInProgressErr) {
      throw new Error(`Cannot set lesson in_progress: ${lessonInProgressErr.message}`);
    }

    const generated = await generateImage(
      workerConfig,
      prompt,
      negativePrompt,
      args.aspectRatio,
      args.seed,
    );

    const uploaded = await uploadImageToStorage({
      supabase,
      bucketName: workerConfig.bucketName,
      moduleOrderIndex: context.module.order_index,
      lessonOrderIndex: context.lesson.order_index,
      lessonId: context.lesson.id,
      styleCode: runStyleCode,
      mimeType: generated.mimeType,
      bytes: generated.bytes,
    });

    const { error: auditErr } = await supabase.from("lesson_image_audit").insert({
      run_id: job.run_id,
      lesson_id: context.lesson.id,
      old_image_url: context.lesson.image_url,
      new_image_url: uploaded.publicUrl,
      image_path: uploaded.pathKey,
      prompt_used: prompt,
      style_code: runStyleCode,
      model_code: workerConfig.modelCode,
      written_at: nowIso(),
    });
    if (auditErr) {
      throw new Error(`Cannot write lesson image audit: ${auditErr.message}`);
    }

    const { data: updatedLessons, error: lessonUpdateErr } = await supabase
      .from("lessons")
      .update({
        image_url: uploaded.publicUrl,
        image_status: "generated",
        image_prompt: prompt,
        image_style_code: runStyleCode,
        image_model_code: workerConfig.modelCode,
        image_generated_at: nowIso(),
      })
      .eq("id", context.lesson.id)
      .select("id");
    if (lessonUpdateErr) {
      throw new Error(`Cannot update lesson image fields: ${lessonUpdateErr.message}`);
    }
    if (!updatedLessons || updatedLessons.length === 0) {
      throw new Error("Lesson update affected 0 rows.");
    }

    const { error: commitErr } = await supabase
      .from("lesson_image_jobs")
      .update({
        status: "committed",
        error_message: null,
        output_json: {
          image_source: generated.sourceType,
          mime_type: generated.mimeType,
          storage_path: uploaded.pathKey,
          public_url: uploaded.publicUrl,
          provider_payload: generated.providerPayload,
        },
        validation_json: {
          bytes_size: generated.bytes.length,
          aspect_ratio: args.aspectRatio,
          seed: args.seed,
        },
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    if (commitErr) {
      throw new Error(`Cannot commit lesson image job ${job.id}: ${commitErr.message}`);
    }

    return { ok: true, status: "committed", message: "Lesson image generated and stored." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = await finalizeJobWithFailure(supabase, job, `Unhandled processing error: ${message}`);
    return { ok: false, status, message: `Unhandled processing error (${status})` };
  }
}

async function refreshRunCounters(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<Record<string, unknown>> {
  const { data: runRow, error: runErr } = await supabase
    .from("lesson_image_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !runRow) {
    throw new Error(`Cannot load run ${runId}: ${runErr?.message || "not found"}`);
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("lesson_image_jobs")
    .select("status")
    .eq("run_id", runId);
  if (jobsErr) {
    throw new Error(`Cannot load jobs for run ${runId}: ${jobsErr.message}`);
  }

  const counts = {
    queued: 0,
    retry: 0,
    in_progress: 0,
    committed: 0,
    failed: 0,
  };
  for (const job of jobs || []) {
    const status = job.status as keyof typeof counts;
    if (status in counts) counts[status]++;
  }

  const processedCount = counts.committed + counts.failed;
  const successCount = counts.committed;
  const failureCount = counts.failed;
  const remainingCount = counts.queued + counts.retry + counts.in_progress;

  let nextStatus = runRow.status as RunStatus;
  let finishedAt = runRow.finished_at as string | null;

  if (remainingCount === 0) {
    finishedAt = nowIso();
    if (failureCount === runRow.target_count) nextStatus = "failed";
    else if (failureCount > 0) nextStatus = "completed_with_errors";
    else nextStatus = "completed";
  } else if (processedCount > 0 || counts.in_progress > 0) {
    nextStatus = "in_progress";
  } else {
    nextStatus = "queued";
  }

  const { data: updatedRows, error: updateErr } = await supabase
    .from("lesson_image_runs")
    .update({
      status: nextStatus,
      processed_count: processedCount,
      success_count: successCount,
      failure_count: failureCount,
      started_at: runRow.started_at || nowIso(),
      finished_at: finishedAt,
    })
    .eq("id", runId)
    .select("*");
  if (updateErr || !updatedRows || updatedRows.length === 0) {
    throw new Error(`Cannot update run counters: ${updateErr?.message || "unknown error"}`);
  }

  return {
    run: updatedRows[0],
    job_counts: counts,
  };
}

async function processRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  args: Args,
  workerConfig: WorkerConfig,
) {
  const maxIterations = args.maxIterations > 0 ? args.maxIterations : Number.MAX_SAFE_INTEGER;
  let iteration = 0;
  let done = false;

  while (!done && iteration < maxIterations) {
    iteration++;

    const recovered = await recoverStaleInProgressJobs(supabase, runId);
    if (recovered.recovered > 0) {
      console.log(
        `[${iteration}] recovered stale jobs: total=${recovered.recovered}, retry=${recovered.movedToRetry}, failed=${recovered.movedToFailed}`,
      );
    }

    const claimed = await claimNextJob(supabase, runId);
    if (!claimed) {
      const snapshot = await refreshRunCounters(supabase, runId);
      const runStatus = String((snapshot.run as Record<string, unknown>).status || "unknown");
      console.log(`[${iteration}] no claimable job | run status: ${runStatus}`);
      done = terminalRunStatus(runStatus);
      if (!done) await sleep(args.sleepMs);
      continue;
    }

    const result = await processSingleJob(supabase, claimed, args, workerConfig);
    const snapshot = await refreshRunCounters(supabase, runId);
    const run = snapshot.run as Record<string, unknown>;
    const runStatus = String(run.status || "unknown");
    console.log(
      `[${iteration}] lesson ${claimed.lesson_id} -> ${result.status} (${result.ok ? "ok" : "fail"}) | run: ${runStatus} (${run.processed_count}/${run.target_count})`,
    );

    done = terminalRunStatus(runStatus);
    if (!done) await sleep(args.sleepMs);
  }
}

async function exportRunReview(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<ExportResult> {
  const { data: runRow, error: runErr } = await supabase
    .from("lesson_image_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !runRow) {
    throw new Error(`Run ${runId} not found: ${runErr?.message || "unknown error"}`);
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("lesson_image_jobs")
    .select("lesson_id,status,attempts,error_message,created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (jobsErr) {
    throw new Error(`Cannot load jobs for run ${runId}: ${jobsErr.message}`);
  }

  const lessonIds = [...new Set((jobs || []).map((job) => job.lesson_id))];
  let lessons: Array<{ id: string; title_de: string }> = [];
  if (lessonIds.length > 0) {
    const { data: lessonRows, error: lessonErr } = await supabase
      .from("lessons")
      .select("id,title_de")
      .in("id", lessonIds);
    if (lessonErr) {
      throw new Error(`Cannot load lesson titles for export: ${lessonErr.message}`);
    }
    lessons = lessonRows || [];
  }
  const lessonMap = new Map(lessons.map((lesson) => [lesson.id, lesson.title_de]));

  const { data: audits, error: auditErr } = await supabase
    .from("lesson_image_audit")
    .select("*")
    .eq("run_id", runId)
    .order("written_at", { ascending: true });
  if (auditErr) {
    throw new Error(`Cannot load lesson image audit rows: ${auditErr.message}`);
  }

  return {
    run: {
      id: runRow.id,
      status: runRow.status,
      module_order_index: runRow.module_order_index,
      target_count: runRow.target_count,
      success_count: runRow.success_count,
      failure_count: runRow.failure_count,
      style_code: runRow.style_code,
      model_code: runRow.model_code,
      bucket_name: runRow.bucket_name,
      created_at: runRow.created_at,
      started_at: runRow.started_at,
      finished_at: runRow.finished_at,
    },
    jobs: (jobs || []).map((job) => ({
      lesson_id: job.lesson_id,
      lesson_title_de: lessonMap.get(job.lesson_id) || "",
      status: job.status,
      attempts: job.attempts,
      error_message: job.error_message,
    })),
    items: (audits || []).map((audit) => ({
      lesson_id: audit.lesson_id,
      lesson_title_de: lessonMap.get(audit.lesson_id) || "",
      old_image_url: audit.old_image_url,
      new_image_url: audit.new_image_url,
      image_path: audit.image_path,
      prompt_used: audit.prompt_used,
      style_code: audit.style_code,
      model_code: audit.model_code,
      written_at: audit.written_at,
    })),
  };
}

function renderReviewMarkdown(payload: ExportResult): string {
  const lines: string[] = [];
  lines.push(`# Lesson Image Run - ${payload.run.id}`);
  lines.push("");
  lines.push(`- Status: \`${payload.run.status}\``);
  lines.push(`- Module Order: ${payload.run.module_order_index ?? "-"}`);
  lines.push(`- Style: \`${payload.run.style_code}\``);
  lines.push(`- Model: \`${payload.run.model_code}\``);
  lines.push(`- Bucket: \`${payload.run.bucket_name}\``);
  lines.push(`- Target: ${payload.run.target_count}`);
  lines.push(`- Success: ${payload.run.success_count}`);
  lines.push(`- Failure: ${payload.run.failure_count}`);
  lines.push(`- Created: ${payload.run.created_at}`);
  if (payload.run.started_at) lines.push(`- Started: ${payload.run.started_at}`);
  if (payload.run.finished_at) lines.push(`- Finished: ${payload.run.finished_at}`);
  lines.push("");

  lines.push("## Jobs");
  lines.push("");
  for (const job of payload.jobs) {
    lines.push(`- \`${job.lesson_id}\` | ${job.lesson_title_de} | status: \`${job.status}\` | attempts: ${job.attempts}`);
    if (job.error_message) lines.push(`  error: ${job.error_message}`);
  }
  lines.push("");

  lines.push("## Generated Images");
  lines.push("");
  for (const [index, item] of payload.items.entries()) {
    lines.push(`### ${index + 1}. ${item.lesson_title_de || item.lesson_id}`);
    lines.push("");
    lines.push(`- Lesson ID: \`${item.lesson_id}\``);
    lines.push(`- Style: \`${item.style_code || "-"}\``);
    lines.push(`- Model: \`${item.model_code || "-"}\``);
    lines.push(`- Path: \`${item.image_path}\``);
    lines.push(`- New URL: ${item.new_image_url}`);
    if (item.old_image_url) lines.push(`- Old URL: ${item.old_image_url}`);
    lines.push(`- Written At: ${item.written_at}`);
    if (item.prompt_used) {
      lines.push("");
      lines.push("Prompt:");
      lines.push("");
      lines.push("```text");
      lines.push(item.prompt_used);
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildReviewPath(moduleOrderIndex: number | string): string {
  const stamp = nowIso().replace(/[:.]/g, "-");
  const outputDir = process.env.EXPLANATION_REVIEW_OUTPUT_DIR?.trim()
    ? path.resolve(process.cwd(), process.env.EXPLANATION_REVIEW_OUTPUT_DIR)
    : path.resolve(process.cwd(), "local_archive/batch_reviews");

  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, `lesson_image_run_modul${moduleOrderIndex}_${stamp}.md`);
}

async function main() {
  const args = parseArgs();
  const style = resolveLessonImageStyle(args.styleCode);
  const workerConfig = getWorkerConfig(args);
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureBucketExists(supabase, workerConfig.bucketName);

  console.log("Starting LOCAL lesson image pipeline runner...");
  console.log(`Mode: ${workerConfig.dryRun ? "dry-run (mock image)" : "worker API"}`);
  console.log(`Model: ${workerConfig.modelCode}`);
  console.log(`Style: ${style.code} (${style.name})`);
  console.log(`Aspect ratio: ${args.aspectRatio}`);
  console.log(`Target: ${args.allModules ? "all modules" : `module ${args.moduleOrderIndex}`}`);
  console.log(`Limit per module: ${args.limit === 0 ? "all selected lessons" : args.limit}`);
  console.log(`Overwrite existing lesson images: ${args.overwrite ? "yes" : "no"}`);
  if (args.lessonOrderIndex !== null) {
    console.log(`Lesson filter: only lesson order ${args.lessonOrderIndex}`);
  }

  if (args.runId) {
    console.log(`Resuming run: ${args.runId}`);
    await processRun(supabase, args.runId, args, workerConfig);
    const exportResult = await exportRunReview(supabase, args.runId);
    const reviewPath = buildReviewPath(args.moduleOrderIndex ?? "run");
    fs.writeFileSync(reviewPath, renderReviewMarkdown(exportResult), "utf8");
    console.log(`Review file written: ${reviewPath}`);
    return;
  }

  const moduleOrderIndexes = await resolveModuleOrderIndexes(supabase, args);
  if (moduleOrderIndexes.length === 0) {
    throw new Error("No modules found for processing.");
  }

  let createdRuns = 0;
  for (const moduleOrderIndex of moduleOrderIndexes) {
    const created = await enqueueRunForModule(supabase, moduleOrderIndex, args, workerConfig);
    if (!created) {
      console.log(`Skipping module ${moduleOrderIndex}: no lessons selected.`);
      continue;
    }

    createdRuns++;
    console.log("");
    console.log(`Run created: ${created.run_id}`);
    console.log(`Module ${created.module.order_index}: ${created.module.title_de}`);
    console.log(`Selected lessons: ${created.selected_count}`);
    console.log(`Bucket: ${created.bucket_name}`);

    await processRun(supabase, created.run_id, args, workerConfig);

    const exportResult = await exportRunReview(supabase, created.run_id);
    const reviewPath = buildReviewPath(moduleOrderIndex);
    fs.writeFileSync(reviewPath, renderReviewMarkdown(exportResult), "utf8");
    console.log(`Review file written: ${reviewPath}`);
  }

  if (createdRuns === 0) {
    console.log("No runs were created. Nothing to process.");
    return;
  }

  console.log("");
  console.log("Done.");
}

if (process.argv.includes("--list-styles")) {
  console.log("Available style presets:");
  for (const preset of listLessonImageStyles()) {
    console.log(`- ${preset.code}: ${preset.name} -> ${preset.description}`);
  }
  process.exit(0);
}

main().catch((error) => {
  const available = listLessonImageStyles()
    .map((preset) => preset.code)
    .join(", ");
  console.error("Lesson image run failed:", error instanceof Error ? error.message : error);
  console.error(`Tip: use --style=<code>. Available: ${available}`);
  process.exit(1);
});
