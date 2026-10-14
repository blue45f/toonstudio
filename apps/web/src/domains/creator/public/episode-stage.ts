/**
 * 회차 단계 도출의 공개 경계 (BLUEPRINT S2-5 확산).
 *
 * 단계 도출(선택·QC·판정)은 제작 허브 내부 모듈이 정본이다. 연재 센터(/publish)·
 * 에디터 헤더처럼 허브 밖 표면이 같은 회차를 같은 단계로 말하려면, 허브 내부
 * 경로를 직접 import하지 않고 이 경계만 거친다 — 기존 프로젝트 목록 경계
 * (`./production-projects`, 연재 센터가 이미 쓰는 패턴)와 같은 방식이다.
 *
 * 핵심 계약: `representativeEpisodeStage`의 합성은 제작 허브 개요
 * (ProductionHubPage)의 인라인 합성과 글자 단위로 같은 순서다 —
 * 대표 회차 선택 → 그 회차의 QC 계산 → QC를 extras로 넣은 단계 도출.
 * 표면이 이 합성을 각자 다시 쓰면 QC 유무만으로 식자·검수 판정이 갈려
 * "같은 회차가 표면을 옮기면 다른 단계"가 되므로, 합성은 여기 한 곳뿐이다.
 */
import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { deriveEpisodeQcChecklist } from "../production-hub/production-episode-qc";
import {
  deriveEpisodeStageStates,
  selectStepperEpisode,
  type EpisodeStageState,
  type StepperEpisodeSelection,
} from "../production-hub/production-episode-stage";

export { deriveEpisodeStageStates, selectStepperEpisode };
export type { EpisodeStageState, StepperEpisodeSelection };

export interface RepresentativeEpisodeStage {
  /** 대표 회차 선택 결과. 회차가 없으면 null이고 states는 전부 unknown이다. */
  readonly selection: StepperEpisodeSelection | null;
  /** 7단계 순서 그대로의 도출 결과. EpisodeStageStepper(full/compact)의 입력이다. */
  readonly states: readonly EpisodeStageState[];
}

/**
 * 프로젝트 aggregate 1개에서 "지금 만드는 회차 × 7단계"를 도출한다.
 * 제작 허브 개요와 완전히 같은 합성이다(위 파일 주석의 계약 참조).
 * 검수 핀은 aggregate 밖(페이지별 댓글 문서)이라 허브 개요와 마찬가지로
 * 여기서도 넘기지 않는다 — 핀 기반 판정은 핀을 읽는 표면의 몫이다.
 */
export function representativeEpisodeStage(
  aggregate: ProductionProjectAggregate,
): RepresentativeEpisodeStage {
  const selection = selectStepperEpisode(aggregate.episodes, aggregate.episodePlans);
  const qc = selection
    ? deriveEpisodeQcChecklist(aggregate, selection.episode.episodeId)
    : null;
  return {
    selection,
    states: deriveEpisodeStageStates(selection?.episode, { qc }),
  };
}

export interface EpisodeStageForEpisode {
  /** 요청한 회차의 선택 정보(회차 번호·제목은 회차 기획에서 온다). */
  readonly selection: StepperEpisodeSelection;
  /** 그 회차의 7단계 도출 결과. 대표 회차 합성과 같은 QC 경유 순서다. */
  readonly states: readonly EpisodeStageState[];
}

/**
 * 특정 회차 1개의 단계를 도출한다 (에디터 헤더처럼 회차가 이미 정해진 표면용).
 * 합성 순서는 대표 회차와 같다 — QC 계산 → QC를 extras로 넣은 단계 도출.
 * aggregate 안에 그 회차가 없으면 null이다: 다른 회차의 단계로 대체하지 않는다.
 */
export function episodeStageForEpisode(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): EpisodeStageForEpisode | null {
  const episode = aggregate.episodes.find((entry) => entry.episodeId === episodeId);
  if (!episode) return null;
  const plan = aggregate.episodePlans.find((entry) => entry.episodeId === episodeId) ?? null;
  const selection: StepperEpisodeSelection = {
    episode,
    episodeNumber: plan?.episodeNumber ?? null,
    title: plan?.title ?? null,
  };
  const qc = deriveEpisodeQcChecklist(aggregate, episodeId);
  return { selection, states: deriveEpisodeStageStates(episode, { qc }) };
}
