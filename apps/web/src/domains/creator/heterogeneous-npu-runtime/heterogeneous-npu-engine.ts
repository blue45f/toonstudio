/**
 * Wave 52C — 4대 실리콘(Apple·Intel·AMD·Samsung Galaxy) 이기종 WebNN NPU · WebGPU f16 · CPU SIMD 오케스트레이터 엔진.
 *
 * - 5대 대표 실리콘 프로파일(Apple Silicon · Intel Core Ultra · AMD Ryzen AI · Galaxy Snapdragon · Galaxy Exynos)
 * - ToonStudio 6대 워크로드 3레인(NPU · WebGPU f16/Subgroups · Rust WASM Relaxed-SIMD/CPU Worker) 이기종 분산 스케줄러
 * - 4단 무중단 폴백(WebNN NPU → WebGPU f16 → Rust WASM Relaxed-SIMD128 → WASM Scalar) 및 ONNX Runtime Web EP 설정 생성기
 * - 정직한 아키텍처 분산 계획 모델(허위 TOPS·소비전력·지연 실측 주장 0건) 및 JSON 매니페스트 직렬화
 */

export type SiliconDeviceId = "apple-m-series" | "intel-core-ultra" | "amd-ryzen-ai" | "galaxy-snapdragon" | "galaxy-exynos";
export type SiliconVendorGroup = "apple" | "intel" | "amd" | "samsung-galaxy";
export type AcceleratorLaneId = "npu" | "webgpu" | "wasm-simd";
export type ExecutionTierId = "webnn-npu" | "webgpu-f16" | "wasm-relaxed-simd128" | "wasm-scalar";
export type OrtExecutionProviderName = "webnn" | "webgpu" | "wasm";
export type WorkloadId =
  | "face-eye-protection" | "dialogue-emotion-viseme" | "continuity-drift-vision"
  | "brush-km7-impasto-bvh" | "vrm-skinning-psd-clip" | "rhythm-offline-crdt";
export type WorkloadPrecision = "int8" | "fp16" | "fp32" | "int32-simd" | "scalar";
export type WebNnPowerPreference = "default" | "low-power" | "high-performance";
export type GuardSeverity = "info" | "warn" | "critical";
export type AvoidanceGrade = "optimal" | "balanced" | "contended";
export type HeterogeneousWarningCode =
  | "WEBNN_UNAVAILABLE_FALLBACK" | "WEBGPU_UNAVAILABLE_CPU_FALLBACK"
  | "WEBGPU_F16_UNAVAILABLE_FP32" | "WEBGPU_SUBGROUPS_UNAVAILABLE"
  | "WASM_RELAXED_SIMD_UNAVAILABLE_SCALAR" | "GPU_LANE_AI_CONTENTION" | "BATTERY_SAVER_BATCH_PACED";

export interface RuntimeCapabilityFlags {
  readonly webnnAvailable: boolean; readonly webgpuAvailable: boolean;
  readonly webgpuF16Available: boolean; readonly webgpuSubgroupsAvailable: boolean;
  readonly wasmRelaxedSimdAvailable: boolean; readonly wasmMemory64Available: boolean;
  readonly batterySaverMode: boolean;
}

export interface SiliconDeviceProfile {
  readonly id: SiliconDeviceId;
  readonly vendorGroup: SiliconVendorGroup;
  readonly nameKo: string; readonly nameEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly osPlatformKo: string; readonly osPlatformEn: string;
  readonly npuBackendKo: string; readonly npuBackendEn: string;
  readonly webgpuBackendKo: string; readonly webgpuBackendEn: string;
  readonly cpuSimdLoweringKo: string; readonly cpuSimdLoweringEn: string;
  readonly webnnBridgeLabel: string;
  readonly isMobileFormFactor: boolean;
  readonly unifiedMemoryEfficiencyBonus: number;
  readonly defaultFlags: RuntimeCapabilityFlags;
  readonly platformNoteKo: string; readonly platformNoteEn: string;
}

export interface WorkloadContentionWeights {
  readonly npu: number; readonly gpu: number; readonly cpu: number;
  readonly thermal: number; readonly battery: number;
}

export interface HeterogeneousWorkloadSpec {
  readonly id: WorkloadId; readonly order: 1 | 2 | 3 | 4 | 5 | 6;
  readonly nameKo: string; readonly nameEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly preferredTierOrder: readonly [ExecutionTierId, ...ExecutionTierId[]];
  readonly idealLane: AcceleratorLaneId; readonly idealPrecision: WorkloadPrecision;
  readonly supportsOrtWeb: boolean; readonly benefitsFromSubgroups: boolean;
  readonly benefitsFromWasm64: boolean; readonly backgroundWorkerOnly: boolean;
  readonly weights: WorkloadContentionWeights;
}

export interface ScheduledWorkloadAssignment {
  readonly workloadId: WorkloadId; readonly order: 1 | 2 | 3 | 4 | 5 | 6;
  readonly nameKo: string; readonly nameEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly preferredTier: ExecutionTierId; readonly resolvedTier: ExecutionTierId;
  readonly assignedLane: AcceleratorLaneId; readonly effectivePrecision: WorkloadPrecision;
  readonly ortProvider: OrtExecutionProviderName; readonly isFallback: boolean; readonly fallbackDepth: number;
  readonly fallbackReasonKo: string; readonly fallbackReasonEn: string;
  readonly executionDetailKo: string; readonly executionDetailEn: string;
  readonly batchPacingMode: "realtime" | "throttled-batch" | "background-worker";
  readonly laneLoadUnits: number;
}

export interface AcceleratorLaneSummary {
  readonly laneId: AcceleratorLaneId;
  readonly titleKo: string; readonly titleEn: string;
  readonly backendNameKo: string; readonly backendNameEn: string;
  readonly workloads: readonly ScheduledWorkloadAssignment[];
  readonly totalLoadUnits: number; readonly loadSharePct: number;
  readonly isContended: boolean; readonly isActive: boolean;
}

export interface HeterogeneousWarning {
  readonly code: HeterogeneousWarningCode; readonly severity: GuardSeverity;
  readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string;
}

export interface ContentionAvoidanceScore {
  readonly modelKind: "architecture-distribution-plan-model";
  readonly overallAvoidanceScore: number; readonly laneSeparationScore: number;
  readonly thermalAvoidanceScore: number; readonly batteryAvoidanceScore: number;
  readonly avoidanceGrade: AvoidanceGrade; readonly peakLaneSharePct: number;
  readonly spilledToGpuCount: number; readonly spilledToCpuCount: number;
  readonly scalarFallbackCount: number; readonly activeLaneCount: number;
  readonly formulaWeights: { readonly laneSeparationWeight: 0.4; readonly thermalWeight: 0.3; readonly batteryWeight: 0.3 };
  readonly honestyDisclosureKo: string; readonly honestyDisclosureEn: string;
}

export type OrtWebExecutionProviderEntry =
  | { readonly name: "webnn"; readonly deviceType: "npu" | "gpu" | "cpu"; readonly powerPreference: WebNnPowerPreference }
  | { readonly name: "webgpu"; readonly preferredLayout: "NHWC" | "NCHW"; readonly powerPreference: WebNnPowerPreference }
  | { readonly name: "wasm"; readonly simd: boolean; readonly numThreads: number; readonly proxy: boolean };

