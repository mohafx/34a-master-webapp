import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  detectExplanationContradictions,
  nextStatusAfterFailure,
  normalizeRegeneratedPayload,
  safeJsonParse,
  validateRegeneratedPayload,
} from "./shared.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workflow-secret",
};

const GEMINI_MODEL_CODE = "gemini-3-flash-preview";
const ADMIN_EMAIL = "m.almajzoub1@gmail.com";
const WORKFLOW_SECRET = Deno.env.get("QUESTION_PIPELINE_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";

const MAX_REFINEMENT_PASSES = 2;
const MAX_JOB_ATTEMPTS = 3;
const PROMPT_VERSION = "written_exam_regen_v1_gemini_3_flash";

type Action = "enqueue_run" | "process_next" | "status" | "export_review_payload" | "approve_run" | "apply_run";
type JobStatus = "queued" | "retry" | "in_progress" | "committed" | "failed";
type WriteMode = "direct";

type CallerKind = "workflow" | "admin";

interface CallerContext {
  ok: boolean;
  kind?: CallerKind;
  email?: string;
  error?: string;
}

interface EnqueueRunRequest {
  action: "enqueue_run";
  questionId: string;
  overwrite?: boolean;
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

interface ApproveRunRequest {
  action: "approve_run";
  runId: string;
  questionId?: string;
}

interface ApplyRunRequest {
  action: "apply_run";
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function truncate(value: string | null | undefined, maxChars: number): string {
  if (!value) return "";
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function adminDb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveCaller(req: Request): Promise<CallerContext> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." };
  }

  const workflowToken = req.headers.get("x-workflow-secret") || "";
  if (WORKFLOW_SECRET && workflowToken && workflowToken === WORKFLOW_SECRET) {
    return { ok: true, kind: "workflow", email: "workflow" };
  }

  if (!SUPABASE_ANON_KEY) {
    return { ok: false, error: "Unauthorized: missing SUPABASE_ANON_KEY for admin JWT verification." };
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) {
    return { ok: false, error: "Unauthorized: missing workflow secret and user auth token." };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) {
    return { ok: false, error: `Unauthorized: invalid user token (${error?.message || "no user"}).` };
  }

  if ((user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { ok: false, error: "Unauthorized: admin email required." };
  }

  return { ok: true, kind: "admin", email: user.email || ADMIN_EMAIL };
}

async function callGeminiJson(params: {
  prompt: string;
  maxTokens: number;
  temperature?: number;
  useSearch?: boolean;
}): Promise<{ ok: true; data: unknown; rawText: string } | { ok: false; error: string; rawText?: string }> {
  if (!GOOGLE_AI_API_KEY) {
    return { ok: false, error: "Missing GOOGLE_AI_API_KEY." };
  }

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

async function runGeneratorAgent(question: SourceQuestion) {
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

  return await callGeminiJson({
    prompt,
    maxTokens: 10000,
    temperature: 0.2,
    useSearch: true,
  });
}

async function runVerifierAgent(question: SourceQuestion, candidate: unknown) {
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

  return await callGeminiJson({
    prompt,
    maxTokens: 3500,
    temperature: 0.1,
    useSearch: true,
  });
}

async function runRefinerAgent(question: SourceQuestion, candidate: unknown, issues: string[]) {
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

  return await callGeminiJson({
    prompt,
    maxTokens: 10000,
    temperature: 0.1,
    useSearch: false,
  });
}

async function fetchSourceQuestion(
  supabase: ReturnType<typeof adminDb>,
  questionId: string,
): Promise<SourceQuestion> {
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
  supabase: ReturnType<typeof adminDb>,
  job: JobRow,
  errorMessage: string,
  outputJson: Record<string, unknown> | null = null,
  validationJson: Record<string, unknown> | null = null,
) {
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

async function refreshRunCounters(supabase: ReturnType<typeof adminDb>, runId: string) {
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
    if (status in counts) counts[status]++;
  }

  const processedCount = counts.committed + counts.failed;
  const successCount = counts.committed;
  const failureCount = counts.failed;
  const remaining = counts.queued + counts.retry + counts.in_progress;

  let nextStatus = run.status as string;
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

async function claimNextJob(supabase: ReturnType<typeof adminDb>, runId: string): Promise<JobRow | null> {
  const { data: candidates, error: candErr } = await supabase
    .from("written_exam_regen_jobs")
    .select("id,run_id,question_id,status,attempts,write_mode,created_at")
    .eq("run_id", runId)
    .in("status", ["queued", "retry"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (candErr) throw new Error(`Cannot fetch next job: ${candErr.message}`);
  if (!candidates?.length) return null;

  const candidate = candidates[0] as JobRow;
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
  if (!claimedRows?.length) return null;

  return claimedRows[0] as JobRow;
}

async function processSingleJob(
  supabase: ReturnType<typeof adminDb>,
  job: JobRow,
): Promise<{ ok: boolean; status: string; message: string }> {
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

    for (let pass = 0; pass <= MAX_REFINEMENT_PASSES; pass++) {
      const generation = pass === 0
        ? await runGeneratorAgent(sourceQuestion)
        : await runRefinerAgent(sourceQuestion, candidate, validationIssues);

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

      const contradictionIssues = normalized ? detectExplanationContradictions(normalized) : ["Konnte Kandidaten fuer Widerspruchspruefung nicht normalisieren."];
      const verifier = await runVerifierAgent(sourceQuestion, normalized || candidate);

      let verifierPass = false;
      let verifierIssues: string[] = [];
      let verifierPayload: Record<string, unknown> = {};

      if (verifier.ok && verifier.data && typeof verifier.data === "object") {
        verifierPayload = verifier.data as Record<string, unknown>;
        verifierPass = verifierPayload.pass === true;
        verifierIssues = Array.isArray(verifierPayload.issues)
          ? (verifierPayload.issues.filter((x) => typeof x === "string") as string[])
          : [];
      } else {
        verifierIssues = [`Verifier failed: ${verifier.ok ? "invalid format" : verifier.error}`];
      }

      validationIssues = [
        ...localValidation.issues,
        ...contradictionIssues,
        ...verifierIssues,
      ];

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
      .upsert({
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
      }, { onConflict: "run_id,question_id" });

    if (candidateErr) {
      const status = await finalizeJobWithFailure(
        supabase,
        job,
        `Candidate upsert failed: ${candidateErr.message}`,
      );
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

    if (commitErr) {
      throw new Error(`Cannot commit job ${job.id}: ${commitErr.message}`);
    }

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

async function enqueueRun(
  supabase: ReturnType<typeof adminDb>,
  payload: EnqueueRunRequest,
  caller: CallerContext,
) {
  if (!payload.questionId) {
    throw new Error("questionId is required.");
  }

  const overwrite = payload.overwrite !== false;
  const sourceQuestion = await fetchSourceQuestion(supabase, payload.questionId);

  if (!overwrite) {
    const { data: existing, error: existingErr } = await supabase
      .from("written_exam_regen_candidates")
      .select("id")
      .eq("question_id", sourceQuestion.id)
      .limit(1);

    if (existingErr) throw new Error(`Cannot check existing candidate: ${existingErr.message}`);
    if ((existing || []).length > 0) {
      throw new Error("Candidate exists already. Use overwrite=true or choose another question.");
    }
  }

  const { data: runRows, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .insert({
      status: "queued",
      target_count: 1,
      model_code: GEMINI_MODEL_CODE,
      prompt_version: PROMPT_VERSION,
      write_mode: "direct",
      created_by: caller.email || "unknown",
      created_at: nowIso(),
    })
    .select("*");

  if (runErr || !runRows?.length) {
    throw new Error(`Cannot create run: ${runErr?.message || "unknown"}`);
  }

  const run = runRows[0];

  const { error: jobErr } = await supabase
    .from("written_exam_regen_jobs")
    .insert({
      run_id: run.id,
      question_id: sourceQuestion.id,
      status: "queued",
      attempts: 0,
      write_mode: "direct",
      input_json: {
        source_topic: sourceQuestion.topic,
        source_target_structure: sourceQuestion.target_structure,
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    });

  if (jobErr) {
    throw new Error(`Cannot create regeneration job: ${jobErr.message}`);
  }

  return {
    run_id: run.id,
    question_id: sourceQuestion.id,
    model_code: GEMINI_MODEL_CODE,
    prompt_version: PROMPT_VERSION,
    overwrite,
  };
}

async function processNext(supabase: ReturnType<typeof adminDb>, payload: ProcessNextRequest) {
  const { data: run, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .select("*")
    .eq("id", payload.runId)
    .single();

  if (runErr || !run) {
    throw new Error(`Run ${payload.runId} not found: ${runErr?.message || "unknown"}`);
  }

  if (["completed", "completed_with_errors", "failed", "approved", "applied"].includes(run.status)) {
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

  const claimed = await claimNextJob(supabase, payload.runId);
  if (!claimed) {
    const snapshot = await refreshRunCounters(supabase, payload.runId);
    const terminal = ["completed", "completed_with_errors", "failed", "approved", "applied"].includes(snapshot.run.status);
    return {
      done: terminal,
      message: "No claimable job found.",
      ...snapshot,
    };
  }

  const result = await processSingleJob(supabase, claimed);
  const snapshot = await refreshRunCounters(supabase, payload.runId);
  const terminal = ["completed", "completed_with_errors", "failed", "approved", "applied"].includes(snapshot.run.status);

  return {
    done: terminal,
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

async function runStatus(supabase: ReturnType<typeof adminDb>, payload: StatusRequest) {
  return await refreshRunCounters(supabase, payload.runId);
}

async function exportReviewPayload(
  supabase: ReturnType<typeof adminDb>,
  payload: ExportReviewPayloadRequest,
) {
  const { data: run, error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .select("*")
    .eq("id", payload.runId)
    .single();

  if (runErr || !run) {
    throw new Error(`Run ${payload.runId} not found: ${runErr?.message || "unknown"}`);
  }

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

  const questionIds = [...new Set([...(jobs || []).map((j) => j.question_id), ...(candidates || []).map((c) => c.question_id)])];

  const { data: sourceQuestions, error: sourceErr } = questionIds.length
    ? await supabase
      .from("written_exam_questions")
      .select("id,topic,question_text_de,correct_answer,target_structure")
      .in("id", questionIds)
    : { data: [], error: null };

  if (sourceErr) throw new Error(`Cannot load source questions: ${sourceErr.message}`);

  const sourceMap = new Map((sourceQuestions || []).map((q) => [q.id, q]));

  return {
    run,
    jobs: (jobs || []).map((j) => ({
      ...j,
      source_question: sourceMap.get(j.question_id) || null,
    })),
    candidates: (candidates || []).map((c) => ({
      ...c,
      source_question: sourceMap.get(c.question_id) || null,
    })),
  };
}

async function approveRun(
  supabase: ReturnType<typeof adminDb>,
  payload: ApproveRunRequest,
  caller: CallerContext,
) {
  const { data: rows, error } = await supabase
    .from("written_exam_regen_candidates")
    .select("id,question_id,status,approved")
    .eq("run_id", payload.runId)
    .match(payload.questionId ? { question_id: payload.questionId } : {});

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
      approved_by: caller.email || "admin",
      updated_at: nowIso(),
    })
    .in("id", targetIds);

  if (updateErr) throw new Error(`Cannot approve candidate(s): ${updateErr.message}`);

  const { error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .update({
      status: "approved",
      approved_at: nowIso(),
      approved_by: caller.email || "admin",
    })
    .eq("id", payload.runId);

  if (runErr) throw new Error(`Cannot set run approved: ${runErr.message}`);

  return {
    run_id: payload.runId,
    approved_count: targetIds.length,
    question_id: payload.questionId || null,
  };
}

async function applyRun(
  supabase: ReturnType<typeof adminDb>,
  payload: ApplyRunRequest,
  caller: CallerContext,
) {
  const { data: candidates, error } = await supabase
    .from("written_exam_regen_candidates")
    .select("id,question_id,status,candidate_json,approved")
    .eq("run_id", payload.runId)
    .match(payload.questionId ? { question_id: payload.questionId } : {})
    .eq("approved", true)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Cannot load approved candidates: ${error.message}`);
  if (!candidates?.length) throw new Error("No approved candidate found to apply.");

  let appliedCount = 0;

  for (const candidate of candidates) {
    const validated = validateRegeneratedPayload(candidate.candidate_json);
    if (!validated.ok || !validated.normalized) {
      throw new Error(
        `Candidate ${candidate.question_id} failed validation before apply: ${validated.issues.join(" | ")}`,
      );
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
      regeneration_version: PROMPT_VERSION,
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
        applied_by: caller.email || "admin",
      });

    if (auditErr) {
      throw new Error(`Cannot write audit for question ${candidate.question_id}: ${auditErr.message}`);
    }

    const { error: candUpdateErr } = await supabase
      .from("written_exam_regen_candidates")
      .update({
        status: "applied",
        applied_at: nowIso(),
        applied_by: caller.email || "admin",
        updated_at: nowIso(),
      })
      .eq("id", candidate.id);

    if (candUpdateErr) {
      throw new Error(`Cannot update candidate status for ${candidate.question_id}: ${candUpdateErr.message}`);
    }

    appliedCount++;
  }

  const { error: runErr } = await supabase
    .from("written_exam_regen_runs")
    .update({
      status: "applied",
      applied_at: nowIso(),
      applied_by: caller.email || "admin",
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const caller = await resolveCaller(req);
  if (!caller.ok) {
    return jsonResponse({ ok: false, error: caller.error || "Unauthorized" }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, 500);
  }

  try {
    const body = await req.json();
    const action = body?.action as Action | undefined;
    if (!action) throw new Error("Missing action.");

    const supabase = adminDb();
    let result: unknown;

    if (action === "enqueue_run") {
      result = await enqueueRun(supabase, body as EnqueueRunRequest, caller);
    } else if (action === "process_next") {
      result = await processNext(supabase, body as ProcessNextRequest);
    } else if (action === "status") {
      result = await runStatus(supabase, body as StatusRequest);
    } else if (action === "export_review_payload") {
      result = await exportReviewPayload(supabase, body as ExportReviewPayloadRequest);
    } else if (action === "approve_run") {
      result = await approveRun(supabase, body as ApproveRunRequest, caller);
    } else if (action === "apply_run") {
      result = await applyRun(supabase, body as ApplyRunRequest, caller);
    } else {
      throw new Error(`Unknown action: ${String(action)}`);
    }

    return jsonResponse({
      ok: true,
      action,
      model_code: GEMINI_MODEL_CODE,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("written-exam-regeneration-pipeline error:", message);
    return jsonResponse({ ok: false, error: message }, 400);
  }
});
