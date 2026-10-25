/**
 * Adobe Photoshop Web (v2026.21.0.0) 프로시저럴 웹 필터 & 슈퍼 프리셋 엔진
 *
 * REA 정적·라이브 번들 역공학(`ev_b13e529664f4df24e94b0247bdd1e8f19c044b2f1ce8703d520eb1e90b525a18`,
 * `ev_973faac206a14eecb13f02df2d8d99e11806c47c95fabcdf52c9d57736b02b0a`,
 * `WebFilterPresets.chunk.C-Wm1ZUu.js`, `HomeEffectsPanel.chunk.CIAUJBBc.js`,
 * `FiltersPanelCard.chunk.B3c7nMaG.js`, `EffectsIntentOptions.chunk.6_4eLKUE.js`)에서 추출한
 * 24개 프로시저럴 필터 카테고리, 전체 프리셋 및 슈퍼 프리셋(Super Presets) 카탈로그와
 * 결정론적 RGBA 픽셀 커널을 클린룸 구현한다.
 */

import { PHOTOSHOP_WEB_FILTER_PRESETS_PART_A } from "./studio-photoshop-web-filter-catalog-a";
import { PHOTOSHOP_WEB_FILTER_PRESETS_PART_B } from "./studio-photoshop-web-filter-catalog-b";

export const PHOTOSHOP_WEB_FILTER_CATEGORIES = [
  "glitch",
  "dither",
  "halftone",
  "colorhalftone",
  "duotone",
  "tritone",
  "cartoon",
  "threshold",
  "pixelate",
  "mosaic",
  "motionBlur",
  "bokehBlur",
  "radialBlur",
  "lensDistortion",
  "bloom",
  "grain",
  "noise",
  "lightLeak",
  "sparkles",
  "tileGrid",
  "linearRepeater",
  "radialWaves",
  "prism",
  "twirl",
] as const;

export type PhotoshopWebFilterCategory =
  (typeof PHOTOSHOP_WEB_FILTER_CATEGORIES)[number];

/**
 * `WebFilterPresets.chunk.C-Wm1ZUu.js`의 `v = new Set(["lightLeak","linearRepeater","prism","sparkles","tileGrid","radialWaves"])`
 * 고급 프로시저럴 효과 게이트 집합.
 */
export const PHOTOSHOP_ADVANCED_PROCEDURAL_CATEGORIES: ReadonlySet<PhotoshopWebFilterCategory> =
  new Set<PhotoshopWebFilterCategory>([
    "lightLeak",
    "linearRepeater",
    "prism",
    "sparkles",
    "tileGrid",
    "radialWaves",
  ]);

export interface PhotoshopFilterParameterEntry {
  readonly name: string;
  readonly value: readonly number[];
}

export interface PhotoshopWebFilterPreset {
  readonly name: string;
  readonly uiName: string;
  readonly category: PhotoshopWebFilterCategory;
  readonly previewPath?: string;
  readonly isSuperPreset?: boolean;
  readonly parameters: readonly PhotoshopFilterParameterEntry[];
}

export interface PhotoshopHomeFeaturedEffectItem {
  readonly effectName: PhotoshopWebFilterCategory;
  readonly presetName?: string;
  readonly presetImage?: string;
}

/**
 * `HomeEffectsPanel.chunk.CIAUJBBc.js`의 유료 권한(`isEntitled`)별 홈 추천 효과 카드 목록.
 */
export const PHOTOSHOP_HOME_ENTITLED_EFFECT_CARDS: readonly PhotoshopHomeFeaturedEffectItem[] =
  Object.freeze([
    { effectName: "motionBlur" },
    { effectName: "motionBlur", presetName: "slidingDoor", presetImage: "walking-men_v1.jpg" },
    { effectName: "motionBlur", presetName: "shootingStar", presetImage: "woman-disco-ball_v1.jpg" },
    { effectName: "halftone" },
    { effectName: "halftone", presetName: "dollarBill", presetImage: "eye_v1.jpg" },
    {
      effectName: "halftone",
      presetName: "swissInternational",
      presetImage: "basketball_v1.jpg",
    },
    { effectName: "glitch" },
    { effectName: "glitch", presetName: "longShift", presetImage: "woman-dress_v1.jpg" },
    { effectName: "glitch", presetName: "vibeShift", presetImage: "car-door_v1.jpg" },
  ]);

