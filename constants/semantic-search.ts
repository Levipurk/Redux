/**
 * Semantic search tuning (CLIP ViT-L/14, L2-normalized vectors).
 * Cosine runs roughly -1 to 1; unrelated pairs are often below ~0.18; decent matches typically 0.22+.
 */
export const SEMANTIC_SEARCH_TOP_K = 50;

/** Drop matches below this cosine similarity so weak / irrelevant hits are not shown. */
export const SEMANTIC_MIN_COSINE_SIMILARITY = 0.2;
