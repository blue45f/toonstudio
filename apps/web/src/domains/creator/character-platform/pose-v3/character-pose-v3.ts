import type {
  CharacterPoseCandidateV2,
  CharacterPoseRegion,
  CharacterQuaternion,
  CharacterVector3,
} from "../pose/character-pose-v2";

export const CHARACTER_POSE_DOCUMENT_VERSION = 3 as const;

export interface CharacterPoseEffectorV3 {
  readonly id: string;
  readonly bone: string;
  readonly target: CharacterVector3;
  readonly rotation?: CharacterQuaternion;
  readonly poleTarget?: CharacterVector3;
  readonly weight: number;
  readonly pinned: boolean;
}

export interface CharacterPoseContactV3 {
  readonly id: string;
  readonly kind: "ground" | "prop" | "self" | "character" | "environment";
  readonly bone: string;
  readonly targetId?: string;
  readonly target: CharacterVector3;
  readonly normal?: CharacterVector3;
  readonly weight: number;
  readonly tolerance: number;
  readonly mode: "hard-pin" | "soft-point" | "surface-slide" | "distance" | "support";
}

export interface CharacterPoseFixedControllerV3 {
  readonly id: string;
  readonly bone: string;
  readonly lockPosition: boolean;
  readonly lockRotation: boolean;
}

export interface CharacterPoseStylizationV3 {
  readonly exaggeration: number;
  readonly silhouetteWeight: number;
  readonly preserveFootPlant: boolean;
  readonly dramaticImbalance: boolean;
}

export interface CharacterPoseSolveReceiptV3 {
  readonly solverRevision: string;
  readonly inputHash: string;
  readonly iterations: number;
  readonly converged: boolean;
  readonly maximumError: number;
  readonly centerOfMassMargin: number | null;
  readonly warnings: readonly string[];
}

export interface CharacterPoseDocumentV3 {
  readonly schemaVersion: typeof CHARACTER_POSE_DOCUMENT_VERSION;
  readonly poseId: string;
  readonly generationId: number;
  readonly source: "photo" | "webcam" | "video" | "preset" | "manual" | "ai";
  readonly root: {
    readonly position: CharacterVector3;
    readonly rotation: CharacterQuaternion;
  };
  readonly bones: Readonly<Record<string, CharacterQuaternion>>;
  readonly confidence: {
    readonly overall: number;
    readonly regions: Readonly<Partial<Record<CharacterPoseRegion, number>>>;
    readonly joints: Readonly<Record<string, number>>;
  };
  readonly effectors: readonly CharacterPoseEffectorV3[];
  readonly contacts: readonly CharacterPoseContactV3[];
  readonly fixedControllers: readonly CharacterPoseFixedControllerV3[];
  readonly regionWeights: Readonly<Partial<Record<CharacterPoseRegion, number>>>;
  readonly stylization: CharacterPoseStylizationV3;
  readonly sourceWarnings: readonly string[];
  readonly solveReceipt: CharacterPoseSolveReceiptV3 | null;
  /** Original V2 candidate can be retained during migration for byte-level audit. */
  readonly legacySource?: CharacterPoseCandidateV2;
}

export class CharacterPoseV3Error extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterPoseV3Error";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HASH = /^[a-f0-9]{8,128}$/iu;
const REGIONS: readonly CharacterPoseRegion[] = [
  "head", "torso", "left-arm", "right-arm", "left-leg", "right-leg", "left-hand", "right-hand",
];

function finiteTuple(value: readonly number[], length: number): boolean {
  return value.length === length && value.every(Number.isFinite);
}

function bounded01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function assertId(value: string, field: string): void {
  if (!ID.test(value)) throw new CharacterPoseV3Error("CHARACTER_POSE_ID_INVALID", `${field} 형식이 올바르지 않습니다.`);
}

