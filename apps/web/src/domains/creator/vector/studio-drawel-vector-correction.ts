/**
 * Studio DrawEl Vector Correction — CSP `선 수정(Correct line)` 계열 순수 벡터 수술 코어.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 * - 대응 도구 변형(var 175~489): 벡터선 집기(`pinchDrawElStroke`), 벡터선 연결(`connectDrawElStrokes`),
 *   벡터선 다시 그리기(`redrawVectorStrokeSegment`), 벡터선 폭 다시 그리기(`redrawVectorStrokeWidth`),
 *   선폭 수정(`adjustVectorStrokeWidth`), 선 분할(`splitVectorStrokeAtParameter`),
 *   모서리 전환(`toggleVectorCornerSmooth`).
 */

import type { DrawEl } from "../studio-element-model";

/** `NODE_EDIT_DEFAULT_PRESSURE`(0.5)와 동일한 중립 필압 상수(순환 참조 방지). */
const NEUTRAL_PRESSURE = 0.5;

export type VectorPinchFixEnds = "none" | "both" | "start" | "end";

export interface PinchDrawElStrokeOptions {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  /** 집기 범위 단계(1..10). 값이 클수록 넓은 호길이 구간이 함께 끌려온다. 기본 5. */
  readonly pinchLevel?: number;
  /** 직접 반경을 지정하면 pinchLevel 대신 이 반경(px)을 사용한다. */
  readonly radiusPx?: number;
  /** 양 끝 고정 모드(CSP 끝점 고정 옵션). 기본 "both". */
  readonly fixEnds?: VectorPinchFixEnds;
}

export interface ConnectDrawElStrokesOptions {
  /** 연결 가능한 최대 끝점 간격(px). 기본 24. */
  readonly maxGapPx?: number;
  /** 이음매 주변 라플라시안 스무딩 반경(샘플 수). 기본 2. */
  readonly smoothSeamSamples?: number;
}

export interface VectorStrokeSampleSpan {
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
}

export interface RedrawVectorStrokeSegmentOptions {
  /** 대상 선에서 허용할 최대 투영 거리(px). 기본 48. */
  readonly maxSnapDistPx?: number;
  /** 접합부 스무딩 패스 횟수. 기본 2. */
  readonly seamSmoothPasses?: number;
}

export interface RedrawVectorStrokeWidthOptions {
  /** 대상 선에서 허용할 최대 투영 거리(px). 기본 48. */
  readonly maxSnapDistPx?: number;
  /** 시작/끝 경계의 필압 블렌딩 폭(px). 기본 12. */
  readonly featherPx?: number;
}

export type VectorWidthAdjustMode = "add" | "subtract" | "multiply" | "constant";

export interface AdjustVectorStrokeWidthOptions {
  readonly mode: VectorWidthAdjustMode;
  readonly amount: number;
  /** 켜면 선폭이 1px 미만으로 붕괴하지 않도록 하한을 고정한다(CSP `1픽셀 이상 남기기`). */
  readonly atLeastOnePixel?: boolean;
  /** 국소 브러시 영역 중심(미지정 시 스트로크 전체 적용). */
  readonly regionCenter?: { readonly x: number; readonly y: number };
  /** 국소 브러시 반경(px). regionCenter 지정 시 기본 32. */
  readonly regionRadiusPx?: number;
}

export interface ToggleVectorCornerSmoothOptions {
  readonly mode?: "auto" | "smooth" | "cusp";
  /** 스무딩/각지기 강도(0..1). 기본 0.65. */
  readonly strength?: number;
}

interface ProjectedArcPoint {
  readonly segIndex: number;
  readonly segT: number;
  readonly arcLen: number;
  readonly x: number;
  readonly y: number;
  readonly dist: number;
}

const MIN_STROKE_WIDTH_PX = 0.1;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function hermiteFalloff(u: number): number {
  const t = clamp(u, 0, 1);
  return 1 - (3 * t * t - 2 * t * t * t);
}

function pointCountOf(points: readonly number[]): number {
  return Math.floor(points.length / 2);
}

