/**
 * 3D→2D 작가 그림체 1클릭 동기화 엔진 (축 27 · #131–#135).
 *
 * 100% 온디바이스(₩0) 결정론 연산:
 * 1) 캐릭터 선화 레이어 1장의 RGBA 픽셀에서 주 선색(OKLCH)·평균 선폭(px)·종이 입자량(0~1)을 로컬 추출한다.
 * 2) 추출 프로파일로 3D 6패스(실루엣·내부 주름·밑색·셀 명암/AO·림·종이/색온도 LUT & 심도 블러)를 산출한다.
 * 3) 초점거리·조리개·피사체/배경 거리 기반 박막 렌즈 착란원(CoC)으로 배경 가우시안·보케 블러를 자동 산출한다.
 * 4) 컷 전용 비파괴 포스트-프로세스 오버라이드(#135): 공유 3D 배경 원본 재질을 절대 변경하지 않고
 *    컷 오버라이드 레이어에만 색온도 LUT·선화 틴트·깊이 블러를 기록한다.
 */

import {
  CUT_LIGHTING_PRESETS,
  SIX_PASS_LUT_NODE_COUNT,
  computeShared3dMaterialsHash,
  type CharacterLineLayerSample,
  type CutLightingPresetId,
  type Shared3dBackgroundScene,
  type Shared3dMaterialSpec,
} from "./artist-style-6pass-presets";
import {
  clampNumber,
  formatOklchCss,
  normalizeHueDeg,
  oklabToOklch,
  oklchToRgb,
  rgbToOklab,
  roundToDigits,
  type OklchColor,
  type RgbColor,
} from "./pro-drawing-8-tools-color";

export {
  CUT_LIGHTING_PRESETS,
  CUT_LIGHTING_PRESET_IDS,
  DEFAULT_ARTIST_LINE_PRESETS,
  DEFAULT_SHARED_3D_CLASSROOM_SCENE,
  SIX_PASS_LUT_NODE_COUNT,
  buildSyntheticCharacterLineLayer,
  computeShared3dMaterialsHash,
  createShared3dBackgroundScene,
  type ArtistLineSamplePreset,
  type CharacterLineLayerSample,
  type CutLightingPresetId,
  type CutLightingPresetSpec,
  type Shared3dBackgroundScene,
  type Shared3dMaterialSpec,
} from "./artist-style-6pass-presets";

export interface ArtistLineLayerProfile {
  readonly layerId: string;
  readonly layerName: string;
  readonly dominantLineColorRgb: RgbColor;
  readonly dominantLineColorOklch: OklchColor;
  readonly dominantLineCssOklch: string;
  readonly averageStrokeWidthPx: number;
  readonly minStrokeWidthPx: number;
  readonly maxStrokeWidthPx: number;
  readonly strokeWidthVariancePx: number;
  readonly paperGrainAmount: number;
  readonly paperGrainScale: number;
  readonly recommendedPaperOverlayOpacity: number;
  readonly inkPixelCount: number;
  readonly inkCoveragePercent: number;
  readonly estimatedInkKelvin: number;
}

export interface FocalDepthBlurInput {
  readonly focalLengthMm: number;
  readonly apertureFStop: number;
  readonly subjectDistanceM: number;
  readonly backgroundDistanceM: number;
  readonly sensorWidthMm?: number;
  readonly renderWidthPx?: number;
}

export interface FocalDepthBlurSpec {
  readonly focalLengthMm: number;
  readonly apertureFStop: number;
  readonly subjectDistanceM: number;
  readonly backgroundDistanceM: number;
  readonly circleOfConfusionMm: number;
  readonly gaussianRadiusPx: number;
  readonly bokehDiskRadiusPx: number;
  readonly bokehBladeCount: 6 | 7 | 9;
  readonly nearFocusM: number;
  readonly farFocusM: number;
  readonly hyperfocalM: number;
  readonly depthSeparationScore: number;
  readonly blurPresetKo: string;
}

export interface ColorTemperatureLutNode {
  readonly index: number;
  readonly inputLuminance: number;
  readonly rGain: number;
  readonly gGain: number;
  readonly bGain: number;
  readonly outputLuminance: number;
}

