export const VIDEO_FORMATS = ["portrait", "landscape"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const GENERATION_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "failed",
] as const;

export const VIDEO_MODELS = ["kling-2.6", "kling-3.0"] as const;
export type VideoModelId = (typeof VIDEO_MODELS)[number];

export interface VideoModelInfo {
  id: VideoModelId;
  name: string;
  description: string;
  pricePerSec: number;
  durations: readonly number[];
  formats: readonly VideoFormat[];
}

export const VIDEO_MODEL_CATALOG: VideoModelInfo[] = [
  {
    id: "kling-2.6",
    name: "Kling 2.6 Pro",
    description: "Best value · smooth motion",
    pricePerSec: 0.07,
    durations: [5, 10],
    formats: VIDEO_FORMATS,
  },
  {
    id: "kling-3.0",
    name: "Kling 3.0 Pro",
    description: "Latest · enhanced quality & consistency",
    pricePerSec: 0.112,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    formats: VIDEO_FORMATS,
  },
];

export function getVideoModelInfo(model: VideoModelId) {
  return VIDEO_MODEL_CATALOG.find((item) => item.id === model)!;
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
