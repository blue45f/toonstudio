/**
 * Wave-63: 전 제조사 GPU 업스케일러 + 이종 NPU/AI/GPU/CPU 통합 가속 HAL 라우터.
 *
 * 브라우저 런타임(`browser-web`)과 네이티브 브릿지(`desktop-tauri-native`, `native-dx12`,
 * `native-vulkan`, `native-metal`, `mobile-native-*`)의 실제 호출 가능 경계를 정직하게 구분한다.
 */

import {
  LOW_LATENCY_STACK_CATALOG,
  NPU_ACCELERATOR_CATALOG,
  UPSCALER_CAPABILITY_CATALOG,
  type AcceleratorBackendId,
  type AcceleratorBackendSpec,
  type HardwareVendorId,
  type HeterogeneousExecutionLane,
  type LowLatencyStackId,
  type LowLatencyStackSpec,
  type RuntimeHostEnvironment,
  type UpscalerCapabilitySpec,
  type UpscalerQualityPreset,
  type UpscalerTechnologyId,
} from "./hardware-capability-catalog";

export {
  LOW_LATENCY_STACK_CATALOG,
  NPU_ACCELERATOR_CATALOG,
  UPSCALER_CAPABILITY_CATALOG,
  type AcceleratorBackendId,
  type AcceleratorBackendSpec,
  type HardwareVendorId,
  type HeterogeneousExecutionLane,
  type LowLatencyStackId,
  type LowLatencyStackSpec,
  type RuntimeHostEnvironment,
  type UpscalerCapabilitySpec,
  type UpscalerQualityPreset,
  type UpscalerTechnologyId,
};

export {
  planHeterogeneousMultiAcceleratorFrame,
  type HeterogeneousFramePlan,
  type HeterogeneousFrameTaskNode,
  type HeterogeneousFrameWorkloadInput,
} from "./heterogeneous-frame-dag-planner";

/** 어댑터 감지 프로브 입력(브라우저 WebGPU/WebNN 또는 네이티브 브릿지 리포트). */
export interface HardwareAdapterProbeInput {
  readonly hostEnvironment: RuntimeHostEnvironment;
  readonly adapterVendor?: string;
  readonly adapterArchitecture?: string;
  readonly adapterDeviceName?: string;
  readonly secondaryIgpuDeviceName?: string;
  readonly npuDeviceName?: string;
  readonly nativeApisAvailable?: readonly ("dx12" | "metal" | "vulkan")[];
  readonly webgpu?: {
    readonly available: boolean;
    readonly supportsSubgroups?: boolean;
    readonly supportsShaderF16?: boolean;
    readonly supportsDp4a?: boolean;
  };
  readonly webnn?: {
    readonly available: boolean;
    readonly deviceTypes?: readonly ("cpu" | "gpu" | "npu")[];
  };
  readonly wasm?: {
    readonly memory64?: boolean;
    readonly simd128?: boolean;
  };
  readonly hardwareHints?: {
    readonly unifiedMemory?: boolean;
    readonly supportsFp8?: boolean;
    readonly supportsInt4?: boolean;
    readonly supportsOpticalFlowEngine?: boolean;
    readonly supportsXmxMatrix?: boolean;
    readonly supportsArmNeuralGraphics?: boolean;
    readonly supportsArmSme2?: boolean;
    readonly supportsReflex2FrameWarp?: boolean;
    readonly supportsMotionVectors?: boolean;
  };
}

/** 정규화된 하드웨어 가속 역량 프로파일. */
export interface HardwareAccelerationProfile {
  readonly hostEnvironment: RuntimeHostEnvironment;
  readonly isBrowserSandboxed: boolean;
  readonly primaryVendor: HardwareVendorId;
  readonly architectureTier: string;
  readonly primaryDeviceName: string;
  readonly hasDiscreteGpu: boolean;
  readonly hasIntegratedGpu: boolean;
  readonly zeroCopyUnifiedMemory: boolean;
  readonly nativeApisAvailable: readonly ("dx12" | "metal" | "vulkan")[];
  readonly webgpuAvailable: boolean;
  readonly webgpuFeatures: readonly string[];
  readonly webnnDevices: readonly ("cpu" | "gpu" | "npu")[];
  readonly wasm64Available: boolean;
  readonly wasmSimd128Available: boolean;
  readonly supportsFp8: boolean;
  readonly supportsInt4: boolean;
  readonly supportsOpticalFlow: boolean;
  readonly supportsMotionVectors: boolean;
  readonly supportsArmNeuralGraphics: boolean;
  readonly supportsReflex2FrameWarp: boolean;
  readonly detectedAccelerators: readonly AcceleratorBackendId[];
  readonly executableAccelerators: readonly AcceleratorBackendId[];
  readonly nativeOnlyHardwareBlockedByBrowser: readonly AcceleratorBackendId[];
}

