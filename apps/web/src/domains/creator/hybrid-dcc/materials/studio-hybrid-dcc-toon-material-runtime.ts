/** 원본 geometry·UV에 접근하지 않고 불투명 MToon 본체와 inverted-hull outline의 수명을 소유한다. */
import { MToonMaterial, MToonMaterialOutlineWidthMode } from "@pixiv/three-vrm";
import { BackSide, Color, DoubleSide, LinearSRGBColorSpace } from "three";

import { createStudioHybridDccToonGltfMaterial, type StudioHybridDccLinearColor } from "./studio-hybrid-dcc-toon-gltf";
import { normalizeStudioHybridDccToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

const LINEARSTEP_SOURCE = "float linearstep( float a, float b, float t ) {\n  return clamp( ( t - a ) / ( b - a ), 0.0, 1.0 );\n}";
const LINEARSTEP_GUARDED = "float linearstep( float a, float b, float t ) {\n  if ( a == b ) { return step( a, t ); }\n  return clamp( ( t - a ) / ( b - a ), 0.0, 1.0 );\n}";
const SCREEN_WIDTH_SOURCE = "      outlineOffset *= vViewPosition.z / projectionMatrix[ 1 ].y;";
const SCREEN_WIDTH_GUARDED = "      outlineOffset *= ( projectionMatrix[ 3 ][ 3 ] == 0.0 ? vViewPosition.z : 1.0 ) / projectionMatrix[ 1 ].y;";
const SHADER_PATCH_REVISION = "toonstudio-mtoon-equal-boundary/1;orthographic-width/1";

/** SDK의 정확한 함수 하나만 보정한다. 이미 패치되었거나 SDK 원문이 달라졌으면 조용히 다른 shader를 쓰지 않는다. */
export function patchStudioHybridDccMToonEqualBoundary(fragmentShader: string): string {
  if (fragmentShader.includes(LINEARSTEP_GUARDED) || fragmentShader.split(LINEARSTEP_SOURCE).length !== 2) {
    throw new Error("MToon 경계 함수 원문이 일치하지 않거나 중복되어 shader를 안전하게 구성할 수 없습니다.");
  }
  return fragmentShader.replace(LINEARSTEP_SOURCE, LINEARSTEP_GUARDED);
}

/** 원근의 양수 view depth 보정은 유지하고, 직교에서는 clip w=1에 맞춰 깊이 항을 제외한다. */
export function patchStudioHybridDccMToonProjectionWidth(vertexShader: string): string {
  if (vertexShader.includes(SCREEN_WIDTH_GUARDED) || vertexShader.split(SCREEN_WIDTH_SOURCE).length !== 2) {
    throw new Error("MToon 화면폭 문장 원문이 일치하지 않거나 중복되어 shader를 안전하게 구성할 수 없습니다.");
  }
  return vertexShader.replace(SCREEN_WIDTH_SOURCE, SCREEN_WIDTH_GUARDED);
}

function guardEqualBoundary(material: MToonMaterial): void {
  // toony=1이면 linearstep(-1+toony,1-toony,t)의 양 끝이 0으로 같아진다. 저장된 toony는 그대로 둔다.
  patchStudioHybridDccMToonEqualBoundary(material.fragmentShader);
  patchStudioHybridDccMToonProjectionWidth(material.vertexShader);
  const compile = material.onBeforeCompile; const cacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = patchStudioHybridDccMToonEqualBoundary(shader.fragmentShader);
    shader.vertexShader = patchStudioHybridDccMToonProjectionWidth(shader.vertexShader);
  };
  material.customProgramCacheKey = () => `${SHADER_PATCH_REVISION}:${cacheKey.call(material)}`;
}

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
  const body = new MToonMaterial({
    name: "ToonStudio 툰 본체", color: color([base[0], base[1], base[2]]), shadeColorFactor: color(extension.shadeColorFactor),
    shadingShiftFactor: dto.shadingShift, shadingToonyFactor: dto.shadingToony, giEqualizationFactor: extension.giEqualizationFactor,
    outlineWidthMode: extension.outlineWidthMode, outlineWidthFactor: extension.outlineWidthFactor,
    outlineColorFactor: color(extension.outlineColorFactor), outlineLightingMixFactor: 0,
    side: DoubleSide, isOutline: false, transparent: false, opacity: 1, alphaTest: 0, depthTest: true, depthWrite: true,
  });
  let outline: MToonMaterial | null = null;
  try {
    guardEqualBoundary(body);
    if (extension.outlineWidthMode !== MToonMaterialOutlineWidthMode.None) {
      outline = body.clone(); outline.name = "ToonStudio 툰 외곽선"; outline.side = BackSide; outline.isOutline = true;
      guardEqualBoundary(outline);
    }
  } catch (error) { outline?.dispose(); body.dispose(); throw error; }
  let disposed = false;
  return { body, outline, dispose() {
    if (disposed) return;
    disposed = true; outline?.dispose(); body.dispose();
  } };
}
