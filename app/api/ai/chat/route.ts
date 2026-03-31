import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic, formatAdjustmentsForPrompt } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
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
// SSE helper
// ---------------------------------------------------------------------------
type SseEvent =
  | { type: "meta"; freeRemaining: number }
  | { type: "text"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "done" };

function encodeEvent(data: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

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

  // ── Credit / free-message gate ────────────────────────────────────────────
  let freeRemaining: number;

  if (user.lifetimeFreeAI < 20) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lifetimeFreeAI: { increment: 1 } },
    });
    freeRemaining = Math.max(0, 19 - user.lifetimeFreeAI);
  } else if (user.creditBalance < 1) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  } else {
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
    freeRemaining = 0;
  }

  // ── Build Anthropic message content ───────────────────────────────────────
  const adjustmentsContext = formatAdjustmentsForPrompt(
    adjustments as Record<AdjustmentKey, number>,
  );

  const userContent: (ImageBlockParam | TextBlockParam)[] = [];

  if (imageBase64 && imageMediaType) {
    const validMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    type ValidMediaType = typeof validMediaTypes[number];
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
      controller.enqueue(encodeEvent({ type: "meta", freeRemaining }));

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
