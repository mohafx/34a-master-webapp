import { createClient } from "@supabase/supabase-js";
import {
  detectExplanationContradictions,
  nextStatusAfterFailure,
  normalizeRegeneratedPayload,
  safeJsonParse,
  validateRegeneratedPayload,
} from "../supabase/functions/written-exam-regeneration-pipeline/shared.ts";

export const WRITTEN_REGEN_MODEL_CODE = "gemini-3-flash-preview";
export const WRITTEN_REGEN_PROMPT_VERSION = "written_exam_regen_v1_gemini_3_flash";

const MAX_REFINEMENT_PASSES = 2;
const MAX_JOB_ATTEMPTS = 3;
const CLAIM_RETRY_LOOPS = 6;
const CLAIM_FETCH_BATCH = 8;
const STALE_JOB_LOCK_MS = 10 * 60 * 1000;
const DEFAULT_GEMINI_TIMEOUT_MS = 90_000;
const DEFAULT_ACTOR_EMAIL = "local-batch@system";

type JobStatus = "queued" | "retry" | "in_progress" | "committed" | "failed";
type WriteMode = "direct";
type RunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "approved"
  | "applied";

export type Action = "enqueue_run" | "process_next" | "status" | "export_review_payload" | "approve_run" | "apply_run";

export interface FunctionResponse<T> {
  ok: boolean;
  action: Action;
  model_code: string;
  result: T;
}

interface EnqueueRunRequest {
  questionId?: string;
  questionIds?: string[];
  allQuestions?: boolean;
  limit?: number;
  overwrite?: boolean;
}

interface ProcessNextRequest {
  runId: string;
}

interface StatusRequest {
  runId: string;
}

interface ExportReviewPayloadRequest {
  runId: string;
}

interface ApproveRunRequest {
  runId: string;
  questionId?: string;
}

interface ApplyRunRequest {
  runId: string;
  questionId?: string;
}

interface JobRow {
  id: string;
  run_id: string;
  question_id: string;
  status: JobStatus;
  attempts: number;
  write_mode: WriteMode;
}

interface SourceQuestion {
  id: string;
  topic: string;
  question_text_de: string;
  question_text_ar: string | null;
  answer_a_de: string;
  answer_a_ar: string | null;
  answer_b_de: string;
  answer_b_ar: string | null;
  answer_c_de: string;
  answer_c_ar: string | null;
  answer_d_de: string;
  answer_d_ar: string | null;
  answer_e_de: string | null;
  answer_e_ar: string | null;
  answer_f_de: string | null;
  answer_f_ar: string | null;
  correct_answer: string;
  explanation_de: string | null;
  explanation_ar: string | null;
  target_structure: string | null;
  difficulty_level: string | null;
  source_file: string | null;
}

interface RunRow {
  id: string;
  status: RunStatus;
  target_count: number;
  processed_count: number;
  success_count: number;
  failure_count: number;
  model_code: string;
  prompt_version: string;
  write_mode: WriteMode;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  applied_at: string | null;
  applied_by: string | null;
}

type DbClient = ReturnType<typeof createClient>;

interface PipelineContext {
  supabase: DbClient;
  actorEmail: string;
  geminiApiKey: string;
  geminiTimeoutMs: number;
}

interface LocalPipelineOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  geminiApiKey?: string;
  actorEmail?: string;
  geminiTimeoutMs?: number;
}

type GeminiResult =
  | { ok: true; data: unknown; rawText: string }
  | { ok: false; error: string; rawText?: string };

function nowIso(): string {
  return new Date().toISOString();
}

function getEnv(name: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

function truncate(value: string | null | undefined, maxChars: number): string {
  if (!value) return "";
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function terminalRunStatus(status: string): boolean {
  return ["completed", "completed_with_errors", "failed", "approved", "applied"].includes(status);
}

function getSupabaseConfig(options: LocalPipelineOptions): { url: string; key: string } {
  const url = options.supabaseUrl || getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const key =
    options.supabaseKey ||
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL.");
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY.");
  }

  return { url, key };
}

function getGeminiApiKey(options: LocalPipelineOptions): string {
  const key =
    options.geminiApiKey ||
    getEnv("GOOGLE_AI_API_KEY") ||
    getEnv("GEMINI_API_KEY") ||
    getEnv("VITE_GEMINI_API_KEY") ||
    getEnv("Gemini_explanation_generator");

  if (!key) {
    throw new Error("Missing Gemini key. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY or VITE_GEMINI_API_KEY.");
  }

  return key;
}

function getActorEmail(options: LocalPipelineOptions): string {
  return options.actorEmail || getEnv("WRITTEN_REGEN_ACTOR_EMAIL") || DEFAULT_ACTOR_EMAIL;
}

function getGeminiTimeoutMs(options: LocalPipelineOptions): number {
  if (typeof options.geminiTimeoutMs === "number" && Number.isFinite(options.geminiTimeoutMs) && options.geminiTimeoutMs > 0) {
    return Math.floor(options.geminiTimeoutMs);
  }

  const fromEnv = Number(getEnv("GEMINI_REQUEST_TIMEOUT_MS"));
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);

  return DEFAULT_GEMINI_TIMEOUT_MS;
}

