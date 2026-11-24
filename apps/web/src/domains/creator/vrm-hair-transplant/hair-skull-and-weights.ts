/**
 * 크로스 VRM 헤어 메시 분류·추출, 두개골 5점 랜드마크 측정·아핀 정렬,
 * 이진 유리수(1/1024) 본 웨이트 계산 및 카탈로그 기반 매니페스트 빌더.
 */

import * as THREE from "three";

import {
  blendOklabRgb,
  clamp,
  computeCiede2000Rgb,
  roundTo,
  srgbToOklch,
  type Rgb01,
} from "../vrm-auto-shader-transfer/color-science-oklch";
import { STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY } from "../vrm/studio-vrm-custom-part-material";

import {
  DEFAULT_HAIR_BONE_WEIGHT_CONFIG,
  DEFAULT_HAIR_COLOR_HARMONY_CONFIG,
  DONOR_HAIR_CATALOG,
  TARGET_HEAD_PROPORTION_PRESETS,
  type BoneWeightZoneBand,
  type ExtractedDonorHairMesh,
  type HairBoneWeightConfig,
  type HairColorHarmonyConfig,
  type HairHarmonyGrade,
  type HairMtoonHarmonyReport,
  type HairTransplantDonorCatalogEntry,
  type HairTransplantDonorId,
  type HairZoneKind,
  type ReboundSkinMetrics,
  type SkullAlignmentTransform,
  type SkullFrameMetrics,
  type TargetHeadProportionId,
  type TargetHeadProportionPreset,
  type Vec3Tuple,
  type VrmHairTransplantManifest,
  type VrmTransplantActorLike,
} from "./types";

export const STUDIO_VRM_HAIR_TRANSPLANT_KEY = "studioVrmHairTransplant";

const WEIGHT_QUANTA = 1024;

const HAIR_INCLUDE_PATTERN =
  /hair|bang|fringe|ponytail|twintail|ahoge|braid|strand|hair_back|hair_front|hair_side|kami|머리카락|헤어/iu;
const HAIR_EXCLUDE_PATTERN =
  /eyelash|eyebrow|brow|lash|body|face|skin|eye|teeth|tongue|mouth|cloth|outfit|dress|shirt|skirt|shoe|boot|outline/iu;
const HAIR_BONE_PATTERN = /hair|j_sec_hair|ahoge|twintail|ponytail|bang/iu;
const HEAD_NODE_PATTERN = /(?:^|[:_./\s])head$/iu;
const SKULL_ACCESSORY_EXCLUDE_PATTERN = /eyelash|eyebrow|lash|teeth|tongue|glasses|hat|ribbon|earring/iu;

export const WEIGHT_BAND_SPECS: readonly {
  readonly bandIndex: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly range: readonly [number, number];
}[] = Object.freeze([
  { bandIndex: 0, labelKo: "두피 뿌리", labelEn: "Scalp Root", range: [0, 0.2] },
  { bandIndex: 1, labelKo: "상단 연결", labelEn: "Upper Crown", range: [0.2, 0.4] },
  { bandIndex: 2, labelKo: "중단 흐름", labelEn: "Mid Strand", range: [0.4, 0.65] },
  { bandIndex: 3, labelKo: "하단 탄성", labelEn: "Lower Sway", range: [0.65, 0.85] },
  { bandIndex: 4, labelKo: "모발 끝단", labelEn: "Hair Tips", range: [0.85, 1.0] },
]);

export function resolveGradeFromDeltaE(deltaE: number): HairHarmonyGrade {
  if (deltaE <= 8) return "harmonized";
  if (deltaE <= 16) return "acceptable";
  return "needs-tuning";
}

export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeBoneWeightConfig(partial?: Partial<HairBoneWeightConfig>): HairBoneWeightConfig {
  return {
    scalpPinRadiusRatio: clamp(
      partial?.scalpPinRadiusRatio ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.scalpPinRadiusRatio,
      0.06,
      0.38,
    ),
    tipSwayStartRatio: clamp(
      partial?.tipSwayStartRatio ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.tipSwayStartRatio,
      0.45,
      0.85,
    ),
    maxTipSwayWeight: clamp(
      partial?.maxTipSwayWeight ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.maxTipSwayWeight,
      0.65,
      1.0,
    ),
    secondaryJointCount: Math.round(
      clamp(partial?.secondaryJointCount ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.secondaryJointCount, 3, 3),
    ),
    stiffness: clamp(partial?.stiffness ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.stiffness, 0.15, 1.5),
    dragForce: clamp(partial?.dragForce ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.dragForce, 0.08, 0.95),
    gravityPower: clamp(partial?.gravityPower ?? DEFAULT_HAIR_BONE_WEIGHT_CONFIG.gravityPower, 0, 1.2),
  };
}

