/**
 * CSP 2.0+ 3D 두상 모델 믹서 코어 엔진.
 *
 * 9종 웹툰 기본 두상 스타일 가중치 믹서, 8개 영역 34개 독립 부위 슬라이더,
 * 좌우 대칭/비대칭 분기, 그리고 루미스(Loomis)·얼굴 중심선 3D 가이드 투영 데이터를
 * 엔진 비의존 순수 데이터로 계산한다.
 */

import type { AvatarForgeSemanticFaceMorphState } from "../vrm/studio-vrm-avatar-forge";

export type Vec3Tuple = readonly [number, number, number];
export type Vec2Tuple = readonly [number, number];

export const WEBTOON_HEAD_STYLE_IDS = Object.freeze([
  "anime-classic",
  "rofan-noble",
  "action-sharp",
  "modern-drama",
  "chibi-sd",
  "semi-realistic",
  "boyish-shonen",
  "mature-villain",
  "soft-slice",
] as const);

export type WebtoonHeadStyleId = (typeof WEBTOON_HEAD_STYLE_IDS)[number];

export const HEAD_PART_REGIONS = Object.freeze([
  "skull",
  "forehead",
  "eyes",
  "nose",
  "mouth",
  "jaw",
  "cheek",
  "ear-neck",
] as const);

export type HeadPartRegionId = (typeof HEAD_PART_REGIONS)[number];

export const HEAD_PART_REGION_LABELS_KO: Readonly<Record<HeadPartRegionId, string>> = Object.freeze({
  skull: "두상 전체",
  forehead: "이마·눈썹뼈",
  eyes: "눈",
  nose: "코",
  mouth: "입",
  jaw: "턱",
  cheek: "광대·볼",
  "ear-neck": "귀·목",
});

