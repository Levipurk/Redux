"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type { ImageRecord } from "@/types/image";

interface PhotoCardProps {
  image: ImageRecord;
  onDelete?: (id: string) => void;
}

export default function PhotoCard({ image, onDelete }: PhotoCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: image.id }),
      });
      if (res.ok) {
        onDelete?.(image.id);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    router.push(`/editor?imageId=${image.id}`);
  }

  return (
    <div
      onClick={() => router.push(`/editor?imageId=${image.id}`)}
      className="group relative w-full aspect-square bg-[#161616] rounded-sm overflow-hidden cursor-pointer"
    >
      <Image
        src={image.originalUrl}
        alt={image.filename}
        fill
        sizes="(max-width: 768px) 50vw, 20vw"
        className="object-cover"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
        <button
          onClick={handleEdit}
          className="flex items-center gap-[5px] h-[28px] px-[10px] bg-black/60 rounded-sm text-white text-[11px] font-medium hover:bg-black/80 transition-colors cursor-pointer"
        >
          <Pencil size={11} strokeWidth={2} />
          Edit
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center gap-[5px] h-[28px] px-[10px] bg-black/60 rounded-sm text-[#ef4444] text-[11px] font-medium hover:bg-black/80 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Trash2 size={11} strokeWidth={2} />
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
