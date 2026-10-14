import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import type { StudioProjectPlanningState } from "./studio-planning-store";

/**
 * 기획 저장소 기준 "가장 최근 회차" id.
 * 연재 순서표(season.episodeOrder)의 마지막 항목이 정본이고,
 * 순서표가 비어 있을 때만 회차 번호가 가장 큰 기획으로 폴백한다.
 * 둘 다 없으면 null — 호출자는 침묵한다.
 */
export function currentPlanningEpisodeId(planning: StudioProjectPlanningState): string | null {
  const lastOrdered = planning.season.episodeOrder.at(-1);
  if (lastOrdered) return lastOrdered;
  let current: EpisodePlanWithSynopsis | null = null;
  for (const plan of planning.plans) {
    if (!current || plan.episodeNumber > current.episodeNumber) current = plan;
  }
  return current?.episodeId ?? null;
}
