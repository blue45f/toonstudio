/**
 * Wave 61C — ToonSilicon 8대 모던 CPU·GPU·NPU·Google Tensor TPU
 * 전방위 네이티브 WASM64 최적화 오케스트레이터 엔진.
 *
 * - 현재 구현(Current): 8대 모던 실리콘 프로파일(Android 4종 + Desktop/Apple 4종)의
 *   하드웨어 역량 정의, 브라우저 샌드박스 표준 API vs 데스크톱·모바일 네이티브 FFI 브리지
 *   경계 분리, 6대 ToonStudio 워크로드(ToonCore · SpectrumCompute · ToonSilicon)의
 *   CPU/GPU/NPU·TPU 3유닛 동시 배정표 산출 및 JSON 매니페스트 직렬화.
 * - 정직성 원칙: 허위 TOPS·허위 실측 FPS·온도 수치를 생성하지 않으며,
 *   브라우저 탭에서 CUDA/Metal/ROCm/NNAPI 직접 호출이 불가함을 명시한다.
 */

import type {
  StudioHardwareAccelerationReport,
  StudioHardwareExecutionTier,
  StudioOnnxHardwareEpOption,
  StudioWasmSimdTier,
  StudioWebNnDeviceType,
} from "./studio-hardware-accelerator-probe";

export const TOON_SILICON_SCHEMA_VERSION = "toonstudio.toon-silicon-dispatch.v1" as const;
export const TOON_SILICON_MODEL_KIND = "silicon-capability-and-dispatch-architecture" as const;
export const TOON_SILICON_MEASUREMENT_BASIS = "architecture-capability-dispatch-spec" as const;
export const TOON_SILICON_BRAND_STACK = "ToonSilicon · ToonCore · SpectrumCompute" as const;

export const EXECUTION_ENVIRONMENTS = ["browser-web-standard", "desktop-native-bridge", "mobile-pwa-android-ios"] as const;
export const MEMORY_ADDRESS_MODES = ["wasm64-memory64", "wasm32-simd-safe"] as const;
export const MODERN_SILICON_IDS = [
  "google-tensor-tpu",
  "qualcomm-snapdragon-hexagon",
  "mediatek-dimensity-apu",
  "samsung-exynos-xclipse",
  "apple-silicon-ane",
  "intel-core-ultra-xe2",
  "amd-ryzen-ai-xdna2",
  "nvidia-rtx-grace",
] as const;
export const TOONSTUDIO_WORKLOAD_IDS = [
  "brush-physics-2d",
  "character-skinning-culling-3d",
  "virtual-studio-physics-audio",
  "lineart-color-ai",
  "depth-estimation-25d",
  "local-encoding-4k",
] as const;

export type ExecutionEnvironmentMode = (typeof EXECUTION_ENVIRONMENTS)[number];
export type MemoryAddressMode = (typeof MEMORY_ADDRESS_MODES)[number];
export type ModernSiliconId = (typeof MODERN_SILICON_IDS)[number];
export type ToonStudioWorkloadId = (typeof TOONSTUDIO_WORKLOAD_IDS)[number];
export type SiliconPlatformGroup = "android-mobile" | "desktop-apple";
export type ComputeUnitKind = "cpu" | "gpu" | "npu-tpu";
export type EngineSubsystemBrand = "ToonCore" | "SpectrumCompute" | "ToonSilicon";
export type CpuSchedulingPolicy =
  | "big-mid-little-pinned"
  | "oryon-prime-work-stealing"
  | "all-big-work-stealing"
  | "p-core-e-core-hybrid"
  | "symmetric-work-stealing";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }

export interface SiliconCpuProfile {
  readonly architectureLabel: string; readonly clusterTopologyKo: string; readonly clusterTopologyEn: string;
  readonly schedulingPolicy: CpuSchedulingPolicy;
  readonly browserPerformanceWorkers: number; readonly browserEfficiencyWorkers: number;
  readonly nativePerformanceWorkers: number; readonly nativeEfficiencyWorkers: number;
  readonly nativeSimdWidthBits: 128 | 256 | 512; readonly relaxedSimdSupported: boolean;
}

export interface SiliconGpuProfile {
  readonly gpuFamilyLabel: string; readonly graphicsBackend: string; readonly subgroupSize: 16 | 32 | 64;
  readonly f16ShaderSupported: boolean; readonly baseAtlasBudgetMb: number; readonly unifiedMemoryZeroCopy: boolean;
}

export interface SiliconNpuTpuProfile {
  readonly acceleratorLabel: string; readonly browserDelegate: string; readonly nativeDelegate: string;
  readonly precisionLabel: string; readonly staticShapeCompileRequired: boolean;
  readonly staticTensorPaddingAlign: 16 | 32 | 64; readonly systolicOrTileLayout: string;
  readonly zeroCopyMlTensorSupported: boolean; readonly aiDispatchBoostPct: number;
}

export interface ModernSiliconProfile {
  readonly id: ModernSiliconId; readonly order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; readonly platformGroup: SiliconPlatformGroup;
  readonly nameKo: string; readonly nameEn: string; readonly shortLabel: string; readonly platformLabel: string;
  readonly taglineKo: string; readonly taglineEn: string;
  readonly cpu: SiliconCpuProfile; readonly gpu: SiliconGpuProfile; readonly npuTpu: SiliconNpuTpuProfile;
  readonly accentOklch: OklchColor;
}

export interface ToonStudioWorkloadProfile {
  readonly id: ToonStudioWorkloadId; readonly order: 1 | 2 | 3 | 4 | 5 | 6; readonly subsystem: EngineSubsystemBrand;
  readonly nameKo: string; readonly nameEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly isAiTensorWorkload: boolean;
  readonly baseShares: { readonly cpu: number; readonly gpu: number; readonly npuTpu: number };
  readonly logicalTensorShape: readonly [number, number, number, number];
  readonly kernelFocusKo: string; readonly kernelFocusEn: string;
  readonly fallbackNoteKo: string; readonly fallbackNoteEn: string; readonly accentOklch: OklchColor;
}

export interface RuntimeBoundaryReport {
  readonly environment: ExecutionEnvironmentMode; readonly memoryMode: MemoryAddressMode;
  readonly sandboxedBrowserTab: boolean; readonly directNativeDriverBlocked: boolean;
  readonly blockedDirectApis: readonly string[]; readonly activeStandardLayers: readonly string[];
  readonly nativeFfiBridgeLayers: readonly string[];
  readonly plannedStandardLayers: readonly string[]; readonly plannedNativeFfiBridgeLayers: readonly string[];
  readonly plannedDirectNativeDriverBlocked: boolean;
  readonly boundarySummaryKo: string; readonly boundarySummaryEn: string;
  readonly extensionPathKo: string; readonly extensionPathEn: string;
}

