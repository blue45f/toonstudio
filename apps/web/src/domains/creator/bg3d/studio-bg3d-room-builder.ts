// "3D 배경" 도구의 SketchUp 스타일 간이 블로킹 모델러 — 바닥+벽 4면(두께/높이), 벽별 문/창
// 오프닝, 계단·기둥·가구 프리미티브를 "수치 파라미터"로 절차 생성한다.
//
// 설계 결정(§씬 템플릿과의 관계): studio-background-3d-scene-templates.ts의 교실/카페 템플릿은
// 좌표가 하드코딩된 "완성형 공간"이라 크기·문 위치를 바꿀 수 없다. 이 모듈은 같은 13종
// PRIMITIVE_DEFS 지오메트리만 재사용하되(새 지오메트리·외부 에셋 없음 — 라이선스/번들 영향 0),
// 방 치수와 오프닝을 파라미터로 받아 매번 새로 계산한다. 결과는 기존 BgPrimitive[]로 전개되어
// 장면 문서의 primitive 노드로 그대로 저장된다 — 새 문서 스키마 개념을 만들지 않는다
// (studio-bg3d-scene-document.ts v3의 정규화·버전 계약을 그대로 상속).
//
// 좌표 계약: 방 중심이 원점, 바닥 윗면이 y=0. 벽은 축 정렬(북=-Z, 남=+Z, 서=-X, 동=+X)이며
// 기존 템플릿과 동일하게 둘레 선 위에 중심을 둔다(모서리 겹침 허용 — 시각적으로 무해).
// 가구 파츠는 yaw(월드 Y) 회전만 사용하므로 오일러 합성 없이 rotation[1] 덧셈이 정확하다
// (지붕처럼 X/Z축이 이미 튼 파츠가 없다는 것이 이 단순화의 전제 — 카탈로그에 그런 파츠를 추가하려면
// scene-templates의 rotateEulerYaw 방식으로 바꿔야 한다).

import { uid } from "../studio-id";

import {
  STUDIO_BG3D_ROOM_FURNITURE_KINDS,
  STUDIO_BG3D_ROOM_FURNITURE_LABELS,
  rotateStudioBg3dRoomYaw,
  studioBg3dRoomFurnitureParts,
  type StudioBg3dRoomFurnitureKind,
} from "./studio-bg3d-room-furniture";
import {
  buildStudioBg3dRoomOpeningParts,
  clampStudioBg3dRoomOpeningStyleFields,
  studioBg3dRoomWallFrame,
  type StudioBg3dOpeningHinge,
  type StudioBg3dOpeningStyle,
  type StudioBg3dRoomWallFrame,
} from "./studio-bg3d-room-openings";
import {
  buildStudioBg3dRoomCeilingParts,
  buildStudioBg3dRoomTrimParts,
  clampStudioBg3dRoomCeiling,
  clampStudioBg3dRoomTrims,
  evaluateStudioBg3dRoomCeilingCutaway,
  type StudioBg3dRoomCeilingStyle,
  type StudioBg3dRoomTrims,
} from "./studio-bg3d-room-trims";

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";
import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document-types";

// 가구 카탈로그는 별도 모듈로 옮겼다(800줄 한도). 기존 가져오기 경로를 유지하려고 다시 내보낸다.
export { STUDIO_BG3D_ROOM_FURNITURE_KINDS, STUDIO_BG3D_ROOM_FURNITURE_LABELS };
export type { StudioBg3dRoomFurnitureKind };

export const STUDIO_BG3D_ROOM_WALL_IDS = ["north", "south", "west", "east"] as const;
export type StudioBg3dRoomWallId = (typeof STUDIO_BG3D_ROOM_WALL_IDS)[number];

export const STUDIO_BG3D_ROOM_WALL_LABELS: Record<StudioBg3dRoomWallId, string> = {
  north: "뒷벽",
  south: "앞벽",
  west: "왼벽",
  east: "오른벽",
};

/** 벽체 파츠 이름은 `${벽 이름표}${이 접미}` 다(예: "앞벽 벽체"). 안내 문구가 숨긴 벽을 이름으로 묶을 때 쓴다. */
export const STUDIO_BG3D_ROOM_WALL_PART_SUFFIX = " 벽체";

export type StudioBg3dRoomOpeningType = "door" | "window";

export interface StudioBg3dRoomOpening {
  readonly wall: StudioBg3dRoomWallId;
  readonly type: StudioBg3dRoomOpeningType;
  /** 벽 중심 기준 좌우 오프셋(m). 벽을 안(방 내부)에서 바라볼 때 +가 오른쪽. */
  readonly centerOffset: number;
  readonly width: number;
  readonly height: number;
  /** 바닥에서 오프닝 하단까지 높이(m). 문은 0으로 강제된다. */
  readonly sillHeight: number;
  // 아래 넷은 선택 필드다(없으면 예전과 같은 빈 구멍) — studio-bg3d-room-openings.ts.
  readonly style?: StudioBg3dOpeningStyle;
  /** 0 = 닫힘(블라인드·셔터는 끝까지 내림), 1 = 가장 많이 열림. 없으면 스타일 기본값. */
  readonly openRatio?: number;
  /** 경첩 쪽(미닫이는 들어가는 쪽, 미서기는 움직이는 짝 쪽). 안에서 볼 때 기준, 없으면 왼쪽. */
  readonly hinge?: StudioBg3dOpeningHinge;
  /** 짝 수. 없으면 폭으로 정한다. */
  readonly divisions?: number;
}

