/**
 * 커스텀 파츠(헤어·워드로브·XPBD 스커트·GLB/절차 소품·씬 소품)의 MToon/NPR 통합 재질·법선·동기화 엔진.
 *
 * VRM 본체는 `MToonMaterial` 셀 셰이딩 + 외곽선을 쓰지만, 커스텀 파츠가 원시 PBR(`MeshStandardMaterial`·
 * `MeshPhysicalMaterial`)이나 `MeshToonMaterial` + 반투명 `MeshBasicMaterial` 외곽선으로 섞여 들어가면
 * IBL 부재로 금속이 검게 무너지고, 음영/림라이트/외곽선/알파 정렬이 본체와 어긋나 품질이 급락한다.
 * 이 모듈은 본체 VRM의 실제 MToon 프로필을 샘플링해 모든 커스텀 파츠를 동일한 MToon 셰이딩·
 * 용접 법선 외곽선·매트캡 하이라이트·실시간 MaterialFx/MToon 컨트롤 계약으로 통합한다.
 */
import { MToonMaterial, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

import { isStudioAuthoredAttachment } from "./studio-vrm-authored-attachment";
import {
  createStudioVrmFeatheredDiscAlphaTexture,
  createStudioVrmGarmentWeaveNormalTexture,
  createStudioVrmHairAngelRingMatcapTexture,
  createStudioVrmSmoothOutlineGeometry,
  createStudioVrmSpecularMatcapTexture,
  smoothStudioVrmCoincidentNormals,
} from "./studio-vrm-custom-part-geometry";
import { isStudioVrmMtoonMaterial } from "./studio-vrm-mtoon-brand";
import {
  applyStudioVrmMtoonControls,
  type StudioVrmMtoonControls,
  type StudioVrmMtoonOutlineWidthMode,
} from "./studio-vrm-mtoon-controls";
import {
  WARDROBE_FABRICS,
  wardrobeFabricById,
  type GarmentPart,
  type WardrobeEquip,
} from "./studio-vrm-wardrobe";

export {
  createStudioVrmFeatheredDiscAlphaTexture,
  createStudioVrmGarmentWeaveNormalTexture,
  createStudioVrmHairAngelRingMatcapTexture,
  createStudioVrmSmoothOutlineGeometry,
  createStudioVrmSpecularMatcapTexture,
  smoothStudioVrmCoincidentNormals,
};

export const STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY = "studioVrmCustomPartMaterial";
export const STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY = "studioVrmCustomPartOutline";
export const STUDIO_VRM_CUSTOM_PART_OWNED_TEXTURES_KEY = "studioVrmCustomPartOwnedTextures";
export const STUDIO_VRM_ACTIVE_MATERIAL_FX_KEY = "__studioVrmActiveMaterialFx";
export const STUDIO_VRM_ACTIVE_MTOON_CONTROLS_KEY = "__studioVrmActiveMtoonControls";

export interface StudioVrmActiveMaterialFxSnapshot {
  readonly shadeColor: string | null;
  readonly outlineColor: string | null;
  readonly rimColor: string | null;
  readonly rimIntensity: number;
  readonly emissiveColor: string | null;
  readonly emissiveIntensity: number;
}

export interface StudioVrmBodyMtoonProfile {
  readonly hasMToon: boolean;
  readonly shadingToonyFactor: number;
  readonly shadingShiftFactor: number;
  readonly giEqualizationFactor: number;
  /** 본체 셰이드 색감(기본색 대비 틴트). */
  readonly shadeTintHex: string;
  readonly shadeDarkness: number;
  readonly outlineWidthMode: StudioVrmMtoonOutlineWidthMode;
  readonly outlineWidthFactor: number;
  readonly outlineColorHex: string;
  readonly outlineLightingMixFactor: number;
  readonly rimColorHex: string;
  readonly rimLightingMixFactor: number;
  readonly parametricRimFresnelPowerFactor: number;
  readonly parametricRimLiftFactor: number;
}

export const DEFAULT_STUDIO_VRM_MTOON_PROFILE: StudioVrmBodyMtoonProfile = Object.freeze({
  hasMToon: true,
  shadingToonyFactor: 0.86,
  shadingShiftFactor: -0.08,
  giEqualizationFactor: 0.88,
  shadeTintHex: "#d6dcf0",
  shadeDarkness: 0.68,
  outlineWidthMode: "worldCoordinates",
  outlineWidthFactor: 0.0018,
  outlineColorHex: "#1c1722",
  outlineLightingMixFactor: 0.55,
  rimColorHex: "#fff7ee",
  rimLightingMixFactor: 0.42,
  parametricRimFresnelPowerFactor: 4.5,
  parametricRimLiftFactor: 0.08,
});

interface MToonReadableMaterial {
  readonly isMToonMaterial?: boolean;
  readonly isMToonNodeMaterial?: boolean;
  readonly isOutline?: boolean;
  readonly color?: THREE.Color;
  readonly shadeColorFactor?: THREE.Color;
  readonly shadingToonyFactor?: number;
  readonly shadingShiftFactor?: number;
  readonly giEqualizationFactor?: number;
  readonly outlineWidthMode?: StudioVrmMtoonOutlineWidthMode;
  readonly outlineWidthFactor?: number;
  readonly outlineColorFactor?: THREE.Color;
  readonly outlineLightingMixFactor?: number;
  readonly parametricRimColorFactor?: THREE.Color;
  readonly rimLightingMixFactor?: number;
  readonly parametricRimFresnelPowerFactor?: number;
  readonly parametricRimLiftFactor?: number;
  readonly userData?: Record<string, unknown>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
}

function isCustomOrDerivativeObject(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    const data = current.userData;
    if (
      data.toonSpectrumAvatarForge === true
      || data[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true
      || typeof data.characterAuthoringDerivative === "string"
      || data.characterCanonicalPart === true
      || current.name.startsWith("wardrobe:")
      || current.name.startsWith("prop:")
    ) {
      return true;
    }
    current = current.parent;
  }
  return isStudioAuthoredAttachment(object);
}

/**
 * VRM 본체 메시의 MToon 파라미터(셀 경계·그림자 색조·외곽선·림라이트)를 샘플링한다.
 * 커스텀 파츠 자체는 건너뛰어 자기 참조로 프로필이 드리프트하지 않게 한다.
 */
export function sampleStudioVrmBodyMtoonProfile(
  vrm: VRM | null | undefined,
): StudioVrmBodyMtoonProfile {
  if (!vrm?.scene?.traverse) return DEFAULT_STUDIO_VRM_MTOON_PROFILE;

  const toonyValues: number[] = [];
  const shiftValues: number[] = [];
  const giValues: number[] = [];
  const worldOutlineWidths: number[] = [];
  const screenOutlineWidths: number[] = [];
  const outlineMixValues: number[] = [];
  const rimMixValues: number[] = [];
  const rimPowerValues: number[] = [];
  const rimLiftValues: number[] = [];
  const shadeTintAccumulator = new THREE.Color(0, 0, 0);
  let shadeTintSamples = 0;
  let outlineColorSample: THREE.Color | null = null;
  let rimColorSample: THREE.Color | null = null;
  let mtoonCount = 0;

  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || isCustomOrDerivativeObject(mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of materials) {
      const mat = raw as MToonReadableMaterial | undefined;
      if (!mat || !isStudioVrmMtoonMaterial(mat)) continue;
      if (mat.userData?.[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY]) continue;
      mtoonCount += 1;

      if (mat.isOutline !== true) {
        if (typeof mat.shadingToonyFactor === "number" && Number.isFinite(mat.shadingToonyFactor)) {
          toonyValues.push(mat.shadingToonyFactor);
        }
        if (typeof mat.shadingShiftFactor === "number" && Number.isFinite(mat.shadingShiftFactor)) {
          shiftValues.push(mat.shadingShiftFactor);
        }
        if (typeof mat.giEqualizationFactor === "number" && Number.isFinite(mat.giEqualizationFactor)) {
          giValues.push(mat.giEqualizationFactor);
        }
        if (mat.shadeColorFactor?.isColor) {
          shadeTintAccumulator.r += mat.shadeColorFactor.r;
          shadeTintAccumulator.g += mat.shadeColorFactor.g;
          shadeTintAccumulator.b += mat.shadeColorFactor.b;
          shadeTintSamples += 1;
        }
        if (mat.parametricRimColorFactor?.isColor && !rimColorSample) {
          const lum = mat.parametricRimColorFactor.r * 0.299
            + mat.parametricRimColorFactor.g * 0.587
            + mat.parametricRimColorFactor.b * 0.114;
          if (lum > 0.04) rimColorSample = mat.parametricRimColorFactor.clone();
        }
        if (typeof mat.rimLightingMixFactor === "number" && Number.isFinite(mat.rimLightingMixFactor)) {
          rimMixValues.push(mat.rimLightingMixFactor);
        }
        if (typeof mat.parametricRimFresnelPowerFactor === "number" && Number.isFinite(mat.parametricRimFresnelPowerFactor)) {
          rimPowerValues.push(mat.parametricRimFresnelPowerFactor);
        }
        if (typeof mat.parametricRimLiftFactor === "number" && Number.isFinite(mat.parametricRimLiftFactor)) {
          rimLiftValues.push(mat.parametricRimLiftFactor);
        }
      }

      if (mat.outlineWidthMode === "worldCoordinates" && typeof mat.outlineWidthFactor === "number" && mat.outlineWidthFactor > 0) {
        worldOutlineWidths.push(mat.outlineWidthFactor);
      } else if (mat.outlineWidthMode === "screenCoordinates" && typeof mat.outlineWidthFactor === "number" && mat.outlineWidthFactor > 0) {
        screenOutlineWidths.push(mat.outlineWidthFactor);
      }
      if (typeof mat.outlineLightingMixFactor === "number" && Number.isFinite(mat.outlineLightingMixFactor)) {
        outlineMixValues.push(mat.outlineLightingMixFactor);
      }
      if (mat.outlineColorFactor?.isColor && !outlineColorSample && mat.outlineWidthMode !== "none") {
        outlineColorSample = mat.outlineColorFactor.clone();
      }
    }
  });

  if (mtoonCount === 0) {
    return Object.freeze({
      ...DEFAULT_STUDIO_VRM_MTOON_PROFILE,
      hasMToon: false,
      shadingToonyFactor: 0.72,
    });
  }

  let shadeTintHex = DEFAULT_STUDIO_VRM_MTOON_PROFILE.shadeTintHex;
  let shadeDarkness = DEFAULT_STUDIO_VRM_MTOON_PROFILE.shadeDarkness;
  if (shadeTintSamples > 0) {
    const avg = new THREE.Color(
      clamp(shadeTintAccumulator.r / shadeTintSamples, 0.08, 1),
      clamp(shadeTintAccumulator.g / shadeTintSamples, 0.08, 1),
      clamp(shadeTintAccumulator.b / shadeTintSamples, 0.08, 1),
    );
    const hsl = { h: 0, s: 0, l: 0 };
    avg.getHSL(hsl);
    shadeDarkness = clamp(hsl.l * 0.92 + 0.14, 0.56, 0.82);
    const normalizedTint = new THREE.Color().setHSL(hsl.h, clamp(hsl.s * 0.45, 0.04, 0.28), 0.86);
    shadeTintHex = `#${normalizedTint.getHexString()}`;
  }

  const useScreen = screenOutlineWidths.length > worldOutlineWidths.length;
  const outlineWidthMode: StudioVrmMtoonOutlineWidthMode =
    screenOutlineWidths.length === 0 && worldOutlineWidths.length === 0
      ? DEFAULT_STUDIO_VRM_MTOON_PROFILE.outlineWidthMode
      : useScreen
        ? "screenCoordinates"
        : "worldCoordinates";
  const outlineWidthFactor = outlineWidthMode === "screenCoordinates"
    ? clamp(median(screenOutlineWidths, 0.0016), 0.0009, 0.0028)
    : clamp(median(worldOutlineWidths, 0.0018), 0.001, 0.0032);

  return Object.freeze({
    hasMToon: true,
    shadingToonyFactor: clamp(median(toonyValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.shadingToonyFactor), 0.55, 0.98),
    shadingShiftFactor: clamp(median(shiftValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.shadingShiftFactor), -0.35, 0.2),
    giEqualizationFactor: clamp(median(giValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.giEqualizationFactor), 0.55, 0.98),
    shadeTintHex,
    shadeDarkness,
    outlineWidthMode,
    outlineWidthFactor,
    outlineColorHex: outlineColorSample
      ? `#${(outlineColorSample as THREE.Color).getHexString()}`
      : DEFAULT_STUDIO_VRM_MTOON_PROFILE.outlineColorHex,
    outlineLightingMixFactor: clamp(median(outlineMixValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.outlineLightingMixFactor), 0.15, 0.85),
    rimColorHex: rimColorSample
      ? `#${(rimColorSample as THREE.Color).getHexString()}`
      : DEFAULT_STUDIO_VRM_MTOON_PROFILE.rimColorHex,
    rimLightingMixFactor: clamp(median(rimMixValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.rimLightingMixFactor), 0.15, 0.75),
    parametricRimFresnelPowerFactor: clamp(median(rimPowerValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.parametricRimFresnelPowerFactor), 2.5, 8),
    parametricRimLiftFactor: clamp(median(rimLiftValues, DEFAULT_STUDIO_VRM_MTOON_PROFILE.parametricRimLiftFactor), 0.02, 0.25),
  });
}

