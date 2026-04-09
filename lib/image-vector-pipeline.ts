import { prisma } from "@/lib/prisma";
import { embedClipImageUrl } from "@/lib/search-clip";
import { CLIP_VECTOR_DIM, vectorToPgLiteral } from "@/lib/pgvector";

/**
 * Persist embedding with pgvector. Tries, in order:
 * 1) $1::vector(dim) — preferred
 * 2) $1::text::vector(dim) — some drivers send text
 * 3) Inline numeric literal — avoids broken binds
 *
 * Returns affected row count (0 if no matching id+userId).
 */
export async function executeImageEmbeddingUpdate(
  imageId: string,
  userId: string,
  vectorLiteral: string,
): Promise<{ rows: number; method: string }> {
  let raw = await prisma.$executeRawUnsafe(
    `UPDATE "Image" SET embedding = $1::vector(${CLIP_VECTOR_DIM}) WHERE id = $2 AND "userId" = $3`,
    vectorLiteral,
    imageId,
    userId,
  );
  let rows = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (rows === 1) {
    return { rows: 1, method: "$1::vector(768)" };
  }

  raw = await prisma.$executeRawUnsafe(
    `UPDATE "Image" SET embedding = $1::text::vector(${CLIP_VECTOR_DIM}) WHERE id = $2 AND "userId" = $3`,
    vectorLiteral,
    imageId,
    userId,
  );
  rows = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (rows === 1) {
    return { rows: 1, method: "$1::text::vector(768)" };
  }

  raw = await prisma.$executeRawUnsafe(
    `UPDATE "Image" SET embedding = '${vectorLiteral}'::vector(${CLIP_VECTOR_DIM}) WHERE id = $1 AND "userId" = $2`,
    imageId,
    userId,
  );
  rows = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (rows === 1) {
    return { rows: 1, method: "inline ::vector(768)" };
  }

  return { rows, method: "none" };
}

/**
 * CLIP image embedding (URL → 768-d) → store in `Image.embedding` (pgvector).
 */
export async function generateAndPersistImageEmbedding(
  imageId: string,
  imageUrl: string,
  userId: string,
): Promise<void> {
  const vec = await embedClipImageUrl(imageUrl);
  const lit = vectorToPgLiteral(vec);
  const { rows: updated, method } = await executeImageEmbeddingUpdate(
    imageId,
    userId,
    lit,
  );
  if (updated !== 1) {
    throw new Error(
      `Embedding UPDATE affected ${updated} row(s) (expected 1) for imageId=${imageId} userId=${userId} (lastMethod=${method})`,
    );
  }
}
