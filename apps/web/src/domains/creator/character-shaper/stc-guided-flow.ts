/**
 * STC 안내형 동선 — 얼굴 사진 한 장 → 닮은꼴 캐릭터 초안 → 셰이퍼 전달.
 *
 * 투닝 STC(Shot to Character: 얼굴 사진을 찍으면 특징을 분석해 닮은꼴
 * 캐릭터를 생성)를 우리 구조로 흡수한 단계 안내 모델이다. 흐름은
 * ① 사진 입력 → ② 특징 확인·수정 → ③ 셰이퍼 초안 전달 세 단계로 고정하고,
 * 각 단계는 앞 단계가 완성되지 않으면 넘어가지 않는다(fail-closed).
 *
 * 비용·개인정보 원칙:
 *  - AI 실연결은 이 모듈에 없다. 분석 제공자는 `StcFaceAnalysisProvider`
 *    계약으로만 분리하고, 제공자가 없으면 "중립 기본값 + 사용자가 직접
 *    확인·수정"으로 정직하게 동작한다 — 자동으로 읽은 척 지어내지 않는다.
 *  - 사진 바이트는 이 모듈이 보관하지 않는다. 호스트가 만든 미리보기
 *    참조(객체 URL 등) 문자열과 파일 메타데이터만 상태에 둔다.
 *  - 초안은 셰이퍼의 기존 권위(Avatar Forge 얼굴 파라미터·의미 형태소·
 *    헤어·레시피 색상)로만 표현한다. 새 장면 문서를 만들지 않는다.
 *
 * 전부 순수·결정적. 같은 특징 프로필은 항상 같은 초안을 만든다.
 */

import type {
  AvatarForgeBangStyle,
  AvatarForgeFaceParams,
  AvatarForgeHairStyle,
  AvatarForgeSemanticFaceMorphId,
} from "../vrm/studio-vrm-avatar-forge";
import type { CharacterSemanticMorphBundle } from "./character-shaper-contract";

/* -------------------------------------------------------------------------- */
/* 단계                                                                        */
/* -------------------------------------------------------------------------- */

export const STC_FLOW_STEPS = ["photo", "features", "draft"] as const;
export type StcFlowStep = (typeof STC_FLOW_STEPS)[number];

export const STC_FLOW_STEP_LABELS: Readonly<Record<StcFlowStep, string>> = Object.freeze({
  photo: "사진 고르기",
  features: "특징 확인하기",
  draft: "초안 보내기",
});

/** 단계 안내 문구 — 무엇을 하면 되는지, 사진이 어떻게 다뤄지는지 먼저 밝힌다. */
export const STC_FLOW_STEP_GUIDES: Readonly<Record<StcFlowStep, string>> = Object.freeze({
  photo:
    "정면을 바라본 밝은 사진이 좋아요. 본인 사진이거나 사용해도 된다는 동의를 받은 사진만 올려 주세요. 자동 분석을 연결하기 전에는 사진이 이 기기를 벗어나지 않아요.",
  features:
    "캐릭터에 반영할 특징이에요. 자동으로 읽힌 값이 있으면 표시하고, 아니면 기본값에서 시작해요. 실제와 다르면 여기서 직접 바꿔 주세요.",
  draft: "아래 초안을 캐릭터 셰이퍼로 보내면 얼굴·눈·코·입·헤어가 한 번에 적용돼요. 보낸 뒤에도 셰이퍼에서 언제든 되돌리고 다듬을 수 있어요.",
});

/* -------------------------------------------------------------------------- */
/* 사진 입력                                                                   */
/* -------------------------------------------------------------------------- */

export interface StcPhotoMeta {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
}

export interface StcPhotoSelection {
  readonly meta: StcPhotoMeta;
  /** 호스트가 만든 미리보기 참조(객체 URL 등). 사진 바이트 자체는 보관하지 않는다. */
  readonly previewRef: string;
}

export const STC_PHOTO_MAX_BYTES = 12 * 1024 * 1024;
/** 얼굴이 너무 작으면 특징을 확인할 수 없어 막는다(오류), 애매하면 경고만 한다. */
export const STC_PHOTO_MIN_FACE_SIDE_PX = 160;
export const STC_PHOTO_WARN_SIDE_PX = 480;

