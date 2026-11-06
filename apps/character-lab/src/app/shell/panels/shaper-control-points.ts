/**
 * SHAPER 0.5.563 (`ControlPoint 0x02000023`, `MeshData.SetVerticesPosFromControlPoints 0x0600025a`,
 * `HeadPartsManager 0x02000038`, `BodyPartsManager 0x0200000c`, `BoneManager 0x02000019`, `PivotManager 0x02000050`)
 * 역공학 근거를 바탕으로 구현한 3D 뷰포트 직접 성형 제어점(ControlPoint) 및 기즈모 모드(Q/W/E/R IK·스케일) 모듈.
 */
import { SPINE_IK_CHAIN, solveChainIk } from "../../../animation/fabrik";
import { solveIkGoal } from "../../../animation/ik-apply";
import { BODY_PARAM_LABELS_KO, FACE_PARAM_LABELS_KO, clampParam, failVisible } from "../../../contracts";
import { projectToPixel, unprojectToViewPlane } from "../../../render/viewport-math";
import { qRotateVec3, v3Add, v3IsFinite, type Vec3 } from "../../../shared/math";

import { applySymmetryToPose, resolveDragPivotWithMode } from "./shaper-bone-gizmo";
import {
  classifySkeletonBoundaryError,
  isFinitePixelPair,
  reportBoundaryFailure,
  safeComputeWorldTransforms,
  type SkeletonBoundaryOptions,
} from "./skeleton-boundary-guard";
import { clampShaperGizmoDelta, computeJointDrag } from "./viewport-interactions";

import type { ShaperPivotMode } from "./shaper-bone-gizmo";
import type { BodyParamKey, FaceParamKey, HumanoidBoneName, IkChainId, LabFailure, ParamValues, Pose, SkeletonData } from "../../../contracts";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";

export {
  SHAPER_BUILTIN_ARCHETYPE_PRESETS,
  SHAPER_BUILTIN_PART_PRESETS,
  SHAPER_BUILTIN_POSE_PRESETS,
  buildShaperPresetCommands,
} from "./shaper-builtin-presets";
export type { ShaperArchetypePreset } from "./shaper-builtin-presets";

// ---------------------------------------------------------------------------
// 1. SHAPER PivotManager (0x02000050) 기즈모 모드 정의 (0:Q 선택, 1:W IK이동, 2:E 회전, 3:R 스케일)
// ---------------------------------------------------------------------------

export type ShaperGizmoMode = 0 | 1 | 2 | 3;

export interface ShaperGizmoModeDescriptor {
  readonly mode: ShaperGizmoMode;
  readonly shortcutKey: "Q" | "W" | "E" | "R";
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly tooltipKo: string;
}

export const SHAPER_GIZMO_MODES: readonly ShaperGizmoModeDescriptor[] = [
  {
    mode: 0,
    shortcutKey: "Q",
    labelKo: "선택 모드 (Q)",
    shortLabelKo: "Q 선택",
    tooltipKo: "관절이나 제어점을 회전시키지 않고 선택만 확인합니다 [단축키 Q]",
  },
  {
    mode: 1,
    shortcutKey: "W",
    labelKo: "IK 이동 모드 (W)",
    shortLabelKo: "W IK이동",
    tooltipKo: "손·발·머리 관절을 끌면 사지 2-Bone IK 및 척추 FABRIK IK로 목표 위치를 추적합니다 [단축키 W]",
  },
  {
    mode: 2,
    shortcutKey: "E",
    labelKo: "FK 회전 모드 (E)",
    shortLabelKo: "E 회전",
    tooltipKo: "관절 핸들을 시선 평면 둘레로 회전시킵니다 (SHAPER 기본 관절 회전) [단축키 E]",
  },
  {
    mode: 3,
    shortcutKey: "R",
    labelKo: "체형 스케일 모드 (R)",
    shortLabelKo: "R 스케일",
    tooltipKo: "SHAPER BoneManager.SetBoneScaleByPivot: 관절을 끌어 해당 부위 체형 비율을 즉시 조절합니다 [단축키 R]",
  },
] as const;

// ---------------------------------------------------------------------------
// 2. SHAPER ControlPoint (0x02000023) 3D 뷰포트 직접 성형 제어점
// ---------------------------------------------------------------------------

export type ShaperControlPointId =
  | "cp-face-jaw"
  | "cp-face-chin"
  | "cp-face-cheek"
  | "cp-face-forehead"
  | "cp-face-eyes"
  | "cp-face-eyetilt"
  | "cp-face-nose"
  | "cp-face-mouth"
  | "cp-face-ears"
  | "cp-body-shoulders"
  | "cp-body-chest"
  | "cp-body-waist"
  | "cp-body-hips";

