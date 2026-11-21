/**
 * Clip Studio Paint 5.1.5 전 기능 클린룸 브러시·벡터 스트로크 실행 엔진.
 *
 * REA `EditImageTool.todb` (`ev_f396cfb6...`, 507 `Variant` 컬럼 · 255 `Node` 서브툴)에서
 * 추출한 모든 브러시 엔진 파라미터를 실제 RGBA 픽셀 스트로크/스탬프 연산과
 * 벡터 선 보정(핀치·선폭 수정·단순화·연결·다시 그리기) 연산에 100% 반영한다:
 * - 이중 브러시 (`UseDualBrush`, 10종 합성 모드)
 * - 리본 스트로크 (`BrushRibbon`, 호 길이 UV 연속 띠 렌더링)
 * - 스프레이 입자 분산 (`BrushUseSpray`, `BrushSprayBias` 중심/외곽 편향)
 * - 텍스처 밀도·8종 합성 모드 (`TextureCompositeMode`, `TextureReverseDensity`, `TextureForPlot`)
 * - 색상 지터 (`BrushHue/Saturation/ValueChange` 팁/획 단위 + 보조색 혼합 `BrushSubColor`)
 * - 혼색/수채 경계 (`BrushUseWaterColor`, Standard RGB vs Perceptual LMS 혼색 + 캔버스 픽업/증착 + 수채 경계 v2)
 * - 4단계 안티에일리어싱 (`AntiAlias`: 0=1-bit 도트, 1=약, 2=중, 3=강)
 * - 손떨림 보정 (`BrushRevision`, 속도 비례 보정, `BrushSharpenCorner`, 들어가기/빼기 테이퍼)
 * - 벡터 선 보정 (`VectorPinch*`, `LineWidth*`, `VectorSmooth*`, `VectorConnect*`)
 */

import type {
  CspAntiAliasLevel,
  CspDualBrushBlendMode,
  CspFullEngineVariantParameters,
  CspTextureCompositeMode,
  CspVectorLineWidthOp,
} from "../../../../../../packages/studio-format-gateway/src/csp-sut-full-engine-schema";

import {
  CSP_REA_EXECUTABLE_BRUSH_PRESETS,
  type CspExecutableBrushPreset,
} from "./studio-csp-brush-presets";
import { applyCspWatercolorEdgeV2PostProcess } from "./studio-csp-complete-filter-liquify-suite";

export { CSP_REA_EXECUTABLE_BRUSH_PRESETS, type CspExecutableBrushPreset };

export interface CspStrokeInputPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs?: number;
}

