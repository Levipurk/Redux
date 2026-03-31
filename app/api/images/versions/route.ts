import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("imageId");
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ versions: [] });
  }

  // Verify the image belongs to this user before returning its versions
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const versions = await prisma.imageVersion.findMany({
    where: { imageId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      imageId: true,
      adjustments: true,
      label: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ versions });
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

  const body = (await request.json()) as {
    imageId?: string;
    adjustments?: Record<string, number>;
    label?: string;
  };
  const { imageId, adjustments, label } = body;

  if (!imageId || !adjustments) {
    return NextResponse.json(
      { error: "imageId and adjustments are required" },
      { status: 400 },
    );
  }

  // Verify the image belongs to this user
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true, originalUrl: true, publicId: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const version = await prisma.imageVersion.create({
    data: {
      imageId,
      // Use the original image's URL/publicId as placeholders until an actual
      // export is triggered — the adjustments JSON is the source of truth here.
      url: image.originalUrl,
      publicId: image.publicId,
      adjustments,
      label: label ?? null,
    },
  });

  return NextResponse.json({ version });
}
