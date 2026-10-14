/**
 * 회차 파이프라인 진행 레일 — 상시 표시 UI (작업 흐름 연속성 레인).
 *
 * 회차 룸 상단(헤더 직하)에 sticky로 붙어, 사용자가 본문 어디에 있든
 * "지금 어느 단계이고, 방금 무엇을 끝냈고, 다음에 무엇을 하면 되는지"를
 * 한 줄로 계속 보여 준다. 표시 어휘·시각 토큰은 단계 스텝퍼 정본
 * (shared/components/episode-stage-stepper)과 제작 허브 기존 어휘를 따른다:
 * 상태 문구는 done="끝남"·current="지금 여기"·todo="남음"·unknown="확인 불가"
 * (EPISODE_STAGE_STATUS_TEXT 재사용), 현재 단계만 border-accent·bg-accent-soft.
 *
 * 단계는 게이트가 아니다: 어떤 구간도 링크를 막거나 비활성화하지 않고
 * 상태만 말한다. 다음 행동 버튼은 단계 정의의 primaryAction 링크 하나뿐이다.
 * 전부 unknown이면 구간만 중립으로 그리고 버튼·전환 문구는 그리지 않는다
 * (근거 없이 다음 행동을 지어내지 않는다 — 모델이 이미 null을 돌려준다).
 */
import { Link } from "react-router-dom";

import type { EpisodeStageState } from "./production-episode-stage";
import {
  buildEpisodePipelineRail,
  episodePipelineTargetHref,
} from "./episode-pipeline-rail-model";
import type { ProductionSurfaceTarget } from "./production-project-surfaces";

import { EPISODE_STAGE_STATUS_TEXT } from "@/shared/components/episode-stage-stepper";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface EpisodePipelineProgressRailProps {
  readonly states: readonly EpisodeStageState[];
  readonly projectId: string;
  /** 회차 룸처럼 회차를 아는 표면에서만 넘긴다. episode-room 대상 해석에 쓴다. */
  readonly episodeId?: string | null;
  /** 진척 한 줄(예: "컷 32/45"). 도출 근거가 있을 때만 넘긴다. */
  readonly progressDetail?: string;
  /** target → href 변환을 표면이 직접 정할 때만 넘긴다. 기본은 내비와 같은 규칙의 모델 해석기. */
  readonly hrefForTarget?: (target: ProductionSurfaceTarget) => string;
}

export function EpisodePipelineProgressRail({
  states,
  projectId,
  episodeId,
  progressDetail,
  hrefForTarget,
}: EpisodePipelineProgressRailProps) {
  const bt = useBilingual("EpisodePipelineProgressRail");
  const rail = buildEpisodePipelineRail(states, { progressDetail });
  const nextHref = rail.nextAction
    ? hrefForTarget
      ? hrefForTarget(rail.nextAction.target)
      : episodePipelineTargetHref(rail.nextAction.target, { projectId, episodeId })
    : null;

  return (
    <div
      data-episode-pipeline-rail="true"
      className="sticky top-0 z-10 rounded-2xl border border-line bg-card/95 p-3 shadow-sm backdrop-blur"
    >
      <ol
        aria-label={bt("회차 진행 단계", "Episode progress stages")}
        className="flex flex-wrap items-center gap-1.5"
      >
        {rail.segments.map((segment) => (
          <li
            key={segment.id}
            aria-current={segment.status === "current" ? "step" : undefined}
            className={cn(
              "flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs",
              segment.status === "current"
                ? "border-accent bg-accent-soft font-black text-fg"
                : "border-line bg-card text-fg-3",
            )}
          >
            <span>{bt(segment.label.ko, segment.label.en)}</span>
            <span>
              {bt(
                EPISODE_STAGE_STATUS_TEXT[segment.status].ko,
                EPISODE_STAGE_STATUS_TEXT[segment.status].en,
              )}
            </span>
          </li>
        ))}
      </ol>

      {rail.current || rail.transitionNote || (rail.nextAction && nextHref) ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {rail.current ? (
            <p className="text-xs font-bold text-fg">
              {bt(`${rail.current.label.ko} 단계`, `${rail.current.label.en} stage`)}
              <span className="ml-1.5 font-normal text-fg-3">
                {bt(
                  EPISODE_STAGE_STATUS_TEXT[rail.current.status].ko,
                  EPISODE_STAGE_STATUS_TEXT[rail.current.status].en,
                )}
              </span>
              {rail.progressDetail ? <span className="ml-1.5 font-normal text-fg-3">{rail.progressDetail}</span> : null}
            </p>
          ) : null}
          {rail.transitionNote ? (
            <p className="text-xs leading-5 text-fg-2">{bt(rail.transitionNote.text.ko, rail.transitionNote.text.en)}</p>
          ) : null}
          {rail.nextAction && nextHref ? (
            <Link
              to={nextHref}
              className={buttonClass({ size: "sm", className: "ml-auto min-h-11" })}
            >
              {bt(rail.nextAction.label.ko, rail.nextAction.label.en)}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
