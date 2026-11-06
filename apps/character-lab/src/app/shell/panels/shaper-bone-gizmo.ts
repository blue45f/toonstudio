/**
 * SHAPER 0.5.563 (`Assembly-CSharp.dll` · `BoneManager 0x02000019`, `PivotManager 0x02000050`,
 * `HeadPartsManager 0x02000038`, `BodyPartsManager 0x0200000c`) 및 `BuiltInData/Presets/*.preset`
 * 역공학 근거를 바탕으로 구성한 클린룸 본 기즈모·대칭 조작·네이티브 프리셋 브리지 모듈.
 */
import { HUMANOID_BONE_PARENTS, clampParam, isHumanoidBoneName } from "../../../contracts";
import { qNormalize, v3IsFinite, type Quat, type Vec3 } from "../../../shared/math";

import {
  diagnoseSkeletonData,
  isFinitePixelPair,
  reportBoundaryFailure,
  safeComputeWorldTransforms,
  type SkeletonBoundaryOptions,
} from "./skeleton-boundary-guard";
import { resolveDragPivot, type DragPivot } from "./viewport-interactions";

import type { BodyParamKey, FaceParamKey, HumanoidBoneName, JointDragHandle, ParamValues, Pose, SkeletonData } from "../../../contracts";

export {
  diagnoseSkeletonData,
  isFinitePixelPair,
  reportBoundaryFailure,
  safeComputeWorldTransforms,
  type SkeletonBoundaryOptions,
} from "./skeleton-boundary-guard";

/** SHAPER `BoneManager.pivotIKMode`에 대응하는 관절 조작 피벗 모드 */
export type ShaperPivotMode = "parent" | "direct";

export interface BoneLinkSegment {
  readonly fromBone: HumanoidBoneName;
  readonly toBone: HumanoidBoneName;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** SHAPER `BoneManager` 색상 구분(`redMat`/`blueMat`/`greenMat`/`whiteMat`)에 대응하는 측면 태그 */
  readonly side: "center" | "left" | "right";
}

function cleanZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function isValidRotationQuat(rotation: Quat): boolean {
  if (!Array.isArray(rotation) || rotation.length < 4) return false;
  const [x, y, z, w] = rotation;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) {
    return false;
  }
  const norm = Math.hypot(x, y, z, w);
  return Number.isFinite(norm) && norm >= 1e-6;
}

/**
 * 좌우 대칭 휴머노이드 본 이름을 반환한다(`left*` ↔ `right*`).
 * 중앙선 본(`hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, `jaw`)은 `null`을 반환한다.
 */
export function resolveMirrorHumanoidBone(bone: HumanoidBoneName): HumanoidBoneName | null {
  if (bone.startsWith("left")) {
    const candidate = `right${bone.slice(4)}`;
    return isHumanoidBoneName(candidate) ? candidate : null;
  }
  if (bone.startsWith("right")) {
    const candidate = `left${bone.slice(5)}`;
    return isHumanoidBoneName(candidate) ? candidate : null;
  }
  return null;
}

/**
 * 사원수 회전 `[x, y, z, w]`를 시상면(YZ 평면, `x = 0`) 기준으로 좌우 반사한다.
 * 오른손 좌표계(+Y 위, +Z 앞)에서 X축 피치(굽힘)는 같은 부호를 유지하고 Y축 요·Z축 롤은 부호가 반전된다.
 */
export function mirrorHumanoidBoneRotation(quat: Quat): Quat {
  const normalized = qNormalize([quat[0], -quat[1], -quat[2], quat[3]]);
  return [
    cleanZero(normalized[0]),
    cleanZero(normalized[1]),
    cleanZero(normalized[2]),
    cleanZero(normalized[3]),
  ];
}

/**
 * SHAPER `HeadPartsManager.sysmmetryM` / `symmetryControlPoint` 및 대칭 포즈 조작 규약:
 * `symmetryEnabled`가 켜져 있으면 조작 본과 반대쪽 대칭 본에 거울 회전을 동시에 기록한다.
 */
