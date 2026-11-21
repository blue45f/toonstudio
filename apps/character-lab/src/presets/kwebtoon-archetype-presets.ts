/**
 * 한국 웹툰(K-Webtoon) 완성형 캐릭터 아키타입 10종 정본 라이브러리.
 *
 * - 로판·현대 로맨스·학원·헌터 액션·오피스·무협·SD 마스코트까지 10개 완성형 캐릭터를
 *   미형 V라인 얼굴·레이어드 헤어·장르 의상·등신 비례·2단 셀 셰이딩·유색 선화·포즈까지 1클릭 일괄 적용한다.
 * - 모든 슬롯 ID는 `SLOT_PRESET_IDS` 어휘만 사용하고, 모든 Look은 `lookSchema`를, 조합 결과는 `characterRecipeSchema`를 만족한다.
 */
import {
  DEFAULT_SHADING,
  characterRecipeSchema,
  normalizeParamValues,
  type ArtStyleId,
  type BodyParamKey,
  type ChannelColors,
  type CharacterRecipe,
  type ExpressionWeights,
  type FaceParamKey,
  type HairColor,
  type KitV2ArchetypeId,
  type Look,
  type ParamValues,
  type Pose,
  type PresetId,
  type Proportion,
  type RecipeColorKey,
  type ShadingProfile,
  type SlotKind,
} from "../contracts";
import { qNormalize, type Quat, type Vec3 } from "../shared/math";

export const KWEBTOON_ARCHETYPE_IDS = [
  "kwebtoon-rofan-princess",
  "kwebtoon-northern-duke",
  "kwebtoon-academy-heroine",
  "kwebtoon-academy-hero",
  "kwebtoon-srank-hunter",
  "kwebtoon-srank-healer",
  "kwebtoon-office-ceo",
  "kwebtoon-modern-heroine",
  "kwebtoon-murim-swordsman",
  "kwebtoon-sd-mascot",
] as const;
export type KWebtoonArchetypeId = (typeof KWEBTOON_ARCHETYPE_IDS)[number];

export type KWebtoonShadingStyleId = "rofan-peach" | "romance-clean" | "hunter-dramatic" | "murim-ink" | "sd-pastel";

export interface KWebtoonArchetypePreset {
  readonly id: KWebtoonArchetypeId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly genreKo: string;
  readonly summaryKo: string;
  readonly tagsKo: readonly string[];
  readonly artStyleId: ArtStyleId;
  readonly shadingStyleId: KWebtoonShadingStyleId;
  readonly kitBaseId: "female" | "male";
  readonly kitArchetypeId: KitV2ArchetypeId;
  readonly proportion: Proportion;
  readonly bodyParams: ParamValues<BodyParamKey>;
  readonly faceParams: ParamValues<FaceParamKey>;
  readonly slots: Partial<Record<SlotKind, PresetId>>;
  readonly colors: Record<RecipeColorKey, string>;
  readonly accentColors?: Partial<ChannelColors>;
  readonly hairColor: HairColor;
  readonly expression: ExpressionWeights;
  readonly pose: Pose;
  readonly look: Look;
  readonly rampSteps: 2 | 3;
}

