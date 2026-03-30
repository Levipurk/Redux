import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const f = createUploadthing();

export const ourFileRouter = {
  // awaitServerData: false lets onClientUploadComplete fire immediately after
  // the CDN upload, without waiting for a server webhook callback (which can't
  // reach localhost in dev). The Cloudinary upload + Prisma save are triggered
  // by the client via POST /api/images after onClientUploadComplete fires.
  imageUploader: f(
    {
      "image/jpeg": { maxFileSize: "32MB", maxFileCount: 1 },
      "image/png": { maxFileSize: "32MB", maxFileCount: 1 },
      "image/tiff": { maxFileSize: "32MB", maxFileCount: 1 },
    },
    { awaitServerData: false },
  )
    .middleware(async () => {
      const { userId: clerkId } = await auth();
      if (!clerkId) throw new Error("Unauthorized");

      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses[0]?.emailAddress ?? "";
      const name = clerkUser?.fullName ?? null;

      const user = await prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: { clerkId, email, name },
      });

      return { userId: user.id };
    })
    .onUploadComplete(() => {
      // Intentionally empty — processing happens via POST /api/images
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