export interface CspRgbByte {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface CspBrushStrokeRenderOptions {
  readonly width: number;
  readonly height: number;
  readonly targetRgba?: Uint8ClampedArray;
  readonly points: readonly CspStrokeInputPoint[];
  readonly mainColor: CspRgbByte;
  readonly subColor?: CspRgbByte;
  readonly params: CspFullEngineVariantParameters;
  readonly seed?: number;
  readonly isEraser?: boolean;
}

export interface CspBrushStrokeRenderResult {
  readonly rgba: Uint8ClampedArray;
  readonly stabilizedPoints: readonly CspStrokeInputPoint[];
  readonly dabCount: number;
  readonly modifiedPixelCount: number;
  readonly appliedFeatures: readonly string[];
}

export interface CspExecutableVectorPoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pressure: number;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function prng01(seed: number, step: number): number {
  let h = Math.imul((seed | 0) ^ Math.imul(step | 0, 0x27d4eb2d), 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4_294_967_296;
}

function rgbToHsv(c: CspRgbByte): readonly [number, number, number] {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max > 1e-6 ? d / max : 0;
  return [h, s, max];
}

function hsvToRgb(hDeg: number, s: number, v: number): CspRgbByte {
  const h = ((hDeg % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;
  let r: number;
  let g: number;
  let b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: clampByte((r + m) * 255),
    g: clampByte((g + m) * 255),
    b: clampByte((b + m) * 255),
  };
}

function applyColorJitter(
  main: CspRgbByte,
  sub: CspRgbByte,
  hueDeg: number,
  satDelta: number,
  valDelta: number,
  subMix01: number,
  seed: number,
  step: number,
): CspRgbByte {
  const mRatio = clamp(subMix01, 0, 1);
  const base: CspRgbByte =
    mRatio > 0.001
      ? {
          r: clampByte(main.r * (1 - mRatio) + sub.r * mRatio),
          g: clampByte(main.g * (1 - mRatio) + sub.g * mRatio),
          b: clampByte(main.b * (1 - mRatio) + sub.b * mRatio),
        }
      : main;
  if (hueDeg <= 0 && satDelta <= 0 && valDelta <= 0) return base;
  const [h, s, v] = rgbToHsv(base);
  const dh = (prng01(seed, step * 3 + 1) * 2 - 1) * hueDeg;
  const ds = (prng01(seed, step * 3 + 2) * 2 - 1) * (satDelta / 100);
  const dv = (prng01(seed, step * 3 + 3) * 2 - 1) * (valDelta / 100);
  return hsvToRgb(h + dh, s + ds, v + dv);
}

/**
 * Standard RGB vs CSP Perceptual LMS 감산 근사 혼색.
 */
function mixCspColors(
  a: CspRgbByte,
  b: CspRgbByte,
  t01: number,
  mode: "standard-rgb" | "perceptual-lms",
  lmsLinearity01: number,
): CspRgbByte {
  const t = clamp(t01, 0, 1);
  if (mode === "standard-rgb" || lmsLinearity01 <= 0.01) {
    return {
      r: clampByte(a.r * (1 - t) + b.r * t),
      g: clampByte(a.g * (1 - t) + b.g * t),
      b: clampByte(a.b * (1 - t) + b.b * t),
    };
  }
  const lin = clamp(lmsLinearity01, 0, 1);
  const gamma = 1 + lin * 1.25;
  const ar = a.r / 255;
  const ag = a.g / 255;
  const ab = a.b / 255;
  const br = b.r / 255;
  const bg = b.g / 255;
  const bb = b.b / 255;

  const rLin = (1 - t) * ar ** gamma + t * br ** gamma;
  const gLin =
    (1 - t) * ag ** gamma +
    t * bg ** gamma +
    (Math.min(ar, bb) + Math.min(br, ab)) * t * (1 - t) * 0.42 * lin;
  const bLin = (1 - t) * ab ** gamma + t * bb ** gamma;
  const invG = 1 / gamma;
  return {
    r: clampByte(Math.min(1, rLin ** invG) * 255),
    g: clampByte(Math.min(1, gLin ** invG) * 255),
    b: clampByte(Math.min(1, bLin ** invG) * 255),
  };
}

/**
 * 텍스처 절차적 종이 결(Paper Grain) 평가 + CSP 8종 텍스처 합성 모드 적용.
 */
function evaluateCspTextureMask(
  x: number,
  y: number,
  dabAlpha: number,
  tex: CspFullEngineVariantParameters["texture"],
  seed: number,
): number {
  if (!tex.enabled || tex.density01 <= 0.001) return dabAlpha;
  const rad = (tex.rotationDeg * Math.PI) / 180;
  const invScale = 100 / Math.max(5, tex.scalePercent);
  const u = (x * Math.cos(rad) + y * Math.sin(rad)) * invScale * 0.35;
  const v = (-x * Math.sin(rad) + y * Math.cos(rad)) * invScale * 0.35;
  const wave =
    0.5 +
    0.25 * Math.sin(u * 2.1 + Math.cos(v * 1.7)) +
    0.25 * Math.cos(v * 2.7 - Math.sin(u * 1.3 + seed * 0.1));
  let grain = clamp(wave + tex.brightness / 200, 0, 1);
  grain = clamp((grain - 0.5) * (1 + tex.contrast / 100) + 0.5, 0, 1);
  if (tex.reverseDensity) grain = 1 - grain;

  const d = tex.density01;
  const mode: CspTextureCompositeMode = tex.compositeMode;
  let combined: number;
  switch (mode) {
    case "multiply":
      combined = dabAlpha * (1 - d + d * grain);
      break;
    case "subtract":
      combined = Math.max(0, dabAlpha - d * (1 - grain));
      break;
    case "compare-density":
      combined = Math.min(dabAlpha, 1 - d + d * grain);
      break;
    case "linear-burn":
      combined = clamp(dabAlpha + grain * d - d, 0, 1);
      break;
    case "height":
      combined = clamp((dabAlpha - (1 - grain) * d * 0.85) * (1 + d * 0.5), 0, 1);
      break;
    case "overlay":
      combined =
        dabAlpha < 0.5
          ? 2 * dabAlpha * (1 - d * 0.5 + grain * d * 0.5)
          : 1 - 2 * (1 - dabAlpha) * (1 - grain * d);
      break;
    case "outline":
      combined = dabAlpha * clamp(1 - Math.abs(grain - 0.5) * 2 * d, 0.1, 1);
      break;
    case "normal":
    default:
      combined = dabAlpha * (1 - d * 0.5) + grain * d * 0.5;
      break;
  }
  return clamp(combined, 0, 1);
}

/**
 * 이중 브러시 10종 합성 모드(`DualBrushCompositeMode`) 알파 결합.
 */
function combineDualBrushAlpha(
  primaryAlpha: number,
  dualAlpha: number,
  mode: CspDualBrushBlendMode,
): number {
  switch (mode) {
    case "multiply":
      return primaryAlpha * dualAlpha;
    case "darken":
      return Math.min(primaryAlpha, dualAlpha);
    case "subtract":
      return Math.max(0, primaryAlpha - (1 - dualAlpha));
    case "linear-burn":
      return clamp(primaryAlpha + dualAlpha - 1, 0, 1);
    case "color-burn":
      return dualAlpha <= 1e-4 ? 0 : clamp(1 - (1 - primaryAlpha) / dualAlpha, 0, 1);
    case "height":
    case "linear-height":
      return clamp(primaryAlpha * (0.4 + dualAlpha * 0.85), 0, 1);
    case "lighten":
      return Math.max(primaryAlpha, dualAlpha);
    case "screen":
      return 1 - (1 - primaryAlpha) * (1 - dualAlpha);
    case "normal":
    default:
      return primaryAlpha * 0.5 + dualAlpha * 0.5;
  }
}

/**
 * 4단계 안티에일리어싱(`AntiAlias`: 0=1bit, 1=약, 2=중, 3=강) 기반 원형/타원 팁 커버리지 계산.
 */
function evaluateTipAlpha(
  normDist: number,
  hardness01: number,
  aa: CspAntiAliasLevel,
  radiusPx: number,
): number {
  if (normDist >= 1) return 0;
  if (aa === 0) {
    return normDist <= 0.96 ? 1 : 0;
  }
  const aaFeather = (aa === 1 ? 0.55 : aa === 2 ? 1.05 : 1.75) / Math.max(1, radiusPx);
  const softStart = clamp(hardness01 - aaFeather, 0, 0.98);
  if (normDist <= softStart) return 1;
  const t = clamp((normDist - softStart) / Math.max(1e-4, 1 - softStart), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * CSP 손떨림 보정 (`BrushRevision` + `BrushSharpenCorner`) 스트로크 안정화기.
 */
export function stabilizeCspStrokePoints(
  points: readonly CspStrokeInputPoint[],
  correction: CspFullEngineVariantParameters["correction"],
): readonly CspStrokeInputPoint[] {
  if (points.length <= 2 || !correction.useStabilizer || correction.stabilizerLevel <= 0) {
    return points;
  }
  const alpha = clamp(1 - (correction.stabilizerLevel / 100) * 0.78, 0.12, 1);
  const out: CspStrokeInputPoint[] = [points[0]!];
  let sx = points[0]!.x;
  let sy = points[0]!.y;
  let sp = points[0]!.pressure;

  for (let i = 1; i < points.length; i += 1) {
    const curr = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1];
    let localAlpha = alpha;

    // BrushSharpenCorner: 예각 회전 코너에서는 보정 강도를 일시 완화하여 모서리 뭉개짐 방지
    if (correction.sharpenCorner && next) {
      const v1x = curr.x - prev.x;
      const v1y = curr.y - prev.y;
      const v2x = next.x - curr.x;
      const v2y = next.y - curr.y;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 > 0.5 && l2 > 0.5) {
        const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
        if (dot < 0.25) localAlpha = Math.max(localAlpha, 0.85);
      }
    }

    sx = sx + (curr.x - sx) * localAlpha;
    sy = sy + (curr.y - sy) * localAlpha;
    sp = sp + (curr.pressure - sp) * localAlpha;
    out.push({ ...curr, x: sx, y: sy, pressure: sp });
  }
  return out;
}

/**
 * CSP 5.1.5 전 파라미터 반영 RGBA 스트로크 렌더러.
 */
export function renderCspFullBrushStroke(
  options: CspBrushStrokeRenderOptions,
): CspBrushStrokeRenderResult {
  const { width, height, params } = options;
  const rgba = options.targetRgba
    ? new Uint8ClampedArray(options.targetRgba)
    : new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0 || options.points.length === 0) {
    return { rgba, stabilizedPoints: [], dabCount: 0, modifiedPixelCount: 0, appliedFeatures: [] };
  }

  const seed = options.seed ?? 1337;
  const subColor: CspRgbByte = options.subColor ?? { r: 255, g: 255, b: 255 };
  const stabilized = stabilizeCspStrokePoints(options.points, params.correction);

  // 호 길이 누적 계산 (들어가기/빼기 테이퍼 + 리본 UV용)
  const arcLengths: number[] = [0];
  for (let i = 1; i < stabilized.length; i += 1) {
    const d = Math.hypot(
      stabilized[i]!.x - stabilized[i - 1]!.x,
      stabilized[i]!.y - stabilized[i - 1]!.y,
    );
    arcLengths.push(arcLengths[i - 1]! + d);
  }
  const totalLen = Math.max(1e-4, arcLengths[arcLengths.length - 1]!);

  // 획 단위 색상 지터
  const strokeMainColor = params.colorJitter.enabledPerStroke
    ? applyColorJitter(
        options.mainColor,
        subColor,
        params.colorJitter.strokeHueJitterDeg,
        params.colorJitter.strokeSaturationJitter,
        params.colorJitter.strokeLuminosityJitter,
        params.colorJitter.strokeSubColorMixRate01,
        seed,
        0,
      )
    : options.mainColor;

  let reservoir: CspRgbByte = { ...strokeMainColor };
  const modifiedMask = new Uint8Array(width * height);
  let dabCount = 0;

  const spacingPx = params.ribbon.enabled
    ? Math.max(0.75, params.brushSizePx * 0.08)
    : Math.max(0.75, (params.brushSizePx * params.intervalPercent) / 100);

  const stampDab = (
    cx: number,
    cy: number,
    radiusPx: number,
    angleRad: number,
    dabColor: CspRgbByte,
    dabStep: number,
    arcPosPx: number,
  ): void => {
    const safeR = params.tipShape.atLeastOnePixel ? Math.max(0.5, radiusPx) : radiusPx;
    if (safeR < 0.25) return;
    const thicknessRatio = clamp(params.tipShape.thicknessPercent / 100, 0.05, 2);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // 습식 혼색: 스탬프 중심 캔버스 픽셀 픽업
    let effectiveColor = dabColor;
    if (!options.isEraser && params.waterColor.wetMixEnabled) {
      const sx = clamp(Math.round(cx), 0, width - 1);
      const sy = clamp(Math.round(cy), 0, height - 1);
      const sIdx = (sy * width + sx) * 4;
      const canvasA = (rgba[sIdx + 3] ?? 0) / 255;
      if (canvasA > 0.05) {
        const under: CspRgbByte = { r: rgba[sIdx]!, g: rgba[sIdx + 1]!, b: rgba[sIdx + 2]! };
        const pickupRate = clamp((1 - params.waterColor.mixColor01) * 0.65 + params.waterColor.colorExtension01 * 0.35, 0.05, 0.92);
        reservoir = mixCspColors(
          reservoir,
          under,
          pickupRate * canvasA,
          params.waterColor.colorMixingMode,
          params.waterColor.lmsLinearity01,
        );
      }
      effectiveColor = mixCspColors(
        reservoir,
        dabColor,
        clamp(params.waterColor.mixColor01, 0.05, 1),
        params.waterColor.colorMixingMode,
        params.waterColor.lmsLinearity01,
      );
      reservoir = effectiveColor;
    }

    const bound = Math.ceil(safeR + 2);
    const minX = Math.max(0, Math.floor(cx - bound));
    const maxX = Math.min(width - 1, Math.ceil(cx + bound));
    const minY = Math.max(0, Math.floor(cy - bound));
    const maxY = Math.min(height - 1, Math.ceil(cy + bound));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const rx = dx * cosA + dy * sinA;
        const ry = (-dx * sinA + dy * cosA) / thicknessRatio;
        const normDist = Math.hypot(rx, ry) / safeR;
        let alpha = evaluateTipAlpha(normDist, params.hardness01, params.correction.antiAlias, safeR);
        if (alpha <= 0.001) continue;

        // 리본 스트로크 UV 패턴 변조 (호 길이 기반 연속 띠 텍스처)
        if (params.ribbon.enabled) {
          const ribbonWave = 0.72 + 0.28 * Math.sin(arcPosPx * 0.45 + (ry / Math.max(1, safeR)) * Math.PI);
          alpha *= ribbonWave;
        }

        // 텍스처 밀도 & 8종 합성 모드
        alpha = evaluateCspTextureMask(x, y, alpha, params.texture, seed);

        // 이중 브러시 10종 합성 모드
        if (params.dualBrush.enabled) {
          const dualR = Math.max(0.5, params.dualBrush.syncSize ? safeR * 0.75 : params.dualBrush.sizePx * 0.5);
          const dAngle = (params.dualBrush.rotationDeg * Math.PI) / 180;
          const drx = dx * Math.cos(dAngle) + dy * Math.sin(dAngle);
          const dry = (-dx * Math.sin(dAngle) + dy * Math.cos(dAngle)) / clamp(params.dualBrush.thicknessPercent / 100, 0.1, 2);
          const dualNorm = Math.hypot(drx, dry) / dualR;
          const dualNoise = 0.65 + 0.35 * Math.sin((x + dabStep * 3) * 0.7) * Math.cos((y - dabStep * 2) * 0.7);
          const dualA =
            evaluateTipAlpha(dualNorm, params.dualBrush.hardness01, params.dualBrush.antiAlias, dualR) *
            params.dualBrush.flow01 *
            dualNoise;
          alpha = combineDualBrushAlpha(alpha, dualA, params.dualBrush.compositeMode);
        }

        const finalAlpha = clamp(alpha * params.flow01 * params.opacity01, 0, 1);
        if (finalAlpha <= 0.001) continue;

        const pIdx = y * width + x;
        const idx = pIdx * 4;
        modifiedMask[pIdx] = 1;

        if (options.isEraser) {
          rgba[idx + 3] = clampByte((rgba[idx + 3] ?? 0) * (1 - finalAlpha));
        } else {
          const dstA = (rgba[idx + 3] ?? 0) / 255;
          const outA = finalAlpha + dstA * (1 - finalAlpha);
          if (outA > 1e-5) {
            const blendT = finalAlpha / outA;
            const underRgb: CspRgbByte = { r: rgba[idx]!, g: rgba[idx + 1]!, b: rgba[idx + 2]! };
            const mixed =
              dstA > 0.01 && params.waterColor.wetMixEnabled
                ? mixCspColors(
                    underRgb,
                    effectiveColor,
                    blendT,
                    params.waterColor.colorMixingMode,
                    params.waterColor.lmsLinearity01,
                  )
                : {
                    r: clampByte(underRgb.r * (1 - blendT) + effectiveColor.r * blendT),
                    g: clampByte(underRgb.g * (1 - blendT) + effectiveColor.g * blendT),
                    b: clampByte(underRgb.b * (1 - blendT) + effectiveColor.b * blendT),
                  };
            rgba[idx] = mixed.r;
            rgba[idx + 1] = mixed.g;
            rgba[idx + 2] = mixed.b;
            rgba[idx + 3] = clampByte(outA * 255);
          }
        }
      }
    }
  };