export function normalizeColorHarmonyConfig(partial?: Partial<HairColorHarmonyConfig>): HairColorHarmonyConfig {
  return {
    harmonyStrength: clamp(
      partial?.harmonyStrength ?? DEFAULT_HAIR_COLOR_HARMONY_CONFIG.harmonyStrength,
      0,
      1,
    ),
    ...(partial?.tintOverrideRgb ? { tintOverrideRgb: partial.tintOverrideRgb } : {}),
    preserveOriginalTextures:
      partial?.preserveOriginalTextures ?? DEFAULT_HAIR_COLOR_HARMONY_CONFIG.preserveOriginalTextures,
    enableAngelRingMatcap:
      partial?.enableAngelRingMatcap ?? DEFAULT_HAIR_COLOR_HARMONY_CONFIG.enableAngelRingMatcap,
    enableOutlineMesh:
      partial?.enableOutlineMesh ?? DEFAULT_HAIR_COLOR_HARMONY_CONFIG.enableOutlineMesh,
    shine: clamp(partial?.shine ?? DEFAULT_HAIR_COLOR_HARMONY_CONFIG.shine, 0, 1),
  };
}

export function isTransplantedOrOutlineObject(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (
      cursor.userData[STUDIO_VRM_HAIR_TRANSPLANT_KEY] === true
      || cursor.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true
    ) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

/** 메시 이름·재질 이름·스켈레톤 본을 종합해 VRM 실물 헤어 메시인지 판정한다. */
export function isHairMeshCandidate(
  mesh: THREE.Mesh,
  explicitNames?: ReadonlySet<string>,
): boolean {
  if (!mesh.isMesh || !mesh.geometry?.getAttribute("position")) return false;
  if (isTransplantedOrOutlineObject(mesh)) return false;

  if (explicitNames && explicitNames.size > 0) {
    return explicitNames.has(mesh.name);
  }

  const meshName = mesh.name || "";
  if (HAIR_EXCLUDE_PATTERN.test(meshName)) return false;
  if (HAIR_INCLUDE_PATTERN.test(meshName)) return true;

  const parentName = mesh.parent?.name || "";
  if (parentName && !HAIR_EXCLUDE_PATTERN.test(parentName) && HAIR_INCLUDE_PATTERN.test(parentName)) {
    return true;
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of materials) {
    const matName = mat?.name || "";
    if (matName && !HAIR_EXCLUDE_PATTERN.test(matName) && HAIR_INCLUDE_PATTERN.test(matName)) {
      return true;
    }
  }

  const skinned = mesh as THREE.SkinnedMesh;
  if (skinned.isSkinnedMesh && skinned.skeleton?.bones?.length) {
    return skinned.skeleton.bones.some((bone) => HAIR_BONE_PATTERN.test(bone.name));
  }

  return false;
}

/** 도너 VRM 장면에서 비파괴 방식으로 실물 헤어 메시를 추출한다. */
export function extractDonorHairMeshes(
  donorVrm: VrmTransplantActorLike,
  explicitMeshNames?: readonly string[],
): readonly ExtractedDonorHairMesh[] {
  const explicitSet = explicitMeshNames?.length ? new Set(explicitMeshNames) : undefined;
  const results: ExtractedDonorHairMesh[] = [];

  donorVrm.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!isHairMeshCandidate(mesh, explicitSet)) return;
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    const skinned = mesh as THREE.SkinnedMesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    results.push({
      sourceMeshName: mesh.name || `donor-hair-${results.length + 1}`,
      meshKind: skinned.isSkinnedMesh ? "skinned" : "static",
      vertexCount: position.count,
      triangleCount,
      hasUv: Boolean(mesh.geometry.getAttribute("uv")),
      hasVertexColors: Boolean(mesh.geometry.getAttribute("color")),
      sourceBoneCount: skinned.isSkinnedMesh ? skinned.skeleton?.bones.length ?? 0 : 0,
      sourceMaterialCount: materials.filter(Boolean).length,
      mesh,
    });
  });

  return results;
}

