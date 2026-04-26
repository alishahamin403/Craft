import { describe, expect, it } from "vitest";

import {
  parseCreateGenerationFormData,
  RequestValidationError,
} from "@/lib/validation";

function buildValidFormData() {
  const formData = new FormData();
  formData.set("prompt", "Create a slow, elegant fabric reveal.");
  formData.set("seconds", "5");
  formData.set(
    "image",
    new File(["image-bytes"], "lookbook.jpg", { type: "image/jpeg" }),
  );

  return formData;
}

describe("parseCreateGenerationFormData", () => {
  it("accepts a valid image prompt payload", () => {
    const formData = buildValidFormData();
    formData.set("idempotencyKey", "submit-key-123");
    const payload = parseCreateGenerationFormData(formData);

    expect(payload.prompt).toContain("fabric reveal");
    expect(payload.idempotencyKey).toBe("submit-key-123");
    expect(payload.model).toBeUndefined();
    expect(payload.quality).toBeUndefined();
    expect(payload.format).toBeUndefined();
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

  it("rejects durations unsupported by the selected model", () => {
    const formData = buildValidFormData();
    formData.set("model", "kling-2.6");
    formData.set("format", "portrait");
    formData.set("seconds", "12");

    expect(() => parseCreateGenerationFormData(formData)).toThrow(
      "Kling 2.6 Pro supports 5s or 10s clips.",
    );
  });

  it("accepts longer durations for Kling 3.0", () => {
    const formData = buildValidFormData();
    formData.set("model", "kling-3.0");
    formData.set("format", "portrait");
    formData.set("seconds", "12");

    const payload = parseCreateGenerationFormData(formData);

    expect(payload.model).toBe("kling-3.0");
    expect(payload.seconds).toBe(12);
  });

  it("validates durations for a selected quality tier", () => {
    const formData = buildValidFormData();
    formData.set("quality", "low");
    formData.set("seconds", "3");

    expect(() => parseCreateGenerationFormData(formData)).toThrow(
      "Low quality does not support the selected clip length.",
    );
  });
});
