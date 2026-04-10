import { NextResponse } from "next/server";

import { cancelGenerationRecord, deleteGenerationRecord, refreshGenerationRecord, cancelAndDeleteGenerationRecord } from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const item = await refreshGenerationRecord(id);

  if (!item) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const item = await cancelGenerationRecord(id);

  if (!item) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({ item: { ...item, progress: null, sourceImageUrl: item.sourceImageUrl, videoUrl: item.videoUrl, thumbnailUrl: item.thumbnailUrl } });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const found = await cancelAndDeleteGenerationRecord(id);

  if (!found) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
