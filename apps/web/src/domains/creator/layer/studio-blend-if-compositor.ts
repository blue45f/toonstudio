/**
 * studio-blend-if-compositor.ts
 *
 * Photoshop / Photopea / Affinity Photo 스타일 비파괴 Blend-If & Blend Ranges 합성기.
 *
 * - 채널(`gray` | `r` | `g` | `b`)별 `thisLayer`(이 레이어)와 `underlyingLayer`(아래 레이어)
 *   4포인트 분할 핸들 `[bMin, bSoft, wSoft, wMax]` (0..255)에 대해 smoothstep 램프 매트를 계산한다.
 * - 선택적 Affinity Blend Ranges 다중 제어점 스플라인 곡선(`splinePoints`)도 함께 곱해
 *   임의 휘도 구간의 세밀한 불투명도 곡선을 지원한다.
 * - 입력 RGBA 버퍼를 변형하지 않는 순수 함수이며, Photoshop PSD `blnc` (Blending Ranges)
 *   40바이트 바이너리 블록 및 메타데이터와 무손실 라운드트립 직렬화/역직렬화를 제공한다.
 */

import type { StudioImageDataLike } from "../studio-filters";

export type BlendIfChannel = "gray" | "r" | "g" | "b";

export const BLEND_IF_CHANNELS: readonly BlendIfChannel[] = ["gray", "r", "g", "b"] as const;

export const BLEND_IF_CHANNEL_LABELS_KO: Readonly<Record<BlendIfChannel, string>> = {
  gray: "전체 명도",
  r: "빨강",
  g: "초록",
  b: "파랑",
};

/** 4포인트 분할 핸들 [blackMin, blackSoft, whiteSoft, whiteMax], 각 값 0..255 단조 증가. */
export type BlendIfSplitHandles = readonly [number, number, number, number];

/** Affinity Blend Ranges 확장 스플라인 제어점 (input: 0..1, opacity: 0..1). */
export interface BlendRangeSplinePoint {
  readonly input: number;
  readonly opacity: number;
}

export interface StudioBlendIfChannelSpec {
  readonly thisLayer: BlendIfSplitHandles;
  readonly underlyingLayer: BlendIfSplitHandles;
  readonly thisLayerSpline?: readonly BlendRangeSplinePoint[];
  readonly underlyingLayerSpline?: readonly BlendRangeSplinePoint[];
}

export interface StudioBlendIfConfig {
  readonly version: 1;
  readonly enabled: boolean;
  readonly activeChannel: BlendIfChannel;
  readonly channels: Readonly<Record<BlendIfChannel, StudioBlendIfChannelSpec>>;
  /** PSD `blendClippendElements` 대응 — 클리핑된 하위 요소를 함께 혼합할지 여부. */
  readonly blendClippingElements: boolean;
  /** PSD `blendInteriorElements` 대응 — 내부 레이어 효과를 함께 혼합할지 여부. */
  readonly blendInteriorElements: boolean;
}

export type BlendIfPresetId =
  | "identity"
  | "knockout-white-lineart"
  | "fog-in-shadows"
  | "rim-light-highlights"
  | "paper-grain-midtones";

export interface BlendIfPresetDefinition {
  readonly id: BlendIfPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly config: StudioBlendIfConfig;
}

export interface PsdBlendIfBlncChannelPair {
  readonly thisLayer: BlendIfSplitHandles;
  readonly underlyingLayer: BlendIfSplitHandles;
}

/** PSD Layer Blending Ranges (`blnc`) 메타데이터 + 표준 40바이트 바이너리 페이로드. */
export interface PsdBlendIfBlncRecord {
  readonly tag: "blnc";
  readonly version: 1;
  readonly enabled: boolean;
  readonly blendClippingElements: boolean;
  readonly blendInteriorElements: boolean;
  readonly channels: Readonly<Record<BlendIfChannel, PsdBlendIfBlncChannelPair>>;
  /**
   * Photoshop 파일 형식 표준 40바이트 Blending Ranges 블록:
   * - [0..3]   composite gray source [bMin, bSoft, wSoft, wMax]
   * - [4..7]   composite gray destination [bMin, bSoft, wSoft, wMax]
   * - [8..15]  Red source(4) + destination(4)
   * - [16..23] Green source(4) + destination(4)
   * - [24..31] Blue source(4) + destination(4)
   * - [32..39] Alpha/reserve source(4) + destination(4) (기본 [0, 0, 255, 255])
   */
  readonly binary: Uint8Array;
}

