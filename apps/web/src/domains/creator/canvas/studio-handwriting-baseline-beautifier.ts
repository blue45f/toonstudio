/**
 * 손글씨·손그림 대사/효과음 베이스라인 추정 및 스타일 보존 미화 엔진.
 *
 * Goodnotes v7.1.28 (`com.goodnotesapp.x`, BaselineEstimation / HandwritingBeautificationCore /
 * HandwritingCommon / BeamSearchLibrary) 역공학 분석에서 도출된 자유형 잉크 베이스라인 추정,
 * 말풍선 아치형 가이드 곡선 피팅, 필체 보존 미화(떨림 완화·기울기 균일화·글자 높이 정규화)를
 * 순수 함수 및 코어 엔진으로 제공한다.
 */

export interface HandwritingSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly timestampMs?: number;
}

export type HandwritingStrokeRole = "dialogue" | "sfx" | "conti-note";

export interface HandwritingStroke {
  readonly id: string;
  readonly points: readonly HandwritingSamplePoint[];
  readonly strokeWidth?: number;
  readonly role?: HandwritingStrokeRole;
}

export interface HandwritingPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface HandwritingBaselineEstimate {
  readonly originX: number;
  readonly interceptY: number;
  readonly slope: number;
  readonly angleRad: number;
  readonly curvature: number;
  readonly xHeight: number;
  readonly wordSpacing: number;
  readonly confidence: number;
  readonly anchorPoints: readonly HandwritingPoint2D[];
}

export type HandwritingTargetCurve =
  | {
      readonly kind: "horizontal";
      readonly y?: number;
    }
  | {
      readonly kind: "linear";
      readonly originX: number;
      readonly originY: number;
      readonly angleRad: number;
    }
  | {
      readonly kind: "quadratic-arch";
      readonly originX: number;
      readonly originY: number;
      readonly angleRad?: number;
      readonly curvature: number;
    };

export interface HandwritingBeautificationOptions {
  /** 미화 적용 강도 (0..1, 기본값 0.7). */
  readonly strength?: number;
  /** 폴리라인 미세 떨림 제거 반복 횟수 (0..4, 기본값 2). */
  readonly smoothingIterations?: number;
  /** 목표 획 기울기(라디안). 지정하지 않으면 스트로크 군집의 중앙 기울기로 수렴한다. */
  readonly targetSlantRad?: number | null;
  /** 글자 높이(x-height) 편차 보정 여부 (기본값 true). */
  readonly normalizeXHeight?: boolean;
  /** 획 두께 및 필압 곡선 정규화 여부 (기본값 true). */
  readonly normalizeStrokeWidth?: boolean;
  /** 베이스라인 정렬을 함께 적용할지 여부 (기본값 false). */
  readonly alignToBaseline?: boolean;
  /** 베이스라인 정렬 시 사용할 목표 가이드 곡선. */
  readonly targetCurve?: HandwritingTargetCurve;
}

export interface HandwritingBeautificationMetrics {
  readonly tremorReductionRatio: number;
  readonly xHeightVarianceBefore: number;
  readonly xHeightVarianceAfter: number;
  readonly slantSpreadBeforeRad: number;
  readonly slantSpreadAfterRad: number;
}

export interface HandwritingBeautificationResult {
  readonly strokes: readonly HandwritingStroke[];
  readonly baseline: HandwritingBaselineEstimate;
  readonly metrics: HandwritingBeautificationMetrics;
}

interface GlyphCluster {
  readonly strokeIndices: readonly number[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly centerX: number;
  readonly bottomAnchor: HandwritingPoint2D;
}

const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) * 0.5;
}

function variance(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const sq = values.reduce((acc, v) => {
    const d = v - mean;
    return acc + d * d;
  }, 0);
  return sq / values.length;
}

/**
 * 인접하거나 가로 범위가 겹치는 스트로크들을 글자(음절) 클러스터 단위로 묶는다.
 */