export function applySymmetryToPose(
  basePose: Pose,
  pivotBone: HumanoidBoneName,
  rotation: Quat,
  symmetryEnabled: boolean,
): Pose {
  if (!isValidRotationQuat(rotation) || !isHumanoidBoneName(pivotBone)) {
    return { ...basePose };
  }
  const safeRotation: Quat = [rotation[0], rotation[1], rotation[2], rotation[3]];
  if (!symmetryEnabled) {
    return { ...basePose, [pivotBone]: safeRotation };
  }
  const mirrorBone = resolveMirrorHumanoidBone(pivotBone);
  if (!mirrorBone) {
    return { ...basePose, [pivotBone]: safeRotation };
  }
  return {
    ...basePose,
    [pivotBone]: safeRotation,
    [mirrorBone]: mirrorHumanoidBoneRotation(safeRotation),
  };
}

/**
 * SHAPER `BoneManager.pivotIKMode`에 따라 관절 드래그 피벗을 결정한다.
 * - `"parent"` (기본): 팔꿈치·손목 등 말단 핸들을 끌면 부모 본(어깨·팔꿈치)이 회전한다.
 * - `"direct"`: 선택한 본 자체를 피벗으로 삼아 제자리에서 직접 회전한다.
 */
export function resolveDragPivotWithMode(
  skeleton: SkeletonData,
  pose: Pose,
  handleBone: HumanoidBoneName,
  pivotMode: ShaperPivotMode = "parent",
  options?: SkeletonBoundaryOptions,
): DragPivot | null {
  if (pivotMode === "parent") {
    return resolveDragPivot(skeleton, pose, handleBone, options);
  }
  const fkResult = safeComputeWorldTransforms(skeleton, pose, options);
  if (!fkResult.ok) return null;
  if (!isHumanoidBoneName(handleBone)) return null;
  const world = fkResult.transforms.get(handleBone);
  if (!world || !v3IsFinite(world.position)) return null;
  return {
    pivotBone: handleBone,
    pivotWorld: [...world.position],
  };
}

function classifyBoneSide(bone: HumanoidBoneName): "center" | "left" | "right" {
  if (bone.startsWith("left")) return "left";
  if (bone.startsWith("right")) return "right";
  return "center";
}

/**
 * 화면에 투영된 핸들 목록(`handles`)과 스켈레톤 계층에서 부모-자식 본 연결선(`BoneLinkSegment[]`)을 계산한다.
 * 중간 본이 핸들 목록에 없으면 가장 가까운 표시 조상 핸들과 연결해 골격 트리가 끊기지 않게 한다.
 */
