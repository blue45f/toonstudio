/**
 * Wave 56D — 실리콘 맞춤형 WebNN NPU 그래프 컴파일러 · INT4/FP16 연산 융합 ·
 * 폐루프(Closed-Loop) 적응형 PID 열 제어 엔진.
 *
 * - 현재 구현(Current): 5종 가정 프로파일, 5종 가정 워크로드의 계획 산식
 *   (연산자 융합 · 실리콘 최적 양자화 · WebGPU↔WebNN MLTensor Zero-Copy 가정 · 펜 호버 투기적 워밍업),
 *   이산 시간 PID + Anti-Windup 60스텝 열 궤적 및 4단 그레이스풀 강등 시뮬레이터, JSON 내보내기.
 * - 정직성 원칙: 프로파일·성능·정확도·열 계수는 미보정 가정값이며,
 *   정규화된 상대 열 지수(0..100)와 열 여유도(thermalHeadroom01: 0..1) 기반 결정론적 해석 모델을 사용한다.
 */

import type {
  StudioHardwareAccelerationReport,
  StudioHardwareExecutionTier,
  StudioOnnxHardwareEpOption,
  StudioWasmSimdTier,
  StudioWebNnDeviceType,
} from "../toon-silicon-runtime/studio-hardware-accelerator-probe";
import { WEBNN_RUNTIME_EVIDENCE, serializeWebNnPlan } from "./webnn-planner-export";

export const WEBNN_NPU_THERMAL_SCHEMA_VERSION = "toonstudio.webnn-npu-thermal-plan.v1" as const;
export const WEBNN_NPU_THERMAL_MODEL_KIND = "silicon-graph-compiler-and-pid-thermal-model" as const;
export const WEBNN_NPU_THERMAL_MEASUREMENT_BASIS = "deterministic-analytical-model" as const;
export const DEFAULT_SILICON_NPU_ID: SiliconNpuTargetId = "apple-ane-coreml";
export const DEFAULT_WEBTOON_WORKLOAD_ID: WebtoonAiWorkloadId = "lineart-cleanup-vector";
export const PID_SIMULATION_STEP_COUNT = 60 as const;
export const MIN_SUSTAINED_MINUTES = 1 as const;
export const MAX_SUSTAINED_MINUTES = 60 as const;
export const DEFAULT_SUSTAINED_MINUTES = 30 as const;

export const COMPUTE_PRESSURE_STATES = ["nominal", "fair", "serious", "critical"] as const;
export const QUANTIZATION_MODES = ["auto", "fp16", "int8", "int4"] as const;
export const POWER_SOURCE_MODES = ["ac-plugged", "battery-balanced", "battery-saver"] as const;
export const AMBIENT_THERMAL_LEVELS = ["cool", "normal", "warm"] as const;

export type ComputePressureState = (typeof COMPUTE_PRESSURE_STATES)[number];
export type QuantizationMode = (typeof QUANTIZATION_MODES)[number];
export type PowerSourceMode = (typeof POWER_SOURCE_MODES)[number];
export type AmbientThermalLevel = (typeof AMBIENT_THERMAL_LEVELS)[number];
export type TargetFrameRateHz = 60 | 120;
export type DegradationTier = 0 | 1 | 2 | 3 | 4;

export type SiliconNpuTargetId = "apple-ane-coreml" | "intel-core-ultra-npu" | "amd-ryzen-ai-xdna2" | "qualcomm-hexagon-htp" | "samsung-exynos-npu";
export type WebtoonAiWorkloadId = "lineart-cleanup-vector" | "flat-color-segmentation" | "normal-depth-relight" | "character-consistency-embed" | "stroke-trajectory-denoise";
export type EffectiveQuantizationFormat = "fp16" | "bf16" | "int8" | "int4-palettized" | "block-fp16-int4" | "w4a8-int4" | "int8-fp16-mixed";
export type ZeroCopyTransportMode = "uma-mltensor-zero-copy" | "directml-mltensor-shared" | "directml-xdna-mltensor-shared" | "qnn-dmabuf-mltensor-shared" | "nnapi-staged-upload-fallback";
export type ThermalEnvelopeClass = "unified-desktop-laptop" | "ultrabook-shared-tdp" | "thin-laptop-stapm" | "mobile-strict-passive" | "mobile-dynamic-cap";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface PidGainParameters { readonly kp: number; readonly ki: number; readonly kd: number; readonly integralClamp: number; }
export interface SpatialTileGrid { readonly rows: number; readonly cols: number; readonly totalTiles: number; readonly layoutLabel: string; }

export interface SiliconNpuTargetProfile {
  readonly id: SiliconNpuTargetId; readonly nameKo: string; readonly nameEn: string; readonly shortLabel: string;
  readonly executionProvider: string; readonly nativePrecisionsLabel: string;
  readonly autoQuantFormat: EffectiveQuantizationFormat; readonly int4QuantFormat: EffectiveQuantizationFormat; readonly fp16QuantFormat: EffectiveQuantizationFormat;
  readonly primaryFusionSignature: string; readonly fusionEfficiencyFactor: number;
  readonly staticShapePaddingRequired: boolean; readonly shapeTileAlignment: number; readonly spatialTileGrid: SpatialTileGrid;
  readonly zeroCopySupported: boolean; readonly zeroCopyTransport: ZeroCopyTransportMode;
  readonly powerSharingNoteKo: string; readonly powerSharingNoteEn: string; readonly gpuPowerCouplingRatio: number;
  readonly thermalEnvelopeClass: ThermalEnvelopeClass; readonly thermalCapacityIndex: number;
  readonly thermalSetpointBase: number; readonly thermalCliffThreshold: number; readonly coolingCoeff: number;
  readonly relativeComputeSpeedFactor: number; readonly baseWarmupMs: number;
  readonly defaultPidGains: PidGainParameters; readonly accentOklch: OklchColor;
}

export interface WebtoonAiWorkloadProfile {
  readonly id: WebtoonAiWorkloadId; readonly order: 1 | 2 | 3 | 4 | 5;
  readonly nameKo: string; readonly nameEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly inputShape: readonly [number, number, number, number];
  readonly rawOpCount: number; readonly baseInferenceUnitsMs: number; readonly baseThermalLoad: number;
  readonly maxAllowedAccuracyLossPct: number; readonly hoverWarmupPriority: "critical" | "high" | "medium" | "low";
  readonly canPauseInTier3: boolean; readonly fusionPatterns: readonly string[]; readonly accentOklch: OklchColor;
}

export interface WebNnGraphCompileInput {
  readonly siliconId?: SiliconNpuTargetId; readonly workloadId?: WebtoonAiWorkloadId;
  readonly quantizationMode?: QuantizationMode; readonly zeroCopyMlTensorEnabled?: boolean;
  readonly penHoverWarmupEnabled?: boolean; readonly targetFrameRateHz?: TargetFrameRateHz;
  readonly thermalOverrideTier?: DegradationTier;
}

export interface FusedOperatorBlock {
  readonly blockId: string; readonly pattern: string; readonly originalOpCount: number;
  readonly fusedOpCount: number; readonly memoryTripsSaved: number; readonly siliconPassTag: string;
}

export interface GraphFusionPassResult {
  readonly rawOpCount: number; readonly fusedOpCount: number; readonly eliminatedOps: number;
  readonly fusionRatioPct: number; readonly memoryRoundTripReductionPct: number;
  readonly staticShapePaddingApplied: boolean;
  readonly originalShape: readonly [number, number, number, number];
  readonly compiledShape: readonly [number, number, number, number];
  readonly paddingOverheadPct: number; readonly spatialTileUtilizationPct: number;
  readonly fusedBlocks: readonly FusedOperatorBlock[];
}

export interface GraphQuantizationPassResult {
  readonly requestedMode: QuantizationMode; readonly effectiveFormat: EffectiveQuantizationFormat;
  readonly effectiveFormatLabel: string; readonly estimatedAccuracyLossPct: number;
  readonly maxAllowedAccuracyLossPct: number; readonly withinAccuracyBudget: boolean;
  readonly mixedPrecisionGuardApplied: boolean; readonly weightCompressionRatio: number;
  readonly sramResidenceTier: "full-sram" | "tiled-sram" | "ddr-streaming";
  readonly guardNoteKo: string; readonly guardNoteEn: string;
}

