// 방 만들기(studio-bg3d-room-builder.ts)의 몰딩·천장 — 걸레받이·징두리 판벽·의자 레일·크라운 몰딩을 벽 안쪽 면에,
// 천장(평천장·서까래·우물반자)을 벽 위에 기존 프리미티브 상자로 짓는다. 새 지오메트리·새 문서 필드가 없다(색만 쓴다).
//
// 배치 규칙
// - 몰딩은 벽 안쪽 면(벽-로컬 n = t/2)에 붙어 방 안으로 자기 깊이만큼 나온다. 문·창이 몰딩 높이 구간을 지나가면 그 폭만큼
//   끊긴다(문 앞에서는 걸레받이가, 창 아래 높이에서는 징두리·의자 레일이 끊긴다).
// - 모서리는 맞댐 이음이다: 앞·뒷벽 몰딩은 옆벽 안쪽 면까지 가고, 옆벽(왼·오른벽) 몰딩은 같은 몰딩 단의 깊이만큼 짧아져
//   서로 겹치지 않고 빈틈 없이 만난다(크라운의 단마다 따로 잰다).
// - 높이 구간은 아래부터 걸레받이 → 징두리 → 의자 레일(징두리를 켜면 그 위 띠) → 크라운 순으로 겹치지 않게 쌓는다.
//   낮은 벽(2m 미만, 예: 옥상 난간)에는 걸레받이만 둔다.
// - 천장 판은 벽 위(바닥에서 벽 높이)에 얹혀 방의 바깥 둘레를 덮는다 — 실내 층고 = 벽 높이(사람 크기 시험의 층고 기준과 같다).
//   서까래·우물 보는 천장 판 아래로 내려오고 벽 안쪽 면 사이를 잇는다. 우물 보의 두 방향은 깊이를 달리해 교차부 바닥면이
//   같은 평면에서 깜빡이지 않게 한다.
//
// 순환 import 를 피하려고 룸 빌더에서는 타입만 가져온다. 벽 틀·상자 배치는 개구부 모듈의 것을 같이 쓴다.

import {
  placeStudioBg3dRoomLocalBox,
  studioBg3dRoomSlab,
  type StudioBg3dRoomOpeningRect,
  type StudioBg3dRoomWallFrame,
} from "./studio-bg3d-room-openings";

import type { StudioBg3dRoomPart, StudioBg3dRoomWallId } from "./studio-bg3d-room-builder";

// ── 천장 ─────────────────────────────────────────────────────────────────────────────────────

/** 1단계 천장. 텍스 격자·반자틀처럼 패턴 재질이 필요한 천장은 다음 단계에서 더한다. */
export const STUDIO_BG3D_ROOM_CEILING_STYLES = ["none", "flat", "rafter", "coffered"] as const;
export type StudioBg3dRoomCeilingStyle = (typeof STUDIO_BG3D_ROOM_CEILING_STYLES)[number];

export const STUDIO_BG3D_ROOM_CEILING_LABELS: Record<StudioBg3dRoomCeilingStyle, string> = {
  none: "없음",
  flat: "평천장",
  rafter: "서까래",
  coffered: "우물반자",
};

export const STUDIO_BG3D_ROOM_CEILING_THICKNESS = 0.1;

// ── 몰딩 ─────────────────────────────────────────────────────────────────────────────────────

export const STUDIO_BG3D_ROOM_CROWN_STYLES = ["none", "flat", "stepped", "cove"] as const;
export type StudioBg3dRoomCrownStyle = (typeof STUDIO_BG3D_ROOM_CROWN_STYLES)[number];

export const STUDIO_BG3D_ROOM_CROWN_LABELS: Record<StudioBg3dRoomCrownStyle, string> = {
  none: "없음",
  flat: "평몰딩",
  stepped: "계단형",
  cove: "곡선형",
};

export interface StudioBg3dRoomTrims {
  readonly baseboard: { readonly enabled: boolean; readonly heightM: number; readonly depthM: number };
  readonly crown: { readonly style: StudioBg3dRoomCrownStyle; readonly heightM: number };
  readonly wainscot: { readonly enabled: boolean; readonly heightM: number };
  readonly chairRail: boolean;
}

export const STUDIO_BG3D_ROOM_TRIM_LIMITS = Object.freeze({
  minBaseboardHeight: 0.04,
  maxBaseboardHeight: 0.2,
  minBaseboardDepth: 0.01,
  maxBaseboardDepth: 0.03,
  minCrownHeight: 0.04,
  maxCrownHeight: 0.25,
  minWainscotHeight: 0.6,
  maxWainscotHeight: 1.2,
});