export interface ThreeDSixPassSyncPlan {
  readonly sourceLayerId: string;
  readonly lightingPresetId: CutLightingPresetId;
  readonly syncStrength: number;
  readonly extractedProfile: ArtistLineLayerProfile;
  readonly pass1SilhouetteOutline: {
    readonly lineTintOklch: OklchColor;
    readonly lineTintCss: string;
    readonly strokeWidthPx: number;
    readonly edgeTaperRatio: number;
  };
  readonly pass2CreaseInterior: {
    readonly lineTintOklch: OklchColor;
    readonly lineTintCss: string;
    readonly strokeWidthPx: number;
    readonly creaseAngleDeg: number;
  };
  readonly pass3FlatAlbedo: {
    readonly saturationScale: number;
    readonly valueFloor: number;
    readonly targetKelvin: number;
  };
  readonly pass4CelShadowAo: {
    readonly shadowTintOklch: OklchColor;
    readonly shadowTintCss: string;
    readonly shadowHardness: number;
    readonly aoStrength: number;
  };
  readonly pass5SpecularRim: {
    readonly rimColorOklch: OklchColor;
    readonly rimColorCss: string;
    readonly rimIntensity: number;
    readonly highlightChromaCap: number;
  };
  readonly pass6PaperPostDof: {
    readonly paperGrainAmount: number;
    readonly paperGrainScale: number;
    readonly paperOverlayOpacity: number;
    readonly colorTemperatureLut17: readonly ColorTemperatureLutNode[];
    readonly depthBlur: FocalDepthBlurSpec;
  };
}

export interface CutPostProcessOverrideLayer {
  readonly overrideLayerId: string;
  readonly cutId: string;
  readonly cutLabel: string;
  readonly sourceSceneId: string;
  readonly lightingPresetId: CutLightingPresetId;
  readonly lightingLabelKo: string;
  readonly targetKelvin: number;
  readonly kelvinShift: number;
  readonly lineTintOverrideOklch: OklchColor;
  readonly lineTintOverrideCss: string;
  readonly strokeWidthPx: number;
  readonly paperGrainOpacity: number;
  readonly colorTemperatureLut17: readonly ColorTemperatureLutNode[];
  readonly depthBlur: FocalDepthBlurSpec;
  readonly blendMode: "post-process-non-destructive";
  readonly enabled: boolean;
  readonly revision: number;
  readonly baseMaterialsHashBefore: string;
  readonly baseMaterialsHashAfter: string;
  readonly sharedMaterialMutated: false;
}

export interface CutPostProcessOverrideStore {
  readonly sourceSceneId: string;
  readonly overridesByCutId: Readonly<Record<string, CutPostProcessOverrideLayer>>;
}

export interface EffectiveCut3dRenderState {
  readonly cutId: string;
  readonly sourceSceneId: string;
  readonly baseMaterialsUntouched: true;
  readonly materialsIntegrityHash: string;
  readonly baseMaterials: readonly Shared3dMaterialSpec[];
  readonly activeOverride: CutPostProcessOverrideLayer | null;
  readonly effectiveLightingLabelKo: string;
  readonly effectiveLineTintCss: string;
  readonly effectiveGaussianBlurPx: number;
}