export interface ZeroCopyMlTensorPassResult {
  readonly requestedEnabled: boolean; readonly siliconSupported: boolean; readonly zeroCopyActive: boolean;
  readonly transportMode: ZeroCopyTransportMode; readonly cpuReadbackCount: 0 | 2;
  readonly copyOverheadMs: number; readonly extraBusHeatFactor: number;
  readonly pipelineHopsKo: readonly string[]; readonly pipelineHopsEn: readonly string[];
  readonly statusNoteKo: string; readonly statusNoteEn: string;
}

export interface PenHoverWarmupPhase {
  readonly phaseId: "hover-detect" | "context-bind" | "sram-prefetch" | "kernel-prime";
  readonly labelKo: string; readonly labelEn: string; readonly leadOffsetMs: number; readonly durationMs: number;
}

export interface PenHoverWarmupPassResult {
  readonly enabled: boolean; readonly triggerEvent: "pointermove-stylus-hover" | "disabled-on-pendown";
  readonly hoverLeadWindowMs: number; readonly coldStartLatencyMs: number; readonly warmStartLatencyMs: number;
  readonly firstStrokeLatencySavedMs: number; readonly idleSleepTimeoutMs: number;
  readonly phases: readonly PenHoverWarmupPhase[];
}

/** 기존 공개 계획 힌트 형식이며 현재 표준 MLContextOptions 자체는 아니다. */
export interface WebNnMlContextOptionsSpec {
  readonly deviceType: "npu" | "gpu";
  readonly powerPreference: "default" | "low-power" | "high-performance";
  readonly executionProviderHint: string; readonly staticShapePaddingRequired: boolean;
  readonly mlTensorZeroCopyRequested: boolean; readonly mlTensorZeroCopyActive: boolean;
}

export interface CompiledIrNode {
  readonly nodeId: string; readonly stage: "input-tensor" | "fused-kernel" | "quant-adapter" | "output-tensor";
  readonly opLabel: string; readonly precision: EffectiveQuantizationFormat;
  readonly shape: readonly [number, number, number, number];
}

export interface WebNnCompiledGraphResult {
  readonly runtimeEvidence: typeof WEBNN_RUNTIME_EVIDENCE;
  readonly modelKind: typeof WEBNN_NPU_THERMAL_MODEL_KIND;
  readonly siliconTarget: SiliconNpuTargetProfile; readonly workload: WebtoonAiWorkloadProfile;
  readonly fusionPass: GraphFusionPassResult; readonly quantizationPass: GraphQuantizationPassResult;
  readonly zeroCopyPass: ZeroCopyMlTensorPassResult; readonly hoverWarmupPass: PenHoverWarmupPassResult;
  readonly mlContextOptions: WebNnMlContextOptionsSpec;
  readonly modeledInferenceMs: number; readonly frameBudgetMs: number;
  readonly frameBudgetUtilizationPct: number; readonly meetsFrameBudget: boolean;
  readonly irNodes: readonly CompiledIrNode[];
}

export interface DegradationTierSpec {
  readonly tier: DegradationTier;
  readonly code: "nominal" | "quantize-int4" | "cadence-1-to-2" | "pause-noncore-preview" | "lightweight-gpu-wasm-fallback";
  readonly controlThreshold01: number; readonly heatMultiplier: number; readonly inferenceCadenceFrames: 1 | 2 | 4;
  readonly titleKo: string; readonly titleEn: string; readonly actionKo: string; readonly actionEn: string;
}

export interface ThermalPidStepPoint {
  readonly step: number; readonly elapsedMinutes: number;
  readonly pidThermalIndex: number; readonly pidThermalHeadroom01: number;
  readonly uncontrolledThermalIndex: number; readonly uncontrolledThermalHeadroom01: number;
  readonly setpointThermalIndex: number; readonly errorTerm: number; readonly proportionalTerm: number;
  readonly integralState: number; readonly derivativeTerm: number; readonly antiWindupClamped: boolean;
  readonly controlEffort01: number; readonly degradationTier: DegradationTier;
  readonly pidEffectiveFps: number; readonly uncontrolledEffectiveFps: number; readonly uncontrolledCliffActive: boolean;
}

export interface ThermalPidSimulationInput {
  readonly siliconId?: SiliconNpuTargetId; readonly workloadId?: WebtoonAiWorkloadId;
  readonly quantizationMode?: QuantizationMode; readonly zeroCopyMlTensorEnabled?: boolean;
  readonly ambientLoadLevel?: AmbientThermalLevel; readonly batteryMode?: PowerSourceMode;
  readonly pressureState?: ComputePressureState; readonly sustainedMinutes?: number;
  readonly targetFrameRateHz?: TargetFrameRateHz; readonly pidGains?: Readonly<Partial<PidGainParameters>>;
}

export interface ThermalPidSimulationResult {
  readonly modelKind: typeof WEBNN_NPU_THERMAL_MODEL_KIND;
  readonly measurementBasis: typeof WEBNN_NPU_THERMAL_MEASUREMENT_BASIS;
  readonly siliconId: SiliconNpuTargetId; readonly workloadId: WebtoonAiWorkloadId;
  readonly ambientLoadLevel: AmbientThermalLevel; readonly batteryMode: PowerSourceMode;
  readonly pressureState: ComputePressureState; readonly sustainedMinutes: number;
  readonly targetFrameRateHz: TargetFrameRateHz; readonly gains: PidGainParameters;
  readonly setpointThermalIndex: number; readonly cliffThresholdIndex: number;
  readonly stepCount: typeof PID_SIMULATION_STEP_COUNT; readonly trajectory: readonly ThermalPidStepPoint[];
  readonly peakPidThermalIndex: number; readonly peakUncontrolledThermalIndex: number;
  readonly finalThermalIndex: number; readonly finalThermalHeadroom01: number;
  readonly minPidEffectiveFps: number; readonly minUncontrolledEffectiveFps: number;
  readonly uncontrolledCliffSteps: number; readonly pidCliffAvoided: boolean;
  readonly antiWindupClampCount: number; readonly maxDegradationTier: DegradationTier;
  readonly finalDegradationTier: DegradationTier; readonly steadyStateError: number;
  readonly tierFirstEngagedStep: Readonly<Record<DegradationTier, number | null>>;
}

export interface WebNnNpuThermalPlanInput extends ThermalPidSimulationInput { readonly penHoverWarmupEnabled?: boolean; }

export interface WebNnNpuThermalPlan {
  readonly runtimeEvidence: typeof WEBNN_RUNTIME_EVIDENCE;
  readonly schemaVersion: typeof WEBNN_NPU_THERMAL_SCHEMA_VERSION;
  readonly modelKind: typeof WEBNN_NPU_THERMAL_MODEL_KIND;
  readonly measurementBasis: typeof WEBNN_NPU_THERMAL_MEASUREMENT_BASIS;
  readonly honestyNoticeKo: string; readonly honestyNoticeEn: string;
  readonly siliconTarget: SiliconNpuTargetProfile; readonly workload: WebtoonAiWorkloadProfile;
  readonly compiledGraph: WebNnCompiledGraphResult;
  readonly thermalSimulation: ThermalPidSimulationResult;
  readonly degradationLadder: readonly DegradationTierSpec[];
}

export interface ExportedWebNnThermalPlan { readonly plan: WebNnNpuThermalPlan; readonly json: string; }

const VIOLET_HUE_MIN = 270;
const VIOLET_HUE_MAX = 320;
const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const roundTo = (v: number, digits = 2): number => Math.round(v * 10 ** digits) / 10 ** digits;
const alignUp = (value: number, alignment: number): number => (alignment <= 1 ? value : Math.ceil(value / alignment) * alignment);
const pickValid = <T extends string>(allowed: readonly T[], value: T | undefined, fallback: T): T =>
  value !== undefined && allowed.includes(value) ? value : fallback;

