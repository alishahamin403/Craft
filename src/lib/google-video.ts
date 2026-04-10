/**
 * Veo 2 video generation via Google AI SDK (@google/genai).
 * Exposes the same external interface as openai-video.ts so generations.ts
 * can route by model without any caller changes.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import sharp from "sharp";
import { GenerateVideosOperation, GoogleGenAI } from "@google/genai";

import { getGoogleAPIKey } from "@/lib/config";
import type { VideoFormat } from "@/lib/types";
import type { VideoJobSnapshot } from "@/lib/openai-video";

export type { VideoJobSnapshot };

// ── Aspect ratio mapping ──────────────────────────────────────────────────────

const ASPECT_RATIO: Record<VideoFormat, "9:16" | "16:9"> = {
  portrait: "9:16",
  landscape: "16:9",
};

// Veo 2 only supports 5 or 8 seconds
function toVeoDuration(requestedSeconds: number): 5 | 8 {
  return requestedSeconds <= 5 ? 5 : 8;
}

// ── In-memory store: operationName → videoBase64 (after completion) ───────────
// We store the base64 video in memory keyed by operationName so
// downloadVideoAsset can retrieve it without hitting the API again.
const completedVideos = new Map<string, string>();

// ── Submit job ────────────────────────────────────────────────────────────────

export async function createVeoJob(input: {
  image: File;
  prompt: string;
  format: VideoFormat;
  requestedSeconds: number;
}): Promise<VideoJobSnapshot> {
  const ai = new GoogleGenAI({ apiKey: getGoogleAPIKey() });

  // Resize image to a sensible size (Veo 2 accepts up to ~20 MB)
  const bytes = Buffer.from(await input.image.arrayBuffer());
  const resized = await sharp(bytes)
    .rotate()
    .resize(1080, 1920, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const imageBase64 = resized.toString("base64");
  const duration = toVeoDuration(input.requestedSeconds);

  console.log(`[Veo2] Submitting job — format: ${input.format}, duration: ${duration}s`);

  const operation = await ai.models.generateVideos({
    model: "veo-2.0-generate-001",
    source: {
      prompt: input.prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: "image/jpeg",
      },
    },
    config: {
      numberOfVideos: 1,
      durationSeconds: duration,
      aspectRatio: ASPECT_RATIO[input.format],
    },
  });

  const operationName = operation.name;
  if (!operationName) {
    throw new Error("Veo 2 returned no operation name.");
  }

  console.log("[Veo2] Operation submitted:", operationName);

  return {
    id: operationName,
    status: "queued",
    progress: null,
    submittedSeconds: duration,
    errorMessage: null,
    size: null,
    expiresAt: null,
  };
}

// ── Poll job ──────────────────────────────────────────────────────────────────

export async function retrieveVeoJob(operationName: string): Promise<VideoJobSnapshot> {
  // Already completed and cached
  if (completedVideos.has(operationName)) {
    return {
      id: operationName,
      status: "completed",
      progress: 100,
      submittedSeconds: null,
      errorMessage: null,
      size: null,
      expiresAt: null,
    };
  }

  const ai = new GoogleGenAI({ apiKey: getGoogleAPIKey() });

  const pendingOperation = new GenerateVideosOperation();
  pendingOperation.name = operationName;
  pendingOperation.done = false;

  const operation = await ai.operations.getVideosOperation({
    operation: pendingOperation,
  });

  if (operation.done && operation.response?.generatedVideos?.length) {
    const video = operation.response.generatedVideos[0].video;

    // Prefer inline bytes; fall back to downloading from URI
    let videoBase64: string | undefined = video?.videoBytes;

    if (!videoBase64 && video?.uri) {
      console.log("[Veo2] Downloading video from URI:", video.uri);
      const tmpPath = path.join(os.tmpdir(), `veo2-${Date.now()}.mp4`);
      try {
        await ai.files.download({ file: operation.response.generatedVideos[0], downloadPath: tmpPath });
        const buf = await fs.readFile(tmpPath);
        videoBase64 = buf.toString("base64");
      } finally {
        await fs.unlink(tmpPath).catch(() => undefined);
      }
    }

    if (!videoBase64) {
      return {
        id: operationName,
        status: "failed",
        progress: null,
        submittedSeconds: null,
        errorMessage: "Veo 2 completed but returned no video data.",
        size: null,
        expiresAt: null,
      };
    }

    completedVideos.set(operationName, videoBase64);
    console.log("[Veo2] Job complete, video cached.");

    return {
      id: operationName,
      status: "completed",
      progress: 100,
      submittedSeconds: null,
      errorMessage: null,
      size: null,
      expiresAt: null,
    };
  }

  if (operation.done && !operation.response?.generatedVideos?.length) {
    return {
      id: operationName,
      status: "failed",
      progress: null,
      submittedSeconds: null,
      errorMessage: "Veo 2 generation failed — no videos in response.",
      size: null,
      expiresAt: null,
    };
  }

  // Still in progress
  return {
    id: operationName,
    status: "in_progress",
    progress: null,
    submittedSeconds: null,
    errorMessage: null,
    size: null,
    expiresAt: null,
  };
}

// ── Download video ────────────────────────────────────────────────────────────

export async function downloadVeoVideo(
  operationName: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const b64 = completedVideos.get(operationName);
  if (!b64) {
    throw new Error("Veo 2 video not found in cache. Has the job completed?");
  }
  return {
    buffer: Buffer.from(b64, "base64"),
    contentType: "video/mp4",
  };
}

// ── Cancel (no-op — Veo 2 operations cannot be cancelled via Gemini API) ──────
export async function cancelVeoJob(_operationName: string): Promise<void> {
  void _operationName;
  // Gemini API does not expose a cancel endpoint for video operations
}
