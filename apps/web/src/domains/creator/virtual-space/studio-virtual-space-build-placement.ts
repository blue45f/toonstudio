/**
 * 빌드 모드 지도 직접 배치 (VS 120 웨이브 4 B 후속 — 패널 라이브 연결의 직접 배치 동선).
 *
 * 패널에서 가구를 고르면 월드 지도에서 원하는 지점을 직접 찍어 놓을 수 있다.
 * 이 모듈은 그 동선의 순수 판정을 한곳에 모은다:
 *
 * - 지점 판정: 격자 스냅 → 상한 → 월드 가장자리 → 겹침(최소 간격) → 점유 가능 타일
 *   순으로 검사한다. 이유 코드는 꾸미기·빌드 확정(buildModeConfirmPlacement ·
 *   addStudioVirtualDecorationSafely)이 이미 쓰는 어휘(bounds·occupied·access·
 *   limit·invalid)를 그대로 쓴다. 자동 탐색(studioPlacedFixturePointNear)과
 *   격자·간격·가장자리 상수가 같아야 두 동선의 배치가 서로 겹치지 않는다.
 * - 고스트 반응: 놓을 수 있는 지점에서는 웨이브 4 B의 대표 상태 반응 프레임
 *   (studioBuildGhostReactionFrame — "켜진 조명·열린 화면")을 그대로 보여 주고,
 *   놓을 수 없는 지점에서는 같은 종류의 꺼짐·닫힘 상태 프레임(objectReactionFrame
 *   표의 counterpart)으로 바꾸고 작은 흔들림을 더한다. 새 반응을 지어내지 않는다.
 * - 점유 지점: 판정의 occupied 입력은 "이미 놓인 배치 요청 지점 + 꾸미기 배치
 *   지점"이다. 패널 자동 배치와 같은 기준이라 두 동선이 섞여도 서로를 피한다.
 *
 * 효과는 전부 고스트 오브젝트 국소 표현이다. 화면 전체 틴트·워시는 만들지 않는다.
 */
import {
  studioBuildCatalogEntryById,
  type StudioBuildPlacementRequest,
} from "./studio-virtual-space-build-mode";
import {
  studioBuildFixturePlaceable,
  studioBuildFurnitureInteractableKind,
  studioBuildGhostReactionFrame,
} from "./studio-virtual-space-build-mode-vitality";
import { snapStudioVirtualDecorPointToGrid } from "./studio-virtual-space-decoration-tools";
import { furnitureById } from "./studio-virtual-space-furniture-catalog";
import type {
  StudioInteractableObjectKind,
  StudioInteractableStateKey,
} from "./studio-virtual-space-interactable-objects";
import {
  objectReactionFrame,
  type StudioObjectReactionFrame,
} from "./studio-virtual-space-object-reaction";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { STUDIO_PLACED_FIXTURE_LIMIT } from "./studio-virtual-space-placed-fixtures";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 직접 배치 판정 격자(px). 자동 탐색·빌드 모드 고스트 스냅과 같은 값이다. */
export const STUDIO_BUILD_PLACEMENT_GRID = 16;
/** 월드 가장자리에서 안쪽으로 비워 둘 여유(px). 자동 탐색과 같은 값이다. */
export const STUDIO_BUILD_PLACEMENT_EDGE_MARGIN = 16;
/** 이미 놓인 지점과 유지할 최소 간격(px). 자동 탐색과 같은 값이다. */
export const STUDIO_BUILD_PLACEMENT_MIN_GAP = 32;

/** 배치 불가 이유. 꾸미기·빌드 확정이 이미 쓰는 어휘와 같다. */
export type StudioBuildPlacementRejection = "bounds" | "occupied" | "access" | "limit" | "invalid";