export function isVioletSlopHue(hue: number): boolean {
  const norm = ((hue % 360) + 360) % 360;
  return norm >= VIOLET_HUE_MIN && norm <= VIOLET_HUE_MAX;
}
export function sanitizeNonVioletHue(hue: number): number {
  const norm = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 240;
  return isVioletSlopHue(norm) ? (norm < 295 ? 248 : 340) : Math.round(norm * 10) / 10;
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(clamp(color.c, 0, 0.35), 3);
  const h = sanitizeNonVioletHue(color.h);
  return alpha === undefined ? `oklch(${l} ${c} ${h})` : `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 2).toFixed(2)})`;
}

export const SILICON_NPU_TARGETS: readonly SiliconNpuTargetProfile[] = [
  {
    id: "apple-ane-coreml", nameKo: "Apple Silicon Neural Engine", nameEn: "Apple Silicon Neural Engine",
    shortLabel: "Apple ANE", executionProvider: "CoreML EP", nativePrecisionsLabel: "FP16 + 4-bit Palettization",
    autoQuantFormat: "fp16", int4QuantFormat: "int4-palettized", fp16QuantFormat: "fp16",
    primaryFusionSignature: "Conv2D+Bias+SiLU (CoreML ANE)", fusionEfficiencyFactor: 0.44,
    staticShapePaddingRequired: false, shapeTileAlignment: 16,
    spatialTileGrid: { rows: 4, cols: 4, totalTiles: 16, layoutLabel: "16-lane ANE SRAM" },
    zeroCopySupported: true, zeroCopyTransport: "uma-mltensor-zero-copy",
    powerSharingNoteKo: "통합 메모리(UMA) Zero-Copy MLTensor 공유 · GPU/미디어 엔진과 패키지 전력 균형",
    powerSharingNoteEn: "Unified Memory zero-copy MLTensor sharing balanced across GPU and media engines",
    gpuPowerCouplingRatio: 0.22, thermalEnvelopeClass: "unified-desktop-laptop", thermalCapacityIndex: 0.88,
    thermalSetpointBase: 72, thermalCliffThreshold: 91, coolingCoeff: 0.24, relativeComputeSpeedFactor: 1.18,
    baseWarmupMs: 14, defaultPidGains: { kp: 0.044, ki: 0.012, kd: 0.024, integralClamp: 24 }, accentOklch: { l: 0.54, c: 0.12, h: 228 },
  },
  {
    id: "intel-core-ultra-npu", nameKo: "Intel Core Ultra NPU", nameEn: "Intel Core Ultra NPU",
    shortLabel: "Intel NPU", executionProvider: "OpenVINO / DirectML EP", nativePrecisionsLabel: "INT8 / BF16 · 정적 Shape 타일 패딩",
    autoQuantFormat: "int8", int4QuantFormat: "w4a8-int4", fp16QuantFormat: "bf16",
    primaryFusionSignature: "Conv2D+BN+GELU (Static 64-Align)", fusionEfficiencyFactor: 0.39,
    staticShapePaddingRequired: true, shapeTileAlignment: 64,
    spatialTileGrid: { rows: 2, cols: 6, totalTiles: 12, layoutLabel: "6-NCE Static Tile" },
    zeroCopySupported: true, zeroCopyTransport: "directml-mltensor-shared",
    powerSharingNoteKo: "Intel Arc GPU와 동일 SoC 전력 예산 공유 · 정적 Shape 64정렬 패딩 필수",
    powerSharingNoteEn: "Shares package power budget with Arc iGPU; requires static 64-aligned tile padding",
    gpuPowerCouplingRatio: 0.38, thermalEnvelopeClass: "ultrabook-shared-tdp", thermalCapacityIndex: 0.72,
    thermalSetpointBase: 69, thermalCliffThreshold: 89, coolingCoeff: 0.2, relativeComputeSpeedFactor: 0.96,
    baseWarmupMs: 21, defaultPidGains: { kp: 0.048, ki: 0.014, kd: 0.026, integralClamp: 22 }, accentOklch: { l: 0.56, c: 0.13, h: 205 },
  },
  {
    id: "amd-ryzen-ai-xdna2", nameKo: "AMD Ryzen AI XDNA2", nameEn: "AMD Ryzen AI XDNA2",
    shortLabel: "AMD XDNA2", executionProvider: "VitisAI / DirectML EP", nativePrecisionsLabel: "Block-FP16 / INT4 · 4×8 공간 타일링",
    autoQuantFormat: "block-fp16-int4", int4QuantFormat: "block-fp16-int4", fp16QuantFormat: "bf16",
    primaryFusionSignature: "Spatial 4x8 Tile Conv2D+BN+SiLU", fusionEfficiencyFactor: 0.43,
    staticShapePaddingRequired: true, shapeTileAlignment: 32,
    spatialTileGrid: { rows: 4, cols: 8, totalTiles: 32, layoutLabel: "4x8 AIE Spatial Array" },
    zeroCopySupported: true, zeroCopyTransport: "directml-xdna-mltensor-shared",
    powerSharingNoteKo: "4×8 AIE 공간 배열 병렬화 · Radeon iGPU와 STAPM 열 봉투 협조",
    powerSharingNoteEn: "Parallelizes across 4x8 AIE spatial array within shared STAPM envelope",
    gpuPowerCouplingRatio: 0.3, thermalEnvelopeClass: "thin-laptop-stapm", thermalCapacityIndex: 0.79,
    thermalSetpointBase: 71, thermalCliffThreshold: 90, coolingCoeff: 0.22, relativeComputeSpeedFactor: 1.12,
    baseWarmupMs: 18, defaultPidGains: { kp: 0.046, ki: 0.013, kd: 0.025, integralClamp: 23 }, accentOklch: { l: 0.55, c: 0.16, h: 32 },
  },
  {
    id: "qualcomm-hexagon-htp", nameKo: "Qualcomm Hexagon HTP", nameEn: "Qualcomm Hexagon HTP",
    shortLabel: "Hexagon HTP", executionProvider: "QNN EP", nativePrecisionsLabel: "INT8 / INT4 W4A8 · HVX+HMX 융합",
    autoQuantFormat: "w4a8-int4", int4QuantFormat: "w4a8-int4", fp16QuantFormat: "fp16",
    primaryFusionSignature: "HVX Vector + HMX Matrix W4A8 Fuse", fusionEfficiencyFactor: 0.42,
    staticShapePaddingRequired: true, shapeTileAlignment: 32,
    spatialTileGrid: { rows: 4, cols: 6, totalTiles: 24, layoutLabel: "HVX+HMX Vector/Matrix" },
    zeroCopySupported: true, zeroCopyTransport: "qnn-dmabuf-mltensor-shared",
    powerSharingNoteKo: "모바일/팬리스 열 봉투 엄격 · HVX 벡터·HMX 행렬 융합으로 저전력 유지",
    powerSharingNoteEn: "Strict mobile/fanless thermal envelope; HVX+HMX fusion keeps power draw low",
    gpuPowerCouplingRatio: 0.34, thermalEnvelopeClass: "mobile-strict-passive", thermalCapacityIndex: 0.58,
    thermalSetpointBase: 64, thermalCliffThreshold: 84, coolingCoeff: 0.175, relativeComputeSpeedFactor: 1.04,
    baseWarmupMs: 16, defaultPidGains: { kp: 0.058, ki: 0.016, kd: 0.032, integralClamp: 20 }, accentOklch: { l: 0.54, c: 0.14, h: 158 },
  },
  {
    id: "samsung-exynos-npu", nameKo: "Samsung Exynos NPU", nameEn: "Samsung Exynos NPU",
    shortLabel: "Exynos NPU", executionProvider: "NNAPI / WebNN-Android EP", nativePrecisionsLabel: "INT8 / FP16 혼합 · 동적 전력 캡",
    autoQuantFormat: "int8-fp16-mixed", int4QuantFormat: "int8-fp16-mixed", fp16QuantFormat: "fp16",
    primaryFusionSignature: "Mixed INT8/FP16 Conv2D+BN+HardSwish", fusionEfficiencyFactor: 0.35,
    staticShapePaddingRequired: true, shapeTileAlignment: 32,
    spatialTileGrid: { rows: 3, cols: 4, totalTiles: 12, layoutLabel: "Exynos Hybrid NPU Core" },
    zeroCopySupported: false, zeroCopyTransport: "nnapi-staged-upload-fallback",
    powerSharingNoteKo: "모바일 동적 전력 캡 연동 · 기본 NNAPI 경로는 스테이징 복사 폴백(AHWB 확장 전)",
    powerSharingNoteEn: "Coupled to Android dynamic power cap; baseline NNAPI uses staged copy fallback",
    gpuPowerCouplingRatio: 0.4, thermalEnvelopeClass: "mobile-dynamic-cap", thermalCapacityIndex: 0.55,
    thermalSetpointBase: 65, thermalCliffThreshold: 85, coolingCoeff: 0.17, relativeComputeSpeedFactor: 0.88,
    baseWarmupMs: 24, defaultPidGains: { kp: 0.056, ki: 0.016, kd: 0.03, integralClamp: 20 }, accentOklch: { l: 0.57, c: 0.14, h: 72 },
  },
];

