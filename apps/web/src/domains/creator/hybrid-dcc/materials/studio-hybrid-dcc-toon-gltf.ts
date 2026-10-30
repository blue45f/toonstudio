/** 툰 authoring 값을 GPU·glTF가 공유하는 linear sRGB 값으로 명시적으로 옮긴다. */
import { hashStudioHybridDccToonMaterial, normalizeStudioHybridDccToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

export const STUDIO_HYBRID_DCC_MTOON_EXTENSION = "VRMC_materials_mtoon" as const;
export type StudioHybridDccLinearColor = readonly [number, number, number];

export interface StudioHybridDccToonGltfMaterial {
  readonly extras: { readonly toonSpectrum: { readonly toonMaterial: StudioHybridDccToonMaterial; readonly toonMaterialHash: string } };
  readonly alphaMode: "OPAQUE";
  readonly doubleSided: true;
  readonly pbrMetallicRoughness: {
    readonly baseColorFactor: readonly [number, number, number, 1];
    readonly metallicFactor: 0;
    readonly roughnessFactor: 1;
  };
  readonly extensions: {
    readonly VRMC_materials_mtoon: {
      readonly specVersion: "1.0";
      readonly shadeColorFactor: StudioHybridDccLinearColor;
      readonly shadingShiftFactor: number;
      readonly shadingToonyFactor: number;
      readonly giEqualizationFactor: 0.9;
      readonly outlineWidthMode: "none" | "worldCoordinates" | "screenCoordinates";
      readonly outlineWidthFactor: number;
      readonly outlineColorFactor: StudioHybridDccLinearColor;
      readonly outlineLightingMixFactor: 0;
    };
  };
}

/** CSS hex를 parse하는 renderer 전역 설정과 무관하게 glTF의 linear sRGB로 직렬화한다. */
export function studioHybridDccToonHexToLinear(color: string): StudioHybridDccLinearColor {
  if (!/^#[\da-f]{6}$/iu.test(color)) throw new Error("툰 재질 색은 #RRGGBB 형식이어야 합니다.");
  const linear = (offset: number) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return [linear(1), linear(3), linear(5)];
}

/** 일반 glTF viewer에는 PBR fallback을 제공하고 MToon 지원 viewer에는 전체 툰 매개변수를 제공한다. */
export function createStudioHybridDccToonGltfMaterial(input: StudioHybridDccToonMaterial): StudioHybridDccToonGltfMaterial {
  const material = normalizeStudioHybridDccToonMaterial(input);
  const [r, g, b] = studioHybridDccToonHexToLinear(material.baseColorSrgb);
  const outlineEnabled = material.outline.enabled && material.outline.width > 0;
  return {
    extras: { toonSpectrum: { toonMaterial: material, toonMaterialHash: hashStudioHybridDccToonMaterial(material) } },
    alphaMode: "OPAQUE", doubleSided: true,
    pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: 0, roughnessFactor: 1 },
    extensions: { VRMC_materials_mtoon: {
      specVersion: "1.0", shadeColorFactor: studioHybridDccToonHexToLinear(material.shadeColorSrgb),
      shadingShiftFactor: material.shadingShift, shadingToonyFactor: material.shadingToony, giEqualizationFactor: 0.9,
      outlineWidthMode: outlineEnabled ? material.outline.mode : "none", outlineWidthFactor: outlineEnabled ? material.outline.width : 0,
      outlineColorFactor: studioHybridDccToonHexToLinear(material.outline.colorSrgb), outlineLightingMixFactor: 0,
    } },
  };
}

/** 호출자가 정한 materialSlot 순서를 유지한다. fallback이 있으므로 extensionsRequired는 추가하지 않는다. */
export function createStudioHybridDccToonGltfMaterials(inputs: readonly StudioHybridDccToonMaterial[]): {
  readonly materials: readonly StudioHybridDccToonGltfMaterial[];
  readonly extensionsUsed: readonly (typeof STUDIO_HYBRID_DCC_MTOON_EXTENSION)[];
} {
  return { materials: inputs.map(createStudioHybridDccToonGltfMaterial), extensionsUsed: inputs.length ? [STUDIO_HYBRID_DCC_MTOON_EXTENSION] : [] };
}
