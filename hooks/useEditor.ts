"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useUndo from "use-undo";
import { DEFAULT_ADJUSTMENTS, type AdjustmentKey } from "@/constants/adjustments";

export type Adjustments = typeof DEFAULT_ADJUSTMENTS;

export function useEditor(imageId?: string) {
  const [state, { set, undo, redo, reset, canUndo, canRedo }] = useUndo<Adjustments>(
    { ...DEFAULT_ADJUSTMENTS },
    { useCheckpoints: true },
  );

  const adjustments = state.present;
  const lastSavedRef = useRef<Adjustments>({ ...DEFAULT_ADJUSTMENTS });

  // ---------------------------------------------------------------------------
  // Undo/redo fix: track whether the current slider interaction is the first
  // move in a new drag gesture.
  //
  // Problem: previewAdjustment (called every pixel during drag) + use-undo's
  // checkpoint model means the "before" state pushed to the undo stack is the
  // LAST preview value, not the value before the drag started.
  //
  // Fix: create the undo checkpoint on the FIRST call of a drag gesture (which
  // still has `state.present` equal to the pre-drag value).  All subsequent
  // previews during that same drag skip the checkpoint.  updateAdjustment
  // (called on pointer-up) resets the flag for the next drag.
  // ---------------------------------------------------------------------------
  const isFirstPreviewRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Auto-save fix: using refs for the interval callback so the setInterval is
  // only created once per imageId, not re-created on every adjustment change.
  //
  // Without this, [saveVersion] in the useEffect deps causes the interval to
  // restart every time any slider moves — it never reaches 30 seconds.
  // ---------------------------------------------------------------------------
  const isDirtyRef = useRef(false);
  const adjustmentsRef = useRef<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const imageIdRef = useRef(imageId);

  // Keep refs in sync with latest render values (runs synchronously during render)
  isDirtyRef.current = (Object.keys(adjustments) as AdjustmentKey[]).some(
    (k) => adjustments[k] !== lastSavedRef.current[k],
  );
  adjustmentsRef.current = adjustments;
  imageIdRef.current = imageId;

  // Expose isDirty as a plain boolean for the toolbar indicator
  const isDirty = isDirtyRef.current;

  // justSaved: true for 2 s after a successful save — drives the pulse animation
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Preview (during drag) — creates one checkpoint on the FIRST move so undo
  // reverts to the value before the entire drag, not the last pixel position.
  // ---------------------------------------------------------------------------
  const previewAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      const checkpoint = isFirstPreviewRef.current;
      isFirstPreviewRef.current = false;
      set({ ...state.present, [key]: value } as Adjustments, checkpoint);
    },
    [set, state.present],
  );

  // ---------------------------------------------------------------------------
  // Commit (on pointer-up) — sets the final value without a second checkpoint
  // and resets the flag for the next drag gesture.
  // ---------------------------------------------------------------------------
  const updateAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      isFirstPreviewRef.current = true;
      set({ ...state.present, [key]: value } as Adjustments, false);
    },
    [set, state.present],
  );

  // Applies a batch of adjustment patches — used by the AI assistant
  const patchAdjustments = useCallback(
    (patch: Partial<Adjustments>) => {
      isFirstPreviewRef.current = true;
      set({ ...state.present, ...patch } as Adjustments, true);
    },
    [set, state.present],
  );

  const resetAdjustments = useCallback(() => {
    const defaults = { ...DEFAULT_ADJUSTMENTS } as Adjustments;
    reset(defaults);
    lastSavedRef.current = defaults;
    isFirstPreviewRef.current = true;
  }, [reset]);

  // ---------------------------------------------------------------------------
  // Save — reads current values via refs so it never goes stale inside the
  // interval.  Using an empty useCallback dep array keeps the reference stable.
  // ---------------------------------------------------------------------------
  const saveVersion = useCallback(async () => {
    const imgId = imageIdRef.current;
    const adj = adjustmentsRef.current;
    if (!imgId || !isDirtyRef.current) return;
    try {
      await fetch("/api/images/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: imgId, adjustments: adj }),
      });
      lastSavedRef.current = { ...adj };
      // Trigger the green-dot pulse for 2 seconds
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
      setJustSaved(true);
      justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      console.error("[useEditor] Auto-save failed:", err);
    }
  }, []); // intentionally empty — reads via refs

  // ---------------------------------------------------------------------------
  // Auto-save every 30 s.  saveVersion is stable (empty useCallback deps), so
  // this effect only restarts when imageId changes — not on every slider move.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!imageId) return;
    const id = setInterval(saveVersion, 30_000);
    return () => clearInterval(id);
  }, [imageId, saveVersion]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    };
  }, []);

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
    justSaved,
    saveVersion,
  };
}