function normalizePressures(pressures: readonly number[] | undefined, count: number): number[] {
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const raw = pressures?.[i];
    out[i] = typeof raw === "number" && Number.isFinite(raw)
      ? clamp(raw, 0, 1)
      : NEUTRAL_PRESSURE;
  }
  return out;
}

function cumulativeArcLengths(points: readonly number[]): number[] {
  const n = pointCountOf(points);
  if (n === 0) return [];
  const cum = new Array<number>(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    const dx = points[i * 2]! - points[(i - 1) * 2]!;
    const dy = points[i * 2 + 1]! - points[(i - 1) * 2 + 1]!;
    cum[i] = cum[i - 1]! + Math.hypot(dx, dy);
  }
  return cum;
}

function projectPointOntoPolyline(
  points: readonly number[],
  cum: readonly number[],
  target: { readonly x: number; readonly y: number },
): ProjectedArcPoint | null {
  const n = pointCountOf(points);
  if (n === 0) return null;
  if (n === 1) {
    const x = points[0]!;
    const y = points[1]!;
    return { segIndex: 0, segT: 0, arcLen: 0, x, y, dist: Math.hypot(target.x - x, target.y - y) };
  }
  let best: ProjectedArcPoint | null = null;
  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i * 2]!;
    const y0 = points[i * 2 + 1]!;
    const x1 = points[(i + 1) * 2]!;
    const y1 = points[(i + 1) * 2 + 1]!;
    const vx = x1 - x0;
    const vy = y1 - y0;
    const lenSq = vx * vx + vy * vy;
    const segT = lenSq > 1e-12
      ? clamp(((target.x - x0) * vx + (target.y - y0) * vy) / lenSq, 0, 1)
      : 0;
    const px = x0 + vx * segT;
    const py = y0 + vy * segT;
    const dist = Math.hypot(target.x - px, target.y - py);
    const segLen = cum[i + 1]! - cum[i]!;
    const arcLen = cum[i]! + segLen * segT;
    if (!best || dist < best.dist) {
      best = { segIndex: i, segT, arcLen, x: px, y: py, dist };
    }
  }
  return best;
}

function reversePointsAndPressures(
  points: readonly number[],
  pressures: readonly number[],
): { points: number[]; pressures: number[] } {
  const n = pointCountOf(points);
  const revPts = new Array<number>(n * 2);
  const revPrs = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const src = n - 1 - i;
    revPts[i * 2] = points[src * 2]!;
    revPts[i * 2 + 1] = points[src * 2 + 1]!;
    revPrs[i] = pressures[src]!;
  }
  return { points: revPts, pressures: revPrs };
}

function smoothWindowInPlace(
  points: number[],
  centerIndex: number,
  radiusSamples: number,
  passes: number,
): void {
  const n = pointCountOf(points);
  if (n < 3 || radiusSamples < 0 || passes <= 0) return;
  const lo = Math.max(1, centerIndex - radiusSamples);
  const hi = Math.min(n - 2, centerIndex + radiusSamples);
  if (lo > hi) return;
  for (let pass = 0; pass < passes; pass++) {
    const snap = points.slice();
    for (let i = lo; i <= hi; i++) {
      points[i * 2] = 0.25 * snap[(i - 1) * 2]! + 0.5 * snap[i * 2]! + 0.25 * snap[(i + 1) * 2]!;
      points[i * 2 + 1] = 0.25 * snap[(i - 1) * 2 + 1]! + 0.5 * snap[i * 2 + 1]! + 0.25 * snap[(i + 1) * 2 + 1]!;
    }
  }
}

/** 각 정점의 실효 선폭(px)을 `strokeWidth * (pressure / 0.5)` 규약으로 계산한다. */
export function effectiveStrokePointWidthsPx(stroke: Pick<DrawEl, "points" | "strokeWidth" | "pressures">): number[] {
  const n = pointCountOf(stroke.points);
  const baseWidth = Math.max(MIN_STROKE_WIDTH_PX, Number.isFinite(stroke.strokeWidth) ? stroke.strokeWidth : 1);
  const pressures = normalizePressures(stroke.pressures, n);
  return pressures.map((p) => Math.max(MIN_STROKE_WIDTH_PX, baseWidth * (p / NEUTRAL_PRESSURE)));
}

