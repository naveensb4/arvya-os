import { createClient } from "@supabase/supabase-js";

export type VisualKind = "none" | "diagram" | "carousel" | "screenshot_mock" | "video_script";

export type VisualConcept = {
  kind: VisualKind;
  imagePrompt?: string;
  carouselSlides?: Array<{ caption: string; imagePrompt: string }>;
  videoScript?: { durationSec: number; beats: string[] };
  rationale: string;
};

export type RenderedVisual = {
  kind: VisualKind;
  status: "rendered" | "skipped" | "failed";
  reason?: string;
  imageUrls: string[];
  storagePaths: string[];
  videoScript?: { durationSec: number; beats: string[] };
};

const DEFAULT_BUCKET = "arvya-source-files";

function multimodalEnabled(): boolean {
  return (process.env.MARKETING_OS_MULTIMODAL ?? "true").trim().toLowerCase() !== "false";
}

function visualBucket(): string {
  return process.env.MARKETING_OS_VISUAL_BUCKET?.trim() || DEFAULT_BUCKET;
}

function supabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey, bucket: visualBucket() };
}

let bucketReady: Promise<void> | null = null;

async function ensurePublicBucket(config: NonNullable<ReturnType<typeof supabaseConfig>>) {
  if (bucketReady) return bucketReady;
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  bucketReady = (async () => {
    const { data: existing, error: getError } = await supabase.storage.getBucket(config.bucket);
    if (!getError && existing) {
      if (!existing.public) {
        await supabase.storage.updateBucket(config.bucket, { public: true }).catch(() => undefined);
      }
      return;
    }
    const { error: createError } = await supabase.storage.createBucket(config.bucket, { public: true });
    if (createError && !/already exists/i.test(createError.message)) {
      bucketReady = null;
      throw createError;
    }
  })();
  return bucketReady;
}

function pickImageModel(): string {
  return process.env.MARKETING_OS_IMAGE_MODEL?.trim() || "gpt-image-1";
}

function pickFallbackImageModel(): string {
  return process.env.MARKETING_OS_IMAGE_MODEL_FALLBACK?.trim() || "dall-e-3";
}

async function generatePngBytes(input: { prompt: string; size: "1080x1080" | "1200x627" | "1024x1024" | "1792x1024"; model?: string }): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is required for image generation.");

  const candidates = [input.model ?? pickImageModel(), pickFallbackImageModel()].filter(
    (value, index, arr) => Boolean(value) && arr.indexOf(value) === index,
  );

  let lastError: Error | null = null;
  for (const model of candidates) {
    const isGptImage = model.startsWith("gpt-image");
    const size = normalizeSize(model, input.size);
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      size,
      n: 1,
    };
    if (isGptImage) {
      body.output_format = "png";
    } else {
      body.response_format = "b64_json";
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastError = new Error(`OpenAI image ${model} returned ${response.status}: ${text.slice(0, 200)}`);
      continue;
    }
    const json = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = json.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        lastError = new Error(`Fetching generated image URL failed: ${imgRes.status}`);
        continue;
      }
      const arrayBuf = await imgRes.arrayBuffer();
      return Buffer.from(arrayBuf);
    }
    lastError = new Error(`OpenAI image ${model} returned no image data.`);
  }
  throw lastError ?? new Error("Image generation failed for all candidate models.");
}

function normalizeSize(model: string, requested: string): string {
  if (model.startsWith("gpt-image")) {
    if (requested === "1080x1080") return "1024x1024";
    if (requested === "1200x627") return "1536x1024";
    return requested;
  }
  if (model.startsWith("dall-e-3")) {
    if (requested === "1200x627") return "1792x1024";
    if (requested === "1080x1080" || requested === "1024x1024") return "1024x1024";
    return requested;
  }
  return requested;
}

