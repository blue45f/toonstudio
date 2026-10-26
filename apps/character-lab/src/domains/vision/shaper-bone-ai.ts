/**
 * SHAPER `BoneAIManager` (`0x02000014`), `AIBoneSet` (`0x0200000d`), `AIHandsBoneSet` (`0x0200000e`),
 * `AIHandBoneSet` (`0x0200000f`), `AIPresetSet` (`0x02000012`), `AIPresetSetItem` (`0x02000011`),
 * `AIPoseType` (`0x02000013`), `UIAIPreset` (`0x02000059`), `UIAIPresetItem` (`0x0200005a`)
 * 역공학 클린룸 내재화 (`ev_2b8946b802471bae4a1d223badd51acc775bd4163e051f39d06805e6225539ac`):
 *
 * 1. `BoneAIManager::OpenImage` (`0x060000cd`, RVA `44784`) & `GetTexture2DFromWebcamTexture` (`0x060000d9`, RVA `46612`):
 *    - 정지 영상의 최장변이 512px을 초과하면 종횡비를 유지한 채 최장변을 512px로 축소
 *    - 웹캠 캡처 프레임은 `512x288` 해상도로 양선형(`ScaleTexture` `0x060000d8`) 리샘플링
 * 2. `BoneAIManager::ApplyJSON` (`0x060000c7`, RVA `42468`) & `ChangeFixVector` (`0x060000e0`, RVA `49644`):
 *    - 전신 24본(`aiBones[24]`) 중 `uncertainty < 0.03f` 인 신뢰 본이 최소 16개 이상일 때만 포즈 적용 허용
 *    - 각 본에 `pose[i] + (i === 0 ? fixMatrixAngles : 0) + fixBoneAngles[i] * 90° + fixBoneAnglesB[i] * 90°` 오일러 보정 적용
 *    - 손 포즈 16본(`aiLHandBones[16]`, `aiRHandBones[16]`)에 `convertAngles[i] + fixHandBoneAngles[i] * 90° + fixHandBoneAnglesB[i]` 적용 및 손목 루트(`index === 0`) 월드 위치 보존
 * 3. `UIAIPreset` (`0x060002a8..0x060002aa`) & `UIAIPresetItem` (`0x060002ae..0x060002b4`):
 *    - 6개 부위(`head`, `eyes`, `nose`, `mouth`, `ears`, `hair`) × 상위 3개 후보 카드 그리드(`x = col * 82`, `y = -22`, 행 간격 `-114px`) 및 `0.1s` 호버 테두리 페이드 애니메이션
 */

export const SHAPER_AI_POSE_TYPES = [
  "body",
  "hand",
  "bodyWebCam",
  "handWebCam",
  "preset",
] as const;

export type ShaperAiPoseType = (typeof SHAPER_AI_POSE_TYPES)[number];

export const SHAPER_AI_POSE_TYPE_LABELS_KO: Readonly<Record<ShaperAiPoseType, string>> = {
  body: "사진 전신 포즈 (24본)",
  hand: "사진 양손 포즈 (16×2본)",
  bodyWebCam: "웹캠 전신 포즈 (512×288)",
  handWebCam: "웹캠 양손 포즈 (512×288)",
  preset: "얼굴·헤어 6부위 프리셋 추천",
};

/** BoneAIManager::OpenImage (0x060000cd): 최장변 512px 상한 */
export const SHAPER_AI_IMAGE_MAX_SIDE = 512;

/** BoneAIManager::GetTexture2DFromWebcamTexture (0x060000d9): ScaleTexture(tex, 512, 288) */
export const SHAPER_AI_WEBCAM_CAPTURE_SIZE = [512, 288] as const;

/** BoneAIManager::Start (0x060000df @1): aiBones = new Transform[24] */
export const SHAPER_AI_BODY_BONE_COUNT = 24;

/** BoneAIManager::Start (0x060000df @14, @27): aiLHandBones / aiRHandBones = new Transform[16] */
export const SHAPER_AI_HAND_BONE_COUNT = 16;

/** BoneAIManager::ApplyJSON (0x060000c7 @88): ldc.r4 0.029999999329447746 */
export const SHAPER_AI_BONE_UNCERTAINTY_THRESHOLD = 0.03;

/** BoneAIManager::ApplyJSON (0x060000c7 @140): ldc.i4.s 16 */
export const SHAPER_AI_MIN_CONFIDENT_BODY_BONES = 16;

/** UIAIPresetItem::.ctor (0x060002b4): fadeDuration = 0.1f */
export const SHAPER_AI_PRESET_FADE_DURATION_SEC = 0.1;

