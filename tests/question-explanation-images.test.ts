import { describe, expect, it } from "vitest";
import {
  buildQuestionImageMigrationSql,
  createGermanSlug,
  parseApprovedQuestionIds,
  prepareQuestionImageTargets,
  validateManifestEntry,
  type LessonRow,
  type QuestionRow,
} from "../scripts/question-explanation-image-utils";

describe("question explanation image utilities", () => {
  it("filters missing images and sorts by lesson, global order, and id", () => {
    const lessons: LessonRow[] = [
      { id: "lesson-2", order_index: 2, title_de: "Zweite Lektion" },
      { id: "lesson-1", order_index: 1, title_de: "Erste Lektion" },
    ];
    const questions: QuestionRow[] = [
      {
        id: "b",
        lesson_id: "lesson-2",
        order_index: 1,
        global_order_index: 4,
        text_de: "Frage B",
        explanation_de: "Erklärung",
      },
      {
        id: "existing",
        lesson_id: "lesson-1",
        order_index: 1,
        global_order_index: 1,
        text_de: "Schon bebildert",
        explanation_de: "Erklärung",
        question_explanation_image_url: "/question-explanations/schon.png",
      },
      {
        id: "a",
        lesson_id: "lesson-1",
        order_index: 2,
        global_order_index: 3,
        text_de: "Frage A",
        explanation_de: "Erklärung",
      },
    ];

    const result = prepareQuestionImageTargets({ questions, lessons, onlyMissing: true, limit: 0 });

    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result[0].lesson_title_de).toBe("Erste Lektion");
  });

  it("creates stable German slugs with umlauts and ß", () => {
    expect(createGermanSlug("Öffentliche Sicherheit: Maßnahme prüfen!")).toBe("öffentliche-sicherheit-maßnahme-prüfen");
  });

  it("validates manifest entries against review rules", () => {
    const issues = validateManifestEntry({
      questionId: "q1",
      allowedText: ["A", "Öffentliches Recht"],
      assetFileName: "bild.png",
      assetUrl: "/question-explanations/bild.png",
    });

    expect(issues.some((issue) => issue.includes("Antwortbuchstaben"))).toBe(true);
  });

  it("builds migration SQL for multiple approved images", () => {
    const sql = buildQuestionImageMigrationSql([
      {
        questionId: "q1",
        assetUrl: "/question-explanations/eins.png",
        altText: "Infografik eins.",
        prompt: "Prompt eins.",
      },
      {
        questionId: "q2",
        assetUrl: "/question-explanations/zwei.png",
        altText: "Infografik zwei.",
        prompt: "Prompt zwei.",
      },
    ]);

    expect(sql).toContain("WHERE id = 'q1';");
    expect(sql).toContain("WHERE id = 'q2';");
    expect(sql).toContain("question_explanation_image_url");
    expect(sql).not.toContain("DROP");
  });

  it("parses approved question IDs from both supported shapes", () => {
    expect([...parseApprovedQuestionIds({ approved: ["q1", "q2"] })]).toEqual(["q1", "q2"]);
    expect([...parseApprovedQuestionIds(["q3"])]).toEqual(["q3"]);
  });
});
