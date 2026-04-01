import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic, formatAdjustmentsForPrompt } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/kv";
import type { AdjustmentKey } from "@/constants/adjustments";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert photo editing assistant for Redux Studio. \
When the user asks for edits, respond with a helpful, concise message AND — \
whenever you recommend any adjustments — include a JSON object of the changes \
wrapped in adjustment tags exactly like this:

[adjustments]{"brightness": 20, "contrast": 10}[/adjustments]

If the user attaches a reference image, analyze its color grading, tone, \
contrast, and mood, then translate those characteristics into adjustment values.

Rules:
- Only include adjustments that should change from their current value.
- Keep explanations brief and practical.
- Available adjustments (all range from -100 to 100):
  brightness, exposure, contrast, blacks, whites, highlights, shadows,
  vibrance, saturation, temperature, tint, hue, sharpen, noiseReduction,
  vignette, grain, clarity
- Put the [adjustments] block at the very end of your response.
- If no adjustments are needed, omit the block entirely.`;

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
type SseEvent =
  | { type: "meta"; lifetimeFreeRemaining: number; creditBalanceAfter: number }
  | { type: "text"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "done" };

function encodeEvent(data: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

const FREE_HOURLY_LIMIT = 10;
const CREDIT_HOURLY_LIMIT = 60;

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------
interface ChatRequestBody {
  userMessage: string;
  adjustments?: Record<AdjustmentKey, number>;
  imageBase64?: string;
  imageMediaType?: string;
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const { userMessage, adjustments = {}, imageBase64, imageMediaType } = body;

  if (!userMessage?.trim()) {
    return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
  }

  // ── Find user ─────────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Block only when lifetime free is used up AND there are no credits left.
  // While lifetimeFreeAI < 20, messages are free (lifetime counter increments).
  // Once lifetimeFreeAI reaches 20, each message deducts 1 credit with no extra step.
  if (user.lifetimeFreeAI >= 20 && user.creditBalance === 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  /** True while the user still has lifetime free messages (before the 21st send). */
  const onFreeTier = user.lifetimeFreeAI < 20;

  // ── Hourly rate limiting ─────────────────────────────────────────────────
  if (onFreeTier) {
    const hourly = await checkRateLimit(user.id, "chat_free", FREE_HOURLY_LIMIT);
    if (!hourly.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }
  } else {
    const hourly = await checkRateLimit(user.id, "chat_credit", CREDIT_HOURLY_LIMIT);
    if (!hourly.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }
  }

  // ── Consume free message or credit ───────────────────────────────────────
  let lifetimeFreeRemaining: number;
  let creditBalanceAfter: number;

  if (onFreeTier) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lifetimeFreeAI: { increment: 1 } },
    });
    lifetimeFreeRemaining = Math.max(0, 20 - (user.lifetimeFreeAI + 1));
    creditBalanceAfter = user.creditBalance;
  } else {
    // Paid path: lifetime free already exhausted — charge 1 credit per message.
    if (user.creditBalance < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: 1 } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -1,
        feature: "chat_message",
      },
    });
    lifetimeFreeRemaining = 0;
    creditBalanceAfter = user.creditBalance - 1;
  }

  // ── Build Anthropic message content ───────────────────────────────────────
  const adjustmentsContext = formatAdjustmentsForPrompt(
    adjustments as Record<AdjustmentKey, number>,
  );

  const userContent: (ImageBlockParam | TextBlockParam)[] = [];

  if (imageBase64 && imageMediaType) {
    const validMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    type ValidMediaType = (typeof validMediaTypes)[number];
    const media = validMediaTypes.includes(imageMediaType as ValidMediaType)
      ? (imageMediaType as ValidMediaType)
      : "image/jpeg";

    userContent.push({
      type: "image",
      source: { type: "base64", media_type: media, data: imageBase64 },
    });
  }

  userContent.push({
    type: "text",
    text: `${userMessage.trim()}\n\n${adjustmentsContext}`,
  });

  // ── Stream response ───────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeEvent({ type: "meta", lifetimeFreeRemaining, creditBalanceAfter }),
      );

      let fullText = "";

      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(encodeEvent({ type: "text", text: chunk }));
          }
        }

        // Extract [adjustments] block and emit as a separate event
        const adjMatch = fullText.match(/\[adjustments\]([\s\S]*?)\[\/adjustments\]/);
        if (adjMatch) {
          try {
            const parsed = JSON.parse(adjMatch[1]) as Partial<Record<AdjustmentKey, number>>;
            controller.enqueue(encodeEvent({ type: "adjustments", adjustments: parsed }));
          } catch {
            console.error("[/api/ai/chat] Failed to parse [adjustments] JSON:", adjMatch[1]);
          }
        }
      } catch (err) {
        console.error("[/api/ai/chat] Anthropic stream error:", err);
        controller.enqueue(
          encodeEvent({ type: "text", text: "\n\nSomething went wrong. Please try again." }),
        );
      }

      controller.enqueue(encodeEvent({ type: "done" }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
