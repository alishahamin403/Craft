import { NextResponse } from "next/server";

import { createUnauthorizedResponse, getUserFromRequest } from "@/lib/auth";
import { createGenerationEntry, listGenerationRecords } from "@/lib/generations";
import {
  parseCreateGenerationFormData,
  RequestValidationError,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return createUnauthorizedResponse();

  return NextResponse.json({
    items: await listGenerationRecords(user.id),
  });
}

export async function POST(request: Request) {
  try {
    const user = getUserFromRequest(request);
    if (!user) return createUnauthorizedResponse();

    const formData = await request.formData();
    const payload = parseCreateGenerationFormData(formData);
    const item = await createGenerationEntry({
      image: payload.image,
      prompt: payload.prompt,
      userPrompt: payload.userPrompt ?? payload.prompt,
      idempotencyKey: payload.idempotencyKey,
      model: payload.model,
      quality: payload.quality,
      format: payload.format,
      requestedSeconds: payload.seconds,
      ownerId: user.id,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error.",
      },
      { status: 500 },
    );
  }
}