function createPipelineContext(options: LocalPipelineOptions = {}): PipelineContext {
  const { url, key } = getSupabaseConfig(options);
  const geminiApiKey = getGeminiApiKey(options);
  const actorEmail = getActorEmail(options);
  const geminiTimeoutMs = getGeminiTimeoutMs(options);

  return {
    supabase: createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    actorEmail,
    geminiApiKey,
    geminiTimeoutMs,
  };
}

async function callGeminiJson(
  context: PipelineContext,
  params: {
    prompt: string;
    maxTokens: number;
    temperature?: number;
    useSearch?: boolean;
  },
): Promise<GeminiResult> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: params.prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: params.temperature ?? 0.2,
      maxOutputTokens: params.maxTokens,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  if (params.useSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${WRITTEN_REGEN_MODEL_CODE}:generateContent?key=${context.geminiApiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), context.geminiTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: `Gemini request timeout after ${context.geminiTimeoutMs}ms.` };
    }

    return {
      ok: false,
      error: `Gemini request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: `Gemini API error ${response.status}: ${truncate(errorText, 400)}` };
  }

  const payload = await response.json();
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    const reason = payload?.candidates?.[0]?.finishReason || "UNKNOWN";
    return { ok: false, error: `Gemini returned empty text (${reason}).` };
  }

  const parsed = safeJsonParse(rawText);
  if (!parsed) {
    return { ok: false, error: "Gemini returned non-JSON output.", rawText };
  }

  return { ok: true, data: parsed, rawText };
}

function buildSourceContext(question: SourceQuestion) {
  const answers: Record<string, { text_de: string | null; text_ar: string | null }> = {
    A: { text_de: question.answer_a_de, text_ar: question.answer_a_ar },
    B: { text_de: question.answer_b_de, text_ar: question.answer_b_ar },
    C: { text_de: question.answer_c_de, text_ar: question.answer_c_ar },
    D: { text_de: question.answer_d_de, text_ar: question.answer_d_ar },
    E: { text_de: question.answer_e_de, text_ar: question.answer_e_ar },
    F: { text_de: question.answer_f_de, text_ar: question.answer_f_ar },
  };

  return {
    id: question.id,
    topic: question.topic,
    source_file: question.source_file,
    target_structure: question.target_structure,
    current_question: {
      question_text_de: question.question_text_de,
      question_text_ar: question.question_text_ar,
      correct_answer: question.correct_answer,
      explanation_de: question.explanation_de,
      explanation_ar: question.explanation_ar,
      answers,
    },
  };
}

async function runGeneratorAgent(context: PipelineContext, question: SourceQuestion): Promise<GeminiResult> {
  const contextJson = JSON.stringify(buildSourceContext(question), null, 2);
  const prompt = `Du bist ein juristisch-praeziser IHK-Pruefungsautor fuer die Sachkundepruefung nach §34a GewO.
Erstelle eine vollstaendig neu formulierte, rechtlich korrekte und pruefungsrelevante Frage.

WICHTIG:
- Stil: IHK-nah, formell, keine Umgangssprache, keine Scherzantworten.
- Es muessen exakt 5 oder 6 Antwortoptionen erzeugt werden (A..E oder A..F).
- Es duerfen exakt 1 oder 2 Antworten richtig sein.
- Falsche Antworten muessen plausibel sein.
- Erklaerungen muessen die Rechtslage und die falschen Antworten begruenden.
- Arabisch muss vollstaendig und fachsprachlich korrekt sein.
- Schwierigkeit als EASY, MEDIUM oder HARD festlegen.
- Nutze bei der Einordnung aktuelle Rechtslage (Deutschland).

ANTWORT NUR ALS JSON in diesem exakten Format:
{
  "question_text_de": "...",
  "question_text_ar": "...",
  "answers": {
    "A": { "text_de": "...", "text_ar": "..." },
    "B": { "text_de": "...", "text_ar": "..." },
    "C": { "text_de": "...", "text_ar": "..." },
    "D": { "text_de": "...", "text_ar": "..." },
    "E": { "text_de": "...", "text_ar": "..." }
  },
  "correct_answer": "A" oder "A,C",
  "explanation_de": "...",
  "explanation_ar": "...",
  "difficulty_level": "EASY|MEDIUM|HARD",
  "target_structure": "5_opts|1_correct"
}

Kontext zur zu regenerierenden Frage:
${contextJson}`;

  return await callGeminiJson(context, {
    prompt,
    maxTokens: 10_000,
    temperature: 0.2,
    useSearch: true,
  });
}

async function runVerifierAgent(context: PipelineContext, question: SourceQuestion, candidate: unknown): Promise<GeminiResult> {
  const contextJson = JSON.stringify(buildSourceContext(question), null, 2);
  const candidateJson = JSON.stringify(candidate, null, 2);

  const prompt = `Du bist ein unabhaengiger QA- und Rechts-Verifier fuer IHK-34a-Fragen.
Pruefe juristische Konsistenz, Logik und Formvorgaben.

Bewertungsregeln:
- Rechtslage muss nachvollziehbar und plausibel sein.
- Erklaerung darf der Loesung nicht widersprechen.
- Nur 5 oder 6 Optionen und nur 1 oder 2 richtige Antworten.
- IHK-nahe Sprache und pruefungsrelevanter Inhalt.

Antworte NUR als JSON:
{
  "pass": true,
  "confidence": 0.0,
  "issues": ["..."],
  "legal_notes": ["..."]
}

Quellfrage:
${contextJson}

Kandidat:
${candidateJson}`;

  return await callGeminiJson(context, {
    prompt,
    maxTokens: 3_500,
    temperature: 0.1,
    useSearch: true,
  });
}

async function runRefinerAgent(
  context: PipelineContext,
  question: SourceQuestion,
  candidate: unknown,
  issues: string[],
): Promise<GeminiResult> {
  const contextJson = JSON.stringify(buildSourceContext(question), null, 2);
  const candidateJson = JSON.stringify(candidate, null, 2);
  const issuesJson = JSON.stringify(issues, null, 2);

  const prompt = `Du bist ein Refiner-Agent fuer IHK-34a-Fragen.
Repariere den Kandidaten strikt anhand der Issues.

Pflicht:
- Exakt 5 oder 6 Antwortoptionen (A..E oder A..F)
- Exakt 1 oder 2 richtige Antworten
- Juristisch korrekte und pruefungsrelevante Begruendung
- Kein Widerspruch zwischen Loesung und Erklaerung
- difficulty_level muss EASY, MEDIUM oder HARD sein

Antworte NUR als JSON im selben Format wie zuvor.

Quellfrage:
${contextJson}

Kandidat:
${candidateJson}

Issues:
${issuesJson}`;

  return await callGeminiJson(context, {
    prompt,
    maxTokens: 10_000,
    temperature: 0.1,
    useSearch: false,
  });
}

async function fetchSourceQuestion(supabase: DbClient, questionId: string): Promise<SourceQuestion> {
  const { data, error } = await supabase
    .from("written_exam_questions")
    .select(
      "id,topic,question_text_de,question_text_ar,answer_a_de,answer_a_ar,answer_b_de,answer_b_ar,answer_c_de,answer_c_ar,answer_d_de,answer_d_ar,answer_e_de,answer_e_ar,answer_f_de,answer_f_ar,correct_answer,explanation_de,explanation_ar,target_structure,difficulty_level,source_file",
    )
    .eq("id", questionId)
    .single();

  if (error || !data) {
    throw new Error(`Cannot load written exam question ${questionId}: ${error?.message || "not found"}`);
  }

  return data as SourceQuestion;
}

async function finalizeJobWithFailure(
  supabase: DbClient,
  job: JobRow,
  errorMessage: string,
  outputJson: Record<string, unknown> | null = null,
  validationJson: Record<string, unknown> | null = null,
): Promise<"retry" | "failed"> {
  const nextStatus = nextStatusAfterFailure(job.attempts, MAX_JOB_ATTEMPTS);

  const { error } = await supabase
    .from("written_exam_regen_jobs")
    .update({
      status: nextStatus,
      error_message: errorMessage,
      output_json: outputJson,
      validation_json: validationJson,
      updated_at: nowIso(),
    })
    .eq("id", job.id);

  if (error) {
    throw new Error(`Cannot update failed job ${job.id}: ${error.message}`);
  }

  return nextStatus;
}

async function refreshRunCounters(supabase: DbClient, runId: string) {
  const { data: run, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runErr || !run) throw new Error(`Cannot load run ${runId}: ${runErr?.message || "not found"}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from("written_exam_regen_jobs")
    .select("status")
    .eq("run_id", runId);

  if (jobsErr) throw new Error(`Cannot load jobs for run ${runId}: ${jobsErr.message}`);

  const counts = { queued: 0, retry: 0, in_progress: 0, committed: 0, failed: 0 };
  for (const row of jobs || []) {
    const status = row.status as keyof typeof counts;
    if (status in counts) counts[status] += 1;
  }

  const processedCount = counts.committed + counts.failed;
  const successCount = counts.committed;
  const failureCount = counts.failed;
  const remaining = counts.queued + counts.retry + counts.in_progress;

  let nextStatus = run.status as RunStatus;
  let finishedAt = run.finished_at as string | null;

  if (!["approved", "applied"].includes(nextStatus)) {
    if (remaining === 0) {
      finishedAt = nowIso();
      if (failureCount === run.target_count) nextStatus = "failed";
      else if (failureCount > 0) nextStatus = "completed_with_errors";
      else nextStatus = "completed";
    } else if (processedCount > 0 || counts.in_progress > 0) {
      nextStatus = "in_progress";
    } else {
      nextStatus = "queued";
    }
  }

  const { data: updatedRows, error: updateErr } = await supabase
    .from("written_exam_regen_runs")
    .update({
      status: nextStatus,
      processed_count: processedCount,
      success_count: successCount,
      failure_count: failureCount,
      started_at: run.started_at || nowIso(),
      finished_at: finishedAt,
    })
    .eq("id", runId)
    .select("*");

  if (updateErr || !updatedRows?.length) {
    throw new Error(`Cannot update run counters: ${updateErr?.message || "unknown"}`);
  }

  return {
    run: updatedRows[0],
    job_counts: counts,
  };
}