function eulerDegToQuat(deg: Vec3): Quat {
  const rx = (deg[0] * Math.PI) / 360;
  const ry = (deg[1] * Math.PI) / 360;
  const rz = (deg[2] * Math.PI) / 360;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return qNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

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

/** 한국 웹툰 5종 2단 셀 셰이딩 + 자동 매칭 유색 선화 Look 프로파일 */
export const KWEBTOON_ARCHETYPE_LOOKS: Readonly<Record<KWebtoonShadingStyleId, Look>> = Object.freeze({
  "rofan-peach": {
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
  },
  "romance-clean": {
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
  },
  "hunter-dramatic": {
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
  },
  "murim-ink": {
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
  },
  "sd-pastel": {
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
  },
});

const POSE_GRACEFUL: Pose = Object.freeze({
  hips: eulerDegToQuat([0, -5, 1.5]),
  spine: eulerDegToQuat([1.5, 3, -1]),
  chest: eulerDegToQuat([-2, 2, 0]),
  neck: eulerDegToQuat([3, -3, 1.5]),
  head: eulerDegToQuat([-2, -5, -2]),
  leftUpperArm: eulerDegToQuat([6, 2, -26]),
  leftLowerArm: eulerDegToQuat([16, 10, 0]),
  rightUpperArm: eulerDegToQuat([-5, -6, 28]),
  rightLowerArm: eulerDegToQuat([20, -10, 0]),
});

const POSE_IMPERIAL: Pose = Object.freeze({
  hips: eulerDegToQuat([0, 7, -1]),
  spine: eulerDegToQuat([-1.5, -4, 1]),
  chest: eulerDegToQuat([-3, -3, 0]),
  neck: eulerDegToQuat([2, 4, 0]),
  head: eulerDegToQuat([-3, 6, 1]),
  leftUpperArm: eulerDegToQuat([4, 6, -18]),
  leftLowerArm: eulerDegToQuat([14, 8, 0]),
  rightUpperArm: eulerDegToQuat([-6, -8, 22]),
  rightLowerArm: eulerDegToQuat([22, -12, 0]),
});

const POSE_HEROIC_STANCE: Pose = Object.freeze({
  hips: eulerDegToQuat([0, 9, -2]),
  spine: eulerDegToQuat([2, -5, 1.5]),
  chest: eulerDegToQuat([-2, -4, 0]),
  neck: eulerDegToQuat([2, 6, -1]),
  head: eulerDegToQuat([-2, 7, 1]),
  leftUpperArm: eulerDegToQuat([-8, 12, -24]),
  leftLowerArm: eulerDegToQuat([26, 14, 0]),
  rightUpperArm: eulerDegToQuat([10, -8, 26]),
  rightLowerArm: eulerDegToQuat([18, -10, 0]),
});

const POSE_CHEERFUL_SD: Pose = Object.freeze({
  hips: eulerDegToQuat([0, -4, 2]),
  spine: eulerDegToQuat([2, 4, -2]),
  head: eulerDegToQuat([-4, -6, 5]),
  leftUpperArm: eulerDegToQuat([-12, 8, -32]),
  leftLowerArm: eulerDegToQuat([28, 12, 0]),
  rightUpperArm: eulerDegToQuat([-10, -8, 34]),
  rightLowerArm: eulerDegToQuat([24, -12, 0]),
});

export const KWEBTOON_ARCHETYPE_PRESETS: Readonly<Record<KWebtoonArchetypeId, KWebtoonArchetypePreset>> = Object.freeze({
  "kwebtoon-rofan-princess": {
    id: "kwebtoon-rofan-princess",
    labelKo: "로판 황녀 (은발 웨이브 · 티아라 · 코르셋 드레스)",
    shortLabelKo: "로판 황녀",
    genreKo: "로맨스 판타지",
    summaryKo: "은발 웨이브와 별빛 홍채, 7.8등신 슬림 실루엣과 복숭아 2단 셀",
    tagsKo: ["은발 웨이브", "티아라", "코르셋 드레스"],
    artStyleId: "kr-webtoon-romance",
    shadingStyleId: "rofan-peach",
    kitBaseId: "female",
    kitArchetypeId: "female-romance",
    proportion: { headsTall: 7.8, legRatio: 0.5, armRatio: 0.42, shoulderHeads: 1.55, headWidthRatio: 0.78, handScale: 0.92 },
    bodyParams: { height: 0.04, headSize: -0.06, shoulderWidth: -0.22, chestDepth: 0.14, waist: -0.36, hip: 0.2, armLength: -0.02, legLength: 0.24, neckLength: 0.12 },
    faceParams: {
      faceShape: -0.34, jawWidth: -0.42, chinLength: -0.04, cheekVolume: 0.14, forehead: 0.08,
      eyeSize: 0.36, eyeSpacing: 0.06, eyeTilt: 0.14, noseHeight: 0.22, noseWidth: -0.3, noseDepth: 0.2,
      mouthWidth: -0.1, lipFullness: 0.2, earSize: -0.06, earAngle: 0,
    },
    slots: {
      "face-shape": "face-shape/heart", eyes: "eyes/wide", irises: "irises/star-highlight", nose: "nose/small",
      mouth: "mouth/smile-corner", ears: "ears/small", hair: "hair/romance-long", body: "body/slim",
      top: "top/blazer", bottom: "bottom/long-skirt", shoes: "shoes/loafers", accessory: "accessory/ribbon",
    },
    colors: {
      skin: "#ffefe6", iris: "#965ec8", hair: "#e2e4f0", brow: "#9a96ad",
      top: "#f6eff7", bottom: "#472f5f", shoes: "#6e5166", accessory: "#e5ba68",
    },
    accentColors: { lip: "#e56a7c", blush: "#f5a5b0", "hair-tip": "#c4b6e0", "hair-accent": "#f6eefc" },
    hairColor: { gradient: [0.55, 0.95], tipMix: 0.35, accent: "inner" },
    expression: { mouthSmile: 0.32, eyeWide: 0.08 },
    pose: POSE_GRACEFUL,
    look: KWEBTOON_ARCHETYPE_LOOKS["rofan-peach"],
    rampSteps: 2,
  },

  "kwebtoon-northern-duke": {
    id: "kwebtoon-northern-duke",
    labelKo: "북부 대공 (흑발 올백 · 제국 군복 · 적안)",
    shortLabelKo: "북부 대공",
    genreKo: "로맨스 판타지",
    summaryKo: "8.8등신 냉미남 V라인, 흑발과 루비 적안, 제국 블랙-골드 군복",
    tagsKo: ["흑발 올백", "제국 군복", "적안 냉미남"],
    artStyleId: "kr-webtoon-action",
    shadingStyleId: "hunter-dramatic",
    kitBaseId: "male",
    kitArchetypeId: "male-webtoon",
    proportion: { headsTall: 8.8, legRatio: 0.53, armRatio: 0.44, shoulderHeads: 2.15, headWidthRatio: 0.76, handScale: 1.05 },
    bodyParams: { height: 0.48, headSize: -0.22, shoulderWidth: 0.48, chestDepth: 0.3, waist: -0.06, hip: -0.16, armLength: 0.2, legLength: 0.34, neckLength: 0.12 },
    faceParams: {
      faceShape: -0.34, jawWidth: -0.24, chinLength: 0.14, cheekVolume: -0.12, forehead: 0.08,
      eyeSize: -0.1, eyeSpacing: 0.04, eyeTilt: 0.24, noseHeight: 0.28, noseWidth: -0.22, noseDepth: 0.28,
      mouthWidth: 0.04, lipFullness: -0.04, earSize: 0, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/round-small", nose: "nose/high-bridge",
      mouth: "mouth/thin", ears: "ears/standard", hair: "hair/short-layered", body: "body/tall",
      top: "top/blazer", bottom: "bottom/slacks", shoes: "shoes/boots", accessory: "accessory/choker",
    },
    colors: {
      skin: "#fcece4", iris: "#b8263b", hair: "#171922", brow: "#171922",
      top: "#1a1e2c", bottom: "#131620", shoes: "#121318", accessory: "#cfa454",
    },
    accentColors: { lip: "#c97476", blush: "#e8a8a2", "hair-tip": "#282e42" },
    hairColor: { gradient: [0.65, 1.0], tipMix: 0.22, accent: "none" },
    expression: { browDown: 0.16, eyeSquint: 0.1 },
    pose: POSE_IMPERIAL,
    look: KWEBTOON_ARCHETYPE_LOOKS["hunter-dramatic"],
    rampSteps: 2,
  },

  "kwebtoon-academy-heroine": {
    id: "kwebtoon-academy-heroine",
    labelKo: "학원 여주 (시스루 단발 · 블레이저 교복)",
    shortLabelKo: "학원 여주",
    genreKo: "학원 로맨스",
    summaryKo: "시스루 뱅 소프트 보브와 생기 있는 호박색 눈동자, 명문고 블레이저 교복",
    tagsKo: ["시스루 단발", "블레이저 교복", "청순 생기"],
    artStyleId: "kr-webtoon-romance",
    shadingStyleId: "romance-clean",
    kitBaseId: "female",
    kitArchetypeId: "youth-academy",
    proportion: { headsTall: 7.5, legRatio: 0.49, armRatio: 0.41, shoulderHeads: 1.52, headWidthRatio: 0.8, handScale: 0.92 },
    bodyParams: { height: -0.06, headSize: 0.02, shoulderWidth: -0.2, chestDepth: 0.1, waist: -0.3, hip: 0.14, armLength: -0.04, legLength: 0.18, neckLength: 0.08 },
    faceParams: {
      faceShape: -0.26, jawWidth: -0.34, chinLength: -0.08, cheekVolume: 0.18, forehead: 0.08,
      eyeSize: 0.34, eyeSpacing: 0.05, eyeTilt: 0.08, noseHeight: 0.14, noseWidth: -0.26, noseDepth: 0.16,
      mouthWidth: -0.08, lipFullness: 0.18, earSize: -0.04, earAngle: 0,
    },
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/round", irises: "irises/soft-gradient", nose: "nose/button",
      mouth: "mouth/smile-corner", ears: "ears/small", hair: "hair/soft-bob", body: "body/slim",
      top: "top/blazer", bottom: "bottom/pleated-skirt", shoes: "shoes/loafers", accessory: "accessory/ribbon",
    },
    colors: {
      skin: "#ffeede", iris: "#a86a3a", hair: "#593e36", brow: "#593e36",
      top: "#242f4b", bottom: "#6e2c3e", shoes: "#3a2522", accessory: "#d43d59",
    },
    accentColors: { lip: "#eb6f7e", blush: "#f8a8b2", "hair-tip": "#7d5848" },
    hairColor: { gradient: [0.58, 0.98], tipMix: 0.28, accent: "none" },
    expression: { mouthSmile: 0.42, eyeWide: 0.06 },
    pose: POSE_GRACEFUL,
    look: KWEBTOON_ARCHETYPE_LOOKS["romance-clean"],
    rampSteps: 2,
  },

  "kwebtoon-academy-hero": {
    id: "kwebtoon-academy-hero",
    labelKo: "학원 남주 (가르마 흑발 · 가디건 교복)",
    shortLabelKo: "학원 남주",
    genreKo: "학원 로맨스",
    summaryKo: "8.1등신 소년미와 부드러운 아몬드 눈매, 크림 셔츠·슬랙스 교복",
    tagsKo: ["가르마 흑발", "가디건 교복", "청량 남주"],
    artStyleId: "kr-webtoon-romance",
    shadingStyleId: "romance-clean",
    kitBaseId: "male",
    kitArchetypeId: "male-webtoon",
    proportion: { headsTall: 8.1, legRatio: 0.51, armRatio: 0.43, shoulderHeads: 1.92, headWidthRatio: 0.78, handScale: 1.0 },
    bodyParams: { height: 0.28, headSize: -0.1, shoulderWidth: 0.3, chestDepth: 0.18, waist: -0.06, hip: -0.12, armLength: 0.12, legLength: 0.24, neckLength: 0.1 },
    faceParams: {
      faceShape: -0.3, jawWidth: -0.3, chinLength: 0.06, cheekVolume: -0.04, forehead: 0.06,
      eyeSize: 0.1, eyeSpacing: 0.04, eyeTilt: 0.1, noseHeight: 0.22, noseWidth: -0.2, noseDepth: 0.22,
      mouthWidth: 0.02, lipFullness: 0.06, earSize: 0, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/almond", irises: "irises/soft-gradient", nose: "nose/straight",
      mouth: "mouth/small", ears: "ears/standard", hair: "hair/short-layered", body: "body/athletic",
      top: "top/shirt", bottom: "bottom/slacks", shoes: "shoes/sneakers",
    },
    colors: {
      skin: "#fbe6d8", iris: "#3f3848", hair: "#20232e", brow: "#20232e",
      top: "#ece7dc", bottom: "#2e323e", shoes: "#e8ebf0", accessory: "#384664",
    },
    accentColors: { lip: "#d97c7e", blush: "#f0aca8", "hair-tip": "#343a4d" },
    hairColor: { gradient: [0.62, 1.0], tipMix: 0.2, accent: "none" },
    expression: { mouthSmile: 0.26 },
    pose: POSE_IMPERIAL,
    look: KWEBTOON_ARCHETYPE_LOOKS["romance-clean"],
    rampSteps: 2,
  },

  "kwebtoon-srank-hunter": {
    id: "kwebtoon-srank-hunter",
    labelKo: "S급 헌터 남 (울프컷 · 전술 롱코트)",
    shortLabelKo: "S급 헌터 남",
    genreKo: "헌터 액션",
    summaryKo: "날카로운 울프컷과 마나 청안, 8.6등신 액션 프로포션과 고대비 시안 림",
    tagsKo: ["울프컷", "전술 롱코트", "고대비 시안 림"],
    artStyleId: "kr-webtoon-action",
    shadingStyleId: "hunter-dramatic",
    kitBaseId: "male",
    kitArchetypeId: "male-action",
    proportion: { headsTall: 8.6, legRatio: 0.53, armRatio: 0.44, shoulderHeads: 2.08, headWidthRatio: 0.76, handScale: 1.04 },
    bodyParams: { height: 0.42, headSize: -0.18, shoulderWidth: 0.46, chestDepth: 0.32, waist: 0.02, hip: -0.14, armLength: 0.2, legLength: 0.3, neckLength: 0.1 },
    faceParams: {
      faceShape: -0.32, jawWidth: -0.22, chinLength: 0.12, cheekVolume: -0.12, forehead: 0.08,
      eyeSize: -0.02, eyeSpacing: 0.04, eyeTilt: 0.3, noseHeight: 0.26, noseWidth: -0.2, noseDepth: 0.26,
      mouthWidth: 0.06, lipFullness: -0.04, earSize: 0.02, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/upturned", irises: "irises/cat", nose: "nose/high-bridge",
      mouth: "mouth/thin", ears: "ears/standard", hair: "hair/wolf-layered", body: "body/athletic",
      top: "top/hoodie", bottom: "bottom/jeans", shoes: "shoes/boots", accessory: "accessory/choker",
    },
    colors: {
      skin: "#f8e4d8", iris: "#2da8e6", hair: "#191e2e", brow: "#191e2e",
      top: "#202530", bottom: "#181c24", shoes: "#13151a", accessory: "#2c7dc4",
    },
    accentColors: { lip: "#cc7678", blush: "#e6a4a0", "hair-tip": "#2c4068", "hair-accent": "#4aa6e8" },
    hairColor: { gradient: [0.56, 0.96], tipMix: 0.32, accent: "streak" },
    expression: { browDown: 0.22, mouthSmile: 0.12 },
    pose: POSE_HEROIC_STANCE,
    look: KWEBTOON_ARCHETYPE_LOOKS["hunter-dramatic"],
    rampSteps: 2,
  },

  "kwebtoon-srank-healer": {
    id: "kwebtoon-srank-healer",
    labelKo: "S급 힐러 여 (포니테일 · 성기사 케이프)",
    shortLabelKo: "S급 힐러 여",
    genreKo: "헌터 판타지",
    summaryKo: "금발 액션 포니테일과 에메랄드 성광 홍채, 성기사 화이트-골드 케이프",
    tagsKo: ["포니테일", "성기사 케이프", "성광 림"],
    artStyleId: "kr-webtoon-romance",
    shadingStyleId: "rofan-peach",
    kitBaseId: "female",
    kitArchetypeId: "female-romance",
    proportion: { headsTall: 7.8, legRatio: 0.5, armRatio: 0.42, shoulderHeads: 1.56, headWidthRatio: 0.79, handScale: 0.93 },
    bodyParams: { height: 0.06, headSize: -0.06, shoulderWidth: -0.18, chestDepth: 0.14, waist: -0.34, hip: 0.18, armLength: 0, legLength: 0.22, neckLength: 0.1 },
    faceParams: {
      faceShape: -0.3, jawWidth: -0.36, chinLength: -0.02, cheekVolume: 0.1, forehead: 0.08,
      eyeSize: 0.34, eyeSpacing: 0.06, eyeTilt: 0.16, noseHeight: 0.2, noseWidth: -0.28, noseDepth: 0.2,
      mouthWidth: -0.08, lipFullness: 0.16, earSize: -0.04, earAngle: 0,
    },
    slots: {
      "face-shape": "face-shape/heart", eyes: "eyes/wide", irises: "irises/star-highlight", nose: "nose/small",
      mouth: "mouth/smile-corner", ears: "ears/small", hair: "hair/action-pony", body: "body/slim",
      top: "top/sailor", bottom: "bottom/long-skirt", shoes: "shoes/boots", accessory: "accessory/earrings",
    },
    colors: {
      skin: "#fff0e5", iris: "#3ab89c", hair: "#ebd096", brow: "#9c7e52",
      top: "#f5f6fa", bottom: "#39557a", shoes: "#e6e2da", accessory: "#e6b95c",
    },
    accentColors: { lip: "#eb7282", blush: "#f9b0b8", "hair-tip": "#fff0c4", "hair-accent": "#fff7de" },
    hairColor: { gradient: [0.54, 0.96], tipMix: 0.3, accent: "inner" },
    expression: { mouthSmile: 0.36, eyeWide: 0.1 },
    pose: POSE_GRACEFUL,
    look: KWEBTOON_ARCHETYPE_LOOKS["rofan-peach"],
    rampSteps: 2,
  },

  "kwebtoon-office-ceo": {
    id: "kwebtoon-office-ceo",
    labelKo: "현대 오피스 대표 (포마드 · 슬림 수트 · 안경)",
    shortLabelKo: "오피스 대표",
    genreKo: "현대 로맨스",
    summaryKo: "8.5등신 슬림 수트 실루엣, 정돈된 포마드 헤어와 티타늄 안경",
    tagsKo: ["포마드", "슬림 수트", "지적 안경"],
    artStyleId: "kr-webtoon-romance",
    shadingStyleId: "romance-clean",
    kitBaseId: "male",
    kitArchetypeId: "male-webtoon",
    proportion: { headsTall: 8.5, legRatio: 0.52, armRatio: 0.43, shoulderHeads: 2.04, headWidthRatio: 0.77, handScale: 1.02 },
    bodyParams: { height: 0.38, headSize: -0.16, shoulderWidth: 0.4, chestDepth: 0.24, waist: -0.06, hip: -0.14, armLength: 0.16, legLength: 0.3, neckLength: 0.12 },
    faceParams: {
      faceShape: -0.32, jawWidth: -0.26, chinLength: 0.1, cheekVolume: -0.1, forehead: 0.08,
      eyeSize: -0.08, eyeSpacing: 0.03, eyeTilt: 0.16, noseHeight: 0.26, noseWidth: -0.2, noseDepth: 0.24,
      mouthWidth: 0.04, lipFullness: 0, earSize: 0, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/round-small", nose: "nose/high-bridge",
      mouth: "mouth/thin", ears: "ears/standard", hair: "hair/short-layered", body: "body/tall",
      top: "top/blazer", bottom: "bottom/slacks", shoes: "shoes/loafers", accessory: "accessory/glasses",
    },
    colors: {
      skin: "#f7e2d3", iris: "#363f4d", hair: "#211e24", brow: "#211e24",
      top: "#222938", bottom: "#1b212e", shoes: "#191618", accessory: "#8a929e",
    },
    accentColors: { lip: "#cc7a7c", blush: "#e8aba5", "hair-tip": "#35313c" },
    hairColor: { gradient: [0.65, 1.0], tipMix: 0.18, accent: "none" },
    expression: { mouthSmile: 0.14 },
    pose: POSE_IMPERIAL,
    look: KWEBTOON_ARCHETYPE_LOOKS["romance-clean"],
    rampSteps: 2,
  },

  "kwebtoon-modern-heroine": {
    id: "kwebtoon-modern-heroine",
    labelKo: "현대 웹툰 여주 (레이어드 긴머리 · 트렌치코트)",
    shortLabelKo: "현대 웹툰 여주",
    genreKo: "현대 로맨스",
    summaryKo: "다크 초콜릿 레이어드 긴머리와 헤이즐넛 눈빛, 카멜 트렌치 오피스룩",
    tagsKo: ["레이어드 긴머리", "트렌치코트", "세련 V라인"],
    artStyleId: "kr-webtoon-romance",
    shadingStyleId: "romance-clean",
    kitBaseId: "female",
    kitArchetypeId: "female-romance",
    proportion: { headsTall: 7.8, legRatio: 0.5, armRatio: 0.42, shoulderHeads: 1.56, headWidthRatio: 0.78, handScale: 0.93 },
    bodyParams: { height: 0.06, headSize: -0.06, shoulderWidth: -0.18, chestDepth: 0.12, waist: -0.32, hip: 0.18, armLength: -0.02, legLength: 0.22, neckLength: 0.1 },
    faceParams: {
      faceShape: -0.34, jawWidth: -0.38, chinLength: -0.02, cheekVolume: 0.08, forehead: 0.08,
      eyeSize: 0.26, eyeSpacing: 0.05, eyeTilt: 0.14, noseHeight: 0.22, noseWidth: -0.28, noseDepth: 0.2,
      mouthWidth: -0.06, lipFullness: 0.22, earSize: -0.04, earAngle: 0,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/almond", irises: "irises/soft-gradient", nose: "nose/straight",
      mouth: "mouth/full", ears: "ears/small", hair: "hair/romance-long", body: "body/slim",
      top: "top/blazer", bottom: "bottom/slacks", shoes: "shoes/boots", accessory: "accessory/earrings",
    },
    colors: {
      skin: "#ffede2", iris: "#7a4d38", hair: "#3a2824", brow: "#3a2824",
      top: "#c8a582", bottom: "#ebe3d8", shoes: "#4d352c", accessory: "#f0d8a8",
    },
    accentColors: { lip: "#e26874", blush: "#f4a5ae", "hair-tip": "#5e4036" },
    hairColor: { gradient: [0.56, 0.96], tipMix: 0.26, accent: "none" },
    expression: { mouthSmile: 0.24 },
    pose: POSE_GRACEFUL,
    look: KWEBTOON_ARCHETYPE_LOOKS["romance-clean"],
    rampSteps: 2,
  },

  "kwebtoon-murim-swordsman": {
    id: "kwebtoon-murim-swordsman",
    labelKo: "무협 협객 (상투 반묶음 · 청옥 도포)",
    shortLabelKo: "무협 협객",
    genreKo: "정통 무협",
    summaryKo: "흑발 반묶음 포니와 금안, 청옥 도포에 월광 2단 셀과 강약 있는 먹선",
    tagsKo: ["반묶음 상투", "청옥 도포", "월광 수묵 셀"],
    artStyleId: "ink-wash",
    shadingStyleId: "murim-ink",
    kitBaseId: "male",
    kitArchetypeId: "male-action",
    proportion: { headsTall: 8.3, legRatio: 0.52, armRatio: 0.43, shoulderHeads: 1.98, headWidthRatio: 0.77, handScale: 1.02 },
    bodyParams: { height: 0.34, headSize: -0.14, shoulderWidth: 0.38, chestDepth: 0.26, waist: -0.02, hip: -0.12, armLength: 0.16, legLength: 0.26, neckLength: 0.12 },
    faceParams: {
      faceShape: -0.32, jawWidth: -0.26, chinLength: 0.1, cheekVolume: -0.1, forehead: 0.08,
      eyeSize: -0.04, eyeSpacing: 0.04, eyeTilt: 0.26, noseHeight: 0.26, noseWidth: -0.22, noseDepth: 0.24,
      mouthWidth: 0.04, lipFullness: -0.04, earSize: 0, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/cat", nose: "nose/high-bridge",
      mouth: "mouth/thin", ears: "ears/standard", hair: "hair/action-pony", body: "body/athletic",
      top: "top/shirt", bottom: "bottom/long-skirt", shoes: "shoes/boots",
    },
    colors: {
      skin: "#f8e5d4", iris: "#b8822e", hair: "#181a20", brow: "#181a20",
      top: "#3d6368", bottom: "#1d2830", shoes: "#181a1e", accessory: "#c4a35a",
    },
    accentColors: { lip: "#cc7a74", blush: "#e8aa9c", "hair-tip": "#2b323d" },
    hairColor: { gradient: [0.6, 0.98], tipMix: 0.22, accent: "none" },
    expression: { browDown: 0.16 },
    pose: POSE_HEROIC_STANCE,
    look: KWEBTOON_ARCHETYPE_LOOKS["murim-ink"],
    rampSteps: 2,
  },

  "kwebtoon-sd-mascot": {
    id: "kwebtoon-sd-mascot",
    labelKo: "귀염 SD 마스코트 (3.5등신 · 트윈테일 · 후드)",
    shortLabelKo: "SD 마스코트",
    genreKo: "SD · 개그 · 일상",
    summaryKo: "3.5등신 동글동글 치비 비례, 딸기코랄 트윈테일과 화사한 파스텔 2단 셀",
    tagsKo: ["3.5등신 SD", "트윈테일", "파스텔 셀"],
    artStyleId: "sd-chibi",
    shadingStyleId: "sd-pastel",
    kitBaseId: "female",
    kitArchetypeId: "sd-chibi",
    proportion: { headsTall: 3.5, legRatio: 0.36, armRatio: 0.34, shoulderHeads: 1.15, headWidthRatio: 0.96, handScale: 0.85 },
    bodyParams: { height: -0.92, headSize: 0.95, shoulderWidth: -0.42, chestDepth: -0.1, waist: 0.1, hip: 0.08, armLength: -0.45, legLength: -0.68, neckLength: -0.25 },
    faceParams: {
      faceShape: 0.38, jawWidth: -0.12, chinLength: -0.28, cheekVolume: 0.44, forehead: 0.16,
      eyeSize: 0.62, eyeSpacing: 0.14, eyeTilt: 0.04, noseHeight: -0.24, noseWidth: -0.34, noseDepth: -0.18,
      mouthWidth: -0.16, lipFullness: 0.14, earSize: 0.06, earAngle: 0.06,
    },
    slots: {
      "face-shape": "face-shape/round", eyes: "eyes/round", irises: "irises/round-large", nose: "nose/button",
      mouth: "mouth/smile-corner", ears: "ears/small", hair: "hair/twin-tail", body: "body/petite",
      top: "top/hoodie", bottom: "bottom/shorts", shoes: "shoes/sneakers", accessory: "accessory/ribbon",
    },
    colors: {
      skin: "#fff0e6", iris: "#4a9be8", hair: "#f08ca6", brow: "#b85a74",
      top: "#fff3c7", bottom: "#5680b8", shoes: "#f4a2b8", accessory: "#5ad1b6",
    },
    accentColors: { lip: "#f26b88", blush: "#ffa6bc", "hair-tip": "#ffd0dc", "hair-accent": "#ffe8ef" },
    hairColor: { gradient: [0.52, 0.94], tipMix: 0.38, accent: "inner" },
    expression: { mouthSmile: 0.62, eyeWide: 0.14 },
    pose: POSE_CHEERFUL_SD,
    look: KWEBTOON_ARCHETYPE_LOOKS["sd-pastel"],
    rampSteps: 2,
  },
});

