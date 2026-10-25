/**
 * studio-ai-shaper-bone-preset-engine.ts
 *
 * SHAPER (com.StudioHORANG.SHAPER v1.05, Assembly-CSharp.dll
 * SHA-256: cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d)
 * 역공학 분석에서 도출된 `BoneAIManager` (0x02000014) 기반
 * AI 전신·손 포즈 추정 변환기 및 6-파츠 얼굴 프리셋 추천 엔진 (`AIPresetSet`).
 *
 * 주요 역공학 대응 구조:
 * - `AIPoseType` (0x0200000d): "body" | "hand" | "bodyWebCam" | "handWebCam" | "preset"
 * - `AIBoneSet` (0x0200000e): names, parents, keypoints, uncertainties, convertAngles, convertPositions, convertRotations
 * - `AIHandsBoneSet` (0x02000010): left, right 양손 본 세트
 * - `AIPresetSet` (0x02000011) & `AIPresetSetItem` (0x02000012): 6-파츠(head, eyes, nose, mouth, ears, hair) 얼굴 프리셋 추천
 */

export type ShaperAiPoseType = "body" | "hand" | "bodyWebCam" | "handWebCam" | "preset";

export const SHAPER_AI_POSE_TYPES: readonly ShaperAiPoseType[] = ["body", "hand", "bodyWebCam", "handWebCam", "preset"] as const;

export interface ShaperAiPoseTypeMeta {
  readonly id: ShaperAiPoseType;
  readonly labelKo: string;
  readonly sourceKind: "image" | "webcam";
  readonly targetKind: "body-pose" | "hand-pose" | "face-preset";
  readonly defaultUncertaintyThreshold: number;
  readonly descriptionKo: string;
}

export const SHAPER_AI_POSE_TYPE_META: Readonly<Record<ShaperAiPoseType, ShaperAiPoseTypeMeta>> = {
  body: { id: "body", labelKo: "단일 이미지 전신 3D 포즈 추출", sourceKind: "image", targetKind: "body-pose", defaultUncertaintyThreshold: 0.45, descriptionKo: "정지 이미지에서 전신 관절 3D 키포인트와 회전을 추론해 캐릭터 리그에 적용합니다." },
  hand: { id: "hand", labelKo: "단일 이미지 양손 정밀 포즈 추출", sourceKind: "image", targetKind: "hand-pose", defaultUncertaintyThreshold: 0.4, descriptionKo: "정지 이미지에서 좌·우 손가락 관절 회전과 굽힘 각도를 정밀 추출합니다." },
  bodyWebCam: { id: "bodyWebCam", labelKo: "웹캠 실시간 전신 포즈 캡처", sourceKind: "webcam", targetKind: "body-pose", defaultUncertaintyThreshold: 0.38, descriptionKo: "웹캠 스트림에서 실시간 전신 3D 포즈를 캡처하고 흔들림/불확실 관절을 보정합니다." },
  handWebCam: { id: "handWebCam", labelKo: "웹캠 실시간 손 포즈 캡처", sourceKind: "webcam", targetKind: "hand-pose", defaultUncertaintyThreshold: 0.35, descriptionKo: "웹캠 스트림에서 양손 제스처와 손가락 관절 각도를 실시간 캡처합니다." },
  preset: { id: "preset", labelKo: "인물 사진 기반 얼굴 6-파츠 프리셋 추천", sourceKind: "image", targetKind: "face-preset", defaultUncertaintyThreshold: 0.5, descriptionKo: "인물 사진의 얼굴 비율·이목구비·헤어 특징량을 분석해 6개 파츠 프리셋 조합을 추천합니다." },
};

export function getShaperAiPoseTypeMeta(poseType: ShaperAiPoseType): ShaperAiPoseTypeMeta {
  return SHAPER_AI_POSE_TYPE_META[poseType];
}

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface Quat { readonly x: number; readonly y: number; readonly z: number; readonly w: number }

/** SHAPER `AIBoneSet` (0x0200000e) 대응 구조체 */
export interface AIBoneSet {
  readonly names: readonly string[];
  readonly parents: readonly number[];
  readonly keypoints: readonly Vec3[];
  readonly uncertainties: readonly number[];
  readonly convertAngles?: readonly Vec3[];
  readonly convertPositions?: readonly Vec3[];
  readonly convertRotations?: readonly Quat[];
}

/** SHAPER `AIHandsBoneSet` (0x02000010) 대응 구조체 */
export interface AIHandsBoneSet {
  readonly left: AIBoneSet | null;
  readonly right: AIBoneSet | null;
}

export type AxisPermutationOrder = "xyz" | "xzy" | "yxz" | "yzx" | "zxy" | "zyx";

export interface AiBoneAxisFixRule {
  readonly order?: AxisPermutationOrder;
  readonly signX: 1 | -1;
  readonly signY: 1 | -1;
  readonly signZ: 1 | -1;
  readonly offsetDeg: Vec3;
  readonly minDeg?: Vec3;
  readonly maxDeg?: Vec3;
}

const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