export function deriveStudioVrmHarmonizedShadeColor(
  baseColor: THREE.Color,
  profile: StudioVrmBodyMtoonProfile,
  explicitShadowHex?: string,
): THREE.Color {
  if (explicitShadowHex) {
    return new THREE.Color(explicitShadowHex).lerp(
      baseColor.clone().multiply(new THREE.Color(profile.shadeTintHex)),
      0.22,
    );
  }
  const tint = new THREE.Color(profile.shadeTintHex);
  const shaded = baseColor.clone().multiply(tint).multiplyScalar(profile.shadeDarkness);
  // 매우 어두운 베이스가 완전히 0으로 눌리지 않도록 최소 색감을 보전한다.
  const hsl = { h: 0, s: 0, l: 0 };
  shaded.getHSL(hsl);
  if (hsl.l < 0.04) shaded.setHSL(hsl.h, hsl.s, 0.04);
  return shaded;
}

export function deriveStudioVrmHarmonizedOutlineColor(
  baseColor: THREE.Color,
  profile: StudioVrmBodyMtoonProfile,
  explicitShadowHex?: string,
): THREE.Color {
  const source = explicitShadowHex ? new THREE.Color(explicitShadowHex) : baseColor.clone();
  return source.multiplyScalar(0.32).lerp(new THREE.Color(profile.outlineColorHex), 0.58);
}