export interface OrtWebSessionConfig {
  readonly workloadId: WorkloadId; readonly siliconId: SiliconDeviceId;
  readonly primaryProvider: OrtExecutionProviderName; readonly fallbackChain: readonly OrtExecutionProviderName[];
  readonly sessionOptions: {
    readonly executionProviders: readonly OrtWebExecutionProviderEntry[];
    readonly graphOptimizationLevel: "all" | "basic";
    readonly enableCpuMemArena: boolean; readonly enableMemPattern: boolean;
    readonly executionMode: "sequential" | "parallel"; readonly preferredOutputLocation: "gpu-buffer" | "cpu";
  };
  readonly wasmEnvFlags: {
    readonly simd: boolean; readonly relaxedSimd: boolean; readonly memory64: boolean;
    readonly numThreads: number; readonly proxyWorker: boolean;
  };
  readonly webgpuFeatureHints: {
    readonly requireShaderF16: boolean; readonly useSubgroups: boolean; readonly powerPreference: WebNnPowerPreference;
  };
  readonly notesKo: string; readonly notesEn: string;
}

export interface HeterogeneousWorkloadSchedule {
  readonly siliconProfile: SiliconDeviceProfile; readonly flags: RuntimeCapabilityFlags;
  readonly assignments: readonly ScheduledWorkloadAssignment[];
  readonly lanes: { readonly npu: AcceleratorLaneSummary; readonly webgpu: AcceleratorLaneSummary; readonly "wasm-simd": AcceleratorLaneSummary };
  readonly activeFallbackLadder: readonly ExecutionTierId[];
  readonly contentionScore: ContentionAvoidanceScore;
  readonly warnings: readonly HeterogeneousWarning[];
  readonly ortSessionOptionsByWorkload: Readonly<Record<WorkloadId, OrtWebSessionConfig>>;
}

export interface HeterogeneousRuntimeManifest {
  readonly schemaVersion: "toonstudio.heterogeneous-silicon-router-manifest.v1";
  readonly modelKind: "architecture-distribution-plan-model";
  readonly siliconId: SiliconDeviceId; readonly siliconNameKo: string; readonly siliconNameEn: string;
  readonly runtimeFlags: RuntimeCapabilityFlags; readonly activeFallbackLadder: readonly ExecutionTierId[];
  readonly contentionScore: ContentionAvoidanceScore; readonly assignments: readonly ScheduledWorkloadAssignment[];
  readonly ortSessionOptionsByWorkload: Readonly<Record<WorkloadId, OrtWebSessionConfig>>;
  readonly warnings: readonly HeterogeneousWarning[];
  readonly honestyDisclosureKo: string; readonly honestyDisclosureEn: string;
}

export interface HostAcceleratorNavigatorLike {
  readonly userAgent?: string; readonly hardwareConcurrency?: number; readonly deviceMemory?: number;
  readonly ml?: { readonly createContext?: unknown } | null;
  readonly gpu?: { readonly requestAdapter?: unknown } | null;
}

export interface HostAcceleratorProbeResult {
  readonly detectedSiliconId: SiliconDeviceId; readonly hasNavigatorMl: boolean; readonly hasNavigatorGpu: boolean;
  readonly hasWasmSimd128: boolean; readonly isSafariWebKitLikely: boolean;
  readonly recommendedFlags: RuntimeCapabilityFlags; readonly summaryKo: string; readonly summaryEn: string;
}

export const FALLBACK_TIER_ORDER: readonly ExecutionTierId[] = [
  "webnn-npu", "webgpu-f16", "wasm-relaxed-simd128", "wasm-scalar",
];

export const HONESTY_DISCLOSURE_KO =
  "아키텍처 분산 계획 모델 — 실제 단말 TOPS·소비전력(W)·프레임 지연(ms) 실측값이 아니라, 3레인(NPU·WebGPU·WASM/CPU) 워크로드 분리도와 경합 가중치를 합산한 결정론적 계획 지표다.";
export const HONESTY_DISCLOSURE_EN =
  "Architecture Distribution Plan Model — Deterministic scheduling score computed from 3-lane (NPU/WebGPU/WASM-CPU) workload separation and contention weights; not measured device TOPS, wattage, or latency.";

