import { NextResponse } from "next/server";

import { createGenerationEntry, listGenerationRecords } from "@/lib/generations";
import {
  parseCreateGenerationFormData,
  RequestValidationError,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    items: listGenerationRecords(),
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = parseCreateGenerationFormData(formData);
    const item = await createGenerationEntry({
      image: payload.image,
      prompt: payload.prompt,
      userPrompt: payload.userPrompt ?? payload.prompt,
      idempotencyKey: payload.idempotencyKey,
      model: payload.model,
      format: payload.format,
      requestedSeconds: payload.seconds,
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