function srgbLuminance01(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function shortestHueMix(fromDeg: number, toDeg: number, weight: number): number {
  const start = normalizeHueDeg(fromDeg);
  const end = normalizeHueDeg(toDeg);
  let delta = end - start;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return roundToDigits(normalizeHueDeg(start + delta * clampNumber(weight, 0, 1)), 2);
}

function estimateKelvinFromOklch(color: OklchColor): number {
  const rad = (normalizeHueDeg(color.h) * Math.PI) / 180;
  const warmthProjection = Math.cos(rad - (55 * Math.PI) / 180) * color.c;
  const kelvin = 5400 - warmthProjection * 18_000;
  return Math.round(clampNumber(kelvin, 2800, 8200));
}

/**
 * 캐릭터 선화 레이어 1장에서 주 선색·평균 선폭·종이 입자량을 100% 로컬 추출한다.
 */
export function extractArtistLineLayerProfile(
  sample: CharacterLineLayerSample,
): ArtistLineLayerProfile {
  const width = Math.max(1, Math.floor(sample.width));
  const height = Math.max(1, Math.floor(sample.height));
  const pixelCount = width * height;
  const rgba = sample.rgba;

  const inkMask = new Uint8Array(pixelCount);
  let inkPixelCount = 0;
  let labLSum = 0;
  let labASum = 0;
  let labBSum = 0;
  let inkWeightSum = 0;
  let paperDiffSum = 0;
  let paperDiffCount = 0;
  let edgeAlphaVarSum = 0;
  let edgeAlphaCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pIdx = y * width + x;
      const offset = pIdx * 4;
      const r = rgba[offset] ?? 0;
      const g = rgba[offset + 1] ?? 0;
      const b = rgba[offset + 2] ?? 0;
      const a = rgba[offset + 3] ?? 0;
      const lum = srgbLuminance01(r, g, b);

      if (a >= 96 && lum < 0.68) {
        inkMask[pIdx] = 1;
        inkPixelCount += 1;
        const w = a / 255;
        const lab = rgbToOklab({ r, g, b });
        labLSum += lab.l * w;
        labASum += lab.a * w;
        labBSum += lab.b * w;
        inkWeightSum += w;
      } else if (a >= 200 && lum >= 0.68 && x + 1 < width) {
        const nextOffset = (pIdx + 1) * 4;
        const nextA = rgba[nextOffset + 3] ?? 0;
        const nextLum = srgbLuminance01(
          rgba[nextOffset] ?? 0,
          rgba[nextOffset + 1] ?? 0,
          rgba[nextOffset + 2] ?? 0,
        );
        if (nextA >= 200 && nextLum >= 0.68) {
          paperDiffSum += Math.abs(lum - nextLum);
          paperDiffCount += 1;
        }
      }
    }
  }

  const hRunAt = new Uint16Array(pixelCount);
  const vRunAt = new Uint16Array(pixelCount);

  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      const start = x;
      while (x < width && inkMask[y * width + x] === 1) x += 1;
      const len = x - start;
      if (len > 0) {
        for (let k = start; k < x; k += 1) hRunAt[y * width + k] = len;
      } else {
        x += 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      const start = y;
      while (y < height && inkMask[y * width + x] === 1) y += 1;
      const len = y - start;
      if (len > 0) {
        for (let k = start; k < y; k += 1) vRunAt[k * width + x] = len;
      } else {
        y += 1;
      }
    }
  }

  const widthSamples: number[] = [];
  for (let pIdx = 0; pIdx < pixelCount; pIdx += 1) {
    if (inkMask[pIdx] !== 1) continue;
    const crossWidth = Math.min(hRunAt[pIdx] ?? 0, vRunAt[pIdx] ?? 0);
    if (crossWidth > 0 && crossWidth <= 16) widthSamples.push(crossWidth);
    if (pIdx + 1 < pixelCount && inkMask[pIdx + 1] === 1) {
      const a0 = rgba[pIdx * 4 + 3] ?? 255;
      const a1 = rgba[(pIdx + 1) * 4 + 3] ?? 255;
      edgeAlphaVarSum += Math.abs(a0 - a1) / 255;
      edgeAlphaCount += 1;
    }
  }

  const dominantLineColorOklch: OklchColor =
    inkWeightSum > 0
      ? oklabToOklch({
          l: labLSum / inkWeightSum,
          a: labASum / inkWeightSum,
          b: labBSum / inkWeightSum,
        })
      : { l: 0.21, c: 0.025, h: 260 };

  const dominantLineColorRgb = oklchToRgb(dominantLineColorOklch);

  let averageStrokeWidthPx = 2.0;
  let minStrokeWidthPx = 1.0;
  let maxStrokeWidthPx = 3.0;
  let strokeWidthVariancePx = 0;

  if (widthSamples.length > 0) {
    const sum = widthSamples.reduce((acc, val) => acc + val, 0);
    averageStrokeWidthPx = roundToDigits(clampNumber(sum / widthSamples.length, 0.5, 12), 2);
    minStrokeWidthPx = roundToDigits(Math.min(...widthSamples), 2);
    maxStrokeWidthPx = roundToDigits(Math.max(...widthSamples), 2);
    const variance =
      widthSamples.reduce((acc, val) => acc + (val - averageStrokeWidthPx) ** 2, 0) /
      widthSamples.length;
    strokeWidthVariancePx = roundToDigits(Math.sqrt(variance), 3);
  }

  let paperGrainAmount: number;
  if (paperDiffCount > 8) {
    paperGrainAmount = roundToDigits(clampNumber((paperDiffSum / paperDiffCount) / 0.14, 0, 1), 3);
  } else if (typeof sample.paperTextureHint === "number") {
    paperGrainAmount = roundToDigits(clampNumber(sample.paperTextureHint, 0, 1), 3);
  } else if (edgeAlphaCount > 0) {
    paperGrainAmount = roundToDigits(clampNumber((edgeAlphaVarSum / edgeAlphaCount) * 3.2, 0, 1), 3);
  } else {
    paperGrainAmount = 0.18;
  }

  const paperGrainScale = roundToDigits(0.85 + paperGrainAmount * 1.15, 2);
  const recommendedPaperOverlayOpacity = roundToDigits(
    clampNumber(0.04 + paperGrainAmount * 0.28, 0.04, 0.35),
    3,
  );

  return {
    layerId: sample.layerId,
    layerName: sample.layerName,
    dominantLineColorRgb,
    dominantLineColorOklch,
    dominantLineCssOklch: formatOklchCss(dominantLineColorOklch),
    averageStrokeWidthPx,
    minStrokeWidthPx,
    maxStrokeWidthPx,
    strokeWidthVariancePx,
    paperGrainAmount,
    paperGrainScale,
    recommendedPaperOverlayOpacity,
    inkPixelCount,
    inkCoveragePercent: roundToDigits((inkPixelCount / pixelCount) * 100, 2),
    estimatedInkKelvin: estimateKelvinFromOklch(dominantLineColorOklch),
  };
}

