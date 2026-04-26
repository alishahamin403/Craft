import { z } from "zod";

import {
  getVideoModelInfo,
  getVideoQualityInfo,
  VIDEO_FORMATS,
  VIDEO_MODELS,
  VIDEO_QUALITIES,
} from "@/lib/types";

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
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .optional(),
  model: z.enum(VIDEO_MODELS).optional(),
  quality: z.enum(VIDEO_QUALITIES).optional(),
  format: z.enum(VIDEO_FORMATS).optional(),
  seconds: z.coerce
    .number()
    .int("Seconds must be a whole number.")
    .min(3, "Seconds must be at least 3.")
    .max(15, "Seconds must be 15 or fewer."),
});

export class RequestValidationError extends Error {}

function formatDurationOptions(durations: readonly number[]) {
  if (durations.length === 0) return "no durations";
  if (durations.length === 1) return `${durations[0]}s`;

  const isContiguous = durations.every((value, index) =>
    index === 0 || value === durations[index - 1] + 1,
  );

  if (isContiguous) {
    return `${durations[0]}s through ${durations[durations.length - 1]}s`;
  }

  return `${durations.slice(0, -1).map((value) => `${value}s`).join(", ")} or ${
    durations[durations.length - 1]
  }s`;
}

export function parseCreateGenerationFormData(formData: FormData) {
  const parsed = createGenerationSchema.safeParse({
    prompt: formData.get("prompt"),
    userPrompt: formData.get("userPrompt") ?? undefined,
    idempotencyKey: formData.get("idempotencyKey") ?? undefined,
    model: formData.get("model") ?? undefined,
    quality: formData.get("quality") ?? undefined,
    format: formData.get("format") ?? undefined,
    seconds: formData.get("seconds"),
  });

  if (!parsed.success) {
    throw new RequestValidationError(
      parsed.error.issues[0]?.message ?? "The request is invalid.",
    );
  }

  const selectedModel = parsed.data.model ??
    (parsed.data.quality ? getVideoQualityInfo(parsed.data.quality).model : undefined);

  if (selectedModel) {
    const modelInfo = getVideoModelInfo(selectedModel);
    if (parsed.data.format && !modelInfo.formats.includes(parsed.data.format)) {
      throw new RequestValidationError(
        `${modelInfo.name} does not support the selected format.`,
      );
    }

    if (!modelInfo.durations.includes(parsed.data.seconds)) {
      throw new RequestValidationError(
        `${modelInfo.name} supports ${formatDurationOptions(modelInfo.durations)} clips.`,
      );
    }
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
