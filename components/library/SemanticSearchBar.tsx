"use client";

import { Loader2, Search } from "lucide-react";

interface SemanticSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

/**
 * Text semantic search only — submit with Enter (no extra action buttons).
 */
export default function SemanticSearchBar({
  value,
  onChange,
  onSubmit,
  loading = false,
}: SemanticSearchBarProps) {
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  return (
    <form
      className="flex-1 flex items-center gap-2 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="relative flex-1 min-w-0">
        <Search
          size={12}
          strokeWidth={1.5}
          className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by mood, scene, subject… (Enter)"
          disabled={loading}
          enterKeyHint="search"
          className="w-full h-[30px] bg-[#111111] border border-[#2a2a2a] rounded-sm pl-[28px] pr-3 text-[12px] text-white placeholder:text-[#888888] outline-none focus:border-[#3a3a3a] transition-colors disabled:opacity-50"
        />
        {loading && (
          <Loader2
            size={12}
            strokeWidth={2}
            className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[#888888] animate-spin pointer-events-none"
          />
        )}
      </div>
    </form>
  );
}
