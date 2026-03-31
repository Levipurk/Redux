import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { prisma } from "@/lib/prisma";

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ images: [], total: 0, page: 1, limit: 50 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  const [images, total] = await Promise.all([
    prisma.image.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        filename: true,
        originalUrl: true,
        publicId: true,
        utKey: true,
        width: true,
        height: true,
        size: true,
        format: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.image.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({ images, total, page, limit });
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json() as { ufsUrl?: string; utKey?: string; name?: string; size?: number };
  const { ufsUrl, utKey, name, size } = body;
  if (!ufsUrl || !name || size == null) {
    return NextResponse.json({ error: "ufsUrl, name, and size are required" }, { status: 400 });
  }

  const response = await fetch(ufsUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { uploadToCloudinary } = await import("@/lib/cloudinary");
  const { secureUrl, publicId, width, height, format } = await uploadToCloudinary(buffer, name);

  const image = await prisma.image.create({
    data: {
      userId: user.id,
      filename: name,
      originalUrl: secureUrl,
      publicId,
      utKey: utKey ?? null,
      width,
      height,
      size,
      format,
      embedding: [],
    },
  });

  return NextResponse.json({ image });
}

export async function DELETE(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json() as { imageId?: string };
  const { imageId } = body;
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  if (image.utKey) {
    await utapi.deleteFiles(image.utKey);
  }

  const { deleteFromCloudinary } = await import("@/lib/cloudinary");
  await deleteFromCloudinary(image.publicId);

  // Remove dependent ImageVersion rows before deleting the parent Image record.
  // Without this, Prisma throws a foreign-key RESTRICT violation.
  await prisma.imageVersion.deleteMany({ where: { imageId } });
  await prisma.image.delete({ where: { id: imageId } });

  return NextResponse.json({ success: true });
}
