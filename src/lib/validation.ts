import { z } from "zod";

import { VIDEO_FORMATS, VIDEO_MODELS } from "@/lib/types";

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_IMAGE_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const createGenerationSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "A prompt is required.")
    .max(1200, "Prompt must be 1200 characters or fewer."),
  userPrompt: z
    .string()
    .trim()
    .max(1200)
    .optional()
    .default(""),
  model: z.enum(VIDEO_MODELS).default("kling-2.6"),
  format: z.enum(VIDEO_FORMATS),
  seconds: z.coerce
    .number()
    .int("Seconds must be a whole number.")
    .min(1, "Seconds must be at least 1.")
    .max(10, "Seconds must be 10 or fewer."),
});

export class RequestValidationError extends Error {}

export function parseCreateGenerationFormData(formData: FormData) {
  const parsed = createGenerationSchema.safeParse({
    prompt: formData.get("prompt"),
    userPrompt: formData.get("userPrompt") ?? undefined,
    model: formData.get("model") ?? undefined,
    format: formData.get("format"),
    seconds: formData.get("seconds"),
  });

  if (!parsed.success) {
    throw new RequestValidationError(
      parsed.error.issues[0]?.message ?? "The request is invalid.",
    );
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    throw new RequestValidationError("Upload one image to generate a video.");
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(image.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new RequestValidationError(
      "Only JPEG, PNG, and WebP reference images are supported.",
    );
  }

  if (image.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new RequestValidationError("Images must be 15 MB or smaller.");
  }

  return {
    image,
    ...parsed.data,
  };
}