export interface StudioBg3dRoomFurnitureItem {
  readonly kind: StudioBg3dRoomFurnitureKind;
  /** 방-로컬 배치 좌표(m). 방 중심이 (0, 0). */
  readonly x: number;
  readonly z: number;
  /** 월드 Y축 요 회전(도). 파츠가 전부 yaw-only라 단순 덧셈 합성이 정확하다. */
  readonly yawDeg: number;
}

export interface StudioBg3dRoomSpec {
  readonly width: number;
  readonly depth: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly floorColor: string;
  readonly wallColor: string;
  readonly openings: readonly StudioBg3dRoomOpening[];
  readonly furniture: readonly StudioBg3dRoomFurnitureItem[];
  /** 선택 필드. 없으면 천장 없음(예전과 같은 출력) — studio-bg3d-room-trims.ts. */
  readonly ceiling?: StudioBg3dRoomCeilingStyle;
  /** 선택 필드. 없으면 몰딩 없음. */
  readonly trims?: StudioBg3dRoomTrims;
}

export interface StudioBg3dRoomPart {
  readonly kind: BgPrimitiveKind;
  readonly name: string;
  /** 벽에 붙은 파츠(벽체·문·창·몰딩)가 속한 벽(바닥·가구는 없음). 자동 단면이 벽 단위로 숨길 때 쓴다. */
  readonly wall?: StudioBg3dRoomWallId;
  /** 천장 판·보. 자동 단면이 위에서 내려다보는 카메라 쪽 천장을 숨길 때 쓴다. */
  readonly ceiling?: true;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: string;
  /** 유리처럼 색만으로 나타낼 수 없는 부품의 재질(기존 문서 필드). */
  readonly materialOverride?: StudioBg3dMaterialOverride;
}

export const STUDIO_BG3D_ROOM_LIMITS = Object.freeze({
  minWidth: 2,
  maxWidth: 30,
  minDepth: 2,
  maxDepth: 30,
  minWallHeight: 1,
  maxWallHeight: 10,
  minWallThickness: 0.05,
  maxWallThickness: 0.6,
  maxOpenings: 12,
  maxFurniture: 24,
  /** 오프닝 좌우와 벽 끝 사이에 남겨야 하는 최소 벽체(m). */
  openingEdgeMargin: 0.1,
  /** 오프닝 상단과 벽 상단 사이 최소 벽체(m) — 인방(헤더)이 0 두께로 사라지지 않게. */
  openingHeadMargin: 0.1,
  floorThickness: 0.1,
});

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function clampColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

/**
 * 임의 입력을 렌더 가능한 안전 범위로 눌러 담는다. 실패-열림 없이 항상 유효한 스펙을 돌려준다
 * (scene-document의 boundedNumber 철학과 동일 — 슬라이더/숫자 입력의 중간 상태도 안전).
 * 오프닝은 여기서 개별 클램프만 하고, 벽 안에 실제로 들어가는지는 layout 단계에서 다시 검사한다
 * (벽 길이가 함께 바뀌면 클램프 시점의 판단이 무효가 되므로 최종 판정은 한 곳에만 둔다).
 */
