/**
 * Wasm64 Wave 74 공개 배럴 진입점 (`wasm64-wave74-25d-relighting-optical-refraction`).
 *
 * - `relighting-25d-lightfield-engine`: 2D 웹툰 컷 2.5D 법선·깊이·재질 힌트 복원,
 *   6종 시간대·날씨 프리셋 및 0~24시 연속 보간, 2D 스크린 공간 레이마칭 소프트 그림자·OKLCH 보존 리라이팅
 * - `optical-refraction-reflection-brush`: 물방울 유리(IOR 1.333)·서리 수정(IOR 1.52)·
 *   이방성 검신 메탈·젖은 웅덩이 수면 거울 4종 물리 기반 광학 브러시
 * - `relighting-optical-wgsl-shaders`: WebGPU 컴퓨트 WGSL 3종, 16-byte 정렬 유니폼 패커, 정적 계약 검증기
 */

export {
  RELIGHTING_ATMOSPHERE_PRESETS,
  clamp01,
  clampRange,
  directionFromAngles,
  interpolateAtmosphereByHour,
  lerp,
  linearRgbToOklch,
  linearToSrgbChannel,
  linearToSrgbRgb,
  marchScreenSpaceSoftShadow,
  normalizeVec3,
  oklchToLinearRgb,
  reconstructCut25dGeometryMaps,
  relight25dWebtoonCut,
  smoothstep,
  srgbToLinearChannel,
  srgbToLinearRgb,
  type Cut25dGeometryMaps,
  type OklchGradeConfig,
  type OklchTuple,
  type ReconstructCut25dOptions,
  type Relight25dCutOptions,
  type Relight25dCutResult,
  type RelightingAtmospherePreset,
  type RelightingAtmospherePresetId,
  type RelightingKeyLightConfig,
  type RelightingRimLightConfig,
  type RgbTuple,
  type Vec3Tuple,
} from "./relighting-25d-lightfield-engine";

export {
  OPTICAL_BRUSH_MATERIALS,
  applyOpticalRefractionReflectionBrush,
  computeChromaticDispersionOffsets,
  computeSchlickFresnel,
  computeSchlickFresnelRgb,
  computeSnellRefractedOffset,
  evaluateAnisotropicWardGgx,
  sampleBilinearLinearRgba,
  type ChromaticDispersionResult,
  type OpticalBrushDirtyBounds,
  type OpticalBrushMaterialId,
  type OpticalBrushResult,
  type OpticalBrushStrokeOptions,
  type OpticalEnvironmentPalette,
  type OpticalMaterialPreset,
  type OpticalStrokePoint,
  type SnellRefractionResult,
} from "./optical-refraction-reflection-brush";

export {
  ANISOTROPIC_METAL_REFLECTION_WGSL,
  CUT_25D_RELIGHTING_RAYMARCH_WGSL,
  OPTICAL_REFRACTION_DISPERSION_WGSL,
  WAVE74_WGSL_SHADER_CONTRACTS,
  packAnisotropicMetalUniforms,
  packOpticalRefractionUniforms,
  packRelighting25dUniforms,
  validateRelightingOpticalWgslContracts,
  validateSingleRelightingWgslContract,
  type AnisotropicMetalUniformInput,
  type OpticalRefractionUniformInput,
  type Relighting25dUniformInput,
  type RelightingWgslBindingDescriptor,
  type RelightingWgslShaderContract,
  type RelightingWgslSingleValidation,
  type RelightingWgslSuiteValidation,
} from "./relighting-optical-wgsl-shaders";
