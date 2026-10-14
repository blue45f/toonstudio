/**
 * 게이트 후속 작업 인박스 섹션 — 동기화된 게이트 후속 할 일만 모아 보여 준다.
 *
 * 할 일 자체는 ProductionWorkspace.tasks에 일반 할 일과 함께 살고 통합
 * 작업함(역할 인박스)에도 그대로 노출된다. 이 섹션은 그중 게이트에서 온
 * 일만 골라 "무엇이 단계 완료를 막고 있는지"를 종류별로 보여 주는 전용
 * 모아보기다. 표시는 모델 요약(summarizeGateFollowUpTasks)이 맡고,
 * 이 컴포넌트는 그리기와 콜백만 맡는다 — 완료 처리는 워크스페이스의
 * 일반 할 일 동선(호스트)이 하고, 조건 할 일도 같은 동선으로 닫는다.
 *
 * - 막는 일(반려 재작업·재검토 요청)과 확인 일(조건)을 문장으로 구분한다.
 * - 게이트 후속 할 일이 없으면 섹션 자체를 그리지 않는다(빈 껍데기 금지).
 *   로딩·에러는 호스트가 명시적으로 요청했을 때만 그린다.
 */
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { ProductionTask } from "../studio-production/studio-production-workspace";
import {
  GATE_FOLLOWUP_KIND_LABELS,
  collectOpenGateFollowUpTasks,
  gateFollowUpKindFromTaskId,
  summarizeGateFollowUpTasks,
} from "./gate-followup-task-sync-model";

const KIND_CHIP_CLASS: Readonly<Record<string, string>> = Object.freeze({
  "rejection-rework": "border-line bg-card font-bold text-fg",
  "rereview-request": "border-accent bg-accent-soft font-bold text-fg",
  condition: "border-line bg-panel text-fg-2",
});

function formatDue(due: string, ko: boolean): string | null {
  const timestamp = Date.parse(due);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

export interface GateFollowUpInboxSectionProps {
  /** 워크스페이스의 전체 할 일. 게이트 후속 할 일만 골라 그린다. */
  readonly tasks: readonly ProductionTask[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  /** 할 일을 눌렀을 때 호스트가 게이트 패널·해당 단계로 이동시킨다. 없으면 버튼으로 그리지 않는다. */
  readonly onOpenTask?: (task: ProductionTask) => void;
}

export function GateFollowUpInboxSection({
  tasks,
  loading,
  error,
  onRetry,
  onOpenTask,
}: GateFollowUpInboxSectionProps) {
  const bt = useBilingual("GateFollowUpInboxSection");
  const summary = summarizeGateFollowUpTasks(tasks);
  const open = collectOpenGateFollowUpTasks(tasks);

  if (loading) {
    return (
      <section aria-label={bt("게이트 후속 작업", "Gate follow-ups")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-3 space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-panel" />
          <div className="h-14 animate-pulse rounded-xl bg-panel" />
        </div>
        <p className="mt-3 text-xs text-fg-3">{bt("후속 작업을 불러오고 있어요.", "Loading follow-ups.")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={bt("게이트 후속 작업", "Gate follow-ups")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-bold text-fg">{bt("후속 작업을 불러오지 못했어요.", "Couldn't load follow-ups.")}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }

  // 게이트 후속 할 일이 하나도 없으면(전부 해소 포함) 섹션을 그리지 않는다.
  if (summary.openCount === 0 && summary.resolvedCount === 0) return null;

  return (
    <section aria-label={bt("게이트 후속 작업", "Gate follow-ups")} className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{bt("게이트 후속 작업", "Gate follow-ups")}</p>
        {summary.blockingOpenCount > 0 ? (
          <span className="text-xs font-bold text-fg-2">
            {bt(
              `단계 완료를 막는 일 ${summary.blockingOpenCount}개`,
              `${summary.blockingOpenCount} item(s) blocking stage completion`,
            )}
          </span>
        ) : summary.openCount > 0 ? (
          <span className="text-xs text-fg-3">
            {bt("막는 일은 없고, 확인할 조건만 남았어요", "Nothing blocking — only conditions to confirm")}
          </span>
        ) : (
          <span className="text-xs font-bold text-fg-2">{bt("후속 작업이 모두 끝났어요", "All follow-ups are done")}</span>
        )}
        <span className="ml-auto text-xs text-fg-3">
          {bt(`열림 ${summary.openCount} · 완료 ${summary.resolvedCount}`, `${summary.openCount} open · ${summary.resolvedCount} done`)}
        </span>
      </div>

      {open.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {open.map((task) => {
            const kind = gateFollowUpKindFromTaskId(task.id);
            const kindLabel = kind ? GATE_FOLLOWUP_KIND_LABELS[kind] : null;
            const dueLabel = formatDue(task.due, true);
            const body = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {kindLabel ? (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[0.7rem]", kind ? KIND_CHIP_CLASS[kind] : "")}>
                      {bt(kindLabel.ko, kindLabel.en)}
                    </span>
                  ) : null}
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
                {kind === "condition" ? (
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {bt("조건은 자동으로 닫히지 않아요. 충족을 확인하면 할 일을 완료로 표시해 주세요.", "Conditions don't close on their own — mark the task done once you've confirmed it.")}
                  </p>
                ) : null}
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
