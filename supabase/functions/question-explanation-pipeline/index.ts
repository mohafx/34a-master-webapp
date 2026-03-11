import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  nextStatusAfterFailure,
  normalizeExplanationPayload,
  safeJsonParse,
  validateExplanationPayload,
} from "./shared.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workflow-secret",
};

const GEMINI_MODEL_CODE = Deno.env.get("GEMINI_MODEL_CODE") || "gemini-3.1-pro-preview";
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";
const WORKFLOW_SECRET = Deno.env.get("QUESTION_PIPELINE_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const MAX_REFINEMENT_PASSES = 2;
const MAX_JOB_ATTEMPTS = 3; // initial try + 2 retries
const EXPLANATION_VERSION = "v3_single_section_gemini_3_1_pro";

type Action = "enqueue_pilot" | "process_next" | "status" | "export_review_payload";
type WriteMode = "direct";

interface EnqueuePilotRequest {
  action: "enqueue_pilot";
  moduleOrderIndex: number;
  limit: number;
  onlyUnupdated: boolean;
  writeMode: WriteMode;
}

interface ProcessNextRequest {
  action: "process_next";
  runId: string;
}

interface StatusRequest {
  action: "status";
  runId: string;
}

interface ExportReviewPayloadRequest {
  action: "export_review_payload";
  runId: string;
}

interface JobRow {
  id: string;
  run_id: string;
  question_id: string;
  status: "queued" | "retry" | "in_progress" | "committed" | "failed";
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function requireEnv(): string | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.";
  }
  if (!GOOGLE_AI_API_KEY) {
    return "Missing GOOGLE_AI_API_KEY.";
  }
  if (!WORKFLOW_SECRET) {
    return "Missing QUESTION_PIPELINE_SECRET.";
  }
  return null;
}

function verifySecret(req: Request): boolean {
  const token = req.headers.get("x-workflow-secret");
  return !!token && token === WORKFLOW_SECRET;
}

function truncate(value: string | null | undefined, maxChars: number): string {
  if (!value) return "";
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callGeminiJson(params: {
  prompt: string;
  maxTokens: number;
  temperature?: number;
  useSearch?: boolean;
}): Promise<{ ok: true; data: unknown; rawText: string } | { ok: false; error: string; rawText?: string }> {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_CODE}:generateContent?key=${GOOGLE_AI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: `Gemini API error ${response.status}: ${truncate(errorText, 400)}` };
  }

  const payload = await response.json();
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof rawText !== "string" || rawText.trim() === "") {
    const reason = payload?.candidates?.[0]?.finishReason || "UNKNOWN";
    return { ok: false, error: `Gemini returned empty text (${reason}).` };
  }

  const parsed = safeJsonParse(rawText);
  if (!parsed) {
    return {
      ok: false,
      error: "Gemini returned non-JSON output.",
      rawText,
    };
  }

  return { ok: true, data: parsed, rawText };
}

async function fetchQuestionContext(
  supabase: ReturnType<typeof adminClient>,
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

async function runResearchAgent(context: QuestionContext) {
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
  });
}

async function runWriterAgent(context: QuestionContext, research: unknown) {
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
  });
}

