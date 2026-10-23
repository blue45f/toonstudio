// 방 만들기(studio-bg3d-room-builder.ts)의 개구부 부품 — 벽 세그먼트가 비워 둔 빈칸(개구부 상자) 안에 문틀·문짝·창틀·창짝·
// 롤스크린·셔터를 기존 프리미티브 상자(box)로 짓는다. 새 지오메트리·외부 에셋·새 문서 필드가 없다: 유리는 기존
// materialOverride(표면 프리셋 "유리"와 같은 값)로, 나머지는 색으로만 나타낸다.
//
// 좌표 계약(벽-로컬): u = 벽 길이 방향(벽 중심이 0, 방 안에서 벽을 볼 때 +가 오른쪽), y = 바닥 윗면 기준 높이,
// n = 벽 두께 방향(벽 중심선이 0, 방 안쪽이 +). 벽 두께가 t 이면 벽체는 n ∈ [-t/2, t/2] 를 차지한다.
// 개구부 상자 = 벽 세그먼트 레이아웃이 받아들인 개구부 사각형(u·y) × 벽 두께(n). 닫힌 부품은 모두 이 상자 안에 있고,
// 문짝·창짝이 열리면 경첩을 축으로 방 안(+n, 문) 또는 밖(-n, 여닫이 창)으로 돈다. 어떤 열림에서도 벽체와 겹치지 않는다
// (스타일 × 열림 × 경첩 조합을 시험이 고정한다).
//
// 순환 import 를 피하려고 룸 빌더에서는 타입만 가져오고(`import type`), 룸 빌더가 이 모듈의 값을 가져간다.

import type { StudioBg3dRoomOpening, StudioBg3dRoomPart, StudioBg3dRoomWallId } from "./studio-bg3d-room-builder";
import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document-types";

// ── 스타일 카탈로그 ────────────────────────────────────────────────────────────────────────────

/** 1단계(기존 필드만 쓰는) 개구부 스타일. 패턴·컷아웃 재질이 필요한 스타일(격자창·창호·障子 등)은 다음 단계에서 더한다. */
export const STUDIO_BG3D_ROOM_OPENING_STYLES = [
  "hole",
  "hinged-door",
  "sliding-door",
  "glass-door",
  "window-sliding",
  "window-casement",
  "roller-blind",
  "shutter",
] as const;
export type StudioBg3dOpeningStyle = (typeof STUDIO_BG3D_ROOM_OPENING_STYLES)[number];
export type StudioBg3dOpeningHinge = "left" | "right";
type OpeningType = StudioBg3dRoomOpening["type"];

export const STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS: Record<StudioBg3dOpeningStyle, string> = {
  hole: "빈 구멍",
  "hinged-door": "여닫이문",
  "sliding-door": "미닫이문",
  "glass-door": "유리문",
  "window-sliding": "미서기 창",
  "window-casement": "여닫이 창",
  "roller-blind": "롤스크린 창",
  shutter: "셔터",
};

/** 문·창 종류마다 고를 수 있는 스타일(목록 순서 = 선택지 순서). */
export const STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE: Record<OpeningType, readonly StudioBg3dOpeningStyle[]> = {
  door: ["hole", "hinged-door", "sliding-door", "glass-door", "shutter"],
  window: ["hole", "window-sliding", "window-casement", "roller-blind", "shutter"],
};

/** 열림 값을 주지 않았을 때의 기본값. 모든 스타일에서 0 = 닫힘(블라인드·셔터는 끝까지 내림), 1 = 가장 많이 열림. */
const DEFAULT_OPEN_RATIO: Record<StudioBg3dOpeningStyle, number> = {
  hole: 0,
  "hinged-door": 0,
  "sliding-door": 0,
  "glass-door": 0,
  "window-sliding": 0.2,
  "window-casement": 0.2,
  "roller-blind": 0.5,
  shutter: 0.9,
};

/** 경첩(미닫이는 들어가는 쪽, 미서기는 움직이는 짝 쪽)을 고를 수 있는 스타일. */
const HINGED_STYLES: ReadonlySet<StudioBg3dOpeningStyle> = new Set([
  "hinged-door", "sliding-door", "glass-door", "window-sliding", "window-casement",
]);
/** 짝 수(1·2)를 고를 수 있는 스타일. 고르지 않으면 폭으로 정한다. */
const LEAF_COUNT_STYLES: ReadonlySet<StudioBg3dOpeningStyle> = new Set(["sliding-door", "glass-door", "window-casement"]);

