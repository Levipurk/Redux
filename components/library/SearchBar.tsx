"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";
import type { ImageRecord } from "@/types/image";

interface SearchBarProps {
  isSearching: boolean;
  onSearchStart: () => void;
  onSearchSuccess: (images: ImageRecord[]) => void;
  /** End loading / exit search overlay on error, 402, or network failure (not on success). */
  onSearchAbort: () => void;
  onSearchClear: () => void;
}

export default function SearchBar({
  isSearching,
  onSearchStart,
  onSearchSuccess,
  onSearchAbort,
  onSearchClear,
}: SearchBarProps) {
  const [value, setValue] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      onSearchClear();
      return;
    }

    onSearchStart();
    try {
      const res = await fetch(
        `/api/ai/search?query=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );
      if (res.status === 402) {
        toast.error("Insufficient credits");
        onSearchAbort();
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(err.error ?? "Search failed");
        onSearchAbort();
        return;
      }
      const data = (await res.json()) as { images?: unknown };
      const raw = data.images;
      const images = Array.isArray(raw)
        ? (raw as ImageRecord[]).filter(
            (img) =>
              img &&
              typeof img.id === "string" &&
              typeof img.originalUrl === "string",
          )
        : [];
      onSearchSuccess(images);
    } catch {
      toast.error("Search failed");
      onSearchAbort();
    }
  }

  function handleChange(next: string) {
    setValue(next);
    if (next === "") {
      onSearchClear();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 relative min-w-0"
    >
      <Search
        size={12}
        strokeWidth={1.5}
        className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none"
      />
      {isSearching ? (
        <Loader2
          size={14}
          className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[#888888] animate-spin"
          aria-hidden
        />
      ) : null}
      <input
        type="search"
        name="library-search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search by keyword, color, scene, mood..."
        disabled={isSearching}
        className="w-full h-[30px] bg-[#111111] border border-[#2a2a2a] rounded-sm pl-[28px] pr-9 text-[12px] text-white placeholder:text-[#888888] outline-none focus:border-[#3a3a3a] transition-colors disabled:opacity-60"
      />
    </form>
  );
}
