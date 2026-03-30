"use client";

import { useRef, useState } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";

interface UploadButtonProps {
  onUploadComplete?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadButton({ onUploadComplete }: UploadButtonProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadProgress: (p) => setProgress(p),
    onClientUploadComplete: async (files) => {
      const uploaded = files[0];
      if (uploaded) {
        setIsProcessing(true);
        try {
          await fetch("/api/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ufsUrl: uploaded.ufsUrl,
              name: uploaded.name,
              size: uploaded.size,
            }),
          });
        } finally {
          setIsProcessing(false);
        }
      }
      handleClose();
      onUploadComplete?.();
    },
    onUploadError: (err) => {
      console.error("Upload error:", err);
    },
  });

  function handleClose() {
    if (isUploading || isProcessing) return;
    setOpen(false);
    setFile(null);
    setProgress(0);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleUpload() {
    if (!file || isUploading) return;
    await startUpload([file]);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-[6px] h-[30px] px-3 bg-white text-black text-[12px] font-medium rounded-sm hover:bg-[#e8e8e8] transition-colors shrink-0 cursor-pointer"
      >
        <Upload size={12} strokeWidth={2} />
        Upload Photos
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-sm p-5 w-[460px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-[13px] font-medium">
                Upload Photos
              </h2>
              <button
                onClick={handleClose}
                disabled={isUploading || isProcessing}
                className="text-[#888888] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>

            {/* Drop zone — shown when no file is selected */}
            {!file && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border border-dashed border-[#2a2a2a] rounded-sm h-[140px] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#3a3a3a] transition-colors"
              >
                <ImageIcon size={22} strokeWidth={1} className="text-[#3a3a3a]" />
                <p className="text-[#888888] text-[12px]">
                  Drop a photo here or click to browse
                </p>
                <p className="text-[#555555] text-[10px]">
                  JPEG, PNG, TIFF · up to 32 MB
                </p>
              </div>
            )}

            {/* File preview — shown after selection */}
            {file && (
              <div className="border border-[#2a2a2a] rounded-sm p-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm flex items-center justify-center shrink-0">
                  <ImageIcon size={14} strokeWidth={1.5} className="text-[#555555]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[12px] truncate">{file.name}</p>
                  <p className="text-[#888888] text-[10px]">
                    {formatBytes(file.size)}
                  </p>
                </div>
                {!isUploading && !isProcessing && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-[#555555] hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <X size={13} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            )}

            {/* Progress bar */}
            {(isUploading || isProcessing) && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#888888] text-[11px]">
                    {isProcessing ? "Saving to library..." : "Uploading..."}
                  </span>
                  {!isProcessing && (
                    <span className="text-[#888888] text-[11px]">{progress}%</span>
                  )}
                </div>
                <div className="h-[2px] bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-150"
                    style={{ width: isProcessing ? "100%" : `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={isUploading || isProcessing}
                className="text-[#555555] text-[11px] hover:text-[#888888] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >
                {file ? "Change file" : ""}
              </button>

              {file && !isUploading && !isProcessing && (
                <button
                  onClick={handleUpload}
                  className="flex items-center gap-[6px] h-[30px] px-4 bg-white text-black text-[12px] font-medium rounded-sm hover:bg-[#e8e8e8] transition-colors cursor-pointer"
                >
                  <Upload size={12} strokeWidth={2} />
                  Upload
                </button>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/tiff"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}
    </>
  );
}
