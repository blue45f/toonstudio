import source from "./studio-bg3d-plasticine-materials.generated.json";

import type { StudioBg3dSurfaceMaterialEntry } from "./studio-bg3d-surface-material-catalog";

export interface StudioBg3dPurchasedSurfaceMaterialVariant extends StudioBg3dSurfaceMaterialEntry {
  readonly provider: "EmacEArt";
  readonly resolution: 8192 | 2048;
  readonly sourceVariant: "native-8k" | "godot-2k";
  readonly normalStrength: 1;
}

export interface StudioBg3dPurchasedSurfaceMaterial {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly previewUrl: string;
  readonly defaultVariantId: string;
  readonly variants: readonly StudioBg3dPurchasedSurfaceMaterialVariant[];
}

function resolution(value: number): 8192 | 2048 {
  if (value === 8192 || value === 2048) return value;
  throw new Error("구매 재질의 원본 해상도가 등록된 8K·2K와 다릅니다.");
}

function sourceVariant(value: string): "native-8k" | "godot-2k" {
  if (value === "native-8k" || value === "godot-2k") return value;
  throw new Error("구매 재질의 원본 변형을 확인하세요.");
}

/** 프리뷰는 확보된 2K 원본이며, 선택한 실제 표면에는 해당 8K·2K 원본 채널을 사용한다. */
export const STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS: readonly StudioBg3dPurchasedSurfaceMaterial[] =
  Object.freeze(source.materials.map((material): StudioBg3dPurchasedSurfaceMaterial => Object.freeze({
    id: material.id,
    labelKo: material.labelKo,
    labelEn: material.labelEn,
    previewUrl: material.previewUrl,
    defaultVariantId: material.defaultVariantId,
    variants: Object.freeze(material.variants.map((variant): StudioBg3dPurchasedSurfaceMaterialVariant => Object.freeze({
      id: variant.id,
      labelKo: material.labelKo,
      labelEn: material.labelEn,
      category: "clay",
      provider: "EmacEArt",
      baseColorUrl: variant.maps.baseColor.url,
      previewUrl: material.previewUrl,
      pbrMaps: Object.freeze({
        roughnessUrl: variant.maps.roughness.url,
        normalGlUrl: variant.maps.normal.url,
        ...(variant.maps.metalness ? { metalnessUrl: variant.maps.metalness.url } : {}),
      }),
      roughness: 1,
      metalness: variant.maps.metalness ? 1 : 0,
      tintHex: "#ffffff",
      surfacePresetId: "matte-plastic",
      defaultRepeat: [1, 1] as const,
      normalStrength: 1,
      resolution: resolution(variant.resolution),
      sourceVariant: sourceVariant(variant.sourceVariant),
    }))),
  })));

const VARIANTS_BY_ID = new Map(STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.flatMap((material) =>
  material.variants.map((variant) => [variant.id, variant] as const)));

export function findStudioBg3dPurchasedSurfaceMaterial(
  id: string,
): StudioBg3dPurchasedSurfaceMaterialVariant | undefined {
  return VARIANTS_BY_ID.get(id);
}
