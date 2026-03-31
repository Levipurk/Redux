"use client";

import { useEditor } from "@/hooks/useEditor";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import Canvas from "@/components/editor/Canvas";
import ChatPanel from "@/components/editor/ChatPanel";
import BottomNav from "@/components/shared/BottomNav";

export default function EditorPage() {
  const { adjustments, previewAdjustment, updateAdjustment, patchAdjustments } =
    useEditor();

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AdjustmentPanel
          adjustments={adjustments}
          onPreview={previewAdjustment}
          onCommit={updateAdjustment}
        />

        <Canvas imageUrl={null} adjustments={adjustments} />

        <ChatPanel
          adjustments={adjustments}
          onPatch={patchAdjustments}
        />
      </div>

      <BottomNav />
    </div>
  );
}
