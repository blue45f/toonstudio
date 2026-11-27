/**
 * Wasm64 Wave 63 공개 배럴 진입점 (`wasm64-wave63-multivendor-gpu-npu-hal`).
 *
 * - `multivendor-upscaler-npu-hal`: 전 제조사 GPU 업스케일러(FSR 1~4 · DLSS 3.5~4 · XeSS 1~2 ·
 *   Arm ASR/NSS · Qualcomm GSR 2 · Apple MetalFX) + 저지연 스택(Reflex 2 · Anti-Lag 2 · XeLL) +
 *   이종 NPU/AI/GPU/CPU 통합 가속 HAL 및 단일 프레임 병렬 DAG 스케줄러
 * - `webgpu-fsr-easu-rcas-splitres`: WebGPU WGSL 컴퓨트 셰이더(`FSR_EASU_WGSL`, `FSR_RCAS_WGSL`,
 *   `SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL`) 및 이중 해상도 페인트/3D + 100% 네이티브 2D 선화
 *   무손실 합성 CPU 레퍼런스 커널
 * - `foveated-vrs-radiance-cascades`: 펜촉 중심 가변 레이트 셰이딩(Cursor-Foveated VRS)
 *   타일 스케줄러 및 2.5D Radiance Cascades 실시간 간접광·컬러 블리딩 솔버 + WGSL 셰이더
 */

export {
  LOW_LATENCY_STACK_CATALOG,
  NPU_ACCELERATOR_CATALOG,
  UPSCALER_CAPABILITY_CATALOG,
  detectHardwareAccelerationProfile,
  planHeterogeneousMultiAcceleratorFrame,
  selectOptimalUpscalerAndLatencyStack,
  type AcceleratorBackendId,
  type AcceleratorBackendSpec,
  type HardwareAccelerationProfile,
  type HardwareAdapterProbeInput,
  type HardwareVendorId,
  type HeterogeneousExecutionLane,
  type HeterogeneousFramePlan,
  type HeterogeneousFrameTaskNode,
  type HeterogeneousFrameWorkloadInput,
  type LowLatencyStackId,
  type LowLatencyStackSpec,
  type RejectedUpscalerCandidate,
  type RuntimeHostEnvironment,
  type UpscalerAndLatencySelection,
  type UpscalerCapabilitySpec,
  type UpscalerQualityPreset,
  type UpscalerSelectionPreferences,
  type UpscalerTechnologyId,
} from "./multivendor-upscaler-npu-hal";

export {
  FSR_EASU_WGSL,
  FSR_RCAS_WGSL,
  SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL,
  compositeSplitResWithNativeLineart,
  sharpenFsrRcasRgba,
  upscaleBilinearRgba,
  upscaleFsrEasuRgba,
  type FsrEasuOptions,
  type FsrEasuResult,
  type FsrRcasOptions,
  type FsrRcasResult,
  type RgbaImageBuffer,
  type SplitResCompositeInput,
  type SplitResCompositeResult,
} from "./webgpu-fsr-easu-rcas-splitres";

export {
  RADIANCE_CASCADES_25D_WGSL,
  buildCursorFoveatedVrsTileMap,
  solve25dRadianceCascadesLighting,
  type CursorFoveatedVrsInput,
  type CursorFoveatedVrsTileMap,
  type FoveatedVrsTileDescriptor,
  type RadianceCascadeLevelSummary,
  type RadianceCascades25dInput,
  type RadianceCascades25dResult,
  type VrsFocalAnchor,
  type VrsRateCode,
  type VrsShadingRateId,
} from "./foveated-vrs-radiance-cascades";