export function studioBg3dOpeningStyleHasHinge(style: StudioBg3dOpeningStyle): boolean {
  return HINGED_STYLES.has(style);
}

export function studioBg3dOpeningStyleHasLeafCount(style: StudioBg3dOpeningStyle): boolean {
  return LEAF_COUNT_STYLES.has(style);
}

/** 롤스크린·셔터는 "올림", 나머지는 "열림"으로 읽는다(값의 뜻은 같다: 1 = 가장 많이 열림). */
export function studioBg3dOpeningStyleRaises(style: StudioBg3dOpeningStyle): boolean {
  return style === "roller-blind" || style === "shutter";
}

export function resolveStudioBg3dOpeningStyle(opening: Pick<StudioBg3dRoomOpening, "style">): StudioBg3dOpeningStyle {
  return opening.style ?? "hole";
}

export function resolveStudioBg3dOpeningOpenRatio(opening: Pick<StudioBg3dRoomOpening, "style" | "openRatio">): number {
  return opening.openRatio ?? DEFAULT_OPEN_RATIO[resolveStudioBg3dOpeningStyle(opening)];
}

/**
 * 개구부의 선택 필드(style·openRatio·hinge·divisions)를 눌러 담는다. 주어진 키만 결과에 남겨(없는 키를 만들지 않음)
 * 선택 필드가 없는 기존 스펙은 clamp 결과가 바이트 단위로 같다. 종류에 맞지 않는 스타일(예: 창에 여닫이문)은 버린다.
 * divisions 는 다음 단계 격자 스타일까지 쓰는 1–12 정수로 받고, 이 단계 스타일은 1·2 짝만 쓴다.
 */
export function clampStudioBg3dRoomOpeningStyleFields(
  raw: Partial<Pick<StudioBg3dRoomOpening, "style" | "openRatio" | "hinge" | "divisions">>,
  type: OpeningType,
): Pick<StudioBg3dRoomOpening, "style" | "openRatio" | "hinge" | "divisions"> {
  const allowed: readonly string[] = STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE[type];
  const style = typeof raw.style === "string" && allowed.includes(raw.style) ? raw.style : undefined;
  const openRatio = typeof raw.openRatio === "number" && Number.isFinite(raw.openRatio)
    ? Math.min(1, Math.max(0, raw.openRatio))
    : undefined;
  const hinge = raw.hinge === "left" || raw.hinge === "right" ? raw.hinge : undefined;
  const divisions = typeof raw.divisions === "number" && Number.isFinite(raw.divisions)
    ? Math.min(12, Math.max(1, Math.round(raw.divisions)))
    : undefined;
  return {
    ...(style === undefined ? {} : { style }),
    ...(openRatio === undefined ? {} : { openRatio }),
    ...(hinge === undefined ? {} : { hinge }),
    ...(divisions === undefined ? {} : { divisions }),
  };
}

// ── 벽 틀(벽-로컬 → 월드) ────────────────────────────────────────────────────────────────────

export interface StudioBg3dRoomWallFrame {
  readonly wall: StudioBg3dRoomWallId;
  /** 벽 길이(m) = 이 벽이 놓인 방 치수(북·남 = 가로 폭, 서·동 = 세로 깊이). */
  readonly length: number;
  readonly thickness: number;
  /** 벽-로컬 (u, n) → 월드 (x, z). */
  readonly toWorld: (u: number, n: number) => readonly [number, number];
  /** 벽 길이 방향이 월드 X 축이면 true(축 정렬 상자의 크기 매핑용). */
  readonly alongX: boolean;
  /** 상자의 로컬 X 축을 벽의 +u 방향으로 돌리는 월드 요(라디안). */
  readonly baseYaw: number;
}

/**
 * 벽 하나의 틀. 룸 빌더 머리 주석의 규약과 같다: 북벽 +u=+x, 남벽 +u=-x, 서벽 +u=-z, 동벽 +u=+z, 안쪽 법선은
 * 북 +z·남 -z·서 +x·동 -x. 벽체 배치(n = 0)는 예전 계산식과 같은 식이라 기존 출력이 바이트 단위로 같다.
 */