export interface CpuDispatchAllocation {
  readonly architectureLabel: string; readonly clusterTopologyKo: string; readonly clusterTopologyEn: string;
  readonly schedulingPolicy: CpuSchedulingPolicy;
  readonly performanceWorkers: number; readonly efficiencyWorkers: number; readonly totalWorkers: number;
  readonly simdWidthBits: 128 | 256 | 512; readonly relaxedSimdEnabled: boolean; readonly sharedArrayBufferThreads: boolean;
  readonly plannedMemory64: boolean; readonly plannedRelaxedSimd: boolean; readonly plannedSharedArrayBufferThreads: boolean;
  readonly memory64Active: boolean; readonly addressSpaceBits: 32 | 64; readonly linearAddressCeilingLabel: string;
  readonly tileSwapStrategyKo: string; readonly tileSwapStrategyEn: string; readonly loadSharePct: number;
}

export interface GpuDispatchAllocation {
  readonly gpuFamilyLabel: string; readonly graphicsBackend: string; readonly subgroupSize: 16 | 32 | 64;
  readonly plannedF16Shader: boolean; readonly plannedUnifiedMemoryZeroCopy: boolean;
  readonly f16ShaderEnabled: boolean; readonly atlasBudgetMb: number; readonly unifiedMemoryZeroCopy: boolean;
  readonly loadSharePct: number;
}

export interface NpuTpuDispatchAllocation {
  readonly acceleratorLabel: string; readonly delegateLayer: string; readonly precisionMode: string;
  readonly staticShapeCompileRequired: boolean; readonly staticTensorPaddingAlign: 16 | 32 | 64;
  readonly paddedFocusShape: readonly [number, number, number, number]; readonly systolicOrTileLayout: string;
  readonly plannedZeroCopyMlTensor: boolean; readonly plannedCpuStagingReadbacks: 0 | 2;
  readonly zeroCopyMlTensorActive: boolean; readonly cpuStagingReadbacks: 0 | 2; readonly loadSharePct: number;
}

export interface WorkloadDispatchRoute {
  readonly workloadId: ToonStudioWorkloadId; readonly order: 1 | 2 | 3 | 4 | 5 | 6; readonly subsystem: EngineSubsystemBrand;
  readonly nameKo: string; readonly nameEn: string;
  readonly primaryUnit: ComputeUnitKind; readonly secondaryUnit: ComputeUnitKind;
  readonly cpuSharePct: number; readonly gpuSharePct: number; readonly npuTpuSharePct: number;
  readonly memoryPathLabel: string; readonly staticTensorShapeLabel: string;
  readonly kernelStrategyKo: string; readonly kernelStrategyEn: string;
  readonly fallbackPathKo: string; readonly fallbackPathEn: string;
}

export interface ToonSiliconDispatchInput {
  readonly siliconId?: ModernSiliconId;
  readonly environment?: ExecutionEnvironmentMode;
  readonly memoryMode?: MemoryAddressMode;
  readonly focusWorkloadId?: ToonStudioWorkloadId;
}

export interface ToonSiliconFullPowerPlan {
  readonly schemaVersion: typeof TOON_SILICON_SCHEMA_VERSION;
  readonly modelKind: typeof TOON_SILICON_MODEL_KIND;
  readonly measurementBasis: typeof TOON_SILICON_MEASUREMENT_BASIS;
  readonly brandStack: typeof TOON_SILICON_BRAND_STACK;
  readonly siliconId: ModernSiliconId;
  readonly siliconProfile: ModernSiliconProfile;
  readonly environment: ExecutionEnvironmentMode;
  readonly memoryMode: MemoryAddressMode;
  readonly focusWorkloadId: ToonStudioWorkloadId;
  readonly runtimeBoundary: RuntimeBoundaryReport;
  readonly computeUnits: {
    readonly cpu: CpuDispatchAllocation;
    readonly gpu: GpuDispatchAllocation;
    readonly npuTpu: NpuTpuDispatchAllocation;
  };
  readonly workloadRoutes: readonly WorkloadDispatchRoute[];
  readonly activeWorkloadRoute: WorkloadDispatchRoute;
  readonly runtimeState: {
    readonly hardwareProbed: false; readonly gpuExecuted: false; readonly nativeBridgeExecuted: false;
    readonly workersStarted: false; readonly persisted: false;
  };
  readonly honestyNoticeKo: string;
  readonly honestyNoticeEn: string;
}

export interface ExportedToonSiliconPlan {
  readonly plan: ToonSiliconFullPowerPlan;
  readonly json: string;
}

export const DEFAULT_MODERN_SILICON_ID: ModernSiliconId = "google-tensor-tpu";
export const DEFAULT_EXECUTION_ENVIRONMENT: ExecutionEnvironmentMode = "browser-web-standard";
export const DEFAULT_MEMORY_ADDRESS_MODE: MemoryAddressMode = "wasm64-memory64";
export const DEFAULT_FOCUS_WORKLOAD_ID: ToonStudioWorkloadId = "lineart-color-ai";

const VIOLET_HUE_MIN = 270;
const VIOLET_HUE_MAX = 320;
const SAFE_FALLBACK_HUE = 228;

/** 270~320도 바이올렛 계열 휴 여부를 판별한다. */
export function isVioletSlopHue(hue: number): boolean {
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_HUE_MIN && normalized <= VIOLET_HUE_MAX;
}

/** 바이올렛 구간 휴를 비-바이올렛 코발트 계열로 보정한다. */
export function sanitizeNonVioletHue(hue: number): number {
  const normalized = ((hue % 360) + 360) % 360;
  return isVioletSlopHue(normalized) ? SAFE_FALLBACK_HUE : normalized;
}

