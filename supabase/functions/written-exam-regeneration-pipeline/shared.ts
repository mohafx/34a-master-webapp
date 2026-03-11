export interface AnswerOption {
  text_de: string;
  text_ar: string;
}

export interface RegeneratedQuestionPayload {
  question_text_de: string;
  question_text_ar: string;
  answers: Record<string, AnswerOption>;
  correct_answer: string;
  explanation_de: string;
  explanation_ar: string;
  difficulty_level: "EASY" | "MEDIUM" | "HARD";
  target_structure?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
  normalized?: RegeneratedQuestionPayload;
}

const VALID_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const VALID_DIFFICULTY = new Set(["EASY", "MEDIUM", "HARD"]);

function parseMaybeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeRegeneratedPayload(value: unknown): RegeneratedQuestionPayload | null {
  const obj = parseMaybeObject(value);
  if (!obj) return null;

  const questionTextDe = typeof obj.question_text_de === "string" ? obj.question_text_de.trim() : "";
  const questionTextAr = typeof obj.question_text_ar === "string" ? obj.question_text_ar.trim() : "";
  const correctAnswerRaw = typeof obj.correct_answer === "string" ? obj.correct_answer : "";
  const explanationDe = typeof obj.explanation_de === "string" ? obj.explanation_de.trim() : "";
  const explanationAr = typeof obj.explanation_ar === "string" ? obj.explanation_ar.trim() : "";
  const targetStructure = typeof obj.target_structure === "string" ? obj.target_structure.trim() : undefined;
  const difficultyRaw = typeof obj.difficulty_level === "string" ? obj.difficulty_level.trim().toUpperCase() : "";

  const answersObj = parseMaybeObject(obj.answers);
  if (!answersObj) return null;

  const normalizedAnswers: Record<string, AnswerOption> = {};
  for (const [letter, answerValue] of Object.entries(answersObj)) {
    const up = letter.trim().toUpperCase();
    if (!VALID_LETTERS.includes(up as (typeof VALID_LETTERS)[number])) continue;

    const answerObj = parseMaybeObject(answerValue);
    if (!answerObj) continue;

    const textDe = typeof answerObj.text_de === "string" ? answerObj.text_de.trim() : "";
    const textAr = typeof answerObj.text_ar === "string" ? answerObj.text_ar.trim() : "";

    normalizedAnswers[up] = { text_de: textDe, text_ar: textAr };
  }

  if (!questionTextDe || !questionTextAr || !correctAnswerRaw || !explanationDe || !explanationAr) {
    return null;
  }

  const normalized: RegeneratedQuestionPayload = {
    question_text_de: questionTextDe,
    question_text_ar: questionTextAr,
    answers: normalizedAnswers,
    correct_answer: normalizeCorrectAnswer(correctAnswerRaw),
    explanation_de: explanationDe,
    explanation_ar: explanationAr,
    difficulty_level: (VALID_DIFFICULTY.has(difficultyRaw)
      ? difficultyRaw
      : "MEDIUM") as RegeneratedQuestionPayload["difficulty_level"],
    target_structure: targetStructure,
  };

  return normalized;
}

export function normalizeCorrectAnswer(value: string): string {
  const letters = value
    .toUpperCase()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const letter of letters) {
    if (!VALID_LETTERS.includes(letter as (typeof VALID_LETTERS)[number])) continue;
    if (!unique.includes(letter)) unique.push(letter);
  }

  return unique.sort().join(",");
}

export function getAnswerLetters(payload: RegeneratedQuestionPayload): string[] {
  return Object.keys(payload.answers)
    .map((x) => x.toUpperCase())
    .filter((x) => VALID_LETTERS.includes(x as (typeof VALID_LETTERS)[number]))
    .sort();
}

