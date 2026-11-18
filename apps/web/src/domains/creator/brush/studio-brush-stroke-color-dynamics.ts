/**
 * 클립스튜디오 페인트 5.1.5 스트로크별 색 변화·보조색 필압 혼합·화면 배율 연동 브러시 크기 엔진.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `BrushChangeStrokeColor`, `BrushStrokeHueChange`, `BrushStrokeSaturationChange`, `BrushStrokeValueChange`,
 *   `BrushSubColor`, `BrushSubColorEffector`, `BrushSizeSyncViewScale`.
 */

import type { StudioBrushInOutTaperConfig } from "./studio-brush-inout-taper";
import {
  DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG,
  isStudioBrushInOutTaperIdentity,
  normalizeStudioBrushInOutTaperConfig,
} from "./studio-brush-inout-taper";
import type { StudioBrushDwellConfig } from "./studio-brush-dwell-emitter";
import {
  DEFAULT_STUDIO_BRUSH_DWELL_CONFIG,
  normalizeStudioBrushDwellConfig,
} from "./studio-brush-dwell-emitter";
import type { StudioPatternBrushConfig } from "./studio-pattern-brush";
import {
  DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG,
  normalizeStudioPatternBrushConfig,
} from "./studio-pattern-brush";
import type { StudioSharpCornerConfig } from "./studio-stroke-corner-sharpen";
import {
  DEFAULT_STUDIO_SHARP_CORNER_CONFIG,
  normalizeStudioSharpCornerConfig,
} from "./studio-stroke-corner-sharpen";
import type { StudioRuledLineConfig } from "./studio-stroke-ruled-line";
import {
  DEFAULT_STUDIO_RULED_LINE_CONFIG,
  normalizeStudioRuledLineConfig,
} from "./studio-stroke-ruled-line";

export type StudioSubColorMixSource = "off" | "pressure" | "speed" | "tilt";

export interface StudioStrokeColorAndScaleConfig {
  /** 획 단위로 색조·채도·명도를 일정하게 변주할지 여부 (`BrushChangeStrokeColor`). */
  readonly perStrokeColorJitter: boolean;
  /** 획당 최대 색조 변화 범위 (0..180도). */
  readonly strokeHueJitterDeg: number;
  /** 획당 최대 채도 변화 범위 (0..1). */
  readonly strokeSaturationJitter: number;
  /** 획당 최대 명도 변화 범위 (0..1). */
  readonly strokeValueJitter: number;
  /** 보조색(배경색) 혼합 입력원 (`BrushSubColorEffector`). */
  readonly subColorMixSource: StudioSubColorMixSource;
  /** 입력원 최대 시 보조색 혼합 강도 (0..1). */
  readonly subColorMaxMix: number;
  /** 보조색 혼합 감마 곡선 (0.25..4). */
  readonly subColorCurve: number;
  /** 입력원을 반전해 약한 필압일수록 보조색이 나오게 할지 여부. */
  readonly subColorInvert: boolean;
  /** 화면 확대·축소 배율에 맞춰 브러시 픽셀 크기를 보정할지 여부 (`BrushSizeSyncViewScale`). */
  readonly syncSizeWithViewScale: boolean;
}

export interface NormalizedStudioCspBrushExtensions {
  readonly inOutTaper: StudioBrushInOutTaperConfig;
  readonly sharpCorner: StudioSharpCornerConfig;
  readonly dwellBuildup: StudioBrushDwellConfig;
  readonly ruledLine: StudioRuledLineConfig;
  readonly patternBrush: StudioPatternBrushConfig;
  readonly strokeColorAndScale: StudioStrokeColorAndScaleConfig;
}

export const DEFAULT_STUDIO_STROKE_COLOR_AND_SCALE_CONFIG: StudioStrokeColorAndScaleConfig =
  Object.freeze({
    perStrokeColorJitter: false,
    strokeHueJitterDeg: 0,
    strokeSaturationJitter: 0,
    strokeValueJitter: 0,
    subColorMixSource: "off",
    subColorMaxMix: 0.5,
    subColorCurve: 1,
    subColorInvert: false,
    syncSizeWithViewScale: false,
  });

export const DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS: NormalizedStudioCspBrushExtensions = Object.freeze({
  inOutTaper: DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG,
  sharpCorner: DEFAULT_STUDIO_SHARP_CORNER_CONFIG,
  dwellBuildup: DEFAULT_STUDIO_BRUSH_DWELL_CONFIG,
  ruledLine: DEFAULT_STUDIO_RULED_LINE_CONFIG,
  patternBrush: DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG,
  strokeColorAndScale: DEFAULT_STUDIO_STROKE_COLOR_AND_SCALE_CONFIG,
});

