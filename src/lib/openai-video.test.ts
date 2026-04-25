import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelVideoJob,
  createVideoJob,
  downloadVideoAsset,
  getVideoSizeForFormat,
  retrieveVideoJob,
} from "@/lib/openai-video";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+p0x8AAAAASUVORK5CYII=";

function buildImageFile() {
  const imageBytes = Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));
  return new File([imageBytes], "lookbook.png", { type: "image/png" });
}

describe("createVideoJob", () => {
  beforeEach(() => {
    process.env.FAL_API_KEY = "test-fal-key";
  });

  afterEach(() => {
    delete process.env.FAL_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("submits a job to Kling via fal.ai with a base64 data URI image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req-abc123",
            status_url: "https://queue.fal.run/.../requests/req-abc123/status",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await createVideoJob({
      image: buildImageFile(),
      prompt: "Smooth camera pan with soft lighting.",
      model: "kling-2.6",
      format: "portrait",
      requestedSeconds: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(submitUrl).toContain("queue.fal.run");
    expect(submitUrl).toContain("kling-video");

    const body = JSON.parse(submitInit.body as string);
    expect(body.start_image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.duration).toBe("5");
    expect(body.generate_audio).toBe(false);
    expect((submitInit.headers as Record<string, string>)["Authorization"]).toBe("Key test-fal-key");

    // Verify the normalized image is portrait (720×1280)
    const [, b64] = (body.start_image_url as string).split(",", 2);
    const metadata = await sharp(Buffer.from(b64, "base64")).metadata();
    expect(metadata.width).toBe(720);
    expect(metadata.height).toBe(1280);

    expect(result.id).toBe("req-abc123");
    expect(result.status).toBe("queued");
    expect(result.submittedSeconds).toBe(5);
  });

  it("submits Kling 3.0 jobs with exact supported durations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req-v3",
            status_url: "https://queue.fal.run/.../requests/req-v3/status",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await createVideoJob({
      image: buildImageFile(),
      prompt: "Slow cinematic move.",
      model: "kling-3.0",
      format: "landscape",
      requestedSeconds: 12,
    });

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(submitUrl).toBe("https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video");

    const body = JSON.parse(submitInit.body as string);
    expect(body.duration).toBe("12");
    expect(result.submittedSeconds).toBe(12);
  });

  it("maps the landscape option to the correct output size", () => {
    expect(getVideoSizeForFormat("landscape")).toBe("1280x720");
  });

  it("polls and downloads from fal queue request endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req-v3",
            status: "COMPLETED",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              video: {
                url: "https://v3b.fal.media/files/output.mp4",
                content_type: "video/mp4",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            video: {
              url: "https://v3b.fal.media/files/output.mp4",
              content_type: "video/mp4",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("mp4-bytes"), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const job = await retrieveVideoJob("req-v3");
    const video = await downloadVideoAsset("req-v3", "video");

    expect(job.status).toBe("completed");
    expect(job.videoUrl).toBe("https://v3b.fal.media/files/output.mp4");
    expect(video.buffer.toString()).toBe("mp4-bytes");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/kling-video/requests/req-v3/status",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/kling-video/requests/req-v3",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/kling-video/requests/req-v3",
    );
  });

  it("treats a ready result as completed even when status still says in progress", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req-ready",
            status: "IN_PROGRESS",
            response_url: "https://queue.fal.run/fal-ai/kling-video/requests/req-ready",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              video: {
                url: "https://v3b.fal.media/files/ready.mp4",
                content_type: "video/mp4",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const job = await retrieveVideoJob("req-ready");

    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
    expect(job.videoUrl).toBe("https://v3b.fal.media/files/ready.mp4");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://queue.fal.run/fal-ai/kling-video/requests/req-ready",
    );
  });

  it("keeps rendering when the result endpoint is not ready yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req-rendering",
            status: "IN_PROGRESS",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "IN_PROGRESS" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const job = await retrieveVideoJob("req-rendering");

    expect(job.status).toBe("in_progress");
    expect(job.progress).toBe(10);
  });

  it("cancels from the fal queue request endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await cancelVideoJob("req-cancel");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/kling-video/requests/req-cancel/cancel",
      expect.objectContaining({
        method: "PUT",
        headers: { Authorization: "Key test-fal-key" },
        cache: "no-store",
      }),
    );
  });
});