export interface StcPhotoIssue {
  readonly code: "not-image" | "too-large" | "too-small" | "no-size";
  readonly message: string;
  readonly blocking: boolean;
}

export function validateStcPhoto(meta: StcPhotoMeta): readonly StcPhotoIssue[] {
  const issues: StcPhotoIssue[] = [];
  if (!meta.mimeType.startsWith("image/")) {
    issues.push({ code: "not-image", message: "이미지 파일만 올릴 수 있어요.", blocking: true });
  }
  if (!Number.isFinite(meta.sizeBytes) || meta.sizeBytes <= 0) {
    issues.push({ code: "no-size", message: "파일 크기를 확인할 수 없어요. 다른 사진으로 시도해 주세요.", blocking: true });
  } else if (meta.sizeBytes > STC_PHOTO_MAX_BYTES) {
    issues.push({ code: "too-large", message: "사진이 너무 커요. 12MB보다 작은 사진으로 올려 주세요.", blocking: true });
  }
  const minSide = Math.min(meta.width, meta.height);
  if (!Number.isFinite(minSide) || minSide <= 0) {
    issues.push({ code: "no-size", message: "사진 크기를 확인할 수 없어요. 다른 사진으로 시도해 주세요.", blocking: true });
  } else if (minSide < STC_PHOTO_MIN_FACE_SIDE_PX) {
    issues.push({
      code: "too-small",
      message: "사진이 너무 작아 얼굴 특징을 확인하기 어려워요. 얼굴이 크게 나온 사진으로 올려 주세요.",
      blocking: true,
    });
  } else if (minSide < STC_PHOTO_WARN_SIDE_PX) {
    issues.push({
      code: "too-small",
      message: "사진이 조금 작아요. 얼굴이 더 크게 나온 사진이면 특징을 더 정확히 맞출 수 있어요.",
      blocking: false,
    });
  }
  return Object.freeze(issues);
}

export function stcPhotoBlockingIssues(meta: StcPhotoMeta): readonly StcPhotoIssue[] {
  return validateStcPhoto(meta).filter((issue) => issue.blocking);
}

/* -------------------------------------------------------------------------- */
/* 특징 프로필 — 2단계에서 사용자가 확인·수정하는 값                            */
/* -------------------------------------------------------------------------- */

export type StcFaceShapeKind = "balanced" | "oval" | "round" | "sharp" | "angular" | "long" | "heart";
export type StcTriLevel = "low" | "medium" | "high";
export type StcEyeTilt = "down" | "neutral" | "up";

export const STC_FACE_SHAPE_LABELS: Readonly<Record<StcFaceShapeKind, string>> = Object.freeze({
  balanced: "균형형",
  oval: "계란형",
  round: "둥근형",
  sharp: "샤프형",
  angular: "각진형",
  long: "긴형",
  heart: "하트형",
});

export interface StcFaceFeatureProfile {
  readonly faceShape: StcFaceShapeKind;
  /** 볼 볼륨 보정 0..1 — 얼굴형 기본값에 더해진다. */
  readonly cheekFullness: number;
  /** 턱 뾰족함 0..1 — 높을수록 턱이 길고 뾰족하게. */
  readonly chinPointedness: number;
  readonly eyeSize: StcTriLevel;
  readonly eyeSpacing: StcTriLevel;
  readonly eyeTilt: StcEyeTilt;
  readonly noseHeight: StcTriLevel;
  readonly noseWidth: StcTriLevel;
  readonly mouthWidth: StcTriLevel;
  readonly lipFullness: StcTriLevel;
  readonly hairStyle: AvatarForgeHairStyle;
  readonly bangStyle: AvatarForgeBangStyle;
  /** #rrggbb — 머리카락 색. */
  readonly hairColor: string;
  /** #rrggbb — 눈동자 색. */
  readonly irisColor: string;
  /** #rrggbb — 피부색(레시피 색상 skin으로 전달). */
  readonly skinTone: string;
  /** 값의 출처. manual이면 자동 분석 없이 사용자가 정한 값이다. */
  readonly source: "provider" | "manual";
  /** 제공자 분석일 때만 있는 항목별 신뢰도 0..1. 낮으면 확인을 유도한다. */
  readonly confidence?: Readonly<Partial<Record<StcFeatureKey, number>>>;
}

