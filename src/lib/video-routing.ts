import sharp from "sharp";

import {
  getVideoModelInfo,
  VIDEO_MODEL_CATALOG,
  type VideoFormat,
  type VideoModelId,
} from "@/lib/types";

export interface ImageAnalysis {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface VideoRouteDecision {
  model: VideoModelId;
  format: VideoFormat;
  requestedSeconds: number;
  estimatedRenderMs: number;
}

const DEFAULT_SECONDS = 5;
const MIN_SECONDS = 3;
const MAX_SECONDS = 15;

const LANDSCAPE_INTENT =
  /\b(website|landing|hero|banner|desktop|wide|horizontal|youtube|cinematic|film|commercial|ad)\b/i;
const PORTRAIT_INTENT =
  /\b(reel|tiktok|shorts|story|stories|mobile|vertical|portrait|instagram|social)\b/i;
const QUALITY_INTENT =
  /\b(premium|luxury|fashion|product|brand|model|person|face|clothing|cinematic|commercial|landing|hero|website|smooth|natural|realistic)\b/i;
const SPEED_INTENT =
  /\b(fast|quick|draft|test|preview|cheap|budget|simple)\b/i;

export async function analyzeImage(image: File): Promise<ImageAnalysis> {
  const bytes = Buffer.from(await image.arrayBuffer());
  const meta = await sharp(bytes).rotate().metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  return {
    width,
    height,
    aspectRatio: width / height,
  };
}

export function inferVideoFormat(prompt: string, image: ImageAnalysis): VideoFormat {
  if (LANDSCAPE_INTENT.test(prompt) && !PORTRAIT_INTENT.test(prompt)) {
    return "landscape";
  }

  if (PORTRAIT_INTENT.test(prompt) && !LANDSCAPE_INTENT.test(prompt)) {
    return "portrait";
  }

  if (image.aspectRatio >= 1.1) return "landscape";
  return "portrait";
}

function normalizeRequestedSeconds(value: number | null | undefined) {
  const seconds = Number.isFinite(value) ? Math.round(value!) : DEFAULT_SECONDS;
  return Math.min(Math.max(seconds, MIN_SECONDS), MAX_SECONDS);
}

function modelSupports(model: VideoModelId, format: VideoFormat, seconds: number) {
  const info = getVideoModelInfo(model);
  return info.formats.includes(format) && info.durations.includes(seconds);
}

function routeScore(input: {
  model: VideoModelId;
  prompt: string;
  image: ImageAnalysis;
  format: VideoFormat;
  requestedSeconds: number;
}) {
  const info = getVideoModelInfo(input.model);
  const estimatedCost = info.pricePerSec * input.requestedSeconds;
  const qualityIntent = QUALITY_INTENT.test(input.prompt);
  const speedIntent = SPEED_INTENT.test(input.prompt);
  const imageFormatMismatch =
    (input.image.aspectRatio >= 1.1 && input.format === "portrait") ||
    (input.image.aspectRatio < 0.9 && input.format === "landscape");

  let score = input.model === "kling-3.0" ? 0.86 : 0.78;

  if (input.model === "kling-3.0" && qualityIntent) score += 0.18;
  if (input.model === "kling-3.0" && input.requestedSeconds > 10) score += 0.2;
  if (input.model === "kling-3.0" && imageFormatMismatch) score += 0.08;
  if (input.model === "kling-2.6" && speedIntent) score += 0.12;
  if (input.model === "kling-2.6" && !qualityIntent) score += 0.08;

  return score - estimatedCost * 0.18;
}

export function estimateRenderMs(model: VideoModelId | null, seconds: number | null) {
  const duration = seconds ?? DEFAULT_SECONDS;
  const baseMs = model === "kling-3.0" ? 95_000 : 75_000;
  const perSecondMs = model === "kling-3.0" ? 13_000 : 10_000;

  return Math.min(baseMs + duration * perSecondMs, 8 * 60 * 1000);
}

export function estimateProgress(input: {
  createdAt: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  model: VideoModelId | null;
  requestedSeconds: number;
  submittedSeconds: number | null;
  providerProgress?: number | null;
}) {
  if (input.status === "completed") return 100;
  if (input.status === "failed") return null;

  const estimateMs = estimateRenderMs(
    input.model,
    input.submittedSeconds ?? input.requestedSeconds,
  );
  const elapsedMs = Date.now() - new Date(input.createdAt).getTime();
  const lowerBound = input.status === "in_progress" ? 12 : 4;
  const estimatedProgress = Math.min(
    Math.max(Math.floor((elapsedMs / estimateMs) * 92), lowerBound),
    95,
  );
  const providerProgress = input.providerProgress ?? 0;

  return Math.max(providerProgress, estimatedProgress);
}

export async function selectVideoRoute(input: {
  image: File;
  prompt: string;
  requestedSeconds?: number | null;
  requestedFormat?: VideoFormat | null;
  requestedModel?: VideoModelId | null;
}): Promise<VideoRouteDecision> {
  const image = await analyzeImage(input.image);
  const requestedSeconds = normalizeRequestedSeconds(input.requestedSeconds);
  const format = input.requestedFormat ?? inferVideoFormat(input.prompt, image);

  if (
    input.requestedModel &&
    modelSupports(input.requestedModel, format, requestedSeconds)
  ) {
    return {
      model: input.requestedModel,
      format,
      requestedSeconds,
      estimatedRenderMs: estimateRenderMs(input.requestedModel, requestedSeconds),
    };
  }

  const candidates = VIDEO_MODEL_CATALOG
    .filter((model) =>
      model.formats.includes(format) && model.durations.includes(requestedSeconds),
    )
    .map((model) => ({
      model: model.id,
      score: routeScore({
        model: model.id,
        prompt: input.prompt,
        image,
        format,
        requestedSeconds,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const model = candidates[0]?.model ?? "kling-3.0";

  return {
    model,
    format,
    requestedSeconds,
    estimatedRenderMs: estimateRenderMs(model, requestedSeconds),
  };
}
