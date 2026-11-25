/**
 * Wave 58D — 초실시간 WGSL 셰이더 3-Wave 프리컴파일 캐시 & 로컬 WebCodecs 4K 60fps 무빙툰 직결 인코더 플래너.
 *
 * - 현재 구현(Current): ToonStudio 핵심 12종 WGSL 파이프라인 3-Wave 비동기 프리컴파일 스케줄러
 *   (`createComputePipelineAsync` 병렬 컴파일 + 결정론적 내용 해시 캐시 키 + `requestIdleCallback` 유휴 워밍),
 *   콜드 스타트 첫 획 스터터 vs 캐시 히트 비교 모델, 4종 플랫폼 출고 프리셋 × 3종 하드웨어 코덱 자동 폴백 체인
 *   (`AV1 av01 -> HEVC hvc1 -> H.264 avc1`), Zero-Copy 4단계 스트리밍 예산 및 OPFS 잔여 용량 Fail-Closed 안전 게이트.
 * - 목표 런타임(Target): 브라우저 WebGPU `createComputePipelineAsync`, `requestIdleCallback`, WebCodecs `VideoFrame`/`VideoEncoder`,
 *   OPFS `FileSystemSyncAccessHandle` 기반 로컬 MP4 멀티플렉싱 실행(허위 실기 벤치마크 수치 미포함).
 */

export const SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION = "toonstudio.shader-prewarm-webcodecs.v1" as const;
export const SHADER_PREWARM_MODEL_KIND = "deterministic-pipeline-prewarm-and-codec-budget-model" as const;
export const DEFAULT_SHADER_VERSION_TAG = "wgsl-2026.11-r1" as const;
export const MIN_PARALLEL_WAVE_SLOTS = 1 as const;
export const MAX_PARALLEL_WAVE_SLOTS = 4 as const;
export const DEFAULT_PARALLEL_WAVE_SLOTS = 3 as const;
export const DEFAULT_IDLE_CALLBACK_BUDGET_MS = 16 as const;
export const FRAME_BUDGET_60FPS_MS = 16.667 as const;
export const FRAME_BUDGET_120HZ_MS = 8.333 as const;
export const TARGET_AUDIO_LOUDNESS_LUFS = -14 as const;
export const TARGET_AUDIO_TRUE_PEAK_DBTP = -1.0 as const;
export const OPFS_TEMP_HEADROOM_FACTOR = 1.25 as const;
export const OPFS_FIXED_SAFETY_RESERVE_MB = 64 as const;
export const OPFS_WARN_FREE_AFTER_EXPORT_MB = 256 as const;
export const DEFAULT_OPFS_FREE_MB = 2048 as const;
export const DEFAULT_EXPORT_DURATION_SEC = 60 as const;
export const DEFAULT_CLOUD_RENDER_USD_PER_MIN = 0.18 as const;
export const VIOLET_HUE_MIN_DEG = 270 as const;
export const VIOLET_HUE_MAX_DEG = 320 as const;

export const WGSL_PIPELINE_IDS = [
  "brush-km7-f16", "dry-media-tooth", "sparse-tile-composite", "vello-6-stage",
  "radiance-cascades-jfa", "radiance-cascades-probe", "radiance-cascades-merge", "infinite-zoom-mega-atlas",
  "bg3d-lt-lineart", "color-script-lut", "videoframe-yuv-4k-convert", "subtitle-overlay-composite",
] as const;

export const EXPORT_PRESET_IDS = [
  "shorts-reels-1080x1920-60fps",
  "youtube-4k-3840x2160-60fps",
  "webtoon-trailer-1440p-30fps",
  "mobile-lite-720x1280-30fps",
] as const;

export const WEBCODECS_CODEC_IDS = ["av1", "hevc", "h264"] as const;

export type WgslPipelineId = (typeof WGSL_PIPELINE_IDS)[number];
export type PrewarmWaveIndex = 1 | 2 | 3;
export type PrewarmWaveTier = "boot-critical" | "interactive-idle" | "export-idle";
export type PrewarmDispatchApi = "createComputePipelineAsync" | "requestIdleCallback+createComputePipelineAsync";
export type ExportPresetId = (typeof EXPORT_PRESET_IDS)[number];
export type WebCodecsCodecId = (typeof WEBCODECS_CODEC_IDS)[number];
export type AudioCodecId = "aac" | "opus";
export type OpfsSafetyGateStatus = "pass" | "warn" | "blocked";
export type ZeroCopyStageId = "gpu-texture-source" | "video-frame-wrap" | "video-encoder-hw" | "opfs-mp4-muxer";

export interface WgslCorePipelineSpec {
  readonly id: WgslPipelineId; readonly wave: PrewarmWaveIndex; readonly tier: PrewarmWaveTier;
  readonly labelKo: string; readonly labelEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly entryPoint: string; readonly workgroupSize: string; readonly bindingCount: number; readonly wgslSourceBytes: number;
  readonly coldCompileModelMs: number; readonly warmCacheLookupModelMs: number;
  readonly firstStrokeCritical: boolean; readonly idleWarmEligible: boolean; readonly wgslSignatureSeed: string;
}

export interface ShaderPrewarmPlanInput {
  readonly parallelWaveSlots?: number; readonly cacheHitEnabled?: boolean;
  readonly idleCallbackBudgetMs?: number; readonly shaderVersionTag?: string;
  readonly cachedPipelineIds?: readonly WgslPipelineId[];
}

export interface NormalizedShaderPrewarmConfig {
  readonly parallelWaveSlots: number; readonly cacheHitEnabled: boolean;
  readonly idleCallbackBudgetMs: number; readonly shaderVersionTag: string;
}

export interface ShaderPrewarmTask {
  readonly pipeline: WgslCorePipelineSpec; readonly wave: PrewarmWaveIndex; readonly laneIndex: number;
  readonly cacheKey: string; readonly contentHash: string; readonly cacheHit: boolean;
  readonly dispatchApi: PrewarmDispatchApi; readonly compileCostMs: number;
  readonly coldCompileCostMs: number; readonly warmCacheCostMs: number;
  readonly startMs: number; readonly endMs: number;
}

export interface ShaderPrewarmWaveSummary {
  readonly wave: PrewarmWaveIndex; readonly tier: PrewarmWaveTier;
  readonly titleKo: string; readonly titleEn: string; readonly dispatchStrategy: PrewarmDispatchApi;
  readonly pipelineCount: number; readonly cachedCount: number; readonly coldCount: number;
  readonly startMs: number; readonly endMs: number; readonly durationMs: number;
  readonly idleSlicesRequired: number; readonly tasks: readonly ShaderPrewarmTask[];
}

