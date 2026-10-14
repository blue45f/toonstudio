import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  buildStageDeadlinePlan,
  type EpisodeReleaseSource,
  type StageDeadlineBufferLevel,
  type StageDeadlineStatus,
} from "./production-stage-deadline-plan";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const RELEASE_SOURCE_LABELS: Readonly<Record<EpisodeReleaseSource, string>> = {
  "release-plan": "게시 캘린더 예약 기준",
  "episode-plan": "회차 게시 계획 기준",
  "publication-task": "게시 작업 마감 기준",
  none: "게시 일정 없음",
};

const STAGE_STATUS_LABELS: Readonly<Record<StageDeadlineStatus, string>> = {
  done: "완료",
  overdue: "권장 마감 지남",
  "due-soon": "권장 마감 임박",
  upcoming: "예정",
  unplanned: "일정 미정",
};

const STAGE_STATUS_STYLES: Readonly<Record<StageDeadlineStatus, string>> = {
  done: "border-good/35 bg-good/10 text-good",
  overdue: "border-bad/40 bg-bad/10 text-bad",
  "due-soon": "border-warn/40 bg-warn/10 text-warn",
  upcoming: "border-line bg-raised text-fg-2",
  unplanned: "border-line bg-raised text-fg-3",
};

const BUFFER_STYLES: Readonly<Record<StageDeadlineBufferLevel, string>> = {
  ready: "border-good/35 bg-good/10",
  safe: "border-cool/35 bg-cool/10",
  tight: "border-warn/40 bg-warn/10",
  exhausted: "border-bad/40 bg-bad/10",
  unplanned: "border-line bg-panel",
};

const DATE_LABEL = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });

function formatDate(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_LABEL.format(date) : "미정";
}

function relativeDays(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘";
  return `D-${days}`;
}

/**
 * 회차 카드의 게시 역산 일정: 게시 캘린더에서 온 게시일을 기준으로 단계별
 * 권장 마감과 버퍼 경고를 보여 준다. 계획이 없으면(게시 완료·회차 없음)
 * 아무것도 그리지 않는다.
 */
export function ProductionStageDeadlinePlan({
  aggregate,
  episodeId,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
}) {
  const plan = useMemo(
    () => buildStageDeadlinePlan(aggregate, episodeId),
    [aggregate, episodeId],
  );
  if (!plan) return null;
  const warning = plan.bufferLevel === "exhausted" || plan.bufferLevel === "tight";
  const scheduleHref = `/production/projects/${encodeURIComponent(aggregate.projectId)}/schedule`;

  return (
    <section aria-label="게시 역산 일정" className={cn("mt-3 rounded-xl border p-3", BUFFER_STYLES[plan.bufferLevel])}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <CalendarClock className="size-3.5 text-fg-3" aria-hidden="true" />
          게시 역산 일정
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.625rem] font-bold text-fg-2">
            {RELEASE_SOURCE_LABELS[plan.releaseSource]}
          </span>
        </p>
        <div className="flex items-center gap-2">
          {plan.bufferDays !== null ? (
            <span className={cn("text-xs font-black", warning ? "text-warn" : "text-fg")}>
              버퍼 {plan.bufferDays}일
            </span>
          ) : null}
          <Link className={buttonClass({ variant: "outline", size: "sm" })} to={scheduleHref}>
            제작 캘린더에서 보기 <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {plan.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2" role={warning ? "alert" : undefined}>
          {plan.warnings.map((message) => (
            <li key={message} className="flex gap-2">
              {warning
                ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
                : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />}
              <span>{message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {plan.stages.map((stage) => (
          <li
            key={stage.processKey}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/70 px-2.5 py-2",
              stage.status === "overdue" && "border-bad/40",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-fg">{stage.label}</p>
              <p className="mt-0.5 text-[0.6875rem] text-fg-3">
                권장 {formatDate(stage.recommendedDueAt)}
                {stage.daysUntilRecommended !== null && !stage.done ? ` · ${relativeDays(stage.daysUntilRecommended)}` : ""}
                {stage.driftDays !== null && stage.driftDays !== 0
                  ? ` · 계획 ${formatDate(stage.plannedDueAt)}`
                  : ""}
              </p>
            </div>
            <span className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-bold",
              STAGE_STATUS_STYLES[stage.status],
            )}>
              {STAGE_STATUS_LABELS[stage.status]}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