export function computeVisibleBoneLinks(
  handles: readonly JointDragHandle[],
  skeleton?: SkeletonData | null,
  options?: SkeletonBoundaryOptions,
): readonly BoneLinkSegment[] {
  const byBone = new Map<HumanoidBoneName, JointDragHandle>();
  for (const handle of handles) {
    if (!handle || !isHumanoidBoneName(handle.bone) || !isFinitePixelPair(handle.screen)) continue;
    byBone.set(handle.bone, handle);
  }
  const parentLookup = new Map<string, string | null>();
  if (skeleton !== undefined && skeleton !== null) {
    const failure = diagnoseSkeletonData(skeleton, options?.now);
    if (failure) {
      reportBoundaryFailure(failure, options);
    } else {
      for (const bone of skeleton.bones) {
        parentLookup.set(bone.name, bone.parent);
      }
    }
  }

  const segments: BoneLinkSegment[] = [];
  for (const handle of handles) {
    if (!handle || !isHumanoidBoneName(handle.bone) || !isFinitePixelPair(handle.screen)) continue;
    const visited = new Set<string>([handle.bone]);
    let cursor = parentLookup.get(handle.bone) ?? HUMANOID_BONE_PARENTS[handle.bone] ?? null;
    let parentHandle: JointDragHandle | undefined;
    let parentBoneName: HumanoidBoneName | null = null;
    while (cursor) {
      if (visited.has(cursor)) break;
      visited.add(cursor);
      if (isHumanoidBoneName(cursor)) {
        parentHandle = byBone.get(cursor);
        if (parentHandle) {
          parentBoneName = cursor;
          break;
        }
      }
      cursor = parentLookup.get(cursor) ?? (isHumanoidBoneName(cursor) ? HUMANOID_BONE_PARENTS[cursor] : null);
    }
    if (!parentHandle || !parentBoneName) continue;
    segments.push({
      fromBone: parentBoneName,
      toBone: handle.bone,
      x1: parentHandle.screen[0],
      y1: parentHandle.screen[1],
      x2: handle.screen[0],
      y2: handle.screen[1],
      side: classifyBoneSide(handle.bone),
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// SHAPER BuiltInData `.preset` (`1.0\nmt*...`) 파서 및 내장 프리셋 프로필
// ---------------------------------------------------------------------------

export type ShaperNativePresetKind = "head" | "body" | "pose";

export interface ShaperNativeHeadPreset {
  readonly kind: "head";
  readonly modelType: number;
  readonly modelId: number;
  readonly name: string;
  readonly vertexCount: number;
  readonly widthToHeight: number;
  readonly depthToHeight: number;
  readonly jawToCheekRatio: number;
  readonly faceParams: ParamValues<FaceParamKey>;
}

export interface ShaperNativeBodyPreset {
  readonly kind: "body";
  readonly modelType: 7;
  readonly name: string;
  readonly sex: 0 | 1;
  readonly muscle: number;
  readonly fat: number;
  readonly boneScales: Readonly<Record<string, Vec3>>;
  readonly bodyParams: ParamValues<BodyParamKey>;
}

export interface ShaperNativePosePreset {
  readonly kind: "pose";
  readonly modelType: 12;
  readonly name: string;
  readonly pose: Pose;
}

export type ShaperNativePreset = ShaperNativeHeadPreset | ShaperNativeBodyPreset | ShaperNativePosePreset;

/** SHAPER 본 이름(`BodyHub001` 등) → `HumanoidBoneName` 매핑 */
const SHAPER_BONE_TO_HUMANOID: Readonly<Record<string, HumanoidBoneName>> = {
  BodyHub001: "hips",
  BodySpine: "spine",
  BodySpine1: "chest",
  BodySpine2: "upperChest",
  BodyNeck: "neck",
  BodyHead: "head",
  BodyLClavicle: "leftShoulder",
  BodyLUArm: "leftUpperArm",
  BodyLFArm: "leftLowerArm",
  BodyLHand: "leftHand",
  BodyRClavicle: "rightShoulder",
  BodyRUArm: "rightUpperArm",
  BodyRFArm: "rightLowerArm",
  BodyRHand: "rightHand",
  BodyLThigh: "leftUpperLeg",
  BodyLCalf: "leftLowerLeg",
  BodyLFoot: "leftFoot",
  BodyLToe0: "leftToes",
  BodyRThigh: "rightUpperLeg",
  BodyRCalf: "rightLowerLeg",
  BodyRFoot: "rightFoot",
  BodyRToe0: "rightToes",
};

function parseTriple(raw: string): Vec3 | null {
  const parts = raw.split("/").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

function eulerDegreesToQuat(deg: Vec3): Quat {
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

/**
 * SHAPER 네이티브 `.preset` 텍스트(`1.0\nmt*...`)를 파싱해 `character-lab` 파라미터·포즈로 변환한다.
 */
export function parseShaperNativePreset(presetText: string): ShaperNativePreset | null {
  const lines = presetText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  const payload = lines.length >= 2 && /^\d+\.\d+$/u.test(lines[0]) ? lines[1] : lines[0];
  const tokens = payload.split(",");
  const pairs: Array<readonly [string, string]> = [];
  for (const token of tokens) {
    const star = token.indexOf("*");
    if (star <= 0) continue;
    pairs.push([token.slice(0, star).trim(), token.slice(star + 1).trim()]);
  }
  const mtPair = pairs.find(([k]) => k === "mt");
  if (!mtPair) return null;
  const mt = Number.parseInt(mtPair[1], 10);
  if (!Number.isFinite(mt)) return null;
  const name = pairs.find(([k]) => k === "name")?.[1] ?? `shaper-mt-${mt}`;

  if (mt >= 0 && mt <= 5) {
    const mid = Number.parseInt(pairs.find(([k]) => k === "mid")?.[1] ?? "0", 10);
    const verts: Vec3[] = [];
    for (const [k, v] of pairs) {
      if (k !== "v") continue;
      const triple = parseTriple(v);
      if (triple) verts.push(triple);
    }
    if (verts.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, y, z] of verts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const width = Math.max(1e-5, maxX - minX);
    const height = Math.max(1e-5, maxY - minY);
    const depth = Math.max(1e-5, maxZ - minZ);
    const midY = (minY + maxY) / 2;
    const halfH = height / 2;
    let cheekMaxX = 0;
    let jawMaxX = 0;
    for (const [x, y] of verts) {
      const yNorm = (y - midY) / halfH;
      const ax = Math.abs(x);
      if (Math.abs(yNorm - 0.0) <= 0.15 && ax > cheekMaxX) cheekMaxX = ax;
      if (Math.abs(yNorm + 0.6) <= 0.15 && ax > jawMaxX) jawMaxX = ax;
    }
    const widthToHeight = Number((width / height).toFixed(4));
    const depthToHeight = Number((depth / height).toFixed(4));
    const jawToCheekRatio = cheekMaxX > 0 ? Number((jawMaxX / cheekMaxX).toFixed(4)) : 0.85;
    const faceParams: ParamValues<FaceParamKey> = {
      faceShape: clampParam((0.71 - widthToHeight) * 8),
      jawWidth: clampParam((jawToCheekRatio - 0.86) * 6),
      chinLength: clampParam((0.712 - widthToHeight) * 6),
      cheekVolume: clampParam((depthToHeight - 0.88) * 5),
    };
    return {
      kind: "head",
      modelType: mt,
      modelId: Number.isFinite(mid) ? mid : 0,
      name,
      vertexCount: verts.length,
      widthToHeight,
      depthToHeight,
      jawToCheekRatio,
      faceParams,
    };
  }

  if (mt === 7) {
    const sexRaw = Number.parseInt(pairs.find(([k]) => k === "sex")?.[1] ?? "1", 10);
    const sex: 0 | 1 = sexRaw === 0 ? 0 : 1;
    const muscle = Number.parseFloat(pairs.find(([k]) => k === "muscle")?.[1] ?? "0") || 0;
    const fat = Number.parseFloat(pairs.find(([k]) => k === "fat")?.[1] ?? "0") || 0;
    const boneScales: Record<string, Vec3> = {};
    let currentBone: string | null = null;
    for (const [k, v] of pairs) {
      if (k === "bN") currentBone = v;
      else if (k === "bS" && currentBone) {
        const triple = parseTriple(v);
        if (triple) boneScales[currentBone] = triple;
      }
    }
    const headScale = boneScales.BodyHead?.[0] ?? 1;
    const shoulderY = boneScales.BodyLClavicle?.[0] ?? 1;
    const waistY = boneScales.BodySpine?.[1] ?? 1;
    const chestZ = boneScales.BodySpine2?.[2] ?? 1;
    const hipY = boneScales.BodyPelvis?.[1] ?? 1;
    const armX = boneScales.BodyLUArm?.[0] ?? 1;
    const legX = boneScales.BodyLThigh?.[0] ?? 1;
    const neckX = boneScales.BodyNeck?.[0] ?? 1;

    const bodyParams: ParamValues<BodyParamKey> = {
      height: clampParam((legX - 1) * 1.8 + (sex === 0 ? 0.25 : -0.05)),
      headSize: clampParam((headScale - 1) * 1.4),
      shoulderWidth: clampParam((shoulderY - 1) * 2.2 + (sex === 0 ? 0.35 : -0.15)),
      chestDepth: clampParam((chestZ - 0.75) * 1.8 + muscle * 0.35),
      waist: clampParam((waistY - 0.8) * 1.8 + fat * 0.5),
      hip: clampParam((hipY - 0.9) * 2.0),
      armLength: clampParam((armX - 0.9) * 2.2),
      legLength: clampParam((legX - 0.95) * 2.0),
      neckLength: clampParam((neckX - 1) * 1.8),
    };
    return {
      kind: "body",
      modelType: 7,
      name,
      sex,
      muscle,
      fat,
      boneScales,
      bodyParams,
    };
  }

  if (mt === 12) {
    const pose: Record<string, Quat> = {};
    let currentBone: string | null = null;
    for (const [k, v] of pairs) {
      if (k === "bN") currentBone = v;
      else if (k === "bA" && currentBone) {
        const humanoid = SHAPER_BONE_TO_HUMANOID[currentBone];
        const deg = parseTriple(v);
        if (humanoid && deg) {
          pose[humanoid] = eulerDegreesToQuat(deg);
        }
      }
    }
    return {
      kind: "pose",
      modelType: 12,
      name,
      pose,
    };
  }

  return null;
}

/**
 * SHAPER `BuiltInData/Presets/body/{여성1,남성1,소년}.preset`에서 추출한 정본 체형 파라미터 프로필
 */
export const SHAPER_BUILTIN_BODY_PRESETS: Readonly<
  Record<
    "shaper-female-1" | "shaper-male-1" | "shaper-boy",
    { readonly id: string; readonly labelKo: string; readonly sex: 0 | 1; readonly bodyParams: ParamValues<BodyParamKey> }
  >
> = {
  "shaper-female-1": {
    id: "shaper-female-1",
    labelKo: "SHAPER 여성 기본(여성1.preset)",
    sex: 1,
    bodyParams: {
      height: -0.05,
      headSize: 0.14,
      shoulderWidth: -0.18,
      chestDepth: 0.12,
      waist: -0.28,
      hip: 0.16,
      armLength: -0.08,
      legLength: 0.14,
      neckLength: 0.05,
    },
  },
  "shaper-male-1": {
    id: "shaper-male-1",
    labelKo: "SHAPER 남성 기본(남성1.preset)",
    sex: 0,
    bodyParams: {
      height: 0.32,
      headSize: -0.12,
      shoulderWidth: 0.42,
      chestDepth: 0.28,
      waist: 0.06,
      hip: -0.14,
      armLength: 0.18,
      legLength: 0.24,
      neckLength: 0.08,
    },
  },
  "shaper-boy": {
    id: "shaper-boy",
    labelKo: "SHAPER 소년 기본(소년.preset)",
    sex: 0,
    bodyParams: {
      height: -0.35,
      headSize: 0.28,
      shoulderWidth: -0.12,
      chestDepth: -0.15,
      waist: -0.18,
      hip: -0.22,
      armLength: -0.2,
      legLength: -0.15,
      neckLength: -0.06,
    },
  },
};

/**
 * SHAPER `BuiltInData/Presets/head/얼굴형1..6.preset`에서 추출한 정본 두상 파라미터 프로필
 */
export const SHAPER_BUILTIN_FACE_PRESETS: Readonly<
  Record<
    "shaper-face-1" | "shaper-face-2" | "shaper-face-3" | "shaper-face-4" | "shaper-face-5" | "shaper-face-6",
    { readonly id: string; readonly labelKo: string; readonly faceParams: ParamValues<FaceParamKey> }
  >
> = {
  "shaper-face-1": {
    id: "shaper-face-1",
    labelKo: "얼굴형 1 (기본 V라인)",
    faceParams: { faceShape: -0.15, jawWidth: -0.24, chinLength: -0.08, cheekVolume: 0.05 },
  },
  "shaper-face-2": {
    id: "shaper-face-2",
    labelKo: "얼굴형 2 (갸름한 샤프형)",
    faceParams: { faceShape: -0.32, jawWidth: -0.38, chinLength: 0.14, cheekVolume: -0.12 },
  },
  "shaper-face-3": {
    id: "shaper-face-3",
    labelKo: "얼굴형 3 (부드러운 동안형)",
    faceParams: { faceShape: 0.12, jawWidth: -0.1, chinLength: -0.22, cheekVolume: 0.24 },
  },
  "shaper-face-4": {
    id: "shaper-face-4",
    labelKo: "얼굴형 4 (성숙한 장방형)",
    faceParams: { faceShape: -0.18, jawWidth: 0.08, chinLength: 0.22, cheekVolume: -0.08 },
  },
  "shaper-face-5": {
    id: "shaper-face-5",
    labelKo: "얼굴형 5 (슬렌더 웹툰형)",
    faceParams: { faceShape: -0.28, jawWidth: -0.32, chinLength: 0.06, cheekVolume: -0.05 },
  },
  "shaper-face-6": {
    id: "shaper-face-6",
    labelKo: "얼굴형 6 (발랄한 라운드형)",
    faceParams: { faceShape: 0.18, jawWidth: -0.06, chinLength: -0.18, cheekVolume: 0.28 },
  },
};
