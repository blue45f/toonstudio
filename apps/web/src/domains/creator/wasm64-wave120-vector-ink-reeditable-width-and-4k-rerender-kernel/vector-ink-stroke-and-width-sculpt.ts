/**
 * Wave 120 — 가변 필압 벡터 먹선 모델, 비파괴 부분 선폭 조각, SHA-256 레이어 지문 및 가역 Undo 스택.
 *
 * - 완성된 벡터 먹선의 특정 구간을 가우시안 감쇠로 두껍게/가늘게/끝단 날카롭게/범위 고정 조각하며,
 *   브러시 반경 밖 제어점은 0.0px 변동 없이 원본을 그대로 보존한다.
 */

import { clampFinite, sha256VectorInkHex } from "./vector-ink-sha256";

export { clampFinite, sha256VectorInkHex };

export interface VectorInkPoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pressure: number;
}

export interface VectorInkStroke {
  readonly id: string;
  readonly points: readonly VectorInkPoint[];
  readonly closed: boolean;
  readonly taperStartPx: number;
  readonly taperEndPx: number;
  readonly colorOklch?: string;
  readonly opacity?: number;
}

export interface VectorInkLayer {
  readonly layerId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpi: number;
  readonly strokes: readonly VectorInkStroke[];
}

export interface VectorStrokeSegment {
  readonly segIndex: number;
  readonly p0: VectorInkPoint;
  readonly p1: VectorInkPoint;
  readonly startS: number;
  readonly endS: number;
  readonly length: number;
  readonly isClosingSegment: boolean;
}

export interface VectorInkSample {
  readonly arcLengthS: number;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly effectiveWidthPx: number;
  readonly pressure: number;
  readonly segmentIndex: number;
  readonly segmentT: number;
}

export interface StrokeProjectionResult {
  readonly arcLengthS: number;
  readonly distancePx: number;
  readonly segmentIndex: number;
  readonly segmentT: number;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pressure: number;
}

export type WidthSculptMode = "thicken" | "thin" | "sharpen-tips" | "uniform-clamp";

export interface WidthSculptOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly brushRadiusPx: number;
  readonly mode: WidthSculptMode;
  readonly strengthPx?: number;
  readonly targetWidthPx?: number;
  readonly minWidthPx?: number;
  readonly maxWidthPx?: number;
  readonly gaussianSigmaRatio?: number;
  readonly tipInfluenceSpanRatio?: number;
}

export interface WidthSculptResult {
  readonly stroke: VectorInkStroke;
  readonly mode: WidthSculptMode;
  readonly affectedPointCount: number;
  readonly untouchedPointCount: number;
  readonly maxAbsoluteDeltaPx: number;
  readonly maxOutsideRadiusDeltaPx: number;
  readonly beforeWidthsPx: readonly number[];
  readonly afterWidthsPx: readonly number[];
  readonly beforeSha256: string;
  readonly afterSha256: string;
}

export interface VectorInkHistoryEntry {
  readonly actionLabelKo: string;
  readonly layer: VectorInkLayer;
  readonly sha256Hex: string;
}

export interface VectorInkHistoryStack {
  readonly entries: readonly VectorInkHistoryEntry[];
  readonly cursor: number;
}

export interface VectorInkUndoParityReport {
  readonly restoredExactSha256: boolean;
  readonly editedDiffersFromOriginal: boolean;
  readonly beforeSha256: string;
  readonly editedSha256: string;
  readonly undoneSha256: string;
}

const DEFAULT_MIN_WIDTH_PX = 0.35;
const DEFAULT_MAX_WIDTH_PX = 32;
const DEFAULT_SIGMA_RATIO = 0.45;
const DEFAULT_TIP_SPAN_RATIO = 0.3;
const CLOSING_COINCIDENCE_EPS = 1e-7;

function quantizeCanonicalNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const normalized = Object.is(value, -0) ? 0 : value;
  const rounded = Math.round(normalized * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function serializeStrokeCanonical(stroke: VectorInkStroke): string {
  const pts: string[] = [];
  for (let i = 0; i < stroke.points.length; i += 1) {
    const pt = stroke.points[i];
    pts.push(
      `[${quantizeCanonicalNumber(pt.x)},${quantizeCanonicalNumber(pt.y)},${quantizeCanonicalNumber(pt.widthPx)},${quantizeCanonicalNumber(pt.pressure)}]`,
    );
  }
  const color = stroke.colorOklch ?? "oklch(0.160 0.015 250)";
  const opacity = quantizeCanonicalNumber(stroke.opacity ?? 1);
  return (
    `{"id":${JSON.stringify(stroke.id)},` +
    `"closed":${stroke.closed ? "true" : "false"},` +
    `"taperStartPx":${quantizeCanonicalNumber(stroke.taperStartPx)},` +
    `"taperEndPx":${quantizeCanonicalNumber(stroke.taperEndPx)},` +
    `"colorOklch":${JSON.stringify(color)},` +
    `"opacity":${opacity},` +
    `"points":[${pts.join(",")}]}`
  );
}

/** 단일 벡터 먹선의 결정론적 FIPS 180-4 SHA-256 지문을 계산한다. */
export function computeVectorInkStrokeSha256Hex(stroke: VectorInkStroke): string {
  return sha256VectorInkHex(`wave120:stroke:v1:${serializeStrokeCanonical(stroke)}`);
}

/** 벡터 먹선 레이어 전체의 결정론적 FIPS 180-4 SHA-256 지문을 계산한다. */
export function computeVectorInkLayerSha256Hex(layer: VectorInkLayer): string {
  const strokesJson: string[] = [];
  for (let i = 0; i < layer.strokes.length; i += 1) {
    strokesJson.push(serializeStrokeCanonical(layer.strokes[i]));
  }
  const payload =
    `{"layerId":${JSON.stringify(layer.layerId)},` +
    `"widthPx":${quantizeCanonicalNumber(layer.widthPx)},` +
    `"heightPx":${quantizeCanonicalNumber(layer.heightPx)},` +
    `"dpi":${quantizeCanonicalNumber(layer.dpi)},` +
    `"strokes":[${strokesJson.join(",")}]}`;
  return sha256VectorInkHex(`wave120:layer:v1:${payload}`);
}

/** 스트로크의 모든 연속 선분(닫힌 획의 마감 선분 포함)을 누적 호장과 함께 추출한다. */
export function extractStrokeSegments(stroke: VectorInkStroke): readonly VectorStrokeSegment[] {
  const pts = stroke.points;
  const count = pts.length;
  if (count < 2) return [];
  const segments: VectorStrokeSegment[] = [];
  let accumS = 0;
  for (let i = 0; i < count - 1; i += 1) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    segments.push({
      segIndex: i,
      p0,
      p1,
      startS: accumS,
      endS: accumS + len,
      length: len,
      isClosingSegment: false,
    });
    accumS += len;
  }
  if (stroke.closed && count >= 3) {
    const first = pts[0];
    const last = pts[count - 1];
    const closingLen = Math.hypot(first.x - last.x, first.y - last.y);
    if (closingLen > CLOSING_COINCIDENCE_EPS) {
      segments.push({
        segIndex: count - 1,
        p0: last,
        p1: first,
        startS: accumS,
        endS: accumS + closingLen,
        length: closingLen,
        isClosingSegment: true,
      });
    }
  }
  return segments;
}

/** 스트로크 각 제어점의 누적 호장 배열을 계산한다. */
export function computeStrokeCumulativeArcLengths(stroke: VectorInkStroke): readonly number[] {
  const pts = stroke.points;
  if (pts.length === 0) return [];
  const arc: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    arc.push(total);
  }
  return arc;
}

/** 스트로크 전체 호장(닫힌 획의 마감 선분 포함)을 계산한다. */
export function computeStrokeTotalLength(stroke: VectorInkStroke): number {
  const segments = extractStrokeSegments(stroke);
  return segments.length === 0 ? 0 : segments[segments.length - 1].endS;
}

function smoothTaperFactor(normalized: number): number {
  const t = clampFinite(normalized, 0, 1, 1);
  return 0.14 + 0.86 * (t * t * (3 - 2 * t));
}

/** 시작·끝단 테이퍼를 반영한 유효 렌더링 선폭을 계산한다. */
export function evaluateEffectiveStrokeWidth(
  rawWidthPx: number,
  arcLengthS: number,
  totalLength: number,
  taperStartPx: number,
  taperEndPx: number,
  closed: boolean,
): number {
  const base = Math.max(0.05, Number.isFinite(rawWidthPx) ? rawWidthPx : 1);
  if (closed || totalLength <= 1e-9) return base;
  let factor = 1;
  const startSpan = Math.max(0, Number.isFinite(taperStartPx) ? taperStartPx : 0);
  const endSpan = Math.max(0, Number.isFinite(taperEndPx) ? taperEndPx : 0);
  if (startSpan > 0 && arcLengthS < startSpan) {
    factor = Math.min(factor, smoothTaperFactor(arcLengthS / startSpan));
  }
  const remain = totalLength - arcLengthS;
  if (endSpan > 0 && remain < endSpan) {
    factor = Math.min(factor, smoothTaperFactor(remain / endSpan));
  }
  return Math.max(0.05, base * factor);
}

