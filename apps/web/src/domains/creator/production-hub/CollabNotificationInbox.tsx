import { useT } from "@/shared/lib/i18n";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import {
  filterCollabInbox,
  summarizeCollabInbox,
  type CollabInboxItem,
  type CollabInboxTab,
  type CollabNotificationCategory,
} from "./collab-notification-model";

export interface CollabNotificationInboxProps {
  readonly items: readonly CollabInboxItem[];
  readonly loading?: boolean;
  readonly error?: string | null;
  /** 상대 시각 표기 기준. 기본은 렌더 시각. */
  readonly now?: Date;
  /** 항목 클릭 — 호스트가 item.target.href 딥링크로 이동하고 읽음 처리한다. */
  readonly onOpenItem?: (item: CollabInboxItem) => void;
  readonly onMarkAllRead?: () => void;
}

const CATEGORY_LABELS: Readonly<Record<CollabNotificationCategory, string>> = {
  mention: "멘션",
  "review-request": "검수 요청",
  approval: "승인 결과",
  handover: "인계",
};

const TABS: readonly { readonly id: CollabInboxTab; readonly label: string }[] = [
  { id: "all", label: "전체" },
  { id: "unread", label: "안 읽음" },
  { id: "mention", label: "멘션" },
  { id: "review-request", label: "검수 요청" },
  { id: "approval", label: "승인 결과" },
  { id: "handover", label: "인계" },
];

const EMPTY_COPY_KEYS: Readonly<Record<CollabInboxTab, string>> = {
  all: "productionHub.status.inboxEmptyAll",
  unread: "productionHub.status.inboxEmptyUnread",
  mention: "productionHub.status.inboxEmptyMention",
  "review-request": "productionHub.status.inboxEmptyReviewRequest",
  approval: "productionHub.status.inboxEmptyApproval",
  handover: "productionHub.status.inboxEmptyHandover",
};

const EMPTY_COPY: Readonly<Record<CollabInboxTab, string>> = {
  all: "아직 협업 알림이 없어요. 팀원이 나를 언급하거나 검수를 요청하면 여기에 모여요.",
  unread: "안 읽은 알림이 없어요. 다 확인했어요.",
  mention: "나를 언급한 댓글이 없어요.",
  "review-request": "받은 검수 요청이 없어요.",
  approval: "승인 결과가 없어요.",
  handover: "인계 알림이 없어요.",
};

function relativeTime(createdAt: string, now: Date): string {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return "";
  const diffMs = Math.max(0, now.getTime() - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const date = new Date(then);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 통합 협업 알림 인박스.
 * 멘션·검수 요청·승인 결과·인계 신호를 한 스트림으로 보여 준다. 흩어진 표면을
 * 오가지 않아도 "나에게 온 것"을 놓치지 않는 것이 목적이며, 항목을 누르면
 * 해당 핀·게이트로 바로 이동한다.
 */
export function CollabNotificationInbox({
  items,
  loading = false,
  error = null,
  now,
  onOpenItem,
  onMarkAllRead,
}: CollabNotificationInboxProps) {
  const t = useT();
  const [tab, setTab] = useState<CollabInboxTab>("all");
  const summary = useMemo(() => summarizeCollabInbox(items), [items]);
  const visible = useMemo(() => filterCollabInbox(items, tab), [items, tab]);
  const referenceNow = now ?? new Date();

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center p-8 text-sm text-fg-3">
        협업 알림을 모으고 있어요…
      </div>
    );
  }

  return (
    <section aria-label="통합 협업 알림" className="flex min-h-0 flex-col">
      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-black text-fg">
          <Bell size={15} aria-hidden /> 협업 알림
        </h3>
        {summary.unread > 0 ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-bold tabular-nums text-on-accent">
            안 읽음 {summary.unread}개
          </span>
        ) : null}
        {summary.urgentUnread > 0 ? (
          <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[0.65rem] font-bold tabular-nums text-bad">
            긴급 {summary.urgentUnread}개
          </span>
        ) : null}
        {onMarkAllRead && summary.unread > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <CheckCheck size={13} aria-hidden /> 모두 읽음
          </button>
        ) : null}
      </div>

      <div role="tablist" aria-label="협업 알림 분류" className="mt-3 flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map(({ id, label }) => {
          const count =
            id === "all"
              ? summary.total
              : id === "unread"
                ? summary.unread
                : summary.byCategory[id as CollabNotificationCategory].unread;
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {label}
              {count > 0 ? (
                <span className={`rounded px-1.5 py-0.5 text-[0.6rem] tabular-nums ${active ? "bg-black/15 text-on-accent" : "bg-raised text-fg-3"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-xs leading-relaxed text-fg-3">
          {t(EMPTY_COPY_KEYS[tab] ?? "productionHub.status.inboxEmptyAll", EMPTY_COPY[tab] ?? "")}
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpenItem?.(item)}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  item.closed
                    ? "border-line bg-card opacity-60"
                    : item.read
                      ? "border-line bg-card hover:bg-raised"
                      : "border-accent/50 bg-accent/5 hover:bg-accent/10"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-line" : item.urgent ? "bg-bad" : "bg-accent"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-2">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    {item.urgent && !item.closed ? (
                      <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-bad">긴급</span>
                    ) : null}
                    {item.closed ? (
                      <span className="rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-3">조치 완료</span>
                    ) : null}
                    <span className="text-xs font-semibold text-fg">{item.title}</span>
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 block truncate text-xs text-fg-3">{item.detail}</span>
                  ) : null}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] tabular-nums text-fg-3">
                  {relativeTime(item.createdAt, referenceNow)}
                  <ExternalLink size={11} aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
