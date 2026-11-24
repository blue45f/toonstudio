/**
 * 크로스 VRM 실물 아티스트 헤어 이식 · 가상 SpringBone 스키닝 · MToon DNA 조화 · 롤백 엔진.
 *
 * - 도너 VRM의 실물 3D 헤어 메시를 복제·두개골 정렬한 뒤 타깃 `head` + 4구역 가상 SpringBone
 *   계층으로 `skinIndex`/`skinWeight`를 재매핑한다(모든 정점 가중치 합 === 1.0).
 * - 타깃 본체 MToon DNA를 상속하고 `patchStudioVrmMToonVertexColorShader`를 전 재질에 적용하며,
 *   `dispose()` 호출 시 생성 GPU 자원을 전량 폐기하고 타깃 원본 헤어 가시성을 100% 원복한다.
 */

import { MToonMaterial, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

import {
  blendOklabRgb,
  clamp,
  computeCiede2000Rgb,
  roundTo,
  srgbToOklch,
  type Rgb01,
} from "../vrm-auto-shader-transfer/color-science-oklch";
import {
  createStudioVrmHairAngelRingMatcapTexture,
  deriveStudioVrmHarmonizedOutlineColor,
  deriveStudioVrmHarmonizedShadeColor,
  patchStudioVrmMToonVertexColorShader,
  sampleStudioVrmBodyMtoonProfile,
  STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY,
  STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY,
  syncStudioVrmCustomPartToActiveVrm,
  type StudioVrmBodyMtoonProfile,
} from "../vrm/studio-vrm-custom-part-material";

import {
  buildHairTransplantManifest,
  buildReboundWeightBands,
  classifyCanonicalHairZone,
  computeQuantizedHairVertexWeights,
  computeSkullToSkullAlignment,
  extractDonorHairMeshes,
  fnv1aHex,
  getDonorHairCatalogEntry,
  getTargetHeadProportionPreset,
  isHairMeshCandidate,
  measureVrmSkullFrame,
  normalizeBoneWeightConfig,
  normalizeColorHarmonyConfig,
  resolveGradeFromDeltaE,
  resolveHeadBone,
  STUDIO_VRM_HAIR_TRANSPLANT_KEY,
  WEIGHT_BAND_SPECS,
} from "./hair-skull-and-weights";
import type {
  ExtractedDonorHairMesh,
  HairBoneWeightConfig,
  HairColorHarmonyConfig,
  HairMtoonHarmonyReport,
  HairZoneKind,
  ReboundSkinMetrics,
  SkullAlignmentTransform,
  SkullFrameMetrics,
  VrmHairTransplantOptions,
  VrmHairTransplantResultHandle,
  VrmHairVirtualSpringChain,
  VrmTransplantActorLike,
} from "./types";

export {
  buildHairTransplantManifest,
  computeQuantizedHairVertexWeights,
  computeSkullToSkullAlignment,
  extractDonorHairMeshes,
  getDonorHairCatalogEntry,
  getTargetHeadProportionPreset,
  isHairMeshCandidate,
  measureVrmSkullFrame,
  STUDIO_VRM_HAIR_TRANSPLANT_KEY,
};

function rgb01ToThreeColor(rgb: Rgb01): THREE.Color {
  return new THREE.Color().setRGB(
    clamp(rgb.r, 0, 1),
    clamp(rgb.g, 0, 1),
    clamp(rgb.b, 0, 1),
    THREE.SRGBColorSpace,
  );
}

function threeColorToRgb01(color: THREE.Color): Rgb01 {
  const out = { r: 0, g: 0, b: 0 };
  color.getRGB(out, THREE.SRGBColorSpace);
  return { r: clamp(out.r, 0, 1), g: clamp(out.g, 0, 1), b: clamp(out.b, 0, 1) };
}

function resolveZoneSpringTuning(
  zone: Exclude<HairZoneKind, "crown">,
  config: HairBoneWeightConfig,
): { readonly stiffness: number; readonly dragForce: number; readonly gravityPower: number; readonly hitRadius: number } {
  if (zone === "front") {
    return {
      stiffness: roundTo(clamp(config.stiffness * 1.28, 0.2, 1.8), 3),
      dragForce: roundTo(clamp(config.dragForce * 1.15, 0.1, 0.95), 3),
      gravityPower: roundTo(clamp(config.gravityPower * 0.72, 0, 1), 3),
      hitRadius: 0.012,
    };
  }
  if (zone === "side-left" || zone === "side-right") {
    return {
      stiffness: roundTo(clamp(config.stiffness * 1.04, 0.2, 1.6), 3),
      dragForce: roundTo(clamp(config.dragForce * 1.05, 0.1, 0.95), 3),
      gravityPower: roundTo(clamp(config.gravityPower * 0.95, 0, 1.1), 3),
      hitRadius: 0.016,
    };
  }
  return {
    stiffness: roundTo(clamp(config.stiffness * 0.86, 0.15, 1.5), 3),
    dragForce: roundTo(clamp(config.dragForce, 0.1, 0.95), 3),
    gravityPower: roundTo(clamp(config.gravityPower * 1.1, 0, 1.2), 3),
    hitRadius: 0.022,
  };
}

interface AlignedHairDraft {
  readonly source: ExtractedDonorHairMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly canonicalPositions: Float32Array;
}

function cloneAndAlignGeometryToTargetHeadSpace(
  source: ExtractedDonorHairMesh,
  donorHead: THREE.Object3D | null,
  donorSkull: SkullFrameMetrics,
  targetSkull: SkullFrameMetrics,
  alignment: SkullAlignmentTransform,
): AlignedHairDraft {
  const cloned = source.mesh.geometry.clone();
  const posAttr = cloned.getAttribute("position");
  const count = posAttr.count;
  const canonicalPositions = new Float32Array(count * 3);

  const inverseDonorHead = donorHead
    ? donorHead.matrixWorld.clone().invert()
    : new THREE.Matrix4().makeTranslation(
        -donorSkull.headWorldOrigin[0],
        -donorSkull.headWorldOrigin[1],
        -donorSkull.headWorldOrigin[2],
      );
  const toDonorHead = inverseDonorHead.multiply(source.mesh.matrixWorld);

  const donorToCanonical = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    donorSkull.forwardSign === -1 ? Math.PI : 0,
  );
  const canonicalToTarget = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    targetSkull.forwardSign === -1 ? Math.PI : 0,
  );

  const [sx, sy, sz] = alignment.scale;
  const [ox, oy, oz] = alignment.offsetMeters;

  const v = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(toDonorHead).applyQuaternion(donorToCanonical);
    const cx = v.x * sx + ox;
    const cy = v.y * sy + oy;
    const cz = v.z * sz + oz;
    canonicalPositions[i * 3] = cx;
    canonicalPositions[i * 3 + 1] = cy;
    canonicalPositions[i * 3 + 2] = cz;

    v.set(cx, cy, cz).applyQuaternion(canonicalToTarget);
    posAttr.setXYZ(i, v.x, v.y, v.z);
  }
  posAttr.needsUpdate = true;

  const normalAttr = cloned.getAttribute("normal");
  if (normalAttr) {
    const donorNormalMat = new THREE.Matrix3().getNormalMatrix(toDonorHead);
    const n = new THREE.Vector3();
    for (let i = 0; i < normalAttr.count; i += 1) {
      n.fromBufferAttribute(normalAttr, i).applyMatrix3(donorNormalMat).applyQuaternion(donorToCanonical);
      n.set(n.x / sx, n.y / sy, n.z / sz).applyQuaternion(canonicalToTarget).normalize();
      normalAttr.setXYZ(i, n.x, n.y, n.z);
    }
    normalAttr.needsUpdate = true;
  } else {
    cloned.computeVertexNormals();
  }

  cloned.computeBoundingBox();
  cloned.computeBoundingSphere();
  return { source, geometry: cloned, canonicalPositions };
}