/** 원시 색상 문자열 없이 안전한 시맨틱 OKLCH 문자열을 생성한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = Math.max(0, Math.min(1, color.l));
  const c = Math.max(0, Math.min(0.32, color.c));
  const h = sanitizeNonVioletHue(color.h);
  if (typeof alpha === "number") {
    return `oklch(${l} ${c} ${h} / ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export const MODERN_SILICON_PROFILES: readonly ModernSiliconProfile[] = [
  {
    id: "google-tensor-tpu", order: 1, platformGroup: "android-mobile",
    nameKo: "Google Tensor G3·G4·G5 (Edge TPU)", nameEn: "Google Tensor G3/G4/G5 (Edge TPU)",
    shortLabel: "Google Tensor TPU", platformLabel: "Android Pixel",
    taglineKo: "Edge TPU Systolic Array 정적 Shape 컴파일 · ARMv9 NEON/SVE2 빅·미들·리틀 · Vulkan WebGPU",
    taglineEn: "Edge TPU Systolic Array static-shape compile · ARMv9 NEON/SVE2 Big/Mid/Little · Vulkan WebGPU",
    cpu: {
      architectureLabel: "ARMv9 NEON / SVE2", clusterTopologyKo: "빅·미들·리틀 클러스터 (1+3+4 / 1+4+4)",
      clusterTopologyEn: "Big/Mid/Little Cluster (1+3+4 / 1+4+4)", schedulingPolicy: "big-mid-little-pinned",
      browserPerformanceWorkers: 4, browserEfficiencyWorkers: 2, nativePerformanceWorkers: 5, nativeEfficiencyWorkers: 3,
      nativeSimdWidthBits: 256, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Pixel WebGPU Vulkan", graphicsBackend: "Vulkan", subgroupSize: 16, f16ShaderSupported: true, baseAtlasBudgetMb: 768, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "Edge TPU Systolic Array", browserDelegate: "WebNN / LiteRT-Web TPU Delegate",
      nativeDelegate: "Android NNAPI / LiteRT C++ TPU Delegate", precisionLabel: "INT8 / BF16",
      staticShapeCompileRequired: true, staticTensorPaddingAlign: 64,
      systolicOrTileLayout: "Edge TPU Systolic Array (64-align static shape)", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 8,
    },
    accentOklch: { l: 0.54, c: 0.13, h: 185 },
  },
  {
    id: "qualcomm-snapdragon-hexagon", order: 2, platformGroup: "android-mobile",
    nameKo: "Qualcomm Snapdragon 8 Elite · X Elite", nameEn: "Qualcomm Snapdragon 8 Elite / X Elite",
    shortLabel: "Snapdragon Hexagon", platformLabel: "Android / Windows ARM64",
    taglineKo: "Hexagon HTP NPU W4A8/INT8 · Adreno WebGPU Subgroups · Oryon ARM64 SIMD128",
    taglineEn: "Hexagon HTP NPU W4A8/INT8 · Adreno WebGPU Subgroups · Oryon ARM64 SIMD128",
    cpu: {
      architectureLabel: "Oryon ARM64 SIMD128", clusterTopologyKo: "Oryon 프라임·퍼포먼스 다중 코어",
      clusterTopologyEn: "Oryon Prime & Performance Cores", schedulingPolicy: "oryon-prime-work-stealing",
      browserPerformanceWorkers: 6, browserEfficiencyWorkers: 2, nativePerformanceWorkers: 8, nativeEfficiencyWorkers: 4,
      nativeSimdWidthBits: 128, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Adreno WebGPU Subgroups", graphicsBackend: "Vulkan / DX12", subgroupSize: 64, f16ShaderSupported: true, baseAtlasBudgetMb: 1024, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "Hexagon HTP NPU", browserDelegate: "WebNN QNN / LiteRT-Web Delegate",
      nativeDelegate: "QNN HTP / DirectML / Android NNAPI", precisionLabel: "W4A8 / INT8",
      staticShapeCompileRequired: true, staticTensorPaddingAlign: 32,
      systolicOrTileLayout: "Hexagon HVX + HMX Matrix (32-align)", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 6,
    },
    accentOklch: { l: 0.56, c: 0.14, h: 38 },
  },
  {
    id: "mediatek-dimensity-apu", order: 3, platformGroup: "android-mobile",
    nameKo: "MediaTek Dimensity 9300 · 9400", nameEn: "MediaTek Dimensity 9300 / 9400",
    shortLabel: "Dimensity APU", platformLabel: "Android Flagship",
    taglineKo: "MediaTek APU NeuroPilot NPU · Immortalis GPU · All-Big-Core 8코어 WASM Work-Stealing",
    taglineEn: "MediaTek APU NeuroPilot NPU · Immortalis GPU · All-Big-Core 8-Core WASM Work-Stealing",
    cpu: {
      architectureLabel: "ARMv9 All-Big-Core 8코어", clusterTopologyKo: "All-Big-Core 8코어 WASM Work-Stealing",
      clusterTopologyEn: "All-Big-Core 8-Core WASM Work-Stealing", schedulingPolicy: "all-big-work-stealing",
      browserPerformanceWorkers: 6, browserEfficiencyWorkers: 0, nativePerformanceWorkers: 8, nativeEfficiencyWorkers: 0,
      nativeSimdWidthBits: 128, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Immortalis WebGPU", graphicsBackend: "Vulkan", subgroupSize: 16, f16ShaderSupported: true, baseAtlasBudgetMb: 768, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "MediaTek APU NeuroPilot NPU", browserDelegate: "WebNN / LiteRT-Web NeuroPilot Delegate",
      nativeDelegate: "Android NNAPI / NeuroPilot Native Bridge", precisionLabel: "INT8 / INT4 / FP16",
      staticShapeCompileRequired: true, staticTensorPaddingAlign: 32,
      systolicOrTileLayout: "APU NeuroPilot Hardware Compression Tile (32-align)", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 5,
    },
    accentOklch: { l: 0.58, c: 0.14, h: 72 },
  },
  {
    id: "samsung-exynos-xclipse", order: 4, platformGroup: "android-mobile",
    nameKo: "Samsung Galaxy Exynos 2400 · 2500", nameEn: "Samsung Galaxy Exynos 2400 / 2500",
    shortLabel: "Exynos Xclipse", platformLabel: "Android Galaxy",
    taglineKo: "Exynos NPU · Xclipse RDNA WebGPU Wave32 · ARMv9 SIMD128 데카코어",
    taglineEn: "Exynos NPU · Xclipse RDNA WebGPU Wave32 · ARMv9 SIMD128 Deca-Core",
    cpu: {
      architectureLabel: "ARMv9 SIMD128", clusterTopologyKo: "데카코어 빅·미들·리틀 클러스터",
      clusterTopologyEn: "Deca-Core Big/Mid/Little Cluster", schedulingPolicy: "big-mid-little-pinned",
      browserPerformanceWorkers: 4, browserEfficiencyWorkers: 3, nativePerformanceWorkers: 6, nativeEfficiencyWorkers: 4,
      nativeSimdWidthBits: 128, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Xclipse RDNA WebGPU Wave32", graphicsBackend: "Vulkan", subgroupSize: 32, f16ShaderSupported: true, baseAtlasBudgetMb: 768, unifiedMemoryZeroCopy: false },
    npuTpu: {
      acceleratorLabel: "Exynos NPU", browserDelegate: "WebNN / LiteRT-Web Exynos Delegate",
      nativeDelegate: "Android NNAPI / Exynos ENN Native Bridge", precisionLabel: "INT8 / FP16",
      staticShapeCompileRequired: true, staticTensorPaddingAlign: 32,
      systolicOrTileLayout: "Exynos MAC Array (32-align static tensor)", zeroCopyMlTensorSupported: false, aiDispatchBoostPct: 2,
    },
    accentOklch: { l: 0.54, c: 0.13, h: 228 },
  },
  {
    id: "apple-silicon-ane", order: 5, platformGroup: "desktop-apple",
    nameKo: "Apple Silicon M1~M4 · A17~A18 Pro", nameEn: "Apple Silicon M1–M4 / A17–A18 Pro",
    shortLabel: "Apple Silicon ANE", platformLabel: "macOS / iPadOS / iOS",
    taglineKo: "Apple Neural Engine CoreML FP16/4-bit Palettized · Metal WebGPU UMA Zero-Copy · AMX/NEON",
    taglineEn: "Apple Neural Engine CoreML FP16/4-bit Palettized · Metal WebGPU UMA Zero-Copy · AMX/NEON",
    cpu: {
      architectureLabel: "Apple ARM64 AMX / NEON", clusterTopologyKo: "P-Core · E-Core 통합 메모리 스레드 풀",
      clusterTopologyEn: "P-Core / E-Core Unified Memory Thread Pool", schedulingPolicy: "p-core-e-core-hybrid",
      browserPerformanceWorkers: 6, browserEfficiencyWorkers: 2, nativePerformanceWorkers: 10, nativeEfficiencyWorkers: 4,
      nativeSimdWidthBits: 256, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Metal WebGPU Unified Memory", graphicsBackend: "Metal", subgroupSize: 32, f16ShaderSupported: true, baseAtlasBudgetMb: 2048, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "Apple Neural Engine (ANE)", browserDelegate: "WebNN CoreML EP",
      nativeDelegate: "CoreML / Metal MPSGraph Native Bridge", precisionLabel: "FP16 / 4-bit Palettized",
      staticShapeCompileRequired: false, staticTensorPaddingAlign: 16,
      systolicOrTileLayout: "ANE Matrix Engine (UMA Zero-Copy MLTensor)", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 7,
    },
    accentOklch: { l: 0.52, c: 0.13, h: 152 },
  },
  {
    id: "intel-core-ultra-xe2", order: 6, platformGroup: "desktop-apple",
    nameKo: "Intel Core Ultra (Arc Xe2 · NPU)", nameEn: "Intel Core Ultra (Arc Xe2 / NPU)",
    shortLabel: "Intel Core Ultra", platformLabel: "Windows / Linux",
    taglineKo: "OpenVINO/DirectML NPU · Arc Xe2 WebGPU f16 · P-Core/E-Core 하이브리드 · AVX-VNNI/Relaxed-SIMD",
    taglineEn: "OpenVINO/DirectML NPU · Arc Xe2 WebGPU f16 · P/E-Core hybrid · AVX-VNNI/Relaxed-SIMD",
    cpu: {
      architectureLabel: "AVX-VNNI / WASM Relaxed-SIMD", clusterTopologyKo: "P-Core · E-Core 하이브리드 스레드 스케줄링",
      clusterTopologyEn: "P-Core / E-Core Hybrid Thread Scheduling", schedulingPolicy: "p-core-e-core-hybrid",
      browserPerformanceWorkers: 6, browserEfficiencyWorkers: 4, nativePerformanceWorkers: 8, nativeEfficiencyWorkers: 8,
      nativeSimdWidthBits: 256, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Arc Xe2 WebGPU f16", graphicsBackend: "DX12 / Vulkan", subgroupSize: 16, f16ShaderSupported: true, baseAtlasBudgetMb: 1536, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "Intel NPU (OpenVINO / DirectML)", browserDelegate: "WebNN OpenVINO / DirectML EP",
      nativeDelegate: "OpenVINO / DirectML Native FFI Bridge", precisionLabel: "INT8 / FP16",
      staticShapeCompileRequired: true, staticTensorPaddingAlign: 64,
      systolicOrTileLayout: "Intel NPU Compute Tiles (64-align static shape)", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 5,
    },
    accentOklch: { l: 0.54, c: 0.13, h: 214 },
  },
  {
    id: "amd-ryzen-ai-xdna2", order: 7, platformGroup: "desktop-apple",
    nameKo: "AMD Ryzen AI (XDNA2 · RDNA 3.5)", nameEn: "AMD Ryzen AI (XDNA2 / RDNA 3.5)",
    shortLabel: "AMD Ryzen AI XDNA2", platformLabel: "Windows / Linux",
    taglineKo: "XDNA2 NPU 4×8 공간 타일 Block-FP16/INT4 · RDNA 3.5 WebGPU · Zen5 AVX-512/WASM64",
    taglineEn: "XDNA2 NPU 4×8 spatial tiles Block-FP16/INT4 · RDNA 3.5 WebGPU · Zen5 AVX-512/WASM64",
    cpu: {
      architectureLabel: "Zen5 AVX-512 / WASM64", clusterTopologyKo: "Zen5 대칭 멀티스레드 + WASM64",
      clusterTopologyEn: "Zen5 Symmetric Multithread + WASM64", schedulingPolicy: "symmetric-work-stealing",
      browserPerformanceWorkers: 8, browserEfficiencyWorkers: 0, nativePerformanceWorkers: 12, nativeEfficiencyWorkers: 0,
      nativeSimdWidthBits: 512, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "RDNA 3.5 WebGPU Wave32", graphicsBackend: "DX12 / Vulkan", subgroupSize: 32, f16ShaderSupported: true, baseAtlasBudgetMb: 1792, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "XDNA2 NPU (4×8 공간 타일)", browserDelegate: "WebNN DirectML / XDNA2 EP",
      nativeDelegate: "Ryzen AI XRT / DirectML Native Bridge", precisionLabel: "Block-FP16 / INT4",
      staticShapeCompileRequired: true, staticTensorPaddingAlign: 32,
      systolicOrTileLayout: "XDNA2 4×8 Spatial AIE Tiles (32 tiles)", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 8,
    },
    accentOklch: { l: 0.56, c: 0.16, h: 28 },
  },
  {
    id: "nvidia-rtx-grace", order: 8, platformGroup: "desktop-apple",
    nameKo: "NVIDIA RTX 40·50 + Grace CPU", nameEn: "NVIDIA RTX 40/50 + Grace CPU",
    shortLabel: "NVIDIA RTX / Grace", platformLabel: "Windows / Linux / ARM",
    taglineKo: "Tensor Cores FP16/INT4 DirectML·Vulkan WebNN · Warp-32 WebGPU Subgroups · 대용량 VRAM 아틀라스",
    taglineEn: "Tensor Cores FP16/INT4 DirectML/Vulkan WebNN · Warp-32 WebGPU Subgroups · High-VRAM Atlas",
    cpu: {
      architectureLabel: "x86-64 / Grace ARMv9 WASM64", clusterTopologyKo: "멀티코어 호스트 + WASM64 선형 힙",
      clusterTopologyEn: "Multicore Host + WASM64 Linear Heap", schedulingPolicy: "symmetric-work-stealing",
      browserPerformanceWorkers: 8, browserEfficiencyWorkers: 0, nativePerformanceWorkers: 16, nativeEfficiencyWorkers: 0,
      nativeSimdWidthBits: 256, relaxedSimdSupported: true,
    },
    gpu: { gpuFamilyLabel: "Warp-32 WebGPU Subgroups", graphicsBackend: "DX12 / Vulkan", subgroupSize: 32, f16ShaderSupported: true, baseAtlasBudgetMb: 4096, unifiedMemoryZeroCopy: true },
    npuTpu: {
      acceleratorLabel: "NVIDIA Tensor Cores", browserDelegate: "WebNN DirectML / Vulkan Tensor Delegate",
      nativeDelegate: "DirectML / Vulkan Cooperative Matrix Native FFI", precisionLabel: "FP16 / INT4",
      staticShapeCompileRequired: false, staticTensorPaddingAlign: 16,
      systolicOrTileLayout: "Warp-32 Tensor Cores + Dedicated VRAM Atlas", zeroCopyMlTensorSupported: true, aiDispatchBoostPct: 7,
    },
    accentOklch: { l: 0.52, c: 0.14, h: 142 },
  },
];

export const TOONSTUDIO_COMPUTE_WORKLOADS: readonly ToonStudioWorkloadProfile[] = [
  {
    id: "brush-physics-2d", order: 1, subsystem: "ToonCore", nameKo: "2D 브러시 물리", nameEn: "2D Brush Physics",
    summaryKo: "필압·기울기 스탬프 보간, 타일 혼색, 실시간 언두 델타 압축",
    summaryEn: "Pressure/tilt stamp physics, tile pigment mixing, and live delta history",
    isAiTensorWorkload: false, baseShares: { cpu: 46, gpu: 44, npuTpu: 10 }, logicalTensorShape: [1, 4, 512, 512],
    kernelFocusKo: "ToonCore SIMD 필압 보간 + WebGPU 타일 합성 + NPU 궤적 손떨림 보정",
    kernelFocusEn: "ToonCore SIMD stroke physics + WebGPU tile composite + NPU jitter denoise",
    fallbackNoteKo: "WebGPU 미지원 시 WASM SIMD 타일 래스터로 무중단 폴백",
    fallbackNoteEn: "Falls back cleanly to WASM SIMD tile rasterization if WebGPU is unavailable",
    accentOklch: { l: 0.54, c: 0.13, h: 185 },
  },
  {
    id: "character-skinning-culling-3d", order: 2, subsystem: "SpectrumCompute", nameKo: "3D 캐릭터 스키닝·컬링", nameEn: "3D Character Skinning & Culling",
    summaryKo: "듀얼 쿼터니언 본 스키닝, 프러스텀·오클루전 컬링, 툰 셰이더 윤곽선",
    summaryEn: "Dual-quaternion bone skinning, frustum/occlusion culling, and toon outlines",
    isAiTensorWorkload: false, baseShares: { cpu: 28, gpu: 64, npuTpu: 8 }, logicalTensorShape: [1, 16, 256, 256],
    kernelFocusKo: "SpectrumCompute Subgroup 병렬 스키닝·컬링 + WASM64 본 계층 갱신",
    kernelFocusEn: "SpectrumCompute subgroup skinning/culling + WASM64 bone hierarchy update",
    fallbackNoteKo: "Subgroup 미지원 시 표준 Compute Workgroup 경로로 자동 강등",
    fallbackNoteEn: "Degrades to standard WebGPU compute workgroups without subgroup ops",
    accentOklch: { l: 0.54, c: 0.13, h: 228 },
  },
  {
    id: "virtual-studio-physics-audio", order: 3, subsystem: "SpectrumCompute", nameKo: "가상 작업실 물리·음향", nameEn: "Virtual Studio Physics & Audio",
    summaryKo: "실시간 천·소품 제약 물리, 충돌 브로드페이즈, 공간 오디오 바이노럴 DSP",
    summaryEn: "Cloth/prop constraint solver, broadphase collision, and spatial binaural DSP",
    isAiTensorWorkload: false, baseShares: { cpu: 58, gpu: 32, npuTpu: 10 }, logicalTensorShape: [1, 8, 256, 256],
    kernelFocusKo: "SharedArrayBuffer Work-Stealing 물리·음향 워커 + WebGPU 파티클·조명",
    kernelFocusEn: "SharedArrayBuffer work-stealing physics/DSP workers + WebGPU lighting",
    fallbackNoteKo: "COOP/COEP 미적용 탭에서는 단일 워커 타임슬라이스 스케줄로 전환",
    fallbackNoteEn: "Switches to single-worker time-sliced stepping if SharedArrayBuffer is unavailable",
    accentOklch: { l: 0.56, c: 0.14, h: 72 },
  },
  {
    id: "lineart-color-ai", order: 4, subsystem: "ToonSilicon", nameKo: "선화·채색 AI", nameEn: "Lineart & Flat-Color AI",
    summaryKo: "러프 선화 클린업, 영역 폐곡선 분할, 밑색 자동 채움 정적 텐서 추론",
    summaryEn: "Rough lineart cleanup, closed-region segmentation, and flat-color inference",
    isAiTensorWorkload: true, baseShares: { cpu: 14, gpu: 28, npuTpu: 58 }, logicalTensorShape: [1, 4, 720, 1280],
    kernelFocusKo: "ToonSilicon 정적 Shape NPU/TPU 추론 + WebGPU Shared MLTensor 합성",
    kernelFocusEn: "ToonSilicon static-shape NPU/TPU inference + WebGPU Shared MLTensor blend",
    fallbackNoteKo: "WebNN 미지원 시 WebGPU f16 Compute Shader 추론으로 폴백",
    fallbackNoteEn: "Falls back to WebGPU f16 compute shader inference when WebNN is unavailable",
    accentOklch: { l: 0.52, c: 0.14, h: 152 },
  },
  {
    id: "depth-estimation-25d", order: 5, subsystem: "ToonSilicon", nameKo: "2.5D 깊이 추정", nameEn: "2.5D Depth Estimation",
    summaryKo: "단일 컷 깊이·법선 추정 및 실시간 역광·그림자 리라이팅",
    summaryEn: "Single-panel depth/normal estimation and interactive rim-light relighting",
    isAiTensorWorkload: true, baseShares: { cpu: 12, gpu: 34, npuTpu: 54 }, logicalTensorShape: [1, 3, 518, 518],
    kernelFocusKo: "NPU/Edge TPU 타일 정렬 깊이 추론 + WebGPU f16 법선·조명 셰이더",
    kernelFocusEn: "Aligned NPU/Edge TPU depth inference + WebGPU f16 normal/relight shader",
    fallbackNoteKo: "NPU 미지원 시 반해상도 WebGPU Compute + 양방향 업샘플링 적용",
    fallbackNoteEn: "Uses half-res WebGPU compute + bilateral upsample without NPU delegate",
    accentOklch: { l: 0.56, c: 0.14, h: 38 },
  },
  {
    id: "local-encoding-4k", order: 6, subsystem: "ToonCore", nameKo: "4K 로컬 인코딩", nameEn: "4K Local Encoding",
    summaryKo: "4K 컷툰·애니메틱 프레임 합성, 색공간 변환, 로컬 컨테이너 패킹",
    summaryEn: "4K frame compositing, color-space conversion, and local container muxing",
    isAiTensorWorkload: false, baseShares: { cpu: 34, gpu: 54, npuTpu: 12 }, logicalTensorShape: [1, 4, 2160, 3840],
    kernelFocusKo: "WASM64 대용량 링버퍼 먹싱 + WebGPU YUV 변환 + 하드웨어 미디어 인코더",
    kernelFocusEn: "WASM64 large ring-buffer muxing + WebGPU YUV pass + hardware media encoder",
    fallbackNoteKo: "WASM32 안전 모드에서는 청크 스트리밍으로 4 GiB 선형 메모리 상한 준수",
    fallbackNoteEn: "Uses chunked streaming under WASM32 safe mode to respect the 4 GiB ceiling",
    accentOklch: { l: 0.54, c: 0.13, h: 214 },
  },
];

/** ID로 8대 실리콘 프로파일을 조회하며 미등록 ID는 Google Tensor TPU로 안전 폴백한다. */
export function getModernSiliconProfile(siliconId?: ModernSiliconId): ModernSiliconProfile {
  return MODERN_SILICON_PROFILES.find((item) => item.id === siliconId) ?? MODERN_SILICON_PROFILES[0];
}