export function studioBg3dRoomWallFrame(
  wall: StudioBg3dRoomWallId,
  width: number,
  depth: number,
  thickness: number,
): StudioBg3dRoomWallFrame {
  switch (wall) {
    case "north":
      return { wall, length: width, thickness, alongX: true, baseYaw: 0, toWorld: (u, n) => [u, -depth / 2 + n] };
    case "south":
      return { wall, length: width, thickness, alongX: true, baseYaw: Math.PI, toWorld: (u, n) => [-u, depth / 2 - n] };
    case "west":
      return { wall, length: depth, thickness, alongX: false, baseYaw: Math.PI / 2, toWorld: (u, n) => [-width / 2 + n, -u] };
    case "east":
      return { wall, length: depth, thickness, alongX: false, baseYaw: -Math.PI / 2, toWorld: (u, n) => [width / 2 - n, u] };
  }
}

/** 라디안 요를 문서 정규형 [-π, π) 로(룸 빌더 canonicalStudioBg3dRoomYaw 와 같은 식 — 순환 import 를 피하려 둔 사본). */
function canonicalYaw(radians: number): number {
  const turn = Math.PI * 2;
  let angle = radians;
  for (let step = 0; step < 4; step += 1) {
    const wrapped = ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
    if (wrapped === angle) return wrapped;
    angle = wrapped;
  }
  return angle;
}

/** 벽-로컬 상자 하나. theta 는 상자의 길이 축(+u)을 +n 쪽으로 돌린 각(라디안)이다. */
export interface StudioBg3dRoomLocalBox {
  readonly name: string;
  readonly center: readonly [u: number, y: number, n: number];
  readonly size: readonly [u: number, y: number, n: number];
  readonly theta: number;
  readonly color: string;
  readonly materialOverride?: StudioBg3dMaterialOverride;
}

/** 벽-로컬 상자를 월드 파츠로. 돌지 않은 상자(theta 0)는 벽체와 같은 축 정렬 표기(회전 0, 크기 축 교환)를 쓴다. */
export function placeStudioBg3dRoomLocalBox(frame: StudioBg3dRoomWallFrame, box: StudioBg3dRoomLocalBox): StudioBg3dRoomPart {
  const [u, y, n] = box.center;
  const [x, z] = frame.toWorld(u, n);
  const [su, sy, sn] = box.size;
  const axisAligned = box.theta === 0;
  return {
    kind: "box",
    name: box.name,
    wall: frame.wall,
    position: [x, y, z],
    rotation: axisAligned ? [0, 0, 0] : [0, canonicalYaw(frame.baseYaw - box.theta), 0],
    scale: axisAligned ? (frame.alongX ? [su, sy, sn] : [sn, sy, su]) : [su, sy, sn],
    color: box.color,
    ...(box.materialOverride ? { materialOverride: box.materialOverride } : {}),
  };
}

/** 벽-로컬 축 정렬 상자([u0,u1]×[y0,y1]×[n0,n1]). */
export function studioBg3dRoomSlab(
  name: string,
  u: readonly [number, number],
  y: readonly [number, number],
  n: readonly [number, number],
  color: string,
  materialOverride?: StudioBg3dMaterialOverride,
): StudioBg3dRoomLocalBox {
  return {
    name,
    center: [(u[0] + u[1]) / 2, (y[0] + y[1]) / 2, (n[0] + n[1]) / 2],
    size: [u[1] - u[0], y[1] - y[0], n[1] - n[0]],
    theta: 0,
    color,
    ...(materialOverride ? { materialOverride } : {}),
  };
}

// ── 재질·색·치수 ─────────────────────────────────────────────────────────────────────────────

/**
 * 유리. 표면 프리셋 "유리"(studio-bg3d-surface-presets)를 기본 오버라이드에 얹은 값과 같다 — 시험이 둘을 비교해
 * 어긋나지 못하게 한다. 프리셋 모듈을 가져오면 룸 빌더(편집기 활성화 번들)의 정적 간선이 늘어 값을 여기 둔다.
 */
