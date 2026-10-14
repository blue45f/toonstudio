/**
 * studio-perspective-guide.ts — 원근(투시) 가이드 모델 (drawing 레인 본 배선)
 *
 * artcraft-features 초안(순수 모델)을 main 기준으로 다듬어 정본화한 모듈.
 * 1/2/3점 투시에서 소실점·지평선을 정의하고, 캔버스에 표시할 소실점 격자
 * 선 집합과 점 스냅(가이드 선으로의 투영)을 계산한다. 렌더·저장은 호출부
 * 책임이며, 펜 입력 스냅 세션은 studio-perspective-pen-snap.ts 가 맡는다.
 *
 * 기존 원근 체계와의 관계 (중복이 아니라 층위 분리):
 * - creator/studio-perspective-guide.ts — StudioPage 호스트 전용 원근자
 *   (문서 소실점 + 눈높이). 문서 모델을 소유한다.
 * - drawing/studio-rulers.ts — 자 패널의 퍼스펙티브 자(소실점 1–3개)와
 *   세션 스냅. 자 목록이 진실이다.
 * - 이 모듈 — 자 패널(StudioRulersPanel)이 1/2/3점 토글로 고른 가이드를
 *   "격자 표시 + 그리기 스냅"으로 바꾸는 순수 기하 층. 퍼스펙티브 자와는
 *   perspectiveGuideFromPerspectiveRuler / vanishingPointsFromPerspectiveGuide
 *   브리지로 왕복 변환한다 (어느 쪽도 다른 쪽을 import 하지 않는 단방향:
 *   이 모듈만 studio-rulers 의 타입을 참조한다).
 *
 * 초안에서 달라진 점:
 * - 가이드 선을 기준점→소실점 반직선이 아니라 양방향 직선으로 뻗는다
 *   (격자가 캔버스 반대편까지 이어져야 표시·스냅이 끊기지 않는다).
 * - 지평선(horizon) 패밀리 선을 명시적으로 포함한다.
 * - 캔버스 경계로 자른 표시용 세그먼트(buildPerspectiveGridSegments)를
 *   제공한다 — 오버레이는 이 결과만 그리면 된다.
 * - normalizePerspectiveGuide 로 kind↔소실점 개수 정합을 강제한다.
 *
 * 확장 (B→A, 프리셋·가이드 종류):
 * - 장면 프리셋(PERSPECTIVE_SCENE_PRESETS): 복도·실내 코너·거리·넓은 광장·
 *   고층 올려보기·내려보기의 전형 구도를 소실점/수평선 배치로 한 번에 적용.
 * - 격자 밀도(PerspectiveGridDensity): divisions 를 성김/보통/촘촘/아주
 *   촘촘으로 고르는 이름 있는 옵션. divisions 직접 지정이 항상 우선한다.
 * - 표시 모드(PerspectiveGuideDisplayMode): "fisheye" 는 직선 격자를
 *   중심 기준 배럴 왜곡으로 휘게 한 근사 곡선 격자다. 곡선은 짧은 직선
 *   세그먼트(폴리라인)로 잘게 나눠 돌려주므로 기존 렌더·snapPointToGuides
 *   가 그대로 동작한다(스냅 대상만 직선에서 곡선 근사로 바뀐다).
 * - 보조 격자(PerspectiveAuxiliaryGuideKind): 동심원·방사 격자를
 *   family="auxiliary" 세그먼트로 붙인다. 소실점 격자와 독립이다.
 * - 위 확장은 전부 기본값이 기존 동작이다: 프리셋 미적용·밀도 standard·
 *   표시 linear·보조 none 이면 종전 결과와 동일하다.
 *
 * 좌표계: 캔버스 픽셀, y 아래 방향. 소실점은 캔버스 밖(음수·초과)도 허용한다.
 */

import type { RulerPoint, StudioPerspectiveRuler } from "./studio-rulers";

export interface GuidePoint {
  readonly x: number;
  readonly y: number;
}

export type PerspectiveKind = "one-point" | "two-point" | "three-point";

export const PERSPECTIVE_KINDS: readonly PerspectiveKind[] = [
  "one-point",
  "two-point",
  "three-point",
] as const;

