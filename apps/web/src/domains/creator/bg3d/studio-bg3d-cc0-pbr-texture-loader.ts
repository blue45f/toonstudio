/**
 * Studio BG3D 표면 재질의 PBR 다중 채널 텍스처 로더 및 Three.js 바인더.
 *
 * 기존 CC0 82종과 구매 재질의 실제 채널을 GPU 텍스처 캐시로 관리한다.
 * 구매한 8K 원본의 금속성 맵과 2K 원본에 없는 채널을 구분하며, 프리미티브·커스텀
 * 모델의 재질 오버라이드와 GLB 내보내기가 같은 원본을 사용한다.
 */

import * as THREE from "three";

import {
  findStudioBg3dSurfaceMaterial,
  resolveStudioBg3dSurfaceMaterialFromOverride,
  type StudioBg3dSurfaceMaterialEntry,
} from "./studio-bg3d-surface-material-catalog";

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";

export interface StudioBg3dCc0PbrTextureSet {
  readonly materialId: string;
  readonly entry: StudioBg3dSurfaceMaterialEntry;
  readonly baseColorMap: THREE.Texture;
  readonly roughnessMap: THREE.Texture | null;
  readonly metalnessMap: THREE.Texture | null;
  readonly normalMap: THREE.Texture | null;
  readonly aoMap: THREE.Texture | null;
  readonly displacementMap: THREE.Texture | null;
}

export interface StudioBg3dCc0PbrMaterialSpread {
  readonly map: THREE.Texture | null;
  readonly roughnessMap: THREE.Texture | null;
  readonly metalnessMap: THREE.Texture | null;
  readonly normalMap: THREE.Texture | null;
  readonly aoMap: THREE.Texture | null;
  readonly normalScale?: THREE.Vector2;
  readonly color?: THREE.Color;
}

export type StudioBg3dTextureFactory = (
  url: string,
  onLoad?: (texture: THREE.Texture) => void,
) => THREE.Texture;

const textureByUrlCache = new Map<string, THREE.Texture>();
const textureSetByMaterialIdCache = new Map<string, StudioBg3dCc0PbrTextureSet>();
const textureReadyListeners = new Set<() => void>();
let textureCacheGeneration = 0;
let textureReadyRevision = 0;

/** 구독 전에 완료된 이미지도 같은 snapshot으로 관측한다. 캐시 정리 시 역행하지 않는다. */
export function getStudioBg3dCc0PbrTextureReadyRevision(): number {
  return textureReadyRevision;
}

export function subscribeStudioBg3dCc0PbrTextureReady(listener: () => void): () => void {
  textureReadyListeners.add(listener);
  return () => { textureReadyListeners.delete(listener); };
}

let sharedThreeTextureLoader: THREE.TextureLoader | null = null;

