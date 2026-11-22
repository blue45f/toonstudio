/**
 * 시선 동선(Eye-Flow) 및 말풍선 꼬리 가림 가드의 2D 계산 기하 원시 함수.
 *
 * - Liang-Barsky 선분–AABB 교차 판정(`intersectSegmentAabb`)
 * - 두 AABB 교차 및 가림 비율 계산(`intersectAabb`)
 * - 말풍선 내접 타원 경계 꼬리 밑동 산출(`computeBalloonTailBase`)
 * - 얼굴/눈 비가림 권장 꼬리 끝 좌표 솔버(`computeRecommendedTailTip`)
 *
 * 순수·결정적·DOM/React 무의존.
 */

import type {
  AabbOverlap,
  EyeFlowPoint,
  EyeFlowRect,
  ResolvedEyeFlowFaceRegion,
  SegmentAabbIntersection,
} from "./studio-eyeflow-types";

const CANVAS_EDGE_INSET_PX = 4;
const MIN_RECOMMENDED_TAIL_LENGTH_PX = 10;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isFinitePoint(point: EyeFlowPoint | undefined | null): point is EyeFlowPoint {
  return Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y);
}

export function isValidRect(rect: EyeFlowRect | undefined | null): rect is EyeFlowRect {
  return (
    Boolean(rect) &&
    Number.isFinite(rect!.x) &&
    Number.isFinite(rect!.y) &&
    Number.isFinite(rect!.width) &&
    Number.isFinite(rect!.height) &&
    rect!.width > 0 &&
    rect!.height > 0
  );
}

export function rectCenter(rect: EyeFlowRect): EyeFlowPoint {
  return {
    x: round2(rect.x + rect.width / 2),
    y: round2(rect.y + rect.height / 2),
  };
}

