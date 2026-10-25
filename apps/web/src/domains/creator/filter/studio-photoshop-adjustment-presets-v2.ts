/**
 * Adobe Photoshop Web (v2026.21.0.0) Adjustment Presets V2 카탈로그 및 RGBA 픽셀 커널
 *
 * `adjustmentPresetsV2.chunk.Oj-cp__5.js` (`ev_22fe4bb97fc6cc13f65ac8165ba8237ddf5db41320e2a4fbd0e57c9d4567d30e`)
 * 및 `Learn.chunk.I5kiN6gO.js`에서 추출한 31개 비파괴 조정 프리셋을 클린룸 구현한다.
 */

export type PhotoshopAdjustmentPresetCategoryId =
  | "cinematic"
  | "black_and_white"
  | "environment"
  | "portrait"
  | "creative";

export interface PhotoshopAdjustmentPresetV2 {
  readonly id: string;
  readonly categoryId: PhotoshopAdjustmentPresetCategoryId;
  readonly name: string;
  readonly previewFile: string;
  readonly layerTypes: readonly (
    | "curves"
    | "levels"
    | "colorBalance"
    | "hueSaturation"
    | "vibrance"
    | "brightnessEvent"
    | "exposure"
    | "blackAndWhite"
    | "solidColorLayer"
  )[];
  readonly toneProfile: {
    readonly contrastDelta: number;
    readonly brightnessDelta: number;
    readonly saturationDelta: number;
    readonly warmthDelta: number;
    readonly tintRgb?: readonly [number, number, number];
    readonly monochrome?: boolean;
    readonly matteLift?: number;
  };
}