export interface CompositeBlendIfOptions {
  /** 추가 레이어 전체 불투명도(0..1). 기본 1. */
  readonly opacity01?: number;
}

export const DEFAULT_BLEND_IF_HANDLES: BlendIfSplitHandles = [0, 0, 255, 255];

export const PSD_BLNC_BINARY_BYTE_LENGTH = 40;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** 4포인트 핸들을 0..255 정수로 클램프하고 bMin <= bSoft <= wSoft <= wMax 단조성을 강제한다. */
export function normalizeBlendIfHandles(
  handles: readonly [number, number, number, number] | null | undefined,
): BlendIfSplitHandles {
  if (!handles || handles.length < 4) return DEFAULT_BLEND_IF_HANDLES;
  const bMin = clampByte(handles[0]);
  const bSoft = Math.max(bMin, clampByte(handles[1]));
  const wMax = Math.max(bSoft, clampByte(handles[3]));
  const wSoft = clamp(clampByte(handles[2]), bSoft, wMax);
  return [bMin, bSoft, wSoft, wMax];
}

/** 핸들 배열이 항등([0, 0, 255, 255])인지 판별한다. */
export function isIdentityBlendIfHandles(handles: BlendIfSplitHandles): boolean {
  return handles[0] === 0 && handles[1] === 0 && handles[2] === 255 && handles[3] === 255;
}

export function normalizeBlendRangeSpline(
  points: readonly BlendRangeSplinePoint[] | undefined,
): readonly BlendRangeSplinePoint[] | undefined {
  if (!points || points.length < 2) return undefined;
  const cleaned = points
    .filter((pt) => Number.isFinite(pt.input) && Number.isFinite(pt.opacity))
    .map((pt) => ({ input: clamp01(pt.input), opacity: clamp01(pt.opacity) }))
    .sort((a, b) => a.input - b.input);
  if (cleaned.length < 2) return undefined;
  return cleaned;
}

export function createDefaultBlendIfChannelSpec(): StudioBlendIfChannelSpec {
  return {
    thisLayer: DEFAULT_BLEND_IF_HANDLES,
    underlyingLayer: DEFAULT_BLEND_IF_HANDLES,
  };
}

export function createDefaultBlendIfConfig(
  overrides?: Partial<Pick<StudioBlendIfConfig, "enabled" | "activeChannel" | "blendClippingElements" | "blendInteriorElements">>,
): StudioBlendIfConfig {
  return {
    version: 1,
    enabled: overrides?.enabled ?? true,
    activeChannel: overrides?.activeChannel ?? "gray",
    channels: {
      gray: createDefaultBlendIfChannelSpec(),
      r: createDefaultBlendIfChannelSpec(),
      g: createDefaultBlendIfChannelSpec(),
      b: createDefaultBlendIfChannelSpec(),
    },
    blendClippingElements: overrides?.blendClippingElements ?? true,
    blendInteriorElements: overrides?.blendInteriorElements ?? false,
  };
}

export function isIdentityBlendIfConfig(config: StudioBlendIfConfig): boolean {
  if (!config.enabled) return true;
  return BLEND_IF_CHANNELS.every((ch) => {
    const spec = config.channels[ch];
    return (
      isIdentityBlendIfHandles(spec.thisLayer) &&
      isIdentityBlendIfHandles(spec.underlyingLayer) &&
      !spec.thisLayerSpline?.length &&
      !spec.underlyingLayerSpline?.length
    );
  });
}

/**
 * Hermite smoothstep 보간: edge0 == edge1이면 경계 계단 함수로 안전하게 처리한다.
 */