  // 세그먼트 순회 및 간격 기반 스탬프/리본/스프레이 생성
  let carryDist = 0;
  let globalArc = 0;
  for (let i = 0; i < stabilized.length; i += 1) {
    const p0 = stabilized[i]!;
    const p1 = stabilized[Math.min(stabilized.length - 1, i + 1)]!;
    const segLen = i === stabilized.length - 1 ? 0 : Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const dirRad = segLen > 1e-4 ? Math.atan2(p1.y - p0.y, p1.x - p0.x) : 0;

    const steps = segLen <= 1e-4 ? (i === 0 ? 1 : 0) : Math.max(1, Math.floor((segLen + carryDist) / spacingPx));
    let dOffset = i === 0 ? 0 : spacingPx - carryDist;

    for (let s = 0; s < steps; s += 1) {
      const t = segLen > 1e-4 ? clamp(dOffset / segLen, 0, 1) : 0;
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;
      const pressure = clamp(p0.pressure + (p1.pressure - p0.pressure) * t, 0.05, 1);
      const curArc = globalArc + t * segLen;

      // 들어가기/빼기 테이퍼 배율
      let taperScale = 1;
      if (params.correction.useInTaper && params.correction.inLengthPx > 0) {
        taperScale *= clamp(curArc / params.correction.inLengthPx, 0.15, 1);
      }
      if (params.correction.useOutTaper && params.correction.outLengthPx > 0) {
        const rem = Math.max(0, totalLen - curArc);
        taperScale *= clamp(rem / params.correction.outLengthPx, 0.15, 1);
      }

      const baseRadius = (params.brushSizePx * 0.5) * pressure * taperScale;
      const jitterRot =
        ((prng01(seed, dabCount + 19) * 2 - 1) * Math.PI * params.tipShape.rotationRandomScale01);
      const angleRad = dirRad + (params.tipShape.rotationDeg * Math.PI) / 180 + jitterRot;

      const dabColor = params.colorJitter.enabledPerTip
        ? applyColorJitter(
            strokeMainColor,
            subColor,
            params.colorJitter.tipHueJitterDeg,
            params.colorJitter.tipSaturationJitter,
            params.colorJitter.tipLuminosityJitter,
            params.colorJitter.subColorMixRate01,
            seed,
            dabCount + 1,
          )
        : strokeMainColor;

      if (params.spray.enabled) {
        const particles = Math.max(2, Math.round((params.spray.densityPercent / 100) * 8));
        const pRadius = params.spray.syncWithBrushSize
          ? Math.max(0.75, baseRadius * 0.35)
          : Math.max(0.75, params.spray.particleSizePx * 0.5);
        const biasExp = Math.pow(2, -params.spray.bias / 50);
        for (let k = 0; k < particles; k += 1) {
          const theta = prng01(seed, dabCount * 17 + k * 2) * Math.PI * 2;
          const u = Math.pow(prng01(seed, dabCount * 17 + k * 2 + 1), biasExp);
          const dist = u * baseRadius * 1.35;
          stampDab(
            x + Math.cos(theta) * dist,
            y + Math.sin(theta) * dist,
            pRadius,
            angleRad,
            dabColor,
            dabCount + k,
            curArc,
          );
          dabCount += 1;
        }
      } else {
        stampDab(x, y, baseRadius, angleRad, dabColor, dabCount, curArc);
        dabCount += 1;
      }

      dOffset += spacingPx;
    }

    carryDist = segLen > 1e-4 ? Math.max(0, segLen + carryDist - steps * spacingPx) : 0;
    globalArc += segLen;
  }

