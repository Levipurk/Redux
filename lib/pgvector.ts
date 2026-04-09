/** CLIP ViT-L/14 feature dimension (andreasjansson/clip-features). */
export const CLIP_VECTOR_DIM = 768;

/**
 * Format a finite vector for PostgreSQL `::vector(768)` (no SQL injection: numeric only).
 */
export function vectorToPgLiteral(vec: number[]): string {
  if (vec.length !== CLIP_VECTOR_DIM) {
    throw new Error(`Expected ${CLIP_VECTOR_DIM}-dim CLIP vector, got ${vec.length}`);
  }
  for (let i = 0; i < vec.length; i++) {
    if (!Number.isFinite(vec[i])) {
      throw new Error("Vector contains non-finite values");
    }
  }
  return `[${vec.join(",")}]`;
}
