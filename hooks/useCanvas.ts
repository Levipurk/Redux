"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas, FabricImage, Point as FabricPoint } from "fabric";
import type { AdjustmentKey } from "@/constants/adjustments";

export type CanvasAdjustments = Record<AdjustmentKey, number>;

// ---------------------------------------------------------------------------
// CSS filter builder
// Maps the subset of adjustments that have CSS filter equivalents.
// Other adjustments (blacks, whites, highlights, shadows, sharpen, etc.)
// are applied server-side on export via Sharp.
// ---------------------------------------------------------------------------
function buildCssFilter(adj: CanvasAdjustments): string {
  const brightness = Math.max(0, 1 + (adj.brightness + adj.exposure) / 100);
  const contrast = Math.max(0, 1 + adj.contrast / 100);
  const saturate = Math.max(0, 1 + (adj.saturation + adj.vibrance * 0.5) / 100);
  // Hue rotation combines: hue (direct), temperature (warm/cool approximation),
  // and tint (green/magenta approximation). Ranges -100..100 map to degrees.
  const hueRotate = adj.hue * 1.8 + adj.temperature * 0.5 + adj.tint * 0.3;

  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    `hue-rotate(${hueRotate.toFixed(2)}deg)`,
  ].join(" ");
}

export function useCanvas(imageUrl: string | null, adjustments: CanvasAdjustments) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  // Store the Point constructor after the first dynamic import
  const PointRef = useRef<typeof FabricPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showBefore, setShowBefore] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  // ---------------------------------------------------------------------------
  // Initialize Fabric canvas
  // Fabric accesses browser globals, so it must be loaded dynamically inside a
  // useEffect (never at module evaluation time, which runs during SSR).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let canvas: Canvas;
    let disposed = false;

    (async () => {
      const { Canvas, Point } = await import("fabric");
      if (disposed) return;

      PointRef.current = Point;

      canvas = new Canvas(el, {
        selection: false,
        renderOnAddRemove: false,
      });

      // Size the canvas to match the element's layout dimensions
      canvas.setWidth(el.offsetWidth || 800);
      canvas.setHeight(el.offsetHeight || 600);

      fabricRef.current = canvas;
      setCanvasReady(true);
    })();

    return () => {
      disposed = true;
      fabricRef.current?.dispose();
      fabricRef.current = null;
      setCanvasReady(false);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load image as canvas background whenever the URL or canvas changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasReady || !imageUrl || !fabricRef.current) return;

    const canvas = fabricRef.current;
    let cancelled = false;

    (async () => {
      const { FabricImage } = await import("fabric");
      if (cancelled) return;

      const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });
      if (cancelled) return;

      const w = canvas.getWidth();
      const h = canvas.getHeight();
      const scale = Math.min(w / (img.width ?? w), h / (img.height ?? h));

      img.set({ scaleX: scale, scaleY: scale, originX: "left", originY: "top" });
      canvas.backgroundImage = img as unknown as import("fabric").FabricObject;
      canvas.renderAll();
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, canvasReady]);

  // ---------------------------------------------------------------------------
  // Apply CSS filters to the lower canvas element in real time
  // This is a CSS-level operation (GPU-accelerated) so it does not require
  // Fabric to re-render the canvas.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.style.filter = showBefore ? "none" : buildCssFilter(adjustments);
  }, [adjustments, showBefore]);

  // ---------------------------------------------------------------------------
  // Zoom controls
  // ---------------------------------------------------------------------------
  const zoomIn = useCallback(() => {
    const canvas = fabricRef.current;
    const Point = PointRef.current;
    if (!canvas || !Point) return;

    const next = Math.min(canvas.getZoom() * 1.25, 5);
    canvas.zoomToPoint(
      new Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
      next,
    );
    setZoom(next);
  }, []);

  const zoomOut = useCallback(() => {
    const canvas = fabricRef.current;
    const Point = PointRef.current;
    if (!canvas || !Point) return;

    const next = Math.max(canvas.getZoom() / 1.25, 0.1);
    canvas.zoomToPoint(
      new Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
      next,
    );
    setZoom(next);
  }, []);

  const resetZoom = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Reset both zoom and any pan offset
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoom(1);
  }, []);

  // ---------------------------------------------------------------------------
  // Before / after toggle
  // "Before" clears CSS filters to show the unedited original.
  // "After" re-applies the current adjustments filters.
  // ---------------------------------------------------------------------------
  const toggleBefore = useCallback(() => {
    setShowBefore((prev) => !prev);
  }, []);

  return {
    canvasRef,
    zoom,
    showBefore,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleBefore,
  };
}