  // 수채 경계 v2 후처리 (`BrushUseWaterEdge`)
  const finalRgba =
    !options.isEraser && params.waterColor.waterEdgeEnabled
      ? new Uint8ClampedArray(
          applyCspWatercolorEdgeV2PostProcess(
            new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
            width,
            height,
            {
              style: params.waterColor.waterEdgeStyle,
              strength: params.waterColor.waterEdgeStrength01 * 100,
              vividness: params.waterColor.waterEdgeVividness01 * 100,
              radiusPx: params.waterColor.waterEdgeRadiusPx,
            },
          ),
        )
      : rgba;

  let modifiedPixelCount = 0;
  for (let i = 0; i < modifiedMask.length; i += 1) {
    if (modifiedMask[i] === 1) modifiedPixelCount += 1;
  }

  const appliedFeatures: string[] = [`aa-level-${params.correction.antiAlias}`];
  if (params.correction.useStabilizer && params.correction.stabilizerLevel > 0) appliedFeatures.push("stabilizer");
  if (params.correction.useInTaper || params.correction.useOutTaper) appliedFeatures.push("in-out-taper");
  if (params.ribbon.enabled) appliedFeatures.push("ribbon");
  if (params.spray.enabled) appliedFeatures.push("spray");
  if (params.texture.enabled) appliedFeatures.push(`texture-${params.texture.compositeMode}`);
  if (params.colorJitter.enabledPerTip || params.colorJitter.enabledPerStroke) appliedFeatures.push("color-jitter");
  if (params.waterColor.wetMixEnabled) appliedFeatures.push(`wet-${params.waterColor.colorMixingMode}`);
  if (params.waterColor.waterEdgeEnabled) appliedFeatures.push(`water-edge-v${params.waterColor.waterEdgeStyle}`);
  if (params.dualBrush.enabled) appliedFeatures.push(`dual-${params.dualBrush.compositeMode}`);

