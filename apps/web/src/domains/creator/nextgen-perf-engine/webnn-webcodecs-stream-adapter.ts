/**
 * WebNN(`navigator.ml`) 로컬 NPU/GPU 추론 스케줄러 · WebCodecs(`VideoEncoder` / `MediaStreamTrackProcessor`)
 * 저지연 무손실 캔버스 미러링 프로파일러 · OPFS+WebRTC P2P 동기화 판별기 · 통합 차세대 역량 프로브.
 *
 * Compute Pressure 동적 LOD 및 셰이더 벡터 잉크 GPU 리본 커널은 `vector-ink-lod-kernel.ts`에 분리하고
 * 동일 모듈에서도 재노출해 단일 어댑터 진입점을 유지한다.
 */

import {
  detectWasm64Support,
  type Wasm64CapabilityReport,
  type Wasm64RuntimeProbe,
} from "./wasm64-memory-arena-planner";

export {
  LOD_RECOVERY_STABLE_FRAME_THRESHOLD,
  VECTOR_INK_VERTEX_STRIDE_FLOATS,
  computeDynamicLodProfile,
  createComputePressureMonitor,
  tessellateShaderVectorInkRibbon,
  type ComputePressureState,
  type DynamicLodAaMode,
  type DynamicLodInput,
  type DynamicLodProfile,
  type DynamicLodTier,
  type PressureObserverConstructorLike,
  type PressureObserverLike,
  type PressureRecordLike,
  type VectorInkBezierSegment,
  type VectorInkPoint2D,
  type VectorInkRibbonMesh,
  type VectorInkTessellationOptions,
} from "./vector-ink-lod-kernel";

export const LOCAL_INFERENCE_SERVER_COST_KRW = 0 as const;

export type WebNnExecutionBackend =
  | "webnn-npu"
  | "webnn-gpu"
  | "webgpu-compute"
  | "wasm-simd-cpu";

export type WebNnInferenceTaskKind =
  | "sketch-inpaint"
  | "texture-synthesis"
  | "lineart-denoise"
  | "tone-autofill";

export type WebNnTaskPriority =
  | "interactive-brush"
  | "viewport-visible"
  | "background-prefetch";

export interface WebNnProbeInput {
  readonly hasNavigatorMl?: boolean;
  readonly preferredMlDevice?: "npu" | "gpu" | "cpu" | "none";
  readonly hasWebGpu?: boolean;
  readonly hasWasmSimd?: boolean;
}

export interface WebNnCapabilityReport {
  readonly supported: boolean;
  readonly npuAvailable: boolean;
  readonly gpuFallbackAvailable: boolean;
  readonly wasmCpuFallbackAvailable: boolean;
  readonly preferredBackend: WebNnExecutionBackend;
  readonly fallbackChain: readonly WebNnExecutionBackend[];
  readonly maxConcurrentTasks: number;
  readonly serverCostKrw: typeof LOCAL_INFERENCE_SERVER_COST_KRW;
  readonly summaryKo: string;
}

export interface WebNnInferenceTaskInput {
  readonly id: string;
  readonly kind: WebNnInferenceTaskKind;
  readonly priority: WebNnTaskPriority;
  readonly regionKey: string;
  readonly tileCount: number;
  readonly submittedAtMs: number;
}

export interface ScheduledWebNnTask extends WebNnInferenceTaskInput {
  readonly assignedBackend: WebNnExecutionBackend;
  readonly estimatedLatencyMs: number;
  readonly status: "queued" | "running" | "completed" | "cancelled";
}

export interface WebNnTaskQueueState {
  readonly capability: WebNnCapabilityReport;
  readonly queued: readonly ScheduledWebNnTask[];
  readonly active: readonly ScheduledWebNnTask[];
  readonly completedCount: number;
  readonly supersededCount: number;
  readonly cancelledCount: number;
}

export type MirrorTargetDevice = "secondary-monitor" | "ipad-companion" | "smart-tv-cast";
export type MirrorQualityMode = "lossless-444" | "studio-hq" | "ultra-low-latency";
export type MirrorTransportMode =
  | "webcodecs-webrtc-p2p"
  | "webcodecs-local-stream"
  | "mediarecorder-webrtc-fallback"
  | "canvas-tile-delta-fallback";