export function resolveHeadBone(vrm: VrmTransplantActorLike): THREE.Object3D | null {
  const rawHead = vrm.humanoid?.getRawBoneNode?.("head");
  if (rawHead) return rawHead;
  const normHead = vrm.humanoid?.getNormalizedBoneNode?.("head");
  if (normHead) return normHead;

  let found: THREE.Object3D | null = null;
  vrm.scene.traverse((node) => {
    if (!found && HEAD_NODE_PATTERN.test(node.name)) found = node;
  });
  return found;
}

/**
 * VRM의 `head` 본과 비-헤어 두개골 메시 정점을 계측해 정규 두개골 좌표계(`+Y` 위, `+Z` 정면)를 반환한다.
 */
export function measureVrmSkullFrame(vrm: VrmTransplantActorLike): SkullFrameMetrics {
  const forwardSign: 1 | -1 = vrm.meta?.metaVersion === "0" ? -1 : 1;
  vrm.scene.updateMatrixWorld(true);
  const headBone = resolveHeadBone(vrm);

  if (!headBone) {
    return {
      headWorldOrigin: [0, 1.46, 0],
      crownHeightM: 0.212,
      skullWidthM: 0.164,
      skullDepthM: 0.18,
      eyeLineHeightM: 0.106,
      forwardSign,
      source: "preset",
    };
  }

  headBone.updateWorldMatrix(true, false);
  const headWorldOriginVec = headBone.getWorldPosition(new THREE.Vector3());
  const headWorldOrigin: Vec3Tuple = [
    roundTo(headWorldOriginVec.x, 6),
    roundTo(headWorldOriginVec.y, 6),
    roundTo(headWorldOriginVec.z, 6),
  ];

  const inverseHead = headBone.matrixWorld.clone().invert();
  const toCanonicalQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    forwardSign === -1 ? Math.PI : 0,
  );

  const headDescendants = new Set<THREE.Object3D>();
  headBone.traverse((node) => {
    headDescendants.add(node);
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = -Infinity;
  let sampleCount = 0;

  const tempVertex = new THREE.Vector3();
  const toHeadMatrix = new THREE.Matrix4();

  vrm.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || isTransplantedOrOutlineObject(mesh)) return;
    if (isHairMeshCandidate(mesh) || SKULL_ACCESSORY_EXCLUDE_PATTERN.test(mesh.name || "")) return;

    const position = mesh.geometry?.getAttribute("position");
    if (!position || position.count === 0) return;

    const skinned = mesh as THREE.SkinnedMesh;
    const isUnderHead = headDescendants.has(mesh);
    let eligibleBones: boolean[] | null = null;
    if (skinned.isSkinnedMesh && skinned.skeleton?.bones?.length) {
      eligibleBones = skinned.skeleton.bones.map((bone) => headDescendants.has(bone));
      if (!eligibleBones.some(Boolean) && !isUnderHead) return;
    } else if (!isUnderHead) {
      return;
    }

    const skinIndex = skinned.isSkinnedMesh ? mesh.geometry.getAttribute("skinIndex") : null;
    const skinWeight = skinned.isSkinnedMesh ? mesh.geometry.getAttribute("skinWeight") : null;
    toHeadMatrix.multiplyMatrices(inverseHead, mesh.matrixWorld);

    const stride = Math.max(1, Math.ceil(position.count / 4096));
    for (let i = 0; i < position.count; i += stride) {
      if (eligibleBones && skinIndex && skinWeight) {
        let influence = 0;
        for (let c = 0; c < 4; c += 1) {
          if (eligibleBones[skinIndex.getComponent(i, c)]) influence += skinWeight.getComponent(i, c);
        }
        if (influence < 0.5) continue;
      }

      tempVertex.fromBufferAttribute(position, i).applyMatrix4(toHeadMatrix).applyQuaternion(toCanonicalQuat);
      if (!Number.isFinite(tempVertex.x) || !Number.isFinite(tempVertex.y) || !Number.isFinite(tempVertex.z)) continue;
      if (tempVertex.y <= 0.002 || tempVertex.y > 0.48 || Math.abs(tempVertex.x) > 0.32 || Math.abs(tempVertex.z) > 0.32) {
        continue;
      }

      if (tempVertex.x < minX) minX = tempVertex.x;
      if (tempVertex.x > maxX) maxX = tempVertex.x;
      if (tempVertex.z < minZ) minZ = tempVertex.z;
      if (tempVertex.z > maxZ) maxZ = tempVertex.z;
      if (tempVertex.y > maxY) maxY = tempVertex.y;
      sampleCount += 1;
    }
  });

  if (sampleCount >= 8 && maxY > 0.06 && maxX - minX > 0.06 && maxZ - minZ > 0.06) {
    const crownHeightM = maxY;
    const skullWidthM = maxX - minX;
    const skullDepthM = maxZ - minZ;

    let eyeLineHeightM = crownHeightM * 0.5;
    const leftEye = vrm.humanoid?.getRawBoneNode?.("leftEye") ?? vrm.humanoid?.getNormalizedBoneNode?.("leftEye");
    const rightEye = vrm.humanoid?.getRawBoneNode?.("rightEye") ?? vrm.humanoid?.getNormalizedBoneNode?.("rightEye");
    if (leftEye && rightEye) {
      const ly = leftEye.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseHead).y;
      const ry = rightEye.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseHead).y;
      const avgEyeY = (ly + ry) * 0.5;
      if (avgEyeY >= crownHeightM * 0.2 && avgEyeY <= crownHeightM * 0.8) {
        eyeLineHeightM = avgEyeY;
      }
    }

    return {
      headWorldOrigin,
      crownHeightM,
      skullWidthM,
      skullDepthM,
      eyeLineHeightM,
      forwardSign,
      source: "measured-mesh",
    };
  }

  const neckBone = vrm.humanoid?.getRawBoneNode?.("neck") ?? vrm.humanoid?.getNormalizedBoneNode?.("neck");
  const neckGap = neckBone
    ? clamp(Math.abs(headWorldOriginVec.y - neckBone.getWorldPosition(new THREE.Vector3()).y), 0.04, 0.14)
    : 0.08;
  const crownHeightM = clamp(neckGap * 2.65, 0.16, 0.34);

  return {
    headWorldOrigin,
    crownHeightM,
    skullWidthM: crownHeightM * 0.78,
    skullDepthM: crownHeightM * 0.86,
    eyeLineHeightM: crownHeightM * 0.5,
    forwardSign,
    source: "bone-landmark",
  };
}

