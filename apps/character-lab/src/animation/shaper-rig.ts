import type { Quat, Vec3 } from "../shared/math";

export const SHAPER_FK_SYMMETRY_MULTIPLIER: Vec3 = [-1, -1, 1];
export const SHAPER_IK_SYMMETRY_MULTIPLIER: Vec3 = [-1, -1, 1];
export const SHAPER_IK_MIRROR_YAW_OFFSET_DEG = 180;
export const SHAPER_PIVOT_BONE_SCALE_STEP = 0.1;
export const SHAPER_BODY_BLENDSHAPE_SCALE = 100;
export const SHAPER_COSTUME_BLENDSHAPE_SCALE = 90;

export interface ShaperBonePoseEntry {
  readonly boneName: string;
  readonly isIK: boolean;
  readonly localPosition: Vec3;
  readonly localEulerDeg: Vec3;
  readonly scale?: Vec3;
}

export interface ShaperControlBoneInput {
  readonly boneName: string;
  readonly isHeadBone?: boolean;
  readonly worldPosition: Vec3;
  readonly worldRotation: Quat;
  readonly scale: Vec3;
  readonly pivotScaleDelta?: Vec3;
  readonly childOrgLocalPositions?: Readonly<Record<string, Vec3>>;
}

export interface ShaperDetachedSkinBoneState {
  readonly boneName: string;
  readonly worldPosition: Vec3;
  readonly worldRotation: Quat;
  readonly controlScale: Vec3;
  readonly skinLocalScale: Vec3;
  readonly scaledChildLocalPositions: Readonly<Record<string, Vec3>>;
}

export type ShaperCostumeSlotType = 0 | 1 | 2 | 3;

export interface ShaperMuscleFatBlendShapeWeights {
  readonly bodyMuscleWeight: number;
  readonly bodyFatWeight: number;
  readonly neckSeamMuscleWeight: number;
  readonly neckSeamFatWeight: number;
  readonly costumeMuscleWeight: number;
  readonly costumeFatWeight: number;
}

