/**
 * 3D 셰이퍼(Shaper) 원클릭 퀵 조형·헤어 옴브레·웹툰 셀셰이딩 프리셋 (`apps/character-lab/src/presets/shaper-quick-sculpt-presets.ts`).
 *
 * - 등신비(Head-Ratio) 5종, 안면 조형 아키타입 6종(얼굴 15축 전수 지정), 헤어 투톤/엔젤링 5종, 웹툰 셀셰이딩·SDF·외곽선 4종을 정의한다.
 * - 모든 수치는 `contracts` 스키마(`proportionSchema`, `faceParamsSchema`, `hairColorSchema`, `lookSchema`) 범위 안에서 깊이 동결된다.
 */
import { mergeLook } from "../contracts";

import type {
  BodyParamKey,
  FaceParamKey,
  HairColor,
  Look,
  LookPatch,
  Proportion,
  ShadingProfile,
} from "../contracts";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- 1. 등신비(Head-Ratio) 퀵 프리셋

export const SHAPER_HEAD_RATIO_IDS = [
  "sd-45",
  "teen-65",
  "romance-75",
  "webtoon-80",
  "grand-duke-85",
] as const;

export type ShaperHeadRatioId = (typeof SHAPER_HEAD_RATIO_IDS)[number];

export interface ShaperHeadRatioPreset {
  readonly id: ShaperHeadRatioId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly proportion: Proportion;
  readonly body: Readonly<Partial<Record<BodyParamKey, number>>>;
}

export const SHAPER_HEAD_RATIO_PRESETS: readonly ShaperHeadRatioPreset[] = deepFreeze([
  {
    id: "sd-45",
    labelKo: "4.5등신 SD 치비",
    badgeKo: "4.5등신",
    proportion: {
      headsTall: 4.5,
      legRatio: 0.36,
      armRatio: 0.36,
      shoulderHeads: 1.35,
      headWidthRatio: 0.92,
      handScale: 0.88,
    },
    body: {
      height: -0.55,
      headSize: 0.55,
      legLength: -0.45,
      shoulderWidth: -0.25,
      neckLength: -0.4,
      armLength: -0.35,
    },
  },
  {
    id: "teen-65",
    labelKo: "6.5등신 소년·소녀",
    badgeKo: "6.5등신",
    proportion: {
      headsTall: 6.5,
      legRatio: 0.47,
      armRatio: 0.42,
      shoulderHeads: 1.7,
      headWidthRatio: 0.78,
      handScale: 0.96,
    },
    body: {
      height: -0.15,
      headSize: 0.12,
      legLength: -0.05,
      shoulderWidth: -0.08,
      neckLength: -0.05,
      armLength: -0.05,
    },
  },
  {
    id: "romance-75",
    labelKo: "7.5등신 로맨스 표준",
    badgeKo: "7.5등신",
    proportion: {
      headsTall: 7.5,
      legRatio: 0.51,
      armRatio: 0.44,
      shoulderHeads: 1.78,
      headWidthRatio: 0.75,
      handScale: 0.96,
    },
    body: {
      height: 0.15,
      headSize: -0.1,
      legLength: 0.25,
      shoulderWidth: 0,
      neckLength: 0.15,
      armLength: 0.08,
    },
  },
  {
    id: "webtoon-80",
    labelKo: "8.0등신 정통 웹툰",
    badgeKo: "8.0등신",
    proportion: {
      headsTall: 8,
      legRatio: 0.52,
      armRatio: 0.45,
      shoulderHeads: 2.05,
      headWidthRatio: 0.74,
      handScale: 1,
    },
    body: {
      height: 0.35,
      headSize: -0.2,
      legLength: 0.35,
      shoulderWidth: 0.22,
      neckLength: 0.18,
      armLength: 0.15,
    },
  },
  {
    id: "grand-duke-85",
    labelKo: "8.5등신 장신 모델/대공",
    badgeKo: "8.5등신",
    proportion: {
      headsTall: 8.5,
      legRatio: 0.54,
      armRatio: 0.46,
      shoulderHeads: 2.35,
      headWidthRatio: 0.71,
      handScale: 1.05,
    },
    body: {
      height: 0.58,
      headSize: -0.32,
      legLength: 0.48,
      shoulderWidth: 0.45,
      neckLength: 0.22,
      armLength: 0.22,
    },
  },
]);

// ---------------------------------------------------------------- 2. 안면 조형 아키타입 6종 (15축 일괄 스컬프팅)