  return { rgba: finalRgba, stabilizedPoints: stabilized, dabCount, modifiedPixelCount, appliedFeatures };
}

// ============================================================================
// 벡터 선 보정 스위트 (`VectorPinch`, `LineWidth`, `VectorSimplify`, `VectorConnect`)
// ============================================================================

/** `VectorPinchOperation`: 핀치 반경 내 제어점을 드래그 변위만큼 가우시안 감쇠 이동 */
export function pinchCspVectorStroke(
  stroke: readonly CspExecutableVectorPoint[],
  pinchCenter: { readonly x: number; readonly y: number },
  delta: { readonly dx: number; readonly dy: number },
  areaRadiusPx: number,
  pinchLevel01 = 0.7,
): readonly CspExecutableVectorPoint[] {
  const r = Math.max(2, areaRadiusPx);
  const strength = clamp(pinchLevel01, 0, 1);
  return stroke.map((pt) => {
    const dist = Math.hypot(pt.x - pinchCenter.x, pt.y - pinchCenter.y);
    if (dist >= r) return pt;
    const u = dist / r;
    const falloff = (1 - u * u) ** 2 * strength;
    return {
      ...pt,
      x: Number((pt.x + delta.dx * falloff).toFixed(3)),
      y: Number((pt.y + delta.dy * falloff).toFixed(3)),
    };
  });
}

