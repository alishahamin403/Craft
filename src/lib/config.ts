import path from "node:path";

const OPENAI_ENV_KEYS = ["OPENAI_API_KEY", "OpenAIAPIKey"] as const;

export function getOpenAIAPIKey() {
  for (const key of OPENAI_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(
    "Missing OpenAI API key. Set OPENAI_API_KEY or OpenAIAPIKey in your environment.",
  );
}

export function getFalAPIKey() {
  const value = process.env.FAL_API_KEY?.trim();
  if (value) return value;
  throw new Error("Missing fal.ai API key. Set FAL_API_KEY in your environment.");
}

export function getGoogleAPIKey() {
  const value = process.env.GOOGLE_API_KEY?.trim();
  if (value) return value;
  throw new Error("Missing Google API key. Set GOOGLE_API_KEY in your environment.");
}

export function getDataRoot() {
  const configured = process.env.CRAFT_DATA_ROOT?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.join(process.cwd(), "data");
}
