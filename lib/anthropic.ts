import Anthropic from "@anthropic-ai/sdk";
import type { AdjustmentKey } from "@/constants/adjustments";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Formats the current adjustment state as a human-readable string so Claude
 * has context about what the photo already looks like before the user's request.
 */
export function formatAdjustmentsForPrompt(
  adjustments: Record<AdjustmentKey, number>,
): string {
  const nonZero = (Object.entries(adjustments) as [AdjustmentKey, number][])
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k}: ${v > 0 ? "+" : ""}${v}`)
    .join(", ");

  return nonZero
    ? `Current photo adjustments: ${nonZero}`
    : "All adjustments are at their defaults (0 — no edits applied yet).";
}
