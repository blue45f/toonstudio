/**
 * N-축 방사/거울 대칭자(C_n / D_n) 및 컷 내 N등분·3분할·황금비 분할자 기하 엔진.
 */

import type {
  DivisionGuideLine,
  DivisionGuideSet,
  DivisionRulerConfig,
  LockedDivisionAxis,
  PointerSnapInput,
  SnapPoint2D,
  SymmetryAffineTransform,
  SymmetryMirroredPoint,
  SymmetryRulerConfig,
} from "./studio-ruler-snap-types";

export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_MINOR_RATIO = 1 / (1 + GOLDEN_RATIO);
export const GOLDEN_MAJOR_RATIO = 1 - GOLDEN_MINOR_RATIO;

const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isFinitePoint(pt: SnapPoint2D): boolean {
  return Number.isFinite(pt.x) && Number.isFinite(pt.y);
}

/** 컷 내 N등분·3분할·황금비 분할 가이드선 및 교차점을 계산한다. */
export function computeDivisionGuideLines(config: DivisionRulerConfig): DivisionGuideSet {
  const x0 = Math.min(config.frame.x, config.frame.x + config.frame.width);
  const y0 = Math.min(config.frame.y, config.frame.y + config.frame.height);
  const w = Math.abs(config.frame.width);
  const h = Math.abs(config.frame.height);
  const includeEdges = config.includeFrameEdges !== false;

  const ratiosFor = (count: number): number[] => {
    const ratios: number[] = [];
    if (includeEdges) ratios.push(0);
    if (config.mode === "rule-of-thirds") {
      ratios.push(1 / 3, 2 / 3);
    } else if (config.mode === "golden-ratio") {
      ratios.push(GOLDEN_MINOR_RATIO, GOLDEN_MAJOR_RATIO);
    } else {
      const n = Math.round(clamp(count, 1, 24));
      for (let i = 1; i < n; i += 1) ratios.push(i / n);
    }
    if (includeEdges) ratios.push(1);
    return ratios;
  };

  const verticals: DivisionGuideLine[] = ratiosFor(config.columns ?? 3).map((ratio, idx) => {
    const coord = x0 + w * ratio;
    return { id: `div-v-${idx}`, orientation: "vertical", ratio, coordinate: coord, x1: coord, y1: y0, x2: coord, y2: y0 + h };
  });

  const horizontals: DivisionGuideLine[] = ratiosFor(config.rows ?? 3).map((ratio, idx) => {
    const coord = y0 + h * ratio;
    return { id: `div-h-${idx}`, orientation: "horizontal", ratio, coordinate: coord, x1: x0, y1: coord, x2: x0 + w, y2: coord };
  });

  const intersections: SnapPoint2D[] = [];
  for (const v of verticals) {
    for (const hLine of horizontals) intersections.push({ x: v.coordinate, y: hLine.coordinate });
  }
  return { verticals, horizontals, intersections };
}

