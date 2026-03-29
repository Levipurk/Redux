"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";
import { UploadDropzone } from "@/lib/uploadthing";

interface UploadButtonProps {
  onUploadComplete?: () => void;
}

export default function UploadButton({ onUploadComplete }: UploadButtonProps) {
  const [open, setOpen] = useState(false);

  function handleComplete() {
    setOpen(false);
    onUploadComplete?.();
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
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-sm p-5 w-[460px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-[13px] font-medium">
                Upload Photos
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-[#888888] hover:text-white transition-colors cursor-pointer"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>

            <UploadDropzone
              endpoint="imageUploader"
              onClientUploadComplete={handleComplete}
              onUploadError={(error) => {
                console.error("Upload error:", error);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
