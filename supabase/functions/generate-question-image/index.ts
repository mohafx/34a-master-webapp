import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildLocalQuestionImageBrief,
  buildQuestionImagePrompt,
} from "../_shared/question-image-prompt.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY =
  Deno.env.get("OPENAI_API_KEY") || Deno.env.get("openai_key") || "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "m.almajzoub1@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const BUCKET = "question-explanations";
const MODEL = Deno.env.get("QUESTION_IMAGE_MODEL") || "gpt-image-2";
const SIZE = "1024x1024";
const QUALITY = Deno.env.get("QUESTION_IMAGE_QUALITY") || "medium";
const OPENAI_TIMEOUT_MS = 180_000;
const REFERENCE_OBJECTS = [
  "_references/185563F2-94F9-4EB0-A1CF-97DD8EAC5CF6.PNG",
  "_references/C6438977-F0F0-4A8E-8D05-4B60409DBF73.PNG",
  "_references/E574E446-36EC-4DBA-9DC2-DA3469C02259.PNG",
  "_references/F28B7702-F43D-4152-8498-463ADD7DC86C.PNG",
];

type Action = "generate" | "delete" | "regenerate";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, response: jsonResponse({ error: "Server misconfigured (auth env)." }, 500) };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, response: jsonResponse({ error: "Admin authorization required." }, 401) };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !isAdminEmail(data.user?.email)) {
    return { ok: false, response: jsonResponse({ error: "Admin authorization required." }, 403) };
  }

  return { ok: true };
}

async function clearQuestionImage(
  supabase: ReturnType<typeof createClient>,
  questionId: string,
  imageUrl: string | null,
): Promise<void> {
  const objectName = imageUrl?.split("/question-explanations/")[1];
  if (objectName && !objectName.startsWith("_references/")) {
    await supabase.storage.from(BUCKET).remove([objectName]);
  }

  const { error } = await supabase
    .from("questions")
    .update({
      question_explanation_image_url: null,
      question_explanation_image_alt_de: null,
      question_explanation_image_prompt: null,
    })
    .eq("id", questionId);
  if (error) throw new Error(`DB image reset failed: ${error.message}`);
}

interface QuestionRow {
  id: string;
  text_de: string;
  explanation_de: string | null;
  lesson_id: string | null;
  question_explanation_image_url: string | null;
  question_explanation_image_alt_de: string | null;
  question_explanation_image_prompt: string | null;
}

async function fetchReferenceBlobs(
  supabase: ReturnType<typeof createClient>,
): Promise<{ blob: Blob; name: string }[]> {
  const blobs: { blob: Blob; name: string }[] = [];
  for (const objectPath of REFERENCE_OBJECTS) {
    try {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      const res = await fetch(data.publicUrl);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      blobs.push({
        blob: new Blob([bytes], { type: "image/png" }),
        name: objectPath.split("/").pop() || "reference.png",
      });
    } catch (_) {
      // Reference is optional; fall back to text-only prompt if unavailable.
    }
  }
  return blobs;
}

async function generateImage(prompt: string, references: { blob: Blob; name: string }[]): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response: Response;
  try {
    if (references.length > 0) {
      const form = new FormData();
      form.set("model", MODEL);
      form.set("prompt", prompt);
      form.set("size", SIZE);
      form.set("quality", QUALITY);
      form.set("output_format", "png");
      for (const ref of references) form.append("image[]", ref.blob, ref.name);
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          size: SIZE,
          quality: QUALITY,
          output_format: "png",
          n: 1,
        }),
        signal: controller.signal,
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI image API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const base64 = payload?.data?.[0]?.b64_json;
  if (typeof base64 !== "string" || !base64.trim()) {
    throw new Error("OpenAI image response did not contain data[0].b64_json.");
  }
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured (Supabase env)." }, 500);
  }
  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: "Server misconfigured (OpenAI key)." }, 500);
  }

  let questionId = "";
  let action: Action = "generate";
  try {
    const body = await req.json();
    questionId = typeof body?.questionId === "string" ? body.questionId.trim() : "";
    if (body?.action === "delete" || body?.action === "regenerate") {
      action = body.action;
    }
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (!questionId) return jsonResponse({ error: "questionId is required." }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1) Load current state.
  const { data: question, error: loadErr } = await supabase
    .from("questions")
    .select(
      "id,text_de,explanation_de,lesson_id,question_explanation_image_url,question_explanation_image_alt_de,question_explanation_image_prompt",
    )
    .eq("id", questionId)
    .single<QuestionRow>();

  if (loadErr || !question) {
    return jsonResponse({ error: "Question not found." }, 404);
  }

  if (action === "delete") {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;
    try {
      await clearQuestionImage(supabase, questionId, question.question_explanation_image_url);
      return jsonResponse({ status: "deleted" });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Delete failed." }, 500);
    }
  }

  if (action === "regenerate") {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;
    try {
      await clearQuestionImage(supabase, questionId, question.question_explanation_image_url);
      question.question_explanation_image_url = null;
      question.question_explanation_image_alt_de = null;
      question.question_explanation_image_prompt = null;
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Regeneration reset failed." }, 500);
    }
  }

  // 2) Cache hit — return existing image, never regenerate.
  if (question.question_explanation_image_url) {
    return jsonResponse({
      status: "ready",
      cached: true,
      url: question.question_explanation_image_url,
      altText: question.question_explanation_image_alt_de,
    });
  }

  // 3) Atomic claim: only one generation per question at a time.
  const { data: claimed, error: claimErr } = await supabase
    .from("questions")
    .update({
      question_explanation_image_prompt: `Self-service Bildgenerierung läuft seit ${new Date().toISOString()}`,
    })
    .eq("id", questionId)
    .is("question_explanation_image_url", null)
    .is("question_explanation_image_prompt", null)
    .select("id");

  if (claimErr) {
    return jsonResponse({ error: `Could not claim generation lock: ${claimErr.message}` }, 500);
  }
  if (!claimed || claimed.length === 0) {
    // Another request is generating right now.
    return jsonResponse({ status: "pending", cached: false });
  }

  // 4) Generate.
  try {
    let lessonTitle: string | null = null;
    if (question.lesson_id) {
      const { data: lesson } = await supabase
        .from("lessons")
        .select("title_de")
        .eq("id", question.lesson_id)
        .single<{ title_de: string | null }>();
      lessonTitle = lesson?.title_de ?? null;
    }

    const brief = buildLocalQuestionImageBrief({
      text_de: question.text_de,
      explanation_de: question.explanation_de,
      lesson_title_de: lessonTitle,
    });
    const prompt = buildQuestionImagePrompt(
      { text_de: question.text_de, explanation_de: question.explanation_de, lesson_title_de: lessonTitle },
      brief,
    );

    const references = await fetchReferenceBlobs(supabase);
    const bytes = await generateImage(prompt, references);

    const objectPath = `${questionId}.png`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: "image/png", upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub.publicUrl;

    const { error: updateErr } = await supabase
      .from("questions")
      .update({
        question_explanation_image_url: publicUrl,
        question_explanation_image_alt_de: brief.altText,
        question_explanation_image_prompt: "Self-service Nutzer-Generierung (Stil v2)",
      })
      .eq("id", questionId);
    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    return jsonResponse({ status: "ready", cached: false, url: publicUrl, altText: brief.altText });
  } catch (error) {
    // Release the lock so a later attempt can retry.
    await supabase
      .from("questions")
      .update({
        question_explanation_image_prompt: null,
      })
      .eq("id", questionId);
    return jsonResponse({ error: error instanceof Error ? error.message : "Generation failed." }, 500);
  }
});
