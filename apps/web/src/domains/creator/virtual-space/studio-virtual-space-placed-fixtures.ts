/**
 * 빌드 모드로 배치한 상태 가구의 로컬 소유 모듈 (VS 120 웨이브 4 B 후속 — 패널 라이브 연결).
 *
 * 배치 목록(StudioBuildPlacementRequest[])은 이 브라우저가 소유한다. 공간 꾸미기
 * (decorations)는 서버 정본 계약(@toonstudio/contracts 배치 계약)이 있어 그 상태에
 * 얹을 수 없고, 프레즌스 프로토콜에도 배치 목록 자리가 없어 서버 계약 없이
 * 완결되는 범위는 로컬 저장까지다. 그래서 투표 패널처럼 "이 기기에서만" 유지한다.
 *
 * - 저장: localStorage에 decorationScope 키로 나눠 보관한다(꾸미기와 같은 방식).
 *   읽을 때는 카탈로그에 실재하는 항목만, 좌표·회전이 유효한 것만 통과시키고
 *   같은 고정물(objectId)로 수렴하는 중복은 버린다 — 저장값도 신뢰하지 않는다.
 * - 배치점 탐색: "내 주변에 배치" 동선용. 기준점에서 격자 링을 넓혀 가며
 *   월드 안에 들고(canOccupy) 이미 놓인 것들과 겹치지 않는 첫 지점을 돌려준다.
 *   고정물은 fx 층의 그림 오버레이라 충돌체를 만들지 않지만, 같은 지점에
 *   두 개가 겹치면 objectId 판정·프롬프트가 흐려져 최소 간격을 지킨다.
 */
import {
  studioBuildCatalogEntryById,
  type StudioBuildPlacementRequest,
} from "./studio-virtual-space-build-mode";
import { studioBuildPlacedFixture } from "./studio-virtual-space-build-mode-vitality";
import { snapStudioVirtualDecorPointToGrid } from "./studio-virtual-space-decoration-tools";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

const PLACED_FIXTURE_STORAGE_KEY = "toonspectrum:virtual-space-placed-fixtures:v1";

/** 한 공간에 배치할 수 있는 상태 가구 상한. 꾸미기(36개)보다 작게 잡아 월드 과밀을 막는다. */
export const STUDIO_PLACED_FIXTURE_LIMIT = 24;

/** 배치점 탐색 격자(px). 빌드 모드 고스트 스냅과 같은 값이다. */
const PLACEMENT_GRID = 16;
/** 기준점에서 탐색하는 최대 격자 걸음 수(16px × 8 = 128px). */
const MAX_SEARCH_STEPS = 8;
/** 이미 놓인 지점과 유지할 최소 간격(px). */
const MIN_OCCUPIED_GAP = 32;
/** 월드 가장자리에서 안쪽으로 비워 둘 여유(px). */
const WORLD_EDGE_MARGIN = 16;

const VALID_ROTATIONS: ReadonlySet<number> = new Set([0, 90, 180, 270]);

function storageKey(scope?: string): string {
  return scope ? `${PLACED_FIXTURE_STORAGE_KEY}:${encodeURIComponent(scope)}` : PLACED_FIXTURE_STORAGE_KEY;
}

function isFinitePoint(value: unknown): value is StudioVirtualSpacePoint {
  if (!value || typeof value !== "object") return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && Number.isFinite(point.x)
    && typeof point.y === "number" && Number.isFinite(point.y);
}

/**
 * 저장값을 배치 요청 목록으로 거른다. 카탈로그에 없는 항목·카테고리 불일치·
 * 유효하지 않은 좌표/회전은 버리고, 결정적 objectId가 겹치는 중복은 첫 것만 남긴다.
 * 고정물 디스크립터가 생기지 않는 요청(커피 머신 등)도 데이터로서는 보존한다 —
 * 빠지는 판단은 디스크립터 변환이 맡는다.
 */