/** 도너 두개골을 타깃 두개골 5점 해부 랜드마크에 아핀 정렬한다. */
export function computeSkullToSkullAlignment(
  donorSkull: SkullFrameMetrics,
  targetSkull: SkullFrameMetrics,
  manualOffsetMm: Vec3Tuple = [0, 0, 0],
  manualScaleMultiplier: Vec3Tuple = [1, 1, 1],
): SkullAlignmentTransform {
  const donorSpanY = Math.max(0.02, donorSkull.crownHeightM - donorSkull.eyeLineHeightM);
  const targetSpanY = Math.max(0.02, targetSkull.crownHeightM - targetSkull.eyeLineHeightM);

  const sx = clamp((targetSkull.skullWidthM / Math.max(0.04, donorSkull.skullWidthM)) * clamp(manualScaleMultiplier[0], 0.5, 1.8), 0.45, 2.4);
  const sy = clamp((targetSpanY / donorSpanY) * clamp(manualScaleMultiplier[1], 0.5, 1.8), 0.45, 2.4);
  const sz = clamp((targetSkull.skullDepthM / Math.max(0.04, donorSkull.skullDepthM)) * clamp(manualScaleMultiplier[2], 0.5, 1.8), 0.45, 2.4);

  const offsetX = manualOffsetMm[0] / 1000;
  const offsetY = targetSkull.crownHeightM - donorSkull.crownHeightM * sy + manualOffsetMm[1] / 1000;
  const offsetZ = manualOffsetMm[2] / 1000;

  const crownResidualMm = roundTo(Math.abs(donorSkull.crownHeightM * sy + offsetY - targetSkull.crownHeightM) * 1000, 4);
  const eyeLineResidualMm = roundTo(Math.abs(donorSkull.eyeLineHeightM * sy + offsetY - targetSkull.eyeLineHeightM) * 1000, 4);
  const widthResidualMm = roundTo(Math.abs(donorSkull.skullWidthM * sx - targetSkull.skullWidthM) * 1000, 4);
  const depthResidualMm = roundTo(Math.abs(donorSkull.skullDepthM * sz - targetSkull.skullDepthM) * 1000, 4);
  const maxLandmarkErrorMm = roundTo(
    Math.max(
      crownResidualMm,
      eyeLineResidualMm,
      widthResidualMm * 0.5 + Math.abs(offsetX) * 1000,
      depthResidualMm * 0.5 + Math.abs(offsetZ) * 1000,
    ),
    4,
  );

  return {
    scale: [roundTo(sx, 5), roundTo(sy, 5), roundTo(sz, 5)],
    offsetMeters: [roundTo(offsetX, 6), roundTo(offsetY, 6), roundTo(offsetZ, 6)],
    offsetMm: [roundTo(offsetX * 1000, 2), roundTo(offsetY * 1000, 2), roundTo(offsetZ * 1000, 2)],
    yawCompensationRad: donorSkull.forwardSign !== targetSkull.forwardSign ? Math.PI : 0,
    crownResidualMm,
    widthResidualMm,
    depthResidualMm,
    eyeLineResidualMm,
    maxLandmarkErrorMm,
  };
}