function clusterStrokesIntoGlyphs(
  strokes: readonly HandwritingStroke[],
): readonly GlyphCluster[] {
  const boxes = strokes
    .map((stroke, index) => {
      if (stroke.points.length === 0) return null;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let bottomX = stroke.points[0]!.x;
      for (const pt of stroke.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) {
          maxY = pt.y;
          bottomX = pt.x;
        }
      }
      return {
        index,
        minX,
        maxX,
        minY,
        maxY,
        bottomX,
        width: Math.max(1, maxX - minX),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.minX - b.minX);

  if (boxes.length === 0) return [];

  const medianWidth = median(boxes.map((b) => b.width));
  const mergeGapThreshold = Math.max(2, medianWidth * 0.18);

  const clusters: {
    strokeIndices: number[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    bottomX: number;
  }[] = [];

  for (const box of boxes) {
    const prev = clusters[clusters.length - 1];
    if (!prev || box.minX > prev.maxX + mergeGapThreshold) {
      clusters.push({
        strokeIndices: [box.index],
        minX: box.minX,
        maxX: box.maxX,
        minY: box.minY,
        maxY: box.maxY,
        bottomX: box.bottomX,
      });
    } else {
      prev.strokeIndices.push(box.index);
      prev.minX = Math.min(prev.minX, box.minX);
      prev.maxX = Math.max(prev.maxX, box.maxX);
      prev.minY = Math.min(prev.minY, box.minY);
      if (box.maxY >= prev.maxY) {
        prev.maxY = box.maxY;
        prev.bottomX = box.bottomX;
      }
    }
  }

  return clusters.map((c) => ({
    strokeIndices: c.strokeIndices,
    minX: c.minX,
    maxX: c.maxX,
    minY: c.minY,
    maxY: c.maxY,
    centerX: (c.minX + c.maxX) * 0.5,
    bottomAnchor: { x: c.bottomX, y: c.maxY },
  }));
}

/**
 * 스트로크 내부의 하단 극점(local Y-maxima) 및 글자 클러스터 하단 앵커를 추출한다.
 */
function extractBaselineAnchors(
  strokes: readonly HandwritingStroke[],
  clusters: readonly GlyphCluster[],
): readonly HandwritingPoint2D[] {
  const anchors: HandwritingPoint2D[] = clusters.map((c) => c.bottomAnchor);

  for (const cluster of clusters) {
    const height = Math.max(1, cluster.maxY - cluster.minY);
    const lowerBandY = cluster.minY + height * 0.55;
    for (const sIdx of cluster.strokeIndices) {
      const pts = strokes[sIdx]!.points;
      for (let i = 1; i + 1 < pts.length; i += 1) {
        const prev = pts[i - 1]!;
        const curr = pts[i]!;
        const next = pts[i + 1]!;
        if (curr.y >= prev.y && curr.y >= next.y && curr.y >= lowerBandY) {
          anchors.push({ x: curr.x, y: curr.y });
        }
      }
    }
  }

  return anchors.sort((a, b) => a.x - b.x);
}

/**
 * 3x3 대칭 정규방정식을 가우스 소거법으로 풀어 2차 다항식 y(u) = c0 + c1*u + c2*u^2 계수를 구한다.
 */
function fitQuadraticBaseline(
  anchors: readonly HandwritingPoint2D[],
  originX: number,
): { readonly c0: number; readonly c1: number; readonly c2: number } {
  if (anchors.length === 0) {
    return { c0: 0, c1: 0, c2: 0 };
  }
  if (anchors.length === 1) {
    return { c0: anchors[0]!.y, c1: 0, c2: 0 };
  }

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let ty0 = 0;
  let ty1 = 0;
  let ty2 = 0;

  for (const pt of anchors) {
    const u = pt.x - originX;
    const u2 = u * u;
    s0 += 1;
    s1 += u;
    s2 += u2;
    s3 += u2 * u;
    s4 += u2 * u2;
    ty0 += pt.y;
    ty1 += u * pt.y;
    ty2 += u2 * pt.y;
  }

  const denomLinear = s0 * s2 - s1 * s1;
  if (Math.abs(denomLinear) <= EPSILON) {
    return { c0: ty0 / s0, c1: 0, c2: 0 };
  }
  const linearC0 = (ty0 * s2 - ty1 * s1) / denomLinear;
  const linearC1 = (s0 * ty1 - s1 * ty0) / denomLinear;

  if (anchors.length < 4) {
    return { c0: linearC0, c1: linearC1, c2: 0 };
  }

  const matrix = [
    [s0, s1, s2, ty0],
    [s1, s2, s3, ty1],
    [s2, s3, s4, ty2],
  ];

  for (let col = 0; col < 3; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(matrix[col]![col]!);
    for (let row = col + 1; row < 3; row += 1) {
      const candidate = Math.abs(matrix[row]![col]!);
      if (candidate > maxAbs) {
        maxAbs = candidate;
        pivotRow = row;
      }
    }
    if (maxAbs <= EPSILON) {
      return { c0: linearC0, c1: linearC1, c2: 0 };
    }
    if (pivotRow !== col) {
      const tmp = matrix[col]!;
      matrix[col] = matrix[pivotRow]!;
      matrix[pivotRow] = tmp;
    }
    const pivot = matrix[col]![col]!;
    for (let j = col; j < 4; j += 1) {
      matrix[col]![j]! /= pivot;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = matrix[row]![col]!;
      for (let j = col; j < 4; j += 1) {
        matrix[row]![j]! -= factor * matrix[col]![j]!;
      }
    }
  }

  return {
    c0: matrix[0]![3]!,
    c1: matrix[1]![3]!,
    c2: matrix[2]![3]!,
  };
}

/**
 * 추정된 베이스라인 방정식에서 주어진 x 좌표의 베이스라인 y 값과 접선 기울기(라디안)를 계산한다.
 */
export function evaluateBaselineAtX(
  estimate: HandwritingBaselineEstimate,
  x: number,
): { readonly y: number; readonly tangentAngleRad: number } {
  const u = x - estimate.originX;
  const y = estimate.interceptY + estimate.slope * u + estimate.curvature * u * u;
  const dyDx = estimate.slope + 2 * estimate.curvature * u;
  return {
    y,
    tangentAngleRad: Math.atan(dyDx),
  };
}

/**
 * 자유형 손글씨·대사·효과음 스트로크 집합으로부터 베이스라인(기울기·곡률·글자 높이·자간)을 추정한다.
 */
export function estimateHandwritingBaseline(
  strokes: readonly HandwritingStroke[],
): HandwritingBaselineEstimate {
  const clusters = clusterStrokesIntoGlyphs(strokes);
  if (clusters.length === 0) {
    return {
      originX: 0,
      interceptY: 0,
      slope: 0,
      angleRad: 0,
      curvature: 0,
      xHeight: 0,
      wordSpacing: 0,
      confidence: 0,
      anchorPoints: [],
    };
  }

  const anchors = extractBaselineAnchors(strokes, clusters);
  const originX =
    anchors.reduce((acc, pt) => acc + pt.x, 0) / Math.max(1, anchors.length);

  // 선형 기울기(전체 회전각)와 2차 아치 곡률을 분리 추정
  let sumU = 0;
  let sumY = 0;
  for (const pt of anchors) {
    sumU += pt.x - originX;
    sumY += pt.y;
  }
  const meanU = sumU / anchors.length;
  const meanY = sumY / anchors.length;
  let num = 0;
  let den = 0;
  for (const pt of anchors) {
    const du = pt.x - originX - meanU;
    const dy = pt.y - meanY;
    num += du * dy;
    den += du * du;
  }
  const linearSlope = Math.abs(den) > EPSILON ? num / den : 0;
  const angleRad = Math.atan(linearSlope);

  const quad = fitQuadraticBaseline(anchors, originX);
  const interceptY = quad.c0;
  const curvature = quad.c2;
  const effectiveSlope = anchors.length >= 4 ? quad.c1 : linearSlope;

  // 각 글자 클러스터의 기울기 보정 후 높이로 xHeight 추정
  const cosA = Math.cos(-angleRad);
  const sinA = Math.sin(-angleRad);
  const clusterHeights: number[] = [];
  for (const cluster of clusters) {
    let minRotY = Infinity;
    let maxRotY = -Infinity;
    for (const sIdx of cluster.strokeIndices) {
      for (const pt of strokes[sIdx]!.points) {
        const dx = pt.x - cluster.centerX;
        const dy = pt.y - cluster.bottomAnchor.y;
        const ry = dx * sinA + dy * cosA;
        if (ry < minRotY) minRotY = ry;
        if (ry > maxRotY) maxRotY = ry;
      }
    }
    const h = maxRotY - minRotY;
    if (Number.isFinite(h) && h > 0) {
      clusterHeights.push(h);
    }
  }
  const xHeight = Math.max(1, median(clusterHeights));

  const gaps: number[] = [];
  for (let i = 1; i < clusters.length; i += 1) {
    const gap = clusters[i]!.minX - clusters[i - 1]!.maxX;
    if (gap > 0) gaps.push(gap);
  }
  const wordSpacing = gaps.length > 0 ? median(gaps) : xHeight * 0.35;

  // 잔차 기반 신뢰도 계산
  let residualSqSum = 0;
  for (const pt of anchors) {
    const u = pt.x - originX;
    const predicted = interceptY + effectiveSlope * u + curvature * u * u;
    const err = pt.y - predicted;
    residualSqSum += err * err;
  }
  const rmse = Math.sqrt(residualSqSum / anchors.length);
  const normalizedError = rmse / Math.max(4, xHeight);
  const countFactor = clamp(clusters.length / 4, 0.25, 1);
  const confidence = clamp((1 - normalizedError * 0.6) * countFactor, 0.1, 1);

  return {
    originX,
    interceptY,
    slope: effectiveSlope,
    angleRad: Math.atan(effectiveSlope),
    curvature,
    xHeight,
    wordSpacing,
    confidence,
    anchorPoints: anchors,
  };
}

function evaluateTargetCurveAtX(
  curve: HandwritingTargetCurve,
  fallbackOriginX: number,
  fallbackOriginY: number,
  x: number,
): { readonly y: number; readonly tangentAngleRad: number } {
  if (curve.kind === "horizontal") {
    return {
      y: curve.y ?? fallbackOriginY,
      tangentAngleRad: 0,
    };
  }
  if (curve.kind === "linear") {
    const slope = Math.tan(curve.angleRad);
    const u = x - curve.originX;
    return {
      y: curve.originY + slope * u,
      tangentAngleRad: curve.angleRad,
    };
  }
  const baseSlope = Math.tan(curve.angleRad ?? 0);
  const u = x - curve.originX;
  const y = curve.originY + baseSlope * u + curve.curvature * u * u;
  const dyDx = baseSlope + 2 * curve.curvature * u;
  return {
    y,
    tangentAngleRad: Math.atan(dyDx),
  };
}

/**
 * 삐뚤어진 손글씨·효과음 스트로크를 수평 베이스라인 또는 말풍선 내부 아치형 가이드 곡선에 맞춰
 * 글자별 로컬 형태를 보존하면서 비파괴 정렬한다.
 */
export function alignStrokesToBaseline(
  strokes: readonly HandwritingStroke[],
  targetCurve?: HandwritingTargetCurve,
  existingEstimate?: HandwritingBaselineEstimate,
): readonly HandwritingStroke[] {
  if (strokes.length === 0) return [];
  const estimate = existingEstimate ?? estimateHandwritingBaseline(strokes);
  const resolvedCurve: HandwritingTargetCurve = targetCurve ?? {
    kind: "horizontal",
    y: estimate.interceptY,
  };

  const clusters = clusterStrokesIntoGlyphs(strokes);
  const aligned: HandwritingStroke[] = strokes.map((s) => ({ ...s }));

  for (const cluster of clusters) {
    const anchorX = cluster.bottomAnchor.x;
    const srcEval = evaluateBaselineAtX(estimate, anchorX);
    const dstEval = evaluateTargetCurveAtX(
      resolvedCurve,
      estimate.originX,
      estimate.interceptY,
      anchorX,
    );
    const deltaAngle = dstEval.tangentAngleRad - srcEval.tangentAngleRad;
    const cosD = Math.cos(deltaAngle);
    const sinD = Math.sin(deltaAngle);

    for (const sIdx of cluster.strokeIndices) {
      const stroke = strokes[sIdx]!;
      const transformedPoints = stroke.points.map((pt) => {
        const localX = pt.x - anchorX;
        const localY = pt.y - srcEval.y;
        const rotX = localX * cosD - localY * sinD;
        const rotY = localX * sinD + localY * cosD;
        return {
          ...pt,
          x: anchorX + rotX,
          y: dstEval.y + rotY,
        };
      });
      aligned[sIdx] = {
        ...stroke,
        points: transformedPoints,
      };
    }
  }

  return aligned;
}

/**
 * 폴리라인의 총 2차 미분 에너지(떨림 지표)를 계산한다.
 */
export function measureStrokeTremorEnergy(
  strokes: readonly HandwritingStroke[],
): number {
  let energy = 0;
  let count = 0;
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 1; i + 1 < pts.length; i += 1) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;
      const next = pts[i + 1]!;
      const ax = prev.x - 2 * curr.x + next.x;
      const ay = prev.y - 2 * curr.y + next.y;
      energy += Math.hypot(ax, ay);
      count += 1;
    }
  }
  return count > 0 ? energy / count : 0;
}

