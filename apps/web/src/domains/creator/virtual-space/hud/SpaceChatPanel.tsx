import { Download, MessageCircle, Pin, SendHorizontal, X } from "lucide-react";
import { memo, useEffect, useRef, useState, type FormEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  formatStudioChatCsv,
  type StudioVirtualSpaceChatMessage,
  type StudioVirtualSpaceChatScope,
} from "../studio-virtual-space-chat";
import { STUDIO_PRESENCE_BUBBLE_MAX_LENGTH } from "../studio-virtual-space-presence";

export interface SpaceChatPanelProps {
  readonly messages: readonly StudioVirtualSpaceChatMessage[];
  /** 입력 중 표시를 띄울 상대 이름들. */
  readonly typingNames: readonly string[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSend: (scope: StudioVirtualSpaceChatScope, text: string) => void;
  readonly onTyping: (scope: StudioVirtualSpaceChatScope, typing: boolean) => void;
  /** 닫을 때 월드(캔버스)로 포커스를 돌려보낸다. */
  readonly onReturnFocus?: () => void;
  /** 채팅 기록 CSV 내보내기 콜백(oVice Export Chat History as CSV 대응). */
  readonly onExportCsv?: (csv: string) => void;
}

const PREVIEW_COUNT = 4;

/**
 * 말풍선 채팅 오버레이(좌하단). 닫혀 있을 때는 최근 말만 흐리게 보여 주고,
 * 열면 로그와 입력창이 붙는다. Enter 열기 단축키는 페이지 단축키 훅이 맡고,
 * 모바일에서는 "말 걸기" 버튼이 같은 동선이다.
 * oVice 벤치마크의 메시지 고정(Pin), @here/@all 그룹 멘션 칩, 채팅 내역 CSV 내보내기를 지원한다.
 */
export const SpaceChatPanel = memo(function SpaceChatPanel({
  messages, typingNames, open, onOpenChange, onSend, onTyping, onReturnFocus, onExportCsv,
}: SpaceChatPanelProps) {
  const bt = useBilingual("SpaceChatPanel");
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<StudioVirtualSpaceChatScope>("nearby");
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  useEffect(() => {
    const log = logRef.current;
    if (open && log) log.scrollTop = log.scrollHeight;
  }, [open, messages.length]);

  const close = () => {
    onTyping(scope, false);
    onOpenChange(false);
    onReturnFocus?.();
  };

  const changeScope = (next: StudioVirtualSpaceChatScope) => {
    setScope(next);
    if (draft.trim().length > 0) onTyping(next, true);
  };

  const insertMention = (token: "@here" | "@all", targetScope: StudioVirtualSpaceChatScope) => {
    setScope(targetScope);
    const next = draft.startsWith(`${token} `) ? draft : `${token} ${draft.replace(/^@(?:here|all)\s+/u, "")}`;
    const sliced = next.slice(0, STUDIO_PRESENCE_BUBBLE_MAX_LENGTH);
    setDraft(sliced);
    onTyping(targetScope, sliced.trim().length > 0);
    inputRef.current?.focus();
  };

  const exportCsv = () => {
    const csv = formatStudioChatCsv(messages);
    onExportCsv?.(csv);
    try {
      const isJsdom = typeof navigator !== "undefined" && /jsdom/iu.test(navigator.userAgent);
      if (!isJsdom && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof Blob !== "undefined") {
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "studio-chat-history.csv";
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* 테스트·제한 환경에서는 콜백 호출만 보장한다 */ }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(scope, text);
    setDraft("");
    onTyping(scope, false);
    inputRef.current?.focus();
  };

  const pinnedMessage = pinnedMessageId ? messages.find((item) => item.id === pinnedMessageId) ?? null : null;

  const typingLine = typingNames.length > 0
    ? bt(
      typingNames.length === 1 ? `${typingNames[0]} 님이 입력 중…` : `${typingNames[0]} 님 외 ${typingNames.length - 1}명이 입력 중…`,
      typingNames.length === 1 ? `${typingNames[0]} is typing…` : `${typingNames[0]} and ${typingNames.length - 1} more are typing…`,
    )
    : null;

  if (!open) {
    const preview = messages.slice(-PREVIEW_COUNT);
    return <div className="space-chat space-chat--closed" data-space-interactive="true">
      {preview.length > 0 ? <div className="space-chat__preview" aria-hidden="true">
        {preview.map((message) => <p key={message.id} className="space-chat__preview-line">
          <strong>{message.displayName}</strong> {message.text}
        </p>)}
      </div> : null}
      <button type="button" className="space-chat__open-button" onClick={() => onOpenChange(true)}
        aria-label={bt("말풍선 채팅 열기", "Open bubble chat")} title={bt("말 걸기 (Enter)", "Say something (Enter)")}>
        <MessageCircle size={17} aria-hidden />{bt("말 걸기", "Chat")}
      </button>
    </div>;
  }

  return <section className="space-chat space-chat--open" data-space-interactive="true"
    aria-label={bt("말풍선 채팅", "Bubble chat")}>
    {pinnedMessage ? <div className="space-chat__pinned" role="region" aria-label={bt("고정된 메시지", "Pinned message")}>
      <Pin size={13} aria-hidden />
      <strong>{pinnedMessage.displayName}</strong>
      <span>{pinnedMessage.text}</span>
      <button type="button" className="space-pill-button" onClick={() => setPinnedMessageId(null)}
        aria-label={bt("고정 메시지 해제", "Unpin message")}>{bt("고정 해제", "Unpin")}</button>
    </div> : null}
    <div className="space-chat__log" role="log" aria-label={bt("채팅 기록", "Chat history")} ref={logRef}>
      {messages.length === 0 ? <p className="space-chat__empty">
        {bt("아직 나눈 말이 없어요. 가까이 다가가 가볍게 말을 걸어 보세요.", "No messages yet. Walk up to someone and say hello.")}
      </p> : messages.map((message) => {
        const pinned = pinnedMessage?.id === message.id;
        return <p key={message.id} className="space-chat__message" data-self={message.self || undefined} data-pinned={pinned || undefined}>
          <strong>{message.displayName}</strong>
          {message.scope === "all" ? <span className="space-chat__scope-badge">{bt("전체", "All")}</span> : null}
          <span>{message.text}</span>
          <button type="button" className="space-chat__pin-button" aria-pressed={pinned}
            aria-label={pinned
              ? bt(`${message.displayName} 메시지 고정 해제`, `Unpin message from ${message.displayName}`)
              : bt(`${message.displayName} 메시지 고정`, `Pin message from ${message.displayName}`)}
            onClick={() => setPinnedMessageId(pinned ? null : message.id)}>
            <Pin size={12} aria-hidden />
          </button>
        </p>;
      })}
    </div>
    {typingLine ? <p className="space-chat__typing" role="status">{typingLine}</p> : null}
    <div className="space-chat__quick-tools" role="group" aria-label={bt("멘션·내보내기 도구", "Mentions & export tools")}>
      <button type="button" className="space-pill-button" onClick={() => insertMention("@here", "nearby")}
        aria-label={bt("@here 근처 멘션 넣기", "Insert @here mention")}>@here</button>
      <button type="button" className="space-pill-button" onClick={() => insertMention("@all", "all")}
        aria-label={bt("@all 전체 멘션 넣기", "Insert @all mention")}>@all</button>
      {messages.length > 0 ? <button type="button" className="space-pill-button" onClick={exportCsv}
        aria-label={bt("채팅 내역 CSV 내보내기", "Export chat history as CSV")}>
        <Download size={12} aria-hidden />{bt("CSV 내보내기", "Export CSV")}
      </button> : null}
    </div>
    <form className="space-chat__form" onSubmit={submit}>
      <div className="space-chat__scope" role="group" aria-label={bt("말할 범위", "Chat range")}>
        <button type="button" aria-pressed={scope === "nearby"} data-active={scope === "nearby" || undefined}
          onClick={() => changeScope("nearby")}>{bt("근처", "Nearby")}</button>
        <button type="button" aria-pressed={scope === "all"} data-active={scope === "all" || undefined}
          onClick={() => changeScope("all")}>{bt("전체", "All")}</button>
      </div>
      <input ref={inputRef} className="space-chat__input" type="text" value={draft}
        maxLength={STUDIO_PRESENCE_BUBBLE_MAX_LENGTH}
        placeholder={bt("말을 입력하세요", "Type a message")}
        aria-label={bt("채팅 입력", "Chat input")}
        onChange={(event) => {
          setDraft(event.target.value);
          onTyping(scope, event.target.value.trim().length > 0);
        }}
        onBlur={() => onTyping(scope, false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }} />
      <button type="submit" className="space-chat__send" disabled={draft.trim().length === 0}
        aria-label={bt("보내기", "Send")} title={bt("보내기 (Enter)", "Send (Enter)")}>
        <SendHorizontal size={16} aria-hidden />
      </button>
      <button type="button" className="space-chat__close" onClick={close}
        aria-label={bt("채팅 닫기", "Close chat")} title={bt("닫기 (Esc)", "Close (Esc)")}>
        <X size={16} aria-hidden />
      </button>
    </form>
  </section>;
});
