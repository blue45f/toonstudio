import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { formatProductionDday } from "./production-format";
import {
  deriveDashboardEpisodes,
  deriveDashboardNextStep,
  deriveDashboardProgress,
} from "./production-project-dashboard-model";
import { productionEpisodeRoomPath, productionSurfacePath } from "./production-project-surfaces";
import { ProductionPill } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 프로젝트 셸 공통 현황 스트립.
 *
 * 어느 표면에 들어와도 첫 화면에서 "지금 무슨 상황이고 다음에 뭘 하나"가 읽히도록,
 * 개요 대시보드가 이미 계산하는 값(진행률·막힌 작업·검수 대기·가장 급한 회차·다음 행동)을
 * 셸 헤더 아래 한 줄로 요약한다. 새 상태를 만들지 않고 aggregate 파생만 쓴다 —
 * 값이 없으면(작업 0건) 없는 대로 표시하고 현황을 지어내지 않는다.
 */
export function ProductionProjectStatusStrip({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const bt = useBilingual("ProductionProjectStatusStrip");
  const snapshot = useMemo(() => {
    const now = new Date();
    const progress = deriveDashboardProgress(aggregate);
    return {
      progress,
      urgentEpisode: deriveDashboardEpisodes(aggregate, now)[0] ?? null,
      nextStep: deriveDashboardNextStep(aggregate, progress, now),
    };
  }, [aggregate]);
  const { progress, urgentEpisode, nextStep } = snapshot;
  const projectId = aggregate.projectId;
  const empty = progress.total === 0;

  const nextAction = (() => {
    switch (nextStep.kind) {
      case "answer-question":
        return {
          label: bt("막힌 질문에 답하기", "Answer the blocking question"),
          href: productionEpisodeRoomPath(projectId, nextStep.episodeId),
        };
      case "overdue":
        return {
          label: bt(`기한 지난 작업 ${nextStep.count}건 보기`, `See ${nextStep.count} overdue tasks`),
          href: productionSurfacePath(projectId, "production", "boardFocus=overdue"),
        };
      case "review":
        return {
          label: bt(`검수 대기 ${nextStep.count}건 확인`, `Check ${nextStep.count} reviews waiting`),
          href: productionSurfacePath(projectId, "review"),
        };
      case "board":
        return empty
          ? { label: bt("공정 보드에서 시작하기", "Start on the board"), href: productionSurfacePath(projectId, "production") }
          : { label: bt("공정 보드 열기", "Open the board"), href: productionSurfacePath(projectId, "production") };
    }
  })();

  return (
    <section
      aria-label={bt("프로젝트 현황", "Project status")}
      data-production-status-strip=""
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {empty ? (
        <span className="text-xs font-semibold text-fg-2">{bt("아직 등록된 작업이 없어요", "No tasks yet")}</span>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="text-xs font-bold text-fg">{bt("진행률", "Progress")}</span>
          <span
            className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-raised sm:w-32"
            role="progressbar"
            aria-label={bt("전체 작업 진행률", "Overall task progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span className="block h-full rounded-full bg-accent" style={{ width: `${progress.percent}%` }} />
          </span>
          <span className="text-xs text-fg-2">
            {progress.percent}% · {bt(`${progress.completed}/${progress.total} 완료`, `${progress.completed}/${progress.total} done`)}
          </span>
        </span>
      )}
      {progress.blocked > 0 ? (
        <ProductionPill tone="warning">{bt(`막힌 작업 ${progress.blocked}`, `${progress.blocked} blocked`)}</ProductionPill>
      ) : null}
      {progress.inReview > 0 ? (
        <ProductionPill tone="accent">{bt(`검수 대기 ${progress.inReview}`, `${progress.inReview} in review`)}</ProductionPill>
      ) : null}
      {urgentEpisode ? (
        <Link
          className="inline-flex min-h-6 max-w-full items-center gap-1 text-xs font-semibold text-fg-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
          to={productionEpisodeRoomPath(projectId, urgentEpisode.episodeId)}
        >
          <span className="shrink-0 text-fg-3">{bt("가장 급한 회차", "Most urgent")}</span>
          <span className="truncate">{urgentEpisode.title}</span>
          {urgentEpisode.daysUntilRelease !== null ? (
            <span className="shrink-0 text-accent">{formatProductionDday(urgentEpisode.daysUntilRelease, bt)}</span>
          ) : null}
        </Link>
      ) : null}
      <span className="ms-auto inline-flex items-center gap-2">
        <span className="hidden text-[0.6875rem] font-black uppercase tracking-[0.14em] text-fg-3 sm:inline">
          {bt("지금 할 일", "Next up")}
        </span>
        <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to={nextAction.href}>
          {nextAction.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </span>
    </section>
  );
}