/**
 * 벡터선 집기(`Pinch vector line`) — 호길이 거리 감쇠와 양 끝 고정 규칙으로 곡선을 탄성 변형한다.
 */
export function pinchDrawElStroke(stroke: DrawEl, options: PinchDrawElStrokeOptions): DrawEl {
  const n = pointCountOf(stroke.points);
  if (n === 0) return stroke;
  const dx = options.to.x - options.from.x;
  const dy = options.to.y - options.from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9)) {
    return stroke;
  }

  const cum = cumulativeArcLengths(stroke.points);
  const totalLen = cum[n - 1] ?? 0;
  const proj = projectPointOntoPolyline(stroke.points, cum, options.from);
  if (!proj) return stroke;

  const level = clamp(options.pinchLevel ?? 5, 1, 10);
  const radius = options.radiusPx !== undefined && Number.isFinite(options.radiusPx) && options.radiusPx > 0
    ? options.radiusPx
    : Math.max(16, (totalLen > 0 ? totalLen : 80) * (0.08 + level * 0.085));
  const fixEnds = options.fixEnds ?? "both";

  const nextPoints = stroke.points.slice();
  for (let i = 0; i < n; i++) {
    if ((fixEnds === "both" || fixEnds === "start") && i === 0 && n > 1) continue;
    if ((fixEnds === "both" || fixEnds === "end") && i === n - 1 && n > 1) continue;

    const arcDist = Math.abs(cum[i]! - proj.arcLen);
    if (arcDist >= radius) continue;
    let weight = hermiteFalloff(arcDist / radius);
    if (totalLen > 1e-6 && n > 2) {
      if (fixEnds === "both" || fixEnds === "start") {
        weight *= clamp(cum[i]! / Math.min(radius, totalLen * 0.5), 0, 1);
      }
      if (fixEnds === "both" || fixEnds === "end") {
        weight *= clamp((totalLen - cum[i]!) / Math.min(radius, totalLen * 0.5), 0, 1);
      }
    }
    nextPoints[i * 2] = stroke.points[i * 2]! + dx * weight;
    nextPoints[i * 2 + 1] = stroke.points[i * 2 + 1]! + dy * weight;
  }

  return {
    ...stroke,
    points: nextPoints,
    pressures: stroke.pressures ? normalizePressures(stroke.pressures, n) : undefined,
  };
}

/**
 * 벡터선 연결(`Connect vector line`) — 4가지 끝점 방향 조합 중 최소 거리 쌍을 찾아 단일 선으로 잇는다.
 * 최대 간격(`maxGapPx`)을 넘으면 `null`을 반환한다.
 */