export const PHOTOSHOP_ADJUSTMENT_PRESETS_V2: readonly PhotoshopAdjustmentPresetV2[] =
  Object.freeze([
    // Cinematic (11)
    {
      id: "cinematic_cine_neutral",
      categoryId: "cinematic",
      name: "시네 뉴트럴 (Cine neutral)",
      previewFile: "cine_neutral_v0.png",
      layerTypes: ["curves", "curves", "colorBalance", "hueSaturation"],
      toneProfile: { contrastDelta: 0.12, brightnessDelta: 0.02, saturationDelta: -0.1, warmthDelta: 0.04 },
    },
    {
      id: "cinematic_cine_matte",
      categoryId: "cinematic",
      name: "시네 매트 (Cine matte)",
      previewFile: "cine_matte_v0.png",
      layerTypes: ["curves", "vibrance", "hueSaturation", "colorBalance"],
      toneProfile: { contrastDelta: 0.08, brightnessDelta: 0.04, saturationDelta: -0.15, warmthDelta: -0.03, matteLift: 0.08 },
    },
    {
      id: "cinematic_cine_clean",
      categoryId: "cinematic",
      name: "시네 클린 (Cine clean)",
      previewFile: "cine_clean_v0.png",
      layerTypes: ["curves", "solidColorLayer", "solidColorLayer", "colorBalance"],
      toneProfile: { contrastDelta: 0.1, brightnessDelta: 0.05, saturationDelta: 0.02, warmthDelta: 0.05, matteLift: 0.06 },
    },
    {
      id: "cinematic_cine_soft",
      categoryId: "cinematic",
      name: "시네 소프트 (Cine soft)",
      previewFile: "cine_soft_v0.png",
      layerTypes: ["curves", "colorBalance"],
      toneProfile: { contrastDelta: -0.05, brightnessDelta: 0.05, saturationDelta: -0.05, warmthDelta: -0.04, matteLift: 0.05 },
    },
    {
      id: "cinematic_cine_glow",
      categoryId: "cinematic",
      name: "시네 글로우 (Cine glow)",
      previewFile: "cine_glow_v0.png",
      layerTypes: ["curves", "solidColorLayer", "colorBalance"],
      toneProfile: { contrastDelta: 0.06, brightnessDelta: 0.06, saturationDelta: 0.08, warmthDelta: 0.14, tintRgb: [0.97, 0.8, 0.4] },
    },
    {
      id: "cinematic_cine_green",
      categoryId: "cinematic",
      name: "시네 그린 (Cine green)",
      previewFile: "cine_green_v0.png",
      layerTypes: ["curves", "colorBalance"],
      toneProfile: { contrastDelta: 0.08, brightnessDelta: 0.02, saturationDelta: -0.04, warmthDelta: -0.08, tintRgb: [0.25, 0.85, 0.45] },
    },
    {
      id: "cinematic_cine_golden",
      categoryId: "cinematic",
      name: "시네 골든 (Cine golden)",
      previewFile: "cine_golden_v0.png",
      layerTypes: ["levels", "exposure", "brightnessEvent", "curves", "curves", "hueSaturation", "vibrance", "colorBalance"],
      toneProfile: { contrastDelta: 0.16, brightnessDelta: 0.03, saturationDelta: 0.22, warmthDelta: 0.25 },
    },
    {
      id: "cinematic_cine_teal",
      categoryId: "cinematic",
      name: "시네 틸 (Cine teal)",
      previewFile: "cine_teal_v0.png",
      layerTypes: ["levels", "curves", "vibrance", "hueSaturation", "colorBalance"],
      toneProfile: { contrastDelta: 0.12, brightnessDelta: 0, saturationDelta: 0.15, warmthDelta: -0.18, tintRgb: [0.15, 0.75, 0.85] },
    },
    {
      id: "cinematic_cine_blue",
      categoryId: "cinematic",
      name: "시네 블루 (Cine blue)",
      previewFile: "cine_blue_v0.png",
      layerTypes: ["curves", "vibrance", "hueSaturation", "colorBalance"],
      toneProfile: { contrastDelta: 0.1, brightnessDelta: 0.01, saturationDelta: 0.1, warmthDelta: -0.22, tintRgb: [0.2, 0.5, 0.95] },
    },
    {
      id: "cinematic_cine_cool",
      categoryId: "cinematic",
      name: "시네 쿨 (Cine cool)",
      previewFile: "cine_cool_v0.png",
      layerTypes: ["curves", "vibrance", "hueSaturation", "colorBalance", "brightnessEvent"],
      toneProfile: { contrastDelta: 0.09, brightnessDelta: -0.02, saturationDelta: -0.12, warmthDelta: -0.16 },
    },
    {
      id: "cinematic_cine_warm",
      categoryId: "cinematic",
      name: "시네 웜 (Cine warm)",
      previewFile: "cine_warm_v0.png",
      layerTypes: ["curves", "hueSaturation", "colorBalance"],
      toneProfile: { contrastDelta: 0.08, brightnessDelta: 0.03, saturationDelta: 0.1, warmthDelta: 0.18 },
    },
    // Black and White (5)
    {
      id: "black_and_white_mono_velvet",
      categoryId: "black_and_white",
      name: "모노 벨벳 (Mono velvet)",
      previewFile: "mono_velvet_v0.png",
      layerTypes: ["blackAndWhite", "curves"],
      toneProfile: { contrastDelta: 0.18, brightnessDelta: 0.08, saturationDelta: -1, warmthDelta: 0, monochrome: true, matteLift: 0.12 },
    },
    {
      id: "black_and_white_mono_film",
      categoryId: "black_and_white",
      name: "모노 필름 (Mono film)",
      previewFile: "mono_film_v0.png",
      layerTypes: ["blackAndWhite", "curves"],
      toneProfile: { contrastDelta: 0.22, brightnessDelta: 0.02, saturationDelta: -1, warmthDelta: 0, monochrome: true },
    },
    {
      id: "black_and_white_mono_silver",
      categoryId: "black_and_white",
      name: "모노 실버 (Mono silver)",
      previewFile: "mono_silver_v0.png",
      layerTypes: ["blackAndWhite", "curves", "levels", "colorBalance"],
      toneProfile: { contrastDelta: 0.2, brightnessDelta: 0.05, saturationDelta: -0.95, warmthDelta: -0.06, monochrome: true },
    },
    {
      id: "black_and_white_mono_soft",
      categoryId: "black_and_white",
      name: "모노 소프트 (Mono soft)",
      previewFile: "mono_soft_v0.png",
      layerTypes: ["blackAndWhite", "levels", "curves"],
      toneProfile: { contrastDelta: -0.04, brightnessDelta: 0.06, saturationDelta: -1, warmthDelta: 0, monochrome: true, matteLift: 0.14 },
    },
    {
      id: "black_and_white_mono_noir",
      categoryId: "black_and_white",
      name: "모노 느와르 (Mono noir)",
      previewFile: "mono_noir_v0.png",
      layerTypes: ["blackAndWhite", "curves", "levels"],
      toneProfile: { contrastDelta: 0.34, brightnessDelta: -0.06, saturationDelta: -1, warmthDelta: 0, monochrome: true },
    },
    // Environment (9)
    {
      id: "environment_atmos_neutral",
      categoryId: "environment",
      name: "애트모스 뉴트럴 (Atmos neutral)",
      previewFile: "neutral_v0.png",
      layerTypes: ["brightnessEvent", "vibrance"],
      toneProfile: { contrastDelta: 0.04, brightnessDelta: 0.08, saturationDelta: 0.08, warmthDelta: 0 },
    },
    {
      id: "environment_atmos_rich_contrast",
      categoryId: "environment",
      name: "애트모스 리치 컨트라스트 (Atmos rich contrast)",
      previewFile: "rich_contrast_v0.png",
      layerTypes: ["brightnessEvent", "curves", "hueSaturation", "colorBalance", "exposure"],
      toneProfile: { contrastDelta: 0.24, brightnessDelta: -0.02, saturationDelta: -0.05, warmthDelta: 0.03 },
    },
    {
      id: "environment_atmos_vivid",
      categoryId: "environment",
      name: "애트모스 비비드 (Atmos vivid)",
      previewFile: "vivid_v0.png",
      layerTypes: ["brightnessEvent", "vibrance", "hueSaturation", "curves"],
      toneProfile: { contrastDelta: 0.14, brightnessDelta: 0.03, saturationDelta: 0.28, warmthDelta: 0.04 },
    },
    {
      id: "environment_atmos_green_boost",
      categoryId: "environment",
      name: "애트모스 그린 부스트 (Atmos green boost)",
      previewFile: "green_boost_v0.png",
      layerTypes: ["hueSaturation", "curves", "vibrance"],
      toneProfile: { contrastDelta: 0.08, brightnessDelta: 0.04, saturationDelta: 0.22, warmthDelta: -0.05, tintRgb: [0.3, 0.9, 0.4] },
    },
    {
      id: "environment_atmos_hazy_blue",
      categoryId: "environment",
      name: "애트모스 헤이지 블루 (Atmos hazy blue)",
      previewFile: "hazy_blue_v0.png",
      layerTypes: ["hueSaturation", "curves", "levels", "colorBalance", "brightnessEvent"],
      toneProfile: { contrastDelta: -0.06, brightnessDelta: 0.04, saturationDelta: -0.08, warmthDelta: -0.18, matteLift: 0.09 },
    },
    {
      id: "environment_atmos_purple_haze",
      categoryId: "environment",
      name: "애트모스 퍼플 헤이즈 (Atmos purple haze)",
      previewFile: "purple_haze_v0.png",
      layerTypes: ["hueSaturation", "curves", "levels", "colorBalance", "brightnessEvent"],
      toneProfile: { contrastDelta: -0.04, brightnessDelta: 0.03, saturationDelta: 0.06, warmthDelta: -0.08, tintRgb: [0.65, 0.35, 0.9], matteLift: 0.09 },
    },
    {
      id: "environment_atmos_blue_teal",
      categoryId: "environment",
      name: "애트모스 블루 틸 (Atmos blue teal)",
      previewFile: "blue_teal_v0.png",
      layerTypes: ["curves", "hueSaturation", "colorBalance"],
      toneProfile: { contrastDelta: 0.1, brightnessDelta: 0.02, saturationDelta: 0.12, warmthDelta: -0.16, tintRgb: [0.15, 0.7, 0.9] },
    },
    {
      id: "environment_atmos_teal_orange",
      categoryId: "environment",
      name: "애트모스 틸 앤 오렌지 (Atmos teal orange)",
      previewFile: "teal_orange_v0.png",
      layerTypes: ["curves", "colorBalance", "vibrance"],
      toneProfile: { contrastDelta: 0.18, brightnessDelta: 0.02, saturationDelta: 0.16, warmthDelta: 0.12 },
    },
    {
      id: "environment_atmos_sunset_glow",
      categoryId: "environment",
      name: "애트모스 선셋 글로우 (Atmos sunset glow)",
      previewFile: "sunset_glow_v0.png",
      layerTypes: ["hueSaturation", "curves", "colorBalance"],
      toneProfile: { contrastDelta: 0.12, brightnessDelta: -0.02, saturationDelta: 0.2, warmthDelta: 0.24, tintRgb: [0.98, 0.55, 0.25] },
    },
    {
      id: "environment_atmos_golden_hour",
      categoryId: "environment",
      name: "애트모스 골든 아워 (Atmos golden hour)",
      previewFile: "golden_hour_v0.png",
      layerTypes: ["hueSaturation", "curves", "colorBalance", "solidColorLayer"],
      toneProfile: { contrastDelta: 0.14, brightnessDelta: 0.05, saturationDelta: 0.18, warmthDelta: 0.28, tintRgb: [0.99, 0.66, 0] },
    },
    // Portrait (4)
    {
      id: "portrait_tone_matte",
      categoryId: "portrait",
      name: "포트레이트 톤 매트 (Tone matte)",
      previewFile: "tone_matte_v1.png",
      layerTypes: ["curves", "levels", "vibrance"],
      toneProfile: { contrastDelta: 0.06, brightnessDelta: 0.05, saturationDelta: 0.05, warmthDelta: 0.03, matteLift: 0.11 },
    },
    {
      id: "portrait_tone_neutral",
      categoryId: "portrait",
      name: "포트레이트 톤 뉴트럴 (Tone neutral)",
      previewFile: "tone_neutral_v1.png",
      layerTypes: ["curves", "levels", "hueSaturation"],
      toneProfile: { contrastDelta: 0.1, brightnessDelta: 0.04, saturationDelta: -0.04, warmthDelta: 0.01 },
    },
    {
      id: "portrait_tone_cool",
      categoryId: "portrait",
      name: "포트레이트 톤 쿨 (Tone cool)",
      previewFile: "tone_cool_v1.png",
      layerTypes: ["curves", "colorBalance", "hueSaturation"],
      toneProfile: { contrastDelta: 0.08, brightnessDelta: 0.02, saturationDelta: -0.06, warmthDelta: -0.14 },
    },
    {
      id: "portrait_tone_warm",
      categoryId: "portrait",
      name: "포트레이트 톤 웜 (Tone warm)",
      previewFile: "tone_warm_v1.png",
      layerTypes: ["curves", "brightnessEvent", "vibrance", "hueSaturation", "colorBalance"],
      toneProfile: { contrastDelta: 0.09, brightnessDelta: 0.05, saturationDelta: 0.18, warmthDelta: 0.16 },
    },
    // Creative (from Learn.chunk.I5kiN6gO.js)
    {
      id: "creative_color_pop",
      categoryId: "creative",
      name: "크리에이티브 컬러 팝 (Color pop)",
      previewFile: "color_pop_v1.png",
      layerTypes: ["vibrance", "hueSaturation", "curves"],
      toneProfile: { contrastDelta: 0.18, brightnessDelta: 0.03, saturationDelta: 0.35, warmthDelta: 0.06 },
    },
  ]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * 조정 프리셋 V2(`PhotoshopAdjustmentPresetV2`)를 RGBA 픽셀 버퍼에 결정론적으로 적용한다.
 */
export function applyPhotoshopAdjustmentPresetV2ToRgba(
  rgba: Uint8ClampedArray,
  presetId: string,
): Uint8ClampedArray {
  const preset = PHOTOSHOP_ADJUSTMENT_PRESETS_V2.find((item) => item.id === presetId);
  if (!preset) {
    throw new TypeError(`Unknown Photoshop Adjustment Preset V2: ${presetId}`);
  }
  const {
    contrastDelta,
    brightnessDelta,
    saturationDelta,
    warmthDelta,
    tintRgb,
    monochrome,
    matteLift = 0,
  } = preset.toneProfile;

  const out = new Uint8ClampedArray(rgba.length);
  for (let idx = 0; idx < rgba.length; idx += 4) {
    let r = (rgba[idx] ?? 0) / 255;
    let g = (rgba[idx + 1] ?? 0) / 255;
    let b = (rgba[idx + 2] ?? 0) / 255;
    const a = rgba[idx + 3] ?? 255;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (monochrome) {
      r = luma;
      g = luma;
      b = luma;
    } else {
      const satFactor = Math.max(0, 1 + saturationDelta);
      r = luma + (r - luma) * satFactor;
      g = luma + (g - luma) * satFactor;
      b = luma + (b - luma) * satFactor;
    }

    const contrastFactor = Math.max(0.2, 1 + contrastDelta);
    r = (r - 0.5) * contrastFactor + 0.5 + brightnessDelta;
    g = (g - 0.5) * contrastFactor + 0.5 + brightnessDelta;
    b = (b - 0.5) * contrastFactor + 0.5 + brightnessDelta;

    if (matteLift > 0) {
      r = matteLift + r * (1 - matteLift);
      g = matteLift + g * (1 - matteLift);
      b = matteLift + b * (1 - matteLift);
    }

    r += warmthDelta * 0.14;
    b -= warmthDelta * 0.14;

    if (tintRgb) {
      r = r * 0.85 + tintRgb[0] * 0.15;
      g = g * 0.85 + tintRgb[1] * 0.15;
      b = b * 0.85 + tintRgb[2] * 0.15;
    }

    out[idx] = clampByte(clamp01(r) * 255);
    out[idx + 1] = clampByte(clamp01(g) * 255);
    out[idx + 2] = clampByte(clamp01(b) * 255);
    out[idx + 3] = a;
  }

  return out;
}