async function uploadVisualToStorage(input: {
  postId: string;
  index: number;
  body: Uint8Array;
  contentType?: string;
}): Promise<{ publicUrl: string; storagePath: string }> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase storage is not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  await ensurePublicBucket(config);
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const path = `marketing/visuals/${input.postId}/${input.index}.png`;
  const { error } = await supabase.storage.from(config.bucket).upload(path, input.body, {
    contentType: input.contentType ?? "image/png",
    upsert: true,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Supabase upload failed for ${path}: ${error.message}`);
  }
  const { data } = supabase.storage.from(config.bucket).getPublicUrl(path);
  return { publicUrl: data.publicUrl, storagePath: `${config.bucket}/${path}` };
}

function describeVisualConcept(visual: VisualConcept | null | undefined): string {
  if (!visual || visual.kind === "none") {
    return "Text-only (no visual). " + (visual?.rationale ?? "");
  }
  switch (visual.kind) {
    case "diagram":
    case "screenshot_mock":
      return `${visual.kind === "diagram" ? "Simple diagram" : "Screenshot-style mock"} — ${visual.rationale}`;
    case "carousel":
      return `Carousel (${visual.carouselSlides?.length ?? 0} slides) — ${visual.rationale}`;
    case "video_script":
      return `Short video script (${visual.videoScript?.durationSec ?? 0}s, ${visual.videoScript?.beats.length ?? 0} beats) — ${visual.rationale}`;
    default:
      return visual.rationale ?? "";
  }
}

export function summarizeVisualForSlack(visual: VisualConcept | null | undefined): string {
  if (!visual) return "🎨 Visual concept: none";
  const kind = visual.kind ?? "none";
  if (kind === "none") return `🎨 Visual concept: none — ${visual.rationale ?? "text-only"}`;
  return `🎨 Visual concept: *${kind}* — ${visual.rationale ?? describeVisualConcept(visual)}`;
}

export async function renderVisualForPost(input: {
  postId: string;
  visual: VisualConcept | null | undefined;
}): Promise<RenderedVisual> {
  const visual = input.visual;
  if (!visual || visual.kind === "none") {
    return { kind: visual?.kind ?? "none", status: "skipped", reason: "no_visual", imageUrls: [], storagePaths: [] };
  }
  if (!multimodalEnabled()) {
    return { kind: visual.kind, status: "skipped", reason: "multimodal_disabled", imageUrls: [], storagePaths: [] };
  }
  if (visual.kind === "video_script") {
    return {
      kind: visual.kind,
      status: "skipped",
      reason: "video_script_no_render",
      imageUrls: [],
      storagePaths: [],
      videoScript: visual.videoScript,
    };
  }

  try {
    if (visual.kind === "diagram" || visual.kind === "screenshot_mock") {
      if (!visual.imagePrompt) {
        return { kind: visual.kind, status: "failed", reason: "missing_image_prompt", imageUrls: [], storagePaths: [] };
      }
      const png = await generatePngBytes({ prompt: enrichPrompt(visual.kind, visual.imagePrompt), size: "1080x1080" });
      const { publicUrl, storagePath } = await uploadVisualToStorage({ postId: input.postId, index: 0, body: png });
      return { kind: visual.kind, status: "rendered", imageUrls: [publicUrl], storagePaths: [storagePath] };
    }

    if (visual.kind === "carousel") {
      const slides = (visual.carouselSlides ?? []).slice(0, 6);
      if (slides.length === 0) {
        return { kind: visual.kind, status: "failed", reason: "no_carousel_slides", imageUrls: [], storagePaths: [] };
      }
      const results = await Promise.allSettled(
        slides.map((slide, idx) =>
          generatePngBytes({ prompt: enrichPrompt("carousel", slide.imagePrompt, slide.caption), size: "1080x1080" }).then(
            (png) => uploadVisualToStorage({ postId: input.postId, index: idx, body: png }),
          ),
        ),
      );
      const imageUrls: string[] = [];
      const storagePaths: string[] = [];
      const failures: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          imageUrls.push(r.value.publicUrl);
          storagePaths.push(r.value.storagePath);
        } else {
          failures.push(`slide_${idx}:${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        }
      });
      if (imageUrls.length === 0) {
        return { kind: visual.kind, status: "failed", reason: failures.join(" | ").slice(0, 400), imageUrls: [], storagePaths: [] };
      }
      return {
        kind: visual.kind,
        status: "rendered",
        reason: failures.length ? `partial_failures: ${failures.join(" | ").slice(0, 200)}` : undefined,
        imageUrls,
        storagePaths,
      };
    }

    return { kind: visual.kind, status: "skipped", reason: "unhandled_kind", imageUrls: [], storagePaths: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: visual.kind, status: "failed", reason: message.slice(0, 400), imageUrls: [], storagePaths: [] };
  }
}

function enrichPrompt(kind: VisualKind, prompt: string, caption?: string): string {
  const baseStyle = "Clean, minimal, high-contrast design for a B2B fintech / investment-banking software brand. Use a calm muted palette (soft navy, slate, warm cream, single accent). No stock-photo people. No watermarks, no logos. No generic AI art. Crisp typography only where called out. 1:1 square aspect.";
  if (kind === "diagram") {
    return `${prompt}\n\nStyle: ${baseStyle} Render as a simple labeled flow diagram (boxes + arrows) on a clean background. Keep labels short and legible. Avoid 3D, no clutter.`;
  }
  if (kind === "screenshot_mock") {
    return `${prompt}\n\nStyle: ${baseStyle} Render as a flat, simplified UI mock (Outlook-like inbox or message thread, or a deal-memory pane). Subtle shadows, no real names or emails — use generic placeholders. No platform logos.`;
  }
  if (kind === "carousel") {
    return `${prompt}${caption ? `\n\nCaption to convey on the slide: ${caption}` : ""}\n\nStyle: ${baseStyle} Render as a single LinkedIn carousel slide. Bold headline, one supporting line, simple icon or shape. Easy to read on mobile.`;
  }
  return `${prompt}\n\nStyle: ${baseStyle}`;
}

export function isMultimodalEnabled(): boolean {
  return multimodalEnabled();
}