/**
 * 글자 클러스터의 대표 획 기울기(slant, 수직선 대비 기울어진 라디안)를 추정한다.
 */
function estimateClusterSlantRad(
  strokes: readonly HandwritingStroke[],
  cluster: GlyphCluster,
): number {
  let weightedDx = 0;
  let weightedDy = 0;
  for (const sIdx of cluster.strokeIndices) {
    const pts = strokes[sIdx]!.points;
    for (let i = 1; i < pts.length; i += 1) {
      const dx = pts[i]!.x - pts[i - 1]!.x;
      const dy = pts[i]!.y - pts[i - 1]!.y;
      if (Math.abs(dy) < 0.5) continue;
      // 아래쪽 방향 기준으로 정규화하여 수직 획의 기울기 성분 추출
      const sign = dy >= 0 ? 1 : -1;
      const weight = Math.abs(dy);
      weightedDx += sign * dx * weight;
      weightedDy += Math.abs(dy) * weight;
    }
  }
  if (weightedDy <= EPSILON) return 0;
  return clamp(Math.atan2(weightedDx, weightedDy), -Math.PI / 3, Math.PI / 3);
}

/**
 * 양 끝점과 필압 억양을 보존하면서 라플라시안 스무딩을 수행한다.
 */
function smoothStrokePoints(
  points: readonly HandwritingSamplePoint[],
  strength: number,
  iterations: number,
): readonly HandwritingSamplePoint[] {
  if (points.length <= 2 || strength <= 0 || iterations <= 0) {
    return points;
  }
  let current = points.map((pt) => ({ ...pt }));
  const alpha = clamp(strength * 0.48, 0, 0.48);

  for (let iter = 0; iter < iterations; iter += 1) {
    const next = current.map((pt) => ({ ...pt }));
    for (let i = 1; i + 1 < current.length; i += 1) {
      const prev = current[i - 1]!;
      const curr = current[i]!;
      const succ = current[i + 1]!;
      const midX = (prev.x + succ.x) * 0.5;
      const midY = (prev.y + succ.y) * 0.5;
      const smoothedPressure =
        curr.pressure !== undefined
          ? curr.pressure * (1 - alpha * 0.5) +
            ((prev.pressure ?? curr.pressure) + (succ.pressure ?? curr.pressure)) *
              0.25 *
              (alpha * 0.5)
          : undefined;
      next[i] = {
        ...curr,
        x: curr.x + (midX - curr.x) * alpha,
        y: curr.y + (midY - curr.y) * alpha,
        ...(smoothedPressure !== undefined ? { pressure: smoothedPressure } : {}),
      };
    }
    current = next;
  }

  return current;
}