export interface WebCodecsProbeInput {
  readonly hasVideoEncoder?: boolean;
  readonly hasVideoFrame?: boolean;
  readonly hasMediaStreamTrackProcessor?: boolean;
  readonly hasRtcPeerConnection?: boolean;
  readonly hardwareAccelerationLikely?: boolean;
}

export interface WebCodecsCapabilityReport {
  readonly supported: boolean;
  readonly hasVideoEncoder: boolean;
  readonly hasVideoFrame: boolean;
  readonly hasTrackProcessor: boolean;
  readonly hasWebRtcP2p: boolean;
  readonly lossless444Ready: boolean;
  readonly summaryKo: string;
}

export interface WebCodecsMirrorPlanInput {
  readonly targetDevice: MirrorTargetDevice;
  readonly qualityMode?: MirrorQualityMode;
  readonly targetFps?: 60 | 120;
  readonly capability?: WebCodecsCapabilityReport;
}

export interface WebCodecsMirrorProfile {
  readonly targetDevice: MirrorTargetDevice;
  readonly qualityMode: MirrorQualityMode;
  readonly transportMode: MirrorTransportMode;
  readonly fallbackActive: boolean;
  readonly codec: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly targetFps: number;
  readonly chromaSubsampling: "4:4:4" | "4:2:0";
  readonly targetBitrateMbps: number;
  readonly keyFrameIntervalFrames: number;
  readonly estimatedGlassToGlassMs: number;
  readonly labelKo: string;
  readonly summaryKo: string;
}

export interface OpfsWebRtcProbeInput {
  readonly hasOpfs?: boolean;
  readonly hasWebRtcP2p?: boolean;
  readonly hasBroadcastChannel?: boolean;
}

export interface OpfsWebRtcP2pSyncReport {
  readonly opfsSupported: boolean;
  readonly webrtcP2pSupported: boolean;
  readonly broadcastChannelSupported: boolean;
  readonly ultraLowLatencyReady: boolean;
  readonly estimatedLocalCommitMs: number;
  readonly estimatedPeerSyncRttMs: number;
  readonly summaryKo: string;
}

export interface NextGenPerfCapabilitySnapshot {
  readonly wasm64: Wasm64CapabilityReport;
  readonly webgpuSupported: boolean;
  readonly webnn: WebNnCapabilityReport;
  readonly webcodecs: WebCodecsCapabilityReport;
  readonly opfsWebRtc: OpfsWebRtcP2pSyncReport;
  readonly computePressureSupported: boolean;
  readonly readinessScore: number;
  readonly readinessTier: "nextgen-ready" | "hybrid-accelerated" | "compat-safe";
}

export interface NextGenCapabilityProbeOverrides {
  readonly wasm64Probe?: Wasm64RuntimeProbe;
  readonly webgpuSupported?: boolean;
  readonly webnnProbe?: WebNnProbeInput;
  readonly webcodecsProbe?: WebCodecsProbeInput;
  readonly opfsWebRtcProbe?: OpfsWebRtcProbeInput;
  readonly computePressureSupported?: boolean;
}

const TASK_PRIORITY_RANK: Readonly<Record<WebNnTaskPriority, number>> = Object.freeze({
  "interactive-brush": 0,
  "viewport-visible": 1,
  "background-prefetch": 2,
});

const TASK_BASE_LATENCY_MS: Readonly<Record<WebNnInferenceTaskKind, number>> = Object.freeze({
  "sketch-inpaint": 11,
  "texture-synthesis": 15,
  "lineart-denoise": 8,
  "tone-autofill": 9,
});

