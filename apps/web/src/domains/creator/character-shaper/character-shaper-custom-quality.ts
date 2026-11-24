/**
 * Character Shaper — 커스텀 파츠(헤어·의상·액세서리) 3D 품질 일관성 동기화 및
 * SHAPER REA 내재화(초점거리 24–135mm FOV · 정면광 고정 · 안구 하이라이트 · 신장/등신비) 순수·런타임 유틸.
 *
 * 해결 대상(#236):
 * 1. 커스텀 헤어/의상/소품 장착 시 VRM 본체 MToon과 이질적인 플라스틱 광택·어두운 환경광·그림자 누락 동기화.
 * 2. 원본 VRM 헤어 + 절차형 헤어 이중 겹침(Z-fighting) 방지(`replaceOriginal` 자동 승격).
 * 3. 원본 VRM 의상 + 절차형 워드로브 이중 겹침(Z-fighting) 방지(충돌 슬롯 원본 자동 숨김·해제 시 복원).
 */
import * as THREE from "three";

import { DEFAULT_AVATAR_FORGE_STATE } from "../vrm/studio-vrm-avatar-forge";
import { classifyMeshName } from "../vrm/studio-vrm-costume";
import { isStudioVrmMtoonMaterial } from "../vrm/studio-vrm-mtoon-brand";

import type { CharacterOriginalHairColors } from "./character-shaper-contract";
import type { AvatarForgeFaceParams, AvatarForgeHairParams } from "../vrm/studio-vrm-avatar-forge";
import type { CostumeSlot } from "../vrm/studio-vrm-costume";
import type { StudioVrmProportions } from "../vrm/studio-vrm-proportion-core";
import type { WardrobeSlot, WardrobeState } from "../vrm/studio-vrm-wardrobe";
import type { ShaperMtoonMaterialSettings } from "./character-shaper-mtoon-uniforms";

/* -------------------------------------------------------------------------- */
/* 1. SHAPER 카메라 초점거리(24–135mm) ↔ 수직 FOV 변환 (35mm 풀프레임 24mm 센서) */
/* -------------------------------------------------------------------------- */

export interface ShaperFocalLengthPreset {
  readonly focalMm: number;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly fovDeg: number;
}

const FULL_FRAME_SENSOR_HEIGHT_MM = 24;

/** 35mm 풀프레임 초점거리(mm)를 수직 시야각(deg)으로 변환한다. */
export function focalLengthMmToVerticalFovDeg(focalMm: number): number {
  const safeMm = Number.isFinite(focalMm) ? Math.min(200, Math.max(14, focalMm)) : 50;
  const rad = 2 * Math.atan(FULL_FRAME_SENSOR_HEIGHT_MM / (2 * safeMm));
  return Number(((rad * 180) / Math.PI).toFixed(1));
}

export const SHAPER_CAMERA_FOCAL_PRESETS: readonly ShaperFocalLengthPreset[] = Object.freeze([
  { focalMm: 24, labelKo: "24mm 광각", hintKo: "역동적 원근감", fovDeg: focalLengthMmToVerticalFovDeg(24) },
  { focalMm: 35, labelKo: "35mm 스냅", hintKo: "자연스러운 전신", fovDeg: focalLengthMmToVerticalFovDeg(35) },
  { focalMm: 50, labelKo: "50mm 표준", hintKo: "기본 웹툰 시점", fovDeg: focalLengthMmToVerticalFovDeg(50) },
  { focalMm: 85, labelKo: "85mm 인물", hintKo: "왜곡 적은 클로즈업", fovDeg: focalLengthMmToVerticalFovDeg(85) },
  { focalMm: 135, labelKo: "135mm 망원", hintKo: "평면적 일러스트 구도", fovDeg: focalLengthMmToVerticalFovDeg(135) },
]);

interface PerspectiveCameraLike {
  fov?: number;
  isPerspectiveCamera?: boolean;
  updateProjectionMatrix?: () => void;
  position?: { readonly x: number; readonly y: number; readonly z: number };
}

/** 호스트 뷰포트 카메라에 초점거리(mm) 기반 수직 FOV를 즉시 적용한다. */
export function applyCameraFocalLengthToCamera(
  camera: PerspectiveCameraLike | null | undefined,
  focalMm: number,
): number | null {
  if (!camera || typeof camera.fov !== "number") return null;
  const fovDeg = focalLengthMmToVerticalFovDeg(focalMm);
  camera.fov = fovDeg;
  camera.updateProjectionMatrix?.();
  return fovDeg;
}