export const STUDIO_BG3D_ROOM_GLASS_OVERRIDE: StudioBg3dMaterialOverride = Object.freeze({
  colorMode: "original",
  color: "#ffffff",
  colorStrength: 1,
  opacityMultiplier: 0.35,
  roughness: 0.1,
  metalness: 0,
  emissiveColor: "#000000",
  emissiveIntensity: null,
  wireframe: false,
  doubleSided: false,
});

const COLOR = {
  woodFrame: "#7c5f43",
  woodLeaf: "#a8865f",
  classroomLeaf: "#b99d74",
  handle: "#c9c4b8",
  glass: "#cfe3ee",
  windowFrame: "#e6e4de",
  aluminium: "#9aa3ab",
  pullBar: "#d4d8dc",
  blindBox: "#ebe7df",
  blindScreen: "#efe6d2",
  shutterBox: "#8e969d",
  shutterRail: "#767e85",
  shutterPanel: "#a7aeb4",
} as const;

/** 문틀·창틀 부재 폭(m). 좁은 개구부에서는 폭·높이의 12% 까지 줄인다. */
const FRAME_WIDTH = 0.05;
const DOOR_LEAF_THICKNESS = 0.04;
const GLASS_LEAF_THICKNESS = 0.024;
const DOOR_BOTTOM_GAP = 0.01;
/** 문짝·창짝과 틀 사이 틈(m). 맞닿는 면이 겹쳐 깜빡이지 않게 한다. */
const LEAF_GAP = 0.003;
const HANDLE_HEIGHT = 1.0;
const SASH_OVERLAP = 0.03;
/** 부품을 짓기에 너무 작은 개구부(폭·높이 m)는 빈 구멍으로 둔다. */
const MIN_PART_OPENING = 0.3;
/** 이 폭(m) 이상이면 짝 수를 고르지 않은 미닫이·유리문이 두 짝이 된다(여닫이 창은 1m). */
const DOUBLE_LEAF_WIDTH = 1.4;
const DOUBLE_SASH_WIDTH = 1.0;

// ── 회전하는 짝(문짝·창짝) ───────────────────────────────────────────────────────────────────

/**
 * 경첩 틀: 경첩 점 (pivotU, pivotN) 에서 짝이 sideSign 쪽 u 로 뻗고 swingSign 쪽 n 으로 열린다.
 * 짝 좌표 a = 경첩에서 손잡이 쪽으로의 거리, b = 경첩면(열리는 쪽 면)에서 잰 두께 방향 거리(짝 몸통은 b ∈ [-d, 0]).
 */
interface LeafFrame {
  readonly pivotU: number;
  readonly pivotN: number;
  readonly angle: number;
  readonly sideSign: 1 | -1;
  readonly swingSign: 1 | -1;
}

function leafPoint(frame: LeafFrame, a: number, b: number): readonly [u: number, n: number] {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  return [
    frame.pivotU + frame.sideSign * (a * cos - b * sin),
    frame.pivotN + frame.swingSign * (a * sin + b * cos),
  ];
}

/** 짝 좌표의 축 정렬 상자([a0,a1]×[y0,y1]×[b0,b1])를 벽-로컬 상자로(짝과 함께 돈다). */
function leafBox(
  frame: LeafFrame,
  name: string,
  a: readonly [number, number],
  y: readonly [number, number],
  b: readonly [number, number],
  color: string,
  materialOverride?: StudioBg3dMaterialOverride,
): StudioBg3dRoomLocalBox {
  const [u, n] = leafPoint(frame, (a[0] + a[1]) / 2, (b[0] + b[1]) / 2);
  return {
    name,
    center: [u, (y[0] + y[1]) / 2, n],
    size: [a[1] - a[0], y[1] - y[0], b[1] - b[0]],
    theta: frame.angle === 0 ? 0 : frame.sideSign * frame.swingSign * frame.angle,
    color,
    ...(materialOverride ? { materialOverride } : {}),
  };
}

// ── 스타일별 부품 ────────────────────────────────────────────────────────────────────────────