export function distanceBetween(a: EyeFlowPoint, b: EyeFlowPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointInsideRect(point: EyeFlowPoint, rect: EyeFlowRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function expandRect(rect: EyeFlowRect, margin: number): EyeFlowRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function clampPointToCanvas(
  point: EyeFlowPoint,
  canvasWidth: number,
  canvasHeight: number,
): EyeFlowPoint {
  const minX = Math.min(CANVAS_EDGE_INSET_PX, canvasWidth / 2);
  const minY = Math.min(CANVAS_EDGE_INSET_PX, canvasHeight / 2);
  const maxX = Math.max(minX, canvasWidth - CANVAS_EDGE_INSET_PX);
  const maxY = Math.max(minY, canvasHeight - CANVAS_EDGE_INSET_PX);
  return {
    x: round2(clamp(point.x, minX, maxX)),
    y: round2(clamp(point.y, minY, maxY)),
  };
}

/**
 * 얼굴 바운딩 박스에서 눈 영역(eye band)을 표준 웹툰 인물 비율로 유도한다.
 */
export function deriveDefaultEyeBounds(faceBounds: EyeFlowRect): EyeFlowRect {
  return {
    x: round2(faceBounds.x + faceBounds.width * 0.14),
    y: round2(faceBounds.y + faceBounds.height * 0.24),
    width: round2(faceBounds.width * 0.72),
    height: round2(faceBounds.height * 0.28),
  };
}

/**
 * Liang-Barsky 선분–AABB 교차 판정.
 */
export function intersectSegmentAabb(
  start: EyeFlowPoint,
  end: EyeFlowPoint,
  rect: EyeFlowRect,
): SegmentAabbIntersection | null {
  if (!isFinitePoint(start) || !isFinitePoint(end) || !isValidRect(rect)) {
    return null;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const xMin = rect.x;
  const xMax = rect.x + rect.width;
  const yMin = rect.y;
  const yMax = rect.y + rect.height;

  const pValues = [-dx, dx, -dy, dy] as const;
  const qValues = [start.x - xMin, xMax - start.x, start.y - yMin, yMax - start.y] as const;

  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < 4; i += 1) {
    const p = pValues[i]!;
    const q = qValues[i]!;
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  if (t0 > t1) return null;

  const entryPoint: EyeFlowPoint = {
    x: round2(start.x + t0 * dx),
    y: round2(start.y + t0 * dy),
  };
  const exitPoint: EyeFlowPoint = {
    x: round2(start.x + t1 * dx),
    y: round2(start.y + t1 * dy),
  };
  const tMid = (t0 + t1) / 2;
  const midpoint: EyeFlowPoint = {
    x: round2(start.x + tMid * dx),
    y: round2(start.y + tMid * dy),
  };

  return {
    tEnter: round2(t0),
    tExit: round2(t1),
    entryPoint,
    exitPoint,
    midpoint,
    clippedLength: round2(distanceBetween(entryPoint, exitPoint)),
  };
}

/**
 * 두 AABB의 교차 영역과 대상(`target`) 면적 대비 가림 비율(0..1)을 계산한다.
 */
export function intersectAabb(source: EyeFlowRect, target: EyeFlowRect): AabbOverlap | null {
  if (!isValidRect(source) || !isValidRect(target)) return null;

  const left = Math.max(source.x, target.x);
  const top = Math.max(source.y, target.y);
  const right = Math.min(source.x + source.width, target.x + target.width);
  const bottom = Math.min(source.y + source.height, target.y + target.height);

  if (right <= left || bottom <= top) return null;

  const width = right - left;
  const height = bottom - top;
  const area = width * height;
  const targetArea = target.width * target.height;

  return {
    rect: {
      x: round2(left),
      y: round2(top),
      width: round2(width),
      height: round2(height),
    },
    area: round2(area),
    targetCoverageRatio: targetArea > 0 ? round2(clamp(area / targetArea, 0, 1)) : 0,
  };
}

/**
 * 말풍선 중심에서 꼬리 끝(`tailTip`)을 향하는 레이와 말풍선 내접 타원의 교점을 구해
 * 꼬리 밑동(시작점) 좌표를 산출한다.
 */
export function computeBalloonTailBase(bounds: EyeFlowRect, tailTip: EyeFlowPoint): EyeFlowPoint {
  const center = rectCenter(bounds);
  if (!isFinitePoint(tailTip) || !isValidRect(bounds)) return center;

  const vx = tailTip.x - center.x;
  const vy = tailTip.y - center.y;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const norm = Math.hypot(vx / rx, vy / ry);

  if (!Number.isFinite(norm) || norm <= 1) {
    return center;
  }

  return {
    x: round2(center.x + vx / norm),
    y: round2(center.y + vy / norm),
  };
}

/**
 * 얼굴 또는 눈 영역을 가리는 말풍선 꼬리에 대해 가림이 없는 권장 꼬리 끝 좌표를 계산한다.
 *
 * 1순위: 화자 방향 레이 위에서 얼굴 안전 여백 바깥으로 후퇴(Blambot 안전 거리 유지).
 * 2순위: 턱선·입가·광대 바깥 12개 외곽 후보 중 눈/얼굴 교차가 없고 원래 지점과 가장 가까운 좌표.
 */
export function computeRecommendedTailTip(params: {
  readonly tailBase: EyeFlowPoint;
  readonly originalTailTip: EyeFlowPoint;
  readonly targetFace: ResolvedEyeFlowFaceRegion;
  readonly allFaces: readonly ResolvedEyeFlowFaceRegion[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly clearanceMarginPx: number;
}): EyeFlowPoint | null {
  const {
    tailBase,
    originalTailTip,
    targetFace,
    allFaces,
    canvasWidth,
    canvasHeight,
    clearanceMarginPx,
  } = params;

  if (!isFinitePoint(tailBase) || !isFinitePoint(originalTailTip)) {
    return null;
  }

  const safeMargin = Math.max(4, clearanceMarginPx);
  const paddedFace = expandRect(targetFace.faceBounds, safeMargin);
  const hitsAnyEyes = (tip: EyeFlowPoint): boolean =>
    allFaces.some((face) => intersectSegmentAabb(tailBase, tip, face.resolvedEyeBounds) !== null);
  const hitsAnyFace = (tip: EyeFlowPoint): boolean =>
    allFaces.some((face) => intersectSegmentAabb(tailBase, tip, face.faceBounds) !== null);

  // 1순위: 기존 화자 방향 레이 위에서 얼굴 외곽 안전 여백 지점으로 후퇴
  const paddedHit = intersectSegmentAabb(tailBase, originalTailTip, paddedFace);
  if (paddedHit && paddedHit.tEnter > 0.05) {
    const safeT = Math.max(0.05, paddedHit.tEnter - 0.015);
    const pulledBack = clampPointToCanvas(
      {
        x: tailBase.x + (originalTailTip.x - tailBase.x) * safeT,
        y: tailBase.y + (originalTailTip.y - tailBase.y) * safeT,
      },
      canvasWidth,
      canvasHeight,
    );
    if (
      distanceBetween(tailBase, pulledBack) >= MIN_RECOMMENDED_TAIL_LENGTH_PX &&
      !hitsAnyFace(pulledBack) &&
      !hitsAnyEyes(pulledBack)
    ) {
      return pulledBack;
    }
  }

  // 2순위: 턱선·볼 바깥·이마 외곽 12개 안전 지점 탐색(눈 높이 아래 턱선 우선)
  const fb = targetFace.faceBounds;
  const eyeBottom = targetFace.resolvedEyeBounds.y + targetFace.resolvedEyeBounds.height;
  const fcx = fb.x + fb.width / 2;
  const leftX = fb.x - safeMargin;
  const rightX = fb.x + fb.width + safeMargin;
  const topY = fb.y - safeMargin;
  const bottomY = fb.y + fb.height + safeMargin;
  const jawY = fb.y + fb.height * 0.78;
  const midY = fb.y + fb.height * 0.5;
  const upperY = fb.y + fb.height * 0.2;

  const rawCandidates: readonly EyeFlowPoint[] = [
    { x: fcx, y: bottomY },
    { x: leftX, y: bottomY },
    { x: rightX, y: bottomY },
    { x: leftX, y: jawY },
    { x: rightX, y: jawY },
    { x: leftX, y: midY },
    { x: rightX, y: midY },
    { x: leftX, y: upperY },
    { x: rightX, y: upperY },
    { x: leftX, y: topY },
    { x: rightX, y: topY },
    { x: fcx, y: topY },
  ];

  const candidates = rawCandidates.map((pt) => clampPointToCanvas(pt, canvasWidth, canvasHeight));
  const candidateCost = (pt: EyeFlowPoint): number => {
    const distToOriginal = distanceBetween(pt, originalTailTip);
    const aboveEyePenalty = pt.y < eyeBottom ? 18 : 0;
    return distToOriginal + aboveEyePenalty;
  };

  const fullyClear = candidates
    .filter(
      (pt) =>
        distanceBetween(tailBase, pt) >= MIN_RECOMMENDED_TAIL_LENGTH_PX &&
        !hitsAnyFace(pt) &&
        !hitsAnyEyes(pt),
    )
    .sort((a, b) => candidateCost(a) - candidateCost(b));

  if (fullyClear.length > 0) {
    return fullyClear[0]!;
  }

  const eyeClear = candidates
    .filter((pt) => distanceBetween(tailBase, pt) >= 6 && !hitsAnyEyes(pt))
    .sort((a, b) => candidateCost(a) - candidateCost(b));

  if (eyeClear.length > 0) {
    return eyeClear[0]!;
  }

  const fCenter = rectCenter(fb);
  const awayX = tailBase.x - fCenter.x;
  const awayY = tailBase.y - fCenter.y;
  const awayLen = Math.hypot(awayX, awayY);
  const ux = awayLen > 1e-4 ? awayX / awayLen : 0;
  const uy = awayLen > 1e-4 ? awayY / awayLen : 1;
  return clampPointToCanvas(
    {
      x: fCenter.x + ux * (fb.width / 2 + safeMargin + 8),
      y: fCenter.y + uy * (fb.height / 2 + safeMargin + 8),
    },
    canvasWidth,
    canvasHeight,
  );
}
