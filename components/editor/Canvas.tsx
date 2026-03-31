"use client";

interface CanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageUrl: string | null;
}

export default function Canvas({ canvasRef, imageUrl }: CanvasProps) {
  return (
    <div className="relative flex-1 bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
      {/* Fabric canvas — always mounted so the hook can initialize */}
      <canvas ref={canvasRef} className="max-w-full max-h-full" />

      {/* Placeholder shown when no image is loaded */}
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border border-dashed border-[#2a2a2a] rounded-sm flex items-center justify-center w-[520px] h-[320px]">
            <p className="text-[#555555] text-[15px] select-none">
              Your image will appear here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