export function clampStudioBg3dRoomSpec(raw: Partial<StudioBg3dRoomSpec> | null | undefined): StudioBg3dRoomSpec {
  const limits = STUDIO_BG3D_ROOM_LIMITS;
  const source = raw ?? {};
  const width = clampNumber(source.width, 6, limits.minWidth, limits.maxWidth);
  const depth = clampNumber(source.depth, 5, limits.minDepth, limits.maxDepth);
  const wallHeight = clampNumber(source.wallHeight, 2.6, limits.minWallHeight, limits.maxWallHeight);
  const wallThickness = clampNumber(
    source.wallThickness,
    0.15,
    limits.minWallThickness,
    limits.maxWallThickness,
  );
  const openings = (Array.isArray(source.openings) ? source.openings : [])
    .slice(0, limits.maxOpenings)
    .filter((opening): opening is StudioBg3dRoomOpening =>
      !!opening &&
      (STUDIO_BG3D_ROOM_WALL_IDS as readonly string[]).includes(opening.wall) &&
      (opening.type === "door" || opening.type === "window"))
    .map((opening) => {
      const wallLength = opening.wall === "north" || opening.wall === "south" ? width : depth;
      const maxOpeningWidth = Math.max(0.3, wallLength - limits.openingEdgeMargin * 2);
      const openingWidth = clampNumber(opening.width, 0.9, 0.3, maxOpeningWidth);
      const sillHeight = opening.type === "door"
        ? 0
        : clampNumber(opening.sillHeight, 0.9, 0.1, Math.max(0.1, wallHeight - 0.4));
      const maxOpeningHeight = Math.max(0.2, wallHeight - sillHeight - limits.openingHeadMargin);
      const height = clampNumber(
        opening.height,
        opening.type === "door" ? 2 : 1.1,
        0.2,
        maxOpeningHeight,
      );
      const halfSpan = wallLength / 2 - limits.openingEdgeMargin - openingWidth / 2;
      const centerOffset = clampNumber(opening.centerOffset, 0, -Math.max(0, halfSpan), Math.max(0, halfSpan));
      return {
        wall: opening.wall,
        type: opening.type,
        centerOffset,
        width: openingWidth,
        height,
        sillHeight,
        ...clampStudioBg3dRoomOpeningStyleFields(opening, opening.type),
      };
    });
  const furniture = (Array.isArray(source.furniture) ? source.furniture : [])
    .slice(0, limits.maxFurniture)
    .filter((item): item is StudioBg3dRoomFurnitureItem =>
      !!item && (STUDIO_BG3D_ROOM_FURNITURE_KINDS as readonly string[]).includes(item.kind))
    .map((item) => ({
      kind: item.kind,
      x: clampNumber(item.x, 0, -width / 2, width / 2),
      z: clampNumber(item.z, 0, -depth / 2, depth / 2),
      yawDeg: clampNumber(item.yawDeg, 0, -360, 360),
    }));
  // 천장·몰딩은 선택 필드라 값이 있을 때만 키를 만든다(없는 스펙의 clamp 결과는 예전과 같다).
  const ceiling = clampStudioBg3dRoomCeiling(source.ceiling);
  const trims = clampStudioBg3dRoomTrims(source.trims);
  return {
    width,
    depth,
    wallHeight,
    wallThickness,
    floorColor: clampColor(source.floorColor, "#d9c9a3"),
    wallColor: clampColor(source.wallColor, "#f2ead8"),
    openings,
    furniture,
    ...(ceiling === undefined ? {} : { ceiling }),
    ...(trims === undefined ? {} : { trims }),
  };
}

// ── 벽 세그먼트 레이아웃(불리언 컷 코어) ──────────────────────────────────────
// 벽 하나를 로컬 u축(길이 L, u=0이 벽 중심)·y축(높이 H) 평면에서 본다. 오프닝마다 벽을
// [좌측 솔리드 | (창턱) 오프닝 (인방) | 우측 솔리드]로 쪼갠다 — CSG 없이 박스 조합만으로
// SketchUp의 "벽에 구멍 뚫기"와 같은 결과를 만든다.

export interface StudioBg3dWallSegment {
  /** 세그먼트 중심 u(m, 벽 중심 기준). */
  readonly centerU: number;
  /** 세그먼트 중심 y(m, 바닥 기준). */
  readonly centerY: number;
  readonly lengthU: number;
  readonly height: number;
}

type WallOpeningGeometry = Pick<StudioBg3dRoomOpening, "centerOffset" | "width" | "height" | "sillHeight">;

