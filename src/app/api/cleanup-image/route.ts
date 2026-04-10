import OpenAI from "openai";
import { NextResponse } from "next/server";

import { getOpenAIAPIKey } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: "No image provided." }, { status: 400 });
    }

    const prompt = (formData.get("prompt") as string | null)?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: getOpenAIAPIKey() });

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image,
      prompt,
      size: "auto",
      quality: "medium",
      input_fidelity: "high",
      n: 1,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "Cleanup returned no image." }, { status: 500 });
    }

    return NextResponse.json({ imageBase64: b64 });
  } catch (error) {
    console.error("[cleanup-image]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image cleanup failed." },
      { status: 500 },
    );
  }
}