/* -------------------------------------------------------------------------- */
/* 2. SHAPER 정면광 고정 (UIManager.SetFrontLight)                             */
/* -------------------------------------------------------------------------- */

const lightBaselinePositions = new WeakMap<object, readonly [number, number, number]>();

interface SceneLightCandidate {
  readonly isDirectionalLight?: boolean;
  readonly position?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
}

/**
 * 주 방향광을 카메라 정면 오프셋에 고정하거나(웹툰 얼굴 음영 정리) 원본 광원 위치로 복원한다.
 */
export function applyFrontLightLockToScene(
  scene: { readonly traverse?: (cb: (obj: THREE.Object3D) => void) => void } | null | undefined,
  cameraPosition: { readonly x: number; readonly y: number; readonly z: number } | null | undefined,
  enabled: boolean,
): number {
  if (!scene || typeof scene.traverse !== "function") return 0;
  let updated = 0;
  scene.traverse((node) => {
    const light = node as unknown as SceneLightCandidate;
    if (!light.isDirectionalLight || !light.position) return;
    if (!lightBaselinePositions.has(node)) {
      lightBaselinePositions.set(node, [light.position.x, light.position.y, light.position.z]);
    }
    if (enabled && cameraPosition) {
      const cx = Number.isFinite(cameraPosition.x) ? cameraPosition.x : 0;
      const cy = Number.isFinite(cameraPosition.y) ? cameraPosition.y : 1.5;
      const cz = Number.isFinite(cameraPosition.z) ? cameraPosition.z : 2.5;
      const nx = cx * 0.9 + 0.25;
      const ny = Math.max(1.2, cy + 0.35);
      const nz = cz * 0.9 + 0.4;
      if (typeof light.position.set === "function") light.position.set(nx, ny, nz);
      else {
        light.position.x = nx;
        light.position.y = ny;
        light.position.z = nz;
      }
      updated += 1;
    } else {
      const base = lightBaselinePositions.get(node);
      if (base) {
        if (typeof light.position.set === "function") light.position.set(base[0], base[1], base[2]);
        else {
          light.position.x = base[0];
          light.position.y = base[1];
          light.position.z = base[2];
        }
        updated += 1;
      }
    }
  });
  return updated;
}

/* -------------------------------------------------------------------------- */
/* 3. 커스텀 헤어·의상·소품 비-MToon 재질 품질 일관성 동기화 (#236)             */
/* -------------------------------------------------------------------------- */

interface NonMtoonMutableMaterial {
  readonly name?: string;
  readonly isMToonMaterial?: boolean;
  readonly isMToonNodeMaterial?: boolean;
  readonly isMeshStandardMaterial?: boolean;
  readonly isMeshPhysicalMaterial?: boolean;
  readonly isMeshToonMaterial?: boolean;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  flatShading?: boolean;
  map?: { colorSpace?: string; needsUpdate?: boolean } | null;
  userData?: Record<string, unknown>;
  needsUpdate?: boolean;
}

interface NonMtoonBaseline {
  readonly roughness?: number;
  readonly metalness?: number;
  readonly envMapIntensity?: number;
  readonly flatShading?: boolean;
}

const nonMtoonBaselines = new WeakMap<object, NonMtoonBaseline>();
const METAL_NAME_PATTERN = /(?:metal|steel|iron|silver|gold|chrome|blade|sword|armor|buckle|ring|earring|금속|검)/iu;
const CUSTOM_ATTACHMENT_ROOT_PATTERN = /(?:wardrobe:|prop:|avatar[-_]?forge|hair|bang|ponytail|twintail|garment|accessory|shoe|skirt|jacket|shirt)/iu;

function captureNonMtoonBaseline(mat: NonMtoonMutableMaterial): NonMtoonBaseline {
  const existing = nonMtoonBaselines.get(mat);
  if (existing) return existing;
  const baseline: NonMtoonBaseline = Object.freeze({
    roughness: typeof mat.roughness === "number" ? mat.roughness : undefined,
    metalness: typeof mat.metalness === "number" ? mat.metalness : undefined,
    envMapIntensity: typeof mat.envMapIntensity === "number" ? mat.envMapIntensity : undefined,
    flatShading: typeof mat.flatShading === "boolean" ? mat.flatShading : undefined,
  });
  nonMtoonBaselines.set(mat, baseline);
  return baseline;
}

export interface CustomAttachmentQualitySyncResult {
  readonly harmonizedMaterials: number;
  readonly smoothShadedMeshes: number;
  readonly srgbMapsNormalized: number;
}