export const SILICON_DEVICE_PROFILES: readonly [SiliconDeviceProfile, ...SiliconDeviceProfile[]] = [
  {
    id: "apple-m-series", vendorGroup: "apple",
    nameKo: "Apple Silicon (Mac · iPad Pro)", nameEn: "Apple Silicon (Mac / iPad Pro)",
    shortLabelKo: "Apple M-시리즈", shortLabelEn: "Apple M-Series",
    osPlatformKo: "macOS · iPadOS 통합 메모리", osPlatformEn: "macOS / iPadOS Unified Memory",
    npuBackendKo: "CoreML → Apple Neural Engine NPU", npuBackendEn: "CoreML -> Apple Neural Engine NPU",
    webgpuBackendKo: "Metal WebGPU (shader-f16 · Subgroups)", webgpuBackendEn: "Metal WebGPU (shader-f16 / Subgroups)",
    cpuSimdLoweringKo: "WASM SIMD128 → ARM64 NEON / AMX 로워링", cpuSimdLoweringEn: "WASM SIMD128 -> ARM64 NEON / AMX lowering",
    webnnBridgeLabel: "CoreML WebNN", isMobileFormFactor: false, unifiedMemoryEfficiencyBonus: 6,
    defaultFlags: { webnnAvailable: true, webgpuAvailable: true, webgpuF16Available: true, webgpuSubgroupsAvailable: true, wasmRelaxedSimdAvailable: true, wasmMemory64Available: true, batterySaverMode: false },
    platformNoteKo: "Chromium 계열은 CoreML WebNN으로 ANE를 우선 사용하며, Safari/iPadOS WebKit에서 WebNN이 비활성인 경우 Metal WebGPU f16으로 자동 폴백한다.",
    platformNoteEn: "Chromium routes WebNN via CoreML to ANE; when Safari/iPadOS WebKit omits navigator.ml, workloads automatically fall back to Metal WebGPU f16.",
  },
  {
    id: "intel-core-ultra", vendorGroup: "intel",
    nameKo: "Intel Core Ultra (Windows 11 24H2+)", nameEn: "Intel Core Ultra (Windows 11 24H2+)",
    shortLabelKo: "Intel Core Ultra", shortLabelEn: "Intel Core Ultra",
    osPlatformKo: "Windows 11 24H2+ · DirectML/ORT", osPlatformEn: "Windows 11 24H2+ / DirectML & ORT",
    npuBackendKo: "DirectML/ORT WebNN → Intel NPU", npuBackendEn: "DirectML/ORT WebNN -> Intel NPU",
    webgpuBackendKo: "Intel Arc WebGPU (Subgroups · shader-f16)", webgpuBackendEn: "Intel Arc WebGPU (Subgroups / shader-f16)",
    cpuSimdLoweringKo: "WASM SIMD128 → x86 AVX2 / AVX-512 로워링", cpuSimdLoweringEn: "WASM SIMD128 -> x86 AVX2 / AVX-512 lowering",
    webnnBridgeLabel: "DirectML/ORT WebNN", isMobileFormFactor: false, unifiedMemoryEfficiencyBonus: 3,
    defaultFlags: { webnnAvailable: true, webgpuAvailable: true, webgpuF16Available: true, webgpuSubgroupsAvailable: true, wasmRelaxedSimdAvailable: true, wasmMemory64Available: true, batterySaverMode: false },
    platformNoteKo: "Windows 11 24H2+ Edge/Chrome에서 DirectML/ORT WebNN으로 Intel NPU에 상시 비전 작업을 분리하고 Arc WebGPU Subgroups로 브러시·BVH를 병렬 가속한다.",
    platformNoteEn: "Windows 11 24H2+ Edge/Chrome isolates vision graphs on Intel NPU via DirectML/ORT WebNN while Arc WebGPU Subgroups accelerate brush and BVH passes.",
  },
  {
    id: "amd-ryzen-ai", vendorGroup: "amd",
    nameKo: "AMD Ryzen AI (Windows 11 24H2+)", nameEn: "AMD Ryzen AI (Windows 11 24H2+)",
    shortLabelKo: "AMD Ryzen AI", shortLabelEn: "AMD Ryzen AI",
    osPlatformKo: "Windows 11 24H2+ · DirectML/ORT", osPlatformEn: "Windows 11 24H2+ / DirectML & ORT",
    npuBackendKo: "DirectML/ORT WebNN → XDNA / XDNA2 NPU", npuBackendEn: "DirectML/ORT WebNN -> XDNA / XDNA2 NPU",
    webgpuBackendKo: "AMD RDNA WebGPU (shader-f16 · Subgroups)", webgpuBackendEn: "AMD RDNA WebGPU (shader-f16 / Subgroups)",
    cpuSimdLoweringKo: "WASM SIMD128 → x86 AVX-512 로워링", cpuSimdLoweringEn: "WASM SIMD128 -> x86 AVX-512 lowering",
    webnnBridgeLabel: "DirectML XDNA WebNN", isMobileFormFactor: false, unifiedMemoryEfficiencyBonus: 4,
    defaultFlags: { webnnAvailable: true, webgpuAvailable: true, webgpuF16Available: true, webgpuSubgroupsAvailable: true, wasmRelaxedSimdAvailable: true, wasmMemory64Available: true, batterySaverMode: false },
    platformNoteKo: "XDNA/XDNA2 NPU가 얼굴·대사·연속성 스캔을 전담하고 RDNA WebGPU f16과 x86 AVX-512 로워링이 브러시·VRM 스키닝을 나누어 처리한다.",
    platformNoteEn: "XDNA/XDNA2 NPU handles face, viseme, and continuity scans while RDNA WebGPU f16 and AVX-512 lowering split brush shaders and VRM skinning.",
  },
  {
    id: "galaxy-snapdragon", vendorGroup: "samsung-galaxy",
    nameKo: "Samsung Galaxy Snapdragon (Tab · S-Series)", nameEn: "Samsung Galaxy Snapdragon (Tab / S-Series)",
    shortLabelKo: "Galaxy Snapdragon", shortLabelEn: "Galaxy Snapdragon",
    osPlatformKo: "Android · Samsung DeX · NNAPI/WebNN", osPlatformEn: "Android / Samsung DeX / NNAPI & WebNN",
    npuBackendKo: "Android NNAPI/WebNN → Hexagon NPU", npuBackendEn: "Android NNAPI/WebNN -> Hexagon NPU",
    webgpuBackendKo: "Adreno WebGPU (shader-f16 · 모바일 타일)", webgpuBackendEn: "Adreno WebGPU (shader-f16 / mobile tile)",
    cpuSimdLoweringKo: "WASM SIMD128 → ARMv9 NEON / SVE2 로워링", cpuSimdLoweringEn: "WASM SIMD128 -> ARMv9 NEON / SVE2 lowering",
    webnnBridgeLabel: "Android NNAPI WebNN", isMobileFormFactor: true, unifiedMemoryEfficiencyBonus: 5,
    defaultFlags: { webnnAvailable: true, webgpuAvailable: true, webgpuF16Available: true, webgpuSubgroupsAvailable: false, wasmRelaxedSimdAvailable: true, wasmMemory64Available: false, batterySaverMode: false },
    platformNoteKo: "모바일 Chrome에서 WebNN 플래그가 비활성이면 Adreno WebGPU f16으로 즉시 전환되며, Adreno 드라이버별 Subgroups 미지원 시 표준 워크그룹으로 안전 폴백한다.",
    platformNoteEn: "When Chrome Android WebNN flags are off, vision tasks fall back immediately to Adreno WebGPU f16; workgroup loops stay safe when Adreno subgroups are absent.",
  },
  {
    id: "galaxy-exynos", vendorGroup: "samsung-galaxy",
    nameKo: "Samsung Galaxy Exynos (Tab · S-Series)", nameEn: "Samsung Galaxy Exynos (Tab / S-Series)",
    shortLabelKo: "Galaxy Exynos", shortLabelEn: "Galaxy Exynos",
    osPlatformKo: "Android · NNAPI/WebNN · Xclipse RDNA", osPlatformEn: "Android / NNAPI & WebNN / Xclipse RDNA",
    npuBackendKo: "Android NNAPI/WebNN → Exynos NPU", npuBackendEn: "Android NNAPI/WebNN -> Exynos NPU",
    webgpuBackendKo: "Xclipse RDNA WebGPU (shader-f16 · Subgroups)", webgpuBackendEn: "Xclipse RDNA WebGPU (shader-f16 / Subgroups)",
    cpuSimdLoweringKo: "WASM SIMD128 → ARMv9 NEON / SVE2 로워링", cpuSimdLoweringEn: "WASM SIMD128 -> ARMv9 NEON / SVE2 lowering",
    webnnBridgeLabel: "Android NNAPI WebNN", isMobileFormFactor: true, unifiedMemoryEfficiencyBonus: 5,
    defaultFlags: { webnnAvailable: true, webgpuAvailable: true, webgpuF16Available: true, webgpuSubgroupsAvailable: true, wasmRelaxedSimdAvailable: true, wasmMemory64Available: false, batterySaverMode: false },
    platformNoteKo: "Exynos NPU로 상시 추론을 분리하고 RDNA 기반 Xclipse WebGPU에서 shader-f16과 Subgroups를 함께 활용하며, 모바일 메모리 정책에 맞춰 WASM32 SIMD를 기본 운용한다.",
    platformNoteEn: "Exynos NPU isolates continuous inference while RDNA-based Xclipse WebGPU runs shader-f16 + Subgroups alongside mobile-safe WASM32 SIMD.",
  },
];

