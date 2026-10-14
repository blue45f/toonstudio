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
  /** 어느 소실점 계열의 선인지 (스냅·표시 그룹용). */
  readonly family: "left" | "right" | "vertical" | "horizon";
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
  readonly divisions?: number;
}): GuideLine[] {
  const { guide, canvas, anchor } = input;
  const divisions = Math.max(1, Math.min(24, input.divisions ?? 6));
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
