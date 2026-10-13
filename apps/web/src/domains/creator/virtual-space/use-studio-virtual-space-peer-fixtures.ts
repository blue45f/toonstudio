/**
 * 빌드 모드 배치 가구의 피어 동기화 배선 (VS 120 — 배치 목록 프레즌스 전파).
 *
 * - 송신: 프레즌스가 연결된(direct) 동안 로컬 배치 목록이 바뀔 때마다 컨트롤러에
 *   넘긴다. 연결이 끊겼다 다시 붙으면 direct 전이가 효과를 다시 실행해 현재
 *   목록을 새 컨트롤러에도 실어 보낸다.
 * - 수신: 스냅샷의 피어 목록과 로컬 목록을 소유 구분이 있는 합성(peer-fixtures)으로
 *   합쳐, 캔버스가 fx 고정물 층에 동기화할 디스크립터 목록만 돌려준다.
 */
import { useEffect, useMemo } from "react";

import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import type { StudioBuildPlacedFixture } from "./studio-virtual-space-build-mode-vitality";
import type { StudioVirtualSpacePresenceController } from "./studio-virtual-space-presence";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence-protocol";
import { mergeStudioPeerPlacedFixtures } from "./studio-virtual-space-peer-fixtures";

export function useStudioVirtualSpacePeerFixtures(input: {
  readonly controllerRef: { readonly current: StudioVirtualSpacePresenceController | null };
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly selfSessionId: string;
  readonly localRequests: readonly StudioBuildPlacementRequest[];
}): readonly StudioBuildPlacedFixture[] {
  const { controllerRef, snapshot, selfSessionId, localRequests } = input;
  const direct = snapshot.direct;
  useEffect(() => {
    if (direct) controllerRef.current?.setPlacedFixtures(localRequests);
  }, [controllerRef, direct, localRequests]);
  const peerFixtures = snapshot.peerFixtures;
  return useMemo(
    // 필드 부재(구버전 스냅샷 생산자) = 배치 없음으로 해석한다.
    () => mergeStudioPeerPlacedFixtures({ selfSessionId, localRequests, peerSets: peerFixtures ?? [] })
      .map((owned) => owned.fixture),
    [selfSessionId, localRequests, peerFixtures],
  );
}