export const TOONSTUDIO_HETEROGENEOUS_WORKLOADS: readonly [HeterogeneousWorkloadSpec, ...HeterogeneousWorkloadSpec[]] = [
  {
    id: "face-eye-protection", order: 1, nameKo: "① 얼굴·눈 보호영역 감지", nameEn: "1. Face & Eye Protection Masking",
    shortLabelKo: "얼굴·눈 보호감지", shortLabelEn: "Face/Eye Mask",
    summaryKo: "INT8/FP16 경량 랜드마크 감지 — 말풍선·효과선 겹침 차단용 상시 추론",
    summaryEn: "INT8/FP16 landmark detector protecting faces/eyes from balloon overlap",
    preferredTierOrder: ["webnn-npu", "webgpu-f16", "wasm-relaxed-simd128", "wasm-scalar"],
    idealLane: "npu", idealPrecision: "int8", supportsOrtWeb: true, benefitsFromSubgroups: false, benefitsFromWasm64: false, backgroundWorkerOnly: false,
    weights: { npu: 22, gpu: 28, cpu: 24, thermal: 18, battery: 16 },
  },
  {
    id: "dialogue-emotion-viseme", order: 2, nameKo: "② 대사 감정·립싱크 비젬", nameEn: "2. Dialogue Emotion & Lip-Sync Viseme",
    shortLabelKo: "대사 감정·비젬", shortLabelEn: "Emotion/Viseme",
    summaryKo: "경량 인코더 기반 대사 감정 분류 및 입모양 비젬 매핑",
    summaryEn: "Lightweight encoder for dialogue tone and phoneme-to-viseme mapping",
    preferredTierOrder: ["webnn-npu", "webgpu-f16", "wasm-relaxed-simd128", "wasm-scalar"],
    idealLane: "npu", idealPrecision: "fp16", supportsOrtWeb: true, benefitsFromSubgroups: false, benefitsFromWasm64: false, backgroundWorkerOnly: false,
    weights: { npu: 18, gpu: 20, cpu: 20, thermal: 14, battery: 12 },
  },
  {
    id: "continuity-drift-vision", order: 3, nameKo: "③ 1~60컷 설정집 드리프트 비전 스캔", nameEn: "3. 1–60 Cut Continuity Drift Vision Scan",
    shortLabelKo: "60컷 드리프트 스캔", shortLabelEn: "60-Cut Drift Scan",
    summaryKo: "화별 1~60컷 캐릭터 의상·소품·배색 일관성 배치 비전 점검",
    summaryEn: "Batch vision scan across 1–60 cuts for character/prop continuity drift",
    preferredTierOrder: ["webnn-npu", "webgpu-f16", "wasm-relaxed-simd128", "wasm-scalar"],
    idealLane: "npu", idealPrecision: "int8", supportsOrtWeb: true, benefitsFromSubgroups: false, benefitsFromWasm64: false, backgroundWorkerOnly: false,
    weights: { npu: 32, gpu: 38, cpu: 36, thermal: 26, battery: 24 },
  },
  {
    id: "brush-km7-impasto-bvh", order: 4, nameKo: "④ 브러시 KM7·임파스토·1만 BVH", nameEn: "4. Brush KM7 · Impasto · 10k BVH",
    shortLabelKo: "KM7·임파스토·BVH", shortLabelEn: "KM7/Impasto/BVH",
    summaryKo: "7/16파장 감산 혼색, 2.5D 높이장 조명, 1만 오브젝트 GPU 인스턴싱 컬링",
    summaryEn: "Kubelka-Munk pigment mixing, 2.5D impasto relief, and 10k Flat-BVH culling",
    preferredTierOrder: ["webgpu-f16", "wasm-relaxed-simd128", "wasm-scalar"],
    idealLane: "webgpu", idealPrecision: "fp16", supportsOrtWeb: false, benefitsFromSubgroups: true, benefitsFromWasm64: false, backgroundWorkerOnly: false,
    weights: { npu: 0, gpu: 46, cpu: 44, thermal: 32, battery: 28 },
  },
  {
    id: "vrm-skinning-psd-clip", order: 5, nameKo: "⑤ 3D VRM 스키닝·.psd/.clip 파싱", nameEn: "5. 3D VRM Skinning & .psd/.clip Parsing",
    shortLabelKo: "VRM 스키닝·PSD", shortLabelEn: "VRM & PSD/CLIP",
    summaryKo: "Rust WASM Relaxed-SIMD128 본 행렬 스키닝 및 대용량 바이너리 코덱 파싱",
    summaryEn: "Rust WASM Relaxed-SIMD128 bone skinning and streaming .psd/.clip binary codecs",
    preferredTierOrder: ["wasm-relaxed-simd128", "wasm-scalar"],
    idealLane: "wasm-simd", idealPrecision: "int32-simd", supportsOrtWeb: false, benefitsFromSubgroups: false, benefitsFromWasm64: true, backgroundWorkerOnly: false,
    weights: { npu: 0, gpu: 0, cpu: 34, thermal: 20, battery: 18 },
  },
  {
    id: "rhythm-offline-crdt", order: 6, nameKo: "⑥ 로컬 작업 리듬·오프라인 CRDT", nameEn: "6. Local Work Rhythm & Offline CRDT",
    shortLabelKo: "작업 리듬·CRDT", shortLabelEn: "Rhythm & CRDT",
    summaryKo: "CPU 백그라운드 워커 전담 — OPFS SQLite 델타 동기화 및 작업 리듬 집계",
    summaryEn: "Dedicated CPU background worker for offline CRDT delta sync and rhythm tracking",
    preferredTierOrder: ["wasm-scalar"],
    idealLane: "wasm-simd", idealPrecision: "scalar", supportsOrtWeb: false, benefitsFromSubgroups: false, benefitsFromWasm64: false, backgroundWorkerOnly: true,
    weights: { npu: 0, gpu: 0, cpu: 14, thermal: 8, battery: 8 },
  },
];

// 최소 WASM SIMD128(v128.const) 검증 바이트코드
const WASM_SIMD128_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
  0x02, 0x01, 0x00, 0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
]);

const clampInt = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(v)));
const stripParenDetail = (label: string): string => (label.includes("(") ? label.slice(0, label.indexOf("(")).trim() : label.trim());
const tierToLane = (t: ExecutionTierId): AcceleratorLaneId => (t === "webnn-npu" ? "npu" : t === "webgpu-f16" ? "webgpu" : "wasm-simd");
const tierToOrtProvider = (t: ExecutionTierId): OrtExecutionProviderName => (t === "webnn-npu" ? "webnn" : t === "webgpu-f16" ? "webgpu" : "wasm");
const isTierAvailable = (t: ExecutionTierId, f: RuntimeCapabilityFlags): boolean =>
  t === "webnn-npu" ? f.webnnAvailable : t === "webgpu-f16" ? f.webgpuAvailable : t === "wasm-relaxed-simd128" ? f.wasmRelaxedSimdAvailable : true;

/** ID로 대표 실리콘 프로파일을 조회한다(알 수 없는 ID는 Apple Silicon 기본값 반환). */
export function getSiliconDeviceProfile(id: SiliconDeviceId | string): SiliconDeviceProfile {
  return SILICON_DEVICE_PROFILES.find((item) => item.id === id) ?? SILICON_DEVICE_PROFILES[0];
}

/** 부분 플래그 입력을 실리콘 프로파일 기본값과 병합해 정규화한다. */
export function normalizeRuntimeCapabilityFlags(
  siliconId: SiliconDeviceId,
  overrides?: Partial<RuntimeCapabilityFlags>,
): RuntimeCapabilityFlags {
  const base = getSiliconDeviceProfile(siliconId).defaultFlags;
  return {
    webnnAvailable: overrides?.webnnAvailable ?? base.webnnAvailable,
    webgpuAvailable: overrides?.webgpuAvailable ?? base.webgpuAvailable,
    webgpuF16Available: overrides?.webgpuF16Available ?? base.webgpuF16Available,
    webgpuSubgroupsAvailable: overrides?.webgpuSubgroupsAvailable ?? base.webgpuSubgroupsAvailable,
    wasmRelaxedSimdAvailable: overrides?.wasmRelaxedSimdAvailable ?? base.wasmRelaxedSimdAvailable,
    wasmMemory64Available: overrides?.wasmMemory64Available ?? base.wasmMemory64Available,
    batterySaverMode: overrides?.batterySaverMode ?? base.batterySaverMode,
  };
}