/** 몰딩을 처음 켤 때의 바탕값(모두 꺼짐, 치수만 일상적인 값). clamp 가 빠진 하위 값을 이 값으로 채운다. */
export const DEFAULT_STUDIO_BG3D_ROOM_TRIMS: StudioBg3dRoomTrims = Object.freeze({
  baseboard: Object.freeze({ enabled: false, heightM: 0.08, depthM: 0.015 }),
  crown: Object.freeze({ style: "none", heightM: 0.1 }),
  wainscot: Object.freeze({ enabled: false, heightM: 0.9 }),
  chairRail: false,
});

const TRIM_COLOR = {
  baseboard: "#6f5a45",
  wainscot: "#c7b293",
  chairRail: "#8a6b4a",
  crown: "#f1ece2",
  ceiling: "#f4f1ea",
  beam: "#8f6f50",
} as const;
const WAINSCOT_DEPTH = 0.012;
const CHAIR_RAIL_DEPTH = 0.022;
const CHAIR_RAIL_HEIGHT = 0.04;
/** 징두리 없이 의자 레일만 켰을 때의 높이 구간(m). 의자 등받이가 벽에 닿는 높이. */
const CHAIR_RAIL_DEFAULT_RANGE = [0.88, 0.92] as const;
const TALL_WALL_MIN_HEIGHT = 2;
const MIN_RUN = 0.02;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

/** 천장 스타일. 알 수 없는 값이면 undefined(키를 만들지 않는다). */
export function clampStudioBg3dRoomCeiling(value: unknown): StudioBg3dRoomCeilingStyle | undefined {
  return typeof value === "string" && (STUDIO_BG3D_ROOM_CEILING_STYLES as readonly string[]).includes(value)
    ? value as StudioBg3dRoomCeilingStyle
    : undefined;
}

/** 몰딩 설정을 눌러 담는다. 객체가 아니면 undefined(키를 만들지 않는다), 빠진 하위 값은 기본값으로 채운다. */
export function clampStudioBg3dRoomTrims(value: unknown): StudioBg3dRoomTrims | undefined {
  if (!isRecord(value)) return undefined;
  const limits = STUDIO_BG3D_ROOM_TRIM_LIMITS;
  const fallback = DEFAULT_STUDIO_BG3D_ROOM_TRIMS;
  const baseboard = isRecord(value.baseboard) ? value.baseboard : {};
  const crown = isRecord(value.crown) ? value.crown : {};
  const wainscot = isRecord(value.wainscot) ? value.wainscot : {};
  const crownStyle = typeof crown.style === "string" && (STUDIO_BG3D_ROOM_CROWN_STYLES as readonly string[]).includes(crown.style)
    ? crown.style as StudioBg3dRoomCrownStyle
    : fallback.crown.style;
  return {
    baseboard: {
      enabled: typeof baseboard.enabled === "boolean" ? baseboard.enabled : fallback.baseboard.enabled,
      heightM: boundedNumber(baseboard.heightM, fallback.baseboard.heightM, limits.minBaseboardHeight, limits.maxBaseboardHeight),
      depthM: boundedNumber(baseboard.depthM, fallback.baseboard.depthM, limits.minBaseboardDepth, limits.maxBaseboardDepth),
    },
    crown: {
      style: crownStyle,
      heightM: boundedNumber(crown.heightM, fallback.crown.heightM, limits.minCrownHeight, limits.maxCrownHeight),
    },
    wainscot: {
      enabled: typeof wainscot.enabled === "boolean" ? wainscot.enabled : fallback.wainscot.enabled,
      heightM: boundedNumber(wainscot.heightM, fallback.wainscot.heightM, limits.minWainscotHeight, limits.maxWainscotHeight),
    },
    chairRail: typeof value.chairRail === "boolean" ? value.chairRail : fallback.chairRail,
  };
}

// ── 몰딩 부품 ────────────────────────────────────────────────────────────────────────────────

/** 벽 하나에 붙는 몰딩 한 단: 높이 구간과 방 안으로 나오는 깊이. */
interface TrimBand {
  readonly name: string;
  readonly y: readonly [number, number];
  readonly depth: number;
  readonly color: string;
}

