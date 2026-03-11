import fs from "fs";
import path from "path";
import crypto from "crypto";

console.log("fix-missing-written-regeneration booting...");

const MODEL_CODE = "gemini-3-flash-preview";
const PROMPT_VERSION = "written_exam_regen_v1_gemini_3_flash";
const MAX_REFINEMENT_PASSES = 2;
const FETCH_TIMEOUT_MS = 60_000;
const VALID_LETTERS = ["A", "B", "C", "D", "E", "F"];
const VALID_DIFFICULTY = new Set(["EASY", "MEDIUM", "HARD"]);

const DEFAULT_MISSING_IDS = [
  "54f066ec-f802-43cc-851e-c518946d768a",
  "5749cc14-c08c-45a1-90c0-5a9242618c39",
  "a0cbecd2-2793-41d8-93bf-8f22d9af293d",
];

function nowIso() {
  return new Date().toISOString();
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadEnv() {
  const root = process.cwd();
  loadDotEnvFile(path.join(root, ".env.local"));
  loadDotEnvFile(path.join(root, ".env"));
}

function requiredEnv(name, fallbackNames = []) {
  for (const key of [name, ...fallbackNames]) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`Missing required env var: ${name}${fallbackNames.length ? ` (or ${fallbackNames.join(", ")})` : ""}`);
}

function normalizeCorrectAnswer(value) {
  const letters = String(value || "")
    .toUpperCase()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => VALID_LETTERS.includes(x));

  const uniq = [];
  for (const letter of letters) {
    if (!uniq.includes(letter)) uniq.push(letter);
  }
  return uniq.sort().join(",");
}

function parseCorrectAnswerLetters(correctAnswer) {
  return normalizeCorrectAnswer(correctAnswer)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .sort();
}

function getAnswerLetters(payload) {
  return Object.keys(payload.answers || {})
    .map((x) => x.toUpperCase())
    .filter((x) => VALID_LETTERS.includes(x))
    .sort();
}

function computeTargetStructure(payload) {
  return `${getAnswerLetters(payload).length}_opts|${parseCorrectAnswerLetters(payload.correct_answer).length}_correct`;
}

function normalizeCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const question_text_de = typeof value.question_text_de === "string" ? value.question_text_de.trim() : "";
  const question_text_ar = typeof value.question_text_ar === "string" ? value.question_text_ar.trim() : "";
  const explanation_de = typeof value.explanation_de === "string" ? value.explanation_de.trim() : "";
  const explanation_ar = typeof value.explanation_ar === "string" ? value.explanation_ar.trim() : "";
  const correct_answer = normalizeCorrectAnswer(typeof value.correct_answer === "string" ? value.correct_answer : "");
  const target_structure = typeof value.target_structure === "string" ? value.target_structure.trim() : undefined;
  const difficulty_level_raw = typeof value.difficulty_level === "string" ? value.difficulty_level.trim().toUpperCase() : "";
  const difficulty_level = VALID_DIFFICULTY.has(difficulty_level_raw) ? difficulty_level_raw : "MEDIUM";

  if (!question_text_de || !question_text_ar || !explanation_de || !explanation_ar || !correct_answer) {
    return null;
  }

  const answers = {};
  if (!value.answers || typeof value.answers !== "object" || Array.isArray(value.answers)) return null;

  for (const [letterRaw, optionValue] of Object.entries(value.answers)) {
    const letter = letterRaw.toUpperCase();
    if (!VALID_LETTERS.includes(letter)) continue;
    if (!optionValue || typeof optionValue !== "object" || Array.isArray(optionValue)) continue;

    const text_de = typeof optionValue.text_de === "string" ? optionValue.text_de.trim() : "";
    const text_ar = typeof optionValue.text_ar === "string" ? optionValue.text_ar.trim() : "";
    answers[letter] = { text_de, text_ar };
  }

  return {
    question_text_de,
    question_text_ar,
    answers,
    correct_answer,
    explanation_de,
    explanation_ar,
    difficulty_level,
    target_structure,
  };
}