const BACKEND_LATENCY_FACTOR: Readonly<Record<WebNnExecutionBackend, number>> = Object.freeze({
  "webnn-npu": 1.0,
  "webnn-gpu": 1.65,
  "webgpu-compute": 2.25,
  "wasm-simd-cpu": 5.4,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function readNavigatorSurface(): Record<string, unknown> | null {
  if (typeof globalThis === "undefined") return null;
  const nav = (globalThis as { readonly navigator?: unknown }).navigator;
  return nav && typeof nav === "object" ? (nav as Record<string, unknown>) : null;
}

/** `navigator.ml`(WebNN NPU/GPU) 로컬 추론 지원 감지 및 안전 폴백 체인 구성. */
export function detectWebNnCapability(probe: WebNnProbeInput = {}): WebNnCapabilityReport {
  const nav = readNavigatorSurface();
  const mlObj = nav?.ml;
  const hasNavigatorMl =
    probe.hasNavigatorMl
    ?? Boolean(
      mlObj
        && typeof mlObj === "object"
        && typeof (mlObj as { readonly createContext?: unknown }).createContext === "function",
    );
  const hasWebGpu = probe.hasWebGpu ?? Boolean(nav && "gpu" in nav && Boolean(nav.gpu));
  const hasWasmSimd = probe.hasWasmSimd ?? typeof WebAssembly === "object";

  const preferredDevice = probe.preferredMlDevice ?? (hasNavigatorMl ? "npu" : "none");
  const npuAvailable = hasNavigatorMl && preferredDevice === "npu";
  const webnnGpuAvailable = hasNavigatorMl && (preferredDevice === "npu" || preferredDevice === "gpu");

  let preferredBackend: WebNnExecutionBackend;
  let maxConcurrentTasks: number;
  let summaryKo: string;

  if (npuAvailable) {
    preferredBackend = "webnn-npu";
    maxConcurrentTasks = 2;
    summaryKo = "WebNN 전용 NPU로 실시간 스케치 인페인팅·텍스처 합성을 GPU 60fps와 독립 실행합니다.";
  } else if (webnnGpuAvailable) {
    preferredBackend = "webnn-gpu";
    maxConcurrentTasks = 1;
    summaryKo = "WebNN GPU 백엔드로 온디바이스 추론을 수행하며 드로잉 프레임 예산을 보호합니다.";
  } else if (hasWebGpu) {
    preferredBackend = "webgpu-compute";
    maxConcurrentTasks = 1;
    summaryKo = "WebNN 미지원 브라우저 — WebGPU 컴퓨트 셰이더 로컬 폴백으로 서버 비용 ₩0을 유지합니다.";
  } else {
    preferredBackend = "wasm-simd-cpu";
    maxConcurrentTasks = 1;
    summaryKo = "WebNN·WebGPU 미지원 환경 — WASM SIMD CPU 안전 폴백 큐로 직렬 처리합니다.";
  }

  const fallbackChain: WebNnExecutionBackend[] = [];
  if (npuAvailable) fallbackChain.push("webnn-npu");
  if (webnnGpuAvailable) fallbackChain.push("webnn-gpu");
  if (hasWebGpu) fallbackChain.push("webgpu-compute");
  fallbackChain.push("wasm-simd-cpu");

  return Object.freeze({
    supported: hasNavigatorMl,
    npuAvailable,
    gpuFallbackAvailable: hasWebGpu || webnnGpuAvailable,
    wasmCpuFallbackAvailable: hasWasmSimd,
    preferredBackend,
    fallbackChain: Object.freeze(fallbackChain),
    maxConcurrentTasks,
    serverCostKrw: LOCAL_INFERENCE_SERVER_COST_KRW,
    summaryKo,
  });
}

export function createWebNnTaskQueue(capability: WebNnCapabilityReport): WebNnTaskQueueState {
  return Object.freeze({
    capability,
    queued: Object.freeze([]),
    active: Object.freeze([]),
    completedCount: 0,
    supersededCount: 0,
    cancelledCount: 0,
  });
}

function estimateWebNnLatencyMs(
  kind: WebNnInferenceTaskKind,
  tileCount: number,
  backend: WebNnExecutionBackend,
): number {
  const safeTiles = clamp(Math.round(tileCount), 1, 64);
  const scale = 1 + (safeTiles - 1) * 0.28;
  return round2(TASK_BASE_LATENCY_MS[kind] * scale * BACKEND_LATENCY_FACTOR[backend]);
}

/** 실시간 스케치 인페인팅/텍스처 합성 작업을 우선순위 큐에 등록한다(동일 영역 인터랙티브 요청 자동 대체). */
export function enqueueWebNnInferenceTask(
  state: WebNnTaskQueueState,
  input: WebNnInferenceTaskInput,
): WebNnTaskQueueState {
  const tileCount = clamp(Math.round(input.tileCount), 1, 64);
  const assignedBackend = state.capability.preferredBackend;
  const nextTask: ScheduledWebNnTask = Object.freeze({
    ...input,
    tileCount,
    assignedBackend,
    estimatedLatencyMs: estimateWebNnLatencyMs(input.kind, tileCount, assignedBackend),
    status: "queued",
  });

  let superseded = 0;
  const keptQueued = state.queued.filter((existing) => {
    const shouldSupersede =
      input.priority === "interactive-brush"
      && existing.priority === "interactive-brush"
      && existing.kind === input.kind
      && existing.regionKey === input.regionKey;
    if (shouldSupersede) {
      superseded += 1;
      return false;
    }
    return true;
  });

  const sortedQueued = [...keptQueued, nextTask].sort((a, b) => {
    const rankDiff = TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;
    return a.submittedAtMs - b.submittedAtMs;
  });

  return Object.freeze({
    ...state,
    queued: Object.freeze(sortedQueued),
    supersededCount: state.supersededCount + superseded,
  });
}

/** 동시 실행 한도 내에서 최우선 작업을 실행 슬롯으로 디스패치한다. */
export function dispatchNextWebNnTask(state: WebNnTaskQueueState): {
  readonly state: WebNnTaskQueueState;
  readonly dispatched: ScheduledWebNnTask | null;
} {
  if (state.active.length >= state.capability.maxConcurrentTasks || state.queued.length === 0) {
    return Object.freeze({ state, dispatched: null });
  }
  const [head, ...rest] = state.queued;
  const runningTask: ScheduledWebNnTask = Object.freeze({
    ...head,
    status: "running",
  });
  return Object.freeze({
    state: Object.freeze({
      ...state,
      queued: Object.freeze(rest),
      active: Object.freeze([...state.active, runningTask]),
    }),
    dispatched: runningTask,
  });
}

export function completeWebNnInferenceTask(
  state: WebNnTaskQueueState,
  taskId: string,
): WebNnTaskQueueState {
  if (!state.active.some((task) => task.id === taskId)) return state;
  return Object.freeze({
    ...state,
    active: Object.freeze(state.active.filter((task) => task.id !== taskId)),
    completedCount: state.completedCount + 1,
  });
}

export function cancelWebNnInferenceTask(
  state: WebNnTaskQueueState,
  taskId: string,
): WebNnTaskQueueState {
  const before = state.queued.length + state.active.length;
  const nextQueued = state.queued.filter((task) => task.id !== taskId);
  const nextActive = state.active.filter((task) => task.id !== taskId);
  const removed = before - (nextQueued.length + nextActive.length);
  if (removed === 0) return state;
  return Object.freeze({
    ...state,
    queued: Object.freeze(nextQueued),
    active: Object.freeze(nextActive),
    cancelledCount: state.cancelledCount + removed,
  });
}

/** WebCodecs(`VideoEncoder` / `MediaStreamTrackProcessor`) 미러링 기능 감지. */
export function detectWebCodecsCapability(
  probe: WebCodecsProbeInput = {},
): WebCodecsCapabilityReport {
  const g = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};
  const hasVideoEncoder = probe.hasVideoEncoder ?? typeof g.VideoEncoder === "function";
  const hasVideoFrame = probe.hasVideoFrame ?? typeof g.VideoFrame === "function";
  const hasTrackProcessor =
    probe.hasMediaStreamTrackProcessor ?? typeof g.MediaStreamTrackProcessor === "function";
  const hasWebRtcP2p = probe.hasRtcPeerConnection ?? typeof g.RTCPeerConnection === "function";
  const supported = hasVideoEncoder && hasVideoFrame;
  const lossless444Ready = supported && (probe.hardwareAccelerationLikely ?? true);

  let summaryKo: string;
  if (supported && hasTrackProcessor) {
    summaryKo = "VideoEncoder + MediaStreamTrackProcessor로 저지연 4:4:4 무손실·고화질 캔버스 미러링이 가능합니다.";
  } else if (supported) {
    summaryKo = "VideoEncoder 직접 프레임 인코딩으로 보조 모니터·태블릿 캐스팅을 지원합니다.";
  } else {
    summaryKo = "WebCodecs 미지원 브라우저 — WebRTC/타일 차분 안전 폴백 미러링으로 자동 전환합니다.";
  }

  return Object.freeze({
    supported,
    hasVideoEncoder,
    hasVideoFrame,
    hasTrackProcessor,
    hasWebRtcP2p,
    lossless444Ready,
    summaryKo,
  });
}

/** 보조 모니터 · 아이패드 · 스마트TV 캐스팅용 WebCodecs 비트레이트/프레임 프로파일 계산. */
export function planWebCodecsMirrorProfile(
  input: WebCodecsMirrorPlanInput,
): WebCodecsMirrorProfile {
  const capability = input.capability ?? detectWebCodecsCapability();
  const qualityMode: MirrorQualityMode = input.qualityMode ?? "studio-hq";

  const targetDefaults: Record<
    MirrorTargetDevice,
    { readonly widthPx: number; readonly heightPx: number; readonly defaultFps: number; readonly labelKo: string }
  > = {
    "secondary-monitor": { widthPx: 3_840, heightPx: 2_160, defaultFps: 60, labelKo: "보조 모니터(4K 레퍼런스)" },
    "ipad-companion": { widthPx: 2_388, heightPx: 1_668, defaultFps: 120, labelKo: "아이패드 컴패니언" },
    "smart-tv-cast": { widthPx: 3_840, heightPx: 2_160, defaultFps: 60, labelKo: "스마트 TV(10ft 캐스팅)" },
  };

  const preset = targetDefaults[input.targetDevice];
  const targetFps =
    input.targetFps ?? (preset.defaultFps === 120 && capability.supported ? 120 : 60);
  const effectiveFps = capability.supported ? targetFps : Math.min(60, targetFps);

  const pixelRateMpps = (preset.widthPx * preset.heightPx * effectiveFps) / 1_000_000;
  const losslessChroma = qualityMode === "lossless-444" && capability.lossless444Ready;
  const chromaSubsampling: "4:4:4" | "4:2:0" = losslessChroma ? "4:4:4" : "4:2:0";

  const bitsPerPixelPerFrame =
    qualityMode === "lossless-444" ? 0.24 : qualityMode === "studio-hq" ? 0.12 : 0.065;
  const rawBitrateMbps = pixelRateMpps * bitsPerPixelPerFrame * (losslessChroma ? 1.35 : 1.0);
  const targetBitrateMbps = round2(clamp(rawBitrateMbps, 6, 95));

  let transportMode: MirrorTransportMode;
  let codec: string;
  let fallbackActive = false;
  let estimatedGlassToGlassMs: number;
  let summaryKo: string;

  if (capability.supported && capability.hasWebRtcP2p && input.targetDevice !== "secondary-monitor") {
    transportMode = "webcodecs-webrtc-p2p";
    codec = losslessChroma ? "av01.0.12M.08" : "vp09.00.41.08";
    estimatedGlassToGlassMs = qualityMode === "ultra-low-latency" ? 14 : losslessChroma ? 22 : 18;
    summaryKo = `${preset.labelKo}로 WebCodecs(${chromaSubsampling}) + WebRTC P2P 직접 전송(${targetBitrateMbps} Mbps).`;
  } else if (capability.supported) {
    transportMode = "webcodecs-local-stream";
    codec = losslessChroma ? "av01.0.12M.08" : "avc1.640033";
    estimatedGlassToGlassMs = input.targetDevice === "secondary-monitor" ? 9 : 19;
    summaryKo = `${preset.labelKo}에 WebCodecs 하드웨어 인코딩(${chromaSubsampling} · ${effectiveFps}fps) 스트림을 공급합니다.`;
  } else if (capability.hasWebRtcP2p) {
    transportMode = "mediarecorder-webrtc-fallback";
    codec = "vp8-webrtc-fallback";
    fallbackActive = true;
    estimatedGlassToGlassMs = 36;
    summaryKo = "WebCodecs 미지원으로 표준 WebRTC 미디어 스트림 안전 폴백(4:2:0 · 최대 60fps)을 사용합니다.";
  } else {
    transportMode = "canvas-tile-delta-fallback";
    codec = "dirty-tile-webp-delta";
    fallbackActive = true;
    estimatedGlassToGlassMs = 48;
    summaryKo = "WebCodecs·WebRTC 미지원 환경 — 변경된 256px 더티 타일만 압축 전송하는 안전 폴백으로 동작합니다.";
  }

  return Object.freeze({
    targetDevice: input.targetDevice,
    qualityMode,
    transportMode,
    fallbackActive,
    codec,
    widthPx: preset.widthPx,
    heightPx: preset.heightPx,
    targetFps: effectiveFps,
    chromaSubsampling,
    targetBitrateMbps,
    keyFrameIntervalFrames: qualityMode === "ultra-low-latency" ? effectiveFps : effectiveFps * 2,
    estimatedGlassToGlassMs,
    labelKo: preset.labelKo,
    summaryKo,
  });
}

/** OPFS 로컬 영속 저장소 + WebRTC P2P 초저지연 동기화 상태 판별. */
export function evaluateOpfsWebRtcP2pSync(
  probe: OpfsWebRtcProbeInput = {},
): OpfsWebRtcP2pSyncReport {
  const nav = readNavigatorSurface();
  const storage = nav?.storage;
  const g = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};

  const opfsSupported =
    probe.hasOpfs
    ?? Boolean(
      storage
        && typeof storage === "object"
        && typeof (storage as { readonly getDirectory?: unknown }).getDirectory === "function",
    );
  const webrtcP2pSupported = probe.hasWebRtcP2p ?? typeof g.RTCPeerConnection === "function";
  const broadcastChannelSupported =
    probe.hasBroadcastChannel ?? typeof g.BroadcastChannel === "function";
  const ultraLowLatencyReady = opfsSupported && webrtcP2pSupported;

  return Object.freeze({
    opfsSupported,
    webrtcP2pSupported,
    broadcastChannelSupported,
    ultraLowLatencyReady,
    estimatedLocalCommitMs: opfsSupported ? 1.8 : 9.5,
    estimatedPeerSyncRttMs: webrtcP2pSupported ? 12 : 65,
    summaryKo: ultraLowLatencyReady
      ? "OPFS 로컬 SQLite/타일 스냅샷과 WebRTC P2P DataChannel 초저지연 동기화가 모두 준비되었습니다."
      : opfsSupported
        ? "OPFS 로컬 저장은 준비되었으며 협업 동기화는 릴레이 폴백 경로로 안전 동작합니다."
        : "OPFS 미지원 환경 — 메모리 스냅샷 + 수동 아카이브 내보내기 폴백으로 작업을 보호합니다.",
  });
}

