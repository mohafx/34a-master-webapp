import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  nextStatusAfterFailure,
  normalizeExplanationPayload,
  safeJsonParse,
  validateExplanationPayload,
} from "../supabase/functions/question-explanation-pipeline/shared.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

type WriteMode = "direct";

type GeminiResult =
  | { ok: true; data: unknown; rawText: string }
  | { ok: false; error: string; rawText?: string };

type JobStatus = "queued" | "retry" | "in_progress" | "committed" | "failed";

interface JobRow {
  id: string;
  run_id: string;
  question_id: string;
  status: JobStatus;
  attempts: number;
  write_mode: WriteMode;
}

interface QuestionContext {
  question: {
    id: string;
    module_id: string;
    lesson_id: string | null;
    order_index: number;
    type: string;
    text_de: string;
    correct_answer: string | null;
    explanation_de: string | null;
    explanation_ar: string | null;
    answer_a_de: string | null;
    answer_b_de: string | null;
    answer_c_de: string | null;
    answer_d_de: string | null;
    answer_e_de: string | null;
    answer_f_de: string | null;
  };
  lesson: {
    id: string;
    order_index: number;
    title_de: string;
    content_de: string | null;
  } | null;
  module: {
    id: string;
    order_index: number;
    title_de: string;
  };
}

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

const DEFAULT_MODEL = "gemini-3.1-pro-preview";
const MAX_REFINEMENT_PASSES = 2;
const MAX_JOB_ATTEMPTS = 3; // initial + 2 retries
const EXPLANATION_VERSION = "v3_single_section_gemini_3_1_pro";
const DEFAULT_GEMINI_TIMEOUT_MS = 90_000;
const DEFAULT_STALE_LOCK_MS = 4 * 60 * 1000;

function parseArgs(): Args {
  const defaults: Args = {
    moduleOrderIndex: null,
    allModules: true,
    overwrite: true,
    limit: 0,
    writeMode: "direct",
    runId: "",
    maxIterations: 0,
    sleepMs: 200,
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

const GEMINI_REQUEST_TIMEOUT_MS = getIntEnv("GEMINI_REQUEST_TIMEOUT_MS", DEFAULT_GEMINI_TIMEOUT_MS);
const STALE_JOB_LOCK_MS = getIntEnv("EXPLANATION_STALE_LOCK_MS", DEFAULT_STALE_LOCK_MS);

function getSupabaseConfig() {
  const url = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const key =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL");
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY.",
    );
  }

  return { url, key };
}

function getModelCode(): string {
  return getEnv("GEMINI_MODEL_CODE", DEFAULT_MODEL);
}

function getGeminiApiKey(): string {
  const key =
    getEnv("GOOGLE_AI_API_KEY") ||
    getEnv("GEMINI_API_KEY") ||
    getEnv("VITE_GEMINI_API_KEY") ||
    getEnv("Gemini_explanation_generator");
  if (!key) {
    throw new Error(
      "Missing Gemini key. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY or VITE_GEMINI_API_KEY.",
    );
  }
  return key;
}

async function callGeminiJson(params: {
  prompt: string;
  maxTokens: number;
  temperature?: number;
  useSearch?: boolean;
  modelCode: string;
  apiKey: string;
}): Promise<GeminiResult> {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.modelCode}:generateContent?key=${params.apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
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
      return { ok: false, error: `Gemini request timeout after ${GEMINI_REQUEST_TIMEOUT_MS}ms.` };
    }
    return { ok: false, error: `Gemini request failed: ${error instanceof Error ? error.message : String(error)}` };
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

function buildContextInput(context: QuestionContext) {
  return {
    module: {
      id: context.module.id,
      title_de: context.module.title_de,
      order_index: context.module.order_index,
    },
    lesson: context.lesson
      ? {
          id: context.lesson.id,
          title_de: context.lesson.title_de,
          order_index: context.lesson.order_index,
          content_de: truncate(context.lesson.content_de, 6000),
        }
      : null,
    question: {
      id: context.question.id,
      order_index: context.question.order_index,
      type: context.question.type,
      text_de: context.question.text_de,
      correct_answer: context.question.correct_answer,
      answers: {
        A: context.question.answer_a_de,
        B: context.question.answer_b_de,
        C: context.question.answer_c_de,
        D: context.question.answer_d_de,
        E: context.question.answer_e_de,
        F: context.question.answer_f_de,
      },
    },
  };
}

