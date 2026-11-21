/**
 * 한국 웹툰(K-Webtoon) 2단 셀 셰이딩·유색 선화·얼굴 혈색/홍채 그라데이션 순수 계산 모듈.
 *
 * - 회색 탁한 그림자 대신 피부에 따뜻한 복숭아/장미 톤 그림자, 머리카락·의상에 채도 보정된 2단 셀 음영을 적용한다.
 * - 검정 단일 외곽선을 탈피해 부위별 알베도 연동 유색 선화(Colored Lineart)를 자동 산출한다.
 * - `LOOK_V2_IDENTITY`일 때는 기존 v2 렌더 항등 값을 그대로 반환해 회귀 0을 보장한다.
 */
import { LOOK_V2_IDENTITY, PART_ROLE_SHADE_GROUP } from "../contracts";
import { hexToLinearRgb, hexToSrgb01, linearRgbToOklab, linearToSrgb, oklabToLinearRgb } from "../shared/color";
import { clamp } from "../shared/math";

import { toonShadeTint } from "./material-presets";
import { computeColoredLineartRgb } from "./outline-policy";

import type { Look, PartRole, ShadeTint, ShadingProfile } from "../contracts";

export type KWebtoonCelPresetId = "rofan-peach" | "romance-clean" | "hunter-dramatic" | "murim-ink" | "sd-pastel";

export interface KWebtoonCelShadingPreset {
  readonly id: KWebtoonCelPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly rampSteps: 2 | 3;
  readonly outline: ShadingProfile["toon"]["outline"];
  readonly rim: boolean;
  readonly faceSdfShadow: boolean;
  readonly look: Look;
}

const DEFAULT_INK_RGB: readonly [number, number, number] = [0.12, 0.08, 0.1];
const DEG_TO_RAD = Math.PI / 180;

const BASE_TONE: Look["tone"] = Object.freeze({
  kind: "none",
  cellPerHead: 40,
  angleDeg: 45,
  bands: [0, 0.5, 0.8] as [number, number, number],
  strength: 0,
  ink: "shade",
});

const BASE_PAPER: Look["paper"] = Object.freeze({
  kind: "none",
  strength: 0,
  grainPx1080: 1,
  bleedPx1080: 0,
  seed: 0,
});

/**
 * 한국 웹툰 대표 5종 2단 셀 셰이딩·유색 선화 프리셋.
 * 모든 피부 음영은 r > g, r > b의 따뜻한 복숭아/장미 톤을 유지하고,
 * 외곽선은 `darken-albedo` 모드로 부위별 색상에 맞춰 유색 선화를 자동 매칭한다.
 */
