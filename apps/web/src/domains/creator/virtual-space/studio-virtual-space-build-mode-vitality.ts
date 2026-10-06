/**
 * 빌드 모드 가구 생동감 (VS 120 웨이브 4 B — 오브젝트 구현 기록 §4-5).
 *
 * 가구 카탈로그의 종류 매핑(floor-lamp 등)은 준비돼 있었지만 소비처가 없었다.
 * decoration-runtime은 decor 타입 체계라 이 매핑의 소비처가 아니고, fx 런타임의
 * 고정물(fixture) 층은 월드 매니페스트 상호작용으로만 고정물을 만들었다.
 * 이 모듈이 그 사이를 잇는 순수 배선이다:
 *
 * - 종류 매핑: 가구 종류 → main 상태 머신 종류. 상태 의미가 분명한 가구만 잇는다
 *   (조명·미디어·커피). 책상·의자는 앉기 경로가 따로 있고, 장식성 가구는 상태가 없다.
 * - 고스트 미리보기 반응: 배치 중 고스트가 "켜진 조명·열린 화면·준비 완료 커피"의
 *   반응 프레임(object-reaction 표)을 그대로 보여 줘, 놓기 전에 생동감을 확인할 수 있다.
 * - 배치 고정물 디스크립터: 확정된 배치 요청을 fx 고정물 층의 등록 입력으로 바꾼다.
 *   objectId는 스펙 id + 스냅 좌표로 결정적이라 같은 배치를 다시 동기화해도 수렴한다.
 *   커피 머신은 컵·수령·바리스타 연출이 매니페스트 카페 머신 전용이라 고정물 층에서
 *   제외한다(미리보기 반응까지만 닿는다).
 *
 * 효과는 전부 오브젝트 국소 반응이다. 화면 전체 틴트·워시는 만들지 않는다.
 */
import { studioBuildCatalogEntryById, type StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import { furnitureById, type StudioFurnitureKind } from "./studio-virtual-space-furniture-catalog";
import type { StudioInteractableObjectKind, StudioInteractableStateKey } from "./studio-virtual-space-interactable-objects";
import { objectReactionFrame, type StudioObjectReactionFrame } from "./studio-virtual-space-object-reaction";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWorldFxAnchor } from "./studio-virtual-space-world-interaction-kinds";

/** 가구 종류 → 상태 머신 종류. 매핑이 없는 가구는 상태를 가지지 않는다. */
const FURNITURE_INTERACTABLE_KINDS: Readonly<Partial<Record<StudioFurnitureKind, StudioInteractableObjectKind>>> = Object.freeze({
  "floor-lamp": "light-switch",
  "neon-sign": "light-switch",
  whiteboard: "whiteboard",
  "display-screen": "youtube",
  "coffee-machine": "coffee-machine",
});

/** 가구 종류에 대응하는 상태 머신 종류. 상태 가구가 아니면 null이다. */
export function studioBuildFurnitureInteractableKind(kind: StudioFurnitureKind): StudioInteractableObjectKind | null {
  return FURNITURE_INTERACTABLE_KINDS[kind] ?? null;
}

/** 고스트 미리보기에서 보여 줄 대표 상태 — 생동감이 드러나는 상태다. */
const GHOST_SIGNATURE_STATE: Readonly<Partial<Record<StudioInteractableObjectKind, StudioInteractableStateKey>>> = Object.freeze({
  "light-switch": "light:on",
  whiteboard: "media:open",
  youtube: "media:open",
  "coffee-machine": "coffee:ready",
});

/** 미리보기는 전이가 끝난 대표 상태를 보여 준다(맥동 채널은 now로 계속 움직인다). */
const GHOST_SETTLED_ELAPSED_MS = 60_000;

/**
 * 빌드 모드 고스트 미리보기의 반응 프레임.
 * 카탈로그 항목(가구) → 대표 상태의 objectReactionFrame이다. 상태 가구가 아닌
 * 항목·장식 카테고리·없는 항목은 null이다(고스트는 반응 없이 그린다).
 */
