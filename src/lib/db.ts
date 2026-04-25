import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { getDataRoot } from "@/lib/config";
import type { GenerationRow } from "@/lib/types";

declare global {
  var __craftDb: Database.Database | undefined;
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
  `);

  ensureDatabaseSchema(database);
  return database;
}

function ensureDatabaseSchema(database: Database.Database) {
  // Migrations: add columns that may not exist in older DBs
  const cols = (database.pragma("table_info(generations)") as { name: string }[]).map(c => c.name);
  if (!cols.includes("userPrompt")) {
    database.exec("ALTER TABLE generations ADD COLUMN userPrompt TEXT;");
  }
  if (!cols.includes("model")) {
    database.exec("ALTER TABLE generations ADD COLUMN model TEXT;");
  }
  if (!cols.includes("idempotencyKey")) {
    database.exec("ALTER TABLE generations ADD COLUMN idempotencyKey TEXT;");
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS generations_idempotencyKey_idx
      ON generations(idempotencyKey)
      WHERE idempotencyKey IS NOT NULL;
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

export function listGenerations() {
  return getDatabase()
    .prepare("SELECT * FROM generations ORDER BY createdAt DESC")
    .all() as GenerationRow[];
}

export function getGenerationById(id: string) {
  return getDatabase()
    .prepare("SELECT * FROM generations WHERE id = ?")
    .get(id) as GenerationRow | undefined;
}

export function getGenerationByIdempotencyKey(idempotencyKey: string) {
  return getDatabase()
    .prepare("SELECT * FROM generations WHERE idempotencyKey = ?")
    .get(idempotencyKey) as GenerationRow | undefined;
}

export function insertGeneration(row: GenerationRow) {
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

export function deleteGeneration(id: string) {
  getDatabase()
    .prepare("DELETE FROM generations WHERE id = ?")
    .run(id);
}

export function updateGeneration(
  id: string,
  patch: Partial<Omit<GenerationRow, "id" | "createdAt">>,
) {
  const assignments: string[] = [];
  const values: Record<string, string | number | null> = {
    id,
    updatedAt: new Date().toISOString(),
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

  const updated = getGenerationById(id);
  if (!updated) {
    throw new Error(`Generation ${id} was not found after update.`);
  }

  return updated;
}