export const SHAPER_FACE_SCULPT_IDS = [
  "pure-puppy",
  "chic-cat",
  "cold-vline",
  "rofan-noble",
  "shonen-passionate",
  "round-chibi",
] as const;

export type ShaperFaceSculptId = (typeof SHAPER_FACE_SCULPT_IDS)[number];

export interface ShaperFaceSculptPreset {
  readonly id: ShaperFaceSculptId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly face: Readonly<Record<FaceParamKey, number>>;
}

export const SHAPER_FACE_SCULPT_PRESETS: readonly ShaperFaceSculptPreset[] = deepFreeze([
  {
    id: "pure-puppy",
    labelKo: "청순 강아지상",
    summaryKo: "부드러운 볼선과 살짝 내려간 다정한 눈매",
    face: {
      faceShape: 0.1,
      jawWidth: -0.2,
      chinLength: -0.12,
      cheekVolume: 0.25,
      forehead: 0.1,
      eyeSize: 0.48,
      eyeSpacing: 0.05,
      eyeTilt: -0.28,
      noseHeight: 0.08,
      noseWidth: -0.1,
      noseDepth: 0.05,
      mouthWidth: -0.08,
      lipFullness: 0.22,
      earSize: 0,
      earAngle: 0.05,
    },
  },
  {
    id: "chic-cat",
    labelKo: "도도 고양이상",
    summaryKo: "세련된 V라인과 올라간 눈꼬리·오뚝한 콧대",
    face: {
      faceShape: -0.35,
      jawWidth: -0.32,
      chinLength: -0.05,
      cheekVolume: -0.1,
      forehead: 0.05,
      eyeSize: 0.32,
      eyeSpacing: 0.08,
      eyeTilt: 0.46,
      noseHeight: 0.28,
      noseWidth: -0.18,
      noseDepth: 0.22,
      mouthWidth: -0.05,
      lipFullness: 0.18,
      earSize: -0.05,
      earAngle: 0.12,
    },
  },
  {
    id: "cold-vline",
    labelKo: "날카로운 냉미남 V라인",
    summaryKo: "샤프한 턱선과 길고 날렵한 눈매·높은 콧날",
    face: {
      faceShape: -0.55,
      jawWidth: -0.38,
      chinLength: 0.15,
      cheekVolume: -0.28,
      forehead: 0.12,
      eyeSize: -0.18,
      eyeSpacing: -0.05,
      eyeTilt: 0.42,
      noseHeight: 0.48,
      noseWidth: -0.15,
      noseDepth: 0.35,
      mouthWidth: 0.05,
      lipFullness: -0.15,
      earSize: 0,
      earAngle: 0.08,
    },
  },
  {
    id: "rofan-noble",
    labelKo: "온화한 로판 영애",
    summaryKo: "크고 영롱한 눈망울과 갸름한 턱·도톰한 입술",
    face: {
      faceShape: -0.28,
      jawWidth: -0.34,
      chinLength: -0.1,
      cheekVolume: 0.15,
      forehead: 0.14,
      eyeSize: 0.65,
      eyeSpacing: 0.08,
      eyeTilt: 0.16,
      noseHeight: 0.24,
      noseWidth: -0.2,
      noseDepth: 0.18,
      mouthWidth: -0.14,
      lipFullness: 0.3,
      earSize: -0.08,
      earAngle: 0,
    },
  },
  {
    id: "shonen-passionate",
    labelKo: "소년만화 열혈상",
    summaryKo: "생기 넘치는 눈매와 단단한 턱선·시원한 입매",
    face: {
      faceShape: -0.1,
      jawWidth: 0.12,
      chinLength: 0.05,
      cheekVolume: 0,
      forehead: 0.08,
      eyeSize: 0.38,
      eyeSpacing: -0.04,
      eyeTilt: 0.26,
      noseHeight: 0.22,
      noseWidth: 0,
      noseDepth: 0.2,
      mouthWidth: 0.22,
      lipFullness: 0,
      earSize: 0.08,
      earAngle: 0.15,
    },
  },
  {
    id: "round-chibi",
    labelKo: "동글 귀염 치비",
    summaryKo: "통통한 볼살과 왕방울 눈·앙증맞은 코와 입",
    face: {
      faceShape: 0.68,
      jawWidth: 0.38,
      chinLength: -0.35,
      cheekVolume: 0.82,
      forehead: 0.3,
      eyeSize: 0.9,
      eyeSpacing: 0.24,
      eyeTilt: -0.1,
      noseHeight: -0.48,
      noseWidth: -0.25,
      noseDepth: -0.35,
      mouthWidth: -0.22,
      lipFullness: 0.25,
      earSize: 0.15,
      earAngle: 0.2,
    },
  },
]);

