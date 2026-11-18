import type { Color, Texture } from "three";

interface EmissiveMaterial {
  emissive?: Color;
  emissiveIntensity?: number;
  emissiveMap?: Texture | null;
}

interface Emission {
  emissiveColor?: Color;
  emissiveIntensity?: number;
}

const activePaint = new WeakMap<EmissiveMaterial, Emission & { map: Texture }>();

export function markStudioVrmEmissivePaint(material: EmissiveMaterial, map: Texture, original: Emission): void {
  activePaint.set(material, { ...original, map });
}

export function clearStudioVrmEmissivePaint(material: EmissiveMaterial): void {
  activePaint.delete(material);
}

/** 발광 PNG에 원래 발광색을 두 번 곱하지 않도록 재질의 배율을 따로 보관한다. */
export function studioVrmEmissivePaintOriginal(material: EmissiveMaterial): Emission | undefined {
  const paint = activePaint.get(material);
  return paint && material.emissiveMap === paint.map ? paint : undefined;
}

export function applyStudioVrmEmissiveFx(material: EmissiveMaterial,
  fx: { emissiveColor: string | null; emissiveIntensity: number }, original: Emission): void {
  if (fx.emissiveColor) {
    material.emissive?.set(fx.emissiveColor);
    material.emissiveIntensity = fx.emissiveIntensity;
  } else if (studioVrmEmissivePaintOriginal(material)) {
    material.emissive?.setRGB(1, 1, 1);
    material.emissiveIntensity = original.emissiveIntensity || 1;
  } else {
    if (original.emissiveColor) material.emissive?.copy(original.emissiveColor);
    if (original.emissiveIntensity !== undefined) material.emissiveIntensity = original.emissiveIntensity;
  }
}