/** 현재 기기의 차세대 크롬 성능 7대 축을 SSR 안전하게 일괄 프로브한다. */
export function probeNextGenPerfCapabilities(
  overrides: NextGenCapabilityProbeOverrides = {},
): NextGenPerfCapabilitySnapshot {
  const nav = readNavigatorSurface();
  const g = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};

  const wasm64 = detectWasm64Support(overrides.wasm64Probe);
  const webgpuSupported =
    overrides.webgpuSupported ?? Boolean(nav && "gpu" in nav && Boolean(nav.gpu));
  const webnn = detectWebNnCapability({
    hasWebGpu: webgpuSupported,
    ...overrides.webnnProbe,
  });
  const webcodecs = detectWebCodecsCapability(overrides.webcodecsProbe);
  const opfsWebRtc = evaluateOpfsWebRtcP2pSync(overrides.opfsWebRtcProbe);
  const computePressureSupported =
    overrides.computePressureSupported ?? typeof g.PressureObserver === "function";

  let score = 0;
  if (wasm64.supported) score += 20;
  else if (wasm64.wasmAvailable) score += 8;
  if (webgpuSupported) score += 22;
  if (webnn.supported) score += 14;
  else if (webnn.gpuFallbackAvailable) score += 6;
  if (webcodecs.supported) score += 14;
  if (opfsWebRtc.opfsSupported) score += 12;
  if (opfsWebRtc.webrtcP2pSupported) score += 10;
  if (computePressureSupported) score += 8;

  const readinessScore = Math.min(100, score);
  const readinessTier =
    readinessScore >= 80
      ? "nextgen-ready"
      : readinessScore >= 45
        ? "hybrid-accelerated"
        : "compat-safe";

  return Object.freeze({
    wasm64,
    webgpuSupported,
    webnn,
    webcodecs,
    opfsWebRtc,
    computePressureSupported,
    readinessScore,
    readinessTier,
  });
}