/** SHAPER `BoneAIManager.aiBoneAxisFix` 대응 기본 본 축 보정 테이블 */
export const aiBoneAxisFix: Readonly<Record<string, AiBoneAxisFixRule>> = {
  hips: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3 },
  spine: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3, minDeg: { x: -45, y: -45, z: -35 }, maxDeg: { x: 60, y: 45, z: 35 } },
  chest: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3, minDeg: { x: -40, y: -40, z: -30 }, maxDeg: { x: 45, y: 40, z: 30 } },
  neck: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3, minDeg: { x: -45, y: -60, z: -35 }, maxDeg: { x: 45, y: 60, z: 35 } },
  head: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3, minDeg: { x: -50, y: -75, z: -40 }, maxDeg: { x: 50, y: 75, z: 40 } },
  leftShoulder: { order: "xyz", signX: 1, signY: -1, signZ: -1, offsetDeg: { x: 0, y: 0, z: -5 } },
  leftUpperArm: { order: "xyz", signX: 1, signY: -1, signZ: -1, offsetDeg: ZERO_VEC3 },
  leftLowerArm: { order: "xyz", signX: 1, signY: -1, signZ: -1, offsetDeg: ZERO_VEC3, minDeg: { x: -10, y: -150, z: -90 }, maxDeg: { x: 145, y: 15, z: 90 } },
  leftHand: { order: "xyz", signX: 1, signY: -1, signZ: -1, offsetDeg: ZERO_VEC3 },
  rightShoulder: { order: "xyz", signX: 1, signY: 1, signZ: 1, offsetDeg: { x: 0, y: 0, z: 5 } },
  rightUpperArm: { order: "xyz", signX: 1, signY: 1, signZ: 1, offsetDeg: ZERO_VEC3 },
  rightLowerArm: { order: "xyz", signX: 1, signY: 1, signZ: 1, offsetDeg: ZERO_VEC3, minDeg: { x: -10, y: -15, z: -90 }, maxDeg: { x: 145, y: 150, z: 90 } },
  rightHand: { order: "xyz", signX: 1, signY: 1, signZ: 1, offsetDeg: ZERO_VEC3 },
  leftUpperLeg: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3 },
  leftLowerLeg: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: ZERO_VEC3, minDeg: { x: -155, y: -20, z: -15 }, maxDeg: { x: 5, y: 20, z: 15 } },
  leftFoot: { order: "xyz", signX: -1, signY: 1, signZ: -1, offsetDeg: { x: 5, y: 0, z: 0 } },
  rightUpperLeg: { order: "xyz", signX: -1, signY: -1, signZ: 1, offsetDeg: ZERO_VEC3 },
  rightLowerLeg: { order: "xyz", signX: -1, signY: -1, signZ: 1, offsetDeg: ZERO_VEC3, minDeg: { x: -155, y: -20, z: -15 }, maxDeg: { x: 5, y: 20, z: 15 } },
  rightFoot: { order: "xyz", signX: -1, signY: -1, signZ: 1, offsetDeg: { x: 5, y: 0, z: 0 } },
};

const DEFAULT_AXIS_FIX_RULE: AiBoneAxisFixRule = {
  order: "xyz",
  signX: -1,
  signY: 1,
  signZ: -1,
  offsetDeg: ZERO_VEC3,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeAngleDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  let wrapped = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (Object.is(wrapped, -0)) wrapped = 0;
  return Number(wrapped.toFixed(4));
}

function permuteAxes(v: Vec3, order: AxisPermutationOrder = "xyz"): Vec3 {
  switch (order) {
    case "xzy": return { x: v.x, y: v.z, z: v.y };
    case "yxz": return { x: v.y, y: v.x, z: v.z };
    case "yzx": return { x: v.y, y: v.z, z: v.x };
    case "zxy": return { x: v.z, y: v.x, z: v.y };
    case "zyx": return { x: v.z, y: v.y, z: v.x };
    case "xyz":
    default: return v;
  }
}

function applyAxisFixRule(rawEulerDeg: Vec3, rule: AiBoneAxisFixRule): Vec3 {
  const permuted = permuteAxes(rawEulerDeg, rule.order ?? "xyz");
  let x = normalizeAngleDeg(permuted.x * rule.signX + rule.offsetDeg.x);
  let y = normalizeAngleDeg(permuted.y * rule.signY + rule.offsetDeg.y);
  let z = normalizeAngleDeg(permuted.z * rule.signZ + rule.offsetDeg.z);

  if (rule.minDeg && rule.maxDeg) {
    x = clamp(x, rule.minDeg.x, rule.maxDeg.x);
    y = clamp(y, rule.minDeg.y, rule.maxDeg.y);
    z = clamp(z, rule.minDeg.z, rule.maxDeg.z);
  }
  return { x, y, z };
}

/** SHAPER `BoneAIManager.fixBoneAngles` 대응 함수 */
export function fixBoneAngles(
  boneName: string,
  rawEulerDeg: Vec3,
  customRules?: Readonly<Record<string, AiBoneAxisFixRule>>,
): Vec3 {
  const rule = customRules?.[boneName] ?? aiBoneAxisFix[boneName] ?? DEFAULT_AXIS_FIX_RULE;
  return applyAxisFixRule(rawEulerDeg, rule);
}