async function runResearchAgent(context: QuestionContext, geminiApiKey: string, modelCode: string): Promise<GeminiResult> {
  const contextJson = JSON.stringify(buildContextInput(context), null, 2);
  const prompt = `Du bist ein juristischer Research-Agent fuer die IHK-Sachkundepruefung nach §34a GewO.
Nutze den Kontext und liefere NUR valides JSON in diesem Format:
{
  "key_terms": ["..."],
  "legal_basis": ["..."],
  "facts": ["..."],
  "risks_or_uncertainties": ["..."]
}

Kontext:
${contextJson}`;

  return await callGeminiJson({
    prompt,
    maxTokens: 3000,
    temperature: 0.2,
    useSearch: true,
    modelCode,
    apiKey: geminiApiKey,
  });
}

async function runWriterAgent(
  context: QuestionContext,
  research: unknown,
  geminiApiKey: string,
  modelCode: string,
): Promise<GeminiResult> {
  const contextJson = JSON.stringify(buildContextInput(context), null, 2);
  const researchJson = JSON.stringify(research, null, 2);
  const prompt = `Du bist ein Didaktik- und Fachautor fuer den 34a-Trainer.
Erzeuge NUR valides JSON:
{
  "explanation_de": "Markdown",
  "explanation_ar": "Markdown"
}

Regeln:
- Kein HTML, keine Tailwind-Klassen.
- explanation_de MUSS mit genau einer Ueberschrift beginnen: ### Einfache Erklärung
- explanation_ar MUSS mit genau einer Ueberschrift beginnen: ### الشرح المبسط
- Es ist nur eine Hauptueberschrift pro Sprache erlaubt (keine Unterteilung in Tabs/Abschnitte).
- Inhalt muss lang, detailliert, juristisch korrekt und leicht verstaendlich sein.
- Beide Texte muessen jeweils mindestens 1300 Zeichen haben.
- DE Text muss erkennbare Rechtsgrundlagen enthalten (z.B. §, BGB, StGB, StPO, GewO, GG).
- DE Text muss klar erklaeren, warum falsche Antworten falsch sind.
- Arabische Fachbegriffe enthalten den deutschen Begriff in Klammern.
- Inhalt muss zur Frage und den Antworten passen.

Frage-Kontext:
${contextJson}

Research-Kontext:
${researchJson}`;

  return await callGeminiJson({
    prompt,
    maxTokens: 12000,
    temperature: 0.25,
    useSearch: false,
    modelCode,
    apiKey: geminiApiKey,
  });
}

async function runVerifierAgent(
  context: QuestionContext,
  candidate: { explanation_de: string; explanation_ar: string },
  geminiApiKey: string,
  modelCode: string,
): Promise<GeminiResult> {
  const questionJson = JSON.stringify(buildContextInput(context), null, 2);
  const candidateJson = JSON.stringify(candidate, null, 2);
  const prompt = `Du bist ein strenger QA-Verifier fuer juristische Lerninhalte.
Pruefe die Erklaerung gegen Frage/Antworten und gib NUR valides JSON:
{
  "pass": true,
  "issues": [],
  "notes": ["optional"]
}

Setze "pass" nur auf true, wenn alles korrekt ist.

Bewertungsregeln:
- Prioritaet hat die juristische Korrektheit bezogen auf Frage und Antwortoptionen.
- Ein Themen-Mismatch zwischen Lektionstext und Frage wird nur als "notes" gemeldet, nicht als harter Fehler.
- Falls der gespeicherte "correct_answer"-Wert erkennbar nicht zur Fragelogik passt, melde das nur als "notes".
- "pass" bleibt moeglich, wenn der Kandidat fachlich korrekt zur Frage ist.

Frage:
${questionJson}

Kandidat:
${candidateJson}`;

  return await callGeminiJson({
    prompt,
    maxTokens: 2500,
    temperature: 0.2,
    useSearch: false,
    modelCode,
    apiKey: geminiApiKey,
  });
}