/** 업스케일러·저지연 선택 선호도 옵션. */
export interface UpscalerSelectionPreferences {
  readonly qualityPreset?: UpscalerQualityPreset;
  readonly allowFrameGeneration?: boolean;
  readonly prioritizeLowLatency?: boolean;
  readonly requireTemporalMotionVectors?: boolean;
  readonly splitResPreserveNativeLineart?: boolean;
}

/** 호스트 경계 때문에 제외된 네이티브 후보 기록. */
export interface RejectedUpscalerCandidate {
  readonly id: UpscalerTechnologyId;
  readonly reason:
    | "missing-motion-vectors"
    | "missing-native-api"
    | "requires-native-bridge-dx12-vulkan-metal"
    | "unsupported-hardware-feature";
}

/** 결정론적 업스케일러·저지연 스택 선택 결과. */
export interface UpscalerAndLatencySelection {
  readonly activeUpscaler: UpscalerTechnologyId;
  readonly activeUpscalerSpec: UpscalerCapabilitySpec;
  readonly activeLatencyStack: LowLatencyStackId;
  readonly activeLatencySpec: LowLatencyStackSpec;
  readonly primaryAiAccelerator: AcceleratorBackendId;
  readonly renderScale: number;
  readonly splitResNativeLineartEnabled: boolean;
  readonly frameGenerationActive: boolean;
  readonly multiFrameGenerationActive: boolean;
  readonly fallbackChain: readonly UpscalerTechnologyId[];
  readonly rejectedNativeCandidates: readonly RejectedUpscalerCandidate[];
  readonly nativeBridgeUpgradePath: UpscalerTechnologyId | null;
  readonly honestyNote: string;
}

const QUALITY_PRESET_SCALE: Readonly<Record<UpscalerQualityPreset, number>> = {
  "native-aa": 1.0,
  "ultra-quality": 0.77,
  quality: 0.67,
  balanced: 0.59,
  performance: 0.5,
};

