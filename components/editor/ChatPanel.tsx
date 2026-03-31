"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Minus, Paperclip } from "lucide-react";
import type { Adjustments } from "@/hooks/useEditor";
import type { AdjustmentKey } from "@/constants/adjustments";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  adjustments: Adjustments;
  onPatch: (patch: Partial<Adjustments>) => void;
  imageId?: string;
}

export default function ChatPanel({
  adjustments,
  onPatch,
  imageId,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages grow
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    // Optimistic placeholder for assistant response
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          adjustments,
          imageId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Streaming response — read chunks as they arrive
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            );
          }
        }

        // Try to extract JSON adjustments from a terminal marker
        const match = accumulated.match(/```json\s*([\s\S]*?)```/);
        if (match) {
          try {
            const data = JSON.parse(match[1]) as {
              adjustments?: Partial<Record<AdjustmentKey, number>>;
            };
            if (data.adjustments) onPatch(data.adjustments);
          } catch {
            // Not valid JSON, ignore
          }
        }
      } else {
        // Standard JSON response
        const data = (await response.json()) as {
          message?: string;
          adjustments?: Partial<Record<AdjustmentKey, number>>;
        };

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: data.message ?? "Done." }
              : m,
          ),
        );

        if (data.adjustments) onPatch(data.adjustments);
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
      setAttachedFile(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex flex-col w-[280px] shrink-0 h-full bg-[#111111] border-l border-[#2a2a2a]">
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
        className="flex-1 overflow-y-auto min-h-0 px-4 py-4 flex flex-col gap-4"
      >
        {messages.length === 0 && (
          <p className="text-[13px] text-[#444444] text-center mt-4 select-none leading-relaxed">
            Describe the edits you want or ask a question about your photo.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[220px] rounded-sm px-[11px] py-[8px] text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-white text-black"
                  : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#e5e5e5]"
              }`}
            >
              {msg.content || (
                <span className="inline-flex gap-[3px] items-center">
                  <span className="w-[4px] h-[4px] rounded-full bg-[#555555] animate-bounce [animation-delay:0ms]" />
                  <span className="w-[4px] h-[4px] rounded-full bg-[#555555] animate-bounce [animation-delay:150ms]" />
                  <span className="w-[4px] h-[4px] rounded-full bg-[#555555] animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Attached file indicator */}
      {attachedFile && (
        <div className="px-4 pb-1">
          <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm px-2 py-1">
            <Paperclip size={10} className="text-[#888888] shrink-0" />
            <span className="text-[10px] text-[#888888] truncate">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="ml-auto text-[#555555] hover:text-[#888888] shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 pb-4 pt-3 shrink-0">
        <div className="flex items-end gap-[8px] bg-[#111111] border border-[#2a2a2a] rounded-sm px-3 py-[8px]">
          {/* Paperclip */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-[#555555] hover:text-[#888888] transition-colors self-end pb-[1px]"
          >
            <Paperclip size={15} strokeWidth={1.5} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setAttachedFile(f);
              e.target.value = "";
            }}
          />

          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the edits you want or ask for help..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder:text-[#888888] outline-none leading-relaxed min-h-[20px] max-h-[80px] overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />

          {/* Send */}
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
            className="shrink-0 flex items-center justify-center w-[24px] h-[24px] rounded-full bg-white text-black hover:bg-[#e5e5e5] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer self-end"
          >
            <ArrowUp size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
