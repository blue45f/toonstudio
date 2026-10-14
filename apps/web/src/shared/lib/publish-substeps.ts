/**
 * 게시 내부 절차 모델 (BLUEPRINT S2-4).
 *
 * 게시 명령 센터(/studio/publish)의 3개 절차 — 원고 · 게시 설정 · 최종 확인 — 는
 * 회차 7단계 중 "게시" 단계 하나의 내부 절차다. 그런데 명령 센터가 이 절차를
 * "게시 3단계 중 n단계"라고 말하면 게시 자체가 회차 단계와 같은 층위의
 * 3단계로 읽혀, 프로젝트 개요 스텝퍼의 "게시 단계"와 충돌한다.
 * 그래서 이 절차의 위치 표기는 하나로 고정한다: "게시 단계 안의 n/3".
 *
 * 절차 id·라벨·설명은 명령 센터의 실측(COMMAND_STEPS)과 동일하게 유지한다.
 * 상태 어휘는 회차 단계와 같은 4개(done/current/todo/unknown)만 쓴다.
 */
import type { EpisodeStageStatus } from "@/shared/components/episode-stage-stepper";

export type PublishSubstepId = "content" | "distribution" | "review";

export interface PublishSubstepDefinition {
  readonly id: PublishSubstepId;
  readonly label: { readonly ko: string; readonly en: string };
  readonly description: { readonly ko: string; readonly en: string };
}

export const PUBLISH_SUBSTEP_ORDER: readonly PublishSubstepId[] = Object.freeze([
  "content",
  "distribution",
  "review",
]);

export const PUBLISH_SUBSTEPS: readonly PublishSubstepDefinition[] = Object.freeze([
  {
    id: "content",
    label: { ko: "원고", en: "Manuscript" },
    description: { ko: "이미지·작품 정보", en: "Images & work info" },
  },
  {
    id: "distribution",
    label: { ko: "게시 설정", en: "Publish settings" },
    description: { ko: "공개·예약·독자 정책", en: "Visibility, scheduling & reader policy" },
  },
  {
    id: "review",
    label: { ko: "최종 확인", en: "Final check" },
    description: { ko: "미리보기·사전검사", en: "Preview & preflight" },
  },
]);

export interface PublishSubstepState extends PublishSubstepDefinition {
  readonly status: EpisodeStageStatus;
}

/**
 * 현재 절차 1개로부터 3개 절차의 상태를 도출한다.
 * - `published`면 셋 다 done이다(게시 단계 자체가 끝난 뒤의 표시).
 * - 현재 절차를 모르면(null/undefined) 셋 다 unknown — 위치를 지어내지 않는다.
 * - 그 외에는 앞 절차 done · 현재 current · 뒤 절차 todo다.
 */
export function derivePublishSubsteps(
  active: PublishSubstepId | null | undefined,
  options?: { readonly published?: boolean },
): readonly PublishSubstepState[] {
  return PUBLISH_SUBSTEPS.map((definition, index) => {
    if (options?.published) return { ...definition, status: "done" as const };
    if (!active) return { ...definition, status: "unknown" as const };
    const activeIndex = PUBLISH_SUBSTEP_ORDER.indexOf(active);
    const status: EpisodeStageStatus =
      index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
    return { ...definition, status };
  });
}

/**
 * "게시 단계 안의 n/3"에서 n(1부터 시작하는 현재 위치).
 * current가 있으면 그 위치, current 없이 전부 done이면 3(마지막),
 * done만 일부 있으면 끝난 개수, 아는 것이 없으면(전부 unknown/todo) null이다.
 */
export function publishSubstepPosition(
  states: readonly { readonly status: EpisodeStageStatus }[],
): number | null {
  const currentIndex = states.findIndex((state) => state.status === "current");
  if (currentIndex >= 0) return currentIndex + 1;
  const doneCount = states.filter((state) => state.status === "done").length;
  if (doneCount > 0) return doneCount;
  return null;
}

export interface PublishSubstepProgress {
  /** 1부터 시작하는 현재 위치. 모르면 null. */
  readonly position: number | null;
  readonly total: number;
  /** 고정 표기. 위치를 모르면 분수 없이 "게시 단계 안의 절차"로만 말한다. */
  readonly label: { readonly ko: string; readonly en: string };
}

/** 게시 내부 절차의 위치 표기를 만드는 유일한 출처. 표면은 이 문구를 조립하지 않는다. */
export function publishSubstepProgress(
  states: readonly { readonly status: EpisodeStageStatus }[],
): PublishSubstepProgress {
  const position = publishSubstepPosition(states);
  const total = states.length;
  return {
    position,
    total,
    label:
      position === null
        ? { ko: "게시 단계 안의 절차", en: "Steps inside the Publish stage" }
        : {
            ko: `게시 단계 안의 ${position}/${total}`,
            en: `Inside the Publish stage: ${position} of ${total}`,
          },
  };
}