export type StcFeatureKey =
  | "faceShape"
  | "eyeSize"
  | "eyeSpacing"
  | "eyeTilt"
  | "noseHeight"
  | "noseWidth"
  | "mouthWidth"
  | "lipFullness"
  | "hairStyle"
  | "hairColor"
  | "irisColor"
  | "skinTone";

export const STC_FEATURE_LABELS: Readonly<Record<StcFeatureKey, string>> = Object.freeze({
  faceShape: "얼굴형",
  eyeSize: "눈 크기",
  eyeSpacing: "눈 사이 간격",
  eyeTilt: "눈꼬리",
  noseHeight: "코 높이",
  noseWidth: "코 너비",
  mouthWidth: "입 너비",
  lipFullness: "입술 볼륨",
  hairStyle: "헤어스타일",
  hairColor: "머리카락 색",
  irisColor: "눈동자 색",
  skinTone: "피부색",
});

/** 자동 분석이 없을 때 시작점 — 중립 기본값. 특정 얼굴을 흉내 내지 않는다. */
export function createManualStcProfile(): StcFaceFeatureProfile {
  return Object.freeze({
    faceShape: "balanced",
    cheekFullness: 0.35,
    chinPointedness: 0.5,
    eyeSize: "medium",
    eyeSpacing: "medium",
    eyeTilt: "neutral",
    noseHeight: "medium",
    noseWidth: "medium",
    mouthWidth: "medium",
    lipFullness: "medium",
    hairStyle: "short",
    bangStyle: "full",
    hairColor: "#3a2a24",
    irisColor: "#2b1a12",
    skinTone: "#f2c9a8",
    source: "manual",
  });
}

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

export function isStcHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

export function validateStcProfile(profile: StcFaceFeatureProfile): readonly string[] {
  const problems: string[] = [];
  if (!isStcHexColor(profile.hairColor)) problems.push("머리카락 색 형식이 올바르지 않아요.");
  if (!isStcHexColor(profile.irisColor)) problems.push("눈동자 색 형식이 올바르지 않아요.");
  if (!isStcHexColor(profile.skinTone)) problems.push("피부색 형식이 올바르지 않아요.");
  if (!Number.isFinite(profile.cheekFullness) || profile.cheekFullness < 0 || profile.cheekFullness > 1) {
    problems.push("볼 볼륨 값이 범위를 벗어났어요.");
  }
  if (!Number.isFinite(profile.chinPointedness) || profile.chinPointedness < 0 || profile.chinPointedness > 1) {
    problems.push("턱 모양 값이 범위를 벗어났어요.");
  }
  return Object.freeze(problems);
}

/** 신뢰도가 낮아 사용자가 꼭 확인해야 하는 항목 라벨. 수동 입력이면 빈 배열. */
export function stcFeaturesNeedingReview(
  profile: StcFaceFeatureProfile,
  threshold = 0.6,
): readonly string[] {
  if (profile.source !== "provider" || !profile.confidence) return Object.freeze([]);
  const labels: string[] = [];
  for (const key of Object.keys(profile.confidence) as StcFeatureKey[]) {
    const value = profile.confidence[key];
    if (typeof value === "number" && value < threshold) labels.push(STC_FEATURE_LABELS[key]);
  }
  return Object.freeze(labels);
}

/* -------------------------------------------------------------------------- */
/* AI 제공자 계약 — 실연결은 제공자·비용 결정 후 별도 작업 (이 모듈 범위 밖)     */
/* -------------------------------------------------------------------------- */

export interface StcFaceAnalysisProvider {
  readonly id: string;
  /**
   * 사진 미리보기 참조를 받아 특징 프로필을 돌려준다.
   * 반환 프로필은 반드시 source: "provider"와 항목별 confidence를 채운다.
   * 실패하면 throw가 아니라 null — 동선은 수동 확인으로 이어진다.
   */
  analyze(input: { readonly previewRef: string }): Promise<StcFaceFeatureProfile | null>;
}

