"use client";

import { useState } from "react";
import { Minus, ChevronDown, Star, Wand2 } from "lucide-react";
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
}

type ActiveTool = "heal" | "blur" | "eraser" | null;

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
  });
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [loadingEnhance, setLoadingEnhance] = useState(false);
  const [loadingToneBalance, setLoadingToneBalance] = useState(false);

  function toggleSection(key: keyof SectionState) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleAutoEnhance() {
    if (!imageId || loadingEnhance) return;
    setLoadingEnhance(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, mode: "auto_enhance" }),
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
      console.error("[AdjustmentPanel] Auto Enhance failed:", err);
    } finally {
      setLoadingEnhance(false);
    }
  }

  async function handleAutoToneBalance() {
    if (!imageId || loadingToneBalance) return;
    setLoadingToneBalance(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, mode: "auto_tone_balance" }),
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
      console.error("[AdjustmentPanel] Auto Tone Balance failed:", err);
    } finally {
      setLoadingToneBalance(false);
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

      {/* Scrollable adjustment content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ── LIGHT ───────────────────────────────────────────── */}
        <SectionHeader
          label="Light"
          open={sections.light}
          onToggle={() => toggleSection("light")}
        />

        {sections.light && (
          <div className="pb-1">
            {LIGHT_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
              />
            ))}

            {/* AI buttons */}
            <div className="flex flex-col gap-[7px] px-4 pt-3 pb-2">
              <button
                onClick={handleAutoEnhance}
                disabled={loadingEnhance}
                className="flex items-center justify-center gap-[7px] w-full h-[34px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm text-[13px] text-white hover:bg-[#222222] transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Star size={13} strokeWidth={1.5} />
                {loadingEnhance ? "Enhancing…" : "Auto Enhance"}
              </button>
              <button
                onClick={handleAutoToneBalance}
                disabled={loadingToneBalance}
                className="flex items-center justify-center gap-[7px] w-full h-[34px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm text-[13px] text-white hover:bg-[#222222] transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Wand2 size={13} strokeWidth={1.5} />
                {loadingToneBalance ? "Balancing…" : "Auto Tone Balance"}
              </button>
            </div>
          </div>
        )}

        {/* ── COLOR ───────────────────────────────────────────── */}
        <SectionHeader
          label="Color"
          open={sections.color}
          onToggle={() => toggleSection("color")}
        />

        {sections.color && (
          <div className="pb-1">
            {COLOR_ADJUSTMENTS.map(({ key, label }) => (
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

        {/* ── EFFECTS ─────────────────────────────────────────── */}
        <SectionHeader
          label="Effects"
          open={sections.effects}
          onToggle={() => toggleSection("effects")}
        />

        {sections.effects && (
          <div className="pb-1">
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

        {/* ── RETOUCH ─────────────────────────────────────────── */}
        <SectionHeader
          label="Retouch"
          open={sections.retouch}
          onToggle={() => toggleSection("retouch")}
        />

        {sections.retouch && (
          <div className="flex flex-col gap-[7px] px-4 pt-2 pb-4">
            {(["heal", "blur", "eraser"] as const).map((tool) => (
              <button
                key={tool}
                onClick={() => setActiveTool(activeTool === tool ? null : tool)}
                className={`flex items-center justify-center w-full h-[34px] border rounded-sm text-[13px] capitalize transition-colors cursor-pointer ${
                  activeTool === tool
                    ? "bg-white text-black border-white"
                    : "bg-[#1a1a1a] text-white border-[#2a2a2a] hover:bg-[#222222]"
                }`}
              >
                {tool}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