export function connectDrawElStrokes(
  strokeA: DrawEl,
  strokeB: DrawEl,
  options?: ConnectDrawElStrokesOptions,
): DrawEl | null {
  const nA = pointCountOf(strokeA.points);
  const nB = pointCountOf(strokeB.points);
  if (nA < 2 || nB < 2) return null;

  const maxGapPx = Math.max(0, options?.maxGapPx ?? 24);
  const smoothSeamSamples = Math.max(0, Math.floor(options?.smoothSeamSamples ?? 2));

  const aStart = { x: strokeA.points[0]!, y: strokeA.points[1]! };
  const aEnd = { x: strokeA.points[(nA - 1) * 2]!, y: strokeA.points[(nA - 1) * 2 + 1]! };
  const bStart = { x: strokeB.points[0]!, y: strokeB.points[1]! };
  const bEnd = { x: strokeB.points[(nB - 1) * 2]!, y: strokeB.points[(nB - 1) * 2 + 1]! };

  const candidates = [
    { revA: false, revB: false, dist: Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y) },
    { revA: false, revB: true, dist: Math.hypot(aEnd.x - bEnd.x, aEnd.y - bEnd.y) },
    { revA: true, revB: false, dist: Math.hypot(aStart.x - bStart.x, aStart.y - bStart.y) },
    { revA: true, revB: true, dist: Math.hypot(aStart.x - bEnd.x, aStart.y - bEnd.y) },
  ] as const;

  let best: { revA: boolean; revB: boolean; dist: number } = candidates[0];
  for (const cand of candidates) {
    if (cand.dist < best.dist) best = cand;
  }
  if (best.dist > maxGapPx) return null;

  const prsA = normalizePressures(strokeA.pressures, nA);
  const prsB = normalizePressures(strokeB.pressures, nB);
  const normA = best.revA ? reversePointsAndPressures(strokeA.points, prsA) : { points: strokeA.points.slice(), pressures: prsA };
  const normB = best.revB ? reversePointsAndPressures(strokeB.points, prsB) : { points: strokeB.points.slice(), pressures: prsB };

  const duplicateSeam = best.dist <= 1.5;
  const mergedPoints: number[] = normA.points.slice();
  const mergedPressures: number[] = normA.pressures.slice();
  const seamIndex = nA - 1;

  if (duplicateSeam) {
    const midX = 0.5 * (normA.points[(nA - 1) * 2]! + normB.points[0]!);
    const midY = 0.5 * (normA.points[(nA - 1) * 2 + 1]! + normB.points[1]!);
    mergedPoints[(nA - 1) * 2] = midX;
    mergedPoints[(nA - 1) * 2 + 1] = midY;
    mergedPressures[nA - 1] = 0.5 * (normA.pressures[nA - 1]! + normB.pressures[0]!);
    mergedPoints.push(...normB.points.slice(2));
    mergedPressures.push(...normB.pressures.slice(1));
  } else {
    mergedPoints.push(...normB.points);
    mergedPressures.push(...normB.pressures);
  }

  smoothWindowInPlace(mergedPoints, seamIndex, smoothSeamSamples, 2);

  return {
    ...strokeA,
    points: mergedPoints,
    pressures: mergedPressures,
  };
}

function slicePolylinePrefix(
  points: readonly number[],
  pressures: readonly number[],
  proj: ProjectedArcPoint,
): { points: number[]; pressures: number[] } {
  const outPts: number[] = [];
  const outPrs: number[] = [];
  for (let i = 0; i <= proj.segIndex; i++) {
    outPts.push(points[i * 2]!, points[i * 2 + 1]!);
    outPrs.push(pressures[i]!);
  }
  if (proj.segT > 1e-4) {
    const p0 = pressures[proj.segIndex]!;
    const p1 = pressures[proj.segIndex + 1] ?? p0;
    outPts.push(proj.x, proj.y);
    outPrs.push(p0 + (p1 - p0) * proj.segT);
  }
  return { points: outPts, pressures: outPrs };
}

function slicePolylineSuffix(
  points: readonly number[],
  pressures: readonly number[],
  proj: ProjectedArcPoint,
): { points: number[]; pressures: number[] } {
  const n = pointCountOf(points);
  const outPts: number[] = [];
  const outPrs: number[] = [];
  if (proj.segT < 1 - 1e-4) {
    const p0 = pressures[proj.segIndex]!;
    const p1 = pressures[proj.segIndex + 1] ?? p0;
    outPts.push(proj.x, proj.y);
    outPrs.push(p0 + (p1 - p0) * proj.segT);
  }
  for (let i = proj.segIndex + 1; i < n; i++) {
    outPts.push(points[i * 2]!, points[i * 2 + 1]!);
    outPrs.push(pressures[i]!);
  }
  return { points: outPts, pressures: outPrs };
}

/**
 * 벡터선 다시 그리기(`Redraw vector line`) — 새 획의 시작/끝을 기존 선의 최단 호길이 구간에 투영하여
 * 중간 구간을 치환하고 양쪽 접합부 이음매를 매끄럽게 다듬는다.
 */