/** 제공자 선정 시 지켜야 할 요건 — NOTES의 제공자 명세와 같은 내용의 코드 정본. */
export const STC_PROVIDER_REQUIREMENTS = Object.freeze([
  "사진 원본은 분석에 필요한 최소 범위만 전송하고, 제공자 측 보존·학습 사용 금지를 계약으로 확인한다.",
  "비용 원칙: 무료 범위 또는 사용자 승인 후에만 연결한다. 호출당 과금이면 동선 진입 전에 그 사실을 표시한다.",
  "출력은 StcFaceFeatureProfile 스키마만 허용한다. 스키마 밖 값은 버리고 수동 확인으로 폴백한다.",
  "얼굴 인식·신원 식별(누구인지 맞히기)은 하지 않는다. 닮은꼴 초안에 필요한 형태·색 특징만 추출한다.",
]);

export type StcAnalysisOutcome =
  | { readonly kind: "provider"; readonly profile: StcFaceFeatureProfile }
  | { readonly kind: "manual"; readonly profile: StcFaceFeatureProfile; readonly reason: "no-provider" | "provider-failed" | "invalid-profile" };

/**
 * 제공자가 있으면 분석을 시도하고, 없거나 실패하면 중립 수동 프로필로
 * 정직하게 폴백한다. 어떤 경우에도 특징을 지어내지 않는다.
 */
export async function resolveStcProfile(
  provider: StcFaceAnalysisProvider | null | undefined,
  previewRef: string,
): Promise<StcAnalysisOutcome> {
  if (!provider) {
    return Object.freeze({ kind: "manual", profile: createManualStcProfile(), reason: "no-provider" });
  }
  let profile: StcFaceFeatureProfile | null;
  try {
    profile = await provider.analyze({ previewRef });
  } catch {
    profile = null;
  }
  if (!profile) {
    return Object.freeze({ kind: "manual", profile: createManualStcProfile(), reason: "provider-failed" });
  }
  if (profile.source !== "provider" || validateStcProfile(profile).length > 0) {
    return Object.freeze({ kind: "manual", profile: createManualStcProfile(), reason: "invalid-profile" });
  }
  return Object.freeze({ kind: "provider", profile });
}

/* -------------------------------------------------------------------------- */
/* 특징 → 셰이퍼 초안                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 얼굴형 기본값 — 셰이퍼 카탈로그 face-shape 항목의 적용값과 동일하게 맞춘
 * 복사본이다(카탈로그 정본: character-shaper-catalog FACE_SHAPES).
 * 초안의 faceShapeEntryId가 가리키는 항목을 적용한 결과와 이 표로 만든
 * 얼굴이 어긋나지 않게, 테스트가 두 값을 함께 고정한다.
 */
export const STC_FACE_SHAPE_BASE: Readonly<Record<StcFaceShapeKind, AvatarForgeFaceParams>> = Object.freeze({
  balanced: Object.freeze({ headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 }),
  oval: Object.freeze({ headWidth: 0.97, headHeight: 1.05, headDepth: 1, cheekVolume: 0.3, chinLength: 1.04 }),
  round: Object.freeze({ headWidth: 1.06, headHeight: 0.97, headDepth: 1.02, cheekVolume: 0.62, chinLength: 0.95 }),
  sharp: Object.freeze({ headWidth: 0.94, headHeight: 1.04, headDepth: 0.98, cheekVolume: 0.18, chinLength: 1.08 }),
  angular: Object.freeze({ headWidth: 1.08, headHeight: 1, headDepth: 1, cheekVolume: 0.22, chinLength: 1.06 }),
  long: Object.freeze({ headWidth: 0.95, headHeight: 1.12, headDepth: 1, cheekVolume: 0.28, chinLength: 1.12 }),
  heart: Object.freeze({ headWidth: 1.07, headHeight: 1.02, headDepth: 1, cheekVolume: 0.5, chinLength: 0.88 }),
});