export interface StutterComparisonModel {
  readonly frameBudget60fpsMs: number; readonly frameBudget120hzMs: number;
  readonly coldStartFirstStrokeBlockingMs: number; readonly coldStartDroppedFrames60fps: number;
  readonly coldStartDroppedFrames120hz: number; readonly coldStartTotalOnDemandStallMs: number;
  readonly prewarmFirstStrokeBlockingMs: number; readonly prewarmDroppedFrames60fps: number;
  readonly wave1ReadyWallTimeMs: number; readonly totalPrewarmWallTimeMs: number;
  readonly cacheHitCount: number; readonly totalPipelineCount: number; readonly cacheHitRatio: number;
  readonly firstStrokeStutterReductionPct: number; readonly nonBlockingMainThread: boolean;
}

export interface HonestScopeDisclosure {
  readonly modelKind: typeof SHADER_PREWARM_MODEL_KIND;
  readonly currentImplementationKo: string; readonly currentImplementationEn: string;
  readonly targetRuntimeKo: string; readonly targetRuntimeEn: string;
}

export interface ShaderPrewarmPlan {
  readonly schemaVersion: typeof SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION;
  readonly modelKind: typeof SHADER_PREWARM_MODEL_KIND;
  readonly config: NormalizedShaderPrewarmConfig; readonly cacheNamespaceKey: string;
  readonly waves: readonly ShaderPrewarmWaveSummary[]; readonly tasks: readonly ShaderPrewarmTask[];
  readonly stutterComparison: StutterComparisonModel; readonly honestScopeDisclosure: HonestScopeDisclosure;
}

export interface WebCodecsExportPreset {
  readonly id: ExportPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly platformNoteKo: string; readonly platformNoteEn: string;
  readonly width: number; readonly height: number; readonly fps: 30 | 60; readonly aspectLabel: "9:16" | "16:9";
  readonly gopSeconds: number; readonly baseH264BitrateMbps: number; readonly recommendedAudioKbps: number; readonly is4kUhd: boolean;
}