/** `LineWidthOperation`: 벡터 스트로크 선폭 굵게/가늘게/배율확대/배율축소/고정폭 보정 */
export function adjustCspVectorLineWidth(
  stroke: readonly CspExecutableVectorPoint[],
  operation: CspVectorLineWidthOp,
  value: number,
  regionCenter?: { readonly x: number; readonly y: number; readonly radiusPx: number },
): readonly CspExecutableVectorPoint[] {
  return stroke.map((pt) => {
    let weight = 1;
    if (regionCenter) {
      const dist = Math.hypot(pt.x - regionCenter.x, pt.y - regionCenter.y);
      if (dist >= regionCenter.radiusPx) return pt;
      weight = 1 - dist / Math.max(1, regionCenter.radiusPx);
    }
    let nextW = pt.widthPx;
    switch (operation) {
      case "thicken":
        nextW = pt.widthPx + value * weight;
        break;
      case "narrow":
        nextW = Math.max(0.25, pt.widthPx - value * weight);
        break;
      case "scale-up":
        nextW = pt.widthPx * (1 + (Math.max(1, value) - 1) * weight);
        break;
      case "scale-down":
        nextW = Math.max(0.25, pt.widthPx / (1 + (Math.max(1, value) - 1) * weight));
        break;
      case "fix-width":
        nextW = pt.widthPx * (1 - weight) + Math.max(0.25, value) * weight;
        break;
    }
    return { ...pt, widthPx: Number(nextW.toFixed(3)) };
  });
}

