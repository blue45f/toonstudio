/**
 * VRoid Studio 클린룸 아틀리에 엔진용 순수 카탈로그·프리셋·OKLCH 색공간 변환 모듈.
 *
 * - 얼굴 정밀 파라미터 36종 (`VROID_FACE_PARAMETER_SPECS`) + 동공 하이라이트 5종 (`VROID_EYE_HIGHLIGHT_STYLES`)
 * - 바디 프로포션 & 등신대 프리셋 4종 (`VROID_BODY_PROPORTION_PRESETS`: SD 3.5 · 학원 6.5 · 로판 7.5 · 액션 8.5)
 * - VRM 1.0 표준 표정 18종 + ARKit 립싱크(`aa`/`ih`/`ou`/`ee`/`oh`) + LookAt 시선 프리셋
 * - 레이어드 의상 3색 OKLCH 팔레트·패턴 프리셋
 */
import type { AvatarForgeSemanticFaceMorphId } from "./studio-vrm-avatar-forge";

/* -------------------------------------------------------------------------- */
/* OKLCH 색공간 유틸리티 (하드코딩 HEX 금지 · 결정론적 sRGB/RGBA 변환)          */
/* -------------------------------------------------------------------------- */

export interface VroidOklchColor {
  /** 명도 (0..1) */
  readonly l: number;
  /** 채도 (0..0.37) */
  readonly c: number;
  /** 색상각 (0..360 deg) */
  readonly h: number;
}

