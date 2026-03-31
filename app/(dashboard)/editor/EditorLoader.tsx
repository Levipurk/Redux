"use client";

import dynamic from "next/dynamic";

const EditorApp = dynamic(() => import("@/components/editor/EditorApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen bg-[#0a0a0a] items-center justify-center">
      <span className="text-[#555555] text-[14px]">Loading editor…</span>
    </div>
  ),
});

export default function EditorLoader() {
  return <EditorApp />;
}