export const WEBTOON_AI_WORKLOADS: readonly WebtoonAiWorkloadProfile[] = [
  {
    id: "lineart-cleanup-vector", order: 1, nameKo: "선화 자동 클린업 · 벡터 보조", nameEn: "Lineart Cleanup & Vector Assist",
    summaryKo: "거친 스케치 이중선을 단일 벡터 중심선으로 정리하고 끝단 끊김을 보정합니다.",
    summaryEn: "Cleans rough double-strokes into single vector centerlines with gap repair.",
    inputShape: [1, 3, 512, 512], rawOpCount: 48, baseInferenceUnitsMs: 3.4, baseThermalLoad: 11.4,
    maxAllowedAccuracyLossPct: 1.5, hoverWarmupPriority: "critical", canPauseInTier3: false,
    fusionPatterns: ["Conv2D+BatchNorm+SiLU", "DepthwiseConv+PointwiseConv+SiLU", "SkipConcat+Conv2D+Bias"], accentOklch: { l: 0.53, c: 0.13, h: 228 },
  },
  {
    id: "flat-color-segmentation", order: 2, nameKo: "실시간 플랫 채색 세그멘테이션", nameEn: "Real-time Flat Color Segmentation",
    summaryKo: "열린 선화 경계를 닫힘 영역으로 추정해 밑색 레이어 마스크를 즉시 분리합니다.",
    summaryEn: "Closes open lineart boundaries and splits flat-fill color masks in real time.",
    inputShape: [1, 4, 480, 480], rawOpCount: 58, baseInferenceUnitsMs: 4.3, baseThermalLoad: 12.6,
    maxAllowedAccuracyLossPct: 2.3, hoverWarmupPriority: "high", canPauseInTier3: true,
    fusionPatterns: ["Conv2D+BatchNorm+ReLU", "AtrousSpatialPyramid+Add", "UpSample+Conv2D+Sigmoid"], accentOklch: { l: 0.55, c: 0.14, h: 158 },
  },
  {
    id: "normal-depth-relight", order: 3, nameKo: "2D→3D 노멀·깊이맵 추정(리라이트)", nameEn: "2D-to-3D Normal & Depth Relight",
    summaryKo: "캐릭터 명암·역광 리라이트를 위한 법선·깊이 텐서를 연속 추론합니다.",
    summaryEn: "Estimates continuous normal and depth tensors for 2D character relighting.",
    inputShape: [1, 3, 360, 360], rawOpCount: 74, baseInferenceUnitsMs: 5.8, baseThermalLoad: 14.2,
    maxAllowedAccuracyLossPct: 1.2, hoverWarmupPriority: "medium", canPauseInTier3: true,
    fusionPatterns: ["Conv2D+BatchNorm+GELU", "MultiHeadAttn+Proj+Add", "ResidualDecoder+NormalHead"], accentOklch: { l: 0.56, c: 0.15, h: 36 },
  },
  {
    id: "character-consistency-embed", order: 4, nameKo: "캐릭터 얼굴·포즈 일관성 임베딩", nameEn: "Character Face & Pose Embedding",
    summaryKo: "컷 간 캐릭터 이목구비·체형 비율 편차를 임베딩 거리로 실시간 검수합니다.",
    summaryEn: "Checks face and pose proportions across panels via identity embeddings.",
    inputShape: [1, 3, 224, 224], rawOpCount: 52, baseInferenceUnitsMs: 3.7, baseThermalLoad: 11.8,
    maxAllowedAccuracyLossPct: 1.9, hoverWarmupPriority: "low", canPauseInTier3: true,
    fusionPatterns: ["Conv2D+BatchNorm+HardSwish", "MatMul+Bias+LayerNorm", "GlobalPool+L2Normalize"], accentOklch: { l: 0.57, c: 0.14, h: 72 },
  },
  {
    id: "stroke-trajectory-denoise", order: 5, nameKo: "스트로크 궤적 노이즈 제거", nameEn: "Stroke Trajectory Denoiser",
    summaryKo: "고주파 스타일러스 손떨림과 필압 스파이크를 저지연 1D 컨볼루션으로 안정화합니다.",
    summaryEn: "Suppresses stylus jitter and pressure spikes with low-latency 1D convolutions.",
    inputShape: [1, 6, 96, 1], rawOpCount: 24, baseInferenceUnitsMs: 1.4, baseThermalLoad: 7.4,
    maxAllowedAccuracyLossPct: 1.3, hoverWarmupPriority: "critical", canPauseInTier3: false,
    fusionPatterns: ["Conv1D+BatchNorm+SiLU", "TemporalDilatedConv+ResidualAdd", "Linear+ClampOut"], accentOklch: { l: 0.54, c: 0.13, h: 188 },
  },
];

export const DEGRADATION_LADDER_SPECS: readonly DegradationTierSpec[] = [
  {
    tier: 0, code: "nominal", controlThreshold01: 0, heatMultiplier: 1.0, inferenceCadenceFrames: 1,
    titleKo: "0단 · 정상 추론", titleEn: "Tier 0 · Nominal",
    actionKo: "실리콘 기본 양자화와 1프레임 동기 추론, 전체 프리뷰를 그대로 유지합니다.",
    actionEn: "Maintains default precision, 1:1 frame cadence, and all studio previews.",
  },
  {
    tier: 1, code: "quantize-int4", controlThreshold01: 0.22, heatMultiplier: 0.75, inferenceCadenceFrames: 1,
    titleKo: "1단 · INT4 양자화 전환", titleEn: "Tier 1 · INT4 Quantization",
    actionKo: "가중치를 INT4/W4A8·Palettized 경로로 낮춰 120Hz를 지키며 연산 열을 줄입니다.",
    actionEn: "Lowers weights to INT4/W4A8 to cut compute heat while preserving 120Hz drawing.",
  },
  {
    tier: 2, code: "cadence-1-to-2", controlThreshold01: 0.45, heatMultiplier: 0.54, inferenceCadenceFrames: 2,
    titleKo: "2단 · 추론 주기 1→2프레임 분산", titleEn: "Tier 2 · 1-to-2 Frame Cadence",
    actionKo: "펜 드로잉 렌더링은 목표 Hz를 유지하고 AI 보조 추론만 2프레임 간격으로 분산합니다.",
    actionEn: "Keeps pen rendering at target Hz while pacing AI inference to every 2nd frame.",
  },
  {
    tier: 3, code: "pause-noncore-preview", controlThreshold01: 0.68, heatMultiplier: 0.35, inferenceCadenceFrames: 2,
    titleKo: "3단 · 비핵심 프리뷰 일시중지", titleEn: "Tier 3 · Pause Non-Core Previews",
    actionKo: "리라이트·임베딩·배경 세그멘테이션 실시간 프리뷰를 잠시 멈추고 선화/스트로크만 유지합니다.",
    actionEn: "Pauses relight and embedding previews while keeping core stroke/lineart assist active.",
  },
  {
    tier: 4, code: "lightweight-gpu-wasm-fallback", controlThreshold01: 0.86, heatMultiplier: 0.19, inferenceCadenceFrames: 4,
    titleKo: "4단 · WebGPU/WASM 경량 폴백", titleEn: "Tier 4 · WebGPU/WASM Fallback",
    actionKo: "NPU를 냉각 휴지하고 초경량 WebGPU·WASM 보정으로 넘겨 서멀 클리프(15fps 추락)를 차단합니다.",
    actionEn: "Rests the NPU and hands off to lightweight WebGPU/WASM filters to prevent 15fps thermal cliffs.",
  },
];

