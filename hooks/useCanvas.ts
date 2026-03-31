"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas, FabricImage, Point as FabricPoint } from "fabric";
import type { AdjustmentKey } from "@/constants/adjustments";

export type CanvasAdjustments = Record<AdjustmentKey, number>;

export interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// CSS filter builder — maps adjustment values to a browser CSS filter string.
// Applied as a GPU-composited layer over the canvas element; zero cost to
// re-render because it never touches Fabric's pixel buffer.
// ---------------------------------------------------------------------------
function buildCssFilter(adj: CanvasAdjustments): string {
  // Brightness: base + exposure + partial contributions from tonal controls
  const brightness = Math.max(
    0.05,
    1 +
      (adj.brightness + adj.exposure) / 100 +
      adj.shadows / 300 +
      adj.highlights / 300 +
      adj.whites / 300 +
      -adj.blacks / 300,
  );

  // Contrast: base + clarity approximation (clarity ≈ midtone contrast)
  const contrast = Math.max(0.05, 1 + (adj.contrast + adj.clarity * 0.4) / 100);

  // Saturation: saturation + vibrance at half weight
  const saturate = Math.max(0, 1 + (adj.saturation + adj.vibrance * 0.5) / 100);

  // Hue rotation: direct hue + temperature and tint approximations
  const hueRotate = adj.hue * 1.8 + adj.temperature * 0.5 + adj.tint * 0.3;

  // Sharpen: approximate via contrast boost — real unsharp mask in Sharp on export
  const sharpenedContrast = contrast * (1 + Math.max(0, adj.sharpen) * 0.005);

  // Warm temperature: subtle sepia for warm tones
  const sepia = adj.temperature > 0 ? Math.min(0.25, adj.temperature / 400) : 0;

  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${sharpenedContrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    `hue-rotate(${hueRotate.toFixed(2)}deg)`,
  ];

  if (sepia > 0) parts.push(`sepia(${sepia.toFixed(3)})`);

  // Noise reduction: CSS Gaussian blur is a valid real-time approximation.
  // noiseReduction=0 → 0px blur, noiseReduction=100 → 2px blur.
  // The real noise reduction (via Replicate) is applied server-side on export.
  if (adj.noiseReduction > 0) {
    const blurPx = (adj.noiseReduction / 100) * 2;
    parts.push(`blur(${blurPx.toFixed(2)}px)`);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Internal transform state — stored in a ref so mutations don't re-render
// ---------------------------------------------------------------------------
interface TransformState {
  rotation: number;   // multiple of 90: 0 | 90 | 180 | 270
  flipX: boolean;
  flipY: boolean;
  straighten: number; // -45 to 45 degrees overlay
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useCanvas(imageUrl: string | null, adjustments: CanvasAdjustments) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // containerRef is attached to the outer wrapper div in Canvas.tsx so we can
  // read the available dimensions before Fabric sets them on the canvas element.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const PointRef = useRef<typeof FabricPoint | null>(null);
  const bgImageRef = useRef<FabricImage | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cropRectRef = useRef<any>(null);
  const transformRef = useRef<TransformState>({
    rotation: 0,
    flipX: false,
    flipY: false,
    straighten: 0,
  });

  const [zoom, setZoom] = useState(1);
  // Mirrors Fabric's internal viewportTransform so CSS overlays (vignette/grain)
  // can apply the same matrix() and stay perfectly aligned with the image at any
  // zoom level or pan position.
  const [viewportTransform, setViewportTransform] = useState<[number, number, number, number, number, number]>([1, 0, 0, 1, 0, 0]);
  const [showBefore, setShowBefore] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  // Tracks the rendered bounds of the background image inside the Fabric canvas.
  // Used by Canvas.tsx to clip the vignette/grain overlays to the image area.
  const [imageBounds, setImageBounds] = useState<ImageBounds | null>(null);

  // ---------------------------------------------------------------------------
  // Compute the image's rendered bounds from the current FabricImage state.
  // Must be called after any operation that moves/scales/rotates the image.
  // ---------------------------------------------------------------------------
  const updateImageBounds = useCallback(() => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) return;

    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const scaleX = img.scaleX ?? 1;
    const scaleY = img.scaleY ?? 1;
    const angle = ((img.angle ?? 0) + 360) % 360;

    const naturalW = (img.width ?? cw) * scaleX;
    const naturalH = (img.height ?? ch) * scaleY;

    // For 90° / 270° rotations the bounding box swaps width ↔ height
    const isOrthogonal = angle === 90 || angle === 270;
    const renderedW = isOrthogonal ? naturalH : naturalW;
    const renderedH = isOrthogonal ? naturalW : naturalH;

    setImageBounds({
      left: cw / 2 - renderedW / 2,
      top: ch / 2 - renderedH / 2,
      width: renderedW,
      height: renderedH,
    });
  }, []);

  // Apply the current transform ref values to the loaded background image
  const applyTransform = useCallback(() => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) return;
    const { rotation, flipX, flipY, straighten } = transformRef.current;
    img.set({ angle: rotation + straighten, flipX, flipY });
    canvas.renderAll();
    updateImageBounds();
  }, [updateImageBounds]);

  // Stores the DOM event listener teardown so it can be called from the
  // useEffect cleanup even though the listeners are added inside an async block.
  const eventCleanupRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Initialize Fabric canvas
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
      canvas = new Canvas(el, { selection: false, renderOnAddRemove: false });

      // Size the canvas to its outer container (the flex-1 wrapper).
      // The canvas element defaults to 300×150 — do NOT use el.offsetWidth here.
      const container = containerRef.current;
      const PADDING = 48; // p-6 (24px) × 2 sides
      const w = container ? Math.max(300, container.clientWidth - PADDING) : 800;
      const h = container ? Math.max(200, container.clientHeight - PADDING) : 600;
      canvas.setDimensions({ width: w, height: h });

      // Fabric wraps the canvas element in a div (.canvas-container).
      // We attach our custom events to that wrapper so they cover both the
      // lower canvas (rendering) and the upper canvas (Fabric interactions).
      const wrapper =
        (canvas as unknown as { wrapperEl?: HTMLElement }).wrapperEl ??
        el.parentElement ??
        el;

      // ── Mouse wheel zoom ──────────────────────────────────────────────────
      // MUST use a native listener with { passive: false } so we can call
      // preventDefault().  Fabric's canvas.on("mouse:wheel") may register the
      // listener passively, which silently ignores preventDefault and causes
      // the page to scroll instead of zooming.
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const Pt = PointRef.current;
        if (!Pt) return;

        let z = canvas.getZoom();
        z *= 0.999 ** e.deltaY;
        z = Math.min(5.0, Math.max(0.1, parseFloat(z.toFixed(3))));

        const rect = wrapper.getBoundingClientRect();
        canvas.zoomToPoint(
          new Pt(e.clientX - rect.left, e.clientY - rect.top),
          z,
        );
        canvas.requestRenderAll();
        setZoom(parseFloat(z.toFixed(2)));
        const vpt = canvas.viewportTransform;
        setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]]);
      };

      // ── Click-drag pan ────────────────────────────────────────────────────
      // Left-click drag (button 0) OR middle-mouse drag (button 1) pans the
      // viewport.  During crop mode canvas.selection is true, so we leave
      // pointer events alone and let Fabric handle the crop rect.
      let isPanning = false;
      let panLastX = 0;
      let panLastY = 0;

      const handlePointerDown = (e: PointerEvent) => {
        // Crop mode: let Fabric handle its interactive rect
        if (canvas.selection) return;
        if (e.button !== 0 && e.button !== 1) return;
        isPanning = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        try { wrapper.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        wrapper.style.cursor = "grabbing";
      };

      const handlePointerMove = (e: PointerEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        panLastX = e.clientX;
        panLastY = e.clientY;
        const vpt = canvas.viewportTransform.slice() as [number, number, number, number, number, number];
        vpt[4] += dx;
        vpt[5] += dy;
        canvas.setViewportTransform(vpt);
        canvas.requestRenderAll();
      };

      const handlePointerUp = (e: PointerEvent) => {
        if (!isPanning) return;
        isPanning = false;
        wrapper.style.cursor = "";
        try { wrapper.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        // Sync viewport transform so vignette/grain overlays snap to the new position.
        const vpt = canvas.viewportTransform;
        setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]]);
      };

      wrapper.addEventListener("wheel", handleWheel, { passive: false });
      wrapper.addEventListener("pointerdown", handlePointerDown);
      wrapper.addEventListener("pointermove", handlePointerMove);
      wrapper.addEventListener("pointerup", handlePointerUp);
      wrapper.addEventListener("pointercancel", handlePointerUp);

      // Store teardown so the useEffect cleanup (below) can call it even
      // though it runs synchronously while this async block ran later.
      eventCleanupRef.current = () => {
        wrapper.removeEventListener("wheel", handleWheel);
        wrapper.removeEventListener("pointerdown", handlePointerDown);
        wrapper.removeEventListener("pointermove", handlePointerMove);
        wrapper.removeEventListener("pointerup", handlePointerUp);
        wrapper.removeEventListener("pointercancel", handlePointerUp);
      };

      fabricRef.current = canvas;
      setCanvasReady(true);
    })();

    return () => {
      disposed = true;
      fabricRef.current?.dispose();
      fabricRef.current = null;
      bgImageRef.current = null;
      setCanvasReady(false);
      setImageBounds(null);
      eventCleanupRef.current?.();
      eventCleanupRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Load background image
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
      const scale = Math.min(w / (img.width ?? w), h / (img.height ?? h)) * 0.95;
      const { rotation, flipX, flipY, straighten } = transformRef.current;

      img.set({
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        left: w / 2,
        top: h / 2,
        angle: rotation + straighten,
        flipX,
        flipY,
      });

      bgImageRef.current = img;
      canvas.backgroundImage = img as unknown as import("fabric").FabricObject;
      canvas.renderAll();

      // Calculate the rendered image bounds for the overlay positioning
      const naturalW = (img.width ?? w) * scale;
      const naturalH = (img.height ?? h) * scale;
      const isOrthogonal = (rotation + 360) % 360 === 90 || (rotation + 360) % 360 === 270;
      setImageBounds({
        left: w / 2 - (isOrthogonal ? naturalH : naturalW) / 2,
        top: h / 2 - (isOrthogonal ? naturalW : naturalH) / 2,
        width: isOrthogonal ? naturalH : naturalW,
        height: isOrthogonal ? naturalW : naturalH,
      });
    })();

    return () => { cancelled = true; };
  }, [imageUrl, canvasReady]);

  // ---------------------------------------------------------------------------
  // Apply CSS filters in real time
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.style.filter = showBefore ? "none" : buildCssFilter(adjustments);
  }, [adjustments, showBefore]);

  // ---------------------------------------------------------------------------
  // Zoom — 10% increments, clamped to 10%–500%
  // Zooms to the center of the canvas.
  // ---------------------------------------------------------------------------
  const zoomIn = useCallback(() => {
    const canvas = fabricRef.current;
    const Point = PointRef.current;
    if (!canvas || !Point) return;
    const next = Math.min(parseFloat((canvas.getZoom() + 0.1).toFixed(2)), 5.0);
    canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), next);
    canvas.requestRenderAll();
    setZoom(next);
    const vpt = canvas.viewportTransform;
    setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]]);
  }, []);

  const zoomOut = useCallback(() => {
    const canvas = fabricRef.current;
    const Point = PointRef.current;
    if (!canvas || !Point) return;
    const next = Math.max(parseFloat((canvas.getZoom() - 0.1).toFixed(2)), 0.1);
    canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), next);
    canvas.requestRenderAll();
    setZoom(next);
    const vpt = canvas.viewportTransform;
    setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]]);
  }, []);

  const resetZoom = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
    setZoom(1);
    setViewportTransform([1, 0, 0, 1, 0, 0]);
  }, []);

  // ---------------------------------------------------------------------------
  // Before / After toggle
  // ---------------------------------------------------------------------------
  const toggleBefore = useCallback(() => setShowBefore((p) => !p), []);

  // ---------------------------------------------------------------------------
  // Rotate (multiples of 90°)
  // ---------------------------------------------------------------------------
  const rotateCW = useCallback(() => {
    transformRef.current.rotation = (transformRef.current.rotation + 90) % 360;
    applyTransform();
  }, [applyTransform]);

  const rotateCCW = useCallback(() => {
    transformRef.current.rotation = ((transformRef.current.rotation - 90) + 360) % 360;
    applyTransform();
  }, [applyTransform]);

  // ---------------------------------------------------------------------------
  // Flip
  // ---------------------------------------------------------------------------
  const flipH = useCallback(() => {
    transformRef.current.flipX = !transformRef.current.flipX;
    applyTransform();
  }, [applyTransform]);

  const flipV = useCallback(() => {
    transformRef.current.flipY = !transformRef.current.flipY;
    applyTransform();
  }, [applyTransform]);

  // ---------------------------------------------------------------------------
  // Straighten
  // ---------------------------------------------------------------------------
  const straightenImage = useCallback((degrees: number) => {
    transformRef.current.straighten = degrees;
    applyTransform();
  }, [applyTransform]);

  // ---------------------------------------------------------------------------
  // Crop
  // ---------------------------------------------------------------------------
  const startCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || isCropping) return;

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoom(1);

    const { Rect } = await import("fabric");
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const inset = Math.min(w, h) * 0.05;

    const rect = new Rect({
      left: inset,
      top: inset,
      width: w - inset * 2,
      height: h - inset * 2,
      fill: "rgba(0,0,0,0)",
      stroke: "#ffffff",
      strokeWidth: 1.5,
      strokeDashArray: [6, 3],
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerSize: 8,
      borderColor: "#ffffff",
    });

    canvas.selection = true;
    canvas.add(rect);
    canvas.setActiveObject(rect);
    cropRectRef.current = rect;
    canvas.renderAll();
    setIsCropping(true);
  }, [isCropping]);

  const confirmCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    const rect = cropRectRef.current;
    if (!canvas || !rect) return;

    const cropX = Math.max(0, (rect.left as number) ?? 0);
    const cropY = Math.max(0, (rect.top as number) ?? 0);
    const cropW = Math.min(
      canvas.getWidth() - cropX,
      ((rect.width as number) ?? 100) * ((rect.scaleX as number) ?? 1),
    );
    const cropH = Math.min(
      canvas.getHeight() - cropY,
      ((rect.height as number) ?? 100) * ((rect.scaleY as number) ?? 1),
    );

    canvas.remove(rect);
    canvas.discardActiveObject();
    canvas.selection = false;
    cropRectRef.current = null;

    if (cropW <= 1 || cropH <= 1) { setIsCropping(false); return; }

    const rW = Math.round(cropW);
    const rH = Math.round(cropH);
    const rX = Math.round(cropX);
    const rY = Math.round(cropY);

    const htmlCanvas = canvas.getElement();
    const output = document.createElement("canvas");
    output.width = rW;
    output.height = rH;
    output.getContext("2d")?.drawImage(htmlCanvas, rX, rY, rW, rH, 0, 0, rW, rH);

    const dataUrl = output.toDataURL("image/png");
    const { FabricImage } = await import("fabric");
    const img = await FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });

    canvas.setDimensions({ width: rW, height: rH });
    img.set({
      scaleX: 1, scaleY: 1,
      originX: "center", originY: "center",
      left: rW / 2, top: rH / 2,
      angle: 0, flipX: false, flipY: false,
    });

    transformRef.current = { rotation: 0, flipX: false, flipY: false, straighten: 0 };
    bgImageRef.current = img;
    canvas.backgroundImage = img as unknown as import("fabric").FabricObject;
    canvas.renderAll();
    setImageBounds({ left: 0, top: 0, width: rW, height: rH });
    setIsCropping(false);
  }, []);

  const cancelCrop = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (cropRectRef.current) {
      canvas.remove(cropRectRef.current);
      canvas.discardActiveObject();
      cropRectRef.current = null;
    }
    canvas.selection = false;
    canvas.renderAll();
    setIsCropping(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Resize canvas + re-fit background image
  // ---------------------------------------------------------------------------
  const resizeCanvas = useCallback((newW: number, newH: number) => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas) return;

    canvas.setDimensions({ width: newW, height: newH });

    if (img) {
      const scale = Math.min(newW / (img.width ?? newW), newH / (img.height ?? newH)) * 0.95;
      img.set({ scaleX: scale, scaleY: scale, left: newW / 2, top: newH / 2 });
      canvas.renderAll();
      updateImageBounds();
    }
  }, [updateImageBounds]);

  return {
    canvasRef,
    containerRef,
    zoom,
    showBefore,
    isCropping,
    imageBounds,
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
    viewportTransform,
  };
}
