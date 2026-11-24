// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { MToonMaterial } from "@pixiv/three-vrm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildHairTransplantManifest,
  computeQuantizedHairVertexWeights,
  computeSkullToSkullAlignment,
  DEFAULT_HAIR_BONE_WEIGHT_CONFIG,
  DONOR_HAIR_CATALOG,
  extractDonorHairMeshes,
  measureVrmSkullFrame,
  StudioVrmHairTransplantPanel,
  transplantVrmHair,
  type VrmHairTransplantManifest,
  type VrmHairTransplantResultHandle,
  type VrmTransplantActorLike,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

interface SyntheticVrmFixture {
  readonly vrm: VrmTransplantActorLike;
  readonly headBone: THREE.Bone;
  readonly hairMesh: THREE.SkinnedMesh;
  readonly hairTexture: THREE.DataTexture;
  readonly skullCrownLocalY: number;
  readonly dispose: () => void;
}

/**
 * 실제 Three.js `SkinnedMesh` + `Bone` + `MToonMaterial` 기반 합성 VRM 리그를 생성한다.
 * 두개골 메시(비-헤어)와 4구역(앞·좌·우·뒤) 실물 헤어 스킨드 메시를 모두 포함한다.
 */
function buildSyntheticVrmRig(params: {
  readonly name: string;
  readonly metaVersion: "0" | "1";
  readonly headY: number;
  readonly crownHeightM: number;
  readonly skullWidthM: number;
  readonly skullDepthM: number;
  readonly hairDropBelowHeadM: number;
  readonly hairBaseColorRgb: readonly [number, number, number];
  readonly bodyShadeRgb: readonly [number, number, number];
  readonly bodyToony: number;
  readonly hairMeshName: string;
}): SyntheticVrmFixture {
  const scene = new THREE.Group();
  scene.name = `${params.name}-scene`;

  const neckBone = new THREE.Bone();
  neckBone.name = "J_Bip_C_Neck";
  neckBone.position.set(0, params.headY - 0.08, 0);
  scene.add(neckBone);

  const headBone = new THREE.Bone();
  headBone.name = "J_Bip_C_Head";
  headBone.position.set(0, 0.08, 0);
  neckBone.add(headBone);

  const forwardSign = params.metaVersion === "0" ? -1 : 1;
  const eyeY = params.crownHeightM * 0.5;
  const leftEye = new THREE.Bone();
  leftEye.name = "J_Adj_L_FaceEye";
  leftEye.position.set(params.skullWidthM * 0.22, eyeY, forwardSign * params.skullDepthM * 0.42);
  headBone.add(leftEye);

  const rightEye = new THREE.Bone();
  rightEye.name = "J_Adj_R_FaceEye";
  rightEye.position.set(-params.skullWidthM * 0.22, eyeY, forwardSign * params.skullDepthM * 0.42);
  headBone.add(rightEye);

  const donorHairBone = new THREE.Bone();
  donorHairBone.name = "J_Sec_HairBack_01";
  donorHairBone.position.set(0, 0.04, -forwardSign * params.skullDepthM * 0.5);
  headBone.add(donorHairBone);

  // 1) 비-헤어 두개골(Face/Skull) SkinnedMesh: 정확한 width/depth/crown 경계 형성.
  const skullGeo = new THREE.SphereGeometry(0.5, 16, 12);
  const skullPos = skullGeo.getAttribute("position");
  const skullIndices = new Uint16Array(skullPos.count * 4);
  const skullWeights = new Float32Array(skullPos.count * 4);
  for (let i = 0; i < skullPos.count; i += 1) {
    const x = skullPos.getX(i) * params.skullWidthM;
    const y = (skullPos.getY(i) + 0.5) * params.crownHeightM;
    const z = skullPos.getZ(i) * params.skullDepthM;
    skullPos.setXYZ(i, x, y, z);
    skullIndices[i * 4] = 0;
    skullWeights[i * 4] = 1;
  }
  skullGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skullIndices, 4));
  skullGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skullWeights, 4));

  const bodyMat = new MToonMaterial({
    color: new THREE.Color().setRGB(0.95, 0.85, 0.8, THREE.SRGBColorSpace),
    shadeColorFactor: new THREE.Color().setRGB(
      params.bodyShadeRgb[0],
      params.bodyShadeRgb[1],
      params.bodyShadeRgb[2],
      THREE.SRGBColorSpace,
    ),
    shadingToonyFactor: params.bodyToony,
    shadingShiftFactor: -0.12,
    giEqualizationFactor: 0.9,
    outlineWidthMode: "worldCoordinates",
    outlineWidthFactor: 0.002,
    outlineColorFactor: new THREE.Color().setRGB(0.14, 0.12, 0.2, THREE.SRGBColorSpace),
  });
  bodyMat.name = `${params.name}_Body_MToon`;

  const skullMesh = new THREE.SkinnedMesh(skullGeo, bodyMat);
  skullMesh.name = "Face_Skull";
  headBone.add(skullMesh);

  // 비-헤어 속눈썹(추출 제외 검증용).
  const lashGeo = new THREE.BoxGeometry(0.03, 0.005, 0.01);
  const lashMat = new THREE.MeshStandardMaterial();
  lashMat.name = "Eyelash_Mat";
  const lashMesh = new THREE.Mesh(lashGeo, lashMat);
  lashMesh.name = "Face_Eyelash";
  lashMesh.position.set(0, eyeY, forwardSign * params.skullDepthM * 0.48);
  headBone.add(lashMesh);

  // 2) 실물 아티스트 헤어 SkinnedMesh: 두피 크라운 + 앞머리/좌우 사이드/뒷머리 가닥 정점 배치.
  const hairPositions: number[] = [];
  const hairNormals: number[] = [];
  const hairUvs: number[] = [];
  const hairColors: number[] = [];
  const hairSkinIndices: number[] = [];
  const hairSkinWeights: number[] = [];

  const pushVertex = (x: number, y: number, z: number, vCoord: number) => {
    hairPositions.push(x, y, z);
    const len = Math.hypot(x, y, z) || 1;
    hairNormals.push(x / len, y / len, z / len);
    hairUvs.push(0.5, vCoord);
    hairColors.push(0.92, 0.88, 0.96);
    hairSkinIndices.push(0, 1, 0, 0);
    hairSkinWeights.push(0.5, 0.5, 0, 0);
  };

  // 정수리 두피 앵커 정점 (정확히 crownHeightM에 위치).
  const rx = params.skullWidthM * 0.5;
  const rz = params.skullDepthM * 0.5;
  const topY = params.crownHeightM;
  const bottomY = -params.hairDropBelowHeadM;

  // 두피 크라운 삼각형 패치.
  pushVertex(0, topY, 0, 0);
  pushVertex(rx * 0.3, topY - 0.005, forwardSign * rz * 0.3, 0.02);
  pushVertex(-rx * 0.3, topY - 0.005, -forwardSign * rz * 0.3, 0.02);

  // 4구역(앞·좌·우·뒤) 세로 리본 스트립(정수리→모발 끝).
  const zoneSpecs: readonly { readonly x: number; readonly z: number }[] = [
    { x: 0, z: forwardSign * rz * 0.95 }, // front bangs
    { x: rx * 0.96, z: 0 }, // side-left
    { x: -rx * 0.96, z: 0 }, // side-right
    { x: 0, z: -forwardSign * rz * 0.96 }, // back long hair
  ];

  const rows = 10;
  for (const zone of zoneSpecs) {
    for (let r = 0; r < rows; r += 1) {
      const f0 = r / rows;
      const f1 = (r + 1) / rows;
      const y0 = topY + (bottomY - topY) * f0;
      const y1 = topY + (bottomY - topY) * f1;
      pushVertex(zone.x - 0.012, y0, zone.z, f0);
      pushVertex(zone.x + 0.012, y0, zone.z, f0);
      pushVertex(zone.x, y1, zone.z, f1);
    }
  }

  const hairGeo = new THREE.BufferGeometry();
  hairGeo.setAttribute("position", new THREE.Float32BufferAttribute(hairPositions, 3));
  hairGeo.setAttribute("normal", new THREE.Float32BufferAttribute(hairNormals, 3));
  hairGeo.setAttribute("uv", new THREE.Float32BufferAttribute(hairUvs, 2));
  hairGeo.setAttribute("color", new THREE.Float32BufferAttribute(hairColors, 3));
  hairGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(hairSkinIndices, 4));
  hairGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(hairSkinWeights, 4));

  const texData = new Uint8Array([180, 120, 210, 255, 160, 110, 200, 255, 170, 115, 205, 255, 190, 130, 220, 255]);
  const hairTexture = new THREE.DataTexture(texData, 2, 2, THREE.RGBAFormat);
  hairTexture.needsUpdate = true;

  const hairMat = new MToonMaterial({
    color: new THREE.Color().setRGB(
      params.hairBaseColorRgb[0],
      params.hairBaseColorRgb[1],
      params.hairBaseColorRgb[2],
      THREE.SRGBColorSpace,
    ),
    map: hairTexture,
    vertexColors: true,
    ignoreVertexColor: false,
    shadeColorFactor: new THREE.Color().setRGB(
      params.hairBaseColorRgb[0] * 0.55,
      params.hairBaseColorRgb[1] * 0.5,
      params.hairBaseColorRgb[2] * 0.6,
      THREE.SRGBColorSpace,
    ),
    shadingToonyFactor: 0.72,
  });
  hairMat.name = `${params.name}_Hair_MToon`;

  const hairMesh = new THREE.SkinnedMesh(hairGeo, hairMat);
  hairMesh.name = params.hairMeshName;
  headBone.add(hairMesh);

  scene.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([headBone, donorHairBone]);
  skeleton.calculateInverses();
  skullMesh.bind(skeleton, skullMesh.matrixWorld);
  hairMesh.bind(skeleton, hairMesh.matrixWorld);

  const vrm: VrmTransplantActorLike = {
    scene,
    meta: { metaVersion: params.metaVersion, name: params.name },
    humanoid: {
      getRawBoneNode: (bone) => {
        if (bone === "head") return headBone;
        if (bone === "neck") return neckBone;
        if (bone === "leftEye") return leftEye;
        if (bone === "rightEye") return rightEye;
        return null;
      },
      getNormalizedBoneNode: (bone) => {
        if (bone === "head") return headBone;
        if (bone === "neck") return neckBone;
        if (bone === "leftEye") return leftEye;
        if (bone === "rightEye") return rightEye;
        return null;
      },
    },
  };

  return {
    vrm,
    headBone,
    hairMesh,
    hairTexture,
    skullCrownLocalY: topY,
    dispose: () => {
      skullGeo.dispose();
      bodyMat.dispose();
      lashGeo.dispose();
      lashMat.dispose();
      hairGeo.dispose();
      hairMat.dispose();
      hairTexture.dispose();
    },
  };
}