export const KWEBTOON_CELL_SHADING_PRESETS: Readonly<Record<KWebtoonCelPresetId, KWebtoonCelShadingPreset>> = Object.freeze({
  "rofan-peach": {
    id: "rofan-peach",
    labelKo: "로판 소프트 복숭아 2단 셀",
    descriptionKo: "투명한 복숭아·장미 피부 그림자, 보랏빛 헤어 음영, 샴페인 림라이트와 부드러운 유색 선화",
    rampSteps: 2,
    outline: "hull",
    rim: true,
    faceSdfShadow: true,
    look: {
      ramp: { softness: 0.14, secondShade: null },
      shade: {
        skin: { kind: "multiply", rgb: [0.92, 0.67, 0.65] },
        hair: { kind: "multiply", rgb: [0.65, 0.56, 0.74] },
        other: { kind: "multiply", rgb: [0.7, 0.65, 0.79] },
      },
      rim: { edge0: 0.54, edge1: 0.66, strength: 0.42, color: [0.98, 0.89, 0.82] },
      specular: { size: 0.25, strength: 0.68, hairBand: "ring", center: 0.58, width: 0.12 },
      line: {
        method: "style-hull",
        widthMm: 2.2,
        depthGain: 0.35,
        curvatureGain: 0.25,
        color: { mode: "darken-albedo", dL: 0.44, chroma: 0.85 },
        inner: { enabled: true, creaseDeg: 32, partBoundary: true, widthPx: 1 },
      },
      tone: BASE_TONE,
      paper: BASE_PAPER,
      grade: { saturation: 1.06, lightness: 0.015, accentChannels: [] },
    } satisfies Look,
  },
  "romance-clean": {
    id: "romance-clean",
    labelKo: "현대 로맨스 클린 2단 셀",
    descriptionKo: "화사한 살구-로즈 피부 음영, 맑은 2단 셀 경계와 자동 매칭 유색 선화",
    rampSteps: 2,
    outline: "hull",
    rim: true,
    faceSdfShadow: true,
    look: {
      ramp: { softness: 0.12, secondShade: null },
      shade: {
        skin: { kind: "multiply", rgb: [0.91, 0.69, 0.66] },
        hair: { kind: "multiply", rgb: [0.64, 0.6, 0.76] },
        other: { kind: "multiply", rgb: [0.68, 0.67, 0.81] },
      },
      rim: { edge0: 0.55, edge1: 0.66, strength: 0.36, color: [0.84, 0.9, 0.99] },
      specular: { size: 0.22, strength: 0.6, hairBand: "ring", center: 0.58, width: 0.11 },
      line: {
        method: "style-hull",
        widthMm: 2.0,
        depthGain: 0.3,
        curvatureGain: 0.2,
        color: { mode: "darken-albedo", dL: 0.42, chroma: 0.82 },
        inner: { enabled: true, creaseDeg: 34, partBoundary: true, widthPx: 1 },
      },
      tone: BASE_TONE,
      paper: BASE_PAPER,
      grade: { saturation: 1.05, lightness: 0.01, accentChannels: [] },
    } satisfies Look,
  },
  "hunter-dramatic": {
    id: "hunter-dramatic",
    labelKo: "헌터·액션 고대비 2단 셀",
    descriptionKo: "선명한 로즈-테라코타 피부 음영, 깊은 인디고 의상 음영, 시안 엣지 림과 샤프 필압 유색 선화",
    rampSteps: 2,
    outline: "hull",
    rim: true,
    faceSdfShadow: true,
    look: {
      ramp: { softness: 0.08, secondShade: null },
      shade: {
        skin: { kind: "multiply", rgb: [0.88, 0.62, 0.6] },
        hair: { kind: "multiply", rgb: [0.54, 0.57, 0.76] },
        other: { kind: "multiply", rgb: [0.58, 0.61, 0.78] },
      },
      rim: { edge0: 0.52, edge1: 0.64, strength: 0.56, color: [0.54, 0.8, 1.0] },
      specular: { size: 0.2, strength: 0.58, hairBand: "band", center: 0.56, width: 0.1 },
      line: {
        method: "style-hull",
        widthMm: 2.6,
        depthGain: 0.45,
        curvatureGain: 0.35,
        color: { mode: "darken-albedo", dL: 0.52, chroma: 0.78 },
        inner: { enabled: true, creaseDeg: 28, partBoundary: true, widthPx: 2 },
      },
      tone: BASE_TONE,
      paper: BASE_PAPER,
      grade: { saturation: 1.08, lightness: -0.01, accentChannels: [] },
    } satisfies Look,
  },
  "murim-ink": {
    id: "murim-ink",
    labelKo: "무협·월광 2단 셀",
    descriptionKo: "따뜻한 살구-황토 피부 음영, 청먹빛 도포 음영, 은은한 월광 림과 강약 있는 먹선 유색 선화",
    rampSteps: 2,
    outline: "hull",
    rim: true,
    faceSdfShadow: true,
    look: {
      ramp: { softness: 0.1, secondShade: null },
      shade: {
        skin: { kind: "multiply", rgb: [0.89, 0.66, 0.61] },
        hair: { kind: "multiply", rgb: [0.56, 0.6, 0.7] },
        other: { kind: "multiply", rgb: [0.6, 0.65, 0.73] },
      },
      rim: { edge0: 0.54, edge1: 0.66, strength: 0.46, color: [0.8, 0.9, 0.96] },
      specular: { size: 0.18, strength: 0.52, hairBand: "band", center: 0.56, width: 0.1 },
      line: {
        method: "style-hull",
        widthMm: 2.8,
        depthGain: 0.5,
        curvatureGain: 0.4,
        color: { mode: "darken-albedo", dL: 0.56, chroma: 0.72 },
        inner: { enabled: true, creaseDeg: 26, partBoundary: true, widthPx: 2 },
      },
      tone: BASE_TONE,
      paper: BASE_PAPER,
      grade: { saturation: 1.02, lightness: 0, accentChannels: [] },
    } satisfies Look,
  },
  "sd-pastel": {
    id: "sd-pastel",
    labelKo: "SD 파스텔 2단 셀",
    descriptionKo: "발그레한 피치 피부 음영, 맑은 라벤더 의상 그림자, 크림빛 림과 부드러운 컬러 외곽선",
    rampSteps: 2,
    outline: "hull",
    rim: true,
    faceSdfShadow: true,
    look: {
      ramp: { softness: 0.16, secondShade: null },
      shade: {
        skin: { kind: "multiply", rgb: [0.94, 0.73, 0.7] },
        hair: { kind: "multiply", rgb: [0.74, 0.66, 0.84] },
        other: { kind: "multiply", rgb: [0.76, 0.71, 0.86] },
      },
      rim: { edge0: 0.54, edge1: 0.66, strength: 0.44, color: [1.0, 0.95, 0.84] },
      specular: { size: 0.28, strength: 0.64, hairBand: "ring", center: 0.6, width: 0.14 },
      line: {
        method: "style-hull",
        widthMm: 2.6,
        depthGain: 0.3,
        curvatureGain: 0.2,
        color: { mode: "darken-albedo", dL: 0.38, chroma: 0.9 },
        inner: { enabled: true, creaseDeg: 36, partBoundary: true, widthPx: 1 },
      },
      tone: BASE_TONE,
      paper: BASE_PAPER,
      grade: { saturation: 1.1, lightness: 0.02, accentChannels: [] },
    } satisfies Look,
  },
});

