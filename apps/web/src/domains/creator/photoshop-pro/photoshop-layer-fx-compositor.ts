/**
 * Adobe Photoshop 10종 비파괴 레이어 스타일(Drop Shadow, Inner Shadow, Outer Glow,
 * Inner Glow, Bevel & Emboss, Satin, Color Overlay, Gradient Overlay, Pattern Overlay,
 * Stroke) 실제 RGBA 픽셀 합성기 및 Blend-If(휘도·채널 조건부 페더 알파 블렌딩) 엔진.
 */

import {
  blurFloatFieldSeparable,
  clamp01,
  clampByte,
  computeDistanceField,
  hslDegToRgb01,
  luminance255,
  rgb01ToHslDeg,
} from "./photoshop-pixel-math";

import type { RgbaImageBuffer, RgbColor } from "./photoshop-pixel-math";

export type { RgbaImageBuffer, RgbColor };

export type LayerFxBlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "soft-light" | "hard-light"
  | "linear-dodge" | "linear-burn" | "difference" | "exclusion" | "hue" | "color";

export interface DropShadowFx {
  readonly enabled: boolean; readonly color: RgbColor; readonly opacity: number;
  readonly angleDeg: number; readonly distancePx: number; readonly spreadPct: number;
  readonly sizePx: number; readonly blendMode: LayerFxBlendMode; readonly useGlobalLight: boolean;
}

export interface InnerShadowFx {
  readonly enabled: boolean; readonly color: RgbColor; readonly opacity: number;
  readonly angleDeg: number; readonly distancePx: number; readonly chokePct: number;
  readonly sizePx: number; readonly blendMode: LayerFxBlendMode; readonly useGlobalLight: boolean;
}

export interface OuterGlowFx {
  readonly enabled: boolean; readonly color: RgbColor; readonly opacity: number;
  readonly spreadPct: number; readonly sizePx: number; readonly blendMode: LayerFxBlendMode;
}

export interface InnerGlowFx {
  readonly enabled: boolean; readonly color: RgbColor; readonly opacity: number;
  readonly chokePct: number; readonly sizePx: number; readonly source: "edge" | "center";
  readonly blendMode: LayerFxBlendMode;
}

export type BevelEmbossStyle = "inner-bevel" | "outer-bevel" | "emboss" | "pillow-emboss";

export interface BevelEmbossFx {
  readonly enabled: boolean; readonly style: BevelEmbossStyle; readonly direction: "up" | "down";
  readonly depthPct: number; readonly sizePx: number; readonly softenPx: number;
  readonly angleDeg: number; readonly altitudeDeg: number; readonly useGlobalLight: boolean;
  readonly highlightColor: RgbColor; readonly highlightOpacity: number; readonly highlightBlendMode: LayerFxBlendMode;
  readonly shadowColor: RgbColor; readonly shadowOpacity: number; readonly shadowBlendMode: LayerFxBlendMode;
}

export interface SatinFx {
  readonly enabled: boolean; readonly color: RgbColor; readonly opacity: number;
  readonly angleDeg: number; readonly distancePx: number; readonly sizePx: number;
  readonly invert: boolean; readonly blendMode: LayerFxBlendMode;
}

export interface ColorOverlayFx {
  readonly enabled: boolean; readonly color: RgbColor; readonly opacity: number;
  readonly blendMode: LayerFxBlendMode;
}

export interface GradientOverlayStop { readonly pos: number; readonly color: RgbColor; }

export interface GradientOverlayFx {
  readonly enabled: boolean; readonly style: "linear" | "radial" | "angle" | "reflected";
  readonly angleDeg: number; readonly scalePct: number; readonly reverse: boolean;
  readonly opacity: number; readonly blendMode: LayerFxBlendMode;
  readonly stops: readonly GradientOverlayStop[];
}

export type ProceduralPatternKind = "dots" | "stripes" | "crosshatch" | "linen" | "checker" | "halftone";

export interface PatternOverlayFx {
  readonly enabled: boolean; readonly pattern: ProceduralPatternKind; readonly scalePct: number;
  readonly offsetX: number; readonly offsetY: number; readonly opacity: number;
  readonly blendMode: LayerFxBlendMode;
}

export interface StrokeFx {
  readonly enabled: boolean; readonly position: "outside" | "inside" | "center";
  readonly sizePx: number; readonly color: RgbColor; readonly opacity: number;
  readonly blendMode: LayerFxBlendMode;
}

export interface BlendIfRange {
  readonly blackMin: number; readonly blackMax: number;
  readonly whiteMin: number; readonly whiteMax: number;
}

export interface BlendIfSettings {
  readonly enabled: boolean;
  readonly thisGray?: BlendIfRange; readonly thisRed?: BlendIfRange;
  readonly thisGreen?: BlendIfRange; readonly thisBlue?: BlendIfRange;
  readonly underlyingGray?: BlendIfRange; readonly underlyingRed?: BlendIfRange;
  readonly underlyingGreen?: BlendIfRange; readonly underlyingBlue?: BlendIfRange;
}

