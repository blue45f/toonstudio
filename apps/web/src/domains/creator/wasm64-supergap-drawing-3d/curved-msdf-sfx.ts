/**
 * Super-Gap Pillar A (#2): Variable-Font Curved-Path Triple-Outline MSDF SFX Engine.
 * 한글·영문 효과음 글리프를 3차 베지에/방사 폭발 곡선에 호길이 등간격으로 배치하고
 * 가변 폰트 축(wght/slnt/wdth) 보간과 3겹 잉크 외곽선 MSDF 디스크립터를 생성한다.
 */

import type { RgbaTuple } from "./wet-paper-lbm-v2";

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampRange(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function hash2dUnit(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export type SfxCurveSpec =
  | {
      readonly kind: "cubic-bezier";
      readonly p0: Point2D;
      readonly p1: Point2D;
      readonly p2: Point2D;
      readonly p3: Point2D;
    }
  | {
      readonly kind: "radial-explosion";
      readonly center: Point2D;
      readonly startRadiusPx: number;
      readonly endRadiusPx: number;
      readonly startAngleRad: number;
      readonly sweepAngleRad: number;
      readonly burstWaveAmpPx?: number;
      readonly burstWaveFreq?: number;
    };

export type SfxAxisEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "impact-peak"
  | "taper-tail";

export interface VariableFontAxisRange {
  readonly weightStart: number;
  readonly weightEnd: number;
  readonly slantStartDeg: number;
  readonly slantEndDeg: number;
  readonly widthStartPct?: number;
  readonly widthEndPct?: number;
  readonly scaleStart?: number;
  readonly scaleEnd?: number;
  readonly easing?: SfxAxisEasing;
}

export interface SfxOutlineLayerSpec {
  readonly role: "inner-core" | "mid-knockout" | "outer-impact";
  readonly widthPx: number;
  readonly colorRgba: RgbaTuple;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly miterLimit?: number;
}

export interface SfxOutlineLayerDescriptor {
  readonly layerIndex: 0 | 1 | 2;
  readonly role: "inner-core" | "mid-knockout" | "outer-impact";
  readonly strokeWidthPx: number;
  readonly cumulativeExpandPx: number;
  readonly msdfDistanceThreshold: number;
  readonly msdfSmoothingPx: number;
  readonly colorRgba: RgbaTuple;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly miterLimit: number;
}

export interface CurvedVariableSfxInput {
  readonly text: string;
  readonly curve: SfxCurveSpec;
  readonly baseFontSizePx: number;
  readonly fontFamily?: string;
  readonly trackingPx?: number;
  readonly axes: VariableFontAxisRange;
  readonly msdfPxRange?: number;
  readonly fillRgba?: RgbaTuple;
  readonly outlines?: readonly [SfxOutlineLayerSpec, SfxOutlineLayerSpec, SfxOutlineLayerSpec];
  readonly impactJitterPx?: number;
  readonly seed?: number;
}

export interface PlacedSfxGlyph {
  readonly char: string;
  readonly glyphIndex: number;
  readonly isHangul: boolean;
  readonly isPunctuation: boolean;
  readonly normalizedProgress: number;
  readonly curveT: number;
  readonly arcLengthPx: number;
  readonly x: number;
  readonly y: number;
  readonly tangentAngleRad: number;
  readonly rotationRad: number;
  readonly fontSizePx: number;
  readonly advancePx: number;
  readonly fontWeight: number;
  readonly fontSlantDeg: number;
  readonly fontWidthPct: number;
  readonly scale: number;
  readonly msdfPxRange: number;
  readonly msdfCoreThreshold: number;
  readonly fillRgba: RgbaTuple;
  readonly outlines: readonly [
    SfxOutlineLayerDescriptor,
    SfxOutlineLayerDescriptor,
    SfxOutlineLayerDescriptor,
  ];
}

export interface CurvedVariableSfxLayout {
  readonly text: string;
  readonly fontFamily: string;
  readonly curveKind: SfxCurveSpec["kind"];
  readonly totalArcLengthPx: number;
  readonly glyphs: readonly PlacedSfxGlyph[];
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly msdfAtlasPxRange: number;
  readonly tripleOutlineStackOrder: readonly ["outer-impact", "mid-knockout", "inner-core"];
}

export const DEFAULT_TRIPLE_OUTLINES: readonly [
  SfxOutlineLayerSpec,
  SfxOutlineLayerSpec,
  SfxOutlineLayerSpec,
] = [
  { role: "inner-core", widthPx: 2.2, colorRgba: [0.08, 0.08, 0.1, 1], miterLimit: 4 },
  { role: "mid-knockout", widthPx: 4.8, colorRgba: [0.99, 0.99, 0.99, 1], miterLimit: 3 },
  {
    role: "outer-impact",
    widthPx: 7.5,
    colorRgba: [0.85, 0.12, 0.16, 1],
    offsetX: 2.5,
    offsetY: 3.0,
    miterLimit: 2.5,
  },
];

export function evaluateCubicBezierPoint(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

export function evaluateCubicBezierTangent(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const u = 1 - t;
  const dx =
    3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy =
    3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  const len = Math.hypot(dx, dy);
  if (len <= 1e-8) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

function evaluateSfxCurvePoint(curve: SfxCurveSpec, t: number): Point2D {
  const clampedT = clamp01(t);
  if (curve.kind === "cubic-bezier") {
    return evaluateCubicBezierPoint(curve.p0, curve.p1, curve.p2, curve.p3, clampedT);
  }
  const angle = curve.startAngleRad + curve.sweepAngleRad * clampedT;
  const waveAmp = curve.burstWaveAmpPx ?? 0;
  const waveFreq = curve.burstWaveFreq ?? 6;
  const wave = waveAmp * Math.sin(clampedT * Math.PI * waveFreq);
  const radius =
    curve.startRadiusPx + (curve.endRadiusPx - curve.startRadiusPx) * clampedT + wave;
  return {
    x: curve.center.x + Math.cos(angle) * radius,
    y: curve.center.y + Math.sin(angle) * radius,
  };
}

function evaluateSfxCurveTangent(curve: SfxCurveSpec, t: number): Point2D {
  if (curve.kind === "cubic-bezier") {
    return evaluateCubicBezierTangent(curve.p0, curve.p1, curve.p2, curve.p3, clamp01(t));
  }
  const eps = 1e-3;
  const pA = evaluateSfxCurvePoint(curve, Math.max(0, t - eps));
  const pB = evaluateSfxCurvePoint(curve, Math.min(1, t + eps));
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-8) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

function buildCurveArcLengthLut(curve: SfxCurveSpec, samples: number = 64): Float32Array {
  const lut = new Float32Array(samples + 1);
  let prev = evaluateSfxCurvePoint(curve, 0);
  let accum = 0;
  for (let i = 1; i <= samples; i += 1) {
    const pt = evaluateSfxCurvePoint(curve, i / samples);
    accum += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    lut[i] = accum;
    prev = pt;
  }
  return lut;
}

function lookupCurveTByArcLength(lut: Float32Array, targetDist: number): number {
  const samples = lut.length - 1;
  const total = lut[samples];
  if (total <= 1e-6 || targetDist <= 0) return 0;
  if (targetDist >= total) return 1;

  let lo = 0;
  let hi = samples;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lut[mid] <= targetDist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const span = lut[hi] - lut[lo];
  const frac = span > 1e-8 ? (targetDist - lut[lo]) / span : 0;
  return (lo + frac) / samples;
}

function applyAxisEasing(s: number, easing: SfxAxisEasing): number {
  const t = clamp01(s);
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "impact-peak":
      return Math.sin(t * Math.PI);
    case "taper-tail":
      return 1 - Math.pow(t, 1.45);
    case "linear":
    default:
      return t;
  }
}

function isHangulCodePoint(code: number): boolean {
  return (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x3131 && code <= 0x318e) ||
    (code >= 0x1100 && code <= 0x11ff)
  );
}

function estimateCharAdvanceRatio(ch: string): { ratio: number; isHangul: boolean; isPunct: boolean } {
  const code = ch.charCodeAt(0);
  if (isHangulCodePoint(code)) {
    return { ratio: 0.96, isHangul: true, isPunct: false };
  }
  if (ch === " ") {
    return { ratio: 0.42, isHangul: false, isPunct: false };
  }
  if (ch === "!" || ch === "?" || ch === "~" || ch === "·" || ch === ".") {
    return { ratio: 0.48, isHangul: false, isPunct: true };
  }
  if (ch === "W" || ch === "M") {
    return { ratio: 0.9, isHangul: false, isPunct: false };
  }
  return { ratio: 0.68, isHangul: false, isPunct: false };
}

export function buildTripleInkOutlines(
  specs: readonly [SfxOutlineLayerSpec, SfxOutlineLayerSpec, SfxOutlineLayerSpec],
  glyphScale: number,
  msdfPxRange: number,
): readonly [SfxOutlineLayerDescriptor, SfxOutlineLayerDescriptor, SfxOutlineLayerDescriptor] {
  const safeRange = Math.max(2, msdfPxRange);
  let cumulative = 0;
  const descriptors: SfxOutlineLayerDescriptor[] = [];

  for (let i = 0; i < 3; i += 1) {
    const spec = specs[i];
    const scaledWidth = Math.max(0.25, spec.widthPx * glyphScale);
    cumulative += scaledWidth;
    // MSDF median(r,g,b)에서 0.5가 글리프 경계이며, 외곽 확장은 임계값을 0.5 아래로 낮춘다.
    const msdfDistanceThreshold = clampRange(0.5 - cumulative / (safeRange * 2.4), 0.04, 0.495);
    descriptors.push({
      layerIndex: i as 0 | 1 | 2,
      role: spec.role,
      strokeWidthPx: scaledWidth,
      cumulativeExpandPx: cumulative,
      msdfDistanceThreshold,
      msdfSmoothingPx: 0.75 / Math.max(0.5, glyphScale),
      colorRgba: spec.colorRgba,
      offsetX: (spec.offsetX ?? 0) * glyphScale,
      offsetY: (spec.offsetY ?? 0) * glyphScale,
      miterLimit: spec.miterLimit ?? 3.5,
    });
  }

  return [descriptors[0], descriptors[1], descriptors[2]];
}

/**
 * 가변 폰트 축 보간 + 호길이 곡선 배치 + 3겹 MSDF 외곽선 SFX 레이아웃 계산.
 */
export function layoutCurvedVariableSfx(input: CurvedVariableSfxInput): CurvedVariableSfxLayout {
  const chars = Array.from(input.text);
  const lut = buildCurveArcLengthLut(input.curve, 64);
  const totalArcLengthPx = lut[lut.length - 1];
  const baseFontSize = Math.max(8, input.baseFontSizePx);
  const trackingPx = input.trackingPx ?? 2;
  const msdfPxRange = Math.max(2, input.msdfPxRange ?? 8);
  const fillRgba: RgbaTuple = input.fillRgba ?? [1, 0.92, 0.24, 1];
  const outlineSpecs = input.outlines ?? DEFAULT_TRIPLE_OUTLINES;
  const easing = input.axes.easing ?? "linear";
  const jitterAmp = Math.max(0, input.impactJitterPx ?? 0);
  const seed = input.seed ?? 2026;

  const glyphInfos = chars.map((ch, idx) => {
    const progress = chars.length > 1 ? idx / (chars.length - 1) : 0.5;
    const eased = applyAxisEasing(progress, easing);
    const scale =
      (input.axes.scaleStart ?? 1) +
      ((input.axes.scaleEnd ?? 1) - (input.axes.scaleStart ?? 1)) * eased;
    const clampedScale = clampRange(scale, 0.35, 3.5);
    const fontWeight = Math.round(
      clampRange(
        input.axes.weightStart + (input.axes.weightEnd - input.axes.weightStart) * eased,
        100,
        900,
      ),
    );
    const fontSlantDeg = clampRange(
      input.axes.slantStartDeg + (input.axes.slantEndDeg - input.axes.slantStartDeg) * eased,
      -25,
      25,
    );
    const fontWidthPct = clampRange(
      (input.axes.widthStartPct ?? 100) +
        ((input.axes.widthEndPct ?? 100) - (input.axes.widthStartPct ?? 100)) * eased,
      50,
      200,
    );
    const charMeta = estimateCharAdvanceRatio(ch);
    const advancePx =
      baseFontSize * clampedScale * charMeta.ratio * (fontWidthPct / 100) + trackingPx;
    return {
      ch,
      idx,
      progress,
      scale: clampedScale,
      fontWeight,
      fontSlantDeg,
      fontWidthPct,
      advancePx,
      isHangul: charMeta.isHangul,
      isPunct: charMeta.isPunct,
    };
  });

  let totalRunPx = 0;
  for (let i = 0; i < glyphInfos.length; i += 1) {
    totalRunPx += glyphInfos[i].advancePx;
  }

  const fitCompression =
    totalRunPx > totalArcLengthPx && totalArcLengthPx > 1
      ? totalArcLengthPx / totalRunPx
      : 1;
  const startOffsetPx = Math.max(0, (totalArcLengthPx - totalRunPx * fitCompression) * 0.5);

  const glyphs: PlacedSfxGlyph[] = [];
  let cursorDist = startOffsetPx;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < glyphInfos.length; i += 1) {
    const info = glyphInfos[i];
    const scaledAdvance = info.advancePx * fitCompression;
    const centerDist = cursorDist + scaledAdvance * 0.5;
    cursorDist += scaledAdvance;

    const curveT = lookupCurveTByArcLength(lut, centerDist);
    const pos = evaluateSfxCurvePoint(input.curve, curveT);
    const tangent = evaluateSfxCurveTangent(input.curve, curveT);
    const tangentAngleRad = Math.atan2(tangent.y, tangent.x);

    const normalX = -tangent.y;
    const normalY = tangent.x;
    const jitterSigned = jitterAmp > 0 ? (hash2dUnit(i, 7, seed) * 2 - 1) * jitterAmp : 0;
    const gx = pos.x + normalX * jitterSigned;
    const gy = pos.y + normalY * jitterSigned;

    const fontSizePx = baseFontSize * info.scale;
    const outlines = buildTripleInkOutlines(outlineSpecs, info.scale, msdfPxRange);
    const pad = fontSizePx * 0.6 + outlines[2].cumulativeExpandPx;

    minX = Math.min(minX, gx - pad);
    minY = Math.min(minY, gy - pad);
    maxX = Math.max(maxX, gx + pad);
    maxY = Math.max(maxY, gy + pad);

    glyphs.push({
      char: info.ch,
      glyphIndex: info.idx,
      isHangul: info.isHangul,
      isPunctuation: info.isPunct,
      normalizedProgress: info.progress,
      curveT,
      arcLengthPx: centerDist,
      x: gx,
      y: gy,
      tangentAngleRad,
      rotationRad: tangentAngleRad + (info.fontSlantDeg * Math.PI) / 180 * 0.15,
      fontSizePx,
      advancePx: scaledAdvance,
      fontWeight: info.fontWeight,
      fontSlantDeg: info.fontSlantDeg,
      fontWidthPct: info.fontWidthPct,
      scale: info.scale,
      msdfPxRange,
      msdfCoreThreshold: 0.5,
      fillRgba,
      outlines,
    });
  }

  if (glyphs.length === 0) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    text: input.text,
    fontFamily: input.fontFamily ?? "Noto Sans KR Variable",
    curveKind: input.curve.kind,
    totalArcLengthPx,
    glyphs,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    },
    msdfAtlasPxRange: msdfPxRange,
    tripleOutlineStackOrder: ["outer-impact", "mid-knockout", "inner-core"],
  };
}
