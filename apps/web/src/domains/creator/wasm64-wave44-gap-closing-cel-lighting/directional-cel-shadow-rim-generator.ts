/**
 * Wave 44: 2.5D 의사 법선 맵 + 웹툰 광원 프리셋 결합 계단형 셀 그림자 및 역광 림라이트 생성기.
 *
 * - `역광 드라마틱`, `정오 야외`, `창가 사선광`, `공포 하단광`, `노을 측면광` 웹툰 조명 프리셋과
 *   사용자 지정 방위각(`azimuthDeg`)·고도각(`elevationDeg`)을 단위 광원 벡터 `(lx, ly, lz)`로 변환한다.
 * - 깔끔한 계단형 셀 셰이딩 그림자(`hard` · `soft` · `two-tone`) 알파 마스크와
 *   실루엣 접선 기울기(`sin θ = hypot(nx, ny)`) 기반 역광 림라이트 알파 마스크(`Uint8ClampedArray`)를 1클릭 생성한다.
 */

import type { SdfRgbaColor } from "./sdf-gap-closing-flood-fill";
import type { PseudoNormalMapResult } from "./silhouette-pseudo-normal-estimator";

export type WebtoonCelLightPresetId =
  | "dramatic-backlight"
  | "noon-outdoor"
  | "window-diagonal"
  | "horror-underlight"
  | "sunset-side";

export type CelShadowBandMode = "hard" | "soft" | "two-tone";

export interface WebtoonCelLightPreset {
  readonly id: WebtoonCelLightPresetId;
  readonly labelKo: string;
  /** 화면 평면 방위각(`0°`=우측 `+X`, `90°`=상단 `+Y`, `180°`=좌측 `-X`, `270°`=하단 `-Y`). */
  readonly azimuthDeg: number;
  /** 캔버스 법선 대비 고도각(`+` 정면 상단광, `-` 피사체 뒤쪽 역광). */
  readonly elevationDeg: number;
  readonly celBandMode: CelShadowBandMode;
  readonly shadowThreshold: number;
  readonly shadowSoftness: number;
  readonly maxShadowAlpha: number;
  readonly rimIntensity: number;
  readonly rimWidth: number;
  readonly rimThreshold: number;
  readonly defaultShadowTint: SdfRgbaColor;
  readonly defaultRimTint: SdfRgbaColor;
}

/** 웹툰 스튜디오 실무 1클릭 조명 프리셋 카탈로그. */
export const WEBTOON_CEL_LIGHT_PRESETS: Readonly<
  Record<WebtoonCelLightPresetId, WebtoonCelLightPreset>
> = {
  "dramatic-backlight": {
    id: "dramatic-backlight",
    labelKo: "역광 드라마틱",
    azimuthDeg: 90,
    elevationDeg: -22,
    celBandMode: "hard",
    shadowThreshold: 0.12,
    shadowSoftness: 0.025,
    maxShadowAlpha: 210,
    rimIntensity: 0.96,
    rimWidth: 0.55,
    rimThreshold: 0.38,
    defaultShadowTint: { r: 44, g: 48, b: 82, a: 210 },
    defaultRimTint: { r: 255, g: 244, b: 214, a: 245 },
  },
  "noon-outdoor": {
    id: "noon-outdoor",
    labelKo: "정오 야외",
    azimuthDeg: 90,
    elevationDeg: 38,
    celBandMode: "hard",
    shadowThreshold: 0.2,
    shadowSoftness: 0.02,
    maxShadowAlpha: 170,
    rimIntensity: 0.55,
    rimWidth: 0.42,
    rimThreshold: 0.48,
    defaultShadowTint: { r: 62, g: 68, b: 98, a: 170 },
    defaultRimTint: { r: 255, g: 252, b: 238, a: 185 },
  },
  "window-diagonal": {
    id: "window-diagonal",
    labelKo: "창가 사선광",
    azimuthDeg: 135,
    elevationDeg: 32,
    celBandMode: "soft",
    shadowThreshold: 0.18,
    shadowSoftness: 0.14,
    maxShadowAlpha: 165,
    rimIntensity: 0.72,
    rimWidth: 0.48,
    rimThreshold: 0.34,
    defaultShadowTint: { r: 68, g: 72, b: 104, a: 165 },
    defaultRimTint: { r: 245, g: 249, b: 255, a: 215 },
  },
  "horror-underlight": {
    id: "horror-underlight",
    labelKo: "공포 하단광",
    azimuthDeg: 270,
    elevationDeg: 20,
    celBandMode: "hard",
    shadowThreshold: 0.16,
    shadowSoftness: 0.025,
    maxShadowAlpha: 222,
    rimIntensity: 0.84,
    rimWidth: 0.5,
    rimThreshold: 0.38,
    defaultShadowTint: { r: 26, g: 32, b: 48, a: 222 },
    defaultRimTint: { r: 178, g: 236, b: 228, a: 225 },
  },
  "sunset-side": {
    id: "sunset-side",
    labelKo: "노을 측면광",
    azimuthDeg: 0,
    elevationDeg: 16,
    celBandMode: "soft",
    shadowThreshold: 0.15,
    shadowSoftness: 0.1,
    maxShadowAlpha: 188,
    rimIntensity: 0.9,
    rimWidth: 0.52,
    rimThreshold: 0.36,
    defaultShadowTint: { r: 78, g: 52, b: 88, a: 188 },
    defaultRimTint: { r: 255, g: 198, b: 132, a: 235 },
  },
};