/** ID로 6대 ToonStudio 워크로드를 조회하며 미등록 ID는 선화·채색 AI로 안전 폴백한다. */
export function getToonStudioWorkload(workloadId?: ToonStudioWorkloadId): ToonStudioWorkloadProfile {
  return TOONSTUDIO_COMPUTE_WORKLOADS.find((item) => item.id === workloadId) ?? TOONSTUDIO_COMPUTE_WORKLOADS[3];
}

/** 정적 Shape 정렬 단위에 맞춰 4D 텐서의 H·W 차원을 올림 정렬한다. */
export function alignTensorShape(
  shape: readonly [number, number, number, number],
  align: number,
  required: boolean,
): readonly [number, number, number, number] {
  if (!required || align <= 1) return shape;
  const roundUp = (value: number): number => Math.ceil(value / align) * align;
  return [shape[0], shape[1], roundUp(shape[2]), roundUp(shape[3])];
}

function normalizeThreeWayShares(cpuRaw: number, gpuRaw: number, npuRaw: number): {
  readonly cpu: number;
  readonly gpu: number;
  readonly npuTpu: number;
} {
  const c = Math.max(5, cpuRaw);
  const g = Math.max(5, gpuRaw);
  const n = Math.max(5, npuRaw);
  const sum = c + g + n;
  const cpu = Math.round((c / sum) * 100);
  const gpu = Math.round((g / sum) * 100);
  return { cpu, gpu, npuTpu: 100 - cpu - gpu };
}

