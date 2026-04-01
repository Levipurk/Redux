"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Toaster } from "react-hot-toast";

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

export default function EditorApp() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId") ?? undefined;

  const [image, setImage] = useState<ImageRecord | null>(null);
  const [loadingImage, setLoadingImage] = useState(!!imageId);
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);

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
    justSaved,
  } = useEditor(imageId);

  const {
    canvasRef,
    containerRef,
    zoom,
    showBefore,
    isCropping,
    imageBounds,
    viewportTransform,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleBefore,
    rotateCW,
    rotateCCW,
    flipH,
    flipV,
    straightenImage,
    startCrop,
    confirmCrop,
    cancelCrop,
    resizeCanvas,
    loadImageUrl,
    activeImageUrl,
    enableHealBrush,
    disableHealBrush,
    exportMask,
  } = useCanvas(image?.originalUrl ?? null, adjustments);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Toast notifications — dark theme matching the editor */}
      <Toaster
        position="bottom-center"
        toastOptions={{ duration: 3000 }}
      />

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
        justSaved={justSaved}
        onExport={() => setShowExport(true)}
        onShowHistory={() => setShowHistory(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AdjustmentPanel
          adjustments={adjustments}
          onPreview={previewAdjustment}
          onCommit={updateAdjustment}
          imageId={imageId}
          imageUrl={image?.originalUrl ?? null}
          imageWidth={image?.width ?? undefined}
          imageHeight={image?.height ?? undefined}
          onCrop={startCrop}
          onRotateCW={rotateCW}
          onStraighten={straightenImage}
          onResize={resizeCanvas}
          onReloadCanvas={loadImageUrl}
          canvasImageUrl={activeImageUrl ?? image?.originalUrl ?? null}
          enableHealBrush={enableHealBrush}
          disableHealBrush={disableHealBrush}
          exportHealMask={exportMask}
        />

        {/* Canvas must always be rendered — never conditionally unmount it.
            If Canvas is hidden while loadingImage=true, the Fabric init effect
            fires with canvasRef.current=null ([] deps = runs once) and Fabric
            never initializes. The placeholder inside Canvas shows while
            imageUrl is null; the image appears once it loads. */}
        <Canvas
          canvasRef={canvasRef}
          containerRef={containerRef}
          imageUrl={image?.originalUrl ?? null}
          adjustments={adjustments}
          imageBounds={imageBounds}
          viewportTransform={viewportTransform}
          isCropping={isCropping}
          onConfirmCrop={confirmCrop}
          onCancelCrop={cancelCrop}
        />

        <ChatPanel
          adjustments={adjustments}
          onPatch={patchAdjustments}
          imageId={imageId}
        />
      </div>

      <BottomNav />

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
        filename={image?.filename}
        adjustments={adjustments}
        activeImageUrl={activeImageUrl}
      />

    </div>
  );
}