function defaultTextureFactory(url: string, onLoad?: (texture: THREE.Texture) => void): THREE.Texture {
  if (typeof Image === "undefined") {
    const fallback = new THREE.Texture();
    fallback.name = url;
    return fallback;
  }
  if (!sharedThreeTextureLoader) {
    sharedThreeTextureLoader = new THREE.TextureLoader();
  }
  try {
    return sharedThreeTextureLoader.load(url, onLoad);
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
  provider: StudioBg3dSurfaceMaterialEntry["provider"],
): THREE.Texture {
  const originalCacheKey = `${url}|${colorSpace}|${repeat[0]}x${repeat[1]}`;
  const cacheKey = provider === "EmacEArt" ? `${originalCacheKey}|purchased` : originalCacheKey;
  const cached = textureByUrlCache.get(cacheKey);
  if (cached) return cached;

  const generation = textureCacheGeneration;
  let disposed = false;
  let completionQueued = false;
  const onDispose = () => { disposed = true; };
  const texture = activeTextureFactory(url, (loadedTexture) => {
    if (completionQueued) return;
    completionQueued = true;
    // 동기 factory도 캐시와 채널 설정이 끝난 뒤 알린다. 렌더 중 외부 store 갱신도 피한다.
    queueMicrotask(() => {
      if (disposed || generation !== textureCacheGeneration || textureByUrlCache.get(cacheKey) !== loadedTexture) return;
      loadedTexture.removeEventListener("dispose", onDispose);
      textureReadyRevision += 1;
      for (const listener of [...textureReadyListeners]) listener();
    });
  });
  texture.addEventListener("dispose", onDispose);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  texture.userData = {
    ...texture.userData,
    ...(provider === "EmacEArt" ? {
      studioBg3dSurfaceSourceUrl: url,
      studioBg3dSurfaceColorSpace: colorSpace,
      studioBg3dSurfaceRepeat: [repeat[0], repeat[1]],
      studioBg3dSurfaceProvider: provider,
    } : {
      studioBg3dCc0SourceUrl: url,
      studioBg3dCc0ColorSpace: colorSpace,
      studioBg3dCc0Repeat: [repeat[0], repeat[1]],
    }),
  };
  texture.needsUpdate = true;
  textureByUrlCache.set(cacheKey, texture);
  return texture;
}

/**
 * 카탈로그 ID의 원본 해상도·채널을 유지하며 PBR 텍스처 세트를 로드한다.
 * 기존 CC0 호출부와 캐시 소유권을 유지하기 위해 공개 함수 이름은 보존한다.
 */
export function loadStudioBg3dCc0PbrTextureSet(
  materialId: string,
): StudioBg3dCc0PbrTextureSet | null {
  const existing = textureSetByMaterialIdCache.get(materialId);
  if (existing) return existing;

  const entry = findStudioBg3dSurfaceMaterial(materialId);
  if (!entry) return null;

  const repeat = entry.defaultRepeat;
  const pbr = entry.pbrMaps;
  const baseColorUrl = entry.baseColorUrl;

  const baseColorMap = loadCachedChannelTexture(baseColorUrl, THREE.SRGBColorSpace, repeat, entry.provider);
  const roughnessMap = pbr
    ? loadCachedChannelTexture(pbr.roughnessUrl, THREE.NoColorSpace, repeat, entry.provider)
    : null;
  const metalnessMap = pbr?.metalnessUrl
    ? loadCachedChannelTexture(pbr.metalnessUrl, THREE.NoColorSpace, repeat, entry.provider)
    : null;
  const normalMap = pbr
    ? loadCachedChannelTexture(pbr.normalGlUrl, THREE.NoColorSpace, repeat, entry.provider)
    : null;
  const aoMap = pbr?.aoUrl
    ? loadCachedChannelTexture(pbr.aoUrl, THREE.NoColorSpace, repeat, entry.provider)
    : null;
  const displacementMap = pbr?.displacementUrl
    ? loadCachedChannelTexture(pbr.displacementUrl, THREE.NoColorSpace, repeat, entry.provider)
    : null;

  const set: StudioBg3dCc0PbrTextureSet = Object.freeze({
    materialId: entry.id,
    entry,
    baseColorMap,
    roughnessMap,
    metalnessMap,
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
  metalnessMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalMapType?: THREE.NormalMapTypes;
  normalScale?: THREE.Vector2;
  aoMap?: THREE.Texture | null;
  aoMapIntensity?: number;
  roughness?: number;
  metalness?: number;
};

/**
 * Three.js 재질 인스턴스(`MeshStandardMaterial` 등)에 `StudioBg3dMaterialOverride.surfaceMaterialId`의
 * 실제 PBR 채널을 바인딩한다. 구매 원본의 금속성 맵과 노멀 강도는 원본대로 적용한다.
 */
export function applyStudioBg3dCc0PbrMapsToStandardMaterial(
  material: THREE.Material,
  override: StudioBg3dMaterialOverride | null | undefined,
): StudioBg3dCc0PbrTextureSet | null {
  const entry = resolveStudioBg3dSurfaceMaterialFromOverride(override);
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
  if (entry.provider === "EmacEArt") {
    if ("metalnessMap" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
      pbrMat.metalnessMap = textureSet.metalnessMap;
    }
    const metalness = override?.metalness, roughness = override?.roughness;
    if (typeof pbrMat.metalness === "number" && typeof metalness === "number") pbrMat.metalness = metalness;
    if (typeof pbrMat.roughness === "number" && typeof roughness === "number") pbrMat.roughness = roughness;
    if ("normalMapType" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
      pbrMat.normalMapType = THREE.TangentSpaceNormalMap;
    }
  }
  if ("normalMap" in pbrMat || material instanceof THREE.MeshStandardMaterial) {
    pbrMat.normalMap = textureSet.normalMap;
    if (pbrMat.normalScale instanceof THREE.Vector2 && textureSet.normalMap) {
      const strength = entry.normalStrength ?? 0.85;
      pbrMat.normalScale.set(strength, strength);
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
 * R3F `<meshStandardMaterial>`과 GLB 내보내기가 공유하는 PBR 속성을 계산한다.
 * 표면 페인트 텍스처(`paintTexture`)가 있으면 `map`은 페인트 텍스처를 우선하고,
 * 나머지 채널은 선택한 원본 재질의 물리 요철을 그대로 유지한다.
 */
export function resolveStudioBg3dPrimitiveCc0PbrSpread(
  override: StudioBg3dMaterialOverride | null | undefined,
  paintTexture: THREE.Texture | null = null,
  baseColor: THREE.ColorRepresentation = "#ffffff",
): StudioBg3dCc0PbrMaterialSpread {
  const entry = resolveStudioBg3dSurfaceMaterialFromOverride(override);
  const textureSet = entry ? loadStudioBg3dCc0PbrTextureSet(entry.id) : null;
  const originalColor = entry?.provider === "EmacEArt"
    ? resolvePurchasedSurfaceColor(override, paintTexture, baseColor)
    : undefined;
  return {
    map: paintTexture ?? textureSet?.baseColorMap ?? null,
    roughnessMap: textureSet?.roughnessMap ?? null,
    metalnessMap: textureSet?.metalnessMap ?? null,
    normalMap: textureSet?.normalMap ?? null,
    aoMap: textureSet?.aoMap ?? null,
    ...(textureSet?.normalMap && entry?.normalStrength !== undefined
      ? { normalScale: new THREE.Vector2(entry.normalStrength, entry.normalStrength) } : {}),
    ...(originalColor ? { color: originalColor } : {}),
  };
}

/** 구매 원본 컬러 맵에 기존 도형 색이 의도치 않게 곱해지지 않도록 저장된 색 오버라이드를 적용한다. */
function resolvePurchasedSurfaceColor(
  override: StudioBg3dMaterialOverride | null | undefined,
  paintTexture: THREE.Texture | null,
  baseColor: THREE.ColorRepresentation,
): THREE.Color {
  if (paintTexture) return new THREE.Color("#ffffff");
  const original = new THREE.Color(baseColor);
  if (!override || override.colorMode === "original") return original;
  const selected = new THREE.Color(override.color);
  const target = override.colorMode === "multiply" ? original.clone().multiply(selected) : selected;
  return original.lerp(target, override.colorStrength);
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
  textureCacheGeneration += 1;
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
