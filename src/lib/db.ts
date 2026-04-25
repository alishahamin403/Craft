import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { getDataRoot } from "@/lib/config";
import { isSupabaseBackendEnabled, supabaseRestRequest } from "@/lib/supabase-server";
import type { GenerationRow } from "@/lib/types";

declare global {
  var __craftDb: Database.Database | undefined;
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

interface SupabaseGenerationRow {
  id: string;
  idempotency_key: string | null;
  prompt: string;
  user_prompt: string | null;
  model: GenerationRow["model"];
  status: GenerationRow["status"];
  format: GenerationRow["format"];
  requested_seconds: number;
  submitted_seconds: number | null;
  source_image_path: string;
  video_path: string | null;
  thumbnail_path: string | null;
  openai_video_id: string | null;
  error_message: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

const UPDATEABLE_COLUMNS = [
  "prompt",
  "userPrompt",
  "model",
  "status",
  "format",
  "requestedSeconds",
  "submittedSeconds",
  "sourceImagePath",
  "videoPath",
  "thumbnailPath",
  "openaiVideoId",
  "errorMessage",
  "ownerId",
  "updatedAt",
] as const;

function createDatabase() {
  mkdirSync(getDataRoot(), { recursive: true });

  const database = new Database(path.join(getDataRoot(), "craft.sqlite"));
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      idempotencyKey TEXT,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      format TEXT NOT NULL,
      requestedSeconds INTEGER NOT NULL,
      submittedSeconds INTEGER,
      sourceImagePath TEXT NOT NULL,
      videoPath TEXT,
      thumbnailPath TEXT,
      openaiVideoId TEXT,
      errorMessage TEXT,
      ownerId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS generations_createdAt_idx
      ON generations(createdAt DESC);

    CREATE INDEX IF NOT EXISTS generations_ownerId_createdAt_idx
      ON generations(ownerId, createdAt DESC);
  `);

  ensureDatabaseSchema(database);
  return database;
}

function ensureDatabaseSchema(database: Database.Database) {
  const generationCols = (database.pragma("table_info(generations)") as { name: string }[]).map(c => c.name);
  if (!generationCols.includes("userPrompt")) {
    database.exec("ALTER TABLE generations ADD COLUMN userPrompt TEXT;");
  }
  if (!generationCols.includes("model")) {
    database.exec("ALTER TABLE generations ADD COLUMN model TEXT;");
  }
  if (!generationCols.includes("ownerId")) {
    database.exec("ALTER TABLE generations ADD COLUMN ownerId TEXT;");
  }
  if (!generationCols.includes("idempotencyKey")) {
    database.exec("ALTER TABLE generations ADD COLUMN idempotencyKey TEXT;");
  }

  database.exec(`
    DROP INDEX IF EXISTS generations_idempotencyKey_idx;

    CREATE UNIQUE INDEX IF NOT EXISTS generations_ownerId_idempotencyKey_idx
      ON generations(ownerId, idempotencyKey)
      WHERE idempotencyKey IS NOT NULL AND ownerId IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS generations_anon_idempotencyKey_idx
      ON generations(idempotencyKey)
      WHERE idempotencyKey IS NOT NULL AND ownerId IS NULL;
  `);
}

function getDatabase() {
  if (!globalThis.__craftDb) {
    globalThis.__craftDb = createDatabase();
  } else {
    ensureDatabaseSchema(globalThis.__craftDb);
  }

  return globalThis.__craftDb;
}

function toSupabaseGenerationRow(row: GenerationRow): SupabaseGenerationRow {
  return {
    id: row.id,
    idempotency_key: row.idempotencyKey,
    prompt: row.prompt,
    user_prompt: row.userPrompt,
    model: row.model,
    status: row.status,
    format: row.format,
    requested_seconds: row.requestedSeconds,
    submitted_seconds: row.submittedSeconds,
    source_image_path: row.sourceImagePath,
    video_path: row.videoPath,
    thumbnail_path: row.thumbnailPath,
    openai_video_id: row.openaiVideoId,
    error_message: row.errorMessage,
    owner_id: row.ownerId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function fromSupabaseGenerationRow(row: SupabaseGenerationRow): GenerationRow {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    prompt: row.prompt,
    userPrompt: row.user_prompt,
    model: row.model,
    status: row.status,
    format: row.format,
    requestedSeconds: row.requested_seconds,
    submittedSeconds: row.submitted_seconds,
    sourceImagePath: row.source_image_path,
    videoPath: row.video_path,
    thumbnailPath: row.thumbnail_path,
    openaiVideoId: row.openai_video_id,
    errorMessage: row.error_message,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSupabasePatch(patch: Partial<Omit<GenerationRow, "id" | "createdAt">>) {
  const rowPatch: Partial<SupabaseGenerationRow> = {};

  if ("prompt" in patch) rowPatch.prompt = patch.prompt;
  if ("userPrompt" in patch) rowPatch.user_prompt = patch.userPrompt ?? null;
  if ("model" in patch) rowPatch.model = patch.model ?? null;
  if ("status" in patch) rowPatch.status = patch.status;
  if ("format" in patch) rowPatch.format = patch.format;
  if ("requestedSeconds" in patch) rowPatch.requested_seconds = patch.requestedSeconds;
  if ("submittedSeconds" in patch) rowPatch.submitted_seconds = patch.submittedSeconds ?? null;
  if ("sourceImagePath" in patch) rowPatch.source_image_path = patch.sourceImagePath;
  if ("videoPath" in patch) rowPatch.video_path = patch.videoPath ?? null;
  if ("thumbnailPath" in patch) rowPatch.thumbnail_path = patch.thumbnailPath ?? null;
  if ("openaiVideoId" in patch) rowPatch.openai_video_id = patch.openaiVideoId ?? null;
  if ("errorMessage" in patch) rowPatch.error_message = patch.errorMessage ?? null;
  if ("ownerId" in patch) rowPatch.owner_id = patch.ownerId ?? null;
  if ("updatedAt" in patch) rowPatch.updated_at = patch.updatedAt;

  return rowPatch;
}

export async function upsertUser(user: StoredUser) {
  const now = new Date().toISOString();

  if (isSupabaseBackendEnabled()) {
    await supabaseRestRequest("/users?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        picture_url: user.picture,
        updated_at: now,
      }),
    });
    return;
  }

  getDatabase()
    .prepare(`
      INSERT INTO users (id, email, name, picture, createdAt, updatedAt)
      VALUES (@id, @email, @name, @picture, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        updatedAt = excluded.updatedAt
    `)
    .run({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      createdAt: now,
      updatedAt: now,
    });
}

export async function listGenerations(ownerId?: string) {
  if (isSupabaseBackendEnabled()) {
    const query = ownerId
      ? `/generations?owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc`
      : "/generations?order=created_at.desc";
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>(query);
    return rows.map(fromSupabaseGenerationRow);
  }

  if (ownerId) {
    return getDatabase()
      .prepare("SELECT * FROM generations WHERE ownerId = ? ORDER BY createdAt DESC")
      .all(ownerId) as GenerationRow[];
  }

  return getDatabase()
    .prepare("SELECT * FROM generations ORDER BY createdAt DESC")
    .all() as GenerationRow[];
}

export async function getGenerationById(id: string) {
  if (isSupabaseBackendEnabled()) {
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>(
      `/generations?id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return rows[0] ? fromSupabaseGenerationRow(rows[0]) : undefined;
  }

  return getDatabase()
    .prepare("SELECT * FROM generations WHERE id = ?")
    .get(id) as GenerationRow | undefined;
}

export async function getGenerationByIdForOwner(id: string, ownerId: string) {
  if (isSupabaseBackendEnabled()) {
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>(
      `/generations?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`,
    );
    return rows[0] ? fromSupabaseGenerationRow(rows[0]) : undefined;
  }

  return getDatabase()
    .prepare("SELECT * FROM generations WHERE id = ? AND ownerId = ?")
    .get(id, ownerId) as GenerationRow | undefined;
}

export async function getGenerationByIdempotencyKey(
  idempotencyKey: string,
  ownerId?: string,
) {
  if (isSupabaseBackendEnabled()) {
    const ownerFilter = ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : "";
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>(
      `/generations?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}${ownerFilter}&limit=1`,
    );
    return rows[0] ? fromSupabaseGenerationRow(rows[0]) : undefined;
  }

  if (ownerId) {
    return getDatabase()
      .prepare("SELECT * FROM generations WHERE idempotencyKey = ? AND ownerId = ?")
      .get(idempotencyKey, ownerId) as GenerationRow | undefined;
  }

  return getDatabase()
    .prepare("SELECT * FROM generations WHERE idempotencyKey = ?")
    .get(idempotencyKey) as GenerationRow | undefined;
}

export async function getGenerationByStoredPath(pathname: string) {
  if (isSupabaseBackendEnabled()) {
    const encoded = encodeURIComponent(pathname);
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>(
      `/generations?or=(source_image_path.eq.${encoded},video_path.eq.${encoded},thumbnail_path.eq.${encoded})&limit=1`,
    );
    return rows[0] ? fromSupabaseGenerationRow(rows[0]) : undefined;
  }

  return getDatabase()
    .prepare(`
      SELECT * FROM generations
      WHERE sourceImagePath = ?
        OR videoPath = ?
        OR thumbnailPath = ?
    `)
    .get(pathname, pathname, pathname) as GenerationRow | undefined;
}

export async function insertGeneration(row: GenerationRow) {
  if (isSupabaseBackendEnabled()) {
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>("/generations", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(toSupabaseGenerationRow(row)),
    });
    return fromSupabaseGenerationRow(rows[0]);
  }

  getDatabase()
    .prepare(`
      INSERT INTO generations (
        id, idempotencyKey, prompt, userPrompt, model, status, format, requestedSeconds, submittedSeconds,
        sourceImagePath, videoPath, thumbnailPath, openaiVideoId,
        errorMessage, ownerId, createdAt, updatedAt
      ) VALUES (
        @id, @idempotencyKey, @prompt, @userPrompt, @model, @status, @format, @requestedSeconds, @submittedSeconds,
        @sourceImagePath, @videoPath, @thumbnailPath, @openaiVideoId,
        @errorMessage, @ownerId, @createdAt, @updatedAt
      )
    `)
    .run(row);

  return row;
}

export async function deleteGeneration(id: string) {
  if (isSupabaseBackendEnabled()) {
    await supabaseRestRequest(`/generations?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return;
  }

  getDatabase()
    .prepare("DELETE FROM generations WHERE id = ?")
    .run(id);
}

export async function updateGeneration(
  id: string,
  patch: Partial<Omit<GenerationRow, "id" | "createdAt">>,
) {
  const updatedAt = new Date().toISOString();

  if (isSupabaseBackendEnabled()) {
    const rows = await supabaseRestRequest<SupabaseGenerationRow[]>(
      `/generations?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          ...toSupabasePatch(patch),
          updated_at: updatedAt,
        }),
      },
    );

    if (!rows[0]) {
      throw new Error(`Generation ${id} was not found after update.`);
    }

    return fromSupabaseGenerationRow(rows[0]);
  }

  const assignments: string[] = [];
  const values: Record<string, string | number | null> = {
    id,
    updatedAt,
  };

  for (const column of UPDATEABLE_COLUMNS) {
    if (column in patch) {
      assignments.push(`${column} = @${column}`);
      values[column] = patch[column] ?? null;
    }
  }

  if (!assignments.includes("updatedAt = @updatedAt")) {
    assignments.push("updatedAt = @updatedAt");
  }

  getDatabase()
    .prepare(`UPDATE generations SET ${assignments.join(", ")} WHERE id = @id`)
    .run(values);

  const updated = await getGenerationById(id);
  if (!updated) {
    throw new Error(`Generation ${id} was not found after update.`);
  }

  return updated;
}
