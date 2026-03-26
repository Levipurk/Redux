import { headers } from "next/headers";
import { Webhook, WebhookVerificationError } from "svix/dist/webhook";
import { prisma } from "@/lib/prisma";

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserPayload {
  id: string;
  email_addresses: ClerkEmailAddress[];
  first_name: string | null;
  last_name: string | null;
}

interface WebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const headersList = await headers();
  const svixHeaders = {
    "svix-id": headersList.get("svix-id") ?? "",
    "svix-timestamp": headersList.get("svix-timestamp") ?? "",
    "svix-signature": headersList.get("svix-signature") ?? "",
  };

  const body = await request.text();

  let event: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, svixHeaders) as WebhookEvent;
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return new Response("Invalid webhook signature", { status: 400 });
    }
    return new Response("Webhook verification failed", { status: 400 });
  }

  const { type, data } = event;
  const primaryEmail = data.email_addresses[0]?.email_address ?? "";
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  if (type === "user.created") {
    await prisma.user.create({
      data: {
        clerkId: data.id,
        email: primaryEmail,
        name,
      },
    });
  }

  if (type === "user.updated") {
    await prisma.user.update({
      where: { clerkId: data.id },
      data: { email: primaryEmail, name },
    });
  }

  return new Response("OK", { status: 200 });
}