export interface StudioVrmHairMaterialBundle {
  readonly main: MToonMaterial;
  readonly outline: MToonMaterial;
  readonly ownedTextures: readonly THREE.Texture[];
}

/**
 * 아바타 포지 헤어용 통합 `MToonMaterial`(본체 + 역면 외곽선 + 엔젤링 매트캡).
 * `vertexColors: true` + `ignoreVertexColor: false`로 정점 그라데이션·브릿지·이너 컬러를 보존한다.
 */
export function createStudioVrmHairMToonMaterials(
  hair: {
    readonly baseColor: string;
    readonly shadowColor?: string;
    readonly tipColor: string;
    readonly shine: number;
  },
  profile: StudioVrmBodyMtoonProfile = DEFAULT_STUDIO_VRM_MTOON_PROFILE,
): StudioVrmHairMaterialBundle {
  const baseColor = new THREE.Color(hair.baseColor);
  const tipColor = new THREE.Color(hair.tipColor);
  const shadeColor = deriveStudioVrmHarmonizedShadeColor(
    new THREE.Color(0xffffff),
    profile,
    hair.shadowColor
      ? `#${new THREE.Color(hair.shadowColor).lerp(new THREE.Color("#b8bfd8"), 0.36).getHexString()}`
      : undefined,
  );
  // vertexColors가 이미 baseColor를 담고 있으므로 shadeColorFactor는 밝기·색조 배율로 동작한다.
  shadeColor.copy(new THREE.Color(profile.shadeTintHex)).multiplyScalar(clamp(profile.shadeDarkness * 1.06, 0.62, 0.84));
  if (hair.shadowColor) {
    const customShadow = new THREE.Color(hair.shadowColor);
    const hsl = { h: 0, s: 0, l: 0 };
    customShadow.getHSL(hsl);
    shadeColor.lerp(new THREE.Color().setHSL(hsl.h, clamp(hsl.s * 0.55, 0.05, 0.45), 0.72), 0.42);
  }

  const outlineColor = deriveStudioVrmHarmonizedOutlineColor(baseColor, profile, hair.shadowColor);
  const matcap = createStudioVrmHairAngelRingMatcapTexture(hair.shine);
  const matcapFactor = tipColor.clone().lerp(new THREE.Color("#fff9f2"), 0.55).multiplyScalar(0.18 + clamp(hair.shine, 0, 1) * 0.34);
  const rimColor = tipColor.clone().lerp(new THREE.Color(profile.rimColorHex), 0.65);

  const main = new MToonMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    ignoreVertexColor: false,
    shadeColorFactor: shadeColor,
    shadingToonyFactor: profile.shadingToonyFactor,
    shadingShiftFactor: profile.shadingShiftFactor,
    giEqualizationFactor: profile.giEqualizationFactor,
    matcapTexture: matcap,
    matcapFactor,
    parametricRimColorFactor: rimColor,
    rimLightingMixFactor: profile.rimLightingMixFactor,
    parametricRimFresnelPowerFactor: profile.parametricRimFresnelPowerFactor,
    parametricRimLiftFactor: profile.parametricRimLiftFactor,
    outlineWidthMode: profile.outlineWidthMode,
    outlineWidthFactor: profile.outlineWidthFactor,
    outlineColorFactor: outlineColor,
    outlineLightingMixFactor: profile.outlineLightingMixFactor,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  main.name = "ToonStudioAvatarForgeHair_MToon";
  main.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "hair" };
  main.userData.toonstudioComponent = "hair";

  const outline = new MToonMaterial({
    color: new THREE.Color(0xffffff),
    isOutline: true,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: true,
    outlineWidthMode: profile.outlineWidthMode,
    outlineWidthFactor: profile.outlineWidthMode === "screenCoordinates"
      ? clamp(profile.outlineWidthFactor * 0.9, 0.0009, 0.0022)
      : clamp(profile.outlineWidthFactor * 0.95, 0.001, 0.0024),
    outlineColorFactor: outlineColor,
    outlineLightingMixFactor: profile.outlineLightingMixFactor,
    shadeColorFactor: shadeColor,
    shadingToonyFactor: profile.shadingToonyFactor,
    shadingShiftFactor: profile.shadingShiftFactor,
    giEqualizationFactor: profile.giEqualizationFactor,
  });
  outline.name = "ToonStudioAvatarForgeHairOutline_MToon";
  outline.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "hair-outline" };
  outline.userData.toonstudioComponent = "hair";

  return { main, outline, ownedTextures: [matcap] };
}

