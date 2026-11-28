/**
 * Wasm64 Wave 68 공개 배럴 진입점 (`wasm64-wave68-shallow-water-fluid-paint`).
 *
 * - `shallow-water-fluid-solver`: 2D 얕은 물방정식(압력·중력 기울기·모세관 흡수·증발 건조 전선·점도 통합)
 *   수채화·유화 유체 시뮬레이터 커널
 * - `pigment-advection-compositor`: Semi-Lagrangian 4채널 안료 이류, 특이점 없는 Kubelka-Munk 감산 혼색,
 *   측면 광원 젖은 광택(Wet Specular Sheen) RGBA 컴포지터 및 질량 보존·백런 계측기
 * - `webgpu-fluid-pingpong-wgsl`: WebGPU `@compute` 핑퐁 WGSL 셰이더 3종, 16바이트 정렬 유니폼 패커,
 *   디스패치 계획기 및 바인딩 계약 검증기
 */

export {
  FLUID_DEFAULT_MAX_CFL,
  FLUID_PIGMENT_CHANNELS,
  FLUID_WET_EPSILON,
  PAINT_MEDIUM_PRESETS,
  createShallowWaterPaintField,
  depositFluidPaintDrop,
  generateDeterministicPaperGrain,
  resolveShallowWaterFluidConfig,
  stepShallowWaterFluidSimulation,
  type CreateShallowWaterFieldOptions,
  type FluidPaintDropInput,
  type FluidPaintDropResult,
  type PaintMediumPreset,
  type PaintMediumPresetId,
  type ResolvedShallowWaterFluidConfig,
  type ShallowWaterFluidConfig,
  type ShallowWaterPaintField,
  type ShallowWaterStepSummary,
} from "./shallow-water-fluid-solver";

export {
  DEFAULT_PAPER_REFLECTANCE,
  DEFAULT_PIGMENT_OPTICS,
  advectPigmentSemiLagrangian,
  compositeShallowWaterFieldToRgba,
  evaluateKubelkaMunkChannelReflectance,
  evaluateKubelkaMunkPigmentRgb,
  measureCoffeeRingBackrunMetrics,
  measureFluidPigmentCenterOfMass,
  measureFluidPigmentMassConservation,
  type CoffeeRingBackrunReport,
  type FluidPigmentCenterOfMassReport,
  type FluidPigmentMassConservationReport,
  type LinearRgbTuple,
  type PigmentOpticalPalette,
  type PigmentOpticalProfile,
  type SemiLagrangianAdvectionOptions,
  type SemiLagrangianAdvectionResult,
  type WetMediaCompositeOptions,
  type WetMediaCompositeResult,
} from "./pigment-advection-compositor";

export {
  FLUID_SIM_UNIFORM_BYTE_LENGTH,
  FLUID_WGSL_WORKGROUP_SIZE,
  PIGMENT_ADVECTION_DRYING_WGSL,
  SHALLOW_WATER_VELOCITY_WGSL,
  WET_COMPOSITE_UNIFORM_BYTE_LENGTH,
  WET_MEDIA_COMPOSITE_WGSL,
  buildFluidPingPongDispatchPlan,
  packFluidSimUniforms,
  packWetCompositeUniforms,
  validateFluidWgslContracts,
  type FluidPingPongDispatchPlan,
  type FluidPingPongPassSpec,
  type FluidSimUniformPackInput,
  type FluidWgslContractValidationReport,
  type FluidWgslShaderBundle,
  type SingleFluidWgslValidation,
  type WetCompositeUniformPackInput,
  type WgslBindingContract,
} from "./webgpu-fluid-pingpong-wgsl";
