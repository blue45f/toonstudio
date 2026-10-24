/**
 * Studio BG3D CC0 2K PBR 다중 채널 텍스처 로더 및 Three.js MeshStandardMaterial 바인더.
 *
 * `studio-bg3d-cc0-surface-material-catalog.ts`에 등록된 82종(Poly Haven 80 + ambientCG 2)
 * CC0 2K 표면 재질의 4채널 PBR 맵(`baseColorUrl`, `roughnessUrl`, `normalGlUrl`, `aoUrl`)과
 * 변위 맵(`displacementUrl`)을 GPU 텍스처 캐시로 관리하고, 프리미티브 및 커스텀 3D 모델의
 * `MeshStandardMaterial`에 즉시 바인딩한다.
 */

import * as THREE from "three";

import {
  findStudioBg3dCc0SurfaceMaterial,
  resolveStudioBg3dCc0SurfaceMaterialFromOverride,
  type StudioBg3dCc0SurfaceMaterialEntry,
} from "./studio-bg3d-cc0-surface-material-catalog";

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";

export interface StudioBg3dCc0PbrTextureSet {
  readonly materialId: string;
  readonly entry: StudioBg3dCc0SurfaceMaterialEntry;
  readonly baseColorMap: THREE.Texture;
  readonly roughnessMap: THREE.Texture | null;
  readonly normalMap: THREE.Texture | null;
  readonly aoMap: THREE.Texture | null;
  readonly displacementMap: THREE.Texture | null;
}

export interface StudioBg3dCc0PbrMaterialSpread {
  readonly map: THREE.Texture | null;
  readonly roughnessMap: THREE.Texture | null;
  readonly normalMap: THREE.Texture | null;
  readonly aoMap: THREE.Texture | null;
}

export type StudioBg3dTextureFactory = (url: string) => THREE.Texture;

const textureByUrlCache = new Map<string, THREE.Texture>();
const textureSetByMaterialIdCache = new Map<string, StudioBg3dCc0PbrTextureSet>();

let sharedThreeTextureLoader: THREE.TextureLoader | null = null;

function defaultTextureFactory(url: string): THREE.Texture {
  if (typeof Image === "undefined") {
    const fallback = new THREE.Texture();
    fallback.name = url;
    return fallback;
  }
  if (!sharedThreeTextureLoader) {
    sharedThreeTextureLoader = new THREE.TextureLoader();
  }
  try {
    return sharedThreeTextureLoader.load(url);
  } catch {
    const fallback = new THREE.Texture();
    fallback.name = url;
    return fallback;
  }
}

let activeTextureFactory: StudioBg3dTextureFactory = defaultTextureFactory;

export function setStudioBg3dCc0PbrTextureFactoryForTest(
  factory: StudioBg3dTextureFactory | null,
): void {
  activeTextureFactory = factory ?? defaultTextureFactory;
}

function loadCachedChannelTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  repeat: readonly [number, number],
): THREE.Texture {
  const cacheKey = `${url}|${colorSpace}|${repeat[0]}x${repeat[1]}`;
  const cached = textureByUrlCache.get(cacheKey);
  if (cached) return cached;

  const texture = activeTextureFactory(url);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  texture.userData = {
    ...texture.userData,
    studioBg3dCc0SourceUrl: url,
    studioBg3dCc0ColorSpace: colorSpace,
    studioBg3dCc0Repeat: [repeat[0], repeat[1]],
  };
  texture.needsUpdate = true;
  textureByUrlCache.set(cacheKey, texture);
  return texture;
}

/**
 * 카탈로그 ID에 해당하는 CC0 2K PBR 텍스처 세트를 로드(또는 캐시에서 반환)한다.
 */