async function runRefinerAgent(
  context: QuestionContext,
  candidate: { explanation_de: string; explanation_ar: string },
  issues: string[],
  geminiApiKey: string,
  modelCode: string,
): Promise<GeminiResult> {
  const questionJson = JSON.stringify(buildContextInput(context), null, 2);
  const candidateJson = JSON.stringify(candidate, null, 2);
  const issuesJson = JSON.stringify(issues, null, 2);
  const prompt = `Du bist ein Refiner-Agent. Repariere den Kandidaten strikt nach den Issues.
Gib NUR valides JSON zurueck:
{
  "explanation_de": "Markdown",
  "explanation_ar": "Markdown"
}

Pflicht-Ueberschrift fuer explanation_de (exakt):
### Einfache Erklärung

Pflicht-Ueberschrift fuer explanation_ar (exakt):
### الشرح المبسط

Wichtige Regeln:
- Nur eine Hauptueberschrift pro Sprache.
- Keine weiteren Unterabschnitte mit Markdown-Ueberschriften.
- Juristisch korrekt, detailliert, leicht verstaendlich.
- Beide Texte muessen jeweils mindestens 1300 Zeichen haben.
- Im DE-Text muessen Rechtsgrundlagen vorkommen.
- Im DE-Text muessen falsche Antworten begruendet widerlegt werden.

Frage:
${questionJson}

Aktueller Kandidat:
${candidateJson}

Issues:
${issuesJson}`;

  return await callGeminiJson({
    prompt,
    maxTokens: 12000,
    temperature: 0.2,
    useSearch: false,
    modelCode,
    apiKey: geminiApiKey,
  });
}

async function fetchQuestionContext(
  supabase: ReturnType<typeof createClient>,
  questionId: string,
): Promise<QuestionContext> {
  const { data: question, error: qErr } = await supabase
    .from("questions")
    .select(
      "id,module_id,lesson_id,order_index,type,text_de,correct_answer,explanation_de,explanation_ar,answer_a_de,answer_b_de,answer_c_de,answer_d_de,answer_e_de,answer_f_de",
    )
    .eq("id", questionId)
    .single();
  if (qErr || !question) {
    throw new Error(`Cannot load question ${questionId}: ${qErr?.message || "not found"}`);
  }

  const { data: module, error: mErr } = await supabase
    .from("modules")
    .select("id,order_index,title_de")
    .eq("id", question.module_id)
    .single();
  if (mErr || !module) {
    throw new Error(`Cannot load module for question ${questionId}: ${mErr?.message || "not found"}`);
  }

  let lesson: QuestionContext["lesson"] = null;
  if (question.lesson_id) {
    const { data: lessonData, error: lErr } = await supabase
      .from("lessons")
      .select("id,order_index,title_de,content_de")
      .eq("id", question.lesson_id)
      .single();
    if (!lErr && lessonData) {
      lesson = lessonData;
    }
  }

  return { question, lesson, module };
}

