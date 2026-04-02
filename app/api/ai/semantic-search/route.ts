import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/kv";
import { embedClipTextSearchQuery } from "@/lib/clip-embed";
import { rankSemanticSearchMatches } from "@/lib/semantic-search-rank";
import {
  SEMANTIC_MIN_COSINE_SIMILARITY,
  SEMANTIC_SEARCH_TOP_K,
} from "@/constants/semantic-search";

const SEMANTIC_SEARCH_COST = 1;
const MAX_QUERY_LEN = 500;

interface SemanticSearchHit {
  imageId: string;
  imageUrl: string;
  score: number;
}

interface RequestBody {
  query?: string;
  filters?: Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.creditBalance < SEMANTIC_SEARCH_COST) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const rateLimit = await checkRateLimit(user.id, "semantic_search", 20);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as RequestBody;

    if (
      body.filters != null &&
      (typeof body.filters !== "object" || body.filters === null || Array.isArray(body.filters))
    ) {
      return NextResponse.json({ error: "filters must be a plain object" }, { status: 400 });
    }

    const rawQuery = typeof body.query === "string" ? body.query.trim() : "";
    if (!rawQuery) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    if (rawQuery.length > MAX_QUERY_LEN) {
      return NextResponse.json(
        { error: `query must be at most ${MAX_QUERY_LEN} characters` },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: SEMANTIC_SEARCH_COST } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -SEMANTIC_SEARCH_COST,
        feature: "semantic_search",
      },
    });

    const userId = user.id;

    async function refundCredits(reason: string) {
      await prisma.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: SEMANTIC_SEARCH_COST } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId,
          type: "REFUND",
          amount: SEMANTIC_SEARCH_COST,
          feature: "semantic_search",
          description: reason,
        },
      });
    }

    try {
      const queryVector = await embedClipTextSearchQuery(rawQuery);

      const rows = await prisma.imageEmbedding.findMany({
        where: {
          image: { userId: user.id },
        },
        select: {
          vector: true,
          imageId: true,
          image: {
            select: { originalUrl: true },
          },
        },
      });

      const indexed = rows.map((row) => ({
        imageId: row.imageId,
        imageUrl: row.image.originalUrl,
        vector: row.vector,
      }));

      const results: SemanticSearchHit[] = rankSemanticSearchMatches(
        queryVector,
        indexed,
        SEMANTIC_MIN_COSINE_SIMILARITY,
        SEMANTIC_SEARCH_TOP_K,
      );

      return NextResponse.json({ results });
    } catch (innerErr) {
      console.error("[/api/ai/semantic-search]", innerErr);
      await refundCredits("Refund: semantic search failed");
      const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
      return NextResponse.json(
        { error: "Semantic search failed", detail: message },
        { status: 500 },
      );
    }
  } catch (outerErr) {
    console.error("[/api/ai/semantic-search] Unexpected error:", outerErr);
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 },
    );
  }
}