// ---------------------------------------------------------------- 3. 헤어 옴브레 & 엔젤링 하이라이트 5종

export const SHAPER_HAIR_OMBRE_IDS = [
  "natural-solid",
  "rofan-twotone-ombre",
  "idol-secret-twotone",
  "cyber-neon-tip",
  "angel-ring-gloss",
] as const;

export type ShaperHairOmbreId = (typeof SHAPER_HAIR_OMBRE_IDS)[number];

export interface ShaperHairOmbrePreset {
  readonly id: ShaperHairOmbreId;
  readonly labelKo: string;
  readonly hairColor: HairColor;
  readonly hairTipHex: string | null;
  readonly hairAccentHex: string | null;
  readonly specular: Look["specular"];
}

export const SHAPER_HAIR_OMBRE_PRESETS: readonly ShaperHairOmbrePreset[] = deepFreeze([
  {
    id: "natural-solid",
    labelKo: "내추럴 단색",
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    hairTipHex: null,
    hairAccentHex: null,
    specular: { size: 0.22, strength: 0.35, hairBand: "band", center: 0.38, width: 0.18 },
  },
  {
    id: "rofan-twotone-ombre",
    labelKo: "로판 투톤 옴브레",
    hairColor: { gradient: [0.42, 1], tipMix: 0.65, accent: "inner" },
    hairTipHex: "#f2b8c6",
    hairAccentHex: "#c9b8e8",
    specular: { size: 0.3, strength: 0.65, hairBand: "ring", center: 0.35, width: 0.16 },
  },
  {
    id: "idol-secret-twotone",
    labelKo: "아이돌 시크릿 투톤",
    hairColor: { gradient: [0.48, 1], tipMix: 0.55, accent: "inner" },
    hairTipHex: "#a8d0e6",
    hairAccentHex: "#f472b6",
    specular: { size: 0.32, strength: 0.72, hairBand: "ring", center: 0.34, width: 0.15 },
  },
  {
    id: "cyber-neon-tip",
    labelKo: "사이버 네온 팁",
    hairColor: { gradient: [0.38, 1], tipMix: 0.8, accent: "streak" },
    hairTipHex: "#06b6d4",
    hairAccentHex: "#ec4899",
    specular: { size: 0.28, strength: 0.6, hairBand: "band", center: 0.4, width: 0.14 },
  },
  {
    id: "angel-ring-gloss",
    labelKo: "엔젤링 고광택",
    hairColor: { gradient: [0.5, 1], tipMix: 0.25, accent: "none" },
    hairTipHex: null,
    hairAccentHex: null,
    specular: { size: 0.36, strength: 0.9, hairBand: "ring", center: 0.32, width: 0.14 },
  },
]);

// ---------------------------------------------------------------- 4. 웹툰 셀셰이딩 / SDF 그림자 / 외곽선 4종

export const SHAPER_TOON_SHADER_IDS = [
  "romance-soft-sdf",
  "action-hard-cel3",
  "ink-wash-tone",
  "illumination-rim",
] as const;

export type ShaperToonShaderId = (typeof SHAPER_TOON_SHADER_IDS)[number];

export interface ShaperToonShaderPreset {
  readonly id: ShaperToonShaderId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly toon: Pick<ShadingProfile["toon"], "rampSteps" | "rim" | "outline">;
  readonly lookPatch: LookPatch;
}