/** 워드로브·스커트용 통합 `MToonMaterial`을 생성·갱신한다(금속 블랙 붕괴 방지 + 직조 노멀맵 + 셀 셰이딩). */
export function createStudioVrmGarmentMToonMaterial(
  part: GarmentPart | null,
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  weaveNormalTexture: THREE.DataTexture | null,
  profile: StudioVrmBodyMtoonProfile = DEFAULT_STUDIO_VRM_MTOON_PROFILE,
): MToonMaterial {
  const material = new MToonMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  material.name = part ? `wardrobe-mtoon:${part.bone}` : `wardrobe-mtoon:${fabricId}`;
  material.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "garment", profile };
  applyStudioVrmGarmentMToonStyle(material, part, itemColor, fabricId, weaveNormalTexture, profile);
  return material;
}

export function applyStudioVrmGarmentMToonStyle(
  material: MToonMaterial,
  part: GarmentPart | null,
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  weaveNormalTexture: THREE.DataTexture | null,
  profile: StudioVrmBodyMtoonProfile = (
    (material.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] as { profile?: StudioVrmBodyMtoonProfile } | undefined)?.profile
    ?? DEFAULT_STUDIO_VRM_MTOON_PROFILE
  ),
): void {
  const fabric = wardrobeFabricById(fabricId) ?? WARDROBE_FABRICS[0];
  const color = new THREE.Color(part?.color ?? itemColor);
  const metalness = part?.metalness ?? fabric.metalness;
  const roughness = part?.metalness !== undefined && part.metalness > 0.35
    ? part.roughness ?? fabric.roughness
    : fabric.roughness;
  const fabricSurface = metalness < 0.35;

  const previousOwnedMatcap = material.userData.__studioVrmGarmentMatcap as THREE.Texture | undefined;
  let nextMatcap: THREE.DataTexture | null = null;
  if (metalness >= 0.28 || fabric.clearcoat >= 0.25 || fabric.sheen >= 0.45) {
    nextMatcap = createStudioVrmSpecularMatcapTexture(
      fabricSurface ? clamp(roughness * 0.85, 0.22, 0.72) : roughness,
      fabricSurface ? Math.max(fabric.clearcoat * 0.45, fabric.sheen * 0.28) : metalness,
    );
  }

  material.color.copy(color);
  material.shadeColorFactor.copy(deriveStudioVrmHarmonizedShadeColor(color, profile));
  material.shadingToonyFactor = fabricSurface ? profile.shadingToonyFactor : clamp(profile.shadingToonyFactor * 0.88, 0.62, 0.94);
  material.shadingShiftFactor = profile.shadingShiftFactor;
  material.giEqualizationFactor = profile.giEqualizationFactor;
  material.parametricRimColorFactor.copy(
    color.clone().lerp(new THREE.Color(profile.rimColorHex), fabricSurface ? 0.58 : 0.78),
  );
  material.rimLightingMixFactor = fabricSurface
    ? clamp(profile.rimLightingMixFactor + fabric.sheen * 0.14, 0.2, 0.75)
    : clamp(profile.rimLightingMixFactor + 0.18, 0.35, 0.82);
  material.parametricRimFresnelPowerFactor = fabricSurface ? profile.parametricRimFresnelPowerFactor : 3.2;
  material.parametricRimLiftFactor = fabricSurface ? profile.parametricRimLiftFactor : 0.14;
  material.outlineWidthMode = profile.outlineWidthMode;
  material.outlineWidthFactor = profile.outlineWidthFactor;
  material.outlineColorFactor.copy(deriveStudioVrmHarmonizedOutlineColor(color, profile));
  material.outlineLightingMixFactor = profile.outlineLightingMixFactor;
  material.normalMap = fabricSurface ? weaveNormalTexture : null;
  const normalAmp = fabricSurface ? clamp(fabric.weaveStrength * 22, 0.15, 0.85) : 0;
  material.normalScale.set(normalAmp, normalAmp);
  material.matcapTexture = nextMatcap;
  if (nextMatcap) {
    const matcapStrength = fabricSurface
      ? clamp(fabric.clearcoat * 0.35 + fabric.sheen * 0.22, 0.08, 0.36)
      : clamp(0.28 + metalness * 0.42, 0.3, 0.68);
    material.matcapFactor.copy(color).lerp(new THREE.Color("#ffffff"), fabricSurface ? 0.65 : 0.48).multiplyScalar(matcapStrength);
  } else {
    material.matcapFactor.setRGB(0, 0, 0);
  }
  material.userData.__studioVrmGarmentMatcap = nextMatcap ?? undefined;
  if (part) material.userData.studioVrmGarmentPart = part;
  material.userData.studioVrmGarmentFabricId = fabricId;
  material.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "garment", profile };
  material.needsUpdate = true;

  if (previousOwnedMatcap && previousOwnedMatcap !== nextMatcap) {
    previousOwnedMatcap.dispose();
  }
}

