import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Replicate from "replicate";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/kv";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Full identifier passed to replicate.run() — owner/model:version
const REPLICATE_MODEL =
  "851-labs/background-removal:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

interface RequestBody {
  imageUrl: string;
  imageId: string;
}

export async function POST(request: Request) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── User ────────────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.creditBalance < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const rateLimit = await checkRateLimit(user.id, "background_remove", 20);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    // ── Body ────────────────────────────────────────────────────────────────
    const body = (await request.json()) as RequestBody;
    const { imageUrl, imageId } = body;

    if (!imageUrl || !imageId) {
      return NextResponse.json(
        { error: "imageUrl and imageId are required" },
        { status: 400 },
      );
    }

    // ── Verify image ownership ──────────────────────────────────────────────
    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // ── Deduct credit upfront ───────────────────────────────────────────────
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: 1 } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -1,
        feature: "remove_background",
      },
    });

    try {
      // ── Call Replicate ────────────────────────────────────────────────────
      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        { input: { image: imageUrl } },
      );

      // The model returns a FileOutput object (SDK v1) or a URL string.
      // FileOutput has a .url() method returning a URL; fall back to string coercion.
      let resultUrl: string;
      if (typeof output === "string") {
        resultUrl = output;
      } else if (output && typeof (output as Record<string, unknown>).url === "function") {
        resultUrl = ((output as Record<string, unknown>).url as () => URL)().href;
      } else if (Array.isArray(output) && output.length > 0) {
        const first = output[0] as unknown;
        resultUrl =
          first && typeof (first as Record<string, unknown>).url === "function"
            ? ((first as Record<string, unknown>).url as () => URL)().href
            : String(first);
      } else {
        throw new Error(`Unexpected Replicate output shape: ${String(output)}`);
      }

      // ── Download result PNG ───────────────────────────────────────────────
      const resultRes = await fetch(resultUrl);
      if (!resultRes.ok) {
        throw new Error(`Failed to download result PNG: ${resultRes.status} ${resultRes.statusText}`);
      }
      const buffer = Buffer.from(await resultRes.arrayBuffer());

      // ── Upload to Cloudinary ──────────────────────────────────────────────
      const uploaded = await uploadToCloudinary(
        buffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_no_bg.png`,
      );

      // ── Save ImageVersion ─────────────────────────────────────────────────
      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: {},
          label: "Background Removed",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });

    } catch (innerErr) {
      // ── Refund credit on processing failure ───────────────────────────────
      console.error("[/api/ai/background-remove]", innerErr);

      await prisma.user.update({
        where: { id: user.id },
        data: { creditBalance: { increment: 1 } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          type: "REFUND",
          amount: 1,
          feature: "remove_background",
          description: "Refund: background removal failed",
        },
      });

      const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
      return NextResponse.json(
        { error: "Background removal failed", detail: message },
        { status: 500 },
      );
    }

  } catch (outerErr) {
    console.error("[/api/ai/background-remove] Unexpected error:", outerErr);
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 },
    );
  }
}