export function validateCharacterPoseDocumentV3(
  input: CharacterPoseDocumentV3,
): CharacterPoseDocumentV3 {
  if (input.schemaVersion !== CHARACTER_POSE_DOCUMENT_VERSION) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_VERSION_UNSUPPORTED", "지원하지 않는 Pose 문서 버전입니다.");
  }
  assertId(input.poseId, "poseId");
  if (!Number.isSafeInteger(input.generationId) || input.generationId < 0) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_GENERATION_INVALID", "Pose generationId가 올바르지 않습니다.");
  }
  if (!finiteTuple(input.root.position, 3) || !finiteTuple(input.root.rotation, 4)) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_ROOT_INVALID", "Pose Root Transform이 올바르지 않습니다.");
  }
  if (!bounded01(input.confidence.overall)) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_CONFIDENCE_INVALID", "전체 신뢰도는 0~1이어야 합니다.");
  }
  for (const [region, value] of Object.entries(input.confidence.regions)) {
    if (!REGIONS.includes(region as CharacterPoseRegion) || !bounded01(Number(value))) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_CONFIDENCE_INVALID", "영역 신뢰도가 올바르지 않습니다.");
    }
  }
  for (const [bone, value] of Object.entries(input.bones)) {
    assertId(bone, "bone");
    if (!finiteTuple(value, 4)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_BONE_INVALID", `${bone} Quaternion이 올바르지 않습니다.`);
    }
  }
  for (const [bone, value] of Object.entries(input.confidence.joints)) {
    assertId(bone, "confidence.joint");
    if (!bounded01(value)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_CONFIDENCE_INVALID", `${bone} 신뢰도가 올바르지 않습니다.`);
    }
  }
  for (const [region, value] of Object.entries(input.regionWeights)) {
    if (!REGIONS.includes(region as CharacterPoseRegion) || !bounded01(Number(value))) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_REGION_WEIGHT_INVALID", "영역 가중치는 0~1이어야 합니다.");
    }
  }
  const ids = new Set<string>();
  const acceptUnique = (id: string) => {
    assertId(id, "constraint.id");
    if (ids.has(id)) throw new CharacterPoseV3Error("CHARACTER_POSE_DUPLICATE_ID", `중복 제약 ID가 있습니다: ${id}`);
    ids.add(id);
  };
  for (const effector of input.effectors) {
    acceptUnique(effector.id);
    assertId(effector.bone, "effector.bone");
    if (!finiteTuple(effector.target, 3) || !bounded01(effector.weight)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_EFFECTOR_INVALID", `${effector.id} Effector가 올바르지 않습니다.`);
    }
    if (effector.rotation && !finiteTuple(effector.rotation, 4)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_EFFECTOR_INVALID", `${effector.id} 회전이 올바르지 않습니다.`);
    }
  }
  for (const contact of input.contacts) {
    acceptUnique(contact.id);
    assertId(contact.bone, "contact.bone");
    if (!finiteTuple(contact.target, 3) || !bounded01(contact.weight)
      || !Number.isFinite(contact.tolerance) || contact.tolerance < 0) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_CONTACT_INVALID", `${contact.id} 접점이 올바르지 않습니다.`);
    }
  }
  for (const controller of input.fixedControllers) {
    acceptUnique(controller.id);
    assertId(controller.bone, "controller.bone");
  }
  if (![input.stylization.exaggeration, input.stylization.silhouetteWeight].every(bounded01)) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_STYLIZATION_INVALID", "Pose 스타일 가중치는 0~1이어야 합니다.");
  }
  if (input.solveReceipt) {
    assertId(input.solveReceipt.solverRevision, "solveReceipt.solverRevision");
    if (!HASH.test(input.solveReceipt.inputHash)
      || !Number.isSafeInteger(input.solveReceipt.iterations)
      || input.solveReceipt.iterations < 0
      || !Number.isFinite(input.solveReceipt.maximumError)
      || input.solveReceipt.maximumError < 0) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_RECEIPT_INVALID", "Pose Solve Receipt가 올바르지 않습니다.");
    }
  }
  return Object.freeze({
    ...input,
    root: Object.freeze({ ...input.root }),
    bones: Object.freeze({ ...input.bones }),
    confidence: Object.freeze({
      overall: input.confidence.overall,
      regions: Object.freeze({ ...input.confidence.regions }),
      joints: Object.freeze({ ...input.confidence.joints }),
    }),
    effectors: Object.freeze(input.effectors.map((item) => Object.freeze({ ...item }))),
    contacts: Object.freeze(input.contacts.map((item) => Object.freeze({ ...item }))),
    fixedControllers: Object.freeze(input.fixedControllers.map((item) => Object.freeze({ ...item }))),
    regionWeights: Object.freeze({ ...input.regionWeights }),
    stylization: Object.freeze({ ...input.stylization }),
    sourceWarnings: Object.freeze([...input.sourceWarnings]),
    solveReceipt: input.solveReceipt ? Object.freeze({
      ...input.solveReceipt,
      inputHash: input.solveReceipt.inputHash.toLowerCase(),
      warnings: Object.freeze([...input.solveReceipt.warnings]),
    }) : null,
  });
}

