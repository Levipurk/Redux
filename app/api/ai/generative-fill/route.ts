import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Replicate from "replicate";
import sharp from "sharp";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/kv";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const GENERATIVE_FILL_COST = 3;

const REPLICATE_MODEL =
  "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3";

const ALLOWED_INPAINT_DIMS = [
  64, 128, 192, 256, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024,
] as const;

function roundToNearestAllowedDimension(n: number): number {
  const clamped = Math.max(64, Math.min(1024, Math.round(n)));
  let best: (typeof ALLOWED_INPAINT_DIMS)[number] = ALLOWED_INPAINT_DIMS[0];
  let bestDist = Math.abs(clamped - best);
  for (const d of ALLOWED_INPAINT_DIMS) {
    const dist = Math.abs(clamped - d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

function extractOutputUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0] as unknown;
    if (first && typeof (first as Record<string, unknown>).url === "function") {
      return ((first as Record<string, unknown>).url as () => URL)().href;
    }
    return String(first);
  }
  if (output && typeof (output as Record<string, unknown>).url === "function") {
    return ((output as Record<string, unknown>).url as () => URL)().href;
  }
  throw new Error(`Unexpected Replicate output shape: ${String(output)}`);
}

type ExpandDirection = "top" | "bottom" | "left" | "right";

interface RequestBody {
  imageUrl: string;
  expandDirection: ExpandDirection;
  expandPixels: number;
  prompt: string;
}

async function resolveUserImage(userId: string, imageUrl: string) {
  const base = imageUrl.split("?")[0] ?? imageUrl;
  return prisma.image.findFirst({
    where: {
      userId,
      OR: [
        { originalUrl: imageUrl },
        { originalUrl: base },
        { versions: { some: { url: imageUrl } } },
        { versions: { some: { url: { startsWith: base } } } },
      ],
    },
  });
}

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.creditBalance < GENERATIVE_FILL_COST) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const rateLimit = await checkRateLimit(user.id, "generative_fill", 20);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as RequestBody;
    const { imageUrl, expandDirection, expandPixels, prompt } = body;

    const directions: ExpandDirection[] = ["top", "bottom", "left", "right"];
    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }
    if (!directions.includes(expandDirection)) {
      return NextResponse.json(
        { error: "expandDirection must be top, bottom, left, or right" },
        { status: 400 },
      );
    }
    const px = Math.round(Number(expandPixels));
    if (!Number.isFinite(px) || px < 1 || px > 512) {
      return NextResponse.json(
        { error: "expandPixels must be between 1 and 512" },
        { status: 400 },
      );
    }
    const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
    if (!trimmedPrompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const image = await resolveUserImage(user.id, imageUrl);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: GENERATIVE_FILL_COST } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -GENERATIVE_FILL_COST,
        feature: "generative_fill",
      },
    });

    const userId = user.id;

    async function refundCredits(reason: string) {
      await prisma.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: GENERATIVE_FILL_COST } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId,
          type: "REFUND",
          amount: GENERATIVE_FILL_COST,
          feature: "generative_fill",
          description: reason,
        },
      });
    }

    try {
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to fetch source image: ${imageRes.status} ${imageRes.statusText}`);
      }
      const sourceBuffer = Buffer.from(await imageRes.arrayBuffer());
      const meta = await sharp(sourceBuffer).metadata();
      const ow = meta.width ?? 1;
      const oh = meta.height ?? 1;

      let expW: number;
      let expH: number;
      let imgLeft: number;
      let imgTop: number;

      switch (expandDirection) {
        case "right":
          expW = ow + px;
          expH = oh;
          imgLeft = 0;
          imgTop = 0;
          break;
        case "left":
          expW = ow + px;
          expH = oh;
          imgLeft = px;
          imgTop = 0;
          break;
        case "bottom":
          expW = ow;
          expH = oh + px;
          imgLeft = 0;
          imgTop = 0;
          break;
        case "top":
          expW = ow;
          expH = oh + px;
          imgLeft = 0;
          imgTop = px;
          break;
      }

      const sourceRgba = await sharp(sourceBuffer).ensureAlpha().png().toBuffer();

      const expandedPng = await sharp({
        create: {
          width: expW,
          height: expH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: sourceRgba, left: imgLeft, top: imgTop }])
        .png()
        .toBuffer();

      const whiteFull = await sharp({
        create: {
          width: expW,
          height: expH,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const blackOriginal = await sharp({
        create: {
          width: ow,
          height: oh,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const maskPng = await sharp(whiteFull)
        .composite([{ input: blackOriginal, left: imgLeft, top: imgTop }])
        .png()
        .toBuffer();

      const maxSide = Math.max(expW, expH);
      const scale = maxSide > 1024 ? 1024 / maxSide : 1;
      const scaledW = expW * scale;
      const scaledH = expH * scale;
      const modelW = roundToNearestAllowedDimension(scaledW);
      const modelH = roundToNearestAllowedDimension(scaledH);

      const resizedImage = await sharp(expandedPng)
        .resize(modelW, modelH, { fit: "fill" })
        .png()
        .toBuffer();
      const resizedMask = await sharp(maskPng)
        .resize(modelW, modelH, { fit: "fill" })
        .png()
        .toBuffer();

      const ts = Date.now();
      const imageUploaded = await uploadToCloudinary(
        resizedImage,
        `${image.filename.replace(/\.[^/.]+$/, "")}_genfill_src_${ts}.png`,
      );
      const maskUploaded = await uploadToCloudinary(
        resizedMask,
        `${image.filename.replace(/\.[^/.]+$/, "")}_genfill_mask_${ts}.png`,
      );

      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        {
          input: {
            image: imageUploaded.secureUrl,
            mask: maskUploaded.secureUrl,
            prompt: trimmedPrompt,
            width: modelW,
            height: modelH,
            num_inference_steps: 30,
            num_outputs: 1,
          },
        },
      );

      const resultUrl = extractOutputUrl(output);

      const resultRes = await fetch(resultUrl);
      if (!resultRes.ok) {
        throw new Error(`Failed to download generative fill result: ${resultRes.status}`);
      }
      const resultBuffer = Buffer.from(await resultRes.arrayBuffer());

      const uploaded = await uploadToCloudinary(
        resultBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_genfill.png`,
      );

      await prisma.imageVersion.create({
        data: {
          imageId: image.id,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: {},
          label: "Generative Fill",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      console.error("[/api/ai/generative-fill]", innerErr);
      await refundCredits("Refund: generative fill failed");
      const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
      return NextResponse.json(
        { error: "Generative fill failed", detail: message },
        { status: 500 },
      );
    }
  } catch (outerErr) {
    console.error("[/api/ai/generative-fill] Unexpected error:", outerErr);
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 },
    );
  }
}