describe("크로스 VRM 실물 헤어 추출 · 두개골 정렬 · 본 웨이트 재매핑 · MToon 보정 엔진", () => {
  it("실제 THREE.SkinnedMesh 헤어만 비파괴 추출하고 얼굴·속눈썹 메시는 배제한다", () => {
    const donor = buildSyntheticVrmRig({
      name: "LumiDonor",
      metaVersion: "0",
      headY: 1.42,
      crownHeightM: 0.21,
      skullWidthM: 0.166,
      skullDepthM: 0.182,
      hairDropBelowHeadM: 0.34,
      hairBaseColorRgb: [0.22, 0.35, 0.72],
      bodyShadeRgb: [0.76, 0.8, 0.92],
      bodyToony: 0.85,
      hairMeshName: "Hair_LumiLongStraight",
    });

    const extracted = extractDonorHairMeshes(donor.vrm);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]?.sourceMeshName).toBe("Hair_LumiLongStraight");
    expect(extracted[0]?.meshKind).toBe("skinned");
    expect(extracted[0]?.hasUv).toBe(true);
    expect(extracted[0]?.hasVertexColors).toBe(true);
    expect(extracted[0]?.vertexCount).toBeGreaterThan(100);
    expect(extracted[0]?.sourceBoneCount).toBe(2);

    const measuredSkull = measureVrmSkullFrame(donor.vrm);
    expect(measuredSkull.source).toBe("measured-mesh");
    expect(measuredSkull.crownHeightM).toBeCloseTo(0.21, 3);
    expect(measuredSkull.skullWidthM).toBeCloseTo(0.166, 3);
    expect(measuredSkull.skullDepthM).toBeCloseTo(0.182, 3);
    expect(measuredSkull.forwardSign).toBe(-1);

    donor.dispose();
  });

  it("VRM 0.x 도너 → VRM 1.0 이질 비율 타깃 두개골 정렬 정밀도가 0.5mm 미만이고 전방축이 180° 보정된다", () => {
    const donor = buildSyntheticVrmRig({
      name: "LumiVrm0",
      metaVersion: "0",
      headY: 1.4,
      crownHeightM: 0.2,
      skullWidthM: 0.16,
      skullDepthM: 0.18,
      hairDropBelowHeadM: 0.36,
      hairBaseColorRgb: [0.85, 0.3, 0.2],
      bodyShadeRgb: [0.8, 0.78, 0.88],
      bodyToony: 0.82,
      hairMeshName: "Hair_Donor",
    });

    const target = buildSyntheticVrmRig({
      name: "SeoyeonVrm1",
      metaVersion: "1",
      headY: 1.62,
      crownHeightM: 0.244,
      skullWidthM: 0.194,
      skullDepthM: 0.212,
      hairDropBelowHeadM: 0.28,
      hairBaseColorRgb: [0.25, 0.2, 0.22],
      bodyShadeRgb: [0.72, 0.74, 0.88],
      bodyToony: 0.91,
      hairMeshName: "Hair_TargetOriginal",
    });

    const handle = transplantVrmHair(donor.vrm, target.vrm);

    expect(handle.donorSkull.source).toBe("measured-mesh");
    expect(handle.targetSkull.source).toBe("measured-mesh");
    expect(handle.alignment.yawCompensationRad).toBeCloseTo(Math.PI, 5);
    expect(handle.alignment.maxLandmarkErrorMm).toBeLessThan(0.5);
    expect(handle.alignment.crownResidualMm).toBeLessThan(0.5);
    expect(handle.alignment.widthResidualMm).toBeLessThan(0.5);
    expect(handle.alignment.depthResidualMm).toBeLessThan(0.5);

    // 실제 이식된 정점 중 정수리(0번 정점)가 타깃 두개골 크라운에 0.5mm 이내로 안착했는지 실측한다.
    const transplanted = handle.transplantedMeshes[0]!;
    const pos = transplanted.geometry.getAttribute("position");
    const crownErrorMm = Math.abs(pos.getY(0) - target.skullCrownLocalY) * 1000;
    expect(crownErrorMm).toBeLessThan(0.5);

    // VRM 0.x 도너의 앞머리(-Z)가 VRM 1.0 타깃 정면(+Z)으로 반전되었는지 검증한다.
    expect(pos.getZ(3)).toBeGreaterThan(0.05);

    handle.dispose();
    donor.dispose();
    target.dispose();
  });

  it("모든 정점의 skinWeight 합이 정확히 1.0이고 두피 head >= 0.95 · 끝단 tip >= 0.65를 만족한다", () => {
    const donor = buildSyntheticVrmRig({
      name: "ShinoDonor",
      metaVersion: "0",
      headY: 1.44,
      crownHeightM: 0.214,
      skullWidthM: 0.17,
      skullDepthM: 0.184,
      hairDropBelowHeadM: 0.35,
      hairBaseColorRgb: [0.9, 0.45, 0.52],
      bodyShadeRgb: [0.85, 0.8, 0.86],
      bodyToony: 0.88,
      hairMeshName: "Hair_TwinSide",
    });

    const target = buildSyntheticVrmRig({
      name: "TargetHero",
      metaVersion: "1",
      headY: 1.54,
      crownHeightM: 0.22,
      skullWidthM: 0.168,
      skullDepthM: 0.182,
      hairDropBelowHeadM: 0.22,
      hairBaseColorRgb: [0.22, 0.2, 0.24],
      bodyShadeRgb: [0.78, 0.82, 0.92],
      bodyToony: 0.9,
      hairMeshName: "Hair_Old",
    });

    const handle = transplantVrmHair(donor.vrm, target.vrm);
    const mesh = handle.transplantedMeshes[0]!;
    const skinWeight = mesh.geometry.getAttribute("skinWeight");
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const boneCount = mesh.skeleton.bones.length;

    expect(mesh.skeleton.bones[0]).toBe(target.headBone);
    expect(handle.virtualChains.length).toBeGreaterThanOrEqual(4);
    expect(handle.skinMetrics.maxWeightSumDeviation).toBe(0);

    for (let i = 0; i < skinWeight.count; i += 1) {
      const w0 = skinWeight.getX(i);
      const w1 = skinWeight.getY(i);
      const w2 = skinWeight.getZ(i);
      const w3 = skinWeight.getW(i);
      expect(w0 + w1 + w2 + w3).toBe(1);
      expect(w0).toBeGreaterThanOrEqual(0);
      expect(w1).toBeGreaterThanOrEqual(0);
      expect(w2).toBeGreaterThanOrEqual(0);
      expect(w3).toBeGreaterThanOrEqual(0);
      for (let c = 0; c < 4; c += 1) {
        const idx = skinIndex.getComponent(i, c);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(boneCount);
      }
    }

    // 정수리 두피 고정(weightHead >= 0.95) vs 모발 끝단 탄성(weightTip >= 0.65).
    expect(handle.skinMetrics.minScalpRootHeadWeight).toBeGreaterThanOrEqual(0.95);
    expect(handle.skinMetrics.meanTipSecondaryWeight).toBeGreaterThanOrEqual(0.65);
    expect(handle.skinMetrics.minTipBoneWeight).toBeGreaterThanOrEqual(0.65);
    // 0번 정점은 정수리 두피 앵커이므로 head weight === 1.
    expect(skinWeight.getX(0)).toBeGreaterThanOrEqual(0.95);

    // 순수 정량 함수 직접 검증: 두피(0.05) -> 1.0, 끝단(0.96) -> tip >= 0.65, 합 === 1.
    const rootW = computeQuantizedHairVertexWeights(0.05, DEFAULT_HAIR_BONE_WEIGHT_CONFIG);
    const tipW = computeQuantizedHairVertexWeights(0.96, DEFAULT_HAIR_BONE_WEIGHT_CONFIG);
    expect(rootW[0]).toBeGreaterThanOrEqual(0.95);
    expect(rootW[0] + rootW[1] + rootW[2] + rootW[3]).toBe(1);
    expect(tipW[3]).toBeGreaterThanOrEqual(0.65);
    expect(tipW[0] + tipW[1] + tipW[2] + tipW[3]).toBe(1);

    handle.dispose();
    donor.dispose();
    target.dispose();
  });

  it("MToon vColor.rgb 셰이더 패치·ΔE00 색조 조화·원본 텍스처 보존 및 dispose() 완전 롤백을 보장한다", () => {
    const donor = buildSyntheticVrmRig({
      name: "VividOrangeDonor",
      metaVersion: "0",
      headY: 1.45,
      crownHeightM: 0.21,
      skullWidthM: 0.165,
      skullDepthM: 0.18,
      hairDropBelowHeadM: 0.3,
      hairBaseColorRgb: [0.92, 0.52, 0.16],
      bodyShadeRgb: [0.9, 0.82, 0.74],
      bodyToony: 0.78,
      hairMeshName: "Hair_DonorMesh",
    });

    const target = buildSyntheticVrmRig({
      name: "CoolPastelTarget",
      metaVersion: "1",
      headY: 1.5,
      crownHeightM: 0.212,
      skullWidthM: 0.16,
      skullDepthM: 0.176,
      hairDropBelowHeadM: 0.24,
      hairBaseColorRgb: [0.22, 0.24, 0.36],
      bodyShadeRgb: [0.76, 0.82, 0.94],
      bodyToony: 0.92,
      hairMeshName: "Hair_TargetToHide",
    });

    expect(target.hairMesh.visible).toBe(true);
    expect(donor.hairMesh.visible).toBe(true);

    const handle = transplantVrmHair(donor.vrm, target.vrm, {
      colorHarmony: {
        harmonyStrength: 0.85,
        tintOverrideRgb: { r: 0.24, g: 0.28, b: 0.44 },
        enableOutlineMesh: true,
      },
    });

    // 1) 타깃 원본 헤어 자동 숨김 및 이식 노드 부착 확인.
    expect(handle.hiddenOriginalHairCount).toBe(1);
    expect(target.hairMesh.visible).toBe(false);
    expect(handle.rootGroup.parent).toBe(target.headBone);

    // 2) MToon vColor.rgb 패치 & 원본 아티스트 UV 텍스처 보존 검증.
    const mainMat = handle.transplantedMeshes[0]!.material as MToonMaterial;
    const outlineMat = handle.outlineMeshes[0]!.material as MToonMaterial;
    for (const [label, mat] of [
      ["main", mainMat],
      ["outline", outlineMat],
    ] as const) {
      expect(mat.fragmentShader, `${label} raw vColor`).not.toMatch(/\*=\s*vColor\s*;/u);
      expect(mat.fragmentShader, `${label} diffuseColor vColor.rgb`).toContain(
        "diffuseColor.rgb *= vColor.rgb;",
      );
      expect(mat.fragmentShader, `${label} shadeColor vColor.rgb`).toContain(
        "material.shadeColor.rgb *= vColor.rgb;",
      );
      const cacheKey = mat.customProgramCacheKey();
      expect(cacheKey.match(/vcolor-rgb-v1/gu)?.length).toBe(1);
    }

    expect(mainMat.map).toBe(donor.hairTexture);
    expect(handle.mtoonHarmony.vColorShaderPatched).toBe(true);
    expect(handle.mtoonHarmony.afterDeltaE00).toBeLessThan(handle.mtoonHarmony.beforeDeltaE00);
    expect(handle.mtoonHarmony.improvementPercent).toBeGreaterThan(40);
    expect(handle.mtoonHarmony.shadingToonyFactor).toBeCloseTo(0.92, 2);

    // 3) dispose() 호출 시 생성 메시 제거 + 타깃 원본 헤어 가시성 100% 원복 + 멱등성.
    handle.dispose();
    expect(handle.isDisposed()).toBe(true);
    expect(handle.rootGroup.parent).toBeNull();
    expect(target.hairMesh.visible).toBe(true);
    expect(donor.hairMesh.visible).toBe(true);

    // 중복 dispose() 안전 호출.
    expect(() => handle.dispose()).not.toThrow();

    donor.dispose();
    target.dispose();
  });

  it("두개골 정렬 유틸리티와 카탈로그 매니페스트가 모든 쇼케이스 5종에서 0.5mm 미만 정밀도와 결정적 시그니처를 보장한다", () => {
    for (const donor of DONOR_HAIR_CATALOG) {
      const manifest = buildHairTransplantManifest(donor.id, "sd-chibi-30");
      expect(manifest.alignment.maxLandmarkErrorMm).toBeLessThan(0.5);
      expect(manifest.skinPreview.maxWeightSumDeviation).toBe(0);
      expect(manifest.skinPreview.minScalpRootHeadWeight).toBeGreaterThanOrEqual(0.95);
      expect(manifest.skinPreview.meanTipSecondaryWeight).toBeGreaterThanOrEqual(0.65);
      expect(manifest.mtoonHarmony.afterDeltaE00).toBeLessThanOrEqual(manifest.mtoonHarmony.beforeDeltaE00);

      const repeat = buildHairTransplantManifest(donor.id, "sd-chibi-30");
      expect(repeat.createdSignature).toBe(manifest.createdSignature);

      const directAlign = computeSkullToSkullAlignment(donor.defaultSkull, donor.defaultSkull);
      expect(directAlign.maxLandmarkErrorMm).toBe(0);
      expect(directAlign.scale).toEqual([1, 1, 1]);
    }
  });
});

