import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { creditBalance: true },
  });

  if (!user) {
    return NextResponse.json({ creditBalance: 0 });
  }

  return NextResponse.json({ creditBalance: user.creditBalance });
}
