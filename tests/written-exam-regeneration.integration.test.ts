import { describe, expect, it } from "vitest";
import { createWrittenExamRegenerationLocalApi } from "../scripts/written-exam-regeneration-local-pipeline.ts";

const enabled = process.env.RUN_WRITTEN_REGEN_INTEGRATION === "1";
const questionId = process.env.WRITTEN_REGEN_TEST_QUESTION_ID || "73a95049-7e26-40b1-8f5d-7c3d851e1e24";

describe.runIf(enabled)("written exam regeneration integration", () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!supabaseUrl || !apiKey || !geminiApiKey) {
    throw new Error("Integration test requires SUPABASE_URL, SUPABASE_*_KEY and GOOGLE_AI_API_KEY (or GEMINI_API_KEY).");
  }

  const localApi = createWrittenExamRegenerationLocalApi({
    supabaseUrl,
    supabaseKey: apiKey,
    geminiApiKey,
    actorEmail: process.env.WRITTEN_REGEN_ACTOR_EMAIL || "integration-test@local",
  });

  async function call<T>(body: Record<string, unknown>): Promise<T> {
    const action = body.action as
      | "enqueue_run"
      | "process_next"
      | "status"
      | "export_review_payload"
      | "approve_run"
      | "apply_run";
    if (!action) throw new Error("Missing action in test payload.");

    const { action: _ignored, ...payload } = body;
    const result = await localApi.call<T>(action, payload);
    return result.result;
  }

  it("runs enqueue -> process -> export -> approve -> apply", async () => {
    const enqueue = await call<{ run_id: string }>({
      action: "enqueue_run",
      questionId,
      overwrite: true,
    });

    expect(enqueue.run_id).toBeTruthy();

    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      const process = await call<{ done: boolean }>({
        action: "process_next",
        runId: enqueue.run_id,
      });
      done = process.done;
    }

    const review = await call<{ candidates: Array<{ question_id: string }> }>({
      action: "export_review_payload",
      runId: enqueue.run_id,
    });
    expect(review.candidates.length).toBeGreaterThan(0);

    const approved = await call<{ approved_count: number }>({
      action: "approve_run",
      runId: enqueue.run_id,
      questionId,
    });
    expect(approved.approved_count).toBe(1);

    const applied = await call<{ applied_count: number }>({
      action: "apply_run",
      runId: enqueue.run_id,
      questionId,
    });
    expect(applied.applied_count).toBe(1);

    const status = await call<{ run: { status: string } }>({
      action: "status",
      runId: enqueue.run_id,
    });
    expect(status.run.status).toBe("applied");
  }, 180_000);
});
