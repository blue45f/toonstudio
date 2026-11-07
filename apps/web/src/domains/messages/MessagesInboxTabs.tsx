import { Archive, Inbox, MessageSquareText } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { InboxTab } from "./MessagesThreadList";

import { MESSAGES_INBOX_PANEL_ID, messagesInboxTabId } from "./messages-inbox-navigation";

export function MessagesInboxTabs({ tab, onChange }: { readonly tab: InboxTab; readonly onChange: (value: InboxTab) => void }) {
  const t = useBilingual("domains.messages.MessagesInboxTabs");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const options = [
    { value: "active", label: t("대화", "Conversations"), icon: MessageSquareText },
    { value: "requests", label: t("메시지 요청", "Requests"), icon: Inbox },
    { value: "archived", label: t("보관함", "Archived"), icon: Archive },
  ] as const;
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % options.length
      : event.key === "ArrowLeft" ? (index + options.length - 1) % options.length
      : event.key === "Home" ? 0
      : event.key === "End" ? options.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    // 목록은 네트워크로 불러오므로 방향키는 초점만 옮기고 Enter·Space로 선택한다.
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={t("메시지함", "Inbox")} className="grid min-w-0 grid-cols-3 gap-1 border-b border-line p-2">
      {options.map(({ value, label, icon: Icon }, index) => (
        <button
          key={value}
          ref={(node) => { refs.current[index] = node; }}
          id={messagesInboxTabId(value)}
          type="button"
          role="tab"
          aria-selected={value === tab}
          aria-controls={MESSAGES_INBOX_PANEL_ID}
          tabIndex={value === tab ? 0 : -1}
          onKeyDown={(event) => moveFocus(event, index)}
          onClick={() => onChange(value)}
          style={{ minBlockSize: "var(--site-control-size, 2.75rem)" }}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none sm:flex-row sm:gap-1.5",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            value === tab ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <Icon size={15} className="shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