export const KWEBTOON_ARCHETYPE_LIST: readonly KWebtoonArchetypePreset[] = Object.freeze(
  KWEBTOON_ARCHETYPE_IDS.map((id) => KWEBTOON_ARCHETYPE_PRESETS[id]),
);

export function isKWebtoonArchetypeId(value: string): value is KWebtoonArchetypeId {
  return value in KWEBTOON_ARCHETYPE_PRESETS;
}

/** 현재 레시피가 10종 K-웹툰 아키타입 중 어느 것과 일치하는지 판별한다. */
export function detectKWebtoonArchetypeId(recipe: CharacterRecipe): KWebtoonArchetypeId | null {
  for (const preset of KWEBTOON_ARCHETYPE_LIST) {
    if (
      recipe.slots.hair === preset.slots.hair &&
      recipe.slots.top === preset.slots.top &&
      recipe.slots.bottom === preset.slots.bottom &&
      recipe.colors.hair.toLowerCase() === preset.colors.hair.toLowerCase() &&
      recipe.colors.iris.toLowerCase() === preset.colors.iris.toLowerCase() &&
      Math.abs((recipe.style.proportion?.headsTall ?? 0) - preset.proportion.headsTall) < 0.05
    ) {
      return preset.id;
    }
  }
  return null;
}

