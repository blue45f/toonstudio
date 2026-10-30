/** 원본 geometry·UV에 접근하지 않고 불투명 MToon 본체와 inverted-hull outline의 수명을 소유한다. */
import { MToonMaterialOutlineWidthMode, type MToonMaterial } from "@pixiv/three-vrm";
import { BackSide, Color, DoubleSide, LinearSRGBColorSpace } from "three";
import { StudioMToonMaterial } from "../../mesh-materials/studio-mtoon-webgl-runtime";

import { createStudioHybridDccToonGltfMaterial, type StudioHybridDccLinearColor } from "./studio-hybrid-dcc-toon-gltf";
import { normalizeStudioHybridDccToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

export { patchStudioMToonEqualBoundary as patchStudioHybridDccMToonEqualBoundary,
  patchStudioMToonProjectionWidth as patchStudioHybridDccMToonProjectionWidth } from "../../mesh-materials/studio-mtoon-webgl-runtime";

function color([r, g, b]: StudioHybridDccLinearColor): Color {
  return new Color().setRGB(r, g, b, LinearSRGBColorSpace);
}

export interface StudioHybridDccToonMaterialRuntime {
  readonly body: MToonMaterial;
  readonly outline: MToonMaterial | null;
  dispose(): void;
}

export function createStudioHybridDccToonMaterialRuntime(input: StudioHybridDccToonMaterial): StudioHybridDccToonMaterialRuntime {
  const dto = normalizeStudioHybridDccToonMaterial(input); const gltf = createStudioHybridDccToonGltfMaterial(dto);
  const extension = gltf.extensions.VRMC_materials_mtoon; const base = gltf.pbrMetallicRoughness.baseColorFactor;
  const body = new StudioMToonMaterial({
    name: "ToonStudio 툰 본체", color: color([base[0], base[1], base[2]]), shadeColorFactor: color(extension.shadeColorFactor),
    shadingShiftFactor: dto.shadingShift, shadingToonyFactor: dto.shadingToony, giEqualizationFactor: extension.giEqualizationFactor,
    outlineWidthMode: extension.outlineWidthMode, outlineWidthFactor: extension.outlineWidthFactor,
    outlineColorFactor: color(extension.outlineColorFactor), outlineLightingMixFactor: 0,
    side: DoubleSide, isOutline: false, transparent: false, opacity: 1, alphaTest: 0, depthTest: true, depthWrite: true,
  });
  let outline: MToonMaterial | null = null;
  try {
    if (extension.outlineWidthMode !== MToonMaterialOutlineWidthMode.None) {
      outline = body.clone(); outline.name = "ToonStudio 툰 외곽선"; outline.side = BackSide; outline.isOutline = true;
    }
  } catch (error) { outline?.dispose(); body.dispose(); throw error; }
  let disposed = false;
  return { body, outline, dispose() {
    if (disposed) return;
    disposed = true; outline?.dispose(); body.dispose();
  } };
}