function normalizeToken(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function inferVendor(probe: HardwareAdapterProbeInput): HardwareVendorId {
  const combined = [probe.adapterVendor, probe.adapterArchitecture, probe.adapterDeviceName]
    .map(normalizeToken)
    .join(" ");

  if (
    combined.includes("nvidia") ||
    combined.includes("geforce") ||
    combined.includes("rtx") ||
    combined.includes("blackwell") ||
    combined.includes("ada")
  ) {
    return "nvidia";
  }
  if (combined.includes("amd") || combined.includes("radeon") || combined.includes("rdna")) {
    return "amd";
  }
  if (combined.includes("apple") || /\bm[1-5]\b/.test(combined)) {
    return "apple";
  }
  if (
    combined.includes("intel") ||
    combined.includes("arc") ||
    combined.includes("battlemage") ||
    combined.includes("alchemist") ||
    combined.includes("xe")
  ) {
    return "intel";
  }
  if (combined.includes("qualcomm") || combined.includes("adreno") || combined.includes("snapdragon")) {
    return "qualcomm";
  }
  if (combined.includes("arm") || combined.includes("mali") || combined.includes("immortalis")) {
    return "arm";
  }
  return "software";
}

function inferArchitectureTier(
  vendor: HardwareVendorId,
  probe: HardwareAdapterProbeInput,
): string {
  const text = `${normalizeToken(probe.adapterArchitecture)} ${normalizeToken(probe.adapterDeviceName)}`;
  if (vendor === "nvidia") {
    if (text.includes("blackwell") || /rtx\s*50\d{2}/.test(text)) return "blackwell";
    if (text.includes("ada") || /rtx\s*40\d{2}/.test(text)) return "ada-lovelace";
    if (text.includes("ampere") || /rtx\s*30\d{2}/.test(text)) return "ampere";
    return "nvidia-generic";
  }
  if (vendor === "amd") {
    if (text.includes("rdna 4") || text.includes("rdna4") || /rx\s*90\d{2}/.test(text)) return "rdna4";
    if (text.includes("rdna 3") || text.includes("rdna3") || /rx\s*7\d{3}/.test(text)) return "rdna3";
    if (text.includes("rdna 2") || text.includes("rdna2") || /rx\s*6\d{3}/.test(text)) return "rdna2";
    return "amd-generic";
  }
  if (vendor === "intel") {
    if (text.includes("battlemage") || /arc\s*b\d{3}/.test(text)) return "xe2-battlemage";
    if (text.includes("lunar") || text.includes("panther") || text.includes("xe2")) return "xe2-igpu";
    if (text.includes("alchemist") || /arc\s*a\d{3}/.test(text)) return "xe-alchemist";
    return "intel-generic";
  }
  if (vendor === "apple") {
    if (/\bm4\b/.test(text)) return "apple-m4";
    if (/\bm3\b/.test(text)) return "apple-m3";
    if (/\bm2\b/.test(text)) return "apple-m2";
    if (/\bm1\b/.test(text)) return "apple-m1";
    return "apple-silicon";
  }
  if (vendor === "arm") {
    return text.includes("immortalis") ? "arm-immortalis" : "arm-mali";
  }
  if (vendor === "qualcomm") {
    return text.includes("elite") || text.includes("830") || text.includes("840")
      ? "adreno-gen8"
      : "adreno-generic";
  }
  return "software-cpu";
}

function dedupeIds<T extends string>(items: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * 실시간 GPU/NPU/WebGPU/WebNN/WASM64 어댑터 프로브를 해석해 정규화된 가속 프로파일을 산출한다.
 */
export function detectHardwareAccelerationProfile(
  probe: HardwareAdapterProbeInput,
): HardwareAccelerationProfile {
  const isBrowserSandboxed = probe.hostEnvironment === "browser-web";
  const primaryVendor = inferVendor(probe);
  const architectureTier = inferArchitectureTier(primaryVendor, probe);
  const primaryDeviceName = probe.adapterDeviceName?.trim() || `${primaryVendor.toUpperCase()} Adapter`;
  const npuName = normalizeToken(probe.npuDeviceName);
  const hints = probe.hardwareHints ?? {};

  const zeroCopyUnifiedMemory =
    hints.unifiedMemory ??
    (primaryVendor === "apple" || primaryVendor === "arm" || primaryVendor === "qualcomm");
  const hasDiscreteGpu =
    primaryVendor === "nvidia" ||
    (primaryVendor === "amd" &&
      !normalizeToken(primaryDeviceName).includes("780m") &&
      !normalizeToken(primaryDeviceName).includes("890m")) ||
    (primaryVendor === "intel" &&
      (architectureTier === "xe2-battlemage" || architectureTier === "xe-alchemist"));
  const hasIntegratedGpu =
    Boolean(probe.secondaryIgpuDeviceName?.trim()) || !hasDiscreteGpu || zeroCopyUnifiedMemory;

  const nativeApisAvailable: ("dx12" | "metal" | "vulkan")[] = isBrowserSandboxed
    ? []
    : probe.nativeApisAvailable
      ? [...probe.nativeApisAvailable]
      : probe.hostEnvironment === "native-dx12"
        ? ["dx12"]
        : probe.hostEnvironment === "native-metal" ||
            probe.hostEnvironment === "mobile-native-metal"
          ? ["metal"]
          : probe.hostEnvironment === "native-vulkan" ||
              probe.hostEnvironment === "mobile-native-vulkan"
            ? ["vulkan"]
            : primaryVendor === "apple"
              ? ["metal"]
              : ["dx12", "vulkan"];

  const webgpuAvailable = Boolean(probe.webgpu?.available);
  const webgpuFeatures: string[] = [];
  if (webgpuAvailable) {
    webgpuFeatures.push("webgpu");
    if (probe.webgpu?.supportsSubgroups) webgpuFeatures.push("subgroups");
    if (probe.webgpu?.supportsShaderF16) webgpuFeatures.push("shader-f16");
    if (probe.webgpu?.supportsDp4a) webgpuFeatures.push("dp4a");
  }

  const webnnDevices: ("cpu" | "gpu" | "npu")[] = probe.webnn?.available
    ? probe.webnn.deviceTypes && probe.webnn.deviceTypes.length > 0
      ? [...probe.webnn.deviceTypes]
      : ["gpu", "cpu"]
    : [];

  const wasm64Available = probe.wasm?.memory64 ?? true;
  const wasmSimd128Available = probe.wasm?.simd128 ?? true;
  const supportsFp8 =
    hints.supportsFp8 ??
    (architectureTier === "blackwell" ||
      architectureTier === "ada-lovelace" ||
      architectureTier === "rdna4");
  const supportsInt4 = hints.supportsInt4 ?? primaryVendor !== "software";
  const supportsOpticalFlow =
    hints.supportsOpticalFlowEngine ??
    (primaryVendor === "nvidia" ||
      architectureTier === "rdna4" ||
      architectureTier === "rdna3" ||
      architectureTier === "xe2-battlemage");
  const supportsMotionVectors = hints.supportsMotionVectors ?? true;
  const supportsArmNeuralGraphics =
    hints.supportsArmNeuralGraphics ?? architectureTier === "arm-immortalis";
  const supportsReflex2FrameWarp =
    hints.supportsReflex2FrameWarp ?? architectureTier === "blackwell";

  const detectedNative: AcceleratorBackendId[] = [];
  if (primaryVendor === "nvidia") {
    detectedNative.push("nvidia-tensor-fp8-int4");
    if (supportsOpticalFlow) detectedNative.push("nvidia-nvenc-ofa");
  }
  if (primaryVendor === "amd" || npuName.includes("xdna") || npuName.includes("ryzen ai")) {
    if (npuName.includes("xdna 2") || npuName.includes("xdna2") || architectureTier === "rdna4") {
      detectedNative.push("amd-xdna2");
    } else if (npuName.includes("xdna") || npuName.includes("ryzen")) {
      detectedNative.push("amd-xdna");
    }
  }
  if (primaryVendor === "intel" || npuName.includes("ai boost") || npuName.includes("intel npu")) {
    if (npuName.includes("ai boost") || npuName.includes("npu") || primaryVendor === "intel") {
      detectedNative.push("intel-ai-boost-npu");
    }
  }
  if (primaryVendor === "apple") {
    detectedNative.push("apple-ane-coreml", "apple-amx-unified-zero-copy");
  }
  if (primaryVendor === "arm") {
    if (npuName.includes("ethos") || npuName.includes("npu")) detectedNative.push("arm-ethos-u");
    if (hints.supportsArmSme2 ?? true) detectedNative.push("arm-kleidiai-sme2");
  }
  if (primaryVendor === "qualcomm") {
    detectedNative.push("qualcomm-hexagon-htp");
  }

  const webStandardBackends: AcceleratorBackendId[] = [];
  if (webnnDevices.includes("npu")) webStandardBackends.push("webnn-npu");
  if (webgpuAvailable) webStandardBackends.push("webgpu-compute-dp4a-fp16");
  if (webnnDevices.includes("gpu")) webStandardBackends.push("webnn-gpu");
  if (webnnDevices.includes("cpu")) webStandardBackends.push("webnn-cpu");
  webStandardBackends.push("wasm64-simd128");

  const detectedAccelerators = dedupeIds([...detectedNative, ...webStandardBackends]);
  const executableAccelerators = isBrowserSandboxed
    ? dedupeIds(webStandardBackends)
    : detectedAccelerators;
  const nativeOnlyHardwareBlockedByBrowser = isBrowserSandboxed ? dedupeIds(detectedNative) : [];

  return {
    hostEnvironment: probe.hostEnvironment,
    isBrowserSandboxed,
    primaryVendor,
    architectureTier,
    primaryDeviceName,
    hasDiscreteGpu,
    hasIntegratedGpu,
    zeroCopyUnifiedMemory,
    nativeApisAvailable,
    webgpuAvailable,
    webgpuFeatures,
    webnnDevices,
    wasm64Available,
    wasmSimd128Available,
    supportsFp8,
    supportsInt4,
    supportsOpticalFlow,
    supportsMotionVectors,
    supportsArmNeuralGraphics,
    supportsReflex2FrameWarp,
    detectedAccelerators,
    executableAccelerators,
    nativeOnlyHardwareBlockedByBrowser,
  };
}

function buildNativeVendorCandidates(
  profile: HardwareAccelerationProfile,
): UpscalerTechnologyId[] {
  const { primaryVendor, architectureTier, supportsFp8 } = profile;
  if (primaryVendor === "nvidia") {
    return architectureTier === "blackwell" && supportsFp8
      ? ["dlss-4", "dlss-3.5", "fsr-3", "fsr-1"]
      : ["dlss-3.5", "fsr-3", "fsr-1"];
  }
  if (primaryVendor === "amd") {
    return architectureTier === "rdna4" && supportsFp8
      ? ["fsr-4", "fsr-3", "fsr-2", "fsr-1"]
      : ["fsr-3", "fsr-2", "fsr-1"];
  }
  if (primaryVendor === "intel") {
    return architectureTier === "xe2-battlemage" || architectureTier === "xe2-igpu"
      ? ["xess-2", "xess-1", "fsr-3", "fsr-1"]
      : ["xess-1", "fsr-2", "fsr-1"];
  }
  if (primaryVendor === "apple") return ["metalfx-temporal", "metalfx-spatial", "fsr-1"];
  if (primaryVendor === "arm") {
    return profile.supportsArmNeuralGraphics ? ["arm-nss", "arm-asr", "fsr-1"] : ["arm-asr", "fsr-1"];
  }
  if (primaryVendor === "qualcomm") return ["qualcomm-gsr-2", "fsr-1"];
  return [];
}

function buildWebFallbackCandidates(
  profile: HardwareAccelerationProfile,
  allowTemporalWebGpu: boolean,
): UpscalerTechnologyId[] {
  const candidates: UpscalerTechnologyId[] = [];
  if (profile.webgpuAvailable) {
    if (allowTemporalWebGpu && profile.supportsMotionVectors) {
      candidates.push("webgpu-temporal-taau");
    }
    candidates.push("webgpu-fsr1-easu-rcas");
  }
  if (profile.webnnDevices.length > 0) candidates.push("webnn-ml-sr");
  candidates.push("wasm64-simd128-easu-rcas");
  return dedupeIds(candidates);
}

function selectLowLatencyStack(profile: HardwareAccelerationProfile): LowLatencyStackId {
  if (profile.isBrowserSandboxed) {
    return profile.webgpuAvailable ? "webgpu-low-latency-queue" : "web-desynchronized-predict";
  }
  const hasDxOrVk =
    profile.nativeApisAvailable.includes("dx12") || profile.nativeApisAvailable.includes("vulkan");
  const hasMetal = profile.nativeApisAvailable.includes("metal");

  if (profile.primaryVendor === "nvidia" && hasDxOrVk) {
    return profile.supportsReflex2FrameWarp ? "reflex-2" : "reflex";
  }
  if (profile.primaryVendor === "amd" && hasDxOrVk) return "anti-lag-2";
  if (profile.primaryVendor === "intel" && hasDxOrVk) return "xell";
  if (profile.primaryVendor === "apple" && hasMetal) return "metal-low-latency-drawable";
  return profile.webgpuAvailable ? "webgpu-low-latency-queue" : "web-desynchronized-predict";
}

function selectPrimaryAiAccelerator(profile: HardwareAccelerationProfile): AcceleratorBackendId {
  const priorityOrder: readonly AcceleratorBackendId[] = profile.isBrowserSandboxed
    ? ["webnn-npu", "webgpu-compute-dp4a-fp16", "webnn-gpu", "webnn-cpu", "wasm64-simd128"]
    : [
        "nvidia-tensor-fp8-int4",
        "amd-xdna2",
        "qualcomm-hexagon-htp",
        "intel-ai-boost-npu",
        "apple-ane-coreml",
        "arm-ethos-u",
        "amd-xdna",
        "arm-kleidiai-sme2",
        "webnn-npu",
        "webgpu-compute-dp4a-fp16",
        "wasm64-simd128",
      ];

  for (const id of priorityOrder) {
    if (profile.executableAccelerators.includes(id)) return id;
  }
  return "wasm64-simd128";
}

/**
 * 하드웨어 프로파일과 호스트 경계에 따라 최적 업스케일러·저지연·AI 가속 스택과
 * 정직한 폴백 체인을 결정론적으로 선택한다.
 */
export function selectOptimalUpscalerAndLatencyStack(
  profile: HardwareAccelerationProfile,
  preferences: UpscalerSelectionPreferences = {},
): UpscalerAndLatencySelection {
  const preset = preferences.qualityPreset ?? "quality";
  const allowFrameGeneration = preferences.allowFrameGeneration ?? true;
  const requireTemporalMotionVectors = preferences.requireTemporalMotionVectors ?? false;
  const splitResNativeLineartEnabled = preferences.splitResPreserveNativeLineart ?? true;

  const nativeCandidates = buildNativeVendorCandidates(profile);
  const webCandidates = buildWebFallbackCandidates(profile, requireTemporalMotionVectors);
  const rejectedNativeCandidates: RejectedUpscalerCandidate[] = [];
  const executableCandidates: UpscalerTechnologyId[] = [];

  for (const candidateId of nativeCandidates) {
    const spec = UPSCALER_CAPABILITY_CATALOG[candidateId];
    if (profile.isBrowserSandboxed && !spec.browserExecutable) {
      rejectedNativeCandidates.push({
        id: candidateId,
        reason: "requires-native-bridge-dx12-vulkan-metal",
      });
      continue;
    }
    const apiOk =
      spec.requiredNativeApis.length === 0 ||
      spec.requiredNativeApis.some((api) => profile.nativeApisAvailable.includes(api));
    if (!apiOk) {
      rejectedNativeCandidates.push({ id: candidateId, reason: "missing-native-api" });
      continue;
    }
    if (spec.kind !== "spatial" && !profile.supportsMotionVectors) {
      rejectedNativeCandidates.push({ id: candidateId, reason: "missing-motion-vectors" });
      continue;
    }
    executableCandidates.push(candidateId);
  }

  for (const webId of webCandidates) executableCandidates.push(webId);

  const fallbackChain = dedupeIds(executableCandidates);
  const activeUpscaler = fallbackChain[0] ?? "wasm64-simd128-easu-rcas";
  const activeUpscalerSpec = UPSCALER_CAPABILITY_CATALOG[activeUpscaler];
  const activeLatencyStack = selectLowLatencyStack(profile);
  const activeLatencySpec = LOW_LATENCY_STACK_CATALOG[activeLatencyStack];
  const primaryAiAccelerator = selectPrimaryAiAccelerator(profile);

  const rawScale = QUALITY_PRESET_SCALE[preset];
  const [minScale, maxScale] = activeUpscalerSpec.typicalRenderScaleRange;
  const renderScale =
    preset === "native-aa" ? 1.0 : Math.min(maxScale, Math.max(minScale, rawScale));

  const frameGenerationActive = allowFrameGeneration && activeUpscalerSpec.supportsFrameGen;
  const multiFrameGenerationActive =
    allowFrameGeneration && activeUpscalerSpec.supportsMultiFrameGen;
  const nativeBridgeUpgradePath =
    profile.isBrowserSandboxed && nativeCandidates.length > 0 ? nativeCandidates[0] : null;

  const honestyNote = profile.isBrowserSandboxed
    ? `브라우저 샌드박스 경계(${profile.primaryDeviceName})에서 네이티브 전용 SDK 호출을 차단하고 ${activeUpscalerSpec.displayName} 표준 경로로 실행합니다.`
    : `네이티브 브릿지(${profile.nativeApisAvailable.join("/")})로 ${activeUpscalerSpec.displayName} 및 ${activeLatencySpec.displayName} 경로를 활성화합니다.`;

  return {
    activeUpscaler,
    activeUpscalerSpec,
    activeLatencyStack,
    activeLatencySpec,
    primaryAiAccelerator,
    renderScale,
    splitResNativeLineartEnabled,
    frameGenerationActive,
    multiFrameGenerationActive,
    fallbackChain,
    rejectedNativeCandidates,
    nativeBridgeUpgradePath,
    honestyNote,
  };
}
