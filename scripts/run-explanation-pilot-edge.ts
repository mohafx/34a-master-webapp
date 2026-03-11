import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

type Action = "enqueue_pilot" | "process_next" | "status" | "export_review_payload";
type WriteMode = "direct";

interface Args {
  moduleOrderIndex: number | null;
  allModules: boolean;
  overwrite: boolean;
  limit: number;
  writeMode: WriteMode;
  runId: string;
  maxIterations: number;
  sleepMs: number;
}

interface FunctionResponse<T> {
  ok: boolean;
  action?: Action;
  model_code?: string;
  result?: T;
  error?: string;
}

interface EnqueueResult {
  run_id: string;
  module: { id: string; order_index: number; title_de: string };
  selected_question_ids: string[];
  selected_count: number;
  model_code: string;
}

interface ProcessResult {
  done: boolean;
  message: string;
  processed_job?: {
    id: string;
    question_id: string;
    status: string;
    ok: boolean;
    message: string;
  };
  run?: {
    id: string;
    status: string;
    processed_count: number;
    success_count: number;
    failure_count: number;
    target_count: number;
  };
  job_counts?: Record<string, number>;
}

interface ExportResult {
  run: {
    id: string;
    status: string;
    module_order_index: number;
    target_count: number;
    success_count: number;
    failure_count: number;
    model_code: string;
    created_at: string;
    started_at?: string | null;
    finished_at?: string | null;
  };
  jobs: Array<{
    question_id: string;
    question_text_de: string;
    status: string;
    attempts: number;
    error_message: string | null;
  }>;
  items: Array<{
    question_id: string;
    question_text_de: string;
    new_explanation_de: string;
    new_explanation_ar: string;
    written_at: string;
  }>;
}

function parseArgs(): Args {
  const defaults: Args = {
    moduleOrderIndex: null,
    allModules: true,
    overwrite: true,
    limit: 0,
    writeMode: "direct",
    runId: "",
    maxIterations: 0,
    sleepMs: 700,
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
    } else if (arg === "--all-modules") defaults.allModules = true;
    else if (arg.startsWith("--all-modules=")) defaults.allModules = parseBool(arg.split("=")[1] || "false");
    else if (arg === "--only-unupdated") defaults.overwrite = false;
    else if (arg.startsWith("--overwrite=")) defaults.overwrite = parseBool(arg.split("=")[1] || "false");
    else if (arg.startsWith("--count=")) defaults.limit = Number(arg.split("=")[1]);
    else if (arg.startsWith("--run-id=")) defaults.runId = arg.split("=")[1] || "";
    else if (arg.startsWith("--max-iterations=")) defaults.maxIterations = Number(arg.split("=")[1]);
    else if (arg.startsWith("--sleep-ms=")) defaults.sleepMs = Number(arg.split("=")[1]);
  }

  return defaults;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  const workflowSecret = process.env.QUESTION_PIPELINE_SECRET;

  if (!url) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL");
  if (!apiKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY");
  if (!workflowSecret) throw new Error("Missing QUESTION_PIPELINE_SECRET");

  return {
    supabaseUrl: url,
    apiKey,
    workflowSecret,
    functionUrl: `${url.replace(/\/$/, "")}/functions/v1/question-explanation-pipeline`,
  };
}