async function claimNextJob(supabase: DbClient, runId: string): Promise<JobRow | null> {
  for (let loop = 0; loop < CLAIM_RETRY_LOOPS; loop += 1) {
    const { data: candidates, error: candErr } = await supabase
      .from("written_exam_regen_jobs")
      .select("id,run_id,question_id,status,attempts,write_mode,created_at")
      .eq("run_id", runId)
      .in("status", ["queued", "retry"])
      .order("created_at", { ascending: true })
      .limit(CLAIM_FETCH_BATCH);

    if (candErr) throw new Error(`Cannot fetch next job: ${candErr.message}`);
    if (!candidates?.length) return null;

    for (const candidate of candidates as JobRow[]) {
      const { data: claimedRows, error: claimErr } = await supabase
        .from("written_exam_regen_jobs")
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
        .select("id,run_id,question_id,status,attempts,write_mode");

      if (claimErr) throw new Error(`Cannot claim job ${candidate.id}: ${claimErr.message}`);
      if (claimedRows?.length) {
        return claimedRows[0] as JobRow;
      }
    }
  }

  return null;
}

async function recoverStaleInProgressJobs(supabase: DbClient, runId: string): Promise<number> {
  const cutoffIso = new Date(Date.now() - STALE_JOB_LOCK_MS).toISOString();

  const { data: staleRows, error: staleErr } = await supabase
    .from("written_exam_regen_jobs")
    .update({
      status: "retry",
      error_message: "Recovered stale in_progress lock.",
      updated_at: nowIso(),
      worker_id: null,
    })
    .eq("run_id", runId)
    .eq("status", "in_progress")
    .lt("locked_at", cutoffIso)
    .select("id");

  if (staleErr) throw new Error(`Cannot recover stale in_progress jobs: ${staleErr.message}`);

  return (staleRows || []).length;
}