export function classifyCanonicalHairZone(
  cx: number,
  cz: number,
  skull: SkullFrameMetrics,
): Exclude<HairZoneKind, "crown"> {
  if (cz >= skull.skullDepthM * 0.16) return "front";
  if (cz > -skull.skullDepthM * 0.22) {
    if (cx >= skull.skullWidthM * 0.2) return "side-left";
    if (cx <= -skull.skullWidthM * 0.2) return "side-right";
  }
  return "back";
}

/**
 * 정규 낙차율(`dropY ∈ [0..1]`)에 대한 두피 고정 → 3마디 SpringBone 이진 유리수(1/1024) 가중치를 계산한다.
 * 반환 4튜플 `[wHead, wUpper, wMid, wTip]`의 합은 IEEE-754 Float32/Float64 모두에서 정확히 `1.0`이다.
 */
export function computeQuantizedHairVertexWeights(
  dropRatio: number,
  config: HairBoneWeightConfig,
): readonly [number, number, number, number] {
  const u = clamp(dropRatio, 0, 1);
  if (u <= config.scalpPinRadiusRatio) return [1, 0, 0, 0];

  const t = clamp((u - config.scalpPinRadiusRatio) / Math.max(0.05, 1 - config.scalpPinRadiusRatio), 0, 1);
  const smooth = t * t * (3 - 2 * t);
  const sway = clamp((0.28 * t + 0.72 * smooth) * config.maxTipSwayWeight, 0, config.maxTipSwayWeight);

  let rUpper = 0;
  let rMid = 0;
  let rTip = 0;
  if (t < 0.42) {
    const p = t / 0.42;
    rUpper = sway * (1 - p);
    rMid = sway * p;
  } else if (t < 0.78) {
    const p = (t - 0.42) / 0.36;
    rMid = sway * (1 - p);
    rTip = sway * p;
  } else {
    rTip = sway;
  }

  let kUpper = Math.round(rUpper * WEIGHT_QUANTA);
  let kMid = Math.round(rMid * WEIGHT_QUANTA);
  let kTip = Math.round(rTip * WEIGHT_QUANTA);
  const secTotal = kUpper + kMid + kTip;
  if (secTotal > WEIGHT_QUANTA) {
    const overflow = secTotal - WEIGHT_QUANTA;
    if (kTip >= overflow) kTip -= overflow;
    else if (kMid >= overflow) kMid -= overflow;
    else kUpper = Math.max(0, kUpper - overflow);
  }
  const kHead = WEIGHT_QUANTA - kUpper - kMid - kTip;

  return [kHead / WEIGHT_QUANTA, kUpper / WEIGHT_QUANTA, kMid / WEIGHT_QUANTA, kTip / WEIGHT_QUANTA];
}

export function buildReboundWeightBands(
  bandTotals: readonly { headSum: number; secSum: number; count: number }[],
): readonly BoneWeightZoneBand[] {
  return WEIGHT_BAND_SPECS.map((spec, idx) => {
    const bucket = bandTotals[idx] ?? { headSum: 0, secSum: 0, count: 0 };
    const avgHead = bucket.count > 0 ? roundTo(bucket.headSum / bucket.count, 4) : idx === 0 ? 1 : 0;
    const avgSec = bucket.count > 0 ? roundTo(bucket.secSum / bucket.count, 4) : roundTo(1 - avgHead, 4);
    return {
      bandIndex: spec.bandIndex,
      labelKo: spec.labelKo,
      labelEn: spec.labelEn,
      dropRangeRatio: spec.range,
      avgHeadWeight: avgHead,
      avgSecondaryWeight: avgSec,
      vertexCount: bucket.count,
    };
  });
}

