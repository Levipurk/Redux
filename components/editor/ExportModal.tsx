"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { X, Download, BookImage, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";

type ExportFormat = "jpeg" | "png" | "tiff";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  imageId?: string;
  filename?: string;
  adjustments: Adjustments;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateSize(format: ExportFormat, quality: number): string {
  const base = 4 * 1024 * 1024;
  if (format === "tiff") return `~${formatBytes(base * 2)}`;
  if (format === "png") return `~${formatBytes(base * 0.8)}`;
  return `~${formatBytes(base * (quality / 100) * 0.4)}`;
}

export default function ExportModal({
  open,
  onClose,
  imageId,
  filename,
  adjustments,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function triggerExport(action: "download" | "save") {
    if (!imageId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/images/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, adjustments, format, quality }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Export failed");
      }

      if (action === "download") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        // Use the original filename (strip extension) + chosen format
        const base = filename
          ? filename.replace(/\.[^.]+$/, "")
          : "export";
        a.download = `${base}.${format}`;

        // Must be attached to the DOM for Firefox compatibility
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("Image downloaded!", {
          style: {
            background: "#1a1a1a",
            color: "#ffffff",
            border: "1px solid #2a2a2a",
            borderRadius: "4px",
            fontSize: "13px",
          },
        });
        onClose();
      } else {
        toast.success("Saved to library!", {
          style: {
            background: "#1a1a1a",
            color: "#ffffff",
            border: "1px solid #2a2a2a",
            borderRadius: "4px",
            fontSize: "13px",
          },
        });
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] bg-[#111111] border border-[#2a2a2a] rounded-sm shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-[48px] border-b border-[#2a2a2a]">
            <Dialog.Title className="text-[13px] font-medium text-white">
              Export Image
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-[#555555] hover:text-[#888888] transition-colors cursor-pointer">
                <X size={15} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-5 py-5 flex flex-col gap-5">
            {/* Format pills */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-[#555555] uppercase tracking-wider">
                Format
              </span>
              <div className="flex gap-[6px]">
                {(["jpeg", "png", "tiff"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={[
                      "flex-1 h-[32px] rounded-sm border text-[12px] font-medium uppercase tracking-wide transition-colors cursor-pointer",
                      format === f
                        ? "bg-white text-black border-white"
                        : "bg-transparent text-[#888888] border-[#2a2a2a] hover:border-[#444444] hover:text-white",
                    ].join(" ")}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* JPEG quality slider */}
            {format === "jpeg" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#555555] uppercase tracking-wider">
                    Quality
                  </span>
                  <span className="text-[12px] text-[#888888] tabular-nums">
                    {quality}
                  </span>
                </div>
                <SliderPrimitive.Root
                  min={1}
                  max={100}
                  step={1}
                  value={[quality]}
                  onValueChange={([v]) => setQuality(v)}
                  className="relative flex w-full touch-none select-none items-center"
                >
                  <SliderPrimitive.Track className="relative h-[2px] w-full grow rounded-full bg-[#2a2a2a]">
                    <SliderPrimitive.Range className="absolute h-full rounded-full bg-[#505050]" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb className="block h-[12px] w-[12px] rounded-full bg-white outline-none cursor-pointer hover:scale-110 transition-transform" />
                </SliderPrimitive.Root>
                <span className="text-[11px] text-[#555555]">
                  Estimated size: {estimateSize(format, quality)}
                </span>
              </div>
            )}

            {format !== "jpeg" && (
              <span className="text-[11px] text-[#555555]">
                Estimated size: {estimateSize(format, quality)}
              </span>
            )}

            {error && (
              <p className="text-[12px] text-[#ef4444]">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-[8px]">
              <button
                onClick={() => void triggerExport("download")}
                disabled={loading || !imageId}
                className="flex-1 flex items-center justify-center gap-[6px] h-[36px] bg-white text-black text-[13px] font-medium rounded-sm hover:bg-[#e5e5e5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Download size={13} strokeWidth={2} />
                )}
                {loading ? "Exporting…" : "Download"}
              </button>
              <button
                onClick={() => void triggerExport("save")}
                disabled={loading || !imageId}
                className="flex-1 flex items-center justify-center gap-[6px] h-[36px] bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[13px] font-medium rounded-sm hover:bg-[#222222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                ) : (
                  <BookImage size={13} strokeWidth={1.75} />
                )}
                Save to Library
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