async function processSingleJob(
  context: PipelineContext,
  job: JobRow,
): Promise<{ ok: boolean; status: string; message: string }> {
  const { supabase } = context;

  try {
    const sourceQuestion = await fetchSourceQuestion(supabase, job.question_id);

    const { error: inputErr } = await supabase
      .from("written_exam_regen_jobs")
      .update({
        input_json: buildSourceContext(sourceQuestion),
        updated_at: nowIso(),
      })
      .eq("id", job.id);

    if (inputErr) throw new Error(`Cannot persist input_json: ${inputErr.message}`);

    let candidate: unknown = null;
    let validationIssues: string[] = [];
    const verificationHistory: Array<Record<string, unknown>> = [];
    let passed = false;

    for (let pass = 0; pass <= MAX_REFINEMENT_PASSES; pass += 1) {
      const generation =
        pass === 0
          ? await runGeneratorAgent(context, sourceQuestion)
          : await runRefinerAgent(context, sourceQuestion, candidate, validationIssues);

      if (!generation.ok) {
        const status = await finalizeJobWithFailure(
          supabase,
          job,
          `${pass === 0 ? "Generator" : "Refiner"} failed: ${generation.error}`,
          {
            stage: pass === 0 ? "generator" : "refiner",
            error: generation.error,
            raw: generation.rawText || null,
          },
        );

        return { ok: false, status, message: `${pass === 0 ? "Generator" : "Refiner"} failed (${status})` };
      }

      candidate = generation.data;

      const localValidation = validateRegeneratedPayload(candidate);
      const normalized = localValidation.normalized || normalizeRegeneratedPayload(candidate);

      const contradictionIssues = normalized
        ? detectExplanationContradictions(normalized)
        : ["Konnte Kandidaten fuer Widerspruchspruefung nicht normalisieren."];

      const verifier = await runVerifierAgent(context, sourceQuestion, normalized || candidate);

      let verifierPass = false;
      let verifierIssues: string[] = [];
      let verifierPayload: Record<string, unknown> = {};

      if (verifier.ok && verifier.data && typeof verifier.data === "object") {
        verifierPayload = verifier.data as Record<string, unknown>;
        verifierPass = verifierPayload.pass === true;
        verifierIssues = asStringArray(verifierPayload.issues);
      } else {
        verifierIssues = [`Verifier failed: ${verifier.ok ? "invalid format" : verifier.error}`];
      }

      validationIssues = [...localValidation.issues, ...contradictionIssues, ...verifierIssues];

      verificationHistory.push({
        pass_index: pass,
        local_validation: localValidation,
        contradiction_issues: contradictionIssues,
        verifier: verifier.ok ? verifierPayload : { error: verifier.error },
        combined_issues: validationIssues,
      });

      passed = localValidation.ok && contradictionIssues.length === 0 && verifierPass;
      if (passed && normalized) {
        candidate = normalized;
        break;
      }

      if (pass === MAX_REFINEMENT_PASSES) break;
    }

    if (!passed) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Validation failed after ${MAX_REFINEMENT_PASSES + 1} passes.`,
        {
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        { issues: validationIssues },
      );

      return { ok: false, status, message: `Validation failed (${status})` };
    }

    const validated = validateRegeneratedPayload(candidate);
    if (!validated.ok || !validated.normalized) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        "Candidate could not be normalized after successful verification.",
        {
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        { issues: validated.issues },
      );

      return { ok: false, status, message: `Normalization failed (${status})` };
    }

    const normalizedCandidate = validated.normalized;

    const { error: candidateErr } = await supabase
      .from("written_exam_regen_candidates")
      .upsert(
        {
          run_id: job.run_id,
          question_id: job.question_id,
          status: "generated",
          candidate_json: normalizedCandidate,
          validation_json: {
            issues: validationIssues,
            verification_passes: verificationHistory.length,
          },
          verifier_json: verificationHistory,
          approved: false,
          approved_at: null,
          approved_by: null,
          applied_at: null,
          applied_by: null,
          updated_at: nowIso(),
        },
        { onConflict: "run_id,question_id" },
      );

    if (candidateErr) {
      const status = await finalizeJobWithFailure(supabase, job, `Candidate upsert failed: ${candidateErr.message}`);
      return { ok: false, status, message: `Candidate upsert failed (${status})` };
    }

    const { error: commitErr } = await supabase
      .from("written_exam_regen_jobs")
      .update({
        status: "committed",
        error_message: null,
        output_json: {
          candidate: normalizedCandidate,
          verification_history: verificationHistory,
        },
        validation_json: {
          issues: validationIssues,
          verification_passes: verificationHistory.length,
        },
        updated_at: nowIso(),
      })
      .eq("id", job.id);

    if (commitErr) throw new Error(`Cannot commit job ${job.id}: ${commitErr.message}`);

    return { ok: true, status: "committed", message: "Candidate generated and stored." };
  } catch (error) {
    const status = await finalizeJobWithFailure(
      supabase,
      job,
      `Unhandled processing error: ${error instanceof Error ? error.message : String(error)}`,
    );

    return { ok: false, status, message: `Unhandled processing error (${status})` };
  }
}

interface SourceQuestionSummary {
  id: string;
  topic: string;
  target_structure: string | null;
}

async function loadQuestionSummariesByIds(supabase: DbClient, questionIds: string[]): Promise<SourceQuestionSummary[]> {
  if (!questionIds.length) return [];

  const { data, error } = await supabase
    .from("written_exam_questions")
    .select("id,topic,target_structure")
    .in("id", questionIds);

  if (error) {
    throw new Error(`Cannot load question summaries: ${error.message}`);
  }

  return (data || []) as SourceQuestionSummary[];
}

async function resolveEnqueueQuestionIds(
  supabase: DbClient,
  payload: EnqueueRunRequest,
): Promise<string[]> {
  const uniqueIds = new Set<string>();

  if (payload.questionId && payload.questionId.trim()) {
    uniqueIds.add(payload.questionId.trim());
  }

  for (const id of payload.questionIds || []) {
    if (typeof id === "string" && id.trim()) uniqueIds.add(id.trim());
  }

  let targetIds = [...uniqueIds];

  if (!targetIds.length && payload.allQuestions) {
    let query = supabase
      .from("written_exam_questions")
      .select("id")
      .order("topic", { ascending: true })
      .order("id", { ascending: true });

    if (typeof payload.limit === "number" && Number.isFinite(payload.limit) && payload.limit > 0) {
      query = query.limit(Math.floor(payload.limit));
    }

    const { data: allRows, error: allErr } = await query;
    if (allErr) throw new Error(`Cannot list written exam questions: ${allErr.message}`);

    targetIds = (allRows || [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  if (!targetIds.length) {
    throw new Error("enqueue_run requires questionId / questionIds / allQuestions=true.");
  }

  const summaries = await loadQuestionSummariesByIds(supabase, targetIds);
  const existingIdSet = new Set(summaries.map((item) => item.id));
  const missing = targetIds.filter((id) => !existingIdSet.has(id));
  if (missing.length) {
    throw new Error(`Some question IDs do not exist: ${missing.slice(0, 10).join(", ")}`);
  }

  if (payload.overwrite === false) {
    const { data: existingRows, error: existingErr } = await supabase
      .from("written_exam_regen_candidates")
      .select("question_id")
      .in("question_id", targetIds);

    if (existingErr) throw new Error(`Cannot check existing candidates: ${existingErr.message}`);
    const existingIdRows = new Set(
      (existingRows || [])
        .map((row) => row.question_id)
        .filter((id): id is string => typeof id === "string"),
    );

    targetIds = targetIds.filter((id) => !existingIdRows.has(id));
    if (!targetIds.length) {
      throw new Error("No questions left after overwrite=false filter.");
    }
  }

  return targetIds;
}

async function enqueueRun(context: PipelineContext, payload: EnqueueRunRequest) {
  const { supabase, actorEmail } = context;
  const questionIds = await resolveEnqueueQuestionIds(supabase, payload);
  const overwrite = payload.overwrite !== false;
  const summaries = await loadQuestionSummariesByIds(supabase, questionIds);
  const summaryMap = new Map(summaries.map((item) => [item.id, item]));

  const { data: runRows, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .insert({
      status: "queued",
      target_count: questionIds.length,
      model_code: WRITTEN_REGEN_MODEL_CODE,
      prompt_version: WRITTEN_REGEN_PROMPT_VERSION,
      write_mode: "direct",
      created_by: actorEmail,
      created_at: nowIso(),
    })
    .select("*");

  if (runErr || !runRows?.length) {
    throw new Error(`Cannot create run: ${runErr?.message || "unknown"}`);
  }

  const run = runRows[0] as RunRow;

  const jobRows = questionIds.map((questionId) => {
    const summary = summaryMap.get(questionId);
    return {
      run_id: run.id,
      question_id: questionId,
      status: "queued",
      attempts: 0,
      write_mode: "direct" as const,
      input_json: {
        source_topic: summary?.topic || null,
        source_target_structure: summary?.target_structure || null,
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  });

  const { error: jobErr } = await supabase
    .from("written_exam_regen_jobs")
    .insert(jobRows);

  if (jobErr) throw new Error(`Cannot create regeneration job: ${jobErr.message}`);

  return {
    run_id: run.id,
    question_id: questionIds.length === 1 ? questionIds[0] : null,
    question_count: questionIds.length,
    model_code: WRITTEN_REGEN_MODEL_CODE,
    prompt_version: WRITTEN_REGEN_PROMPT_VERSION,
    overwrite,
  };
}

async function processNext(context: PipelineContext, payload: ProcessNextRequest) {
  const { supabase } = context;

  const { data: run, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .select("*")
    .eq("id", payload.runId)
    .single();

  if (runErr || !run) {
    throw new Error(`Run ${payload.runId} not found: ${runErr?.message || "unknown"}`);
  }

  if (terminalRunStatus(run.status)) {
    const snapshot = await refreshRunCounters(supabase, payload.runId);
    return {
      done: true,
      message: `Run is already terminal (${snapshot.run.status}).`,
      ...snapshot,
    };
  }

  if (!run.started_at) {
    await supabase
      .from("written_exam_regen_runs")
      .update({ started_at: nowIso(), status: "in_progress" })
      .eq("id", payload.runId);
  }

  await recoverStaleInProgressJobs(supabase, payload.runId);

  const claimed = await claimNextJob(supabase, payload.runId);
  if (!claimed) {
    const snapshot = await refreshRunCounters(supabase, payload.runId);
    return {
      done: terminalRunStatus(snapshot.run.status),
      message: "No claimable job found.",
      ...snapshot,
    };
  }

  const result = await processSingleJob(context, claimed);
  const snapshot = await refreshRunCounters(supabase, payload.runId);

  return {
    done: terminalRunStatus(snapshot.run.status),
    message: result.message,
    processed_job: {
      id: claimed.id,
      question_id: claimed.question_id,
      status: result.status,
      ok: result.ok,
      message: result.message,
    },
    ...snapshot,
  };
}

async function runStatus(context: PipelineContext, payload: StatusRequest) {
  return await refreshRunCounters(context.supabase, payload.runId);
}

async function exportReviewPayload(context: PipelineContext, payload: ExportReviewPayloadRequest) {
  const { supabase } = context;

  const { data: run, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .select("*")
    .eq("id", payload.runId)
    .single();

  if (runErr || !run) throw new Error(`Run ${payload.runId} not found: ${runErr?.message || "unknown"}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from("written_exam_regen_jobs")
    .select("question_id,status,attempts,error_message,validation_json,updated_at")
    .eq("run_id", payload.runId)
    .order("created_at", { ascending: true });

  if (jobsErr) throw new Error(`Cannot load jobs: ${jobsErr.message}`);

  const { data: candidates, error: candidatesErr } = await supabase
    .from("written_exam_regen_candidates")
    .select("question_id,status,approved,approved_at,applied_at,candidate_json,validation_json,verifier_json,updated_at")
    .eq("run_id", payload.runId)
    .order("created_at", { ascending: true });

  if (candidatesErr) throw new Error(`Cannot load candidates: ${candidatesErr.message}`);

  const questionIds = [
    ...new Set([...(jobs || []).map((job) => job.question_id), ...(candidates || []).map((candidate) => candidate.question_id)]),
  ];

  const { data: sourceQuestions, error: sourceErr } = questionIds.length
    ? await supabase
      .from("written_exam_questions")
      .select("id,topic,question_text_de,correct_answer,target_structure")
      .in("id", questionIds)
    : { data: [], error: null };

  if (sourceErr) throw new Error(`Cannot load source questions: ${sourceErr.message}`);

  const sourceMap = new Map((sourceQuestions || []).map((question) => [question.id, question]));

  return {
    run,
    jobs: (jobs || []).map((job) => ({
      ...job,
      source_question: sourceMap.get(job.question_id) || null,
    })),
    candidates: (candidates || []).map((candidate) => ({
      ...candidate,
      source_question: sourceMap.get(candidate.question_id) || null,
    })),
  };
}

async function approveRun(context: PipelineContext, payload: ApproveRunRequest) {
  const { supabase, actorEmail } = context;

  let query = supabase
    .from("written_exam_regen_candidates")
    .select("id,question_id,status,approved")
    .eq("run_id", payload.runId);

  if (payload.questionId) query = query.eq("question_id", payload.questionId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`Cannot load candidates for approval: ${error.message}`);
  if (!rows?.length) throw new Error("No candidate found for approval.");

  const invalid = rows.find((row) => !["generated", "approved"].includes(row.status));
  if (invalid) {
    throw new Error(`Candidate ${invalid.question_id} is in status '${invalid.status}' and cannot be approved.`);
  }

  const targetIds = rows.map((row) => row.id);

  const { error: updateErr } = await supabase
    .from("written_exam_regen_candidates")
    .update({
      status: "approved",
      approved: true,
      approved_at: nowIso(),
      approved_by: actorEmail,
      updated_at: nowIso(),
    })
    .in("id", targetIds);

  if (updateErr) throw new Error(`Cannot approve candidate(s): ${updateErr.message}`);

  const { error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .update({
      status: "approved",
      approved_at: nowIso(),
      approved_by: actorEmail,
    })
    .eq("id", payload.runId);

  if (runErr) throw new Error(`Cannot set run approved: ${runErr.message}`);

  return {
    run_id: payload.runId,
    approved_count: targetIds.length,
    question_id: payload.questionId || null,
  };
}

async function applyRun(context: PipelineContext, payload: ApplyRunRequest) {
  const { supabase, actorEmail } = context;

  let query = supabase
    .from("written_exam_regen_candidates")
    .select("id,question_id,status,candidate_json,approved")
    .eq("run_id", payload.runId)
    .eq("approved", true)
    .order("created_at", { ascending: true });

  if (payload.questionId) query = query.eq("question_id", payload.questionId);

  const { data: candidates, error } = await query;

  if (error) throw new Error(`Cannot load approved candidates: ${error.message}`);
  if (!candidates?.length) throw new Error("No approved candidate found to apply.");

  let appliedCount = 0;

  for (const candidate of candidates) {
    const validated = validateRegeneratedPayload(candidate.candidate_json);
    if (!validated.ok || !validated.normalized) {
      throw new Error(`Candidate ${candidate.question_id} failed validation before apply: ${validated.issues.join(" | ")}`);
    }

    const normalized = validated.normalized;
    const source = await fetchSourceQuestion(supabase, candidate.question_id);

    const map = normalized.answers;
    const answerA = map.A;
    const answerB = map.B;
    const answerC = map.C;
    const answerD = map.D;
    const answerE = map.E;
    const answerF = map.F;

    const updatePayload = {
      topic: source.topic,
      question_text_de: normalized.question_text_de,
      question_text_ar: normalized.question_text_ar,
      answer_a_de: answerA?.text_de || source.answer_a_de,
      answer_a_ar: answerA?.text_ar || source.answer_a_ar,
      answer_b_de: answerB?.text_de || source.answer_b_de,
      answer_b_ar: answerB?.text_ar || source.answer_b_ar,
      answer_c_de: answerC?.text_de || source.answer_c_de,
      answer_c_ar: answerC?.text_ar || source.answer_c_ar,
      answer_d_de: answerD?.text_de || source.answer_d_de,
      answer_d_ar: answerD?.text_ar || source.answer_d_ar,
      answer_e_de: answerE?.text_de || null,
      answer_e_ar: answerE?.text_ar || null,
      answer_f_de: answerF?.text_de || null,
      answer_f_ar: answerF?.text_ar || null,
      correct_answer: normalized.correct_answer,
      explanation_de: normalized.explanation_de,
      explanation_ar: normalized.explanation_ar,
      target_structure: normalized.target_structure,
      difficulty_level: normalized.difficulty_level,
      regeneration_version: WRITTEN_REGEN_PROMPT_VERSION,
      regenerated_at: nowIso(),
      legal_review_state: "verified",
      updated_at: nowIso(),
    };

    const { data: updatedRows, error: updateErr } = await supabase
      .from("written_exam_questions")
      .update(updatePayload)
      .eq("id", candidate.question_id)
      .select("id");

    if (updateErr || !updatedRows?.length) {
      throw new Error(`Cannot apply candidate to question ${candidate.question_id}: ${updateErr?.message || "0 rows"}`);
    }

    const { error: auditErr } = await supabase
      .from("written_exam_regen_audit")
      .insert({
        run_id: payload.runId,
        question_id: candidate.question_id,
        old_question_json: source,
        new_question_json: updatePayload,
        applied_at: nowIso(),
        applied_by: actorEmail,
      });

    if (auditErr) throw new Error(`Cannot write audit for question ${candidate.question_id}: ${auditErr.message}`);

    const { error: candidateUpdateErr } = await supabase
      .from("written_exam_regen_candidates")
      .update({
        status: "applied",
        applied_at: nowIso(),
        applied_by: actorEmail,
        updated_at: nowIso(),
      })
      .eq("id", candidate.id);

    if (candidateUpdateErr) {
      throw new Error(`Cannot update candidate status for ${candidate.question_id}: ${candidateUpdateErr.message}`);
    }

    appliedCount += 1;
  }

  const { error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .update({
      status: "applied",
      applied_at: nowIso(),
      applied_by: actorEmail,
      finished_at: nowIso(),
    })
    .eq("id", payload.runId);

  if (runErr) throw new Error(`Cannot mark run as applied: ${runErr.message}`);

  return {
    run_id: payload.runId,
    applied_count: appliedCount,
    question_id: payload.questionId || null,
  };
}

async function dispatchAction(context: PipelineContext, action: Action, payload: Record<string, unknown>) {
  if (action === "enqueue_run") {
    return await enqueueRun(context, payload as unknown as EnqueueRunRequest);
  }

  if (action === "process_next") {
    return await processNext(context, payload as unknown as ProcessNextRequest);
  }

  if (action === "status") {
    return await runStatus(context, payload as unknown as StatusRequest);
  }

  if (action === "export_review_payload") {
    return await exportReviewPayload(context, payload as unknown as ExportReviewPayloadRequest);
  }

  if (action === "approve_run") {
    return await approveRun(context, payload as unknown as ApproveRunRequest);
  }

  if (action === "apply_run") {
    return await applyRun(context, payload as unknown as ApplyRunRequest);
  }

  throw new Error(`Unknown action: ${String(action)}`);
}

export interface WrittenExamRegenerationLocalApi {
  call<T>(action: Action, payload?: Record<string, unknown>): Promise<FunctionResponse<T>>;
}

export function createWrittenExamRegenerationLocalApi(options: LocalPipelineOptions = {}): WrittenExamRegenerationLocalApi {
  const context = createPipelineContext(options);

  return {
    async call<T>(action: Action, payload: Record<string, unknown> = {}): Promise<FunctionResponse<T>> {
      const result = await dispatchAction(context, action, payload);

      return {
        ok: true,
        action,
        model_code: WRITTEN_REGEN_MODEL_CODE,
        result: result as T,
      };
    },
  };
}