export function redrawVectorStrokeSegment(
  targetStroke: DrawEl,
  redrawStroke: VectorStrokeSampleSpan,
  options?: RedrawVectorStrokeSegmentOptions,
): DrawEl {
  const nTarget = pointCountOf(targetStroke.points);
  const nRedraw = pointCountOf(redrawStroke.points);
  if (nTarget < 2 || nRedraw < 2) return targetStroke;

  const maxSnapDistPx = Math.max(1, options?.maxSnapDistPx ?? 48);
  const seamSmoothPasses = Math.max(0, Math.floor(options?.seamSmoothPasses ?? 2));
  const cum = cumulativeArcLengths(targetStroke.points);

  const rawStart = { x: redrawStroke.points[0]!, y: redrawStroke.points[1]! };
  const rawEnd = {
    x: redrawStroke.points[(nRedraw - 1) * 2]!,
    y: redrawStroke.points[(nRedraw - 1) * 2 + 1]!,
  };
  let projStart = projectPointOntoPolyline(targetStroke.points, cum, rawStart);
  let projEnd = projectPointOntoPolyline(targetStroke.points, cum, rawEnd);
  if (!projStart || !projEnd) return targetStroke;
  if (projStart.dist > maxSnapDistPx && projEnd.dist > maxSnapDistPx) return targetStroke;

  const targetPrs = normalizePressures(targetStroke.pressures, nTarget);
  let insertPrs = redrawStroke.pressures
    ? normalizePressures(redrawStroke.pressures, nRedraw)
    : new Array<number>(nRedraw).fill(NEUTRAL_PRESSURE);
  let insertPts = redrawStroke.points.slice();

  if (projStart.arcLen > projEnd.arcLen) {
    const rev = reversePointsAndPressures(insertPts, insertPrs);
    insertPts = rev.points;
    insertPrs = rev.pressures;
    const tmp = projStart;
    projStart = projEnd;
    projEnd = tmp;
  }

  const prefix = slicePolylinePrefix(targetStroke.points, targetPrs, projStart);
  const suffix = slicePolylineSuffix(targetStroke.points, targetPrs, projEnd);

  if (!redrawStroke.pressures) {
    const pStart = prefix.pressures.at(-1) ?? targetPrs[0]!;
    const pEnd = suffix.pressures[0] ?? targetPrs[nTarget - 1]!;
    for (let i = 0; i < nRedraw; i++) {
      const t = nRedraw > 1 ? i / (nRedraw - 1) : 0;
      insertPrs[i] = pStart + (pEnd - pStart) * t;
    }
  }

  const keepPrefixCount = Math.max(0, pointCountOf(prefix.points) - 1);
  const keepSuffixSkip = pointCountOf(suffix.points) > 0 ? 1 : 0;
  const splicedPoints = [
    ...prefix.points.slice(0, keepPrefixCount * 2),
    ...insertPts,
    ...suffix.points.slice(keepSuffixSkip * 2),
  ];
  const splicedPressures = [
    ...prefix.pressures.slice(0, keepPrefixCount),
    ...insertPrs,
    ...suffix.pressures.slice(keepSuffixSkip),
  ];

  const startSeamIdx = keepPrefixCount;
  const endSeamIdx = keepPrefixCount + nRedraw - 1;
  const seamRadius = nRedraw <= 3 ? 0 : 1;
  if (seamRadius > 0) {
    smoothWindowInPlace(splicedPoints, startSeamIdx, seamRadius, seamSmoothPasses);
    smoothWindowInPlace(splicedPoints, endSeamIdx, seamRadius, seamSmoothPasses);
  } else if (seamSmoothPasses > 0) {
    // 짧은 덧그리기 획은 내부 정점(피크)을 보존하고 접합 경계 정점만 완만하게 보정한다.
    if (startSeamIdx > 0 && startSeamIdx < pointCountOf(splicedPoints) - 1) {
      smoothWindowInPlace(splicedPoints, startSeamIdx, 0, seamSmoothPasses);
    }
    if (endSeamIdx > startSeamIdx && endSeamIdx < pointCountOf(splicedPoints) - 1) {
      smoothWindowInPlace(splicedPoints, endSeamIdx, 0, seamSmoothPasses);
    }
  }

  return {
    ...targetStroke,
    points: splicedPoints,
    pressures: splicedPressures,
  };
}