/**
 * VRM 씬과 호스트 씬에 부착된 절차형 헤어·워드로브·액세서리(비-MToon PBR/Toon 재질)의
 * 거칠기·금속도·환경광·스무스 셰이딩·sRGB 색공간·그림자 설정을 본체 웹툰 톤과 일치시킨다.
 */
export function syncCustomAttachmentQuality(
  roots: readonly ({ readonly traverse?: (cb: (obj: THREE.Object3D) => void) => void } | null | undefined)[],
  settings: Pick<ShaperMtoonMaterialSettings, "shadeWidth" | "rLightWidth" | "shaderMode">,
): CustomAttachmentQualitySyncResult {
  const visited = new Set<object>();
  let harmonizedMaterials = 0;
  let smoothShadedMeshes = 0;
  let srgbMapsNormalized = 0;
  const isModeling = settings.shaderMode === "modeling";
  const targetMinRoughness = isModeling ? 0.52 : Number(Math.min(0.82, Math.max(0.58, 0.74 - settings.rLightWidth * 0.14)).toFixed(2));
  const targetEnvIntensity = isModeling ? 0.72 : 0.62;

  for (const root of roots) {
    if (!root || typeof root.traverse !== "function") continue;
    root.traverse((node) => {
      const mesh = node as Partial<THREE.Mesh> & { parent?: { name?: string } | null };
      if (!mesh.isMesh || !mesh.material) return;
      const meshName = typeof mesh.name === "string" ? mesh.name : "";
      const parentName = typeof mesh.parent?.name === "string" ? mesh.parent.name : "";
      const isCustom = CUSTOM_ATTACHMENT_ROOT_PATTERN.test(meshName) || CUSTOM_ATTACHMENT_ROOT_PATTERN.test(parentName);
      if (isCustom) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const candidate of materials) {
        if (!candidate || typeof candidate !== "object") continue;
        const mat = candidate as unknown as NonMtoonMutableMaterial;
        if (isStudioVrmMtoonMaterial(mat) || visited.has(candidate)) continue;
        if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial && !mat.isMeshToonMaterial) continue;
        visited.add(candidate);
        const baseline = captureNonMtoonBaseline(mat);
        const matName = typeof mat.name === "string" ? mat.name : "";
        const isMetallic = METAL_NAME_PATTERN.test(matName) || METAL_NAME_PATTERN.test(meshName) || (baseline.metalness ?? 0) >= 0.65;

        // 비금속 커스텀 헤어/의상/소품의 번들거리는 플라스틱 광택 제거
        if (typeof mat.roughness === "number" && !isMetallic) {
          const baseRough = baseline.roughness ?? mat.roughness;
          mat.roughness = Math.max(baseRough, targetMinRoughness);
        }
        if (typeof mat.metalness === "number" && !isMetallic) {
          mat.metalness = Math.min(baseline.metalness ?? mat.metalness, 0.12);
        }
        if (typeof mat.envMapIntensity === "number") {
          mat.envMapIntensity = Math.min(baseline.envMapIntensity ?? mat.envMapIntensity, targetEnvIntensity);
        }
        // 각진 저폴리 느낌을 유발하는 강제 flatShading 해제
        if (mat.flatShading === true && isCustom) {
          mat.flatShading = false;
          smoothShadedMeshes += 1;
        }
        if (mat.map && mat.map.colorSpace === THREE.NoColorSpace) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.needsUpdate = true;
          srgbMapsNormalized += 1;
        }
        const userData = (mat.userData ??= {});
        userData.shaperCustomQualityHarmonized = true;
        mat.needsUpdate = true;
        harmonizedMaterials += 1;
      }
    });
  }

  return Object.freeze({ harmonizedMaterials, smoothShadedMeshes, srgbMapsNormalized });
}

/* -------------------------------------------------------------------------- */
/* 4. 이중 헤어 / 이중 의상 겹침 방지 (#236)                                   */
/* -------------------------------------------------------------------------- */

const COSTUME_SLOTS_FOR_WARDROBE: Readonly<Record<WardrobeSlot, readonly CostumeSlot[]>> = Object.freeze({
  top: ["tops", "onepiece"],
  outer: ["outer"],
  bottom: ["bottoms", "onepiece"],
  shoes: ["shoes"],
});

const HAIR_TEXTURE_SAMPLE_EDGE = 16;
const HAIR_OUTLINE_NAME_PATTERN = /\boutline\b/iu;

interface SampledHairMaterialLike {
  readonly name?: string;
  readonly isOutline?: boolean;
  readonly color?: THREE.Color;
  readonly shadeColorFactor?: THREE.Color;
  readonly map?: {
    readonly image?: {
      readonly width?: number;
      readonly height?: number;
      readonly data?: Uint8Array | Uint8ClampedArray;
    } | null;
  } | null;
  readonly userData?: Record<string, unknown>;
}

