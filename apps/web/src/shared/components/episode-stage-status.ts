/**
 * 회차 단계 상태 어휘 — episode-stage-stepper.tsx(컴포넌트 파일)에서 분리한 계약 모듈.
 * 컴포넌트 파일이 컴포넌트만 내보내야 Fast Refresh 가 동작한다(react-refresh/only-export-components).
 * 상태 단어·표시 문구의 정본은 이 파일이며, 스텝퍼·진행 레일·제작 허브가 여기서 가져간다.
 */

/** 상태 어휘 4개 — 순서·값이 계약이다. 추가/변경은 단계 모델 전체와 함께만 한다. */
export const EPISODE_STAGE_STATUSES = ["done", "current", "todo", "unknown"] as const;

export type EpisodeStageStatus = (typeof EPISODE_STAGE_STATUSES)[number];

export const EPISODE_STAGE_STATUS_TEXT: Readonly<
  Record<EpisodeStageStatus, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  done: { ko: "끝남", en: "Done" },
  current: { ko: "지금 여기", en: "You are here" },
  todo: { ko: "남음", en: "To do" },
  unknown: { ko: "확인 불가", en: "Unknown" },
});