async function runVerifierAgent(context: QuestionContext, candidate: { explanation_de: string; explanation_ar: string }) {
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

Frage:
${questionJson}

Kandidat:
${candidateJson}`;

  return await callGeminiJson({
    prompt,
    maxTokens: 2500,
    temperature: 0.2,
    useSearch: false,
  });
}

async function runRefinerAgent(
  context: QuestionContext,
  candidate: { explanation_de: string; explanation_ar: string },
  issues: string[],
) {
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
  });
}

async function finalizeJobWithFailure(
  supabase: ReturnType<typeof adminClient>,
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

async function processSingleJob(
  supabase: ReturnType<typeof adminClient>,
  job: JobRow,
): Promise<{ ok: boolean; status: string; message: string }> {
  try {
    const context = await fetchQuestionContext(supabase, job.question_id);
    const contextInput = buildContextInput(context);

    const { error: inputErr } = await supabase
      .from("question_explanation_jobs")
      .update({
        input_json: contextInput,
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    if (inputErr) {
      throw new Error(`Cannot persist job input: ${inputErr.message}`);
    }

    const researchResult = await runResearchAgent(context);
    if (!researchResult.ok) {
      const researchError = researchResult.error;
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Research failed: ${researchError}`,
        { research_error: researchError, raw: researchResult.rawText || null },
      );
      return { ok: false, status, message: `Research failed (${status})` };
    }

    const writerResult = await runWriterAgent(context, researchResult.data);
    if (!writerResult.ok) {
      const writerError = writerResult.error;
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Writer failed: ${writerError}`,
        {
          research: researchResult.data,
          writer_error: writerError,
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

    const verificationHistory: Array<Record<string, unknown>> = [];
    let validationIssues: string[] = [];
    let passed = false;

    for (let pass = 0; pass <= MAX_REFINEMENT_PASSES; pass++) {
      const localValidation = validateExplanationPayload(candidate);
      const verifierResult = await runVerifierAgent(context, candidate);

      let verifierPass = false;
      let verifierIssues: string[] = [];
      if (verifierResult.ok && verifierResult.data && typeof verifierResult.data === "object") {
        const vData = verifierResult.data as Record<string, unknown>;
        verifierPass = vData.pass === true;
        verifierIssues = Array.isArray(vData.issues)
          ? vData.issues.filter((x) => typeof x === "string") as string[]
          : [];
      } else {
        const verifierError = verifierResult.ok ? "Unknown verifier format." : verifierResult.error;
        verifierIssues = [`Verifier failed: ${verifierError}`];
      }
      const verifierSnapshot = verifierResult.ok ? verifierResult.data : { error: verifierResult.error };

      validationIssues = [...localValidation.issues, ...verifierIssues];
      verificationHistory.push({
        pass_index: pass,
        local_validation: localValidation,
        verifier: verifierSnapshot,
        combined_issues: validationIssues,
      });

      passed = localValidation.ok && verifierPass;
      if (passed) break;

      if (pass === MAX_REFINEMENT_PASSES) break;

      const refineResult = await runRefinerAgent(context, candidate, validationIssues);
      if (!refineResult.ok) {
        const refinerError = refineResult.error;
        const status = await finalizeJobWithFailure(
          supabase,
          job,
          `Refiner failed: ${refinerError}`,
          {
            research: researchResult.data,
            writer_candidate: candidate,
            verification_history: verificationHistory,
            refiner_error: refinerError,
            refiner_raw: refineResult.rawText || null,
          },
          { issues: validationIssues },
        );
        return { ok: false, status, message: `Refiner failed (${status})` };
      }

      const refinedCandidate = normalizeExplanationPayload(refineResult.data);
      if (!refinedCandidate) {
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
      candidate = refinedCandidate;
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

    const { error: jobCommitErr } = await supabase
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

    if (jobCommitErr) {
      throw new Error(`Cannot commit job ${job.id}: ${jobCommitErr.message}`);
    }

    return { ok: true, status: "committed", message: "Question explanations updated and audited." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = await finalizeJobWithFailure(supabase, job, `Unhandled processing error: ${message}`);
    return { ok: false, status, message: `Unhandled processing error (${status})` };
  }
}

async function refreshRunCounters(
  supabase: ReturnType<typeof adminClient>,
  runId: string,
): Promise<Record<string, unknown>> {
  const { data: run, error: runErr } = await supabase
    .from("question_explanation_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !run) {
    throw new Error(`Cannot load run ${runId}: ${runErr?.message || "not found"}`);
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("question_explanation_jobs")
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
  const remaining = counts.queued + counts.retry + counts.in_progress;

  let nextRunStatus = run.status as string;
  let finishedAt = run.finished_at as string | null;
  if (remaining === 0) {
    finishedAt = nowIso();
    if (failureCount === run.target_count) {
      nextRunStatus = "failed";
    } else if (failureCount > 0) {
      nextRunStatus = "completed_with_errors";
    } else {
      nextRunStatus = "completed";
    }
  } else if (processedCount > 0 || counts.in_progress > 0) {
    nextRunStatus = "in_progress";
  } else {
    nextRunStatus = "queued";
  }

  const { data: updatedRunRows, error: updateErr } = await supabase
    .from("question_explanation_runs")
    .update({
      status: nextRunStatus,
      processed_count: processedCount,
      success_count: successCount,
      failure_count: failureCount,
      started_at: run.started_at || nowIso(),
      finished_at: finishedAt,
    })
    .eq("id", runId)
    .select("*");
  if (updateErr || !updatedRunRows || updatedRunRows.length === 0) {
    throw new Error(`Cannot update run counters: ${updateErr?.message || "unknown error"}`);
  }

  return {
    run: updatedRunRows[0],
    job_counts: counts,
  };
}

async function enqueuePilot(
  supabase: ReturnType<typeof adminClient>,
  payload: EnqueuePilotRequest,
) {
  if (payload.writeMode !== "direct") {
    throw new Error("Only writeMode='direct' is supported in this pipeline.");
  }
  if (payload.limit < 0 || payload.limit > 5000) {
    throw new Error("limit must be between 0 and 5000.");
  }

  const { data: module, error: moduleErr } = await supabase
    .from("modules")
    .select("id,order_index,title_de")
    .eq("order_index", payload.moduleOrderIndex)
    .single();
  if (moduleErr || !module) {
    throw new Error(`Cannot load module by order_index=${payload.moduleOrderIndex}: ${moduleErr?.message || "not found"}`);
  }

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons")
    .select("id,order_index")
    .eq("module_id", module.id)
    .order("order_index", { ascending: true });
  if (lessonsErr) {
    throw new Error(`Cannot load lessons for module ${module.id}: ${lessonsErr.message}`);
  }

  const lessonOrder = new Map<string, number>();
  for (const lesson of lessons || []) {
    lessonOrder.set(lesson.id, lesson.order_index || 0);
  }

  let query = supabase
    .from("questions")
    .select("id,lesson_id,order_index,explanation_updated")
    .eq("module_id", module.id);
  if (payload.onlyUnupdated) {
    query = query.eq("explanation_updated", false);
  }

  const { data: questions, error: qErr } = await query;
  if (qErr) {
    throw new Error(`Cannot load questions for module ${module.id}: ${qErr.message}`);
  }

  const sortedAll = (questions || []).slice().sort((a, b) => {
    const lessonA = a.lesson_id ? lessonOrder.get(a.lesson_id) ?? 999999 : 999999;
    const lessonB = b.lesson_id ? lessonOrder.get(b.lesson_id) ?? 999999 : 999999;
    if (lessonA !== lessonB) return lessonA - lessonB;
    return (a.order_index || 0) - (b.order_index || 0);
  });
  const sorted = payload.limit === 0 ? sortedAll : sortedAll.slice(0, payload.limit);

  if (sorted.length === 0) {
    throw new Error("No questions selected for this batch run.");
  }

  const { data: runRows, error: runErr } = await supabase
    .from("question_explanation_runs")
    .insert({
      module_id: module.id,
      module_order_index: module.order_index,
      status: "queued",
      target_count: sorted.length,
      model_code: GEMINI_MODEL_CODE,
      write_mode: payload.writeMode,
      created_at: nowIso(),
    })
    .select("*");
  if (runErr || !runRows || runRows.length === 0) {
    throw new Error(`Cannot create run: ${runErr?.message || "unknown error"}`);
  }
  const run = runRows[0];

  const jobRows = sorted.map((item) => ({
    run_id: run.id,
    question_id: item.id,
    status: "queued",
    attempts: 0,
    write_mode: payload.writeMode,
    input_json: {
      module_id: module.id,
      module_order_index: module.order_index,
      lesson_id: item.lesson_id,
      question_order_index: item.order_index,
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
  const { error: jobsErr } = await supabase.from("question_explanation_jobs").insert(jobRows);
  if (jobsErr) {
    throw new Error(`Cannot create jobs for run ${run.id}: ${jobsErr.message}`);
  }

  return {
    run_id: run.id,
    module: { id: module.id, order_index: module.order_index, title_de: module.title_de },
    selected_question_ids: sorted.map((q) => q.id),
    selected_count: sorted.length,
    model_code: GEMINI_MODEL_CODE,
  };
}

async function claimNextJob(
  supabase: ReturnType<typeof adminClient>,
  runId: string,
): Promise<JobRow | null> {
  const { data: candidates, error: candErr } = await supabase
    .from("question_explanation_jobs")
    .select("id,run_id,question_id,status,attempts,write_mode,created_at")
    .eq("run_id", runId)
    .in("status", ["queued", "retry"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (candErr) {
    throw new Error(`Cannot fetch next job: ${candErr.message}`);
  }
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const candidate = candidates[0] as JobRow;
  const { data: claimedRows, error: claimErr } = await supabase
    .from("question_explanation_jobs")
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
  if (claimErr) {
    throw new Error(`Cannot claim job ${candidate.id}: ${claimErr.message}`);
  }
  if (!claimedRows || claimedRows.length === 0) {
    return null;
  }
  return claimedRows[0] as JobRow;
}

async function processNext(
  supabase: ReturnType<typeof adminClient>,
  payload: ProcessNextRequest,
) {
  const { data: run, error: runErr } = await supabase
    .from("question_explanation_runs")
    .select("*")
    .eq("id", payload.runId)
    .single();
  if (runErr || !run) {
    throw new Error(`Run ${payload.runId} not found: ${runErr?.message || "unknown error"}`);
  }

  if (["completed", "failed", "completed_with_errors"].includes(run.status)) {
    const statusSnapshot = await refreshRunCounters(supabase, payload.runId);
    return {
      done: true,
      message: `Run ${payload.runId} is already terminal (${run.status}).`,
      ...statusSnapshot,
    };
  }

  if (!run.started_at) {
    await supabase
      .from("question_explanation_runs")
      .update({ started_at: nowIso(), status: "in_progress" })
      .eq("id", payload.runId);
  }

  const claimed = await claimNextJob(supabase, payload.runId);
  if (!claimed) {
    const statusSnapshot = await refreshRunCounters(supabase, payload.runId);
    const terminal = ["completed", "failed", "completed_with_errors"].includes(
      (statusSnapshot.run as Record<string, unknown>).status as string,
    );
    return {
      done: terminal,
      message: "No claimable job found.",
      ...statusSnapshot,
    };
  }

  const result = await processSingleJob(supabase, claimed);
  const statusSnapshot = await refreshRunCounters(supabase, payload.runId);
  const terminal = ["completed", "failed", "completed_with_errors"].includes(
    (statusSnapshot.run as Record<string, unknown>).status as string,
  );

  return {
    done: terminal,
    processed_job: {
      id: claimed.id,
      question_id: claimed.question_id,
      status: result.status,
      ok: result.ok,
      message: result.message,
    },
    ...statusSnapshot,
  };
}

async function runStatus(
  supabase: ReturnType<typeof adminClient>,
  payload: StatusRequest,
) {
  return await refreshRunCounters(supabase, payload.runId);
}

async function exportReviewPayload(
  supabase: ReturnType<typeof adminClient>,
  payload: ExportReviewPayloadRequest,
) {
  const { data: run, error: runErr } = await supabase
    .from("question_explanation_runs")
    .select("*")
    .eq("id", payload.runId)
    .single();
  if (runErr || !run) {
    throw new Error(`Run ${payload.runId} not found: ${runErr?.message || "unknown error"}`);
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("question_explanation_jobs")
    .select("question_id,status,attempts,error_message,validation_json,updated_at")
    .eq("run_id", payload.runId)
    .order("created_at", { ascending: true });
  if (jobsErr) {
    throw new Error(`Cannot load jobs for run ${payload.runId}: ${jobsErr.message}`);
  }

  const questionIds = [...new Set((jobs || []).map((j) => j.question_id))];
  let questions: Array<{ id: string; text_de: string }> = [];
  if (questionIds.length > 0) {
    const { data: qRows, error: qErr } = await supabase
      .from("questions")
      .select("id,text_de")
      .in("id", questionIds);
    if (qErr) {
      throw new Error(`Cannot load question text for review export: ${qErr.message}`);
    }
    questions = qRows || [];
  }
  const questionMap = new Map(questions.map((q) => [q.id, q.text_de]));

  const { data: audits, error: auditErr } = await supabase
    .from("question_explanation_audit")
    .select("*")
    .eq("run_id", payload.runId)
    .order("written_at", { ascending: true });
  if (auditErr) {
    throw new Error(`Cannot load audit rows for run ${payload.runId}: ${auditErr.message}`);
  }

  const items = (audits || []).map((a) => ({
    question_id: a.question_id,
    question_text_de: questionMap.get(a.question_id) || "",
    new_explanation_de: a.new_explanation_de,
    new_explanation_ar: a.new_explanation_ar,
    written_at: a.written_at,
  }));

  return {
    run,
    jobs: (jobs || []).map((j) => ({
      ...j,
      question_text_de: questionMap.get(j.question_id) || "",
    })),
    items,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const envError = requireEnv();
  if (envError) {
    return jsonResponse({ error: envError }, 500);
  }

  if (!verifySecret(req)) {
    return jsonResponse({ error: "Unauthorized: missing or invalid x-workflow-secret." }, 401);
  }

  try {
    const body = (await req.json()) as
      | EnqueuePilotRequest
      | ProcessNextRequest
      | StatusRequest
      | ExportReviewPayloadRequest;
    const action = body.action as Action;
    if (!action) {
      throw new Error("Missing action.");
    }

    const supabase = adminClient();
    let result: unknown;

    if (action === "enqueue_pilot") {
      result = await enqueuePilot(supabase, body as EnqueuePilotRequest);
    } else if (action === "process_next") {
      result = await processNext(supabase, body as ProcessNextRequest);
    } else if (action === "status") {
      result = await runStatus(supabase, body as StatusRequest);
    } else if (action === "export_review_payload") {
      result = await exportReviewPayload(supabase, body as ExportReviewPayloadRequest);
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return jsonResponse({
      ok: true,
      action,
      model_code: GEMINI_MODEL_CODE,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 400);
  }
});
