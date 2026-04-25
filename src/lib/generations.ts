import { randomUUID } from "node:crypto";

import {
  buildGeneratedFileName,
  buildMediaUrl,
  ensureStorageDirectories,
  saveGeneratedAsset,
  saveUploadedImage,
} from "@/lib/file-storage";
import {
  deleteGeneration,
  getGenerationByIdempotencyKey,
  getGenerationByIdForOwner,
  insertGeneration,
  listGenerations,
  updateGeneration,
} from "@/lib/db";
import {
  cancelVideoJob,
  createVideoJob,
  downloadVideoAsset,
  retrieveVideoJob,
} from "@/lib/openai-video";
import { estimateProgress, estimateRenderMs, selectVideoRoute } from "@/lib/video-routing";
import type { GenerationRecord, GenerationRow, VideoFormat, VideoModelId } from "@/lib/types";

function getPublicErrorMessage(errorMessage: string | null) {
  if (!errorMessage) return null;

  if (
    /Failed to retrieve job status \(HTTP 405\)/i.test(errorMessage) ||
    /Method Not Allowed/i.test(errorMessage)
  ) {
    return "Generation status could not be checked. Please retry this clip.";
  }

  return errorMessage;
}

function toGenerationRecord(
  row: GenerationRow,
  progress: number | null = null,
): GenerationRecord {
  const effectiveSeconds = row.submittedSeconds ?? row.requestedSeconds;

  return {
    id: row.id,
    prompt: row.prompt,
    userPrompt: row.userPrompt,
    status: row.status,
    requestedSeconds: row.requestedSeconds,
    submittedSeconds: row.submittedSeconds,
    errorMessage: getPublicErrorMessage(row.errorMessage),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sourceImageUrl: buildMediaUrl(row.sourceImagePath)!,
    videoUrl: buildMediaUrl(row.videoPath),
    thumbnailUrl: buildMediaUrl(row.thumbnailPath),
    estimatedRenderMs: estimateRenderMs(row.model, effectiveSeconds),
    mediaAspectRatio: row.format === "portrait" ? "9/16" : "16/9",
    progress: estimateProgress({
      createdAt: row.createdAt,
      status: row.status,
      model: row.model,
      requestedSeconds: row.requestedSeconds,
      submittedSeconds: row.submittedSeconds,
      providerProgress: progress,
    }),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function isIdempotencyConstraintError(error: unknown) {
  return error instanceof Error &&
    /(UNIQUE constraint failed: (generations\.ownerId, generations\.idempotencyKey|generations\.idempotencyKey)|duplicate key value violates unique constraint)/i.test(error.message);
}

async function finalizeCompletedGeneration(
  row: GenerationRow,
  videoId: string,
  remoteVideoUrl: string | null = null,
) {
  if (remoteVideoUrl) {
    try {
      const videoResponse = await fetch(remoteVideoUrl, { cache: "no-store" });
      if (!videoResponse.ok) {
        throw new Error(`Failed to download completed video (${videoResponse.status}).`);
      }

      const videoPath = await saveGeneratedAsset(
        "videos",
        buildGeneratedFileName(
          row.id,
          videoResponse.headers.get("content-type") ?? "video/mp4",
          ".mp4",
        ),
        Buffer.from(await videoResponse.arrayBuffer()),
        row.ownerId,
      );

      return await updateGeneration(row.id, {
        status: "completed",
        videoPath,
        thumbnailPath: row.thumbnailPath,
        errorMessage: null,
      });
    } catch {
      return await updateGeneration(row.id, {
        status: "completed",
        videoPath: remoteVideoUrl,
        thumbnailPath: row.thumbnailPath,
        errorMessage: null,
      });
    }
  }

  const videoAsset = await downloadVideoAsset(videoId, "video");
  const videoPath = await saveGeneratedAsset(
    "videos",
    buildGeneratedFileName(row.id, videoAsset.contentType, ".mp4"),
    videoAsset.buffer,
    row.ownerId,
  );

  let thumbnailPath: string | null = row.thumbnailPath;
  try {
    const thumbnailAsset = await downloadVideoAsset(videoId, "thumbnail");
    thumbnailPath = await saveGeneratedAsset(
      "thumbnails",
      buildGeneratedFileName(row.id, thumbnailAsset.contentType, ".webp"),
      thumbnailAsset.buffer,
      row.ownerId,
    );
  } catch {
    thumbnailPath = row.thumbnailPath;
  }

  return await updateGeneration(row.id, {
    status: "completed",
    videoPath,
    thumbnailPath,
    errorMessage: null,
  });
}

export function deleteGenerationRecord(id: string) {
  return deleteGeneration(id);
}

export async function cancelAndDeleteGenerationRecord(id: string, ownerId: string): Promise<boolean> {
  const row = await getGenerationByIdForOwner(id, ownerId);
  if (!row) return false;

  if (row.openaiVideoId && (row.status === "queued" || row.status === "in_progress")) {
    try { await cancelVideoJob(row.openaiVideoId); } catch { /* ignore */ }
  }

  await deleteGeneration(id);
  return true;
}

async function cancelGenerationRow(row: GenerationRow) {
  if (row.openaiVideoId) {
    try { await cancelVideoJob(row.openaiVideoId); } catch { /* ignore */ }
  }

  const cancelled = await updateGeneration(row.id, {
    status: "failed",
    errorMessage: "Cancelled by user.",
  });

  return toGenerationRecord(cancelled);
}

export async function cancelGenerationRecordForOwner(id: string, ownerId: string) {
  const row = await getGenerationByIdForOwner(id, ownerId);
  if (!row) return null;

  return cancelGenerationRow(row);
}

export async function listGenerationRecords(ownerId?: string) {
  const rows = await listGenerations(ownerId);
  return rows.map((row) => toGenerationRecord(row));
}

export async function createGenerationEntry(input: {
  image: File;
  prompt: string;
  userPrompt: string;
  idempotencyKey?: string;
  model?: VideoModelId;
  format?: VideoFormat;
  requestedSeconds: number;
  ownerId: string;
}) {
  if (input.idempotencyKey) {
    const existing = await getGenerationByIdempotencyKey(input.idempotencyKey, input.ownerId);
    if (existing) {
      return toGenerationRecord(existing);
    }
  }

  await ensureStorageDirectories();
  const route = await selectVideoRoute({
    image: input.image,
    prompt: input.userPrompt || input.prompt,
    requestedSeconds: input.requestedSeconds,
    requestedFormat: input.format ?? null,
    requestedModel: input.model ?? null,
  });

  const now = new Date().toISOString();
  let row: GenerationRow;
  try {
    row = await insertGeneration({
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey ?? null,
      prompt: input.prompt,
      userPrompt: input.userPrompt,
      model: route.model,
      status: "queued",
      format: route.format,
      requestedSeconds: route.requestedSeconds,
      submittedSeconds: null,
      sourceImagePath: await saveUploadedImage(input.image, input.ownerId),
      videoPath: null,
      thumbnailPath: null,
      openaiVideoId: null,
      errorMessage: null,
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (input.idempotencyKey && isIdempotencyConstraintError(error)) {
      const existing = await getGenerationByIdempotencyKey(input.idempotencyKey, input.ownerId);
      if (existing) return toGenerationRecord(existing);
    }

    throw error;
  }

  try {
    const job = await createVideoJob({
      image: input.image,
      prompt: input.prompt,
      model: route.model,
      format: route.format,
      requestedSeconds: route.requestedSeconds,
    });

    let updated = await updateGeneration(row.id, {
      status: job.status,
      openaiVideoId: job.id,
      submittedSeconds: job.submittedSeconds,
      errorMessage: job.errorMessage,
    });

    if (job.status === "completed") {
      updated = await finalizeCompletedGeneration(updated, job.id, job.videoUrl);
    }

    if (job.status === "failed") {
      updated = await updateGeneration(row.id, {
        status: "failed",
        errorMessage: job.errorMessage ?? "Video generation failed.",
      });
    }

    return toGenerationRecord(updated, job.progress);
  } catch (error) {
    const failed = await updateGeneration(row.id, {
      status: "failed",
      errorMessage: getErrorMessage(error),
    });

    return toGenerationRecord(failed);
  }
}

const MAX_JOB_TIMEOUT_MS = 8 * 60 * 1000;

async function refreshGenerationRow(row: GenerationRow) {
  if (
    row.status === "completed" ||
    row.status === "failed" ||
    !row.openaiVideoId
  ) {
    return toGenerationRecord(row);
  }

  // Auto-cancel jobs that have been running too long
  const age = Date.now() - new Date(row.createdAt).getTime();
  const timeoutMs = Math.min(
    estimateRenderMs(row.model, row.submittedSeconds ?? row.requestedSeconds) + 3 * 60 * 1000,
    MAX_JOB_TIMEOUT_MS,
  );
  if (age > timeoutMs) {
    try { await cancelVideoJob(row.openaiVideoId); } catch { /* ignore */ }
    const timedOut = await updateGeneration(row.id, {
      status: "failed",
      errorMessage: "Generation took longer than expected and was automatically stopped.",
    });
    return toGenerationRecord(timedOut);
  }

  try {
    const job = await retrieveVideoJob(row.openaiVideoId);

    if (job.status === "completed") {
      const completedRow = await finalizeCompletedGeneration(row, row.openaiVideoId, job.videoUrl);
      return toGenerationRecord(completedRow, job.progress);
    }

    if (job.status === "failed") {
      const failedRow = await updateGeneration(row.id, {
        status: "failed",
        submittedSeconds: job.submittedSeconds,
        errorMessage: job.errorMessage ?? "Video generation failed.",
      });

      return toGenerationRecord(failedRow);
    }

    const pendingRow = await updateGeneration(row.id, {
      status: job.status,
      submittedSeconds: job.submittedSeconds,
      errorMessage: null,
    });

    return toGenerationRecord(pendingRow, job.progress);
  } catch (error) {
    const failed = await updateGeneration(row.id, {
      status: "failed",
      errorMessage: getErrorMessage(error),
    });

    return toGenerationRecord(failed);
  }
}

export async function refreshGenerationRecordForOwner(id: string, ownerId: string) {
  const row = await getGenerationByIdForOwner(id, ownerId);
  if (!row) {
    return null;
  }

  return refreshGenerationRow(row);
}