export function blendIfSmoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 단일 4포인트 분할 핸들 `[bMin, bSoft, wSoft, wMax]`에 대한 휘도 `v` (0..255)의 매트 알파(0..1).
 *
 * - 기본 항등 `[0, 0, 255, 255]`은 모든 `v ∈ [0, 255]`에서 정확히 `1`을 반환한다.
 * - `bMin < bSoft` 구간은 `smoothstep(bMin, bSoft, v)`로 부드럽게 올라가고,
 * - `wSoft < wMax` 구간은 `1 - smoothstep(wSoft, wMax, v)`로 부드럽게 감쇠한다.
 */
export function evaluateBlendIfRangeAlpha(
  value: number,
  rawHandles: BlendIfSplitHandles,
): number {
  const [bMin, bSoft, wSoft, wMax] = normalizeBlendIfHandles(rawHandles);
  const v = clamp(value, 0, 255);

  let alphaLow: number;
  if (bMin <= 0 && bSoft <= 0) {
    alphaLow = 1;
  } else if (v < bMin) {
    alphaLow = 0;
  } else if (v >= bSoft) {
    alphaLow = 1;
  } else {
    alphaLow = blendIfSmoothstep(bMin, bSoft, v);
  }

  let alphaHigh: number;
  if (wSoft >= 255 && wMax >= 255) {
    alphaHigh = 1;
  } else if (v > wMax) {
    alphaHigh = 0;
  } else if (v <= wSoft) {
    alphaHigh = 1;
  } else {
    alphaHigh = 1 - blendIfSmoothstep(wSoft, wMax, v);
  }

  return clamp01(alphaLow * alphaHigh);
}

/** Affinity Blend Ranges 다중 제어점 곡선을 부드러운 에르미트(smoothstep) 구간 보간으로 평가한다. */
export function evaluateBlendRangeSplineAlpha(
  value0to255: number,
  spline: readonly BlendRangeSplinePoint[] | undefined,
): number {
  if (!spline || spline.length < 2) return 1;
  const t = clamp01(value0to255 / 255);
  const first = spline[0]!;
  const last = spline[spline.length - 1]!;
  if (t <= first.input) return clamp01(first.opacity);
  if (t >= last.input) return clamp01(last.opacity);
  for (let i = 0; i < spline.length - 1; i += 1) {
    const a = spline[i]!;
    const b = spline[i + 1]!;
    if (t >= a.input && t <= b.input) {
      const span = b.input - a.input;
      if (span <= 1e-6) return clamp01(b.opacity);
      const local = (t - a.input) / span;
      const smooth = local * local * (3 - 2 * local);
      return clamp01(a.opacity + (b.opacity - a.opacity) * smooth);
    }
  }
  return 1;
}

/** 픽셀 RGB에서 지정 채널 값(0..255)을 추출한다 (`gray`는 Rec.601 휘도). */
export function readBlendIfChannelValue(
  r: number,
  g: number,
  b: number,
  channel: BlendIfChannel,
): number {
  switch (channel) {
    case "r":
      return r;
    case "g":
      return g;
    case "b":
      return b;
    case "gray":
    default:
      return 0.299 * r + 0.587 * g + 0.114 * b;
  }
}

/**
 * 단일 픽셀 쌍(소스 레이어 vs 아래 레이어)에 대한 전 채널 곱셈 매트 알파(0..1)를 계산한다.
 */
