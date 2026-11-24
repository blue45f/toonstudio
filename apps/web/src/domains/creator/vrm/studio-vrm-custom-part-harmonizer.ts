/**
 * GLB·절차 소품·씬 소품의 비파괴 MToon/NPR 재질 및 역면 외곽선 통합기.
 *
 * 원본 캐시 소유 재질을 변형하지 않고, 언마운트/교체 시 100% 원복 및 생성 GPU 자원(재질·외곽선·매트캡)을 전량 폐기한다.
 */
import { MToonMaterial, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

import {
  createStudioVrmSmoothOutlineGeometry,
  createStudioVrmSpecularMatcapTexture,
} from "./studio-vrm-custom-part-geometry";
import {
  STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY,
  STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY,
  deriveStudioVrmHarmonizedOutlineColor,
  deriveStudioVrmHarmonizedShadeColor,
  patchStudioVrmMToonVertexColorShader,
  sampleStudioVrmBodyMtoonProfile,
  syncStudioVrmCustomPartToActiveVrm,
  type StudioVrmBodyMtoonProfile,
} from "./studio-vrm-custom-part-material";
import { isStudioVrmMtoonMaterial } from "./studio-vrm-mtoon-brand";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ConvertedPropMaterial {
  readonly material: MToonMaterial;
  readonly isTransparentOrGlow: boolean;
}

function convertPbrMaterialToMToon(
  source: THREE.Material,
  profile: StudioVrmBodyMtoonProfile,
  matcapCache: Map<string, THREE.DataTexture>,
): ConvertedPropMaterial | null {
  if (isStudioVrmMtoonMaterial(source as { isMToonMaterial?: boolean; isMToonNodeMaterial?: boolean })) return null;
  const std = source as THREE.MeshStandardMaterial & { transmission?: number };
  if (!std.color?.isColor) return null;

  const baseColor = std.color.clone();
  const metalness = typeof std.metalness === "number" ? clamp(std.metalness, 0, 1) : 0;
  const roughness = typeof std.roughness === "number" ? clamp(std.roughness, 0.04, 1) : 0.6;
  const transmission = typeof std.transmission === "number" ? clamp(std.transmission, 0, 1) : 0;
  const isTransparent = std.transparent === true || std.opacity < 0.99 || transmission > 0.05;
  const emissiveLum = std.emissive?.isColor
    ? (std.emissive.r * 0.299 + std.emissive.g * 0.587 + std.emissive.b * 0.114) * (std.emissiveIntensity ?? 1)
    : 0;

  let matcapTexture: THREE.DataTexture | null = null;
  if (metalness >= 0.22 || roughness <= 0.38 || transmission > 0.05) {
    const bucketR = Math.round(roughness * 10) / 10;
    const bucketM = Math.round(Math.max(metalness, transmission * 0.7) * 10) / 10;
    const key = `${bucketR}:${bucketM}`;
    matcapTexture = matcapCache.get(key) ?? null;
    if (!matcapTexture) {
      matcapTexture = createStudioVrmSpecularMatcapTexture(bucketR, bucketM);
      matcapCache.set(key, matcapTexture);
    }
  }

  // 금속 파츠는 IBL 없는 환경에서 원시 baseColor가 어둡게 보이기 쉬워 약간 밝기 보정 후 매트캡으로 광택을 살린다.
  const litColor = metalness >= 0.5 && !std.map
    ? baseColor.clone().lerp(new THREE.Color("#e8edf5"), 0.14)
    : baseColor;
  const shadeColor = deriveStudioVrmHarmonizedShadeColor(litColor, profile);
  const outlineColor = deriveStudioVrmHarmonizedOutlineColor(litColor, profile);
  const matcapFactor = matcapTexture
    ? litColor.clone().lerp(new THREE.Color("#ffffff"), 0.55)
      .multiplyScalar(clamp(0.22 + metalness * 0.45 + (1 - roughness) * 0.22, 0.2, 0.72))
    : new THREE.Color(0, 0, 0);

  const mtoon = patchStudioVrmMToonVertexColorShader(new MToonMaterial({
    color: litColor,
    map: std.map ?? undefined,
    normalMap: std.normalMap ?? undefined,
    normalScale: std.normalScale ? std.normalScale.clone() : new THREE.Vector2(1, 1),
    alphaTest: std.alphaTest ?? 0,
    transparent: isTransparent,
    opacity: transmission > 0.05 ? Math.min(std.opacity, clamp(1 - transmission * 0.55, 0.32, 0.82)) : std.opacity,
    depthWrite: isTransparent ? false : std.depthWrite,
    side: std.side,
    vertexColors: std.vertexColors === true,
    ignoreVertexColor: std.vertexColors !== true,
    wireframe: std.wireframe === true,
    emissive: std.emissive?.isColor ? std.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: std.emissiveMap ?? undefined,
    emissiveIntensity: typeof std.emissiveIntensity === "number" ? std.emissiveIntensity : 1,
    shadeColorFactor: shadeColor,
    shadingToonyFactor: metalness >= 0.4 ? clamp(profile.shadingToonyFactor * 0.85, 0.62, 0.92) : profile.shadingToonyFactor,
    shadingShiftFactor: profile.shadingShiftFactor,
    giEqualizationFactor: profile.giEqualizationFactor,
    matcapTexture: matcapTexture ?? undefined,
    matcapFactor,
    parametricRimColorFactor: litColor.clone().lerp(new THREE.Color(profile.rimColorHex), 0.68),
    rimLightingMixFactor: clamp(profile.rimLightingMixFactor + metalness * 0.16, 0.22, 0.78),
    parametricRimFresnelPowerFactor: metalness >= 0.4 ? 3.2 : profile.parametricRimFresnelPowerFactor,
    parametricRimLiftFactor: profile.parametricRimLiftFactor,
    outlineWidthMode: isTransparent ? "none" : profile.outlineWidthMode,
    outlineWidthFactor: isTransparent ? 0 : profile.outlineWidthFactor,
    outlineColorFactor: outlineColor,
    outlineLightingMixFactor: profile.outlineLightingMixFactor,
  }));
  mtoon.name = source.name ? `${source.name} (MToon)` : "prop-mtoon";
  mtoon.userData = {
    ...source.userData,
    [STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY]: { role: "prop", sourceName: source.name },
  };
  return { material: mtoon, isTransparentOrGlow: isTransparent || emissiveLum > 0.35 || std.wireframe === true };
}

/**
 * GLB·절차 소품·씬 소품 그룹을 비파괴적으로 VRM MToon 셰이딩·외곽선·그림자 계약에 통합한다.
 * 반환된 cleanup을 호출하면 원본 재질이 100% 복구되고 생성된 MToon 재질·외곽선·매트캡이 전부 폐기된다.
 */
export function harmonizeStudioVrmPropObject(
  object: THREE.Object3D,
  vrm: VRM | null | undefined,
  options: { readonly includeOutlines?: boolean; readonly propId?: string } = {},
): () => void {
  const profile = sampleStudioVrmBodyMtoonProfile(vrm);
  const includeOutlines = options.includeOutlines !== false && profile.outlineWidthMode !== "none";
  const originals = new Map<THREE.Mesh, {
    readonly material: THREE.Material | THREE.Material[];
    readonly castShadow: boolean;
    readonly receiveShadow: boolean;
  }>();
  const convertedBySource = new Map<THREE.Material, ConvertedPropMaterial>();
  const matcapCache = new Map<string, THREE.DataTexture>();
  const createdMaterials: MToonMaterial[] = [];
  const createdOutlines: {
    readonly mesh: THREE.Mesh;
    readonly geometry: THREE.BufferGeometry | null;
    readonly material: MToonMaterial;
  }[] = [];

  const targetMeshes: THREE.Mesh[] = [];
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true || !mesh.material) return;
    if (mesh.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true) return;
    targetMeshes.push(mesh);
  });

  for (const mesh of targetMeshes) {
    if (mesh.geometry && !mesh.geometry.getAttribute("normal")) {
      mesh.geometry.computeVertexNormals();
    }
    const sourceMaterial = mesh.material;
    const sourceList = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial];
    let changed = false;
    let allTransparentOrGlow = true;
    let primaryOutlineColor = new THREE.Color(profile.outlineColorHex);
    let primaryShadeColor = new THREE.Color(profile.shadeTintHex);

    const nextList = sourceList.map((raw) => {
      let converted = convertedBySource.get(raw);
      if (!converted) {
        const built = convertPbrMaterialToMToon(raw, profile, matcapCache);
        if (built) {
          converted = built;
          convertedBySource.set(raw, built);
          createdMaterials.push(built.material);
        }
      }
      if (!converted) {
        if (isStudioVrmMtoonMaterial(raw as { isMToonMaterial?: boolean; isMToonNodeMaterial?: boolean })) {
          allTransparentOrGlow = allTransparentOrGlow && raw.transparent === true;
        }
        return raw;
      }
      changed = true;
      if (!converted.isTransparentOrGlow) {
        allTransparentOrGlow = false;
        primaryOutlineColor = converted.material.outlineColorFactor;
        primaryShadeColor = converted.material.shadeColorFactor;
      }
      return converted.material;
    });

    if (changed || !mesh.castShadow || !mesh.receiveShadow) {
      originals.set(mesh, {
        material: sourceMaterial,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
      });
      if (changed) mesh.material = Array.isArray(sourceMaterial) ? nextList : nextList[0]!;
      mesh.castShadow = !allTransparentOrGlow;
      mesh.receiveShadow = true;
    }

    if (includeOutlines && !allTransparentOrGlow && mesh.geometry) {
      const outlineMaterial = patchStudioVrmMToonVertexColorShader(new MToonMaterial({
        color: new THREE.Color(0xffffff),
        isOutline: true,
        side: THREE.BackSide,
        transparent: false,
        depthWrite: true,
        outlineWidthMode: profile.outlineWidthMode,
        outlineWidthFactor: profile.outlineWidthMode === "screenCoordinates"
          ? clamp(profile.outlineWidthFactor * 0.85, 0.0008, 0.002)
          : clamp(profile.outlineWidthFactor * 0.85, 0.0009, 0.0022),
        outlineColorFactor: primaryOutlineColor.clone(),
        outlineLightingMixFactor: profile.outlineLightingMixFactor,
        shadeColorFactor: primaryShadeColor.clone(),
        shadingToonyFactor: profile.shadingToonyFactor,
        shadingShiftFactor: profile.shadingShiftFactor,
        giEqualizationFactor: profile.giEqualizationFactor,
      }));
      outlineMaterial.name = `${mesh.name || options.propId || "prop"}:outline`;
      outlineMaterial.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "prop-outline" };

      const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
      let outlineMesh: THREE.Mesh;
      let ownedGeometry: THREE.BufferGeometry | null = null;
      if (isSkinned) {
        const skinnedHost = mesh as THREE.SkinnedMesh;
        const skinnedOutline = new THREE.SkinnedMesh(skinnedHost.geometry, outlineMaterial);
        skinnedOutline.bindMode = skinnedHost.bindMode;
        skinnedOutline.bind(skinnedHost.skeleton, skinnedHost.bindMatrix);
        skinnedOutline.bindMatrixInverse.copy(skinnedHost.bindMatrixInverse);
        skinnedOutline.frustumCulled = false;
        outlineMesh = skinnedOutline;
      } else {
        ownedGeometry = createStudioVrmSmoothOutlineGeometry(mesh.geometry);
        outlineMesh = new THREE.Mesh(ownedGeometry, outlineMaterial);
      }
      outlineMesh.name = `${mesh.name || options.propId || "prop"}:outline`;
      outlineMesh.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] = true;
      outlineMesh.raycast = () => undefined;
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      mesh.add(outlineMesh);
      createdOutlines.push({ mesh: outlineMesh, geometry: ownedGeometry, material: outlineMaterial });
    }
  }

  syncStudioVrmCustomPartToActiveVrm(object, vrm);

  return () => {
    for (const entry of createdOutlines) {
      entry.mesh.removeFromParent();
      entry.geometry?.dispose();
      entry.material.dispose();
    }
    for (const [mesh, original] of originals) {
      mesh.material = original.material;
      mesh.castShadow = original.castShadow;
      mesh.receiveShadow = original.receiveShadow;
    }
    for (const material of createdMaterials) material.dispose();
    for (const texture of matcapCache.values()) texture.dispose();
  };
}
