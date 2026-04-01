import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/kv";
import type { AdjustmentKey } from "@/constants/adjustments";

const STYLE_MATCH_COST = 3;

const SYSTEM_PROMPT =
  "You are an expert photo editor specializing in color grading and style transfer. " +
  "Analyze the reference image and identify its visual style — including color temperature, " +
  "contrast, saturation, shadows, highlights, and overall mood. Then return ONLY a JSON object " +
  "of adjustment values that would make the target image match the style of the reference image. " +
  "Available adjustments: brightness, exposure, contrast, blacks, whites, highlights, shadows, " +
  "vibrance, saturation, temperature, tint, hue, sharpen, vignette, grain, clarity. " +
  "All values range from -100 to 100. Only include adjustments that need to change from 0. " +
  "No explanation, just the JSON.";

function toThumbnailUrl(url: string): string {
  return url.replace("/upload/", "/upload/w_400,q_70,f_jpg/");
}

interface RequestBody {
  imageUrl: string;
  referenceImageBase64: string;
  referenceImageMediaType: string;
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

  if (user.creditBalance < STYLE_MATCH_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const rateLimit = await checkRateLimit(user.id, "style_match", 20);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 },
    );
  }

  const body = (await request.json()) as RequestBody;
  const { imageUrl, referenceImageBase64, referenceImageMediaType } = body;

  if (!imageUrl || !referenceImageBase64 || !referenceImageMediaType) {
    return NextResponse.json(
      { error: "imageUrl, referenceImageBase64, and referenceImageMediaType are required" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { creditBalance: { decrement: STYLE_MATCH_COST } },
  });
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      type: "DEDUCTION",
      amount: -STYLE_MATCH_COST,
      feature: "style_match",
    },
  });

  const userId = user.id;

  async function refundCredits(reason: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: STYLE_MATCH_COST } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId,
        type: "REFUND",
        amount: STYLE_MATCH_COST,
        feature: "style_match",
        description: reason,
      },
    });
  }

  try {
    const thumbnailUrl = toThumbnailUrl(imageUrl);
    const imageRes = await fetch(thumbnailUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch target image: ${imageRes.status}`);
    }
    const buffer = await imageRes.arrayBuffer();
    const targetBase64 = Buffer.from(buffer).toString("base64");

    // Anthropic vision: PNG + max 1000px on longest side keeps payload under 5MB while
    // preserving enough detail for style analysis (Sharp accepts any common input format).
    const imageBuffer = Buffer.from(referenceImageBase64, "base64");
    const pngBuffer = await sharp(imageBuffer)
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const pngBase64 = pngBuffer.toString("base64");

    const userContent: (ImageBlockParam | TextBlockParam)[] = [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: targetBase64 },
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: pngBase64,
        },
      },
      {
        type: "text",
        text:
          "The first image is the target photo to edit. The second image is the reference " +
          "whose style should be matched. Return only the JSON object of adjustments.",
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
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
      console.error("[/api/ai/style-match] Failed to parse JSON:", rawText);
      await refundCredits("Refund: style match parse failure");
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
  } catch (err) {
    console.error("[/api/ai/style-match]", err);
    await refundCredits("Refund: style match failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