/** 호스트 `navigator` 힌트와 WASM SIMD128 검증으로 실리콘 프로파일 및 권장 플래그를 진단한다. */
export function probeHostAcceleratorHints(navigatorLike?: HostAcceleratorNavigatorLike | null): HostAcceleratorProbeResult {
  const nav =
    navigatorLike === undefined
      ? typeof navigator !== "undefined" ? (navigator as unknown as HostAcceleratorNavigatorLike) : null
      : navigatorLike;
  const ua = (nav?.userAgent ?? "").toLowerCase();
  const hasNavigatorMl = Boolean(nav?.ml && typeof nav.ml.createContext === "function");
  const hasNavigatorGpu = Boolean(nav?.gpu && typeof nav.gpu.requestAdapter === "function");
  let hasWasmSimd128 = false;
  if (typeof WebAssembly !== "undefined" && typeof WebAssembly.validate === "function") {
    try { hasWasmSimd128 = WebAssembly.validate(WASM_SIMD128_PROBE_BYTES); } catch { hasWasmSimd128 = false; }
  }
  const isSafariWebKitLikely = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("edg");

  let detectedSiliconId: SiliconDeviceId = "apple-m-series";
  if (ua.includes("android") || ua.includes("sm-s") || ua.includes("sm-x") || ua.includes("galaxy")) {
    detectedSiliconId = ua.includes("exynos") || ua.includes("xclipse") ? "galaxy-exynos" : "galaxy-snapdragon";
  } else if (ua.includes("windows")) {
    detectedSiliconId = ua.includes("amd") || ua.includes("ryzen") ? "amd-ryzen-ai" : "intel-core-ultra";
  } else if (ua.includes("mac") || ua.includes("ipad") || ua.includes("iphone")) {
    detectedSiliconId = "apple-m-series";
  }

  const profile = getSiliconDeviceProfile(detectedSiliconId);
  const recommendedFlags: RuntimeCapabilityFlags = {
    webnnAvailable: hasNavigatorMl && !isSafariWebKitLikely,
    webgpuAvailable: hasNavigatorGpu,
    webgpuF16Available: hasNavigatorGpu && profile.defaultFlags.webgpuF16Available,
    webgpuSubgroupsAvailable: hasNavigatorGpu && profile.defaultFlags.webgpuSubgroupsAvailable,
    wasmRelaxedSimdAvailable: hasWasmSimd128,
    wasmMemory64Available: !profile.isMobileFormFactor && (nav?.deviceMemory ?? 8) >= 8,
    batterySaverMode: false,
  };
  const fallbackTarget = hasNavigatorGpu ? "WebGPU f16" : hasWasmSimd128 ? "WASM Relaxed-SIMD" : "WASM Scalar";
  const summaryKo = recommendedFlags.webnnAvailable
    ? `${profile.shortLabelKo} · WebNN NPU + ${hasNavigatorGpu ? "WebGPU" : "CPU SIMD"} 감지됨`
    : isSafariWebKitLikely
      ? `${profile.shortLabelKo} Safari/WebKit 감지 — WebNN 미노출로 ${hasNavigatorGpu ? "Metal WebGPU f16" : "WASM SIMD"} 자동 폴백 준비`
      : `${profile.shortLabelKo} — WebNN 플래그 미활성으로 ${fallbackTarget} 자동 폴백 준비`;
  const summaryEn = recommendedFlags.webnnAvailable
    ? `${profile.shortLabelEn} · WebNN NPU + ${hasNavigatorGpu ? "WebGPU" : "CPU SIMD"} detected`
    : isSafariWebKitLikely
      ? `${profile.shortLabelEn} Safari/WebKit detected — auto-fallback to ${hasNavigatorGpu ? "Metal WebGPU f16" : "WASM SIMD"}`
      : `${profile.shortLabelEn} — WebNN flag inactive; auto-fallback to ${fallbackTarget}`;

  return { detectedSiliconId, hasNavigatorMl, hasNavigatorGpu, hasWasmSimd128, isSafariWebKitLikely, recommendedFlags, summaryKo, summaryEn };
}

/** 워크로드·실리콘·런타임 플래그에 맞춘 ONNX Runtime Web EP(`webnn`/`webgpu`/`wasm`) 설정 객체를 생성한다. */
export function buildOrtWebSessionOptions(options: {
  readonly siliconId: SiliconDeviceId;
  readonly flags: RuntimeCapabilityFlags;
  readonly workloadId?: WorkloadId;
}): OrtWebSessionConfig {
  const { siliconId, flags, workloadId = "face-eye-protection" } = options;
  const profile = getSiliconDeviceProfile(siliconId);
  const workload = TOONSTUDIO_HETEROGENEOUS_WORKLOADS.find((item) => item.id === workloadId) ?? TOONSTUDIO_HETEROGENEOUS_WORKLOADS[0];
  const powerPreference: WebNnPowerPreference = flags.batterySaverMode ? "low-power" : "default";
  const numThreads = profile.isMobileFormFactor ? (flags.batterySaverMode ? 2 : 4) : flags.batterySaverMode ? 4 : 8;
  const providers: OrtWebExecutionProviderEntry[] = [];
  const fallbackChain: OrtExecutionProviderName[] = [];

  if (workload.preferredTierOrder.includes("webnn-npu") && flags.webnnAvailable) {
    providers.push({ name: "webnn", deviceType: "npu", powerPreference });
    fallbackChain.push("webnn");
  }
  if (workload.preferredTierOrder.includes("webgpu-f16") && flags.webgpuAvailable) {
    providers.push({ name: "webgpu", preferredLayout: "NHWC", powerPreference: flags.batterySaverMode ? "low-power" : "high-performance" });
    fallbackChain.push("webgpu");
  }
  const simdEnabled = !workload.backgroundWorkerOnly && flags.wasmRelaxedSimdAvailable;
  providers.push({ name: "wasm", simd: simdEnabled, numThreads: workload.backgroundWorkerOnly ? 1 : numThreads, proxy: true });
  fallbackChain.push("wasm");

  const primaryProvider = fallbackChain[0] ?? "wasm";
  const gpuTag = `${flags.webgpuF16Available ? "shader-f16" : "fp32"}${flags.webgpuSubgroupsAvailable ? "+subgroups" : ""}`;
  const notesKo =
    primaryProvider === "webnn"
      ? `${profile.webnnBridgeLabel}(deviceType="npu", powerPreference="${powerPreference}") 최우선 · 미지원 연산자 시 ${fallbackChain.slice(1).join(" → ")} 자동 폴백`
      : primaryProvider === "webgpu"
        ? `WebNN 미활성/비대상으로 WebGPU EP(${gpuTag}) 우선 실행 후 wasm 폴백`
        : workload.backgroundWorkerOnly
          ? "CPU 백그라운드 워커 전용 경로 — NPU·GPU 파이프라인과 완전 격리"
          : `WebNN·WebGPU 비대상/비활성으로 WASM EP(${simdEnabled ? "Relaxed-SIMD128" : "Scalar"}, ${numThreads}스레드) 실행`;
  const notesEn =
    primaryProvider === "webnn"
      ? `${profile.webnnBridgeLabel} (deviceType="npu", powerPreference="${powerPreference}") primary; unsupported ops fall back to ${fallbackChain.slice(1).join(" -> ")}`
      : primaryProvider === "webgpu"
        ? `WebGPU EP (${gpuTag}) primary with wasm fallback`
        : workload.backgroundWorkerOnly
          ? "Dedicated CPU background worker path isolated from NPU and GPU lanes"
          : `WASM EP (${simdEnabled ? "Relaxed-SIMD128" : "Scalar"}, ${numThreads} threads) fallback path`;

  return {
    workloadId: workload.id, siliconId: profile.id, primaryProvider, fallbackChain,
    sessionOptions: {
      executionProviders: providers,
      graphOptimizationLevel: flags.batterySaverMode ? "basic" : "all",
      enableCpuMemArena: true, enableMemPattern: true,
      executionMode: workload.backgroundWorkerOnly || flags.batterySaverMode ? "sequential" : "parallel",
      preferredOutputLocation: primaryProvider === "webgpu" ? "gpu-buffer" : "cpu",
    },
    wasmEnvFlags: {
      simd: simdEnabled, relaxedSimd: simdEnabled,
      memory64: !workload.backgroundWorkerOnly && flags.wasmMemory64Available,
      numThreads: workload.backgroundWorkerOnly ? 1 : numThreads, proxyWorker: true,
    },
    webgpuFeatureHints: {
      requireShaderF16: flags.webgpuAvailable && flags.webgpuF16Available,
      useSubgroups: flags.webgpuAvailable && flags.webgpuSubgroupsAvailable,
      powerPreference: flags.batterySaverMode ? "low-power" : "high-performance",
    },
    notesKo, notesEn,
  };
}

