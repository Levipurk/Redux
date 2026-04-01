import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Replicate from "replicate";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

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
  console.log("[/api/ai/background-remove] ── incoming request ──");

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const { userId: clerkId } = await auth();
    console.log("[/api/ai/background-remove] clerkId:", clerkId ?? "(none)");
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Environment check ───────────────────────────────────────────────────
    const tokenPresent = !!process.env.REPLICATE_API_TOKEN;
    const tokenLength  = process.env.REPLICATE_API_TOKEN?.length ?? 0;
    console.log("[/api/ai/background-remove] REPLICATE_API_TOKEN present:", tokenPresent, "| length:", tokenLength);

    // ── User ────────────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { clerkId } });
    console.log("[/api/ai/background-remove] user found:", !!user, "| creditBalance:", user?.creditBalance);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.creditBalance < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    // ── Body ────────────────────────────────────────────────────────────────
    const body = (await request.json()) as RequestBody;
    const { imageUrl, imageId } = body;
    console.log("[/api/ai/background-remove] imageId:", imageId, "| imageUrl:", imageUrl?.slice(0, 80));

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
    console.log("[/api/ai/background-remove] image record found:", !!image);
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
    console.log("[/api/ai/background-remove] credit deducted");

    try {
      // ── Call Replicate ────────────────────────────────────────────────────
      console.log("[/api/ai/background-remove] calling replicate.run() with model:", REPLICATE_MODEL);

      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        { input: { image: imageUrl } },
      );

      console.log("[/api/ai/background-remove] Replicate output type:", typeof output);
      console.log("[/api/ai/background-remove] Replicate output:", String(output)?.slice(0, 300));

      // lucataco/remove-bg returns a FileOutput object (SDK v1) or a URL string.
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

      console.log("[/api/ai/background-remove] result URL:", resultUrl?.slice(0, 120));

      // ── Download result PNG ───────────────────────────────────────────────
      const resultRes = await fetch(resultUrl);
      console.log("[/api/ai/background-remove] fetch result status:", resultRes.status);
      if (!resultRes.ok) {
        throw new Error(`Failed to download result PNG: ${resultRes.status} ${resultRes.statusText}`);
      }
      const buffer = Buffer.from(await resultRes.arrayBuffer());
      console.log("[/api/ai/background-remove] downloaded buffer size:", buffer.byteLength);

      // ── Upload to Cloudinary ──────────────────────────────────────────────
      const uploaded = await uploadToCloudinary(
        buffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_no_bg.png`,
      );
      console.log("[/api/ai/background-remove] Cloudinary upload done:", uploaded.secureUrl?.slice(0, 80));

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

      console.log("[/api/ai/background-remove] ImageVersion saved — done");
      return NextResponse.json({ resultUrl: uploaded.secureUrl });

    } catch (innerErr) {
      // ── Refund credit on processing failure ───────────────────────────────
      console.error("[/api/ai/background-remove] Processing error:", innerErr);
      if (innerErr instanceof Error) {
        console.error("  message:", innerErr.message);
        console.error("  stack  :", innerErr.stack);
        // Replicate SDK errors carry extra fields
        const anyErr = innerErr as Record<string, unknown>;
        if ("status" in anyErr) console.error("  status :", anyErr.status);
        if ("detail" in anyErr) console.error("  detail :", anyErr.detail);
      }

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
    // Catches auth(), request.json(), or Prisma errors before credit deduction
    console.error("[/api/ai/background-remove] Outer error (before credit deducted):", outerErr);
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 },
    );
  }
}