/** 벽 세그먼트 레이아웃이 받아들인 개구부와 그 사각형(벽-로컬 u·y). 부품(문틀·창짝)과 몰딩 끊김이 같은 판정을 쓴다. */
export interface StudioBg3dAcceptedWallOpening<T extends WallOpeningGeometry = StudioBg3dRoomOpening> {
  readonly opening: T;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

const EPSILON = 1e-6;

/**
 * clamp를 통과한 오프닝이라도 벽 길이가 스펙 변경으로 줄었거나 서로 겹치면 여기서 탈락한다
 * (먼저 온 오프닝 우선 — 결정적). 결과는 centerOffset 오름차순이다.
 */
export function acceptStudioBg3dWallOpenings<T extends WallOpeningGeometry>(
  wallLength: number,
  wallHeight: number,
  openings: readonly T[],
): StudioBg3dAcceptedWallOpening<T>[] {
  const margin = STUDIO_BG3D_ROOM_LIMITS.openingEdgeMargin;
  const accepted: StudioBg3dAcceptedWallOpening<T>[] = [];
  const sorted = [...openings].sort((a, b) => a.centerOffset - b.centerOffset);
  for (const opening of sorted) {
    const left = opening.centerOffset - opening.width / 2;
    const right = opening.centerOffset + opening.width / 2;
    const bottom = Math.max(0, opening.sillHeight);
    const top = Math.min(wallHeight - STUDIO_BG3D_ROOM_LIMITS.openingHeadMargin, bottom + opening.height);
    if (left < -wallLength / 2 + margin - EPSILON) continue;
    if (right > wallLength / 2 - margin + EPSILON) continue;
    if (top - bottom < 0.05) continue;
    if (accepted.some((prev) => left < prev.right + EPSILON && right > prev.left - EPSILON)) continue;
    accepted.push({ opening, left, right, bottom, top });
  }
  return accepted;
}

/** 반환 세그먼트는 u 오름차순 → 같은 오프닝의 창턱 → 인방 순. */
export function layoutStudioBg3dWallSegments(
  wallLength: number,
  wallHeight: number,
  openings: readonly WallOpeningGeometry[],
): StudioBg3dWallSegment[] {
  const accepted = acceptStudioBg3dWallOpenings(wallLength, wallHeight, openings);

  const segments: StudioBg3dWallSegment[] = [];
  let cursor = -wallLength / 2;
  for (const opening of accepted) {
    if (opening.left - cursor > EPSILON) {
      const lengthU = opening.left - cursor;
      segments.push({
        centerU: cursor + lengthU / 2,
        centerY: wallHeight / 2,
        lengthU,
        height: wallHeight,
      });
    }
    if (opening.bottom > EPSILON) {
      segments.push({
        centerU: (opening.left + opening.right) / 2,
        centerY: opening.bottom / 2,
        lengthU: opening.right - opening.left,
        height: opening.bottom,
      });
    }
    if (wallHeight - opening.top > EPSILON) {
      segments.push({
        centerU: (opening.left + opening.right) / 2,
        centerY: opening.top + (wallHeight - opening.top) / 2,
        lengthU: opening.right - opening.left,
        height: wallHeight - opening.top,
      });
    }
    cursor = opening.right;
  }
  if (wallLength / 2 - cursor > EPSILON) {
    const lengthU = wallLength / 2 - cursor;
    segments.push({
      centerU: cursor + lengthU / 2,
      centerY: wallHeight / 2,
      lengthU,
      height: wallHeight,
    });
  }
  return segments;
}

// ── 벽 → 월드 배치 ────────────────────────────────────────────────────────────
// "안(방 내부)에서 벽을 바라볼 때 +u가 오른쪽" 규약: 북벽은 +u=+x, 남벽은 +u=-x,
// 서벽은 +u=-z, 동벽은 +u=+z. 이렇게 하면 UI의 "좌/우" 오프셋이 어느 벽에서도 직관과 일치한다.
// 계산식은 벽 틀(studioBg3dRoomWallFrame, 개구부 모듈)이 한곳에 갖고 벽체·문창 부품·몰딩이 같이 쓴다.

function wallFrames(spec: StudioBg3dRoomSpec): Record<StudioBg3dRoomWallId, StudioBg3dRoomWallFrame> {
  const frame = (wall: StudioBg3dRoomWallId) => studioBg3dRoomWallFrame(wall, spec.width, spec.depth, spec.wallThickness);
  return { north: frame("north"), south: frame("south"), west: frame("west"), east: frame("east") };
}

// ── 방 전체 파츠 생성 ─────────────────────────────────────────────────────────

/**
 * 라디안 각도를 장면 문서의 정규형 [-π, π) 으로 바꾼다. 문서 정규화(scene-document 의 normalizedRotation)와
 * 같은 식이며, 엄격한 컷 포착(captureStudioBg3dShot)은 정규형이 아닌 회전(예: 정확히 π)을 거부하므로
 * 방 파츠가 처음부터 정규형이 되게 한다. 일부 각도(예: 음수 15° 배수)는 식을 한 번 적용해도 부동소수점
 * 오차로 고정점이 되지 않아, 값이 더 바뀌지 않을 때까지 되풀이한다(최대 4회).
 */
export function canonicalStudioBg3dRoomYaw(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  const turn = Math.PI * 2;
  let angle = radians;
  for (let step = 0; step < 4; step += 1) {
    const wrapped = ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
    if (wrapped === angle) return wrapped;
    angle = wrapped;
  }
  return angle;
}

export function buildStudioBg3dRoomParts(rawSpec: Partial<StudioBg3dRoomSpec>): StudioBg3dRoomPart[] {
  const spec = clampStudioBg3dRoomSpec(rawSpec);
  const parts: StudioBg3dRoomPart[] = [];
  const floorThickness = STUDIO_BG3D_ROOM_LIMITS.floorThickness;

  parts.push({
    kind: "box",
    name: "바닥",
    position: [0, -floorThickness / 2, 0],
    rotation: [0, 0, 0],
    scale: [spec.width, floorThickness, spec.depth],
    color: spec.floorColor,
  });

  const frames = wallFrames(spec);
  for (const wall of STUDIO_BG3D_ROOM_WALL_IDS) {
    const frame = frames[wall];
    const segments = layoutStudioBg3dWallSegments(
      frame.length,
      spec.wallHeight,
      spec.openings.filter((opening) => opening.wall === wall),
    );
    for (const segment of segments) {
      const [x, z] = frame.toWorld(segment.centerU, 0);
      parts.push({
        kind: "box",
        name: `${STUDIO_BG3D_ROOM_WALL_LABELS[wall]}${STUDIO_BG3D_ROOM_WALL_PART_SUFFIX}`,
        wall,
        position: [x, segment.centerY, z],
        rotation: [0, 0, 0],
        scale: frame.alongX
          ? [segment.lengthU, segment.height, spec.wallThickness]
          : [spec.wallThickness, segment.height, segment.lengthU],
        color: spec.wallColor,
      });
    }
  }

  // 문·창 부품과 몰딩은 벽 세그먼트와 같은 개구부 판정을 쓴다. 스타일·몰딩·천장이 없는 스펙에서는 아무것도 더하지 않는다.
  const accept = (wall: StudioBg3dRoomWallId) => acceptStudioBg3dWallOpenings(
    frames[wall].length,
    spec.wallHeight,
    spec.openings.filter((opening) => opening.wall === wall),
  );
  const openingsByWall: Record<StudioBg3dRoomWallId, StudioBg3dAcceptedWallOpening[]> = {
    north: accept("north"),
    south: accept("south"),
    west: accept("west"),
    east: accept("east"),
  };
  for (const wall of STUDIO_BG3D_ROOM_WALL_IDS) {
    const frame = frames[wall];
    // 옆벽 안쪽 면 사이(모서리에서 옆벽 두께만큼 뺀 구간)에만 부품을 둔다.
    const innerSpan = [-frame.length / 2 + spec.wallThickness / 2, frame.length / 2 - spec.wallThickness / 2] as const;
    for (const accepted of openingsByWall[wall]) {
      parts.push(...buildStudioBg3dRoomOpeningParts({
        frame,
        wallLabel: STUDIO_BG3D_ROOM_WALL_LABELS[wall],
        opening: accepted.opening,
        rect: accepted,
        innerSpan,
      }));
    }
  }
  if (spec.trims) {
    parts.push(...buildStudioBg3dRoomTrimParts({
      frames,
      wallLabels: STUDIO_BG3D_ROOM_WALL_LABELS,
      walls: STUDIO_BG3D_ROOM_WALL_IDS,
      wallHeight: spec.wallHeight,
      openingsByWall,
      trims: spec.trims,
    }));
  }
  if (spec.ceiling) {
    parts.push(...buildStudioBg3dRoomCeilingParts({
      width: spec.width,
      depth: spec.depth,
      wallThickness: spec.wallThickness,
      wallHeight: spec.wallHeight,
      style: spec.ceiling,
    }));
  }

  for (const item of spec.furniture) {
    const yawRad = (item.yawDeg * Math.PI) / 180;
    // 위치는 원래 각도로 돌리고, 문서에 쓰는 회전값만 문서 정규형으로 바꾼다(방향은 같다).
    const documentYaw = canonicalStudioBg3dRoomYaw(yawRad);
    for (const part of studioBg3dRoomFurnitureParts(item.kind, spec.wallHeight)) {
      const rotated = rotateStudioBg3dRoomYaw(part.offset, yawRad);
      parts.push({
        kind: part.kind,
        name: part.name,
        position: [item.x + rotated[0], rotated[1], item.z + rotated[2]],
        rotation: [0, documentYaw, 0],
        scale: [...part.scale] as [number, number, number],
        color: part.color,
      });
    }
  }

  return parts;
}

// ── 자동 단면(카메라 쪽 벽 숨김) ──────────────────────────────────────────────
// 방 밖에서 안을 바라보는 카메라 쪽 벽은 시선을 가려, 방을 추가해도 첫 화면에서 바깥 벽만 보인다.
// 이 규칙은 scene-3d/studio-3d-room-builder-v2.ts(2026-10-16 삭제)의 evaluateAutoCutawayWalls 를
// 옮겨 온 것이다 — v2 는 테스트에서만 쓰이는 모듈이었고, 쓸모 있는 고유 로직은 이 판정뿐이었다.
//
// 판정(벽마다): 카메라가 그 벽 바깥 면 쪽에 있고, 바라보는 점(초점)이 카메라보다 방 안쪽이면 그 벽을
// 가린다. 높이 조건(v2 에는 없던 보강): 카메라가 낮은 난간 위에서 내려다봐 시선이 벽 윗단 위로 지나가면
// 그 벽은 시선을 가리지 않으므로 숨기지 않는다(옥상 난간을 지우지 않기 위함).
//
// 결과는 "생성 시점의 한 번 판정"이다. 가려진 벽은 지우지 않고 visible:false 로 만들어 레이어 목록의
// 눈 아이콘으로 되살릴 수 있고, 이후 카메라를 옮겨도 다시 계산하지 않는다(문서에 방 단위 개념이 없다).

type RoomVec3 = readonly [number, number, number];

export interface StudioBg3dRoomCutawayInput {
  /** 방 중심이 원점인 방-로컬 좌표의 카메라 위치. */
  readonly cameraPosition: RoomVec3;
  /** 방-로컬 좌표의 초점(오빗 타깃). */
  readonly focusPoint: RoomVec3;
  readonly roomWidth: number;
  readonly roomDepth: number;
  /** 주어지면 시선이 벽 윗단 위로 지나는 낮은 벽은 가리지 않는다. */
  readonly wallHeight?: number;
}

/** 카메라→초점 선분이 벽 평면(axis: 0=X, 2=Z)을 지나는 높이가 벽 윗단보다 높은지. */
function sightlinePassesAboveWall(
  camera: RoomVec3,
  focus: RoomVec3,
  axis: 0 | 2,
  planeCoordinate: number,
  wallHeight: number | undefined,
): boolean {
  if (wallHeight === undefined) return false;
  const span = focus[axis] - camera[axis];
  if (span === 0) return false;
  const t = (planeCoordinate - camera[axis]) / span;
  // 선분이 평면에 닿지 않으면(초점이 평면 앞) 높이 판단을 하지 않고 기본 판정을 따른다.
  if (!(t > 0 && t <= 1)) return false;
  return camera[1] + t * (focus[1] - camera[1]) > wallHeight + 1e-9;
}

export function evaluateStudioBg3dRoomAutoCutaway(
  input: StudioBg3dRoomCutawayInput,
): ReadonlySet<StudioBg3dRoomWallId> {
  const { cameraPosition: camera, focusPoint: focus, roomWidth, roomDepth, wallHeight } = input;
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;
  const cut = new Set<StudioBg3dRoomWallId>();
  if (![...camera, ...focus, roomWidth, roomDepth].every(Number.isFinite)) return cut;
  if (camera[2] > halfDepth && focus[2] < camera[2] &&
    !sightlinePassesAboveWall(camera, focus, 2, halfDepth, wallHeight)) cut.add("south");
  if (camera[2] < -halfDepth && focus[2] > camera[2] &&
    !sightlinePassesAboveWall(camera, focus, 2, -halfDepth, wallHeight)) cut.add("north");
  if (camera[0] > halfWidth && focus[0] < camera[0] &&
    !sightlinePassesAboveWall(camera, focus, 0, halfWidth, wallHeight)) cut.add("east");
  if (camera[0] < -halfWidth && focus[0] > camera[0] &&
    !sightlinePassesAboveWall(camera, focus, 0, -halfWidth, wallHeight)) cut.add("west");
  return cut;
}

export interface StudioBg3dRoomBuildOptions {
  /** 주어지면 이 카메라(월드 좌표) 기준으로 자동 단면을 판정해 가려지는 벽을 숨김 상태로 만든다. */
  readonly autoCutawayCamera?: {
    readonly position: RoomVec3;
    readonly target: RoomVec3;
  } | null;
}

export interface StudioBg3dRoomBuildPlan {
  readonly primitives: BgPrimitive[];
  /** 숨김 상태로 만든 벽(북·남·서·동 순). 자동 단면을 쓰지 않았거나 가릴 벽이 없으면 빈 배열. */
  readonly hiddenWalls: readonly StudioBg3dRoomWallId[];
  /** 위에서 내려다보는 카메라 때문에 천장(판·보)을 숨겼을 때만 true 로 있다(없으면 숨기지 않았다). */
  readonly hiddenCeiling?: true;
  /** 기존 도형과 겹치지 않도록 방 전체에 더한 X 오프셋(m). */
  readonly anchorX: number;
}

/**
 * 씬 템플릿과 같은 "결정적 X 오프셋 + uid" 전개. 테스트는 idFactory를 주입해 완전 결정적으로
 * 검증한다(프로덕션 ID는 공용 UUID 계약을 쓰며 지오메트리에는 영향 없음). 자동 단면 카메라를 주면
 * 오프셋을 뺀 방-로컬 좌표로 판정해 가려지는 벽의 모든 벽체를 visible:false 로 만든다.
 */
export function planStudioBg3dRoomBuild(
  spec: Partial<StudioBg3dRoomSpec>,
  existingCount: number,
  idFactory: () => string = uid,
  options: StudioBg3dRoomBuildOptions = {},
): StudioBg3dRoomBuildPlan {
  const clamped = clampStudioBg3dRoomSpec(spec);
  const anchorX = existingCount > 0 ? existingCount * (clamped.width / 6) : 0;
  const camera = options.autoCutawayCamera;
  // 카메라 값이 비정상이면(배열이 아님 등) 단면 없이 만든다 — 방 추가 자체가 막히면 안 된다.
  const local = camera && Array.isArray(camera.position) && Array.isArray(camera.target)
    ? {
        cameraPosition: [camera.position[0] - anchorX, camera.position[1], camera.position[2]] as const,
        focusPoint: [camera.target[0] - anchorX, camera.target[1], camera.target[2]] as const,
      }
    : null;
  const hidden: ReadonlySet<StudioBg3dRoomWallId> = local
    ? evaluateStudioBg3dRoomAutoCutaway({
        ...local,
        roomWidth: clamped.width,
        roomDepth: clamped.depth,
        wallHeight: clamped.wallHeight,
      })
    : new Set();
  const hideCeiling = local !== null && clamped.ceiling !== undefined && clamped.ceiling !== "none" &&
    evaluateStudioBg3dRoomCeilingCutaway({
      ...local,
      roomWidth: clamped.width,
      roomDepth: clamped.depth,
      wallThickness: clamped.wallThickness,
      wallHeight: clamped.wallHeight,
    });
  const primitives = buildStudioBg3dRoomParts(clamped).map((part): BgPrimitive => ({
    id: idFactory(),
    kind: part.kind,
    name: part.name,
    position: [part.position[0] + anchorX, part.position[1], part.position[2]],
    rotation: [...part.rotation] as [number, number, number],
    scale: [...part.scale] as [number, number, number],
    color: part.color,
    ...(part.materialOverride ? { materialOverride: { ...part.materialOverride } } : {}),
    ...((part.wall !== undefined && hidden.has(part.wall)) || (part.ceiling && hideCeiling) ? { visible: false } : {}),
  }));
  return {
    primitives,
    hiddenWalls: STUDIO_BG3D_ROOM_WALL_IDS.filter((wall) => hidden.has(wall)),
    ...(hideCeiling ? { hiddenCeiling: true as const } : {}),
    anchorX,
  };
}

export function instantiateStudioBg3dRoomBuild(
  spec: Partial<StudioBg3dRoomSpec>,
  existingCount: number,
  idFactory: () => string = uid,
): BgPrimitive[] {
  return planStudioBg3dRoomBuild(spec, existingCount, idFactory).primitives;
}

// ── 프리셋 ────────────────────────────────────────────────────────────────────
// 씬 템플릿(고정 좌표 완성 공간)과 달리, 여기 프리셋은 "시작점 스펙"이다 — 적용 후에도 모든
// 수치를 계속 조정할 수 있다. 의자는 앞면이 +z 라(등받이가 -z) 테이블의 남쪽(+z)에 놓으면 yaw 180,
// 북쪽에 놓으면 yaw 0 이어야 테이블을 본다 — 모든 프리셋에서 시험이 고정한다.

export interface StudioBg3dRoomPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly spec: StudioBg3dRoomSpec;
}

