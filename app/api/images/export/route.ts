import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ExportFormat = "jpeg" | "png" | "tiff";

interface ExportBody {
  imageId?: string;
  adjustments?: Record<string, number>;
  format?: ExportFormat;
  quality?: number;
}

const FORMAT_MIME: Record<ExportFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  tiff: "image/tiff",
};

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as ExportBody;
  const { imageId, adjustments = {}, format = "jpeg", quality = 90 } = body;

  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Fetch the original image from Cloudinary
  const imgResponse = await fetch(image.originalUrl);
  if (!imgResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch original image" },
      { status: 502 },
    );
  }
  const arrayBuffer = await imgResponse.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // Apply adjustments with Sharp
  const sharp = (await import("sharp")).default;

  // Map adjustment values (-100..100) → Sharp parameters
  const brightness = adjustments.brightness ?? 0;
  const exposure = adjustments.exposure ?? 0;
  const contrast = adjustments.contrast ?? 0;
  const saturation = adjustments.saturation ?? 0;
  const vibrance = adjustments.vibrance ?? 0;
  const sharpenVal = adjustments.sharpen ?? 0;
  const noiseReduction = adjustments.noiseReduction ?? 0;
  const temperature = adjustments.temperature ?? 0;
  const hue = adjustments.hue ?? 0;

  // brightness + exposure combined → modulate brightness (1.0 = neutral)
  // Sharp modulate expects multipliers; -100 → ~0.2, 0 → 1.0, 100 → 2.0
  const brightnessMultiplier = Math.max(
    0.1,
    1 + (brightness + exposure) / 100,
  );

  // saturation + vibrance → modulate saturation (1.0 = neutral)
  const saturationMultiplier = Math.max(
    0,
    1 + (saturation + vibrance * 0.5) / 100,
  );

  // hue rotation in degrees (temperature is approximated as hue shift too)
  const hueRotation = hue * 1.8 + temperature * 0.5;

  let pipeline = sharp(inputBuffer).modulate({
    brightness: brightnessMultiplier,
    saturation: saturationMultiplier,
    hue: hueRotation,
  });

  // contrast → linear adjustment (a = 1 + contrast/100, b offset)
  if (contrast !== 0) {
    const factor = Math.max(0, 1 + contrast / 100);
    const offset = -128 * (factor - 1);
    pipeline = pipeline.linear(factor, offset);
  }

  // sharpen
  if (sharpenVal > 0) {
    const sigma = 0.5 + (sharpenVal / 100) * 3;
    pipeline = pipeline.sharpen({ sigma });
  }

  // noise reduction via blur
  if (noiseReduction > 0) {
    const sigma = (noiseReduction / 100) * 2;
    pipeline = pipeline.blur(sigma);
  }

  // Format and quality
  let outputBuffer: Buffer;
  if (format === "jpeg") {
    outputBuffer = await pipeline.jpeg({ quality: Math.min(100, Math.max(1, quality)) }).toBuffer();
  } else if (format === "png") {
    outputBuffer = await pipeline.png({ compressionLevel: 7 }).toBuffer();
  } else {
    outputBuffer = await pipeline.tiff({ compression: "lzw" }).toBuffer();
  }

  return new NextResponse(outputBuffer, {
    status: 200,
    headers: {
      "Content-Type": FORMAT_MIME[format],
      "Content-Disposition": `attachment; filename="export.${format}"`,
      "Content-Length": String(outputBuffer.length),
    },
  });
}
