"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Minus, Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";
import type { AdjustmentKey } from "@/constants/adjustments";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Message {
  id: string;
  role: "user" | "assistant";
  /** Cleaned display text (adjustment tags stripped). */
  content: string;
  /** Base64 data-URL thumbnail for images sent by the user. */
  imagePreview?: string;
  timestamp: Date;
}

type SseEvent =
  | { type: "meta"; dailyRemaining: number }
  | { type: "text"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "done" };

interface ChatPanelProps {
  adjustments: Adjustments;
  onPatch: (patch: Partial<Adjustments>) => void;
  imageId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip [adjustments]...[/adjustments] from displayed text. */
function cleanText(raw: string): string {
  return raw.replace(/\[adjustments\][\s\S]*?\[\/adjustments\]/g, "").trim();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Convert a File to a base64 data-URL (for preview) and the raw base64 string
 * (for the API payload, without the `data:...;base64,` prefix).
 */
async function fileToBase64(
  file: File,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(",");
      const mediaType = header.replace("data:", "").replace(";base64", "");
      resolve({ dataUrl, base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ChatPanel({
  adjustments,
  onPatch,
  imageId,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Attached image state
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  const [attachedBase64, setAttachedBase64] = useState<string | null>(null);
  const [attachedMediaType, setAttachedMediaType] = useState<string | null>(null);

  // Daily free messages remaining (populated from SSE meta event; null = credit user)
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── File attachment ─────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    setAttachedFile(file);
    try {
      const { dataUrl, base64, mediaType } = await fileToBase64(file);
      setAttachedPreview(dataUrl);
      setAttachedBase64(base64);
      setAttachedMediaType(mediaType);
    } catch {
      toast.error("Could not read the image file.");
      setAttachedFile(null);
    }
  }

  function clearAttachment() {
    setAttachedFile(null);
    setAttachedPreview(null);
    setAttachedBase64(null);
    setAttachedMediaType(null);
  }

  // ── Send message ────────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const imagePreview = attachedPreview ?? undefined;
    const imageBase64 = attachedBase64 ?? undefined;
    const imageMediaType = attachedMediaType ?? undefined;

    // Add user message to thread
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      imagePreview,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    clearAttachment();
    setSending(true);

    // Optimistic assistant placeholder
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          adjustments,
          imageId,
          imageBase64,
          imageMediaType,
        }),
      });

      if (res.status === 429) {
        const data = (await res.json()) as { error?: string };
        const isDaily = data.error?.toLowerCase().includes("daily");
        if (isDaily) {
          toast.custom(
            (t) => (
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-sm border border-[#2a2a2a] bg-[#1a1a1a] text-[#e5e5e5] text-[13px] shadow-lg transition-opacity ${t.visible ? "opacity-100" : "opacity-0"}`}
              >
                <span>Daily free limit reached.</span>
                <a
                  href="/settings"
                  className="text-white underline underline-offset-2 font-medium whitespace-nowrap"
                  onClick={() => toast.dismiss(t.id)}
                >
                  Get credits →
                </a>
              </div>
            ),
            { duration: 5000 },
          );
        } else {
          toast("Too many requests. Please slow down.", {
            icon: "⏱",
            style: { background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a" },
          });
        }
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (res.status === 402) {
        toast.custom(
          (t) => (
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-sm border border-[#2a2a2a] bg-[#1a1a1a] text-[#e5e5e5] text-[13px] shadow-lg transition-opacity ${t.visible ? "opacity-100" : "opacity-0"}`}
            >
              <span>Insufficient credits.</span>
              <a
                href="/settings"
                className="text-white underline underline-offset-2 font-medium whitespace-nowrap"
                onClick={() => toast.dismiss(t.id)}
              >
                Purchase credits →
              </a>
            </div>
          ),
          { duration: 5000 },
        );
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let rawBuffer = ""; // accumulates partial SSE lines

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        rawBuffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (each ends with \n\n)
        const lines = rawBuffer.split("\n\n");
        rawBuffer = lines.pop() ?? ""; // keep the incomplete last chunk

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6); // strip "data: "
          let event: SseEvent;
          try {
            event = JSON.parse(jsonStr) as SseEvent;
          } catch {
            continue;
          }

          if (event.type === "meta") {
            setDailyRemaining(event.dailyRemaining);
          } else if (event.type === "text") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: cleanText(m.content + event.text) }
                  : m,
              ),
            );
          } else if (event.type === "adjustments") {
            onPatch(event.adjustments as Partial<Adjustments>);
          }
          // "done" — nothing extra needed, the outer loop will finish
        }
      }
    } catch (err) {
      console.error("[ChatPanel] send error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Something went wrong. Please try again." }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-[320px] shrink-0 h-full bg-[#111111] border-l border-[#2a2a2a]">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 h-[44px] shrink-0 border-b border-[#2a2a2a]">
        <span className="text-[12px] font-medium uppercase tracking-widest text-[#888888] select-none">
          Chat
        </span>
        <button className="text-[#555555] hover:text-[#888888] transition-colors">
          <Minus size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Message thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 py-4 flex flex-col gap-3 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-[#111111] [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[#3a3a3a]"
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] text-[#444444] text-center select-none leading-relaxed px-2">
              Describe the edits you want or ask a question about your photo.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-[4px] ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {/* Image thumbnail (user messages only) */}
            {msg.imagePreview && (
              <div className="mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={msg.imagePreview}
                  alt="Attached reference"
                  className="max-w-[140px] max-h-[100px] rounded-sm object-cover border border-[#2a2a2a]"
                />
              </div>
            )}

            {/* Bubble */}
            <div
              className={`max-w-[236px] rounded-sm px-[11px] py-[8px] text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-white text-black"
                  : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#e5e5e5]"
              }`}
            >
              {/* Loading dots when assistant placeholder is empty */}
              {msg.content === "" && msg.role === "assistant" ? (
                <span className="inline-flex gap-[4px] items-center py-[2px]">
                  <span className="w-[4px] h-[4px] rounded-full bg-[#555555] animate-bounce [animation-delay:0ms]" />
                  <span className="w-[4px] h-[4px] rounded-full bg-[#555555] animate-bounce [animation-delay:150ms]" />
                  <span className="w-[4px] h-[4px] rounded-full bg-[#555555] animate-bounce [animation-delay:300ms]" />
                </span>
              ) : (
                msg.content
              )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-[#444444] px-[2px] select-none">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {/* Image thumbnail preview above input */}
      {attachedPreview && (
        <div className="px-4 pb-2">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachedPreview}
              alt="Attached"
              className="h-[56px] w-auto max-w-[100px] rounded-sm object-cover border border-[#2a2a2a]"
            />
            <button
              onClick={clearAttachment}
              className="absolute -top-[6px] -right-[6px] w-[16px] h-[16px] rounded-full bg-[#333333] border border-[#555555] flex items-center justify-center text-[#aaaaaa] hover:text-white hover:bg-[#444444] transition-colors"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          </div>
          {attachedFile && (
            <p className="text-[10px] text-[#555555] mt-[3px] truncate max-w-[200px]">
              {attachedFile.name}
            </p>
          )}
        </div>
      )}

      {/* Daily free messages counter — only shown for free-tier users */}
      {dailyRemaining !== null && dailyRemaining >= 0 && (
        <div className="px-4 pb-1">
          <p className="text-[11px] text-[#444444]">
            {dailyRemaining} of 10 free message{dailyRemaining !== 1 ? "s" : ""} remaining today
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-end gap-[8px] bg-[#111111] border border-[#2a2a2a] rounded-sm px-3 py-[8px]">
          {/* Paperclip */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach reference image"
            className="shrink-0 text-[#555555] hover:text-[#888888] transition-colors self-end pb-[1px]"
          >
            <Paperclip size={15} strokeWidth={1.5} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the edits you want or ask for help..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder:text-[#555555] outline-none leading-relaxed min-h-[20px] max-h-[80px] overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />

          {/* Send */}
          <button
            onClick={() => { void handleSend(); }}
            disabled={!input.trim() || sending}
            title="Send"
            className="shrink-0 flex items-center justify-center w-[24px] h-[24px] rounded-full bg-white text-black hover:bg-[#e5e5e5] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer self-end"
          >
            <ArrowUp size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