export const SHAPER_AI_PRESET_PARTS = [
  "head",
  "eyes",
  "nose",
  "mouth",
  "ears",
  "hair",
] as const;

export type ShaperAiPresetPart = (typeof SHAPER_AI_PRESET_PARTS)[number];

export const SHAPER_AI_PRESET_PART_LABELS_KO: Readonly<Record<ShaperAiPresetPart, string>> = {
  head: "두상 (Head)",
  eyes: "눈 (Eyes)",
  nose: "코 (Nose)",
  mouth: "입 (Mouth)",
  ears: "귀 (Ears)",
  hair: "헤어 (Hair)",
};

export const SHAPER_AI_PRESET_CANDIDATES_PER_PART = 3;

export type ShaperAiDummyBoneRegion =
  | "Spine"
  | "LLeg"
  | "RLeg"
  | "LArm"
  | "RArm"
  | "Head";

/**
 * BoneAIManager::Start (0x060000df @1694..@1812) 더미 본 24개 부위별 큐브 분류:
 * 0: Pelvis(Spine), 1: LHip(LLeg), 2: RHip(RLeg), 3: Spine1(Spine), 4: LKnee(LLeg), 5: RKnee(RLeg),
 * 6: Spine2(Spine), 7: LAnkle(LLeg), 8: RAnkle(RLeg), 9: Spine3(Spine), 10: LFoot(LLeg), 11: RFoot(RLeg),
 * 12: Neck(Head), 13: LCollar(LArm), 14: RCollar(RArm), 15: Head(Head), 16: LShoulder(LArm), 17: RShoulder(RArm),
 * 18: LElbow(LArm), 19: RElbow(RArm), 20: LWrist(LArm), 21: RWrist(RArm), 22: LHand(LArm), 23: RHand(RArm)
 */
export const SHAPER_AI_BODY_BONE_REGIONS: readonly ShaperAiDummyBoneRegion[] = [
  "Spine",
  "LLeg",
  "RLeg",
  "Spine",
  "LLeg",
  "RLeg",
  "Spine",
  "LLeg",
  "RLeg",
  "Spine",
  "LLeg",
  "RLeg",
  "Head",
  "LArm",
  "RArm",
  "Head",
  "LArm",
  "RArm",
  "LArm",
  "RArm",
  "LArm",
  "RArm",
  "LArm",
  "RArm",
] as const;

export interface ShaperAiImageDownscalePlan {
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly scaled: boolean;
  readonly scaleFactor: number;
}

/**
 * BoneAIManager::OpenImage (`0x060000cd`, RVA `44784` `@97..@253`) 역공학 내재화:
 * 입력 이미지의 가로 또는 세로가 `maxSide`(`512px`)를 초과하면 더 긴 변을 `512px`에 맞추고
 * 짧은 변을 `(shortSide / longSide) * 512` 정수(`conv.i4`)로 비례 축소한다.
 */
export function computeShaperAiImageDownscaleDimensions(
  width: number,
  height: number,
  maxSide: number = SHAPER_AI_IMAGE_MAX_SIDE,
): ShaperAiImageDownscalePlan {
  const safeW = Math.max(1, Math.trunc(width));
  const safeH = Math.max(1, Math.trunc(height));
  const limit = Math.max(1, Math.trunc(maxSide));

  if (safeW <= limit && safeH <= limit) {
    return {
      originalWidth: safeW,
      originalHeight: safeH,
      targetWidth: safeW,
      targetHeight: safeH,
      scaled: false,
      scaleFactor: 1,
    };
  }

  if (safeW > safeH) {
    const targetWidth = limit;
    const targetHeight = Math.max(1, Math.trunc((safeH / safeW) * limit));
    return {
      originalWidth: safeW,
      originalHeight: safeH,
      targetWidth,
      targetHeight,
      scaled: true,
      scaleFactor: targetWidth / safeW,
    };
  }

  const targetHeight = limit;
  const targetWidth = Math.max(1, Math.trunc((safeW / safeH) * limit));
  return {
    originalWidth: safeW,
    originalHeight: safeH,
    targetWidth,
    targetHeight,
    scaled: true,
    scaleFactor: targetHeight / safeH,
  };
}

export type Vec3Tuple = readonly [number, number, number];

export interface ShaperAiBoneSetInput {
  /** 24개 본 각각의 불확실도 배열 (`uncertainties[i][0]`) */
  readonly uncertainties: readonly (readonly number[])[];
  /** 24개 본 각각의 추론 오일러 각 (deg, `[rx, ry, rz]`) */
  readonly pose: readonly Vec3Tuple[];
  /** 본 길이 (더미 본 큐브 `[4, 4, length]` 시각화용, 선택) */
  readonly boneLengths?: readonly number[];
}

