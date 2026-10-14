/**
 * 검수 핀 할 일 인박스 섹션 — 동기화된 핀 할 일만 모아 보여 준다.
 *
 * 할 일 자체는 ProductionWorkspace.tasks에 일반 할 일과 함께 살고 통합
 * 작업함(역할 인박스)에도 그대로 노출된다. 이 섹션은 그중 검수 핀에서 온
 * 일만 골라 "어떤 핀이 아직 열려 있는지"를 담당자별로 보여 주는 전용
 * 모아보기다. 표시는 모델 요약(summarizePinTasks)이 맡고, 이 컴포넌트는
 * 그리기와 콜백만 맡는다 — 완료 처리는 핀을 해결하는 검수 동선이 하고
 * (해결되면 동기화가 할 일을 자동 완료한다), 이 섹션에서 직접 닫지 않는다.
 *
 * - 긴급 핀은 칩으로 구분해 승인 게이트를 막는 일부터 눈에 들어오게 한다.
 * - 핀 할 일이 없으면 섹션 자체를 그리지 않는다(빈 껍데기 금지).
 *   로딩·에러는 호스트가 명시적으로 요청했을 때만 그린다.
 */
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { ProductionTask } from "../studio-production/studio-production-workspace";
import {
  collectOpenPinTasks,
  summarizePinTasks,
} from "./pin-task-sync-model";

function formatDue(due: string): string | null {
  const timestamp = Date.parse(due);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

export interface PinTaskInboxSectionProps {
  /** 워크스페이스의 전체 할 일. 검수 핀 할 일만 골라 그린다. */
  readonly tasks: readonly ProductionTask[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  /** 할 일을 눌렀을 때 호스트가 해당 핀이 있는 검수 화면으로 이동시킨다. 없으면 버튼으로 그리지 않는다. */
  readonly onOpenTask?: (task: ProductionTask) => void;
}

export function PinTaskInboxSection({
  tasks,
  loading,
  error,
  onRetry,
  onOpenTask,
}: PinTaskInboxSectionProps) {
  const bt = useBilingual("PinTaskInboxSection");
  const summary = summarizePinTasks(tasks);
  const open = collectOpenPinTasks(tasks);

  if (loading) {
    return (
      <section aria-label={bt("미해결 검수 핀", "Open review pins")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-3 space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-panel" />
          <div className="h-14 animate-pulse rounded-xl bg-panel" />
        </div>
        <p className="mt-3 text-xs text-fg-3">{bt("미해결 핀을 불러오고 있어요.", "Loading open pins.")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={bt("미해결 검수 핀", "Open review pins")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-bold text-fg">{bt("미해결 핀을 불러오지 못했어요.", "Couldn't load open pins.")}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }

  // 핀 할 일이 하나도 없으면(전부 해결 포함) 섹션을 그리지 않는다.
  if (summary.openCount === 0 && summary.resolvedCount === 0) return null;

  return (
    <section aria-label={bt("미해결 검수 핀", "Open review pins")} className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{bt("미해결 검수 핀", "Open review pins")}</p>
        {summary.urgentOpenCount > 0 ? (
          <span className="text-xs font-bold text-fg-2">
            {bt(
              `필수 수정 핀 ${summary.urgentOpenCount}개가 승인을 막고 있어요`,
              `${summary.urgentOpenCount} required-fix pin(s) blocking approval`,
            )}
          </span>
        ) : summary.openCount > 0 ? (
          <span className="text-xs text-fg-3">
            {bt("필수 수정은 없고, 확인할 핀만 남았어요", "No required fixes — only pins to check")}
          </span>
        ) : (
          <span className="text-xs font-bold text-fg-2">{bt("핀이 모두 해결됐어요", "All pins are resolved")}</span>
        )}
        <span className="ml-auto text-xs text-fg-3">
          {bt(`열림 ${summary.openCount} · 해결 ${summary.resolvedCount}`, `${summary.openCount} open · ${summary.resolvedCount} resolved`)}
        </span>
      </div>

      {open.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {open.map((task) => {
            const dueLabel = formatDue(task.due);
            const urgent = task.priority === "urgent";
            const body = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.7rem]",
                    urgent
                      ? "border-accent bg-accent-soft font-bold text-fg"
                      : "border-line bg-card text-fg-2",
                  )}>
                    {urgent ? bt("필수 수정 핀", "Required-fix pin") : bt("검수 핀", "Review pin")}
                  </span>
                  <p className="min-w-0 flex-1 break-words text-sm font-bold text-fg">{task.title}</p>
                </div>
                <p className="mt-1 text-xs text-fg-3">
                  {task.owner
                    ? bt(`담당 ${task.owner}`, `Owner ${task.owner}`)
                    : bt("담당자 미정", "Unassigned")}
                  {dueLabel ? ` · ${bt(`기한 ${dueLabel}`, `Due ${dueLabel}`)}` : ""}
                  {task.status === "doing"
                    ? ` · ${bt("진행 중", "In progress")}`
                    : task.status === "blocked"
                      ? ` · ${bt("차단됨", "Blocked")}`
                      : ""}
                </p>
              </>
            );
            return (
              <li key={task.id} className="rounded-xl border border-line bg-panel p-3">
                {onOpenTask ? (
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="block w-full text-left"
                    aria-label={task.title}
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {summary.groups.length > 1 ? (
        <p className="mt-3 text-xs leading-5 text-fg-3">
          {bt(
            `담당자별 열림: ${summary.groups.map((group) => `${group.label || "담당자 미정"} ${group.tasks.length}`).join(" · ")}`,
            `Open by owner: ${summary.groups.map((group) => `${group.label || "Unassigned"} ${group.tasks.length}`).join(" · ")}`,
          )}
        </p>
      ) : null}
    </section>
  );
}