function validateCandidate(value) {
  const normalized = normalizeCandidate(value);
  if (!normalized) return { ok: false, issues: ["Payload is not a valid candidate object."] };

  const issues = [];
  const answerLetters = getAnswerLetters(normalized);
  const correctLetters = parseCorrectAnswerLetters(normalized.correct_answer);

  if (normalized.question_text_de.length < 20) issues.push("question_text_de too short");
  if (normalized.question_text_ar.length < 20) issues.push("question_text_ar too short");
  if (normalized.explanation_de.length < 160) issues.push("explanation_de too short");
  if (normalized.explanation_ar.length < 160) issues.push("explanation_ar too short");
  if (!VALID_DIFFICULTY.has(normalized.difficulty_level)) issues.push("difficulty_level invalid");

  if (!(answerLetters.length === 5 || answerLetters.length === 6)) {
    issues.push("must have exactly 5 or 6 answer options");
  }

  const expectedLetters = answerLetters.length === 6 ? ["A", "B", "C", "D", "E", "F"] : ["A", "B", "C", "D", "E"];
  if (answerLetters.join(",") !== expectedLetters.join(",")) {
    issues.push("answers must be contiguous from A");
  }

  for (const letter of answerLetters) {
    const option = normalized.answers[letter];
    if (!option || !option.text_de || !option.text_ar) {
      issues.push(`answer ${letter} must have text_de/text_ar`);
    }
  }

  if (!(correctLetters.length === 1 || correctLetters.length === 2)) {
    issues.push("correct_answer must contain exactly 1 or 2 answers");
  }

  for (const letter of correctLetters) {
    if (!answerLetters.includes(letter)) issues.push(`correct_answer references missing option ${letter}`);
  }

  const computed = computeTargetStructure(normalized);
  if (normalized.target_structure && normalized.target_structure !== computed) {
    issues.push(`target_structure mismatch (expected ${computed}, got ${normalized.target_structure})`);
  }

  return {
    ok: issues.length === 0,
    issues,
    normalized: {
      ...normalized,
      target_structure: computed,
    },
  };
}

function detectContradictions(payload) {
  const issues = [];
  const explanation = `${payload.explanation_de}\n${payload.explanation_ar}`;
  const correctSet = new Set(parseCorrectAnswerLetters(payload.correct_answer));
  const letters = getAnswerLetters(payload);

  const singleMatches = [...explanation.matchAll(/Richtig\s+ist\s+Antwort\s+([A-F])/gi)];
  for (const match of singleMatches) {
    const letter = String(match[1] || "").toUpperCase();
    if (letter && !correctSet.has(letter)) {
      issues.push(`contradiction: explanation says ${letter} correct but not in correct_answer`);
    }
  }

  for (const letter of letters) {
    const saysFalse = new RegExp(`(?:Antwort\\s*${letter}|\\b${letter}\\b)[^\\n]{0,60}(?:ist\\s+)?falsch`, "i").test(explanation);
    const saysCorrect = new RegExp(`(?:Antwort\\s*${letter}|\\b${letter}\\b)[^\\n]{0,60}(?:ist\\s+)?richtig`, "i").test(explanation);

    if (correctSet.has(letter) && saysFalse) issues.push(`contradiction: correct answer ${letter} marked false`);
    if (!correctSet.has(letter) && saysCorrect) issues.push(`contradiction: wrong answer ${letter} marked correct`);
  }

  return issues;
}

function safeJsonParse(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const stripped = rawText.replace(/```(?:json)?\s*|\s*```/gi, "").trim();
  if (!stripped) return null;

  const tryParse = (x) => {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  };

  const direct = tryParse(stripped);
  if (direct !== null) return direct;

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(stripped.slice(start, end + 1));

  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildSourceContext(question) {
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
      answers: {
        A: { text_de: question.answer_a_de, text_ar: question.answer_a_ar },
        B: { text_de: question.answer_b_de, text_ar: question.answer_b_ar },
        C: { text_de: question.answer_c_de, text_ar: question.answer_c_ar },
        D: { text_de: question.answer_d_de, text_ar: question.answer_d_ar },
        E: { text_de: question.answer_e_de, text_ar: question.answer_e_ar },
        F: { text_de: question.answer_f_de, text_ar: question.answer_f_ar },
      },
    },
  };
}

function generatorPrompt(question) {
  const contextJson = JSON.stringify(buildSourceContext(question), null, 2);
  return `Du bist ein juristisch-praeziser IHK-Pruefungsautor fuer die Sachkundepruefung nach §34a GewO.
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
}

function verifierPrompt(question, candidate) {
  const contextJson = JSON.stringify(buildSourceContext(question), null, 2);
  const candidateJson = JSON.stringify(candidate, null, 2);

  return `Du bist ein unabhaengiger QA- und Rechts-Verifier fuer IHK-34a-Fragen.
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
}