export function getDonorHairCatalogEntry(donorId: HairTransplantDonorId): HairTransplantDonorCatalogEntry {
  return DONOR_HAIR_CATALOG.find((entry) => entry.id === donorId) ?? DONOR_HAIR_CATALOG[0]!;
}

export function getTargetHeadProportionPreset(
  proportionId: TargetHeadProportionId,
): TargetHeadProportionPreset {
  return TARGET_HEAD_PROPORTION_PRESETS.find((entry) => entry.id === proportionId) ?? TARGET_HEAD_PROPORTION_PRESETS[0]!;
}

/**
 * 카탈로그 프리셋 기반 결정적 이식 계획(두개골 정렬 · 5구간 본 웨이트 히트바 · MToon ΔE00 보정)을 계산한다.
 */
export function buildHairTransplantManifest(
  donorId: HairTransplantDonorId,
  targetProportionId: TargetHeadProportionId,
  options: {
    readonly manualOffsetMm?: Vec3Tuple;
    readonly manualScaleMultiplier?: Vec3Tuple;
    readonly boneWeight?: Partial<HairBoneWeightConfig>;
    readonly colorHarmony?: Partial<HairColorHarmonyConfig>;
    readonly replaceOriginalHair?: boolean;
  } = {},
): VrmHairTransplantManifest {
  const donor = getDonorHairCatalogEntry(donorId);
  const target = getTargetHeadProportionPreset(targetProportionId);
  const alignment = computeSkullToSkullAlignment(
    donor.defaultSkull,
    target.skull,
    options.manualOffsetMm ?? [0, 0, 0],
    options.manualScaleMultiplier ?? [1, 1, 1],
  );
  const boneWeightConfig = normalizeBoneWeightConfig(options.boneWeight);
  const harmonyConfig = normalizeColorHarmonyConfig(options.colorHarmony);

  const sampleSteps = 100;
  const bandTotals = WEIGHT_BAND_SPECS.map(() => ({ headSum: 0, secSum: 0, count: 0 }));
  let minScalpHead = 1;
  let scalpSum = 0;
  let scalpCnt = 0;
  let tipSecSum = 0;
  let maxTipSec = 0;
  let minTipBone = 1;
  let tipCnt = 0;
  let maxDev = 0;

  for (let i = 0; i <= sampleSteps; i += 1) {
    const dropY = i / sampleSteps;
    const [wHead, wUpper, wMid, wTip] = computeQuantizedHairVertexWeights(dropY, boneWeightConfig);
    const sec = wUpper + wMid + wTip;
    const dev = Math.abs(wHead + sec - 1);
    if (dev > maxDev) maxDev = dev;
    if (dropY <= boneWeightConfig.scalpPinRadiusRatio) {
      if (wHead < minScalpHead) minScalpHead = wHead;
      scalpSum += wHead;
      scalpCnt += 1;
    }
    if (dropY >= 0.85) {
      tipSecSum += sec;
      if (sec > maxTipSec) maxTipSec = sec;
      if (wTip < minTipBone) minTipBone = wTip;
      tipCnt += 1;
    }
    const bandIdx = WEIGHT_BAND_SPECS.findIndex(
      (spec, idx) =>
        dropY >= spec.range[0] && (idx === WEIGHT_BAND_SPECS.length - 1 ? dropY <= spec.range[1] : dropY < spec.range[1]),
    );
    const bucket = bandTotals[bandIdx >= 0 ? bandIdx : WEIGHT_BAND_SPECS.length - 1]!;
    bucket.headSum += wHead;
    bucket.secSum += sec;
    bucket.count += 1;
  }

  const targetBaseRgb = harmonyConfig.tintOverrideRgb ?? target.targetBodyDna.desiredHairTintRgb;
  const harmonizedBaseRgb = blendOklabRgb(donor.hairMetrics.defaultBaseRgb, targetBaseRgb, harmonyConfig.harmonyStrength);
  const targetIdealShadeRgb: Rgb01 = {
    r: clamp(targetBaseRgb.r * target.targetBodyDna.shadeTintRgb.r * 0.72, 0.03, 1),
    g: clamp(targetBaseRgb.g * target.targetBodyDna.shadeTintRgb.g * 0.72, 0.03, 1),
    b: clamp(targetBaseRgb.b * target.targetBodyDna.shadeTintRgb.b * 0.72, 0.03, 1),
  };
  const harmonizedShadeRgb: Rgb01 = {
    r: clamp(harmonizedBaseRgb.r * target.targetBodyDna.shadeTintRgb.r * 0.72, 0.03, 1),
    g: clamp(harmonizedBaseRgb.g * target.targetBodyDna.shadeTintRgb.g * 0.72, 0.03, 1),
    b: clamp(harmonizedBaseRgb.b * target.targetBodyDna.shadeTintRgb.b * 0.72, 0.03, 1),
  };

  const beforeDeltaE00 = roundTo(computeCiede2000Rgb(donor.hairMetrics.defaultShadeRgb, targetIdealShadeRgb), 2);
  const afterDeltaE00 = roundTo(computeCiede2000Rgb(harmonizedShadeRgb, targetIdealShadeRgb), 2);
  const improvementPercent =
    beforeDeltaE00 > 0.01 ? roundTo(((beforeDeltaE00 - afterDeltaE00) / beforeDeltaE00) * 100, 1) : 0;

  const skinPreview: ReboundSkinMetrics = {
    totalVertices: Math.round(donor.hairMetrics.triangleEstimate * 0.68),
    maxWeightSumDeviation: maxDev,
    minScalpRootHeadWeight: scalpCnt > 0 ? minScalpHead : 1,
    meanScalpRootHeadWeight: scalpCnt > 0 ? roundTo(scalpSum / scalpCnt, 4) : 1,
    meanTipSecondaryWeight: tipCnt > 0 ? roundTo(tipSecSum / tipCnt, 4) : boneWeightConfig.maxTipSwayWeight,
    maxTipSecondaryWeight: maxTipSec,
    minTipBoneWeight: tipCnt > 0 ? minTipBone : boneWeightConfig.maxTipSwayWeight,
    secondaryBoneCount: donor.hairMetrics.strandZones.length * boneWeightConfig.secondaryJointCount,
    springChainCount: donor.hairMetrics.strandZones.length,
    weightBands: buildReboundWeightBands(bandTotals),
  };

  const mtoonHarmony: HairMtoonHarmonyReport = {
    beforeDeltaE00,
    afterDeltaE00,
    improvementPercent,
    harmonyGrade: resolveGradeFromDeltaE(afterDeltaE00),
    shadingToonyFactor: target.targetBodyDna.shadingToonyFactor,
    shadingShiftFactor: target.targetBodyDna.shadingShiftFactor,
    giEqualizationFactor: target.targetBodyDna.giEqualizationFactor,
    outlineWidthMode: target.targetBodyDna.outlineWidthMode,
    outlineWidthFactor: target.targetBodyDna.outlineWidthFactor,
    vColorShaderPatched: true,
    patchedMaterialCount: harmonyConfig.enableOutlineMesh ? 2 : 1,
    donorBaseOklch: srgbToOklch(donor.hairMetrics.defaultBaseRgb),
    harmonizedBaseOklch: srgbToOklch(harmonizedBaseRgb),
    harmonizedShadeOklch: srgbToOklch(harmonizedShadeRgb),
    targetBodyShadeOklch: srgbToOklch(targetIdealShadeRgb),
  };

  const replaceOriginalHair = options.replaceOriginalHair ?? true;
  const sigSeed = JSON.stringify({
    donorId: donor.id,
    targetProportionId: target.id,
    scale: alignment.scale,
    offsetMm: alignment.offsetMm,
    scalpPin: boneWeightConfig.scalpPinRadiusRatio,
    maxTip: boneWeightConfig.maxTipSwayWeight,
    harmony: harmonyConfig.harmonyStrength,
    replaceOriginalHair,
  });

  return {
    version: 1,
    donorId: donor.id,
    donorVrmAssetId: donor.vrmAssetId,
    donorVrmUrl: donor.vrmUrl,
    donorStyleLabelKo: donor.styleLabelKo,
    targetProportionId: target.id,
    targetLabelKo: target.labelKo,
    alignment,
    boneWeightConfig,
    skinPreview,
    mtoonHarmony,
    replaceOriginalHair,
    createdSignature: `vrm-hair-xplant:${fnv1aHex(sigSeed)}`,
  };
}
