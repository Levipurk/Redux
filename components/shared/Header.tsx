"use client";

import { Search } from "lucide-react";
import UploadButton from "@/components/library/UploadButton";

interface HeaderProps {
  onUploadComplete?: () => void;
}

export default function Header({ onUploadComplete }: HeaderProps) {
  return (
    <header className="h-[48px] bg-[#0a0a0a] border-b border-[#2a2a2a] flex items-center px-3 gap-3 shrink-0">
      {/* Logo */}
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

      {/* Divider */}
      <div className="w-px h-[18px] bg-[#2a2a2a] shrink-0" />

      {/* Search */}
      <div className="flex-1 relative">
        <Search
          size={12}
          strokeWidth={1.5}
          className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search by keyword, color, scene, mood..."
          className="w-full h-[30px] bg-[#111111] border border-[#2a2a2a] rounded-sm pl-[28px] pr-3 text-[12px] text-white placeholder:text-[#888888] outline-none focus:border-[#3a3a3a] transition-colors"
        />
      </div>

      {/* Upload */}
      <UploadButton onUploadComplete={onUploadComplete} />
    </header>
  );
}
