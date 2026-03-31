"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { useEditor } from "@/hooks/useEditor";
import { useCanvas } from "@/hooks/useCanvas";
import type { ImageRecord } from "@/types/image";

import Toolbar from "@/components/editor/Toolbar";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import Canvas from "@/components/editor/Canvas";
import ChatPanel from "@/components/editor/ChatPanel";
import HistoryPanel from "@/components/editor/HistoryPanel";
import ExportModal from "@/components/editor/ExportModal";
import BottomNav from "@/components/shared/BottomNav";

function EditorInner() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId") ?? undefined;

  const [image, setImage] = useState<ImageRecord | null>(null);
  const [loadingImage, setLoadingImage] = useState(!!imageId);

  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Fetch image record when imageId is present
  useEffect(() => {
    if (!imageId) return;
    setLoadingImage(true);
    fetch(`/api/images/${imageId}`)
      .then((res) => res.json())
      .then((data: { image?: ImageRecord }) => {
        if (data.image) setImage(data.image);
      })
      .catch(console.error)
      .finally(() => setLoadingImage(false));
  }, [imageId]);

  const {
    adjustments,
    previewAdjustment,
    updateAdjustment,
    patchAdjustments,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
  } = useEditor(imageId);

  const {
    canvasRef,
    zoom,
    showBefore,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleBefore,
  } = useCanvas(image?.originalUrl ?? null, adjustments);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <Toolbar
        filename={image?.filename}
        zoom={zoom}
        showBefore={showBefore}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
        toggleBefore={toggleBefore}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        isDirty={isDirty}
        onExport={() => setShowExport(true)}
        onShowHistory={() => setShowHistory(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AdjustmentPanel
          adjustments={adjustments}
          onPreview={previewAdjustment}
          onCommit={updateAdjustment}
          imageId={imageId}
        />

        {loadingImage ? (
          <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center">
            <span className="text-[#555555] text-[14px]">Loading image…</span>
          </div>
        ) : (
          <Canvas
            canvasRef={canvasRef}
            imageUrl={image?.originalUrl ?? null}
          />
        )}

        <ChatPanel
          adjustments={adjustments}
          onPatch={patchAdjustments}
          imageId={imageId}
        />
      </div>

      <BottomNav />

      {/* Overlays */}
      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        imageId={imageId}
        onRestore={patchAdjustments}
      />

      <ExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        imageId={imageId}
        adjustments={adjustments}
      />
    </div>
  );
}

// useSearchParams requires Suspense boundary
export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen bg-[#0a0a0a] items-center justify-center">
          <span className="text-[#555555] text-[14px]">Loading editor…</span>
        </div>
      }
    >
      <EditorInner />
    </Suspense>
  );
}