/**
 * 초점거리(mm)·조리개(f-stop)·피사체/배경 거리(m) 기반 배경 가우시안·보케 깊이 블러 자동 산출.
 */
export function computeFocalDepthBlur(input: FocalDepthBlurInput): FocalDepthBlurSpec {
  const focalLengthMm = clampNumber(input.focalLengthMm, 16, 200);
  const apertureFStop = clampNumber(input.apertureFStop, 1.2, 16);
  const subjectDistanceM = clampNumber(input.subjectDistanceM, 0.4, 40);
  const backgroundDistanceM = clampNumber(input.backgroundDistanceM, subjectDistanceM + 0.1, 120);
  const sensorWidthMm = clampNumber(input.sensorWidthMm ?? 36, 12, 44);
  const renderWidthPx = clampNumber(input.renderWidthPx ?? 1600, 640, 4096);

  const subjectMm = subjectDistanceM * 1000;
  const bgMm = backgroundDistanceM * 1000;
  const denom = Math.max(20, subjectMm - focalLengthMm);
  const circleOfConfusionMm = roundToDigits(
    ((focalLengthMm * focalLengthMm) / (apertureFStop * denom)) *
      (Math.abs(bgMm - subjectMm) / bgMm),
    4,
  );

  const cocPx = (circleOfConfusionMm / sensorWidthMm) * renderWidthPx;
  const gaussianRadiusPx = roundToDigits(clampNumber(cocPx * 0.42, 0, 28), 2);
  const bokehDiskRadiusPx = roundToDigits(clampNumber(cocPx * 0.58, 0, 36), 2);
  const bokehBladeCount: 6 | 7 | 9 = apertureFStop <= 2.2 ? 9 : apertureFStop <= 4.5 ? 7 : 6;

  const cocPermissibleMm = 0.03;
  const hyperfocalMm =
    (focalLengthMm * focalLengthMm) / (apertureFStop * cocPermissibleMm) + focalLengthMm;
  const nearFocusM = roundToDigits(
    ((hyperfocalMm * subjectMm) / (hyperfocalMm + (subjectMm - focalLengthMm))) / 1000,
    2,
  );
  const farFocusM =
    subjectMm >= hyperfocalMm
      ? 999
      : roundToDigits(
          ((hyperfocalMm * subjectMm) / Math.max(1, hyperfocalMm - (subjectMm - focalLengthMm))) /
            1000,
          2,
        );

  return {
    focalLengthMm,
    apertureFStop,
    subjectDistanceM,
    backgroundDistanceM,
    circleOfConfusionMm,
    gaussianRadiusPx,
    bokehDiskRadiusPx,
    bokehBladeCount,
    nearFocusM,
    farFocusM,
    hyperfocalM: roundToDigits(hyperfocalMm / 1000, 2),
    depthSeparationScore: Math.round(clampNumber((gaussianRadiusPx / 16) * 100, 0, 100)),
    blurPresetKo:
      gaussianRadiusPx < 2
        ? "광각 선명 배경 (딥 포커스)"
        : gaussianRadiusPx < 7
          ? "표준 자연 심도 블러"
          : "망원 아웃포커싱 보케",
  };
}