export interface ShaperAiEvaluatedBodyBone {
  readonly boneIndex: number;
  readonly region: ShaperAiDummyBoneRegion;
  readonly uncertainty: number;
  readonly confident: boolean;
  readonly eulerDeg: Vec3Tuple;
  /** Start(0x060000df @1888): localScale = Vector3(4, 4, length) */
  readonly dummyCubeScale: Vec3Tuple;
}

export interface ShaperAiBodyPoseEvaluation {
  readonly accepted: boolean;
  readonly confidentBoneCount: number;
  readonly requiredBoneCount: number;
  readonly uncertaintyThreshold: number;
  readonly bones: readonly ShaperAiEvaluatedBodyBone[];
  readonly rejectionReasonKo: string | null;
}

function wrapDegrees180(deg: number): number {
  const mod = ((((deg + 180) % 360) + 360) % 360) - 180;
  return mod === -180 ? 180 : mod;
}

/**
 * BoneAIManager::ChangeFixVector (`0x060000e0`, RVA `49644`) 역공학 내재화:
 * 본 축 보정 계수를 `0 -> 1 -> 2 -> 0` (각 스텝당 `90°` 회전: `0° -> 90° -> 180° -> 0°`) 주기로 순환시킨다.
 */
export function stepShaperFixVectorCycle(currentStep: number): 0 | 1 | 2 {
  const next = Math.trunc(currentStep) + 1;
  if (next > 2 || next < 0) return 0;
  return next as 0 | 1 | 2;
}

/**
 * BoneAIManager::ApplyJSON (`0x060000c7`, RVA `42468` `@63..@543`) 역공학 내재화:
 * - 24개 본 중 `uncertainties[i][0] < 0.03` 조건을 만족하는 본 개수를 집계
 * - 신뢰 본이 16개 미만이면 `accepted: false`와 경고 사유를 반환하고 포즈 적용을 중단
 * - 16개 이상이면 각 신뢰 본에 `pose[i] + (i === 0 ? fixMatrixAngles : 0) + fixBoneAngles[i] * 90 + fixBoneAnglesB[i] * 90`를 합산
 */
export function evaluateShaperAiBodyPoseJson(
  boneSet: ShaperAiBoneSetInput,
  options: {
    readonly fixMatrixAngles?: Vec3Tuple;
    readonly fixBoneAngles?: readonly Vec3Tuple[];
    readonly fixBoneAnglesB?: readonly Vec3Tuple[];
    readonly uncertaintyThreshold?: number;
    readonly minConfidentBones?: number;
  } = {},
): ShaperAiBodyPoseEvaluation {
  const {
    fixMatrixAngles = [0, 0, 0],
    fixBoneAngles = [],
    fixBoneAnglesB = [],
    uncertaintyThreshold = SHAPER_AI_BONE_UNCERTAINTY_THRESHOLD,
    minConfidentBones = SHAPER_AI_MIN_CONFIDENT_BODY_BONES,
  } = options;

  let confidentBoneCount = 0;
  const bones: ShaperAiEvaluatedBodyBone[] = [];

  for (let i = 0; i < SHAPER_AI_BODY_BONE_COUNT; i += 1) {
    const uEntry = boneSet.uncertainties[i];
    const uncertainty = uEntry?.[0] ?? 1.0;
    const confident = uncertainty < uncertaintyThreshold;
    if (confident) {
      confidentBoneCount += 1;
    }

    const rawPose = boneSet.pose[i] ?? [0, 0, 0];
    const fixA = fixBoneAngles[i] ?? [0, 0, 0];
    const fixB = fixBoneAnglesB[i] ?? [0, 0, 0];
    const rootFix: Vec3Tuple = i === 0 ? fixMatrixAngles : [0, 0, 0];

    const eulerDeg: Vec3Tuple = confident
      ? [
          wrapDegrees180(rawPose[0] + rootFix[0] + fixA[0] * 90 + fixB[0] * 90),
          wrapDegrees180(rawPose[1] + rootFix[1] + fixA[1] * 90 + fixB[1] * 90),
          wrapDegrees180(rawPose[2] + rootFix[2] + fixA[2] * 90 + fixB[2] * 90),
        ]
      : [0, 0, 0];

    const length = Math.max(1, boneSet.boneLengths?.[i] ?? 18);
    bones.push({
      boneIndex: i,
      region: SHAPER_AI_BODY_BONE_REGIONS[i] ?? "Spine",
      uncertainty,
      confident,
      eulerDeg,
      dummyCubeScale: [4, 4, length],
    });
  }

  const accepted = confidentBoneCount >= minConfidentBones;
  return {
    accepted,
    confidentBoneCount,
    requiredBoneCount: minConfidentBones,
    uncertaintyThreshold,
    bones,
    rejectionReasonKo: accepted
      ? null
      : `신뢰도 임계값(uncertainty < ${uncertaintyThreshold})을 통과한 본이 ${confidentBoneCount}/${SHAPER_AI_BODY_BONE_COUNT}개로 최소 요구치(${minConfidentBones}개) 미만입니다.`,
  };
}

