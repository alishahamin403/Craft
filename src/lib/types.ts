export const VIDEO_FORMATS = ["portrait", "landscape"] as const;
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
  durations: number[];
}

export const VIDEO_MODEL_CATALOG: VideoModelInfo[] = [
  {
    id: "kling-2.6",
    name: "Kling 2.6 Pro",
    description: "Best value · smooth motion",
    pricePerSec: 0.07,
    durations: [5, 10],
  },
  {
    id: "kling-3.0",
    name: "Kling 3.0 Pro",
    description: "Latest · enhanced quality & consistency",
    pricePerSec: 0.112,
    durations: [5, 10],
  },
];

export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export interface GenerationRow {
  id: string;
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

export interface GenerationRecord extends GenerationRow {
  sourceImageUrl: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  progress: number | null;
}

export interface GenerationItemResponse {
  item: GenerationRecord;
}

export interface GenerationListResponse {
  items: GenerationRecord[];
}
