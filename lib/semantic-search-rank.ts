import { cosineSimilarity, normalizeEmbeddingL2 } from "@/lib/clip-embed";

export interface IndexedEmbeddingRow {
  imageId: string;
  imageUrl: string;
  vector: number[];
}

/**
 * Compare **unit** query embedding to stored image embeddings.
 * Re-normalizes each stored vector so legacy or slightly off-norm rows still score correctly.
 * Keeps only scores ≥ `minSimilarity`, sorts descending, returns top K.
 */
export function rankSemanticSearchMatches(
  queryUnitVector: number[],
  rows: IndexedEmbeddingRow[],
  minSimilarity: number,
  topK: number,
): { imageId: string; imageUrl: string; score: number }[] {
  if (queryUnitVector.length === 0) return [];

  const scored: { imageId: string; imageUrl: string; score: number }[] = [];

  for (const row of rows) {
    if (row.vector.length === 0 || row.vector.length !== queryUnitVector.length) {
      continue;
    }
    const imageUnit = normalizeEmbeddingL2(row.vector.slice());
    const score = cosineSimilarity(queryUnitVector, imageUnit);
    if (score >= minSimilarity) {
      scored.push({
        imageId: row.imageId,
        imageUrl: row.imageUrl,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