export interface HeadPartSliderSpec {
  readonly id: HeadPartSliderId;
  readonly region: HeadPartRegionId;
  readonly labelKo: string;
  readonly supportsAsymmetry: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export const HEAD_PART_SLIDER_SPECS = Object.freeze([
  // 두상 전체 (4)
  { id: "headWidth", region: "skull", labelKo: "두상 너비", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "headHeight", region: "skull", labelKo: "두상 높이", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "headDepth", region: "skull", labelKo: "두상 앞뒤 깊이", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "craniumVolume", region: "skull", labelKo: "뒤통수 볼륨", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 이마·눈썹뼈 (3)
  { id: "foreheadHeight", region: "forehead", labelKo: "이마 높이", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "foreheadWidth", region: "forehead", labelKo: "이마 너비", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "browRidgeDepth", region: "forehead", labelKo: "눈썹뼈 돌출", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 눈 (7)
  { id: "eyeSize", region: "eyes", labelKo: "눈 크기", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "eyeHeight", region: "eyes", labelKo: "눈 높이", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "eyeSpacing", region: "eyes", labelKo: "미간 간격", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "eyeTilt", region: "eyes", labelKo: "눈꼬리 각도", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "eyeDepth", region: "eyes", labelKo: "눈꺼풀 깊이", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "eyelidCrease", region: "eyes", labelKo: "쌍꺼풀 깊이", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "irisScale", region: "eyes", labelKo: "홍채 크기", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 코 (5)
  { id: "noseLength", region: "nose", labelKo: "코 길이", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "noseBridgeHeight", region: "nose", labelKo: "콧대 높이", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "noseTipUpTilt", region: "nose", labelKo: "코끝 들림", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "noseWidth", region: "nose", labelKo: "콧볼 너비", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "nostrilFlare", region: "nose", labelKo: "콧망울 벌림", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 입 (5)
  { id: "mouthWidth", region: "mouth", labelKo: "입 너비", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "mouthHeight", region: "mouth", labelKo: "입 세로 위치", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "upperLipThickness", region: "mouth", labelKo: "윗입술 두께", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "lowerLipThickness", region: "mouth", labelKo: "아랫입술 두께", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "mouthCornerLift", region: "mouth", labelKo: "입꼬리 올림", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 턱 (4)
  { id: "jawWidth", region: "jaw", labelKo: "하관 너비", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "jawAngleHeight", region: "jaw", labelKo: "턱각 높이", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "chinLength", region: "jaw", labelKo: "턱끝 길이", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "chinPointiness", region: "jaw", labelKo: "턱끝 뾰족함", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 광대·볼 (3)
  { id: "cheekboneWidth", region: "cheek", labelKo: "광대 너비", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "cheekboneHeight", region: "cheek", labelKo: "광대 높이", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "cheekFullness", region: "cheek", labelKo: "볼살 볼륨", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 귀·목 (3)
  { id: "earSize", region: "ear-neck", labelKo: "귀 크기", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "earAngle", region: "ear-neck", labelKo: "귀 돌출 각도", supportsAsymmetry: true, min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "neckThickness", region: "ear-neck", labelKo: "목 굵기", supportsAsymmetry: false, min: -1, max: 1, step: 0.05, defaultValue: 0 },
] as const);

export type HeadPartSliderId = (typeof HEAD_PART_SLIDER_SPECS)[number]["id"];
export type HeadPartValues = Record<HeadPartSliderId, number>;
export type PartialHeadPartValues = Partial<Record<HeadPartSliderId, number>>;

export interface WebtoonHeadStylePreset {
  readonly id: WebtoonHeadStyleId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly parts: PartialHeadPartValues;
}

export const WEBTOON_HEAD_STYLE_PRESETS: Readonly<Record<WebtoonHeadStyleId, WebtoonHeadStylePreset>> = Object.freeze({
  "anime-classic": {
    id: "anime-classic",
    labelKo: "클래식 애니",
    summaryKo: "큰 눈과 부드러운 브이라인 균형",
    parts: {
      headWidth: 0.08,
      eyeSize: 0.55,
      irisScale: 0.45,
      noseBridgeHeight: -0.25,
      noseWidth: -0.35,
      mouthWidth: -0.25,
      jawWidth: -0.25,
      chinPointiness: 0.35,
      cheekFullness: 0.15,
    },
  },
  "rofan-noble": {
    id: "rofan-noble",
    labelKo: "로판 귀족",
    summaryKo: "갸름한 턱선, 오뚝한 콧대, 우아한 눈매",
    parts: {
      headWidth: -0.15,
      headHeight: 0.18,
      eyeSize: 0.35,
      eyeTilt: 0.25,
      eyelidCrease: 0.4,
      noseLength: 0.2,
      noseBridgeHeight: 0.45,
      noseWidth: -0.4,
      mouthWidth: -0.1,
      upperLipThickness: 0.15,
      lowerLipThickness: 0.2,
      jawWidth: -0.4,
      chinLength: 0.2,
      chinPointiness: 0.55,
      neckThickness: -0.25,
    },
  },
  "action-sharp": {
    id: "action-sharp",
    labelKo: "액션 샤프",
    summaryKo: "날카로운 턱각과 또렷한 눈썹뼈",
    parts: {
      headHeight: 0.15,
      browRidgeDepth: 0.55,
      eyeSize: -0.25,
      eyeTilt: 0.35,
      eyeDepth: 0.4,
      noseLength: 0.25,
      noseBridgeHeight: 0.5,
      mouthWidth: 0.15,
      jawWidth: 0.25,
      jawAngleHeight: -0.2,
      chinLength: 0.2,
      chinPointiness: 0.2,
      cheekboneWidth: 0.2,
      neckThickness: 0.45,
    },
  },
  "modern-drama": {
    id: "modern-drama",
    labelKo: "현대 드라마",
    summaryKo: "자연스러운 인체 비례와 담백한 이목구비",
    parts: {
      headWidth: 0,
      headHeight: 0.05,
      eyeSize: 0.05,
      noseBridgeHeight: 0.1,
      mouthWidth: 0.05,
      jawWidth: -0.05,
      chinPointiness: 0.1,
      cheekboneWidth: 0.05,
    },
  },
  "chibi-sd": {
    id: "chibi-sd",
    labelKo: "SD 미니",
    summaryKo: "볼륨 있는 볼과 짧은 하안부, 큰 홍채",
    parts: {
      headWidth: 0.45,
      headHeight: -0.25,
      craniumVolume: 0.35,
      foreheadHeight: 0.25,
      eyeSize: 0.85,
      eyeHeight: -0.3,
      irisScale: 0.75,
      noseLength: -0.6,
      noseBridgeHeight: -0.65,
      noseWidth: -0.45,
      mouthWidth: -0.45,
      mouthHeight: 0.2,
      jawWidth: 0.2,
      chinLength: -0.55,
      chinPointiness: -0.45,
      cheekFullness: 0.65,
      neckThickness: -0.35,
    },
  },
  "semi-realistic": {
    id: "semi-realistic",
    labelKo: "반실사",
    summaryKo: "입체적 광대, 현실적 눈 간격과 입술 볼륨",
    parts: {
      headDepth: 0.25,
      browRidgeDepth: 0.35,
      eyeSize: -0.2,
      eyeDepth: 0.45,
      irisScale: -0.25,
      noseLength: 0.2,
      noseBridgeHeight: 0.4,
      noseWidth: 0.15,
      upperLipThickness: 0.3,
      lowerLipThickness: 0.35,
      jawWidth: 0.15,
      cheekboneWidth: 0.3,
      cheekboneHeight: 0.25,
      neckThickness: 0.15,
    },
  },
  "boyish-shonen": {
    id: "boyish-shonen",
    labelKo: "소년 액션",
    summaryKo: "단단한 하관과 넓은 이마, 활기찬 비율",
    parts: {
      headWidth: 0.05,
      foreheadWidth: 0.2,
      browRidgeDepth: 0.25,
      eyeSize: 0.2,
      eyeTilt: 0.1,
      noseBridgeHeight: 0.15,
      noseTipUpTilt: 0.15,
      mouthWidth: 0.2,
      jawWidth: 0.1,
      chinLength: -0.1,
      neckThickness: 0.2,
    },
  },
  "mature-villain": {
    id: "mature-villain",
    labelKo: "성인 악역",
    summaryKo: "긴 중안부, 높은 광대, 날카로운 눈매",
    parts: {
      headWidth: -0.1,
      headHeight: 0.3,
      browRidgeDepth: 0.45,
      eyeSize: -0.3,
      eyeTilt: 0.5,
      eyeDepth: 0.35,
      noseLength: 0.35,
      noseBridgeHeight: 0.6,
      noseWidth: -0.2,
      mouthWidth: 0.25,
      mouthCornerLift: 0.3,
      jawWidth: 0.1,
      chinLength: 0.35,
      chinPointiness: 0.45,
      cheekboneWidth: 0.4,
      cheekboneHeight: 0.45,
      cheekFullness: -0.4,
      neckThickness: 0.3,
    },
  },
  "soft-slice": {
    id: "soft-slice",
    labelKo: "일상 힐링",
    summaryKo: "둥근 윤곽, 온화한 눈꼬리, 부드러운 코",
    parts: {
      headWidth: 0.15,
      eyeSize: 0.25,
      eyeTilt: -0.2,
      noseLength: -0.15,
      noseBridgeHeight: -0.15,
      noseTipUpTilt: 0.2,
      mouthCornerLift: 0.25,
      jawWidth: 0.05,
      chinPointiness: -0.3,
      cheekFullness: 0.35,
      earSize: 0.1,
    },
  },
});

export type HeadSymmetryMode = "symmetric" | "asymmetric";
export type HeadStyleWeightMap = Record<WebtoonHeadStyleId, number>;

export interface Studio3dHeadMixerState {
  readonly styleWeights: HeadStyleWeightMap;
  readonly partOffsets: PartialHeadPartValues;
  readonly symmetryMode: HeadSymmetryMode;
  readonly leftAsymmetryOffsets: PartialHeadPartValues;
  readonly rightAsymmetryOffsets: PartialHeadPartValues;
  readonly showLoomisGuide: boolean;
}

export interface ResolvedHeadMixerMorphs {
  readonly normalizedStyleWeights: HeadStyleWeightMap;
  readonly blendedBaseParts: HeadPartValues;
  readonly centerParts: HeadPartValues;
  readonly leftParts: HeadPartValues;
  readonly rightParts: HeadPartValues;
  /** Three.js / VRM morphTargetInfluences에 바로 대입할 수 있는 평탄화 가중치 맵. */
  readonly morphTargetWeights: Readonly<Record<string, number>>;
}

export interface LoomisHeadGuide3D {
  readonly center: Vec3Tuple;
  readonly radiiM: Vec3Tuple;
  readonly cranialEquatorialRing: readonly Vec3Tuple[];
  readonly cranialSagittalRing: readonly Vec3Tuple[];
  readonly leftTempleOval: readonly Vec3Tuple[];
  readonly rightTempleOval: readonly Vec3Tuple[];
  readonly facialCenterline: readonly Vec3Tuple[];
  readonly hairlineCurve: readonly Vec3Tuple[];
  readonly browLineCurve: readonly Vec3Tuple[];
  readonly eyeLineCurve: readonly Vec3Tuple[];
  readonly noseBaseCurve: readonly Vec3Tuple[];
  readonly mouthLineCurve: readonly Vec3Tuple[];
  readonly jawContour: readonly Vec3Tuple[];
  readonly thirdPlanesY: {
    readonly hairlineY: number;
    readonly browY: number;
    readonly noseBaseY: number;
    readonly chinY: number;
  };
}

export interface ProjectedLoomisGuide2D {
  readonly facialCenterline: readonly Vec2Tuple[];
  readonly browLineCurve: readonly Vec2Tuple[];
  readonly eyeLineCurve: readonly Vec2Tuple[];
  readonly noseBaseCurve: readonly Vec2Tuple[];
  readonly mouthLineCurve: readonly Vec2Tuple[];
  readonly jawContour: readonly Vec2Tuple[];
}

const SLIDER_SPEC_BY_ID: ReadonlyMap<HeadPartSliderId, HeadPartSliderSpec> = new Map(
  HEAD_PART_SLIDER_SPECS.map((spec) => [spec.id, spec]),
);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

export function createZeroHeadStyleWeights(): HeadStyleWeightMap {
  return {
    "anime-classic": 0,
    "rofan-noble": 0,
    "action-sharp": 0,
    "modern-drama": 0,
    "chibi-sd": 0,
    "semi-realistic": 0,
    "boyish-shonen": 0,
    "mature-villain": 0,
    "soft-slice": 0,
  };
}

export function createDefaultHeadMixerState(
  primaryStyle: WebtoonHeadStyleId = "modern-drama",
): Studio3dHeadMixerState {
  const weights = createZeroHeadStyleWeights();
  weights[primaryStyle] = 1;
  return {
    styleWeights: weights,
    partOffsets: {},
    symmetryMode: "symmetric",
    leftAsymmetryOffsets: {},
    rightAsymmetryOffsets: {},
    showLoomisGuide: true,
  };
}

export function normalizeHeadStyleWeights(
  weights: Partial<Record<WebtoonHeadStyleId, number>>,
): HeadStyleWeightMap {
  const cleaned = createZeroHeadStyleWeights();
  let sum = 0;
  for (const id of WEBTOON_HEAD_STYLE_IDS) {
    const raw = weights[id];
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
    cleaned[id] = value;
    sum += value;
  }
  if (sum <= 1e-8) {
    cleaned["modern-drama"] = 1;
    return cleaned;
  }
  const normalized = createZeroHeadStyleWeights();
  for (const id of WEBTOON_HEAD_STYLE_IDS) {
    normalized[id] = cleaned[id] / sum;
  }
  return normalized;
}

export function setSingleHeadStylePreset(
  state: Studio3dHeadMixerState,
  styleId: WebtoonHeadStyleId,
): Studio3dHeadMixerState {
  const weights = createZeroHeadStyleWeights();
  weights[styleId] = 1;
  return {
    ...state,
    styleWeights: weights,
  };
}

export function updateHeadStyleWeight(
  state: Studio3dHeadMixerState,
  styleId: WebtoonHeadStyleId,
  weight: number,
): Studio3dHeadMixerState {
  return {
    ...state,
    styleWeights: {
      ...state.styleWeights,
      [styleId]: clamp(weight, 0, 1),
    },
  };
}

export function updateHeadPartSlider(
  state: Studio3dHeadMixerState,
  partId: HeadPartSliderId,
  value: number,
  side: "both" | "left" | "right" = "both",
): Studio3dHeadMixerState {
  const spec = SLIDER_SPEC_BY_ID.get(partId);
  if (!spec) return state;
  const bounded = clamp(value, spec.min, spec.max);
  if (state.symmetryMode === "symmetric" || !spec.supportsAsymmetry || side === "both") {
    return {
      ...state,
      partOffsets: {
        ...state.partOffsets,
        [partId]: bounded,
      },
    };
  }
  if (side === "left") {
    return {
      ...state,
      leftAsymmetryOffsets: {
        ...state.leftAsymmetryOffsets,
        [partId]: bounded,
      },
    };
  }
  return {
    ...state,
    rightAsymmetryOffsets: {
      ...state.rightAsymmetryOffsets,
      [partId]: bounded,
    },
  };
}

export function toggleHeadSymmetryMode(
  state: Studio3dHeadMixerState,
  nextMode?: HeadSymmetryMode,
): Studio3dHeadMixerState {
  const symmetryMode: HeadSymmetryMode = nextMode ?? (
    state.symmetryMode === "symmetric" ? "asymmetric" : "symmetric"
  );
  if (symmetryMode === "symmetric") {
    return {
      ...state,
      symmetryMode,
      leftAsymmetryOffsets: {},
      rightAsymmetryOffsets: {},
    };
  }
  return {
    ...state,
    symmetryMode,
  };
}

function createZeroPartValues(): HeadPartValues {
  const values = {} as Record<HeadPartSliderId, number>;
  for (const spec of HEAD_PART_SLIDER_SPECS) {
    values[spec.id] = 0;
  }
  return values;
}

export function blendHeadStyleMorphVector(
  weights: Partial<Record<WebtoonHeadStyleId, number>>,
): HeadPartValues {
  const normalized = normalizeHeadStyleWeights(weights);
  const blended = createZeroPartValues();
  for (const styleId of WEBTOON_HEAD_STYLE_IDS) {
    const styleWeight = normalized[styleId];
    if (styleWeight <= 0) continue;
    const presetParts = WEBTOON_HEAD_STYLE_PRESETS[styleId].parts;
    for (const spec of HEAD_PART_SLIDER_SPECS) {
      const presetVal = presetParts[spec.id];
      if (typeof presetVal === "number" && Number.isFinite(presetVal)) {
        blended[spec.id] += presetVal * styleWeight;
      }
    }
  }
  for (const spec of HEAD_PART_SLIDER_SPECS) {
    blended[spec.id] = clamp(blended[spec.id], spec.min, spec.max);
  }
  return blended;
}

export function resolveHeadMixerMorphTargets(
  state: Studio3dHeadMixerState,
): ResolvedHeadMixerMorphs {
  const normalizedStyleWeights = normalizeHeadStyleWeights(state.styleWeights);
  const blendedBaseParts = blendHeadStyleMorphVector(normalizedStyleWeights);
  const centerParts = createZeroPartValues();
  const leftParts = createZeroPartValues();
  const rightParts = createZeroPartValues();
  const morphTargetWeights: Record<string, number> = {};

  for (const spec of HEAD_PART_SLIDER_SPECS) {
    const base = blendedBaseParts[spec.id];
    const sharedOffset = state.partOffsets[spec.id] ?? 0;
    const centerValue = clamp(base + sharedOffset, spec.min, spec.max);
    centerParts[spec.id] = centerValue;

    if (state.symmetryMode === "asymmetric" && spec.supportsAsymmetry) {
      const leftVal = clamp(centerValue + (state.leftAsymmetryOffsets[spec.id] ?? 0), spec.min, spec.max);
      const rightVal = clamp(centerValue + (state.rightAsymmetryOffsets[spec.id] ?? 0), spec.min, spec.max);
      leftParts[spec.id] = leftVal;
      rightParts[spec.id] = rightVal;
      morphTargetWeights[`head_${spec.id}_L`] = leftVal;
      morphTargetWeights[`head_${spec.id}_R`] = rightVal;
    } else {
      leftParts[spec.id] = centerValue;
      rightParts[spec.id] = centerValue;
      morphTargetWeights[`head_${spec.id}`] = centerValue;
    }
  }

  return {
    normalizedStyleWeights,
    blendedBaseParts,
    centerParts,
    leftParts,
    rightParts,
    morphTargetWeights,
  };
}

/** 기존 AvatarForgeSemanticFaceMorphState 계약으로 안전하게 브리지한다. */
export function toAvatarForgeSemanticFaceMorphs(
  resolved: ResolvedHeadMixerMorphs,
): AvatarForgeSemanticFaceMorphState {
  const c = resolved.centerParts;
  const candidate: AvatarForgeSemanticFaceMorphState = {
    eyeSize: c.eyeSize,
    eyeSpacing: c.eyeSpacing,
    eyeTilt: c.eyeTilt,
    irisSize: c.irisScale,
    noseHeight: c.noseBridgeHeight,
    noseWidth: c.noseWidth,
    mouthWidth: c.mouthWidth,
    lipFullness: clamp((c.upperLipThickness + c.lowerLipThickness) * 0.5, -1, 1),
    earSize: c.earSize,
  };
  const compact: AvatarForgeSemanticFaceMorphState = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (typeof value === "number" && Math.abs(value) > 1e-4) {
      compact[key as keyof AvatarForgeSemanticFaceMorphState] = value;
    }
  }
  return compact;
}

function sampleCircle3D(
  center: Vec3Tuple,
  axisA: Vec3Tuple,
  axisB: Vec3Tuple,
  segments: number,
): Vec3Tuple[] {
  const points: Vec3Tuple[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push([
      center[0] + axisA[0] * cos + axisB[0] * sin,
      center[1] + axisA[1] * cos + axisB[1] * sin,
      center[2] + axisA[2] * cos + axisB[2] * sin,
    ]);
  }
  return points;
}

function sampleFrontArc(
  y: number,
  radiusX: number,
  radiusZ: number,
  zBias: number,
  maxAngleRad: number,
  segments: number,
): Vec3Tuple[] {
  const points: Vec3Tuple[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = -maxAngleRad + t * (2 * maxAngleRad);
    points.push([
      Math.sin(angle) * radiusX,
      y,
      Math.cos(angle) * radiusZ + zBias,
    ]);
  }
  return points;
}

/**
 * 루미스(Loomis) 두개골 구·측면 절단 타원·3등분 수평선·얼굴 중심선 3D 가이드를 생성한다.
 * 좌표계: 머리 중심 원점, 미터(1.0 = 1m), +Z가 얼굴 정면, +Y가 위쪽.
 */
export function buildLoomisHeadGuide3D(
  resolved: ResolvedHeadMixerMorphs,
  segments = 24,
): LoomisHeadGuide3D {
  const c = resolved.centerParts;
  const rx = 0.086 * (1 + c.headWidth * 0.16);
  const ry = 0.108 * (1 + c.headHeight * 0.14);
  const rz = 0.098 * (1 + c.headDepth * 0.15 + c.craniumVolume * 0.06);
  const center: Vec3Tuple = [0, 0.015, 0];

  const browY = center[1] + 0.008;
  const hairlineY = browY + 0.056 * (1 + c.foreheadHeight * 0.25);
  const noseBaseY = browY - 0.052 * (1 + c.noseLength * 0.22);
  const chinY = noseBaseY - 0.054 * (1 + c.chinLength * 0.28);
  const eyeY = browY - 0.014 + c.eyeHeight * 0.008;
  const mouthY = noseBaseY - 0.02 + c.mouthHeight * 0.009;

  const templeX = rx * 0.72;
  const templeRadius = Math.min(ry, rz) * 0.64;

  const cranialEquatorialRing = sampleCircle3D(
    [center[0], browY, center[2]],
    [rx, 0, 0],
    [0, 0, rz],
    segments,
  );
  const cranialSagittalRing = sampleCircle3D(
    center,
    [0, ry, 0],
    [0, 0, rz],
    segments,
  );
  const leftTempleOval = sampleCircle3D(
    [-templeX, browY, -0.006],
    [0, templeRadius, 0],
    [0, 0, templeRadius * 0.94],
    segments,
  );
  const rightTempleOval = sampleCircle3D(
    [templeX, browY, -0.006],
    [0, templeRadius, 0],
    [0, 0, templeRadius * 0.94],
    segments,
  );

  const noseTipZ = rz + 0.02 + c.noseBridgeHeight * 0.012;
  const chinZ = rz * (0.74 + c.chinPointiness * 0.06);
  const facialCenterline: Vec3Tuple[] = [
    [0, hairlineY + 0.022, rz * 0.78],
    [0, hairlineY, rz * 0.93],
    [0, browY, rz + c.browRidgeDepth * 0.008],
    [0, eyeY, rz * 0.96],
    [0, noseBaseY + 0.006, noseTipZ],
    [0, noseBaseY, rz * 0.95],
    [0, mouthY, rz * 0.94],
    [0, chinY, chinZ],
  ];

  const jawHalfWidth = rx * (0.76 + c.jawWidth * 0.2);
  const jawAngleY = noseBaseY - 0.018 + c.jawAngleHeight * 0.012;
  const cheekHalfWidth = rx * (0.88 + c.cheekboneWidth * 0.14);
  const cheekY = eyeY - 0.018 + c.cheekboneHeight * 0.01;
  const jawContour: Vec3Tuple[] = [
    [-templeX, browY, 0.015],
    [-cheekHalfWidth, cheekY, rz * 0.56],
    [-jawHalfWidth, jawAngleY, rz * 0.42],
    [-jawHalfWidth * (0.34 - c.chinPointiness * 0.12), chinY + 0.008, chinZ * 0.96],
    [0, chinY, chinZ],
    [jawHalfWidth * (0.34 - c.chinPointiness * 0.12), chinY + 0.008, chinZ * 0.96],
    [jawHalfWidth, jawAngleY, rz * 0.42],
    [cheekHalfWidth, cheekY, rz * 0.56],
    [templeX, browY, 0.015],
  ];

  const arcSegments = Math.max(8, Math.floor(segments / 2));
  return {
    center,
    radiiM: [rx, ry, rz],
    cranialEquatorialRing,
    cranialSagittalRing,
    leftTempleOval,
    rightTempleOval,
    facialCenterline,
    hairlineCurve: sampleFrontArc(hairlineY, rx * (0.88 + c.foreheadWidth * 0.12), rz * 0.92, 0, Math.PI * 0.42, arcSegments),
    browLineCurve: sampleFrontArc(browY, rx * 0.94, rz, c.browRidgeDepth * 0.006, Math.PI * 0.46, arcSegments),
    eyeLineCurve: sampleFrontArc(eyeY, rx * 0.92, rz * 0.97, 0, Math.PI * 0.42, arcSegments),
    noseBaseCurve: sampleFrontArc(noseBaseY, rx * 0.84, rz * 0.94, 0, Math.PI * 0.36, arcSegments),
    mouthLineCurve: sampleFrontArc(mouthY, rx * 0.72, rz * 0.92, 0, Math.PI * 0.3, arcSegments),
    jawContour,
    thirdPlanesY: {
      hairlineY,
      browY,
      noseBaseY,
      chinY,
    },
  };
}

/** 4x4 열-우선(column-major) 투영 행렬로 루미스 3D 가이드를 2D 캔버스 좌표로 투영한다. */
export function projectLoomisGuideTo2D(
  guide: LoomisHeadGuide3D,
  viewProjectionColumnMajor: readonly number[],
  viewport: { readonly width: number; readonly height: number },
): ProjectedLoomisGuide2D {
  const m = viewProjectionColumnMajor;
  const projectPoint = (p: Vec3Tuple): Vec2Tuple => {
    const x = p[0];
    const y = p[1];
    const z = p[2];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    const invW = Math.abs(cw) > 1e-6 ? 1 / cw : 1;
    const ndcX = cx * invW;
    const ndcY = cy * invW;
    return [
      (ndcX * 0.5 + 0.5) * viewport.width,
      (0.5 - ndcY * 0.5) * viewport.height,
    ];
  };

  return {
    facialCenterline: guide.facialCenterline.map(projectPoint),
    browLineCurve: guide.browLineCurve.map(projectPoint),
    eyeLineCurve: guide.eyeLineCurve.map(projectPoint),
    noseBaseCurve: guide.noseBaseCurve.map(projectPoint),
    mouthLineCurve: guide.mouthLineCurve.map(projectPoint),
    jawContour: guide.jawContour.map(projectPoint),
  };
}