export function getSiliconNpuTarget(id?: SiliconNpuTargetId): SiliconNpuTargetProfile {
  return structuredClone(SILICON_NPU_TARGETS.find((item) => item.id === id) ?? SILICON_NPU_TARGETS[0]);
}
export function getWebtoonAiWorkload(id?: WebtoonAiWorkloadId): WebtoonAiWorkloadProfile {
  return structuredClone(WEBTOON_AI_WORKLOADS.find((item) => item.id === id) ?? WEBTOON_AI_WORKLOADS[0]);
}
const QUANT_META: Readonly<Record<EffectiveQuantizationFormat, { readonly label: string; readonly lossPct: number; readonly compression: number; readonly speedBoost: number }>> = {
  fp16: { label: "FP16", lossPct: 0.12, compression: 1.0, speedBoost: 1.0 },
  bf16: { label: "BF16", lossPct: 0.18, compression: 1.0, speedBoost: 1.04 },
  "int8-fp16-mixed": { label: "INT8/FP16 Mixed", lossPct: 0.58, compression: 1.75, speedBoost: 1.24 },
  int8: { label: "INT8", lossPct: 0.82, compression: 2.0, speedBoost: 1.38 },
  "block-fp16-int4": { label: "Block-FP16 + INT4", lossPct: 1.05, compression: 3.4, speedBoost: 1.62 },
  "int4-palettized": { label: "4-bit Palettized (FP16 Act)", lossPct: 1.12, compression: 3.6, speedBoost: 1.56 },
  "w4a8-int4": { label: "INT4 W4A8", lossPct: 1.38, compression: 3.8, speedBoost: 1.68 },
};
function resolveQuantizationPass(
  target: SiliconNpuTargetProfile, workload: WebtoonAiWorkloadProfile,
  requestedMode: QuantizationMode, thermalOverrideTier: DegradationTier,
): GraphQuantizationPassResult {
  const forceInt4 = thermalOverrideTier >= 1 && requestedMode === "auto";
  let effectiveFormat: EffectiveQuantizationFormat =
    forceInt4 || requestedMode === "int4" ? target.int4QuantFormat
      : requestedMode === "fp16" ? target.fp16QuantFormat
        : requestedMode === "int8" ? (target.id === "samsung-exynos-npu" ? "int8-fp16-mixed" : "int8")
          : target.autoQuantFormat;

  let meta = QUANT_META[effectiveFormat];
  let mixedPrecisionGuardApplied = false;
  if (meta.lossPct > workload.maxAllowedAccuracyLossPct && requestedMode === "auto") {
    effectiveFormat = target.id === "intel-core-ultra-npu" || target.id === "amd-ryzen-ai-xdna2" ? "bf16" : "int8-fp16-mixed";
    meta = QUANT_META[effectiveFormat];
    mixedPrecisionGuardApplied = true;
  }

  const withinAccuracyBudget = meta.lossPct <= workload.maxAllowedAccuracyLossPct;
  const sramResidenceTier: GraphQuantizationPassResult["sramResidenceTier"] =
    meta.compression >= 3.2 || workload.rawOpCount <= 30 ? "full-sram" : meta.compression >= 1.7 ? "tiled-sram" : "ddr-streaming";

  const guardNoteKo = mixedPrecisionGuardApplied
    ? `가정 손실 한계(${workload.maxAllowedAccuracyLossPct}%)에 따라 혼합 정밀도(${meta.label}) 계획을 선택했습니다. 실제 정확도 검증은 아닙니다.`
    : withinAccuracyBudget
      ? `${meta.label}의 고정 손실 가정값이 허용 가정(${workload.maxAllowedAccuracyLossPct}%) 안입니다. 실제 양자화·정확도 평가는 하지 않았습니다.`
      : `강제 ${meta.label} 지정으로 예상 손실(${meta.lossPct}%)이 허용치(${workload.maxAllowedAccuracyLossPct}%)를 초과합니다. Auto 또는 FP16/INT8을 권장합니다.`;
  const guardNoteEn = mixedPrecisionGuardApplied
    ? `Selected a mixed-precision plan (${meta.label}) using the assumed ${workload.maxAllowedAccuracyLossPct}% cap; accuracy is unmeasured.`
    : withinAccuracyBudget
      ? `The fixed ${meta.label} loss assumption falls within the assumed ${workload.maxAllowedAccuracyLossPct}% cap; no quantization or accuracy evaluation was run.`
      : `Forced ${meta.label} (${meta.lossPct}% loss) exceeds the ${workload.maxAllowedAccuracyLossPct}% cap; switch to Auto or FP16/INT8.`;

  return {
    requestedMode, effectiveFormat, effectiveFormatLabel: meta.label,
    estimatedAccuracyLossPct: meta.lossPct, maxAllowedAccuracyLossPct: workload.maxAllowedAccuracyLossPct,
    withinAccuracyBudget, mixedPrecisionGuardApplied, weightCompressionRatio: meta.compression,
    sramResidenceTier, guardNoteKo, guardNoteEn,
  };
}