/** 브라우저 샌드박스 표준 API와 데스크톱·모바일 네이티브 FFI 브리지 경계를 산출한다. */
export function resolveRuntimeBoundary(
  silicon: ModernSiliconProfile,
  environment: ExecutionEnvironmentMode,
  memoryMode: MemoryAddressMode,
): RuntimeBoundaryReport {
  const isMemory64 = memoryMode === "wasm64-memory64";
  const isNativePlan = environment === "desktop-native-bridge";
  const wasmLayer = isMemory64 ? "WASM64 (memory64 · i64) + Relaxed-SIMD" : "WASM32 Safe (SIMD128 · i32) + Relaxed-SIMD";
  return {
    environment, memoryMode, sandboxedBrowserTab: true, directNativeDriverBlocked: true,
    blockedDirectApis: ["CUDA", "Metal", "ROCm", "NNAPI"],
    activeStandardLayers: [], nativeFfiBridgeLayers: [],
    plannedDirectNativeDriverBlocked: !isNativePlan,
    plannedStandardLayers: [wasmLayer, "SharedArrayBuffer Threads (COOP/COEP)", `WebGPU (${silicon.gpu.graphicsBackend} · Subgroup ${silicon.gpu.subgroupSize})`, silicon.npuTpu.browserDelegate],
    plannedNativeFfiBridgeLayers: isNativePlan
      ? ["Tauri / Electron Native FFI Bridge", silicon.npuTpu.nativeDelegate, `OS Core Pinning (${silicon.cpu.nativeSimdWidthBits}-bit SIMD)`]
      : [],
    boundarySummaryKo: isNativePlan
      ? "네이티브 셸용 배정 계획입니다. 현재 미리보기는 FFI·드라이버·장치에 접근하지 않으며 실제 브리지는 연결되지 않았습니다."
      : "브라우저용 배정 계획입니다. WASM·WebGPU·WebNN·SharedArrayBuffer 지원을 조회하거나 실행하지 않았으며 실제 드라이버 접근은 연결되지 않았습니다.",
    boundarySummaryEn: isNativePlan
      ? "Native-shell dispatch plan only. This preview does not access FFI, drivers, or devices; no native bridge is connected."
      : "Browser dispatch plan only. WASM, WebGPU, WebNN, and SharedArrayBuffer have not been probed or executed; no driver access is connected.",
    extensionPathKo: isNativePlan
      ? `${silicon.npuTpu.nativeDelegate} · 네이티브 FFI 브리지 연결 계획 (미실행)`
      : "네이티브 셸 전환 시 별도 FFI 브리지 구현·권한·장치 검증 필요",
    extensionPathEn: isNativePlan
      ? `${silicon.npuTpu.nativeDelegate} · Native FFI bridge plan (not executed)`
      : "Native shells require a separate FFI implementation, permissions, and device verification",
  };
}

