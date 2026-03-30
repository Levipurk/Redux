"use client";

import { useCallback, useEffect, useRef } from "react";
import useUndo from "use-undo";
import { produce } from "immer";
import { DEFAULT_ADJUSTMENTS, type AdjustmentKey } from "@/constants/adjustments";

export type Adjustments = typeof DEFAULT_ADJUSTMENTS;

export function useEditor(imageId?: string) {
  const [state, { set, undo, redo, reset, canUndo, canRedo }] = useUndo<Adjustments>(
    { ...DEFAULT_ADJUSTMENTS },
    { useCheckpoints: true },
  );

  const adjustments = state.present;
  const lastSavedRef = useRef<Adjustments>({ ...DEFAULT_ADJUSTMENTS });

  // isDirty is recomputed on every render triggered by useUndo state changes
  const isDirty = (Object.keys(adjustments) as AdjustmentKey[]).some(
    (k) => adjustments[k] !== lastSavedRef.current[k],
  );

  // Updates a single adjustment and adds an undo checkpoint (call on mouseup / blur)
  const updateAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      set(
        produce(state.present, (draft) => {
          draft[key] = value;
        }),
        true,
      );
    },
    [set, state.present],
  );

  // Updates a single adjustment WITHOUT creating an undo entry (call while dragging)
  const previewAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      set(
        produce(state.present, (draft) => {
          draft[key] = value;
        }),
        false,
      );
    },
    [set, state.present],
  );

  // Applies multiple adjustments at once — used by the AI assistant
  const patchAdjustments = useCallback(
    (patch: Partial<Adjustments>) => {
      set(
        produce(state.present, (draft) => {
          Object.assign(draft, patch);
        }),
        true,
      );
    },
    [set, state.present],
  );

  const resetAdjustments = useCallback(() => {
    const defaults = { ...DEFAULT_ADJUSTMENTS };
    reset(defaults);
    lastSavedRef.current = defaults;
  }, [reset]);

  const saveVersion = useCallback(async () => {
    if (!imageId || !isDirty) return;
    try {
      await fetch("/api/images/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, adjustments }),
      });
      lastSavedRef.current = { ...adjustments };
    } catch (err) {
      console.error("[useEditor] Auto-save failed:", err);
    }
  }, [imageId, adjustments, isDirty]);

  // Auto-save every 30 seconds when there are unsaved changes
  useEffect(() => {
    if (!imageId) return;
    const id = setInterval(saveVersion, 30_000);
    return () => clearInterval(id);
  }, [saveVersion, imageId]);

  return {
    adjustments,
    updateAdjustment,
    previewAdjustment,
    patchAdjustments,
    undo,
    redo,
    canUndo,
    canRedo,
    resetAdjustments,
    isDirty,
    saveVersion,
  };
}