/** 가정 프로파일 × 워크로드의 그래프 계획 산식. 실제 WebNN 그래프를 생성하지 않는다. */
export function compileWebNnSiliconGraph(input: WebNnGraphCompileInput = {}): WebNnCompiledGraphResult {
  const target = getSiliconNpuTarget(input.siliconId);
  const workload = getWebtoonAiWorkload(input.workloadId);
  const requestedMode = pickValid(QUANTIZATION_MODES, input.quantizationMode, "auto");
  const zeroCopyRequested = typeof input.zeroCopyMlTensorEnabled === "boolean" ? input.zeroCopyMlTensorEnabled : true;
  const penHoverWarmupEnabled = typeof input.penHoverWarmupEnabled === "boolean" ? input.penHoverWarmupEnabled : true;
  const targetFrameRateHz: TargetFrameRateHz = input.targetFrameRateHz === 60 ? 60 : 120;
  const thermalOverrideTier = Math.round(clamp(input.thermalOverrideTier ?? 0, 0, 4)) as DegradationTier;

  // Pass 1: 연산자 융합 & 정적 Shape 타일 패딩
  const [n, c, h, w] = workload.inputShape;
  const paddedH = target.staticShapePaddingRequired ? alignUp(h, target.shapeTileAlignment) : h;
  const paddedW = target.staticShapePaddingRequired && w > 1 ? alignUp(w, target.shapeTileAlignment) : w;
  const compiledShape: readonly [number, number, number, number] = [n, c, paddedH, paddedW];
  const paddingOverheadPct = roundTo(((Math.max(1, paddedH * paddedW) - Math.max(1, h * w)) / Math.max(1, h * w)) * 100, 1);

  const perBlockBase = Math.max(3, Math.floor(workload.rawOpCount / workload.fusionPatterns.length));

  const fusedBlocks: readonly FusedOperatorBlock[] = workload.fusionPatterns.map((pattern, idx) => {
    const orig = idx === workload.fusionPatterns.length - 1
      ? Math.max(3, workload.rawOpCount - perBlockBase * (workload.fusionPatterns.length - 1)) : perBlockBase;
    const fused = Math.max(2, Math.round(orig * (1 - target.fusionEfficiencyFactor)));
    return {
      blockId: `fuse-${idx + 1}`, pattern, originalOpCount: orig, fusedOpCount: fused,
      memoryTripsSaved: Math.max(1, (orig - fused) * 2),
      siliconPassTag: idx === 0 ? target.primaryFusionSignature : `${target.shortLabel} ${target.spatialTileGrid.layoutLabel}`,
    };
  });

  const fusedOpCount = fusedBlocks.reduce((sum, block) => sum + block.fusedOpCount, 0);
  const eliminatedOps = workload.rawOpCount - fusedOpCount;
  const fusionRatioPct = roundTo((eliminatedOps / workload.rawOpCount) * 100, 1);
  const fusionPass: GraphFusionPassResult = {
    rawOpCount: workload.rawOpCount, fusedOpCount, eliminatedOps, fusionRatioPct,
    memoryRoundTripReductionPct: roundTo(clamp(fusionRatioPct * 1.18, 22, 68), 1),
    staticShapePaddingApplied: paddedH !== h || paddedW !== w, originalShape: workload.inputShape, compiledShape,
    paddingOverheadPct,
    spatialTileUtilizationPct: roundTo(clamp(((paddedH * Math.max(paddedW, 16)) / (target.spatialTileGrid.totalTiles * 512)) * 18 + 64, 62, 98), 1),
    fusedBlocks,
  };

  // Pass 2: 실리콘 최적 양자화
  const quantizationPass = resolveQuantizationPass(target, workload, requestedMode, thermalOverrideTier);
  const quantMeta = QUANT_META[quantizationPass.effectiveFormat];

  // Pass 3: WebGPU↔WebNN MLTensor Zero-Copy 공유 경로 판별
  const zeroCopyActive = zeroCopyRequested && target.zeroCopySupported;
  const cpuReadbackCount: 0 | 2 = zeroCopyActive ? 0 : 2;
  const copyOverheadMs = zeroCopyActive ? 0 : roundTo(0.85 + ((n * c * paddedH * paddedW) / (3 * 512 * 512)) * 1.65, 2);

  const zeroCopyPass: ZeroCopyMlTensorPassResult = {
    requestedEnabled: zeroCopyRequested, siliconSupported: target.zeroCopySupported, zeroCopyActive,
    transportMode: zeroCopyActive ? target.zeroCopyTransport : "nnapi-staged-upload-fallback",
    cpuReadbackCount, copyOverheadMs, extraBusHeatFactor: zeroCopyActive ? 1.0 : 1.15,
    pipelineHopsKo: zeroCopyActive
      ? ["WebGPU 캔버스 텍스처", `공유 MLTensor (${target.shortLabel} Zero-Copy)`, `WebNN ${target.executionProvider} 디스패치`, "WebGPU 즉시 합성"]
      : ["WebGPU 캔버스 텍스처", "CPU 스테이징 Readback (#1)", "WebNN 버퍼 재업로드 (#2)", `WebNN ${target.executionProvider} 디스패치`, "CPU→WebGPU 복사 합성"],
    pipelineHopsEn: zeroCopyActive
      ? ["WebGPU Canvas Texture", `Shared MLTensor (${target.shortLabel} Zero-Copy)`, `WebNN ${target.executionProvider} Dispatch`, "WebGPU Direct Composite"]
      : ["WebGPU Canvas Texture", "CPU Staging Readback (#1)", "WebNN Buffer Upload (#2)", `WebNN ${target.executionProvider} Dispatch`, "CPU-to-WebGPU Composite"],
    statusNoteKo: zeroCopyActive
      ? `모델 분기: Readback 0회 가정 · ${target.executionProvider} 실제 공유 메모리 지원·전송은 미검증입니다.`
      : !zeroCopyRequested
        ? "모델에서 Zero-Copy를 끄고 스테이징 복사 2회를 가정합니다."
        : `${target.nameKo} 예제 프로파일은 스테이징 2회 복사를 가정합니다. 실제 NNAPI·AHardwareBuffer 지원은 확인하지 않았습니다.`,
    statusNoteEn: zeroCopyActive
      ? `Model branch: assumes 0 readbacks; shared memory support and transfer on ${target.executionProvider} are unverified.`
      : !zeroCopyRequested
        ? "The model assumes two staged copies when zero-copy is disabled."
        : `The ${target.nameEn} example assumes two staged copies; actual NNAPI and AHardwareBuffer support are unverified.`,
  };

  // Pass 4: 펜 호버(Hover) 시점 투기적 NPU 워밍업 스케줄
  const coldStartLatencyMs = roundTo(target.baseWarmupMs + workload.baseInferenceUnitsMs * 2.1, 1);
  const hoverLeadWindowMs = workload.hoverWarmupPriority === "critical" ? 120 : workload.hoverWarmupPriority === "high" ? 95 : 70;
  const warmStartLatencyMs = penHoverWarmupEnabled
    ? roundTo(Math.max(0.8, workload.baseInferenceUnitsMs / (target.relativeComputeSpeedFactor * quantMeta.speedBoost)), 2) : coldStartLatencyMs;

  const hoverWarmupPass: PenHoverWarmupPassResult = {
    enabled: penHoverWarmupEnabled, triggerEvent: penHoverWarmupEnabled ? "pointermove-stylus-hover" : "disabled-on-pendown",
    hoverLeadWindowMs, coldStartLatencyMs, warmStartLatencyMs,
    firstStrokeLatencySavedMs: roundTo(Math.max(0, coldStartLatencyMs - warmStartLatencyMs), 1),
    idleSleepTimeoutMs: workload.hoverWarmupPriority === "critical" ? 4500 : 2500,
    phases: [
      { phaseId: "hover-detect", labelKo: "호버 감지", labelEn: "Hover Detect", leadOffsetMs: -hoverLeadWindowMs, durationMs: 4 },
      { phaseId: "context-bind", labelKo: "MLContext 바인딩", labelEn: "Bind Context", leadOffsetMs: -(hoverLeadWindowMs - 6), durationMs: roundTo(target.baseWarmupMs * 0.25, 1) },
      { phaseId: "sram-prefetch", labelKo: "가중치 SRAM 프리페치", labelEn: "SRAM Prefetch", leadOffsetMs: -(hoverLeadWindowMs - 24), durationMs: roundTo(target.baseWarmupMs * 0.45, 1) },
      { phaseId: "kernel-prime", labelKo: "1x 프라임 커널 예열", labelEn: "Prime Kernel", leadOffsetMs: -22, durationMs: roundTo(target.baseWarmupMs * 0.3, 1) },
    ],
  };

  const modeledInferenceMs = roundTo(
    (workload.baseInferenceUnitsMs * (1 - fusionPass.fusionRatioPct * 0.0045) * (1 + paddingOverheadPct * 0.004)) /
      (target.relativeComputeSpeedFactor * quantMeta.speedBoost) + copyOverheadMs,
    2,
  );
  const frameBudgetMs = targetFrameRateHz === 120 ? 8.33 : 16.67;

  const mlContextOptions: WebNnMlContextOptionsSpec = {
    deviceType: thermalOverrideTier >= 4 ? "gpu" : "npu",
    powerPreference: thermalOverrideTier >= 2 ? "low-power" : targetFrameRateHz === 120 ? "high-performance" : "default",
    executionProviderHint: target.executionProvider,
    staticShapePaddingRequired: target.staticShapePaddingRequired,
    mlTensorZeroCopyRequested: zeroCopyRequested, mlTensorZeroCopyActive: zeroCopyActive,
  };

  const irNodes: readonly CompiledIrNode[] = [
    { nodeId: "ir-in", stage: "input-tensor", opLabel: zeroCopyActive ? "plan: shared tensor input" : "StagingCopy.upload(CPU→WebNN)", precision: quantizationPass.effectiveFormat, shape: compiledShape },
    ...fusedBlocks.map((b, i) => ({
      nodeId: `ir-k${i + 1}`, stage: "fused-kernel" as const,
      opLabel: `${b.pattern} [${b.originalOpCount}→${b.fusedOpCount} ops]`, precision: quantizationPass.effectiveFormat, shape: compiledShape,
    })),
    { nodeId: "ir-quant", stage: "quant-adapter", opLabel: `QuantizeGuard(${quantizationPass.effectiveFormatLabel})`, precision: quantizationPass.effectiveFormat, shape: compiledShape },
    { nodeId: "ir-out", stage: "output-tensor", opLabel: zeroCopyActive ? "plan: shared tensor output" : "StagingCopy.readback(WebNN→WebGPU)", precision: quantizationPass.effectiveFormat, shape: compiledShape },
  ];

  return {
    modelKind: WEBNN_NPU_THERMAL_MODEL_KIND, runtimeEvidence: { ...WEBNN_RUNTIME_EVIDENCE }, siliconTarget: target, workload,
    fusionPass, quantizationPass, zeroCopyPass, hoverWarmupPass, mlContextOptions,
    modeledInferenceMs, frameBudgetMs, frameBudgetUtilizationPct: roundTo((modeledInferenceMs / frameBudgetMs) * 100, 1),
    meetsFrameBudget: modeledInferenceMs <= frameBudgetMs, irNodes,
  };
}