export interface ShaperAiHandBoneSetInput {
  readonly convertAngles: readonly Vec3Tuple[];
  readonly rootWorldPosition?: Vec3Tuple;
}

export interface ShaperAiHandsBoneSetInput {
  readonly left_hand?: ShaperAiHandBoneSetInput | null;
  readonly right_hand?: ShaperAiHandBoneSetInput | null;
}

export interface ShaperAiEvaluatedHand {
  readonly side: "left" | "right";
  readonly boneEulerDeg: readonly Vec3Tuple[];
  /** index === 0 손목 루트 본의 월드 위치 보존값 */
  readonly preservedWristPosition: Vec3Tuple;
}

export interface ShaperAiHandsPoseEvaluation {
  readonly leftHand: ShaperAiEvaluatedHand | null;
  readonly rightHand: ShaperAiEvaluatedHand | null;
}

function evaluateSingleHand(
  side: "left" | "right",
  handInput: ShaperAiHandBoneSetInput,
  fixHandBoneAngles: readonly Vec3Tuple[],
  fixHandBoneAnglesB: readonly Vec3Tuple[],
): ShaperAiEvaluatedHand {
  const boneEulerDeg: Vec3Tuple[] = [];
  for (let i = 0; i < SHAPER_AI_HAND_BONE_COUNT; i += 1) {
    const raw = handInput.convertAngles[i] ?? [0, 0, 0];
    const fixA = fixHandBoneAngles[i] ?? [0, 0, 0];
    const fixB = fixHandBoneAnglesB[i] ?? [0, 0, 0];
    boneEulerDeg.push([
      wrapDegrees180(raw[0] + fixA[0] * 90 + fixB[0]),
      wrapDegrees180(raw[1] + fixA[1] * 90 + fixB[1]),
      wrapDegrees180(raw[2] + fixA[2] * 90 + fixB[2]),
    ]);
  }
  return {
    side,
    boneEulerDeg,
    preservedWristPosition: handInput.rootWorldPosition ?? [0, 0, 0],
  };
}

/**
 * BoneAIManager::ApplyJSON (`0x060000c7`, RVA `42468` `@555..@995`) 역공학 내재화:
 * 왼손/오른손 각각 16개 관절에 `convertAngles[i] + fixHandBoneAngles[i] * 90 + fixHandBoneAnglesB[i]`를 적용하고,
 * 손목 루트 본(`index === 0`)의 월드 좌표를 회전 전 위치로 보존한다.
 */
export function evaluateShaperAiHandsPoseJson(
  handsSet: ShaperAiHandsBoneSetInput,
  options: {
    readonly fixLHandBoneAngles?: readonly Vec3Tuple[];
    readonly fixLHandBoneAnglesB?: readonly Vec3Tuple[];
    readonly fixRHandBoneAngles?: readonly Vec3Tuple[];
    readonly fixRHandBoneAnglesB?: readonly Vec3Tuple[];
  } = {},
): ShaperAiHandsPoseEvaluation {
  const {
    fixLHandBoneAngles = [],
    fixLHandBoneAnglesB = [],
    fixRHandBoneAngles = [],
    fixRHandBoneAnglesB = [],
  } = options;

  return {
    leftHand: handsSet.left_hand
      ? evaluateSingleHand("left", handsSet.left_hand, fixLHandBoneAngles, fixLHandBoneAnglesB)
      : null,
    rightHand: handsSet.right_hand
      ? evaluateSingleHand("right", handsSet.right_hand, fixRHandBoneAngles, fixRHandBoneAnglesB)
      : null,
  };
}

export interface ShaperAiPresetSetItemInput {
  readonly idx: number;
  readonly prob: number;
  readonly presetId?: string;
  readonly labelKo?: string;
}

export type ShaperAiPresetSetInput = Partial<
  Record<ShaperAiPresetPart, readonly ShaperAiPresetSetItemInput[]>
>;