export const SHAPER_BONE_AI_24_KEYPOINTS = Object.freeze([
  "hips", "leftUpperLeg", "rightUpperLeg", "spine", "leftLowerLeg", "rightLowerLeg",
  "chest", "leftFoot", "rightFoot", "upperChest", "leftToes", "rightToes",
  "neck", "leftShoulder", "rightShoulder", "head", "leftUpperArm", "rightUpperArm",
  "leftLowerArm", "rightLowerArm", "leftHand", "rightHand", "leftThumb", "rightThumb",
] as const);

export type ShaperBoneAiFixVectorMode = 0 | 1 | 2;

export interface ShaperBoneAiConfidenceResult {
  readonly accepted: boolean;
  readonly validJointCount: number;
  readonly requiredValidJointCount: number;
  readonly uncertaintyThreshold: number;
  readonly validJoints: readonly string[];
  readonly rejectedJoints: readonly string[];
}

/**
 * `BoneAIManager::GetPosFromAI` (`0x06000097`) 명세:
 * 24개 관절의 불확실성(`uncertainty < 0.03`)을 검사하고 최소 16개 이상 통과해야 AI 포즈를 승인한다.
 */
export function evaluateShaperBoneAiConfidenceGate(
  jointUncertainties: Readonly<Record<string, number>>,
  options: { readonly uncertaintyThreshold?: number; readonly minimumValidJoints?: number } = {},
): ShaperBoneAiConfidenceResult {
  const threshold = options.uncertaintyThreshold ?? 0.03;
  const minValid = options.minimumValidJoints ?? 16;
  const validJoints: string[] = [];
  const rejectedJoints: string[] = [];

  for (const joint of SHAPER_BONE_AI_24_KEYPOINTS) {
    const u = jointUncertainties[joint];
    if (typeof u === "number" && Number.isFinite(u) && u >= 0 && u < threshold) {
      validJoints.push(joint);
    } else {
      rejectedJoints.push(joint);
    }
  }

  return {
    accepted: validJoints.length >= minValid,
    validJointCount: validJoints.length,
    requiredValidJointCount: minValid,
    uncertaintyThreshold: threshold,
    validJoints,
    rejectedJoints,
  };
}

/**
 * `BoneAIManager::ChangeFixVector` (`0x0600009d`) 명세:
 * AI 추정 본 롤(Roll) 보정 축을 `0 -> 1 -> 2 -> 0` 순서(`+90°` 단계)로 순환한다.
 */
export function cycleShaperBoneAiFixVector(currentMode: ShaperBoneAiFixVectorMode): {
  readonly nextMode: ShaperBoneAiFixVectorMode;
  readonly rollOffsetDeg: 0 | 90 | 180;
  readonly label: string;
} {
  const nextMode = ((currentMode + 1) % 3) as ShaperBoneAiFixVectorMode;
  const rollOffsetDeg = (nextMode * 90) as 0 | 90 | 180;
  const labels: Record<ShaperBoneAiFixVectorMode, string> = {
    0: "기본 축 (0°)",
    1: "+90° 롤 보정 축 (Mode 1)",
    2: "+180° 반전 보정 축 (Mode 2)",
  };
  return { nextMode, rollOffsetDeg, label: labels[nextMode] };
}