export interface WebCodecsCodecProfile {
  readonly id: WebCodecsCodecId; readonly labelKo: string; readonly labelEn: string;
  readonly codecFamily: "AV1" | "HEVC" | "H.264"; readonly codecString4k60: string; readonly codecStringStandard: string;
  readonly bitrateEfficiencyFactor: number; readonly defaultAudioCodec: AudioCodecId;
  readonly fallbackNext: WebCodecsCodecId | null; readonly containerKind: "mp4-fragmented";
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface CodecFallbackStep {
  readonly codecId: WebCodecsCodecId; readonly codecString: string;
  readonly hardwareSupported: boolean; readonly selected: boolean;
}

export interface ResolvedCodecChain {
  readonly requestedCodecId: WebCodecsCodecId; readonly activeCodec: WebCodecsCodecProfile;
  readonly activeCodecString: string; readonly fallbackApplied: boolean; readonly hardwareAccelerated: boolean;
  readonly hardwareAccelerationPref: "prefer-hardware" | "prefer-software";
  readonly fallbackSteps: readonly CodecFallbackStep[]; readonly reasonKo: string; readonly reasonEn: string;
}

export interface ZeroCopyPipelineStage {
  readonly id: ZeroCopyStageId; readonly order: 1 | 2 | 3 | 4;
  readonly labelKo: string; readonly labelEn: string; readonly apiName: string;
  readonly metricKo: string; readonly metricEn: string; readonly cpuReadbackCopies: number;
}

export interface OpfsSafetyGateResult {
  readonly status: OpfsSafetyGateStatus; readonly canStartExport: boolean;
  readonly opfsFreeMb: number; readonly estimatedOutputMb: number; readonly safetyReserveMb: number;
  readonly requiredWorkspaceMb: number; readonly remainingAfterExportMb: number; readonly utilizationPct: number;
  readonly failClosedEnforced: boolean; readonly messageKo: string; readonly messageEn: string;
}

export interface ServerCostSavingsModel {
  readonly localServerCostUsd: 0; readonly cloudReferenceRateUsdPerMin: number;
  readonly cloudReferencePerExportUsd: number; readonly monthly100ExportsSavedUsd: number;
  readonly noteKo: string; readonly noteEn: string;
}

export interface LocalWebCodecsExportInput {
  readonly presetId?: ExportPresetId; readonly codecId?: WebCodecsCodecId;
  readonly durationSec?: number; readonly opfsFreeMb?: number; readonly audioCodec?: AudioCodecId;
  readonly hardwareSupport?: Partial<Readonly<Record<WebCodecsCodecId, boolean>>>;
  readonly cloudRenderRateUsdPerMin?: number;
}

export interface LocalWebCodecsExportPlan {
  readonly schemaVersion: typeof SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION;
  readonly modelKind: typeof SHADER_PREWARM_MODEL_KIND;
  readonly preset: WebCodecsExportPreset; readonly codecResolution: ResolvedCodecChain;
  readonly durationSec: number; readonly totalFrames: number; readonly gopFrames: number; readonly keyframeCount: number;
  readonly targetVideoBitrateMbps: number; readonly audioCodec: AudioCodecId; readonly audioBitrateKbps: number;
  readonly audioLoudnessLufs: typeof TARGET_AUDIO_LOUDNESS_LUFS; readonly audioTruePeakDbtp: typeof TARGET_AUDIO_TRUE_PEAK_DBTP;
  readonly estimatedVideoMb: number; readonly estimatedAudioMb: number;
  readonly muxContainerOverheadMb: number; readonly estimatedOutputMb: number;
  readonly zeroCopyStages: readonly ZeroCopyPipelineStage[];
  readonly opfsSafetyGate: OpfsSafetyGateResult; readonly serverCostSavings: ServerCostSavingsModel;
  readonly encoderConfigPreview: {
    readonly codec: string; readonly width: number; readonly height: number; readonly bitrate: number;
    readonly framerate: number; readonly hardwareAcceleration: "prefer-hardware" | "prefer-software"; readonly latencyMode: "quality";
  };
  readonly honestScopeDisclosure: HonestScopeDisclosure;
}

export interface ShaderWebCodecsCombinedInput {
  readonly prewarm?: ShaderPrewarmPlanInput; readonly exportConfig?: LocalWebCodecsExportInput;
}

export interface ShaderWebCodecsCombinedPlan {
  readonly schemaVersion: typeof SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION;
  readonly modelKind: typeof SHADER_PREWARM_MODEL_KIND;
  readonly prewarm: ShaderPrewarmPlan; readonly webCodecsExport: LocalWebCodecsExportPlan;
}

export const HONEST_SCOPE_DISCLOSURE: HonestScopeDisclosure = {
  modelKind: SHADER_PREWARM_MODEL_KIND,
  currentImplementationKo:
    "현재 구현(Current): 12종 WGSL 파이프라인 3-Wave 프리컴파일 스케줄·내용 해시 캐시 키·WebCodecs 코덱 폴백·비트레이트·OPFS Fail-Closed 용량 예산 모델(결정론적 계산, 실기 FPS·컴파일 실측값 미포함).",
  currentImplementationEn:
    "Current implementation: deterministic 12-pipeline 3-Wave WGSL prewarm schedule, content-hash cache keys, WebCodecs fallback chain, bitrate and OPFS fail-closed budget model (no fabricated hardware benchmarks).",
  targetRuntimeKo:
    "목표 런타임(Target): 브라우저 WebGPU `createComputePipelineAsync` + `requestIdleCallback` 백그라운드 워밍과 WebCodecs `VideoFrame` → `VideoEncoder` → OPFS MP4 무빙툰 직결 출고.",
  targetRuntimeEn:
    "Target runtime: live WebGPU `createComputePipelineAsync` + `requestIdleCallback` background warming paired with zero-copy `VideoFrame` -> `VideoEncoder` -> OPFS fragmented MP4 export.",
};

export const WGSL_CORE_PIPELINES: readonly WgslCorePipelineSpec[] = [
  {
    id: "brush-km7-f16", wave: 1, tier: "boot-critical", labelKo: "Brush KM7 f16", labelEn: "Brush KM7 f16",
    summaryKo: "7채널 Kubelka-Munk f16 혼색 잉크 브러시 컴퓨트", summaryEn: "7-channel Kubelka-Munk f16 pigment mixing compute",
    entryPoint: "km7_f16_stamp_accumulate", workgroupSize: "8,8,1", bindingCount: 6, wgslSourceBytes: 6420,
    coldCompileModelMs: 28.4, warmCacheLookupModelMs: 1.4, firstStrokeCritical: true, idleWarmEligible: false,
    wgslSignatureSeed: "km7:f16:bindings6:wg8x8:pigment-lut-v2",
  },
  {
    id: "dry-media-tooth", wave: 1, tier: "boot-critical", labelKo: "Dry-Media Tooth", labelEn: "Dry-Media Tooth",
    summaryKo: "목탄·연필 종이 요철(Tooth) 압력 마모 스탬프", summaryEn: "Charcoal and pencil paper-tooth pressure abrasion stamp",
    entryPoint: "dry_media_tooth_deposit", workgroupSize: "8,8,1", bindingCount: 5, wgslSourceBytes: 4980,
    coldCompileModelMs: 21.6, warmCacheLookupModelMs: 1.1, firstStrokeCritical: true, idleWarmEligible: false,
    wgslSignatureSeed: "dry-tooth:bindings5:wg8x8:paper-grain-v1",
  },
  {
    id: "sparse-tile-composite", wave: 1, tier: "boot-critical", labelKo: "Sparse Tile Composite", labelEn: "Sparse Tile Composite",
    summaryKo: "256px 희소 타일 더티 영역 알파·블렌드 합성", summaryEn: "256px sparse dirty-tile alpha and blend compositor",
    entryPoint: "sparse_tile_blend_256", workgroupSize: "16,16,1", bindingCount: 6, wgslSourceBytes: 5640,
    coldCompileModelMs: 24.2, warmCacheLookupModelMs: 1.2, firstStrokeCritical: true, idleWarmEligible: false,
    wgslSignatureSeed: "sparse-tile:bindings6:wg16x16:porter-duff-v3",
  },
  {
    id: "vello-6-stage", wave: 1, tier: "boot-critical", labelKo: "Vello 6-Stage", labelEn: "Vello 6-Stage",
    summaryKo: "벡터 펜선 평탄화·바운딩·래스터 6단계 파이프라인", summaryEn: "6-stage vector path flatten, bin, and fine rasterize pipeline",
    entryPoint: "vello_fine_raster_stage6", workgroupSize: "16,16,1", bindingCount: 8, wgslSourceBytes: 11240,
    coldCompileModelMs: 41.8, warmCacheLookupModelMs: 2.0, firstStrokeCritical: true, idleWarmEligible: false,
    wgslSignatureSeed: "vello-6stage:bindings8:wg16x16:fine-aa-v2",
  },
  {
    id: "radiance-cascades-jfa", wave: 2, tier: "interactive-idle", labelKo: "Radiance Cascades JFA", labelEn: "Radiance Cascades JFA",
    summaryKo: "점프 플로드 O(log N) 2D/2.5D SDF 차폐 거리장 생성", summaryEn: "Jump Flood O(log N) 2D/2.5D SDF occluder distance field",
    entryPoint: "jfa_jump_flood_step", workgroupSize: "8,8,1", bindingCount: 5, wgslSourceBytes: 4720,
    coldCompileModelMs: 19.5, warmCacheLookupModelMs: 1.0, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "rc-jfa:bindings5:wg8x8:sdf-rg32f-v1",
  },
  {
    id: "radiance-cascades-probe", wave: 2, tier: "interactive-idle", labelKo: "Radiance Cascades Probe", labelEn: "Radiance Cascades Probe",
    summaryKo: "캐스케이드 계층별 다중 각도 광선 프로브 추적", summaryEn: "Per-cascade multi-angle radiance probe raymarch",
    entryPoint: "trace_radiance_cascade", workgroupSize: "8,8,1", bindingCount: 6, wgslSourceBytes: 7860,
    coldCompileModelMs: 32.5, warmCacheLookupModelMs: 1.6, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "rc-probe:bindings6:wg8x8:shared-mem-v1",
  },
  {
    id: "radiance-cascades-merge", wave: 2, tier: "interactive-idle", labelKo: "Radiance Cascades Merge", labelEn: "Radiance Cascades Merge",
    summaryKo: "상하위 캐스케이드 이중선형 병합 및 셀 림라이트", summaryEn: "Bilinear cascade merge and webtoon cel rim-light composite",
    entryPoint: "merge_radiance_cascades", workgroupSize: "8,8,1", bindingCount: 6, wgslSourceBytes: 5910,
    coldCompileModelMs: 25.0, warmCacheLookupModelMs: 1.3, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "rc-merge:bindings6:wg8x8:cel-rim-v1",
  },
  {
    id: "infinite-zoom-mega-atlas", wave: 2, tier: "interactive-idle", labelKo: "Infinite Zoom Mega-Atlas", labelEn: "Infinite Zoom Mega-Atlas",
    summaryKo: "부동 원점 무한 줌 메가 아틀라스 LOD 페이지 리매핑", summaryEn: "Floating-origin infinite zoom mega-atlas LOD page remap",
    entryPoint: "mega_atlas_lod_resolve", workgroupSize: "8,8,1", bindingCount: 7, wgslSourceBytes: 6880,
    coldCompileModelMs: 27.2, warmCacheLookupModelMs: 1.4, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "mega-atlas:bindings7:wg8x8:lod-ring-v2",
  },
  {
    id: "bg3d-lt-lineart", wave: 3, tier: "export-idle", labelKo: "3D LT Lineart", labelEn: "3D LT Lineart",
    summaryKo: "3D 배경 깊이·노멀 경계 웹툰 LT 선화·스크린톤 추출", summaryEn: "3D background depth and normal crease webtoon LT lineart",
    entryPoint: "bg3d_lt_sobel_crease", workgroupSize: "8,8,1", bindingCount: 6, wgslSourceBytes: 7120,
    coldCompileModelMs: 29.4, warmCacheLookupModelMs: 1.5, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "bg3d-lt:bindings6:wg8x8:depth-normal-v2",
  },
  {
    id: "color-script-lut", wave: 3, tier: "export-idle", labelKo: "Color-Script LUT", labelEn: "Color-Script LUT",
    summaryKo: "회차 3D LUT 시네마틱 색보정 및 감마 일관성 매핑", summaryEn: "Episode 3D LUT color-script grading and gamma mapper",
    entryPoint: "apply_color_script_lut3d", workgroupSize: "8,8,1", bindingCount: 4, wgslSourceBytes: 3840,
    coldCompileModelMs: 15.8, warmCacheLookupModelMs: 0.9, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "color-lut3d:bindings4:wg8x8:tetrahedral-v1",
  },
  {
    id: "videoframe-yuv-4k-convert", wave: 3, tier: "export-idle", labelKo: "4K VideoFrame YUV Convert", labelEn: "4K VideoFrame YUV Convert",
    summaryKo: "4K RGBA GPUTexture → BT.709 NV12/I420 제로카피 색공간 변환", summaryEn: "4K RGBA GPUTexture to BT.709 NV12/I420 zero-copy converter",
    entryPoint: "rgba_to_bt709_nv12_4k", workgroupSize: "16,16,1", bindingCount: 5, wgslSourceBytes: 5120,
    coldCompileModelMs: 22.0, warmCacheLookupModelMs: 1.1, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "yuv4k-nv12:bindings5:wg16x16:bt709-v1",
  },
  {
    id: "subtitle-overlay-composite", wave: 3, tier: "export-idle", labelKo: "Subtitle Overlay", labelEn: "Subtitle Overlay",
    summaryKo: "다국어 자막·효과음 외곽선 안티앨리어스 프레임 합성", summaryEn: "Multilingual subtitle and SFX outline anti-aliased overlay",
    entryPoint: "composite_subtitle_sfx_overlay", workgroupSize: "16,16,1", bindingCount: 4, wgslSourceBytes: 3560,
    coldCompileModelMs: 14.4, warmCacheLookupModelMs: 0.8, firstStrokeCritical: false, idleWarmEligible: true,
    wgslSignatureSeed: "subtitle-overlay:bindings4:wg16x16:sdf-text-v1",
  },
];

export const EXPORT_PRESETS: readonly WebCodecsExportPreset[] = [
  {
    id: "shorts-reels-1080x1920-60fps", labelKo: "쇼츠·릴스 1080×1920 · 60fps", labelEn: "Shorts / Reels 1080×1920 · 60fps",
    platformNoteKo: "유튜브 쇼츠 · 인스타 릴스 · 틱톡 9:16 초부드러운 세로 무빙툰", platformNoteEn: "YouTube Shorts, Reels & TikTok 9:16 60fps vertical motion",
    width: 1080, height: 1920, fps: 60, aspectLabel: "9:16", gopSeconds: 2, baseH264BitrateMbps: 14, recommendedAudioKbps: 192, is4kUhd: false,
  },
  {
    id: "youtube-4k-3840x2160-60fps", labelKo: "유튜브 4K 3840×2160 · 60fps", labelEn: "YouTube 4K 3840×2160 · 60fps",
    platformNoteKo: "유튜브 4K UHD 마스터 무빙툰 · 선화 디테일 보존 고비트레이트", platformNoteEn: "YouTube 4K UHD master moving-toon with crisp lineart bitrate",
    width: 3840, height: 2160, fps: 60, aspectLabel: "16:9", gopSeconds: 2, baseH264BitrateMbps: 45, recommendedAudioKbps: 192, is4kUhd: true,
  },
  {
    id: "webtoon-trailer-1440p-30fps", labelKo: "웹툰 예고편 2560×1440 · 30fps", labelEn: "Webtoon Trailer 2560×1440 · 30fps",
    platformNoteKo: "연재 예고편·PV용 QHD 1440p · 영화적 30fps 시네마 톤", platformNoteEn: "Launch trailer and PV in QHD 1440p at cinematic 30fps",
    width: 2560, height: 1440, fps: 30, aspectLabel: "16:9", gopSeconds: 2, baseH264BitrateMbps: 18, recommendedAudioKbps: 192, is4kUhd: false,
  },
  {
    id: "mobile-lite-720x1280-30fps", labelKo: "모바일 경량 720×1280 · 30fps", labelEn: "Mobile Lite 720×1280 · 30fps",
    platformNoteKo: "저용량 빠른 공유·검수 프리뷰용 9:16 경량 출고", platformNoteEn: "Fast mobile review and lightweight 9:16 social preview",
    width: 720, height: 1280, fps: 30, aspectLabel: "9:16", gopSeconds: 2, baseH264BitrateMbps: 5.5, recommendedAudioKbps: 128, is4kUhd: false,
  },
];

export const WEBCODECS_CODEC_PROFILES: readonly WebCodecsCodecProfile[] = [
  {
    id: "av1", labelKo: "AV1 (av01) 하드웨어 우선", labelEn: "AV1 (av01) HW-First", codecFamily: "AV1",
    codecString4k60: "av01.0.12M.08", codecStringStandard: "av01.0.08M.08", bitrateEfficiencyFactor: 0.68,
    defaultAudioCodec: "opus", fallbackNext: "hevc", containerKind: "mp4-fragmented",
    summaryKo: "동일 선화 화질 기준 약 32% 낮은 용량 · 미지원 기기는 HEVC로 자동 전환",
    summaryEn: "~32% smaller file at matching lineart fidelity; falls back to HEVC if unsupported",
  },
  {
    id: "hevc", labelKo: "HEVC (hvc1) 중간 폴백", labelEn: "HEVC (hvc1) Tier-2 Fallback", codecFamily: "HEVC",
    codecString4k60: "hvc1.1.6.L153.B0", codecStringStandard: "hvc1.1.6.L123.B0", bitrateEfficiencyFactor: 0.8,
    defaultAudioCodec: "aac", fallbackNext: "h264", containerKind: "mp4-fragmented",
    summaryKo: "Apple Silicon·최신 GPU 하드웨어 인코딩 최적화 · 미지원 시 H.264 폴백",
    summaryEn: "Apple Silicon and modern GPU hardware path; falls back to H.264 if unsupported",
  },
  {
    id: "h264", labelKo: "H.264 (avc1) 보편 호환", labelEn: "H.264 (avc1) Universal Fallback", codecFamily: "H.264",
    codecString4k60: "avc1.640033", codecStringStandard: "avc1.64002a", bitrateEfficiencyFactor: 1.0,
    defaultAudioCodec: "aac", fallbackNext: null, containerKind: "mp4-fragmented",
    summaryKo: "모든 플랫폼·편집기·브라우저 최광범위 호환 최종 폴백 체인",
    summaryEn: "Broadest playback and NLE compatibility as terminal fallback codec",
  },
];

const WAVE_META: Readonly<Record<PrewarmWaveIndex, { readonly tier: PrewarmWaveTier; readonly titleKo: string; readonly titleEn: string; readonly dispatchStrategy: PrewarmDispatchApi }>> = {
  1: { tier: "boot-critical", titleKo: "Wave 1 · 첫 획 즉시 가동(부팅 직후 병렬)", titleEn: "Wave 1 · First-Stroke Boot Critical (Parallel Async)", dispatchStrategy: "createComputePipelineAsync" },
  2: { tier: "interactive-idle", titleKo: "Wave 2 · 조명·무한 줌 유휴 프리워밍", titleEn: "Wave 2 · GI Lighting & Infinite Zoom (Idle Prewarm)", dispatchStrategy: "requestIdleCallback+createComputePipelineAsync" },
  3: { tier: "export-idle", titleKo: "Wave 3 · 3D 선화·색보정·4K YUV 백그라운드", titleEn: "Wave 3 · 3D LT, LUT & 4K YUV (Idle Background)", dispatchStrategy: "requestIdleCallback+createComputePipelineAsync" },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** ES2017 호환 32비트 FNV-1a 결정론적 내용 해시(BigInt 미사용). */
export function computeDeterministicContentHash(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 파이프라인 WGSL 내용 해시 기반 캐시 키를 생성한다. */
export function buildWgslPipelineCacheKey(
  pipeline: WgslCorePipelineSpec,
  shaderVersionTag: string,
): { readonly contentHash: string; readonly cacheKey: string } {
  const canonicalSeed = `${shaderVersionTag}|${pipeline.id}|${pipeline.entryPoint}|${pipeline.workgroupSize}|b${pipeline.bindingCount}|${pipeline.wgslSignatureSeed}`;
  const contentHash = computeDeterministicContentHash(canonicalSeed);
  return { contentHash, cacheKey: `toonstudio:pso:${pipeline.id}:${contentHash}` };
}

export function getExportPreset(presetId?: ExportPresetId): WebCodecsExportPreset {
  return EXPORT_PRESETS.find((preset) => preset.id === presetId) ?? EXPORT_PRESETS[1];
}

export function getCodecProfile(codecId?: WebCodecsCodecId): WebCodecsCodecProfile {
  return WEBCODECS_CODEC_PROFILES.find((profile) => profile.id === codecId) ?? WEBCODECS_CODEC_PROFILES[0];
}

export function normalizeShaderPrewarmConfig(input?: ShaderPrewarmPlanInput): NormalizedShaderPrewarmConfig {
  const trimmedVersion = input?.shaderVersionTag?.trim();
  return {
    parallelWaveSlots: Math.round(clamp(input?.parallelWaveSlots ?? DEFAULT_PARALLEL_WAVE_SLOTS, MIN_PARALLEL_WAVE_SLOTS, MAX_PARALLEL_WAVE_SLOTS)),
    cacheHitEnabled: input?.cacheHitEnabled ?? true,
    idleCallbackBudgetMs: round2(clamp(input?.idleCallbackBudgetMs ?? DEFAULT_IDLE_CALLBACK_BUDGET_MS, 4, 50)),
    shaderVersionTag: trimmedVersion && trimmedVersion.length > 0 ? trimmedVersion : DEFAULT_SHADER_VERSION_TAG,
  };
}

/**
 * ToonStudio 12종 핵심 WGSL 파이프라인을 3-Wave 우선순위로 스케줄링한다.
 * - Wave 1: `createComputePipelineAsync` 병렬 컴파일(첫 획 전 즉시 완료)
 * - Wave 2/3: `requestIdleCallback` 유휴 슬라이스 기반 백그라운드 워밍
 */
export function planShaderPrewarmWaves(input?: ShaderPrewarmPlanInput): ShaderPrewarmPlan {
  const config = normalizeShaderPrewarmConfig(input);
  const cachedOverrideSet = input?.cachedPipelineIds ? new Set<WgslPipelineId>(input.cachedPipelineIds) : null;
  const waves: ShaderPrewarmWaveSummary[] = [];
  const allTasks: ShaderPrewarmTask[] = [];
  let waveStartCursorMs = 0;

  for (const waveIndex of [1, 2, 3] as const) {
    const meta = WAVE_META[waveIndex];
    const wavePipelines = WGSL_CORE_PIPELINES.filter((item) => item.wave === waveIndex);
    const laneCursors = Array.from({ length: config.parallelWaveSlots }, () => waveStartCursorMs);
    const waveTasks: ShaderPrewarmTask[] = [];

    for (const pipeline of wavePipelines) {
      const { contentHash, cacheKey } = buildWgslPipelineCacheKey(pipeline, config.shaderVersionTag);
      const isCached = cachedOverrideSet ? cachedOverrideSet.has(pipeline.id) : config.cacheHitEnabled;
      const compileCostMs = isCached ? pipeline.warmCacheLookupModelMs : pipeline.coldCompileModelMs;

      let bestLane = 0;
      for (let lane = 1; lane < laneCursors.length; lane += 1) {
        if ((laneCursors[lane] ?? 0) < (laneCursors[bestLane] ?? 0)) bestLane = lane;
      }
      const startMs = round2(laneCursors[bestLane] ?? waveStartCursorMs);
      const endMs = round2(startMs + compileCostMs);
      laneCursors[bestLane] = endMs;

      const task: ShaderPrewarmTask = {
        pipeline, wave: waveIndex, laneIndex: bestLane, cacheKey, contentHash, cacheHit: isCached,
        dispatchApi: meta.dispatchStrategy, compileCostMs: round2(compileCostMs),
        coldCompileCostMs: pipeline.coldCompileModelMs, warmCacheCostMs: pipeline.warmCacheLookupModelMs, startMs, endMs,
      };
      waveTasks.push(task);
      allTasks.push(task);
    }

    const waveEndMs = waveTasks.reduce((maxVal, task) => Math.max(maxVal, task.endMs), waveStartCursorMs);
    const durationMs = round2(Math.max(0, waveEndMs - waveStartCursorMs));
    const cachedCount = waveTasks.filter((task) => task.cacheHit).length;
    const idleSlicesRequired = waveIndex === 1 ? 0 : Math.max(1, Math.ceil(durationMs / config.idleCallbackBudgetMs));

    waves.push({
      wave: waveIndex, tier: meta.tier, titleKo: meta.titleKo, titleEn: meta.titleEn,
      dispatchStrategy: meta.dispatchStrategy, pipelineCount: waveTasks.length,
      cachedCount, coldCount: waveTasks.length - cachedCount,
      startMs: round2(waveStartCursorMs), endMs: round2(waveEndMs), durationMs, idleSlicesRequired, tasks: waveTasks,
    });
    waveStartCursorMs = waveEndMs;
  }

  const wave1ColdSumMs = round2(WGSL_CORE_PIPELINES.filter((p) => p.firstStrokeCritical).reduce((sum, p) => sum + p.coldCompileModelMs, 0));
  const allColdSumMs = round2(WGSL_CORE_PIPELINES.reduce((sum, p) => sum + p.coldCompileModelMs, 0));
  const wave1ReadyWallTimeMs = waves[0]?.endMs ?? 0;
  const totalPrewarmWallTimeMs = round2(waveStartCursorMs);
  const cacheHitCount = allTasks.filter((task) => task.cacheHit).length;
  const totalPipelineCount = allTasks.length;
  const cacheNamespaceSeed = allTasks.map((task) => task.contentHash).join(":");
  const cacheNamespaceKey = `toonstudio:wgsl-wave-cache:${config.shaderVersionTag}:${computeDeterministicContentHash(cacheNamespaceSeed)}`;

  return {
    schemaVersion: SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION,
    modelKind: SHADER_PREWARM_MODEL_KIND,
    config,
    cacheNamespaceKey,
    waves,
    tasks: allTasks,
    stutterComparison: {
      frameBudget60fpsMs: FRAME_BUDGET_60FPS_MS,
      frameBudget120hzMs: FRAME_BUDGET_120HZ_MS,
      coldStartFirstStrokeBlockingMs: wave1ColdSumMs,
      coldStartDroppedFrames60fps: Math.ceil(wave1ColdSumMs / FRAME_BUDGET_60FPS_MS),
      coldStartDroppedFrames120hz: Math.ceil(wave1ColdSumMs / FRAME_BUDGET_120HZ_MS),
      coldStartTotalOnDemandStallMs: allColdSumMs,
      prewarmFirstStrokeBlockingMs: 0,
      prewarmDroppedFrames60fps: 0,
      wave1ReadyWallTimeMs,
      totalPrewarmWallTimeMs,
      cacheHitCount,
      totalPipelineCount,
      cacheHitRatio: round2(totalPipelineCount > 0 ? cacheHitCount / totalPipelineCount : 0),
      firstStrokeStutterReductionPct: wave1ColdSumMs > 0 ? 100 : 0,
      nonBlockingMainThread: true,
    },
    honestScopeDisclosure: HONEST_SCOPE_DISCLOSURE,
  };
}

/** 요청 코덱에서 시작해 `AV1 (av01) -> HEVC (hvc1) -> H.264 (avc1)` 하드웨어 지원 폴백 체인을 해석한다. */
export function resolveCodecFallbackChain(
  requestedCodecId: WebCodecsCodecId,
  preset: WebCodecsExportPreset,
  hardwareSupport?: Partial<Readonly<Record<WebCodecsCodecId, boolean>>>,
): ResolvedCodecChain {
  const hwFlags: Readonly<Record<WebCodecsCodecId, boolean>> = {
    av1: hardwareSupport?.av1 ?? true,
    hevc: hardwareSupport?.hevc ?? true,
    h264: hardwareSupport?.h264 ?? true,
  };
  const chainOrder: readonly WebCodecsCodecId[] =
    requestedCodecId === "av1" ? ["av1", "hevc", "h264"] : requestedCodecId === "hevc" ? ["hevc", "h264"] : ["h264"];

  const steps: CodecFallbackStep[] = [];
  let chosenProfile: WebCodecsCodecProfile | null = null;
  for (const candidateId of chainOrder) {
    const profile = getCodecProfile(candidateId);
    const codecString = preset.is4kUhd ? profile.codecString4k60 : profile.codecStringStandard;
    const supported = hwFlags[candidateId];
    const selected = chosenProfile === null && supported;
    if (selected) chosenProfile = profile;
    steps.push({ codecId: candidateId, codecString, hardwareSupported: supported, selected });
  }

  if (chosenProfile !== null) {
    const fallbackApplied = chosenProfile.id !== requestedCodecId;
    const activeCodecString = preset.is4kUhd ? chosenProfile.codecString4k60 : chosenProfile.codecStringStandard;
    return {
      requestedCodecId, activeCodec: chosenProfile, activeCodecString, fallbackApplied,
      hardwareAccelerated: true, hardwareAccelerationPref: "prefer-hardware", fallbackSteps: steps,
      reasonKo: fallbackApplied
        ? `${getCodecProfile(requestedCodecId).codecFamily} 하드웨어 인코더 미지원으로 ${chosenProfile.codecFamily}(${activeCodecString}) 하드웨어 경로로 자동 폴백했습니다.`
        : `${chosenProfile.codecFamily}(${activeCodecString}) 하드웨어 가속 인코더를 직접 사용합니다.`,
      reasonEn: fallbackApplied
        ? `${getCodecProfile(requestedCodecId).codecFamily} hardware encoder unavailable; automatically fell back to ${chosenProfile.codecFamily} (${activeCodecString}) hardware.`
        : `Using ${chosenProfile.codecFamily} (${activeCodecString}) hardware acceleration directly.`,
    };
  }

  const emergencyH264 = getCodecProfile("h264");
  const emergencyString = preset.is4kUhd ? emergencyH264.codecString4k60 : emergencyH264.codecStringStandard;
  return {
    requestedCodecId, activeCodec: emergencyH264, activeCodecString: emergencyString, fallbackApplied: true,
    hardwareAccelerated: false, hardwareAccelerationPref: "prefer-software",
    fallbackSteps: steps.map((step) => (step.codecId === "h264" ? { ...step, selected: true } : step)),
    reasonKo: `AV1·HEVC·H.264 하드웨어 인코더가 모두 비활성 상태라 H.264(${emergencyString}) 소프트웨어 비상 경로로 전환합니다.`,
    reasonEn: `All hardware encoders unavailable; falling back to H.264 (${emergencyString}) software emergency mode.`,
  };
}

/** 로컬 WebCodecs 4K 60fps 무빙툰·쇼츠 직결 인코딩 예산과 OPFS Fail-Closed 안전 게이트를 계산한다. */
export function planLocalWebCodecsExport(input?: LocalWebCodecsExportInput): LocalWebCodecsExportPlan {
  const preset = getExportPreset(input?.presetId);
  const requestedCodecId = input?.codecId ?? "av1";
  const durationSec = Math.round(clamp(input?.durationSec ?? DEFAULT_EXPORT_DURATION_SEC, 5, 1800));
  const opfsFreeMb = round2(clamp(input?.opfsFreeMb ?? DEFAULT_OPFS_FREE_MB, 0, 102400));
  const cloudRateUsdPerMin = round2(clamp(input?.cloudRenderRateUsdPerMin ?? DEFAULT_CLOUD_RENDER_USD_PER_MIN, 0.01, 5));

  const codecResolution = resolveCodecFallbackChain(requestedCodecId, preset, input?.hardwareSupport);
  const targetVideoBitrateMbps = round2(preset.baseH264BitrateMbps * codecResolution.activeCodec.bitrateEfficiencyFactor);
  const audioCodec: AudioCodecId = input?.audioCodec ?? codecResolution.activeCodec.defaultAudioCodec;
  const audioBitrateKbps = preset.recommendedAudioKbps;
  const totalFrames = durationSec * preset.fps;
  const gopFrames = preset.gopSeconds * preset.fps;
  const keyframeCount = Math.max(1, Math.ceil(totalFrames / gopFrames));

  const estimatedVideoMb = round2((targetVideoBitrateMbps * durationSec) / 8);
  const estimatedAudioMb = round2(((audioBitrateKbps / 1000) * durationSec) / 8);
  const muxContainerOverheadMb = round2((estimatedVideoMb + estimatedAudioMb) * 0.018);
  const estimatedOutputMb = round2(estimatedVideoMb + estimatedAudioMb + muxContainerOverheadMb);

  const requiredWorkspaceMb = round2(estimatedOutputMb * OPFS_TEMP_HEADROOM_FACTOR + OPFS_FIXED_SAFETY_RESERVE_MB);
  const safetyReserveMb = round2(requiredWorkspaceMb - estimatedOutputMb);
  const remainingAfterExportMb = round2(opfsFreeMb - requiredWorkspaceMb);
  const utilizationPct = opfsFreeMb <= 0 ? 100 : round2((requiredWorkspaceMb / opfsFreeMb) * 100);

  let status: OpfsSafetyGateStatus = "pass";
  let canStartExport = true;
  let messageKo = `OPFS 여유 공간(${opfsFreeMb} MB)이 출고 작업 공간(${requiredWorkspaceMb} MB)을 충분히 확보해 안전하게 로컬 출고할 수 있습니다.`;
  let messageEn = `OPFS free space (${opfsFreeMb} MB) covers required workspace (${requiredWorkspaceMb} MB); safe for local export.`;

  if (opfsFreeMb < requiredWorkspaceMb) {
    status = "blocked";
    canStartExport = false;
    const shortageMb = round2(requiredWorkspaceMb - opfsFreeMb);
    messageKo = `OPFS 잔여 용량이 ${shortageMb} MB 부족해 Fail-Closed로 출고를 차단했습니다. 캐시를 정리하거나 AV1/모바일 경량 프리셋으로 전환하세요.`;
    messageEn = `Export blocked fail-closed: OPFS is short by ${shortageMb} MB. Free space or switch to AV1 or Mobile Lite preset.`;
  } else if (remainingAfterExportMb < OPFS_WARN_FREE_AFTER_EXPORT_MB || utilizationPct >= 80) {
    status = "warn";
    canStartExport = true;
    messageKo = `출고는 가능하지만 완료 후 OPFS 여유가 ${remainingAfterExportMb} MB만 남습니다. 오래된 스냅샷 정리를 권장합니다.`;
    messageEn = `Export allowed with caution: only ${remainingAfterExportMb} MB will remain in OPFS after muxing.`;
  }

  const frameDurationUs = Math.round(1_000_000 / preset.fps);
  const zeroCopyStages: readonly ZeroCopyPipelineStage[] = [
    { id: "gpu-texture-source", order: 1, labelKo: "GPUTexture", labelEn: "GPUTexture", apiName: "WebGPU rgba_to_bt709_nv12", metricKo: `${preset.width}×${preset.height} · Readback 0회`, metricEn: `${preset.width}×${preset.height} · 0 CPU Readbacks`, cpuReadbackCopies: 0 },
    { id: "video-frame-wrap", order: 2, labelKo: "VideoFrame", labelEn: "VideoFrame", apiName: "new VideoFrame(canvas, { timestamp })", metricKo: `${preset.fps}fps · ${frameDurationUs}µs/프레임`, metricEn: `${preset.fps}fps · ${frameDurationUs}µs/frame`, cpuReadbackCopies: 0 },
    { id: "video-encoder-hw", order: 3, labelKo: "VideoEncoder", labelEn: "VideoEncoder", apiName: `${codecResolution.activeCodec.codecFamily} (${codecResolution.activeCodecString})`, metricKo: `${targetVideoBitrateMbps} Mbps · GOP ${gopFrames}f · ${audioCodec.toUpperCase()} ${TARGET_AUDIO_LOUDNESS_LUFS} LUFS`, metricEn: `${targetVideoBitrateMbps} Mbps · GOP ${gopFrames}f · ${audioCodec.toUpperCase()} ${TARGET_AUDIO_LOUDNESS_LUFS} LUFS`, cpuReadbackCopies: 0 },
    { id: "opfs-mp4-muxer", order: 4, labelKo: "OPFS MP4 Muxer", labelEn: "OPFS MP4 Muxer", apiName: "FileSystemSyncAccessHandle (moof/mdat)", metricKo: `출력 ${estimatedOutputMb} MB · 작업공간 ${requiredWorkspaceMb} MB`, metricEn: `Output ${estimatedOutputMb} MB · Workspace ${requiredWorkspaceMb} MB`, cpuReadbackCopies: 0 },
  ];

  const resolutionCostWeight = preset.is4kUhd ? 1.0 : preset.width >= 2560 ? 0.65 : preset.height >= 1920 ? 0.5 : 0.35;
  const cloudReferencePerExportUsd = round2((durationSec / 60) * cloudRateUsdPerMin * resolutionCostWeight);
  const monthly100ExportsSavedUsd = round2(cloudReferencePerExportUsd * 100);

  return {
    schemaVersion: SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION,
    modelKind: SHADER_PREWARM_MODEL_KIND,
    preset, codecResolution, durationSec, totalFrames, gopFrames, keyframeCount,
    targetVideoBitrateMbps, audioCodec, audioBitrateKbps,
    audioLoudnessLufs: TARGET_AUDIO_LOUDNESS_LUFS, audioTruePeakDbtp: TARGET_AUDIO_TRUE_PEAK_DBTP,
    estimatedVideoMb, estimatedAudioMb, muxContainerOverheadMb, estimatedOutputMb, zeroCopyStages,
    opfsSafetyGate: {
      status, canStartExport, opfsFreeMb, estimatedOutputMb, safetyReserveMb,
      requiredWorkspaceMb, remainingAfterExportMb, utilizationPct, failClosedEnforced: true, messageKo, messageEn,
    },
    serverCostSavings: {
      localServerCostUsd: 0, cloudReferenceRateUsdPerMin: cloudRateUsdPerMin,
      cloudReferencePerExportUsd, monthly100ExportsSavedUsd,
      noteKo: "로컬 브라우저 WebCodecs 직결 인코딩으로 서버 렌더팜 과금은 $0.00입니다(클라우드 절감액은 참고 단가 기반 추정치).",
      noteEn: "Local browser WebCodecs export incurs $0.00 server render cost (cloud savings are reference rate estimates).",
    },
    encoderConfigPreview: {
      codec: codecResolution.activeCodecString, width: preset.width, height: preset.height,
      bitrate: Math.round(targetVideoBitrateMbps * 1_000_000), framerate: preset.fps,
      hardwareAcceleration: codecResolution.hardwareAccelerationPref, latencyMode: "quality",
    },
    honestScopeDisclosure: HONEST_SCOPE_DISCLOSURE,
  };
}

/** WGSL 3-Wave 프리컴파일 계획과 로컬 WebCodecs 4K 출고 계획을 하나의 통합 스냅샷으로 결합한다. */
export function buildShaderWebCodecsPlan(input?: ShaderWebCodecsCombinedInput): ShaderWebCodecsCombinedPlan {
  return {
    schemaVersion: SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION,
    modelKind: SHADER_PREWARM_MODEL_KIND,
    prewarm: planShaderPrewarmWaves(input?.prewarm),
    webCodecsExport: planLocalWebCodecsExport(input?.exportConfig),
  };
}

/** 통합 셰이더 프리컴파일 캐시 & 로컬 WebCodecs 4K 출고 매니페스트를 JSON 문자열로 직렬화한다. */
export function exportShaderWebCodecsManifestJson(plan: ShaderWebCodecsCombinedPlan): string {
  const { prewarm, webCodecsExport } = plan;
  return JSON.stringify(
    {
      schemaVersion: plan.schemaVersion,
      modelKind: plan.modelKind,
      prewarm: {
        cacheNamespaceKey: prewarm.cacheNamespaceKey,
        config: prewarm.config,
        stutterComparison: prewarm.stutterComparison,
        waves: prewarm.waves.map((w) => ({
          wave: w.wave, tier: w.tier, dispatchStrategy: w.dispatchStrategy,
          startMs: w.startMs, endMs: w.endMs, durationMs: w.durationMs,
          idleSlicesRequired: w.idleSlicesRequired, cachedCount: w.cachedCount, coldCount: w.coldCount,
          pipelines: w.tasks.map((t) => ({
            id: t.pipeline.id, entryPoint: t.pipeline.entryPoint, workgroupSize: t.pipeline.workgroupSize,
            laneIndex: t.laneIndex, cacheKey: t.cacheKey, contentHash: t.contentHash,
            cacheHit: t.cacheHit, startMs: t.startMs, endMs: t.endMs, compileCostMs: t.compileCostMs,
          })),
        })),
      },
      webCodecsExport: {
        presetId: webCodecsExport.preset.id,
        resolution: `${webCodecsExport.preset.width}x${webCodecsExport.preset.height}`,
        fps: webCodecsExport.preset.fps, durationSec: webCodecsExport.durationSec,
        totalFrames: webCodecsExport.totalFrames, gopFrames: webCodecsExport.gopFrames, keyframeCount: webCodecsExport.keyframeCount,
        codecResolution: {
          requestedCodecId: webCodecsExport.codecResolution.requestedCodecId,
          activeCodecId: webCodecsExport.codecResolution.activeCodec.id,
          activeCodecString: webCodecsExport.codecResolution.activeCodecString,
          fallbackApplied: webCodecsExport.codecResolution.fallbackApplied,
          hardwareAccelerated: webCodecsExport.codecResolution.hardwareAccelerated,
        },
        encoderConfigPreview: webCodecsExport.encoderConfigPreview,
        audio: {
          codec: webCodecsExport.audioCodec, bitrateKbps: webCodecsExport.audioBitrateKbps,
          loudnessLufs: webCodecsExport.audioLoudnessLufs, truePeakDbtp: webCodecsExport.audioTruePeakDbtp,
        },
        sizeBudgetMb: {
          videoMb: webCodecsExport.estimatedVideoMb, audioMb: webCodecsExport.estimatedAudioMb,
          muxOverheadMb: webCodecsExport.muxContainerOverheadMb, totalOutputMb: webCodecsExport.estimatedOutputMb,
        },
        zeroCopyPath: webCodecsExport.zeroCopyStages.map((s) => ({
          order: s.order, id: s.id, apiName: s.apiName, cpuReadbackCopies: s.cpuReadbackCopies,
        })),
        opfsSafetyGate: webCodecsExport.opfsSafetyGate,
        serverCostSavings: webCodecsExport.serverCostSavings,
      },
      honestScopeDisclosure: prewarm.honestScopeDisclosure,
    },
    null,
    2,
  );
}
