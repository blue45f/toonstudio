import { Suspense, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import { readStudioEpisodeStageContext } from "./studio-episode-stage-context";

const StudioEpisodeStageChipConnector = lazyRetry(
  () => import("./StudioEpisodeStageChip").then((module) => ({
    default: module.StudioEpisodeStageChipConnector,
  })),
  "StudioEpisodeStageChipConnector",
);

/**
 * 에디터 헤더 회차 단계 칩의 슬롯.
 *
 * StudioDocumentLayout이 상시 렌더하지만 칩은 URL의 명시적 회차 맥락(`?productionProjectId=…
 * &episodeId=…`)과 로그인 세션이 모두 있을 때만 존재한다. 이 슬롯은 그 두 조건만 값싸게
 * 확인하고, 제작 허브 모델을 끌어오는 연결 단위(StudioEpisodeStageChip.tsx)는 조건이
 * 맞을 때만 지연 로딩한다 — 맥락 없는 대부분의 에디터 진입이 제작 허브 청크 묶음을
 * 내려받지 않는다(Studio 번들 기준선 경계).
 *
 * 맥락·세션·도출 근거 중 하나라도 없으면 아무것도 렌더하지 않는다. 로딩 중에도 헤더에
 * 스켈레톤을 얹지 않는다(칩 없음이 로딩·빈 상태·오류 상태 공통의 표면 설계다).
 */
export function StudioEpisodeStageChipSlot() {
  const { search } = useLocation();
  const context = useMemo(() => readStudioEpisodeStageContext(search), [search]);
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  if (!context || !userId) return null;
  return (
    <Suspense fallback={null}>
      <StudioEpisodeStageChipConnector context={context} userId={userId} />
    </Suspense>
  );
}
