import { expect, test } from "@playwright/test";

test("submits an image, shows a pending card, then renders a playable library card", async ({
  page,
}) => {
  let generationPolls = 0;
  let createSubmissions = 0;

  await page.route("**/api/generations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    createSubmissions += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        item: {
          id: "smoke-1",
          prompt:
            "Create a boutique-style motion reveal with soft camera drift.",
          userPrompt:
            "Create a boutique-style motion reveal with soft camera drift.",
          model: "kling-3.0",
          modelName: "Kling 3.0 Pro",
          quality: "medium",
          estimatedCost: "$0.45",
          status: "queued",
          requestedSeconds: 5,
          submittedSeconds: 4,
          errorMessage: null,
          createdAt: "2026-04-08T13:00:00.000Z",
          updatedAt: "2026-04-08T13:00:00.000Z",
          sourceImageUrl: "/media/uploads/smoke-1.jpg",
          videoUrl: null,
          thumbnailUrl: null,
          progress: 12,
          estimatedRenderMs: 115000,
          mediaAspectRatio: "9/16",
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
          userPrompt:
            "Create a boutique-style motion reveal with soft camera drift.",
          model: "kling-3.0",
          modelName: "Kling 3.0 Pro",
          quality: "medium",
          estimatedCost: "$0.45",
          status: generationPolls === 1 ? "in_progress" : "completed",
          requestedSeconds: 5,
          submittedSeconds: 4,
          errorMessage: null,
          createdAt: "2026-04-08T13:00:00.000Z",
          updatedAt: "2026-04-08T13:00:10.000Z",
          sourceImageUrl: "/media/uploads/smoke-1.jpg",
          videoUrl: generationPolls === 1 ? null : "/media/videos/smoke-1.mp4",
          thumbnailUrl:
            generationPolls === 1 ? null : "/media/thumbnails/smoke-1.webp",
          progress: generationPolls === 1 ? 54 : 100,
          estimatedRenderMs: 115000,
          mediaAspectRatio: "9/16",
        },
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Turn images into/ })).toBeVisible();
  await page.getByRole("button", { name: /Start creating/ }).click();

  await expect(page.getByRole("radio", { name: /Low/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Medium/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /High/ })).toBeVisible();
  await expect(page.getByText("MiniMax Hailuo Fast")).toBeVisible();
  await expect(page.getByText("PixVerse V6")).toBeVisible();
  await expect(page.getByText("Kling 2.6 Pro")).toBeVisible();
  await expect(page.getByText("Veo 3.1 Fast")).toBeVisible();
  await expect(page.getByText("$0.23-$0.35 for 5s")).toBeVisible();
  await expect(page.getByText("$0.50-$0.56 for 5s")).toBeVisible();
  await expect(page.getByText("$2.10 for 5s")).toBeVisible();
  await expect(page.getByText("Portrait 9:16", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "4s", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "5s", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "6s", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "8s", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "10s", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "12s", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "15s", exact: true })).toBeVisible();

  await page.getByRole("radio", { name: /Low/ }).click();
  await expect(page.getByRole("button", { name: "15s", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Medium/ }).click();
  await expect(page.getByRole("button", { name: "15s", exact: true })).toBeVisible();

  await page.getByLabel("Reference image").setInputFiles({
    name: "lookbook.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("image-bytes"),
  });

  await page
    .getByLabel("Motion prompt")
    .fill("Create a boutique-style motion reveal with soft camera drift.");

  await page.getByRole("button", { name: "Generate video" }).dblclick();
  expect(createSubmissions).toBe(1);

  await expect(page.getByTestId("generation-card-smoke-1")).toContainText(
    /Queued|Rendering/,
  );
  await expect(page.getByTestId("generation-card-smoke-1")).toContainText(
    "Kling 3.0 Pro",
  );
  await expect(page.getByTestId("generation-card-smoke-1")).toContainText(
    "Medium quality",
  );
  await expect(page.getByTestId("generation-card-smoke-1")).toContainText(
    "$0.45 est.",
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