/** 벽 높이·설정에서 실제로 놓을 몰딩 단들(아래에서 위로, 서로 겹치지 않는다). */
export function resolveStudioBg3dRoomTrimBands(trims: StudioBg3dRoomTrims, wallHeight: number): readonly TrimBand[] {
  const bands: TrimBand[] = [];
  let floorTop = 0;
  if (trims.baseboard.enabled && wallHeight >= 0.5) {
    const height = Math.min(trims.baseboard.heightM, wallHeight * 0.25);
    bands.push({ name: "걸레받이", y: [0, height], depth: trims.baseboard.depthM, color: TRIM_COLOR.baseboard });
    floorTop = height;
  }
  if (wallHeight < TALL_WALL_MIN_HEIGHT) return bands;
  let railBase: number | null = null;
  if (trims.wainscot.enabled) {
    const top = Math.min(trims.wainscot.heightM, wallHeight - 0.6);
    if (top - floorTop >= 0.2) {
      bands.push({ name: "징두리", y: [floorTop, top], depth: WAINSCOT_DEPTH, color: TRIM_COLOR.wainscot });
      railBase = top;
    }
  }
  if (trims.chairRail) {
    const y = railBase === null ? CHAIR_RAIL_DEFAULT_RANGE : [railBase, railBase + CHAIR_RAIL_HEIGHT] as const;
    bands.push({ name: "의자 레일", y, depth: CHAIR_RAIL_DEPTH, color: TRIM_COLOR.chairRail });
  }
  if (trims.crown.style !== "none") {
    const height = Math.min(trims.crown.heightM, wallHeight * 0.12);
    const depth = Math.min(0.08, Math.max(0.02, height * 0.6));
    const top = wallHeight;
    // 단 구성(아래 → 위): 평 = 한 단, 계단형 = 얕은 단 + 깊은 단, 곡선형 = 세 단이 오목한 곡면을 계단으로 근사한다.
    const steps: ReadonlyArray<readonly [fromRatio: number, toRatio: number, depthRatio: number]> =
      trims.crown.style === "flat"
        ? [[0, 1, 1]]
        : trims.crown.style === "stepped"
          ? [[0, 0.5, 0.5], [0.5, 1, 1]]
          : [[0, 1 / 3, 0.35], [1 / 3, 2 / 3, 0.7], [2 / 3, 1, 1]];
    for (const [from, to, depthRatio] of steps) {
      bands.push({
        name: "크라운 몰딩",
        y: [top - height + height * from, top - height + height * to],
        depth: depth * depthRatio,
        color: TRIM_COLOR.crown,
      });
    }
  }
  return bands;
}

/** 구간 [start, end] 에서 막힌 구간들을 빼고 남은 구간(MIN_RUN 미만은 버림). */
function subtractIntervals(
  start: number,
  end: number,
  blocked: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  const runs: Array<readonly [number, number]> = [];
  let cursor = start;
  for (const [from, to] of [...blocked].sort((a, b) => a[0] - b[0])) {
    if (to <= cursor) continue;
    if (from >= end) break;
    if (from - cursor >= MIN_RUN) runs.push([cursor, Math.min(from, end)]);
    cursor = Math.max(cursor, to);
  }
  if (end - cursor >= MIN_RUN) runs.push([cursor, end]);
  return runs;
}

export interface StudioBg3dRoomTrimBuildInput {
  readonly frames: Readonly<Record<StudioBg3dRoomWallId, StudioBg3dRoomWallFrame>>;
  readonly wallLabels: Readonly<Record<StudioBg3dRoomWallId, string>>;
  readonly walls: readonly StudioBg3dRoomWallId[];
  readonly wallHeight: number;
  /** 벽마다 벽 세그먼트 레이아웃이 받아들인 개구부 사각형. */
  readonly openingsByWall: Readonly<Record<StudioBg3dRoomWallId, readonly StudioBg3dRoomOpeningRect[]>>;
  readonly trims: StudioBg3dRoomTrims;
}

/** 벽마다 몰딩 단을 개구부에서 끊어 상자로 만든다. */
export function buildStudioBg3dRoomTrimParts(input: StudioBg3dRoomTrimBuildInput): StudioBg3dRoomPart[] {
  const bands = resolveStudioBg3dRoomTrimBands(input.trims, input.wallHeight);
  if (bands.length === 0) return [];
  const parts: StudioBg3dRoomPart[] = [];
  for (const wall of input.walls) {
    const frame = input.frames[wall];
    const t = frame.thickness;
    const sideWall = wall === "west" || wall === "east";
    for (const band of bands) {
      // 옆벽은 같은 단의 깊이만큼 짧아져 앞·뒷벽 몰딩과 맞댄다.
      const inset = t / 2 + (sideWall ? band.depth : 0);
      const blocked = input.openingsByWall[wall]
        .filter((rect) => rect.bottom < band.y[1] - 1e-9 && rect.top > band.y[0] + 1e-9)
        .map((rect) => [rect.left, rect.right] as const);
      for (const run of subtractIntervals(-frame.length / 2 + inset, frame.length / 2 - inset, blocked)) {
        parts.push(placeStudioBg3dRoomLocalBox(frame, studioBg3dRoomSlab(
          `${input.wallLabels[wall]} ${band.name}`,
          run,
          band.y,
          [t / 2, t / 2 + band.depth],
          band.color,
        )));
      }
    }
  }
  return parts;
}

// ── 천장 부품 ────────────────────────────────────────────────────────────────────────────────