/**
 * `OrientationConstraint::UpdatePose` (`0x06000280`) 명세:
 * 단위 쿼터니언 `[0, 0, 0, 1]`과 목표 회전 `deltaQuat` 사이의 50% 구면 선형 보간(`Slerp(I, delta, 0.5)`)을 계산한다.
 */
export function solveShaperOrientationConstraintHalfSlerp(
  deltaQuat: CharacterQuaternion,
): CharacterQuaternion {
  let [x, y, z, w] = deltaQuat;
  const len = Math.hypot(x, y, z, w);
  if (len <= 1e-8) return [0, 0, 0, 1];
  x /= len; y /= len; z /= len; w /= len;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  // Half-angle quaternion between [0,0,0,1] and [x,y,z,w] is normalized [x, y, z, w + 1]
  const hw = w + 1;
  const hLen = Math.hypot(x, y, z, hw);
  if (hLen <= 1e-8) return [0, 0, 0, 1];
  return [
    Number((x / hLen).toFixed(6)),
    Number((y / hLen).toFixed(6)),
    Number((z / hLen).toFixed(6)),
    Number((hw / hLen).toFixed(6)),
  ];
}

/**
 * `BoneManager::UpdateHeight` (`0x06000105`) 명세:
 * 양쪽 발목(`leftAnkleY`, `rightAnkleY`) 중 더 낮은 발목 높이를 기준으로 지면 접지 보정량(`groundingOffsetY`)과
 * 실시간 신장(`cm`, `"신장 : N cm"`)을 산출한다.
 */
export function computeShaperGroundedBodyHeightCm(input: {
  readonly headTopY: number;
  readonly leftAnkleY: number;
  readonly rightAnkleY: number;
  readonly soleOffsetMeters?: number;
}): {
  readonly minAnkleY: number;
  readonly groundingOffsetY: number;
  readonly heightCm: number;
  readonly formattedBadge: string;
} {
  const sole = Number.isFinite(input.soleOffsetMeters) ? (input.soleOffsetMeters as number) : 0.03;
  const minAnkleY = Math.min(input.leftAnkleY, input.rightAnkleY);
  const footBottomY = minAnkleY - sole;
  const groundingOffsetY = Number((-footBottomY).toFixed(4));
  const rawSpanMeters = Math.max(0, input.headTopY - footBottomY);
  const heightCm = Math.round(rawSpanMeters * 100);
  return {
    minAnkleY: Number(minAnkleY.toFixed(4)),
    groundingOffsetY,
    heightCm,
    formattedBadge: `신장 : ${heightCm} cm`,
  };
}

/**
 * `BodyPartsManager::SetBlendShapes` (`0x060000b4`) & `CostumeManager::SetBlendShapes` (`0x06000163`) 명세:
 * 신체/목 경계는 `slider * 100`(100%), 의상(신발 `type === 3` 제외)은 메쉬 관통 방지를 위해 `slider * 90`(90%)으로 감쇠한다.
 */
export function computeShaperMuscleFatBlendShapeAttenuation(
  muscleRatio: number,
  fatRatio: number,
): {
  readonly bodyMuscleWeight: number;
  readonly bodyFatWeight: number;
  readonly costumeMuscleWeight: number;
  readonly costumeFatWeight: number;
  readonly shoeMuscleWeight: 0;
  readonly shoeFatWeight: 0;
} {
  const m = Math.min(1, Math.max(0, Number.isFinite(muscleRatio) ? muscleRatio : 0));
  const f = Math.min(1, Math.max(0, Number.isFinite(fatRatio) ? fatRatio : 0));
  return {
    bodyMuscleWeight: Number((m * 100).toFixed(2)),
    bodyFatWeight: Number((f * 100).toFixed(2)),
    costumeMuscleWeight: Number((m * 90).toFixed(2)),
    costumeFatWeight: Number((f * 90).toFixed(2)),
    shoeMuscleWeight: 0,
    shoeFatWeight: 0,
  };
}

/**
 * `HeadPartsManager::ApplyHeadPart` (`0x060001f3`) Alt-클릭 포즈 좌우 미러링 명세:
 * 대칭 이펙터 본(`left* <-> right*`)을 맞바꾸고 IK 타깃 오프셋 `(-x, y, z)` 및 `+180°` Y축 보정을 반환한다.
 */