/**
 * 벡터선 폭 다시 그리기(`Redraw vector line width`) — 안내 획의 필압 프로파일을 대상 선의 투영 구간에 덮어쓴다.
 */
export function redrawVectorStrokeWidth(
  targetStroke: DrawEl,
  guideStroke: VectorStrokeSampleSpan,
  options?: RedrawVectorStrokeWidthOptions,
): DrawEl {
  const nTarget = pointCountOf(targetStroke.points);
  const nGuide = pointCountOf(guideStroke.points);
  if (nTarget < 2 || nGuide < 2) return targetStroke;

  const maxSnapDistPx = Math.max(1, options?.maxSnapDistPx ?? 48);
  const featherPx = Math.max(0, options?.featherPx ?? 12);

  const targetCum = cumulativeArcLengths(targetStroke.points);
  const guideStart = { x: guideStroke.points[0]!, y: guideStroke.points[1]! };
  const guideEnd = {
    x: guideStroke.points[(nGuide - 1) * 2]!,
    y: guideStroke.points[(nGuide - 1) * 2 + 1]!,
  };

  let p0 = projectPointOntoPolyline(targetStroke.points, targetCum, guideStart);
  let p1 = projectPointOntoPolyline(targetStroke.points, targetCum, guideEnd);
  if (!p0 || !p1) return targetStroke;
  if (p0.dist > maxSnapDistPx && p1.dist > maxSnapDistPx) return targetStroke;

  let guidePts = guideStroke.points;
  let guidePrs = normalizePressures(guideStroke.pressures, nGuide);
  if (p0.arcLen > p1.arcLen) {
    const rev = reversePointsAndPressures(guidePts, guidePrs);
    guidePts = rev.points;
    guidePrs = rev.pressures;
    const tmp = p0;
    p0 = p1;
    p1 = tmp;
  }

  const spanLen = p1.arcLen - p0.arcLen;
  if (spanLen < 1e-4) return targetStroke;

  const guideCum = cumulativeArcLengths(guidePts);
  const guideTotal = Math.max(1e-6, guideCum[nGuide - 1] ?? 1);
  const sampleGuidePressure = (u01: number): number => {
    const targetArc = clamp(u01, 0, 1) * guideTotal;
    for (let j = 0; j < nGuide - 1; j++) {
      const a0 = guideCum[j]!;
      const a1 = guideCum[j + 1]!;
      if (targetArc <= a1 || j === nGuide - 2) {
        const seg = a1 - a0;
        const frac = seg > 1e-9 ? clamp((targetArc - a0) / seg, 0, 1) : 0;
        return guidePrs[j]! + (guidePrs[j + 1]! - guidePrs[j]!) * frac;
      }
    }
    return guidePrs[nGuide - 1]!;
  };

  const basePrs = normalizePressures(targetStroke.pressures, nTarget);
  const nextPrs = basePrs.slice();
  const effFeather = Math.min(featherPx, spanLen * 0.45);

  for (let i = 0; i < nTarget; i++) {
    const s = targetCum[i]!;
    if (s < p0.arcLen || s > p1.arcLen) continue;
    const u = (s - p0.arcLen) / spanLen;
    const mapped = sampleGuidePressure(u);
    let blend = 1;
    if (effFeather > 1e-6) {
      const distEdge = Math.min(s - p0.arcLen, p1.arcLen - s);
      if (distEdge < effFeather) {
        blend = 1 - hermiteFalloff(distEdge / effFeather);
      }
    }
    nextPrs[i] = clamp(basePrs[i]! + (mapped - basePrs[i]!) * blend, 0, 1);
  }

  return {
    ...targetStroke,
    pressures: nextPrs,
  };
}

/**
 * 선폭 수정(`Adjust line width`) — 지정 배율로 굵게/가늘게/일정 폭/가감 연산을 수행한다.
 * `atLeastOnePixel` 활성화 시 어떤 정점도 1px 아래로 내려가지 않는다.
 */
