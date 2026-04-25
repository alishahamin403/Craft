import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getDataRoot } from "@/lib/config";

const STORAGE_FOLDERS = ["uploads", "videos", "thumbnails"] as const;
type StorageFolder = (typeof STORAGE_FOLDERS)[number];

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

function getStorageFolderPath(folder: StorageFolder) {
  return path.join(getDataRoot(), folder);
}

async function ensureStorageFolder(folder: StorageFolder) {
  await mkdir(getStorageFolderPath(folder), { recursive: true });
}

export async function ensureStorageDirectories() {
  await Promise.all(STORAGE_FOLDERS.map((folder) => ensureStorageFolder(folder)));
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/");
}

function extensionFromMimeType(contentType: string | null) {
  return contentType ? MIME_TO_EXTENSION[contentType] ?? "" : "";
}

export function getContentTypeFromPath(relativePath: string) {
  return EXTENSION_TO_MIME[path.extname(relativePath).toLowerCase()] ?? "application/octet-stream";
}

export async function saveUploadedImage(file: File) {
  await ensureStorageFolder("uploads");

  const extension =
    extensionFromMimeType(file.type) ||
    path.extname(file.name).toLowerCase() ||
    ".bin";
  const fileName = `${randomUUID()}${extension}`;
  const relativePath = normalizeRelativePath(path.join("uploads", fileName));
  const absolutePath = resolveStoredPath(relativePath);

  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

  return relativePath;
}

export async function saveGeneratedAsset(
  folder: Exclude<StorageFolder, "uploads">,
  fileName: string,
  buffer: Buffer,
) {
  await ensureStorageFolder(folder);

  const relativePath = normalizeRelativePath(path.join(folder, fileName));
  const absolutePath = resolveStoredPath(relativePath);
  await writeFile(absolutePath, buffer);

  return relativePath;
}

export async function readStoredAsset(relativePath: string) {
  return readFile(resolveStoredPath(relativePath));
}

export function resolveStoredPath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath).replace(/^\/+/, "");
  const absolutePath = path.resolve(getDataRoot(), normalized);
  const root = getDataRoot();

  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid media path.");
  }

  return absolutePath;
}

export function buildMediaUrl(relativePath: string | null) {
  if (!relativePath) {
    return null;
  }

  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }

  return `/media/${normalizeRelativePath(relativePath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function buildGeneratedFileName(
  id: string,
  contentType: string | null,
  fallbackExtension: string,
) {
  return `${id}${extensionFromMimeType(contentType) || fallbackExtension}`;
}