export interface PhotoshopLayerFxStack {
  readonly globalLightAngleDeg: number; readonly globalLightAltitudeDeg: number;
  readonly fillOpacity: number; readonly layerOpacity: number; readonly blendMode: LayerFxBlendMode;
  readonly dropShadow: DropShadowFx; readonly innerShadow: InnerShadowFx;
  readonly outerGlow: OuterGlowFx; readonly innerGlow: InnerGlowFx;
  readonly bevelEmboss: BevelEmbossFx; readonly satin: SatinFx;
  readonly colorOverlay: ColorOverlayFx; readonly gradientOverlay: GradientOverlayFx;
  readonly patternOverlay: PatternOverlayFx; readonly stroke: StrokeFx;
  readonly blendIf: BlendIfSettings;
}

export interface LayerFxPresetItem {
  readonly id: string; readonly label: string; readonly description: string;
  readonly stack: PhotoshopLayerFxStack;
}

export const PHOTOSHOP_FX_SWATCH_PALETTE: readonly {
  readonly id: string; readonly label: string; readonly color: RgbColor;
}[] = Object.freeze([
  { id: "ink", label: "깊은 먹색", color: { r: 22, g: 24, b: 34 } },
  { id: "paper", label: "순백색", color: { r: 255, g: 255, b: 255 } },
  { id: "warm-shadow", label: "따뜻한 그림자", color: { r: 62, g: 38, b: 46 } },
  { id: "sky-glow", label: "네온 하늘빛", color: { r: 72, g: 196, b: 255 } },
  { id: "sunset-gold", label: "노을 금빛", color: { r: 255, g: 196, b: 84 } },
  { id: "rose-accent", label: "로즈 포인트", color: { r: 236, g: 88, b: 132 } },
]);

export const DEFAULT_BLEND_IF_RANGE: BlendIfRange = Object.freeze({
  blackMin: 0, blackMax: 0, whiteMin: 255, whiteMax: 255,
});

function blendChannel(b: number, s: number, mode: LayerFxBlendMode): number {
  switch (mode) {
    case "multiply": return b * s;
    case "screen": return 1 - (1 - b) * (1 - s);
    case "overlay": return b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case "darken": return Math.min(b, s);
    case "lighten": return Math.max(b, s);
    case "color-dodge": return s >= 0.9999 ? 1 : Math.min(1, b / (1 - s));
    case "color-burn": return s <= 0.0001 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case "soft-light":
      return s <= 0.5
        ? b - (1 - 2 * s) * b * (1 - b)
        : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
    case "hard-light": return s < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case "linear-dodge": return Math.min(1, b + s);
    case "linear-burn": return Math.max(0, b + s - 1);
    case "difference": return Math.abs(b - s);
    case "exclusion": return b + s - 2 * b * s;
    default: return s;
  }
}

function blendRgbTriplet(
  br: number, bg: number, bb: number,
  sr: number, sg: number, sb: number,
  mode: LayerFxBlendMode,
): [number, number, number] {
  if (mode === "hue" || mode === "color") {
    const [, bs, bl] = rgb01ToHslDeg(br, bg, bb);
    const [sh, ss] = rgb01ToHslDeg(sr, sg, sb);
    return mode === "hue" ? hslDegToRgb01(sh, bs, bl) : hslDegToRgb01(sh, ss, bl);
  }
  return [blendChannel(br, sr, mode), blendChannel(bg, sg, mode), blendChannel(bb, sb, mode)];
}

function compositePixelOver(
  dst: Float32Array, idx: number,
  sr: number, sg: number, sb: number, sa: number,
  mode: LayerFxBlendMode,
): void {
  const alpha = clamp01(sa);
  if (alpha <= 1e-5) return;
  const dr = dst[idx] ?? 0, dg = dst[idx + 1] ?? 0, db = dst[idx + 2] ?? 0, da = dst[idx + 3] ?? 0;
  const outA = alpha + da * (1 - alpha);
  if (outA <= 1e-5) return;
  const [br, bg, bb] = da > 1e-5 ? blendRgbTriplet(dr, dg, db, sr, sg, sb, mode) : [sr, sg, sb];
  dst[idx] = (alpha * ((1 - da) * sr + da * br) + da * (1 - alpha) * dr) / outA;
  dst[idx + 1] = (alpha * ((1 - da) * sg + da * bg) + da * (1 - alpha) * dg) / outA;
  dst[idx + 2] = (alpha * ((1 - da) * sb + da * bb) + da * (1 - alpha) * db) / outA;
  dst[idx + 3] = outA;
}

