"use client";

import type { ImageGroup } from "@/types/image";
import PhotoCard from "./PhotoCard";

interface PhotoGridProps {
  groups: ImageGroup[];
  loading?: boolean;
}

function SkeletonGrid() {
  return (
    <div className="flex flex-col gap-5">
      {[10, 8].map((count, i) => (
        <div key={i}>
          <div className="h-[10px] w-14 bg-[#1a1a1a] rounded-sm animate-pulse mb-3" />
          <div className="grid grid-cols-5 gap-[6px]">
            {Array.from({ length: count }).map((_, j) => (
              <div
                key={j}
                className="aspect-square bg-[#161616] rounded-sm animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PhotoGrid({ groups, loading }: PhotoGridProps) {
  if (loading) {
    return (
      <div className="px-5 py-4">
        <SkeletonGrid />
      </div>
    );
  }

  const hasImages = groups.some((g) => g.images.length > 0);

  if (!hasImages) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-[#555555] text-[13px]">Upload your first photo</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-5">
      {groups.map((group) =>
        group.images.length === 0 ? null : (
          <div key={group.label}>
            <p className="text-[10px] text-[#555555] uppercase tracking-[0.14em] font-medium mb-2">
              {group.label}
            </p>
            <div className="grid grid-cols-5 gap-[6px]">
              {group.images.map((image) => (
                <PhotoCard key={image.id} image={image} />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
