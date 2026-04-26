export const VIDEO_FORMATS = ["portrait", "landscape"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const GENERATION_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "failed",
] as const;

export const VIDEO_MODELS = ["kling-2.6", "kling-3.0", "kling-v3-4k"] as const;
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
}

export const VIDEO_QUALITY_CATALOG: VideoQualityInfo[] = [
  {
    id: "low",
    name: "Low",
    description: "Lowest cost for quick drafts",
    model: "kling-2.6",
  },
  {
    id: "medium",
    name: "Medium",
    description: "Balanced quality and cost",
    model: "kling-3.0",
  },
  {
    id: "high",
    name: "High",
    description: "Most expensive, best output",
    model: "kling-v3-4k",
  },
];

export function getVideoQualityInfo(quality: VideoQuality) {
  return VIDEO_QUALITY_CATALOG.find((item) => item.id === quality)!;
}

export function getVideoQualityForModel(model: VideoModelId | null) {
  if (!model) return null;
  return getVideoModelInfo(model).quality;
}

export function estimateVideoCost(model: VideoModelId, seconds: number) {
  return getVideoModelInfo(model).pricePerSec * seconds;
}

export function formatEstimatedCost(cost: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
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