function sampleMaskBilinear(
  mask: Float32Array, width: number, height: number, sx: number, sy: number, outsideValue: number,
): number {
  if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) return outsideValue;
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = sx - x0, fy = sy - y0;
  const v00 = mask[y0 * width + x0] ?? outsideValue;
  const v10 = mask[y0 * width + x1] ?? outsideValue;
  const v01 = mask[y1 * width + x0] ?? outsideValue;
  const v11 = mask[y1 * width + x1] ?? outsideValue;
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

function shapeSpread(value: number, spreadPct: number): number {
  const s = clamp01(spreadPct / 100);
  if (s <= 0.001) return clamp01(value);
  return clamp01(value / Math.max(0.05, 1 - s * 0.85));
}

function sampleGradientStops(stops: readonly GradientOverlayStop[], tInput: number): [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  const t = clamp01(tInput);
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const first = sorted[0]!;
  if (t <= first.pos) return [first.color.r / 255, first.color.g / 255, first.color.b / 255];
  const last = sorted[sorted.length - 1]!;
  if (t >= last.pos) return [last.color.r / 255, last.color.g / 255, last.color.b / 255];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!, b = sorted[i + 1]!;
    if (t >= a.pos && t <= b.pos) {
      const u = (t - a.pos) / Math.max(1e-5, b.pos - a.pos);
      return [
        (a.color.r + (b.color.r - a.color.r) * u) / 255,
        (a.color.g + (b.color.g - a.color.g) * u) / 255,
        (a.color.b + (b.color.b - a.color.b) * u) / 255,
      ];
    }
  }
  return [last.color.r / 255, last.color.g / 255, last.color.b / 255];
}

function samplePatternValue(
  pattern: ProceduralPatternKind, x: number, y: number, scalePct: number, offsetX: number, offsetY: number,
): number {
  const scale = Math.max(0.2, scalePct / 100);
  const px = (x + offsetX) / scale, py = (y + offsetY) / scale;
  switch (pattern) {
    case "dots": return Math.hypot(((px % 8) + 8) % 8 - 4, ((py % 8) + 8) % 8 - 4) < 2.2 ? 0.25 : 0.96;
    case "stripes": return (((Math.floor((px + py) / 4) % 2) + 2) % 2) === 0 ? 0.88 : 0.35;
    case "crosshatch": return ((((px + py) % 6) + 6) % 6 < 1.3 || (((px - py) % 6) + 6) % 6 < 1.3) ? 0.28 : 0.95;
    case "linen": return 0.65 + 0.3 * (0.5 * (0.5 + 0.5 * Math.sin(px * 1.4)) + 0.5 * (0.5 + 0.5 * Math.cos(py * 1.4)));
    case "halftone": return clamp01(Math.hypot(((px % 6) + 6) % 6 - 3, ((py % 6) + 6) % 6 - 3) / 3.2);
    default: return ((((Math.floor(px / 6) + Math.floor(py / 6)) % 2) + 2) % 2) === 0 ? 0.92 : 0.42;
  }
}

export function createDefaultLayerFxStack(): PhotoshopLayerFxStack {
  return {
    globalLightAngleDeg: 120, globalLightAltitudeDeg: 35,
    fillOpacity: 1, layerOpacity: 1, blendMode: "normal",
    dropShadow: {
      enabled: false, color: { r: 22, g: 24, b: 34 }, opacity: 0.55,
      angleDeg: 120, distancePx: 6, spreadPct: 10, sizePx: 8, blendMode: "multiply", useGlobalLight: true,
    },
    innerShadow: {
      enabled: false, color: { r: 24, g: 20, b: 30 }, opacity: 0.45,
      angleDeg: 120, distancePx: 4, chokePct: 10, sizePx: 6, blendMode: "multiply", useGlobalLight: true,
    },
    outerGlow: {
      enabled: false, color: { r: 72, g: 196, b: 255 }, opacity: 0.7, spreadPct: 15, sizePx: 10, blendMode: "screen",
    },
    innerGlow: {
      enabled: false, color: { r: 255, g: 235, b: 170 }, opacity: 0.55, chokePct: 10, sizePx: 8, source: "edge", blendMode: "screen",
    },
    bevelEmboss: {
      enabled: false, style: "inner-bevel", direction: "up", depthPct: 120, sizePx: 6, softenPx: 1,
      angleDeg: 120, altitudeDeg: 35, useGlobalLight: true,
      highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 0.65, highlightBlendMode: "screen",
      shadowColor: { r: 22, g: 24, b: 34 }, shadowOpacity: 0.55, shadowBlendMode: "multiply",
    },
    satin: {
      enabled: false, color: { r: 62, g: 38, b: 46 }, opacity: 0.35,
      angleDeg: 19, distancePx: 6, sizePx: 8, invert: true, blendMode: "multiply",
    },
    colorOverlay: { enabled: false, color: { r: 236, g: 88, b: 132 }, opacity: 0.5, blendMode: "normal" },
    gradientOverlay: {
      enabled: false, style: "linear", angleDeg: 90, scalePct: 100, reverse: false, opacity: 0.6, blendMode: "overlay",
      stops: [{ pos: 0, color: { r: 72, g: 196, b: 255 } }, { pos: 1, color: { r: 255, g: 196, b: 84 } }],
    },
    patternOverlay: { enabled: false, pattern: "dots", scalePct: 100, offsetX: 0, offsetY: 0, opacity: 0.3, blendMode: "multiply" },
    stroke: { enabled: false, position: "outside", sizePx: 3, color: { r: 22, g: 24, b: 34 }, opacity: 1, blendMode: "normal" },
    blendIf: { enabled: false, thisGray: DEFAULT_BLEND_IF_RANGE, underlyingGray: DEFAULT_BLEND_IF_RANGE },
  };
}

