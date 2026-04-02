import Replicate from "replicate";
import {
  withReplicateRateLimitRetries,
} from "@/lib/replicate-rate-limit";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/** Pinned CLIP ViT-L/14 feature model — same space for image URLs and text lines. */
const CLIP_FEATURES_MODEL =
  "andreasjansson/clip-features:d3f4012c6f26d1a59e51bedacdb257a76f3183bef86eaf447a953f1df9d351ff" as const;

/**
 * L2-normalize a CLIP embedding so cosine similarity search can use dot products
 * and scores stay in a stable range. Zero-norm vectors are rejected.
 */
export function normalizeEmbeddingL2(vector: number[]): number[] {
  if (vector.length === 0) {
    throw new Error("clip-embed: cannot normalize empty vector");
  }
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) {
    throw new Error("clip-embed: zero or non-finite norm — image embedding unusable");
  }
  return vector.map((v) => v / norm);
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

async function runClipModelOnce(trimmed: string): Promise<number[]> {
  const output = await replicate.run(
    CLIP_FEATURES_MODEL as `${string}/${string}:${string}`,
    { input: { inputs: trimmed } },
  );
  const rows = extractEmbeddingRows(output);
  if (rows.length !== 1) {
    throw new Error(`clip-features: expected 1 embedding, got ${rows.length}`);
  }
  return rows[0];
}

async function runClipWithThrottleRetries(trimmed: string): Promise<number[]> {
  return withReplicateRateLimitRetries(() => runClipModelOnce(trimmed));
}

function assertNonEmptyImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    throw new Error("clip-embed: image URL is empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("clip-embed: image URL is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("clip-embed: image URL must use http or https");
  }
  if (parsed.hostname.length === 0) {
    throw new Error("clip-embed: image URL has no host");
  }
  return trimmed;
}

/**
 * CLIP embedding for an image reachable at `imageUrl`, L2-normalized for similarity search.
 */
export async function embedClipImageUrl(imageUrl: string): Promise<number[]> {
  const url = assertNonEmptyImageUrl(imageUrl);
  const raw = await runClipWithThrottleRetries(url);
  return normalizeEmbeddingL2(raw);
}

/**
 * CLIP embedding for a text query (same space as {@link embedClipImageUrl}), L2-normalized.
 */
export async function embedClipLine(line: string): Promise<number[]> {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("clip-features: empty input");
  }
  const raw = await runClipWithThrottleRetries(trimmed);
  return normalizeEmbeddingL2(raw);
}

/**
 * Text encoder for **image library search**: combines the raw query with a photo-style caption
 * so the embedding aligns with how CLIP sees natural images (scenes, objects, styles).
 * Two CLIP runs are averaged, then L2-normalized to a unit vector for cosine search.
 */
export async function embedClipTextSearchQuery(userQuery: string): Promise<number[]> {
  const q = userQuery.trim().replace(/\s+/g, " ");
  if (!q) {
    throw new Error("clip-features: empty search query");
  }
  const literal = q;
  const captioned = /^(a |an )?(photo|photograph|image)\b/i.test(q)
    ? q
    : `a photograph of ${q}`;

  if (captioned === literal) {
    return embedClipLine(literal);
  }

  const [rawA, rawB] = await Promise.all([
    runClipWithThrottleRetries(literal),
    runClipWithThrottleRetries(captioned),
  ]);
  if (rawA.length !== rawB.length || rawA.length === 0) {
    throw new Error("clip-features: mismatched embedding dimensions");
  }
  const avg = rawA.map((v, i) => (v + rawB[i]) / 2);
  return normalizeEmbeddingL2(avg);
}

/**
 * Cosine similarity. If both vectors are L2-normalized, this equals the dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
