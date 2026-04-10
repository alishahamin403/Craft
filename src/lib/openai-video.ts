/**
 * Video generation via Kling 2.6 Pro (fal.ai)
 * Replaces the previous OpenAI Sora implementation.
 * All external interfaces (VideoJobSnapshot, createVideoJob, retrieveVideoJob,
 * downloadVideoAsset) are preserved so no other files need to change.
 */

import sharp from "sharp";

import { getFalAPIKey } from "@/lib/config";
import type { VideoFormat, VideoModelId } from "@/lib/types";

const VIDEO_SIZE_BY_FORMAT: Record<VideoFormat, { width: number; height: number }> = {
  portrait: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VideoJobSnapshot {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress: number | null;
  submittedSeconds: number | null;
  errorMessage: string | null;
  size: string | null;
  expiresAt: string | null;
}

export class OpenAIVideoRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "VideoRequestError";
  }
}

// ── Fal.ai status → internal status ──────────────────────────────────────────

type FalStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;

function mapFalStatus(
  falStatus: FalStatus,
): VideoJobSnapshot["status"] {
  switch (falStatus) {
    case "IN_QUEUE":   return "queued";
    case "IN_PROGRESS": return "in_progress";
    case "COMPLETED":  return "completed";
    case "FAILED":     return "failed";
    default:           return "queued";
  }
}

// ── Duration mapping ──────────────────────────────────────────────────────────
// Kling only supports 5s or 10s. Map user-requested seconds accordingly.

function toKlingDuration(requestedSeconds: number): "5" | "10" {
  return requestedSeconds <= 5 ? "5" : "10";
}

// ── Image → base64 data URI (accepted directly by Kling) ─────────────────────

// OpenAI gpt-image-1 supported sizes closest to our target formats
const OUTPAINT_CANVAS: Record<VideoFormat, { w: number; h: number; size: "1536x1024" | "1024x1536" }> = {
  landscape: { w: 1536, h: 1024, size: "1536x1024" },
  portrait:  { w: 1024, h: 1536, size: "1024x1536" },
};

/**
 * When the source image aspect ratio is the opposite orientation from the
 * target format (portrait image → landscape video, or vice versa) the
 * mismatch is large enough (~3×) that simple "cover" crop loses half the
 * subject. Instead we outpaint: place the image centred on a canvas of the
 * target orientation, blur-extend the edges as background context, then let
 * gpt-image-1 fill the empty sides naturally.
 */