export const STUDIO_BG3D_ROOM_PRESETS: readonly StudioBg3dRoomPreset[] = [
  {
    id: "classroom",
    label: "교실",
    description: "8×7m · 앞문/뒷문 · 창 3개 · 책상 열",
    spec: clampStudioBg3dRoomSpec({
      width: 8,
      depth: 7,
      wallHeight: 3,
      wallThickness: 0.15,
      floorColor: "#d9c9a3",
      wallColor: "#f2ead8",
      openings: [
        { wall: "south", type: "door", centerOffset: -2.8, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "south", type: "door", centerOffset: 2.8, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "east", type: "window", centerOffset: -2, width: 1.5, height: 1.1, sillHeight: 1 },
        { wall: "east", type: "window", centerOffset: 0, width: 1.5, height: 1.1, sillHeight: 1 },
        { wall: "east", type: "window", centerOffset: 2, width: 1.5, height: 1.1, sillHeight: 1 },
      ],
      furniture: [
        { kind: "table", x: -1.8, z: -0.6, yawDeg: 0 },
        { kind: "chair", x: -1.8, z: 0.1, yawDeg: 180 },
        { kind: "table", x: 0, z: -0.6, yawDeg: 0 },
        { kind: "chair", x: 0, z: 0.1, yawDeg: 180 },
        { kind: "table", x: 1.8, z: -0.6, yawDeg: 0 },
        { kind: "chair", x: 1.8, z: 0.1, yawDeg: 180 },
        { kind: "table", x: -1.8, z: 1.2, yawDeg: 0 },
        { kind: "chair", x: -1.8, z: 1.9, yawDeg: 180 },
        { kind: "table", x: 0, z: 1.2, yawDeg: 0 },
        { kind: "chair", x: 0, z: 1.9, yawDeg: 180 },
        { kind: "table", x: 1.8, z: 1.2, yawDeg: 0 },
        { kind: "chair", x: 1.8, z: 1.9, yawDeg: 180 },
      ],
    }),
  },
  {
    id: "cafe",
    label: "카페",
    description: "6×5m · 전면 유리창 · 출입문 · 테이블 2세트",
    spec: clampStudioBg3dRoomSpec({
      width: 6,
      depth: 5,
      wallHeight: 2.8,
      wallThickness: 0.15,
      floorColor: "#c9b28a",
      wallColor: "#e8dcc8",
      openings: [
        { wall: "south", type: "door", centerOffset: 2, width: 1, height: 2.1, sillHeight: 0 },
        { wall: "south", type: "window", centerOffset: -1, width: 2.8, height: 1.6, sillHeight: 0.6 },
        { wall: "west", type: "window", centerOffset: 0, width: 2.4, height: 1.3, sillHeight: 0.9 },
      ],
      furniture: [
        { kind: "table", x: -1.6, z: -1, yawDeg: 0 },
        { kind: "chair", x: -1.6, z: -1.8, yawDeg: 0 },
        { kind: "chair", x: -1.6, z: -0.2, yawDeg: 180 },
        { kind: "table", x: 1.2, z: 0.8, yawDeg: 90 },
        { kind: "chair", x: 0.4, z: 0.8, yawDeg: 90 },
        { kind: "chair", x: 2, z: 0.8, yawDeg: 270 },
        { kind: "bookshelf", x: -2.6, z: 2, yawDeg: 90 },
      ],
    }),
  },
  {
    id: "studio-flat",
    label: "원룸",
    description: "5×4m · 현관문 · 창 1개 · 침대·책장·테이블",
    spec: clampStudioBg3dRoomSpec({
      width: 5,
      depth: 4,
      wallHeight: 2.5,
      wallThickness: 0.12,
      floorColor: "#d4c4a8",
      wallColor: "#f0e6d8",
      openings: [
        { wall: "south", type: "door", centerOffset: 1.6, width: 0.9, height: 2.05, sillHeight: 0 },
        { wall: "east", type: "window", centerOffset: -0.5, width: 1.6, height: 1.2, sillHeight: 0.9 },
      ],
      furniture: [
        { kind: "bed", x: -1.4, z: -0.8, yawDeg: 0 },
        { kind: "bookshelf", x: 1.9, z: -1.6, yawDeg: 0 },
        { kind: "table", x: 1.2, z: 1.1, yawDeg: 0 },
        { kind: "chair", x: 1.2, z: 1.8, yawDeg: 180 },
        { kind: "sofa", x: -0.2, z: 1.35, yawDeg: 180 },
        { kind: "lamp", x: 1.9, z: 1.6, yawDeg: 0 },
      ],
    }),
  },
  {
    id: "corridor",
    label: "복도",
    description: "12×2.4m · 좌우 문 4개 · 복도 창",
    spec: clampStudioBg3dRoomSpec({
      width: 12,
      depth: 2.4,
      wallHeight: 2.8,
      wallThickness: 0.15,
      floorColor: "#c8c8c4",
      wallColor: "#eef0f2",
      openings: [
        { wall: "north", type: "door", centerOffset: -4, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "north", type: "door", centerOffset: 0, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "north", type: "door", centerOffset: 4, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "south", type: "window", centerOffset: -2, width: 2.4, height: 1.2, sillHeight: 1 },
        { wall: "south", type: "window", centerOffset: 2, width: 2.4, height: 1.2, sillHeight: 1 },
        { wall: "east", type: "door", centerOffset: 0, width: 1, height: 2.1, sillHeight: 0 },
      ],
      furniture: [],
    }),
  },
  {
    id: "rooftop",
    label: "옥상",
    description: "9×8m · 낮은 난간 · 출입 계단·구조물",
    spec: clampStudioBg3dRoomSpec({
      width: 9,
      depth: 8,
      wallHeight: 1.1,
      wallThickness: 0.12,
      floorColor: "#7a7a78",
      wallColor: "#c8c8c4",
      openings: [
        { wall: "south", type: "door", centerOffset: 0, width: 1.2, height: 1, sillHeight: 0 },
      ],
      furniture: [
        { kind: "stairs", x: 2.8, z: -2.6, yawDeg: 180 },
        { kind: "column", x: -3.4, z: -3, yawDeg: 0 },
        { kind: "table", x: -1.5, z: 2, yawDeg: 0 },
        { kind: "chair", x: -1.5, z: 2.8, yawDeg: 180 },
        { kind: "plant", x: 3.4, z: 3.2, yawDeg: 0 },
      ],
    }),
  },
  {
    id: "study",
    label: "서재",
    description: "5×4.5m · 북쪽 큰 창 · 책장·책상·스탠드 조명",
    spec: clampStudioBg3dRoomSpec({
      width: 5,
      depth: 4.5,
      wallHeight: 2.7,
      wallThickness: 0.12,
      floorColor: "#8a7358",
      wallColor: "#e8e0d0",
      openings: [
        { wall: "north", type: "window", centerOffset: 0, width: 3.2, height: 1.4, sillHeight: 0.8 },
      ],
      furniture: [
        { kind: "bookshelf", x: -2.2, z: -2, yawDeg: 90 },
        { kind: "bookshelf", x: -2.2, z: -0.9, yawDeg: 90 },
        { kind: "table", x: 0.6, z: 0.4, yawDeg: 0 },
        { kind: "chair", x: 0.6, z: 1.15, yawDeg: 180 },
        { kind: "lamp", x: 1.9, z: -1.6, yawDeg: 0 },
        { kind: "plant", x: 2.1, z: 1.8, yawDeg: 0 },
      ],
    }),
  },
];

export function getStudioBg3dRoomPreset(id: unknown): StudioBg3dRoomPreset | null {
  return typeof id === "string"
    ? STUDIO_BG3D_ROOM_PRESETS.find((preset) => preset.id === id) ?? null
    : null;
}
