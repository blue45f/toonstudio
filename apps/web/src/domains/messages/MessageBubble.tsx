import { Flag } from "lucide-react";

import type { MessagingMessage, MessagingThreadSummary } from "@/platform/messaging-client";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";

import { formatMessageTime } from "./message-time";
import { UserAvatar } from "./MessagingUserAvatar";

type OtherUser = MessagingThreadSummary["otherUser"];

/** 날짜가 바뀌는 지점에 꽂는 구분선 — 긴 대화를 날짜 단위로 읽을 수 있게 한다. */
export function MessageDayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.6875rem] font-medium text-fg-3">
        {label}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}

export function MessageBubble({
  message,
  otherUser,
  onReport,
}: {
  message: MessagingMessage;
  otherUser: OtherUser;
  onReport: (message: MessagingMessage) => void;
}) {
  // 시스템 안내는 말풍선이 아니라 중앙 칩으로 — 누가 말했는지가 없는 메시지다.
  if (message.type === "system") {
    return (
      <div className="flex justify-center">
        <p className="rounded-full bg-panel px-3 py-1 text-center text-[0.6875rem] leading-relaxed text-fg-3">
          {message.body}
        </p>
      </div>
    );
  }

  // 삭제된 메시지는 목록 미리보기와 같은 문구로 가린다 — 원문을 본문에 남기지 않는다.
  if (message.deletedAt) {
    return (
      <div className={cn("flex gap-2", message.mine ? "justify-end" : "justify-start")}>
        {!message.mine && <UserAvatar user={otherUser} size="sm" />}
        <div
          className={cn(
            "max-w-[82%] rounded-2xl border border-dashed border-line px-3.5 py-2.5 text-sm italic text-fg-3 sm:max-w-[72%]",
            message.mine ? "rounded-br-md" : "rounded-bl-md"
          )}
        >
          삭제된 메시지입니다.
        </div>
      </div>
    );
  }

  const context = message.type === "work_card" || message.type === "project_card"
    ? message.metadata.context
    : null;
  const linkedContext = context && typeof context === "object" && !Array.isArray(context)
    ? context as { label?: unknown; href?: unknown }
    : null;
  const label = typeof linkedContext?.label === "string" ? linkedContext.label : null;
  const href = typeof linkedContext?.href === "string" ? linkedContext.href : null;

  return (
    <div className={cn("group flex gap-2", message.mine ? "justify-end" : "justify-start")}>
      {!message.mine && <UserAvatar user={otherUser} size="sm" />}
      <div className={cn("max-w-[82%] sm:max-w-[72%]", message.mine && "text-right")}>
        {label && (
          <div className={cn(
            "mb-1 rounded-xl border border-line bg-panel px-3 py-2 text-left text-xs",
            message.mine ? "ml-auto" : "mr-auto"
          )}>
            <p className="font-semibold text-fg">{message.type === "project_card" ? "프로젝트" : "작품"}</p>
            {href ? (
              <Link href={href} className="mt-0.5 block truncate text-accent hover:underline">
                {label}
              </Link>
            ) : (
              <p className="mt-0.5 truncate text-fg-2">{label}</p>
            )}
          </div>
        )}
        <div className={cn(
          "rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed whitespace-pre-wrap break-words",
          message.mine
            ? "rounded-br-md bg-accent text-on-accent"
            : "rounded-bl-md border border-line bg-card text-fg"
        )}>
          {message.body}
        </div>
        <div className={cn("mt-1 flex items-center gap-1.5 text-[0.6875rem] text-fg-3", message.mine ? "justify-end" : "justify-start")}>
          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
          {message.mine && message.readByOther && <span>읽음</span>}
          {!message.mine && (
            <button
              type="button"
              onClick={() => onReport(message)}
              className="opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
              aria-label="메시지 신고"
            >
              <Flag size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