function normalizeHairMaterialName(name: string): string {
  return name.replace(/\s*\((?:outline|instance)\)\s*/giu, " ").trim();
}

function isGeneratedOrCustomHairObject(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    const data = current.userData;
    if (
      data?.toonSpectrumAvatarForge === true
      || data?.studioVrmCustomPartOutline === true
      || typeof data?.characterAuthoringDerivative === "string"
      || data?.characterCanonicalPart === true
      || current.name.startsWith("wardrobe:")
      || current.name.startsWith("prop:")
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function sampleTextureMeanSrgb(
  map: SampledHairMaterialLike["map"],
): { readonly r: number; readonly g: number; readonly b: number } | null {
  const image = map?.image;
  if (!image) return null;
  const width = typeof image.width === "number" ? Math.floor(image.width) : 0;
  const height = typeof image.height === "number" ? Math.floor(image.height) : 0;
  if (width <= 0 || height <= 0) return null;

  let pixels: Uint8Array | Uint8ClampedArray | null = null;
  let sampleW = width;
  let sampleH = height;

  if (
    (image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray)
    && image.data.length >= width * height * 4
  ) {
    pixels = image.data;
  } else if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      sampleW = Math.min(width, HAIR_TEXTURE_SAMPLE_EDGE);
      sampleH = Math.min(height, HAIR_TEXTURE_SAMPLE_EDGE);
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, sampleW, sampleH);
        pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      pixels = null;
    }
  }

  if (!pixels || sampleW <= 0 || sampleH <= 0) return null;

  const stepX = Math.max(1, Math.floor(sampleW / HAIR_TEXTURE_SAMPLE_EDGE));
  const stepY = Math.max(1, Math.floor(sampleH / HAIR_TEXTURE_SAMPLE_EDGE));
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = 0; y < sampleH; y += stepY) {
    for (let x = 0; x < sampleW; x += stepX) {
      const offset = (y * sampleW + x) * 4;
      const alpha = pixels[offset + 3] ?? 255;
      if (alpha < 128) continue;
      rSum += (pixels[offset] ?? 0) / 255;
      gSum += (pixels[offset + 1] ?? 0) / 255;
      bSum += (pixels[offset + 2] ?? 0) / 255;
      count += 1;
    }
  }
  if (count === 0) return null;
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

