/**
 * CSP 2D 체형 매트릭스 + Tooning Plus 21체형 슬라이더 + 3분할 모듈러 헤어 + CSP 4영역 핸드 삼각형 보간 코어.
 *
 * - 2D 체형 매트릭스(`x`: 마름~근육, `y`: 슬림~볼륨)에서 21개 세부 체형 슬라이더 기준선 생성
 * - 기존 `StudioVrmProportions`("관절 이동·균등 스케일" 무왜곡 계약)으로의 결정적 매핑 브리지
 * - 앞/옆/뒷머리 독립 교체 + 메인 헤어 색 고정(`lockMainColor`) 상태 유지
 * - CSP 4영역 손 포즈 삼각형 패드(펴기·쥐기·가리키기·집기) 연속 가중치 및 개별 손가락 잠금 보간
 */

import {
  createStudioVrmHandPose,
  type StudioVrmHandFinger,
  type StudioVrmHandRotations,
  type StudioVrmHandSide,
} from "../vrm/studio-vrm-hand-poses";
import {
  sanitizeStudioVrmProportions,
  type StudioVrmProportions,
} from "../vrm/studio-vrm-proportion-core";

export type BodySliderGroupId = "overall" | "upper" | "lower" | "extremities";

export interface WebtoonBodySliderSpec {
  readonly id: WebtoonBodySliderId;
  readonly group: BodySliderGroupId;
  readonly labelKo: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

/** Tooning Plus 벤치마크 기준 정확히 21개 독립 체형 슬라이더. */
export const WEBTOON_21_BODY_SLIDER_SPECS = Object.freeze([
  // 전체 비율 (5)
  { id: "height", group: "overall", labelKo: "전체 신장", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "headBodyRatio", group: "overall", labelKo: "두신비", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "headScale", group: "overall", labelKo: "머리 크기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "neckLength", group: "overall", labelKo: "목 길이", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "neckThickness", group: "overall", labelKo: "목 굵기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 상체 (7)
  { id: "shoulderWidth", group: "upper", labelKo: "어깨 너비", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "shoulderSlope", group: "upper", labelKo: "어깨 기울기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "chestWidth", group: "upper", labelKo: "가슴 폭", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "chestDepth", group: "upper", labelKo: "가슴 볼륨", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "waistWidth", group: "upper", labelKo: "허리 폭", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "waistHeight", group: "upper", labelKo: "허리선 높이", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "torsoLength", group: "upper", labelKo: "상체 길이", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 하체 (5)
  { id: "hipWidth", group: "lower", labelKo: "골반 너비", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "hipDepth", group: "lower", labelKo: "힙 볼륨", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "thighThickness", group: "lower", labelKo: "허벅지 굵기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "calfThickness", group: "lower", labelKo: "종아리 굵기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "legLength", group: "lower", labelKo: "다리 길이", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  // 사지 말단 (4)
  { id: "upperArmThickness", group: "extremities", labelKo: "상완 굵기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "forearmThickness", group: "extremities", labelKo: "전완 굵기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "armLength", group: "extremities", labelKo: "팔 길이", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "handFootScale", group: "extremities", labelKo: "손·발 크기", min: -1, max: 1, step: 0.05, defaultValue: 0 },
] as const);

export type WebtoonBodySliderId = (typeof WEBTOON_21_BODY_SLIDER_SPECS)[number]["id"];
export type WebtoonBody21Values = Record<WebtoonBodySliderId, number>;
export type PartialWebtoonBody21Values = Partial<Record<WebtoonBodySliderId, number>>;

export interface BodyRatioMatrixPoint {
  /** `-1` (마름/가냘픔) ~ `+1` (근육/탄탄함). */
  readonly muscularityX: number;
  /** `-1` (슬림/긴 비율) ~ `+1` (볼륨/중량감). */
  readonly fullnessY: number;
}

export interface BodyMatrixArchetypePreset {
  readonly id: "rofan-heroine" | "action-hero" | "modern-balanced" | "chibi-sd";
  readonly labelKo: string;
  readonly matrix: BodyRatioMatrixPoint;
  readonly overrides: PartialWebtoonBody21Values;
}

export const BODY_MATRIX_ARCHETYPE_PRESETS: readonly BodyMatrixArchetypePreset[] = Object.freeze([
  {
    id: "rofan-heroine",
    labelKo: "로판 히로인",
    matrix: { muscularityX: -0.45, fullnessY: -0.35 },
    overrides: { headBodyRatio: 0.45, neckLength: 0.3, waistWidth: -0.35, legLength: 0.45 },
  },
  {
    id: "action-hero",
    labelKo: "액션 남주",
    matrix: { muscularityX: 0.7, fullnessY: -0.15 },
    overrides: { height: 0.55, headBodyRatio: 0.55, shoulderWidth: 0.55, legLength: 0.35 },
  },
  {
    id: "modern-balanced",
    labelKo: "현대 표준",
    matrix: { muscularityX: 0, fullnessY: 0 },
    overrides: {},
  },
  {
    id: "chibi-sd",
    labelKo: "SD 미니",
    matrix: { muscularityX: -0.3, fullnessY: 0.45 },
    overrides: { height: -0.75, headBodyRatio: -0.85, headScale: 0.7, legLength: -0.65 },
  },
]);

export interface HairPartOption {
  readonly id: string;
  readonly labelKo: string;
}

export const FRONT_HAIR_PART_OPTIONS: readonly HairPartOption[] = Object.freeze([
  { id: "front-full-bang", labelKo: "풀뱅" },
  { id: "front-see-through", labelKo: "시스루 뱅" },
  { id: "front-center-part", labelKo: "가운데 가르마" },
  { id: "front-side-swept", labelKo: "사이드 스웹" },
  { id: "front-curtain", labelKo: "커튼 뱅" },
  { id: "front-m-bang", labelKo: "M자 뱅" },
  { id: "front-slick-back", labelKo: "올백" },
  { id: "front-asym-bang", labelKo: "비대칭 뱅" },
]);

export const SIDE_HAIR_PART_OPTIONS: readonly HairPartOption[] = Object.freeze([
  { id: "side-hime", labelKo: "히메컷" },
  { id: "side-layered", labelKo: "레이어드" },
  { id: "side-tucked", labelKo: "귀 뒤 넘김" },
  { id: "side-short-burn", labelKo: "짧은 구레나룻" },
  { id: "side-wave", labelKo: "웨이브 사이드" },
  { id: "side-none", labelKo: "옆머리 없음" },
]);

export const BACK_HAIR_PART_OPTIONS: readonly HairPartOption[] = Object.freeze([
  { id: "back-short", labelKo: "숏컷" },
  { id: "back-bob", labelKo: "단발 보브" },
  { id: "back-wolf", labelKo: "울프컷" },
  { id: "back-long-straight", labelKo: "롱 스트레이트" },
  { id: "back-long-wave", labelKo: "웨이브 롱" },
  { id: "back-high-ponytail", labelKo: "하이 포니테일" },
  { id: "back-twintail", labelKo: "트윈테일" },
  { id: "back-low-bun", labelKo: "로우 번" },
]);

export interface HairColorTokenPreset {
  readonly id: string;
  readonly labelKo: string;
  /** 데이터 직렬화 및 3D 머티리얼 전달용 표준 OKLCH 컬러 값. */
  readonly oklch: string;
}

export const HAIR_COLOR_TOKEN_PRESETS: readonly HairColorTokenPreset[] = Object.freeze([
  { id: "ink-black", labelKo: "흑발", oklch: "oklch(0.22 0.01 260)" },
  { id: "espresso-brown", labelKo: "에스프레소", oklch: "oklch(0.34 0.05 55)" },
  { id: "champagne-blonde", labelKo: "샴페인 블론드", oklch: "oklch(0.84 0.09 88)" },
  { id: "silver-ash", labelKo: "은발 애쉬", oklch: "oklch(0.82 0.02 250)" },
  { id: "crimson-wine", labelKo: "버건디 와인", oklch: "oklch(0.42 0.14 18)" },
  { id: "midnight-navy", labelKo: "미드나잇 네이비", oklch: "oklch(0.32 0.09 258)" },
  { id: "rose-quartz", labelKo: "로즈 쿼츠", oklch: "oklch(0.75 0.11 350)" },
  { id: "sage-emerald", labelKo: "세이지 그린", oklch: "oklch(0.55 0.09 162)" },
]);

export interface ThreePartHairState {
  readonly frontId: string;
  readonly sideId: string;
  readonly backId: string;
  readonly mainColorId: string;
  /** true이면 앞/옆/뒷머리 파츠를 교체해도 메인 색상이 3파츠 전체에 고정 유지된다. */
  readonly lockMainColor: boolean;
  readonly frontColorIdOverride: string | null;
  readonly sideColorIdOverride: string | null;
  readonly backColorIdOverride: string | null;
}

export interface StudioWebtoonBodyAndHairState {
  readonly matrix: BodyRatioMatrixPoint;
  readonly sliderOffsets: PartialWebtoonBody21Values;
  readonly hair: ThreePartHairState;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

export function createDefaultBodyAndHairState(): StudioWebtoonBodyAndHairState {
  return {
    matrix: { muscularityX: 0, fullnessY: 0 },
    sliderOffsets: {},
    hair: {
      frontId: FRONT_HAIR_PART_OPTIONS[1].id,
      sideId: SIDE_HAIR_PART_OPTIONS[1].id,
      backId: BACK_HAIR_PART_OPTIONS[3].id,
      mainColorId: HAIR_COLOR_TOKEN_PRESETS[0].id,
      lockMainColor: true,
      frontColorIdOverride: null,
      sideColorIdOverride: null,
      backColorIdOverride: null,
    },
  };
}

/** 2D 체형 매트릭스 `(muscularityX, fullnessY)`를 21개 체형 슬라이더 기본값으로 투영한다. */
export function resolveBodyMatrixTo21Sliders(
  matrix: BodyRatioMatrixPoint,
  offsets: PartialWebtoonBody21Values = {},
): WebtoonBody21Values {
  const x = clamp(matrix.muscularityX, -1, 1);
  const y = clamp(matrix.fullnessY, -1, 1);

  const base: WebtoonBody21Values = {
    height: x * 0.25 - y * 0.18,
    headBodyRatio: x * 0.2 - y * 0.25,
    headScale: -x * 0.08 + y * 0.12,
    neckLength: -x * 0.1 - y * 0.2,
    neckThickness: x * 0.45 + y * 0.3,
    shoulderWidth: x * 0.55 + y * 0.15,
    shoulderSlope: -x * 0.25 + y * 0.2,
    chestWidth: x * 0.5 + y * 0.35,
    chestDepth: x * 0.3 + y * 0.55,
    waistWidth: x * 0.1 + y * 0.65,
    waistHeight: -y * 0.15,
    torsoLength: -y * 0.1,
    hipWidth: -x * 0.1 + y * 0.6,
    hipDepth: x * 0.1 + y * 0.55,
    thighThickness: x * 0.4 + y * 0.55,
    calfThickness: x * 0.45 + y * 0.35,
    legLength: x * 0.15 - y * 0.3,
    upperArmThickness: x * 0.55 + y * 0.4,
    forearmThickness: x * 0.5 + y * 0.25,
    armLength: x * 0.1 - y * 0.15,
    handFootScale: x * 0.2 + y * 0.08,
  };

  const resolved = {} as Record<WebtoonBodySliderId, number>;
  for (const spec of WEBTOON_21_BODY_SLIDER_SPECS) {
    resolved[spec.id] = clamp(base[spec.id] + (offsets[spec.id] ?? 0), spec.min, spec.max);
  }
  return resolved;
}

/** 21체형 슬라이더 값을 기존 `StudioVrmProportions`(중립 1.0 기준) 계약으로 변환한다. */
export function toStudioVrmProportions(values: WebtoonBody21Values): StudioVrmProportions {
  return sanitizeStudioVrmProportions({
    overallHeight: 1 + values.height * 0.18,
    headBodyRatio: 1 + values.headBodyRatio * 0.25 - values.headScale * 0.12,
    armLength: 1 + values.armLength * 0.18,
    legLength: 1 + values.legLength * 0.22,
    torsoLength: 1 + values.torsoLength * 0.16,
    shoulderWidth: 1 + values.shoulderWidth * 0.22,
    handScale: 1 + values.handFootScale * 0.2,
    footScale: 1 + values.handFootScale * 0.18,
    neckLength: 1 + values.neckLength * 0.24,
  });
}

/** 3분할 헤어 파츠를 교체한다. `lockMainColor`가 켜져 있으면 메인 색상을 그대로 고정 유지한다. */
export function switchThreePartHairStyle(
  hair: ThreePartHairState,
  slot: "front" | "side" | "back",
  partId: string,
): ThreePartHairState {
  const next: ThreePartHairState = {
    ...hair,
    frontId: slot === "front" ? partId : hair.frontId,
    sideId: slot === "side" ? partId : hair.sideId,
    backId: slot === "back" ? partId : hair.backId,
  };
  if (next.lockMainColor) {
    return {
      ...next,
      frontColorIdOverride: null,
      sideColorIdOverride: null,
      backColorIdOverride: null,
    };
  }
  return next;
}

export function resolveThreePartHairColors(hair: ThreePartHairState): {
  readonly frontColorId: string;
  readonly sideColorId: string;
  readonly backColorId: string;
  readonly mainColorId: string;
} {
  if (hair.lockMainColor) {
    return {
      mainColorId: hair.mainColorId,
      frontColorId: hair.mainColorId,
      sideColorId: hair.mainColorId,
      backColorId: hair.mainColorId,
    };
  }
  return {
    mainColorId: hair.mainColorId,
    frontColorId: hair.frontColorIdOverride ?? hair.mainColorId,
    sideColorId: hair.sideColorIdOverride ?? hair.mainColorId,
    backColorId: hair.backColorIdOverride ?? hair.mainColorId,
  };
}

// ---------------------------------------------------------------------------
// CSP 4영역 핸드 포즈 삼각형 패드 순수 수학 코어
// ---------------------------------------------------------------------------

export interface HandTrianglePadPoint {
  /** 정규화 X 좌표 (`0` 좌측 끝 ~ `1` 우측 끝). */
  readonly x: number;
  /** 정규화 Y 좌표 (`0` 상단 펴기 꼭짓점 ~ `1` 하단 변). */
  readonly y: number;
}

export interface HandTriangleWeights {
  readonly open: number;
  readonly fist: number;
  readonly point: number;
  readonly pinch: number;
}

export interface HandTriangleEvaluation {
  readonly clampedPoint: HandTrianglePadPoint;
  readonly weights: HandTriangleWeights;
  readonly dominantPoseKo: string;
  readonly rotations: StudioVrmHandRotations;
}

export type HandFingerLockMap = Readonly<Record<StudioVrmHandFinger, boolean>>;

export const DEFAULT_HAND_FINGER_LOCKS: HandFingerLockMap = Object.freeze({
  thumb: false,
  index: false,
  middle: false,
  ring: false,
  little: false,
});

export const HAND_FINGER_ORDER: readonly StudioVrmHandFinger[] = Object.freeze([
  "thumb",
  "index",
  "middle",
  "ring",
  "little",
]);

export const HAND_TRIANGLE_VERTICES = Object.freeze({
  open: Object.freeze({ x: 0.5, y: 0.06 }),
  fist: Object.freeze({ x: 0.08, y: 0.92 }),
  point: Object.freeze({ x: 0.92, y: 0.92 }),
  pinch: Object.freeze({ x: 0.5, y: 0.63 }),
});

const FINGER_BONE_PREFIX: Readonly<Record<StudioVrmHandFinger, string>> = Object.freeze({
  thumb: "Thumb",
  index: "Index",
  middle: "Middle",
  ring: "Ring",
  little: "Little",
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** 삼각형 내부로 좌표를 투영·클램프한다. */
export function clampPointToHandTriangle(point: HandTrianglePadPoint): HandTrianglePadPoint {
  const openV = HAND_TRIANGLE_VERTICES.open;
  const fistV = HAND_TRIANGLE_VERTICES.fist;
  const pointV = HAND_TRIANGLE_VERTICES.point;
  const y = Math.min(fistV.y, Math.max(openV.y, clamp01(point.y)));
  const t = (y - openV.y) / (fistV.y - openV.y);
  const minX = openV.x + (fistV.x - openV.x) * t;
  const maxX = openV.x + (pointV.x - openV.x) * t;
  const x = Math.min(maxX, Math.max(minX, clamp01(point.x)));
  return { x, y };
}

/**
 * CSP 4영역(펴기·쥐기·가리키기·집기) 연속 가중치를 계산한다.
 */
export function computeHandTriangleWeights(point: HandTrianglePadPoint): {
  readonly clampedPoint: HandTrianglePadPoint;
  readonly weights: HandTriangleWeights;
} {
  const openV = HAND_TRIANGLE_VERTICES.open;
  const fistV = HAND_TRIANGLE_VERTICES.fist;
  const pointV = HAND_TRIANGLE_VERTICES.point;
  const pinchC = HAND_TRIANGLE_VERTICES.pinch;

  const clamped = clampPointToHandTriangle(point);
  const det =
    (fistV.y - pointV.y) * (openV.x - pointV.x)
    + (pointV.x - fistV.x) * (openV.y - pointV.y);

  let bOpen = (
    (fistV.y - pointV.y) * (clamped.x - pointV.x)
    + (pointV.x - fistV.x) * (clamped.y - pointV.y)
  ) / det;
  let bFist = (
    (pointV.y - openV.y) * (clamped.x - pointV.x)
    + (openV.x - pointV.x) * (clamped.y - pointV.y)
  ) / det;
  let bPoint = 1 - bOpen - bFist;

  bOpen = Math.max(0, bOpen);
  bFist = Math.max(0, bFist);
  bPoint = Math.max(0, bPoint);
  const bSum = bOpen + bFist + bPoint || 1;
  bOpen /= bSum;
  bFist /= bSum;
  bPoint /= bSum;

  const distCenter = Math.hypot(clamped.x - pinchC.x, clamped.y - pinchC.y);
  const pinchInfluence = Math.exp(-(distCenter * distCenter) / (2 * 0.14 * 0.14));
  const vertexScale = 1 - pinchInfluence;

  return {
    clampedPoint: clamped,
    weights: {
      open: bOpen * vertexScale,
      fist: bFist * vertexScale,
      point: bPoint * vertexScale,
      pinch: pinchInfluence,
    },
  };
}

function fingerOfBoneName(boneName: string, side: StudioVrmHandSide): StudioVrmHandFinger | null {
  for (const finger of HAND_FINGER_ORDER) {
    if (boneName.startsWith(`${side}${FINGER_BONE_PREFIX[finger]}`)) {
      return finger;
    }
  }
  return null;
}

/**
 * 4영역 가중치로 VRM 손 본 회전을 연속 보간하며, 잠금(`lockedFingers`)된 손가락은 기존 회전을 그대로 보존한다.
 */
export function evaluateHandTrianglePose(
  point: HandTrianglePadPoint,
  side: StudioVrmHandSide,
  lockedFingers: HandFingerLockMap = DEFAULT_HAND_FINGER_LOCKS,
  lockedBaselineRotations?: StudioVrmHandRotations,
): HandTriangleEvaluation {
  const { clampedPoint, weights } = computeHandTriangleWeights(point);
  const openPose = createStudioVrmHandPose(side, "open");
  const fistPose = createStudioVrmHandPose(side, "fist");
  const pointPose = createStudioVrmHandPose(side, "point");
  const pinchPose = createStudioVrmHandPose(side, "pinch");

  const rotations: StudioVrmHandRotations = {};
  for (const boneName of Object.keys(openPose)) {
    const finger = fingerOfBoneName(boneName, side);
    if (finger && lockedFingers[finger] && lockedBaselineRotations?.[boneName]) {
      const prev = lockedBaselineRotations[boneName];
      rotations[boneName] = [prev[0], prev[1], prev[2]];
      continue;
    }
    const rOpen = openPose[boneName];
    const rFist = fistPose[boneName];
    const rPoint = pointPose[boneName];
    const rPinch = pinchPose[boneName];
    rotations[boneName] = [
      rOpen[0] * weights.open + rFist[0] * weights.fist + rPoint[0] * weights.point + rPinch[0] * weights.pinch,
      rOpen[1] * weights.open + rFist[1] * weights.fist + rPoint[1] * weights.point + rPinch[1] * weights.pinch,
      rOpen[2] * weights.open + rFist[2] * weights.fist + rPoint[2] * weights.point + rPinch[2] * weights.pinch,
    ];
  }

  const pairs: readonly [string, number][] = [
    ["펴기", weights.open],
    ["쥐기", weights.fist],
    ["가리키기", weights.point],
    ["집기", weights.pinch],
  ];
  let dominantPoseKo = pairs[0][0];
  let maxWeight = pairs[0][1];
  for (let i = 1; i < pairs.length; i += 1) {
    if (pairs[i][1] > maxWeight) {
      maxWeight = pairs[i][1];
      dominantPoseKo = pairs[i][0];
    }
  }

  return {
    clampedPoint,
    weights,
    dominantPoseKo,
    rotations,
  };
}