export interface ShaperControlPointAxisBinding {
  readonly group: "face" | "body";
  readonly key: FaceParamKey | BodyParamKey;
  readonly sensitivity: number;
}

export interface ShaperControlPointSpec {
  readonly id: ShaperControlPointId;
  readonly labelKo: string;
  readonly category: "face" | "body";
  readonly anchorBone: HumanoidBoneName;
  readonly localOffset: Vec3;
  readonly horizontal?: ShaperControlPointAxisBinding;
  readonly vertical?: ShaperControlPointAxisBinding;
}

export interface ShaperProjectedControlPoint extends ShaperControlPointSpec {
  readonly world: Vec3;
  readonly screen: readonly [number, number];
}

export const SHAPER_CONTROL_POINT_SPECS: readonly ShaperControlPointSpec[] = [
  {
    id: "cp-face-jaw",
    labelKo: "턱선·얼굴 윤곽 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0.095, -0.045, 0.085],
    horizontal: { group: "face", key: "jawWidth", sensitivity: 1.4 },
    vertical: { group: "face", key: "faceShape", sensitivity: 1.2 },
  },
  {
    id: "cp-face-chin",
    labelKo: "턱끝 길이·폭 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0, -0.095, 0.115],
    horizontal: { group: "face", key: "jawWidth", sensitivity: 1.1 },
    vertical: { group: "face", key: "chinLength", sensitivity: -1.4 },
  },
  {
    id: "cp-face-cheek",
    labelKo: "볼 볼륨·광대 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [-0.09, -0.005, 0.1],
    horizontal: { group: "face", key: "cheekVolume", sensitivity: -1.4 },
    vertical: { group: "face", key: "faceShape", sensitivity: 1.1 },
  },
  {
    id: "cp-face-forehead",
    labelKo: "이마 볼륨 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0, 0.115, 0.105],
    vertical: { group: "face", key: "forehead", sensitivity: 1.4 },
  },
  {
    id: "cp-face-eyes",
    labelKo: "눈 간격·크기 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0.052, 0.038, 0.115],
    horizontal: { group: "face", key: "eyeSpacing", sensitivity: 1.4 },
    vertical: { group: "face", key: "eyeSize", sensitivity: 1.4 },
  },
  {
    id: "cp-face-eyetilt",
    labelKo: "눈매 기울기·크기 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [-0.052, 0.038, 0.115],
    horizontal: { group: "face", key: "eyeSize", sensitivity: -1.2 },
    vertical: { group: "face", key: "eyeTilt", sensitivity: 1.5 },
  },
  {
    id: "cp-face-nose",
    labelKo: "코 너비·높이 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0, 0.005, 0.135],
    horizontal: { group: "face", key: "noseWidth", sensitivity: 1.4 },
    vertical: { group: "face", key: "noseHeight", sensitivity: 1.4 },
  },
  {
    id: "cp-face-mouth",
    labelKo: "입 너비·입술 두께 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0, -0.052, 0.122],
    horizontal: { group: "face", key: "mouthWidth", sensitivity: 1.4 },
    vertical: { group: "face", key: "lipFullness", sensitivity: 1.4 },
  },
  {
    id: "cp-face-ears",
    labelKo: "귀 크기·각도 제어점",
    category: "face",
    anchorBone: "head",
    localOffset: [0.118, 0.02, 0.01],
    horizontal: { group: "face", key: "earSize", sensitivity: 1.5 },
    vertical: { group: "face", key: "earAngle", sensitivity: 1.5 },
  },
  {
    id: "cp-body-shoulders",
    labelKo: "어깨 너비·팔 길이 제어점",
    category: "body",
    anchorBone: "upperChest",
    localOffset: [0.175, 0.04, 0.02],
    horizontal: { group: "body", key: "shoulderWidth", sensitivity: 1.5 },
    vertical: { group: "body", key: "armLength", sensitivity: -1.3 },
  },
  {
    id: "cp-body-chest",
    labelKo: "가슴 두께·머리 비율 제어점",
    category: "body",
    anchorBone: "chest",
    localOffset: [0, 0.04, 0.12],
    horizontal: { group: "body", key: "chestDepth", sensitivity: 1.5 },
    vertical: { group: "body", key: "headSize", sensitivity: 1.3 },
  },
  {
    id: "cp-body-waist",
    labelKo: "허리 둘레·목 길이 제어점",
    category: "body",
    anchorBone: "spine",
    localOffset: [0.13, 0.01, 0.08],
    horizontal: { group: "body", key: "waist", sensitivity: 1.5 },
    vertical: { group: "body", key: "neckLength", sensitivity: 1.3 },
  },
  {
    id: "cp-body-hips",
    labelKo: "골반 너비·다리 길이 제어점",
    category: "body",
    anchorBone: "hips",
    localOffset: [0.155, -0.02, 0.06],
    horizontal: { group: "body", key: "hip", sensitivity: 1.5 },
    vertical: { group: "body", key: "legLength", sensitivity: -1.4 },
  },
] as const;