export function syncLayerFxGlobalLight(
  stack: PhotoshopLayerFxStack, angleDeg: number, altitudeDeg = stack.globalLightAltitudeDeg,
): PhotoshopLayerFxStack {
  const safeAngle = Number.isFinite(angleDeg) ? ((angleDeg % 360) + 360) % 360 : 120;
  const safeAlt = Number.isFinite(altitudeDeg) ? Math.max(5, Math.min(85, altitudeDeg)) : 35;
  return {
    ...stack,
    globalLightAngleDeg: safeAngle,
    globalLightAltitudeDeg: safeAlt,
    dropShadow: stack.dropShadow.useGlobalLight ? { ...stack.dropShadow, angleDeg: safeAngle } : stack.dropShadow,
    innerShadow: stack.innerShadow.useGlobalLight ? { ...stack.innerShadow, angleDeg: safeAngle } : stack.innerShadow,
    bevelEmboss: stack.bevelEmboss.useGlobalLight
      ? { ...stack.bevelEmboss, angleDeg: safeAngle, altitudeDeg: safeAlt }
      : stack.bevelEmboss,
  };
}

/** 단일 채널(0..255)의 Blend-If 조건부 페더 알파 계수(0..1)를 계산한다. */
export function evaluateBlendIfRangeFactor(value0to255: number, range?: BlendIfRange): number {
  if (!range) return 1;
  const v = Math.max(0, Math.min(255, value0to255));
  const bMin = Math.max(0, Math.min(255, range.blackMin));
  const bMax = Math.max(bMin, Math.min(255, range.blackMax));
  const wMax = Math.max(0, Math.min(255, range.whiteMax));
  const wMin = Math.max(0, Math.min(wMax, range.whiteMin));
  const lowFactor = v < bMin ? 0 : v < bMax && bMax > bMin ? (v - bMin) / (bMax - bMin) : 1;
  const highFactor = v > wMax ? 0 : v > wMin && wMax > wMin ? (wMax - v) / (wMax - wMin) : 1;
  return clamp01(lowFactor * highFactor);
}

/** 현재 레이어와 아래 레이어의 휘도·RGB 채널 Blend-If 알파 계수를 결합한다. */
export function evaluateBlendIfAlphaFactor(
  srcR: number, srcG: number, srcB: number, dstR: number, dstG: number, dstB: number, blendIf: BlendIfSettings,
): number {
  if (!blendIf.enabled) return 1;
  return (
    evaluateBlendIfRangeFactor(luminance255(srcR, srcG, srcB), blendIf.thisGray) *
    evaluateBlendIfRangeFactor(srcR, blendIf.thisRed) *
    evaluateBlendIfRangeFactor(srcG, blendIf.thisGreen) *
    evaluateBlendIfRangeFactor(srcB, blendIf.thisBlue) *
    evaluateBlendIfRangeFactor(luminance255(dstR, dstG, dstB), blendIf.underlyingGray) *
    evaluateBlendIfRangeFactor(dstR, blendIf.underlyingRed) *
    evaluateBlendIfRangeFactor(dstG, blendIf.underlyingGreen) *
    evaluateBlendIfRangeFactor(dstB, blendIf.underlyingBlue)
  );
}

