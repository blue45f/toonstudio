/**
 * 에디터 헤더용 회차 단계 compact 칩 (BLUEPRINT S2-5 확산).
 *
 * 렌더링은 공용 정본 EpisodeStageStepper의 compact 변형 하나뿐이다 — 에디터가
 * 자체 칩 문구를 만들면 표면을 옮길 때마다 같은 회차가 다른 단계로 읽힌다.
 *
 * 표시 계약 — 근거 없는 단계는 만들지 않는다:
 * - 문서 신원(projectId·documentId·workId)에서는 제작 회차를 추측하지 않는다.
 *   문서 프로젝트는 로컬 라이브러리 신원이고 정본 문서 라우트의 workId는
 *   문서 id를 얹은 레거시 신원이라, 제작 aggregate의 신원과 같지 않다.
 * - 대신 표면을 연 쪽이 URL에 명시한 회차 맥락(`?productionProjectId=…&
 *   episodeId=…`, studio-episode-stage-context)이 있을 때만, 그 회차의 단계를
 *   공개 경계(episodeStageForEpisode)로 도출해 보여준다. 맥락이 없거나,
 *   로그인 전이거나, 읽기에 실패하거나, aggregate에 그 회차가 없으면
 *   칩은 없다 — 로딩·빈 상태·에러 상태가 모두 "칩 없음"인 것이 이 표면의
 *   설계다(헤더에 스켈레톤·에러 문구를 얹지 않는다).
 *
 * 장착: StudioDocumentLayout이 StudioEpisodeStageChipSlot(StudioEpisodeStageChipSlot.tsx)을
 * 상시 렌더하고, 슬롯이 맥락·세션을 확인한 뒤 이 파일의 연결 단위
 * (StudioEpisodeStageChipConnector)를 지연 로딩한다. 연결 단위는 StudioDocumentWindowHub
 * 헤더 바의 전용 자리(#studio-episode-stage-chrome-slot)로 포털한다. 문서 라우트가
 * 아닌 표면(헤더 바 자체가 없는 경우)에서는 자리도 없어 칩도 없다.
 *
 * 번들 경계: 이 파일은 제작 허브 모델(production-api·episode-stage 등)을 끌어오므로
 * 에디터 시작 경로가 정적으로 import하면 안 된다 — 맥락 없는 모든 에디터 진입이 제작 허브
 * 청크 묶음(약 190KB raw)을 내려받게 된다. 상시 렌더되는 얇은 슬롯만 시작 경로에 두고
 * 이 파일은 슬롯의 동적 import로만 연다(경계 테스트가 지킨다).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  EpisodeStageStepper,
  type EpisodeStageStepView,
} from "@/shared/components/episode-stage-stepper";

import { episodeStageForEpisode } from "../public/episode-stage";
import { getProductionProject } from "../public/production-projects";
import { episodeStageChipCurrent } from "./studio-episode-stage-chip-current";
import type { StudioEpisodeStageContext } from "./studio-episode-stage-context";
import { useStudioChromePortalTarget } from "./use-studio-chrome-portal-target";

export function StudioEpisodeStageChip({
  states,
  progressText,
}: Readonly<{
  /** deriveEpisodeStageStates 결과. 근거가 없으면 null — 칩을 그리지 않는다. */
  readonly states: readonly EpisodeStageStepView[] | null;
  /** 칩에 덧붙일 진척 한 줄(예: "컷 32/45"). 도출 근거가 있을 때만 넘긴다. */
  readonly progressText?: string;
}>) {
  if (!episodeStageChipCurrent(states)) return null;
  return (
    <EpisodeStageStepper states={states ?? []} variant="compact" progressText={progressText} />
  );
}

/**
 * 에디터 헤더 칩의 연결 단위. 맥락으로 제작 프로젝트 aggregate 1건을 가져오고, 그 회차의
 * 단계를 도출해 헤더 바 자리로 보낸다. 맥락·세션 판정은 슬롯(StudioEpisodeStageChipSlot)이
 * 먼저 하므로 두 값은 이미 있다고 보고, 도출 실패(읽기 실패·aggregate에 회차 없음)만
 * "칩 없음"으로 처리한다 — 헤더에 스켈레톤·에러 문구를 얹지 않는다.
 */
export function StudioEpisodeStageChipConnector({
  context,
  userId,
}: Readonly<{
  /** URL에서 읽은 유효한 회차 맥락. */
  readonly context: StudioEpisodeStageContext;
  /** 로그인한 사용자 id. 계정이 바뀌면 같은 맥락이라도 다시 읽는다. */
  readonly userId: string;
}>) {
  const [states, setStates] = useState<readonly EpisodeStageStepView[] | null>(null);
  const target = useStudioChromePortalTarget("studio-episode-stage-chrome-slot");

  useEffect(() => {
    let active = true;
    void getProductionProject(context.productionProjectId)
      .then((record) => {
        if (!active) return;
        const derived = episodeStageForEpisode(record.aggregate, context.episodeId);
        setStates(derived ? [...derived.states] : null);
      })
      .catch(() => {
        if (active) setStates(null);
      });
    return () => {
      active = false;
    };
  }, [context, userId]);

  if (!target) return null;
  return createPortal(<StudioEpisodeStageChip states={states} />, target);
}
