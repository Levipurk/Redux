"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/shared/Header";
import BottomNav from "@/components/shared/BottomNav";
import PhotoGrid from "@/components/library/PhotoGrid";
import type { ImageRecord, ImageGroup } from "@/types/image";

function groupImagesByMonth(images: ImageRecord[]): ImageGroup[] {
  if (!images.length) return [];

  const now = new Date();
  const groupMap = new Map<string, ImageRecord[]>();

  for (const image of images) {
    const date = new Date(image.createdAt);
    const sameMonth =
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const label = sameMonth
      ? "RECENT"
      : date
          .toLocaleDateString("en-US", { month: "long", year: "numeric" })
          .toUpperCase();

    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push(image);
  }

  return Array.from(groupMap.entries()).map(([label, images]) => ({
    label,
    images,
  }));
}

export default function LibraryPage() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/images");
      if (!res.ok) return;
      const data = (await res.json()) as { images: ImageRecord[] };
      setImages(data.images);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleDeleteImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const groups = groupImagesByMonth(images);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <Header onUploadComplete={fetchImages} />
      <main className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <PhotoGrid
          groups={groups}
          loading={loading}
          onDeleteImage={handleDeleteImage}
        />
      </main>
      <BottomNav />
    </div>
  );
}
