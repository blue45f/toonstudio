import { MessageSquare, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";

export interface SpaceCursorChatOverlayProps {
  readonly enabled: boolean;
  readonly onSend: (text: string) => void;
  readonly onStamp?: (emote: StudioSpaceEmoteId) => void;
  readonly onTypingChange?: (typing: boolean) => void;
}

const QUICK_STAMPS: readonly { readonly id: StudioSpaceEmoteId; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "thumbs-up", labelKo: "좋아요", labelEn: "Like" },
  { id: "clap", labelKo: "박수", labelEn: "Clap" },
  { id: "idea", labelKo: "아이디어", labelEn: "Idea" },
  { id: "question", labelKo: "질문", labelEn: "Question" },
];

/**
 * FigJam 스타일 '/' 즉석 커서 챗 & 스탬프 리액션 오버레이.
 * 키보드 '/'를 누르면 포인터 옆에 즉시 말풍선 입력창이 열리고 Enter로 아바타/커서에 전송한다.
 */
export function SpaceCursorChatOverlay({
  enabled,
  onSend,
  onStamp,
  onTypingChange,
}: SpaceCursorChatOverlayProps) {
  const bt = useBilingual("SpaceCursorChatOverlay");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pointer, setPointer] = useState({ x: 240, y: 200 });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      setPointer({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
      if (event.key === "/" && !open && !editingText) {
        event.preventDefault();
        setOpen(true);
        onTypingChange?.(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        setText("");
        onTypingChange?.(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onTypingChange, open]);

  if (!enabled || !open) return null;

  const clampedX = Math.max(16, Math.min((typeof window !== "undefined" ? window.innerWidth : 1280) - 320, pointer.x + 14));
  const clampedY = Math.max(64, Math.min((typeof window !== "undefined" ? window.innerHeight : 800) - 110, pointer.y + 14));

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) onSend(trimmed);
    setText("");
    setOpen(false);
    onTypingChange?.(false);
  };

  return (
    <div
      data-space-interactive="true"
      data-testid="space-cursor-chat-overlay"
      className="fixed z-40 w-72 rounded-2xl border border-accent bg-panel/95 p-2 text-xs text-fg shadow-xl backdrop-blur-md"
      style={{ left: clampedX, top: clampedY }}
    >
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <MessageSquare size={14} className="shrink-0 text-accent" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          data-testid="space-cursor-chat-input"
          aria-label={bt("빠른 커서 챗 메시지", "Quick cursor chat message")}
          placeholder={bt("메시지 입력 후 Enter…", "Type message and press Enter…")}
          maxLength={120}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-fg placeholder:text-fg-3 focus:outline-none"
        />
        <button
          type="submit"
          aria-label={bt("전송", "Send")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <Send size={14} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={bt("닫기", "Close")}
          onClick={() => {
            setOpen(false);
            setText("");
            onTypingChange?.(false);
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-card text-fg-2"
        >
          <X size={14} aria-hidden />
        </button>
      </form>
      {onStamp ? (
        <div className="mt-1.5 flex flex-wrap gap-1 border-t border-line pt-1.5" role="group" aria-label={bt("빠른 스탬프", "Quick stamps")}>
          {QUICK_STAMPS.map((stamp) => (
            <button
              key={stamp.id}
              type="button"
              onClick={() => {
                onStamp(stamp.id);
                setOpen(false);
                onTypingChange?.(false);
              }}
              className="min-h-9 rounded-lg border border-line bg-card px-2 text-[11px] font-medium text-fg-2 hover:border-accent hover:text-fg"
            >
              {bt(stamp.labelKo, stamp.labelEn)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