function refinerPrompt(question, candidate, issues) {
  const contextJson = JSON.stringify(buildSourceContext(question), null, 2);
  const candidateJson = JSON.stringify(candidate, null, 2);
  const issuesJson = JSON.stringify(issues, null, 2);

  return `Du bist ein Refiner-Agent fuer IHK-34a-Fragen.
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
}

async function callGeminiJson(apiKey, prompt, { maxTokens = 10000, temperature = 0.2, useSearch = false } = {}) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature,
      maxOutputTokens: maxTokens,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  if (useSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_CODE}:generateContent?key=${apiKey}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Gemini ${response.status}: ${text.slice(0, 500)}` };
  }

  const payload = await response.json();
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { ok: false, error: "Gemini returned empty text." };
  }

  const parsed = safeJsonParse(rawText);
  if (!parsed) {
    return { ok: false, error: "Gemini returned non-JSON output." };
  }

  return { ok: true, data: parsed };
}

function buildRestUrl(baseUrl, table, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `${baseUrl}/rest/v1/${table}${qs ? `?${qs}` : ""}`;
}

async function supabaseRequest(baseUrl, serviceKey, table, {
  method = "GET",
  query,
  body,
  returning = "representation",
  upsert = false,
} = {}) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  if (method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    headers.Prefer = upsert
      ? `resolution=merge-duplicates,return=${returning}`
      : `return=${returning}`;
  }

  const response = await fetch(buildRestUrl(baseUrl, table, query), {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  }, FETCH_TIMEOUT_MS);

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Supabase REST ${method} ${table} failed (${response.status}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }

  return parsed;
}