function rankTopTwoUnits(shares: { readonly cpu: number; readonly gpu: number; readonly npuTpu: number }): readonly [ComputeUnitKind, ComputeUnitKind] {
  const ordered: { readonly unit: ComputeUnitKind; readonly pct: number }[] = [
    { unit: "cpu", pct: shares.cpu },
    { unit: "gpu", pct: shares.gpu },
    { unit: "npu-tpu", pct: shares.npuTpu },
  ];
  ordered.sort((a, b) => b.pct - a.pct);
  return [ordered[0].unit, ordered[1].unit];
}

/** 8대 실리콘 · 실행 환경 · WASM64/WASM32 모드에 맞춘 3대 연산 유닛 및 6대 워크로드 최적 배정표를 생성한다. */
export function buildSiliconFullPowerPlan(input?: ToonSiliconDispatchInput): ToonSiliconFullPowerPlan {
  const silicon = getModernSiliconProfile(input?.siliconId ?? DEFAULT_MODERN_SILICON_ID);
  const environment = input?.environment ?? DEFAULT_EXECUTION_ENVIRONMENT;
  const memoryMode = input?.memoryMode ?? DEFAULT_MEMORY_ADDRESS_MODE;
  const focusWorkload = getToonStudioWorkload(input?.focusWorkloadId ?? DEFAULT_FOCUS_WORKLOAD_ID);

  const isNative = environment === "desktop-native-bridge";
  const isMobilePwa = environment === "mobile-pwa-android-ios";
  const isMemory64 = memoryMode === "wasm64-memory64";
  const runtimeBoundary = resolveRuntimeBoundary(silicon, environment, memoryMode);

  const performanceWorkers = isNative
    ? silicon.cpu.nativePerformanceWorkers
    : isMobilePwa
      ? Math.min(4, silicon.cpu.browserPerformanceWorkers)
      : silicon.cpu.browserPerformanceWorkers;
  const efficiencyWorkers = isNative
    ? silicon.cpu.nativeEfficiencyWorkers
    : isMobilePwa
      ? Math.min(2, silicon.cpu.browserEfficiencyWorkers)
      : silicon.cpu.browserEfficiencyWorkers;
  const simdWidthBits: 128 | 256 | 512 = isNative ? silicon.cpu.nativeSimdWidthBits : 128;

  const rawAtlasMb = isNative
    ? Math.round(silicon.gpu.baseAtlasBudgetMb * (isMemory64 ? 1.25 : 0.75))
    : isMobilePwa
      ? Math.min(silicon.gpu.baseAtlasBudgetMb, isMemory64 ? 768 : 512)
      : isMemory64
        ? silicon.gpu.baseAtlasBudgetMb
        : Math.min(1024, Math.round(silicon.gpu.baseAtlasBudgetMb * 0.5));
  const atlasBudgetMb = Math.max(256, rawAtlasMb);

  const plannedZeroCopyMlTensor = isNative
    ? true
    : isMobilePwa
      ? silicon.npuTpu.zeroCopyMlTensorSupported && silicon.gpu.unifiedMemoryZeroCopy
      : silicon.npuTpu.zeroCopyMlTensorSupported;
  const cpuStagingReadbacks: 0 | 2 = plannedZeroCopyMlTensor ? 0 : 2;

  const workloadRoutes: readonly WorkloadDispatchRoute[] = TOONSTUDIO_COMPUTE_WORKLOADS.map((wl) => {
    let cpuBias = wl.baseShares.cpu;
    let gpuBias = wl.baseShares.gpu;
    let npuBias = wl.baseShares.npuTpu;

    if (wl.isAiTensorWorkload) {
      npuBias += silicon.npuTpu.aiDispatchBoostPct;
      gpuBias -= Math.round(silicon.npuTpu.aiDispatchBoostPct / 2);
      if (!plannedZeroCopyMlTensor) {
        cpuBias += 6;
        npuBias -= 6;
      }
    } else if (silicon.gpu.subgroupSize >= 32 && wl.id === "character-skinning-culling-3d") {
      gpuBias += 4;
      cpuBias -= 4;
    } else if (silicon.cpu.schedulingPolicy === "all-big-work-stealing" && wl.id === "virtual-studio-physics-audio") {
      cpuBias += 4;
      gpuBias -= 4;
    }
    if (!isMemory64 && wl.id === "local-encoding-4k") {
      cpuBias += 4;
      gpuBias -= 4;
    }

    const shares = normalizeThreeWayShares(cpuBias, gpuBias, npuBias);
    const [primaryUnit, secondaryUnit] = rankTopTwoUnits(shares);
    const alignedShape = alignTensorShape(
      wl.logicalTensorShape,
      silicon.npuTpu.staticTensorPaddingAlign,
      wl.isAiTensorWorkload && silicon.npuTpu.staticShapeCompileRequired,
    );
    const memoryPathLabel = wl.isAiTensorWorkload
      ? plannedZeroCopyMlTensor
        ? `WebGPU ↔ Shared MLTensor Zero-Copy (${silicon.npuTpu.precisionLabel})`
        : `WebGPU → CPU Staging (2 Readbacks) → ${silicon.npuTpu.acceleratorLabel}`
      : isMemory64
        ? `WASM64 Linear Arena → WebGPU ${silicon.gpu.graphicsBackend} (${atlasBudgetMb} MiB)`
        : `WASM32 Ring Slab → WebGPU ${silicon.gpu.graphicsBackend} (${atlasBudgetMb} MiB)`;

    return {
      workloadId: wl.id, order: wl.order, subsystem: wl.subsystem, nameKo: wl.nameKo, nameEn: wl.nameEn,
      primaryUnit, secondaryUnit, cpuSharePct: shares.cpu, gpuSharePct: shares.gpu, npuTpuSharePct: shares.npuTpu,
      memoryPathLabel, staticTensorShapeLabel: `[${alignedShape.join("×")}]`,
      kernelStrategyKo: `${wl.kernelFocusKo} (${silicon.shortLabel})`,
      kernelStrategyEn: `${wl.kernelFocusEn} (${silicon.shortLabel})`,
      fallbackPathKo: wl.fallbackNoteKo, fallbackPathEn: wl.fallbackNoteEn,
    };
  });

  const activeWorkloadRoute = workloadRoutes.find((route) => route.workloadId === focusWorkload.id) ?? workloadRoutes[3];
  const paddedFocusShape = alignTensorShape(
    focusWorkload.logicalTensorShape,
    silicon.npuTpu.staticTensorPaddingAlign,
    focusWorkload.isAiTensorWorkload && silicon.npuTpu.staticShapeCompileRequired,
  );

  return {
    schemaVersion: TOON_SILICON_SCHEMA_VERSION, modelKind: TOON_SILICON_MODEL_KIND,
    measurementBasis: TOON_SILICON_MEASUREMENT_BASIS, brandStack: TOON_SILICON_BRAND_STACK,
    siliconId: silicon.id, siliconProfile: silicon, environment, memoryMode, focusWorkloadId: focusWorkload.id,
    runtimeBoundary,
    computeUnits: {
      cpu: {
        architectureLabel: silicon.cpu.architectureLabel,
        clusterTopologyKo: silicon.cpu.clusterTopologyKo,
        clusterTopologyEn: silicon.cpu.clusterTopologyEn,
        schedulingPolicy: silicon.cpu.schedulingPolicy,
        performanceWorkers, efficiencyWorkers, totalWorkers: performanceWorkers + efficiencyWorkers,
        simdWidthBits, relaxedSimdEnabled: false, sharedArrayBufferThreads: false,
        plannedRelaxedSimd: silicon.cpu.relaxedSimdSupported, plannedSharedArrayBufferThreads: true, plannedMemory64: isMemory64,
        memory64Active: false, addressSpaceBits: isMemory64 ? 64 : 32,
        linearAddressCeilingLabel: isMemory64 ? "16 GiB+ (WASM64 memory64 · i64)" : "4 GiB Ceiling (WASM32 SIMD128 · i32)",
        tileSwapStrategyKo: isMemory64 ? "WASM64 대용량 선형 아레나 + WebGPU 직접 스트리밍" : "WASM32 안전 슬랩 + OPFS 청크 스왑 링버퍼",
        tileSwapStrategyEn: isMemory64 ? "WASM64 large linear arena + direct WebGPU streaming" : "WASM32 safe slab + OPFS chunked swap ring buffer",
        loadSharePct: activeWorkloadRoute.cpuSharePct,
      },
      gpu: {
        gpuFamilyLabel: silicon.gpu.gpuFamilyLabel, graphicsBackend: silicon.gpu.graphicsBackend,
        subgroupSize: silicon.gpu.subgroupSize, f16ShaderEnabled: false, plannedF16Shader: silicon.gpu.f16ShaderSupported,
        atlasBudgetMb, unifiedMemoryZeroCopy: false, plannedUnifiedMemoryZeroCopy: silicon.gpu.unifiedMemoryZeroCopy || isNative,
        loadSharePct: activeWorkloadRoute.gpuSharePct,
      },
      npuTpu: {
        acceleratorLabel: silicon.npuTpu.acceleratorLabel,
        delegateLayer: isNative ? silicon.npuTpu.nativeDelegate : silicon.npuTpu.browserDelegate,
        precisionMode: silicon.npuTpu.precisionLabel,
        staticShapeCompileRequired: silicon.npuTpu.staticShapeCompileRequired,
        staticTensorPaddingAlign: silicon.npuTpu.staticTensorPaddingAlign,
        paddedFocusShape, systolicOrTileLayout: silicon.npuTpu.systolicOrTileLayout,
        zeroCopyMlTensorActive: false, cpuStagingReadbacks: 0, plannedZeroCopyMlTensor, plannedCpuStagingReadbacks: cpuStagingReadbacks, loadSharePct: activeWorkloadRoute.npuTpuSharePct,
      },
    },
    workloadRoutes,
    activeWorkloadRoute,
    runtimeState: { hardwareProbed: false, gpuExecuted: false, nativeBridgeExecuted: false, workersStarted: false, persisted: false },
    honestyNoticeKo:
      "ToonSilicon은 가정한 프로파일로 만드는 배정 계획입니다. 장치 미검증·GPU/FFI/워커 미실행 상태이며 메모리·f16·Zero-Copy 수치는 계획과 요구 조건입니다. 허위 TOPS·실측 FPS를 표시하지 않으며 실제 가속·생성·저장은 연결되지 않았습니다.",
    honestyNoticeEn:
      "ToonSilicon is a dispatch plan based on assumed profiles. Devices are unverified; GPU, FFI, and workers are not executed. Memory, f16, and zero-copy are planned requirements. No fabricated TOPS or measured FPS numbers are claimed; live acceleration, generation, and persistence are not connected.",
  };
}