/** 기준 모발색에서 자연스럽게 어울리는 모발 끝(그라데이션) 색을 계산한다. */
export function deriveHarmoniousHairTipColor(baseColorHex: string): string {
  const color = new THREE.Color(baseColorHex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  const nextHue = (hsl.h + (hsl.l < 0.5 ? 0.012 : -0.008) + 1) % 1;
  const nextSat = hsl.s < 0.05
    ? hsl.s
    : Math.min(0.88, Math.max(0.08, hsl.s * (hsl.l > 0.72 ? 0.92 : 0.96) + 0.02));
  const nextLight = hsl.l > 0.84
    ? Math.max(0.64, hsl.l - 0.14)
    : hsl.l > 0.7
      ? Math.min(0.94, hsl.l + 0.1)
      : Math.min(0.86, hsl.l + 0.14 + (1 - hsl.l) * 0.07);
  const tip = new THREE.Color().setHSL(nextHue, nextSat, nextLight, THREE.SRGBColorSpace);
  return `#${tip.getHexString()}`;
}

/**
 * 불러온 VRM의 원본 헤어 메시·재질에서 대표 모발 기본색과 조화로운 끝 색을 가볍게 샘플링한다.
 * 생성된 절차형 파츠·외곽선·헤어 액세서리는 건너뛴다.
 */
export function sampleOriginalVrmHairColors(
  vrm: { readonly scene?: { readonly traverse?: (cb: (obj: THREE.Object3D) => void) => void } | null } | null | undefined,
): CharacterOriginalHairColors | null {
  const traverse = vrm?.scene?.traverse;
  if (!vrm?.scene || typeof traverse !== "function") return null;

  const visited = new Set<object>();
  let rTotal = 0;
  let gTotal = 0;
  let bTotal = 0;
  let samples = 0;

  traverse.call(vrm.scene, (node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (!mesh.isMesh || !mesh.material || isGeneratedOrCustomHairObject(node)) return;
    const meshClass = classifyMeshName(typeof mesh.name === "string" ? mesh.name : "");
    if (meshClass.slot !== null) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of materials) {
      if (!raw || typeof raw !== "object" || visited.has(raw)) continue;
      const mat = raw as unknown as SampledHairMaterialLike;
      if (mat.isOutline === true || mat.userData?.studioVrmCustomPartMaterial) continue;
      const rawName = typeof mat.name === "string" ? mat.name : "";
      if (HAIR_OUTLINE_NAME_PATTERN.test(rawName)) continue;

      const matClass = classifyMeshName(normalizeHairMaterialName(rawName));
      if (matClass.slot !== null) continue;
      const isHairMaterial =
        matClass.protected === "hair"
        || (meshClass.protected === "hair" && (matClass.protected === null || matClass.protected === "hair"));
      if (!isHairMaterial) continue;
      visited.add(raw);

      const factor = { r: 1, g: 1, b: 1 };
      if (mat.color?.isColor) {
        mat.color.getRGB(factor, THREE.SRGBColorSpace);
      }

      const texMean = mat.map ? sampleTextureMeanSrgb(mat.map) : null;
      if (texMean) {
        rTotal += Math.min(1, Math.max(0, texMean.r * factor.r));
        gTotal += Math.min(1, Math.max(0, texMean.g * factor.g));
        bTotal += Math.min(1, Math.max(0, texMean.b * factor.b));
        samples += 1;
        continue;
      }

      const factorNearWhite = Math.min(factor.r, factor.g, factor.b) >= 0.94;
      if (mat.map && factorNearWhite) {
        if (mat.shadeColorFactor?.isColor) {
          const shade = { r: 0, g: 0, b: 0 };
          mat.shadeColorFactor.getRGB(shade, THREE.SRGBColorSpace);
          if (Math.max(shade.r, shade.g, shade.b) > 0.06 && Math.min(shade.r, shade.g, shade.b) < 0.94) {
            rTotal += Math.min(1, shade.r * 1.18);
            gTotal += Math.min(1, shade.g * 1.18);
            bTotal += Math.min(1, shade.b * 1.18);
            samples += 1;
          }
        }
        continue;
      }

      if (mat.color?.isColor) {
        rTotal += Math.min(1, Math.max(0, factor.r));
        gTotal += Math.min(1, Math.max(0, factor.g));
        bTotal += Math.min(1, Math.max(0, factor.b));
        samples += 1;
      }
    }
  });

  if (samples === 0) return null;
  const mean = new THREE.Color().setRGB(
    rTotal / samples,
    gTotal / samples,
    bTotal / samples,
    THREE.SRGBColorSpace,
  );
  const baseColor = `#${mean.getHexString()}`;
  return Object.freeze({
    baseColor,
    tipColor: deriveHarmoniousHairTipColor(baseColor),
  });
}

/**
 * 원본 유지 상태에서 절차형 헤어로 처음 전환할 때, 사용자가 별도 모발색을 지정하지 않았다면
 * 원본 VRM의 모발색을 자동 상속해야 하는지 판정한다.
 */
export function shouldInheritOriginalHairColors(
  current: {
    readonly style?: string;
    readonly replaceOriginal?: boolean;
    readonly baseColor?: string;
    readonly tipColor?: string;
    readonly customHairColor?: string | null;
  },
  patch: Partial<AvatarForgeHairParams>,
): boolean {
  const fromOriginal = (current.style ?? "none") === "none" && current.replaceOriginal !== true;
  if (!fromOriginal) return false;
  if (typeof patch.style !== "string" || patch.style === "none") return false;
  if (patch.baseColor !== undefined || patch.tipColor !== undefined) return false;
  if (typeof current.customHairColor === "string" && current.customHairColor.trim().length > 0) return false;

  const defaultBase = DEFAULT_AVATAR_FORGE_STATE.hair.baseColor.toLowerCase();
  const defaultTip = DEFAULT_AVATAR_FORGE_STATE.hair.tipColor.toLowerCase();
  const currentBase = typeof current.baseColor === "string" ? current.baseColor.trim().toLowerCase() : defaultBase;
  const currentTip = typeof current.tipColor === "string" ? current.tipColor.trim().toLowerCase() : defaultTip;
  return currentBase === defaultBase && currentTip === defaultTip;
}

/**
 * 절차형 헤어 스타일을 선택할 때 원본 VRM 헤어와 이중으로 겹치지 않도록 `replaceOriginal: true`를 자동 보정하고,
 * 원본 유지에서 처음 절차형 스타일로 전환 시 사용자가 모발색을 바꾸지 않았다면 원본 VRM 모발색을 상속한다.
 * 사용자가 명시적으로 `replaceOriginal: false`를 지정했거나 `style: "none"`(원본 유지)로 돌릴 때는 존중한다.
 */