/**
 * 작가 고유의 필체를 유지하면서 미세 떨림 제거, 기울기 균일화, 글자 크기(x-height) 편차 보정,
 * 획 두께 정규화를 수행한다.
 */
export function beautifyHandwritingStrokes(
  strokes: readonly HandwritingStroke[],
  options: HandwritingBeautificationOptions = {},
): HandwritingBeautificationResult {
  const strength = clamp(options.strength ?? 0.7, 0, 1);
  const smoothingIterations = clamp(
    Math.round(options.smoothingIterations ?? 2),
    0,
    4,
  );
  const normalizeXHeight = options.normalizeXHeight ?? true;
  const normalizeStrokeWidth = options.normalizeStrokeWidth ?? true;

  const initialBaseline = estimateHandwritingBaseline(strokes);
  const workingInput =
    options.alignToBaseline || options.targetCurve
      ? alignStrokesToBaseline(strokes, options.targetCurve, initialBaseline)
      : strokes;

  const baseline = estimateHandwritingBaseline(workingInput);
  const clusters = clusterStrokesIntoGlyphs(workingInput);

  const tremorBefore = measureStrokeTremorEnergy(workingInput);
  const heightsBefore = clusters.map((c) => Math.max(1, c.maxY - c.minY));
  const slantsBefore = clusters.map((c) =>
    estimateClusterSlantRad(workingInput, c),
  );
  const xHeightVarianceBefore = variance(heightsBefore);
  const slantSpreadBeforeRad = Math.sqrt(variance(slantsBefore));

  const targetSlant =
    options.targetSlantRad !== undefined && options.targetSlantRad !== null
      ? options.targetSlantRad
      : median(slantsBefore);
  const targetHeight = baseline.xHeight > 0 ? baseline.xHeight : median(heightsBefore);

  const strokeWidths = workingInput
    .map((s) => s.strokeWidth)
    .filter((w): w is number => typeof w === "number" && w > 0);
  const medianStrokeWidth =
    strokeWidths.length > 0 ? median(strokeWidths) : undefined;

  const beautified: HandwritingStroke[] = workingInput.map((s) => ({ ...s }));

  for (let cIdx = 0; cIdx < clusters.length; cIdx += 1) {
    const cluster = clusters[cIdx]!;
    const currentHeight = Math.max(1, cluster.maxY - cluster.minY);
    const currentSlant = slantsBefore[cIdx]!;

    const rawScaleY =
      normalizeXHeight && targetHeight > 0 ? targetHeight / currentHeight : 1;
    const blendedScaleY = 1 + (clamp(rawScaleY, 0.5, 2.0) - 1) * strength;

    const deltaSlant = (targetSlant - currentSlant) * strength;
    const shearX = Math.tan(deltaSlant);
    const anchorY = cluster.bottomAnchor.y;

    for (const sIdx of cluster.strokeIndices) {
      const stroke = workingInput[sIdx]!;
      const smoothed = smoothStrokePoints(
        stroke.points,
        strength,
        smoothingIterations,
      );
      const transformed = smoothed.map((pt) => {
        const relY = pt.y - anchorY;
        const scaledRelY = relY * blendedScaleY;
        // anchorY 위쪽(음수 relY)일수록 기울기 보정 변위 적용
        const shearedX = pt.x + scaledRelY * shearX;
        return {
          ...pt,
          x: shearedX,
          y: anchorY + scaledRelY,
        };
      });

      const nextWidth =
        normalizeStrokeWidth &&
        stroke.strokeWidth !== undefined &&
        medianStrokeWidth !== undefined
          ? stroke.strokeWidth +
            (medianStrokeWidth - stroke.strokeWidth) * strength
          : stroke.strokeWidth;

      beautified[sIdx] = {
        ...stroke,
        points: transformed,
        ...(nextWidth !== undefined ? { strokeWidth: nextWidth } : {}),
      };
    }
  }

  const tremorAfter = measureStrokeTremorEnergy(beautified);
  const clustersAfter = clusterStrokesIntoGlyphs(beautified);
  const heightsAfter = clustersAfter.map((c) => Math.max(1, c.maxY - c.minY));
  const slantsAfter = clustersAfter.map((c) =>
    estimateClusterSlantRad(beautified, c),
  );

  const tremorReductionRatio =
    tremorBefore > EPSILON
      ? clamp((tremorBefore - tremorAfter) / tremorBefore, 0, 1)
      : 0;

  return {
    strokes: beautified,
    baseline: estimateHandwritingBaseline(beautified),
    metrics: {
      tremorReductionRatio,
      xHeightVarianceBefore,
      xHeightVarianceAfter: variance(heightsAfter),
      slantSpreadBeforeRad,
      slantSpreadAfterRad: Math.sqrt(variance(slantsAfter)),
    },
  };
}

/**
 * Goodnotes `HandwritingBeautificationCore` 역공학 구조를 반영한 상태 비종속 코어 파사드.
 */
export class HandwritingBeautificationCore {
  private readonly defaultOptions: HandwritingBeautificationOptions;

  public constructor(defaultOptions: HandwritingBeautificationOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  public estimateBaseline(
    strokes: readonly HandwritingStroke[],
  ): HandwritingBaselineEstimate {
    return estimateHandwritingBaseline(strokes);
  }

  public alignToBaseline(
    strokes: readonly HandwritingStroke[],
    targetCurve?: HandwritingTargetCurve,
  ): readonly HandwritingStroke[] {
    return alignStrokesToBaseline(strokes, targetCurve);
  }

  public beautify(
    strokes: readonly HandwritingStroke[],
    overrides: HandwritingBeautificationOptions = {},
  ): HandwritingBeautificationResult {
    return beautifyHandwritingStrokes(strokes, {
      ...this.defaultOptions,
      ...overrides,
    });
  }
}
