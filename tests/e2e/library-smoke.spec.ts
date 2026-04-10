import { expect, test } from "@playwright/test";

test("submits an image, shows a pending card, then renders a playable library card", async ({
  page,
}) => {
  let generationPolls = 0;

  await page.route("**/api/generations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        item: {
          id: "smoke-1",
          prompt:
            "Create a boutique-style motion reveal with soft camera drift.",
          status: "queued",
          format: "portrait",
          requestedSeconds: 5,
          submittedSeconds: 4,
          sourceImagePath: "uploads/smoke-1.jpg",
          videoPath: null,
          thumbnailPath: null,
          openaiVideoId: "video_smoke_1",
          errorMessage: null,
          ownerId: null,
          createdAt: "2026-04-08T13:00:00.000Z",
          updatedAt: "2026-04-08T13:00:00.000Z",
          sourceImageUrl: "/media/uploads/smoke-1.jpg",
          videoUrl: null,
          thumbnailUrl: null,
          progress: 12,
        },
      }),
    });
  });

  await page.route("**/api/generations/smoke-1", async (route) => {
    generationPolls += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        item: {
          id: "smoke-1",
          prompt:
            "Create a boutique-style motion reveal with soft camera drift.",
          status: generationPolls === 1 ? "in_progress" : "completed",
          format: "portrait",
          requestedSeconds: 5,
          submittedSeconds: 4,
          sourceImagePath: "uploads/smoke-1.jpg",
          videoPath: generationPolls === 1 ? null : "videos/smoke-1.mp4",
          thumbnailPath:
            generationPolls === 1 ? null : "thumbnails/smoke-1.webp",
          openaiVideoId: "video_smoke_1",
          errorMessage: null,
          ownerId: null,
          createdAt: "2026-04-08T13:00:00.000Z",
          updatedAt: "2026-04-08T13:00:10.000Z",
          sourceImageUrl: "/media/uploads/smoke-1.jpg",
          videoUrl: generationPolls === 1 ? null : "/media/videos/smoke-1.mp4",
          thumbnailUrl:
            generationPolls === 1 ? null : "/media/thumbnails/smoke-1.webp",
          progress: generationPolls === 1 ? 54 : 100,
        },
      }),
    });
  });

  await page.goto("/");

  await page.getByLabel("Reference image").setInputFiles({
    name: "lookbook.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("image-bytes"),
  });

  await page
    .getByLabel("Motion prompt")
    .fill("Create a boutique-style motion reveal with soft camera drift.");

  await page.getByRole("button", { name: "Generate video" }).click();

  await expect(page.getByTestId("generation-card-smoke-1")).toContainText(
    /Queued|Rendering/,
  );

  await expect(
    page.getByTitle(
      "Generated video for Create a boutique-style motion reveal with soft camera drift.",
    ),
  ).toBeVisible({ timeout: 10000 });

  await expect(
    page.getByAltText(
      "Reference image paired with Create a boutique-style motion reveal with soft camera drift.",
    ),
  ).toBeVisible();
});
