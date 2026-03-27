import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth } from "@clerk/nextjs/server";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

const f = createUploadthing();

export const ourFileRouter = {
  imageUploader: f({
    "image/jpeg": { maxFileSize: "32MB", maxFileCount: 1 },
    "image/png": { maxFileSize: "32MB", maxFileCount: 1 },
    "image/tiff": { maxFileSize: "32MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const { userId: clerkId } = await auth();
      if (!clerkId) throw new Error("Unauthorized");

      const user = await prisma.user.findUnique({ where: { clerkId } });
      if (!user) throw new Error("User not found");

      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const response = await fetch(file.ufsUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { secureUrl, publicId, width, height, format } =
        await uploadToCloudinary(buffer, file.name);

      await prisma.image.create({
        data: {
          userId: metadata.userId,
          filename: file.name,
          originalUrl: secureUrl,
          publicId,
          width,
          height,
          size: file.size,
          format,
          embedding: [],
        },
      });

      return { url: secureUrl, publicId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