async function fetchSourceQuestion(baseUrl, serviceKey, questionId) {
  const rows = await supabaseRequest(baseUrl, serviceKey, "written_exam_questions", {
    method: "GET",
    query: {
      select: "id,topic,question_text_de,question_text_ar,answer_a_de,answer_a_ar,answer_b_de,answer_b_ar,answer_c_de,answer_c_ar,answer_d_de,answer_d_ar,answer_e_de,answer_e_ar,answer_f_de,answer_f_ar,correct_answer,explanation_de,explanation_ar,target_structure,difficulty_level,source_file",
      id: `eq.${questionId}`,
    },
  });

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Question not found: ${questionId}`);
  }

  return rows[0];
}

async function processOneQuestion({ baseUrl, serviceKey, geminiKey, runId, questionId, actorEmail }) {
  console.log(`Processing ${questionId}...`);
  const jobs = await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_jobs", {
    method: "GET",
    query: {
      select: "id,run_id,question_id,status,attempts,write_mode",
      run_id: `eq.${runId}`,
      question_id: `eq.${questionId}`,
    },
  });

  if (!Array.isArray(jobs) || jobs.length !== 1) {
    throw new Error(`Job not found for question ${questionId}`);
  }

  const job = jobs[0];

  await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_jobs", {
    method: "PATCH",
    query: { id: `eq.${job.id}` },
    body: {
      status: "in_progress",
      attempts: Number(job.attempts || 0) + 1,
      worker_id: crypto.randomUUID(),
      locked_at: nowIso(),
      error_message: null,
      updated_at: nowIso(),
    },
    returning: "minimal",
  });

  const sourceQuestion = await fetchSourceQuestion(baseUrl, serviceKey, questionId);

  await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_jobs", {
    method: "PATCH",
    query: { id: `eq.${job.id}` },
    body: {
      input_json: buildSourceContext(sourceQuestion),
      updated_at: nowIso(),
    },
    returning: "minimal",
  });

  let candidate = null;
  let finalIssues = [];
  let verificationHistory = [];
  let passed = false;

  for (let pass = 0; pass <= MAX_REFINEMENT_PASSES; pass += 1) {
    console.log(`  pass ${pass + 1}/${MAX_REFINEMENT_PASSES + 1}`);
    const generation = pass === 0
      ? await callGeminiJson(geminiKey, generatorPrompt(sourceQuestion), { maxTokens: 10000, temperature: 0.2, useSearch: true })
      : await callGeminiJson(geminiKey, refinerPrompt(sourceQuestion, candidate, finalIssues), { maxTokens: 10000, temperature: 0.1, useSearch: false });

    if (!generation.ok) {
      finalIssues = [`${pass === 0 ? "Generator" : "Refiner"} error: ${generation.error}`];
      continue;
    }

    candidate = generation.data;

    const validation = validateCandidate(candidate);
    const normalized = validation.normalized || normalizeCandidate(candidate);
    const contradictionIssues = normalized ? detectContradictions(normalized) : ["Normalization failed for contradiction check"];

    const verifier = await callGeminiJson(geminiKey, verifierPrompt(sourceQuestion, normalized || candidate), {
      maxTokens: 3500,
      temperature: 0.1,
      useSearch: true,
    });

    let verifierPass = false;
    let verifierIssues = [];
    let verifierPayload = {};

    if (verifier.ok && verifier.data && typeof verifier.data === "object" && !Array.isArray(verifier.data)) {
      verifierPayload = verifier.data;
      verifierPass = verifierPayload.pass === true;
      verifierIssues = Array.isArray(verifierPayload.issues)
        ? verifierPayload.issues.filter((x) => typeof x === "string")
        : [];
    } else {
      verifierIssues = [`Verifier error: ${verifier.ok ? "invalid format" : verifier.error}`];
    }

    finalIssues = [...validation.issues, ...contradictionIssues, ...verifierIssues];

    verificationHistory.push({
      pass_index: pass,
      local_validation: validation,
      contradiction_issues: contradictionIssues,
      verifier: verifier.ok ? verifierPayload : { error: verifier.error },
      combined_issues: finalIssues,
    });

    if (validation.ok && contradictionIssues.length === 0 && verifierPass && normalized) {
      candidate = normalized;
      passed = true;
      break;
    }
  }

  if (!passed) {
    await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_jobs", {
      method: "PATCH",
      query: { id: `eq.${job.id}` },
      body: {
        status: "failed",
        error_message: finalIssues.join(" | ") || "Validation failed",
        output_json: {
          final_candidate: candidate,
          verification_history: verificationHistory,
        },
        validation_json: { issues: finalIssues },
        updated_at: nowIso(),
      },
      returning: "minimal",
    });

    return { ok: false, questionId, issues: finalIssues };
  }

  const validated = validateCandidate(candidate);
  if (!validated.ok || !validated.normalized) {
    await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_jobs", {
      method: "PATCH",
      query: { id: `eq.${job.id}` },
      body: {
        status: "failed",
        error_message: `Final normalization failed: ${validated.issues.join(" | ")}`,
        validation_json: { issues: validated.issues },
        updated_at: nowIso(),
      },
      returning: "minimal",
    });

    return { ok: false, questionId, issues: validated.issues };
  }

  const normalized = validated.normalized;

  await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_candidates", {
    method: "POST",
    query: { on_conflict: "run_id,question_id" },
    body: [{
      run_id: runId,
      question_id: questionId,
      status: "applied",
      candidate_json: normalized,
      validation_json: { issues: [], verification_passes: verificationHistory.length },
      verifier_json: verificationHistory,
      approved: true,
      approved_at: nowIso(),
      approved_by: actorEmail,
      applied_at: nowIso(),
      applied_by: actorEmail,
      updated_at: nowIso(),
    }],
    upsert: true,
    returning: "minimal",
  });

  const map = normalized.answers;
  const updatePayload = {
    topic: sourceQuestion.topic,
    question_text_de: normalized.question_text_de,
    question_text_ar: normalized.question_text_ar,
    answer_a_de: map.A?.text_de || sourceQuestion.answer_a_de,
    answer_a_ar: map.A?.text_ar || sourceQuestion.answer_a_ar,
    answer_b_de: map.B?.text_de || sourceQuestion.answer_b_de,
    answer_b_ar: map.B?.text_ar || sourceQuestion.answer_b_ar,
    answer_c_de: map.C?.text_de || sourceQuestion.answer_c_de,
    answer_c_ar: map.C?.text_ar || sourceQuestion.answer_c_ar,
    answer_d_de: map.D?.text_de || sourceQuestion.answer_d_de,
    answer_d_ar: map.D?.text_ar || sourceQuestion.answer_d_ar,
    answer_e_de: map.E?.text_de || null,
    answer_e_ar: map.E?.text_ar || null,
    answer_f_de: map.F?.text_de || null,
    answer_f_ar: map.F?.text_ar || null,
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

  await supabaseRequest(baseUrl, serviceKey, "written_exam_questions", {
    method: "PATCH",
    query: { id: `eq.${questionId}` },
    body: updatePayload,
    returning: "minimal",
  });

  await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_audit", {
    method: "POST",
    body: [{
      run_id: runId,
      question_id: questionId,
      old_question_json: sourceQuestion,
      new_question_json: updatePayload,
      applied_at: nowIso(),
      applied_by: actorEmail,
    }],
    returning: "minimal",
  });

  await supabaseRequest(baseUrl, serviceKey, "written_exam_regen_jobs", {
    method: "PATCH",
    query: { id: `eq.${job.id}` },
    body: {
      status: "committed",
      error_message: null,
      output_json: {
        candidate: normalized,
        verification_history: verificationHistory,
      },
      validation_json: {
        issues: [],
        verification_passes: verificationHistory.length,
      },
      updated_at: nowIso(),
    },
    returning: "minimal",
  });

  return { ok: true, questionId };
}

async function main() {
  loadEnv();

  const supabaseUrl = requiredEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]).replace(/\/$/, "");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey = requiredEnv("GOOGLE_AI_API_KEY", ["GEMINI_API_KEY", "VITE_GEMINI_API_KEY", "Gemini_explanation_generator"]);
  const actorEmail = process.env.WRITTEN_REGEN_ACTOR_EMAIL?.trim() || "local-batch@system";

  const idsArg = process.argv.slice(2).find((x) => x.startsWith("--ids="));
  const questionIds = idsArg
    ? idsArg.split("=")[1].split(",").map((x) => x.trim()).filter(Boolean)
    : DEFAULT_MISSING_IDS;

  if (!questionIds.length) throw new Error("No question ids provided");

  console.log(`Starting missing-question fix run for ${questionIds.length} question(s)...`);
  console.log(`Model: ${MODEL_CODE}`);

  const runRows = await supabaseRequest(supabaseUrl, serviceKey, "written_exam_regen_runs", {
    method: "POST",
    body: [{
      status: "in_progress",
      target_count: questionIds.length,
      processed_count: 0,
      success_count: 0,
      failure_count: 0,
      model_code: MODEL_CODE,
      prompt_version: PROMPT_VERSION,
      write_mode: "direct",
      created_by: actorEmail,
      created_at: nowIso(),
      started_at: nowIso(),
    }],
  });

  const runId = runRows[0].id;
  console.log(`Run created: ${runId}`);

  await supabaseRequest(supabaseUrl, serviceKey, "written_exam_regen_jobs", {
    method: "POST",
    body: questionIds.map((questionId) => ({
      run_id: runId,
      question_id: questionId,
      status: "queued",
      attempts: 0,
      write_mode: "direct",
      created_at: nowIso(),
      updated_at: nowIso(),
    })),
    returning: "minimal",
  });

  let successCount = 0;
  let failureCount = 0;

  for (const questionId of questionIds) {
    try {
      const result = await processOneQuestion({
        baseUrl: supabaseUrl,
        serviceKey,
        geminiKey,
        runId,
        questionId,
        actorEmail,
      });

      if (result.ok) {
        successCount += 1;
        console.log(`OK: ${questionId}`);
      } else {
        failureCount += 1;
        console.log(`FAILED: ${questionId} -> ${result.issues.join(" | ")}`);
      }
    } catch (error) {
      failureCount += 1;
      console.log(`FAILED: ${questionId} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const processedCount = successCount + failureCount;
  const finishedAt = nowIso();

  await supabaseRequest(supabaseUrl, serviceKey, "written_exam_regen_runs", {
    method: "PATCH",
    query: { id: `eq.${runId}` },
    body: {
      status: failureCount === 0 ? "applied" : "completed_with_errors",
      processed_count: processedCount,
      success_count: successCount,
      failure_count: failureCount,
      finished_at: finishedAt,
      approved_at: successCount > 0 ? finishedAt : null,
      approved_by: successCount > 0 ? actorEmail : null,
      applied_at: successCount > 0 ? finishedAt : null,
      applied_by: successCount > 0 ? actorEmail : null,
    },
    returning: "minimal",
  });

  console.log(`Done. Run ${runId}: success=${successCount}, failure=${failureCount}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Missing-question fix failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