export function evaluatePixelBlendIfMatte(
  srcR: number,
  srcG: number,
  srcB: number,
  dstR: number,
  dstG: number,
  dstB: number,
  config: StudioBlendIfConfig,
): number {
  if (!config.enabled) return 1;
  let matte = 1;
  for (const channel of BLEND_IF_CHANNELS) {
    const spec = config.channels[channel];
    const hasThisHandles = !isIdentityBlendIfHandles(spec.thisLayer);
    const hasThisSpline = Boolean(spec.thisLayerSpline && spec.thisLayerSpline.length >= 2);
    if (hasThisHandles || hasThisSpline) {
      const sv = readBlendIfChannelValue(srcR, srcG, srcB, channel);
      if (hasThisHandles) matte *= evaluateBlendIfRangeAlpha(sv, spec.thisLayer);
      if (hasThisSpline) matte *= evaluateBlendRangeSplineAlpha(sv, spec.thisLayerSpline);
      if (matte <= 0) return 0;
    }

    const hasUnderHandles = !isIdentityBlendIfHandles(spec.underlyingLayer);
    const hasUnderSpline = Boolean(spec.underlyingLayerSpline && spec.underlyingLayerSpline.length >= 2);
    if (hasUnderHandles || hasUnderSpline) {
      const dv = readBlendIfChannelValue(dstR, dstG, dstB, channel);
      if (hasUnderHandles) matte *= evaluateBlendIfRangeAlpha(dv, spec.underlyingLayer);
      if (hasUnderSpline) matte *= evaluateBlendRangeSplineAlpha(dv, spec.underlyingLayerSpline);
      if (matte <= 0) return 0;
    }
  }
  return clamp01(matte);
}

/** 채널 매트 미리보기·디버깅용 1바이트(0..255) 알파 맵을 생성한다. */
export function evaluateBlendIfMatteMap(
  source: StudioImageDataLike,
  underlying: StudioImageDataLike,
  config: StudioBlendIfConfig,
): Uint8ClampedArray {
  const pixelCount = source.width * source.height;
  const matte = new Uint8ClampedArray(pixelCount);
  if (!config.enabled || isIdentityBlendIfConfig(config)) {
    matte.fill(255);
    return matte;
  }
  const hasMatchingUnder =
    underlying.width === source.width && underlying.height === source.height;
  const s = source.data;
  const u = underlying.data;
  for (let p = 0; p < pixelCount; p += 1) {
    const i = p * 4;
    const dr = hasMatchingUnder ? (u[i] ?? 0) : 0;
    const dg = hasMatchingUnder ? (u[i + 1] ?? 0) : 0;
    const db = hasMatchingUnder ? (u[i + 2] ?? 0) : 0;
    const m = evaluatePixelBlendIfMatte(s[i] ?? 0, s[i + 1] ?? 0, s[i + 2] ?? 0, dr, dg, db, config);
    matte[p] = Math.round(m * 255);
  }
  return matte;
}

/**
 * 비파괴 Blend-If 합성: 소스 레이어를 매트 알파로 감쇠한 뒤 아래 레이어 위에
 * Porter-Duff source-over로 합성한 새 RGBA 버퍼를 반환한다. 입력 버퍼는 절대 변형하지 않는다.
 */
export function compositeBlendIfRgba(
  source: StudioImageDataLike,
  underlying: StudioImageDataLike,
  config: StudioBlendIfConfig,
  options: CompositeBlendIfOptions = {},
): StudioImageDataLike {
  if (source.width !== underlying.width || source.height !== underlying.height) {
    throw new RangeError(
      `Blend-If 입력 크기 불일치: ${source.width}x${source.height} vs ${underlying.width}x${underlying.height}`,
    );
  }
  const opacity = clamp01(options.opacity01 ?? 1);
  const out = new Uint8ClampedArray(source.data.length);
  const s = source.data;
  const u = underlying.data;
  const bypass = !config.enabled || isIdentityBlendIfConfig(config);

  for (let i = 0; i < out.length; i += 4) {
    const sr = s[i] ?? 0;
    const sg = s[i + 1] ?? 0;
    const sb = s[i + 2] ?? 0;
    const saRaw = (s[i + 3] ?? 0) / 255;

    const ur = u[i] ?? 0;
    const ug = u[i + 1] ?? 0;
    const ub = u[i + 2] ?? 0;
    const ua = (u[i + 3] ?? 0) / 255;

    const matte = bypass ? 1 : evaluatePixelBlendIfMatte(sr, sg, sb, ur, ug, ub, config);
    const sa = saRaw * matte * opacity;
    const outAlpha = sa + ua * (1 - sa);

    if (outAlpha <= 1e-6) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else {
      const invOut = 1 / outAlpha;
      const keepUnder = ua * (1 - sa);
      out[i] = Math.round((sr * sa + ur * keepUnder) * invOut);
      out[i + 1] = Math.round((sg * sa + ug * keepUnder) * invOut);
      out[i + 2] = Math.round((sb * sa + ub * keepUnder) * invOut);
      out[i + 3] = Math.round(outAlpha * 255);
    }
  }

  return { width: source.width, height: source.height, data: out };
}