export const SHAPER_TOON_SHADER_PRESETS: readonly ShaperToonShaderPreset[] = deepFreeze([
  {
    id: "romance-soft-sdf",
    labelKo: "순정 소프트 셀 2단 + SDF",
    shortLabelKo: "순정 소프트 SDF",
    toon: { rampSteps: 2, rim: true, outline: "hull" },
    lookPatch: {
      ramp: { softness: 0.24, secondShade: null },
      shade: {
        skin: { kind: "oklab", dL: -0.14, dHueDeg: -8, chroma: 1.18 },
        hair: { kind: "oklab", dL: -0.2, dHueDeg: -10, chroma: 1.12 },
        other: { kind: "oklab", dL: -0.18, dHueDeg: -6, chroma: 1.08 },
      },
      rim: { edge0: 0.58, edge1: 0.78, strength: 0.75, color: [1, 0.94, 0.96] },
      line: {
        method: "style-hull",
        widthMm: 2.2,
        depthGain: 0.2,
        curvatureGain: 0.1,
        color: { mode: "darken-albedo", dL: 0.36, chroma: 0.9 },
        inner: { enabled: false, creaseDeg: 35, partBoundary: false, widthPx: 1 },
      },
      paper: { kind: "none", strength: 0, grainPx1080: 1, bleedPx1080: 0, seed: 0 },
    },
  },
  {
    id: "action-hard-cel3",
    labelKo: "액션 하드 셀 3단 + 굵은 외곽선",
    shortLabelKo: "액션 하드 셀 3단",
    toon: { rampSteps: 3, rim: true, outline: "hull" },
    lookPatch: {
      ramp: {
        softness: 0.03,
        secondShade: { kind: "oklab", dL: -0.36, dHueDeg: -14, chroma: 1.22 },
      },
      shade: {
        skin: { kind: "oklab", dL: -0.2, dHueDeg: -12, chroma: 1.15 },
        hair: { kind: "oklab", dL: -0.28, dHueDeg: -16, chroma: 1.18 },
        other: { kind: "oklab", dL: -0.24, dHueDeg: -10, chroma: 1.1 },
      },
      rim: { edge0: 0.62, edge1: 0.72, strength: 1.25, color: [0.85, 0.94, 1] },
      line: {
        method: "style-hull",
        widthMm: 5.8,
        depthGain: 0.35,
        curvatureGain: 0.25,
        color: { mode: "fixed", rgb: [0.05, 0.05, 0.08] },
        inner: { enabled: true, creaseDeg: 28, partBoundary: true, widthPx: 2 },
      },
      paper: { kind: "none", strength: 0, grainPx1080: 1, bleedPx1080: 0, seed: 0 },
    },
  },
  {
    id: "ink-wash-tone",
    labelKo: "수묵 담채 톤",
    shortLabelKo: "수묵 담채",
    toon: { rampSteps: 2, rim: false, outline: "hull" },
    lookPatch: {
      ramp: { softness: 0.38, secondShade: null },
      shade: {
        skin: { kind: "multiply", rgb: [0.8, 0.76, 0.73] },
        hair: { kind: "multiply", rgb: [0.62, 0.62, 0.64] },
        other: { kind: "multiply", rgb: [0.7, 0.69, 0.68] },
      },
      rim: { edge0: 0.6, edge1: 0.8, strength: 0, color: [0.8, 0.8, 0.8] },
      line: {
        method: "style-hull",
        widthMm: 3.4,
        depthGain: 0.25,
        curvatureGain: 0.45,
        color: { mode: "fixed", rgb: [0.12, 0.11, 0.1] },
        inner: { enabled: true, creaseDeg: 32, partBoundary: false, widthPx: 1 },
      },
      paper: { kind: "ink-wash", strength: 0.42, grainPx1080: 2.4, bleedPx1080: 3.5, seed: 108 },
      grade: { saturation: 0.82, lightness: 0.02, accentChannels: [] },
    },
  },
  {
    id: "illumination-rim",
    labelKo: "일루미네이션 림라이트",
    shortLabelKo: "일루미네이션 림",
    toon: { rampSteps: 3, rim: true, outline: "hull" },
    lookPatch: {
      ramp: {
        softness: 0.14,
        secondShade: { kind: "oklab", dL: -0.26, dHueDeg: 10, chroma: 1.15 },
      },
      rim: { edge0: 0.46, edge1: 0.72, strength: 1.55, color: [0.96, 0.92, 1] },
      specular: { size: 0.34, strength: 0.82, hairBand: "ring", center: 0.33, width: 0.15 },
      line: {
        method: "style-hull",
        widthMm: 2.8,
        depthGain: 0.18,
        curvatureGain: 0.12,
        color: { mode: "darken-albedo", dL: 0.4, chroma: 0.95 },
        inner: { enabled: false, creaseDeg: 35, partBoundary: false, widthPx: 1 },
      },
      paper: { kind: "none", strength: 0, grainPx1080: 1, bleedPx1080: 0, seed: 0 },
    },
  },
]);

/** 현재 `ShadingProfile` 위에 웹툰 셀셰이딩 프리셋을 합성한 새 프로필을 반환한다. */
export function buildShaperToonShadingProfile(
  current: ShadingProfile,
  preset: ShaperToonShaderPreset,
): ShadingProfile {
  return {
    ...current,
    mode: "toon",
    toon: {
      ...current.toon,
      rampSteps: preset.toon.rampSteps,
      rim: preset.toon.rim,
      outline: preset.toon.outline,
    },
    look: mergeLook(current.look, preset.lookPatch),
  };
}
