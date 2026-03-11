import { describe, expect, it } from "vitest";
import {
  detectExplanationContradictions,
  validateRegeneratedPayload,
} from "../supabase/functions/written-exam-regeneration-pipeline/shared";

function makeValidPayload() {
  return {
    question_text_de: "Welche Aussage zur vorlaeufigen Festnahme nach § 127 Abs. 1 StPO ist korrekt?",
    question_text_ar: "ما العبارة الصحيحة بشأن التوقيف المؤقت وفق § 127 Abs. 1 StPO؟",
    answers: {
      A: { text_de: "Jeder darf nur bei Ordnungswidrigkeiten festhalten.", text_ar: "يجوز لكل شخص الاحتجاز فقط في المخالفات الإدارية." },
      B: { text_de: "Jeder darf bei frischer Tat und Fluchtverdacht vorlaeufig festhalten.", text_ar: "يجوز لكل شخص الاحتجاز مؤقتًا عند التلبس مع خطر الفرار." },
      C: { text_de: "Nur Polizeibeamte duerfen eine Person festhalten.", text_ar: "فقط الشرطة يجوز لها احتجاز شخص." },
      D: { text_de: "Eine Festhaltung ist ohne Straftatverdacht zulaessig.", text_ar: "الاحتجاز جائز بدون اشتباه بجريمة." },
      E: { text_de: "Eine Festhaltung ist nur mit richterlichem Beschluss zulaessig.", text_ar: "الاحتجاز جائز فقط بأمر قضائي." },
    },
    correct_answer: "B",
    explanation_de:
      "Antwort B ist richtig, weil § 127 Abs. 1 StPO eine vorlaeufige Festnahme bei frischer Tat und Fluchtverdacht erlaubt. A, C, D und E sind falsch, weil sie den Anwendungsbereich gesetzeswidrig verengen oder erweitern.",
    explanation_ar:
      "الإجابة B صحيحة لأن § 127 Abs. 1 StPO يسمح بالتوقيف المؤقت في حالة التلبس مع خطر الفرار. الإجابات A و C و D و E خاطئة لأنها توسّع أو تضيّق نطاق القانون بشكل غير صحيح.",
    difficulty_level: "MEDIUM",
    target_structure: "5_opts|1_correct",
  };
}

describe("written exam regeneration validation", () => {
  it("accepts a valid payload", () => {
    const result = validateRegeneratedPayload(makeValidPayload());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.normalized?.target_structure).toBe("5_opts|1_correct");
  });

  it("rejects payloads with more than two correct answers", () => {
    const payload = makeValidPayload();
    payload.correct_answer = "A,B,C";

    const result = validateRegeneratedPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("genau 1 oder 2"))).toBe(true);
  });

  it("rejects payloads with invalid correct answer letters", () => {
    const payload = makeValidPayload();
    payload.correct_answer = "G";

    const result = validateRegeneratedPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("genau 1 oder 2"))).toBe(true);
  });

  it("rejects target structure mismatches", () => {
    const payload = makeValidPayload();
    payload.target_structure = "6_opts|2_correct";

    const result = validateRegeneratedPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("target_structure passt nicht"))).toBe(true);
  });

  it("detects contradiction if correct answer is marked false", () => {
    const payload = makeValidPayload();
    payload.explanation_de =
      "Richtig ist Antwort B, weil bei frischer Tat mit Fluchtverdacht nach § 127 Abs. 1 StPO eine vorlaeufige Festnahme zulaessig ist. " +
      "A, C, D und E bleiben falsch, weil sie den Anwendungsbereich der Norm rechtlich falsch darstellen. " +
      "Spaeter wird gesagt: Antwort B ist falsch.";

    const validation = validateRegeneratedPayload(payload);
    expect(validation.ok).toBe(true);

    const contradictions = detectExplanationContradictions(validation.normalized!);
    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions.some((x) => x.includes("wird als falsch"))).toBe(true);
  });
});