export function resolveHairCommitPatch(
  patch: Partial<AvatarForgeHairParams>,
  current: {
    readonly style?: string;
    readonly replaceOriginal?: boolean;
    readonly baseColor?: string;
    readonly tipColor?: string;
    readonly customHairColor?: string | null;
  },
  originalHairColors?: CharacterOriginalHairColors | null,
): Partial<AvatarForgeHairParams> {
  const inheritColors = originalHairColors && shouldInheritOriginalHairColors(current, patch)
    ? { baseColor: originalHairColors.baseColor, tipColor: originalHairColors.tipColor }
    : null;
  const nextStyle = patch.style ?? current.style ?? "none";
  const activatingFromOriginal =
    patch.replaceOriginal === undefined
    && nextStyle !== "none"
    && (current.style ?? "none") === "none"
    && typeof patch.style === "string";

  if (!activatingFromOriginal && !inheritColors) return patch;
  return {
    ...patch,
    ...(activatingFromOriginal ? { replaceOriginal: true } : {}),
    ...(inheritColors ?? {}),
  };
}

/**
 * 장착된 워드로브 슬롯에 따라 겹치는 원본 VRM 의상 메시 키의 숨김 상태를 계산한다.
 * - 절차형 상의/아우터/하의/신발을 입히면 충돌하는 원본 의상 메시를 숨겨 Z-fighting을 방지한다.
 * - 해당 슬롯을 해제(`null`)하면 충돌하지 않는 원본 의상 메시를 다시 표시한다.
 */
export function computeOriginalCostumeHiddenKeysForWardrobe(input: {
  readonly currentHidden: readonly string[];
  readonly costumeMeshes: readonly { readonly key: string; readonly slot: CostumeSlot }[];
  readonly changedSlot: WardrobeSlot;
  readonly nextWardrobe: WardrobeState;
}): readonly string[] {
  const { currentHidden, costumeMeshes, changedSlot, nextWardrobe } = input;
  if (costumeMeshes.length === 0) return currentHidden;
  const candidateSlots = COSTUME_SLOTS_FOR_WARDROBE[changedSlot];
  if (!candidateSlots || candidateSlots.length === 0) return currentHidden;

  const hiddenSet = new Set(currentHidden);
  const slotEquipped = Boolean(nextWardrobe[changedSlot]?.itemId);
  const anyOnepieceConflict = Boolean(nextWardrobe.top?.itemId || nextWardrobe.bottom?.itemId);

  for (const mesh of costumeMeshes) {
    if (!candidateSlots.includes(mesh.slot)) continue;
    if (mesh.slot === "onepiece") {
      if (anyOnepieceConflict) hiddenSet.add(mesh.key);
      else hiddenSet.delete(mesh.key);
    } else if (slotEquipped) {
      hiddenSet.add(mesh.key);
    } else {
      hiddenSet.delete(mesh.key);
    }
  }
  return [...hiddenSet];
}

/** 호스트의 원본 의상 메시 숨김 상태를 변경된 워드로브 슬롯과 동기화한다. */
export function syncHostCostumeVisibilityForWardrobe(
  host: {
    readonly costumeState?: { readonly hidden?: readonly string[]; readonly recolor?: Readonly<Record<string, string>> } | null;
    readonly costumeMeshes?: readonly { readonly key: string; readonly slot: CostumeSlot }[] | null;
    readonly updateCostume?: (next: { hidden: string[]; recolor: Record<string, string> }) => void;
  },
  changedSlots: readonly WardrobeSlot[],
  nextWardrobe: WardrobeState,
): void {
  const costume = host.costumeState;
  const meshes = Array.isArray(host.costumeMeshes) ? host.costumeMeshes : [];
  if (!costume || meshes.length === 0 || changedSlots.length === 0 || typeof host.updateCostume !== "function") return;
  let hidden: readonly string[] = Array.isArray(costume.hidden) ? costume.hidden : [];
  for (const slot of changedSlots) {
    hidden = computeOriginalCostumeHiddenKeysForWardrobe({
      currentHidden: hidden,
      costumeMeshes: meshes,
      changedSlot: slot,
      nextWardrobe,
    });
  }
  host.updateCostume({ hidden: [...hidden], recolor: { ...(costume.recolor ?? {}) } });
}

/* -------------------------------------------------------------------------- */
/* 5. SHAPER 신장(cm)·등신비 실측 (`BodyData::GetBodyHeight`) & 안구 하이라이트 */
/* -------------------------------------------------------------------------- */