export interface StudioBg3dRoomOpeningRect {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export interface StudioBg3dRoomOpeningBuildInput {
  readonly frame: StudioBg3dRoomWallFrame;
  /** 부품 이름 앞에 붙는 벽 이름표(예: "앞벽"). */
  readonly wallLabel: string;
  readonly opening: StudioBg3dRoomOpening;
  /** 벽 세그먼트 레이아웃이 받아들인 개구부 사각형(벽-로컬). */
  readonly rect: StudioBg3dRoomOpeningRect;
  /** 옆벽 안쪽 면 사이 구간(u). 모서리에서 옆벽 두께와 겹치는 부분에는 부품을 두지 않는다. */
  readonly innerSpan: readonly [number, number];
}

interface OpeningContext {
  readonly label: string;
  readonly t: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  /** 틀 부재 폭. */
  readonly f: number;
  readonly openRatio: number;
  readonly hinge: StudioBg3dOpeningHinge;
  readonly divisions: number | undefined;
}

function clampValue(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function leafCount(context: OpeningContext, clearWidth: number, doubleFrom: number): 1 | 2 {
  const requested = context.divisions ?? (clearWidth >= doubleFrom ? 2 : 1);
  return requested >= 2 ? 2 : 1;
}

/** 문틀: 좌우 문설주 + 문 위 틀(문 아래에는 걸려 넘어지지 않게 턱을 두지 않는다). */
function doorFrame(context: OpeningContext, color: string): StudioBg3dRoomLocalBox[] {
  const { label, t, left, right, bottom, top, f } = context;
  const name = `${label} 문틀`;
  const n = [-t / 2, t / 2] as const;
  return [
    studioBg3dRoomSlab(name, [left, left + f], [bottom, top], n, color),
    studioBg3dRoomSlab(name, [right - f, right], [bottom, top], n, color),
    studioBg3dRoomSlab(name, [left + f, right - f], [top - f, top], n, color),
  ];
}

/** 창틀: 좌우 + 위 + 창턱. */
function windowFrame(context: OpeningContext, color: string): StudioBg3dRoomLocalBox[] {
  const { label, t, left, right, bottom, top, f } = context;
  const name = `${label} 창틀`;
  const n = [-t / 2, t / 2] as const;
  return [
    studioBg3dRoomSlab(name, [left, left + f], [bottom, top], n, color),
    studioBg3dRoomSlab(name, [right - f, right], [bottom, top], n, color),
    studioBg3dRoomSlab(name, [left + f, right - f], [top - f, top], n, color),
    studioBg3dRoomSlab(name, [left + f, right - f], [bottom, bottom + f], n, color),
  ];
}

function hingedDoor(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, t, f, bottom, top, openRatio, hinge } = context;
  const clearLeft = context.left + f;
  const clearRight = context.right - f;
  const d = Math.min(DOOR_LEAF_THICKNESS, t * 0.6);
  const leafWidth = clearRight - clearLeft - 2 * LEAF_GAP;
  const leafBottom = bottom + DOOR_BOTTOM_GAP;
  const leafTop = top - f - LEAF_GAP;
  const sideSign = hinge === "left" ? 1 : -1;
  const frame: LeafFrame = {
    pivotU: hinge === "left" ? clearLeft + LEAF_GAP : clearRight - LEAF_GAP,
    pivotN: d / 2,
    angle: openRatio * (Math.PI / 2),
    sideSign,
    swingSign: 1,
  };
  // 손잡이: 방 쪽 면에 붙은 레버. 얇은 벽에서는 벽 두께 안에 들어오게 돌출을 줄인다.
  const handleDepth = clampValue(t / 2 - d / 2 - 0.004, 0.006, 0.035);
  const handleY = clampValue(HANDLE_HEIGHT, leafBottom + 0.3, leafTop - 0.3);
  const handleEnd = Math.max(0.05, leafWidth - 0.04);
  return [
    ...doorFrame(context, COLOR.woodFrame),
    leafBox(frame, `${label} 문짝`, [0, leafWidth], [leafBottom, leafTop], [-d, 0], COLOR.woodLeaf),
    leafBox(
      frame,
      `${label} 손잡이`,
      [Math.max(0, handleEnd - 0.12), handleEnd],
      [handleY - 0.0125, handleY + 0.0125],
      [0, handleDepth],
      COLOR.handle,
    ),
  ];
}

/** 미닫이 짝 한 장(아래 판 + 위 유리)을 벽-로컬 축 정렬 상자로. */
function slidingLeaf(
  label: string,
  u: readonly [number, number],
  y: readonly [number, number],
  n: readonly [number, number],
): StudioBg3dRoomLocalBox[] {
  const height = y[1] - y[0];
  const glassHeight = Math.min(0.8, height * 0.4);
  const split = y[1] - glassHeight;
  return [
    studioBg3dRoomSlab(`${label} 문짝`, u, [y[0], split], n, COLOR.classroomLeaf),
    studioBg3dRoomSlab(`${label} 문짝 유리`, u, [split, y[1]], n, COLOR.glass, STUDIO_BG3D_ROOM_GLASS_OVERRIDE),
  ];
}

/**
 * 미닫이문. 한 짝은 벽 속 문 주머니로 밀려 들어가는 포켓 미닫이(보이는 폭 = 짝 폭 × (1 - 열림), 손잡이 끝 6cm 는 남긴다),
 * 두 짝은 두 레일에서 한 짝이 다른 짝 뒤로 겹쳐지는 미서기다. 어느 쪽이든 짝은 개구부 상자 밖으로 나가지 않는다.
 */
function slidingDoor(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, t, f, bottom, top, openRatio, hinge } = context;
  const clearLeft = context.left + f;
  const clearRight = context.right - f;
  const clearWidth = clearRight - clearLeft;
  const y = [bottom + DOOR_BOTTOM_GAP, top - f - LEAF_GAP] as const;
  const parts = doorFrame(context, COLOR.woodFrame);
  if (leafCount(context, clearWidth, DOUBLE_LEAF_WIDTH) === 1) {
    const d = Math.min(DOOR_LEAF_THICKNESS, t * 0.6);
    const visible = Math.max(0.06, clearWidth * (1 - openRatio));
    const u = hinge === "left" ? [clearLeft, clearLeft + visible] as const : [clearRight - visible, clearRight] as const;
    return [...parts, ...slidingLeaf(label, u, y, [-d / 2, d / 2])];
  }
  return [...parts, ...bypassPair(context, clearLeft, clearRight, (u, n) => slidingLeaf(label, u, y, n))];
}