function extractMaterialColors(raw: THREE.Material): {
  readonly baseRgb: Rgb01;
  readonly shadeRgb: Rgb01;
  readonly map: THREE.Texture | null;
  readonly normalMap: THREE.Texture | null;
  readonly emissiveMap: THREE.Texture | null;
  readonly alphaTest: number;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly side: THREE.Side;
  readonly vertexColors: boolean;
} {
  const mat = raw as THREE.MeshStandardMaterial & { readonly shadeColorFactor?: THREE.Color };
  const baseRgb: Rgb01 = mat.color?.isColor ? threeColorToRgb01(mat.color) : { r: 0.35, g: 0.28, b: 0.32 };
  const shadeRgb: Rgb01 = mat.shadeColorFactor?.isColor
    ? threeColorToRgb01(mat.shadeColorFactor)
    : { r: baseRgb.r * 0.62, g: baseRgb.g * 0.58, b: baseRgb.b * 0.68 };

  return {
    baseRgb,
    shadeRgb,
    map: mat.map ?? null,
    normalMap: mat.normalMap ?? null,
    emissiveMap: mat.emissiveMap ?? null,
    alphaTest: typeof mat.alphaTest === "number" ? mat.alphaTest : 0,
    transparent: mat.transparent === true,
    opacity: typeof mat.opacity === "number" ? clamp(mat.opacity, 0, 1) : 1,
    side: mat.side ?? THREE.DoubleSide,
    vertexColors: mat.vertexColors === true,
  };
}