/** 워드로브·스커트 MToon 재질이 소유한 내부 매트캡 텍스처를 정리한다(외부 공유 직조맵은 호출자 정리). */
export function disposeStudioVrmGarmentOwnedMatcap(material: THREE.Material | null | undefined): void {
  if (!material) return;
  const matcap = material.userData?.__studioVrmGarmentMatcap as THREE.Texture | undefined;
  if (matcap) {
    matcap.dispose();
    material.userData.__studioVrmGarmentMatcap = undefined;
  }
}

/** 워드로브/스커트 메시 자식으로 동기화된 역면 MToon 외곽선 메시를 부착한다. */
export function attachStudioVrmGarmentOutlineMesh(
  hostMesh: THREE.Mesh,
  baseMaterial: MToonMaterial,
  profile: StudioVrmBodyMtoonProfile,
): THREE.Mesh | null {
  if (profile.outlineWidthMode === "none" || profile.outlineWidthFactor <= 0) return null;
  const outlineMaterial = new MToonMaterial({
    color: new THREE.Color(0xffffff),
    isOutline: true,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: true,
    outlineWidthMode: profile.outlineWidthMode,
    outlineWidthFactor: profile.outlineWidthFactor,
    outlineColorFactor: baseMaterial.outlineColorFactor.clone(),
    outlineLightingMixFactor: profile.outlineLightingMixFactor,
    shadeColorFactor: baseMaterial.shadeColorFactor.clone(),
    shadingToonyFactor: baseMaterial.shadingToonyFactor,
    shadingShiftFactor: baseMaterial.shadingShiftFactor,
    giEqualizationFactor: baseMaterial.giEqualizationFactor,
  });
  outlineMaterial.name = `${hostMesh.name || "wardrobe"}:outline`;
  outlineMaterial.userData[STUDIO_VRM_CUSTOM_PART_MATERIAL_KEY] = { role: "garment-outline", profile };

  let outlineMesh: THREE.Mesh;
  if ((hostMesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const skinnedHost = hostMesh as THREE.SkinnedMesh;
    // 스키닝 의상·XPBD 스커트는 동일 지오메트리와 스켈레톤을 공유해 프레임 변형을 1:1 추적한다.
    const skinnedOutline = new THREE.SkinnedMesh(skinnedHost.geometry, outlineMaterial);
    skinnedOutline.bindMode = skinnedHost.bindMode;
    skinnedOutline.bind(skinnedHost.skeleton, skinnedHost.bindMatrix);
    skinnedOutline.bindMatrixInverse.copy(skinnedHost.bindMatrixInverse);
    skinnedOutline.frustumCulled = false;
    outlineMesh = skinnedOutline;
  } else {
    outlineMesh = new THREE.Mesh(createStudioVrmSmoothOutlineGeometry(hostMesh.geometry), outlineMaterial);
  }
  outlineMesh.name = `${hostMesh.name || "wardrobe"}:outline`;
  outlineMesh.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] = true;
  outlineMesh.userData.__studioVrmSharesHostGeometry = (hostMesh as THREE.SkinnedMesh).isSkinnedMesh === true;
  outlineMesh.raycast = () => undefined;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  hostMesh.add(outlineMesh);
  return outlineMesh;
}

