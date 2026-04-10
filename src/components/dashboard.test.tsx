import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Dashboard from "@/components/dashboard";
import type { GenerationRecord } from "@/lib/types";

vi.stubGlobal("fetch", vi.fn());

const failedGeneration: GenerationRecord = {
  id: "failed-1",
  prompt: "Turn the outfit shot into a premium reveal.",
  userPrompt: null,
  status: "failed",
  format: "portrait",
  requestedSeconds: 5,
  submittedSeconds: 4,
  sourceImagePath: "uploads/failed-1.jpg",
  videoPath: null,
  thumbnailPath: null,
  openaiVideoId: "video_failed_1",
  errorMessage: "OpenAI video generation failed.",
  ownerId: null,
  createdAt: "2026-04-08T13:00:00.000Z",
  updatedAt: "2026-04-08T13:00:00.000Z",
  sourceImageUrl: "/media/uploads/failed-1.jpg",
  videoUrl: null,
  thumbnailUrl: null,
  progress: null,
};

describe("Dashboard", () => {
  it("renders failed library cards with the source image and error copy", () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });

    render(<Dashboard initialGenerations={[failedGeneration]} />);

    expect(
      screen.getByText("OpenAI video generation failed."),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        "Reference image paired with Turn the outfit shot into a premium reveal.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("5s requested, 4s rendered")).toBeInTheDocument();
  });
});
