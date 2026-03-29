"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ImageRecord } from "@/types/image";

interface PhotoCardProps {
  image: ImageRecord;
}

export default function PhotoCard({ image }: PhotoCardProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/editor?imageId=${image.id}`)}
      className="group relative w-full aspect-square bg-[#161616] rounded-sm overflow-hidden cursor-pointer"
    >
      <Image
        src={image.originalUrl}
        alt={image.filename}
        fill
        sizes="(max-width: 768px) 50vw, 20vw"
        className="object-cover transition-all duration-200 group-hover:brightness-75"
      />
    </button>
  );
}
