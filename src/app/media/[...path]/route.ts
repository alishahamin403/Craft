import { NextResponse } from "next/server";

import {
  getContentTypeFromPath,
  readStoredAsset,
  resolveStoredPath,
} from "@/lib/file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const relativePath = path.join("/");

  try {
    resolveStoredPath(relativePath);
    const asset = await readStoredAsset(relativePath);

    return new NextResponse(asset, {
      headers: {
        "Content-Type": getContentTypeFromPath(relativePath),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
