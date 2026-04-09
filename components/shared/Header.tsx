"use client";

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
    <header className="h-[48px] bg-[#0a0a0a] border-b border-[#2a2a2a] flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-[26px] h-[26px] bg-[#161616] border border-[#2a2a2a] rounded-sm flex items-center justify-center">
          <span className="text-white text-[13px] font-bold leading-none select-none">
            r
          </span>
        </div>
        <span className="text-white text-[13px] font-medium tracking-tight select-none">
          redux
        </span>
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