/** 특정 채널의 `thisLayer` 또는 `underlyingLayer` 핸들을 불변 업데이트한다. */
export function patchBlendIfChannelHandles(
  config: StudioBlendIfConfig,
  channel: BlendIfChannel,
  target: "thisLayer" | "underlyingLayer",
  handles: BlendIfSplitHandles,
): StudioBlendIfConfig {
  const normalized = normalizeBlendIfHandles(handles);
  return {
    ...config,
    channels: {
      ...config.channels,
      [channel]: {
        ...config.channels[channel],
        [target]: normalized,
      },
    },
  };
}

/**
 * PSD `blnc` (Layer Blending Ranges) 40바이트 바이너리 + 메타데이터 직렬화.
 */
export function serializeBlendIfToPsdBlnc(config: StudioBlendIfConfig): PsdBlendIfBlncRecord {
  const binary = new Uint8Array(PSD_BLNC_BINARY_BYTE_LENGTH);
  const orderedChannels: readonly BlendIfChannel[] = ["gray", "r", "g", "b"];
  const normalizedPairs: Record<BlendIfChannel, PsdBlendIfBlncChannelPair> = {
    gray: {
      thisLayer: normalizeBlendIfHandles(config.channels.gray.thisLayer),
      underlyingLayer: normalizeBlendIfHandles(config.channels.gray.underlyingLayer),
    },
    r: {
      thisLayer: normalizeBlendIfHandles(config.channels.r.thisLayer),
      underlyingLayer: normalizeBlendIfHandles(config.channels.r.underlyingLayer),
    },
    g: {
      thisLayer: normalizeBlendIfHandles(config.channels.g.thisLayer),
      underlyingLayer: normalizeBlendIfHandles(config.channels.g.underlyingLayer),
    },
    b: {
      thisLayer: normalizeBlendIfHandles(config.channels.b.thisLayer),
      underlyingLayer: normalizeBlendIfHandles(config.channels.b.underlyingLayer),
    },
  };

  orderedChannels.forEach((channel, idx) => {
    const offset = idx * 8;
    const pair = normalizedPairs[channel];
    binary[offset] = pair.thisLayer[0];
    binary[offset + 1] = pair.thisLayer[1];
    binary[offset + 2] = pair.thisLayer[2];
    binary[offset + 3] = pair.thisLayer[3];
    binary[offset + 4] = pair.underlyingLayer[0];
    binary[offset + 5] = pair.underlyingLayer[1];
    binary[offset + 6] = pair.underlyingLayer[2];
    binary[offset + 7] = pair.underlyingLayer[3];
  });

  // 슬롯 4(바이트 32..39): 알파/예비 채널 항등 [0, 0, 255, 255] × 2
  binary[32] = 0;
  binary[33] = 0;
  binary[34] = 255;
  binary[35] = 255;
  binary[36] = 0;
  binary[37] = 0;
  binary[38] = 255;
  binary[39] = 255;

  return {
    tag: "blnc",
    version: 1,
    enabled: config.enabled,
    blendClippingElements: config.blendClippingElements,
    blendInteriorElements: config.blendInteriorElements,
    channels: normalizedPairs,
    binary,
  };
}

/**
 * PSD `blnc` 메타데이터 레코드 또는 원시 40바이트 바이너리 블록을 `StudioBlendIfConfig`로 복원한다.
 */
