/**
 * Wave-63: 전 제조사 GPU 업스케일러 · 저지연 입력 스택 · NPU/AI/매트릭스 가속 백엔드
 * 정밀 역량 카탈로그 및 공통 타입 계약.
 */

/** 지원하는 GPU·SoC 하드웨어 벤더 식별자. */
export type HardwareVendorId =
  | "amd"
  | "apple"
  | "arm"
  | "intel"
  | "nvidia"
  | "qualcomm"
  | "software";

/** 현재 코드가 실행 중인 호스트 런타임 경계. */
export type RuntimeHostEnvironment =
  | "browser-web"
  | "desktop-tauri-native"
  | "mobile-native-metal"
  | "mobile-native-vulkan"
  | "native-dx12"
  | "native-metal"
  | "native-vulkan";

/** 업스케일러·프레임 생성 기술 식별자. */
export type UpscalerTechnologyId =
  | "arm-asr"
  | "arm-nss"
  | "dlss-3.5"
  | "dlss-4"
  | "fsr-1"
  | "fsr-2"
  | "fsr-3"
  | "fsr-4"
  | "metalfx-spatial"
  | "metalfx-temporal"
  | "qualcomm-gsr-2"
  | "wasm64-simd128-easu-rcas"
  | "webgpu-fsr1-easu-rcas"
  | "webgpu-temporal-taau"
  | "webnn-ml-sr"
  | "xess-1"
  | "xess-2";

/** 저지연 입력·프레임 페이싱 스택 식별자. */
export type LowLatencyStackId =
  | "anti-lag-2"
  | "metal-low-latency-drawable"
  | "reflex"
  | "reflex-2"
  | "web-desynchronized-predict"
  | "webgpu-low-latency-queue"
  | "xell";

/** NPU·AI 매트릭스·광학 흐름·CPU SIMD 가속 백엔드 식별자. */
export type AcceleratorBackendId =
  | "amd-xdna"
  | "amd-xdna2"
  | "apple-amx-unified-zero-copy"
  | "apple-ane-coreml"
  | "arm-ethos-u"
  | "arm-kleidiai-sme2"
  | "intel-ai-boost-npu"
  | "nvidia-nvenc-ofa"
  | "nvidia-tensor-fp8-int4"
  | "qualcomm-hexagon-htp"
  | "wasm64-simd128"
  | "webgpu-compute-dp4a-fp16"
  | "webnn-cpu"
  | "webnn-gpu"
  | "webnn-npu";

/** 단일 프레임 이종 병렬 실행 레인 식별자. */
export type HeterogeneousExecutionLane =
  | "cpu-simd"
  | "dgpu"
  | "igpu"
  | "npu"
  | "optical-flow";

/** 품질/성능 업스케일 프리셋. */
export type UpscalerQualityPreset =
  | "native-aa"
  | "ultra-quality"
  | "quality"
  | "balanced"
  | "performance";

/** 업스케일러 역량 카탈로그 항목. */
export interface UpscalerCapabilitySpec {
  readonly id: UpscalerTechnologyId;
  readonly vendor: HardwareVendorId | "web-standard";
  readonly displayName: string;
  readonly kind: "ml-temporal" | "spatial" | "temporal";
  readonly supportsFrameGen: boolean;
  readonly supportsMultiFrameGen: boolean;
  readonly supportsRayReconstruction: boolean;
  readonly browserExecutable: boolean;
  readonly requiredNativeApis: readonly ("dx12" | "metal" | "vulkan")[];
  readonly requiredFeatures: readonly string[];
  readonly typicalRenderScaleRange: readonly [number, number];
  readonly estimatedUpscaleCostMs1440p: number;
  readonly qualityScore: number;
}

/** 저지연 스택 카탈로그 항목. */
export interface LowLatencyStackSpec {
  readonly id: LowLatencyStackId;
  readonly vendor: HardwareVendorId | "web-standard";
  readonly displayName: string;
  readonly browserExecutable: boolean;
  readonly supportsFrameWarp: boolean;
  readonly estimatedLatencyReductionMs: number;
  readonly requiredNativeApis: readonly ("dx12" | "metal" | "vulkan")[];
}

/** NPU·AI·매트릭스 가속기 카탈로그 항목. */
export interface AcceleratorBackendSpec {
  readonly id: AcceleratorBackendId;
  readonly vendor: HardwareVendorId | "web-standard";
  readonly displayName: string;
  readonly lane: HeterogeneousExecutionLane;
  readonly browserExecutable: boolean;
  readonly supportsFp8: boolean;
  readonly supportsInt4: boolean;
  readonly supportsInt8: boolean;
  readonly supportsFp16: boolean;
  readonly zeroCopyWithGpu: boolean;
  readonly nominalTops: number;
}

