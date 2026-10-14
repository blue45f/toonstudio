/**
 * 회차 파이프라인 진행 레일 — 순수 모델 (작업 흐름 연속성 레인).
 *
 * 입력은 단계 도출 정본 `deriveEpisodeStageStates`의 결과(EpisodeStageState[])뿐이다.
 * 이 모델은 새 상태를 만들지 않는다:
 * - segments는 입력 상태를 EPISODE_STAGES 순서로 정렬한 것뿐이다. 입력에 없는
 *   단계는 상태를 지어내지 않고 "unknown(확인 불가)"으로만 채운다.
 * - nextAction은 단계 정의 정본(EPISODE_STAGES)의 primaryAction을 그대로 쓴다.
 * - transitionNote는 고정 문구 테이블에서만 고른다. 현재 단계의 바로 앞 단계가
 *   done일 때만 경계 문구를 만들고, 근거가 없으면 null이다.
 * - progressDetail(예: "컷 32/45")은 호출자가 근거와 함께 넘길 때만 통과시킨다.
 *
 * 단계는 게이트가 아니다. 이 모델도, 이 모델을 그리는 레일도 어떤 단계를
 * 잠그거나 비활성화하지 않는다.
 */
import type { BilingualLabel } from "./production-labels";
import type { EpisodeStageState, EpisodeStageStatus } from "./production-episode-stage";
import {
  EPISODE_STAGES,
  productionEpisodeRoomPath,
  productionSurfacePath,
  type EpisodeStageId,
  type ProductionSurfaceTarget,
} from "./production-project-surfaces";

export interface EpisodePipelineRailSegment {
  readonly id: EpisodeStageId;
  readonly label: BilingualLabel;
  readonly status: EpisodeStageStatus;
}

export interface EpisodePipelineRailCurrent {
  readonly stageId: EpisodeStageId;
  readonly label: BilingualLabel;
  readonly status: EpisodeStageStatus;
}

export interface EpisodePipelineRailTransitionNote {
  /** 시작 안내(plan이 첫 단계인 경우)만 null이다. */
  readonly fromStageId: EpisodeStageId | null;
  readonly toStageId: EpisodeStageId;
  readonly text: BilingualLabel;
}

export interface EpisodePipelineRail {
  readonly segments: readonly EpisodePipelineRailSegment[];
  readonly current: EpisodePipelineRailCurrent | null;
  readonly nextAction: { readonly label: BilingualLabel; readonly target: ProductionSurfaceTarget } | null;
  readonly transitionNote: EpisodePipelineRailTransitionNote | null;
  /** 호출자가 근거와 함께 제공한 경우만 값이 있다. 제공하지 않으면 null. */
  readonly progressDetail: string | null;
}

/**
 * 경계 문구 고정 테이블. 키는 "방금 끝난 단계 → 지금 단계"다.
 * 문구는 "{끝난 단계}을 마쳤어요. 이제 {지금 단계}를 시작해 보세요" 패턴을
 * 따르되, 게시→운영만 독자 반응 확인으로 말한다(게시 뒤의 일은 제작이 아니라
 * 반응 확인이기 때문이다).
 */
const TRANSITION_TEXT: Readonly<Partial<Record<EpisodeStageId, Readonly<Partial<Record<EpisodeStageId, BilingualLabel>>>>>> = Object.freeze({
  plan: Object.freeze({
    storyboard: { ko: "기획을 마쳤어요. 이제 콘티를 시작해 보세요", en: "Planning is done. Now start the storyboard." },
  }),
  storyboard: Object.freeze({
    art: { ko: "콘티를 마쳤어요. 이제 작화를 시작해 보세요", en: "Storyboard is done. Now start the artwork." },
  }),
  art: Object.freeze({
    lettering: { ko: "작화를 마쳤어요. 이제 식자·연출을 시작해 보세요", en: "Artwork is done. Now start lettering." },
  }),
  lettering: Object.freeze({
    review: { ko: "식자·연출을 마쳤어요. 이제 검수를 시작해 보세요", en: "Lettering is done. Now start the review." },
  }),
  review: Object.freeze({
    publish: { ko: "검수를 마쳤어요. 이제 게시해 보세요", en: "Review is done. Now publish this episode." },
  }),
  publish: Object.freeze({
    operate: { ko: "게시했어요. 이제 독자 반응을 확인해 보세요", en: "Published. Now check how readers respond." },
  }),
});

