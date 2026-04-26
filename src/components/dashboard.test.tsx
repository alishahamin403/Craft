import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Dashboard from "@/components/dashboard";
import type { GenerationRecord } from "@/lib/types";

vi.stubGlobal("fetch", vi.fn());

const failedGeneration: GenerationRecord = {
  id: "failed-1",
  prompt: "Turn the outfit shot into a premium reveal.",
  userPrompt: null,
  model: "kling-3.0",
  modelName: "Kling 3.0 Pro",
  quality: "medium",
  estimatedCost: "$0.45",
  status: "failed",
  requestedSeconds: 5,
  submittedSeconds: 4,
  errorMessage: "Video generation failed.",
  createdAt: "2026-04-08T13:00:00.000Z",
  updatedAt: "2026-04-08T13:00:00.000Z",
  sourceImageUrl: "/media/uploads/failed-1.jpg",
  videoUrl: null,
  thumbnailUrl: null,
  progress: null,
  estimatedRenderMs: 115000,
  mediaAspectRatio: "9/16",
};

const testUser = {
  id: "test-user",
  email: "creator@craft.local",
  name: "Craft Creator",
  picture: null,
};

describe("Dashboard", () => {
  it("renders failed library cards with the source image and error copy", () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });

    render(<Dashboard initialGenerations={[failedGeneration]} user={testUser} />);

    expect(
      screen.getByText("Video generation failed."),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        "Reference image paired with Turn the outfit shot into a premium reveal.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("5s requested, 4s rendered")).toBeInTheDocument();
    expect(screen.getByText("Kling 3.0 Pro")).toBeInTheDocument();
    expect(screen.getByText("Medium quality")).toBeInTheDocument();
    expect(screen.getByText("$0.45 est.")).toBeInTheDocument();
  });
});