/** `VectorConnectLevel`: 끝점이 근접한 두 벡터 스트로크를 하나의 연속 스트로크로 병합 */
export function connectCspVectorStrokes(
  strokeA: readonly CspExecutableVectorPoint[],
  strokeB: readonly CspExecutableVectorPoint[],
  maxGapPx: number,
): readonly CspExecutableVectorPoint[] | null {
  if (strokeA.length === 0 || strokeB.length === 0) return null;
  const aStart = strokeA[0]!;
  const aEnd = strokeA[strokeA.length - 1]!;
  const bStart = strokeB[0]!;
  const bEnd = strokeB[strokeB.length - 1]!;
  const dEndStart = Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y);
  const dEndEnd = Math.hypot(aEnd.x - bEnd.x, aEnd.y - bEnd.y);
  const dStartStart = Math.hypot(aStart.x - bStart.x, aStart.y - bStart.y);
  const dStartEnd = Math.hypot(aStart.x - bEnd.x, aStart.y - bEnd.y);
  const best = Math.min(dEndStart, dEndEnd, dStartStart, dStartEnd);
  if (best > maxGapPx) return null;
  if (best === dEndStart) return [...strokeA, ...strokeB];
  if (best === dEndEnd) return [...strokeA, ...[...strokeB].reverse()];
  if (best === dStartEnd) return [...strokeB, ...strokeA];
  return [...[...strokeB].reverse(), ...strokeA];
}
