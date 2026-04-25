import { NextResponse } from "next/server";

import { createUnauthorizedResponse, getUserFromRequest } from "@/lib/auth";
import {
  cancelAndDeleteGenerationRecord,
  cancelGenerationRecordForOwner,
  refreshGenerationRecordForOwner,
} from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = getUserFromRequest(request);
  if (!user) return createUnauthorizedResponse();

  const { id } = await context.params;
  const item = await refreshGenerationRecordForOwner(id, user.id);

  if (!item) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = getUserFromRequest(request);
  if (!user) return createUnauthorizedResponse();

  const { id } = await context.params;
  const item = await cancelGenerationRecordForOwner(id, user.id);

  if (!item) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = getUserFromRequest(request);
  if (!user) return createUnauthorizedResponse();

  const { id } = await context.params;
  const found = await cancelAndDeleteGenerationRecord(id, user.id);

  if (!found) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