/** 17노드 색온도·명암 포스트-프로세스 LUT 생성기 (단조 증가 휘도 보장). */
export function buildColorTemperatureLut17(
  targetKelvin: number,
  warmthBias: number,
  contrastBoost: number,
  strength = 1,
): readonly ColorTemperatureLutNode[] {
  const s = clampNumber(strength, 0, 1);
  const kelvinOffset = clampNumber((5500 - targetKelvin) / 2500, -1, 1);
  const warm = clampNumber((kelvinOffset * 0.65 + warmthBias * 0.35) * s, -0.85, 0.85);
  const gamma = clampNumber(1 + (contrastBoost - 1) * s, 0.72, 1.45);

  const nodes: ColorTemperatureLutNode[] = [];
  let prevLum = 0;
  for (let i = 0; i < SIX_PASS_LUT_NODE_COUNT; i += 1) {
    const x = i / (SIX_PASS_LUT_NODE_COUNT - 1);
    const bell = Math.sin(Math.PI * x);
    const rGain = roundToDigits(clampNumber(1 + warm * 0.24 * (0.35 + 0.65 * bell), 0.72, 1.32), 4);
    const gGain = roundToDigits(clampNumber(1 + warm * 0.05 * bell, 0.88, 1.14), 4);
    const bGain = roundToDigits(clampNumber(1 - warm * 0.26 * (0.35 + 0.65 * bell), 0.7, 1.32), 4);
    const rawLum = i === 0 ? 0 : i === SIX_PASS_LUT_NODE_COUNT - 1 ? 1 : x ** gamma;
    const outputLuminance = roundToDigits(clampNumber(rawLum, prevLum, 1), 4);
    prevLum = outputLuminance;
    nodes.push(
      Object.freeze({
        index: i,
        inputLuminance: roundToDigits(x, 4),
        rGain,
        gGain,
        bGain,
        outputLuminance,
      }),
    );
  }
  return Object.freeze(nodes);
}