/** Blend-If 조건부 알파 블렌딩 엔진으로 전경 버퍼를 배경 버퍼 위에 합성한다. */
export function compositeWithBlendIf(
  foreground: RgbaImageBuffer,
  underlying: RgbaImageBuffer,
  blendIf: BlendIfSettings,
  options?: { readonly opacity?: number; readonly blendMode?: LayerFxBlendMode },
): RgbaImageBuffer {
  const { width, height } = foreground;
  const opacity = clamp01(options?.opacity ?? 1);
  const mode = options?.blendMode ?? "normal";
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const off = p * 4;
    const sr255 = foreground.data[off] ?? 0, sg255 = foreground.data[off + 1] ?? 0, sb255 = foreground.data[off + 2] ?? 0;
    const sa01 = ((foreground.data[off + 3] ?? 0) / 255) * opacity;
    const dr255 = underlying.data[off] ?? 0, dg255 = underlying.data[off + 1] ?? 0, db255 = underlying.data[off + 2] ?? 0;
    const da01 = (underlying.data[off + 3] ?? 0) / 255;
    const effA = clamp01(sa01 * evaluateBlendIfAlphaFactor(sr255, sg255, sb255, dr255, dg255, db255, blendIf));
    const outA = effA + da01 * (1 - effA);
    if (outA <= 1e-5) continue;
    const [br, bg, bb] = da01 > 1e-5
      ? blendRgbTriplet(dr255 / 255, dg255 / 255, db255 / 255, sr255 / 255, sg255 / 255, sb255 / 255, mode)
      : [sr255 / 255, sg255 / 255, sb255 / 255];
    out[off] = clampByte(((effA * ((1 - da01) * (sr255 / 255) + da01 * br) + da01 * (1 - effA) * (dr255 / 255)) / outA) * 255);
    out[off + 1] = clampByte(((effA * ((1 - da01) * (sg255 / 255) + da01 * bg) + da01 * (1 - effA) * (dg255 / 255)) / outA) * 255);
    out[off + 2] = clampByte(((effA * ((1 - da01) * (sb255 / 255) + da01 * bb) + da01 * (1 - effA) * (db255 / 255)) / outA) * 255);
    out[off + 3] = clampByte(outA * 255);
  }
  return { width, height, data: out };
}

function mixInteriorRgb(
  interior: Float32Array, off: number, sr: number, sg: number, sb: number, factor: number, mode: LayerFxBlendMode,
): void {
  const [br, bg, bb] = blendRgbTriplet(
    interior[off] ?? 0, interior[off + 1] ?? 0, interior[off + 2] ?? 0, sr, sg, sb, mode,
  );
  interior[off] = (interior[off] ?? 0) * (1 - factor) + br * factor;
  interior[off + 1] = (interior[off + 1] ?? 0) * (1 - factor) + bg * factor;
  interior[off + 2] = (interior[off + 2] ?? 0) * (1 - factor) + bb * factor;
}