function resolveDegradationTier(controlEffort01: number, pressureState: ComputePressureState): DegradationTier {
  const floor: DegradationTier = pressureState === "critical" ? 2 : pressureState === "serious" ? 1 : 0;
  const computed: DegradationTier =
    controlEffort01 >= DEGRADATION_LADDER_SPECS[4].controlThreshold01 ? 4
      : controlEffort01 >= DEGRADATION_LADDER_SPECS[3].controlThreshold01 ? 3
        : controlEffort01 >= DEGRADATION_LADDER_SPECS[2].controlThreshold01 ? 2
          : controlEffort01 >= DEGRADATION_LADDER_SPECS[1].controlThreshold01 ? 1 : 0;
  return computed > floor ? computed : floor;
}

/** 폐루프(Closed-Loop) 이산 시간 PID + Anti-Windup 열 제어 및 4단 그레이스풀 강등 60스텝 시뮬레이터. */
export function simulateThermalPidControlLoop(input: ThermalPidSimulationInput = {}): ThermalPidSimulationResult {
  const target = getSiliconNpuTarget(input.siliconId);
  const workload = getWebtoonAiWorkload(input.workloadId);
  const quantizationMode = pickValid(QUANTIZATION_MODES, input.quantizationMode, "auto");
  const ambientLoadLevel = pickValid(AMBIENT_THERMAL_LEVELS, input.ambientLoadLevel, "normal");
  const batteryMode = pickValid(POWER_SOURCE_MODES, input.batteryMode, "ac-plugged");
  const pressureState = pickValid(COMPUTE_PRESSURE_STATES, input.pressureState, "nominal");
  const zeroCopyRequested = typeof input.zeroCopyMlTensorEnabled === "boolean" ? input.zeroCopyMlTensorEnabled : true;
  const sustainedMinutes = Math.round(clamp(input.sustainedMinutes ?? DEFAULT_SUSTAINED_MINUTES, MIN_SUSTAINED_MINUTES, MAX_SUSTAINED_MINUTES));
  const targetFrameRateHz: TargetFrameRateHz = input.targetFrameRateHz === 60 ? 60 : 120;

  const gains: PidGainParameters = {
    kp: clamp(input.pidGains?.kp ?? target.defaultPidGains.kp, 0.005, 0.25),
    ki: clamp(input.pidGains?.ki ?? target.defaultPidGains.ki, 0.001, 0.1),
    kd: clamp(input.pidGains?.kd ?? target.defaultPidGains.kd, 0, 0.15),
    integralClamp: clamp(input.pidGains?.integralClamp ?? target.defaultPidGains.integralClamp, 5, 60),
  };

  const zeroCopyActive = zeroCopyRequested && target.zeroCopySupported;
  const quantHeatScale = quantizationMode === "int4" ? 0.84 : quantizationMode === "int8" ? 0.92 : quantizationMode === "fp16" ? 1.06 : 0.96;
  const pressureScale = pressureState === "critical" ? 1.36 : pressureState === "serious" ? 1.24 : pressureState === "fair" ? 1.12 : 1.0;
  const batterySetpointDelta = batteryMode === "battery-saver" ? -6 : batteryMode === "battery-balanced" ? -3 : 0;
  const batteryHeatScale = batteryMode === "battery-saver" ? 1.06 : batteryMode === "battery-balanced" ? 1.03 : 1.0;
  const ambientIndex = ambientLoadLevel === "cool" ? 22 : ambientLoadLevel === "warm" ? 38 : 30;
  const setpointThermalIndex = roundTo(clamp(target.thermalSetpointBase + batterySetpointDelta, 54, 78), 1);
  const cliffThresholdIndex = target.thermalCliffThreshold;

  const dtMin = sustainedMinutes / PID_SIMULATION_STEP_COUNT;
  const dtPlant = clamp(0.18 + sustainedMinutes * 0.009, 0.2, 0.72);
  const siliconThermalRatio = (1 + target.gpuPowerCouplingRatio * 0.24) / (0.64 + target.thermalCapacityIndex * 0.45);
  const baseHeatGeneration =
    workload.baseThermalLoad * (targetFrameRateHz === 120 ? 1.18 : 0.88) * quantHeatScale *
    (zeroCopyActive ? 1.0 : 1.15) * pressureScale * batteryHeatScale * siliconThermalRatio;

  let pidTemp = ambientIndex + (pressureState === "critical" ? 14 : pressureState === "serious" ? 8 : 3);
  let rawTemp = pidTemp;
  let integralState = 0;
  let prevError = pidTemp - setpointThermalIndex;
  let uncontrolledCliffLatch = false;
  let peakPidThermalIndex = pidTemp;
  let peakUncontrolledThermalIndex = rawTemp;
  let minPidEffectiveFps: number = targetFrameRateHz;
  let minUncontrolledEffectiveFps: number = targetFrameRateHz;
  let uncontrolledCliffSteps = 0;
  let antiWindupClampCount = 0;
  let maxDegradationTier: DegradationTier = 0;
  const tierFirstEngagedStep: Record<DegradationTier, number | null> = { 0: 1, 1: null, 2: null, 3: null, 4: null };
  const trajectory: ThermalPidStepPoint[] = [];

  for (let step = 1; step <= PID_SIMULATION_STEP_COUNT; step += 1) {
    const errorTerm = pidTemp - setpointThermalIndex;
    const proportionalTerm = gains.kp * errorTerm;
    const derivativeTerm = gains.kd * ((errorTerm - prevError) / Math.max(dtMin, 0.08));
    const candidateIntegral = integralState + errorTerm * Math.max(dtMin, 0.16);
    const unclampedOutput = proportionalTerm + gains.ki * candidateIntegral + derivativeTerm;
    const saturating = (unclampedOutput >= 1 && errorTerm > 0) || (unclampedOutput <= 0 && errorTerm < 0);

    let antiWindupClamped = saturating;
    if (!saturating) {
      const clampedInt = clamp(candidateIntegral, -gains.integralClamp, gains.integralClamp);
      antiWindupClamped = clampedInt !== candidateIntegral;
      integralState = clampedInt;
    }
    if (antiWindupClamped) antiWindupClampCount += 1;

    const approachBias = pidTemp > setpointThermalIndex - 7 ? clamp((pidTemp - (setpointThermalIndex - 7)) / 20, 0, 0.36) : 0;
    const controlEffort01 = clamp(proportionalTerm + gains.ki * integralState + derivativeTerm + approachBias, 0, 1);
    const degradationTier = resolveDegradationTier(controlEffort01, pressureState);
    if (degradationTier > maxDegradationTier) maxDegradationTier = degradationTier;
    if (tierFirstEngagedStep[degradationTier] === null) tierFirstEngagedStep[degradationTier] = step;

    // 1차 이산 열 플랜트(PID 4단 그레이스풀 강등 — 가정 계수의 수렴)
    const pidHeatIn = baseHeatGeneration * DEGRADATION_LADDER_SPECS[degradationTier].heatMultiplier;
    pidTemp = clamp(pidTemp + (pidHeatIn - target.coolingCoeff * (pidTemp - ambientIndex)) * dtPlant, ambientIndex, 100);
    const pidFpsRatio = degradationTier === 0 ? 1.0 : degradationTier === 1 ? 0.96 : degradationTier === 2 ? 0.9 : degradationTier === 3 ? 0.82 : 0.72;
    const pidEffectiveFps = Math.max(targetFrameRateHz === 120 ? 72 : 42, Math.round(targetFrameRateHz * pidFpsRatio));

    // 미제어 기준선(임계 도달 시 서멀 클리프 15fps 추락)
    if (rawTemp >= cliffThresholdIndex) uncontrolledCliffLatch = true;
    else if (rawTemp <= cliffThresholdIndex - 6) uncontrolledCliffLatch = false;
    const rawHeatIn = uncontrolledCliffLatch ? baseHeatGeneration * 0.42 : baseHeatGeneration * 1.12;
    rawTemp = clamp(rawTemp + (rawHeatIn - target.coolingCoeff * 0.88 * (rawTemp - ambientIndex)) * dtPlant, ambientIndex, 100);
    const uncontrolledEffectiveFps = uncontrolledCliffLatch ? 15 : rawTemp > cliffThresholdIndex - 5 ? Math.round(targetFrameRateHz * 0.58) : targetFrameRateHz;
    if (uncontrolledCliffLatch) uncontrolledCliffSteps += 1;

    peakPidThermalIndex = Math.max(peakPidThermalIndex, pidTemp);
    peakUncontrolledThermalIndex = Math.max(peakUncontrolledThermalIndex, rawTemp);
    minPidEffectiveFps = Math.min(minPidEffectiveFps, pidEffectiveFps);
    minUncontrolledEffectiveFps = Math.min(minUncontrolledEffectiveFps, uncontrolledEffectiveFps);

    trajectory.push({
      step, elapsedMinutes: roundTo(step * dtMin, 2),
      pidThermalIndex: roundTo(pidTemp, 2), pidThermalHeadroom01: roundTo(clamp((100 - pidTemp) / 100, 0, 1), 3),
      uncontrolledThermalIndex: roundTo(rawTemp, 2), uncontrolledThermalHeadroom01: roundTo(clamp((100 - rawTemp) / 100, 0, 1), 3),
      setpointThermalIndex, errorTerm: roundTo(errorTerm, 2), proportionalTerm: roundTo(proportionalTerm, 3),
      integralState: roundTo(integralState, 3), derivativeTerm: roundTo(derivativeTerm, 3),
      antiWindupClamped, controlEffort01: roundTo(controlEffort01, 3), degradationTier,
      pidEffectiveFps, uncontrolledEffectiveFps, uncontrolledCliffActive: uncontrolledCliffLatch,
    });
    prevError = errorTerm;
  }

  const lastPoint = trajectory[trajectory.length - 1];
  const tailSlice = trajectory.slice(-10);
  const steadyStateError = roundTo(tailSlice.reduce((acc, p) => acc + Math.abs(p.pidThermalIndex - setpointThermalIndex), 0) / tailSlice.length, 2);

  return {
    modelKind: WEBNN_NPU_THERMAL_MODEL_KIND, measurementBasis: WEBNN_NPU_THERMAL_MEASUREMENT_BASIS,
    siliconId: target.id, workloadId: workload.id, ambientLoadLevel, batteryMode, pressureState,
    sustainedMinutes, targetFrameRateHz, gains, setpointThermalIndex, cliffThresholdIndex,
    stepCount: PID_SIMULATION_STEP_COUNT, trajectory,
    peakPidThermalIndex: roundTo(peakPidThermalIndex, 2), peakUncontrolledThermalIndex: roundTo(peakUncontrolledThermalIndex, 2),
    finalThermalIndex: lastPoint.pidThermalIndex, finalThermalHeadroom01: lastPoint.pidThermalHeadroom01,
    minPidEffectiveFps, minUncontrolledEffectiveFps, uncontrolledCliffSteps,
    pidCliffAvoided: peakPidThermalIndex < cliffThresholdIndex, antiWindupClampCount,
    maxDegradationTier, finalDegradationTier: lastPoint.degradationTier, steadyStateError, tierFirstEngagedStep,
  };
}

