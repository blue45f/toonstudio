/**
 * Chrome 차세대 웹 신기술 8종 통합 피처 디텍션 & 터보 프로필 빌더.
 *
 * - UA 스니핑 없이 순수 런타임 기능 감지만 수행한다.
 * - Display-P3 저지연 컨텍스트 · 240Hz+ 스타일러스 · Compute Pressure 타일 거버너
 *   어댑터는 `chrome-nextgen-adapters.ts`에서 가져와 일괄 재노출한다.
 */

import { STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES } from "../studio-wasm64-memory-governor";

import { probeWasmMemory64Capability } from "./WasmMemory64Capability";
import {
  computeTilePolicyForPressure,
  createComputePressureTileGovernor,
  createLowLatencyWideGamut2dContext,
  extractHighFreqStylusSamples,
  type ChromeComputePressureState,
  type ComputePressureTileGovernor,
  type ComputePressureTileGovernorOptions,
  type ComputePressureTilePolicy,
  type HighFreqStylusBatch,
  type HighFreqStylusSample,
  type LowLatency2dContextLike,
  type LowLatencyCanvasLike,
  type LowLatencyWideGamut2dOptions,
  type LowLatencyWideGamut2dResult,
  type PressureObserverConstructorLike,
  type PressureObserverInstanceLike,
  type StylusPointerEventLike,
} from "./chrome-nextgen-adapters";

export {
  computeTilePolicyForPressure,
  createComputePressureTileGovernor,
  createLowLatencyWideGamut2dContext,
  extractHighFreqStylusSamples,
  type ChromeComputePressureState,
  type ComputePressureTileGovernor,
  type ComputePressureTileGovernorOptions,
  type ComputePressureTilePolicy,
  type HighFreqStylusBatch,
  type HighFreqStylusSample,
  type LowLatency2dContextLike,
  type LowLatencyCanvasLike,
  type LowLatencyWideGamut2dOptions,
  type LowLatencyWideGamut2dResult,
  type PressureObserverConstructorLike,
  type PressureObserverInstanceLike,
  type StylusPointerEventLike,
};

export type ChromeNextGenCapabilityId =
  | "wasm-memory64"
  | "webgpu-compute"
  | "display-p3-desynchronized"
  | "high-freq-stylus"
  | "shared-array-buffer"
  | "opfs-sync-access"
  | "webcodecs-media"
  | "compute-pressure-fsa";

export type ChromeNextGenCapabilityStatus = "active" | "partial" | "unsupported";

export interface ChromeNextGenCapabilityItem {
  readonly id: ChromeNextGenCapabilityId;
  readonly title: string;
  readonly summary: string;
  readonly supported: boolean;
  readonly status: ChromeNextGenCapabilityStatus;
  readonly detail: string;
}

export type ChromeNextGenTurboTier =
  | "chrome-max-turbo"
  | "chrome-accelerated"
  | "standard-compatible";

export type ChromePreferredRasterBackend =
  | "webgpu-f16+wasm64"
  | "webgpu+wasm64"
  | "wasm64-i64"
  | "webgpu"
  | "canvas2d-standard";

export interface ChromeWebGpuFeatureProbe {
  readonly apiPresent: boolean;
  readonly adapterReady: boolean;
  readonly shaderF16: boolean;
  readonly bgra8unormStorage: boolean;
  readonly maxBufferSizeBytes: number | null;
}

export interface ChromeNextGenTurboProfile {
  readonly tier: ChromeNextGenTurboTier;
  readonly activeCount: number;
  readonly totalCount: 8;
  readonly preferredRasterBackend: ChromePreferredRasterBackend;
  readonly preferredColorSpace: "display-p3" | "srgb";
  readonly desynchronizedCanvasRecommended: boolean;
  readonly recommendedTileSizePx: 256 | 512 | 1024;
  readonly recommendedWorkerCount: number;
  readonly maxMemory64AddressLimitGiB: number;
  readonly memory64Supported: boolean;
  readonly simd128Supported: boolean;
  readonly webGpu: ChromeWebGpuFeatureProbe;
  readonly multiWorkerTilesEnabled: boolean;
  readonly opfsZeroCopyPagingReady: boolean;
  readonly webCodecsTimelapseReady: boolean;
  readonly highFreqStylusReady: boolean;
  readonly computePressureSupported: boolean;
  readonly fileSystemSavePickerSupported: boolean;
}

export interface ChromeNextGenCapabilitiesReport {
  readonly capabilities: readonly ChromeNextGenCapabilityItem[];
  readonly profile: ChromeNextGenTurboProfile;
}