export function buildKWebtoonShadingProfile(
  presetId: KWebtoonCelPresetId,
  base: ShadingProfile,
): ShadingProfile {
  const preset = KWEBTOON_CELL_SHADING_PRESETS[presetId];
  return {
    ...base,
    mode: "toon",
    toon: {
      ...base.toon,
      rampSteps: preset.rampSteps,
      outline: preset.outline,
      outlinePressure: true,
      rim: preset.rim,
      faceSdfShadow: preset.faceSdfShadow,
    },
    look: preset.look,
  };
}

function sameRgb(a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
}

function sameShadeTint(a: ShadeTint, b: ShadeTint): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "multiply" && b.kind === "multiply") return sameRgb(a.rgb, b.rgb);
  if (a.kind === "oklab" && b.kind === "oklab") {
    return (
      Math.abs(a.dL - b.dL) < 1e-6 &&
      Math.abs(a.dHueDeg - b.dHueDeg) < 1e-6 &&
      Math.abs(a.chroma - b.chroma) < 1e-6
    );
  }
  return false;
}

/** 현재 Look이 v2 기본 항등(`LOOK_V2_IDENTITY`)과 동일한지 판정한다. */
export function isLookV2Identity(look: Look): boolean {
  return (
    Math.abs(look.ramp.softness - LOOK_V2_IDENTITY.ramp.softness) < 1e-6 &&
    look.ramp.secondShade === null &&
    sameShadeTint(look.shade.skin, LOOK_V2_IDENTITY.shade.skin) &&
    sameShadeTint(look.shade.hair, LOOK_V2_IDENTITY.shade.hair) &&
    sameShadeTint(look.shade.other, LOOK_V2_IDENTITY.shade.other) &&
    sameRgb(look.rim.color, LOOK_V2_IDENTITY.rim.color) &&
    Math.abs(look.rim.strength - LOOK_V2_IDENTITY.rim.strength) < 1e-6 &&
    look.specular.hairBand === LOOK_V2_IDENTITY.specular.hairBand &&
    Math.abs(look.specular.strength - LOOK_V2_IDENTITY.specular.strength) < 1e-6 &&
    look.line.color.mode === LOOK_V2_IDENTITY.line.color.mode
  );
}

/**
 * 파츠 역할·알베도 색·Look에서 실제 툰 셰이더에 전달할 `shadeTint` RGB(0..1)를 산출한다.
 * - `multiply`: 지정된 RGB 배율 그대로 사용(`LOOK_V2_IDENTITY`는 `toonShadeTint`와 비트 동치).
 * - `oklab`: 알베도를 OKLab에서 명도(dL)·색상 회전(dHueDeg)·채도 배율(chroma)로 이동해 sRGB 곱셈 틴트로 환산(피부 회색화 방지).
 */