/** SHAPER `BoneAIManager.fixLHandBoneAngles` 대응 왼손 전용 축 보정 및 과신전 제한 */
export function fixLHandBoneAngles(boneName: string, rawEulerDeg: Vec3): Vec3 {
  const lower = boneName.toLowerCase();
  const isWrist = lower.includes("wrist") || lower.endsWith("hand") || lower === "lefthand" || lower === "hand_l";
  if (isWrist) {
    return applyAxisFixRule(rawEulerDeg, {
      order: "xyz", signX: 1, signY: -1, signZ: -1, offsetDeg: ZERO_VEC3,
      minDeg: { x: -75, y: -45, z: -65 }, maxDeg: { x: 75, y: 45, z: 65 },
    });
  }
  const isThumb = lower.includes("thumb");
  return applyAxisFixRule(rawEulerDeg, {
    order: "xyz", signX: 1, signY: -1, signZ: -1,
    offsetDeg: isThumb ? { x: 5, y: -8, z: 0 } : ZERO_VEC3,
    minDeg: isThumb ? { x: -25, y: -45, z: -20 } : { x: -10, y: -25, z: -15 },
    maxDeg: isThumb ? { x: 85, y: 45, z: 75 } : { x: 105, y: 25, z: 95 },
  });
}

/** SHAPER `BoneAIManager.fixRHandBoneAngles` 대응 오른손 전용 대칭 축 보정 및 과신전 제한 */
export function fixRHandBoneAngles(boneName: string, rawEulerDeg: Vec3): Vec3 {
  const lower = boneName.toLowerCase();
  const isWrist = lower.includes("wrist") || lower.endsWith("hand") || lower === "righthand" || lower === "hand_r";
  if (isWrist) {
    return applyAxisFixRule(rawEulerDeg, {
      order: "xyz", signX: 1, signY: 1, signZ: 1, offsetDeg: ZERO_VEC3,
      minDeg: { x: -75, y: -45, z: -65 }, maxDeg: { x: 75, y: 45, z: 65 },
    });
  }
  const isThumb = lower.includes("thumb");
  return applyAxisFixRule(rawEulerDeg, {
    order: "xyz", signX: 1, signY: 1, signZ: 1,
    offsetDeg: isThumb ? { x: 5, y: 8, z: 0 } : ZERO_VEC3,
    minDeg: isThumb ? { x: -25, y: -45, z: -75 } : { x: -10, y: -25, z: -95 },
    maxDeg: isThumb ? { x: 85, y: 45, z: 20 } : { x: 105, y: 25, z: 15 },
  });
}

export function eulerDegToQuat(eulerDeg: Vec3): Quat {
  const degToRad = Math.PI / 180;
  const hx = eulerDeg.x * degToRad * 0.5;
  const hy = eulerDeg.y * degToRad * 0.5;
  const hz = eulerDeg.z * degToRad * 0.5;
  const cx = Math.cos(hx), sx = Math.sin(hx);
  const cy = Math.cos(hy), sy = Math.sin(hy);
  const cz = Math.cos(hz), sz = Math.sin(hz);
  const x = sx * cy * cz - cx * sy * sz;
  const y = cx * sy * cz + sx * cy * sz;
  const z = cx * cy * sz - sx * sy * cz;
  const w = cx * cy * cz + sx * sy * sz;
  const norm = Math.hypot(x, y, z, w) || 1;
  return {
    x: Number((x / norm).toFixed(6)),
    y: Number((y / norm).toFixed(6)),
    z: Number((z / norm).toFixed(6)),
    w: Number((w / norm).toFixed(6)),
  };
}

export function quatToEulerDeg(q: Quat): Vec3 {
  const radToDeg = 180 / Math.PI;
  const x = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y)) * radToDeg;
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const y = (Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : Math.asin(sinp) * radToDeg);
  const z = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)) * radToDeg;
  return { x: normalizeAngleDeg(x), y: normalizeAngleDeg(y), z: normalizeAngleDeg(z) };
}

function lerpAngleDeg(fromDeg: number, toDeg: number, t: number): number {
  const delta = normalizeAngleDeg(toDeg - fromDeg);
  return normalizeAngleDeg(fromDeg + delta * clamp(t, 0, 1));
}

function blendEulerDeg(fallbackDeg: Vec3, aiDeg: Vec3, aiWeight: number): Vec3 {
  const w = clamp(aiWeight, 0, 1);
  return {
    x: lerpAngleDeg(fallbackDeg.x, aiDeg.x, w),
    y: lerpAngleDeg(fallbackDeg.y, aiDeg.y, w),
    z: lerpAngleDeg(fallbackDeg.z, aiDeg.z, w),
  };
}