function normalizeDeg360(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

function swapLeftRightToken(name: string): string | null {
  if (name.includes("RigL")) return name.replace("RigL", "RigR");
  if (name.includes("RigR")) return name.replace("RigR", "RigL");
  if (name.includes("BoneL")) return name.replace("BoneL", "BoneR");
  if (name.includes("BoneR")) return name.replace("BoneR", "BoneL");
  if (name.endsWith("_L")) return `${name.slice(0, -2)}_R`;
  if (name.endsWith("_R")) return `${name.slice(0, -2)}_L`;
  if (name.startsWith("left")) return `right${name.slice(4)}`;
  if (name.startsWith("right")) return `left${name.slice(5)}`;
  return null;
}

/**
 * SHAPER BoneManager::SetSymmetryControlBones (0x060000fa) 역공학 내재화:
 * `RigL* <-> RigR*`, `BoneL* <-> BoneR*` 이름 규칙으로 좌우 대칭 컨트롤 본 맵을 생성한다.
 */
export function pairShaperSymmetryBones(
  boneNames: readonly string[],
): ReadonlyMap<string, string> {
  const nameSet = new Set(boneNames);
  const pairs = new Map<string, string>();
  for (const name of boneNames) {
    const candidate = swapLeftRightToken(name);
    if (candidate !== null && nameSet.has(candidate)) {
      pairs.set(name, candidate);
    }
  }
  return pairs;
}

/**
 * SHAPER HeadPartsManager::ApplyHeadPart (0x060001f3) Alt-클릭 포즈/핸드포즈 좌우 반전 역공학 내재화:
 * - 대칭짝(`symmetryControlPoint`)이 있으면 좌우 본 타깃을 서로 교환한다.
 * - IK 타깃(`isIK === true`): `localPosition = (-x, y, z)`, `localEulerAngles *= (-1, -1, 1)` 후 Y축 `+180°` 회전 오프셋을 더한다.
 * - FK 본(`isIK === false`): `localEulerAngles *= (-1, -1, 1)`을 적용한다.
 */
export function mirrorShaperPose(
  entries: readonly ShaperBonePoseEntry[],
  symmetryMap?: ReadonlyMap<string, string>,
): readonly ShaperBonePoseEntry[] {
  const resolvedSymmetry =
    symmetryMap ?? pairShaperSymmetryBones(entries.map((entry) => entry.boneName));

  return entries.map((entry) => {
    const targetBoneName = resolvedSymmetry.get(entry.boneName) ?? entry.boneName;
    if (entry.isIK) {
      const mirroredPos: Vec3 = [
        -entry.localPosition[0],
        entry.localPosition[1],
        entry.localPosition[2],
      ];
      const mirroredEuler: Vec3 = [
        entry.localEulerDeg[0] * SHAPER_IK_SYMMETRY_MULTIPLIER[0],
        normalizeDeg360(
          entry.localEulerDeg[1] * SHAPER_IK_SYMMETRY_MULTIPLIER[1] +
            SHAPER_IK_MIRROR_YAW_OFFSET_DEG,
        ),
        entry.localEulerDeg[2] * SHAPER_IK_SYMMETRY_MULTIPLIER[2],
      ];
      return {
        ...entry,
        boneName: targetBoneName,
        localPosition: mirroredPos,
        localEulerDeg: mirroredEuler,
      };
    }

    const mirroredFkEuler: Vec3 = [
      entry.localEulerDeg[0] * SHAPER_FK_SYMMETRY_MULTIPLIER[0],
      entry.localEulerDeg[1] * SHAPER_FK_SYMMETRY_MULTIPLIER[1],
      entry.localEulerDeg[2] * SHAPER_FK_SYMMETRY_MULTIPLIER[2],
    ];
    return {
      ...entry,
      boneName: targetBoneName,
      localEulerDeg: mirroredFkEuler,
    };
  });
}

/**
 * SHAPER BoneManager::SplitSkinBones (0x060000fc), SetBoneScale (0x06000102),
 * SetBoneScaleByPivot (0x06000103), CopyPose (0x060000fd) 역공학 내재화:
 * - 스킨 본(`skinBones`)을 평탄 계층(Flat Hierarchy)으로 분리하여 부모 비균일 스케일에 의한 자식 본 전단 왜곡(Shear)을 원천 차단한다.
 * - 피벗 기즈모 드래그 델타(`pivotScaleDelta`)는 `0.1` 배율(`delta * 0.1`)로 누적하며, `bodyBoneSymmetry` 활성화 시 대칭 본에도 동일 스케일을 적용한다.
 * - 직계 자식 본의 `localPosition`을 `orgPos * scale`로 비례 이동시키고, 머리 본(`isHeadBone`)의 스킨 X 스케일은 `1`로 고정(`(1, scale.y, scale.z)`)한다.
 */
export function computeShaperDetachedBoneVolumes(options: {
  readonly bones: readonly ShaperControlBoneInput[];
  readonly bodyBoneSymmetry?: boolean;
  readonly symmetryMap?: ReadonlyMap<string, string>;
}): readonly ShaperDetachedSkinBoneState[] {
  const { bones, bodyBoneSymmetry = true, symmetryMap } = options;
  const resolvedSymmetry =
    symmetryMap ?? pairShaperSymmetryBones(bones.map((bone) => bone.boneName));

  const effectiveScales = new Map<string, Vec3>();
  for (const bone of bones) {
    effectiveScales.set(bone.boneName, [bone.scale[0], bone.scale[1], bone.scale[2]]);
  }

  for (const bone of bones) {
    if (bone.pivotScaleDelta === undefined) continue;
    const cur = effectiveScales.get(bone.boneName) ?? bone.scale;
    const updated: Vec3 = [
      cur[0] + bone.pivotScaleDelta[0] * SHAPER_PIVOT_BONE_SCALE_STEP,
      cur[1] + bone.pivotScaleDelta[1] * SHAPER_PIVOT_BONE_SCALE_STEP,
      cur[2] + bone.pivotScaleDelta[2] * SHAPER_PIVOT_BONE_SCALE_STEP,
    ];
    effectiveScales.set(bone.boneName, updated);

    if (bodyBoneSymmetry) {
      const symName = resolvedSymmetry.get(bone.boneName);
      if (symName !== undefined && symName !== bone.boneName) {
        effectiveScales.set(symName, [updated[0], updated[1], updated[2]]);
      }
    }
  }

  return bones.map((bone) => {
    const controlScale = effectiveScales.get(bone.boneName) ?? bone.scale;
    const skinLocalScale: Vec3 = bone.isHeadBone
      ? [1, controlScale[1], controlScale[2]]
      : [controlScale[0], controlScale[1], controlScale[2]];

    const scaledChildLocalPositions: Record<string, Vec3> = {};
    if (bone.childOrgLocalPositions !== undefined) {
      for (const [childName, orgPos] of Object.entries(bone.childOrgLocalPositions)) {
        scaledChildLocalPositions[childName] = [
          orgPos[0] * controlScale[0],
          orgPos[1] * controlScale[1],
          orgPos[2] * controlScale[2],
        ];
      }
    }

    return {
      boneName: bone.boneName,
      worldPosition: bone.worldPosition,
      worldRotation: bone.worldRotation,
      controlScale,
      skinLocalScale,
      scaledChildLocalPositions,
    };
  });
}

/**
 * SHAPER BodyPartsManager::SetBlendShapes (0x060000b4) 및
 * CostumeManager::SetBlendShapes (0x06000163) 역공학 내재화:
 * - 신체 파츠와 `neckSeamBase`는 근육(blendShape 0)·체지방(blendShape 1) 슬라이더에 `100`을 곱한다.
 * - 의상 파츠는 메쉬 관통 방지를 위해 `90`을 곱하고, 신발(`costumeType === 3`)은 블렌드쉐입을 적용하지 않는다(`0`).
 */
export function computeShaperMuscleFatBlendShapeWeights(options: {
  readonly muscleSlider: number;
  readonly fatSlider: number;
  readonly costumeType?: ShaperCostumeSlotType;
}): ShaperMuscleFatBlendShapeWeights {
  const muscle = Math.max(0, Math.min(1, options.muscleSlider));
  const fat = Math.max(0, Math.min(1, options.fatSlider));
  const costumeType = options.costumeType ?? 0;

  const bodyMuscleWeight = muscle * SHAPER_BODY_BLENDSHAPE_SCALE;
  const bodyFatWeight = fat * SHAPER_BODY_BLENDSHAPE_SCALE;
  const isShoe = costumeType === 3;

  return {
    bodyMuscleWeight,
    bodyFatWeight,
    neckSeamMuscleWeight: bodyMuscleWeight,
    neckSeamFatWeight: bodyFatWeight,
    costumeMuscleWeight: isShoe ? 0 : muscle * SHAPER_COSTUME_BLENDSHAPE_SCALE,
    costumeFatWeight: isShoe ? 0 : fat * SHAPER_COSTUME_BLENDSHAPE_SCALE,
  };
}

/**
 * SHAPER CostumeManager::ScaleCostumeBones (0x06000165) 및 CopyCostumeBones (0x06000167) 역공학 내재화:
 * 의상 프리팹의 평탄화된 스킨 본들을 캐릭터 `skinBones`와 이름으로 매칭해 월드 위치·회전 및 로컬 볼륨 스케일을 동기화한다.
 */
export function syncShaperCostumeBones(
  costumeBoneNames: readonly string[],
  characterSkinBones: readonly ShaperDetachedSkinBoneState[],
): readonly ShaperDetachedSkinBoneState[] {
  const byName = new Map<string, ShaperDetachedSkinBoneState>();
  for (const bone of characterSkinBones) {
    byName.set(bone.boneName, bone);
  }

  const synced: ShaperDetachedSkinBoneState[] = [];
  for (const name of costumeBoneNames) {
    const matched = byName.get(name);
    if (matched !== undefined) {
      synced.push({
        boneName: name,
        worldPosition: matched.worldPosition,
        worldRotation: matched.worldRotation,
        controlScale: matched.controlScale,
        skinLocalScale: matched.skinLocalScale,
        scaledChildLocalPositions: matched.scaledChildLocalPositions,
      });
    }
  }
  return synced;
}

export interface ShaperBoneControlPointCollider {
  readonly thickness: number;
  readonly colliderSize: Vec3;
  readonly colliderCenter: Vec3;
}

export interface ShaperIkTargetTransform {
  readonly position: Vec3;
  readonly eulerDeg: Vec3;
}

export interface SyncShaperIkTargetsInput {
  readonly enableIk: boolean;
  readonly armEndBoneTransforms: readonly [ShaperIkTargetTransform, ShaperIkTargetTransform];
  readonly legPlatformGuideTransforms: readonly [ShaperIkTargetTransform, ShaperIkTargetTransform];
  readonly pelvisTargetTransform: ShaperIkTargetTransform;
  readonly currentIkTargets: readonly ShaperIkTargetTransform[];
}

export interface SyncShaperIkTargetsResult {
  readonly ikEnabled: boolean;
  readonly syncedIkTargets: readonly ShaperIkTargetTransform[];
}

/**
 * SHAPER BoneControlPoint::SetSize (0x060000e3) 역공학 내재화:
 * 본 제어점과 카메라 거리 및 FOV에 비례해 기즈모 두께 `thickness = 0.0025 * dist * (fov / 30)`를 계산하고,
 * FK 본(`isIk === false`)은 길이 방향 박스 콜라이더 `(boneLength, thickness, thickness)` 및 중심 `(-0.5 * boneLength, 0, 0)`,
 * IK 타깃(`isIk === true`)은 정육면체 콜라이더 `(2 * thickness, 2 * thickness, 2 * thickness)`를 반환한다.
 */
export function computeShaperBoneControlPointCollider(options: {
  readonly position: Vec3;
  readonly cameraPosition: Vec3;
  readonly fovDeg?: number;
  readonly isIk: boolean;
  readonly boneLength?: number;
}): ShaperBoneControlPointCollider {
  const { position, cameraPosition, fovDeg = 30, isIk, boneLength = 0.2 } = options;
  const dist = Math.hypot(
    position[0] - cameraPosition[0],
    position[1] - cameraPosition[1],
    position[2] - cameraPosition[2],
  );
  const thickness = dist * 0.0025 * (fovDeg / 30);

  if (isIk) {
    const cubeSide = thickness * 2;
    return {
      thickness,
      colliderSize: [cubeSide, cubeSide, cubeSide],
      colliderCenter: [0, 0, 0],
    };
  }

  return {
    thickness,
    colliderSize: [boneLength, thickness, thickness],
    colliderCenter: [-boneLength * 0.5, 0, 0],
  };
}

/**
 * SHAPER BoneManager::SetAllIKs (0x06000109) 및 SaveIKTransform (0x0600010a) 역공학 내재화:
 * FK에서 IK를 활성화할 때 팔 체인(`0, 1`)의 IK 타깃을 솔버 끝 본(`bones[last]`)의 위치·회전에 스냅하고,
 * 다리 체인(`2, 3`)의 IK 타깃을 발판 가이드(`legPlatformPosGuides[0, 1]`)에 스냅하여 FK ↔ IK 전환 시 포즈 점프를 방지한다.
 */
export function syncShaperIkTargetsOnToggle(
  input: SyncShaperIkTargetsInput,
): SyncShaperIkTargetsResult {
  if (!input.enableIk) {
    return {
      ikEnabled: false,
      syncedIkTargets: input.currentIkTargets.map((target) => ({
        position: [...target.position] as Vec3,
        eulerDeg: [...target.eulerDeg] as Vec3,
      })),
    };
  }

  const syncedIkTargets: ShaperIkTargetTransform[] = [
    {
      position: [...input.armEndBoneTransforms[0].position] as Vec3,
      eulerDeg: [...input.armEndBoneTransforms[0].eulerDeg] as Vec3,
    },
    {
      position: [...input.armEndBoneTransforms[1].position] as Vec3,
      eulerDeg: [...input.armEndBoneTransforms[1].eulerDeg] as Vec3,
    },
    {
      position: [...input.legPlatformGuideTransforms[0].position] as Vec3,
      eulerDeg: [...input.legPlatformGuideTransforms[0].eulerDeg] as Vec3,
    },
    {
      position: [...input.legPlatformGuideTransforms[1].position] as Vec3,
      eulerDeg: [...input.legPlatformGuideTransforms[1].eulerDeg] as Vec3,
    },
    {
      position: [...input.pelvisTargetTransform.position] as Vec3,
      eulerDeg: [...input.pelvisTargetTransform.eulerDeg] as Vec3,
    },
  ];

  return {
    ikEnabled: true,
    syncedIkTargets,
  };
}

/**
 * SHAPER CostumeManager::SetMeshScale (0x0600016a) 역공학 내재화:
 * 액세서리 메쉬의 원본 정점 배열(`originalVertices`)에 로컬 비균등 스케일(`accScale`)을 직접 곱해 변형된 정점 버퍼를 생성한다.
 */
export function scaleShaperAccessoryVertices(
  originalVertices: Float32Array,
  accScale: Vec3,
): Float32Array {
  const scaled = new Float32Array(originalVertices.length);
  const vertexCount = Math.floor(originalVertices.length / 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const base = i * 3;
    scaled[base] = originalVertices[base] * accScale[0];
    scaled[base + 1] = originalVertices[base + 1] * accScale[1];
    scaled[base + 2] = originalVertices[base + 2] * accScale[2];
  }
  return scaled;
}

/**
 * SHAPER CostumeManager::SetCostumeOutlineRatio (0x06000161) 역공학 내재화:
 * 의상 렌더러의 머티리얼 슬롯 중 이름이 `"Skin"`인 슬롯을 만나면 인덱스를 `+1` 건너뛰어
 * 실제 의상 머티리얼 슬롯에 외곽선 비율이나 색상이 적용되도록 보정한다.
 */
export function resolveShaperCostumeMaterialSlotIndex(
  materialNames: readonly string[],
  requestedSlotIndex: number,
): number {
  let slotIndex = Math.max(0, requestedSlotIndex);
  if (slotIndex < materialNames.length && materialNames[slotIndex] === "Skin") {
    slotIndex += 1;
  }
  return Math.min(slotIndex, Math.max(0, materialNames.length - 1));
}