/** 얼굴형 → 셰이퍼 카탈로그 항목 id ("slot:name" 네임스페이스). */
export const STC_FACE_SHAPE_ENTRY_IDS: Readonly<Record<StcFaceShapeKind, string>> = Object.freeze({
  balanced: "face-shape:balanced",
  oval: "face-shape:oval",
  round: "face-shape:round",
  sharp: "face-shape:sharp",
  angular: "face-shape:angular",
  long: "face-shape:long",
  heart: "face-shape:heart",
});

/**
 * Avatar Forge 얼굴 한계 — studio-vrm-avatar-forge의
 * AVATAR_FORGE_FACE_LIMITS와 동일 값. 초안은 항상 이 범위 안으로 clamp한다.
 */
export const STC_FACE_LIMITS: Readonly<Record<keyof AvatarForgeFaceParams, { readonly min: number; readonly max: number }>> =
  Object.freeze({
    headWidth: Object.freeze({ min: 0.84, max: 1.18 }),
    headHeight: Object.freeze({ min: 0.86, max: 1.16 }),
    headDepth: Object.freeze({ min: 0.88, max: 1.14 }),
    cheekVolume: Object.freeze({ min: 0, max: 1 }),
    chinLength: Object.freeze({ min: 0.88, max: 1.14 }),
  });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampFace(face: AvatarForgeFaceParams): AvatarForgeFaceParams {
  return Object.freeze({
    headWidth: clamp(face.headWidth, STC_FACE_LIMITS.headWidth.min, STC_FACE_LIMITS.headWidth.max),
    headHeight: clamp(face.headHeight, STC_FACE_LIMITS.headHeight.min, STC_FACE_LIMITS.headHeight.max),
    headDepth: clamp(face.headDepth, STC_FACE_LIMITS.headDepth.min, STC_FACE_LIMITS.headDepth.max),
    cheekVolume: clamp(face.cheekVolume, STC_FACE_LIMITS.cheekVolume.min, STC_FACE_LIMITS.cheekVolume.max),
    chinLength: clamp(face.chinLength, STC_FACE_LIMITS.chinLength.min, STC_FACE_LIMITS.chinLength.max),
  });
}

const TRI_MORPH: Readonly<Record<StcTriLevel, number>> = Object.freeze({ low: -0.4, medium: 0, high: 0.45 });
const EYE_SIZE_MORPH: Readonly<Record<StcTriLevel, number>> = Object.freeze({ low: -0.3, medium: 0, high: 0.5 });
const EYE_TILT_MORPH: Readonly<Record<StcEyeTilt, number>> = Object.freeze({ down: -0.5, neutral: 0, up: 0.55 });

/** 셰이퍼로 전달하는 초안 — 호스트가 기존 적용 경로에 그대로 실을 수 있는 값만 담는다. */
export interface StcShaperDraft {
  /** Avatar Forge 얼굴 파라미터 (forge-face 적용값). */
  readonly face: AvatarForgeFaceParams;
  /** 의미 형태소 묶음 (semantic-morph 적용값). 0인 항목은 포함하지 않는다. */
  readonly semanticMorphs: CharacterSemanticMorphBundle;
  readonly hair: {
    readonly style: AvatarForgeHairStyle;
    readonly bangStyle: AvatarForgeBangStyle;
    readonly baseColor: string;
    readonly tipColor: string;
  };
  /** 레시피 색상 — 셰이퍼 recipe colors(skin·iris)와 같은 자리. */
  readonly colors: { readonly skin: string; readonly iris: string };
  /** 얼굴형 카탈로그 항목 id — 호스트가 항목 단위 적용을 원할 때의 대안 경로. */
  readonly faceShapeEntryId: string;
  /** 3단계 확인 화면에 그대로 보여주는 사람이 읽는 요약. */
  readonly summary: readonly string[];
  /** 신뢰도가 낮아 셰이퍼에서 다시 보라고 알릴 항목 라벨. */
  readonly needsReview: readonly string[];
  readonly sourceProfile: StcFaceFeatureProfile;
}