/** 호장 `s` 위치의 보간 좌표·선폭·유효 선폭·필압을 샘플링한다. */
export function sampleStrokeAtArcLength(
  stroke: VectorInkStroke,
  arcLengthS: number,
): VectorInkSample {
  const pts = stroke.points;
  if (pts.length === 0) {
    return {
      arcLengthS: 0,
      x: 0,
      y: 0,
      widthPx: 0,
      effectiveWidthPx: 0,
      pressure: 0,
      segmentIndex: 0,
      segmentT: 0,
    };
  }
  const segments = extractStrokeSegments(stroke);
  if (segments.length === 0) {
    const p = pts[0];
    return {
      arcLengthS: 0,
      x: p.x,
      y: p.y,
      widthPx: p.widthPx,
      effectiveWidthPx: p.widthPx,
      pressure: p.pressure,
      segmentIndex: 0,
      segmentT: 0,
    };
  }
  const totalLength = segments[segments.length - 1].endS;
  const s = clampFinite(arcLengthS, 0, totalLength, 0);

  let chosen = segments[segments.length - 1];
  for (let i = 0; i < segments.length; i += 1) {
    if (s <= segments[i].endS || i === segments.length - 1) {
      chosen = segments[i];
      break;
    }
  }
  const t = chosen.length > 1e-12 ? clampFinite((s - chosen.startS) / chosen.length, 0, 1, 0) : 0;
  const widthPx = chosen.p0.widthPx + (chosen.p1.widthPx - chosen.p0.widthPx) * t;
  return {
    arcLengthS: s,
    x: chosen.p0.x + (chosen.p1.x - chosen.p0.x) * t,
    y: chosen.p0.y + (chosen.p1.y - chosen.p0.y) * t,
    widthPx,
    effectiveWidthPx: evaluateEffectiveStrokeWidth(
      widthPx,
      s,
      totalLength,
      stroke.taperStartPx,
      stroke.taperEndPx,
      stroke.closed,
    ),
    pressure: chosen.p0.pressure + (chosen.p1.pressure - chosen.p0.pressure) * t,
    segmentIndex: chosen.segIndex,
    segmentT: t,
  };
}

/** 임의 좌표 `(px, py)`를 스트로크 위의 가장 가까운 위치로 투영한다. */
export function projectPointOntoStroke(
  stroke: VectorInkStroke,
  px: number,
  py: number,
): StrokeProjectionResult {
  const segments = extractStrokeSegments(stroke);
  if (segments.length === 0) {
    const p = stroke.points[0] ?? { x: 0, y: 0, widthPx: 0, pressure: 0 };
    return {
      arcLengthS: 0,
      distancePx: Math.hypot(px - p.x, py - p.y),
      segmentIndex: 0,
      segmentT: 0,
      x: p.x,
      y: p.y,
      widthPx: p.widthPx,
      pressure: p.pressure,
    };
  }

  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestResult: StrokeProjectionResult = {
    arcLengthS: 0,
    distancePx: Number.POSITIVE_INFINITY,
    segmentIndex: 0,
    segmentT: 0,
    x: segments[0].p0.x,
    y: segments[0].p0.y,
    widthPx: segments[0].p0.widthPx,
    pressure: segments[0].p0.pressure,
  };

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const dx = seg.p1.x - seg.p0.x;
    const dy = seg.p1.y - seg.p0.y;
    const lenSq = dx * dx + dy * dy;
    const rawT = lenSq > 1e-18 ? ((px - seg.p0.x) * dx + (py - seg.p0.y) * dy) / lenSq : 0;
    const t = clampFinite(rawT, 0, 1, 0);
    const projX = seg.p0.x + dx * t;
    const projY = seg.p0.y + dy * t;
    const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestResult = {
        arcLengthS: seg.startS + seg.length * t,
        distancePx: Math.sqrt(distSq),
        segmentIndex: seg.segIndex,
        segmentT: t,
        x: projX,
        y: projY,
        widthPx: seg.p0.widthPx + (seg.p1.widthPx - seg.p0.widthPx) * t,
        pressure: seg.p0.pressure + (seg.p1.pressure - seg.p0.pressure) * t,
      };
    }
  }
  return bestResult;
}

