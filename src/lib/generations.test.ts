import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoJobSnapshot } from "@/lib/openai-video";

const openAiVideoMocks = vi.hoisted(() => ({
  cancelVideoJob: vi.fn(),
  createVideoJob: vi.fn(),
  downloadVideoAsset: vi.fn(),
  retrieveVideoJob: vi.fn(),
}));

vi.mock("@/lib/openai-video", () => openAiVideoMocks);

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+p0x8AAAAASUVORK5CYII=";

type CraftDbGlobal = typeof globalThis & {
  __craftDb?: { close: () => void };
};

function closeDb() {
  const craftGlobal = globalThis as CraftDbGlobal;
  craftGlobal.__craftDb?.close();
  delete craftGlobal.__craftDb;
}

function buildImageFile() {
  const imageBytes = Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));
  return new File([imageBytes], "reference.png", { type: "image/png" });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("createGenerationEntry", () => {
  let dataRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    openAiVideoMocks.cancelVideoJob.mockReset();
    openAiVideoMocks.createVideoJob.mockReset();
    openAiVideoMocks.downloadVideoAsset.mockReset();
    openAiVideoMocks.retrieveVideoJob.mockReset();
    closeDb();
    dataRoot = await mkdtemp(path.join(os.tmpdir(), "craft-idempotency-"));
    process.env.CRAFT_DATA_ROOT = dataRoot;
  });

  afterEach(async () => {
    closeDb();
    delete process.env.CRAFT_DATA_ROOT;
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("does not submit a second paid job for the same idempotency key", async () => {
    const deferred = createDeferred<VideoJobSnapshot>();
    openAiVideoMocks.createVideoJob.mockReturnValueOnce(deferred.promise);
    const { createGenerationEntry } = await import("@/lib/generations");
    const input = {
      image: buildImageFile(),
      prompt: "Create a clean product reveal.",
      userPrompt: "Create a clean product reveal.",
      idempotencyKey: "same-submit-key",
      requestedSeconds: 5,
      ownerId: "test-user",
    };

    const firstRequest = createGenerationEntry(input);

    await vi.waitFor(() => {
      expect(openAiVideoMocks.createVideoJob).toHaveBeenCalledTimes(1);
    });

    const duplicate = await createGenerationEntry({
      ...input,
      image: buildImageFile(),
    });

    expect(openAiVideoMocks.createVideoJob).toHaveBeenCalledTimes(1);
    expect(duplicate.status).toBe("queued");

    deferred.resolve({
      id: "fal-request-1",
      status: "queued",
      progress: null,
      submittedSeconds: 5,
      errorMessage: null,
      videoUrl: null,
      size: null,
      expiresAt: null,
    });

    const first = await firstRequest;
    expect(duplicate.id).toBe(first.id);
  });
});