export interface WebGpuAdapterLike {
  readonly features?: { has(name: string): boolean };
  readonly limits?: { readonly maxBufferSize?: number };
}

export interface WebGpuNavigatorLike {
  requestAdapter(options?: {
    readonly powerPreference?: "high-performance" | "low-power";
  }): Promise<WebGpuAdapterLike | null>;
}

export interface ChromeNextGenProbeEnv {
  readonly webAssembly?: typeof WebAssembly | null;
  readonly gpu?: WebGpuNavigatorLike | null;
  readonly matchMedia?: ((query: string) => { readonly matches: boolean }) | null;
  readonly createCanvas?: (() => HTMLCanvasElement | LowLatencyCanvasLike | null) | null;
  readonly hasPointerRawUpdate?: boolean;
  readonly hasCoalescedEvents?: boolean;
  readonly hasPredictedEvents?: boolean;
  readonly crossOriginIsolated?: boolean;
  readonly hasSharedArrayBuffer?: boolean;
  readonly hasAtomics?: boolean;
  readonly hardwareConcurrency?: number;
  readonly hasOpfsGetDirectory?: boolean;
  readonly hasOpfsSyncAccessHandle?: boolean;
  readonly hasVideoEncoder?: boolean;
  readonly hasImageDecoder?: boolean;
  readonly hasPressureObserver?: boolean;
  readonly hasShowSaveFilePicker?: boolean;
}

type GlobalRecord = Record<string, unknown>;

function readGlobal(): GlobalRecord {
  return globalThis as unknown as GlobalRecord;
}

function readNavigator(): GlobalRecord | null {
  try {
    if (typeof navigator === "undefined" || navigator === null) return null;
    return navigator as unknown as GlobalRecord;
  } catch {
    return null;
  }
}

function readWindow(): GlobalRecord | null {
  try {
    if (typeof window === "undefined" || window === null) return null;
    return window as unknown as GlobalRecord;
  } catch {
    return null;
  }
}

function resolveGpuHost(env?: ChromeNextGenProbeEnv): WebGpuNavigatorLike | null {
  if (env && "gpu" in env) return env.gpu ?? null;
  const nav = readNavigator();
  const gpu = nav?.["gpu"] as WebGpuNavigatorLike | undefined;
  return gpu && typeof gpu.requestAdapter === "function" ? gpu : null;
}

export async function probeChromeWebGpuFeatures(
  env?: ChromeNextGenProbeEnv,
): Promise<ChromeWebGpuFeatureProbe> {
  const gpu = resolveGpuHost(env);
  if (!gpu) {
    return Object.freeze({
      apiPresent: false,
      adapterReady: false,
      shaderF16: false,
      bgra8unormStorage: false,
      maxBufferSizeBytes: null,
    });
  }
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return Object.freeze({
        apiPresent: true,
        adapterReady: false,
        shaderF16: false,
        bgra8unormStorage: false,
        maxBufferSizeBytes: null,
      });
    }
    const rawLimit = adapter.limits?.maxBufferSize;
    return Object.freeze({
      apiPresent: true,
      adapterReady: true,
      shaderF16: Boolean(adapter.features?.has("shader-f16")),
      bgra8unormStorage: Boolean(adapter.features?.has("bgra8unorm-storage")),
      maxBufferSizeBytes:
        typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit > 0
          ? rawLimit
          : null,
    });
  } catch {
    return Object.freeze({
      apiPresent: true,
      adapterReady: false,
      shaderF16: false,
      bgra8unormStorage: false,
      maxBufferSizeBytes: null,
    });
  }
}

function detectDisplayP3AndDesync(env?: ChromeNextGenProbeEnv): {
  readonly p3Media: boolean;
  readonly p3Canvas: boolean;
  readonly desynchronized: boolean;
} {
  let p3Media: boolean;
  try {
    const matchFn =
      env && "matchMedia" in env
        ? env.matchMedia
        : typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia.bind(window)
          : null;
    p3Media = Boolean(matchFn?.("(color-gamut: p3)").matches);
  } catch {
    p3Media = false;
  }

  let canvas: HTMLCanvasElement | LowLatencyCanvasLike | null;
  try {
    if (env && "createCanvas" in env) {
      canvas = env.createCanvas ? env.createCanvas() : null;
    } else if (typeof document !== "undefined" && typeof document.createElement === "function") {
      canvas = document.createElement("canvas");
    } else {
      canvas = null;
    }
  } catch {
    canvas = null;
  }

  const probeCtx = createLowLatencyWideGamut2dContext(canvas, {
    preferDisplayP3: true,
    desynchronized: true,
  });
  return {
    p3Media,
    p3Canvas: probeCtx.context !== null && probeCtx.wideGamut,
    desynchronized: probeCtx.context !== null && probeCtx.desynchronized,
  };
}

