"use client";

import { useState } from "react";
import { Minus, ChevronDown, Star } from "lucide-react";
import AdjustmentSlider from "./AdjustmentSlider";
import type { AdjustmentKey } from "@/constants/adjustments";
import type { Adjustments } from "@/hooks/useEditor";

interface AdjustmentPanelProps {
  adjustments: Adjustments;
  onPreview: (key: AdjustmentKey, value: number) => void;
  onCommit: (key: AdjustmentKey, value: number) => void;
  imageId?: string;
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
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center justify-center gap-[7px] w-full h-[34px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm text-[13px] text-white hover:bg-[#222222] transition-colors disabled:opacity-50 cursor-pointer"
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
}: AdjustmentPanelProps) {
  const [sections, setSections] = useState<SectionState>({
    light: true,
    color: true,
    effects: true,
    retouch: true,
    transform: true,
  });
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);

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

  // Generic AI enhancement caller
  async function callEnhance(
    mode: string,
    setLoading: (v: boolean) => void,
  ) {
    if (!imageId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, mode }),
      });
      if (res.ok) {
        const data = (await res.json()) as { adjustments?: Partial<Adjustments> };
        if (data.adjustments) {
          (Object.entries(data.adjustments) as [AdjustmentKey, number][]).forEach(
            ([key, value]) => onCommit(key, value),
          );
        }
      }
    } catch (err) {
      console.error(`[AdjustmentPanel] ${mode} failed:`, err);
    } finally {
      setLoading(false);
    }
  }

  // Generic AI retouch caller (remove_background, generative_fill)
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
    <div className="flex flex-col w-[280px] shrink-0 h-full bg-[#111111] border-r border-[#2a2a2a]">
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
                onClick={() => void callEnhance("auto_enhance", setLoadingEnhance)}
              />
              <AIButton
                label="Auto Tone Balance"
                loading={loadingToneBalance}
                onClick={() => void callEnhance("auto_tone_balance", setLoadingToneBalance)}
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
                onClick={() => void callEnhance("smart_color_balance", setLoadingSmartColor)}
              />
              <AIButton
                label="Style Match"
                loading={loadingStyleMatch}
                onClick={() => void callEnhance("style_match", setLoadingStyleMatch)}
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
                onClick={() => toggleTool("crop")}
              />
              <ToolBtn
                label="Rotate"
                active={false}
                onClick={() => {}}
              />
            </div>
            {/* Row 2: Straighten | Resize */}
            <div className="grid grid-cols-2 gap-[7px]">
              <ToolBtn
                label="Straighten"
                active={activeTool === "straighten"}
                onClick={() => toggleTool("straighten")}
              />
              <ToolBtn
                label="Resize"
                active={false}
                onClick={() => {}}
              />
            </div>
            {/* AI transform buttons */}
            <AIButton
              label="Generative Fill"
              loading={loadingGenFill}
              onClick={() => void callRetouch("generative_fill", setLoadingGenFill)}
            />
            <AIButton
              label="Remove Background"
              loading={loadingRemoveBg}
              onClick={() => void callRetouch("remove_background", setLoadingRemoveBg)}
            />
          </div>
        )}

      </div>
    </div>
  );
}
