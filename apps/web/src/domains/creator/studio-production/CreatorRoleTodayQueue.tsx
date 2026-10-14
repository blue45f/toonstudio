import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Hourglass,
  Sunrise,
} from "lucide-react";
import { useMemo } from "react";

import {
  buildRoleTodayQueue,
  PRODUCTION_ROLE_LABELS,
  type RoleTodayQueueItem,
} from "./creator-role-today-queue";
import type {
  ProductionRole,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { cn } from "@/shared/lib/utils";

const BLOCKER_STATUS_LABELS: Readonly<Record<string, string>> = {
  todo: "시작 전",
  doing: "진행 중",
  blocked: "차단",
  done: "완료",
};

function formatDue(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function DueTodayCard({ item }: { readonly item: RoleTodayQueueItem }) {
  const { task } = item;
  const overdue = item.dueKind === "overdue";
  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border p-3",
        overdue ? "border-bad/30 bg-bad/5" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="break-words text-sm font-bold text-fg">{task.title}</h4>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-1 text-[0.65rem] font-bold",
            overdue
              ? "border-bad/30 bg-bad/10 text-bad"
              : "border-accent/30 bg-accent-soft text-accent",
          )}
        >
          {overdue ? `마감 ${item.overdueDays}일 지남` : "오늘 마감"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-fg-3">
        {task.role ? <span>{PRODUCTION_ROLE_LABELS[task.role]}</span> : null}
        {task.owner ? <span>{task.owner}</span> : null}
        {task.status === "doing" ? <span>진행 중</span> : null}
      </div>
      {task.blockedReason?.trim() ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-bad">
          <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {task.blockedReason}
        </p>
      ) : null}
    </article>
  );
}

function WaitingCard({ item }: { readonly item: RoleTodayQueueItem }) {
  const { task } = item;
  const dueLabel = formatDue(task.due || null);
  return (
    <article className="min-w-0 rounded-xl border border-warn/30 bg-warn/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="break-words text-sm font-bold text-fg">{task.title}</h4>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warn/35 bg-warn/10 px-2 py-1 text-[0.65rem] font-bold text-warn">
          <Hourglass size={11} aria-hidden="true" />
          대기 중
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-fg-3">
        {task.role ? <span>{PRODUCTION_ROLE_LABELS[task.role]}</span> : null}
        {dueLabel ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={12} aria-hidden="true" />
            내 마감 {dueLabel}
          </span>
        ) : null}
      </div>
      {item.waitingSummary ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-5 text-warn">
          <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {item.waitingSummary}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.blockers.map((blocker) => (
          <span
            key={blocker.taskId}
            className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.65rem] font-semibold text-fg-2"
          >
            {blocker.kind === "missing"
              ? "앞 공정 정보 없음"
              : `${blocker.title} · ${blocker.status ? BLOCKER_STATUS_LABELS[blocker.status] ?? blocker.status : ""}${blocker.overdueDays > 0 ? ` · ${blocker.overdueDays}일 지남` : ""}`}
          </span>
        ))}
      </div>
    </article>
  );
}

/**
 * 역할별 오늘 큐 (REPORT T-4): 과제 인박스 상단에서, 내 역할·담당 공정 기준으로
 * "오늘 마감"과 "앞 공정을 기다리는 중"을 한 화면에 나눠 보여 준다.
 * 대기 항목에는 어느 앞 공정이 어떤 상태로 늦고 있는지가 사유로 붙는다.
 */
export function CreatorRoleTodayQueue({
  workspace,
  currentUserId,
  activeRoles,
}: {
  readonly workspace: ProductionWorkspace;
  readonly currentUserId: string | null | undefined;
  readonly activeRoles: readonly ProductionRole[];
}) {
  const queue = useMemo(
    () => buildRoleTodayQueue({ workspace, currentUserId, activeRoles }),
    [activeRoles, currentUserId, workspace],
  );
  const empty = queue.dueToday.length === 0 && queue.waiting.length === 0;

  return (
    <section
      className="rounded-2xl border border-line bg-card p-4 shadow-sm"
      aria-labelledby="creator-role-today-queue-title"
      data-testid="creator-role-today-queue"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Sunrise className="size-4" aria-hidden="true" />
            <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">TODAY QUEUE</p>
          </div>
          <h2 id="creator-role-today-queue-title" className="mt-1 text-sm font-black text-fg">
            오늘 내 작업 큐
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            내 역할 기준으로 오늘 마감인 작업과, 앞 공정이 늦어 기다리는 작업을 나눠 보여 줍니다. 대기 사유는 앞 공정의 실제 상태에서 가져옵니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {activeRoles.map((role) => (
            <span
              key={role}
              className="inline-flex min-h-7 items-center rounded-full border border-accent/30 bg-accent-soft px-2.5 text-xs font-black text-accent"
            >
              {PRODUCTION_ROLE_LABELS[role]}
            </span>
          ))}
          <span className="inline-flex min-h-7 items-center rounded-full border border-line bg-panel px-2.5 text-xs font-black text-fg-2">
            오늘 마감 {queue.dueToday.length}건 · 대기 {queue.waiting.length}건
          </span>
        </div>
      </header>

      {empty ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-5 text-center">
          <CheckCircle2 className="mx-auto size-7 text-good" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-fg">오늘 마감인 내 작업이 없습니다.</p>
          <p className="mt-1 text-xs text-fg-3">앞 공정을 기다리는 작업도 없습니다. 아래 인박스에서 다음 작업을 확인하세요.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {queue.dueToday.length > 0 ? (
            <div>
              <h3 className="text-xs font-black text-fg">오늘 마감</h3>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {queue.dueToday.map((item) => (
                  <DueTodayCard key={item.task.id} item={item} />
                ))}
              </div>
            </div>
          ) : null}
          {queue.waiting.length > 0 ? (
            <div>
              <h3 className="text-xs font-black text-fg">앞 공정을 기다리는 중</h3>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {queue.waiting.map((item) => (
                  <WaitingCard key={item.task.id} item={item} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