export interface VroidSrgbTuple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function linearToSrgbChannel(linear: number): number {
  const c = clamp(linear, 0, 1);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** OKLCH 좌표를 정규화된 sRGB(0..1) 튜플로 결정론적으로 변환한다. */
export function oklchToSrgb(color: VroidOklchColor): VroidSrgbTuple {
  const l = clamp(color.l, 0, 1);
  const c = clamp(color.c, 0, 0.37);
  const hRad = (((Number.isFinite(color.h) ? color.h : 0) % 360) + 360) % 360 * (Math.PI / 180);
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.2914855480 * b;

  const lCube = lPrime * lPrime * lPrime;
  const mCube = mPrime * mPrime * mPrime;
  const sCube = sPrime * sPrime * sPrime;

  const rLin = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const gLin = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const bLin = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.7076147010 * sCube;

  return Object.freeze({
    r: clamp(linearToSrgbChannel(rLin), 0, 1),
    g: clamp(linearToSrgbChannel(gLin), 0, 1),
    b: clamp(linearToSrgbChannel(bLin), 0, 1),
  });
}

/** OKLCH 좌표를 0..255 정수 RGB 바이트 튜플로 변환한다. */
export function oklchToRgbaBytes(
  color: VroidOklchColor,
  alpha = 1,
): readonly [number, number, number, number] {
  const srgb = oklchToSrgb(color);
  return Object.freeze([
    Math.round(srgb.r * 255),
    Math.round(srgb.g * 255),
    Math.round(srgb.b * 255),
    Math.round(clamp(alpha, 0, 1) * 255),
  ]);
}

/** OKLCH 좌표를 Three.js / VRM 호스트 전달용 sRGB CSS 색 문자열(`rgb(...)`) 또는 16진 문자열로 직렬화한다. */
export function oklchToHexColorString(color: VroidOklchColor): string {
  const [r, g, b] = oklchToRgbaBytes(color, 1);
  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** CSS `oklch(...)` 표현식을 생성한다. */
export function formatOklchCss(color: VroidOklchColor, alpha?: number): string {
  const lPct = (clamp(color.l, 0, 1) * 100).toFixed(1);
  const cVal = clamp(color.c, 0, 0.37).toFixed(3);
  const hDeg = ((((Number.isFinite(color.h) ? color.h : 0) % 360) + 360) % 360).toFixed(1);
  if (typeof alpha === "number" && Number.isFinite(alpha) && alpha < 1) {
    return `oklch(${lPct}% ${cVal} ${hDeg} / ${clamp(alpha, 0, 1).toFixed(2)})`;
  }
  return `oklch(${lPct}% ${cVal} ${hDeg})`;
}

/* -------------------------------------------------------------------------- */
/* 1. 프로시저럴 헤어 그룹 메타 & OKLCH 팔레트 프리셋                            */
/* -------------------------------------------------------------------------- */

export type VroidHairGroupKind = "front" | "side" | "back" | "ahoge" | "twintail" | "ponytail";

export interface VroidHairGroupMeta {
  readonly kind: VroidHairGroupKind;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly defaultStrandCount: number;
  readonly defaultLengthMeters: number;
  readonly defaultWidthMeters: number;
  readonly defaultThicknessMeters: number;
  readonly defaultStiffness: number;
  readonly defaultGravity: number;
  readonly defaultDrag: number;
}

export const VROID_HAIR_GROUP_SPECS: readonly VroidHairGroupMeta[] = Object.freeze([
  {
    kind: "front",
    labelKo: "앞머리",
    hintKo: "이마 곡면을 따라 떨어지는 뱅 스트랜드 그룹",
    defaultStrandCount: 7,
    defaultLengthMeters: 0.14,
    defaultWidthMeters: 0.024,
    defaultThicknessMeters: 0.008,
    defaultStiffness: 1.45,
    defaultGravity: 0.16,
    defaultDrag: 0.52,
  },
  {
    kind: "side",
    labelKo: "옆머리",
    hintKo: "관자놀이와 턱선을 감싸는 좌우 사이드 락",
    defaultStrandCount: 6,
    defaultLengthMeters: 0.24,
    defaultWidthMeters: 0.026,
    defaultThicknessMeters: 0.009,
    defaultStiffness: 1.15,
    defaultGravity: 0.26,
    defaultDrag: 0.44,
  },
  {
    kind: "back",
    labelKo: "뒷머리",
    hintKo: "후두부에서 어깨·등으로 흐르는 커튼 레이어",
    defaultStrandCount: 11,
    defaultLengthMeters: 0.38,
    defaultWidthMeters: 0.032,
    defaultThicknessMeters: 0.011,
    defaultStiffness: 0.85,
    defaultGravity: 0.36,
    defaultDrag: 0.38,
  },
  {
    kind: "ahoge",
    labelKo: "바보털",
    hintKo: "정수리에서 탄력 있게 솟는 포인트 가닥",
    defaultStrandCount: 2,
    defaultLengthMeters: 0.11,
    defaultWidthMeters: 0.014,
    defaultThicknessMeters: 0.006,
    defaultStiffness: 2.1,
    defaultGravity: 0.08,
    defaultDrag: 0.65,
  },
  {
    kind: "twintail",
    labelKo: "트윈테일",
    hintKo: "좌우 대칭 묶음에서 길게 퍼지는 이중 꼬리",
    defaultStrandCount: 10,
    defaultLengthMeters: 0.44,
    defaultWidthMeters: 0.028,
    defaultThicknessMeters: 0.012,
    defaultStiffness: 0.72,
    defaultGravity: 0.42,
    defaultDrag: 0.34,
  },
  {
    kind: "ponytail",
    labelKo: "포니테일",
    hintKo: "후두부 매듭에서 역동적으로 흐르는 단일 묶음",
    defaultStrandCount: 9,
    defaultLengthMeters: 0.42,
    defaultWidthMeters: 0.03,
    defaultThicknessMeters: 0.013,
    defaultStiffness: 0.78,
    defaultGravity: 0.4,
    defaultDrag: 0.36,
  },
]);

export interface VroidHairPalettePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly base: VroidOklchColor;
  readonly tip: VroidOklchColor;
  readonly shadow: VroidOklchColor;
  readonly shine: number;
}

export const VROID_HAIR_PALETTE_PRESETS: readonly VroidHairPalettePreset[] = Object.freeze([
  {
    id: "obsidian-ink",
    labelKo: "먹빛 흑발",
    base: { l: 0.21, c: 0.018, h: 270 },
    tip: { l: 0.32, c: 0.035, h: 262 },
    shadow: { l: 0.13, c: 0.022, h: 278 },
    shine: 0.62,
  },
  {
    id: "rofan-champagne",
    labelKo: "로판 샴페인 금발",
    base: { l: 0.84, c: 0.085, h: 86 },
    tip: { l: 0.93, c: 0.055, h: 92 },
    shadow: { l: 0.64, c: 0.095, h: 68 },
    shine: 0.78,
  },
  {
    id: "cherry-sakura",
    labelKo: "사쿠라 로즈",
    base: { l: 0.78, c: 0.105, h: 355 },
    tip: { l: 0.9, c: 0.065, h: 8 },
    shadow: { l: 0.56, c: 0.12, h: 344 },
    shine: 0.74,
  },
  {
    id: "moonlight-silver",
    labelKo: "달빛 실버",
    base: { l: 0.85, c: 0.026, h: 252 },
    tip: { l: 0.95, c: 0.018, h: 245 },
    shadow: { l: 0.64, c: 0.048, h: 262 },
    shine: 0.82,
  },
  {
    id: "espresso-chestnut",
    labelKo: "에스프레소 브라운",
    base: { l: 0.35, c: 0.052, h: 48 },
    tip: { l: 0.52, c: 0.075, h: 56 },
    shadow: { l: 0.22, c: 0.044, h: 38 },
    shine: 0.56,
  },
  {
    id: "crimson-garnet",
    labelKo: "크림슨 가넷",
    base: { l: 0.45, c: 0.165, h: 22 },
    tip: { l: 0.64, c: 0.145, h: 30 },
    shadow: { l: 0.28, c: 0.13, h: 12 },
    shine: 0.68,
  },
]);

/* -------------------------------------------------------------------------- */
/* 2. 얼굴 정밀 파라미터 36종 & 동공 하이라이트 5종                              */
/* -------------------------------------------------------------------------- */

export type VroidFaceCategory = "eyes" | "brows" | "nose" | "mouth" | "jaw" | "ears" | "makeup";

export type VroidEyeHighlightStyleId =
  | "classic-round"
  | "romance-double-sparkle"
  | "starlight-ring"
  | "heart-glint"
  | "sharp-slit";

export interface VroidEyeHighlightStyleSpec {
  readonly id: VroidEyeHighlightStyleId;
  readonly index: number;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly primaryRadius: number;
  readonly secondaryCount: number;
  readonly shape: "circle" | "double-dot" | "star-ring" | "heart" | "slit";
}

export const VROID_EYE_HIGHLIGHT_STYLES: readonly VroidEyeHighlightStyleSpec[] = Object.freeze([
  {
    id: "classic-round",
    index: 0,
    labelKo: "클래식 원형",
    hintKo: "표준 웹툰·애니 원형 캐치라이트",
    primaryRadius: 0.18,
    secondaryCount: 1,
    shape: "circle",
  },
  {
    id: "romance-double-sparkle",
    index: 1,
    labelKo: "순정 더블 스파클",
    hintKo: "상하 이중 광점으로 촉촉한 로맨스 눈빛",
    primaryRadius: 0.22,
    secondaryCount: 2,
    shape: "double-dot",
  },
  {
    id: "starlight-ring",
    index: 2,
    labelKo: "별빛 링",
    hintKo: "하단 반사 고리와 성광 포인트",
    primaryRadius: 0.2,
    secondaryCount: 3,
    shape: "star-ring",
  },
  {
    id: "heart-glint",
    index: 3,
    labelKo: "하트 글린트",
    hintKo: "연출·개그·아이돌 컷용 하트 하이라이트",
    primaryRadius: 0.21,
    secondaryCount: 1,
    shape: "heart",
  },
  {
    id: "sharp-slit",
    index: 4,
    labelKo: "샤프 슬릿",
    hintKo: "냉미남·액션·판타지용 예리한 직선 광택",
    primaryRadius: 0.14,
    secondaryCount: 1,
    shape: "slit",
  },
]);

export type VroidFaceParameterId =
  | "eyeSize"
  | "eyeHeight"
  | "eyeWidth"
  | "eyeTilt"
  | "eyeSpacing"
  | "eyeDepth"
  | "eyePositionY"
  | "irisSize"
  | "irisHeight"
  | "pupilHighlightStyle"
  | "pupilHighlightIntensity"
  | "eyelidFoldDepth"
  | "browHeight"
  | "browArch"
  | "browThickness"
  | "browSpacing"
  | "browAngle"
  | "noseHeight"
  | "noseBridgeWidth"
  | "noseTipAngle"
  | "noseWidth"
  | "noseShadowIntensity"
  | "mouthWidth"
  | "mouthHeight"
  | "mouthDepth"
  | "lipFullness"
  | "mouthCornerCurve"
  | "chinLength"
  | "chinWidth"
  | "jawlineSharpness"
  | "cheekVolume"
  | "earSize"
  | "elfEarPoint"
  | "blushIntensity"
  | "eyelinerThickness"
  | "eyelinerWingAngle";

export interface VroidFaceParameterSpec {
  readonly id: VroidFaceParameterId;
  readonly category: VroidFaceCategory;
  readonly labelKo: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly targetKind: "blendshape" | "material-texture" | "hybrid";
  readonly blendShapePositive?: string;
  readonly blendShapeNegative?: string;
  readonly semanticMorphId?: AvatarForgeSemanticFaceMorphId;
}

/** VRoid Studio 호환 얼굴 정밀 파라미터 36종 스펙 단일 진실 원천. */
export const VROID_FACE_PARAMETER_SPECS: readonly VroidFaceParameterSpec[] = Object.freeze([
  // 눈 (12종)
  { id: "eyeSize", category: "eyes", labelKo: "눈 전체 크기", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Size_Big", blendShapeNegative: "Fcl_EYE_Size_Small", semanticMorphId: "eyeSize" },
  { id: "eyeHeight", category: "eyes", labelKo: "눈 세로 높이", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Height_Tall", blendShapeNegative: "Fcl_EYE_Height_Narrow" },
  { id: "eyeWidth", category: "eyes", labelKo: "눈 가로 너비", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Width_Wide", blendShapeNegative: "Fcl_EYE_Width_Narrow" },
  { id: "eyeTilt", category: "eyes", labelKo: "눈꼬리 기울기", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Tilt_Up", blendShapeNegative: "Fcl_EYE_Tilt_Down", semanticMorphId: "eyeTilt" },
  { id: "eyeSpacing", category: "eyes", labelKo: "눈 사이 간격", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Spacing_Wide", blendShapeNegative: "Fcl_EYE_Spacing_Close", semanticMorphId: "eyeSpacing" },
  { id: "eyeDepth", category: "eyes", labelKo: "안와 깊이", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Depth_Deep", blendShapeNegative: "Fcl_EYE_Depth_Shallow" },
  { id: "eyePositionY", category: "eyes", labelKo: "눈 상하 위치", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EYE_Pos_Up", blendShapeNegative: "Fcl_EYE_Pos_Down" },
  { id: "irisSize", category: "eyes", labelKo: "동공·홍채 크기", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "hybrid", blendShapePositive: "Fcl_EYE_Iris_Big", blendShapeNegative: "Fcl_EYE_Iris_Small", semanticMorphId: "irisSize" },
  { id: "irisHeight", category: "eyes", labelKo: "홍채 세로 비율", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "material-texture" },
  { id: "pupilHighlightStyle", category: "eyes", labelKo: "동공 하이라이트 스타일(5종)", min: 0, max: 4, step: 1, defaultValue: 0, targetKind: "material-texture" },
  { id: "pupilHighlightIntensity", category: "eyes", labelKo: "동공 하이라이트 밝기", min: 0, max: 1, step: 0.02, defaultValue: 0.85, targetKind: "material-texture" },
  { id: "eyelidFoldDepth", category: "eyes", labelKo: "쌍꺼풀 라인 깊이", min: 0, max: 1, step: 0.02, defaultValue: 0.35, targetKind: "hybrid", blendShapePositive: "Fcl_EYE_DoubleEyelid" },
  // 눈썹 (5종)
  { id: "browHeight", category: "brows", labelKo: "눈썹 높이", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_BRW_Height_Up", blendShapeNegative: "Fcl_BRW_Height_Down" },
  { id: "browArch", category: "brows", labelKo: "눈썹 아치 곡률", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_BRW_Arch_High", blendShapeNegative: "Fcl_BRW_Arch_Flat" },
  { id: "browThickness", category: "brows", labelKo: "눈썹 두께", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "hybrid", blendShapePositive: "Fcl_BRW_Thick", blendShapeNegative: "Fcl_BRW_Thin" },
  { id: "browSpacing", category: "brows", labelKo: "미간 간격", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_BRW_Spacing_Wide", blendShapeNegative: "Fcl_BRW_Spacing_Close" },
  { id: "browAngle", category: "brows", labelKo: "눈썹 기울기", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_BRW_Angle_Up", blendShapeNegative: "Fcl_BRW_Angle_Down" },
  // 코 (5종)
  { id: "noseHeight", category: "nose", labelKo: "콧대 높이", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_NOS_Height_High", blendShapeNegative: "Fcl_NOS_Height_Low", semanticMorphId: "noseHeight" },
  { id: "noseBridgeWidth", category: "nose", labelKo: "콧등 너비", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_NOS_Bridge_Wide", blendShapeNegative: "Fcl_NOS_Bridge_Slim" },
  { id: "noseTipAngle", category: "nose", labelKo: "코끝 각도", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_NOS_Tip_Up", blendShapeNegative: "Fcl_NOS_Tip_Down" },
  { id: "noseWidth", category: "nose", labelKo: "콧볼 너비", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_NOS_Width_Wide", blendShapeNegative: "Fcl_NOS_Width_Narrow", semanticMorphId: "noseWidth" },
  { id: "noseShadowIntensity", category: "nose", labelKo: "코 셀 그림자 세기", min: 0, max: 1, step: 0.02, defaultValue: 0.4, targetKind: "material-texture" },
  // 입 (5종)
  { id: "mouthWidth", category: "mouth", labelKo: "입 가로 폭", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_MTH_Width_Wide", blendShapeNegative: "Fcl_MTH_Width_Narrow", semanticMorphId: "mouthWidth" },
  { id: "mouthHeight", category: "mouth", labelKo: "입 상하 위치", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_MTH_Pos_Up", blendShapeNegative: "Fcl_MTH_Pos_Down" },
  { id: "mouthDepth", category: "mouth", labelKo: "입 돌출 깊이", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_MTH_Depth_Out", blendShapeNegative: "Fcl_MTH_Depth_In" },
  { id: "lipFullness", category: "mouth", labelKo: "입술 도톰함", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_MTH_Lip_Full", blendShapeNegative: "Fcl_MTH_Lip_Thin", semanticMorphId: "lipFullness" },
  { id: "mouthCornerCurve", category: "mouth", labelKo: "입꼬리 곡선", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_MTH_Corner_Up", blendShapeNegative: "Fcl_MTH_Corner_Down" },
  // 턱·윤곽 (4종)
  { id: "chinLength", category: "jaw", labelKo: "턱 길이", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_JAW_Chin_Long", blendShapeNegative: "Fcl_JAW_Chin_Short" },
  { id: "chinWidth", category: "jaw", labelKo: "턱끝 너비", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_JAW_Chin_Wide", blendShapeNegative: "Fcl_JAW_Chin_Pointy" },
  { id: "jawlineSharpness", category: "jaw", labelKo: "턱선 날렵함", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_JAW_Sharp", blendShapeNegative: "Fcl_JAW_Soft" },
  { id: "cheekVolume", category: "jaw", labelKo: "볼살 볼륨", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_CHK_Full", blendShapeNegative: "Fcl_CHK_Slim" },
  // 귀 (2종, 엘프귀 포함)
  { id: "earSize", category: "ears", labelKo: "귀 크기", min: -1, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EAR_Size_Big", blendShapeNegative: "Fcl_EAR_Size_Small", semanticMorphId: "earSize" },
  { id: "elfEarPoint", category: "ears", labelKo: "엘프귀 뾰족함", min: 0, max: 1, step: 0.02, defaultValue: 0, targetKind: "blendshape", blendShapePositive: "Fcl_EAR_Elf_Pointy" },
  // 메이크업·홍조·아이라인 (3종)
  { id: "blushIntensity", category: "makeup", labelKo: "홍조 세기", min: 0, max: 1, step: 0.02, defaultValue: 0.15, targetKind: "material-texture" },
  { id: "eyelinerThickness", category: "makeup", labelKo: "아이라인 두께", min: 0, max: 1, step: 0.02, defaultValue: 0.45, targetKind: "material-texture" },
  { id: "eyelinerWingAngle", category: "makeup", labelKo: "아이라인 꼬리 각도", min: -1, max: 1, step: 0.02, defaultValue: 0.1, targetKind: "material-texture" },
]);

export const VROID_FACE_CATEGORY_LABELS: Readonly<Record<VroidFaceCategory, string>> = Object.freeze({
  eyes: "눈·동공",
  brows: "눈썹",
  nose: "코",
  mouth: "입술",
  jaw: "턱·윤곽",
  ears: "귀·엘프귀",
  makeup: "홍조·아이라인",
});

/* -------------------------------------------------------------------------- */
/* 3. 바디 프로포션 & 등신대 프리셋 (SD 3.5 · 학원 6.5 · 로판 7.5 · 액션 8.5)     */
/* -------------------------------------------------------------------------- */

export type VroidBodyProportionPresetId = "sd-3.5" | "academy-6.5" | "rofan-7.5" | "action-8.5";

export interface VroidBodyProportionPreset {
  readonly id: VroidBodyProportionPresetId;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly targetHeadUnits: number;
  readonly defaultHeightCm: number;
  readonly overallHeight: number;
  readonly armLength: number;
  readonly legLength: number;
  readonly torsoLength: number;
  readonly shoulderWidth: number;
  readonly handScale: number;
  readonly footScale: number;
  readonly neckLength: number;
}

export const VROID_BODY_PROPORTION_PRESETS: readonly VroidBodyProportionPreset[] = Object.freeze([
  {
    id: "sd-3.5",
    labelKo: "SD 3.5등신",
    hintKo: "개그 컷·마스코트·미니 캐릭터용 귀엽고 탄력 있는 비율",
    targetHeadUnits: 3.5,
    defaultHeightCm: 108,
    overallHeight: 0.66,
    armLength: 0.84,
    legLength: 0.78,
    torsoLength: 0.88,
    shoulderWidth: 0.88,
    handScale: 1.15,
    footScale: 1.18,
    neckLength: 0.72,
  },
  {
    id: "academy-6.5",
    labelKo: "학원 6.5등신",
    hintKo: "청춘·학원물 주인공 표준 비율",
    targetHeadUnits: 6.5,
    defaultHeightCm: 162,
    overallHeight: 0.98,
    armLength: 0.98,
    legLength: 1.0,
    torsoLength: 0.98,
    shoulderWidth: 0.96,
    handScale: 0.98,
    footScale: 0.98,
    neckLength: 0.96,
  },
  {
    id: "rofan-7.5",
    labelKo: "로판 7.5등신",
    hintKo: "우아한 목선과 슬림한 다리 비율의 로맨스 판타지 체형",
    targetHeadUnits: 7.5,
    defaultHeightCm: 172,
    overallHeight: 1.06,
    armLength: 1.04,
    legLength: 1.09,
    torsoLength: 1.01,
    shoulderWidth: 0.95,
    handScale: 0.94,
    footScale: 0.95,
    neckLength: 1.08,
  },
  {
    id: "action-8.5",
    labelKo: "액션 8.5등신",
    hintKo: "넓은 어깨와 긴 팔다리로 역동적 실루엣을 강조하는 헌터·액션 체형",
    targetHeadUnits: 8.5,
    defaultHeightCm: 186,
    overallHeight: 1.15,
    armLength: 1.08,
    legLength: 1.14,
    torsoLength: 1.05,
    shoulderWidth: 1.16,
    handScale: 1.04,
    footScale: 1.04,
    neckLength: 1.06,
  },
]);

/* -------------------------------------------------------------------------- */
/* 4. 레이어드 의상 텍스처 믹서 팔레트·패턴 프리셋                                */
/* -------------------------------------------------------------------------- */

export type VroidOutfitLayerKind = "top" | "bottom" | "outer" | "onepiece" | "accessory";
export type VroidOutfitPatternKind = "solid" | "check" | "stripe" | "dot" | "lace";

export interface VroidOklchPalette3 {
  readonly primary: VroidOklchColor;
  readonly secondary: VroidOklchColor;
  readonly accent: VroidOklchColor;
}

export interface VroidOutfitPalettePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly palette: VroidOklchPalette3;
}

export const VROID_OUTFIT_LAYER_SPECS: readonly { readonly id: VroidOutfitLayerKind; readonly labelKo: string; readonly zOrder: number }[] = Object.freeze([
  { id: "top", labelKo: "상의", zOrder: 10 },
  { id: "bottom", labelKo: "하의", zOrder: 20 },
  { id: "onepiece", labelKo: "원피스", zOrder: 25 },
  { id: "outer", labelKo: "아우터", zOrder: 30 },
  { id: "accessory", labelKo: "소품", zOrder: 40 },
]);

export const VROID_OUTFIT_PATTERN_SPECS: readonly { readonly id: VroidOutfitPatternKind; readonly labelKo: string }[] = Object.freeze([
  { id: "solid", labelKo: "무지" },
  { id: "check", labelKo: "체크" },
  { id: "stripe", labelKo: "스트라이프" },
  { id: "dot", labelKo: "도트" },
  { id: "lace", labelKo: "레이스" },
]);

export const VROID_OUTFIT_PALETTE_PRESETS: readonly VroidOutfitPalettePreset[] = Object.freeze([
  {
    id: "academy-navy",
    labelKo: "학원 네이비 교복",
    palette: {
      primary: { l: 0.3, c: 0.068, h: 258 },
      secondary: { l: 0.94, c: 0.012, h: 85 },
      accent: { l: 0.56, c: 0.165, h: 24 },
    },
  },
  {
    id: "rofan-ivory-gold",
    labelKo: "로판 아이보리 골드",
    palette: {
      primary: { l: 0.94, c: 0.022, h: 88 },
      secondary: { l: 0.78, c: 0.088, h: 84 },
      accent: { l: 0.48, c: 0.125, h: 356 },
    },
  },
  {
    id: "hunter-slate",
    labelKo: "헌터 슬레이트 테크",
    palette: {
      primary: { l: 0.24, c: 0.018, h: 250 },
      secondary: { l: 0.42, c: 0.032, h: 244 },
      accent: { l: 0.68, c: 0.155, h: 196 },
    },
  },
  {
    id: "pastel-atelier",
    labelKo: "파스텔 아틀리에",
    palette: {
      primary: { l: 0.87, c: 0.048, h: 350 },
      secondary: { l: 0.96, c: 0.014, h: 80 },
      accent: { l: 0.74, c: 0.09, h: 174 },
    },
  },
]);

/* -------------------------------------------------------------------------- */
/* 5. VRM 1.0 표정 18종 + ARKit 립싱크 5종 + LookAt 시선 프리셋                 */
/* -------------------------------------------------------------------------- */

export type VroidVrm1ExpressionName =
  | "happy"
  | "angry"
  | "sad"
  | "relaxed"
  | "surprised"
  | "neutral"
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh"
  | "blink"
  | "blinkLeft"
  | "blinkRight"
  | "lookUp"
  | "lookDown"
  | "lookLeft"
  | "lookRight";

export type VroidArkitVisemeName = "aa" | "ih" | "ou" | "ee" | "oh";

export interface VroidVrm1ExpressionSpec {
  readonly name: VroidVrm1ExpressionName;
  readonly labelKo: string;
  readonly group: "emotion" | "lipsync" | "blink" | "lookat";
  readonly overrideBlink: "none" | "block" | "blend";
  readonly overrideMouth: "none" | "block" | "blend";
}

/** VRM 1.0 공식 표준 표정 18종 (감정 6 · 립싱크 5 · 눈깜빡임 3 · 시선 4). */
export const VROID_VRM1_EXPRESSION_PRESETS: readonly VroidVrm1ExpressionSpec[] = Object.freeze([
  { name: "happy", labelKo: "행복", group: "emotion", overrideBlink: "block", overrideMouth: "blend" },
  { name: "angry", labelKo: "화남", group: "emotion", overrideBlink: "blend", overrideMouth: "blend" },
  { name: "sad", labelKo: "슬픔", group: "emotion", overrideBlink: "blend", overrideMouth: "blend" },
  { name: "relaxed", labelKo: "편안", group: "emotion", overrideBlink: "block", overrideMouth: "blend" },
  { name: "surprised", labelKo: "놀람", group: "emotion", overrideBlink: "block", overrideMouth: "blend" },
  { name: "neutral", labelKo: "무표정", group: "emotion", overrideBlink: "none", overrideMouth: "none" },
  { name: "aa", labelKo: "발음 아(aa)", group: "lipsync", overrideBlink: "none", overrideMouth: "none" },
  { name: "ih", labelKo: "발음 이(ih)", group: "lipsync", overrideBlink: "none", overrideMouth: "none" },
  { name: "ou", labelKo: "발음 우(ou)", group: "lipsync", overrideBlink: "none", overrideMouth: "none" },
  { name: "ee", labelKo: "발음 에(ee)", group: "lipsync", overrideBlink: "none", overrideMouth: "none" },
  { name: "oh", labelKo: "발음 오(oh)", group: "lipsync", overrideBlink: "none", overrideMouth: "none" },
  { name: "blink", labelKo: "양눈 감기", group: "blink", overrideBlink: "none", overrideMouth: "none" },
  { name: "blinkLeft", labelKo: "왼눈 윙크", group: "blink", overrideBlink: "none", overrideMouth: "none" },
  { name: "blinkRight", labelKo: "오른눈 윙크", group: "blink", overrideBlink: "none", overrideMouth: "none" },
  { name: "lookUp", labelKo: "위 보기", group: "lookat", overrideBlink: "none", overrideMouth: "none" },
  { name: "lookDown", labelKo: "아래 보기", group: "lookat", overrideBlink: "none", overrideMouth: "none" },
  { name: "lookLeft", labelKo: "왼쪽 보기", group: "lookat", overrideBlink: "none", overrideMouth: "none" },
  { name: "lookRight", labelKo: "오른쪽 보기", group: "lookat", overrideBlink: "none", overrideMouth: "none" },
]);

export const VROID_ARKIT_LIPSYNC_MAP: Readonly<Record<VroidArkitVisemeName, Readonly<Record<string, number>>>> = Object.freeze({
  aa: Object.freeze({ jawOpen: 0.85, mouthLowerDownLeft: 0.4, mouthLowerDownRight: 0.4 }),
  ih: Object.freeze({ jawOpen: 0.22, mouthSmileLeft: 0.55, mouthSmileRight: 0.55, mouthStretchLeft: 0.45, mouthStretchRight: 0.45 }),
  ou: Object.freeze({ jawOpen: 0.32, mouthPucker: 0.82, mouthFunnel: 0.65 }),
  ee: Object.freeze({ jawOpen: 0.42, mouthStretchLeft: 0.6, mouthStretchRight: 0.6, mouthUpperUpLeft: 0.25, mouthUpperUpRight: 0.25 }),
  oh: Object.freeze({ jawOpen: 0.62, mouthFunnel: 0.78, mouthPucker: 0.35 }),
});

export type VroidLookAtPresetId =
  | "camera-direct"
  | "shy-avert"
  | "look-up-appeal"
  | "cool-glance-down"
  | "partner-left"
  | "partner-right";

export interface VroidLookAtPreset {
  readonly id: VroidLookAtPresetId;
  readonly labelKo: string;
  readonly yawDeg: number;
  readonly pitchDeg: number;
}

export const VROID_LOOKAT_PRESETS: readonly VroidLookAtPreset[] = Object.freeze([
  { id: "camera-direct", labelKo: "카메라 정면", yawDeg: 0, pitchDeg: 0 },
  { id: "shy-avert", labelKo: "수줍게 피하기", yawDeg: 14, pitchDeg: -8 },
  { id: "look-up-appeal", labelKo: "위 올려다보기", yawDeg: 0, pitchDeg: 14 },
  { id: "cool-glance-down", labelKo: "내려다보기", yawDeg: -6, pitchDeg: -12 },
  { id: "partner-left", labelKo: "좌측 상대역", yawDeg: -22, pitchDeg: 2 },
  { id: "partner-right", labelKo: "우측 상대역", yawDeg: 22, pitchDeg: 2 },
]);
