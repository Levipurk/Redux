/**
 * L2-normalize a CLIP embedding so cosine similarity search stays stable. Zero-norm vectors are rejected.
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
    throw new Error("clip-embed: zero or non-finite norm — embedding unusable");
  }
  return vector.map((v) => v / norm);
}