function deriveEulerFromKeypoints(boneSet: AIBoneSet, index: number): Vec3 {
  const current = boneSet.keypoints[index] ?? ZERO_VEC3;
  const parentIndex = boneSet.parents[index] ?? -1;
  if (parentIndex < 0 || parentIndex >= boneSet.keypoints.length) return ZERO_VEC3;
  const parent = boneSet.keypoints[parentIndex] ?? ZERO_VEC3;
  const dx = current.x - parent.x, dy = current.y - parent.y, dz = current.z - parent.z;
  if (Math.hypot(dx, dy, dz) < 1e-6) return ZERO_VEC3;
  const radToDeg = 180 / Math.PI;
  return {
    x: normalizeAngleDeg(Math.atan2(dz, Math.hypot(dx, dy)) * radToDeg),
    y: 0,
    z: normalizeAngleDeg(Math.atan2(dx, -dy) * radToDeg),
  };
}

export interface ConvertedBoneTransform {
  readonly name: string;
  readonly parentIndex: number;
  readonly parentName: string | null;
  readonly keypoint: Vec3;
  readonly position: Vec3;
  readonly rawEulerDeg: Vec3;
  readonly fixedEulerDeg: Vec3;
  readonly finalEulerDeg: Vec3;
  readonly rotation: Quat;
  readonly uncertainty: number;
  readonly confidence: number;
  readonly aiBlendWeight: number;
  readonly filteredByUncertainty: boolean;
}

export interface ConvertAiBoneSetOptions {
  readonly poseType?: ShaperAiPoseType;
  readonly uncertaintyThreshold?: number;
  readonly fallbackAnglesDeg?: Readonly<Record<string, Vec3>>;
  readonly fallbackPositions?: Readonly<Record<string, Vec3>>;
  readonly customAxisFixRules?: Readonly<Record<string, AiBoneAxisFixRule>>;
  readonly handSide?: "left" | "right";
}

export interface ConvertedCharacterPose {
  readonly poseType: ShaperAiPoseType;
  readonly uncertaintyThreshold: number;
  readonly bones: readonly ConvertedBoneTransform[];
  readonly boneMap: Readonly<Record<string, ConvertedBoneTransform>>;
  readonly filteredBoneCount: number;
  readonly averageConfidence: number;
}

/**
 * `AIBoneSet`을 캐릭터 리그 회전·위치 포즈로 변환한다.
 * 불확실성(`uncertainties[i]`)이 임계값(`uncertaintyThreshold`)을 초과하는 관절은
 * 기형적 관절 꺾임을 막기 위해 기본 안정 포즈(T/A-pose 또는 이전 프레임 값)와 신뢰도 가중 블렌딩한다.
 */
export function convertAiBoneSetToCharacterPose(
  boneSet: AIBoneSet,
  options: ConvertAiBoneSetOptions = {},
): ConvertedCharacterPose {
  const poseType: ShaperAiPoseType = options.poseType ?? "body";
  const defaultThreshold = SHAPER_AI_POSE_TYPE_META[poseType].defaultUncertaintyThreshold;
  const uncertaintyThreshold = clamp(options.uncertaintyThreshold ?? defaultThreshold, 0.05, 0.95);

  const count = boneSet.names.length;
  const bones: ConvertedBoneTransform[] = [];
  const boneMap: Record<string, ConvertedBoneTransform> = {};
  let filteredBoneCount = 0;
  let confidenceSum = 0;

  for (let i = 0; i < count; i += 1) {
    const name = boneSet.names[i] ?? `bone_${i}`;
    const parentIndex = boneSet.parents[i] ?? -1;
    const parentName =
      parentIndex >= 0 && parentIndex < boneSet.names.length ? (boneSet.names[parentIndex] ?? null) : null;
    const keypoint = boneSet.keypoints[i] ?? ZERO_VEC3;
    const rawPosition = boneSet.convertPositions?.[i] ?? keypoint;

    const rawEulerDeg =
      boneSet.convertAngles?.[i] ??
      (boneSet.convertRotations?.[i] ? quatToEulerDeg(boneSet.convertRotations[i]!) : deriveEulerFromKeypoints(boneSet, i));

    const fixedEulerDeg =
      options.handSide === "left"
        ? fixLHandBoneAngles(name, rawEulerDeg)
        : options.handSide === "right"
          ? fixRHandBoneAngles(name, rawEulerDeg)
          : fixBoneAngles(name, rawEulerDeg, options.customAxisFixRules);

    const uncertainty = clamp(boneSet.uncertainties[i] ?? 0, 0, 1);
    const confidence = Number((1 - uncertainty).toFixed(4));
    confidenceSum += confidence;

    const filteredByUncertainty = uncertainty > uncertaintyThreshold;
    if (filteredByUncertainty) filteredBoneCount += 1;

    const aiBlendWeight = filteredByUncertainty
      ? Number(clamp(1 - (uncertainty - uncertaintyThreshold) / Math.max(1 - uncertaintyThreshold, 1e-6), 0, 1).toFixed(4))
      : 1;

    const fallbackAngle = options.fallbackAnglesDeg?.[name] ?? ZERO_VEC3;
    const finalEulerDeg = filteredByUncertainty
      ? blendEulerDeg(fallbackAngle, fixedEulerDeg, aiBlendWeight)
      : fixedEulerDeg;

    const fallbackPos = options.fallbackPositions?.[name] ?? rawPosition;
    const position: Vec3 = filteredByUncertainty
      ? {
          x: Number((fallbackPos.x + (rawPosition.x - fallbackPos.x) * aiBlendWeight).toFixed(4)),
          y: Number((fallbackPos.y + (rawPosition.y - fallbackPos.y) * aiBlendWeight).toFixed(4)),
          z: Number((fallbackPos.z + (rawPosition.z - fallbackPos.z) * aiBlendWeight).toFixed(4)),
        }
      : rawPosition;

    const transform: ConvertedBoneTransform = {
      name,
      parentIndex,
      parentName,
      keypoint,
      position,
      rawEulerDeg,
      fixedEulerDeg,
      finalEulerDeg,
      rotation: eulerDegToQuat(finalEulerDeg),
      uncertainty,
      confidence,
      aiBlendWeight,
      filteredByUncertainty,
    };
    bones.push(transform);
    boneMap[name] = transform;
  }

  return {
    poseType,
    uncertaintyThreshold,
    bones,
    boneMap,
    filteredBoneCount,
    averageConfidence: count > 0 ? Number((confidenceSum / count).toFixed(4)) : 1,
  };
}