/**
 * 두 레일 미서기 한 쌍: 바깥 레일(n = -t/4)의 짝은 고정, 안쪽 레일(n = +t/4)의 짝이 열림만큼 반대쪽으로 겹쳐 들어간다.
 * hinge 는 움직이는 짝이 처음 있는 쪽이다.
 */
function bypassPair(
  context: OpeningContext,
  clearLeft: number,
  clearRight: number,
  leaf: (u: readonly [number, number], n: readonly [number, number]) => StudioBg3dRoomLocalBox[],
): StudioBg3dRoomLocalBox[] {
  const { t, openRatio, hinge } = context;
  const clearWidth = clearRight - clearLeft;
  const d = clampValue(t / 2 - 0.012, 0.008, 0.035);
  const half = Math.min(clearWidth, clearWidth / 2 + SASH_OVERLAP);
  const travel = openRatio * (clearWidth - half);
  const inner = [t / 4 - d / 2, t / 4 + d / 2] as const;
  const outer = [-t / 4 - d / 2, -t / 4 + d / 2] as const;
  const moving = hinge === "left"
    ? [clearLeft + travel, clearLeft + travel + half] as const
    : [clearRight - travel - half, clearRight - travel] as const;
  const fixed = hinge === "left" ? [clearRight - half, clearRight] as const : [clearLeft, clearLeft + half] as const;
  return [...leaf(fixed, outer), ...leaf(moving, inner)];
}

