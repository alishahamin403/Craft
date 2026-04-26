export const VIDEO_FORMATS = ["portrait", "landscape"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const GENERATION_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "failed",
] as const;

export const VIDEO_MODELS = [
  "minimax-hailuo-fast",
  "pixverse-v6",
  "kling-2.6",
  "ltx-2",
  "wan-2.7",
  "sora-2",
  "veo-3.1-fast",
  "kling-3.0",
  "veo-3.1",
  "kling-v3-4k",
] as const;
export type VideoModelId = (typeof VIDEO_MODELS)[number];

export const VIDEO_QUALITIES = ["low", "medium", "high"] as const;
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

export interface VideoModelInfo {
  id: VideoModelId;
  name: string;
  description: string;
  quality: VideoQuality;
  pricePerSec: number;
  durations: readonly number[];
  formats: readonly VideoFormat[];
  autoSelectable: boolean;
}

export const VIDEO_MODEL_CATALOG: VideoModelInfo[] = [
  {
    id: "minimax-hailuo-fast",
    name: "MiniMax Hailuo Fast",
    description: "Fastest low-cost drafts",
    quality: "low",
    pricePerSec: 0.017,
    durations: [6, 10],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "pixverse-v6",
    name: "PixVerse V6",
    description: "Low-cost social clips",
    quality: "low",
    pricePerSec: 0.045,
    durations: [4, 5, 6, 8, 10, 12, 15],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "kling-2.6",
    name: "Kling 2.6 Pro",
    description: "Best value · smooth motion",
    quality: "low",
    pricePerSec: 0.07,
    durations: [5, 10],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "ltx-2",
    name: "LTX Video 2",
    description: "Efficient 1080p video",
    quality: "medium",
    pricePerSec: 0.06,
    durations: [6, 8, 10],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "wan-2.7",
    name: "Wan 2.7",
    description: "Smooth motion & scene fidelity",
    quality: "medium",
    pricePerSec: 0.1,
    durations: [4, 5, 6, 8, 10, 12, 15],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "sora-2",
    name: "Sora 2",
    description: "Creative motion with native audio",
    quality: "medium",
    pricePerSec: 0.1,
    durations: [4, 8, 12],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "veo-3.1-fast",
    name: "Veo 3.1 Fast",
    description: "Premium realism, faster tier",
    quality: "medium",
    pricePerSec: 0.1,
    durations: [4, 6, 8],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "kling-3.0",
    name: "Kling 3.0 Pro",
    description: "Latest · enhanced quality & consistency",
    quality: "medium",
    pricePerSec: 0.112,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    formats: VIDEO_FORMATS,
    autoSelectable: true,
  },
  {
    id: "veo-3.1",
    name: "Veo 3.1",
    description: "Premium realism",
    quality: "high",
    pricePerSec: 0.2,
    durations: [4, 6, 8],
    formats: VIDEO_FORMATS,
    autoSelectable: false,
  },
  {
    id: "kling-v3-4k",
    name: "Kling V3 4K",
    description: "Native 4K · highest fidelity",
    quality: "high",
    pricePerSec: 0.42,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    formats: VIDEO_FORMATS,
    autoSelectable: false,
  },
];

export function getVideoModelInfo(model: VideoModelId) {
  return VIDEO_MODEL_CATALOG.find((item) => item.id === model)!;
}

export interface VideoQualityInfo {
  id: VideoQuality;
  name: string;
  description: string;
  model: VideoModelId;
  models: readonly VideoModelId[];
}

export const VIDEO_QUALITY_CATALOG: VideoQualityInfo[] = [
  {
    id: "low",
    name: "Low",
    description: "Lowest cost for quick drafts",
    model: "pixverse-v6",
    models: ["minimax-hailuo-fast", "pixverse-v6", "kling-2.6"],
  },
  {
    id: "medium",
    name: "Medium",
    description: "Balanced quality and cost",
    model: "kling-3.0",
    models: ["ltx-2", "wan-2.7", "sora-2", "veo-3.1-fast", "kling-3.0"],
  },
  {
    id: "high",
    name: "High",
    description: "Most expensive, best output",
    model: "kling-v3-4k",
    models: ["veo-3.1", "kling-v3-4k"],
  },
];

export function getVideoQualityInfo(quality: VideoQuality) {
  return VIDEO_QUALITY_CATALOG.find((item) => item.id === quality)!;
}

export function getVideoModelsForQuality(quality: VideoQuality) {
  return getVideoQualityInfo(quality).models.map((model) => getVideoModelInfo(model));
}

export function getVideoQualityForModel(model: VideoModelId | null) {
  if (!model) return null;
  return getVideoModelInfo(model).quality;
}

export function estimateVideoCost(model: VideoModelId, seconds: number) {
  return getVideoModelInfo(model).pricePerSec * seconds;
}

export function formatEstimatedCost(cost: number) {
  const roundedCost = Math.round((cost + Number.EPSILON) * 100) / 100;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundedCost);
}

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export interface GenerationRow {
  id: string;
  idempotencyKey: string | null;
  prompt: string;
  userPrompt: string | null;
  model: VideoModelId | null;
  status: GenerationStatus;
  format: VideoFormat;
  requestedSeconds: number;
  submittedSeconds: number | null;
  sourceImagePath: string;
  videoPath: string | null;
  thumbnailPath: string | null;
  openaiVideoId: string | null;
  errorMessage: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationRecord {
  id: string;
  prompt: string;
  userPrompt: string | null;
  model: VideoModelId | null;
  modelName: string | null;
  quality: VideoQuality | null;
  estimatedCost: string | null;
  status: GenerationStatus;
  requestedSeconds: number;
  submittedSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  sourceImageUrl: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  progress: number | null;
  estimatedRenderMs: number;
  mediaAspectRatio: "9/16" | "16/9";
}

export interface GenerationItemResponse {
  item: GenerationRecord;
}

export interface GenerationListResponse {
  items: GenerationRecord[];
}