export function mirrorShaperPoseEffectorOffset<TBone extends string>(
  bone: TBone,
  offset: CharacterVector3,
  mirrorMap: Readonly<Record<TBone, TBone>>,
): {
  readonly mirroredBone: TBone;
  readonly mirroredOffset: CharacterVector3;
  readonly ikYawOffsetDeg: 180;
} {
  const mirroredBone = mirrorMap[bone] ?? bone;
  return {
    mirroredBone,
    mirroredOffset: [
      offset[0] === 0 ? 0 : Number((-offset[0]).toFixed(4)),
      Number(offset[1].toFixed(4)),
      Number(offset[2].toFixed(4)),
    ],
    ikYawOffsetDeg: 180,
  };
}

/**
 * `BoneManager::AlignPivot` (`0x0600010c`) 다중 본 피벗 정렬 명세:
 * - IK 모드: 선택된 본들의 산술 무게중심(`1/N * Σ p_i`)에 피벗을 배치하고 `move`+`rotate` 기즈모를 동시에 활성화
 * - FK 모드: 조상 깊이(`parentDepth`)가 가장 작은 최상위 본 1개에만 피벗을 부착해 하위 본의 이중 회전을 방지
 */
export function computeShaperMultiBonePivot(
  selectedBones: readonly {
    readonly boneId: string;
    readonly position: CharacterVector3;
    readonly parentDepth: number;
  }[],
  mode: "ik" | "fk",
): {
  readonly pivotPosition: CharacterVector3;
  readonly anchorBoneId: string | null;
  readonly activeGizmos: readonly ("move" | "rotate")[];
} {
  if (selectedBones.length === 0) {
    return { pivotPosition: [0, 0, 0], anchorBoneId: null, activeGizmos: [] };
  }
  if (mode === "ik") {
    let sx = 0, sy = 0, sz = 0;
    for (const b of selectedBones) {
      sx += b.position[0];
      sy += b.position[1];
      sz += b.position[2];
    }
    const n = selectedBones.length;
    return {
      pivotPosition: [
        Number((sx / n).toFixed(6)),
        Number((sy / n).toFixed(6)),
        Number((sz / n).toFixed(6)),
      ],
      anchorBoneId: selectedBones[0]!.boneId,
      activeGizmos: ["move", "rotate"],
    };
  }
  let shallowest = selectedBones[0]!;
  for (const candidate of selectedBones) {
    if (candidate.parentDepth < shallowest.parentDepth) {
      shallowest = candidate;
    }
  }
  return {
    pivotPosition: [...shallowest.position],
    anchorBoneId: shallowest.boneId,
    activeGizmos: ["rotate"],
  };
}

/**
 * `BodyPartsManager::InitBodyPart` (`0x060000a8`) & `HighlightSkinBones` (`0x060000b1`) 명세:
 * 1차 본(`slot === 0`)은 `1.0`, 2차 본(`slot === 1`)은 `4 * w1^2` 증폭 가중치를 부여하고
 * 선택 본 `(1, 1 - w, 1 - w)` / 호버 본 `(1, 1 - 0.4w, 1 - 0.4w)` 정점 히트맵 색상을 계산한다.
 */
export function computeShaperBoneWeightHighlightColor(input: {
  readonly slot: 0 | 1;
  readonly secondaryWeight1?: number;
  readonly state: "selected" | "hovered";
}): {
  readonly amplifiedWeight: number;
  readonly rgb: CharacterVector3;
} {
  const rawW1 = Math.min(1, Math.max(0, input.secondaryWeight1 ?? 0));
  const amplifiedWeight = input.slot === 0 ? 1 : Number(Math.min(1, 4 * rawW1 * rawW1).toFixed(6));
  const attenuation = input.state === "selected" ? amplifiedWeight : 0.4 * amplifiedWeight;
  const gb = Number((1 - attenuation).toFixed(6));
  return {
    amplifiedWeight,
    rgb: [1, gb, gb],
  };
}

