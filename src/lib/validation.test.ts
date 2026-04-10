import { describe, expect, it } from "vitest";

import {
  parseCreateGenerationFormData,
  RequestValidationError,
} from "@/lib/validation";

function buildValidFormData() {
  const formData = new FormData();
  formData.set("prompt", "Create a slow, elegant fabric reveal.");
  formData.set("format", "portrait");
  formData.set("seconds", "5");
  formData.set(
    "image",
    new File(["image-bytes"], "lookbook.jpg", { type: "image/jpeg" }),
  );

  return formData;
}

describe("parseCreateGenerationFormData", () => {
  it("accepts a valid image prompt payload", () => {
    const payload = parseCreateGenerationFormData(buildValidFormData());

    expect(payload.prompt).toContain("fabric reveal");
    expect(payload.format).toBe("portrait");
    expect(payload.seconds).toBe(5);
    expect(payload.image.name).toBe("lookbook.jpg");
  });

  it("rejects unsupported image types", () => {
    const formData = buildValidFormData();
    formData.set(
      "image",
      new File(["gif-data"], "lookbook.gif", { type: "image/gif" }),
    );

    expect(() => parseCreateGenerationFormData(formData)).toThrow(
      RequestValidationError,
    );
  });

  it("rejects durations above ten seconds", () => {
    const formData = buildValidFormData();
    formData.set("seconds", "11");

    expect(() => parseCreateGenerationFormData(formData)).toThrow(
      "Seconds must be between 1 and 10.",
    );
  });
});