/** 그래프 컴파일러와 PID 열 제어 루프를 결합해 계산 예제 계획을 산출한다. */
export function buildWebNnNpuThermalPlan(input: WebNnNpuThermalPlanInput = {}): WebNnNpuThermalPlan {
  const thermalSimulation = simulateThermalPidControlLoop(input);
  const compiledGraph = compileWebNnSiliconGraph({
    siliconId: thermalSimulation.siliconId, workloadId: thermalSimulation.workloadId,
    quantizationMode: input.quantizationMode, zeroCopyMlTensorEnabled: input.zeroCopyMlTensorEnabled,
    penHoverWarmupEnabled: input.penHoverWarmupEnabled, targetFrameRateHz: thermalSimulation.targetFrameRateHz,
    thermalOverrideTier: thermalSimulation.finalDegradationTier,
  });
  return {
    schemaVersion: WEBNN_NPU_THERMAL_SCHEMA_VERSION, modelKind: WEBNN_NPU_THERMAL_MODEL_KIND, runtimeEvidence: { ...WEBNN_RUNTIME_EVIDENCE },
    measurementBasis: WEBNN_NPU_THERMAL_MEASUREMENT_BASIS,
    honestyNoticeKo: "5종 프로파일·융합·양자화 손실·속도·열 계수는 가정값입니다. 고정 산식의 60스텝 상대 열 지수(thermalHeadroom01)와 계획 IR을 계산하며, 실제 WebNN 컨텍스트·NPU 실행·Zero-Copy·양자화·정확도·펜 호버·센서·프레임레이트·온도 측정이나 정책 적용은 하지 않습니다.",
    honestyNoticeEn: "Profiles, fusion, quantization loss, speed, and thermal coefficients are assumptions. Computes a 60-step relative thermal model (thermalHeadroom01) and planning IR. No WebNN context, NPU execution, zero-copy, quantization, accuracy evaluation, pen hover, sensors, frame rates, temperature measurement, or policy application is performed.",
    siliconTarget: compiledGraph.siliconTarget, workload: compiledGraph.workload,
    compiledGraph, thermalSimulation, degradationLadder: structuredClone(DEGRADATION_LADDER_SPECS),
  };
}

/** WebNN MLContextOptions + 그래프 최적화 IR + PID 열 제어 정책 JSON 내보내기. */
export function exportWebNnThermalPlanJson(input: WebNnNpuThermalPlanInput = {}): ExportedWebNnThermalPlan {
  const plan = buildWebNnNpuThermalPlan(input);
  return { plan, json: serializeWebNnPlan(plan) };
}

export interface WebNnHardwareProbeAdapterSummary {
  readonly npuContextReady: boolean; readonly webnnDeviceType: StudioWebNnDeviceType;
  readonly webgpuFallbackReady: boolean; readonly shaderF16Ready: boolean; readonly subgroupsReady: boolean;
  readonly wasmSimdTier: StudioWasmSimdTier; readonly wasmThreads: number;
  readonly executionTier: StudioHardwareExecutionTier;
  readonly recommendedExecutionProviders: readonly StudioOnnxHardwareEpOption[];
  readonly suggestedThermalFallbackTier: DegradationTier;
}

/** 별도 프로브된 실기기 하드웨어 리포트를 WebNN NPU 가용성 및 열 강등 바닥 단계로 요약한다. */
export function summarizeWebNnHardwareAvailability(
  probe: StudioHardwareAccelerationReport,
): WebNnHardwareProbeAdapterSummary {
  return Object.freeze({
    npuContextReady: probe.webnn.npuAvailable, webnnDeviceType: probe.webnn.deviceType,
    webgpuFallbackReady: probe.webgpu.available, shaderF16Ready: probe.webgpu.shaderF16,
    subgroupsReady: probe.webgpu.subgroups, wasmSimdTier: probe.wasm.simdTier,
    wasmThreads: probe.wasm.wasmThreadCount, executionTier: probe.executionTier,
    recommendedExecutionProviders: probe.onnxExecutionProviders,
    suggestedThermalFallbackTier: probe.webnn.npuAvailable ? 0 : 4,
  });
}