export interface StudioBg3dRoomCeilingBuildInput {
  readonly width: number;
  readonly depth: number;
  readonly wallThickness: number;
  readonly wallHeight: number;
  readonly style: StudioBg3dRoomCeilingStyle;
}

function ceilingPart(
  name: string,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  color: string,
): StudioBg3dRoomPart {
  return { kind: "box", name, ceiling: true, position, rotation: [0, 0, 0], scale, color };
}

/** 같은 간격으로 n 개를 [-span/2, span/2] 안에 놓는 중심 좌표. edgeHalf 이면 양 끝에 반 칸 여백, 아니면 벽에서 한 칸. */
function evenly(count: number, span: number, edgeHalf: boolean): number[] {
  return Array.from({ length: count }, (_, index) =>
    -span / 2 + span * (edgeHalf ? (index + 0.5) / count : (index + 1) / (count + 1)));
}

export function buildStudioBg3dRoomCeilingParts(input: StudioBg3dRoomCeilingBuildInput): StudioBg3dRoomPart[] {
  if (input.style === "none") return [];
  const { width, depth, wallThickness: t, wallHeight: height } = input;
  const thickness = STUDIO_BG3D_ROOM_CEILING_THICKNESS;
  const parts = [
    ceilingPart("천장", [0, height + thickness / 2, 0], [width + t, thickness, depth + t], TRIM_COLOR.ceiling),
  ];
  const spanX = width - t;
  const spanZ = depth - t;
  if (input.style === "rafter") {
    // 서까래는 짧은 쪽으로 걸쳐 긴 쪽을 따라 0.8m 남짓 간격으로 늘어선다(2–12개).
    const alongZ = spanZ <= spanX;
    const run = alongZ ? spanX : spanZ;
    const count = Math.min(12, Math.max(2, Math.floor(run / 0.8)));
    const beamDepth = 0.14;
    for (const offset of evenly(count, run, true)) {
      parts.push(ceilingPart(
        "천장 서까래",
        alongZ ? [offset, height - beamDepth / 2, 0] : [0, height - beamDepth / 2, offset],
        alongZ ? [0.09, beamDepth, spanZ] : [spanX, beamDepth, 0.09],
        TRIM_COLOR.beam,
      ));
    }
  } else if (input.style === "coffered") {
    // 우물반자: 두 방향 보가 합쳐 8개 이하. 약 1.6m 칸, 방향마다 깊이를 달리한다.
    let countX = Math.min(5, Math.max(1, Math.round(spanX / 1.6)));
    let countZ = Math.min(5, Math.max(1, Math.round(spanZ / 1.6)));
    while (countX + countZ > 8) {
      if (countX >= countZ) countX -= 1;
      else countZ -= 1;
    }
    for (const x of evenly(countX, spanX, false)) {
      parts.push(ceilingPart("천장 우물 보", [x, height - 0.08, 0], [0.12, 0.16, spanZ], TRIM_COLOR.beam));
    }
    for (const z of evenly(countZ, spanZ, false)) {
      parts.push(ceilingPart("천장 우물 보", [0, height - 0.06, z], [spanX, 0.12, 0.12], TRIM_COLOR.beam));
    }
  }
  return parts;
}

type Vec3 = readonly [number, number, number];

export interface StudioBg3dRoomCeilingCutawayInput {
  /** 방 중심이 원점인 방-로컬 좌표. */
  readonly cameraPosition: Vec3;
  readonly focusPoint: Vec3;
  readonly roomWidth: number;
  readonly roomDepth: number;
  readonly wallThickness: number;
  readonly wallHeight: number;
}

/**
 * 자동 단면의 천장 판정: 카메라가 천장보다 높고, 카메라→초점 시선이 천장 아랫면 높이를 방의 바깥 둘레 안에서 지나면
 * 천장이 시선을 가린다. 방 안이나 천장 아래에서 보는 카메라에는 천장을 남긴다(벽 판정처럼 생성 시점 1회).
 */
export function evaluateStudioBg3dRoomCeilingCutaway(input: StudioBg3dRoomCeilingCutawayInput): boolean {
  const { cameraPosition: camera, focusPoint: focus } = input;
  if (![...camera, ...focus, input.roomWidth, input.roomDepth, input.wallHeight].every(Number.isFinite)) return false;
  if (!(camera[1] > input.wallHeight + 1e-9)) return false;
  const span = focus[1] - camera[1];
  if (span === 0) return false;
  const ratio = (input.wallHeight - camera[1]) / span;
  if (!(ratio > 0 && ratio <= 1)) return false;
  const x = camera[0] + ratio * (focus[0] - camera[0]);
  const z = camera[2] + ratio * (focus[2] - camera[2]);
  return Math.abs(x) <= (input.roomWidth + input.wallThickness) / 2 + 1e-9
    && Math.abs(z) <= (input.roomDepth + input.wallThickness) / 2 + 1e-9;
}