/** 추출된 작가 선화 프로파일 기반 3D 6패스 선화 틴트/두께/색온도 LUT + 초점 심도 블러 1클릭 산출. */
export function build3dSixPassStyleSync(options: {
  readonly profile: ArtistLineLayerProfile;
  readonly lightingPresetId?: CutLightingPresetId;
  readonly depthBlurInput?: Partial<FocalDepthBlurInput>;
  readonly syncStrength?: number;
}): ThreeDSixPassSyncPlan {
  const lightingPresetId = options.lightingPresetId ?? "indoor-fluorescent";
  const preset = CUT_LIGHTING_PRESETS[lightingPresetId];
  const strength = clampNumber(options.syncStrength ?? 1, 0, 1);
  const { profile } = options;

  const outlineHue = shortestHueMix(
    profile.dominantLineColorOklch.h,
    preset.shadowHueTargetDeg,
    preset.tintMixWeight * 0.45 * strength,
  );
  const pass1Tint: OklchColor = {
    l: roundToDigits(clampNumber(profile.dominantLineColorOklch.l, 0.08, 0.45), 4),
    c: roundToDigits(
      clampNumber(profile.dominantLineColorOklch.c + preset.tintMixWeight * 0.015 * strength, 0, 0.16),
      4,
    ),
    h: outlineHue,
  };
  const pass2Tint: OklchColor = {
    l: roundToDigits(clampNumber(pass1Tint.l + 0.08, 0.12, 0.56), 4),
    c: roundToDigits(clampNumber(pass1Tint.c * 0.86, 0, 0.14), 4),
    h: pass1Tint.h,
  };
  const shadowTint: OklchColor = {
    l: roundToDigits(clampNumber(0.42 - (preset.contrastBoost - 1) * 0.25, 0.24, 0.55), 4),
    c: roundToDigits(clampNumber(0.055 + Math.abs(preset.warmthBias) * 0.045, 0.02, 0.15), 4),
    h: preset.shadowHueTargetDeg,
  };
  const rimTint: OklchColor = {
    l: roundToDigits(clampNumber(0.86 + preset.warmthBias * 0.04, 0.78, 0.96), 4),
    c: roundToDigits(clampNumber(0.09 + Math.abs(preset.warmthBias) * 0.08, 0.04, 0.22), 4),
    h: preset.warmthBias >= 0 ? 52 : 212,
  };

  const depthBlur = computeFocalDepthBlur({
    focalLengthMm: options.depthBlurInput?.focalLengthMm ?? 50,
    apertureFStop: options.depthBlurInput?.apertureFStop ?? 2.8,
    subjectDistanceM: options.depthBlurInput?.subjectDistanceM ?? 2.5,
    backgroundDistanceM: options.depthBlurInput?.backgroundDistanceM ?? 9.0,
    sensorWidthMm: options.depthBlurInput?.sensorWidthMm,
    renderWidthPx: options.depthBlurInput?.renderWidthPx,
  });

  return {
    sourceLayerId: profile.layerId,
    lightingPresetId,
    syncStrength: strength,
    extractedProfile: profile,
    pass1SilhouetteOutline: {
      lineTintOklch: pass1Tint,
      lineTintCss: formatOklchCss(pass1Tint),
      strokeWidthPx: roundToDigits(clampNumber(profile.averageStrokeWidthPx * 1.15, 0.7, 10), 2),
      edgeTaperRatio: roundToDigits(clampNumber(0.32 + profile.strokeWidthVariancePx * 0.15, 0.2, 0.75), 2),
    },
    pass2CreaseInterior: {
      lineTintOklch: pass2Tint,
      lineTintCss: formatOklchCss(pass2Tint),
      strokeWidthPx: roundToDigits(clampNumber(profile.averageStrokeWidthPx * 0.65, 0.5, 6), 2),
      creaseAngleDeg: 28,
    },
    pass3FlatAlbedo: {
      saturationScale: roundToDigits(clampNumber(0.92 + (1 - profile.paperGrainAmount) * 0.12, 0.8, 1.1), 3),
      valueFloor: roundToDigits(clampNumber(0.14 + profile.dominantLineColorOklch.l * 0.18, 0.1, 0.28), 3),
      targetKelvin: preset.targetKelvin,
    },
    pass4CelShadowAo: {
      shadowTintOklch: shadowTint,
      shadowTintCss: formatOklchCss(shadowTint),
      shadowHardness: roundToDigits(clampNumber(0.76 - profile.paperGrainAmount * 0.22, 0.42, 0.9), 2),
      aoStrength: roundToDigits(clampNumber(0.45 + profile.paperGrainAmount * 0.25, 0.35, 0.8), 2),
    },
    pass5SpecularRim: {
      rimColorOklch: rimTint,
      rimColorCss: formatOklchCss(rimTint),
      rimIntensity: roundToDigits(clampNumber(0.42 + Math.abs(preset.warmthBias) * 0.35, 0.3, 0.9), 2),
      highlightChromaCap: roundToDigits(clampNumber(0.14 + Math.abs(preset.warmthBias) * 0.06, 0.08, 0.24), 3),
    },
    pass6PaperPostDof: {
      paperGrainAmount: profile.paperGrainAmount,
      paperGrainScale: profile.paperGrainScale,
      paperOverlayOpacity: profile.recommendedPaperOverlayOpacity,
      colorTemperatureLut17: buildColorTemperatureLut17(
        preset.targetKelvin,
        preset.warmthBias,
        preset.contrastBoost,
        strength,
      ),
      depthBlur,
    },
  };
}

export function createEmptyCutPostProcessOverrideStore(
  sourceSceneId: string,
): CutPostProcessOverrideStore {
  return Object.freeze({
    sourceSceneId,
    overridesByCutId: Object.freeze({}),
  });
}

/**
 * #135 컷 전용 비파괴 포스트-프로세스 오버라이드 기록기.
 * 공유 3D 배경 원본 재질은 절대 변경하지 않고 컷 오버라이드 레이어에만 기록한다.
 */