export interface ConvertAiHandsOptions {
  readonly poseType?: "hand" | "handWebCam";
  readonly uncertaintyThreshold?: number;
  readonly fallbackLeftAnglesDeg?: Readonly<Record<string, Vec3>>;
  readonly fallbackRightAnglesDeg?: Readonly<Record<string, Vec3>>;
}

export interface ConvertedHandsPose {
  readonly poseType: "hand" | "handWebCam";
  readonly left: ConvertedCharacterPose | null;
  readonly right: ConvertedCharacterPose | null;
  readonly totalFilteredBoneCount: number;
  readonly averageConfidence: number;
}

/** `AIHandsBoneSet` 양손 데이터를 좌·우 손 전용 축 보정과 불확실성 필터링을 거쳐 변환한다. */
export function convertAiHandsBoneSetToHandPose(
  handsBoneSet: AIHandsBoneSet,
  options: ConvertAiHandsOptions = {},
): ConvertedHandsPose {
  const poseType = options.poseType ?? "hand";
  const left = handsBoneSet.left
    ? convertAiBoneSetToCharacterPose(handsBoneSet.left, {
        poseType,
        uncertaintyThreshold: options.uncertaintyThreshold,
        fallbackAnglesDeg: options.fallbackLeftAnglesDeg,
        handSide: "left",
      })
    : null;
  const right = handsBoneSet.right
    ? convertAiBoneSetToCharacterPose(handsBoneSet.right, {
        poseType,
        uncertaintyThreshold: options.uncertaintyThreshold,
        fallbackAnglesDeg: options.fallbackRightAnglesDeg,
        handSide: "right",
      })
    : null;

  const handResults = [left, right].filter((item): item is ConvertedCharacterPose => item !== null);
  const averageConfidence =
    handResults.length > 0
      ? Number((handResults.reduce((acc, item) => acc + item.averageConfidence, 0) / handResults.length).toFixed(4))
      : 1;

  return {
    poseType,
    left,
    right,
    totalFilteredBoneCount: (left?.filteredBoneCount ?? 0) + (right?.filteredBoneCount ?? 0),
    averageConfidence,
  };
}

export type ShaperPreviewBodyRegion = "spine" | "leftLeg" | "rightLeg" | "leftArm" | "rightArm" | "head";

/** SHAPER `BoneAIManager` 부위별 프리뷰 머티리얼 컬러 코드 */
export const SHAPER_PREVIEW_REGION_COLORS: Readonly<Record<ShaperPreviewBodyRegion, string>> = {
  spine: "#38bdf8",
  leftLeg: "#34d399",
  rightLeg: "#10b981",
  leftArm: "#f59e0b",
  rightArm: "#f97316",
  head: "#a78bfa",
};

export function classifyShaperBonePreviewRegion(boneName: string): ShaperPreviewBodyRegion {
  const lower = boneName.toLowerCase();
  if (lower.includes("head") || lower.includes("neck") || lower.includes("eye") || lower.includes("jaw")) {
    return "head";
  }
  const isRight = lower.startsWith("right") || lower.startsWith("r_") || lower.endsWith("_r");
  const isLeg =
    lower.includes("leg") || lower.includes("thigh") || lower.includes("calf") ||
    lower.includes("knee") || lower.includes("foot") || lower.includes("ankle") || lower.includes("toe");
  if (isLeg) return isRight ? "rightLeg" : "leftLeg";

  const isArm =
    lower.includes("shoulder") || lower.includes("clavicle") || lower.includes("arm") ||
    lower.includes("elbow") || lower.includes("hand") || lower.includes("wrist") ||
    lower.includes("thumb") || lower.includes("index") || lower.includes("middle") ||
    lower.includes("ring") || lower.includes("little") || lower.includes("pinky");
  if (isArm) return isRight ? "rightArm" : "leftArm";
  return "spine";
}

