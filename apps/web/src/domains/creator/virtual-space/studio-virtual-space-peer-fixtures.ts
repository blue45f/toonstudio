/**
 * 피어 배치 가구의 소유·합성 모듈 (VS 120 — 빌드 모드 배치의 피어 동기화).
 *
 * 배치 목록은 이 브라우저가 소유하는 로컬 상태였고(studio-virtual-space-placed-fixtures),
 * 프레즌스에는 전파 경로가 없었다. 이 모듈은 그 사이의 순수 변환을 맡는다:
 *
 * - 와이어 변환: 요청 목록 ↔ [entryId, x, y, rotation] 튜플. 수신 방향은 저장값
 *   파서(parseStudioPlacedFixtureRequests)와 같은 살균 경로를 그대로 재사용한다 —
 *   남이 보낸 목록도 저장값처럼 신뢰하지 않는다.
 * - 소유 구분: 합성된 고정물마다 소유 세션을 붙인다. 로컬 배치 목록(패널의 추가·
 *   제거 대상)은 소유가 자기 세션인 것만이며, 원격 배치는 렌더·상호작용 전용이다.
 * - 충돌 해소: 같은 좌표에 서로 다른 소유자의 고정물이 겹치면 소유 세션 id가
 *   사전순으로 가장 작은 쪽만 남긴다. 양쪽 클라이언트가 같은 입력(자기 목록 +
 *   피어 목록)으로 같은 결과를 계산하는 결정적 규칙이라 화면이 어긋나지 않는다.
 *   같은 objectId(같은 스펙·같은 좌표)는 소유가 달라도 디스크립터가 동일하므로
 *   하나로 수렴시키고, 자기 소유가 있으면 자기 쪽을 남긴다.
 */
import {
  studioBuildCatalogEntryById,
  type StudioBuildPlacementRequest,
} from "./studio-virtual-space-build-mode";
import {
  studioBuildPlacedFixtures,
  type StudioBuildPlacedFixture,
} from "./studio-virtual-space-build-mode-vitality";
import { parseStudioPlacedFixtureRequests } from "./studio-virtual-space-placed-fixtures";
import type {
  StudioVirtualSpaceFixtureWireItem,
  StudioVirtualSpacePeerFixtures,
} from "./studio-virtual-space-presence-protocol";

/** 송신 방향 변환: 배치 요청 목록 → 와이어 튜플 목록. */
export function studioFixtureWireItemsFromRequests(
  requests: readonly StudioBuildPlacementRequest[],
): readonly StudioVirtualSpaceFixtureWireItem[] {
  return Object.freeze(requests.map((request) => Object.freeze([
    request.entryId,
    Math.round(request.point.x),
    Math.round(request.point.y),
    request.rotation,
  ] as const)));
}

/**
 * 수신 방향 변환: 와이어 튜플 목록 → 살균된 배치 요청 목록.
 * entryId로 카탈로그를 조회해 category·refId를 복원한 뒤, 저장값 파서와 같은
 * 살균(카탈로그 대조·좌표/회전 유효성·중복 수렴·상한)을 그대로 적용한다.
 * 카탈로그에 없는 항목은 복원할 수 없어 버려진다.
 */
export function studioPlacedRequestsFromWireItems(
  items: readonly StudioVirtualSpaceFixtureWireItem[],
): readonly StudioBuildPlacementRequest[] {
  const candidates: unknown[] = [];
  for (const [entryId, x, y, rotation] of items) {
    const entry = studioBuildCatalogEntryById(entryId);
    if (!entry) continue;
    candidates.push({
      entryId: entry.id,
      category: entry.category,
      refId: entry.refId,
      point: { x, y },
      rotation,
    });
  }
  return parseStudioPlacedFixtureRequests(candidates);
}

/** 소유가 구분된 배치 고정물. own이 true면 이 브라우저가 배치한 것이다. */
export interface StudioOwnedPlacedFixture {
  readonly fixture: StudioBuildPlacedFixture;
  readonly ownerSessionId: string;
  readonly own: boolean;
}

function pointKey(fixture: StudioBuildPlacedFixture): string {
  return `${Math.round(fixture.point.x)},${Math.round(fixture.point.y)}`;
}

/**
 * 로컬 배치와 피어 배치를 하나의 고정물 목록으로 합성한다.
 * 입력이 같으면 어느 클라이언트에서 계산해도 같은 결과가 나오는 결정적 합성이다.
 */
export function mergeStudioPeerPlacedFixtures(input: {
  readonly selfSessionId: string;
  readonly localRequests: readonly StudioBuildPlacementRequest[];
  readonly peerSets: readonly StudioVirtualSpacePeerFixtures[];
}): readonly StudioOwnedPlacedFixture[] {
  const sets: { readonly ownerSessionId: string; readonly requests: readonly StudioBuildPlacementRequest[] }[] = [
    { ownerSessionId: input.selfSessionId, requests: input.localRequests },
    ...input.peerSets
      .filter((set) => set.sessionId !== input.selfSessionId)
      .map((set) => ({ ownerSessionId: set.sessionId, requests: set.requests })),
  ];
  // 1) objectId 수렴: 같은 스펙·같은 좌표는 소유가 달라도 디스크립터가 같다.
  //    자기 소유가 있으면 자기 쪽을, 없으면 소유 세션 id가 가장 작은 쪽을 남긴다.
  const byObjectId = new Map<string, StudioOwnedPlacedFixture>();
  for (const set of sets) {
    for (const fixture of studioBuildPlacedFixtures(set.requests)) {
      const owned: StudioOwnedPlacedFixture = Object.freeze({
        fixture,
        ownerSessionId: set.ownerSessionId,
        own: set.ownerSessionId === input.selfSessionId,
      });
      const existing = byObjectId.get(fixture.objectId);
      if (!existing
        || (owned.own && !existing.own)
        || (owned.own === existing.own && owned.ownerSessionId < existing.ownerSessionId)) {
        byObjectId.set(fixture.objectId, owned);
      }
    }
  }
  // 2) 좌표 충돌: 같은 지점에 남은 소유자가 둘이면 세션 id가 가장 작은 소유자만 남긴다.
  const winnerByPoint = new Map<string, string>();
  for (const owned of byObjectId.values()) {
    const key = pointKey(owned.fixture);
    const winner = winnerByPoint.get(key);
    if (winner === undefined || owned.ownerSessionId < winner) winnerByPoint.set(key, owned.ownerSessionId);
  }
  return Object.freeze(
    [...byObjectId.values()]
      .filter((owned) => winnerByPoint.get(pointKey(owned.fixture)) === owned.ownerSessionId)
      .sort((left, right) => left.fixture.objectId.localeCompare(right.fixture.objectId)),
  );
}