export function normalizeStudioStrokeColorAndScaleConfig(
  input?: Partial<StudioStrokeColorAndScaleConfig> | null,
): StudioStrokeColorAndScaleConfig {
  if (!input) return DEFAULT_STUDIO_STROKE_COLOR_AND_SCALE_CONFIG;
  const sources: readonly StudioSubColorMixSource[] = ["off", "pressure", "speed", "tilt"];
  const clamp = (v: unknown, min: number, max: number, fb: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb;
  return {
    perStrokeColorJitter: Boolean(input.perStrokeColorJitter),
    strokeHueJitterDeg: clamp(input.strokeHueJitterDeg, 0, 180, 0),
    strokeSaturationJitter: clamp(input.strokeSaturationJitter, 0, 1, 0),
    strokeValueJitter: clamp(input.strokeValueJitter, 0, 1, 0),
    subColorMixSource: sources.includes(input.subColorMixSource as StudioSubColorMixSource)
      ? (input.subColorMixSource as StudioSubColorMixSource)
      : "off",
    subColorMaxMix: clamp(input.subColorMaxMix, 0, 1, 0.5),
    subColorCurve: clamp(input.subColorCurve, 0.25, 4, 1),
    subColorInvert: Boolean(input.subColorInvert),
    syncSizeWithViewScale: Boolean(input.syncSizeWithViewScale),
  };
}

export function normalizeStudioCspBrushExtensions(
  input?: Partial<{
    inOutTaper?: Partial<StudioBrushInOutTaperConfig> | null;
    sharpCorner?: Partial<StudioSharpCornerConfig> | null;
    dwellBuildup?: Partial<StudioBrushDwellConfig> | null;
    ruledLine?: Partial<StudioRuledLineConfig> | null;
    patternBrush?: Partial<StudioPatternBrushConfig> | null;
    strokeColorAndScale?: Partial<StudioStrokeColorAndScaleConfig> | null;
  }> | null,
): NormalizedStudioCspBrushExtensions {
  if (!input) return DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS;
  return {
    inOutTaper: normalizeStudioBrushInOutTaperConfig(input.inOutTaper),
    sharpCorner: normalizeStudioSharpCornerConfig(input.sharpCorner),
    dwellBuildup: normalizeStudioBrushDwellConfig(input.dwellBuildup),
    ruledLine: normalizeStudioRuledLineConfig(input.ruledLine),
    patternBrush: normalizeStudioPatternBrushConfig(input.patternBrush),
    strokeColorAndScale: normalizeStudioStrokeColorAndScaleConfig(input.strokeColorAndScale),
  };
}

export function isStudioCspBrushExtensionsIdentity(
  ext?: NormalizedStudioCspBrushExtensions | null,
): boolean {
  if (!ext) return true;
  const sc = ext.strokeColorAndScale;
  const strokeColorIdentity =
    !sc.perStrokeColorJitter
    && sc.subColorMixSource === "off"
    && !sc.syncSizeWithViewScale;
  return (
    isStudioBrushInOutTaperIdentity(ext.inOutTaper)
    && !ext.sharpCorner.enabled
    && !ext.dwellBuildup.enabled
    && ext.ruledLine.mode === "none"
    && ext.patternBrush.motif === "none"
    && strokeColorIdentity
  );
}

function seededSigned(strokeSeed: number, channel: number): number {
  let h = (strokeSeed ^ Math.imul(channel + 17, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h / 0xffffffff) * 2 - 1;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r1: number;
  let g1: number;
  let b1: number;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/**
 * 한 획 전체에 동일한 결정론적 HSV 오프셋을 적용하고, 필압·속도·기울기 입력원에 따라
 * 주 전경색과 보조색을 연속 혼합한 RGB 색상을 반환한다.
 */
export function evaluateStudioStrokeAndSubColorRgb(
  foregroundRgb: readonly [number, number, number],
  subColorRgb: readonly [number, number, number],
  config: StudioStrokeColorAndScaleConfig,
  sample: Readonly<{
    strokeSeed: number;
    pressure?: number;
    speedNormalized?: number;
    tiltMagnitude?: number;
  }>,
): [number, number, number] {
  const normalized = normalizeStudioStrokeColorAndScaleConfig(config);
  let [r, g, b] = foregroundRgb;

  if (normalized.subColorMixSource !== "off" && normalized.subColorMaxMix > 0) {
    let driver = 0;
    if (normalized.subColorMixSource === "pressure") {
      driver = sample.pressure ?? 0.5;
    } else if (normalized.subColorMixSource === "speed") {
      driver = sample.speedNormalized ?? 0;
    } else if (normalized.subColorMixSource === "tilt") {
      driver = sample.tiltMagnitude ?? 0;
    }
    const clamped = Math.min(1, Math.max(0, driver));
    const oriented = normalized.subColorInvert ? 1 - clamped : clamped;
    const mixWeight = Math.pow(oriented, normalized.subColorCurve) * normalized.subColorMaxMix;
    r = Math.round(r + (subColorRgb[0] - r) * mixWeight);
    g = Math.round(g + (subColorRgb[1] - g) * mixWeight);
    b = Math.round(b + (subColorRgb[2] - b) * mixWeight);
  }

  if (
    normalized.perStrokeColorJitter
    && (normalized.strokeHueJitterDeg > 0
      || normalized.strokeSaturationJitter > 0
      || normalized.strokeValueJitter > 0)
  ) {
    const [h, s, v] = rgbToHsv(r, g, b);
    const dh = seededSigned(sample.strokeSeed, 1) * normalized.strokeHueJitterDeg;
    const ds = seededSigned(sample.strokeSeed, 2) * normalized.strokeSaturationJitter;
    const dv = seededSigned(sample.strokeSeed, 3) * normalized.strokeValueJitter;
    return hsvToRgb(
      h + dh,
      Math.min(1, Math.max(0, s + ds)),
      Math.min(1, Math.max(0, v + dv)),
    );
  }

  return [r, g, b];
}

/**
 * `화면 배율에 브러시 크기 연동`(`BrushSizeSyncViewScale`) 활성화 시
 * 화면에서 보이는 두께가 일정하도록 캔버스 공간 브러시 지름을 역산한다.
 */
export function resolveViewScaleSyncedBrushSize(
  baseSizePx: number,
  viewZoomScale: number,
  syncEnabled: boolean,
): number {
  const safeBase = Math.max(0.5, Number.isFinite(baseSizePx) ? baseSizePx : 1);
  if (!syncEnabled) return safeBase;
  const safeZoom = Number.isFinite(viewZoomScale) && viewZoomScale > 0.02 ? viewZoomScale : 1;
  return Math.min(2_000, Math.max(0.5, safeBase / safeZoom));
}