/** 아키타입의 K-웹툰 2단 셀 셰이딩 프로파일을 기존 프로파일 기반으로 생성한다. */
export function buildKWebtoonArchetypeShading(
  preset: KWebtoonArchetypePreset,
  base: ShadingProfile = DEFAULT_SHADING,
): ShadingProfile {
  return {
    ...base,
    mode: "toon",
    toon: {
      ...base.toon,
      rampSteps: preset.rampSteps,
      outline: "hull",
      outlinePressure: true,
      rim: true,
      faceSdfShadow: true,
    },
    look: preset.look,
  };
}

/**
 * 10종 K-웹툰 아키타입 중 하나를 기존 레시피에 1클릭 적용한 완전한 `CharacterRecipe`를 조합한다.
 * 절차(procedural)·키트(kit) 소스를 모두 보존하며, `characterRecipeSchema`로 검증된 결과를 반환한다.
 */
export function composeKWebtoonArchetypeRecipe(
  id: KWebtoonArchetypeId,
  baseRecipe: CharacterRecipe,
): CharacterRecipe {
  const preset = KWEBTOON_ARCHETYPE_PRESETS[id];
  const nextSource: CharacterRecipe["source"] =
    baseRecipe.source.kind === "kit"
      ? {
          ...baseRecipe.source,
          baseId: preset.kitBaseId,
          archetypeId: preset.kitArchetypeId,
        }
      : baseRecipe.source;

  const nextSlots: CharacterRecipe["slots"] = {
    ...baseRecipe.slots,
    ...preset.slots,
    accessory: preset.slots.accessory ?? null,
  };

  const candidate: CharacterRecipe = {
    ...baseRecipe,
    source: nextSource,
    slots: nextSlots,
    body: normalizeParamValues(preset.bodyParams),
    face: normalizeParamValues(preset.faceParams),
    colors: { ...baseRecipe.colors, ...preset.colors, ...(preset.accentColors ?? {}) },
    hairColor: { ...preset.hairColor },
    expression: { ...preset.expression },
    pose: { ...preset.pose },
    shading: buildKWebtoonArchetypeShading(preset, baseRecipe.shading),
    style: {
      ...baseRecipe.style,
      packId: preset.artStyleId,
      packRevision: Math.max(1, baseRecipe.style.packRevision),
      proportion: { ...preset.proportion },
    },
  };

  return characterRecipeSchema.parse(candidate);
}