export function parseCorrectAnswerLetters(correctAnswer: string): string[] {
  return normalizeCorrectAnswer(correctAnswer)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

export function computeTargetStructureFromPayload(payload: RegeneratedQuestionPayload): string {
  const optionCount = getAnswerLetters(payload).length;
  const correctCount = parseCorrectAnswerLetters(payload.correct_answer).length;
  return `${optionCount}_opts|${correctCount}_correct`;
}

export function validateRegeneratedPayload(value: unknown): ValidationResult {
  const payload = normalizeRegeneratedPayload(value);
  if (!payload) {
    return { ok: false, issues: ["Payload ist kein valides Regenerations-Objekt."] };
  }

  const issues: string[] = [];
  const answerLetters = getAnswerLetters(payload);
  const correctLetters = parseCorrectAnswerLetters(payload.correct_answer);

  if (payload.question_text_de.length < 20) {
    issues.push("question_text_de ist zu kurz.");
  }
  if (payload.question_text_ar.length < 20) {
    issues.push("question_text_ar ist zu kurz.");
  }
  if (payload.explanation_de.length < 160) {
    issues.push("explanation_de ist zu kurz.");
  }
  if (payload.explanation_ar.length < 160) {
    issues.push("explanation_ar ist zu kurz.");
  }

  if (!VALID_DIFFICULTY.has(payload.difficulty_level)) {
    issues.push("difficulty_level muss EASY, MEDIUM oder HARD sein.");
  }

  if (!(answerLetters.length === 5 || answerLetters.length === 6)) {
    issues.push("Es muessen genau 5 oder 6 Antwortoptionen vorhanden sein.");
  }

  const expectedLetters = answerLetters.length === 6 ? ["A", "B", "C", "D", "E", "F"] : ["A", "B", "C", "D", "E"];
  if (answerLetters.join(",") !== expectedLetters.join(",")) {
    issues.push("Antwortoptionen muessen lueckenlos von A aufwaerts belegt sein.");
  }

  for (const letter of answerLetters) {
    const option = payload.answers[letter];
    if (!option || !option.text_de || !option.text_ar) {
      issues.push(`Antwort ${letter} muss text_de und text_ar enthalten.`);
    }
  }

  if (!(correctLetters.length === 1 || correctLetters.length === 2)) {
    issues.push("correct_answer muss genau 1 oder 2 richtige Antworten enthalten.");
  }

  for (const letter of correctLetters) {
    if (!answerLetters.includes(letter)) {
      issues.push(`correct_answer referenziert nicht vorhandene Antwort ${letter}.`);
    }
  }

  const computedStructure = computeTargetStructureFromPayload(payload);
  if (payload.target_structure && payload.target_structure !== computedStructure) {
    issues.push(`target_structure passt nicht (expected ${computedStructure}, got ${payload.target_structure}).`);
  }

  return {
    ok: issues.length === 0,
    issues,
    normalized: {
      ...payload,
      target_structure: computedStructure,
    },
  };
}

export function detectExplanationContradictions(payload: RegeneratedQuestionPayload): string[] {
  const issues: string[] = [];
  const explanation = `${payload.explanation_de}\n${payload.explanation_ar}`;
  const correctLetters = new Set(parseCorrectAnswerLetters(payload.correct_answer));
  const availableLetters = getAnswerLetters(payload);

  const singleCorrectMentions = [...explanation.matchAll(/Richtig\s+ist\s+Antwort\s+([A-F])/gi)];
  for (const match of singleCorrectMentions) {
    const letter = match[1].toUpperCase();
    if (!correctLetters.has(letter)) {
      issues.push(`Widerspruch: Erklaerung nennt ${letter} als richtig, aber correct_answer enthaelt ${letter} nicht.`);
    }
  }

  for (const letter of availableLetters) {
    const saysFalse = new RegExp(`(?:Antwort\\s*${letter}|\\b${letter}\\b)[^\\n]{0,60}(?:ist\\s+)?falsch`, "i").test(explanation);
    const saysCorrect = new RegExp(`(?:Antwort\\s*${letter}|\\b${letter}\\b)[^\\n]{0,60}(?:ist\\s+)?richtig`, "i").test(explanation);

    if (correctLetters.has(letter) && saysFalse) {
      issues.push(`Widerspruch: Richtige Antwort ${letter} wird als falsch beschrieben.`);
    }
    if (!correctLetters.has(letter) && saysCorrect) {
      issues.push(`Widerspruch: Falsche Antwort ${letter} wird als richtig beschrieben.`);
    }
  }

  return issues;
}

export function safeJsonParse(rawText: string): unknown | null {
  if (!rawText) return null;
  const stripped = rawText.replace(/```(?:json)?\s*|\s*```/gi, "").trim();
  if (!stripped) return null;

  const tryParse = (value: string): unknown | null => {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  };

  const direct = tryParse(stripped);
  if (direct !== null) return direct;

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParse(stripped.slice(start, end + 1));
  }

  return null;
}

export function nextStatusAfterFailure(attempts: number, maxAttempts = 3): "retry" | "failed" {
  return attempts >= maxAttempts ? "failed" : "retry";
}