function evaluateCompactGaussianWeight(distPx: number, radiusPx: number, sigmaRatio: number): number {
  if (radiusPx <= 0 || distPx >= radiusPx) return 0;
  const sigma = Math.max(1e-6, radiusPx * clampFinite(sigmaRatio, 0.1, 2.0, DEFAULT_SIGMA_RATIO));
  const invTwoSigmaSq = 0.5 / (sigma * sigma);
  const gRaw = Math.exp(-distPx * distPx * invTwoSigmaSq);
  const gEdge = Math.exp(-radiusPx * radiusPx * invTwoSigmaSq);
  const denom = 1 - gEdge;
  return denom <= 1e-12 ? 0 : clampFinite((gRaw - gEdge) / denom, 0, 1, 0);
}

/**
 * 완성된 벡터 먹선의 지정 반경(`brushRadiusPx`) 구간 선폭을 가우시안 감쇠로 비파괴 조각한다.
 * 반경 밖(`dist >= brushRadiusPx`) 원거리 제어점은 선폭 변동 `0.0px`로 원본 참조를 보존한다.
 */
export function sculptVectorInkStrokeWidth(
  stroke: VectorInkStroke,
  options: WidthSculptOptions,
): WidthSculptResult {
  const beforeSha256 = computeVectorInkStrokeSha256Hex(stroke);
  const beforeWidthsPx = stroke.points.map((pt) => pt.widthPx);

  const cx = Number.isFinite(options.centerX) ? options.centerX : 0;
  const cy = Number.isFinite(options.centerY) ? options.centerY : 0;
  const radius = Math.max(0, Number.isFinite(options.brushRadiusPx) ? options.brushRadiusPx : 0);
  const minWidth = clampFinite(options.minWidthPx ?? DEFAULT_MIN_WIDTH_PX, 0.05, 512, DEFAULT_MIN_WIDTH_PX);
  const maxWidth = clampFinite(
    options.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX,
    minWidth,
    1024,
    Math.max(minWidth, DEFAULT_MAX_WIDTH_PX),
  );
  const strength = Math.max(0, Number.isFinite(options.strengthPx ?? 1.5) ? (options.strengthPx ?? 1.5) : 1.5);
  const sigmaRatio = options.gaussianSigmaRatio ?? DEFAULT_SIGMA_RATIO;
  const tipSpanRatio = clampFinite(options.tipInfluenceSpanRatio ?? DEFAULT_TIP_SPAN_RATIO, 0.05, 0.5, DEFAULT_TIP_SPAN_RATIO);

  const arcLengths = computeStrokeCumulativeArcLengths(stroke);
  const totalLength = arcLengths.length > 0 ? arcLengths[arcLengths.length - 1] : 0;
  const tipSpan = Math.max(radius, totalLength * tipSpanRatio);

  const nextPoints: VectorInkPoint[] = [];
  let affectedPointCount = 0;
  let untouchedPointCount = 0;
  let maxAbsoluteDeltaPx = 0;

  for (let i = 0; i < stroke.points.length; i += 1) {
    const pt = stroke.points[i];
    const dist = Math.hypot(pt.x - cx, pt.y - cy);
    if (radius <= 0 || dist >= radius) {
      nextPoints.push(pt);
      untouchedPointCount += 1;
      continue;
    }

    const weight = evaluateCompactGaussianWeight(dist, radius, sigmaRatio);
    let nextWidth: number;
    if (options.mode === "thicken") {
      nextWidth = clampFinite(pt.widthPx + strength * weight, minWidth, maxWidth, pt.widthPx);
    } else if (options.mode === "thin") {
      nextWidth = clampFinite(pt.widthPx - strength * weight, minWidth, maxWidth, pt.widthPx);
    } else if (options.mode === "sharpen-tips") {
      const s = arcLengths[i] ?? 0;
      const distToEnd = Math.min(s, Math.max(0, totalLength - s));
      const tipProximity = tipSpan > 1e-9 ? clampFinite(1 - distToEnd / tipSpan, 0, 1, 0) : 1;
      const tipBoost = 0.2 + 0.8 * tipProximity;
      nextWidth = clampFinite(pt.widthPx - strength * weight * tipBoost, minWidth, maxWidth, pt.widthPx);
    } else if (options.targetWidthPx !== undefined && Number.isFinite(options.targetWidthPx)) {
      const clampedTarget = clampFinite(options.targetWidthPx, minWidth, maxWidth, pt.widthPx);
      const blended = pt.widthPx + (clampedTarget - pt.widthPx) * weight;
      nextWidth = clampFinite(blended, minWidth, maxWidth, pt.widthPx);
    } else {
      nextWidth = clampFinite(pt.widthPx, minWidth, maxWidth, pt.widthPx);
    }

    const delta = Math.abs(nextWidth - pt.widthPx);
    if (delta > 0) {
      affectedPointCount += 1;
      maxAbsoluteDeltaPx = Math.max(maxAbsoluteDeltaPx, delta);
      const nextPressure =
        pt.widthPx > 1e-9
          ? clampFinite(pt.pressure * (nextWidth / pt.widthPx), 0.01, 1, pt.pressure)
          : clampFinite(nextWidth / maxWidth, 0.01, 1, pt.pressure);
      nextPoints.push({ x: pt.x, y: pt.y, widthPx: nextWidth, pressure: nextPressure });
    } else {
      nextPoints.push(pt);
      untouchedPointCount += 1;
    }
  }

  const nextStroke: VectorInkStroke = { ...stroke, points: nextPoints };
  return {
    stroke: nextStroke,
    mode: options.mode,
    affectedPointCount,
    untouchedPointCount,
    maxAbsoluteDeltaPx,
    maxOutsideRadiusDeltaPx: 0,
    beforeWidthsPx,
    afterWidthsPx: nextPoints.map((pt) => pt.widthPx),
    beforeSha256,
    afterSha256: computeVectorInkStrokeSha256Hex(nextStroke),
  };
}