function buildHarmonizedHairMaterial(
  rawSource: THREE.Material,
  profile: StudioVrmBodyMtoonProfile,
  harmony: HairColorHarmonyConfig,
  hasGeometryVertexColors: boolean,
  ownedTextures: THREE.Texture[],
): {
  readonly main: MToonMaterial;
  readonly outline: MToonMaterial | null;
  readonly beforeDeltaE00: number;
  readonly afterDeltaE00: number;
  readonly donorBaseRgb: Rgb01;
  readonly harmonizedBaseRgb: Rgb01;
  readonly harmonizedShadeRgb: Rgb01;
  readonly targetShadeRefRgb: Rgb01;
} {
  const info = extractMaterialColors(rawSource);
  const bodyShadeTintColor = new THREE.Color(profile.shadeTintHex);
  const bodyShadeRefRgb = threeColorToRgb01(bodyShadeTintColor.clone().multiplyScalar(profile.shadeDarkness));

  const targetBaseRgb: Rgb01 = harmony.tintOverrideRgb
    ? harmony.tintOverrideRgb
    : blendOklabRgb(info.baseRgb, threeColorToRgb01(bodyShadeTintColor), 0.36);

  const harmonizedBaseRgb = blendOklabRgb(info.baseRgb, targetBaseRgb, harmony.harmonyStrength);
  const harmonizedBaseColor = rgb01ToThreeColor(harmonizedBaseRgb);
  const harmonizedShadeColor = deriveStudioVrmHarmonizedShadeColor(harmonizedBaseColor, profile);
  const targetIdealShadeColor = deriveStudioVrmHarmonizedShadeColor(rgb01ToThreeColor(targetBaseRgb), profile);
  const harmonizedShadeRgb = threeColorToRgb01(harmonizedShadeColor);
  const targetIdealShadeRgb = threeColorToRgb01(targetIdealShadeColor);

  const beforeDeltaE00 = roundTo(computeCiede2000Rgb(info.shadeRgb, targetIdealShadeRgb), 2);
  const afterDeltaE00 = roundTo(computeCiede2000Rgb(harmonizedShadeRgb, targetIdealShadeRgb), 2);

  const outlineColor = deriveStudioVrmHarmonizedOutlineColor(harmonizedBaseColor, profile);
  const rimColor = harmonizedBaseColor.clone().lerp(new THREE.Color(profile.rimColorHex), 0.7);
  const useVertexColors = info.vertexColors || hasGeometryVertexColors;

  let matcapTexture: THREE.DataTexture | null = null;
  let matcapFactor = new THREE.Color(0, 0, 0);
  if (harmony.enableAngelRingMatcap) {
    matcapTexture = createStudioVrmHairAngelRingMatcapTexture(clamp(0.28 + harmony.shine * 0.72, 0, 1));
    ownedTextures.push(matcapTexture);
    matcapFactor = harmonizedBaseColor
      .clone()
      .lerp(new THREE.Color(0xffffff), 0.62)
      .multiplyScalar(0.32 + harmony.shine * 0.45);
  }

  const main = patchStudioVrmMToonVertexColorShader(
    new MToonMaterial({
      color: harmonizedBaseColor,
      ...(harmony.preserveOriginalTextures && info.map ? { map: info.map } : {}),
      ...(harmony.preserveOriginalTextures && info.normalMap ? { normalMap: info.normalMap } : {}),
      ...(harmony.preserveOriginalTextures && info.emissiveMap ? { emissiveMap: info.emissiveMap } : {}),
      ...(matcapTexture ? { matcapTexture } : {}),
      alphaTest: info.alphaTest,
      transparent: info.transparent,
      opacity: info.opacity,
      depthWrite: !info.transparent,
      side: info.side,
      vertexColors: useVertexColors,
      ignoreVertexColor: !useVertexColors,
      shadeColorFactor: harmonizedShadeColor,
      shadingToonyFactor: profile.shadingToonyFactor,
      shadingShiftFactor: clamp(profile.shadingShiftFactor - 0.04, -0.35, 0.16),
      giEqualizationFactor: clamp(Math.max(profile.giEqualizationFactor, 0.88), 0.7, 0.96),
      matcapFactor,
      parametricRimColorFactor: rimColor,
      rimLightingMixFactor: clamp(profile.rimLightingMixFactor + 0.06, 0.22, 0.78),
      parametricRimFresnelPowerFactor: clamp(profile.parametricRimFresnelPowerFactor * 0.88, 2.5, 5.5),
      parametricRimLiftFactor: clamp(profile.parametricRimLiftFactor + 0.05 + harmony.shine * 0.06, 0.06, 0.26),
      outlineWidthMode: profile.outlineWidthMode,
      outlineWidthFactor: profile.outlineWidthFactor,
      outlineColorFactor: outlineColor,
      outlineLightingMixFactor: profile.outlineLightingMixFactor,
    }),
  );
  main.name = rawSource.name ? `${rawSource.name}:transplant-mtoon` : "vrm-hair-transplant:mtoon";
  main.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "hair-transplant" };
  main.userData[STUDIO_VRM_HAIR_TRANSPLANT_KEY] = true;

  let outline: MToonMaterial | null = null;
  if (harmony.enableOutlineMesh && !info.transparent && profile.outlineWidthMode !== "none") {
    outline = patchStudioVrmMToonVertexColorShader(
      new MToonMaterial({
        color: new THREE.Color(0xffffff),
        isOutline: true,
        side: THREE.BackSide,
        transparent: false,
        depthWrite: true,
        outlineWidthMode: profile.outlineWidthMode,
        outlineWidthFactor:
          profile.outlineWidthMode === "screenCoordinates"
            ? clamp(profile.outlineWidthFactor * 0.82, 0.0008, 0.0022)
            : clamp(profile.outlineWidthFactor * 0.82, 0.0008, 0.0024),
        outlineColorFactor: outlineColor.clone(),
        outlineLightingMixFactor: profile.outlineLightingMixFactor,
        shadeColorFactor: harmonizedShadeColor.clone(),
        shadingToonyFactor: profile.shadingToonyFactor,
        shadingShiftFactor: clamp(profile.shadingShiftFactor - 0.04, -0.35, 0.16),
        giEqualizationFactor: clamp(Math.max(profile.giEqualizationFactor, 0.88), 0.7, 0.96),
      }),
    );
    outline.name = `${main.name}:outline`;
    outline.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "hair-transplant-outline" };
    outline.userData[STUDIO_VRM_HAIR_TRANSPLANT_KEY] = true;
  }

  return {
    main,
    outline,
    beforeDeltaE00,
    afterDeltaE00,
    donorBaseRgb: info.baseRgb,
    harmonizedBaseRgb,
    harmonizedShadeRgb,
    targetShadeRefRgb: bodyShadeRefRgb,
  };
}

