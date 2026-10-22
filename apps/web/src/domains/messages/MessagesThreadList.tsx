/**
 * 메시지함 — 대화 목록 행과 빈 상태(표시 컴포넌트).
 *
 * `MessagesPage.tsx`에서 분리했다. 상태·데이터 패칭은 페이지가 소유하고,
 * 이 파일은 스레드 요약 한 건의 표시와 탭별 빈 상태만 책임진다.
 */

import { Archive, ChevronRight, CircleSlash2, Inbox, Mail } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { cn } from "@/shared/lib/utils";
import type { MessagingThreadSummary } from "@/platform/messaging-client";

import { formatMessageTime } from "./message-time";
import { UserAvatar } from "./MessagingUserAvatar";

export type InboxTab = "active" | "requests" | "archived";

export function ThreadListItem({
  thread,
  selected,
  tab,
}: {
  thread: MessagingThreadSummary;
  selected: boolean;
  tab: InboxTab;
}) {
  const preview = thread.lastMessage?.deletedAt
    ? "삭제된 메시지입니다."
    : thread.lastMessage?.body || "대화를 시작해 보세요.";
  return (
    <Link
      href={{
        pathname: `/messages/${encodeURIComponent(thread.id)}`,
        query: tab === "active" ? {} : { tab },
      }}
      className={cn(
        "group flex min-h-[76px] items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-raised/70",
        selected && "bg-accent-soft/70"
      )}
      aria-current={selected ? "page" : undefined}
    >
      <UserAvatar user={thread.otherUser} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="truncate text-sm text-fg">{thread.otherUser.name}</strong>
          {thread.state === "pending" && (
            <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-warn">
              {thread.incomingRequest ? "요청" : "수락 대기"}
            </span>
          )}
          {thread.blocked && <CircleSlash2 size={13} className="shrink-0 text-danger" aria-label="차단됨" />}
          <time className="ml-auto shrink-0 text-[0.6875rem] text-fg-3" dateTime={thread.lastMessageAt}>
            {formatMessageTime(thread.lastMessageAt)}
          </time>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={cn("truncate text-xs", thread.unreadCount > 0 ? "font-semibold text-fg" : "text-fg-2")}>
            {preview}
          </span>
          {thread.unreadCount > 0 && (
            <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 py-0.5 text-[0.625rem] font-bold text-on-accent">
              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function EmptyInbox({ tab }: { tab: InboxTab }) {
  const copy =
    tab === "requests"
      ? {
          title: "새 메시지 요청이 없습니다.",
          description: "처음 연락하는 회원의 메시지는 이곳에서 먼저 확인할 수 있어요.",
          icon: Inbox,
          primary: { href: "/creators", label: "창작자 찾아보기" },
        }
      : tab === "archived"
        ? {
            title: "보관한 대화가 없습니다.",
            description: "정리한 대화는 언제든 다시 복원할 수 있어요.",
            icon: Archive,
            primary: { href: "/creators", label: "새 대화 시작하기" },
          }
        : {
            title: "아직 대화가 없습니다.",
            description: "회원 프로필에서 작품 피드백이나 협업 메시지를 보내 보세요.",
            icon: Mail,
            primary: { href: "/creators", label: "새 대화 시작하기" },
          };
  return (
    <ActionableEmptyState
      art="generic"
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      primary={copy.primary}
      className="mt-2"
    />
  );
}