export function applyNonDestructiveCutPostProcessOverride(options: {
  readonly sharedScene: Shared3dBackgroundScene;
  readonly store: CutPostProcessOverrideStore;
  readonly cutId: string;
  readonly cutLabel: string;
  readonly sixPassPlan: ThreeDSixPassSyncPlan;
}): {
  readonly store: CutPostProcessOverrideStore;
  readonly overrideLayer: CutPostProcessOverrideLayer;
  readonly sharedSceneIntegrityPreserved: boolean;
} {
  const { sharedScene, store, cutId, cutLabel, sixPassPlan } = options;
  const baseMaterialsHashBefore = computeShared3dMaterialsHash(sharedScene.baseMaterials);
  const preset = CUT_LIGHTING_PRESETS[sixPassPlan.lightingPresetId];
  const existing = store.overridesByCutId[cutId];
  const referenceKelvin = sharedScene.baseMaterials[0]?.emissionKelvin ?? 5400;
  const baseMaterialsHashAfter = computeShared3dMaterialsHash(sharedScene.baseMaterials);
  const sharedSceneIntegrityPreserved =
    baseMaterialsHashBefore === sharedScene.materialsIntegrityHash &&
    baseMaterialsHashAfter === baseMaterialsHashBefore;

  const overrideLayer: CutPostProcessOverrideLayer = Object.freeze({
    overrideLayerId: `cut-post-override:${cutId}`,
    cutId,
    cutLabel,
    sourceSceneId: sharedScene.sceneId,
    lightingPresetId: sixPassPlan.lightingPresetId,
    lightingLabelKo: preset.labelKo,
    targetKelvin: preset.targetKelvin,
    kelvinShift: preset.targetKelvin - referenceKelvin,
    lineTintOverrideOklch: Object.freeze({ ...sixPassPlan.pass1SilhouetteOutline.lineTintOklch }),
    lineTintOverrideCss: sixPassPlan.pass1SilhouetteOutline.lineTintCss,
    strokeWidthPx: sixPassPlan.pass1SilhouetteOutline.strokeWidthPx,
    paperGrainOpacity: sixPassPlan.pass6PaperPostDof.paperOverlayOpacity,
    colorTemperatureLut17: sixPassPlan.pass6PaperPostDof.colorTemperatureLut17,
    depthBlur: Object.freeze({ ...sixPassPlan.pass6PaperPostDof.depthBlur }),
    blendMode: "post-process-non-destructive",
    enabled: true,
    revision: (existing?.revision ?? 0) + 1,
    baseMaterialsHashBefore,
    baseMaterialsHashAfter,
    sharedMaterialMutated: false,
  });

  return {
    store: Object.freeze({
      sourceSceneId: sharedScene.sceneId,
      overridesByCutId: Object.freeze({
        ...store.overridesByCutId,
        [cutId]: overrideLayer,
      }),
    }),
    overrideLayer,
    sharedSceneIntegrityPreserved,
  };
}

export function clearCutPostProcessOverride(
  store: CutPostProcessOverrideStore,
  cutId: string,
): CutPostProcessOverrideStore {
  if (!store.overridesByCutId[cutId]) return store;
  const nextMap: Record<string, CutPostProcessOverrideLayer> = { ...store.overridesByCutId };
  delete nextMap[cutId];
  return Object.freeze({
    sourceSceneId: store.sourceSceneId,
    overridesByCutId: Object.freeze(nextMap),
  });
}

export function resolveEffectiveCut3dRenderState(
  sharedScene: Shared3dBackgroundScene,
  store: CutPostProcessOverrideStore,
  cutId: string,
): EffectiveCut3dRenderState {
  const override = store.overridesByCutId[cutId] ?? null;
  const fallbackLine = sharedScene.baseMaterials[0]?.lineTintOklch ?? { l: 0.22, c: 0.02, h: 255 };
  return {
    cutId,
    sourceSceneId: sharedScene.sceneId,
    baseMaterialsUntouched: true,
    materialsIntegrityHash: computeShared3dMaterialsHash(sharedScene.baseMaterials),
    baseMaterials: sharedScene.baseMaterials,
    activeOverride: override,
    effectiveLightingLabelKo: override ? override.lightingLabelKo : "공유 3D 원본 조명 (5400K)",
    effectiveLineTintCss: override ? override.lineTintOverrideCss : formatOklchCss(fallbackLine),
    effectiveGaussianBlurPx: override ? override.depthBlur.gaussianRadiusPx : 0,
  };
}