export const PHOTOSHOP_HOME_FREE_EFFECT_CARDS: readonly PhotoshopHomeFeaturedEffectItem[] =
  Object.freeze([
    { effectName: "bokehBlur" },
    { effectName: "motionBlur" },
    { effectName: "glitch" },
    { effectName: "halftone" },
    { effectName: "colorhalftone" },
    { effectName: "bloom" },
    { effectName: "cartoon" },
  ]);

export const PHOTOSHOP_WEB_FILTER_CATEGORY_LABELS: Readonly<
  Record<PhotoshopWebFilterCategory, string>
> = Object.freeze({
  glitch: "글리치 (Glitch)",
  dither: "디더 (Dither)",
  halftone: "하프톤 (Halftone)",
  colorhalftone: "컬러 하프톤 (Color Halftone)",
  duotone: "듀오톤 (Duotone)",
  tritone: "트라이톤 (Tritone)",
  cartoon: "카툰/코믹 (Cartoon)",
  threshold: "포토카피/임계값 (Photocopy Threshold)",
  pixelate: "픽셀화 (Pixelate)",
  mosaic: "모자이크 (Mosaic)",
  motionBlur: "모션 블러 (Motion Blur)",
  bokehBlur: "보케 블러 (Bokeh Blur)",
  radialBlur: "방사형 블러 (Radial Blur)",
  lensDistortion: "렌즈 왜곡 (Lens Distortion)",
  bloom: "블룸 광채 (Bloom)",
  grain: "필름 그레인 (Grain)",
  noise: "노이즈 (Noise)",
  lightLeak: "라이트 리크 (Light Leak)",
  sparkles: "스파클 플레어 (Sparkles)",
  tileGrid: "타일 그리드 (Tile Grid)",
  linearRepeater: "리니어 리피터 (Linear Repeater)",
  radialWaves: "방사형 파동 (Radial Waves)",
  prism: "프리즘 유리 (Prism)",
  twirl: "소용돌이 (Twirl)",
});

export const PHOTOSHOP_WEB_FILTER_PRESETS: readonly PhotoshopWebFilterPreset[] =
  Object.freeze([
    ...PHOTOSHOP_WEB_FILTER_PRESETS_PART_A,
    ...PHOTOSHOP_WEB_FILTER_PRESETS_PART_B,
  ]);

export interface PhotoshopWebFilterQueryOptions {
  readonly includeAdvancedProcedural?: boolean;
  readonly superPresetsOnly?: boolean;
}

/**
 * `WebFilterPresets.chunk.C-Wm1ZUu.js`의 `i()` / `p()` / `c(category)` / `f(presetName)` 게이팅 동작을 재현한다.
 */
export function listPhotoshopWebFilterPresets(
  options: PhotoshopWebFilterQueryOptions = {},
): readonly PhotoshopWebFilterPreset[] {
  const includeAdvanced = options.includeAdvancedProcedural ?? true;
  const superOnly = options.superPresetsOnly ?? false;
  return PHOTOSHOP_WEB_FILTER_PRESETS.filter((preset) => {
    if (!includeAdvanced && PHOTOSHOP_ADVANCED_PROCEDURAL_CATEGORIES.has(preset.category)) {
      return false;
    }
    if (superOnly && !preset.isSuperPreset) {
      return false;
    }
    return true;
  });
}

export function getPhotoshopWebFilterPresetsByCategory(
  category: PhotoshopWebFilterCategory,
  options: PhotoshopWebFilterQueryOptions = {},
): readonly PhotoshopWebFilterPreset[] {
  return listPhotoshopWebFilterPresets(options).filter(
    (preset) => preset.category === category,
  );
}