export interface ShaperAiPresetCardSpec {
  readonly part: ShaperAiPresetPart;
  readonly partLabelKo: string;
  readonly rank: 0 | 1 | 2;
  readonly idx: number;
  readonly probability: number;
  readonly presetId: string;
  readonly labelKo: string;
  /** UIAIPreset::Awake (0x060002a8 @160): anchoredPosition = (col * 82, -22) */
  readonly anchoredPosition: readonly [number, number];
  /** UIAIPreset::Awake (0x060002a8 @67): rowY = -partIndex * 114 */
  readonly partRowY: number;
}

export interface ShaperAiPresetPartRecommendation {
  readonly part: ShaperAiPresetPart;
  readonly partLabelKo: string;
  readonly rowY: number;
  readonly items: readonly ShaperAiPresetCardSpec[];
}

/**
 * UIAIPreset::Awake (`0x060002a8`, RVA `202460`), `SetPart` (`0x060002a9`), `SetPreset` (`0x060002aa`) 역공학 내재화:
 * 6개 얼굴·헤어 부위(`head`, `eyes`, `nose`, `mouth`, `ears`, `hair`)별로 상위 3개 후보를 정렬·배치(`x = rank * 82`, `y = -22`, 행 오프셋 `-row * 114`)한다.
 */
export function buildShaperAiPresetRecommendations(
  presetSet: ShaperAiPresetSetInput,
): readonly ShaperAiPresetPartRecommendation[] {
  return SHAPER_AI_PRESET_PARTS.map((part, partIndex) => {
    const rawItems = presetSet[part] ?? [];
    const sorted = [...rawItems]
      .sort((a, b) => b.prob - a.prob)
      .slice(0, SHAPER_AI_PRESET_CANDIDATES_PER_PART);
    const rowY = partIndex === 0 ? 0 : -partIndex * 114;

    const items: ShaperAiPresetCardSpec[] = [];
    for (let r = 0; r < SHAPER_AI_PRESET_CANDIDATES_PER_PART; r += 1) {
      const rank = r as 0 | 1 | 2;
      const entry = sorted[r];
      const idx = entry?.idx ?? r;
      const probability = Math.max(0, Math.min(1, entry?.prob ?? 0));
      items.push({
        part,
        partLabelKo: SHAPER_AI_PRESET_PART_LABELS_KO[part],
        rank,
        idx,
        probability,
        presetId: entry?.presetId ?? `shaper-${part}-${idx}`,
        labelKo: entry?.labelKo ?? `${SHAPER_AI_PRESET_PART_LABELS_KO[part]} #${idx + 1}`,
        anchoredPosition: [rank * 82, -22],
        partRowY: rowY,
      });
    }

    return {
      part,
      partLabelKo: SHAPER_AI_PRESET_PART_LABELS_KO[part],
      rowY,
      items,
    };
  });
}

export type ShaperAiPresetFadeAniType = 0 | 1 | 2;

/**
 * UIAIPresetItem::Update (`0x060002af`, RVA `203892`), `OnPointerEnter` (`0x060002b2`), `OnPointerExit` (`0x060002b3`) 역공학 내재화:
 * 호버 진입(`fadeAniType = 1`) 시 `0.1초` 동안 테두리 알파를 `0 -> 1`로 선형 증가시키고,
 * 호버 이탈(`fadeAniType = 2`) 시 `0.1초` 동안 `1 -> 0`으로 감소시킨다.
 */
export function computeShaperAiPresetBorderAlpha(
  fadeAniType: ShaperAiPresetFadeAniType,
  elapsedSec: number,
  fadeDurationSec: number = SHAPER_AI_PRESET_FADE_DURATION_SEC,
): { readonly alpha: number; readonly completed: boolean; readonly nextFadeAniType: ShaperAiPresetFadeAniType } {
  const safeDuration = fadeDurationSec > 1e-6 ? fadeDurationSec : SHAPER_AI_PRESET_FADE_DURATION_SEC;
  const clampedElapsed = Math.max(0, elapsedSec);

  if (fadeAniType === 1) {
    const ratio = clampedElapsed / safeDuration;
    if (ratio >= 1) {
      return { alpha: 1, completed: true, nextFadeAniType: 0 };
    }
    return { alpha: ratio, completed: false, nextFadeAniType: 1 };
  }

  if (fadeAniType === 2) {
    const ratio = 1 - clampedElapsed / safeDuration;
    if (ratio <= 0) {
      return { alpha: 0, completed: true, nextFadeAniType: 0 };
    }
    return { alpha: ratio, completed: false, nextFadeAniType: 2 };
  }

  return { alpha: 0, completed: true, nextFadeAniType: 0 };
}