/**
 * 도너 VRM의 실물 아티스트 헤어 메시를 타깃 VRM의 두개골에 정밀 이식하고
 * 본 웨이트 재매핑·MToon DNA 조화·원본 헤어 숨김·롤백 핸들을 반환한다.
 */
export function transplantVrmHair(
  donorVrm: VrmTransplantActorLike,
  targetVrm: VrmTransplantActorLike,
  options: VrmHairTransplantOptions = {},
): VrmHairTransplantResultHandle {
  const extracted = extractDonorHairMeshes(donorVrm, options.donorHairMeshNames);
  if (extracted.length === 0) {
    throw new Error("도너 VRM에서 이식 가능한 헤어 메시를 찾지 못했습니다.");
  }

  const donorHead = resolveHeadBone(donorVrm);
  const targetHead = resolveHeadBone(targetVrm);
  if (!targetHead) {
    throw new Error("타깃 VRM에서 head 본을 찾지 못했습니다.");
  }

  const donorSkull = measureVrmSkullFrame(donorVrm);
  const targetSkull = measureVrmSkullFrame(targetVrm);
  const alignment = computeSkullToSkullAlignment(
    donorSkull,
    targetSkull,
    options.manualOffsetMm ?? [0, 0, 0],
    options.manualScaleMultiplier ?? [1, 1, 1],
  );

  const boneConfig = normalizeBoneWeightConfig(options.boneWeight);
  const harmonyConfig = normalizeColorHarmonyConfig(options.colorHarmony);
  const drafts = extracted.map((source) =>
    cloneAndAlignGeometryToTargetHeadSpace(source, donorHead, donorSkull, targetSkull, alignment),
  );

  let hairMaxY = targetSkull.crownHeightM;
  let hairMinY = targetSkull.crownHeightM;
  for (const draft of drafts) {
    const arr = draft.canonicalPositions;
    for (let i = 0; i < arr.length; i += 3) {
      const y = arr[i + 1]!;
      if (y > hairMaxY) hairMaxY = y;
      if (y < hairMinY) hairMinY = y;
    }
  }
  const spanY = Math.max(0.05, hairMaxY - hairMinY);

  type ZoneKey = Exclude<HairZoneKind, "crown">;
  const zoneAccum = new Map<
    ZoneKey,
    { bandSums: [THREE.Vector3, THREE.Vector3, THREE.Vector3]; bandCounts: [number, number, number] }
  >();
  const ensureZoneAccum = (zone: ZoneKey) => {
    let entry = zoneAccum.get(zone);
    if (!entry) {
      entry = {
        bandSums: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        bandCounts: [0, 0, 0],
      };
      zoneAccum.set(zone, entry);
    }
    return entry;
  };

  for (const draft of drafts) {
    const arr = draft.canonicalPositions;
    for (let i = 0; i < arr.length; i += 3) {
      const cx = arr[i]!;
      const cy = arr[i + 1]!;
      const cz = arr[i + 2]!;
      const dropY = clamp((hairMaxY - cy) / spanY, 0, 1);
      if (dropY <= boneConfig.scalpPinRadiusRatio) continue;
      const entry = ensureZoneAccum(classifyCanonicalHairZone(cx, cz, targetSkull));
      const tier = dropY < 0.48 ? 0 : dropY < 0.78 ? 1 : 2;
      entry.bandSums[tier]!.add(new THREE.Vector3(cx, cy, cz));
      entry.bandCounts[tier]! += 1;
    }
  }
  if (zoneAccum.size === 0) ensureZoneAccum("back");

  const rootGroup = new THREE.Group();
  rootGroup.name = "studio-vrm-hair-transplant-root";
  rootGroup.userData[STUDIO_VRM_HAIR_TRANSPLANT_KEY] = true;
  targetHead.add(rootGroup);

  const headAnchorBone =
    targetHead instanceof THREE.Bone
      ? targetHead
      : (() => {
          const anchor = new THREE.Bone();
          anchor.name = "HairTransplant_HeadRoot";
          rootGroup.add(anchor);
          return anchor;
        })();

  const allBones: THREE.Bone[] = [headAnchorBone];
  const zoneBoneIndices = new Map<ZoneKey, readonly [number, number, number]>();
  const virtualChains: VrmHairVirtualSpringChain[] = [];
  const canonicalToTarget = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    targetSkull.forwardSign === -1 ? Math.PI : 0,
  );

  for (const zone of ["front", "side-left", "side-right", "back"] as const) {
    const accum = zoneAccum.get(zone);
    if (!accum) continue;

    const defaultX = zone === "side-left" ? targetSkull.skullWidthM * 0.45 : zone === "side-right" ? -targetSkull.skullWidthM * 0.45 : 0;
    const defaultZ = zone === "front" ? targetSkull.skullDepthM * 0.48 : zone === "back" ? -targetSkull.skullDepthM * 0.48 : 0;
    const fallbackTiers: readonly THREE.Vector3[] = [
      new THREE.Vector3(defaultX, hairMaxY - spanY * 0.34, defaultZ),
      new THREE.Vector3(defaultX, hairMaxY - spanY * 0.64, defaultZ),
      new THREE.Vector3(defaultX, hairMaxY - spanY * 0.94, defaultZ),
    ];

    const tierPositions = [0, 1, 2].map((tier) => {
      const cnt = accum.bandCounts[tier]!;
      const pos = cnt > 0 ? accum.bandSums[tier]!.clone().divideScalar(cnt) : fallbackTiers[tier]!.clone();
      return pos.applyQuaternion(canonicalToTarget);
    });

    const upperBone = new THREE.Bone();
    upperBone.name = `HairTransplant_${zone}_upper`;
    upperBone.position.copy(tierPositions[0]!);
    rootGroup.add(upperBone);

    const midBone = new THREE.Bone();
    midBone.name = `HairTransplant_${zone}_mid`;
    midBone.position.subVectors(tierPositions[1]!, tierPositions[0]!);
    upperBone.add(midBone);

    const tipBone = new THREE.Bone();
    tipBone.name = `HairTransplant_${zone}_tip`;
    tipBone.position.subVectors(tierPositions[2]!, tierPositions[1]!);
    midBone.add(tipBone);

    const upperIdx = allBones.length;
    allBones.push(upperBone, midBone, tipBone);
    zoneBoneIndices.set(zone, [upperIdx, upperIdx + 1, upperIdx + 2]);
    virtualChains.push({
      id: `transplant-chain-${zone}`,
      zone,
      bones: [upperBone, midBone, tipBone],
      ...resolveZoneSpringTuning(zone, boneConfig),
    });
  }

  const fallbackZoneIndices = zoneBoneIndices.values().next().value ?? [1, 2, 3];

  let totalVertices = 0;
  let maxWeightSumDeviation = 0;
  let minScalpRootHeadWeight = 1;
  let scalpRootHeadSum = 0;
  let scalpRootCount = 0;
  let tipSecondarySum = 0;
  let maxTipSecondaryWeight = 0;
  let minTipBoneWeight = 1;
  let tipVertexCount = 0;
  const bandTotals = WEIGHT_BAND_SPECS.map(() => ({ headSum: 0, secSum: 0, count: 0 }));

  for (const draft of drafts) {
    const count = draft.geometry.getAttribute("position").count;
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    const arr = draft.canonicalPositions;

    for (let i = 0; i < count; i += 1) {
      const cx = arr[i * 3]!;
      const cy = arr[i * 3 + 1]!;
      const cz = arr[i * 3 + 2]!;
      const dropY = clamp((hairMaxY - cy) / spanY, 0, 1);
      const [upperIdx, midIdx, tipIdx] =
        zoneBoneIndices.get(classifyCanonicalHairZone(cx, cz, targetSkull)) ?? fallbackZoneIndices;
      const [wHead, wUpper, wMid, wTip] = computeQuantizedHairVertexWeights(dropY, boneConfig);

      const base = i * 4;
      skinIndices[base] = 0;
      skinIndices[base + 1] = upperIdx;
      skinIndices[base + 2] = midIdx;
      skinIndices[base + 3] = tipIdx;

      skinWeights[base] = wHead;
      skinWeights[base + 1] = wUpper;
      skinWeights[base + 2] = wMid;
      skinWeights[base + 3] = wTip;

      const dev = Math.abs(
        skinWeights[base]! + skinWeights[base + 1]! + skinWeights[base + 2]! + skinWeights[base + 3]! - 1,
      );
      if (dev > maxWeightSumDeviation) maxWeightSumDeviation = dev;

      const secWeight = wUpper + wMid + wTip;
      if (dropY <= boneConfig.scalpPinRadiusRatio) {
        if (wHead < minScalpRootHeadWeight) minScalpRootHeadWeight = wHead;
        scalpRootHeadSum += wHead;
        scalpRootCount += 1;
      }
      if (dropY >= 0.85) {
        tipSecondarySum += secWeight;
        if (secWeight > maxTipSecondaryWeight) maxTipSecondaryWeight = secWeight;
        if (wTip < minTipBoneWeight) minTipBoneWeight = wTip;
        tipVertexCount += 1;
      }

      const bandIdx = WEIGHT_BAND_SPECS.findIndex(
        (spec, idx) =>
          dropY >= spec.range[0] && (idx === WEIGHT_BAND_SPECS.length - 1 ? dropY <= spec.range[1] : dropY < spec.range[1]),
      );
      const bucket = bandTotals[bandIdx >= 0 ? bandIdx : WEIGHT_BAND_SPECS.length - 1]!;
      bucket.headSum += wHead;
      bucket.secSum += secWeight;
      bucket.count += 1;
      totalVertices += 1;
    }

    draft.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
    draft.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  }

  targetVrm.scene.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(allBones);
  skeleton.calculateInverses();

  const targetProfile = sampleStudioVrmBodyMtoonProfile(targetVrm as unknown as VRM);
  const createdMaterials: MToonMaterial[] = [];
  const ownedTextures: THREE.Texture[] = [];
  const transplantedMeshes: THREE.SkinnedMesh[] = [];
  const outlineMeshes: THREE.SkinnedMesh[] = [];

  let beforeDeltaSum = 0;
  let afterDeltaSum = 0;
  let materialSampleCount = 0;
  let firstDonorBaseRgb: Rgb01 = { r: 0.3, g: 0.25, b: 0.35 };
  let firstHarmonizedBaseRgb: Rgb01 = firstDonorBaseRgb;
  let firstHarmonizedShadeRgb: Rgb01 = { r: 0.2, g: 0.16, b: 0.25 };
  let firstTargetShadeRgb: Rgb01 = threeColorToRgb01(
    new THREE.Color(targetProfile.shadeTintHex).multiplyScalar(targetProfile.shadeDarkness),
  );

  for (const draft of drafts) {
    const rawMats = Array.isArray(draft.source.mesh.material)
      ? draft.source.mesh.material
      : [draft.source.mesh.material];
    const mainMats: MToonMaterial[] = [];
    let primaryOutlineMat: MToonMaterial | null = null;

    for (const rawMat of rawMats) {
      if (!rawMat) continue;
      const built = buildHarmonizedHairMaterial(
        rawMat,
        targetProfile,
        harmonyConfig,
        draft.source.hasVertexColors,
        ownedTextures,
      );
      mainMats.push(built.main);
      createdMaterials.push(built.main);
      if (built.outline) {
        createdMaterials.push(built.outline);
        if (!primaryOutlineMat) primaryOutlineMat = built.outline;
      }
      beforeDeltaSum += built.beforeDeltaE00;
      afterDeltaSum += built.afterDeltaE00;
      if (materialSampleCount === 0) {
        firstDonorBaseRgb = built.donorBaseRgb;
        firstHarmonizedBaseRgb = built.harmonizedBaseRgb;
        firstHarmonizedShadeRgb = built.harmonizedShadeRgb;
        firstTargetShadeRgb = built.targetShadeRefRgb;
      }
      materialSampleCount += 1;
    }

    const skinnedMesh = new THREE.SkinnedMesh(draft.geometry, mainMats.length === 1 ? mainMats[0]! : mainMats);
    skinnedMesh.name = `transplanted-hair:${draft.source.sourceMeshName}`;
    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;
    skinnedMesh.frustumCulled = false;
    skinnedMesh.userData[STUDIO_VRM_HAIR_TRANSPLANT_KEY] = true;
    skinnedMesh.userData.toonstudioComponent = "hair";
    rootGroup.add(skinnedMesh);
    skinnedMesh.updateMatrixWorld(true);
    skinnedMesh.bind(skeleton, skinnedMesh.matrixWorld);
    transplantedMeshes.push(skinnedMesh);

    if (primaryOutlineMat) {
      const outlineMesh = new THREE.SkinnedMesh(draft.geometry, primaryOutlineMat);
      outlineMesh.name = `transplanted-hair-outline:${draft.source.sourceMeshName}`;
      outlineMesh.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] = true;
      outlineMesh.userData[STUDIO_VRM_HAIR_TRANSPLANT_KEY] = true;
      outlineMesh.raycast = () => undefined;
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      outlineMesh.frustumCulled = false;
      rootGroup.add(outlineMesh);
      outlineMesh.updateMatrixWorld(true);
      outlineMesh.bind(skeleton, outlineMesh.matrixWorld);
      outlineMeshes.push(outlineMesh);
    }
  }

  syncStudioVrmCustomPartToActiveVrm(rootGroup, targetVrm as unknown as VRM);

  const hiddenOriginals: { readonly mesh: THREE.Object3D; readonly prevVisible: boolean }[] = [];
  if (options.replaceOriginalHair !== false) {
    targetVrm.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!isHairMeshCandidate(mesh)) return;
      if (mesh.visible) {
        hiddenOriginals.push({ mesh, prevVisible: mesh.visible });
        mesh.visible = false;
      }
    });
  }

  const meanBefore = materialSampleCount > 0 ? roundTo(beforeDeltaSum / materialSampleCount, 2) : 0;
  const meanAfter = materialSampleCount > 0 ? roundTo(afterDeltaSum / materialSampleCount, 2) : 0;
  const improvementPercent =
    meanBefore > 0.01 ? roundTo(((meanBefore - meanAfter) / meanBefore) * 100, 1) : 0;

  const skinMetrics: ReboundSkinMetrics = {
    totalVertices,
    maxWeightSumDeviation,
    minScalpRootHeadWeight: scalpRootCount > 0 ? minScalpRootHeadWeight : 1,
    meanScalpRootHeadWeight: scalpRootCount > 0 ? roundTo(scalpRootHeadSum / scalpRootCount, 4) : 1,
    meanTipSecondaryWeight: tipVertexCount > 0 ? roundTo(tipSecondarySum / tipVertexCount, 4) : boneConfig.maxTipSwayWeight,
    maxTipSecondaryWeight: tipVertexCount > 0 ? maxTipSecondaryWeight : boneConfig.maxTipSwayWeight,
    minTipBoneWeight: tipVertexCount > 0 ? minTipBoneWeight : boneConfig.maxTipSwayWeight,
    secondaryBoneCount: allBones.length - 1,
    springChainCount: virtualChains.length,
    weightBands: buildReboundWeightBands(bandTotals),
  };

  const mtoonHarmony: HairMtoonHarmonyReport = {
    beforeDeltaE00: meanBefore,
    afterDeltaE00: meanAfter,
    improvementPercent,
    harmonyGrade: resolveGradeFromDeltaE(meanAfter),
    shadingToonyFactor: targetProfile.shadingToonyFactor,
    shadingShiftFactor: targetProfile.shadingShiftFactor,
    giEqualizationFactor: targetProfile.giEqualizationFactor,
    outlineWidthMode: targetProfile.outlineWidthMode,
    outlineWidthFactor: targetProfile.outlineWidthFactor,
    vColorShaderPatched: createdMaterials.every((mat) => mat.customProgramCacheKey().includes("vcolor-rgb-v1")),
    patchedMaterialCount: createdMaterials.length,
    donorBaseOklch: srgbToOklch(firstDonorBaseRgb),
    harmonizedBaseOklch: srgbToOklch(firstHarmonizedBaseRgb),
    harmonizedShadeOklch: srgbToOklch(firstHarmonizedShadeRgb),
    targetBodyShadeOklch: srgbToOklch(firstTargetShadeRgb),
  };

  let disposed = false;
  const transplantId = `hair-transplant-${fnv1aHex(
    `${extracted.map((e) => e.sourceMeshName).join(",")}:${alignment.scale.join(",")}:${totalVertices}`,
  )}`;

  return {
    id: transplantId,
    rootGroup,
    transplantedMeshes,
    outlineMeshes,
    virtualChains,
    donorSkull,
    targetSkull,
    alignment,
    skinMetrics,
    mtoonHarmony,
    hiddenOriginalHairCount: hiddenOriginals.length,
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      rootGroup.removeFromParent();
      for (const draft of drafts) draft.geometry.dispose();
      for (const mat of createdMaterials) mat.dispose();
      for (const tex of ownedTextures) tex.dispose();
      for (const entry of hiddenOriginals) entry.mesh.visible = entry.prevVisible;
    },
  };
}
