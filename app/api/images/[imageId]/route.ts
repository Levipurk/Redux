import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageId } = await params;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
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
  });

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return NextResponse.json({ image });
}
