/**
 * 회차 단계 인계 섹션 — 단계 시작 화면의 본문 상단에 붙이는 얇은 래퍼.
 *
 * aggregate + 회차 + 대상 단계만 받으면, 앞 단계 산출 조달
 * (episode-stage-handoff-source)과 인용 카드(StageHandoffCard)를 잇는다.
 * 표면은 자기 회차 맥락만 넘기면 되고, 인용 내용·빈 상태·끌어오기/새로
 * 쓰기 선택은 전부 카드가 소유한다. 회차가 바뀌면 key로 카드를 새로
 * 마운트해 이전 회차의 선택 상태가 새지 않게 한다.
 */
import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { episodeStageHandoffSource } from "./episode-stage-handoff-source";
import type { EpisodeStageId } from "./production-project-surfaces";
import { StageHandoffCard } from "./StageHandoffCard";

export interface EpisodeStageHandoffSectionProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
  readonly targetStage: EpisodeStageId;
}

export function EpisodeStageHandoffSection({
  aggregate,
  episodeId,
  targetStage,
}: EpisodeStageHandoffSectionProps) {
  const source = episodeStageHandoffSource(aggregate, episodeId);
  return (
    <StageHandoffCard
      key={`${episodeId}:${targetStage}`}
      plan={source.plan}
      scenePlans={source.scenePlans}
      targetStage={targetStage}
      status="ready"
      projectId={aggregate.projectId}
    />
  );
}