function resolveWorkloadAssignment(
  workload: HeterogeneousWorkloadSpec,
  profile: SiliconDeviceProfile,
  flags: RuntimeCapabilityFlags,
): ScheduledWorkloadAssignment {
  const preferredTier = workload.preferredTierOrder[0];
  let resolvedTier: ExecutionTierId = "wasm-scalar";
  let fallbackDepth = workload.preferredTierOrder.length - 1;
  for (let i = 0; i < workload.preferredTierOrder.length; i += 1) {
    const candidate = workload.preferredTierOrder[i];
    if (candidate !== undefined && isTierAvailable(candidate, flags)) {
      resolvedTier = candidate;
      fallbackDepth = i;
      break;
    }
  }

  const assignedLane = tierToLane(resolvedTier);
  const isFallback = resolvedTier !== preferredTier;
  const effectivePrecision: WorkloadPrecision =
    resolvedTier === "webnn-npu"
      ? flags.batterySaverMode ? "int8" : workload.idealPrecision
      : resolvedTier === "webgpu-f16"
        ? flags.webgpuF16Available ? "fp16" : "fp32"
        : resolvedTier === "wasm-relaxed-simd128"
          ? workload.idealPrecision === "int32-simd" ? "int32-simd" : "fp32"
          : "scalar";
  const batchPacingMode: ScheduledWorkloadAssignment["batchPacingMode"] = workload.backgroundWorkerOnly
    ? "background-worker"
    : flags.batterySaverMode && workload.id === "continuity-drift-vision" ? "throttled-batch" : "realtime";

  let fallbackReasonKo = "최적 실리콘 레인 배치";
  let fallbackReasonEn = "Placed on preferred silicon lane";
  if (isFallback) {
    if (preferredTier === "webnn-npu" && resolvedTier === "webgpu-f16") {
      fallbackReasonKo = flags.webgpuF16Available ? "WebNN 미활성/Safari·모바일 미지원 → WebGPU f16 자동 폴백" : "WebNN 미활성 + f16 미지원 → WebGPU FP32 자동 폴백";
      fallbackReasonEn = flags.webgpuF16Available ? "WebNN inactive/unavailable -> WebGPU f16 auto-fallback" : "WebNN inactive & no f16 -> WebGPU FP32 auto-fallback";
    } else if (resolvedTier === "wasm-relaxed-simd128") {
      fallbackReasonKo = preferredTier === "webnn-npu" ? "WebNN·WebGPU 모두 비활성 → Rust WASM Relaxed-SIMD128 폴백" : "WebGPU 비활성 → Rust WASM Relaxed-SIMD128 자동 폴백";
      fallbackReasonEn = preferredTier === "webnn-npu" ? "WebNN & WebGPU unavailable -> Rust WASM Relaxed-SIMD128 fallback" : "WebGPU unavailable -> Rust WASM Relaxed-SIMD128 auto-fallback";
    } else {
      fallbackReasonKo = "NPU·WebGPU·Relaxed-SIMD 미지원 → WASM Scalar 안전 폴백";
      fallbackReasonEn = "NPU/WebGPU/Relaxed-SIMD unavailable -> WASM Scalar safe fallback";
    }
  } else if (resolvedTier === "webgpu-f16" && !flags.webgpuF16Available) {
    fallbackReasonKo = "WebGPU shader-f16 미활성 → FP32 셰이더 경로 유지";
    fallbackReasonEn = "WebGPU shader-f16 inactive -> running FP32 shader path";
  } else if (workload.benefitsFromSubgroups && resolvedTier === "webgpu-f16" && !flags.webgpuSubgroupsAvailable) {
    fallbackReasonKo = "WebGPU Subgroups 미활성 → 표준 워크그룹 셰이더 경로";
    fallbackReasonEn = "WebGPU Subgroups inactive -> standard workgroup shader path";
  }

  let executionDetailKo = "범용 WASM Scalar 안전 커널 (단일 스레드 호환)";
  let executionDetailEn = "Universal WASM Scalar safe kernel (single-lane compatible)";
  if (resolvedTier === "webnn-npu") {
    executionDetailKo = `${profile.npuBackendKo} (${effectivePrecision.toUpperCase()}${flags.batterySaverMode ? " · 저전력" : ""})`;
    executionDetailEn = `${profile.npuBackendEn} (${effectivePrecision.toUpperCase()}${flags.batterySaverMode ? " · low-power" : ""})`;
  } else if (resolvedTier === "webgpu-f16") {
    executionDetailKo = `${stripParenDetail(profile.webgpuBackendKo)} (${effectivePrecision.toUpperCase()}${flags.webgpuSubgroupsAvailable ? "+Subgroups" : "·표준워크그룹"})`;
    executionDetailEn = `${stripParenDetail(profile.webgpuBackendEn)} (${effectivePrecision.toUpperCase()}${flags.webgpuSubgroupsAvailable ? "+Subgroups" : "·std-wg"})`;
  } else if (resolvedTier === "wasm-relaxed-simd128") {
    const memTag = workload.benefitsFromWasm64 && flags.wasmMemory64Available ? "+WASM64" : "+WASM32";
    executionDetailKo = `${profile.cpuSimdLoweringKo} (${memTag})`;
    executionDetailEn = `${profile.cpuSimdLoweringEn} (${memTag})`;
  } else if (workload.backgroundWorkerOnly) {
    executionDetailKo = "전용 CPU 백그라운드 워커 (OPFS SQLite · CRDT 격리)";
    executionDetailEn = "Dedicated CPU Background Worker (OPFS SQLite & CRDT isolated)";
  }

  const laneLoadUnits =
    assignedLane === "npu"
      ? workload.weights.npu
      : assignedLane === "webgpu"
        ? Math.round(workload.weights.gpu * (flags.webgpuF16Available ? 1 : 1.18))
        : Math.round(workload.weights.cpu * (resolvedTier === "wasm-scalar" && !workload.backgroundWorkerOnly ? 1.25 : 1));

  return {
    workloadId: workload.id, order: workload.order,
    nameKo: workload.nameKo, nameEn: workload.nameEn,
    shortLabelKo: workload.shortLabelKo, shortLabelEn: workload.shortLabelEn,
    preferredTier, resolvedTier, assignedLane, effectivePrecision,
    ortProvider: tierToOrtProvider(resolvedTier),
    isFallback, fallbackDepth, fallbackReasonKo, fallbackReasonEn,
    executionDetailKo, executionDetailEn, batchPacingMode, laneLoadUnits,
  };
}