export interface StudioBuildPlacementVerdict {
  readonly ok: boolean;
  /** ok면 null, 불가면 이유 코드. */
  readonly reason: StudioBuildPlacementRejection | null;
  /** 격자에 스냅된 후보 지점. 확정하면 이 지점에 배치된다. */
  readonly point: StudioVirtualSpacePoint;
}

export interface StudioBuildPlacementVerdictInput {
  /** 꾸미기가 반영된 내비게이션 월드(패널 자동 배치가 쓰는 것과 같은 월드). */
  readonly world: StudioVirtualSpaceWorldManifest;
  readonly entryId: string;
  /** 찍은 지점(스냅 전). 판정이 격자에 스냅한다. */
  readonly point: StudioVirtualSpacePoint;
  /** 이미 놓인 지점들(배치 요청 + 꾸미기 배치). */
  readonly occupied: readonly StudioVirtualSpacePoint[];
  /** 지금까지 배치된 요청 수(상한 판정용). */
  readonly placedCount: number;
}

/**
 * 찍은 지점에 이 가구를 놓을 수 있는지를 판정한다.
 * 고정물 층에 닿지 않는 가구(커피 머신 등)는 좌표와 무관하게 invalid다 —
 * 패널 목록 기준(studioBuildFixturePlaceable)과 같은 판정이다.
 */
export function studioBuildPlacementVerdict(input: StudioBuildPlacementVerdictInput): StudioBuildPlacementVerdict {
  const point = snapStudioVirtualDecorPointToGrid(input.point, STUDIO_BUILD_PLACEMENT_GRID);
  const done = (ok: boolean, reason: StudioBuildPlacementRejection | null): StudioBuildPlacementVerdict =>
    Object.freeze({ ok, reason, point });
  if (!studioBuildFixturePlaceable(input.entryId)) return done(false, "invalid");
  if (input.placedCount >= STUDIO_PLACED_FIXTURE_LIMIT) return done(false, "limit");
  const { world } = input;
  if (point.x < STUDIO_BUILD_PLACEMENT_EDGE_MARGIN || point.y < STUDIO_BUILD_PLACEMENT_EDGE_MARGIN
    || point.x > world.width - STUDIO_BUILD_PLACEMENT_EDGE_MARGIN
    || point.y > world.height - STUDIO_BUILD_PLACEMENT_EDGE_MARGIN) return done(false, "bounds");
  if (input.occupied.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < STUDIO_BUILD_PLACEMENT_MIN_GAP)) {
    return done(false, "occupied");
  }
  if (!studioWorldCanOccupy(world, point)) return done(false, "access");
  return done(true, null);
}

/** 배치 불가 이유의 안내 문구. 패널 상태 줄과 확정 거부 안내가 공유한다. */
export function studioBuildPlacementRejectionText(
  reason: StudioBuildPlacementRejection,
): { readonly ko: string; readonly en: string } {
  switch (reason) {
    case "bounds": return Object.freeze({ ko: "월드 가장자리에는 놓을 수 없어요.", en: "Too close to the edge of the world." });
    case "occupied": return Object.freeze({ ko: "다른 가구와 너무 가까워요.", en: "Too close to another piece of furniture." });
    case "access": return Object.freeze({ ko: "그 지점에는 놓을 수 없어요.", en: "That spot can't hold furniture." });
    case "limit": return Object.freeze({ ko: `배치 상한(${STUDIO_PLACED_FIXTURE_LIMIT}개)에 닿았어요.`, en: `You've reached the placement limit (${STUDIO_PLACED_FIXTURE_LIMIT}).` });
    case "invalid": return Object.freeze({ ko: "이 가구는 직접 배치할 수 없어요.", en: "This item can't be placed directly." });
  }
}

/** 종류별 "꺼짐·닫힘" counterpart 상태 — 불가 고스트가 보여 줄 반응 표 항목. */
const GHOST_COUNTERPART_STATE: Readonly<Partial<Record<StudioInteractableObjectKind, StudioInteractableStateKey>>> = Object.freeze({
  "light-switch": "light:off",
  whiteboard: "media:closed",
  youtube: "media:closed",
  "coffee-machine": "coffee:idle",
});