export function computeShaperControlPoints(
  skeleton: SkeletonData,
  pose: Pose,
  camera: ViewportCameraInfo,
  options?: SkeletonBoundaryOptions,
): readonly ShaperProjectedControlPoint[] {
  const fkResult = safeComputeWorldTransforms(skeleton, pose, options);
  if (!fkResult.ok) return [];
  const { transforms } = fkResult;
  const projected: ShaperProjectedControlPoint[] = [];
  for (const spec of SHAPER_CONTROL_POINT_SPECS) {
    const anchor = transforms.get(spec.anchorBone);
    if (!anchor || !v3IsFinite(anchor.position)) continue;
    const world = v3Add(anchor.position, qRotateVec3(anchor.rotation, spec.localOffset));
    if (!v3IsFinite(world)) continue;
    const screen = projectToPixel(camera, world);
    if (!isFinitePixelPair(screen)) continue;
    projected.push({ ...spec, world, screen });
  }
  return projected;
}

export interface ShaperControlPointParamChange {
  readonly group: "face" | "body";
  readonly key: FaceParamKey | BodyParamKey;
  readonly value: number;
  readonly labelKo: string;
}

export interface ShaperControlPointDragOutcome {
  readonly controlPointId: ShaperControlPointId;
  readonly nextFace: ParamValues<FaceParamKey>;
  readonly nextBody: ParamValues<BodyParamKey>;
  readonly changes: readonly ShaperControlPointParamChange[];
  readonly summaryKo: string;
}

function paramLabelKo(group: "face" | "body", key: FaceParamKey | BodyParamKey): string {
  if (group === "face") return FACE_PARAM_LABELS_KO[key as FaceParamKey] ?? key;
  return BODY_PARAM_LABELS_KO[key as BodyParamKey] ?? key;
}

export function computeShaperControlPointDrag(input: {
  readonly controlPoint: ShaperControlPointSpec;
  readonly startPixel: readonly [number, number];
  readonly currentPixel: readonly [number, number];
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly baseFace: ParamValues<FaceParamKey>;
  readonly baseBody: ParamValues<BodyParamKey>;
}): ShaperControlPointDragOutcome {
  const validPixels = isFinitePixelPair(input.startPixel) && isFinitePixelPair(input.currentPixel);
  const validSize =
    Number.isFinite(input.renderWidth) &&
    input.renderWidth > 0 &&
    Number.isFinite(input.renderHeight) &&
    input.renderHeight > 0;
  let normDx = 0;
  let normDy = 0;
  if (validPixels && validSize) {
    const spanX = Math.max(120, input.renderWidth * 0.22);
    const spanY = Math.max(120, input.renderHeight * 0.22);
    const rawDx = (input.currentPixel[0] - input.startPixel[0]) / spanX;
    const rawDy = (input.startPixel[1] - input.currentPixel[1]) / spanY;
    normDx = Number.isFinite(rawDx) ? clampShaperGizmoDelta(rawDx, 1.5) : 0;
    normDy = Number.isFinite(rawDy) ? clampShaperGizmoDelta(rawDy, 1.5) : 0;
  }

  const nextFace: Record<string, number> = { ...input.baseFace };
  const nextBody: Record<string, number> = { ...input.baseBody };
  const changeMap = new Map<string, ShaperControlPointParamChange>();

  const applyAxis = (binding: ShaperControlPointAxisBinding | undefined, deltaNorm: number): void => {
    if (!binding || !Number.isFinite(deltaNorm) || Math.abs(deltaNorm) < 1e-4) return;
    const rawBase = binding.group === "face" ? nextFace[binding.key] : nextBody[binding.key];
    const currentBase = typeof rawBase === "number" && Number.isFinite(rawBase) ? rawBase : 0;
    const nextVal = Number(clampParam(currentBase + deltaNorm * binding.sensitivity).toFixed(3));
    if (binding.group === "face") nextFace[binding.key] = nextVal;
    else nextBody[binding.key] = nextVal;
    const labelKo = paramLabelKo(binding.group, binding.key);
    changeMap.set(`${binding.group}:${binding.key}`, { group: binding.group, key: binding.key, value: nextVal, labelKo });
  };

  applyAxis(input.controlPoint.horizontal, normDx);
  applyAxis(input.controlPoint.vertical, normDy);

  const changes = Array.from(changeMap.values());
  const summaryKo =
    changes.length > 0
      ? `${input.controlPoint.labelKo}: ${changes.map((c) => `${c.labelKo} ${c.value >= 0 ? `+${c.value.toFixed(2)}` : c.value.toFixed(2)}`).join(" · ")}`
      : `${input.controlPoint.labelKo} 조작 중`;

  return {
    controlPointId: input.controlPoint.id,
    nextFace: nextFace as ParamValues<FaceParamKey>,
    nextBody: nextBody as ParamValues<BodyParamKey>,
    changes,
    summaryKo,
  };
}

