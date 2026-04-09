"use client";

import Image from "next/image";
import {
  Minus,
  Plus,
  Columns2,
  Undo2,
  Redo2,
  History,
  Share2,
  RotateCcw,
} from "lucide-react";

interface ToolbarProps {
  filename?: string;
  zoom: number;
  showBefore: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  toggleBefore: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isDirty: boolean;
  // true for ~2 s after a successful auto-save — triggers the pulse animation
  justSaved?: boolean;
  onExport: () => void;
  onShowHistory: () => void;
}

function ToolbarBtn({
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "flex items-center justify-center w-[28px] h-[28px] rounded-sm transition-colors cursor-pointer",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        active
          ? "bg-[#2a2a2a] text-white"
          : "text-[#888888] hover:bg-[#1a1a1a] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-[16px] bg-[#2a2a2a] mx-1" />;
}

export default function Toolbar({
  filename,
  zoom,
  showBefore,
  zoomIn,
  zoomOut,
  resetZoom,
  toggleBefore,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isDirty,
  justSaved = false,
  onExport,
  onShowHistory,
}: ToolbarProps) {
  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <div className="flex items-center justify-between h-[52px] px-4 bg-[#0a0a0a] border-b border-[#2a2a2a] shrink-0">
      {/* Left — Logo */}
      <div className="flex items-center w-[160px]">
        <Image
          src="/logo.png"
          alt="Redux"
          width={52}
          height={52}
          className="h-[52px] w-auto object-contain shrink-0"
          priority
        />
      </div>

      {/* Center — canvas controls */}
      <div className="flex items-center gap-[2px]">
        {/* Zoom */}
        <ToolbarBtn onClick={zoomOut} title="Zoom out">
          <Minus size={13} strokeWidth={2} />
        </ToolbarBtn>

        <button
          onClick={resetZoom}
          title="Reset zoom"
          className="flex items-center justify-center h-[28px] px-[10px] rounded-sm text-[12px] text-white tabular-nums hover:bg-[#1a1a1a] transition-colors cursor-pointer"
        >
          {zoomPercent}
        </button>

        <ToolbarBtn onClick={zoomIn} title="Zoom in">
          <Plus size={13} strokeWidth={2} />
        </ToolbarBtn>

        <Divider />

        {/* Before / After */}
        <ToolbarBtn
          onClick={toggleBefore}
          active={showBefore}
          title={showBefore ? "Show after" : "Show before"}
        >
          <Columns2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>

        <Divider />

        {/* Undo / Redo */}
        <ToolbarBtn onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>
      </div>

      {/* Right — file info + actions */}
      <div className="flex items-center gap-3 w-[220px] justify-end">
        {filename && (
          <span className="text-[12px] text-[#888888] truncate max-w-[90px]">
            {filename}
          </span>
        )}

        <div className="flex items-center gap-[5px]">
          <span
            className={[
              "w-[6px] h-[6px] rounded-full shrink-0 transition-colors",
              isDirty ? "bg-[#f59e0b]" : "bg-[#22c55e]",
              // Pulse for 2 s after a successful auto-save
              justSaved ? "animate-pulse" : "",
            ].join(" ")}
          />
          <span className="text-[11px] text-[#888888] whitespace-nowrap">
            {isDirty ? "Unsaved" : justSaved ? "Saving…" : "Auto-saved"}
          </span>
        </div>

        <ToolbarBtn onClick={onShowHistory} title="Version history">
          <History size={14} strokeWidth={1.75} />
        </ToolbarBtn>

        <ToolbarBtn onClick={onExport} title="Export / share">
          <Share2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>
      </div>
    </div>
  );
}