async function callPipeline<T>(
  endpoint: string,
  apiKey: string,
  workflowSecret: string,
  body: Record<string, unknown>,
): Promise<FunctionResponse<T>> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "x-workflow-secret": workflowSecret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: FunctionResponse<T>;
  try {
    parsed = JSON.parse(text) as FunctionResponse<T>;
  } catch (_) {
    throw new Error(`Function returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok || !parsed.ok) {
    throw new Error(parsed.error || `Function call failed with status ${response.status}`);
  }
  return parsed;
}

function renderReviewMarkdown(exportResult: ExportResult): string {
  const lines: string[] = [];
  lines.push(`# Batch Review - Run ${exportResult.run.id}`);
  lines.push("");
  lines.push(`- Model: \`${exportResult.run.model_code}\``);
  lines.push(`- Status: \`${exportResult.run.status}\``);
  lines.push(`- Target: ${exportResult.run.target_count}`);
  lines.push(`- Success: ${exportResult.run.success_count}`);
  lines.push(`- Failure: ${exportResult.run.failure_count}`);
  lines.push(`- Created: ${exportResult.run.created_at}`);
  if (exportResult.run.started_at) lines.push(`- Started: ${exportResult.run.started_at}`);
  if (exportResult.run.finished_at) lines.push(`- Finished: ${exportResult.run.finished_at}`);
  lines.push("");
  lines.push("## Job Overview");
  lines.push("");
  for (const job of exportResult.jobs) {
    lines.push(`- \`${job.question_id}\` | status: \`${job.status}\` | attempts: ${job.attempts}`);
    if (job.error_message) {
      lines.push(`  error: ${job.error_message}`);
    }
  }
  lines.push("");
  lines.push("## Generated Explanations");
  lines.push("");

  exportResult.items.forEach((item, idx) => {
    lines.push(`### ${idx + 1}. ${item.question_id}`);
    lines.push("");
    lines.push(`**Frage (DE):** ${item.question_text_de}`);
    lines.push("");
    lines.push("#### explanation_de");
    lines.push("");
    lines.push(item.new_explanation_de || "_leer_");
    lines.push("");
    lines.push("#### explanation_ar");
    lines.push("");
    lines.push(item.new_explanation_ar || "_leer_");
    lines.push("");
  });

  return lines.join("\n");
}

async function resolveModuleOrderIndexes(
  supabase: ReturnType<typeof createClient>,
  args: Args,
): Promise<number[]> {
  if (args.moduleOrderIndex !== null && !args.allModules) {
    return [args.moduleOrderIndex];
  }

  const { data: modules, error } = await supabase
    .from("modules")
    .select("order_index")
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Cannot load modules: ${error.message}`);

  return (modules || [])
    .map((m) => m.order_index)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
}

async function processRun(
  functionUrl: string,
  apiKey: string,
  workflowSecret: string,
  runId: string,
  args: Args,
) {
  const maxIterations = args.maxIterations > 0 ? args.maxIterations : Number.MAX_SAFE_INTEGER;
  let done = false;
  let iteration = 0;

  while (!done && iteration < maxIterations) {
    iteration++;
    const processRes = await callPipeline<ProcessResult>(functionUrl, apiKey, workflowSecret, {
      action: "process_next",
      runId,
    });
    const result = processRes.result!;
    const run = result.run;
    console.log(
      `[${iteration}] ${result.message} | job: ${result.processed_job?.question_id || "-"} -> ${result.processed_job?.status || "-"} | run: ${run?.status || "-"} (${run?.processed_count || 0}/${run?.target_count || "?"})`,
    );
    done = !!result.done;
    if (!done) await sleep(args.sleepMs);
  }
}

function buildReviewPath(moduleOrderIndex: number | string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = process.env.EXPLANATION_REVIEW_OUTPUT_DIR?.trim()
    ? path.resolve(process.cwd(), process.env.EXPLANATION_REVIEW_OUTPUT_DIR)
    : path.resolve(process.cwd(), "local_archive/batch_reviews");
  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, `batch_run_modul${moduleOrderIndex}_${stamp}_explanations.md`);
}

async function exportRunReview(
  functionUrl: string,
  apiKey: string,
  workflowSecret: string,
  runId: string,
): Promise<ExportResult> {
  const exportRes = await callPipeline<ExportResult>(functionUrl, apiKey, workflowSecret, {
    action: "export_review_payload",
    runId,
  });
  return exportRes.result!;
}

async function main() {
  requiredEnv("QUESTION_PIPELINE_SECRET");
  const args = parseArgs();
  const { functionUrl, apiKey, workflowSecret, supabaseUrl } = getSupabaseConfig();

  const supabase = createClient(supabaseUrl, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Starting EDGE explanation pipeline batch runner...");
  console.log(`Function URL: ${functionUrl}`);
  console.log(`Target: ${args.allModules ? "all modules" : `module ${args.moduleOrderIndex}`}`);
  console.log(`Count per module: ${args.limit === 0 ? "all questions" : args.limit}`);
  console.log(`Overwrite existing explanations: ${args.overwrite ? "yes" : "no"}`);

  if (args.runId) {
    console.log(`Resuming existing run: ${args.runId}`);
    await processRun(functionUrl, apiKey, workflowSecret, args.runId, args);
    const exportResult = await exportRunReview(functionUrl, apiKey, workflowSecret, args.runId);
    const outPath = buildReviewPath(args.moduleOrderIndex ?? "run");
    fs.writeFileSync(outPath, renderReviewMarkdown(exportResult), "utf8");
    console.log(`Review file written: ${outPath}`);
    return;
  }

  const moduleOrderIndexes = await resolveModuleOrderIndexes(supabase, args);
  if (moduleOrderIndexes.length === 0) {
    throw new Error("No modules found for batch processing.");
  }

  let createdRuns = 0;
  for (const moduleOrderIndex of moduleOrderIndexes) {
    try {
      const enqueue = await callPipeline<EnqueueResult>(functionUrl, apiKey, workflowSecret, {
        action: "enqueue_pilot",
        moduleOrderIndex,
        limit: args.limit,
        onlyUnupdated: !args.overwrite,
        writeMode: args.writeMode,
      });

      const runId = enqueue.result!.run_id;
      createdRuns++;
      console.log(`Run created: ${runId}`);
      console.log(`Module ${moduleOrderIndex}: ${enqueue.result!.module.title_de}`);
      console.log(`Selected questions: ${enqueue.result!.selected_question_ids.length}`);

      await processRun(functionUrl, apiKey, workflowSecret, runId, args);
      const exportResult = await exportRunReview(functionUrl, apiKey, workflowSecret, runId);
      const outPath = buildReviewPath(moduleOrderIndex);
      fs.writeFileSync(outPath, renderReviewMarkdown(exportResult), "utf8");
      console.log(`Review file written: ${outPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No questions selected")) {
        console.log(`Skipping module ${moduleOrderIndex}: no questions selected.`);
        continue;
      }
      throw error;
    }
  }

  if (createdRuns === 0) {
    console.log("No runs were created. Nothing to process.");
  }
}

main().catch((error) => {
  console.error("Batch run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