function glassDoor(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, t, f, bottom, top, openRatio, hinge } = context;
  const clearLeft = context.left + f;
  const clearRight = context.right - f;
  const clearWidth = clearRight - clearLeft;
  const d = Math.min(GLASS_LEAF_THICKNESS, t * 0.5);
  const y = [bottom + DOOR_BOTTOM_GAP, top - f - LEAF_GAP] as const;
  const barDepth = clampValue(t / 2 - d / 2 - 0.004, 0.006, 0.03);
  const barY = [clampValue(0.75, y[0] + 0.1, y[1] - 0.8), clampValue(1.45, y[0] + 0.8, y[1] - 0.1)] as const;
  const angle = openRatio * (Math.PI / 2);
  const leafWithBar = (frame: LeafFrame, width: number): StudioBg3dRoomLocalBox[] => {
    const barEnd = Math.max(0.03, width - 0.075);
    return [
      leafBox(frame, `${label} 유리문`, [0, width], y, [-d, 0], COLOR.glass, STUDIO_BG3D_ROOM_GLASS_OVERRIDE),
      leafBox(frame, `${label} 문 손잡이 바`, [barEnd - 0.025, barEnd], barY, [0, barDepth], COLOR.pullBar),
    ];
  };
  const parts = doorFrame(context, COLOR.aluminium);
  const leftFrame: LeafFrame = { pivotU: clearLeft + LEAF_GAP, pivotN: d / 2, angle, sideSign: 1, swingSign: 1 };
  const rightFrame: LeafFrame = { pivotU: clearRight - LEAF_GAP, pivotN: d / 2, angle, sideSign: -1, swingSign: 1 };
  if (leafCount(context, clearWidth, DOUBLE_LEAF_WIDTH) === 1) {
    const width = clearWidth - 2 * LEAF_GAP;
    return [...parts, ...leafWithBar(hinge === "left" ? leftFrame : rightFrame, width)];
  }
  const width = clearWidth / 2 - 1.5 * LEAF_GAP;
  return [...parts, ...leafWithBar(leftFrame, width), ...leafWithBar(rightFrame, width)];
}

function windowSliding(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, f, bottom, top } = context;
  const clearLeft = context.left + f;
  const clearRight = context.right - f;
  const y = [bottom + f, top - f] as const;
  const sash = (u: readonly [number, number], n: readonly [number, number]) =>
    [studioBg3dRoomSlab(`${label} 창짝`, u, y, n, COLOR.glass, STUDIO_BG3D_ROOM_GLASS_OVERRIDE)];
  return [...windowFrame(context, COLOR.windowFrame), ...bypassPair(context, clearLeft, clearRight, sash)];
}

/** 여닫이 창: 창짝이 바깥(-n)으로 열린다(방 안 가구·블라인드와 부딪히지 않는다). */
function windowCasement(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, t, f, bottom, top, openRatio, hinge } = context;
  const clearLeft = context.left + f;
  const clearRight = context.right - f;
  const clearWidth = clearRight - clearLeft;
  const d = Math.min(0.03, t * 0.5);
  const y = [bottom + f + LEAF_GAP, top - f - LEAF_GAP] as const;
  const angle = openRatio * (Math.PI / 2);
  const sash = (frame: LeafFrame, width: number) =>
    leafBox(frame, `${label} 창짝`, [0, width], y, [-d, 0], COLOR.glass, STUDIO_BG3D_ROOM_GLASS_OVERRIDE);
  const left: LeafFrame = { pivotU: clearLeft + LEAF_GAP, pivotN: -d / 2, angle, sideSign: 1, swingSign: -1 };
  const right: LeafFrame = { pivotU: clearRight - LEAF_GAP, pivotN: -d / 2, angle, sideSign: -1, swingSign: -1 };
  const parts = windowFrame(context, COLOR.windowFrame);
  if (leafCount(context, clearWidth, DOUBLE_SASH_WIDTH) === 1) {
    return [...parts, sash(hinge === "left" ? left : right, clearWidth - 2 * LEAF_GAP)];
  }
  const width = clearWidth / 2 - 1.5 * LEAF_GAP;
  return [...parts, sash(left, width), sash(right, width)];
}

/** 롤스크린 창: 고정 유리(바깥쪽 절반) + 방 쪽 위 상자 + 상자에서 내려오는 막. 열림 1 = 끝까지 말아 올림. */
function rollerBlind(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, t, f, bottom, top, openRatio } = context;
  const clearLeft = context.left + f;
  const clearRight = context.right - f;
  const clearBottom = bottom + f;
  const clearTop = top - f;
  const glassDepth = Math.min(0.012, t / 4);
  const innerFace = t / 2 - 0.003;
  const boxBack = Math.max(-t / 4 + glassDepth / 2 + 0.003, innerFace - 0.07);
  const boxHeight = Math.min(0.08, (clearTop - clearBottom) * 0.15);
  const screenTop = clearTop - boxHeight;
  const screenBottom = clearBottom + openRatio * (screenTop - clearBottom - 0.02);
  const screenN = (boxBack + innerFace) / 2;
  return [
    ...windowFrame(context, COLOR.windowFrame),
    studioBg3dRoomSlab(
      `${label} 유리`,
      [clearLeft, clearRight],
      [clearBottom, clearTop],
      [-t / 4 - glassDepth / 2, -t / 4 + glassDepth / 2],
      COLOR.glass,
      STUDIO_BG3D_ROOM_GLASS_OVERRIDE,
    ),
    studioBg3dRoomSlab(`${label} 롤스크린 상자`, [clearLeft, clearRight], [screenTop, clearTop], [boxBack, innerFace], COLOR.blindBox),
    studioBg3dRoomSlab(
      `${label} 롤스크린`,
      [clearLeft + 0.01, clearRight - 0.01],
      [screenBottom, screenTop],
      [screenN - 0.002, screenN + 0.002],
      COLOR.blindScreen,
    ),
  ];
}