export interface LightDirection3d {
  readonly lx: number;
  readonly ly: number;
  readonly lz: number;
}

export interface DirectionalCelShadowRimInput {
  readonly normalMap: Pick<
    PseudoNormalMapResult,
    "width" | "height" | "alphaMask" | "normalsFloat32"
  >;
  readonly presetId?: WebtoonCelLightPresetId;
  readonly azimuthDeg?: number;
  readonly elevationDeg?: number;
  readonly celBandMode?: CelShadowBandMode;
  readonly shadowThreshold?: number;
  readonly shadowSoftness?: number;
  readonly maxShadowAlpha?: number;
  readonly rimIntensity?: number;
  readonly rimWidth?: number;
  readonly rimThreshold?: number;
  readonly baseFlatRgba?: Uint8Array | Uint8ClampedArray;
  readonly shadowTint?: SdfRgbaColor;
  readonly rimTint?: SdfRgbaColor;
}

export interface DirectionalCelShadowRimResult {
  readonly width: number;
  readonly height: number;
  readonly presetId: WebtoonCelLightPresetId;
  readonly presetLabelKo: string;
  readonly lightDirection: LightDirection3d;
  readonly shadowAlphaMask: Uint8ClampedArray;
  readonly rimAlphaMask: Uint8ClampedArray;
  readonly litPixelCount: number;
  readonly shadowedPixelCount: number;
  readonly rimPixelCount: number;
  readonly compositedRgba?: Uint8ClampedArray;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 방위각(`azimuthDeg`)·고도각(`elevationDeg`)을 오른손 좌표계 단위 광원 벡터 `(lx, ly, lz)`로 변환한다. */
export function resolveLightDirectionVector(
  azimuthDeg: number,
  elevationDeg: number,
): LightDirection3d {
  const clampedEl = clamp(elevationDeg, -85, 89.9);
  const azRad = (azimuthDeg * Math.PI) / 180;
  const elRad = (clampedEl * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  const rawLx = cosEl * Math.cos(azRad);
  const rawLy = cosEl * Math.sin(azRad);
  const rawLz = Math.sin(elRad);
  const invLen = 1 / Math.hypot(rawLx, rawLy, rawLz);
  return { lx: rawLx * invLen, ly: rawLy * invLen, lz: rawLz * invLen };
}

function evaluateCelShadowFactor(
  ndotl: number,
  mode: CelShadowBandMode,
  threshold: number,
  softness: number,
): number {
  if (mode === "two-tone") {
    const halfBand = Math.max(0.01, softness * 0.5);
    const primaryShadow = 1 - smoothstep(threshold - halfBand, threshold + halfBand, ndotl);
    const coreThreshold = threshold - 0.28;
    const deepShadow = 1 - smoothstep(coreThreshold - halfBand, coreThreshold + halfBand, ndotl);
    return clamp(0.58 * primaryShadow + 0.42 * deepShadow, 0, 1);
  }
  if (mode === "soft") {
    const softHalf = Math.max(0.06, softness);
    return 1 - smoothstep(threshold - softHalf, threshold + softHalf, ndotl);
  }
  const hardHalf = Math.max(0, Math.min(0.035, softness));
  if (hardHalf <= 1e-4) return ndotl < threshold ? 1 : 0;
  return 1 - smoothstep(threshold - hardHalf, threshold + hardHalf, ndotl);
}

/** 2.5D 의사 법선 맵과 조명 설정으로부터 셀 그림자 알파 마스크 및 림라이트 알파 마스크를 생성한다. */
export function generateDirectionalCelShadowAndRim(
  input: DirectionalCelShadowRimInput,
): DirectionalCelShadowRimResult {
  const { width, height, alphaMask, normalsFloat32 } = input.normalMap;
  const total = width * height;
  const presetId: WebtoonCelLightPresetId = input.presetId ?? "window-diagonal";
  const preset = WEBTOON_CEL_LIGHT_PRESETS[presetId];

  const azimuthDeg = input.azimuthDeg ?? preset.azimuthDeg;
  const elevationDeg = input.elevationDeg ?? preset.elevationDeg;
  const celBandMode = input.celBandMode ?? preset.celBandMode;
  const shadowThreshold = clamp(input.shadowThreshold ?? preset.shadowThreshold, -0.95, 0.95);
  const shadowSoftness = clamp(input.shadowSoftness ?? preset.shadowSoftness, 0, 0.6);
  const maxShadowAlpha = clamp(Math.round(input.maxShadowAlpha ?? preset.maxShadowAlpha), 0, 255);
  const rimIntensity = clamp(input.rimIntensity ?? preset.rimIntensity, 0, 1);
  const rimWidth = clamp(input.rimWidth ?? preset.rimWidth, 0.08, 1);
  const rimThreshold = clamp(input.rimThreshold ?? preset.rimThreshold, 0.05, 0.92);

  const lightDirection = resolveLightDirectionVector(azimuthDeg, elevationDeg);
  const { lx, ly, lz } = lightDirection;
  const planarLightLen = Math.hypot(lx, ly);
  const rimExponent = clamp(1.0 / rimWidth, 1.0, 4.5);

  const shadowAlphaMask = new Uint8ClampedArray(total);
  const rimAlphaMask = new Uint8ClampedArray(total);
  let litPixelCount = 0;
  let shadowedPixelCount = 0;
  let rimPixelCount = 0;

  const hasBaseRgba = input.baseFlatRgba !== undefined && input.baseFlatRgba.length >= total * 4;
  const compositedRgba = hasBaseRgba ? new Uint8ClampedArray(total * 4) : undefined;
  const shadowTint = input.shadowTint ?? preset.defaultShadowTint;
  const rimTint = input.rimTint ?? preset.defaultRimTint;

  for (let i = 0; i < total; i += 1) {
    const silAlpha = alphaMask[i] ?? 0;
    if (silAlpha === 0) continue;
    const alphaWeight = silAlpha / 255;
    const nBase = i * 3;
    const nx = normalsFloat32[nBase] ?? 0;
    const ny = normalsFloat32[nBase + 1] ?? 0;
    const nz = normalsFloat32[nBase + 2] ?? 1;
    const ndotl = nx * lx + ny * ly + nz * lz;

    // 실루엣 외곽 기울기 `sin θ = hypot(nx, ny)` 프레넬 항 + 광원 평면 정렬도 결합
    const silhouetteTilt = clamp(Math.hypot(nx, ny), 0, 1);
    const grazing = silhouetteTilt ** rimExponent;
    const planarAlign =
      planarLightLen > 1e-4 ? (nx * lx + ny * ly) / planarLightLen : silhouetteTilt;
    const directionalRimDrive = clamp(Math.max(ndotl, planarAlign * 0.95), 0, 1);
    const rawRim = grazing * directionalRimDrive;
    const rimBand =
      smoothstep(rimThreshold, Math.min(0.99, rimThreshold + 0.14), rawRim) * rimIntensity;

    const rawShadow = evaluateCelShadowFactor(ndotl, celBandMode, shadowThreshold, shadowSoftness);
    const carvedShadow = rawShadow * (1 - 0.85 * rimBand);

    const sByte = Math.round(carvedShadow * maxShadowAlpha * alphaWeight);
    const rByte = Math.round(rimBand * 255 * alphaWeight);
    shadowAlphaMask[i] = sByte;
    rimAlphaMask[i] = rByte;

    if (sByte >= 32) shadowedPixelCount += 1;
    else litPixelCount += 1;
    if (rByte >= 32) rimPixelCount += 1;

    if (compositedRgba !== undefined && input.baseFlatRgba !== undefined) {
      const cOffset = i * 4;
      const baseR = input.baseFlatRgba[cOffset] ?? 0;
      const baseG = input.baseFlatRgba[cOffset + 1] ?? 0;
      const baseB = input.baseFlatRgba[cOffset + 2] ?? 0;
      const baseA = input.baseFlatRgba[cOffset + 3] ?? silAlpha;

      const sMix = sByte / 255;
      const shadedR = baseR * (1 - sMix) + ((baseR * shadowTint.r) / 255) * sMix;
      const shadedG = baseG * (1 - sMix) + ((baseG * shadowTint.g) / 255) * sMix;
      const shadedB = baseB * (1 - sMix) + ((baseB * shadowTint.b) / 255) * sMix;

      const rMix = (rByte / 255) * ((rimTint.a ?? 255) / 255);
      const screenR = 255 - ((255 - shadedR) * (255 - rimTint.r)) / 255;
      const screenG = 255 - ((255 - shadedG) * (255 - rimTint.g)) / 255;
      const screenB = 255 - ((255 - shadedB) * (255 - rimTint.b)) / 255;

      compositedRgba[cOffset] = Math.round(shadedR * (1 - rMix) + screenR * rMix);
      compositedRgba[cOffset + 1] = Math.round(shadedG * (1 - rMix) + screenG * rMix);
      compositedRgba[cOffset + 2] = Math.round(shadedB * (1 - rMix) + screenB * rMix);
      compositedRgba[cOffset + 3] = baseA;
    }
  }

  return {
    width,
    height,
    presetId,
    presetLabelKo: preset.labelKo,
    lightDirection,
    shadowAlphaMask,
    rimAlphaMask,
    litPixelCount,
    shadowedPixelCount,
    rimPixelCount,
    compositedRgba,
  };
}