const TRI_LABELS: Readonly<Record<StcTriLevel, string>> = Object.freeze({ low: "작게", medium: "보통", high: "크게" });
const TILT_LABELS: Readonly<Record<StcEyeTilt, string>> = Object.freeze({ down: "처진", neutral: "보통", up: "올라간" });

export function buildStcShaperDraft(profile: StcFaceFeatureProfile): StcShaperDraft {
  const base = STC_FACE_SHAPE_BASE[profile.faceShape];
  const face = clampFace({
    headWidth: base.headWidth,
    headHeight: base.headHeight,
    headDepth: base.headDepth,
    // 볼 볼륨: 얼굴형 기본값을 중심으로 사용자가 확인한 볼륨으로 절반 보정.
    cheekVolume: base.cheekVolume + (profile.cheekFullness - base.cheekVolume) * 0.5,
    // 턱: 뾰족함 0.5가 기본값 유지, 벗어난 만큼만 ±0.08 범위에서 조정.
    chinLength: base.chinLength + (profile.chinPointedness - 0.5) * 0.16,
  });

  const morphEntries: Partial<Record<AvatarForgeSemanticFaceMorphId, number>> = {
    eyeSize: EYE_SIZE_MORPH[profile.eyeSize],
    eyeSpacing: TRI_MORPH[profile.eyeSpacing],
    eyeTilt: EYE_TILT_MORPH[profile.eyeTilt],
    irisSize: EYE_SIZE_MORPH[profile.eyeSize] * 0.6,
    noseHeight: TRI_MORPH[profile.noseHeight],
    noseWidth: TRI_MORPH[profile.noseWidth],
    mouthWidth: TRI_MORPH[profile.mouthWidth],
    lipFullness: TRI_MORPH[profile.lipFullness],
  };
  const semanticMorphs: CharacterSemanticMorphBundle = {};
  for (const [id, value] of Object.entries(morphEntries) as [AvatarForgeSemanticFaceMorphId, number][]) {
    if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 1e-4) {
      semanticMorphs[id] = clamp(value, -1, 1);
    }
  }

  const summary: string[] = [
    `얼굴형: ${STC_FACE_SHAPE_LABELS[profile.faceShape]}`,
    `눈: ${TRI_LABELS[profile.eyeSize]} · 간격 ${TRI_LABELS[profile.eyeSpacing]} · 눈꼬리 ${TILT_LABELS[profile.eyeTilt]}`,
    `코: 높이 ${TRI_LABELS[profile.noseHeight]} · 너비 ${TRI_LABELS[profile.noseWidth]}`,
    `입: 너비 ${TRI_LABELS[profile.mouthWidth]} · 입술 ${TRI_LABELS[profile.lipFullness]}`,
    `헤어: ${profile.hairStyle} · 머리카락 ${profile.hairColor} · 눈동자 ${profile.irisColor}`,
    profile.source === "provider"
      ? "특징 출처: 자동 분석 결과를 직접 확인했어요."
      : "특징 출처: 자동 분석 없이 직접 확인한 값이에요.",
  ];

  return Object.freeze({
    face,
    semanticMorphs: Object.freeze(semanticMorphs),
    hair: Object.freeze({
      style: profile.hairStyle,
      bangStyle: profile.bangStyle,
      baseColor: profile.hairColor.trim().toLowerCase(),
      tipColor: profile.hairColor.trim().toLowerCase(),
    }),
    colors: Object.freeze({
      skin: profile.skinTone.trim().toLowerCase(),
      iris: profile.irisColor.trim().toLowerCase(),
    }),
    faceShapeEntryId: STC_FACE_SHAPE_ENTRY_IDS[profile.faceShape],
    summary: Object.freeze(summary),
    needsReview: stcFeaturesNeedingReview(profile),
    sourceProfile: profile,
  });
}

/* -------------------------------------------------------------------------- */
/* 흐름 상태기계 — 단계 건너뛰기 금지, 뒤로 가기는 자유                          */
/* -------------------------------------------------------------------------- */

export interface StcFlowState {
  readonly step: StcFlowStep;
  readonly photo: StcPhotoSelection | null;
  /** 본인 사진이거나 사용 동의를 받았다는 사용자 확인. */
  readonly rightsConfirmed: boolean;
  readonly profile: StcFaceFeatureProfile;
  readonly draft: StcShaperDraft | null;
  readonly handedOff: boolean;
}

