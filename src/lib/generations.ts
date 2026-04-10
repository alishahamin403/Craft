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
  getGenerationById,
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
import type { GenerationRecord, GenerationRow, VideoFormat, VideoModelId } from "@/lib/types";

function toGenerationRecord(
  row: GenerationRow,
  progress: number | null = null,
): GenerationRecord {
  return {
    ...row,
    sourceImageUrl: buildMediaUrl(row.sourceImagePath)!,
    videoUrl: buildMediaUrl(row.videoPath),
    thumbnailUrl: buildMediaUrl(row.thumbnailPath),
    progress,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

async function finalizeCompletedGeneration(row: GenerationRow, videoId: string) {
  const videoAsset = await downloadVideoAsset(videoId, "video");
  const videoPath = await saveGeneratedAsset(
    "videos",
    buildGeneratedFileName(row.id, videoAsset.contentType, ".mp4"),
    videoAsset.buffer,
  );

  let thumbnailPath: string | null = row.thumbnailPath;
  try {
    const thumbnailAsset = await downloadVideoAsset(videoId, "thumbnail");
    thumbnailPath = await saveGeneratedAsset(
      "thumbnails",
      buildGeneratedFileName(row.id, thumbnailAsset.contentType, ".webp"),
      thumbnailAsset.buffer,
    );
  } catch {
    thumbnailPath = row.thumbnailPath;
  }

  return updateGeneration(row.id, {
    status: "completed",
    videoPath,
    thumbnailPath,
    errorMessage: null,
  });
}

export function deleteGenerationRecord(id: string) {
  deleteGeneration(id);
}

export async function cancelAndDeleteGenerationRecord(id: string): Promise<boolean> {
  const row = getGenerationById(id);
  if (!row) return false;

  if (row.openaiVideoId && (row.status === "queued" || row.status === "in_progress")) {
    try { await cancelVideoJob(row.openaiVideoId); } catch { /* ignore */ }
  }

  deleteGeneration(id);
  return true;
}

export async function cancelGenerationRecord(id: string) {
  const row = getGenerationById(id);
  if (!row) return null;

  if (row.openaiVideoId) {
    try { await cancelVideoJob(row.openaiVideoId); } catch { /* ignore */ }
  }

  return updateGeneration(id, {
    status: "failed",
    errorMessage: "Cancelled by user.",
  });
}

export function listGenerationRecords() {
  return listGenerations().map((row) => toGenerationRecord(row));
}

export async function createGenerationEntry(input: {
  image: File;
  prompt: string;
  userPrompt: string;
  model: VideoModelId;
  format: VideoFormat;
  requestedSeconds: number;
}) {
  await ensureStorageDirectories();

  const now = new Date().toISOString();
  const row = insertGeneration({
    id: randomUUID(),
    prompt: input.prompt,
    userPrompt: input.userPrompt,
    model: input.model,
    status: "queued",
    format: input.format,
    requestedSeconds: input.requestedSeconds,
    submittedSeconds: null,
    sourceImagePath: await saveUploadedImage(input.image),
    videoPath: null,
    thumbnailPath: null,
    openaiVideoId: null,
    errorMessage: null,
    ownerId: null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const job = await createVideoJob({ ...input, model: input.model });

    let updated = updateGeneration(row.id, {
      status: job.status,
      openaiVideoId: job.id,
      submittedSeconds: job.submittedSeconds,
      errorMessage: job.errorMessage,
    });

    if (job.status === "completed") {
      updated = await finalizeCompletedGeneration(updated, job.id);
    }

    if (job.status === "failed") {
      updated = updateGeneration(row.id, {
        status: "failed",
        errorMessage: job.errorMessage ?? "Video generation failed.",
      });
    }

    return toGenerationRecord(updated, job.progress);
  } catch (error) {
    const failed = updateGeneration(row.id, {
      status: "failed",
      errorMessage: getErrorMessage(error),
    });

    return toGenerationRecord(failed);
  }
}

const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function refreshGenerationRecord(id: string) {
  const row = getGenerationById(id);
  if (!row) {
    return null;
  }

  if (
    row.status === "completed" ||
    row.status === "failed" ||
    !row.openaiVideoId
  ) {
    return toGenerationRecord(row);
  }

  // Auto-cancel jobs that have been running too long
  const age = Date.now() - new Date(row.createdAt).getTime();
  if (age > JOB_TIMEOUT_MS) {
    try { await cancelVideoJob(row.openaiVideoId); } catch { /* ignore */ }
    const timedOut = updateGeneration(id, {
      status: "failed",
      errorMessage: "Generation timed out after 10 minutes and was automatically cancelled.",
    });
    return toGenerationRecord(timedOut);
  }

  try {
    const job = await retrieveVideoJob(row.openaiVideoId);

    if (job.status === "completed") {
      const completedRow = await finalizeCompletedGeneration(row, row.openaiVideoId);
      return toGenerationRecord(completedRow, job.progress);
    }

    if (job.status === "failed") {
      const failedRow = updateGeneration(id, {
        status: "failed",
        submittedSeconds: job.submittedSeconds,
        errorMessage: job.errorMessage ?? "OpenAI video generation failed.",
      });

      return toGenerationRecord(failedRow);
    }

    const pendingRow = updateGeneration(id, {
      status: job.status,
      submittedSeconds: job.submittedSeconds,
      errorMessage: null,
    });

    return toGenerationRecord(pendingRow, job.progress);
  } catch (error) {
    const failed = updateGeneration(id, {
      status: "failed",
      errorMessage: getErrorMessage(error),
    });

    return toGenerationRecord(failed);
  }
}