function buildReportFromSignals(
  env: ChromeNextGenProbeEnv | undefined,
  webGpu: ChromeWebGpuFeatureProbe,
): ChromeNextGenCapabilitiesReport {
  const g = readGlobal();
  const nav = readNavigator();
  const win = readWindow();

  const wasmReceipt = probeWasmMemory64Capability({
    webAssembly: env?.webAssembly,
    selectedRuntime: "memory64",
  });
  const memory64Supported = wasmReceipt.isMemory64Supported;
  const simd128Supported = wasmReceipt.moduleProbe.isSimdSupported;
  const maxMemory64AddressLimitGiB = Number(
    STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES / (BigInt(1024) * BigInt(1024) * BigInt(1024)),
  );

  const webGpuSupported = webGpu.apiPresent;
  const webGpuStatus: ChromeNextGenCapabilityStatus =
    webGpu.adapterReady && (webGpu.shaderF16 || webGpu.bgra8unormStorage)
      ? "active"
      : webGpu.apiPresent
        ? webGpu.adapterReady
          ? "active"
          : "partial"
        : "unsupported";

  const displayProbe = detectDisplayP3AndDesync(env);
  const p3Active = displayProbe.p3Media || displayProbe.p3Canvas;
  const lowLatencyCanvasSupported = p3Active || displayProbe.desynchronized;
  const lowLatencyCanvasStatus: ChromeNextGenCapabilityStatus =
    p3Active && displayProbe.desynchronized
      ? "active"
      : lowLatencyCanvasSupported
        ? "partial"
        : "unsupported";

  const pointerProto =
    typeof PointerEvent !== "undefined" ? (PointerEvent.prototype as unknown as GlobalRecord) : null;
  const hasPointerRawUpdate =
    env?.hasPointerRawUpdate
    ?? Boolean(
      (win && "onpointerrawupdate" in win)
      || (typeof HTMLElement !== "undefined" && "onpointerrawupdate" in HTMLElement.prototype),
    );
  const hasCoalescedEvents =
    env?.hasCoalescedEvents
    ?? Boolean(pointerProto && typeof pointerProto["getCoalescedEvents"] === "function");
  const hasPredictedEvents =
    env?.hasPredictedEvents
    ?? Boolean(pointerProto && typeof pointerProto["getPredictedEvents"] === "function");
  const highFreqStylusReady = hasCoalescedEvents && (hasPointerRawUpdate || hasPredictedEvents);
  const stylusStatus: ChromeNextGenCapabilityStatus =
    hasPointerRawUpdate && hasCoalescedEvents && hasPredictedEvents
      ? "active"
      : hasCoalescedEvents
        ? "partial"
        : "unsupported";

  const crossOriginIsolated =
    env?.crossOriginIsolated ?? Boolean(g["crossOriginIsolated"] === true);
  const hasSharedArrayBuffer =
    env?.hasSharedArrayBuffer ?? typeof g["SharedArrayBuffer"] === "function";
  const hasAtomics = env?.hasAtomics ?? typeof g["Atomics"] === "object";
  const multiWorkerTilesEnabled = crossOriginIsolated && hasSharedArrayBuffer && hasAtomics;
  const rawCores =
    env?.hardwareConcurrency
    ?? (typeof nav?.["hardwareConcurrency"] === "number" ? nav["hardwareConcurrency"] : 4);
  const clampedCores = Math.max(1, Math.min(32, Math.trunc(rawCores || 4)));
  const recommendedWorkerCount = multiWorkerTilesEnabled
    ? Math.max(2, Math.min(16, clampedCores - 1))
    : Math.max(1, Math.min(4, Math.floor(clampedCores / 2)));

  const storageObj = nav?.["storage"] as GlobalRecord | undefined;
  const hasOpfsGetDirectory =
    env?.hasOpfsGetDirectory ?? Boolean(storageObj && typeof storageObj["getDirectory"] === "function");
  const fsFileHandleProto =
    typeof FileSystemFileHandle !== "undefined"
      ? (FileSystemFileHandle.prototype as unknown as GlobalRecord)
      : null;
  const hasOpfsSyncAccessHandle =
    env?.hasOpfsSyncAccessHandle
    ?? Boolean(fsFileHandleProto && typeof fsFileHandleProto["createSyncAccessHandle"] === "function");
  const opfsStatus: ChromeNextGenCapabilityStatus =
    hasOpfsGetDirectory && hasOpfsSyncAccessHandle
      ? "active"
      : hasOpfsGetDirectory
        ? "partial"
        : "unsupported";

  const hasVideoEncoder = env?.hasVideoEncoder ?? typeof g["VideoEncoder"] === "function";
  const hasImageDecoder = env?.hasImageDecoder ?? typeof g["ImageDecoder"] === "function";
  const webCodecsTimelapseReady = hasVideoEncoder && hasImageDecoder;
  const webCodecsStatus: ChromeNextGenCapabilityStatus =
    webCodecsTimelapseReady
      ? "active"
      : hasVideoEncoder || hasImageDecoder
        ? "partial"
        : "unsupported";

  const computePressureSupported =
    env?.hasPressureObserver ?? typeof g["PressureObserver"] === "function";
  const fileSystemSavePickerSupported =
    env?.hasShowSaveFilePicker ?? typeof g["showSaveFilePicker"] === "function";
  const pressureFsaSupported = computePressureSupported || fileSystemSavePickerSupported;
  const pressureFsaStatus: ChromeNextGenCapabilityStatus =
    computePressureSupported && fileSystemSavePickerSupported
      ? "active"
      : pressureFsaSupported
        ? "partial"
        : "unsupported";

  const capabilities: readonly ChromeNextGenCapabilityItem[] = Object.freeze([
    Object.freeze({
      id: "wasm-memory64",
      title: "WebAssembly Memory64 (i64)",
      summary: "64비트 주소 공간 기반 대용량 타일 스크래치 아레나(최대 16 GiB 한도 정책)",
      supported: memory64Supported,
      status: memory64Supported ? "active" : "unsupported",
      detail: memory64Supported
        ? `i64 네이티브 활성 · SIMD128 ${simd128Supported ? "지원" : "미지원"} · 최대 ${maxMemory64AddressLimitGiB} GiB 주소 정책`
        : "구형 런타임 감지 · 안전 폴백 모드 대기",
    }),
    Object.freeze({
      id: "webgpu-compute",
      title: "WebGPU 컴퓨트 파이프라인",
      summary: "GPU 브러시·필터 우선 실행(shader-f16 · bgra8unorm-storage)",
      supported: webGpuSupported,
      status: webGpuStatus,
      detail: webGpu.adapterReady
        ? `어댑터 활성 · f16 ${webGpu.shaderF16 ? "ON" : "OFF"} · BGRA 스토리지 ${webGpu.bgra8unormStorage ? "ON" : "OFF"}`
        : webGpu.apiPresent
          ? "WebGPU API 감지됨 · 어댑터 확인 대기"
          : "WebGPU 미지원 환경",
    }),
    Object.freeze({
      id: "display-p3-desynchronized",
      title: "Display-P3 광색역 · 저지연 캔버스",
      summary: "넓은 색역 표현과 desynchronized 직결 프레임 출력",
      supported: lowLatencyCanvasSupported,
      status: lowLatencyCanvasStatus,
      detail: p3Active && displayProbe.desynchronized
        ? "Display-P3 + desynchronized 저지연 활성"
        : p3Active
          ? "Display-P3 색역 지원 · 표준 동기화 출력"
          : displayProbe.desynchronized
            ? "sRGB + desynchronized 저지연 활성"
            : "표준 sRGB 2D 컨텍스트 모드",
    }),
    Object.freeze({
      id: "high-freq-stylus",
      title: "240Hz+ 초저지연 스타일러스",
      summary: "pointerrawupdate · Coalesced · Predicted 펜 입력 파이프라인",
      supported: hasCoalescedEvents || hasPointerRawUpdate,
      status: stylusStatus,
      detail: hasPointerRawUpdate && hasCoalescedEvents && hasPredictedEvents
        ? "rawupdate + Coalesced + Predicted 전체 활성"
        : hasCoalescedEvents
          ? "고빈도 Coalesced 입력 지원"
          : "표준 포인터 이벤트 모드",
    }),
    Object.freeze({
      id: "shared-array-buffer",
      title: "멀티 워커 타일 병렬 처리",
      summary: "SharedArrayBuffer + Atomics (COOP/COEP 격리 필수)",
      supported: multiWorkerTilesEnabled,
      status: multiWorkerTilesEnabled ? "active" : "unsupported",
      detail: multiWorkerTilesEnabled
        ? `격리 컨텍스트 활성 · 권장 타일 워커 ${recommendedWorkerCount}개`
        : "crossOriginIsolated 비활성 · 단일 워커 전송 모드",
    }),
    Object.freeze({
      id: "opfs-sync-access",
      title: "OPFS 제로카피 원고 페이징",
      summary: "워커 createSyncAccessHandle 기반 대용량 원고 고속 입출력",
      supported: hasOpfsGetDirectory,
      status: opfsStatus,
      detail: hasOpfsGetDirectory && hasOpfsSyncAccessHandle
        ? "OPFS + SyncAccessHandle 직결 지원"
        : hasOpfsGetDirectory
          ? "OPFS 디렉터리 지원 · Dedicated Worker에서 SyncAccessHandle 활성"
          : "OPFS 미지원 환경",
    }),
    Object.freeze({
      id: "webcodecs-media",
      title: "WebCodecs 하드웨어 타임랩스",
      summary: "VideoEncoder · ImageDecoder 기반 고속 타임랩스·애니메이션 출력",
      supported: hasVideoEncoder || hasImageDecoder,
      status: webCodecsStatus,
      detail: webCodecsTimelapseReady
        ? "VideoEncoder + ImageDecoder 하드웨어 가속 활성"
        : hasVideoEncoder
          ? "VideoEncoder 지원 · ImageDecoder 미지원"
          : hasImageDecoder
            ? "ImageDecoder 지원 · VideoEncoder 미지원"
            : "WebCodecs 미지원 환경",
    }),
    Object.freeze({
      id: "compute-pressure-fsa",
      title: "발열 압력 제어 · 로컬 직결 저장",
      summary: "PressureObserver 타일 캐시 조절 + showSaveFilePicker 로컬 저장",
      supported: pressureFsaSupported,
      status: pressureFsaStatus,
      detail: computePressureSupported && fileSystemSavePickerSupported
        ? "CPU 압력 자동 조절 + 로컬 파일 직결 저장 활성"
        : computePressureSupported
          ? "CPU 압력 자동 조절 활성"
          : fileSystemSavePickerSupported
            ? "로컬 파일 직결 저장 활성"
            : "표준 다운로드 · 정적 캐시 모드",
    }),
  ]);

  const activeCount = capabilities.filter((item) => item.supported).length;
  const preferredRasterBackend: ChromePreferredRasterBackend =
    webGpu.apiPresent && memory64Supported
      ? webGpu.shaderF16
        ? "webgpu-f16+wasm64"
        : "webgpu+wasm64"
      : memory64Supported
        ? "wasm64-i64"
        : webGpu.apiPresent
          ? "webgpu"
          : "canvas2d-standard";

  const tier: ChromeNextGenTurboTier =
    memory64Supported && activeCount >= 6
      ? "chrome-max-turbo"
      : memory64Supported || activeCount >= 3
        ? "chrome-accelerated"
        : "standard-compatible";

  const recommendedTileSizePx: 256 | 512 | 1024 =
    memory64Supported && multiWorkerTilesEnabled
      ? 1024
      : memory64Supported || webGpu.apiPresent
        ? 512
        : 256;

  return Object.freeze({
    capabilities,
    profile: Object.freeze({
      tier,
      activeCount,
      totalCount: 8,
      preferredRasterBackend,
      preferredColorSpace: p3Active ? "display-p3" : "srgb",
      desynchronizedCanvasRecommended: displayProbe.desynchronized,
      recommendedTileSizePx,
      recommendedWorkerCount,
      maxMemory64AddressLimitGiB,
      memory64Supported,
      simd128Supported,
      webGpu,
      multiWorkerTilesEnabled,
      opfsZeroCopyPagingReady: hasOpfsGetDirectory,
      webCodecsTimelapseReady,
      highFreqStylusReady,
      computePressureSupported,
      fileSystemSavePickerSupported,
    }),
  });
}

export function detectChromeNextGenCapabilities(
  env?: ChromeNextGenProbeEnv,
): ChromeNextGenCapabilitiesReport {
  return buildReportFromSignals(
    env,
    Object.freeze({
      apiPresent: resolveGpuHost(env) !== null,
      adapterReady: false,
      shaderF16: false,
      bgra8unormStorage: false,
      maxBufferSizeBytes: null,
    }),
  );
}

export async function probeChromeNextGenCapabilitiesAsync(
  env?: ChromeNextGenProbeEnv,
): Promise<ChromeNextGenCapabilitiesReport> {
  const webGpu = await probeChromeWebGpuFeatures(env);
  return buildReportFromSignals(env, webGpu);
}