export function resolveLookShadeTint(
  role: PartRole,
  albedoHex: string,
  look: Look,
): readonly [number, number, number] {
  const group = PART_ROLE_SHADE_GROUP[role];
  const spec = look.shade[group];
  if (spec.kind === "multiply") return [spec.rgb[0], spec.rgb[1], spec.rgb[2]];
  const linear = hexToLinearRgb(albedoHex);
  const srgb = hexToSrgb01(albedoHex);
  if (!linear || !srgb) return toonShadeTint(role);
  const [L, a, b] = linearRgbToOklab(linear);
  const rad = spec.dHueDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotA = (a * cos - b * sin) * spec.chroma;
  const rotB = (a * sin + b * cos) * spec.chroma;
  const shiftedLinear = oklabToLinearRgb([clamp(L + spec.dL, 0.08, 0.98), clamp(rotA, -0.35, 0.35), clamp(rotB, -0.35, 0.35)]);
  const sr = linearToSrgb(shiftedLinear[0]);
  const sg = linearToSrgb(shiftedLinear[1]);
  const sb = linearToSrgb(shiftedLinear[2]);
  return [
    clamp(sr / Math.max(0.04, srgb[0]), 0.18, 1.15),
    clamp(sg / Math.max(0.04, srgb[1]), 0.18, 1.15),
    clamp(sb / Math.max(0.04, srgb[2]), 0.18, 1.15),
  ];
}

/** Look의 림 색 × 강도를 RGB(0..1)로 산출한다(`LOOK_V2_IDENTITY`는 `[0.35, 0.35, 0.4]`). */
export function resolveLookRimColor(look: Look): readonly [number, number, number] {
  const s = clamp(look.rim.strength, 0, 2);
  return [
    clamp(look.rim.color[0] * s, 0, 2),
    clamp(look.rim.color[1] * s, 0, 2),
    clamp(look.rim.color[2] * s, 0, 2),
  ];
}

/**
 * 부위 역할·알베도 색·Look에 맞춰 자동 매칭된 유색 선화 RGB(0..1)를 계산한다.
 * `darken-albedo` 모드에서 피부는 따뜻한 테라코타-로즈 잉크, 헤어/의상은 채도를 살린 딥 컬러 잉크를 반환한다.
 */
export function resolveKWebtoonOutlineColor(
  role: PartRole,
  albedoHex: string,
  look: Look,
): readonly [number, number, number] {
  if (look.line.color.mode === "fixed") {
    return [look.line.color.rgb[0], look.line.color.rgb[1], look.line.color.rgb[2]];
  }
  const strength = clamp(0.65 + look.line.color.chroma * 0.35, 0.6, 1);
  return computeColoredLineartRgb(DEFAULT_INK_RGB, albedoHex, strength, role);
}

/** K-웹툰 얼굴 메이크업(블러셔·중앙 입술 그라데이션·애교살·콧대 광택)과 홍채 그라데이션 유니폼 4성분 */
export interface KWebtoonShaderFeatureParams {
  readonly faceMakeupIntensity: number;
  readonly irisGradientIntensity: number;
  readonly lipTintIntensity: number;
  readonly cheekBlushIntensity: number;
}

export function resolveKWebtoonFeatureParams(
  role: PartRole,
  shading: ShadingProfile,
): KWebtoonShaderFeatureParams {
  if (shading.mode !== "toon" || isLookV2Identity(shading.look)) {
    return { faceMakeupIntensity: 0, irisGradientIntensity: 0, lipTintIntensity: 0, cheekBlushIntensity: 0 };
  }
  if (role === "head") {
    const warmth = shading.look.shade.skin.kind === "multiply" ? shading.look.shade.skin.rgb[0] : 0.9;
    const blush = clamp(0.42 + (warmth - 0.85) * 2.2, 0.28, 0.72);
    return {
      faceMakeupIntensity: 1,
      irisGradientIntensity: 0,
      lipTintIntensity: 0.62,
      cheekBlushIntensity: blush,
    };
  }
  if (role === "iris") {
    return {
      faceMakeupIntensity: 0,
      irisGradientIntensity: 1,
      lipTintIntensity: 0,
      cheekBlushIntensity: 0,
    };
  }
  return { faceMakeupIntensity: 0, irisGradientIntensity: 0, lipTintIntensity: 0, cheekBlushIntensity: 0 };
}
