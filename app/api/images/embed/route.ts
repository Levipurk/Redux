import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAndPersistImageEmbedding } from "@/lib/image-vector-pipeline";

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

    const body = await request.json();
    const imageId = typeof body.imageId === "string" ? body.imageId.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!imageId || !imageUrl) {
      return NextResponse.json(
        { error: "imageId and imageUrl are required" },
        { status: 400 },
      );
    }

    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // CLIP image encoder (Replicate clip-features, inputs = imageUrl) → pgvector(768)
    await generateAndPersistImageEmbedding(imageId, imageUrl, user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/images/embed]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Embedding failed", detail: message },
      { status: 500 },
    );
  }
}
