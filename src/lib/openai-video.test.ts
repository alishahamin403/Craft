import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVideoJob, getVideoSizeForFormat } from "@/lib/openai-video";

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

  it("maps the landscape option to the correct output size", () => {
    expect(getVideoSizeForFormat("landscape")).toBe("1280x720");
  });
});