export interface ShaperBodyMetrics {
  readonly heightCm: number;
  readonly headRatio: number;
  readonly summaryKo: string;
}

/** VRM 체형 비율에서 SHAPER 기준 신장(cm)과 등신비를 계산한다. */
export function computeShaperBodyMetrics(proportions: Partial<StudioVrmProportions> | null | undefined): ShaperBodyMetrics {
  const overall = typeof proportions?.overallHeight === "number" && Number.isFinite(proportions.overallHeight)
    ? proportions.overallHeight
    : 1;
  const headBodyRatio = typeof proportions?.headBodyRatio === "number" && Number.isFinite(proportions.headBodyRatio)
    ? proportions.headBodyRatio
    : 1;
  const heightCm = Math.round(165 * Math.min(1.4, Math.max(0.55, overall)));
  const headRatio = Number(Math.min(9.0, Math.max(2.5, 7.0 * headBodyRatio)).toFixed(1));
  return Object.freeze({
    heightCm,
    headRatio,
    summaryKo: `신장 약 ${heightCm}cm · ${headRatio.toFixed(1)}등신`,
  });
}

export type ShaperEyeballHighlightMode = "fix" | "cam" | "light" | "world";

export interface ShaperEyeballHighlightSettings {
  readonly mode: ShaperEyeballHighlightMode;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly alpha: number;
}

export const DEFAULT_SHAPER_EYEBALL_HIGHLIGHT: ShaperEyeballHighlightSettings = Object.freeze({
  mode: "cam",
  offsetX: 0,
  offsetY: 0,
  alpha: 0.9,
});

export const SHAPER_EYEBALL_HIGHLIGHT_MODE_OPTIONS: readonly {
  readonly id: ShaperEyeballHighlightMode;
  readonly labelKo: string;
  readonly hintKo: string;
}[] = Object.freeze([
  { id: "cam", labelKo: "카메라 추종", hintKo: "시점에 맞춰 하이라이트 유지" },
  { id: "fix", labelKo: "정면 고정", hintKo: "눈동자 위치에 고정" },
  { id: "light", labelKo: "광원 추종", hintKo: "조명 방향에 맞춰 반사" },
  { id: "world", labelKo: "월드 고정", hintKo: "3D 공간 축 기준 고정" },
]);

const EYE_HIGHLIGHT_PATTERN = /(?:highlight|catchlight|glint|eye_?light|eyelight|하이라이트)/iu;

/**
 * SHAPER EyeballData(highlight X/Y/Alpha/Mode) 파라미터를 VRM 안구 하이라이트 재질/메시에 반영한다.
 */
export function applyEyeballHighlightSettingsToVrm(
  vrm: { readonly scene?: { readonly traverse?: (cb: (obj: THREE.Object3D) => void) => void } | null } | null | undefined,
  settings: ShaperEyeballHighlightSettings,
): number {
  const traverse = vrm?.scene?.traverse;
  if (!vrm?.scene || typeof traverse !== "function") return 0;
  let updated = 0;
  const alpha = Math.min(1, Math.max(0, Number.isFinite(settings.alpha) ? settings.alpha : 0.9));
  traverse.call(vrm.scene, (node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshMatch = EYE_HIGHLIGHT_PATTERN.test(mesh.name ?? "");
    for (const mat of mats) {
      const typed = mat as { name?: string; opacity?: number; transparent?: boolean; userData?: Record<string, unknown>; needsUpdate?: boolean };
      if (!meshMatch && !EYE_HIGHLIGHT_PATTERN.test(typed.name ?? "")) continue;
      if (typeof typed.opacity === "number") {
        typed.transparent = alpha < 0.99 || Boolean(typed.transparent);
        typed.opacity = alpha;
      }
      const userData = (typed.userData ??= {});
      userData.shaperEyeballHighlight = settings;
      typed.needsUpdate = true;
      updated += 1;
    }
  });
  return updated;
}

/* -------------------------------------------------------------------------- */
/* 6. 초보자용 원클릭 장르별 캐릭터 스타터 프리셋                                */
/* -------------------------------------------------------------------------- */

export interface CharacterGenreStarterPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly face: Partial<AvatarForgeFaceParams>;
  readonly hair: Partial<AvatarForgeHairParams>;
  readonly skinHex: string;
  readonly irisHex: string;
  readonly material: Partial<ShaperMtoonMaterialSettings>;
}

