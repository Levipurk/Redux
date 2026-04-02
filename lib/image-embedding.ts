import { prisma } from "@/lib/prisma";
import { embedClipImageUrl } from "@/lib/clip-embed";

/**
 * Full-image CLIP embedding (normalized), one row per image. Replaces any prior row.
 */
export async function upsertImageClipEmbedding(
  imageId: string,
  imageUrl: string,
): Promise<void> {
  const vector = await embedClipImageUrl(imageUrl);
  await prisma.$transaction([
    prisma.imageEmbedding.upsert({
      where: { imageId },
      create: { imageId, vector },
      update: { vector },
    }),
    prisma.image.update({
      where: { id: imageId },
      data: { embedding: vector },
    }),
  ]);
}