export function parseStudioPlacedFixtureRequests(value: unknown): readonly StudioBuildPlacementRequest[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const requests: StudioBuildPlacementRequest[] = [];
  const seenObjectIds = new Set<string>();
  const seenSlots = new Set<string>();
  for (const raw of value) {
    if (requests.length >= STUDIO_PLACED_FIXTURE_LIMIT) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.entryId !== "string" || typeof candidate.refId !== "string") continue;
    const entry = studioBuildCatalogEntryById(candidate.entryId);
    if (!entry || entry.refId !== candidate.refId || entry.category === "decor") continue;
    if (candidate.category !== entry.category) continue;
    if (!isFinitePoint(candidate.point)) continue;
    if (typeof candidate.rotation !== "number" || !VALID_ROTATIONS.has(candidate.rotation)) continue;
    const request: StudioBuildPlacementRequest = Object.freeze({
      entryId: entry.id,
      category: entry.category,
      refId: entry.refId,
      point: Object.freeze({ x: candidate.point.x, y: candidate.point.y }),
      rotation: candidate.rotation as StudioBuildPlacementRequest["rotation"],
    });
    const slot = `${request.entryId}@${Math.round(request.point.x)},${Math.round(request.point.y)}`;
    if (seenSlots.has(slot)) continue;
    seenSlots.add(slot);
    const fixture = studioBuildPlacedFixture(request);
    if (fixture) {
      if (seenObjectIds.has(fixture.objectId)) continue;
      seenObjectIds.add(fixture.objectId);
    }
    requests.push(request);
  }
  return Object.freeze(requests);
}

/** 이 브라우저에 저장된 배치 목록을 읽는다. 저장 실패·손상 시 빈 목록이다. */
export function readStudioPlacedFixtureRequests(scope?: string): readonly StudioBuildPlacementRequest[] {
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    return raw ? parseStudioPlacedFixtureRequests(JSON.parse(raw)) : Object.freeze([]);
  } catch {
    return Object.freeze([]);
  }
}

/** 배치 목록을 이 브라우저에 저장한다. 성공 여부를 돌려준다(호출자가 안내를 맡는다). */
export function writeStudioPlacedFixtureRequests(
  requests: readonly StudioBuildPlacementRequest[],
  scope?: string,
): boolean {
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(requests));
    return true;
  } catch {
    return false;
  }
}

/**
 * 기준점(보통 내 위치) 주변에서 배치할 지점을 찾는다.
 * 격자에 스냅한 후보를 가까운 순으로 검사해, 월드 경계 안이고 점유 가능하며
 * occupied와 최소 간격을 유지하는 첫 지점을 돌려준다. 기준점 자체는 제외한다
 * (캐릭터 발밑에 묻히지 않게). 없으면 null이다.
 */
export function studioPlacedFixturePointNear(
  world: StudioVirtualSpaceWorldManifest,
  occupied: readonly StudioVirtualSpacePoint[],
  origin: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint | null {
  const offsets: { dx: number; dy: number; distance: number }[] = [];
  for (let dx = -MAX_SEARCH_STEPS; dx <= MAX_SEARCH_STEPS; dx += 1) {
    for (let dy = -MAX_SEARCH_STEPS; dy <= MAX_SEARCH_STEPS; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      offsets.push({ dx, dy, distance: dx * dx + dy * dy });
    }
  }
  offsets.sort((a, b) => a.distance - b.distance || a.dy - b.dy || a.dx - b.dx);
  for (const { dx, dy } of offsets) {
    const point = snapStudioVirtualDecorPointToGrid(
      { x: origin.x + dx * PLACEMENT_GRID, y: origin.y + dy * PLACEMENT_GRID },
      PLACEMENT_GRID,
    );
    if (point.x < WORLD_EDGE_MARGIN || point.y < WORLD_EDGE_MARGIN) continue;
    if (point.x > world.width - WORLD_EDGE_MARGIN || point.y > world.height - WORLD_EDGE_MARGIN) continue;
    if (occupied.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < MIN_OCCUPIED_GAP)) continue;
    if (!studioWorldCanOccupy(world, point)) continue;
    return point;
  }
  return null;
}
