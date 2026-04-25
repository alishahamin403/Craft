import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import {
  getContentTypeFromPath,
  readStoredAsset,
  resolveStoredPath,
} from "@/lib/file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, max-age=31536000, immutable";

function parseRange(rangeHeader: string, fileSize: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  let start: number;
  let end: number;

  if (startRaw === "") {
    const suffixLength = Number(endRaw);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;

    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? fileSize - 1 : Number(endRaw);
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const relativePath = path.join("/");

  try {
    const absolutePath = resolveStoredPath(relativePath);
    const contentType = getContentTypeFromPath(relativePath);
    const range = request.headers.get("range");

    if (range && contentType.startsWith("video/")) {
      const { size } = await stat(absolutePath);
      const parsedRange = parseRange(range, size);

      if (!parsedRange) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
            "Accept-Ranges": "bytes",
          },
        });
      }

      const { start, end } = parsedRange;
      const stream = createReadStream(absolutePath, { start, end });

      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": CACHE_CONTROL,
        },
      });
    }

    const asset = await readStoredAsset(relativePath);

    return new NextResponse(asset, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(asset.byteLength),
        "Accept-Ranges": contentType.startsWith("video/") ? "bytes" : "none",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