/** 상가 셔터: 위쪽 셔터 상자(벽 두께 전체) + 좌우 레일(바깥 면) + 레일 사이 셔터 판. 열림 1 = 끝까지 올림. */
function shutter(context: OpeningContext): StudioBg3dRoomLocalBox[] {
  const { label, t, left, right, bottom, top, openRatio } = context;
  const railWidth = Math.min(0.06, (right - left) * 0.1);
  const railDepth = Math.min(0.06, t * 0.5);
  const boxHeight = Math.min(0.3, (top - bottom) * 0.2);
  const boxBottom = top - boxHeight;
  const panelBottom = bottom + openRatio * (boxBottom - bottom - 0.03);
  const rails = [-t / 2, -t / 2 + railDepth] as const;
  return [
    studioBg3dRoomSlab(`${label} 셔터 상자`, [left, right], [boxBottom, top], [-t / 2, t / 2], COLOR.shutterBox),
    studioBg3dRoomSlab(`${label} 셔터 레일`, [left, left + railWidth], [bottom, boxBottom], rails, COLOR.shutterRail),
    studioBg3dRoomSlab(`${label} 셔터 레일`, [right - railWidth, right], [bottom, boxBottom], rails, COLOR.shutterRail),
    studioBg3dRoomSlab(
      `${label} 셔터`,
      [left + railWidth, right - railWidth],
      [panelBottom, boxBottom],
      [-t / 2 + railDepth * 0.25, -t / 2 + railDepth * 0.75],
      COLOR.shutterPanel,
    ),
  ];
}

const BUILDERS: Record<Exclude<StudioBg3dOpeningStyle, "hole">, (context: OpeningContext) => StudioBg3dRoomLocalBox[]> = {
  "hinged-door": hingedDoor,
  "sliding-door": slidingDoor,
  "glass-door": glassDoor,
  "window-sliding": windowSliding,
  "window-casement": windowCasement,
  "roller-blind": rollerBlind,
  shutter,
};

/**
 * 개구부 하나의 부품. 스타일이 없거나 "hole" 이면 빈 배열(예전과 같은 빈 구멍)이다. 옆벽 두께와 겹치는 모서리 부분은
 * 잘라 내고, 남은 개구부가 너무 작으면(폭·높이 0.3m 미만) 부품 없이 빈 구멍으로 둔다.
 */
export function buildStudioBg3dRoomOpeningParts(input: StudioBg3dRoomOpeningBuildInput): StudioBg3dRoomPart[] {
  const style = resolveStudioBg3dOpeningStyle(input.opening);
  if (style === "hole") return [];
  const left = Math.max(input.rect.left, input.innerSpan[0]);
  const right = Math.min(input.rect.right, input.innerSpan[1]);
  const { bottom, top } = input.rect;
  if (right - left < MIN_PART_OPENING || top - bottom < MIN_PART_OPENING) return [];
  const context: OpeningContext = {
    label: input.wallLabel,
    t: input.frame.thickness,
    left,
    right,
    bottom,
    top,
    f: Math.min(FRAME_WIDTH, (right - left) * 0.12, (top - bottom) * 0.12),
    openRatio: resolveStudioBg3dOpeningOpenRatio(input.opening),
    hinge: input.opening.hinge ?? "left",
    divisions: input.opening.divisions,
  };
  return BUILDERS[style](context).map((box) => placeStudioBg3dRoomLocalBox(input.frame, box));
}