export function findPhotoshopWebFilterPresetByName(
  presetName: string,
  options: PhotoshopWebFilterQueryOptions = {},
): PhotoshopWebFilterPreset | undefined {
  return listPhotoshopWebFilterPresets(options).find(
    (preset) => preset.name === presetName,
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

function readParam(
  params: readonly PhotoshopFilterParameterEntry[],
  name: string,
  fallback: readonly number[],
): readonly number[] {
  const found = params.find((entry) => entry.name === name);
  if (!found || found.value.length === 0) return fallback;
  return found.value.map((n, idx) => (Number.isFinite(n) ? n : (fallback[idx] ?? 0)));
}

function samplePixelClamped(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const cx = Math.min(width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(height - 1, Math.max(0, Math.round(y)));
  const idx = (cy * width + cx) * 4;
  return [
    rgba[idx] ?? 0,
    rgba[idx + 1] ?? 0,
    rgba[idx + 2] ?? 0,
    rgba[idx + 3] ?? 255,
  ];
}

const BAYER_4X4: readonly (readonly number[])[] = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

/**
 * 포토샵 웹 필터 프리셋(24개 카테고리 전체 지원)을 RGBA 픽셀 버퍼에 결정론적으로 적용한다.
 * 원본 알파 채널을 보존하고 모든 부동소수점 입력에 `Number.isFinite` 방어를 수행한다.
 */
export function applyPhotoshopWebFilterPresetToRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  presetOrConfig: {
    readonly category: PhotoshopWebFilterCategory;
    readonly parameters: readonly PhotoshopFilterParameterEntry[];
  },
): Uint8ClampedArray {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const out = new Uint8ClampedArray(rgba.length);
  const { category, parameters } = presetOrConfig;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = (y * safeW + x) * 4;
      const r0 = (rgba[idx] ?? 0) / 255;
      const g0 = (rgba[idx + 1] ?? 0) / 255;
      const b0 = (rgba[idx + 2] ?? 0) / 255;
      const a0 = rgba[idx + 3] ?? 255;
      const luma = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;

      let r = r0;
      let g = g0;
      let b = b0;

      switch (category) {
        case "glitch": {
          const colorIntensity = clamp01(readParam(parameters, "colorIntensity", [0.3])[0]!);
          const angleRad = ((readParam(parameters, "angle", [0])[0]! * Math.PI) / 180);
          const strength = clamp01(readParam(parameters, "strength", [0.1])[0]!);
          const shiftPx = Math.max(1, Math.round((colorIntensity * 6 + strength * 8)));
          const dx = Math.cos(angleRad) * shiftPx;
          const dy = Math.sin(angleRad) * shiftPx;
          const [rShift] = samplePixelClamped(rgba, safeW, safeH, x + dx, y + dy);
          const [, , bShift] = samplePixelClamped(rgba, safeW, safeH, x - dx, y - dy);
          r = rShift / 255;
          b = bShift / 255;
          break;
        }
        case "dither": {
          const colorCount = Math.max(2, Math.round(readParam(parameters, "colorCount", [2])[0]!));
          const mono = readParam(parameters, "monochrome", [1])[0]! >= 0.5;
          const threshold = BAYER_4X4[y % 4]![x % 4]! - 0.5;
          const levels = colorCount - 1;
          if (mono) {
            const q = Math.round(clamp01(luma + threshold / levels) * levels) / levels;
            r = q;
            g = q;
            b = q;
          } else {
            r = Math.round(clamp01(r0 + threshold / levels) * levels) / levels;
            g = Math.round(clamp01(g0 + threshold / levels) * levels) / levels;
            b = Math.round(clamp01(b0 + threshold / levels) * levels) / levels;
          }
          break;
        }
        case "halftone": {
          const c1 = readParam(parameters, "color1", [0.95, 0.95, 0.95, 1]);
          const c2 = readParam(parameters, "color2", [0.1, 0.1, 0.1, 1]);
          const contrast = clamp01(readParam(parameters, "contrast", [0.7])[0]!);
          const pattern = 0.5 + 0.5 * Math.sin((x + y) * 1.4);
          const mix = clamp01((luma - 0.5) * (1 + contrast * 2) + 0.5 * pattern);
          r = c2[0]! * (1 - mix) + c1[0]! * mix;
          g = c2[1]! * (1 - mix) + c1[1]! * mix;
          b = c2[2]! * (1 - mix) + c1[2]! * mix;
          break;
        }
        case "colorhalftone": {
          const contrast = clamp01(readParam(parameters, "contrast", [0.7])[0]!);
          const dotR = 0.5 + 0.5 * Math.cos(x * 1.3);
          const dotG = 0.5 + 0.5 * Math.cos((x + y) * 1.1);
          const dotB = 0.5 + 0.5 * Math.sin(y * 1.3);
          r = clamp01(r0 * (1 - contrast * 0.4) + dotR * contrast * 0.4 * r0);
          g = clamp01(g0 * (1 - contrast * 0.4) + dotG * contrast * 0.4 * g0);
          b = clamp01(b0 * (1 - contrast * 0.4) + dotB * contrast * 0.4 * b0);
          break;
        }
        case "duotone": {
          const fg = readParam(parameters, "color", [0.9, 0.2, 0.15, 1]);
          const bg = readParam(parameters, "backgroundColor", [0.7, 0.98, 0.99, 1]);
          const level = clamp01(readParam(parameters, "level", [0.4])[0]!);
          const contrast = clamp01(readParam(parameters, "contrast", [0.2])[0]!);
          const t = clamp01((luma - level) * (1 + contrast * 2) + 0.5);
          r = fg[0]! * (1 - t) + bg[0]! * t;
          g = fg[1]! * (1 - t) + bg[1]! * t;
          b = fg[2]! * (1 - t) + bg[2]! * t;
          break;
        }
        case "tritone": {
          const c1 = readParam(parameters, "color1", [0.9, 0.2, 0.15, 1]);
          const c2 = readParam(parameters, "color2", [0.97, 1, 0.33, 1]);
          const c3 = readParam(parameters, "color3", [0.32, 0.72, 0.88, 1]);
          const lvl1 = clamp01(readParam(parameters, "level", [0.55])[0]!);
          if (luma < lvl1) {
            const u = clamp01(luma / Math.max(0.05, lvl1));
            r = c3[0]! * (1 - u) + c2[0]! * u;
            g = c3[1]! * (1 - u) + c2[1]! * u;
            b = c3[2]! * (1 - u) + c2[2]! * u;
          } else {
            const u = clamp01((luma - lvl1) / Math.max(0.05, 1 - lvl1));
            r = c2[0]! * (1 - u) + c1[0]! * u;
            g = c2[1]! * (1 - u) + c1[1]! * u;
            b = c2[2]! * (1 - u) + c1[2]! * u;
          }
          break;
        }
        case "cartoon": {
          const colorCount = Math.max(1, Math.round(readParam(parameters, "colorCount", [2])[0]!));
          const sat = Math.max(0, readParam(parameters, "saturation", [1])[0]!);
          const [rn, gn, bn] = samplePixelClamped(rgba, safeW, safeH, x + 1, y);
          const edge =
            Math.abs(r0 - rn / 255) + Math.abs(g0 - gn / 255) + Math.abs(b0 - bn / 255);
          const steps = Math.max(2, colorCount + 1);
          const qr = Math.round(r0 * steps) / steps;
          const qg = Math.round(g0 * steps) / steps;
          const qb = Math.round(b0 * steps) / steps;
          const edgeDarken = edge > 0.25 ? 0.25 : 1;
          r = clamp01((luma + (qr - luma) * sat) * edgeDarken);
          g = clamp01((luma + (qg - luma) * sat) * edgeDarken);
          b = clamp01((luma + (qb - luma) * sat) * edgeDarken);
          break;
        }
        case "threshold": {
          const level = clamp01(readParam(parameters, "level", [0.5])[0]!);
          const contrast = clamp01(readParam(parameters, "contrast", [0.85])[0]!);
          const ink = readParam(parameters, "color", [0, 0, 0, 1]);
          const paper = readParam(parameters, "backgroundColor", [1, 1, 1, 1]);
          const slope = 1 + contrast * 8;
          const t = clamp01((luma - level) * slope + 0.5);
          r = ink[0]! * (1 - t) + paper[0]! * t;
          g = ink[1]! * (1 - t) + paper[1]! * t;
          b = ink[2]! * (1 - t) + paper[2]! * t;
          break;
        }
        case "pixelate":
        case "mosaic":
        case "tileGrid": {
          const scale = clamp01(readParam(parameters, "scale", [0.35])[0]!);
          const blockSize = Math.max(2, Math.round(2 + scale * 8));
          const bx = Math.floor(x / blockSize) * blockSize;
          const by = Math.floor(y / blockSize) * blockSize;
          const [pr, pg, pb] = samplePixelClamped(rgba, safeW, safeH, bx, by);
          r = pr / 255;
          g = pg / 255;
          b = pb / 255;
          break;
        }
        case "motionBlur":
        case "bokehBlur":
        case "radialBlur": {
          const strength = clamp01(readParam(parameters, "strength", [0.5])[0]!);
          const angleRad = ((readParam(parameters, "angle", [0])[0]! * Math.PI) / 180);
          const stepX = Math.cos(angleRad) * Math.max(1, strength * 3);
          const stepY = Math.sin(angleRad) * Math.max(1, strength * 3);
          const [r1, g1, b1] = samplePixelClamped(rgba, safeW, safeH, x - stepX, y - stepY);
          const [r2, g2, b2] = samplePixelClamped(rgba, safeW, safeH, x + stepX, y + stepY);
          r = (r0 * 2 + r1 / 255 + r2 / 255) / 4;
          g = (g0 * 2 + g1 / 255 + g2 / 255) / 4;
          b = (b0 * 2 + b1 / 255 + b2 / 255) / 4;
          break;
        }
        case "lensDistortion":
        case "prism":
        case "radialWaves":
        case "twirl": {
          const strength = readParam(parameters, "strength", [0.3])[0]!;
          const cx = (safeW - 1) / 2;
          const cy = (safeH - 1) / 2;
          const dx = x - cx;
          const dy = y - cy;
          const angle = strength * 0.6;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const sx = cx + dx * cosA - dy * sinA;
          const sy = cy + dx * sinA + dy * cosA;
          const [sr, sg, sb] = samplePixelClamped(rgba, safeW, safeH, sx, sy);
          r = sr / 255;
          g = sg / 255;
          b = sb / 255;
          break;
        }
        case "bloom":
        case "lightLeak":
        case "sparkles": {
          const intensity = clamp01(
            readParam(parameters, "intensity", readParam(parameters, "strength", [0.6]))[0]!,
          );
          const tint = readParam(parameters, "color", [1, 0.7, 0.2]);
          const boost = intensity * Math.max(0.2, luma);
          r = clamp01(r0 + tint[0]! * boost * 0.45);
          g = clamp01(g0 + tint[1]! * boost * 0.45);
          b = clamp01(b0 + tint[2]! * boost * 0.45);
          break;
        }
        case "grain":
        case "noise": {
          const intensity = clamp01(readParam(parameters, "intensity", [0.4])[0]!);
          const hash = Math.sin((x * 12.9898 + y * 78.233) * 1.13) * 43758.5453;
          const grain = (hash - Math.floor(hash) - 0.5) * intensity * 0.5;
          r = clamp01(r0 + grain);
          g = clamp01(g0 + grain);
          b = clamp01(b0 + grain);
          break;
        }
        case "linearRepeater": {
          const elements = Math.max(2, Math.round(readParam(parameters, "elements", [6])[0]!));
          const echoShift = Math.max(1, Math.round(safeW / elements));
          const [er, eg, eb] = samplePixelClamped(rgba, safeW, safeH, x - echoShift, y);
          r = clamp01(r0 * 0.65 + (er / 255) * 0.35);
          g = clamp01(g0 * 0.65 + (eg / 255) * 0.35);
          b = clamp01(b0 * 0.65 + (eb / 255) * 0.35);
          break;
        }
      }

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = a0;
    }
  }

  return out;
}