/** 10종 비파괴 포토샵 레이어 스타일 + Blend-If 조건부 합성을 실제 RGBA 버퍼에 렌더링한다. */
export function renderPhotoshopLayerFx(
  source: RgbaImageBuffer,
  rawStack: PhotoshopLayerFxStack,
  underlyingBackdrop?: RgbaImageBuffer,
): RgbaImageBuffer {
  const { width, height, data } = source;
  const total = width * height;
  const stack = syncLayerFxGlobalLight(rawStack, rawStack.globalLightAngleDeg, rawStack.globalLightAltitudeDeg);
  const alphaMask = new Float32Array(total);
  for (let i = 0; i < total; i += 1) alphaMask[i] = (data[i * 4 + 3] ?? 0) / 255;

  const canvas = new Float32Array(total * 4);
  const needDistOut = stack.stroke.enabled || (stack.bevelEmboss.enabled && stack.bevelEmboss.style !== "inner-bevel");
  const needDistIn = stack.stroke.enabled || stack.bevelEmboss.enabled || (stack.innerGlow.enabled && stack.innerGlow.source === "center");
  const distOut = needDistOut ? computeDistanceField(alphaMask, width, height, true) : null;
  const distIn = needDistIn ? computeDistanceField(alphaMask, width, height, false) : null;

  // 1. Drop Shadow
  if (stack.dropShadow.enabled && stack.dropShadow.opacity > 0) {
    const rad = (stack.dropShadow.angleDeg * Math.PI) / 180;
    const dx = -Math.cos(rad) * stack.dropShadow.distancePx, dy = Math.sin(rad) * stack.dropShadow.distancePx;
    const shifted = new Float32Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) shifted[y * width + x] = sampleMaskBilinear(alphaMask, width, height, x - dx, y - dy, 0);
    }
    const blurred = blurFloatFieldSeparable(shifted, width, height, stack.dropShadow.sizePx);
    const { r, g, b } = stack.dropShadow.color;
    for (let i = 0; i < total; i += 1) {
      const m = shapeSpread(blurred[i] ?? 0, stack.dropShadow.spreadPct) * stack.dropShadow.opacity;
      if (m > 1e-4) compositePixelOver(canvas, i * 4, r / 255, g / 255, b / 255, m, stack.dropShadow.blendMode);
    }
  }

  // 2. Outer Glow
  if (stack.outerGlow.enabled && stack.outerGlow.opacity > 0) {
    const blurred = blurFloatFieldSeparable(alphaMask, width, height, stack.outerGlow.sizePx);
    const { r, g, b } = stack.outerGlow.color;
    for (let i = 0; i < total; i += 1) {
      const m = shapeSpread(Math.max(0, (blurred[i] ?? 0) - (alphaMask[i] ?? 0) * 0.65), stack.outerGlow.spreadPct) * stack.outerGlow.opacity;
      if (m > 1e-4) compositePixelOver(canvas, i * 4, r / 255, g / 255, b / 255, m, stack.outerGlow.blendMode);
    }
  }

  // 3. 원본 레이어 + 내부 오버레이 (Pattern / Gradient / Color)
  const fillOp = clamp01(stack.fillOpacity);
  const gradRad = (stack.gradientOverlay.angleDeg * Math.PI) / 180;
  const gradCos = Math.cos(gradRad), gradSin = Math.sin(gradRad);
  const gradScale = Math.max(0.1, stack.gradientOverlay.scalePct / 100);
  const halfW = Math.max(1, (width - 1) * 0.5), halfH = Math.max(1, (height - 1) * 0.5);
  const interior = new Float32Array(total * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x, a = alphaMask[p] ?? 0;
      if (a <= 1e-5) continue;
      const off = p * 4;
      interior[off] = (data[off] ?? 0) / 255;
      interior[off + 1] = (data[off + 1] ?? 0) / 255;
      interior[off + 2] = (data[off + 2] ?? 0) / 255;
      let curA = a * fillOp;

      if (stack.patternOverlay.enabled && stack.patternOverlay.opacity > 0) {
        const pv = samplePatternValue(stack.patternOverlay.pattern, x, y, stack.patternOverlay.scalePct, stack.patternOverlay.offsetX, stack.patternOverlay.offsetY);
        const op = clamp01(stack.patternOverlay.opacity);
        mixInteriorRgb(interior, off, pv, pv, pv, op, stack.patternOverlay.blendMode);
        curA = Math.max(curA, a * op);
      }
      if (stack.gradientOverlay.enabled && stack.gradientOverlay.opacity > 0) {
        const nx = (x - halfW) / halfW, ny = (y - halfH) / halfH;
        let t = stack.gradientOverlay.style === "radial"
          ? Math.hypot(nx, ny) / gradScale
          : stack.gradientOverlay.style === "angle"
            ? ((Math.atan2(ny, nx) - gradRad) / (Math.PI * 2) + 2) % 1
            : stack.gradientOverlay.style === "reflected"
              ? Math.abs((nx * gradCos + ny * gradSin) / gradScale)
              : 0.5 + (nx * gradCos + ny * gradSin) / (2 * gradScale);
        if (stack.gradientOverlay.reverse) t = 1 - clamp01(t);
        const [gr, gg, gb] = sampleGradientStops(stack.gradientOverlay.stops, t);
        const op = clamp01(stack.gradientOverlay.opacity);
        mixInteriorRgb(interior, off, gr, gg, gb, op, stack.gradientOverlay.blendMode);
        curA = Math.max(curA, a * op);
      }
      if (stack.colorOverlay.enabled && stack.colorOverlay.opacity > 0) {
        const op = clamp01(stack.colorOverlay.opacity);
        mixInteriorRgb(interior, off, stack.colorOverlay.color.r / 255, stack.colorOverlay.color.g / 255, stack.colorOverlay.color.b / 255, op, stack.colorOverlay.blendMode);
        curA = Math.max(curA, a * op);
      }
      interior[off + 3] = curA;
    }
  }

  // 4. Satin
  if (stack.satin.enabled && stack.satin.opacity > 0) {
    const rad = (stack.satin.angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * stack.satin.distancePx, dy = Math.sin(rad) * stack.satin.distancePx;
    const diffMask = new Float32Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        diffMask[y * width + x] = Math.abs(
          sampleMaskBilinear(alphaMask, width, height, x + dx, y + dy, 0) -
          sampleMaskBilinear(alphaMask, width, height, x - dx, y - dy, 0),
        );
      }
    }
    const blurred = blurFloatFieldSeparable(diffMask, width, height, stack.satin.sizePx);
    for (let i = 0; i < total; i += 1) {
      if ((alphaMask[i] ?? 0) <= 1e-5) continue;
      const raw = clamp01(blurred[i] ?? 0);
      mixInteriorRgb(
        interior, i * 4, stack.satin.color.r / 255, stack.satin.color.g / 255, stack.satin.color.b / 255,
        (stack.satin.invert ? 1 - raw : raw) * stack.satin.opacity, stack.satin.blendMode,
      );
    }
  }

  // 5. Inner Glow
  if (stack.innerGlow.enabled && stack.innerGlow.opacity > 0) {
    let glowMask: Float32Array;
    if (stack.innerGlow.source === "center" && distIn) {
      const maxD = Math.max(1, stack.innerGlow.sizePx);
      glowMask = new Float32Array(total);
      for (let i = 0; i < total; i += 1) glowMask[i] = clamp01((distIn[i] ?? 0) / maxD);
    } else {
      const inv = new Float32Array(total);
      for (let i = 0; i < total; i += 1) inv[i] = 1 - (alphaMask[i] ?? 0);
      glowMask = blurFloatFieldSeparable(inv, width, height, stack.innerGlow.sizePx);
    }
    for (let i = 0; i < total; i += 1) {
      if ((alphaMask[i] ?? 0) <= 1e-5) continue;
      const m = shapeSpread(glowMask[i] ?? 0, stack.innerGlow.chokePct) * stack.innerGlow.opacity;
      if (m > 1e-4) mixInteriorRgb(interior, i * 4, stack.innerGlow.color.r / 255, stack.innerGlow.color.g / 255, stack.innerGlow.color.b / 255, m, stack.innerGlow.blendMode);
    }
  }

  // 6. Inner Shadow
  if (stack.innerShadow.enabled && stack.innerShadow.opacity > 0) {
    const rad = (stack.innerShadow.angleDeg * Math.PI) / 180;
    const dx = -Math.cos(rad) * stack.innerShadow.distancePx, dy = Math.sin(rad) * stack.innerShadow.distancePx;
    const invShifted = new Float32Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) invShifted[y * width + x] = 1 - sampleMaskBilinear(alphaMask, width, height, x - dx, y - dy, 0);
    }
    const blurred = blurFloatFieldSeparable(invShifted, width, height, stack.innerShadow.sizePx);
    for (let i = 0; i < total; i += 1) {
      if ((alphaMask[i] ?? 0) <= 1e-5) continue;
      const m = shapeSpread(blurred[i] ?? 0, stack.innerShadow.chokePct) * stack.innerShadow.opacity;
      if (m > 1e-4) mixInteriorRgb(interior, i * 4, stack.innerShadow.color.r / 255, stack.innerShadow.color.g / 255, stack.innerShadow.color.b / 255, m, stack.innerShadow.blendMode);
    }
  }

  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    compositePixelOver(canvas, off, interior[off] ?? 0, interior[off + 1] ?? 0, interior[off + 2] ?? 0, interior[off + 3] ?? 0, "normal");
  }

  // 7. Bevel & Emboss (높이장 법선 + 3D 광원)
  if (stack.bevelEmboss.enabled && distIn) {
    const size = Math.max(1, stack.bevelEmboss.sizePx);
    const rawH = new Float32Array(total);
    for (let i = 0; i < total; i += 1) {
      const dIn = Math.min(size, distIn[i] ?? 0) / size;
      const dOut = distOut ? Math.min(size, distOut[i] ?? 0) / size : 1;
      rawH[i] = stack.bevelEmboss.style === "outer-bevel" ? 1 - dOut
        : stack.bevelEmboss.style === "emboss" ? 0.5 + 0.5 * dIn - 0.5 * dOut
          : stack.bevelEmboss.style === "pillow-emboss" ? dIn - (1 - dOut) : dIn;
    }
    const hMap = stack.bevelEmboss.softenPx > 0 ? blurFloatFieldSeparable(rawH, width, height, stack.bevelEmboss.softenPx) : rawH;
    const ang = (stack.bevelEmboss.angleDeg * Math.PI) / 180, alt = (stack.bevelEmboss.altitudeDeg * Math.PI) / 180;
    const lx = Math.cos(alt) * Math.cos(ang), ly = -Math.cos(alt) * Math.sin(ang), lz = Math.sin(alt);
    const scale = Math.max(0.2, stack.bevelEmboss.depthPct / 100) * 2.2 * (stack.bevelEmboss.direction === "down" ? -1 : 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        const applyMask = stack.bevelEmboss.style === "inner-bevel"
          ? (alphaMask[p] ?? 0)
          : Math.max(alphaMask[p] ?? 0, distOut && (distOut[p] ?? 999) <= size ? 1 : 0);
        if (applyMask <= 1e-4) continue;
        const gx = ((hMap[y * width + Math.min(width - 1, x + 1)] ?? 0) - (hMap[y * width + Math.max(0, x - 1)] ?? 0)) * scale;
        const gy = ((hMap[Math.min(height - 1, y + 1) * width + x] ?? 0) - (hMap[Math.max(0, y - 1) * width + x] ?? 0)) * scale;
        const delta = (-gx * lx - gy * ly + lz) / Math.hypot(gx, gy, 1) - lz;
        if (delta > 0.01) {
          compositePixelOver(canvas, p * 4, stack.bevelEmboss.highlightColor.r / 255, stack.bevelEmboss.highlightColor.g / 255, stack.bevelEmboss.highlightColor.b / 255, clamp01(delta * 1.8) * stack.bevelEmboss.highlightOpacity * applyMask, stack.bevelEmboss.highlightBlendMode);
        } else if (delta < -0.01) {
          compositePixelOver(canvas, p * 4, stack.bevelEmboss.shadowColor.r / 255, stack.bevelEmboss.shadowColor.g / 255, stack.bevelEmboss.shadowColor.b / 255, clamp01(-delta * 1.8) * stack.bevelEmboss.shadowOpacity * applyMask, stack.bevelEmboss.shadowBlendMode);
        }
      }
    }
  }

  // 8. Stroke (EDT 기반 안티앨리어싱 외곽선)
  if (stack.stroke.enabled && stack.stroke.sizePx > 0 && stack.stroke.opacity > 0 && distOut && distIn) {
    const size = stack.stroke.sizePx;
    for (let i = 0; i < total; i += 1) {
      const dOut = distOut[i] ?? 9999, dIn = distIn[i] ?? 9999;
      let cov = 0;
      if (stack.stroke.position === "outside" && dOut > 0 && dOut <= size + 1) cov = clamp01(size + 0.5 - dOut) * (1 - (alphaMask[i] ?? 0) * 0.5);
      else if (stack.stroke.position === "inside" && dIn > 0 && dIn <= size + 1) cov = clamp01(size + 0.5 - dIn) * (alphaMask[i] ?? 0);
      else if (stack.stroke.position === "center" && Math.min(dOut, dIn) <= size * 0.5 + 1) cov = clamp01(size * 0.5 + 0.5 - Math.min(dOut, dIn));
      if (cov > 1e-4) compositePixelOver(canvas, i * 4, stack.stroke.color.r / 255, stack.stroke.color.g / 255, stack.stroke.color.b / 255, cov * stack.stroke.opacity, stack.stroke.blendMode);
    }
  }

  const rendered = new Uint8ClampedArray(total * 4);
  const layerOp = clamp01(stack.layerOpacity);
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    rendered[off] = clampByte((canvas[off] ?? 0) * 255);
    rendered[off + 1] = clampByte((canvas[off + 1] ?? 0) * 255);
    rendered[off + 2] = clampByte((canvas[off + 2] ?? 0) * 255);
    rendered[off + 3] = clampByte((canvas[off + 3] ?? 0) * layerOp * 255);
  }
  const fxBuffer: RgbaImageBuffer = { width, height, data: rendered };
  if (underlyingBackdrop) {
    return compositeWithBlendIf(fxBuffer, underlyingBackdrop, stack.blendIf, { opacity: 1, blendMode: stack.blendMode });
  }
  if (stack.blendIf.enabled) {
    const out = new Uint8ClampedArray(rendered);
    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      const r = out[off] ?? 0, g = out[off + 1] ?? 0, b = out[off + 2] ?? 0;
      const factor = evaluateBlendIfRangeFactor(luminance255(r, g, b), stack.blendIf.thisGray)
        * evaluateBlendIfRangeFactor(r, stack.blendIf.thisRed)
        * evaluateBlendIfRangeFactor(g, stack.blendIf.thisGreen)
        * evaluateBlendIfRangeFactor(b, stack.blendIf.thisBlue);
      out[off + 3] = clampByte((out[off + 3] ?? 0) * factor);
    }
    return { width, height, data: out };
  }
  return fxBuffer;
}

