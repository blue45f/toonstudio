/**
 * 회차 단계 스텝퍼 — 제작 허브 상대 import 호환용 재노출 (S2-4 공용화).
 *
 * 정본 구현은 `@/shared/components/episode-stage-stepper`다. 이 파일은 기존
 * 허브 내부 import(`./EpisodeStageStepper`)를 깨지 않기 위한 얇은 재노출이며,
 * 여기에 표시 로직을 다시 두지 않는다.
 */
export { EpisodeStageStepper } from "@/shared/components/episode-stage-stepper";
export {
  EPISODE_STAGE_STATUSES,
  EPISODE_STAGE_STATUS_TEXT,
} from "@/shared/components/episode-stage-status";
export type {
  EpisodeStageStatus,
  EpisodeStageStepView,
  EpisodeStageStepperProps,
  EpisodeStageStepperVariant,
  PublishSubstepView,
} from "@/shared/components/episode-stage-stepper";