export interface ShaperPreviewBoneSegment {
  readonly boneName: string;
  readonly parentBoneName: string;
  readonly region: ShaperPreviewBodyRegion;
  readonly colorHex: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly length: number;
  readonly confidence: number;
  readonly isLowConfidence: boolean;
}

export interface ShaperPreviewJointNode {
  readonly boneName: string;
  readonly region: ShaperPreviewBodyRegion;
  readonly colorHex: string;
  readonly position: Vec3;
  readonly confidence: number;
  readonly isLowConfidence: boolean;
}

export interface ShaperPreviewDummySkeleton {
  readonly segments: readonly ShaperPreviewBoneSegment[];
  readonly joints: readonly ShaperPreviewJointNode[];
  readonly regionCounts: Readonly<Record<ShaperPreviewBodyRegion, number>>;
  readonly lowConfidenceSegmentCount: number;
}

/** SHAPER `BoneAIManager`의 프리뷰 더미 본 세그먼트를 생성한다. */
export function buildAiPreviewDummySkeleton(
  boneSet: AIBoneSet,
  options: { readonly uncertaintyThreshold?: number } = {},
): ShaperPreviewDummySkeleton {
  const uncertaintyThreshold = clamp(options.uncertaintyThreshold ?? 0.45, 0.05, 0.95);
  const segments: ShaperPreviewBoneSegment[] = [];
  const joints: ShaperPreviewJointNode[] = [];
  const regionCounts: Record<ShaperPreviewBodyRegion, number> = {
    spine: 0, leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0, head: 0,
  };
  let lowConfidenceSegmentCount = 0;

  for (let i = 0; i < boneSet.names.length; i += 1) {
    const boneName = boneSet.names[i] ?? `bone_${i}`;
    const region = classifyShaperBonePreviewRegion(boneName);
    const colorHex = SHAPER_PREVIEW_REGION_COLORS[region];
    const end = boneSet.keypoints[i] ?? ZERO_VEC3;
    const uncertainty = clamp(boneSet.uncertainties[i] ?? 0, 0, 1);

    joints.push({
      boneName,
      region,
      colorHex,
      position: end,
      confidence: Number((1 - uncertainty).toFixed(4)),
      isLowConfidence: uncertainty > uncertaintyThreshold,
    });

    const parentIndex = boneSet.parents[i] ?? -1;
    if (parentIndex >= 0 && parentIndex < boneSet.keypoints.length) {
      const parentBoneName = boneSet.names[parentIndex] ?? `bone_${parentIndex}`;
      const start = boneSet.keypoints[parentIndex] ?? ZERO_VEC3;
      const parentUncertainty = clamp(boneSet.uncertainties[parentIndex] ?? 0, 0, 1);
      const length = Number(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z).toFixed(4));
      const isLowConfidence = Math.max(uncertainty, parentUncertainty) > uncertaintyThreshold;
      if (isLowConfidence) lowConfidenceSegmentCount += 1;
      regionCounts[region] += 1;
      segments.push({
        boneName,
        parentBoneName,
        region,
        colorHex,
        start,
        end,
        length,
        confidence: Number((1 - (uncertainty + parentUncertainty) * 0.5).toFixed(4)),
        isLowConfidence,
      });
    }
  }

  return { segments, joints, regionCounts, lowConfidenceSegmentCount };
}

export type ShaperFacePartType = "head" | "eyes" | "nose" | "mouth" | "ears" | "hair";

export const SHAPER_FACE_PART_TYPES: readonly ShaperFacePartType[] = [
  "head", "eyes", "nose", "mouth", "ears", "hair",
] as const;

/** SHAPER `AIPresetSetItem` (0x02000012) 대응 구조체 */
export interface AIPresetSetItem {
  readonly partType: ShaperFacePartType;
  readonly id: string;
  readonly labelKo: string;
  readonly score: number;
  readonly rank: number;
  readonly reasonKo: string;
}

/** SHAPER `AIPresetSet` (0x02000011) 대응 구조체 */
export interface AIPresetSet {
  readonly poseType: "preset";
  readonly head: readonly AIPresetSetItem[];
  readonly eyes: readonly AIPresetSetItem[];
  readonly nose: readonly AIPresetSetItem[];
  readonly mouth: readonly AIPresetSetItem[];
  readonly ears: readonly AIPresetSetItem[];
  readonly hair: readonly AIPresetSetItem[];
  readonly overallConfidence: number;
}

export interface ShaperFacePhotoFeatures {
  readonly jawlineRatio: number;
  readonly faceLengthRatio?: number;
  readonly eyeSlantDeg: number;
  readonly eyeSizeRatio: number;
  readonly noseLengthRatio: number;
  readonly noseWidthRatio: number;
  readonly mouthCornerCurve: number;
  readonly lipThicknessRatio: number;
  readonly earShapeRatio: number;
  readonly hairSilhouetteRatio: number;
  readonly bangsDensityRatio: number;
}

