"use client";

import type { CanvasAdjustments, ImageBounds } from "@/hooks/useCanvas";

interface CanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Attached to the outer flex-1 container so useCanvas can measure it for
  // proper canvas sizing on init (the <canvas> element defaults to 300×150).
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageUrl: string | null;
  adjustments: CanvasAdjustments;
  // Rendered pixel bounds of the background image inside the Fabric canvas
  // (canvas-space coordinates, before any viewport transform is applied).
  imageBounds: ImageBounds | null;
  // Fabric's current viewport transform [scaleX, skewY, skewX, scaleY, tx, ty].
  // Applied as a CSS matrix() to the overlay container so vignette/grain stay
  // perfectly aligned with the image at any zoom level or pan position.
  viewportTransform: [number, number, number, number, number, number];
  isCropping?: boolean;
  onConfirmCrop?: () => void;
  onCancelCrop?: () => void;
}

export default function Canvas({
  canvasRef,
  containerRef,
  imageUrl,
  adjustments,
  imageBounds,
  viewportTransform,
  isCropping,
  onConfirmCrop,
  onCancelCrop,
}: CanvasProps) {
  const vignetteOpacity = Math.max(0, adjustments.vignette / 100);
  const grainOpacity = Math.max(0, adjustments.grain / 100);

  // Build the CSS matrix string from Fabric's viewport transform so the
  // overlay container transforms in lock-step with the canvas contents.
  const [a, b, c, d, e, f] = viewportTransform;
  const overlayMatrix = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;

  return (
    // containerRef is read by useCanvas to determine canvas dimensions.
    // This div must always be in the DOM — never conditionally render Canvas,
    // otherwise Fabric's init effect ([] deps) fires with canvasRef.current=null
    // and the canvas never initializes.
    <div
      ref={containerRef}
      className="relative flex-1 bg-[#0a0a0a] overflow-hidden flex items-center justify-center p-6"
    >
      {/* Canvas wrapper — positioned parent for the overlay divs */}
      <div className="relative inline-block">

        {/* Fabric canvas — always mounted so the hook can initialize */}
        <canvas ref={canvasRef} className="block" />

        {/* Overlay container — covers the canvas element exactly and applies
            Fabric's viewport transform as a CSS matrix so that child divs
            positioned in canvas-space coordinates track the image at any
            zoom level or pan position. overflow-hidden clips anything that
            pans/zooms outside the canvas boundary. */}
        {imageBounds && (vignetteOpacity > 0 || grainOpacity > 0) && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              style={{
                position: "absolute",
                transformOrigin: "0 0",
                transform: overlayMatrix,
              }}
            >
              {/* Vignette — radial gradient clipped to the image bounds */}
              {vignetteOpacity > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: imageBounds.left,
                    top: imageBounds.top,
                    width: imageBounds.width,
                    height: imageBounds.height,
                    background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${(vignetteOpacity * 0.9).toFixed(2)}) 100%)`,
                  }}
                />
              )}

              {/* Grain — SVG feTurbulence noise clipped to image bounds */}
              {grainOpacity > 0 && (
                <div
                  className="mix-blend-overlay"
                  style={{
                    position: "absolute",
                    left: imageBounds.left,
                    top: imageBounds.top,
                    width: imageBounds.width,
                    height: imageBounds.height,
                    opacity: grainOpacity * 0.6,
                  }}
                >
                  <svg
                    width="100%"
                    height="100%"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                  >
                    <filter id="grain-filter">
                      <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.65"
                        numOctaves="3"
                        stitchTiles="stitch"
                      />
                      <feColorMatrix type="saturate" values="0" />
                    </filter>
                    <rect width="100%" height="100%" filter="url(#grain-filter)" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Placeholder shown when no image is loaded */}
      {!imageUrl && (
        <div className="absolute inset-6 flex items-center justify-center pointer-events-none">
          <div className="border border-dashed border-[#2a2a2a] rounded-sm flex items-center justify-center w-[520px] h-[320px] max-w-full max-h-full">
            <p className="text-[#555555] text-[15px] select-none">
              Your image will appear here
            </p>
          </div>
        </div>
      )}

      {/* Crop confirm / cancel — floats above the canvas at the bottom center */}
      {isCropping && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          <button
            onClick={onCancelCrop}
            className="h-[34px] px-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm text-[13px] text-white hover:bg-[#222222] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirmCrop}
            className="h-[34px] px-5 bg-white rounded-sm text-[13px] text-black font-medium hover:bg-[#e5e5e5] transition-colors cursor-pointer"
          >
            Confirm Crop
          </button>
        </div>
      )}

    </div>
  );
}