function buildWarnings(
  profile: SiliconDeviceProfile,
  flags: RuntimeCapabilityFlags,
  assignments: readonly ScheduledWorkloadAssignment[],
  spilledToGpuCount: number,
): readonly HeterogeneousWarning[] {
  const warnings: HeterogeneousWarning[] = [];
  const push = (
    code: HeterogeneousWarningCode, severity: GuardSeverity,
    titleKo: string, titleEn: string, detailKo: string, detailEn: string,
  ): void => {
    warnings.push({ code, severity, titleKo, titleEn, detailKo, detailEn });
  };
  if (!flags.webnnAvailable) {
    push(
      "WEBNN_UNAVAILABLE_FALLBACK", "warn",
      "WebNN NPU 미활성 — 2단 자동 폴백 가동", "WebNN NPU Inactive — Tier-2 Auto-Fallback",
      `${profile.shortLabelKo}에서 navigator.ml이 비활성이므로 AI 비전·대사 3종이 ${flags.webgpuAvailable ? "WebGPU" : "WASM CPU"}로 자동 우회한다.`,
      `navigator.ml is off on ${profile.shortLabelEn}; 3 AI workloads reroute automatically to ${flags.webgpuAvailable ? "WebGPU" : "WASM CPU"}.`,
    );
  }
  if (!flags.webgpuAvailable) {
    push(
      "WEBGPU_UNAVAILABLE_CPU_FALLBACK", "critical",
      "WebGPU 비활성 — Rust WASM CPU 폴백 전환", "WebGPU Unavailable — Rust WASM CPU Fallback",
      "브러시 KM7·임파스토·1만 BVH와 비전 폴백이 모두 CPU WASM 레인으로 합류해 경합이 높아진다.",
      "Brush KM7, impasto, 10k BVH, and vision tasks converge onto the CPU WASM lane.",
    );
  } else {
    if (!flags.webgpuF16Available) {
      push(
        "WEBGPU_F16_UNAVAILABLE_FP32", "info",
        "WebGPU shader-f16 미지원 — FP32 경로 유지", "WebGPU shader-f16 Off — FP32 Path Active",
        "반정밀도(f16) 대역폭 절감 없이 FP32 셰이더로 실행하므로 대용량 브러시·비전 처리 시 메모리 트래픽이 늘어난다.",
        "Running FP32 shaders without f16 bandwidth reduction increases GPU memory traffic.",
      );
    }
    if (!flags.webgpuSubgroupsAvailable) {
      push(
        "WEBGPU_SUBGROUPS_UNAVAILABLE", "info",
        "WebGPU Subgroups 미활성 — 표준 워크그룹 경로", "WebGPU Subgroups Off — Standard Workgroup Path",
        "1만 BVH 컬링·임파스토 리덕션이 서브그룹 셔플 대신 공유 메모리 표준 패스로 실행된다.",
        "10k BVH culling and impasto reduction run standard shared-memory passes instead of subgroup shuffles.",
      );
    }
  }
  if (!flags.wasmRelaxedSimdAvailable) {
    push(
      "WASM_RELAXED_SIMD_UNAVAILABLE_SCALAR", "warn",
      "WASM Relaxed-SIMD128 비활성 — Scalar 안전 폴백", "WASM Relaxed-SIMD128 Off — Scalar Safe Fallback",
      "3D VRM 스키닝·.psd/.clip 파싱과 CPU 폴백 워크로드가 4단 최후 안전망(WASM Scalar)으로 내려간다.",
      "VRM skinning, .psd/.clip parsing, and CPU fallbacks drop to Tier-4 WASM Scalar.",
    );
  }
  if (spilledToGpuCount > 0 && assignments.some((a) => a.workloadId === "brush-km7-impasto-bvh" && a.assignedLane === "webgpu")) {
    push(
      "GPU_LANE_AI_CONTENTION", "warn",
      `WebGPU 레인 경합 감지 (AI ${spilledToGpuCount}종 + 브러시 동시 점유)`, `WebGPU Lane Contention (${spilledToGpuCount} AI + Brush Sharing GPU)`,
      "NPU 분리 실패로 AI 추론과 실시간 브러시·BVH 셰이더가 동일 GPU 큐를 공유한다.",
      "AI inference and real-time brush/BVH shaders share the same GPU queue without NPU isolation.",
    );
  }
  if (flags.batterySaverMode) {
    push(
      "BATTERY_SAVER_BATCH_PACED", "info",
      "배터리 절전 프로파일 활성 — 저전력 NPU·배치 완화", "Battery Saver Profile Active — Low-Power NPU & Paced Batch",
      "ORT Web EP에 low-power 선호를 적용하고 1~60컷 드리프트 비전 스캔을 간격 완화 배치로 조정한다.",
      "Applies low-power EP preference and paces 1–60 cut continuity drift scans into relaxed batches.",
    );
  }
  return warnings;
}