interface PresetArchetypeSpec {
  readonly id: string;
  readonly partType: ShaperFacePartType;
  readonly labelKo: string;
  readonly primaryTarget: number;
  readonly secondaryTarget: number;
  readonly reasonTemplateKo: string;
}

const FACE_PRESET_CATALOG: readonly PresetArchetypeSpec[] = [
  { id: "head_slender_v", partType: "head", labelKo: "슬렌더 V라인 두상", primaryTarget: 0.2, secondaryTarget: 0.55, reasonTemplateKo: "갸름한 턱선과 세련된 V라인 윤곽에 최적화" },
  { id: "head_soft_round", partType: "head", labelKo: "소프트 라운드 동안 두상", primaryTarget: 0.45, secondaryTarget: 0.25, reasonTemplateKo: "부드러운 볼선과 짧은 동안형 얼굴 비율에 부합" },
  { id: "head_structured_square", partType: "head", labelKo: "스트럭처드 각진 두상", primaryTarget: 0.85, secondaryTarget: 0.7, reasonTemplateKo: "탄탄한 하관 골격과 성숙한 세로 비율에 부합" },
  { id: "eyes_feline_sharp", partType: "eyes", labelKo: "샤프 캣아이 눈매", primaryTarget: 0.8, secondaryTarget: 0.65, reasonTemplateKo: "올라간 눈꼬리와 또렷한 고양이형 눈매 각도에 일치" },
  { id: "eyes_gentle_droopy", partType: "eyes", labelKo: "젠틀 강아지 눈망울", primaryTarget: 0.2, secondaryTarget: 0.85, reasonTemplateKo: "순하게 내려간 눈꼬리와 크고 맑은 눈동자 비율에 일치" },
  { id: "eyes_calm_monolid", partType: "eyes", labelKo: "차분한 단아 무쌍 눈매", primaryTarget: 0.5, secondaryTarget: 0.25, reasonTemplateKo: "수평에 가까운 담백한 눈매와 슬림한 눈 크기에 일치" },
  { id: "nose_high_straight", partType: "nose", labelKo: "하이 브릿지 직선 코", primaryTarget: 0.8, secondaryTarget: 0.25, reasonTemplateKo: "길고 곧게 뻗은 콧대와 날렵한 콧볼 폭에 부합" },
  { id: "nose_cute_button", partType: "nose", labelKo: "버튼형 짧은 코", primaryTarget: 0.25, secondaryTarget: 0.4, reasonTemplateKo: "짧고 아담한 코 길이와 부드러운 코끝 비율에 부합" },
  { id: "nose_natural_wide", partType: "nose", labelKo: "내추럴 라운드 코", primaryTarget: 0.55, secondaryTarget: 0.8, reasonTemplateKo: "안정적인 코 길이와 볼륨감 있는 콧볼 폭에 부합" },
  { id: "mouth_bright_smile", partType: "mouth", labelKo: "애교 미소 입매", primaryTarget: 0.85, secondaryTarget: 0.65, reasonTemplateKo: "자연스럽게 올라간 입꼬리와 적당히 도톰한 입술에 부합" },
  { id: "mouth_plump_glossy", partType: "mouth", labelKo: "플럼프 볼륨 입술", primaryTarget: 0.55, secondaryTarget: 0.9, reasonTemplateKo: "풍성한 입술 두께와 또렷한 윤곽 특징량에 부합" },
  { id: "mouth_cool_thin", partType: "mouth", labelKo: "쿨 슬림 입매", primaryTarget: 0.25, secondaryTarget: 0.2, reasonTemplateKo: "차분하게 정돈된 입꼬리와 얇고 단정한 입술에 부합" },
  { id: "ears_compact_flat", partType: "ears", labelKo: "컴팩트 밀착형 귀", primaryTarget: 0.15, secondaryTarget: 0.2, reasonTemplateKo: "두상에 밀착된 작고 단정한 귀 실루엣에 부합" },
  { id: "ears_standard_round", partType: "ears", labelKo: "스탠다드 라운드 귀", primaryTarget: 0.5, secondaryTarget: 0.5, reasonTemplateKo: "균형 잡힌 표준 크기와 둥근 귓바퀴 형태에 부합" },
  { id: "ears_pointed_prominent", partType: "ears", labelKo: "포인티드 돌출형 귀", primaryTarget: 0.9, secondaryTarget: 0.85, reasonTemplateKo: "존재감 있게 드러나는 돌출·뾰족형 귀 실루엣에 부합" },
  { id: "hair_short_neat_crop", partType: "hair", labelKo: "시크 숏컷 & 오픈 포어헤드", primaryTarget: 0.15, secondaryTarget: 0.2, reasonTemplateKo: "가벼운 숏 실루엣과 이마가 드러나는 가르마 밀도에 부합" },
  { id: "hair_medium_seethrough_bob", partType: "hair", labelKo: "미디엄 시스루 레이어드 단발", primaryTarget: 0.5, secondaryTarget: 0.55, reasonTemplateKo: "중간 기장 실루엣과 자연스러운 시스루 앞머리 밀도에 부합" },
  { id: "hair_long_fullbang_wave", partType: "hair", labelKo: "롱 웨이브 & 풀뱅", primaryTarget: 0.9, secondaryTarget: 0.85, reasonTemplateKo: "풍성한 롱헤어 볼륨과 촘촘한 앞머리 밀도에 부합" },
];