async function outpaintToFormat(
  imageBytes: Buffer,
  format: VideoFormat,
  prompt: string,
): Promise<string> {
  const { width: targetW, height: targetH } = VIDEO_SIZE_BY_FORMAT[format];
  const { w: canvasW, h: canvasH, size } = OUTPAINT_CANVAS[format];

  // Fix EXIF rotation, work as PNG so alpha is preserved later
  const rotated = await sharp(imageBytes).rotate().png().toBuffer();
  const meta = await sharp(rotated).metadata();
  const imgW = meta.width ?? 1;
  const imgH = meta.height ?? 1;

  // Scale image to fit inside canvas (letterbox, not crop)
  const scale = Math.min(canvasW / imgW, canvasH / imgH);
  const scaledW = Math.round(imgW * scale);
  const scaledH = Math.round(imgH * scale);
  const offsetX = Math.round((canvasW - scaledW) / 2);
  const offsetY = Math.round((canvasH - scaledH) / 2);

  const scaledImg = await sharp(rotated)
    .resize(scaledW, scaledH, { fit: "fill" })
    .png()
    .toBuffer();

  // Background: portrait blurred to fill canvas — gives gpt-image-1 colour/
  // lighting context so the filled sides feel continuous, not hallucinated.
  const bgBuffer = await sharp(rotated)
    .resize(canvasW, canvasH, { fit: "cover", position: "centre" })
    .blur(24)
    .jpeg({ quality: 80 })
    .toBuffer();

  // Composite: blurred background + sharp centred portrait
  const imageCanvas = await sharp(bgBuffer)
    .composite([{ input: scaledImg, left: offsetX, top: offsetY }])
    .jpeg({ quality: 92 })
    .toBuffer();

  // Mask: transparent (alpha=0) = "fill this area", opaque = "keep as-is"
  // Sides/top/bottom around the portrait are transparent; portrait area is opaque.
  const opaqueRect = await sharp({
    create: { width: scaledW, height: scaledH, channels: 4,
               background: { r: 255, g: 255, b: 255, alpha: 255 } },
  }).png().toBuffer();

  const maskBuffer = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4,
               background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: opaqueRect, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();

  // Call gpt-image-1 outpainting
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: getOpenAIAPIKey() });

  const imageFile = new File([imageCanvas], "image.jpg", { type: "image/jpeg" });
  const maskFile  = new File([maskBuffer],  "mask.png",  { type: "image/png"  });

  console.log(`[Outpaint] Calling gpt-image-1 (${size}) to extend ${format} frame…`);

  const aiResponse = await openai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    mask: maskFile,
    prompt: `Naturally extend the photograph to fill the full frame, seamlessly matching the existing lighting, colours, and background. ${prompt}`,
    size,
    quality: "medium",
    n: 1,
  });

  const b64 = aiResponse.data[0]?.b64_json;
  if (!b64) {
    console.warn("[Outpaint] gpt-image-1 returned no image, falling back to cover crop");
    const fallback = await sharp(imageBytes)
      .rotate()
      .resize(targetW, targetH, { fit: "cover", position: "centre", withoutEnlargement: false })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${fallback.toString("base64")}`;
  }

  // Resize/crop the outpainted result to exact Kling dimensions
  const final = await sharp(Buffer.from(b64, "base64"))
    .resize(targetW, targetH, { fit: "cover", position: "centre", withoutEnlargement: false })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  console.log("[Outpaint] Done — final size:", final.length, "bytes");
  return `data:image/jpeg;base64,${final.toString("base64")}`;
}

async function buildImageDataUri(image: File, format: VideoFormat, prompt: string): Promise<string> {
  const { width, height } = VIDEO_SIZE_BY_FORMAT[format];
  const bytes = Buffer.from(await image.arrayBuffer());

  // Detect significant orientation mismatch (portrait→landscape or landscape→portrait)
  const meta = await sharp(bytes).metadata();
  const imgAspect = (meta.width ?? 1) / (meta.height ?? 1);
  const targetAspect = width / height;
  const mismatchRatio = Math.max(imgAspect, targetAspect) / Math.min(imgAspect, targetAspect);

  if (mismatchRatio > 1.8) {
    // Opposite orientations — outpaint to fill sides instead of cropping
    return outpaintToFormat(bytes, format, prompt);
  }

  // Same orientation — simple cover crop, no outpainting needed
  const normalized = await sharp(bytes)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre", withoutEnlargement: false })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return `data:image/jpeg;base64,${normalized.toString("base64")}`;
}

// ── Submit job ────────────────────────────────────────────────────────────────

const SUBMIT_URLS: Record<VideoModelId, string> = {
  "kling-2.6": "https://queue.fal.run/fal-ai/kling-video/v2.6/pro/image-to-video",
  "kling-3.0": "https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video",
};

// fal.ai status/result/cancel URLs use a shorter base (without version/variant path).
// Confirmed from submit response: status_url, response_url, cancel_url all use this base.
const FAL_REQUESTS_BASE = "https://queue.fal.run/fal-ai/kling-video/requests";

interface FalSubmitResponse {
  request_id: string;
  response_url: string;
  status_url: string;
}

interface FalStatusResponse {
  status: FalStatus;
  request_id?: string;
  response_url?: string;
  error?: string | null;
  logs?: { message: string }[];
}

interface FalResultResponse {
  video?: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  error?: string | null;
}

export async function createVideoJob(input: {
  image: File;
  prompt: string;
  format: VideoFormat;
  requestedSeconds: number;
  model: VideoModelId;
}): Promise<VideoJobSnapshot> {
  const imageUrl = await buildImageDataUri(input.image, input.format, input.prompt);
  const duration = toKlingDuration(input.requestedSeconds);
  const submitUrl = SUBMIT_URLS[input.model] ?? SUBMIT_URLS["kling-2.6"];

  const response = await fetch(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${getFalAPIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      start_image_url: imageUrl,
      duration,
      generate_audio: false,
      negative_prompt:
        "blur, distortion, pixelation, artifacts, warping, flickering, low quality, noise, grain, overexposure, bad anatomy",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new OpenAIVideoRequestError(
      `Kling job submission failed: ${text}`,
      response.status,
    );
  }

  const raw = await response.text();
  console.log("[Kling] submit response:", raw);
  const data = JSON.parse(raw) as FalSubmitResponse;

  if (!data.request_id) {
    throw new OpenAIVideoRequestError(
      `Kling submit returned no request_id. Response: ${raw}`,
      200,
    );
  }

  return {
    id: data.request_id,
    status: "queued",
    progress: null,
    submittedSeconds: Number(duration),
    errorMessage: null,
    size: null,
    expiresAt: null,
  };
}

// ── Retrieve / poll job ───────────────────────────────────────────────────────

export async function retrieveVideoJob(
  requestId: string,
): Promise<VideoJobSnapshot> {
  // fal.ai queue status: GET https://queue.fal.run/{model}/requests/{id}/status
  const statusUrl = `${FAL_REQUESTS_BASE}/${requestId}/status`;

  const statusRes = await fetch(statusUrl, {
    method: "GET",
    headers: { Authorization: `Key ${getFalAPIKey()}` },
    cache: "no-store",
  });

  if (!statusRes.ok) {
    throw new OpenAIVideoRequestError(
      `Failed to retrieve job status (HTTP ${statusRes.status})`,
      statusRes.status,
    );
  }

  const statusData = (await statusRes.json()) as FalStatusResponse;
  const status = mapFalStatus(statusData.status);

  if (status === "completed") {
    // Use response_url from status payload (guaranteed correct) or fall back to constructed URL
    const resultUrl = statusData.response_url ?? `${FAL_REQUESTS_BASE}/${requestId}`;

    const resultRes = await fetch(resultUrl, {
      method: "GET",
      headers: { Authorization: `Key ${getFalAPIKey()}` },
      cache: "no-store",
    });

    if (!resultRes.ok) {
      throw new OpenAIVideoRequestError(
        `Kling job completed but result fetch failed (HTTP ${resultRes.status})`,
        resultRes.status,
      );
    }

    const result = (await resultRes.json()) as FalResultResponse;

    if (!result.video?.url) {
      throw new OpenAIVideoRequestError(
        `Kling job completed but response contained no video URL. Raw: ${JSON.stringify(result)}`,
        200,
      );
    }

    return {
      id: requestId,
      status: "completed",
      progress: 100,
      submittedSeconds: null,
      errorMessage: null,
      size: null,
      expiresAt: null,
    };
  }

  if (status === "failed") {
    return {
      id: requestId,
      status: "failed",
      progress: null,
      submittedSeconds: null,
      errorMessage: statusData.error ?? "Kling video generation failed.",
      size: null,
      expiresAt: null,
    };
  }

  // IN_QUEUE or IN_PROGRESS
  const logCount = statusData.logs?.length ?? 0;
  const progress = status === "in_progress" ? Math.min(10 + logCount * 5, 85) : null;

  return {
    id: requestId,
    status,
    progress,
    submittedSeconds: null,
    errorMessage: null,
    size: null,
    expiresAt: null,
  };
}

// ── Download video asset ──────────────────────────────────────────────────────
// Fetches the fal.ai result to get the video URL, then downloads the bytes.
// The `variant` param is kept for interface compatibility but Kling only provides
// a video — we use the source image as the thumbnail elsewhere.

export async function downloadVideoAsset(
  requestId: string,
  variant: "video" | "thumbnail",
): Promise<{ buffer: Buffer; contentType: string | null }> {
  if (variant === "thumbnail") {
    // Kling doesn't produce a separate thumbnail — caller uses sourceImageUrl
    throw new Error("Thumbnail not available for Kling; use source image instead.");
  }

  // GET the result — same URL used in retrieveVideoJob when status=COMPLETED
  const resultRes = await fetch(`${FAL_REQUESTS_BASE}/${requestId}`, {
    method: "GET",
    headers: { Authorization: `Key ${getFalAPIKey()}` },
    cache: "no-store",
  });

  if (!resultRes.ok) {
    throw new OpenAIVideoRequestError(
      "Failed to fetch Kling result.",
      resultRes.status,
    );
  }

  const result = (await resultRes.json()) as FalResultResponse;
  const videoUrl = result.video?.url;

  if (!videoUrl) {
    throw new Error("No video URL in Kling result.");
  }

  // Download the actual video bytes
  const videoRes = await fetch(videoUrl, { cache: "no-store" });
  if (!videoRes.ok) {
    throw new Error(`Failed to download Kling video from ${videoUrl}`);
  }

  return {
    buffer: Buffer.from(await videoRes.arrayBuffer()),
    contentType: videoRes.headers.get("content-type") ?? "video/mp4",
  };
}

// ── Cancel job ────────────────────────────────────────────────────────────────

export async function cancelVideoJob(requestId: string): Promise<void> {
  await fetch(`${FAL_REQUESTS_BASE}/${requestId}/cancel`, {
    method: "PUT",
    headers: { Authorization: `Key ${getFalAPIKey()}` },
    cache: "no-store",
  });
  // Ignore errors — we'll mark as cancelled locally regardless
}

// ── Kept for compatibility with existing imports ───────────────────────────────
export function getVideoSizeForFormat(format: VideoFormat) {
  const { width, height } = VIDEO_SIZE_BY_FORMAT[format];
  return `${width}x${height}`;
}