/** 전 제조사 업스케일러 정밀 역량 카탈로그. */
export const UPSCALER_CAPABILITY_CATALOG: Readonly<
  Record<UpscalerTechnologyId, UpscalerCapabilitySpec>
> = {
  "dlss-4": {
    id: "dlss-4",
    vendor: "nvidia",
    displayName: "NVIDIA DLSS 4 (Transformer SR + Multi Frame Gen)",
    kind: "ml-temporal",
    supportsFrameGen: true,
    supportsMultiFrameGen: true,
    supportsRayReconstruction: true,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["nvidia-blackwell-tensor", "fp8", "optical-flow"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.75,
    qualityScore: 98,
  },
  "dlss-3.5": {
    id: "dlss-3.5",
    vendor: "nvidia",
    displayName: "NVIDIA DLSS 3.5 (Super Resolution + Ray Reconstruction)",
    kind: "ml-temporal",
    supportsFrameGen: true,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: true,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["nvidia-tensor-core"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.95,
    qualityScore: 95,
  },
  "fsr-4": {
    id: "fsr-4",
    vendor: "amd",
    displayName: "AMD FidelityFX FSR 4 (RDNA 4 FP8 ML-SR)",
    kind: "ml-temporal",
    supportsFrameGen: true,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["amd-rdna4-wmma", "fp8"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.85,
    qualityScore: 94,
  },
  "fsr-3": {
    id: "fsr-3",
    vendor: "amd",
    displayName: "AMD FidelityFX FSR 3 (TAAU + Optical Flow FG)",
    kind: "temporal",
    supportsFrameGen: true,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["shader-fp16"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 1.05,
    qualityScore: 88,
  },
  "fsr-2": {
    id: "fsr-2",
    vendor: "amd",
    displayName: "AMD FidelityFX FSR 2 (TAAU Temporal)",
    kind: "temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["shader-fp16"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 1.0,
    qualityScore: 85,
  },
  "fsr-1": {
    id: "fsr-1",
    vendor: "amd",
    displayName: "AMD FidelityFX FSR 1 (EASU + RCAS Spatial)",
    kind: "spatial",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan", "metal"],
    requiredFeatures: ["compute-shader"],
    typicalRenderScaleRange: [0.59, 0.77],
    estimatedUpscaleCostMs1440p: 0.45,
    qualityScore: 76,
  },
  "xess-2": {
    id: "xess-2",
    vendor: "intel",
    displayName: "Intel XeSS 2 (XMX/DP4a ML-SR + XeSS-FG)",
    kind: "ml-temporal",
    supportsFrameGen: true,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["xmx-or-dp4a"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.95,
    qualityScore: 92,
  },
  "xess-1": {
    id: "xess-1",
    vendor: "intel",
    displayName: "Intel XeSS 1 (XMX/DP4a ML-SR)",
    kind: "ml-temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["dx12", "vulkan"],
    requiredFeatures: ["xmx-or-dp4a"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 1.1,
    qualityScore: 87,
  },
  "metalfx-temporal": {
    id: "metalfx-temporal",
    vendor: "apple",
    displayName: "Apple Metal 3 + MetalFX Temporal Upscaler",
    kind: "temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["metal"],
    requiredFeatures: ["metal-3"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.7,
    qualityScore: 91,
  },
  "metalfx-spatial": {
    id: "metalfx-spatial",
    vendor: "apple",
    displayName: "Apple Metal 3 + MetalFX Spatial Upscaler",
    kind: "spatial",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["metal"],
    requiredFeatures: ["metal-3"],
    typicalRenderScaleRange: [0.59, 0.77],
    estimatedUpscaleCostMs1440p: 0.4,
    qualityScore: 80,
  },
  "arm-nss": {
    id: "arm-nss",
    vendor: "arm",
    displayName: "Arm NSS (Neural Super Sampling)",
    kind: "ml-temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["vulkan"],
    requiredFeatures: ["arm-neural-graphics"],
    typicalRenderScaleRange: [0.5, 0.75],
    estimatedUpscaleCostMs1440p: 1.15,
    qualityScore: 89,
  },
  "arm-asr": {
    id: "arm-asr",
    vendor: "arm",
    displayName: "Arm ASR (Accuracy Super Resolution)",
    kind: "temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["vulkan"],
    requiredFeatures: ["shader-fp16"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 1.25,
    qualityScore: 83,
  },
  "qualcomm-gsr-2": {
    id: "qualcomm-gsr-2",
    vendor: "qualcomm",
    displayName: "Qualcomm Snapdragon GSR 2",
    kind: "temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: false,
    requiredNativeApis: ["vulkan"],
    requiredFeatures: ["shader-fp16"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 1.1,
    qualityScore: 84,
  },
  "webgpu-temporal-taau": {
    id: "webgpu-temporal-taau",
    vendor: "web-standard",
    displayName: "WebGPU Compute Temporal TAAU (Subgroups/FP16)",
    kind: "temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: true,
    requiredNativeApis: [],
    requiredFeatures: ["webgpu", "motion-vectors"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.95,
    qualityScore: 84,
  },
  "webgpu-fsr1-easu-rcas": {
    id: "webgpu-fsr1-easu-rcas",
    vendor: "web-standard",
    displayName: "WebGPU WGSL FSR EASU + RCAS (100% Browser Compute)",
    kind: "spatial",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: true,
    requiredNativeApis: [],
    requiredFeatures: ["webgpu"],
    typicalRenderScaleRange: [0.5, 0.77],
    estimatedUpscaleCostMs1440p: 0.55,
    qualityScore: 79,
  },
  "webnn-ml-sr": {
    id: "webnn-ml-sr",
    vendor: "web-standard",
    displayName: "WebNN ML Super Resolution (NPU/GPU/CPU)",
    kind: "ml-temporal",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: true,
    requiredNativeApis: [],
    requiredFeatures: ["webnn"],
    typicalRenderScaleRange: [0.5, 0.75],
    estimatedUpscaleCostMs1440p: 1.8,
    qualityScore: 81,
  },
  "wasm64-simd128-easu-rcas": {
    id: "wasm64-simd128-easu-rcas",
    vendor: "web-standard",
    displayName: "WASM64 memory64 + SIMD128 EASU/RCAS Fallback",
    kind: "spatial",
    supportsFrameGen: false,
    supportsMultiFrameGen: false,
    supportsRayReconstruction: false,
    browserExecutable: true,
    requiredNativeApis: [],
    requiredFeatures: ["wasm64-or-js"],
    typicalRenderScaleRange: [0.5, 0.75],
    estimatedUpscaleCostMs1440p: 3.4,
    qualityScore: 72,
  },
};

/** 저지연 입력·프레임 동기화 스택 카탈로그. */
export const LOW_LATENCY_STACK_CATALOG: Readonly<
  Record<LowLatencyStackId, LowLatencyStackSpec>
> = {
  "reflex-2": {
    id: "reflex-2",
    vendor: "nvidia",
    displayName: "NVIDIA Reflex 2 (Low Latency + Frame Warp)",
    browserExecutable: false,
    supportsFrameWarp: true,
    estimatedLatencyReductionMs: 11.5,
    requiredNativeApis: ["dx12", "vulkan"],
  },
  reflex: {
    id: "reflex",
    vendor: "nvidia",
    displayName: "NVIDIA Reflex Low Latency",
    browserExecutable: false,
    supportsFrameWarp: false,
    estimatedLatencyReductionMs: 7.5,
    requiredNativeApis: ["dx12", "vulkan"],
  },
  "anti-lag-2": {
    id: "anti-lag-2",
    vendor: "amd",
    displayName: "AMD Radeon Anti-Lag 2",
    browserExecutable: false,
    supportsFrameWarp: false,
    estimatedLatencyReductionMs: 7.0,
    requiredNativeApis: ["dx12", "vulkan"],
  },
  xell: {
    id: "xell",
    vendor: "intel",
    displayName: "Intel XeLL (Xe Low Latency)",
    browserExecutable: false,
    supportsFrameWarp: false,
    estimatedLatencyReductionMs: 6.5,
    requiredNativeApis: ["dx12", "vulkan"],
  },
  "metal-low-latency-drawable": {
    id: "metal-low-latency-drawable",
    vendor: "apple",
    displayName: "Apple Metal 3 Low-Latency Drawable Pacing",
    browserExecutable: false,
    supportsFrameWarp: false,
    estimatedLatencyReductionMs: 5.5,
    requiredNativeApis: ["metal"],
  },
  "webgpu-low-latency-queue": {
    id: "webgpu-low-latency-queue",
    vendor: "web-standard",
    displayName: "WebGPU Queue Pace + Predicted Stylus Present",
    browserExecutable: true,
    supportsFrameWarp: false,
    estimatedLatencyReductionMs: 3.2,
    requiredNativeApis: [],
  },
  "web-desynchronized-predict": {
    id: "web-desynchronized-predict",
    vendor: "web-standard",
    displayName: "Canvas Desynchronized Front-Buffer Stylus Predictor",
    browserExecutable: true,
    supportsFrameWarp: false,
    estimatedLatencyReductionMs: 2.0,
    requiredNativeApis: [],
  },
};

/** NPU·AI·광학 흐름·CPU SIMD 가속 백엔드 카탈로그. */
export const NPU_ACCELERATOR_CATALOG: Readonly<
  Record<AcceleratorBackendId, AcceleratorBackendSpec>
> = {
  "nvidia-tensor-fp8-int4": {
    id: "nvidia-tensor-fp8-int4",
    vendor: "nvidia",
    displayName: "NVIDIA Tensor Core (FP8/INT4)",
    lane: "dgpu",
    browserExecutable: false,
    supportsFp8: true,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 800,
  },
  "nvidia-nvenc-ofa": {
    id: "nvidia-nvenc-ofa",
    vendor: "nvidia",
    displayName: "NVIDIA NVENC / Optical Flow Accelerator (OFA)",
    lane: "optical-flow",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 120,
  },
  "amd-xdna2": {
    id: "amd-xdna2",
    vendor: "amd",
    displayName: "AMD Ryzen AI XDNA 2 NPU",
    lane: "npu",
    browserExecutable: false,
    supportsFp8: true,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 55,
  },
  "amd-xdna": {
    id: "amd-xdna",
    vendor: "amd",
    displayName: "AMD Ryzen AI XDNA NPU",
    lane: "npu",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 16,
  },
  "intel-ai-boost-npu": {
    id: "intel-ai-boost-npu",
    vendor: "intel",
    displayName: "Intel AI Boost NPU",
    lane: "npu",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 48,
  },
  "apple-ane-coreml": {
    id: "apple-ane-coreml",
    vendor: "apple",
    displayName: "Apple Neural Engine (ANE / CoreML)",
    lane: "npu",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 38,
  },
  "apple-amx-unified-zero-copy": {
    id: "apple-amx-unified-zero-copy",
    vendor: "apple",
    displayName: "Apple AMX Unified Memory Zero-Copy",
    lane: "cpu-simd",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 12,
  },
  "arm-ethos-u": {
    id: "arm-ethos-u",
    vendor: "arm",
    displayName: "Arm Ethos-U NPU",
    lane: "npu",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: false,
    zeroCopyWithGpu: true,
    nominalTops: 18,
  },
  "arm-kleidiai-sme2": {
    id: "arm-kleidiai-sme2",
    vendor: "arm",
    displayName: "Arm KleidiAI SME2 Matrix Extension",
    lane: "cpu-simd",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 10,
  },
  "qualcomm-hexagon-htp": {
    id: "qualcomm-hexagon-htp",
    vendor: "qualcomm",
    displayName: "Qualcomm Hexagon NPU (HTP/QNN)",
    lane: "npu",
    browserExecutable: false,
    supportsFp8: false,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 75,
  },
  "webnn-npu": {
    id: "webnn-npu",
    vendor: "web-standard",
    displayName: "WebNN NPU Execution Provider",
    lane: "npu",
    browserExecutable: true,
    supportsFp8: false,
    supportsInt4: true,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: false,
    nominalTops: 32,
  },
  "webnn-gpu": {
    id: "webnn-gpu",
    vendor: "web-standard",
    displayName: "WebNN GPU Execution Provider",
    lane: "dgpu",
    browserExecutable: true,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 24,
  },
  "webnn-cpu": {
    id: "webnn-cpu",
    vendor: "web-standard",
    displayName: "WebNN CPU Execution Provider",
    lane: "cpu-simd",
    browserExecutable: true,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: false,
    zeroCopyWithGpu: false,
    nominalTops: 4,
  },
  "webgpu-compute-dp4a-fp16": {
    id: "webgpu-compute-dp4a-fp16",
    vendor: "web-standard",
    displayName: "WebGPU Compute (Subgroups / FP16 / DP4a)",
    lane: "dgpu",
    browserExecutable: true,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: true,
    zeroCopyWithGpu: true,
    nominalTops: 28,
  },
  "wasm64-simd128": {
    id: "wasm64-simd128",
    vendor: "web-standard",
    displayName: "WASM64 memory64 + SIMD128 CPU Kernel",
    lane: "cpu-simd",
    browserExecutable: true,
    supportsFp8: false,
    supportsInt4: false,
    supportsInt8: true,
    supportsFp16: false,
    zeroCopyWithGpu: false,
    nominalTops: 2,
  },
};