export const CHARACTER_GENRE_STARTERS: readonly CharacterGenreStarterPreset[] = Object.freeze([
  {
    id: "rofan-noble",
    labelKo: "로판 영애",
    summaryKo: "긴 웨이브 · 따뜻한 벨벳 음영",
    face: { headWidth: 0.96, headHeight: 1.04, cheekVolume: 0.32, chinLength: 1.04 },
    hair: { style: "long", bangStyle: "curtain", baseColor: "#e8c882", tipColor: "#f7e6bd", length: 1.25, wave: 0.35, replaceOriginal: true },
    skinHex: "#f9e4d6",
    irisHex: "#4d7fd6",
    material: { shaderMode: "toon", shadePos: 0.52, shadeWidth: 0.24, rLightPos: 0.78, rLightWidth: 0.45, outlinePressure: true, disableHairInline: true, outlineScale: 0.9 },
  },
  {
    id: "academy-youth",
    labelKo: "학원 청춘",
    summaryKo: "단발 보브 · 또렷한 2단 셀",
    face: { headWidth: 1.0, headHeight: 1.0, cheekVolume: 0.42, chinLength: 0.97 },
    hair: { style: "bob", bangStyle: "full", baseColor: "#2d2428", tipColor: "#4b3b42", length: 0.95, curl: 0.2, replaceOriginal: true },
    skinHex: "#f3d3bd",
    irisHex: "#6d4834",
    material: { shaderMode: "toon", shadePos: 0.5, shadeWidth: 0.12, rLightPos: 0.82, rLightWidth: 0.25, outlinePressure: true, disableHairInline: true, outlineScale: 1.0 },
  },
  {
    id: "action-hunter",
    labelKo: "액션 헌터",
    summaryKo: "날렵한 윤곽 · 강한 잉크 대비",
    face: { headWidth: 0.95, headHeight: 1.05, cheekVolume: 0.22, chinLength: 1.06 },
    hair: { style: "short", bangStyle: "split", baseColor: "#1a1c24", tipColor: "#333a4d", length: 0.88, volume: 1.08, replaceOriginal: true },
    skinHex: "#ecc0a1",
    irisHex: "#9b2c2c",
    material: { shaderMode: "toon", shadePos: 0.62, shadeWidth: 0.06, rLightPos: 0.72, rLightWidth: 0.65, outlinePressure: true, disableHairInline: true, outlineScale: 1.3 },
  },
  {
    id: "modern-office",
    labelKo: "현대 오피스",
    summaryKo: "깔끔한 묶음 · 세미리얼 소프트",
    face: { headWidth: 0.98, headHeight: 1.03, cheekVolume: 0.3, chinLength: 1.02 },
    hair: { style: "ponytail", bangStyle: "side-swept", baseColor: "#3b2a22", tipColor: "#5e4538", length: 1.05, tailHeight: 0.58, replaceOriginal: true },
    skinHex: "#ecc0a1",
    irisHex: "#3a312c",
    material: { shaderMode: "toon", shadePos: 0.48, shadeWidth: 0.38, rLightPos: 0.8, rLightWidth: 0.4, outlinePressure: true, disableHairInline: true, outlineScale: 0.8 },
  },
  {
    id: "daily-healing",
    labelKo: "일상 힐링",
    summaryKo: "부드러운 볼살 · 포근한 파스텔",
    face: { headWidth: 1.04, headHeight: 0.97, cheekVolume: 0.52, chinLength: 0.94 },
    hair: { style: "twintail", bangStyle: "full", baseColor: "#8c5c49", tipColor: "#c9967d", length: 1.0, curl: 0.3, replaceOriginal: true },
    skinHex: "#f3d3bd",
    irisHex: "#b47b38",
    material: { shaderMode: "toon", shadePos: 0.44, shadeWidth: 0.28, rLightPos: 0.85, rLightWidth: 0.35, outlinePressure: true, disableHairInline: true, outlineScale: 0.85 },
  },
  {
    id: "fantasy-saint",
    labelKo: "판타지 성녀",
    summaryKo: "실버 롱헤어 · 신비로운 역광",
    face: { headWidth: 0.96, headHeight: 1.04, cheekVolume: 0.34, chinLength: 1.03 },
    hair: { style: "long", bangStyle: "split", baseColor: "#cfd8e8", tipColor: "#eef2ff", length: 1.35, wave: 0.2, replaceOriginal: true },
    skinHex: "#f9e4d6",
    irisHex: "#6d59b8",
    material: { shaderMode: "toon", shadePos: 0.46, shadeWidth: 0.2, rLightPos: 0.75, rLightWidth: 0.58, outlinePressure: true, disableHairInline: true, outlineScale: 0.9 },
  },
]);
