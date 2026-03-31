"use client";

import { useState } from "react";
import { Minus, ChevronDown, Star, Lock, Unlock } from "lucide-react";
import toast from "react-hot-toast";
import AdjustmentSlider from "./AdjustmentSlider";
import type { AdjustmentKey } from "@/constants/adjustments";
import type { Adjustments } from "@/hooks/useEditor";

interface AdjustmentPanelProps {
  adjustments: Adjustments;
  onPreview: (key: AdjustmentKey, value: number) => void;
  onCommit: (key: AdjustmentKey, value: number) => void;
  imageId?: string;
  imageUrl?: string | null;
  imageWidth?: number;
  imageHeight?: number;
  // Canvas transform callbacks
  onCrop?: () => void;
  onRotateCW?: () => void;
  onStraighten?: (degrees: number) => void;
  onResize?: (width: number, height: number) => void;
}

interface SectionState {
  light: boolean;
  color: boolean;
  effects: boolean;
  retouch: boolean;
  transform: boolean;
}

type ActiveTool = "heal" | "blur" | "eraser" | "crop" | "straighten" | null;

const LIGHT_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "brightness", label: "Brightness" },
  { key: "exposure", label: "Exposure" },
  { key: "contrast", label: "Contrast" },
  { key: "blacks", label: "Blacks" },
  { key: "whites", label: "Whites" },
  { key: "highlights", label: "Highlights" },
  { key: "shadows", label: "Shadows" },
];

const COLOR_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "vibrance", label: "Vibrance" },
  { key: "saturation", label: "Saturation" },
  { key: "temperature", label: "Temperature" },
  { key: "tint", label: "Tint" },
  { key: "hue", label: "Hue" },
];

