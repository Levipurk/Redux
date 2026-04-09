/**
 * Backfill / refresh pgvector embeddings for images using CLIP **image** encoder (pixels → 768-d).
 *
 * Usage:
 *   pnpm embed:all                    — only rows where embedding IS NULL
 *   REEMBED_ALL=1 pnpm embed:all       — every image (e.g. after switching caption→image encoder)
 *
 * Requires: DATABASE_URL, REPLICATE_API_TOKEN
 * Loads .env.local then .env before any DB calls.
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { prisma } from "@/lib/prisma";
import { embedClipImageUrl } from "@/lib/search-clip";
import { CLIP_VECTOR_DIM, vectorToPgLiteral } from "@/lib/pgvector";
import { executeImageEmbeddingUpdate } from "@/lib/image-vector-pipeline";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/** One Replicate prediction per image — tune for low-credit rate limits. */
async function replicateCooldown(label: string): Promise<void> {
  const ms = Number(process.env.REEMBED_BETWEEN_REPLICATE_MS ?? "11000");
  if (ms <= 0) return;
  console.log(
    `[reembed-images]   … ${label}: wait ${ms}ms (Replicate spacing; set REEMBED_BETWEEN_REPLICATE_MS=0 to skip)`,
  );
  await new Promise((r) => setTimeout(r, ms));
}

interface Row {
  id: string;
  userId: string;
  originalUrl: string;
  filename: string;
}

async function verifyUserIds(userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  console.log(
    `[reembed-images] Distinct userId values on Image rows: count=${unique.length}`,
  );
  const sample = unique.slice(0, 8);
  for (const uid of sample) {
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, clerkId: true, email: true },
    });
    console.log(
      `[reembed-images] userId ${uid} → User table match: ${user ? "yes" : "NO — orphan Image.userId?"}`,
      user ? `(clerkId=${user.clerkId})` : "",
    );
  }
}

async function fetchRowSnapshot(
  imageId: string,
): Promise<{ id: string; userId: string } | null> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; userId: string }[]>(
    `SELECT id, "userId" FROM "Image" WHERE id = $1 LIMIT 1`,
    imageId,
  );
  return rows[0] ?? null;
}

async function embeddingIsSet(imageId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
    `SELECT (embedding IS NOT NULL) AS ok FROM "Image" WHERE id = $1 LIMIT 1`,
    imageId,
  );
  return Boolean(rows[0]?.ok);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[reembed-images] DATABASE_URL is missing. Load .env/.env.local or export it.",
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error(
      "[reembed-images] REPLICATE_API_TOKEN is missing. Load .env/.env.local or export it.",
    );
    process.exitCode = 1;
    return;
  }

  const reembedAll =
    process.env.REEMBED_ALL === "1" || process.env.REEMBED_ALL === "true";

  const rows = reembedAll
    ? await prisma.$queryRaw<Row[]>`
        SELECT id, "userId", "originalUrl", filename
        FROM "Image"
        ORDER BY "createdAt" ASC
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT id, "userId", "originalUrl", filename
        FROM "Image"
        WHERE embedding IS NULL
        ORDER BY "createdAt" ASC
      `;

  const total = rows.length;
  console.log(
    `[reembed-images] Mode: ${reembedAll ? "REEMBED_ALL (every image)" : "NULL embeddings only"}`,
  );
  console.log(
    `[reembed-images] Step 1 — query complete: ${total} image(s) to process.`,
  );

  if (total === 0) {
    return;
  }

  await verifyUserIds(rows.map((r) => r.userId));

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const n = i + 1;
    if (i > 0) {
      await replicateCooldown("before next image");
    }
    console.log(
      `[reembed-images] (${n}/${total}) imageId=${row.id} userId=${row.userId} file=${JSON.stringify(row.filename)}`,
    );

    const snap = await fetchRowSnapshot(row.id);
    console.log(
      `[reembed-images]   DB snapshot: ${snap ? `id=${snap.id} userId=${snap.userId}` : "MISSING ROW"}`,
    );
    if (snap && snap.userId !== row.userId) {
      console.warn(
        `[reembed-images]   userId mismatch list vs live row: ${row.userId} vs ${snap.userId}`,
      );
    }

    try {
      console.log(
        `[reembed-images]   Step 2 — CLIP image embedding (andreasjansson/clip-features, inputs=imageUrl)…`,
      );
      console.log(
        `[reembed-images]   imageUrl preview: ${row.originalUrl.slice(0, 100)}${row.originalUrl.length > 100 ? "…" : ""}`,
      );
      const vec = await embedClipImageUrl(row.originalUrl);
      console.log(
        `[reembed-images]   Step 2 — embedding dimensions=${vec.length} (expected ${CLIP_VECTOR_DIM})`,
      );
      if (vec.length !== CLIP_VECTOR_DIM) {
        throw new Error(
          `Unexpected embedding dimension ${vec.length} (expected ${CLIP_VECTOR_DIM})`,
        );
      }

      const lit = vectorToPgLiteral(vec);
      console.log(
        `[reembed-images]   Step 3 — pgvector literal length=${lit.length} chars (first 80): ${lit.slice(0, 80)}…`,
      );

      console.log(`[reembed-images]   Step 4 — Prisma $executeRawUnsafe ::vector(768) …`);
      const { rows: affected, method } = await executeImageEmbeddingUpdate(
        row.id,
        row.userId,
        lit,
      );
      console.log(
        `[reembed-images]   Step 4 — UPDATE affectedRows=${affected} method=${method}`,
      );

      const hasEmb = await embeddingIsSet(row.id);
      console.log(
        `[reembed-images]   Step 5 — verify embedding IS NOT NULL: ${hasEmb}`,
      );

      if (affected !== 1 || !hasEmb) {
        throw new Error(
          `Post-update check failed: affectedRows=${affected} embeddingPresent=${hasEmb}`,
        );
      }

      ok++;
      console.log(`[reembed-images] (${n}/${total}) ✓ done`);
    } catch (err) {
      failed++;
      console.error(
        `[reembed-images] (${n}/${total}) ✗ failed:`,
        err instanceof Error ? err.stack ?? err.message : err,
      );
    }
  }

  console.log(
    `[reembed-images] Done. success=${ok} failed=${failed} total=${total}`,
  );
}

main()
  .catch((e) => {
    console.error("[reembed-images] Fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