/** 점을 컷 내 분할 가이드선(또는 교차점)으로 스냅한다. */
export function snapPointToDivisionRuler(
  point: SnapPoint2D,
  config: DivisionRulerConfig,
  options: { readonly lockOrientation?: "vertical" | "horizontal" | null; readonly fallbackThresholdPx?: number } = {},
): {
  readonly snapped: boolean;
  readonly point: SnapPoint2D;
  readonly axis: LockedDivisionAxis | null;
  readonly distancePx: number;
} {
  if (!config.enabled || !isFinitePoint(point)) {
    return { snapped: false, point, axis: null, distancePx: Number.POSITIVE_INFINITY };
  }
  const threshold =
    config.snapThresholdPx !== undefined && Number.isFinite(config.snapThresholdPx)
      ? Math.max(0, config.snapThresholdPx)
      : (options.fallbackThresholdPx ?? Number.POSITIVE_INFINITY);
  const guides = computeDivisionGuideLines(config);

  let bestV: { readonly line: DivisionGuideLine; readonly dist: number } | null = null;
  for (const line of guides.verticals) {
    const dist = Math.abs(point.x - line.coordinate);
    if (!bestV || dist < bestV.dist) bestV = { line, dist };
  }
  let bestH: { readonly line: DivisionGuideLine; readonly dist: number } | null = null;
  for (const line of guides.horizontals) {
    const dist = Math.abs(point.y - line.coordinate);
    if (!bestH || dist < bestH.dist) bestH = { line, dist };
  }

  if (options.lockOrientation === "vertical" && bestV && bestV.dist <= threshold) {
    return {
      snapped: true,
      point: { x: bestV.line.coordinate, y: point.y },
      axis: { kind: "division", axisId: bestV.line.id, orientation: "vertical", coordinate: bestV.line.coordinate, frame: config.frame },
      distancePx: bestV.dist,
    };
  }
  if (options.lockOrientation === "horizontal" && bestH && bestH.dist <= threshold) {
    return {
      snapped: true,
      point: { x: point.x, y: bestH.line.coordinate },
      axis: { kind: "division", axisId: bestH.line.id, orientation: "horizontal", coordinate: bestH.line.coordinate, frame: config.frame },
      distancePx: bestH.dist,
    };
  }

  if (config.snapIntersections !== false && bestV && bestH && bestV.dist <= threshold && bestH.dist <= threshold) {
    const cornerDist = Math.hypot(bestV.dist, bestH.dist);
    if (cornerDist <= threshold) {
      const preferV = bestV.dist <= bestH.dist;
      return {
        snapped: true,
        point: { x: bestV.line.coordinate, y: bestH.line.coordinate },
        axis: {
          kind: "division",
          axisId: `${bestV.line.id}+${bestH.line.id}`,
          orientation: preferV ? "vertical" : "horizontal",
          coordinate: preferV ? bestV.line.coordinate : bestH.line.coordinate,
          frame: config.frame,
        },
        distancePx: cornerDist,
      };
    }
  }

  if (bestV && (!bestH || bestV.dist <= bestH.dist) && bestV.dist <= threshold) {
    return {
      snapped: true,
      point: { x: bestV.line.coordinate, y: point.y },
      axis: { kind: "division", axisId: bestV.line.id, orientation: "vertical", coordinate: bestV.line.coordinate, frame: config.frame },
      distancePx: bestV.dist,
    };
  }
  if (bestH && bestH.dist <= threshold) {
    return {
      snapped: true,
      point: { x: point.x, y: bestH.line.coordinate },
      axis: { kind: "division", axisId: bestH.line.id, orientation: "horizontal", coordinate: bestH.line.coordinate, frame: config.frame },
      distancePx: bestH.dist,
    };
  }
  return { snapped: false, point, axis: null, distancePx: Number.POSITIVE_INFINITY };
}

function makeRotationTransform(branchIndex: number, cx: number, cy: number, angleRad: number): SymmetryAffineTransform {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    branchIndex,
    reflected: false,
    a: cos,
    b: -sin,
    c: sin,
    d: cos,
    tx: cx - (cos * cx - sin * cy),
    ty: cy - (sin * cx + cos * cy),
  };
}

function makeReflectionTransform(branchIndex: number, cx: number, cy: number, axisAngleRad: number): SymmetryAffineTransform {
  const cos2 = Math.cos(2 * axisAngleRad);
  const sin2 = Math.sin(2 * axisAngleRad);
  return {
    branchIndex,
    reflected: true,
    a: cos2,
    b: sin2,
    c: sin2,
    d: -cos2,
    tx: cx - (cos2 * cx + sin2 * cy),
    ty: cy - (sin2 * cx - cos2 * cy),
  };
}

