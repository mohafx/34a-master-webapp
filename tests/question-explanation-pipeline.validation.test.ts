import { describe, expect, it } from "vitest";
import {
  nextStatusAfterFailure,
  safeJsonParse,
  validateExplanationPayload,
} from "../supabase/functions/question-explanation-pipeline/shared";

function makeValidExplanation(language: "de" | "ar"): string {
  if (language === "de") {
    const filler = "Diese Erklaerung ist ausfuehrlich, leicht verstaendlich und juristisch praezise. ".repeat(25);
    return [
      "### Einfache Erklärung",
      "",
      `Rechtsgrundlage: § 34a GewO und § 127 StPO. ${filler}`,
      "Falsche Antworten werden im Vergleich klar entkraeftet: A) falsch, B) falsch, C) nicht korrekt.",
    ].join("\n");
  }

  const filler = "هذا الشرح مفصل وواضح وسهل الفهم مع دقة قانونية عالية. ".repeat(35);
  return [
    "### الشرح المبسط",
    "",
    filler,
  ].join("\n");
}

describe("question explanation validation", () => {
  it("accepts a valid payload", () => {
    const result = validateExplanationPayload({
      explanation_de: makeValidExplanation("de"),
      explanation_ar: makeValidExplanation("ar"),
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects payloads with multiple sections", () => {
    const de = `${makeValidExplanation("de")}\n\n### Extra\nNoch ein Abschnitt`;
    const result = validateExplanationPayload({
      explanation_de: de,
      explanation_ar: makeValidExplanation("ar"),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("genau eine Markdown-Ueberschrift"))).toBe(true);
  });

  it("rejects payloads with HTML", () => {
    const de = `${makeValidExplanation("de")}\n<div class=\"text-red-500\">bad</div>`;
    const result = validateExplanationPayload({
      explanation_de: de,
      explanation_ar: makeValidExplanation("ar"),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("HTML/Tailwind"))).toBe(true);
  });

  it("rejects payloads without legal basis", () => {
    const de = makeValidExplanation("de").replace("§ 34a GewO und § 127 StPO.", "ohne Rechtsnormen.");
    const result = validateExplanationPayload({
      explanation_de: de,
      explanation_ar: makeValidExplanation("ar"),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("Keine klare Rechtsgrundlage"))).toBe(true);
  });

  it("rejects payloads without wrong-answer analysis", () => {
    const de = makeValidExplanation("de").replace(
      "Falsche Antworten werden im Vergleich klar entkraeftet: A) falsch, B) falsch, C) nicht korrekt.",
      "Die Antwort ist richtig.",
    );
    const result = validateExplanationPayload({
      explanation_de: de,
      explanation_ar: makeValidExplanation("ar"),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.includes("Analyse der falschen Antworten"))).toBe(true);
  });

  it("retry helper marks failure after max attempts", () => {
    expect(nextStatusAfterFailure(1, 3)).toBe("retry");
    expect(nextStatusAfterFailure(2, 3)).toBe("retry");
    expect(nextStatusAfterFailure(3, 3)).toBe("failed");
  });

  it("safeJsonParse extracts JSON from fenced + noisy output", () => {
    const raw = [
      "Hier ist dein Ergebnis:",
      "```json",
      '{ "explanation_de": "### Einfache Erklärung\\n\\nText", "explanation_ar": "### الشرح المبسط\\n\\nنص" }',
      "```",
      "Danke!",
    ].join("\n");

    const parsed = safeJsonParse(raw) as Record<string, string> | null;
    expect(parsed).not.toBeNull();
    expect(parsed?.explanation_de).toContain("Einfache Erklärung");
  });

  it("safeJsonParse returns null for invalid payloads", () => {
    const parsed = safeJsonParse("not-json");
    expect(parsed).toBeNull();
  });
});
