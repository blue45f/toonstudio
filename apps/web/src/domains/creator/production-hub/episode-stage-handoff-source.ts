/**
 * 회차 단계 인계 조달 — 제작 허브 aggregate에서 한 회차의 앞 단계 산출을
 * 인계 카드 입력으로 골라낸다.
 *
 * - 기획: 회차 기획 중 최신 리비전 1건. core EpisodePlan은 goal·synopsis·
 *   emotionalArc를 optional로 이미 포함해 EpisodePlanWithSynopsis와
 *   구조적으로 같다(추가 변환·복제 없음).
 * - 장면 계획: 회차의 ScenePlan을 sceneId별 최신 리비전으로 접고,
 *   보관(archived)·대체(superseded)된 계획은 제외한다. 검수 작업대
 *   (ProductionReviewWorkspace.latestCuts)와 같은 "최신 리비전만" 규칙이다.
 * - 캐릭터 시트·콘티 비트는 aggregate에 정본 소스가 없다(캐릭터 바이블은
 *   참조 id만 있고, scenePlans/cutPlans는 StudioStoryBeat와 다른 타입).
 *   없는 소스를 변환해 지어내지 않고 비워 두면, 카드가 missing으로
 *   정직하게 안내한다.
 */
import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { EpisodePlanWithSynopsis } from "../planning/studio-episode-synopsis";
import {
  stageHandoffScenePlanInputs,
  type StageHandoffScenePlanInput,
} from "./stage-handoff-model";

export interface EpisodeStageHandoffSource {
  /** 최신 리비전 회차 기획. 없으면 null — 카드가 기획 missing으로 안내한다. */
  readonly plan: EpisodePlanWithSynopsis | null;
  /** 장면 계획 인용 입력(순서 정규화済). 없으면 빈 배열. */
  readonly scenePlans: readonly StageHandoffScenePlanInput[];
}

export function episodeStageHandoffSource(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): EpisodeStageHandoffSource {
  const plan =
    [...aggregate.episodePlans]
      .filter((entry) => entry.episodeId === episodeId)
      .sort((left, right) => right.revision - left.revision)[0] ?? null;

  const latestByScene = new Map<string, (typeof aggregate.scenePlans)[number]>();
  for (const scenePlan of aggregate.scenePlans) {
    if (scenePlan.episodeId !== episodeId) continue;
    if (scenePlan.status === "archived" || scenePlan.status === "superseded") continue;
    const current = latestByScene.get(scenePlan.sceneId);
    if (!current || current.revision < scenePlan.revision) {
      latestByScene.set(scenePlan.sceneId, scenePlan);
    }
  }
  const scenePlans = stageHandoffScenePlanInputs(
    [...latestByScene.values()].map((scenePlan) => ({
      order: scenePlan.order,
      purpose: scenePlan.purpose,
      emotionalBeat: scenePlan.emotionalBeat,
    })),
  );

  return Object.freeze({ plan, scenePlans });
}