/** 4대 실리콘 · 6대 ToonStudio 워크로드 이기종 분산 스케줄 및 열·배터리 경합 회피 모델을 계산한다. */
export function scheduleHeterogeneousWorkloads(options?: {
  readonly siliconId?: SiliconDeviceId;
  readonly flags?: Partial<RuntimeCapabilityFlags>;
}): HeterogeneousWorkloadSchedule {
  const siliconId = options?.siliconId ?? "apple-m-series";
  const profile = getSiliconDeviceProfile(siliconId);
  const flags = normalizeRuntimeCapabilityFlags(siliconId, options?.flags);
  const assignments = TOONSTUDIO_HETEROGENEOUS_WORKLOADS.map((spec) => resolveWorkloadAssignment(spec, profile, flags));

  const npuWorkloads = assignments.filter((a) => a.assignedLane === "npu");
  const gpuWorkloads = assignments.filter((a) => a.assignedLane === "webgpu");
  const wasmWorkloads = assignments.filter((a) => a.assignedLane === "wasm-simd");

  const npuLoad = npuWorkloads.reduce((sum, item) => sum + item.laneLoadUnits, 0);
  const gpuLoad = gpuWorkloads.reduce((sum, item) => sum + item.laneLoadUnits, 0);
  const wasmLoad = wasmWorkloads.reduce((sum, item) => sum + item.laneLoadUnits, 0);
  const totalLoad = Math.max(1, npuLoad + gpuLoad + wasmLoad);
  const npuSharePct = Math.round((npuLoad / totalLoad) * 100);
  const gpuSharePct = Math.round((gpuLoad / totalLoad) * 100);
  const wasmSharePct = Math.max(0, 100 - npuSharePct - gpuSharePct);

  const spilledToGpuCount = gpuWorkloads.filter((a) => a.isFallback).length;
  const spilledToCpuCount = wasmWorkloads.filter((a) => a.isFallback).length;
  const scalarFallbackCount = assignments.filter((a) => a.resolvedTier === "wasm-scalar" && a.workloadId !== "rhythm-offline-crdt").length;
  const activeLaneCount = [npuWorkloads.length, gpuWorkloads.length, wasmWorkloads.length].filter((n) => n > 0).length;
  const peakLaneSharePct = Math.max(npuSharePct, gpuSharePct, wasmSharePct);

  // 정직한 아키텍처 분산 계획 모델 (결정론적 가중치 0.4 / 0.3 / 0.3)
  const laneSeparationScore = clampInt(100 - spilledToGpuCount * 14 - spilledToCpuCount * 14 - scalarFallbackCount * 6, 10, 100);
  const thermalAvoidanceScore = clampInt(
    90 - Math.max(0, peakLaneSharePct - 42) * 0.9 - spilledToGpuCount * 6 - spilledToCpuCount * 7
      + (flags.webgpuAvailable && flags.webgpuF16Available ? 6 : 0)
      + (flags.webgpuAvailable && flags.webgpuSubgroupsAvailable ? 4 : 0)
      + (flags.batterySaverMode ? 8 : 0),
    15, 100,
  );
  const batteryAvoidanceScore = clampInt(
    48 + npuWorkloads.length * 11
      + (flags.webgpuAvailable && flags.webgpuF16Available ? 6 : 0)
      + (flags.wasmRelaxedSimdAvailable ? 5 : 0)
      + (flags.batterySaverMode ? 10 : 0)
      + profile.unifiedMemoryEfficiencyBonus - spilledToGpuCount * 4 - scalarFallbackCount * 8,
    15, 100,
  );
  const overallAvoidanceScore = clampInt(laneSeparationScore * 0.4 + thermalAvoidanceScore * 0.3 + batteryAvoidanceScore * 0.3, 10, 100);
  const avoidanceGrade: AvoidanceGrade = overallAvoidanceScore >= 80 ? "optimal" : overallAvoidanceScore >= 60 ? "balanced" : "contended";

  const contentionScore: ContentionAvoidanceScore = {
    modelKind: "architecture-distribution-plan-model",
    overallAvoidanceScore, laneSeparationScore, thermalAvoidanceScore, batteryAvoidanceScore, avoidanceGrade,
    peakLaneSharePct, spilledToGpuCount, spilledToCpuCount, scalarFallbackCount, activeLaneCount,
    formulaWeights: { laneSeparationWeight: 0.4, thermalWeight: 0.3, batteryWeight: 0.3 },
    honestyDisclosureKo: HONESTY_DISCLOSURE_KO, honestyDisclosureEn: HONESTY_DISCLOSURE_EN,
  };

  const lanes: HeterogeneousWorkloadSchedule["lanes"] = {
    npu: {
      laneId: "npu", titleKo: "레인 1 · WebNN NPU", titleEn: "Lane 1 · WebNN NPU",
      backendNameKo: profile.npuBackendKo, backendNameEn: profile.npuBackendEn,
      workloads: npuWorkloads, totalLoadUnits: npuLoad, loadSharePct: npuSharePct,
      isContended: false, isActive: flags.webnnAvailable && npuWorkloads.length > 0,
    },
    webgpu: {
      laneId: "webgpu", titleKo: "레인 2 · WebGPU f16 + Subgroups", titleEn: "Lane 2 · WebGPU f16 + Subgroups",
      backendNameKo: profile.webgpuBackendKo, backendNameEn: profile.webgpuBackendEn,
      workloads: gpuWorkloads, totalLoadUnits: gpuLoad, loadSharePct: gpuSharePct,
      isContended: spilledToGpuCount > 0 && gpuWorkloads.length >= 2, isActive: flags.webgpuAvailable && gpuWorkloads.length > 0,
    },
    "wasm-simd": {
      laneId: "wasm-simd", titleKo: "레인 3 · Rust WASM Relaxed-SIMD · CPU 워커", titleEn: "Lane 3 · Rust WASM Relaxed-SIMD & CPU Worker",
      backendNameKo: profile.cpuSimdLoweringKo, backendNameEn: profile.cpuSimdLoweringEn,
      workloads: wasmWorkloads, totalLoadUnits: wasmLoad, loadSharePct: wasmSharePct,
      isContended: spilledToCpuCount >= 2, isActive: wasmWorkloads.length > 0,
    },
  };

  const makeOrt = (workloadId: WorkloadId): OrtWebSessionConfig =>
    buildOrtWebSessionOptions({ siliconId: profile.id, flags, workloadId });
  const ortSessionOptionsByWorkload: Record<WorkloadId, OrtWebSessionConfig> = {
    "face-eye-protection": makeOrt("face-eye-protection"),
    "dialogue-emotion-viseme": makeOrt("dialogue-emotion-viseme"),
    "continuity-drift-vision": makeOrt("continuity-drift-vision"),
    "brush-km7-impasto-bvh": makeOrt("brush-km7-impasto-bvh"),
    "vrm-skinning-psd-clip": makeOrt("vrm-skinning-psd-clip"),
    "rhythm-offline-crdt": makeOrt("rhythm-offline-crdt"),
  };

  return {
    siliconProfile: profile, flags, assignments, lanes,
    activeFallbackLadder: FALLBACK_TIER_ORDER.filter((tier) => isTierAvailable(tier, flags)),
    contentionScore, warnings: buildWarnings(profile, flags, assignments, spilledToGpuCount),
    ortSessionOptionsByWorkload,
  };
}

/** 현재 스케줄을 이기종 가속 아키텍처 매니페스트 객체로 조립한다. */
export function buildHeterogeneousRuntimeManifest(schedule: HeterogeneousWorkloadSchedule): HeterogeneousRuntimeManifest {
  return {
    schemaVersion: "toonstudio.heterogeneous-silicon-router-manifest.v1",
    modelKind: "architecture-distribution-plan-model",
    siliconId: schedule.siliconProfile.id,
    siliconNameKo: schedule.siliconProfile.nameKo, siliconNameEn: schedule.siliconProfile.nameEn,
    runtimeFlags: schedule.flags, activeFallbackLadder: schedule.activeFallbackLadder,
    contentionScore: schedule.contentionScore, assignments: schedule.assignments,
    ortSessionOptionsByWorkload: schedule.ortSessionOptionsByWorkload, warnings: schedule.warnings,
    honestyDisclosureKo: HONESTY_DISCLOSURE_KO, honestyDisclosureEn: HONESTY_DISCLOSURE_EN,
  };
}

/** 현재 이기종 실리콘 스케줄과 ORT Web EP 설정을 JSON 문자열 및 매니페스트로 내보낸다. */
export function exportHeterogeneousManifestJson(
  schedule: HeterogeneousWorkloadSchedule,
): { readonly json: string; readonly manifest: HeterogeneousRuntimeManifest } {
  const manifest = buildHeterogeneousRuntimeManifest(schedule);
  return { json: JSON.stringify(manifest, null, 2), manifest };
}
