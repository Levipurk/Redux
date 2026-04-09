import Replicate from "replicate";
import { withReplicateRateLimitRetries } from "@/lib/replicate-rate-limit";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const BLIP_MODEL =
  "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746" as const;

function extractCaption(output: unknown): string {
  if (typeof output === "string") {
    return output.trim();
  }
  if (output && typeof output === "object" && "caption" in output) {
    const c = (output as { caption?: unknown }).caption;
    if (typeof c === "string") return c.trim();
  }
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") return first.trim();
  }
  throw new Error(`BLIP: unexpected output shape: ${String(output).slice(0, 200)}`);
}

export async function blipImageCaption(imageUrl: string): Promise<string> {
  const output = await withReplicateRateLimitRetries(() =>
    replicate.run(BLIP_MODEL as `${string}/${string}:${string}`, {
      input: { image: imageUrl },
    }),
  );
  const caption = extractCaption(output);
  if (!caption) {
    throw new Error("BLIP returned an empty caption");
  }
  return caption;
}
