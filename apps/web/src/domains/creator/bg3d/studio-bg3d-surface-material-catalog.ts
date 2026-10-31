import {
  buildStudioBg3dCc0SurfaceMaterialOverride,
  findStudioBg3dCc0SurfaceMaterial,
  type StudioBg3dCc0SurfaceMaterialCategory,
} from "./studio-bg3d-cc0-surface-material-catalog";
import { findStudioBg3dPurchasedSurfaceMaterial } from "./studio-bg3d-purchased-surface-material-catalog";

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dSurfacePbrMapSet {
  readonly roughnessUrl: string;
  readonly normalGlUrl: string;
  readonly aoUrl?: string;
  readonly displacementUrl?: string;
  readonly metalnessUrl?: string;
}

/** 기존 CC0 재질과 구매 원본의 실제 채널을 함께 표현하는 제품 내부 계약. */
export interface StudioBg3dSurfaceMaterialEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: StudioBg3dCc0SurfaceMaterialCategory | "clay";
  readonly provider: "Poly Haven" | "ambientCG" | "EmacEArt";
  readonly baseColorUrl: string;
  readonly previewUrl: string;
  readonly pbrMaps: StudioBg3dSurfacePbrMapSet | null;
  readonly roughness: number;
  readonly metalness: number;
  readonly tintHex: string;
  readonly surfacePresetId: string;
  readonly defaultRepeat: readonly [number, number];
  readonly normalStrength?: number;
  readonly resolution?: 8192 | 2048;
}

export function findStudioBg3dSurfaceMaterial(id: string): StudioBg3dSurfaceMaterialEntry | undefined {
  return findStudioBg3dCc0SurfaceMaterial(id) ?? findStudioBg3dPurchasedSurfaceMaterial(id);
}

export function resolveStudioBg3dSurfaceMaterialFromOverride(
  override: StudioBg3dMaterialOverride | null | undefined,
): StudioBg3dSurfaceMaterialEntry | null {
  return override?.surfaceMaterialId ? findStudioBg3dSurfaceMaterial(override.surfaceMaterialId) ?? null : null;
}

export function buildStudioBg3dSurfaceMaterialOverride(id: string): StudioBg3dMaterialOverride | null {
  const originalCc0 = buildStudioBg3dCc0SurfaceMaterialOverride(id);
  if (originalCc0) return originalCc0;
  const entry = findStudioBg3dPurchasedSurfaceMaterial(id);
  if (!entry) return null;
  return Object.freeze({
    colorMode: "replace",
    color: "#ffffff",
    colorStrength: 1,
    opacityMultiplier: 1,
    roughness: entry.roughness,
    metalness: entry.metalness,
    emissiveColor: "#000000",
    emissiveIntensity: null,
    wireframe: false,
    doubleSided: false,
    surfaceMaterialId: entry.id,
  });
}
