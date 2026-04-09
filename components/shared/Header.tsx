"use client";

import Image from "next/image";
import UploadButton from "@/components/library/UploadButton";
import SearchBar from "@/components/library/SearchBar";
import type { ImageRecord } from "@/types/image";

interface HeaderProps {
  onUploadComplete?: () => void;
  isSearching: boolean;
  onSearchStart: () => void;
  onSearchSuccess: (images: ImageRecord[]) => void;
  onSearchAbort: () => void;
  onSearchClear: () => void;
}

export default function Header({
  onUploadComplete,
  isSearching,
  onSearchStart,
  onSearchSuccess,
  onSearchAbort,
  onSearchClear,
}: HeaderProps) {
  return (
    <header className="h-[52px] bg-[#0a0a0a] border-b border-[#2a2a2a] flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center shrink-0">
        <Image
          src="/logo.png"
          alt="Redux"
          width={52}
          height={52}
          className="h-[52px] w-auto object-contain"
          priority
        />
      </div>

      <div className="w-px h-[18px] bg-[#2a2a2a] shrink-0" />

      <SearchBar
        isSearching={isSearching}
        onSearchStart={onSearchStart}
        onSearchSuccess={onSearchSuccess}
        onSearchAbort={onSearchAbort}
        onSearchClear={onSearchClear}
      />

      <UploadButton onUploadComplete={onUploadComplete} />
    </header>
  );
}
