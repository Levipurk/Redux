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
// Detailed error logger — prints every field we can extract
// ---------------------------------------------------------------------------
function logError(label: string, err: unknown): void {
  console.error(`\n====== [/api/ai/chat] ERROR at: ${label} ======`);
  if (err instanceof Error) {
    console.error("  message :", err.message);
    console.error("  name    :", err.name);
    console.error("  stack   :", err.stack);
    // Anthropic SDK errors carry extra fields
    const anyErr = err as Record<string, unknown>;
    if ("status" in anyErr)   console.error("  status  :", anyErr.status);
    if ("error" in anyErr)    console.error("  error   :", JSON.stringify(anyErr.error, null, 2));
    if ("headers" in anyErr)  console.error("  headers :", anyErr.headers);
    if ("request_id" in anyErr) console.error("  request_id:", anyErr.request_id);
  } else {
    console.error("  (non-Error thrown):", err);
  }
  console.error(`======================================================\n`);
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
  console.log("[/api/ai/chat] ── incoming request ──");

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const { userId: clerkId } = await auth();
    console.log("[/api/ai/chat] auth clerkId:", clerkId ?? "(none)");
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = (await request.json()) as ChatRequestBody;
    const { userMessage, adjustments = {}, imageBase64, imageMediaType } = body;
    console.log("[/api/ai/chat] userMessage:", userMessage?.slice(0, 80));
    console.log("[/api/ai/chat] hasImage:", !!imageBase64, "mediaType:", imageMediaType ?? "(none)");
    console.log("[/api/ai/chat] adjustments keys:", Object.keys(adjustments).join(", ") || "(empty)");

    if (!userMessage?.trim()) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    // ── Find user ──────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { clerkId } });
    console.log("[/api/ai/chat] user found:", !!user, "| lifetimeFreeAI:", user?.lifetimeFreeAI, "| creditBalance:", user?.creditBalance);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── Credit / free-message gate ─────────────────────────────────────────
    let freeRemaining: number;

    if (user.lifetimeFreeAI < 20) {
      console.log("[/api/ai/chat] free-tier message — incrementing lifetimeFreeAI");
      await prisma.user.update({
        where: { id: user.id },
        data: { lifetimeFreeAI: { increment: 1 } },
      });
      freeRemaining = Math.max(0, 19 - user.lifetimeFreeAI);
    } else if (user.creditBalance < 1) {
      console.log("[/api/ai/chat] insufficient credits — returning 402");
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    } else {
      console.log("[/api/ai/chat] deducting 1 credit");
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

    console.log("[/api/ai/chat] credit gate passed — freeRemaining:", freeRemaining);

    // ── Build Anthropic message content ────────────────────────────────────
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

    console.log("[/api/ai/chat] userContent blocks:", userContent.map((b) => b.type).join(", "));

    // ── Check ANTHROPIC_API_KEY presence (never log the key itself) ─────────
    const keyPresent = !!process.env.ANTHROPIC_API_KEY;
    const keyLength  = process.env.ANTHROPIC_API_KEY?.length ?? 0;
    console.log("[/api/ai/chat] ANTHROPIC_API_KEY present:", keyPresent, "| length:", keyLength);

    // ── Stream response ────────────────────────────────────────────────────
    console.log("[/api/ai/chat] opening SSE stream and calling Anthropic …");

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encodeEvent({ type: "meta", freeRemaining }));

        let fullText = "";
        let chunkCount = 0;

        try {
          console.log("[/api/ai/chat] anthropic.messages.stream() — starting");

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
              chunkCount++;
              controller.enqueue(encodeEvent({ type: "text", text: chunk }));
            }
          }

          console.log("[/api/ai/chat] Anthropic stream complete — chunks:", chunkCount, "| totalLength:", fullText.length);

          // Extract [adjustments] block
          const adjMatch = fullText.match(/\[adjustments\]([\s\S]*?)\[\/adjustments\]/);
          if (adjMatch) {
            console.log("[/api/ai/chat] found [adjustments] block:", adjMatch[1].slice(0, 200));
            try {
              const parsed = JSON.parse(adjMatch[1]) as Partial<Record<AdjustmentKey, number>>;
              console.log("[/api/ai/chat] parsed adjustments:", JSON.stringify(parsed));
              controller.enqueue(encodeEvent({ type: "adjustments", adjustments: parsed }));
            } catch (parseErr) {
              console.error("[/api/ai/chat] failed to parse [adjustments] JSON:", parseErr);
            }
          } else {
            console.log("[/api/ai/chat] no [adjustments] block in response");
          }

        } catch (err) {
          logError("Anthropic stream (inside ReadableStream)", err);
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

  } catch (err) {
    logError("outer POST handler (before stream opened)", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