const BASE_FX = createDefaultLayerFxStack();
export const PHOTOSHOP_LAYER_FX_PRESETS: readonly LayerFxPresetItem[] = Object.freeze([
  {
    id: "webtoon-sticker-outline", label: "웹툰 스티커 테두리",
    description: "흰 외곽선과 은은한 그림자로 캐릭터를 또렷하게 띄웁니다.",
    stack: {
      ...BASE_FX,
      stroke: { ...BASE_FX.stroke, enabled: true, sizePx: 4, color: { r: 255, g: 255, b: 255 } },
      dropShadow: { ...BASE_FX.dropShadow, enabled: true, distancePx: 5, sizePx: 8, opacity: 0.45 },
    },
  },
  {
    id: "neon-aura-glow", label: "네온 빛 아우라",
    description: "바깥과 안쪽에 푸른 빛을 둘러 SF·판타지 효과를 냅니다.",
    stack: {
      ...BASE_FX,
      outerGlow: { ...BASE_FX.outerGlow, enabled: true, sizePx: 12, opacity: 0.85 },
      innerGlow: { ...BASE_FX.innerGlow, enabled: true, color: { r: 196, g: 242, b: 255 }, sizePx: 6, opacity: 0.6 },
    },
  },
  {
    id: "embossed-title-badge", label: "입체 타이틀 볼록 효과",
    description: "입체 경사와 부드러운 광택, 노을 그라데이션을 함께 입힙니다.",
    stack: {
      ...BASE_FX,
      bevelEmboss: { ...BASE_FX.bevelEmboss, enabled: true, depthPct: 160, sizePx: 7 },
      gradientOverlay: { ...BASE_FX.gradientOverlay, enabled: true, opacity: 0.55 },
      dropShadow: { ...BASE_FX.dropShadow, enabled: true, distancePx: 6, sizePx: 7, opacity: 0.5 },
    },
  },
  {
    id: "blend-if-highlights", label: "밝은 빛만 자연 합성",
    description: "어두운 부분은 투명하게 빠지고 밝은 광원만 부드럽게 남깁니다.",
    stack: {
      ...BASE_FX, blendMode: "screen",
      blendIf: { enabled: true, thisGray: { blackMin: 40, blackMax: 120, whiteMin: 255, whiteMax: 255 }, underlyingGray: DEFAULT_BLEND_IF_RANGE },
    },
  },
]);
