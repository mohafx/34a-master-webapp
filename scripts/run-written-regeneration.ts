import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  createWrittenExamRegenerationLocalApi,
  WRITTEN_REGEN_MODEL_CODE,
} from "./written-exam-regeneration-local-pipeline.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

interface Args {
  questionId: string;
  runId: string;
  allQuestions: boolean;
  limit: number;
  overwrite: boolean;
  maxIterations: number;
  sleepMs: number;
  concurrency: number;
  autoApprove: boolean;
  autoApply: boolean;
}

interface EnqueueResult {
  run_id: string;
  question_id: string | null;
  question_count: number;
  model_code: string;
  prompt_version: string;
  overwrite: boolean;
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
    model_code: string;
    prompt_version: string;
    target_count: number;
    success_count: number;
    failure_count: number;
    created_at: string;
    started_at?: string | null;
    finished_at?: string | null;
    approved_at?: string | null;
    applied_at?: string | null;
  };
  jobs: Array<{
    question_id: string;
    status: string;
    attempts: number;
    error_message: string | null;
    source_question?: {
      id: string;
      topic: string;
      question_text_de: string;
      correct_answer: string;
      target_structure: string;
    } | null;
  }>;
  candidates: Array<{
    question_id: string;
    status: string;
    approved: boolean;
    approved_at: string | null;
    applied_at: string | null;
    candidate_json: any;
    validation_json: any;
    verifier_json: any;
  }>;
}

const DEFAULT_PILOT_QUESTION_ID = "73a95049-7e26-40b1-8f5d-7c3d851e1e24";

