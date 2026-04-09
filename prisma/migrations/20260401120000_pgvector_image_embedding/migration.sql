-- Enable pgvector (run on Neon / PostgreSQL before using embedding search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Legacy table from earlier semantic-search iterations (safe if missing)
DROP TABLE IF EXISTS "ImageEmbedding";

-- Replace float array column with pgvector (CLIP ViT-L/14 = 768 dimensions)
ALTER TABLE "Image" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Image" ADD COLUMN "embedding" vector(768);

-- Cosine similarity queries (<=> operator)
CREATE INDEX IF NOT EXISTS "Image_embedding_hnsw_idx"
ON "Image"
USING hnsw ("embedding" vector_cosine_ops);