export function deserializeBlendIfFromPsdBlnc(
  input: PsdBlendIfBlncRecord | Uint8Array,
): StudioBlendIfConfig {
  const bytes = input instanceof Uint8Array ? input : input.binary;
  const readHandlesAt = (offset: number): BlendIfSplitHandles => {
    if (bytes.length < offset + 4) return DEFAULT_BLEND_IF_HANDLES;
    return normalizeBlendIfHandles([
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 255,
      bytes[offset + 3] ?? 255,
    ]);
  };

  const grayThis = readHandlesAt(0);
  const grayUnder = readHandlesAt(4);
  const rThis = readHandlesAt(8);
  const rUnder = readHandlesAt(12);
  const gThis = readHandlesAt(16);
  const gUnder = readHandlesAt(20);
  const bThis = readHandlesAt(24);
  const bUnder = readHandlesAt(28);

  const isRecord = !(input instanceof Uint8Array);
  return {
    version: 1,
    enabled: isRecord ? input.enabled : true,
    activeChannel: "gray",
    channels: {
      gray: { thisLayer: grayThis, underlyingLayer: grayUnder },
      r: { thisLayer: rThis, underlyingLayer: rUnder },
      g: { thisLayer: gThis, underlyingLayer: gUnder },
      b: { thisLayer: bThis, underlyingLayer: bUnder },
    },
    blendClippingElements: isRecord ? input.blendClippingElements : true,
    blendInteriorElements: isRecord ? input.blendInteriorElements : false,
  };
}

/** WebGPU 프래그먼트 패스 패리티용 WGSL smoothstep 매트 함수 스니펫. */
export function buildBlendIfWgslSnippet(): string {
  return [
    "fn blendIfRangeAlpha(v: f32, h: vec4<f32>) -> f32 {",
    "  let low = select(smoothstep(h.x, h.y, v), select(0.0, 1.0, v >= h.x), h.y <= h.x);",
    "  let lowResolved = select(low, 1.0, h.x <= 0.0 && h.y <= 0.0);",
    "  let high = select(1.0 - smoothstep(h.z, h.w, v), select(1.0, 0.0, v > h.w), h.w <= h.z);",
    "  let highResolved = select(high, 1.0, h.z >= 255.0 && h.w >= 255.0);",
    "  return clamp(lowResolved * highResolved, 0.0, 1.0);",
    "}",
  ].join("\n");
}

/** 웹툰·일러스트 합성용 기본 Blend-If 프리셋 5종. */
export const STUDIO_BLEND_IF_PRESETS: readonly BlendIfPresetDefinition[] = Object.freeze([
  {
    id: "identity",
    labelKo: "기본값",
    descriptionKo: "모든 명도 구간을 그대로 유지합니다.",
    config: createDefaultBlendIfConfig(),
  },
  {
    id: "knockout-white-lineart",
    labelKo: "흰 바탕 투명화",
    descriptionKo: "곱하기 없이 선화 레이어의 밝은 종이 배경만 부드럽게 비웁니다.",
    config: patchBlendIfChannelHandles(
      createDefaultBlendIfConfig(),
      "gray",
      "thisLayer",
      [0, 0, 215, 248],
    ),
  },
  {
    id: "fog-in-shadows",
    labelKo: "암부 안개 합성",
    descriptionKo: "아래 레이어의 어두운 구간에만 안개·공기층을 자연스럽게 얹습니다.",
    config: patchBlendIfChannelHandles(
      createDefaultBlendIfConfig(),
      "gray",
      "underlyingLayer",
      [0, 0, 110, 195],
    ),
  },
  {
    id: "rim-light-highlights",
    labelKo: "명부 역광 림라이트",
    descriptionKo: "아래 레이어의 밝은 경계에만 광원 림라이트가 스며들도록 제한합니다.",
    config: patchBlendIfChannelHandles(
      createDefaultBlendIfConfig(),
      "gray",
      "underlyingLayer",
      [120, 185, 255, 255],
    ),
  },
  {
    id: "paper-grain-midtones",
    labelKo: "중간톤 종이 질감",
    descriptionKo: "극암부와 순백을 보호하고 중간 명도에만 텍스처를 입힙니다.",
    config: patchBlendIfChannelHandles(
      createDefaultBlendIfConfig(),
      "gray",
      "underlyingLayer",
      [24, 72, 185, 232],
    ),
  },
]);
