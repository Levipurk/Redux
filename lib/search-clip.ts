import Replicate from "replicate";
import { normalizeEmbeddingL2 } from "@/lib/clip-embed";
import { withReplicateRateLimitRetries } from "@/lib/replicate-rate-limit";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/** CLIP ViT-L/14 — same model & space for image `inputs` (URL) and text `inputs` (query). */
const CLIP_SEARCH_MODEL =
  "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a" as const;

function assertHttpImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    throw new Error("clip-features: image URL is empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("clip-features: image URL is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("clip-features: image URL must use http or https");
  }
  if (parsed.hostname.length === 0) {
    throw new Error("clip-features: image URL has no host");
  }
  return trimmed;
}

function extractEmbeddingRows(output: unknown): number[][] {
  if (!Array.isArray(output)) {
    throw new Error("clip-features: expected array output");
  }
  const rows: number[][] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const emb = (item as { embedding?: unknown }).embedding;
    if (!Array.isArray(emb) || emb.length === 0) continue;
    rows.push(emb.map((n) => Number(n)));
  }
  if (rows.length === 0) {
    throw new Error("clip-features: no embeddings in output");
  }
  return rows;
}

/**
 * Image encoder: passes the image URL as `inputs` to clip-features (pixels → 768-d vector).
 * Same embedding space as {@link embedSearchQueryText} for cross-modal search.
 */
export async function embedClipImageUrl(imageUrl: string): Promise<number[]> {
  const url = assertHttpImageUrl(imageUrl);
  const output = await withReplicateRateLimitRetries(() =>
    replicate.run(CLIP_SEARCH_MODEL as `${string}/${string}:${string}`, {
      input: { inputs: url },
    }),
  );
  const rows = extractEmbeddingRows(output);
  if (rows.length !== 1) {
    throw new Error(
      `clip-features: expected 1 image embedding, got ${rows.length}`,
    );
  }
  return normalizeEmbeddingL2(rows[0]);
}

/**
 * Text encoder for search: passes the query string as `inputs` to clip-features.
 * Returns an L2 unit vector for cosine distance in pgvector.
 */
export async function embedSearchQueryText(query: string): Promise<number[]> {
  const q = query.trim();
  if (!q) {
    throw new Error("clip-features: empty search query");
  }
  const output = await withReplicateRateLimitRetries(() =>
    replicate.run(CLIP_SEARCH_MODEL as `${string}/${string}:${string}`, {
      input: { inputs: q },
    }),
  );
  const rows = extractEmbeddingRows(output);
  if (rows.length !== 1) {
    throw new Error(`clip-features: expected 1 embedding, got ${rows.length}`);
  }
  return normalizeEmbeddingL2(rows[0]);
}