// ---------------------------------------------------------------------------
// 3. SHAPER BoneManager / PivotManager 기즈모 모드 W (IK 이동) & R (체형 스케일)
// ---------------------------------------------------------------------------

const BONE_TO_IK_CHAIN: Readonly<Partial<Record<HumanoidBoneName, IkChainId>>> = {
  leftHand: "leftArm",
  leftLowerArm: "leftArm",
  rightHand: "rightArm",
  rightLowerArm: "rightArm",
  leftFoot: "leftLeg",
  leftLowerLeg: "leftLeg",
  rightFoot: "rightLeg",
  rightLowerLeg: "rightLeg",
};

export interface ShaperIkDragOutcome {
  readonly pose: Pose;
  readonly targetWorld: Vec3;
  readonly labelKo: string;
  readonly reasonKo?: string;
}

export function computeShaperIkHandleDrag(input: {
  readonly skeleton: SkeletonData;
  readonly startPose: Pose;
  readonly handleBone: HumanoidBoneName;
  readonly camera: ViewportCameraInfo;
  readonly startPixel: readonly [number, number];
  readonly currentPixel: readonly [number, number];
  readonly symmetryEnabled?: boolean;
  readonly pivotMode?: ShaperPivotMode;
  readonly onFailure?: (failure: LabFailure) => void;
  readonly now?: number;
}): ShaperIkDragOutcome | null {
  if (!isFinitePixelPair(input.startPixel) || !isFinitePixelPair(input.currentPixel)) {
    reportBoundaryFailure(
      failVisible(
        "skeleton-invalid-input",
        "IK 드래그 픽셀 좌표가 유한하지 않습니다.",
        { startPixel: input.startPixel, currentPixel: input.currentPixel },
        input.now,
      ),
      input,
    );
    return null;
  }

  const fkResult = safeComputeWorldTransforms(input.skeleton, input.startPose, input);
  if (!fkResult.ok) return null;
  const { transforms } = fkResult;
  const handleTransform = transforms.get(input.handleBone);
  if (!handleTransform || !v3IsFinite(handleTransform.position)) return null;

  const startWorld = unprojectToViewPlane(input.camera, input.startPixel[0], input.startPixel[1], handleTransform.position);
  const currentWorld = unprojectToViewPlane(input.camera, input.currentPixel[0], input.currentPixel[1], handleTransform.position);
  if (!startWorld || !currentWorld || !v3IsFinite(startWorld) || !v3IsFinite(currentWorld)) return null;

  const deltaWorld: Vec3 = [currentWorld[0] - startWorld[0], currentWorld[1] - startWorld[1], currentWorld[2] - startWorld[2]];
  const limbChainId = BONE_TO_IK_CHAIN[input.handleBone];
  if (limbChainId) {
    const endBone: HumanoidBoneName =
      limbChainId === "leftArm" ? "leftHand" : limbChainId === "rightArm" ? "rightHand" : limbChainId === "leftLeg" ? "leftFoot" : "rightFoot";
    const endOrigin = transforms.get(endBone)?.position ?? handleTransform.position;
    const targetWorld: Vec3 = [endOrigin[0] + deltaWorld[0], endOrigin[1] + deltaWorld[1], endOrigin[2] + deltaWorld[2]];
    try {
      const solved = solveIkGoal(input.startPose, input.skeleton, { chain: limbChainId, target: targetWorld });
      let nextPose = solved.pose;
      if (input.symmetryEnabled) {
        for (const chainBone of solved.chain) {
          const rot = nextPose[chainBone];
          if (rot) nextPose = applySymmetryToPose(nextPose, chainBone, rot, true);
        }
      }
      return { pose: nextPose, targetWorld, labelKo: `IK 이동 (${limbChainId})`, ...(solved.reasonKo ? { reasonKo: solved.reasonKo } : {}) };
    } catch (error) {
      const classified = classifySkeletonBoundaryError(error, input.now);
      if (classified) {
        reportBoundaryFailure(classified, input);
        return null;
      }
      throw error;
    }
  }

  const spineIdx = SPINE_IK_CHAIN.indexOf(input.handleBone);
  if (spineIdx >= 1) {
    const subChain = SPINE_IK_CHAIN.slice(0, spineIdx + 1);
    const targetWorld: Vec3 = [handleTransform.position[0] + deltaWorld[0], handleTransform.position[1] + deltaWorld[1], handleTransform.position[2] + deltaWorld[2]];
    try {
      const solved = solveChainIk(input.startPose, input.skeleton, subChain, targetWorld);
      return { pose: solved.pose, targetWorld, labelKo: `척추 IK 이동 (${input.handleBone})`, ...(solved.reasonKo ? { reasonKo: solved.reasonKo } : {}) };
    } catch (error) {
      const classified = classifySkeletonBoundaryError(error, input.now);
      if (classified) {
        reportBoundaryFailure(classified, input);
        return null;
      }
      throw error;
    }
  }

  const pivot = resolveDragPivotWithMode(input.skeleton, input.startPose, input.handleBone, input.pivotMode ?? "parent", input);
  if (!pivot) return null;
  const fk = computeJointDrag({
    skeleton: input.skeleton,
    startPose: input.startPose,
    pivot,
    camera: input.camera,
    startPixel: input.startPixel,
    currentPixel: input.currentPixel,
    onFailure: input.onFailure,
    now: input.now,
  });
  if (!fk) return null;
  const rot = fk.pose[fk.pivotBone];
  const pose = rot && input.symmetryEnabled ? applySymmetryToPose(fk.pose, fk.pivotBone, rot, true) : fk.pose;
  return { pose, targetWorld: currentWorld, labelKo: `관절 이동 (${fk.pivotBone})` };
}