export function adjustVectorStrokeWidth(
  stroke: DrawEl,
  options: AdjustVectorStrokeWidthOptions,
): DrawEl {
  const n = pointCountOf(stroke.points);
  if (n === 0) return stroke;

  const amount = Number.isFinite(options.amount) ? options.amount : 0;
  const floorPx = options.atLeastOnePixel ? 1 : MIN_STROKE_WIDTH_PX;
  const currentWidths = effectiveStrokePointWidthsPx(stroke);
  const radiusPx = Math.max(1, options.regionRadiusPx ?? 32);

  const nextWidths = currentWidths.map((w, i) => {
    const rawTarget =
      options.mode === "add" ? w + amount
      : options.mode === "subtract" ? w - amount
      : options.mode === "multiply" ? w * Math.max(0, amount)
      : amount;
    const targetW = Math.max(floorPx, rawTarget);
    if (!options.regionCenter) return targetW;
    const d = Math.hypot(stroke.points[i * 2]! - options.regionCenter.x, stroke.points[i * 2 + 1]! - options.regionCenter.y);
    return d >= radiusPx ? w : Math.max(floorPx, w + (targetW - w) * hermiteFalloff(d / radiusPx));
  });

  const maxW = Math.max(...nextWidths);
  const minW = Math.min(...nextWidths);
  const prevBase = Math.max(floorPx, Number.isFinite(stroke.strokeWidth) ? stroke.strokeWidth : 1);
  const nextStrokeWidth = maxW - minW <= 1e-6
    ? maxW
    : Math.max(floorPx, maxW * NEUTRAL_PRESSURE, Math.min(maxW, prevBase));
  const nextPressures = nextWidths.map((w) => clamp((w / nextStrokeWidth) * NEUTRAL_PRESSURE, 0, 1));

  return { ...stroke, strokeWidth: Number(nextStrokeWidth.toFixed(4)), pressures: nextPressures };
}

/** 정규화 호길이 파라미터 `t` (`0 < t < 1`) 지점에서 벡터 획을 두 개의 독립 `DrawEl`로 분할한다. */
export function splitVectorStrokeAtParameter(
  stroke: DrawEl,
  t: number,
  ids?: readonly [string, string],
): [DrawEl, DrawEl] | null {
  const n = pointCountOf(stroke.points);
  if (n < 2 || !Number.isFinite(t) || t <= 0 || t >= 1) return null;

  const cum = cumulativeArcLengths(stroke.points);
  const totalLen = cum[n - 1] ?? 0;
  if (totalLen <= 1e-6) return null;

  const targetArc = t * totalLen;
  let segIndex = 0;
  for (let i = 0; i < n - 1; i++) {
    if (targetArc <= cum[i + 1]! || i === n - 2) {
      segIndex = i;
      break;
    }
  }
  const segLen = cum[segIndex + 1]! - cum[segIndex]!;
  const segT = segLen > 1e-9 ? clamp((targetArc - cum[segIndex]!) / segLen, 0, 1) : 0;
  const splitX = stroke.points[segIndex * 2]! + (stroke.points[(segIndex + 1) * 2]! - stroke.points[segIndex * 2]!) * segT;
  const splitY = stroke.points[segIndex * 2 + 1]! + (stroke.points[(segIndex + 1) * 2 + 1]! - stroke.points[segIndex * 2 + 1]!) * segT;
  const proj: ProjectedArcPoint = { segIndex, segT, arcLen: targetArc, x: splitX, y: splitY, dist: 0 };
  const prs = normalizePressures(stroke.pressures, n);
  const first = slicePolylinePrefix(stroke.points, prs, proj);
  const second = slicePolylineSuffix(stroke.points, prs, proj);
  if (pointCountOf(first.points) < 2 || pointCountOf(second.points) < 2) return null;

  return [
    { ...stroke, id: ids?.[0] ?? `${stroke.id}:split-a`, points: first.points, pressures: first.pressures },
    { ...stroke, id: ids?.[1] ?? `${stroke.id}:split-b`, points: second.points, pressures: second.pressures },
  ];
}

