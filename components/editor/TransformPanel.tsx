"use client";

import { useState } from "react";
import {
  CropIcon,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Maximize2,
  Lock,
  Unlock,
} from "lucide-react";
import AdjustmentSlider from "./AdjustmentSlider";

interface ResizeState {
  width: string;
  height: string;
  locked: boolean;
}

interface TransformPanelProps {
  originalWidth?: number;
  originalHeight?: number;
  onCrop?: () => void;
  onRotateCW?: () => void;
  onRotateCCW?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onStraighten?: (degrees: number) => void;
  onResize?: (width: number, height: number) => void;
}

function TransformBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center gap-[7px] w-full h-[34px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm text-[13px] text-white hover:bg-[#222222] transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

export default function TransformPanel({
  originalWidth,
  originalHeight,
  onCrop,
  onRotateCW,
  onRotateCCW,
  onFlipH,
  onFlipV,
  onStraighten,
  onResize,
}: TransformPanelProps) {
  const [straighten, setStraighten] = useState(0);
  const [showResize, setShowResize] = useState(false);
  const [resize, setResize] = useState<ResizeState>({
    width: String(originalWidth ?? ""),
    height: String(originalHeight ?? ""),
    locked: true,
  });

  const aspectRatio =
    originalWidth && originalHeight ? originalWidth / originalHeight : 1;

  function handleWidthChange(val: string) {
    const w = parseInt(val);
    if (resize.locked && !isNaN(w)) {
      setResize((prev) => ({
        ...prev,
        width: val,
        height: String(Math.round(w / aspectRatio)),
      }));
    } else {
      setResize((prev) => ({ ...prev, width: val }));
    }
  }

  function handleHeightChange(val: string) {
    const h = parseInt(val);
    if (resize.locked && !isNaN(h)) {
      setResize((prev) => ({
        ...prev,
        height: val,
        width: String(Math.round(h * aspectRatio)),
      }));
    } else {
      setResize((prev) => ({ ...prev, height: val }));
    }
  }

  function commitStraighten(val: number) {
    setStraighten(val);
    onStraighten?.(val);
  }

  function applyResize() {
    const w = parseInt(resize.width);
    const h = parseInt(resize.height);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      onResize?.(w, h);
      setShowResize(false);
    }
  }

  return (
    <div className="w-[280px] shrink-0 bg-[#111111] border-r border-[#2a2a2a] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center px-4 h-[44px] border-b border-[#2a2a2a]">
        <span className="text-[12px] font-medium uppercase tracking-widest text-[#888888] select-none">
          Transform
        </span>
      </div>

      <div className="flex flex-col gap-[7px] px-4 pt-4 pb-4">
        {/* Crop */}
        <TransformBtn onClick={() => onCrop?.()} title="Activate crop tool">
          <CropIcon size={13} strokeWidth={1.75} />
          Crop
        </TransformBtn>

        {/* Rotate row */}
        <div className="grid grid-cols-2 gap-[7px]">
          <TransformBtn onClick={() => onRotateCCW?.()} title="Rotate 90° counter-clockwise">
            <RotateCcw size={13} strokeWidth={1.75} />
            Rotate CCW
          </TransformBtn>
          <TransformBtn onClick={() => onRotateCW?.()} title="Rotate 90° clockwise">
            <RotateCw size={13} strokeWidth={1.75} />
            Rotate CW
          </TransformBtn>
        </div>

        {/* Flip row */}
        <div className="grid grid-cols-2 gap-[7px]">
          <TransformBtn onClick={() => onFlipH?.()} title="Flip horizontal">
            <FlipHorizontal2 size={13} strokeWidth={1.75} />
            Flip H
          </TransformBtn>
          <TransformBtn onClick={() => onFlipV?.()} title="Flip vertical">
            <FlipVertical2 size={13} strokeWidth={1.75} />
            Flip V
          </TransformBtn>
        </div>

        {/* Resize toggle */}
        <TransformBtn
          onClick={() => setShowResize((v) => !v)}
          title="Resize image"
        >
          <Maximize2 size={13} strokeWidth={1.75} />
          Resize
        </TransformBtn>

        {/* Resize modal-inlined */}
        {showResize && (
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-sm p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                  Width
                </label>
                <input
                  type="number"
                  value={resize.width}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  className="w-full h-[30px] bg-[#111111] border border-[#2a2a2a] rounded-sm px-2 text-[12px] text-white outline-none focus:border-[#444444]"
                />
              </div>

              <button
                onClick={() =>
                  setResize((prev) => ({ ...prev, locked: !prev.locked }))
                }
                className="mt-4 text-[#555555] hover:text-[#888888] transition-colors shrink-0"
                title={resize.locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {resize.locked ? (
                  <Lock size={13} strokeWidth={1.75} />
                ) : (
                  <Unlock size={13} strokeWidth={1.75} />
                )}
              </button>

              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                  Height
                </label>
                <input
                  type="number"
                  value={resize.height}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  className="w-full h-[30px] bg-[#111111] border border-[#2a2a2a] rounded-sm px-2 text-[12px] text-white outline-none focus:border-[#444444]"
                />
              </div>
            </div>

            <button
              onClick={applyResize}
              className="w-full h-[30px] bg-white text-black text-[12px] font-medium rounded-sm hover:bg-[#e5e5e5] transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        {/* Straighten */}
        <div className="pt-1">
          <AdjustmentSlider
            label="Straighten"
            value={straighten}
            onChange={(v) => setStraighten(v)}
            onCommit={commitStraighten}
          />
        </div>
      </div>
    </div>
  );
}