const EFFECTS_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "sharpen", label: "Sharpen" },
  { key: "noiseReduction", label: "Noise Reduction" },
  { key: "vignette", label: "Vignette" },
  { key: "grain", label: "Grain" },
  { key: "clarity", label: "Clarity" },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-4 py-[9px] hover:bg-[#181818] transition-colors"
    >
      <span className="text-[11px] font-medium uppercase tracking-widest text-[#555555] select-none">
        {label}
      </span>
      <ChevronDown
        size={11}
        strokeWidth={2}
        className={`text-[#555555] transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

// Full-width AI button (star icon + label)
function AIButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center justify-center gap-[7px] w-full h-[34px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm text-[13px] text-white hover:bg-[#222222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      <Star size={13} strokeWidth={1.5} />
      {loading ? "Working…" : label}
    </button>
  );
}

// Half-width tool button (toggleable active state)
function ToolBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center justify-center h-[34px] border rounded-sm text-[13px] capitalize transition-colors cursor-pointer",
        active
          ? "bg-white text-black border-white"
          : "bg-[#1a1a1a] text-white border-[#2a2a2a] hover:bg-[#222222]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdjustmentPanel({
  adjustments,
  onPreview,
  onCommit,
  imageId,
  imageUrl,
  imageWidth,
  imageHeight,
  onCrop,
  onRotateCW,
  onStraighten,
  onResize,
}: AdjustmentPanelProps) {
  const [sections, setSections] = useState<SectionState>({
    light: true,
    color: true,
    effects: true,
    retouch: true,
    transform: true,
  });
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);

  // Straighten inline slider
  const [showStraighten, setShowStraighten] = useState(false);
  const [straightenDeg, setStraightenDeg] = useState(0);

  // Resize inline form
  const [showResize, setShowResize] = useState(false);
  const [resizeW, setResizeW] = useState(String(imageWidth ?? ""));
  const [resizeH, setResizeH] = useState(String(imageHeight ?? ""));
  const [resizeLocked, setResizeLocked] = useState(true);
  const aspectRatio = imageWidth && imageHeight ? imageWidth / imageHeight : 1;

  function handleResizeW(val: string) {
    const w = parseInt(val);
    if (resizeLocked && !isNaN(w)) {
      setResizeW(val);
      setResizeH(String(Math.round(w / aspectRatio)));
    } else {
      setResizeW(val);
    }
  }

  function handleResizeH(val: string) {
    const h = parseInt(val);
    if (resizeLocked && !isNaN(h)) {
      setResizeH(val);
      setResizeW(String(Math.round(h * aspectRatio)));
    } else {
      setResizeH(val);
    }
  }

  function applyResize() {
    const w = parseInt(resizeW);
    const h = parseInt(resizeH);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      onResize?.(w, h);
      setShowResize(false);
    }
  }

  // Loading flags per AI button
  const [loadingEnhance, setLoadingEnhance] = useState(false);
  const [loadingToneBalance, setLoadingToneBalance] = useState(false);
  const [loadingSmartColor, setLoadingSmartColor] = useState(false);
  const [loadingStyleMatch, setLoadingStyleMatch] = useState(false);
  const [loadingGenFill, setLoadingGenFill] = useState(false);
  const [loadingRemoveBg, setLoadingRemoveBg] = useState(false);

  function toggleSection(key: keyof SectionState) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleTool(tool: ActiveTool) {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }

  // ── Auto Enhance ──────────────────────────────────────────────────────────
  async function runAutoEnhance() {
    if (!imageUrl) return;
    setLoadingEnhance(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, currentAdjustments: adjustments }),
      });
      if (res.status === 402) {
        toast("Insufficient credits — purchase more to continue.", {
          icon: "💳",
          style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
        });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (data.adjustments) {
        (Object.entries(data.adjustments) as [AdjustmentKey, number][]).forEach(
          ([key, value]) => onCommit(key, value),
        );
      }
      toast.success("Auto Enhance applied", {
        style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
      });
    } catch (err) {
      console.error("[AdjustmentPanel] auto_enhance failed:", err);
      toast.error("Auto Enhance failed", {
        style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
      });
    } finally {
      setLoadingEnhance(false);
    }
  }

  // ── Auto Tone Balance ─────────────────────────────────────────────────────
  async function runAutoToneBalance() {
    if (!imageUrl) return;
    setLoadingToneBalance(true);
    try {
      const res = await fetch("/api/ai/tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, currentAdjustments: adjustments }),
      });
      if (res.status === 402) {
        toast("Insufficient credits — purchase more to continue.", {
          icon: "💳",
          style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
        });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (data.adjustments) {
        (Object.entries(data.adjustments) as [AdjustmentKey, number][]).forEach(
          ([key, value]) => onCommit(key, value),
        );
      }
      toast.success("Auto Tone Balance applied", {
        style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
      });
    } catch (err) {
      console.error("[AdjustmentPanel] auto_tone_balance failed:", err);
      toast.error("Auto Tone Balance failed", {
        style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
      });
    } finally {
      setLoadingToneBalance(false);
    }
  }

  // ── Generic placeholder for unimplemented AI features ─────────────────────
  async function callRetouch(
    mode: string,
    setLoading: (v: boolean) => void,
  ) {
    if (!imageId) return;
    setLoading(true);
    try {
      await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, mode }),
      });
    } catch (err) {
      console.error(`[AdjustmentPanel] ${mode} failed:`, err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col w-[320px] shrink-0 h-full bg-[#111111] border-r border-[#2a2a2a]">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 h-[44px] shrink-0 border-b border-[#2a2a2a]">
        <span className="text-[12px] font-medium uppercase tracking-widest text-[#888888] select-none">
          Adjustments
        </span>
        <button className="text-[#555555] hover:text-[#888888] transition-colors">
          <Minus size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-[#111111] [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[#3a3a3a]">

        {/* ── LIGHT ──────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Light"
          open={sections.light}
          onToggle={() => toggleSection("light")}
        />
        {sections.light && (
          <div className="pb-2">
            {LIGHT_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
              />
            ))}
            <div className="flex flex-col gap-[7px] px-4 pt-3 pb-1">
              <AIButton
                label="Auto Enhance"
                loading={loadingEnhance}
                disabled={!imageUrl}
                onClick={() => void runAutoEnhance()}
              />
              <AIButton
                label="Auto Tone Balance"
                loading={loadingToneBalance}
                disabled={!imageUrl}
                onClick={() => void runAutoToneBalance()}
              />
            </div>
          </div>
        )}

        {/* ── COLOR ──────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Color"
          open={sections.color}
          onToggle={() => toggleSection("color")}
        />
        {sections.color && (
          <div className="pb-2">
            {COLOR_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
              />
            ))}
            <div className="flex flex-col gap-[7px] px-4 pt-3 pb-1">
              <AIButton
                label="Smart Color Balance"
                loading={loadingSmartColor}
                disabled={!imageUrl}
                onClick={() => void callRetouch("smart_color_balance", setLoadingSmartColor)}
              />
              <AIButton
                label="Style Match"
                loading={loadingStyleMatch}
                disabled={!imageUrl}
                onClick={() => void callRetouch("style_match", setLoadingStyleMatch)}
              />
            </div>
          </div>
        )}

        {/* ── EFFECTS ────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Effects"
          open={sections.effects}
          onToggle={() => toggleSection("effects")}
        />
        {sections.effects && (
          <div className="pb-2">
            {EFFECTS_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
              />
            ))}
          </div>
        )}

        {/* ── RETOUCH ────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Retouch"
          open={sections.retouch}
          onToggle={() => toggleSection("retouch")}
        />
        {sections.retouch && (
          <div className="px-4 pt-2 pb-3 flex flex-col gap-[7px]">
            {/* Row 1: Heal | Blur */}
            <div className="grid grid-cols-2 gap-[7px]">
              <ToolBtn
                label="Heal"
                active={activeTool === "heal"}
                onClick={() => toggleTool("heal")}
              />
              <ToolBtn
                label="Blur"
                active={activeTool === "blur"}
                onClick={() => toggleTool("blur")}
              />
            </div>
            {/* Row 2: Eraser (first column only) */}
            <div className="grid grid-cols-2 gap-[7px]">
              <ToolBtn
                label="Eraser"
                active={activeTool === "eraser"}
                onClick={() => toggleTool("eraser")}
              />
            </div>
          </div>
        )}

        {/* ── TRANSFORM ──────────────────────────────────────────────────── */}
        <SectionHeader
          label="Transform"
          open={sections.transform}
          onToggle={() => toggleSection("transform")}
        />
        {sections.transform && (
          <div className="px-4 pt-2 pb-4 flex flex-col gap-[7px]">
            {/* Row 1: Crop | Rotate */}
            <div className="grid grid-cols-2 gap-[7px]">
              <ToolBtn
                label="Crop"
                active={activeTool === "crop"}
                onClick={() => {
                  toggleTool("crop");
                  onCrop?.();
                }}
              />
              <ToolBtn
                label="Rotate"
                active={false}
                onClick={() => onRotateCW?.()}
              />
            </div>
            {/* Row 2: Straighten | Resize */}
            <div className="grid grid-cols-2 gap-[7px]">
              <ToolBtn
                label="Straighten"
                active={showStraighten}
                onClick={() => setShowStraighten((v) => !v)}
              />
              <ToolBtn
                label="Resize"
                active={showResize}
                onClick={() => setShowResize((v) => !v)}
              />
            </div>

            {/* Inline straighten slider */}
            {showStraighten && (
              <AdjustmentSlider
                label="Angle"
                value={straightenDeg}
                min={-45}
                max={45}
                step={0.5}
                onChange={(v) => {
                  setStraightenDeg(v);
                  onStraighten?.(v);
                }}
                onCommit={(v) => {
                  setStraightenDeg(v);
                  onStraighten?.(v);
                }}
              />
            )}

            {/* Inline resize form */}
            {showResize && (
              <div className="bg-[#161616] border border-[#2a2a2a] rounded-sm p-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                      Width
                    </label>
                    <input
                      type="number"
                      value={resizeW}
                      onChange={(e) => handleResizeW(e.target.value)}
                      className="w-full h-[30px] bg-[#111111] border border-[#2a2a2a] rounded-sm px-2 text-[12px] text-white outline-none focus:border-[#444444]"
                    />
                  </div>
                  <button
                    onClick={() => setResizeLocked((v) => !v)}
                    className="mt-4 text-[#555555] hover:text-[#888888] transition-colors shrink-0"
                    title={resizeLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                  >
                    {resizeLocked ? (
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
                      value={resizeH}
                      onChange={(e) => handleResizeH(e.target.value)}
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

            {/* AI transform buttons */}
            <AIButton
              label="Generative Fill"
              loading={loadingGenFill}
              disabled={!imageUrl}
              onClick={() => void callRetouch("generative_fill", setLoadingGenFill)}
            />
            <AIButton
              label="Remove Background"
              loading={loadingRemoveBg}
              disabled={!imageUrl}
              onClick={() => void callRetouch("remove_background", setLoadingRemoveBg)}
            />
          </div>
        )}

      </div>
    </div>
  );
}