function parseArgs(): Args {
  const defaults: Args = {
    questionId: DEFAULT_PILOT_QUESTION_ID,
    runId: "",
    allQuestions: false,
    limit: 0,
    overwrite: true,
    maxIterations: 1500,
    sleepMs: 900,
    concurrency: 1,
    autoApprove: false,
    autoApply: false,
  };

  const parseBool = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--question-id=")) defaults.questionId = arg.split("=")[1] || defaults.questionId;
    else if (arg.startsWith("--run-id=")) defaults.runId = arg.split("=")[1] || "";
    else if (arg === "--all") defaults.allQuestions = true;
    else if (arg.startsWith("--all=")) defaults.allQuestions = parseBool(arg.split("=")[1] || "false");
    else if (arg.startsWith("--limit=")) defaults.limit = Number(arg.split("=")[1]);
    else if (arg.startsWith("--overwrite=")) defaults.overwrite = parseBool(arg.split("=")[1] || "false");
    else if (arg.startsWith("--max-iterations=")) defaults.maxIterations = Number(arg.split("=")[1]);
    else if (arg.startsWith("--sleep-ms=")) defaults.sleepMs = Number(arg.split("=")[1]);
    else if (arg.startsWith("--concurrency=")) defaults.concurrency = Number(arg.split("=")[1]);
    else if (arg === "--auto-approve") defaults.autoApprove = true;
    else if (arg.startsWith("--auto-approve=")) defaults.autoApprove = parseBool(arg.split("=")[1] || "false");
    else if (arg === "--auto-apply") defaults.autoApply = true;
    else if (arg.startsWith("--auto-apply=")) defaults.autoApply = parseBool(arg.split("=")[1] || "false");
  }

  if (defaults.autoApply) defaults.autoApprove = true;

  return defaults;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderMarkdownReview(payload: ExportResult): string {
  const lines: string[] = [];

  lines.push(`# Written Exam Regeneration Review - Run ${payload.run.id}`);
  lines.push("");
  lines.push(`- Model: \`${payload.run.model_code}\``);
  lines.push(`- Prompt Version: \`${payload.run.prompt_version}\``);
  lines.push(`- Status: \`${payload.run.status}\``);
  lines.push(`- Target Count: ${payload.run.target_count}`);
  lines.push(`- Success: ${payload.run.success_count}`);
  lines.push(`- Failure: ${payload.run.failure_count}`);
  lines.push(`- Created: ${payload.run.created_at}`);
  if (payload.run.started_at) lines.push(`- Started: ${payload.run.started_at}`);
  if (payload.run.finished_at) lines.push(`- Finished: ${payload.run.finished_at}`);
  if (payload.run.approved_at) lines.push(`- Approved: ${payload.run.approved_at}`);
  if (payload.run.applied_at) lines.push(`- Applied: ${payload.run.applied_at}`);
  lines.push("");

  lines.push("## Jobs");
  lines.push("");
  for (const job of payload.jobs) {
    lines.push(`- \`${job.question_id}\` | status: \`${job.status}\` | attempts: ${job.attempts}`);
    if (job.source_question?.question_text_de) {
      lines.push(`  - Frage: ${job.source_question.question_text_de}`);
      lines.push(`  - Alt-Loesung: ${job.source_question.correct_answer}`);
      lines.push(`  - Alt-Struktur: ${job.source_question.target_structure}`);
    }
    if (job.error_message) lines.push(`  - Fehler: ${job.error_message}`);
  }

  lines.push("");
  lines.push("## Kandidaten");
  lines.push("");

  for (const [index, candidate] of payload.candidates.entries()) {
    const data = candidate.candidate_json || {};
    const answers = data.answers || {};

    lines.push(`### ${index + 1}. ${candidate.question_id}`);
    lines.push("");
    lines.push(`- Candidate Status: \`${candidate.status}\``);
    lines.push(`- Approved: ${candidate.approved ? "yes" : "no"}`);
    lines.push(`- Applied At: ${candidate.applied_at || "-"}`);
    lines.push(`- Difficulty: ${data.difficulty_level || "-"}`);
    lines.push(`- Correct Answer: ${data.correct_answer || "-"}`);
    lines.push(`- Target Structure: ${data.target_structure || "-"}`);
    lines.push("");
    lines.push("**Frage (DE)**");
    lines.push("");
    lines.push(data.question_text_de || "_leer_");
    lines.push("");
    lines.push("**Frage (AR)**");
    lines.push("");
    lines.push(data.question_text_ar || "_leer_");
    lines.push("");
    lines.push("**Antworten**");
    lines.push("");

    for (const letter of ["A", "B", "C", "D", "E", "F"]) {
      if (!answers[letter]) continue;
      lines.push(`- ${letter}) ${answers[letter]?.text_de || ""}`);
      lines.push(`  - AR: ${answers[letter]?.text_ar || ""}`);
    }

    lines.push("");
    lines.push("**Erklaerung (DE)**");
    lines.push("");
    lines.push(data.explanation_de || "_leer_");
    lines.push("");
    lines.push("**Erklaerung (AR)**");
    lines.push("");
    lines.push(data.explanation_ar || "_leer_");
    lines.push("");

    const validationIssues = candidate.validation_json?.issues || [];
    lines.push(`- Validation Issues: ${Array.isArray(validationIssues) ? validationIssues.length : 0}`);
    if (Array.isArray(validationIssues) && validationIssues.length > 0) {
      for (const issue of validationIssues) lines.push(`  - ${issue}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function buildReviewPath(runId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = process.env.EXPLANATION_REVIEW_OUTPUT_DIR?.trim()
    ? path.resolve(process.cwd(), process.env.EXPLANATION_REVIEW_OUTPUT_DIR)
    : path.resolve(process.cwd(), "local_archive/batch_reviews");

  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, `written_exam_regen_run_${runId}_${stamp}.md`);
}

async function main() {
  const args = parseArgs();
  const localApi = createWrittenExamRegenerationLocalApi();
  const concurrency = Number.isFinite(args.concurrency) && args.concurrency > 0 ? Math.floor(args.concurrency) : 1;

  console.log("Starting local written exam regeneration pilot...");
  console.log(`Model fixed: ${WRITTEN_REGEN_MODEL_CODE}`);
  console.log("Execution mode: local API actions (no Supabase Edge Function deployment needed).");
  console.log(`Scope: ${args.allQuestions ? `all questions${args.limit > 0 ? ` (limit ${args.limit})` : ""}` : `single question ${args.questionId}`}`);
  console.log(`Concurrency: ${concurrency}`);

  let runId = args.runId;
  if (!runId) {
    const enqueue = await localApi.call<EnqueueResult>("enqueue_run", {
      questionId: args.allQuestions ? undefined : args.questionId,
      allQuestions: args.allQuestions || undefined,
      limit: args.limit > 0 ? args.limit : undefined,
      overwrite: args.overwrite,
    });

    const result = enqueue.result!;
    runId = result.run_id;

    console.log(`Run created: ${runId}`);
    if (result.question_id) {
      console.log(`Question ID: ${result.question_id}`);
    } else {
      console.log(`Question Count: ${result.question_count}`);
    }
    console.log(`Prompt Version: ${result.prompt_version}`);
  } else {
    console.log(`Resuming run: ${runId}`);
  }

  let done = false;
  let iteration = 0;

  while (!done && iteration < args.maxIterations) {
    iteration++;
    const processCalls = await Promise.all(
      Array.from({ length: concurrency }, () => localApi.call<ProcessResult>("process_next", { runId })),
    );

    for (const [workerIndex, process] of processCalls.entries()) {
      const result = process.result!;
      const run = result.run;
      console.log(
        `[${iteration}.${workerIndex + 1}] ${result.message} | job: ${result.processed_job?.question_id || "-"} -> ${result.processed_job?.status || "-"} | run: ${run?.status || "-"} (${run?.processed_count || 0}/${run?.target_count || "?"})`,
      );
    }

    done = processCalls.some((process) => !!process.result?.done);
    if (!done) await sleep(args.sleepMs);
  }

  if (!done) {
    console.warn(`Run is not finished yet after ${args.maxIterations} iterations. You can resume with --run-id=${runId}`);
  }

  const exportPayload = await localApi.call<ExportResult>("export_review_payload", { runId });

  const review = exportPayload.result!;
  const reviewPath = buildReviewPath(runId);
  fs.writeFileSync(reviewPath, renderMarkdownReview(review), "utf8");
  console.log(`Review file written: ${reviewPath}`);

  if (args.autoApprove) {
    const approvalPayload: Record<string, unknown> = { runId };
    if (!args.allQuestions) approvalPayload.questionId = args.questionId;

    const approval = await localApi.call<{ approved_count: number }>("approve_run", approvalPayload);
    console.log(`Approved candidate(s): ${approval.result?.approved_count ?? 0}`);
  }

  if (args.autoApply) {
    const applyPayload: Record<string, unknown> = { runId };
    if (!args.allQuestions) applyPayload.questionId = args.questionId;

    const applyResult = await localApi.call<{ applied_count: number }>("apply_run", applyPayload);
    console.log(`Applied candidate(s): ${applyResult.result?.applied_count ?? 0}`);

    const postApplyExport = await localApi.call<ExportResult>("export_review_payload", { runId });

    const postApplyPath = buildReviewPath(`${runId}_applied`);
    fs.writeFileSync(postApplyPath, renderMarkdownReview(postApplyExport.result!), "utf8");
    console.log(`Post-apply review file written: ${postApplyPath}`);
  }

  console.log("Pilot run finished.");
}

main().catch((error) => {
  console.error("Written regeneration pilot failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