async function finalizeJobWithFailure(
  supabase: ReturnType<typeof createClient>,
  job: JobRow,
  errorMessage: string,
  outputJson: Record<string, unknown> | null = null,
  validationJson: Record<string, unknown> | null = null,
) {
  const nextStatus = nextStatusAfterFailure(job.attempts, MAX_JOB_ATTEMPTS);
  const { error } = await supabase
    .from("question_explanation_jobs")
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

async function heartbeatJob(supabase: ReturnType<typeof createClient>, jobId: string) {
  const { error } = await supabase
    .from("question_explanation_jobs")
    .update({ updated_at: nowIso() })
    .eq("id", jobId);
  if (error) {
    throw new Error(`Cannot heartbeat job ${jobId}: ${error.message}`);
  }
}

async function processSingleJob(
  supabase: ReturnType<typeof createClient>,
  job: JobRow,
  geminiApiKey: string,
  modelCode: string,
): Promise<{ ok: boolean; status: string; message: string }> {
  try {
    const context = await fetchQuestionContext(supabase, job.question_id);
    const contextInput = buildContextInput(context);

    const { error: inputErr } = await supabase
      .from("question_explanation_jobs")
      .update({ input_json: contextInput, updated_at: nowIso() })
      .eq("id", job.id);
    if (inputErr) throw new Error(`Cannot persist job input: ${inputErr.message}`);

    await heartbeatJob(supabase, job.id);
    const researchResult = await runResearchAgent(context, geminiApiKey, modelCode);
    if (!researchResult.ok) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Research failed: ${researchResult.error}`,
        { research_error: researchResult.error, raw: researchResult.rawText || null },
      );
      return { ok: false, status, message: `Research failed (${status})` };
    }

    await heartbeatJob(supabase, job.id);
    const writerResult = await runWriterAgent(context, researchResult.data, geminiApiKey, modelCode);
    if (!writerResult.ok) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Writer failed: ${writerResult.error}`,
        {
          research: researchResult.data,
          writer_error: writerResult.error,
          raw: writerResult.rawText || null,
        },
      );
      return { ok: false, status, message: `Writer failed (${status})` };
    }

    let candidate = normalizeExplanationPayload(writerResult.data);
    if (!candidate) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        "Writer payload invalid.",
        {
          research: researchResult.data,
          writer_raw: writerResult.rawText,
          writer_payload: writerResult.data,
        },
      );
      return { ok: false, status, message: `Writer payload invalid (${status})` };
    }

    let passed = false;
    let validationIssues: string[] = [];
    const verificationHistory: Array<Record<string, unknown>> = [];

    for (let pass = 0; pass <= MAX_REFINEMENT_PASSES; pass++) {
      const localValidation = validateExplanationPayload(candidate);
      await heartbeatJob(supabase, job.id);
      const verifierResult = await runVerifierAgent(context, candidate, geminiApiKey, modelCode);

      let verifierPass = false;
      let verifierIssues: string[] = [];
      if (verifierResult.ok && verifierResult.data && typeof verifierResult.data === "object") {
        const vData = verifierResult.data as Record<string, unknown>;
        verifierPass = vData.pass === true;
        verifierIssues = Array.isArray(vData.issues)
          ? (vData.issues.filter((x) => typeof x === "string") as string[])
          : [];
      } else {
        verifierIssues = [`Verifier failed: ${verifierResult.ok ? "Unknown verifier format." : verifierResult.error}`];
      }

      validationIssues = [...localValidation.issues, ...verifierIssues];
      verificationHistory.push({
        pass_index: pass,
        local_validation: localValidation,
        verifier: verifierResult.ok ? verifierResult.data : { error: verifierResult.error },
        combined_issues: validationIssues,
      });

      passed = localValidation.ok && verifierPass;
      if (passed) break;
      if (pass === MAX_REFINEMENT_PASSES) break;

      await heartbeatJob(supabase, job.id);
      const refineResult = await runRefinerAgent(context, candidate, validationIssues, geminiApiKey, modelCode);
      if (!refineResult.ok) {
        const status = await finalizeJobWithFailure(
          supabase,
          job,
          `Refiner failed: ${refineResult.error}`,
          {
            research: researchResult.data,
            writer_candidate: candidate,
            verification_history: verificationHistory,
            refiner_error: refineResult.error,
            refiner_raw: refineResult.rawText || null,
          },
          { issues: validationIssues },
        );
        return { ok: false, status, message: `Refiner failed (${status})` };
      }

      const refined = normalizeExplanationPayload(refineResult.data);
      if (!refined) {
        const status = await finalizeJobWithFailure(
          supabase,
          job,
          "Refiner payload invalid.",
          {
            research: researchResult.data,
            writer_candidate: candidate,
            verification_history: verificationHistory,
            refiner_payload: refineResult.data,
            refiner_raw: refineResult.rawText || null,
          },
          { issues: validationIssues },
        );
        return { ok: false, status, message: `Refiner payload invalid (${status})` };
      }
      candidate = refined;
    }

    if (!passed) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Validation failed after ${MAX_REFINEMENT_PASSES + 1} verification passes.`,
        {
          research: researchResult.data,
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        { issues: validationIssues },
      );
      return { ok: false, status, message: `Validation failed (${status})` };
    }

    const { error: auditErr } = await supabase.from("question_explanation_audit").insert({
      run_id: job.run_id,
      question_id: context.question.id,
      old_explanation_de: context.question.explanation_de,
      old_explanation_ar: context.question.explanation_ar,
      new_explanation_de: candidate.explanation_de,
      new_explanation_ar: candidate.explanation_ar,
      written_at: nowIso(),
    });
    if (auditErr) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Audit write failed: ${auditErr.message}`,
        {
          research: researchResult.data,
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        { issues: validationIssues },
      );
      return { ok: false, status, message: `Audit write failed (${status})` };
    }

    const { data: updatedQuestionRows, error: qUpdateErr } = await supabase
      .from("questions")
      .update({
        explanation_de: candidate.explanation_de,
        explanation_ar: candidate.explanation_ar,
        explanation_updated: true,
        explanation_updated_at: nowIso(),
        explanation_version: EXPLANATION_VERSION,
        updated_at: nowIso(),
      })
      .eq("id", context.question.id)
      .select("id");
    if (qUpdateErr) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Question update failed: ${qUpdateErr.message}`,
        {
          research: researchResult.data,
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        { issues: validationIssues },
      );
      return { ok: false, status, message: `Question update failed (${status})` };
    }
    if (!updatedQuestionRows || updatedQuestionRows.length === 0) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        "Question update affected 0 rows (likely missing permissions / RLS).",
        {
          research: researchResult.data,
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        { issues: validationIssues },
      );
      return { ok: false, status, message: `Question update affected 0 rows (${status})` };
    }

    const { error: commitErr } = await supabase
      .from("question_explanation_jobs")
      .update({
        status: "committed",
        error_message: null,
        output_json: {
          research: researchResult.data,
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        validation_json: {
          issues: validationIssues,
          verification_passes: verificationHistory.length,
        },
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    if (commitErr) {
      throw new Error(`Cannot commit job ${job.id}: ${commitErr.message}`);
    }

    return { ok: true, status: "committed", message: "Question explanations updated and audited." };
  } catch (error) {
    const status = await finalizeJobWithFailure(
      supabase,
      job,
      `Unhandled processing error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, status, message: `Unhandled processing error (${status})` };
  }
}