function extractNormalizedPartFeaturePair(
  partType: ShaperFacePartType,
  features: ShaperFacePhotoFeatures,
): readonly [number, number] {
  switch (partType) {
    case "head": return [clamp(features.jawlineRatio, 0, 1), clamp(features.faceLengthRatio ?? 0.5, 0, 1)];
    case "eyes": return [clamp((features.eyeSlantDeg + 15) / 30, 0, 1), clamp(features.eyeSizeRatio, 0, 1)];
    case "nose": return [clamp(features.noseLengthRatio, 0, 1), clamp(features.noseWidthRatio, 0, 1)];
    case "mouth": return [clamp((features.mouthCornerCurve + 1) / 2, 0, 1), clamp(features.lipThicknessRatio, 0, 1)];
    case "ears": {
      const ear = clamp(features.earShapeRatio, 0, 1);
      return [ear, ear];
    }
    case "hair": return [clamp(features.hairSilhouetteRatio, 0, 1), clamp(features.bangsDensityRatio, 0, 1)];
  }
}

/** 인물 사진 특징량으로부터 SHAPER 6-파츠 프리셋 추천 세트(`AIPresetSet`)를 산출한다. */
export function recommendShaperFacePresetSet(
  features: ShaperFacePhotoFeatures,
  options: { readonly topKPerPart?: number } = {},
): AIPresetSet {
  const topKPerPart = Math.max(1, Math.floor(options.topKPerPart ?? 3));

  const buildPartList = (partType: ShaperFacePartType): readonly AIPresetSetItem[] => {
    const [p, s] = extractNormalizedPartFeaturePair(partType, features);
    return FACE_PRESET_CATALOG
      .filter((item) => item.partType === partType)
      .map((spec) => {
        const dist = Math.hypot((p - spec.primaryTarget) * 0.65, (s - spec.secondaryTarget) * 0.35);
        return { spec, score: Number(clamp(1 - dist, 0.05, 0.99).toFixed(4)) };
      })
      .sort((a, b) => b.score - a.score || a.spec.id.localeCompare(b.spec.id))
      .slice(0, topKPerPart)
      .map((entry, idx) => ({
        partType,
        id: entry.spec.id,
        labelKo: entry.spec.labelKo,
        score: entry.score,
        rank: idx + 1,
        reasonKo: `${entry.spec.reasonTemplateKo} (적합도 ${Math.round(entry.score * 100)}%)`,
      }));
  };

  const head = buildPartList("head");
  const eyes = buildPartList("eyes");
  const nose = buildPartList("nose");
  const mouth = buildPartList("mouth");
  const ears = buildPartList("ears");
  const hair = buildPartList("hair");

  const topScores = [head[0], eyes[0], nose[0], mouth[0], ears[0], hair[0]]
    .filter((item): item is AIPresetSetItem => Boolean(item))
    .map((item) => item.score);

  const overallConfidence =
    topScores.length > 0
      ? Number((topScores.reduce((acc, v) => acc + v, 0) / topScores.length).toFixed(4))
      : 0;

  return { poseType: "preset", head, eyes, nose, mouth, ears, hair, overallConfidence };
}

export interface ShaperRecommendedCharacterSlot {
  readonly slotIndex: number;
  readonly labelKo: string;
  readonly averageScore: number;
  readonly parts: Readonly<Record<ShaperFacePartType, AIPresetSetItem>>;
}

/** 추천된 `AIPresetSet`에서 상위 K개의 원클릭 캐릭터 6-파츠 조합 슬롯을 생성한다. */
export function composeRecommendedPresetSlots(
  presetSet: AIPresetSet,
  topK = 3,
): readonly ShaperRecommendedCharacterSlot[] {
  const maxSlots = Math.max(1, Math.floor(topK));
  const slots: ShaperRecommendedCharacterSlot[] = [];

  for (let i = 0; i < maxSlots; i += 1) {
    const pick = (items: readonly AIPresetSetItem[]): AIPresetSetItem | undefined =>
      items[Math.min(i, items.length - 1)];
    const head = pick(presetSet.head), eyes = pick(presetSet.eyes), nose = pick(presetSet.nose);
    const mouth = pick(presetSet.mouth), ears = pick(presetSet.ears), hair = pick(presetSet.hair);
    if (!head || !eyes || !nose || !mouth || !ears || !hair) break;

    const parts: Readonly<Record<ShaperFacePartType, AIPresetSetItem>> = { head, eyes, nose, mouth, ears, hair };
    const averageScore = Number(
      ((head.score + eyes.score + nose.score + mouth.score + ears.score + hair.score) / 6).toFixed(4),
    );
    slots.push({
      slotIndex: i + 1,
      labelKo: `AI 추천 프리셋 조합 #${i + 1} (${head.labelKo} · ${eyes.labelKo})`,
      averageScore,
      parts,
    });
  }
  return slots;
}
