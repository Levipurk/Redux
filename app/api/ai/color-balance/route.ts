import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import type { AdjustmentKey } from "@/constants/adjustments";

const SYSTEM_PROMPT =
  "You are an expert photo editor specializing in color correction. Analyze this image for any " +
  "color casts, white balance issues, or unnatural color tones. Return ONLY a JSON object with " +
  "adjustment values to correct the colors and achieve natural, accurate color balance. Focus on " +
  "temperature, tint, vibrance, saturation, and hue. Return only adjustments that need to change " +
  "from 0. All values range from -100 to 100. No explanation, just the JSON object.";

function toThumbnailUrl(url: string): string {
  return url.replace("/upload/", "/upload/w_400,q_70,f_jpg/");
}

interface RequestBody {
  imageUrl: string;
  currentAdjustments?: Record<AdjustmentKey, number>;
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.creditBalance < 1) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = (await request.json()) as RequestBody;
  const { imageUrl } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  // Deduct credit before calling the API
  await prisma.user.update({
    where: { id: user.id },
    data: { creditBalance: { decrement: 1 } },
  });
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      type: "DEDUCTION",
      amount: -1,
      feature: "smart_color_balance",
    },
  });

  try {
    const thumbnailUrl = toThumbnailUrl(imageUrl);
    const imageRes = await fetch(thumbnailUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image: ${imageRes.status}`);
    }
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const userContent: (ImageBlockParam | TextBlockParam)[] = [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: base64 },
      },
      {
        type: "text",
        text: "Analyze this image and return optimal color balance adjustment values.",
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const cleaned = rawText.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

    let adjustments: Partial<Record<AdjustmentKey, number>> = {};
    try {
      adjustments = JSON.parse(cleaned) as Partial<Record<AdjustmentKey, number>>;
    } catch {
      console.error("[/api/ai/color-balance] Failed to parse JSON response:", rawText);
      // Refund on parse failure
      await prisma.user.update({
        where: { id: user.id },
        data: { creditBalance: { increment: 1 } },
      });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
  } catch (err) {
    console.error("[/api/ai/color-balance] Error:", err);
    // Refund on unexpected failure
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { increment: 1 } },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
