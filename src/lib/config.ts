import os from "node:os";
import path from "node:path";

const OPENAI_ENV_KEYS = ["OPENAI_API_KEY", "OpenAIAPIKey"] as const;
const FAL_ENV_KEYS = ["FAL_KEY", "FAL_API_KEY"] as const;
const SUPABASE_BACKEND_MODES = ["auto", "local", "supabase"] as const;
type SupabaseBackendMode = (typeof SUPABASE_BACKEND_MODES)[number];

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
  for (const key of FAL_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  throw new Error("Missing fal.ai API key. Set FAL_KEY or FAL_API_KEY in your environment.");
}

export function getGoogleAPIKey() {
  const value = process.env.GOOGLE_API_KEY?.trim();
  if (value) return value;
  throw new Error("Missing Google API key. Set GOOGLE_API_KEY in your environment.");
}

function getOptionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

export function getSupabaseUrl() {
  return getOptionalEnv("SUPABASE_URL") ?? getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return getOptionalEnv("SUPABASE_ANON_KEY") ?? getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey() {
  return getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseStorageBucket() {
  return getOptionalEnv("SUPABASE_STORAGE_BUCKET") ?? "craft-media";
}

function getSupabaseBackendMode(): SupabaseBackendMode {
  const value = getOptionalEnv("CRAFT_STORAGE_BACKEND");
  if (!value) return "auto";
  if (SUPABASE_BACKEND_MODES.includes(value as SupabaseBackendMode)) {
    return value as SupabaseBackendMode;
  }

  return "auto";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function shouldUseSupabase() {
  const mode = getSupabaseBackendMode();
  if (mode === "local") return false;
  if (mode === "supabase") return true;
  if (process.env.NODE_ENV === "test") return false;

  return isSupabaseConfigured();
}

export function getDataRoot() {
  const configured = process.env.CRAFT_DATA_ROOT?.trim();
  if (configured && configured.length > 0) {
    return path.resolve(configured);
  }

  if (process.env.VERCEL === "1") {
    return path.join(os.tmpdir(), "craft");
  }

  return path.join(process.cwd(), "data");
}
