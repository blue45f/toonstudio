import { DEFAULT_RECIPE_COLORS } from "../contracts";

import { hexToLinear } from "./material-presets";

import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";

export interface PackageHairAlbedo {
  readonly material: PBRMaterial;
  readonly base: readonly [number, number, number];
}

/** 제작 텍스처·불투명도·명암의 원본을 유지하고 명시적인 머리색만 선형 RGB로 곱한다. */
export function applyPackageHairColor(materials: readonly PackageHairAlbedo[], color: string): void {
  const tint = color === DEFAULT_RECIPE_COLORS.hair ? [1, 1, 1] as const : hexToLinear(color);
  for (const { material, base } of materials) {
    material.albedoColor.set(base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]);
  }
}