export function isPerspectiveKind(value: unknown): value is PerspectiveKind {
  return (PERSPECTIVE_KINDS as readonly unknown[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* 격자 밀도                                                           */
/* ------------------------------------------------------------------ */

/** 격자 밀도 이름. divisions 숫자 대신 패널·저장에서 쓰는 안정 식별자. */
export type PerspectiveGridDensity = "sparse" | "standard" | "dense" | "fine";

export const PERSPECTIVE_GRID_DENSITIES: readonly PerspectiveGridDensity[] = [
  "sparse",
  "standard",
  "dense",
  "fine",
] as const;

/** 밀도 → 기준점 양쪽으로 만들 평행 이동선 칸 수(buildVanishingGuideLines). */
export const PERSPECTIVE_GRID_DENSITY_DIVISIONS: Readonly<
  Record<PerspectiveGridDensity, number>
> = {
  sparse: 3,
  standard: 6,
  dense: 10,
  fine: 16,
} as const;

export function isPerspectiveGridDensity(
  value: unknown,
): value is PerspectiveGridDensity {
  return (PERSPECTIVE_GRID_DENSITIES as readonly unknown[]).includes(value);
}

export function normalizePerspectiveGridDensity(
  value: unknown,
  fallback: PerspectiveGridDensity = "standard",
): PerspectiveGridDensity {
  return isPerspectiveGridDensity(value) ? value : fallback;
}

/** 밀도의 divisions. 알 수 없는 밀도면 standard 값. */
export function perspectiveGridDivisionsForDensity(
  density: PerspectiveGridDensity | undefined,
): number {
  return PERSPECTIVE_GRID_DENSITY_DIVISIONS[density ?? "standard"];
}

/** 점 개수(1–3) ↔ 투시 종류. 범위를 벗어나면 null. */
export function perspectiveKindForPointCount(
  count: number,
): PerspectiveKind | null {
  if (count === 1) return "one-point";
  if (count === 2) return "two-point";
  if (count === 3) return "three-point";
  return null;
}

export interface PerspectiveGuide {
  readonly kind: PerspectiveKind;
  /** 지평선 기울기(라디안). 보통 0. */
  readonly horizonAngle: number;
  /**
   * 좌/우/수직 소실점. kind에 따라 없는 항목은 undefined.
   * one-point 에서는 left 가 중앙 소실점을 담는다(초안 호환).
   */
  readonly left?: GuidePoint;
  readonly right?: GuidePoint;
  readonly vertical?: GuidePoint;
}

export interface GuideLine {
  readonly from: GuidePoint;
  readonly to: GuidePoint;
  /**
   * 어느 소실점 계열의 선인지 (스냅·표시 그룹용).
   * "auxiliary" 는 소실점과 무관한 보조 격자(동심원·방사) 전용이다 —
   * 펜 스냅 세션(studio-perspective-pen-snap)은 소실점 패밀리만 확정
   * 대상으로 삼으므로 보조 선이 스냅 방향을 바꾸지 않는다.
   */
  readonly family: "left" | "right" | "vertical" | "horizon" | "auxiliary";
}

/** 가이드가 가진 소실점을 [left, right, vertical] 순서로 돌려준다. */
export function perspectiveVanishingPoints(
  guide: PerspectiveGuide,
): GuidePoint[] {
  const points: GuidePoint[] = [];
  if (guide.left) points.push(guide.left);
  if (guide.right) points.push(guide.right);
  if (guide.vertical) points.push(guide.vertical);
  return points;
}

function isFinitePoint(point: GuidePoint | undefined): point is GuidePoint {
  return (
    point !== undefined &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

/**
 * kind↔소실점 정합을 강제한다.
 * - one-point: left 만 남긴다. left 가 없고 right 가 있으면 right 를 승격한다.
 * - two-point: vertical 을 버린다. 소실점이 하나뿐이면 one-point 로 내린다.
 * - three-point: vertical 이 없으면 two-point 로 내린다(없는 점을 지어내지 않는다).
 * - 유효한 소실점이 하나도 없으면 null.
 * horizonAngle 이 비유효면 0으로 둔다.
 */
export function normalizePerspectiveGuide(
  guide: PerspectiveGuide,
): PerspectiveGuide | null {
  const left = isFinitePoint(guide.left) ? guide.left : undefined;
  const right = isFinitePoint(guide.right) ? guide.right : undefined;
  const vertical = isFinitePoint(guide.vertical) ? guide.vertical : undefined;
  const horizonAngle = Number.isFinite(guide.horizonAngle)
    ? guide.horizonAngle
    : 0;

  if (guide.kind === "one-point") {
    const only = left ?? right ?? vertical;
    if (!only) return null;
    return { kind: "one-point", horizonAngle, left: only };
  }
  if (guide.kind === "two-point") {
    if (left && right) return { kind: "two-point", horizonAngle, left, right };
    const only = left ?? right ?? vertical;
    if (!only) return null;
    return { kind: "one-point", horizonAngle, left: only };
  }
  // three-point
  if (left && right && vertical) {
    return { kind: "three-point", horizonAngle, left, right, vertical };
  }
  if (left && right) return { kind: "two-point", horizonAngle, left, right };
  const only = left ?? right ?? vertical;
  if (!only) return null;
  return { kind: "one-point", horizonAngle, left: only };
}

/** 캔버스 중앙 지평선 + 폭 비례 간격으로 기본 가이드를 만든다. */
export function createDefaultPerspectiveGuide(
  kind: PerspectiveKind,
  canvas: { readonly width: number; readonly height: number },
): PerspectiveGuide {
  const { width, height } = canvas;
  const cy = height / 2;
  const base: PerspectiveGuide = {
    kind,
    horizonAngle: 0,
    left: { x: -width * 0.6, y: cy },
    right: { x: width * 1.6, y: cy },
  };
  if (kind === "one-point") {
    return { kind, horizonAngle: 0, left: { x: width / 2, y: cy } };
  }
  if (kind === "three-point") {
    return { ...base, vertical: { x: width / 2, y: -height * 1.2 } };
  }
  return base;
}

/** from 에서 through 방향으로 뻗는 단위 방향 × reach 만큼 간 끝점. */
function rayEnd(
  from: GuidePoint,
  through: GuidePoint,
  reach: number,
  sign: 1 | -1,
): GuidePoint {
  const dx = through.x - from.x;
  const dy = through.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: from.x + (dx / len) * reach * sign,
    y: from.y + (dy / len) * reach * sign,
  };
}

/**
 * 한 평면(바닥·벽)의 격자 가이드 선을 만든다.
 * anchor는 평면 위 기준점, divisions는 기준점에서 소실점 방향으로 나눌 칸 수.
 * 각 소실점마다 "기준점을 지나는 선"과 기준점을 소실점과 수직 방향으로
 * 조금씩 옮긴 평행 이동선들(격자 칸)을 함께 낸다. 선은 양방향으로
 * 캔버스 대각선의 2배까지 뻗어 있어, 표시 측은 clipGuideLineToCanvas 로
 * 잘라 쓰거나 그대로 그려도 된다(캔버스 밖은 잘리는 것이 전제).
 * 지평선 패밀리: 좌·우 소실점이 모두 있으면 그 둘을 잇는 직선, 하나만
 * 있으면 그 점을 지나는 수평선을 한 줄 포함한다(horizonAngle=0 기준 —
 * 기울어진 지평선은 호출부가 점을 회전시켜 넣는 것을 전제로 한다).
 */
export function buildVanishingGuideLines(input: {
  readonly guide: PerspectiveGuide;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchor: GuidePoint;
  /** 직접 칸 수. 주면 density 보다 우선한다. */
  readonly divisions?: number;
  /** 이름 있는 밀도. divisions 가 없을 때만 쓰인다. 기본 standard(6). */
  readonly density?: PerspectiveGridDensity;
}): GuideLine[] {
  const { guide, canvas, anchor } = input;
  const divisions = Math.max(
    1,
    Math.min(
      24,
      input.divisions ?? perspectiveGridDivisionsForDensity(input.density),
    ),
  );
  const reach = Math.hypot(canvas.width, canvas.height) * 2;
  const lines: GuideLine[] = [];

  // 지평선
  if (guide.left && guide.right) {
    lines.push({
      from: rayEnd(guide.left, guide.right, reach, -1),
      to: rayEnd(guide.left, guide.right, reach, 1),
      family: "horizon",
    });
  } else if (guide.left || guide.right) {
    const vp = (guide.left ?? guide.right) as GuidePoint;
    lines.push({
      from: { x: vp.x - reach, y: vp.y },
      to: { x: vp.x + reach, y: vp.y },
      family: "horizon",
    });
  }

  const families: Array<{ vp?: GuidePoint; family: GuideLine["family"] }> = [
    { vp: guide.left, family: "left" },
    { vp: guide.right, family: "right" },
    { vp: guide.vertical, family: "vertical" },
  ];
  for (const { vp, family } of families) {
    if (!vp) continue;
    const pushLine = (from: GuidePoint): void => {
      // 기준점이 소실점과 겹치면 방향이 정의되지 않는다 — 그 줄은 건너뛴다.
      if (Math.hypot(vp.x - from.x, vp.y - from.y) < 1e-9) return;
      lines.push({
        from: rayEnd(from, vp, reach, -1),
        to: rayEnd(from, vp, reach, 1),
        family,
      });
    };
    pushLine(anchor);
    for (let i = 1; i <= divisions; i += 1) {
      const spread = i * (canvas.height / (divisions * 2));
      const shifted: GuidePoint =
        family === "vertical"
          ? { x: anchor.x + spread, y: anchor.y }
          : { x: anchor.x, y: anchor.y + spread };
      pushLine(shifted);
      const shiftedBack: GuidePoint =
        family === "vertical"
          ? { x: anchor.x - spread, y: anchor.y }
          : { x: anchor.x, y: anchor.y - spread };
      pushLine(shiftedBack);
    }
  }
  return lines;
}

/**
 * 직선 세그먼트를 캔버스 직사각형 [0,w]×[0,h] 로 자른다(Liang–Barsky).
 * 완전히 밖에 있거나 길이가 0에 가까우면 null.
 */
export function clipGuideLineToCanvas(
  line: GuideLine,
  canvas: { readonly width: number; readonly height: number },
): GuideLine | null {
  const { width, height } = canvas;
  if (!(width > 0) || !(height > 0)) return null;
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  let t0 = 0;
  let t1 = 1;
  // p·t <= q 형태의 네 경계
  const edges: Array<[number, number]> = [
    [-dx, line.from.x],
    [dx, width - line.from.x],
    [-dy, line.from.y],
    [dy, height - line.from.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  const from = { x: line.from.x + dx * t0, y: line.from.y + dy * t0 };
  const to = { x: line.from.x + dx * t1, y: line.from.y + dy * t1 };
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) return null;
  return { from, to, family: line.family };
}

/**
 * 표시용 격자 세그먼트 — buildVanishingGuideLines 를 캔버스로 자른 결과.
 * anchor 기본값은 캔버스 중앙. 오버레이·패널 미리보기는 이 결과만 그린다.
 */
export function buildPerspectiveGridSegments(input: {
  readonly guide: PerspectiveGuide;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchor?: GuidePoint;
  readonly divisions?: number;
  readonly density?: PerspectiveGridDensity;
}): GuideLine[] {
  const anchor = input.anchor ?? {
    x: input.canvas.width / 2,
    y: input.canvas.height / 2,
  };
  const lines = buildVanishingGuideLines({
    guide: input.guide,
    canvas: input.canvas,
    anchor,
    divisions: input.divisions,
    density: input.density,
  });
  const segments: GuideLine[] = [];
  for (const line of lines) {
    const clipped = clipGuideLineToCanvas(line, input.canvas);
    if (clipped) segments.push(clipped);
  }
  return segments;
}

/** 점과 직선 사이의 최단 투영. 스냅 판정·스냅 결과 공용. */
export function projectPointToLine(
  point: GuidePoint,
  line: GuideLine,
): { projected: GuidePoint; distance: number } {
  const { from, to } = line;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lenSq = dx * dx + dy * dy || 1;
  const t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lenSq;
  const projected = { x: from.x + dx * t, y: from.y + dy * t };
  return {
    projected,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

/** 기본 스냅 임계(캔버스 px). 이 안의 가장 가까운 가이드 선으로 스냅한다. */
export const PERSPECTIVE_GUIDE_SNAP_THRESHOLD_PX = 10;

/** 임계 거리 안의 가장 가까운 가이드 선으로 점을 스냅한다. 없으면 null. */
export function snapPointToGuides(
  point: GuidePoint,
  lines: readonly GuideLine[],
  thresholdPx: number = PERSPECTIVE_GUIDE_SNAP_THRESHOLD_PX,
): GuidePoint | null {
  let best: GuidePoint | null = null;
  let bestDist = thresholdPx;
  for (const line of lines) {
    const { projected, distance } = projectPointToLine(point, line);
    if (distance < bestDist) {
      bestDist = distance;
      best = projected;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 장면 프리셋                                                         */
/* ------------------------------------------------------------------ */

/**
 * 전형적 구도 프리셋 식별자.
 * - corridor: 실내 복도·터널 — 중앙 1점, 수평선 약간 위.
 * - room-corner: 실내 코너 — 방 모서리가 보이는 2점.
 * - street: 거리 — 한쪽이 더 가까운 비대칭 2점.
 * - wide-plaza: 넓은 광장 — 소실점이 먼 완만한 2점, 수평선 낮게.
 * - high-rise-up: 고층 올려보기 — 수평선이 아래, 수직 소실점이 위 먼 곳.
 * - overlook-down: 내려보기 — 수평선이 위, 수직 소실점이 아래 먼 곳.
 */
export type PerspectiveScenePresetId =
  | "corridor"
  | "room-corner"
  | "street"
  | "wide-plaza"
  | "high-rise-up"
  | "overlook-down";

export interface PerspectiveScenePresetPoint {
  /** 캔버스 폭 대비 비율 (0–1 밖 허용). x = xRatio × width. */
  readonly xRatio: number;
  /** 캔버스 높이 대비 비율 (0–1 밖 허용). y = yRatio × height. */
  readonly yRatio: number;
}

export interface PerspectiveScenePreset {
  readonly id: PerspectiveScenePresetId;
  readonly kind: PerspectiveKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 수평선 높이 비율. left/right(1점에서는 left)의 yRatio 와 같다. */
  readonly horizonYRatio: number;
  readonly left: PerspectiveScenePresetPoint;
  readonly right?: PerspectiveScenePresetPoint;
  readonly vertical?: PerspectiveScenePresetPoint;
}

export const PERSPECTIVE_SCENE_PRESETS: readonly PerspectiveScenePreset[] = [
  {
    id: "corridor",
    kind: "one-point",
    labelKo: "복도",
    labelEn: "Corridor",
    descriptionKo: "실내 복도·터널처럼 한가운데로 빨려 들어가는 1점 구도",
    descriptionEn: "One-point view down a corridor or tunnel",
    horizonYRatio: 0.46,
    left: { xRatio: 0.5, yRatio: 0.46 },
  },
  {
    id: "room-corner",
    kind: "two-point",
    labelKo: "실내 코너",
    labelEn: "Room corner",
    descriptionKo: "방 모서리가 정면에 오는 실내 2점 구도",
    descriptionEn: "Two-point interior with the room corner facing you",
    horizonYRatio: 0.54,
    left: { xRatio: -0.55, yRatio: 0.54 },
    right: { xRatio: 1.55, yRatio: 0.54 },
  },
  {
    id: "street",
    kind: "two-point",
    labelKo: "거리",
    labelEn: "Street",
    descriptionKo: "가까운 건물면이 강조되는 비대칭 거리 2점 구도",
    descriptionEn: "Asymmetric two-point street view with a nearer face",
    horizonYRatio: 0.56,
    left: { xRatio: -1.05, yRatio: 0.56 },
    right: { xRatio: 1.38, yRatio: 0.56 },
  },
  {
    id: "wide-plaza",
    kind: "two-point",
    labelKo: "넓은 광장",
    labelEn: "Wide plaza",
    descriptionKo: "소실점이 멀어 경사가 완만한 광장·풍경 2점 구도",
    descriptionEn: "Gentle two-point view across a wide plaza",
    horizonYRatio: 0.62,
    left: { xRatio: -1.5, yRatio: 0.62 },
    right: { xRatio: 2.5, yRatio: 0.62 },
  },
  {
    id: "high-rise-up",
    kind: "three-point",
    labelKo: "고층 올려보기",
    labelEn: "Looking up at high-rises",
    descriptionKo: "수평선이 아래로 내려가고 건물이 위로 모이는 올려보기 3점 구도",
    descriptionEn: "Three-point view looking up — verticals converge above",
    horizonYRatio: 0.7,
    left: { xRatio: -0.65, yRatio: 0.7 },
    right: { xRatio: 1.65, yRatio: 0.7 },
    vertical: { xRatio: 0.5, yRatio: -1.9 },
  },
  {
    id: "overlook-down",
    kind: "three-point",
    labelKo: "내려보기",
    labelEn: "Looking down",
    descriptionKo: "수평선이 위로 올라가고 아래로 모이는 내려보기 3점 구도",
    descriptionEn: "Three-point view looking down — verticals converge below",
    horizonYRatio: 0.3,
    left: { xRatio: -0.65, yRatio: 0.3 },
    right: { xRatio: 1.65, yRatio: 0.3 },
    vertical: { xRatio: 0.5, yRatio: 2.9 },
  },
] as const;

export function isPerspectiveScenePresetId(
  value: unknown,
): value is PerspectiveScenePresetId {
  return PERSPECTIVE_SCENE_PRESETS.some((preset) => preset.id === value);
}

export function perspectiveScenePresetById(
  id: PerspectiveScenePresetId | string,
): PerspectiveScenePreset | null {
  return PERSPECTIVE_SCENE_PRESETS.find((preset) => preset.id === id) ?? null;
}

function presetPoint(
  point: PerspectiveScenePresetPoint,
  canvas: { readonly width: number; readonly height: number },
): GuidePoint {
  return { x: point.xRatio * canvas.width, y: point.yRatio * canvas.height };
}

/**
 * 프리셋 → 가이드. 캔버스 크기에 비례해 소실점·수평선 배치를 한 번에 만든다.
 * 알 수 없는 id 거나 캔버스가 유효하지 않으면 null. 결과는 항상
 * normalizePerspectiveGuide 를 통과한 형태(kind↔소실점 정합 보장)다.
 */
export function createPerspectiveGuideFromScenePreset(
  preset: PerspectiveScenePresetId | PerspectiveScenePreset | string,
  canvas: { readonly width: number; readonly height: number },
): PerspectiveGuide | null {
  const resolved =
    typeof preset === "string" ? perspectiveScenePresetById(preset) : preset;
  if (!resolved) return null;
  if (
    !(canvas.width > 0) ||
    !(canvas.height > 0) ||
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height)
  ) {
    return null;
  }
  return normalizePerspectiveGuide({
    kind: resolved.kind,
    horizonAngle: 0,
    left: presetPoint(resolved.left, canvas),
    right: resolved.right ? presetPoint(resolved.right, canvas) : undefined,
    vertical: resolved.vertical
      ? presetPoint(resolved.vertical, canvas)
      : undefined,
  });
}

/* ------------------------------------------------------------------ */
/* 표시 모드: 직선 / 피쉬아이 곡선 근사                                */
/* ------------------------------------------------------------------ */

export type PerspectiveGuideDisplayMode = "linear" | "fisheye";

export const PERSPECTIVE_GUIDE_DISPLAY_MODES: readonly PerspectiveGuideDisplayMode[] =
  ["linear", "fisheye"] as const;

export function isPerspectiveGuideDisplayMode(
  value: unknown,
): value is PerspectiveGuideDisplayMode {
  return (PERSPECTIVE_GUIDE_DISPLAY_MODES as readonly unknown[]).includes(value);
}

export function normalizePerspectiveGuideDisplayMode(
  value: unknown,
  fallback: PerspectiveGuideDisplayMode = "linear",
): PerspectiveGuideDisplayMode {
  return isPerspectiveGuideDisplayMode(value) ? value : fallback;
}

/** 피쉬아이 강도 기본값·범위 (0 = 직선과 동일, 1 = 가장 강한 휨). */
export const PERSPECTIVE_FISHEYE_STRENGTH_DEFAULT = 0.35;
export const PERSPECTIVE_FISHEYE_STRENGTH_MAX = 1;

export function normalizePerspectiveFisheyeStrength(
  value: number | undefined,
  fallback: number = PERSPECTIVE_FISHEYE_STRENGTH_DEFAULT,
): number {
  const candidate =
    value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(PERSPECTIVE_FISHEYE_STRENGTH_MAX, candidate));
}

/**
 * 한 점을 캔버스 중심 기준 배럴 왜곡으로 민다(피쉬아이 근사).
 * 중심에서 멀수록 안쪽으로 더 당겨지므로, 중심을 지나지 않는 직선은
 * 볼록한 곡선으로 휜다. strength 0 이면 입력 그대로다.
 */
export function warpPerspectivePointForFisheye(
  point: GuidePoint,
  canvas: { readonly width: number; readonly height: number },
  strength: number,
): GuidePoint {
  const k = normalizePerspectiveFisheyeStrength(strength, 0);
  if (k <= 0) return { x: point.x, y: point.y };
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxR = Math.hypot(canvas.width, canvas.height) / 2 || 1;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const r = Math.hypot(dx, dy) / maxR;
  const scale = 1 - 0.45 * k * r * r;
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * 표시용 세그먼트 — 표시 모드를 반영한 단일 진입점.
 * - linear: buildPerspectiveGridSegments 와 완전히 동일하다.
 * - fisheye: 잘린 직선 세그먼트를 잘게 나눈 뒤 각 연결점을 왜곡해
 *   곡선 근사 폴리라인으로 돌려준다. 결과도 GuideLine[] 이므로 기존
 *   오버레이 렌더와 snapPointToGuides 가 그대로 동작한다.
 */
export function buildPerspectiveDisplaySegments(input: {
  readonly guide: PerspectiveGuide;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchor?: GuidePoint;
  readonly divisions?: number;
  readonly density?: PerspectiveGridDensity;
  readonly displayMode?: PerspectiveGuideDisplayMode;
  readonly fisheyeStrength?: number;
  /** 곡선 근사 절분 수 (세그먼트당). 기본 12, 2–32로 자른다. */
  readonly fisheyeSubdivisions?: number;
}): GuideLine[] {
  if (input.displayMode !== "fisheye") {
    return buildPerspectiveGridSegments(input);
  }
  const strength = normalizePerspectiveFisheyeStrength(input.fisheyeStrength);
  if (strength <= 0) return buildPerspectiveGridSegments(input);
  const subdivisions = Math.max(
    2,
    Math.min(32, Math.round(input.fisheyeSubdivisions ?? 12)),
  );
  const straight = buildPerspectiveGridSegments(input);
  const curved: GuideLine[] = [];
  for (const segment of straight) {
    let prev = warpPerspectivePointForFisheye(
      segment.from,
      input.canvas,
      strength,
    );
    for (let i = 1; i <= subdivisions; i += 1) {
      const t = i / subdivisions;
      const raw = {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        y: segment.from.y + (segment.to.y - segment.from.y) * t,
      };
      const next = warpPerspectivePointForFisheye(raw, input.canvas, strength);
      if (Math.hypot(next.x - prev.x, next.y - prev.y) >= 1e-9) {
        curved.push({ from: prev, to: next, family: segment.family });
      }
      prev = next;
    }
  }
  return curved;
}

/* ------------------------------------------------------------------ */
/* 보조 격자: 동심원·방사                                              */
/* ------------------------------------------------------------------ */

export type PerspectiveAuxiliaryGuideKind = "none" | "concentric" | "radial";

export const PERSPECTIVE_AUXILIARY_GUIDE_KINDS: readonly PerspectiveAuxiliaryGuideKind[] =
  ["none", "concentric", "radial"] as const;

export function isPerspectiveAuxiliaryGuideKind(
  value: unknown,
): value is PerspectiveAuxiliaryGuideKind {
  return (PERSPECTIVE_AUXILIARY_GUIDE_KINDS as readonly unknown[]).includes(
    value,
  );
}

export function normalizePerspectiveAuxiliaryGuideKind(
  value: unknown,
  fallback: PerspectiveAuxiliaryGuideKind = "none",
): PerspectiveAuxiliaryGuideKind {
  return isPerspectiveAuxiliaryGuideKind(value) ? value : fallback;
}

const AUXILIARY_CIRCLE_SIDES = 48;

/**
 * 보조 격자 세그먼트(전부 family="auxiliary", 캔버스로 잘림).
 * - concentric: 중심 기준 동심원을 다각형 근사로 그린다. 피쉬아이
 *   구도의 동심 가이드나 원형 구도 잡기에 쓴다.
 * - radial: 중심에서 방사하는 직선들. 방사 구도·대칭 축 확인용.
 * kind="none" 이거나 캔버스가 유효하지 않으면 빈 배열이다.
 */
export function buildPerspectiveAuxiliarySegments(input: {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly kind: PerspectiveAuxiliaryGuideKind;
  readonly center?: GuidePoint;
  /** 동심원 링 수. 기본 4, 1–8. */
  readonly rings?: number;
  /** 방사 스포크 수. 기본 12, 3–36. */
  readonly spokes?: number;
}): GuideLine[] {
  const { canvas, kind } = input;
  if (kind === "none") return [];
  if (!(canvas.width > 0) || !(canvas.height > 0)) return [];
  const center = input.center ?? {
    x: canvas.width / 2,
    y: canvas.height / 2,
  };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return [];
  const segments: GuideLine[] = [];
  const pushClipped = (line: GuideLine): void => {
    const clipped = clipGuideLineToCanvas(line, canvas);
    if (clipped) segments.push(clipped);
  };

  if (kind === "concentric") {
    const rings = Math.max(1, Math.min(8, Math.round(input.rings ?? 4)));
    const step = Math.max(canvas.width, canvas.height) / (rings + 1);
    for (let ring = 1; ring <= rings; ring += 1) {
      const radius = step * ring;
      let prev: GuidePoint = {
        x: center.x + radius,
        y: center.y,
      };
      for (let i = 1; i <= AUXILIARY_CIRCLE_SIDES; i += 1) {
        const angle = (i / AUXILIARY_CIRCLE_SIDES) * Math.PI * 2;
        const next: GuidePoint = {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        };
        pushClipped({ from: prev, to: next, family: "auxiliary" });
        prev = next;
      }
    }
    return segments;
  }

  // radial
  const spokes = Math.max(3, Math.min(36, Math.round(input.spokes ?? 12)));
  const reach = Math.hypot(canvas.width, canvas.height);
  for (let i = 0; i < spokes; i += 1) {
    const angle = (i / spokes) * Math.PI;
    const dx = Math.cos(angle) * reach;
    const dy = Math.sin(angle) * reach;
    pushClipped({
      from: { x: center.x - dx, y: center.y - dy },
      to: { x: center.x + dx, y: center.y + dy },
      family: "auxiliary",
    });
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* 통합 빌더 (패널·호스트 공용)                                        */
/* ------------------------------------------------------------------ */

export interface PerspectiveGuideRenderOptions {
  readonly divisions?: number;
  readonly density?: PerspectiveGridDensity;
  readonly displayMode?: PerspectiveGuideDisplayMode;
  readonly fisheyeStrength?: number;
  readonly auxiliaryKind?: PerspectiveAuxiliaryGuideKind;
  readonly auxiliaryCenter?: GuidePoint;
}

/**
 * 소실점 격자(표시 모드 반영) + 보조 격자를 한 번에 만든다.
 * 옵션을 하나도 주지 않으면 buildPerspectiveGridSegments 와 동일하다 —
 * 확장을 끈 상태는 기존 동작과 완전히 같다.
 */
export function buildPerspectiveGuideSegments(input: {
  readonly guide: PerspectiveGuide;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchor?: GuidePoint;
  readonly options?: PerspectiveGuideRenderOptions;
}): GuideLine[] {
  const options = input.options ?? {};
  const segments = buildPerspectiveDisplaySegments({
    guide: input.guide,
    canvas: input.canvas,
    anchor: input.anchor,
    divisions: options.divisions,
    density: options.density,
    displayMode: options.displayMode,
    fisheyeStrength: options.fisheyeStrength,
  });
  const auxiliaryKind = options.auxiliaryKind ?? "none";
  if (auxiliaryKind === "none") return segments;
  return [
    ...segments,
    ...buildPerspectiveAuxiliarySegments({
      canvas: input.canvas,
      kind: auxiliaryKind,
      center: options.auxiliaryCenter ?? input.anchor,
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* studio-rulers 퍼스펙티브 자와의 브리지                              */
/* ------------------------------------------------------------------ */

/**
 * 퍼스펙티브 자(소실점 배열) → 가이드.
 * 1개 → one-point(left), 2개 → two-point(left/right), 3개 → three-point.
 * 소실점이 없거나 4개 이상이면 null(자 팩토리가 1–3개만 허용하므로
 * 실제로는 빈 배열만 null 이다).
 */
export function perspectiveGuideFromPerspectiveRuler(
  ruler: Pick<StudioPerspectiveRuler, "vanishingPoints">,
): PerspectiveGuide | null {
  const points = ruler.vanishingPoints;
  const kind = perspectiveKindForPointCount(points.length);
  if (!kind) return null;
  const [first, second, third] = points;
  if (kind === "one-point") {
    return { kind, horizonAngle: 0, left: { x: first.x, y: first.y } };
  }
  if (kind === "two-point") {
    return {
      kind,
      horizonAngle: 0,
      left: { x: first.x, y: first.y },
      right: { x: second.x, y: second.y },
    };
  }
  return {
    kind,
    horizonAngle: 0,
    left: { x: first.x, y: first.y },
    right: { x: second.x, y: second.y },
    vertical: { x: third.x, y: third.y },
  };
}

/**
 * 가이드 → 소실점 배열. createStudioPerspectiveRuler({ vanishingPoints })
 * 에 그대로 넘길 수 있는 형태다(RulerPoint 와 GuidePoint 는 구조 동일).
 */
export function vanishingPointsFromPerspectiveGuide(
  guide: PerspectiveGuide,
): RulerPoint[] {
  return perspectiveVanishingPoints(guide).map((point) => ({
    x: point.x,
    y: point.y,
  }));
}