/** counterpart 반응도 전이가 끝난 상태로 본다(고스트 대표 상태와 같은 기준). */
const GHOST_COUNTERPART_SETTLED_MS = 60_000;

/** 불가 지점에서 고스트가 흔들리는 폭(px). reducedMotion이면 0이다. */
export const STUDIO_BUILD_GHOST_SHAKE_PX = 2;

export interface StudioBuildPlacementGhostFrame {
  /** 고스트가 보여 줄 반응 프레임. 반응 없는 가구면 null이다. */
  readonly reaction: StudioObjectReactionFrame | null;
  /** 상태 머신 종류. 렌더러가 실루엣을 고를 때 쓴다. */
  readonly kind: StudioInteractableObjectKind | null;
  readonly valid: boolean;
  /** 불가 지점의 흔들림 오프셋(px). 가능 지점·모션 줄이기에서는 0이다. */
  readonly shakeX: number;
}

/**
 * 배치 중 고스트의 반응 프레임을 고른다.
 * 가능 지점: 대표 상태 반응 프레임(켜짐·열림) 그대로 — 안정적이다.
 * 불가 지점: 같은 종류의 꺼짐·닫힘 프레임으로 바꾸고(빛·열림이 사라진다)
 * now 기준 결정적 흔들림을 더한다.
 */
export function studioBuildPlacementGhostFrame(input: {
  readonly entryId: string;
  readonly ok: boolean;
  readonly now: number;
  readonly reducedMotion: boolean;
}): StudioBuildPlacementGhostFrame {
  const now = Number.isFinite(input.now) ? input.now : 0;
  const entry = studioBuildCatalogEntryById(input.entryId);
  const spec = entry ? furnitureById(entry.refId) : null;
  const kind = spec ? studioBuildFurnitureInteractableKind(spec.kind) : null;
  if (input.ok) {
    return Object.freeze({
      reaction: studioBuildGhostReactionFrame(input.entryId, now, input.reducedMotion),
      kind,
      valid: true,
      shakeX: 0,
    });
  }
  const counterpart = kind ? GHOST_COUNTERPART_STATE[kind] : undefined;
  const reaction = kind && counterpart
    ? objectReactionFrame({ kind, stateKey: counterpart, stateChangedAt: now - GHOST_COUNTERPART_SETTLED_MS }, now, input.reducedMotion)
    : null;
  return Object.freeze({
    reaction,
    kind,
    valid: false,
    shakeX: input.reducedMotion ? 0 : Math.sin(now / 40) * STUDIO_BUILD_GHOST_SHAKE_PX,
  });
}

/** 캔버스 → 페이지 배치 이벤트. 확정은 배치 요청을, 거부는 이유를 싣는다. */
export type StudioBuildPlacementEvent =
  | { readonly type: "confirm"; readonly request: StudioBuildPlacementRequest }
  | { readonly type: "rejected"; readonly reason: StudioBuildPlacementRejection }
  | { readonly type: "cancelled" }
  | { readonly type: "verdict"; readonly verdict: StudioBuildPlacementVerdict };

/** 패널이 소비하는 배치 세션 바인딩. 페이지 훅이 만들어 패널에 내려준다. */
export interface StudioBuildPlacementPanelBinding {
  /** 직접 배치 중인 카탈로그 항목 id. 세션이 없으면 null이다. */
  readonly sessionEntryId: string | null;
  /** 조준 중인 지점의 판정 안내(가능/불가 이유). */
  readonly statusText: { readonly ko: string; readonly en: string } | null;
  /** 확정 거부가 있었을 때의 안내. */
  readonly noticeText: { readonly ko: string; readonly en: string } | null;
  readonly onStart: (entryId: string) => void;
  readonly onCancel: () => void;
}
