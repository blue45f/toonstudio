import type { EpisodeStageStepView } from "@/shared/components/episode-stage-stepper";

/**
 * compact 칩이 실제로 보여줄 현재 단계. 공용 스텝퍼 compact와 같은 규칙 —
 * current인 단계가 없으면 칩 자체가 없다(null). 표면이 이 판정을 다시 쓰지
 * 않도록 한 곳에 둔다(예: 헤더 공간을 칩 유무에 따라 접을 때 쓴다).
 */
export function episodeStageChipCurrent(
  states: readonly EpisodeStageStepView[] | null | undefined,
): EpisodeStageStepView | null {
  if (!states) return null;
  return states.find((state) => state.status === "current") ?? null;
}
