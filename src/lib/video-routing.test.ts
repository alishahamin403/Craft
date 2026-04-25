import { describe, expect, it } from "vitest";

import { estimateProgress, estimateRenderMs, selectVideoRoute } from "@/lib/video-routing";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+p0x8AAAAASUVORK5CYII=";

function buildImageFile() {
  const imageBytes = Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));
  return new File([imageBytes], "reference.png", { type: "image/png" });
}

describe("selectVideoRoute", () => {
  it("uses the cost-efficient model for simple short clips", async () => {
    const route = await selectVideoRoute({
      image: buildImageFile(),
      prompt: "quick preview with a subtle camera drift",
      requestedSeconds: 5,
    });

    expect(route.model).toBe("kling-2.6");
    expect(route.format).toBe("portrait");
    expect(route.requestedSeconds).toBe(5);
  });

  it("uses the higher quality model for longer website hero clips", async () => {
    const route = await selectVideoRoute({
      image: buildImageFile(),
      prompt: "premium cinematic landing page hero video for a fashion brand",
      requestedSeconds: 15,
    });

    expect(route.model).toBe("kling-3.0");
    expect(route.format).toBe("landscape");
    expect(route.requestedSeconds).toBe(15);
  });

  it("keeps progress moving when provider progress is stale", () => {
    const createdAt = new Date(
      Date.now() - estimateRenderMs("kling-2.6", 5) / 2,
    ).toISOString();

    const progress = estimateProgress({
      createdAt,
      status: "in_progress",
      model: "kling-2.6",
      requestedSeconds: 5,
      submittedSeconds: 5,
      providerProgress: 10,
    });

    expect(progress).toBeGreaterThan(10);
  });
});