/** 대칭자 설정에 해당하는 정확한 2D 아핀 변환 행렬군(C_n / D_n)을 생성한다. */
export function computeSymmetryTransforms(
  config: SymmetryRulerConfig | null | undefined,
): readonly SymmetryAffineTransform[] {
  const identity: SymmetryAffineTransform = { branchIndex: 0, reflected: false, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  if (!config || !config.enabled || config.mode === "off") return [identity];

  const cx = Number.isFinite(config.centerX) ? config.centerX : 0;
  const cy = Number.isFinite(config.centerY) ? config.centerY : 0;
  const baseRad = (config.axisAngleDeg ?? 90) * DEG_TO_RAD;

  if (config.mode === "mirror") return [identity, makeReflectionTransform(1, cx, cy, baseRad)];
  if (config.mode === "quad") {
    return [
      identity,
      makeReflectionTransform(1, cx, cy, baseRad),
      makeReflectionTransform(2, cx, cy, baseRad + Math.PI * 0.5),
      makeRotationTransform(3, cx, cy, Math.PI),
    ];
  }

  const n = Math.round(clamp(config.axesCount ?? 6, 2, 24));
  const list: SymmetryAffineTransform[] = [identity];
  for (let k = 1; k < n; k += 1) {
    list.push(makeRotationTransform(k, cx, cy, (2 * Math.PI * k) / n));
  }
  if (config.mode === "kaleidoscope") {
    for (let k = 0; k < n; k += 1) {
      list.push(makeReflectionTransform(n + k, cx, cy, baseRad + (Math.PI * k) / n));
    }
  }
  return list;
}

/** 대칭자 설정에서 거울 대칭축 각도 목록(라디안)을 반환한다. */
export function getSymmetryAxisAnglesRad(config: SymmetryRulerConfig): readonly number[] {
  const baseRad = (config.axisAngleDeg ?? 90) * DEG_TO_RAD;
  if (config.mode === "mirror") return [baseRad];
  if (config.mode === "quad") return [baseRad, baseRad + Math.PI * 0.5];
  const n = Math.round(clamp(config.axesCount ?? 6, 2, 24));
  const angles: number[] = [];
  for (let k = 0; k < n; k += 1) angles.push(baseRad + (Math.PI * k) / n);
  return angles;
}

/** 대칭축 이음새 스냅: 점이 대칭축 임계거리 이내면 가장 가까운 대칭축 위로 투영한다. */
export function snapPointToNearestSymmetryAxis(
  point: SnapPoint2D,
  config: SymmetryRulerConfig | null | undefined,
): { readonly snapped: boolean; readonly point: SnapPoint2D; readonly distancePx: number } {
  const threshold = config?.snapToAxisThresholdPx ?? 0;
  if (!config || !config.enabled || config.mode === "off" || threshold <= 0) {
    return { snapped: false, point, distancePx: Number.POSITIVE_INFINITY };
  }
  let bestPoint = point;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const angle of getSymmetryAxisAnglesRad(config)) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const proj = (point.x - config.centerX) * ux + (point.y - config.centerY) * uy;
    const px = config.centerX + proj * ux;
    const py = config.centerY + proj * uy;
    const dist = Math.hypot(px - point.x, py - point.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = { x: px, y: py };
    }
  }
  return bestDist <= threshold
    ? { snapped: true, point: bestPoint, distancePx: bestDist }
    : { snapped: false, point, distancePx: bestDist };
}

/** 단일 입력 포인터 샘플에 대해 N-축 방사/거울 대칭 미러 포인트 배열을 0ms 즉시 생성한다. */
export function generateSymmetryMirrorPoints(
  input: PointerSnapInput,
  config: SymmetryRulerConfig | null | undefined,
  precomputedTransforms?: readonly SymmetryAffineTransform[],
): readonly SymmetryMirroredPoint[] {
  const transforms = precomputedTransforms ?? computeSymmetryTransforms(config);
  const pressure = clamp(input.pressure ?? 1, 0, 1);
  const dx = input.dx ?? 0;
  const dy = input.dy ?? 0;
  const hasTilt = input.tiltX !== undefined || input.tiltY !== undefined;
  const txIn = input.tiltX ?? 0;
  const tyIn = input.tiltY ?? 0;

  return transforms.map((tr) => ({
    branchIndex: tr.branchIndex,
    reflected: tr.reflected,
    x: tr.a * input.x + tr.b * input.y + tr.tx,
    y: tr.c * input.x + tr.d * input.y + tr.ty,
    pressure,
    dx: tr.a * dx + tr.b * dy,
    dy: tr.c * dx + tr.d * dy,
    ...(hasTilt ? { tiltX: tr.a * txIn + tr.b * tyIn, tiltY: tr.c * txIn + tr.d * tyIn } : {}),
  }));
}

/** 전체 스트로크를 실시간 대칭 미러 스트로크 배열(브랜치별 포인트 배열)로 변환한다. */
export function generateSymmetryMirrorStrokes(
  stroke: readonly PointerSnapInput[],
  config: SymmetryRulerConfig | null | undefined,
): readonly (readonly SymmetryMirroredPoint[])[] {
  const transforms = computeSymmetryTransforms(config);
  const branches: SymmetryMirroredPoint[][] = transforms.map(() => []);
  for (let i = 0; i < stroke.length; i += 1) {
    const curr = stroke[i]!;
    const prev = stroke[Math.max(0, i - 1)]!;
    const mirrored = generateSymmetryMirrorPoints(
      { ...curr, dx: curr.dx ?? curr.x - prev.x, dy: curr.dy ?? curr.y - prev.y },
      config,
      transforms,
    );
    for (let b = 0; b < mirrored.length; b += 1) branches[b]!.push(mirrored[b]!);
  }
  return branches;
}