/** 워드로브 색상/원단 변경 시 자식 외곽선 색도 함께 동기화한다. */
export function syncStudioVrmGarmentOutlineColor(host: THREE.Object3D, baseMaterial: MToonMaterial): void {
  host.traverse((node) => {
    if (node.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] !== true) return;
    const mesh = node as THREE.Mesh;
    const mat = mesh.material as MToonMaterial | undefined;
    if (!mat || !isStudioVrmMtoonMaterial(mat)) return;
    mat.outlineColorFactor.copy(baseMaterial.outlineColorFactor);
    mat.shadeColorFactor.copy(baseMaterial.shadeColorFactor);
    mat.needsUpdate = true;
  });
}

/**
 * 활성 VRM의 `materialFx` 및 `MToonControls` 상태를 새로 장착된 커스텀 파츠에 즉시 반영한다.
 */
export function syncStudioVrmCustomPartToActiveVrm(
  object: THREE.Object3D,
  vrm: VRM | null | undefined,
): void {
  if (!vrm?.scene?.userData) return;
  const activeFx = vrm.scene.userData[STUDIO_VRM_ACTIVE_MATERIAL_FX_KEY] as StudioVrmActiveMaterialFxSnapshot | undefined;
  const activeControls = vrm.scene.userData[STUDIO_VRM_ACTIVE_MTOON_CONTROLS_KEY] as StudioVrmMtoonControls | undefined;
  if (!activeFx && !activeControls) return;

  const materials: THREE.Material[] = [];
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      if (isStudioVrmMtoonMaterial(mat as MToonReadableMaterial)) materials.push(mat);
    }
  });

  if (activeFx) {
    for (const raw of materials) {
      const mat = raw as MToonMaterial;
      if (activeFx.shadeColor) mat.shadeColorFactor?.set(activeFx.shadeColor);
      if (activeFx.outlineColor) mat.outlineColorFactor?.set(activeFx.outlineColor);
      if (activeFx.rimColor) {
        mat.parametricRimColorFactor?.set(activeFx.rimColor);
        mat.rimLightingMixFactor = activeFx.rimIntensity;
      }
      if (activeFx.emissiveColor && mat.isOutline !== true) {
        mat.emissive?.set(activeFx.emissiveColor);
        mat.emissiveIntensity = activeFx.emissiveIntensity;
      }
      mat.needsUpdate = true;
    }
  }
  if (activeControls) {
    for (const mat of materials) applyStudioVrmMtoonControls(mat, activeControls);
  }
}

/** VRM 장면 전체(본체 + 커스텀 파츠)에 MToon 컨트롤을 적용하고 이후 장착 파츠를 위해 상태를 기록한다. */
export function applyStudioVrmMtoonControlsToVrm(
  vrm: VRM | null | undefined,
  controls: StudioVrmMtoonControls,
): void {
  if (!vrm?.scene) return;
  if (vrm.scene.userData) vrm.scene.userData[STUDIO_VRM_ACTIVE_MTOON_CONTROLS_KEY] = controls;
  const materials: THREE.Material[] = [];
  vrm.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      if (isStudioVrmMtoonMaterial(mat as MToonReadableMaterial)) materials.push(mat);
    }
  });
  for (const mat of materials) applyStudioVrmMtoonControls(mat, controls);
}