export function studioBuildGhostReactionFrame(
  entryId: string,
  now: number,
  reducedMotion: boolean,
): StudioObjectReactionFrame | null {
  const entry = studioBuildCatalogEntryById(entryId);
  if (!entry || entry.category !== "furniture") return null;
  const spec = furnitureById(entry.refId);
  if (!spec) return null;
  const kind = studioBuildFurnitureInteractableKind(spec.kind);
  if (!kind) return null;
  const stateKey = GHOST_SIGNATURE_STATE[kind];
  if (!stateKey) return null;
  const at = Number.isFinite(now) ? now : 0;
  return objectReactionFrame({ kind, stateKey, stateChangedAt: at - GHOST_SETTLED_ELAPSED_MS }, at, reducedMotion);
}

/** fx 고정물 층이 그릴 수 있는 종류. 커피 머신은 매니페스트 머신 전용 연출이라 제외한다. */
const PLACED_FIXTURE_KINDS: ReadonlySet<StudioInteractableObjectKind> = new Set(["light-switch", "whiteboard", "youtube"]);

/** 그림 없는 상호작용의 연출 기준점을 지점 위로 올리는 높이(world-interaction-kinds의 폴백과 같은 값). */
const PLACED_ANCHOR_LIFT = 54;

/** 배치된 상태 가구의 고정물 등록 디스크립터. fx 런타임 syncPlacedFixtures의 입력과 모양이 같다. */
export interface StudioBuildPlacedFixture {
  readonly objectId: string;
  readonly kind: StudioInteractableObjectKind;
  readonly point: StudioVirtualSpacePoint;
  readonly anchor: StudioWorldFxAnchor;
  readonly labelKo: string;
  readonly labelEn: string;
}

/**
 * 확정된 가구 배치 요청 → 고정물 디스크립터.
 * 상태 가구가 아니거나 고정물 층이 다룰 수 없는 종류(커피 머신)면 null이다.
 * objectId는 결정적이다 — 같은 스펙을 같은 좌표에 다시 동기화하면 같은 고정물로 수렴한다.
 */
export function studioBuildPlacedFixture(request: StudioBuildPlacementRequest): StudioBuildPlacedFixture | null {
  if (request.category !== "furniture") return null;
  const spec = furnitureById(request.refId);
  if (!spec) return null;
  const kind = studioBuildFurnitureInteractableKind(spec.kind);
  if (!kind || !PLACED_FIXTURE_KINDS.has(kind)) return null;
  const { point } = request;
  return Object.freeze({
    objectId: `build:${spec.id}@${Math.round(point.x)},${Math.round(point.y)}`,
    kind,
    point,
    anchor: Object.freeze({ x: point.x, y: point.y - PLACED_ANCHOR_LIFT, baseY: point.y }),
    labelKo: spec.labelKo,
    labelEn: spec.labelEn,
  });
}

/** 배치 요청 묶음 → 고정물 디스크립터 묶음(해당 없는 요청은 빠진다). */
export function studioBuildPlacedFixtures(
  requests: readonly StudioBuildPlacementRequest[],
): readonly StudioBuildPlacedFixture[] {
  const fixtures: StudioBuildPlacedFixture[] = [];
  for (const request of requests) {
    const fixture = studioBuildPlacedFixture(request);
    if (fixture) fixtures.push(fixture);
  }
  return Object.freeze(fixtures);
}

/**
 * 카탈로그 항목이 fx 고정물 층에 배치될 수 있는 상태 가구인지(좌표 무관 판정).
 * 빌드 패널이 "배치하면 반응하는 가구" 목록을 만들 때 쓴다 — 디스크립터 변환
 * (studioBuildPlacedFixture)과 같은 기준이라, 여기서 true인 항목은 어떤 좌표에
 * 놓아도 디스크립터가 생긴다. 커피 머신은 종류 매핑은 있지만 고정물 층 제외라 false다.
 */
export function studioBuildFixturePlaceable(entryId: string): boolean {
  const entry = studioBuildCatalogEntryById(entryId);
  if (!entry || entry.category !== "furniture") return false;
  const spec = furnitureById(entry.refId);
  if (!spec) return false;
  const kind = studioBuildFurnitureInteractableKind(spec.kind);
  return kind !== null && PLACED_FIXTURE_KINDS.has(kind);
}