const BONE_TO_BODY_SCALE_PARAM: Readonly<Partial<Record<HumanoidBoneName, BodyParamKey>>> = {
  head: "headSize",
  neck: "neckLength",
  upperChest: "shoulderWidth",
  leftShoulder: "shoulderWidth",
  rightShoulder: "shoulderWidth",
  chest: "chestDepth",
  spine: "waist",
  hips: "hip",
  leftUpperArm: "armLength",
  leftLowerArm: "armLength",
  leftHand: "armLength",
  rightUpperArm: "armLength",
  rightLowerArm: "armLength",
  rightHand: "armLength",
  leftUpperLeg: "legLength",
  leftLowerLeg: "legLength",
  leftFoot: "legLength",
  rightUpperLeg: "legLength",
  rightLowerLeg: "legLength",
  rightFoot: "legLength",
};

export interface ShaperBoneScaleDragOutcome {
  readonly key: BodyParamKey;
  readonly value: number;
  readonly labelKo: string;
}

export function computeShaperBoneScaleDrag(input: {
  readonly handleBone: HumanoidBoneName;
  readonly startPixel: readonly [number, number];
  readonly currentPixel: readonly [number, number];
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly baseBody: ParamValues<BodyParamKey>;
}): ShaperBoneScaleDragOutcome {
  const key = BONE_TO_BODY_SCALE_PARAM[input.handleBone] ?? "height";
  const validPixels = isFinitePixelPair(input.startPixel) && isFinitePixelPair(input.currentPixel);
  const validSize =
    Number.isFinite(input.renderWidth) &&
    input.renderWidth > 0 &&
    Number.isFinite(input.renderHeight) &&
    input.renderHeight > 0;
  let delta = 0;
  if (validPixels && validSize) {
    const span = Math.max(120, Math.min(input.renderWidth, input.renderHeight) * 0.25);
    const dx = (input.currentPixel[0] - input.startPixel[0]) / span;
    const dy = (input.startPixel[1] - input.currentPixel[1]) / span;
    const rawDelta = dx + dy;
    delta = Number.isFinite(rawDelta) ? clampShaperGizmoDelta(rawDelta, 1.5) : 0;
  }
  const rawBase = input.baseBody[key];
  const baseValue = typeof rawBase === "number" && Number.isFinite(rawBase) ? rawBase : 0;
  const value = Number(clampParam(baseValue + delta).toFixed(3));
  const labelKo = BODY_PARAM_LABELS_KO[key];
  return {
    key,
    value,
    labelKo: `${labelKo} 스케일: ${value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2)}`,
  };
}
