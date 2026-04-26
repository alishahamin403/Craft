import sharp from "sharp";

import {
  getVideoModelInfo,
  getVideoModelsForQuality,
  getVideoQualityInfo,
  VIDEO_MODEL_CATALOG,
  type VideoFormat,
  type VideoModelId,
  type VideoQuality,
} from "@/lib/types";

export interface ImageAnalysis {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface VideoRouteDecision {
  model: VideoModelId;
  quality: VideoQuality;
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
const AUDIO_INTENT =
  /\b(audio|sound|voice|dialogue|talk|talking|say|says|speak|speaks|lipsync|lip sync|music|sfx)\b/i;
const PRODUCT_INTENT =
  /\b(product|perfume|fashion|outfit|clothing|dress|fabric|model|lookbook|brand|commercial|ad)\b/i;
const MOTION_INTENT =
  /\b(run|running|dance|dancing|fight|jump|water|waves|physics|impact|collision|sports|action)\b/i;
const SOCIAL_INTENT =
  /\b(tiktok|reel|shorts|instagram|social|ugc|quick post)\b/i;
const PREMIUM_INTENT =
  /\b(4k|homepage|hero|premium|luxury|campaign|cinematic|film|commercial|high[- ]end)\b/i;

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
  const audioIntent = AUDIO_INTENT.test(input.prompt);
  const productIntent = PRODUCT_INTENT.test(input.prompt);
  const motionIntent = MOTION_INTENT.test(input.prompt);
  const socialIntent = SOCIAL_INTENT.test(input.prompt);
  const premiumIntent = PREMIUM_INTENT.test(input.prompt);
  const imageFormatMismatch =
    (input.image.aspectRatio >= 1.1 && input.format === "portrait") ||
    (input.image.aspectRatio < 0.9 && input.format === "landscape");

  const baseScores: Record<VideoModelId, number> = {
    "minimax-hailuo-fast": 0.72,
    "pixverse-v6": 0.78,
    "kling-2.6": 0.76,
    "ltx-2": 0.8,
    "wan-2.7": 0.86,
    "sora-2": 0.88,
    "veo-3.1-fast": 0.9,
    "kling-3.0": 0.87,
    "veo-3.1": 0.94,
    "kling-v3-4k": 0.96,
  };

  let score = baseScores[input.model];

  if (speedIntent && input.model === "minimax-hailuo-fast") score += 0.24;
  if (speedIntent && input.model === "pixverse-v6") score += 0.12;
  if (speedIntent && input.model === "veo-3.1-fast") score += 0.1;
  if (productIntent && input.model === "pixverse-v6") score += 0.16;
  if (productIntent && input.model === "kling-3.0") score += 0.18;
  if (productIntent && input.model === "wan-2.7") score += 0.12;
  if (audioIntent && input.model === "sora-2") score += 0.32;
  if (audioIntent && input.model === "veo-3.1") score += 0.22;
  if (audioIntent && input.model === "veo-3.1-fast") score += 0.16;
  if (audioIntent && input.model === "ltx-2") score += 0.08;
  if (motionIntent && input.model === "wan-2.7") score += 0.2;
  if (motionIntent && input.model === "veo-3.1") score += 0.12;
  if (socialIntent && input.model === "pixverse-v6") score += 0.18;
  if (premiumIntent && input.model === "kling-v3-4k") score += 0.22;
  if (premiumIntent && input.model === "veo-3.1") score += 0.2;
  if (input.model === "kling-3.0" && qualityIntent) score += 0.14;
  if (input.model === "kling-3.0" && input.requestedSeconds > 10) score += 0.16;
  if (input.model === "kling-3.0" && imageFormatMismatch) score += 0.08;
  if (input.model === "kling-2.6" && !qualityIntent) score += 0.06;
  if (input.requestedSeconds > 10 && input.model === "pixverse-v6") score += 0.08;
  if (input.requestedSeconds > 10 && input.model === "wan-2.7") score += 0.1;
  if (input.requestedSeconds > 10 && input.model === "kling-v3-4k") score += 0.08;

  return score - estimatedCost * 0.18;
}

export function estimateRenderMs(model: VideoModelId | null, seconds: number | null) {
  const duration = seconds ?? DEFAULT_SECONDS;
  const isHigh = model === "kling-v3-4k" || model === "veo-3.1";
  const isFast = model === "minimax-hailuo-fast" || model === "pixverse-v6";
  const baseMs = isHigh ? 150_000 : model === "kling-3.0" || model === "wan-2.7" ? 95_000 : isFast ? 55_000 : 80_000;
  const perSecondMs = isHigh ? 22_000 : model === "kling-3.0" || model === "wan-2.7" ? 13_000 : isFast ? 8_000 : 11_000;

  return Math.min(baseMs + duration * perSecondMs, 12 * 60 * 1000);
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
  requestedQuality?: VideoQuality | null;
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
      quality: getVideoModelInfo(input.requestedModel).quality,
      format,
      requestedSeconds,
      estimatedRenderMs: estimateRenderMs(input.requestedModel, requestedSeconds),
    };
  }

  if (input.requestedQuality) {
    const candidates = getVideoModelsForQuality(input.requestedQuality)
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

    const model = candidates[0]?.model;
    if (model) {
      return {
        model,
        quality: getVideoQualityInfo(input.requestedQuality).id,
        format,
        requestedSeconds,
        estimatedRenderMs: estimateRenderMs(model, requestedSeconds),
      };
    }
  }

  const candidates = VIDEO_MODEL_CATALOG
    .filter((model) => model.autoSelectable)
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
    quality: getVideoModelInfo(model).quality,
    format,
    requestedSeconds,
    estimatedRenderMs: estimateRenderMs(model, requestedSeconds),
  };
}