/** 첫 시작 안내. plan이 현재 단계이고 앞 단계가 없을 때만 쓴다. */
const START_NOTE_TEXT: BilingualLabel = Object.freeze({
  ko: "기획부터 시작해 보세요",
  en: "Start with planning.",
});

function primaryActionOf(stageId: EpisodeStageId) {
  return EPISODE_STAGES.find((stage) => stage.id === stageId)?.primaryAction ?? null;
}

export function buildEpisodePipelineRail(
  states: readonly EpisodeStageState[],
  options?: { readonly progressDetail?: string },
): EpisodePipelineRail {
  const byId = new Map<EpisodeStageId, EpisodeStageState>(states.map((state) => [state.id, state] as const));
  const segments: readonly EpisodePipelineRailSegment[] = EPISODE_STAGES.map((stage) => {
    const state = byId.get(stage.id);
    return {
      id: stage.id,
      label: state?.label ?? stage.label,
      status: state?.status ?? "unknown",
    };
  });

  const currentSegment = segments.find((segment) => segment.status === "current") ?? null;
  const current: EpisodePipelineRailCurrent | null = currentSegment
    ? { stageId: currentSegment.id, label: currentSegment.label, status: currentSegment.status }
    : null;

  // 다음 행동: 지금 단계가 있으면 그 단계의 주 행동. 지금 단계가 없는데 게시까지
  // 끝났으면 운영의 주 행동(게시 뒤에 할 일). 그 외에는 지어내지 않는다 —
  // 전부 unknown인 회차에서는 특히 그렇다.
  let nextAction: EpisodePipelineRail["nextAction"] = null;
  if (current) {
    nextAction = primaryActionOf(current.stageId);
  } else if (segments.find((segment) => segment.id === "publish")?.status === "done") {
    nextAction = primaryActionOf("operate");
  }

  // 전환 문구: 지금 단계의 바로 앞 단계가 done일 때만 경계 문구를 만든다.
  // plan이 지금 단계이면 앞 단계가 없으므로 시작 안내가 대신한다.
  let transitionNote: EpisodePipelineRailTransitionNote | null = null;
  if (current) {
    const currentIndex = EPISODE_STAGES.findIndex((stage) => stage.id === current.stageId);
    if (currentIndex === 0) {
      transitionNote = { fromStageId: null, toStageId: current.stageId, text: START_NOTE_TEXT };
    } else if (currentIndex > 0) {
      const previous = segments[currentIndex - 1];
      if (previous && previous.status === "done") {
        const text = TRANSITION_TEXT[previous.id]?.[current.stageId];
        if (text) transitionNote = { fromStageId: previous.id, toStageId: current.stageId, text };
      }
    }
  }

  return {
    segments,
    current,
    nextAction,
    transitionNote,
    progressDetail: options?.progressDetail ?? null,
  };
}

/**
 * target → href 기본 해석기. 프로젝트 내비(ProductionProjectNav의
 * StagePrimaryActionLink)와 같은 규칙이다 — 내비는 이 변환을 내보내지 않아
 * 여기에 같은 규칙으로 둔다:
 * - surface: productionSurfacePath(projectId, surface, query)
 * - path: 경로 그대로
 * - episode-room: 회차 id를 아는 표면(회차 룸 레일)이면 회차 룸 경로,
 *   모르면 내비와 같은 폴백인 회차 표면 경로.
 */
export function episodePipelineTargetHref(
  target: ProductionSurfaceTarget,
  context: { readonly projectId: string; readonly episodeId?: string | null },
): string {
  switch (target.kind) {
    case "surface":
      return productionSurfacePath(context.projectId, target.surface, target.query);
    case "path":
      return target.path;
    case "episode-room":
      return context.episodeId
        ? productionEpisodeRoomPath(context.projectId, context.episodeId)
        : productionSurfacePath(context.projectId, "episodes");
  }
}