/**
 * 모서리 전환(`Switch corner`) — 정점의 꺾임각을 판정하여 뾰족한 각(`cusp`)과 부드러운 곡선(`smooth`)을 전환한다.
 */
export function toggleVectorCornerSmooth(
  stroke: DrawEl,
  pointIndex: number,
  options?: ToggleVectorCornerSmoothOptions,
): DrawEl {
  const n = pointCountOf(stroke.points);
  if (n < 3 || pointIndex <= 0 || pointIndex >= n - 1) return stroke;

  const prevX = stroke.points[(pointIndex - 1) * 2]!;
  const prevY = stroke.points[(pointIndex - 1) * 2 + 1]!;
  const currX = stroke.points[pointIndex * 2]!;
  const currY = stroke.points[pointIndex * 2 + 1]!;
  const nextX = stroke.points[(pointIndex + 1) * 2]!;
  const nextY = stroke.points[(pointIndex + 1) * 2 + 1]!;

  const v1x = currX - prevX;
  const v1y = currY - prevY;
  const v2x = nextX - currX;
  const v2y = nextY - currY;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 <= 1e-6 || len2 <= 1e-6) return stroke;

  const cosTurn = clamp((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1);
  const isCurrentlySharp = cosTurn < 0.82;
  const targetMode = options?.mode === "auto" || options?.mode === undefined
    ? (isCurrentlySharp ? "smooth" : "cusp")
    : options.mode;
  const strength = clamp(options?.strength ?? 0.65, 0.1, 1);

  const prs = normalizePressures(stroke.pressures, n);
  const midX = 0.5 * (prevX + nextX);
  const midY = 0.5 * (prevY + nextY);

  if (targetMode === "smooth") {
    // Chaikin 코너 완화와 중심 라플라시안 이동을 결합하여 뾰족한 꼭짓점을 매끈한 호로 둥글린다.
    const q1x = prevX + 0.75 * (currX - prevX);
    const q1y = prevY + 0.75 * (currY - prevY);
    const apexX = currX + (midX - currX) * (0.5 * strength);
    const apexY = currY + (midY - currY) * (0.5 * strength);
    const q2x = currX + 0.25 * (nextX - currX);
    const q2y = currY + 0.25 * (nextY - currY);
    const pPrev = prs[pointIndex - 1]!;
    const pCurr = prs[pointIndex]!;
    const pNext = prs[pointIndex + 1]!;

    const outPts = [
      ...stroke.points.slice(0, pointIndex * 2),
      q1x, q1y,
      apexX, apexY,
      q2x, q2y,
      ...stroke.points.slice((pointIndex + 1) * 2),
    ];
    const outPrs = [
      ...prs.slice(0, pointIndex),
      0.25 * pPrev + 0.75 * pCurr,
      pCurr,
      0.75 * pCurr + 0.25 * pNext,
      ...prs.slice(pointIndex + 1),
    ];
    return { ...stroke, points: outPts, pressures: outPrs };
  }

  // cusp 모드: 현(chord)에서 바깥쪽 법선/정점 방향으로 돌출량을 증폭해 각진 모서리를 만든다.
  const chordDx = nextX - prevX;
  const chordDy = nextY - prevY;
  const chordLen = Math.hypot(chordDx, chordDy);
  let offsetX = currX - midX;
  let offsetY = currY - midY;
  const offsetLen = Math.hypot(offsetX, offsetY);
  if (offsetLen > 1e-5) {
    offsetX *= 1 + 0.85 * strength;
    offsetY *= 1 + 0.85 * strength;
  } else if (chordLen > 1e-5) {
    const nx = -chordDy / chordLen;
    const ny = chordDx / chordLen;
    const spike = 0.25 * chordLen * strength;
    offsetX = nx * spike;
    offsetY = ny * spike;
  }

  const outPts = stroke.points.slice();
  outPts[pointIndex * 2] = midX + offsetX;
  outPts[pointIndex * 2 + 1] = midY + offsetY;
  return { ...stroke, points: outPts, pressures: prs };
}