async function refreshRunCounters(supabase: ReturnType<typeof createClient>, runId: string) {
  const { data: run, error: runErr } = await supabase
    .from("question_explanation_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !run) throw new Error(`Cannot load run ${runId}: ${runErr?.message || "not found"}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from("question_explanation_jobs")
    .select("status")
    .eq("run_id", runId);
  if (jobsErr) throw new Error(`Cannot load jobs for run ${runId}: ${jobsErr.message}`);

  const counts = { queued: 0, retry: 0, in_progress: 0, committed: 0, failed: 0 };
  for (const row of jobs || []) {
    const s = row.status as keyof typeof counts;
    if (s in counts) counts[s]++;
  }

  const processedCount = counts.committed + counts.failed;
  const successCount = counts.committed;
  const failureCount = counts.failed;
  const remaining = counts.queued + counts.retry + counts.in_progress;

  let nextStatus = run.status as string;
  let finishedAt = run.finished_at as string | null;

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

  const { data: updatedRunRows, error: updateErr } = await supabase
    .from("question_explanation_runs")
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

  if (updateErr || !updatedRunRows?.length) {
    throw new Error(`Cannot update run counters: ${updateErr?.message || "unknown error"}`);
  }

  return {
    run: updatedRunRows[0],
    job_counts: counts,
  };
}

async function recoverStaleInProgressJobs(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<{ recovered: number; movedToRetry: number; movedToFailed: number }> {
  const { data: inProgressJobs, error: loadErr } = await supabase
    .from("question_explanation_jobs")
    .select("id,question_id,attempts,error_message,locked_at,updated_at")
    .eq("run_id", runId)
    .eq("status", "in_progress");
  if (loadErr) {
    throw new Error(`Cannot load in-progress jobs for stale recovery: ${loadErr.message}`);
  }

  const staleBeforeMs = Date.now() - STALE_JOB_LOCK_MS;
  const staleJobs = (inProgressJobs || []).filter((job) => {
    const lockedTs = job.locked_at ? Date.parse(job.locked_at) : NaN;
    const updatedTs = job.updated_at ? Date.parse(job.updated_at) : NaN;
    const latestTs = Math.max(Number.isFinite(lockedTs) ? lockedTs : 0, Number.isFinite(updatedTs) ? updatedTs : 0);
    if (!latestTs) return false;
    return latestTs <= staleBeforeMs;
  });

  let recovered = 0;
  let movedToRetry = 0;
  let movedToFailed = 0;

  for (const job of staleJobs) {
    const nextStatus = nextStatusAfterFailure(job.attempts, MAX_JOB_ATTEMPTS);
    const previousError = (job.error_message || "").trim();
    const recoveryNote = `Auto-recovery: stale in_progress lock after ${Math.floor(STALE_JOB_LOCK_MS / 1000)}s.`;
    const mergedError = previousError ? `${previousError} | ${recoveryNote}` : recoveryNote;

    const { data: updatedRows, error: updateErr } = await supabase
      .from("question_explanation_jobs")
      .update({
        status: nextStatus,
        error_message: mergedError,
        updated_at: nowIso(),
      })
      .eq("id", job.id)
      .eq("status", "in_progress")
      .eq("attempts", job.attempts)
      .select("id");

    if (updateErr) {
      throw new Error(`Cannot recover stale job ${job.id}: ${updateErr.message}`);
    }
    if (!updatedRows?.length) continue;

    recovered++;
    if (nextStatus === "failed") movedToFailed++;
    else movedToRetry++;
  }

  return { recovered, movedToRetry, movedToFailed };
}

async function claimNextJob(supabase: ReturnType<typeof createClient>, runId: string): Promise<JobRow | null> {
  const { data: candidates, error: candErr } = await supabase
    .from("question_explanation_jobs")
    .select("id,run_id,question_id,status,attempts,write_mode,created_at")
    .eq("run_id", runId)
    .in("status", ["queued", "retry"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (candErr) throw new Error(`Cannot fetch next job: ${candErr.message}`);
  if (!candidates?.length) return null;

  const candidate = candidates[0] as JobRow;
  const { data: claimedRows, error: claimErr } = await supabase
    .from("question_explanation_jobs")
    .update({
      status: "in_progress",
      attempts: candidate.attempts + 1,
      worker_id: `local-${process.pid}`,
      locked_at: nowIso(),
      error_message: null,
      updated_at: nowIso(),
    })
    .eq("id", candidate.id)
    .eq("status", candidate.status)
    .select("id,run_id,question_id,status,attempts,write_mode");

  if (claimErr) throw new Error(`Cannot claim job ${candidate.id}: ${claimErr.message}`);
  if (!claimedRows?.length) return null;
  return claimedRows[0] as JobRow;
}

async function enqueuePilot(
  supabase: ReturnType<typeof createClient>,
  moduleOrderIndex: number,
  limit: number,
  overwrite: boolean,
  writeMode: WriteMode,
  modelCode: string,
): Promise<{ run_id: string; selected_question_ids: string[]; module_title_de: string } | null> {
  const { data: module, error: moduleErr } = await supabase
    .from("modules")
    .select("id,order_index,title_de")
    .eq("order_index", moduleOrderIndex)
    .single();
  if (moduleErr || !module) {
    throw new Error(`Cannot load module by order index ${moduleOrderIndex}: ${moduleErr?.message || "not found"}`);
  }

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons")
    .select("id,order_index")
    .eq("module_id", module.id);
  if (lessonsErr) throw new Error(`Cannot load lessons: ${lessonsErr.message}`);

  const lessonOrder = new Map<string, number>();
  for (const lesson of lessons || []) lessonOrder.set(lesson.id, lesson.order_index || 0);

  let questionQuery = supabase
    .from("questions")
    .select("id,lesson_id,order_index,explanation_updated")
    .eq("module_id", module.id);
  if (!overwrite) {
    questionQuery = questionQuery.eq("explanation_updated", false);
  }
  const { data: questions, error: qErr } = await questionQuery;
  if (qErr) throw new Error(`Cannot load questions: ${qErr.message}`);

  const selectedAll = (questions || []).slice().sort((a, b) => {
    const lessonA = a.lesson_id ? lessonOrder.get(a.lesson_id) ?? 999999 : 999999;
    const lessonB = b.lesson_id ? lessonOrder.get(b.lesson_id) ?? 999999 : 999999;
    if (lessonA !== lessonB) return lessonA - lessonB;
    return (a.order_index || 0) - (b.order_index || 0);
  });
  const selected = limit === 0 ? selectedAll : selectedAll.slice(0, limit);

  if (!selected.length) return null;

  const { data: runRows, error: runErr } = await supabase
    .from("question_explanation_runs")
    .insert({
      module_id: module.id,
      module_order_index: module.order_index,
      status: "queued",
      target_count: selected.length,
      model_code: modelCode,
      write_mode: writeMode,
      created_at: nowIso(),
    })
    .select("*");
  if (runErr || !runRows?.length) throw new Error(`Cannot create run: ${runErr?.message || "unknown error"}`);
  const run = runRows[0];

  const jobs = selected.map((q) => ({
    run_id: run.id,
    question_id: q.id,
    status: "queued",
    attempts: 0,
    write_mode: writeMode,
    input_json: {
      module_id: module.id,
      module_order_index: module.order_index,
      lesson_id: q.lesson_id,
      question_order_index: q.order_index,
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
  const { error: jobsErr } = await supabase.from("question_explanation_jobs").insert(jobs);
  if (jobsErr) throw new Error(`Cannot create jobs: ${jobsErr.message}`);

  return {
    run_id: run.id,
    selected_question_ids: selected.map((q) => q.id),
    module_title_de: module.title_de,
  };
}

async function exportRunReview(supabase: ReturnType<typeof createClient>, runId: string) {
  const { data: run, error: runErr } = await supabase
    .from("question_explanation_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !run) throw new Error(`Cannot load run ${runId}: ${runErr?.message || "not found"}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from("question_explanation_jobs")
    .select("question_id,status,attempts,error_message,validation_json,updated_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (jobsErr) throw new Error(`Cannot load jobs: ${jobsErr.message}`);

  const qIds = [...new Set((jobs || []).map((x) => x.question_id))];
  const { data: qRows, error: qErr } = qIds.length
    ? await supabase.from("questions").select("id,text_de").in("id", qIds)
    : { data: [], error: null };
  if (qErr) throw new Error(`Cannot load question texts: ${qErr.message}`);
  const questionMap = new Map((qRows || []).map((q) => [q.id, q.text_de]));

  const { data: audits, error: auditErr } = await supabase
    .from("question_explanation_audit")
    .select("*")
    .eq("run_id", runId)
    .order("written_at", { ascending: true });
  if (auditErr) throw new Error(`Cannot load audits: ${auditErr.message}`);

  return {
    run,
    jobs: (jobs || []).map((j) => ({ ...j, question_text_de: questionMap.get(j.question_id) || "" })),
    items: (audits || []).map((a) => ({
      question_id: a.question_id,
      question_text_de: questionMap.get(a.question_id) || "",
      new_explanation_de: a.new_explanation_de,
      new_explanation_ar: a.new_explanation_ar,
      written_at: a.written_at,
    })),
  };
}

function renderReviewMarkdown(exportResult: Awaited<ReturnType<typeof exportRunReview>>): string {
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
    if (job.error_message) lines.push(`  error: ${job.error_message}`);
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
  if (error) {
    throw new Error(`Cannot load modules: ${error.message}`);
  }

  return (modules || [])
    .map((m) => m.order_index)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
}

async function processRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  args: Args,
  geminiApiKey: string,
  modelCode: string,
) {
  const maxIterations = args.maxIterations > 0 ? args.maxIterations : Number.MAX_SAFE_INTEGER;

  let done = false;
  let iteration = 0;
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
      const status = (snapshot.run as Record<string, unknown>).status as string;
      done = ["completed", "completed_with_errors", "failed"].includes(status);
      console.log(`[${iteration}] no claimable job | run status: ${status}`);
      if (!done) await sleep(args.sleepMs);
      continue;
    }

    const result = await processSingleJob(supabase, claimed, geminiApiKey, modelCode);
    const snapshot = await refreshRunCounters(supabase, runId);
    const run = snapshot.run as Record<string, unknown>;
    const runStatus = String(run.status || "unknown");
    console.log(
      `[${iteration}] job ${claimed.question_id} -> ${result.status} (${result.ok ? "ok" : "fail"}) | run: ${runStatus} (${run.processed_count}/${run.target_count})`,
    );

    done = ["completed", "completed_with_errors", "failed"].includes(runStatus);
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

async function main() {
  const args = parseArgs();
  const modelCode = getModelCode();
  const geminiApiKey = getGeminiApiKey();
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Starting LOCAL explanation pipeline batch runner...");
  console.log(`Mode: local-first (no edge function processing)`);
  console.log(`Model: ${modelCode}`);
  console.log(`Target: ${args.allModules ? "all modules" : `module ${args.moduleOrderIndex}`}`);
  console.log(`Count per module: ${args.limit === 0 ? "all questions" : args.limit}`);
  console.log(`Overwrite existing explanations: ${args.overwrite ? "yes" : "no"}`);
  console.log(`Gemini timeout: ${GEMINI_REQUEST_TIMEOUT_MS}ms`);
  console.log(`Stale lock recovery: ${STALE_JOB_LOCK_MS}ms`);

  let runId = args.runId;
  if (!runId) {
    const moduleOrderIndexes = await resolveModuleOrderIndexes(supabase, args);
    if (moduleOrderIndexes.length === 0) {
      throw new Error("No modules found for batch processing.");
    }

    let createdRuns = 0;
    for (const moduleOrderIndex of moduleOrderIndexes) {
      const created = await enqueuePilot(
        supabase,
        moduleOrderIndex,
        args.limit,
        args.overwrite,
        args.writeMode,
        modelCode,
      );
      if (!created) {
        console.log(`Skipping module ${moduleOrderIndex}: no questions selected.`);
        continue;
      }

      createdRuns++;
      console.log(`Run created: ${created.run_id}`);
      console.log(`Module ${moduleOrderIndex}: ${created.module_title_de}`);
      console.log(`Selected questions: ${created.selected_question_ids.length}`);

      await processRun(supabase, created.run_id, args, geminiApiKey, modelCode);
      const exportResult = await exportRunReview(supabase, created.run_id);
      const outPath = buildReviewPath(moduleOrderIndex);
      fs.writeFileSync(outPath, renderReviewMarkdown(exportResult), "utf8");
      console.log(`Review file written: ${outPath}`);
    }

    if (createdRuns === 0) {
      console.log("No runs were created. Nothing to process.");
    }
    return;
  } else {
    console.log(`Resuming run: ${runId}`);
  }

  await processRun(supabase, runId, args, geminiApiKey, modelCode);
  const exportResult = await exportRunReview(supabase, runId);
  const outPath = buildReviewPath(args.moduleOrderIndex ?? "run");
  fs.writeFileSync(outPath, renderReviewMarkdown(exportResult), "utf8");
  console.log(`Review file written: ${outPath}`);
}

main().catch((error) => {
  console.error("Batch run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