export function loadStudioBg3dCc0PbrTextureSet(
  materialId: string,
): StudioBg3dCc0PbrTextureSet | null {
  const existing = textureSetByMaterialIdCache.get(materialId);
  if (existing) return existing;

  const entry = findStudioBg3dCc0SurfaceMaterial(materialId);
  if (!entry) return null;

  const repeat = entry.defaultRepeat;
  const pbr = entry.pbrMaps;
  const baseColorUrl = entry.baseColorUrl;

  const baseColorMap = loadCachedChannelTexture(baseColorUrl, THREE.SRGBColorSpace, repeat);
  const roughnessMap = pbr
    ? loadCachedChannelTexture(pbr.roughnessUrl, THREE.NoColorSpace, repeat)
    : null;
  const normalMap = pbr
    ? loadCachedChannelTexture(pbr.normalGlUrl, THREE.NoColorSpace, repeat)
    : null;
  const aoMap = pbr
    ? loadCachedChannelTexture(pbr.aoUrl, THREE.NoColorSpace, repeat)
    : null;
  const displacementMap = pbr
    ? loadCachedChannelTexture(pbr.displacementUrl, THREE.NoColorSpace, repeat)
    : null;

  const set: StudioBg3dCc0PbrTextureSet = Object.freeze({
    materialId: entry.id,
    entry,
    baseColorMap,
    roughnessMap,
    normalMap,
    aoMap,
    displacementMap,
  });
  textureSetByMaterialIdCache.set(entry.id, set);
  return set;
}

export type StudioBg3dPbrCapableMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalScale?: THREE.Vector2;
  aoMap?: THREE.Texture | null;
  aoMapIntensity?: number;
  roughness?: number;
  metalness?: number;
};

/**
 * Three.js 재질 인스턴스(`MeshStandardMaterial` 등)에 `StudioBg3dMaterialOverride.surfaceMaterialId`의
 * 2K PBR 다중 채널 텍스처(`map`, `roughnessMap`, `normalMap`, `aoMap`)를 바인딩한다.
 */
export function applyStudioBg3dCc0PbrMapsToStandardMaterial(
  material: THREE.Material,
  override: StudioBg3dMaterialOverride | null | undefined,
): StudioBg3dCc0PbrTextureSet | null {
  const entry = resolveStudioBg3dCc0SurfaceMaterialFromOverride(override);
  if (!entry) return null;
  const textureSet = loadStudioBg3dCc0PbrTextureSet(entry.id);
  if (!textureSet) return null;

  const pbrMat = material as StudioBg3dPbrCapableMaterial;
  if ("map" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
    pbrMat.map = textureSet.baseColorMap;
  }
  if ("roughnessMap" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
    pbrMat.roughnessMap = textureSet.roughnessMap;
  }
  if ("normalMap" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
    pbrMat.normalMap = textureSet.normalMap;
    if (pbrMat.normalScale instanceof THREE.Vector2 && textureSet.normalMap) {
      pbrMat.normalScale.set(0.85, 0.85);
    }
  }
  if ("aoMap" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
    pbrMat.aoMap = textureSet.aoMap;
    if (typeof pbrMat.aoMapIntensity === "number" && textureSet.aoMap) {
      pbrMat.aoMapIntensity = 0.65;
    }
  }
  material.needsUpdate = true;
  return textureSet;
}

/**
 * R3F `<meshStandardMaterial>`용 CC0 2K PBR 맵 스프레드를 계산한다.
 * 표면 페인트 텍스처(`paintTexture`)가 있으면 `map`은 페인트 텍스처를 우선하고,
 * `roughnessMap`/`normalMap`/`aoMap`은 CC0 PBR 재질의 물리 요철을 그대로 유지한다.
 */
export function resolveStudioBg3dPrimitiveCc0PbrSpread(
  override: StudioBg3dMaterialOverride | null | undefined,
  paintTexture: THREE.Texture | null = null,
): StudioBg3dCc0PbrMaterialSpread {
  const entry = resolveStudioBg3dCc0SurfaceMaterialFromOverride(override);
  const textureSet = entry ? loadStudioBg3dCc0PbrTextureSet(entry.id) : null;
  return {
    map: paintTexture ?? textureSet?.baseColorMap ?? null,
    roughnessMap: textureSet?.roughnessMap ?? null,
    normalMap: textureSet?.normalMap ?? null,
    aoMap: textureSet?.aoMap ?? null,
  };
}

export function getStudioBg3dCc0PbrTextureCacheStats(): {
  readonly cachedTextureCount: number;
  readonly cachedMaterialSetCount: number;
} {
  return {
    cachedTextureCount: textureByUrlCache.size,
    cachedMaterialSetCount: textureSetByMaterialIdCache.size,
  };
}

export function clearStudioBg3dCc0PbrTextureCache(): void {
  for (const texture of textureByUrlCache.values()) {
    try {
      texture.dispose();
    } catch {
      /* 정리 중 개별 오류는 무시한다. */
    }
  }
  textureByUrlCache.clear();
  textureSetByMaterialIdCache.clear();
}