export function createStcFlowState(): StcFlowState {
  return Object.freeze({
    step: "photo",
    photo: null,
    rightsConfirmed: false,
    profile: createManualStcProfile(),
    draft: null,
    handedOff: false,
  });
}

export function stcFlowSetPhoto(state: StcFlowState, photo: StcPhotoSelection | null): StcFlowState {
  // 사진을 바꾸면 이전 특징·초안은 사진과 어긋날 수 있어 무효화한다.
  return Object.freeze({
    ...state,
    photo,
    profile: createManualStcProfile(),
    draft: null,
    handedOff: false,
    step: "photo",
  });
}

export function stcFlowSetRightsConfirmed(state: StcFlowState, confirmed: boolean): StcFlowState {
  return Object.freeze({ ...state, rightsConfirmed: confirmed });
}

export function stcFlowSetProfile(state: StcFlowState, profile: StcFaceFeatureProfile): StcFlowState {
  // 특징이 바뀌면 이전 초안은 낡은 값이라 버린다.
  return Object.freeze({ ...state, profile, draft: null, handedOff: false });
}

export function stcFlowPatchProfile(
  state: StcFlowState,
  patch: Partial<StcFaceFeatureProfile>,
): StcFlowState {
  return stcFlowSetProfile(state, Object.freeze({ ...state.profile, ...patch }));
}

/** 현재 단계에서 다음으로 갈 수 있는가 — 막히면 그 이유(사용자 문구)를 돌려준다. */
export function stcFlowBlockReason(state: StcFlowState): string | null {
  switch (state.step) {
    case "photo": {
      if (!state.photo) return "먼저 사진을 골라 주세요.";
      const blocking = stcPhotoBlockingIssues(state.photo.meta);
      if (blocking.length > 0) return blocking[0]!.message;
      if (!state.rightsConfirmed) return "본인 사진이거나 사용해도 된다는 동의를 받은 사진인지 확인해 주세요.";
      return null;
    }
    case "features": {
      const problems = validateStcProfile(state.profile);
      return problems.length > 0 ? problems[0]! : null;
    }
    case "draft":
      return state.draft ? null : "초안이 아직 만들어지지 않았어요.";
  }
}

export type StcFlowAdvanceResult =
  | { readonly ok: true; readonly state: StcFlowState }
  | { readonly ok: false; readonly state: StcFlowState; readonly reason: string };

export function stcFlowAdvance(state: StcFlowState): StcFlowAdvanceResult {
  const reason = stcFlowBlockReason(state);
  if (reason) return Object.freeze({ ok: false, state, reason });
  if (state.step === "photo") {
    return Object.freeze({ ok: true, state: Object.freeze({ ...state, step: "features" }) });
  }
  if (state.step === "features") {
    const draft = buildStcShaperDraft(state.profile);
    return Object.freeze({ ok: true, state: Object.freeze({ ...state, step: "draft", draft }) });
  }
  return Object.freeze({ ok: false, state, reason: "마지막 단계예요. 셰이퍼로 보내기를 눌러 주세요." });
}

export function stcFlowBack(state: StcFlowState): StcFlowState {
  if (state.step === "draft") return Object.freeze({ ...state, step: "features", handedOff: false });
  if (state.step === "features") return Object.freeze({ ...state, step: "photo" });
  return state;
}

/** 셰이퍼 전달 — 초안이 있을 때만 성공하고, 전달한 초안을 그대로 돌려준다. */
export function stcFlowHandOff(
  state: StcFlowState,
): { readonly ok: true; readonly state: StcFlowState; readonly draft: StcShaperDraft } | { readonly ok: false; readonly state: StcFlowState; readonly reason: string } {
  if (state.step !== "draft" || !state.draft) {
    return Object.freeze({ ok: false, state, reason: "초안을 먼저 확인해 주세요." });
  }
  return Object.freeze({
    ok: true,
    state: Object.freeze({ ...state, handedOff: true }),
    draft: state.draft,
  });
}