describe("StudioVrmHairTransplantPanel UI 렌더링 · 인터랙션 · 정책 위생 검증", () => {
  it("필수 props 0개로 단독 렌더링되며 쇼케이스 도너·타깃 비율 전환·슬라이더·원클릭 이식/원복이 동작한다", () => {
    const onApply = vi.fn<(manifest: VrmHairTransplantManifest) => void>();
    render(<StudioVrmHairTransplantPanel onApplyTransplant={onApply} />);

    expect(screen.getByTestId("vrm-hair-transplant-panel")).toBeTruthy();
    expect(screen.getByTestId("vrm-hair-donor-lumi-long-straight")).toBeTruthy();
    expect(screen.getByTestId("vrm-hair-donor-shion-semi-long")).toBeTruthy();
    expect(screen.getByTestId("vrm-hair-donor-shino-twin-side")).toBeTruthy();
    expect(screen.getByTestId("vrm-hair-donor-vita-short-wolf")).toBeTruthy();
    expect(screen.getByTestId("vrm-hair-donor-seoyeon-wave")).toBeTruthy();

    // 기본 루미(VRM 0.x) → 로맨스 웹툰(VRM 1.0)은 전방축 180° 보정.
    expect(screen.getByTestId("vrm-hair-yaw-badge").textContent).toContain("180°");

    // 서연 웨이브(VRM 1.0) 선택 시 전방축 0° 보정으로 즉시 갱신.
    fireEvent.click(screen.getByTestId("vrm-hair-donor-seoyeon-wave"));
    expect(screen.getByTestId("vrm-hair-yaw-badge").textContent).toContain("0°");

    // SD 데포르메(3.0등신) 타깃 선택 시 두개골 배율이 1.5x 이상으로 재계산되며 5구간 히트바 표시.
    fireEvent.click(screen.getByTestId("vrm-hair-target-sd-chibi-30"));
    expect(screen.getByTestId("vrm-hair-scale-telemetry").textContent).toMatch(/1\.[456]/u);
    expect(screen.getByTestId("vrm-hair-weight-band-0")).toBeTruthy();
    expect(screen.getByTestId("vrm-hair-weight-band-4")).toBeTruthy();

    const sigBefore = screen.getByTestId("vrm-hair-manifest-signature").textContent;
    fireEvent.change(screen.getByTestId("vrm-hair-offset-y-slider"), { target: { value: "4" } });
    expect(screen.getByTestId("vrm-hair-manifest-signature").textContent).not.toBe(sigBefore);

    // 원클릭 이식 실행 및 매니페스트 콜백·원복 검증.
    fireEvent.click(screen.getByTestId("vrm-hair-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]![0];
    expect(applied.donorId).toBe("seoyeon-wave");
    expect(applied.targetProportionId).toBe("sd-chibi-30");
    expect(screen.getByTestId("vrm-hair-applied-status")).toBeTruthy();

    fireEvent.click(screen.getByTestId("vrm-hair-rollback-btn"));
    expect(screen.queryByTestId("vrm-hair-applied-status")).toBeNull();
  });

  it("라이브 donorVrm / targetVrm 연결 시 UI 버튼으로 실제 3D 이식 및 원복을 수행한다", () => {
    const donor = buildSyntheticVrmRig({
      name: "PanelDonor",
      metaVersion: "0",
      headY: 1.44,
      crownHeightM: 0.21,
      skullWidthM: 0.166,
      skullDepthM: 0.18,
      hairDropBelowHeadM: 0.32,
      hairBaseColorRgb: [0.3, 0.4, 0.72],
      bodyShadeRgb: [0.8, 0.82, 0.92],
      bodyToony: 0.88,
      hairMeshName: "Hair_PanelDonor",
    });
    const target = buildSyntheticVrmRig({
      name: "PanelTarget",
      metaVersion: "1",
      headY: 1.5,
      crownHeightM: 0.22,
      skullWidthM: 0.17,
      skullDepthM: 0.186,
      hairDropBelowHeadM: 0.24,
      hairBaseColorRgb: [0.25, 0.2, 0.25],
      bodyShadeRgb: [0.8, 0.78, 0.88],
      bodyToony: 0.9,
      hairMeshName: "Hair_PanelTargetOrig",
    });

    const handles: (VrmHairTransplantResultHandle | null)[] = [];
    render(
      <StudioVrmHairTransplantPanel
        donorVrm={donor.vrm}
        targetVrm={target.vrm}
        onLiveHandleChange={(h) => handles.push(h)}
      />,
    );

    fireEvent.click(screen.getByTestId("vrm-hair-apply-btn"));
    expect(target.hairMesh.visible).toBe(false);
    expect(handles.at(-1)?.isDisposed()).toBe(false);

    fireEvent.click(screen.getByTestId("vrm-hair-rollback-btn"));
    expect(target.hairMesh.visible).toBe(true);
    expect(handles.at(-1)).toBeNull();

    donor.dispose();
    target.dispose();
  });

  it("Calm Atelier 정책(800줄 이하 · 원시 색 0건 · transition-all/Sparkles/Storage 0건)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = [
      "types.ts",
      "hair-skull-and-weights.ts",
      "vrm-hair-transplant-engine.ts",
      "StudioVrmHairTransplantPanel.tsx",
      "index.ts",
      "vrm-hair-transplant.test.tsx",
    ];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const src = readFileSync(fullPath, "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "vrm-hair-transplant.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
    }

    const panelSrc = readFileSync(path.join(dir, "StudioVrmHairTransplantPanel.tsx"), "utf8");
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(panelSrc).not.toMatch(/\brgba?\s*\(/iu);
    expect(panelSrc).not.toMatch(/\bhsla?\s*\(/iu);
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toContain("Sparkles");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
  });
});