/** ToonSilicon 실리콘 배정표와 JSON 매니페스트를 함께 내보낸다. */
export function exportToonSiliconPlanJson(input?: ToonSiliconDispatchInput): ExportedToonSiliconPlan {
  const plan = buildSiliconFullPowerPlan(input);
  return { plan, json: JSON.stringify(plan, null, 2) };
}

export interface ProbedToonSiliconDispatchSnapshot {
  readonly siliconId: ModernSiliconId;
  readonly focusWorkloadId: ToonStudioWorkloadId;
  readonly hardwareProbed: true;
  readonly executionTier: StudioHardwareExecutionTier;
  readonly simdTier: StudioWasmSimdTier;
  readonly memory64Supported: boolean;
  readonly sharedArrayBufferThreads: boolean;
  readonly wasmThreads: number;
  readonly webgpuAvailable: boolean;
  readonly shaderF16Supported: boolean;
  readonly subgroupsSupported: boolean;
  readonly webnnDeviceType: StudioWebNnDeviceType;
  readonly onnxExecutionProviders: readonly StudioOnnxHardwareEpOption[];
  readonly webCodecsHardwareReady: boolean;
  readonly zeroCopyVideoFramePath: boolean;
}

/** 별도 실행한 실기기 하드웨어 프로브 결과를 계획 모델과 분리된 검증 스냅샷으로 결합한다. */
export function bindLiveHardwareProbeToSiliconPlan(
  plan: ToonSiliconFullPowerPlan,
  probe: StudioHardwareAccelerationReport,
): ProbedToonSiliconDispatchSnapshot {
  return Object.freeze({
    siliconId: plan.siliconId,
    focusWorkloadId: plan.focusWorkloadId,
    hardwareProbed: true,
    executionTier: probe.executionTier,
    simdTier: probe.wasm.simdTier,
    memory64Supported: probe.wasm.memory64,
    sharedArrayBufferThreads: probe.wasm.sharedArrayBuffer,
    wasmThreads: probe.wasm.wasmThreadCount,
    webgpuAvailable: probe.webgpu.available,
    shaderF16Supported: probe.webgpu.shaderF16,
    subgroupsSupported: probe.webgpu.subgroups,
    webnnDeviceType: probe.webnn.deviceType,
    onnxExecutionProviders: probe.onnxExecutionProviders,
    webCodecsHardwareReady: probe.webCodecs.hardwareAccelerationPreferred,
    zeroCopyVideoFramePath: probe.webCodecs.zeroCopyVideoFramePath,
  });
}