/** 레이어 내 특정 스트로크에 부분 선폭 조각을 적용하고 새 불변 레이어를 반환한다. */
export function sculptVectorInkLayerStrokeWidth(
  layer: VectorInkLayer,
  targetStrokeId: string,
  options: WidthSculptOptions,
): { readonly layer: VectorInkLayer; readonly sculptResult: WidthSculptResult | null } {
  let sculptResult: WidthSculptResult | null = null;
  const nextStrokes = layer.strokes.map((stroke) => {
    if (stroke.id !== targetStrokeId) return stroke;
    sculptResult = sculptVectorInkStrokeWidth(stroke, options);
    return sculptResult.stroke;
  });
  return {
    layer: sculptResult ? { ...layer, strokes: nextStrokes } : layer,
    sculptResult,
  };
}

/** 가역 편집 Undo/Redo 이력 스택을 초기화한다. */
export function createVectorInkHistory(
  initialLayer: VectorInkLayer,
  initialLabelKo = "초기 벡터 먹선 레이어",
): VectorInkHistoryStack {
  return {
    entries: [
      {
        actionLabelKo: initialLabelKo,
        layer: initialLayer,
        sha256Hex: computeVectorInkLayerSha256Hex(initialLayer),
      },
    ],
    cursor: 0,
  };
}

/** 새 비파괴 편집 스냅샷을 이력 스택에 기록한다. */
export function pushVectorInkEdit(
  history: VectorInkHistoryStack,
  nextLayer: VectorInkLayer,
  actionLabelKo: string,
): VectorInkHistoryStack {
  const truncated = history.entries.slice(0, history.cursor + 1);
  return {
    entries: [
      ...truncated,
      { actionLabelKo, layer: nextLayer, sha256Hex: computeVectorInkLayerSha256Hex(nextLayer) },
    ],
    cursor: truncated.length,
  };
}

/** 직전 편집 상태로 한 단계 되돌린다(Undo). */
export function undoVectorInkEdit(history: VectorInkHistoryStack): VectorInkHistoryStack {
  return history.cursor <= 0 ? history : { entries: history.entries, cursor: history.cursor - 1 };
}

/** 되돌린 편집 상태를 한 단계 다시 적용한다(Redo). */
export function redoVectorInkEdit(history: VectorInkHistoryStack): VectorInkHistoryStack {
  return history.cursor >= history.entries.length - 1
    ? history
    : { entries: history.entries, cursor: history.cursor + 1 };
}

/** 현재 커서가 가리키는 레이어를 조회한다. */
export function getCurrentHistoryLayer(history: VectorInkHistoryStack): VectorInkLayer {
  const idx = clampFinite(history.cursor, 0, Math.max(0, history.entries.length - 1), 0);
  return history.entries[idx].layer;
}

/** 원본·편집본·Undo 복구본의 FIPS 180-4 SHA-256 일치 정합성을 검증한다. */
export function verifyVectorInkUndoParity(
  beforeLayer: VectorInkLayer,
  editedLayer: VectorInkLayer,
  undoneLayer: VectorInkLayer,
): VectorInkUndoParityReport {
  const beforeSha256 = computeVectorInkLayerSha256Hex(beforeLayer);
  const editedSha256 = computeVectorInkLayerSha256Hex(editedLayer);
  const undoneSha256 = computeVectorInkLayerSha256Hex(undoneLayer);
  return {
    restoredExactSha256: beforeSha256 === undoneSha256,
    editedDiffersFromOriginal: beforeSha256 !== editedSha256,
    beforeSha256,
    editedSha256,
    undoneSha256,
  };
}
