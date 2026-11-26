/**
 * ONNX Runtime Web 실리콘 가속 세션 캐스케이드 (`webnn` NPU → `webgpu` → `wasm`) 및
 * WASM SIMD/스레드 환경 구성·제로카피 Transferable 버퍼 추출 헬퍼.
 *
 * - 6대 로컬 ONNX 모델(`teed`, `u2netp`, `tag2pix`, `realesrgan-anime-6b`,
 *   `animegan2-face-paint-512-v2`, `animegan2-paprika`) 및 캐스케이드 활성 세션에서
 *   NPU(WebNN) → WebGPU → WASM(SIMD+스레드) 순으로 자동 페일오버를 수행한다.
 * - NPU가 `Resize`/`ConvTranspose` 등 특정 연산자를 거부해도 사용자 흐름을 깨지 않고
 *   즉시 WebGPU, 이어서 WASM 세션으로 안전하게 폴백한다.
 */
import type { InferenceSession } from "onnxruntime-web";

import {
  buildHardwareAccelerationReport,
  probeWasmCpuCapabilities,
  type StudioHardwareAccelerationReport,
  type StudioHardwareCascadeProvider,
  type StudioHardwareExecutionTier,
  type StudioWasmSimdTier,
} from "./studio-hardware-accelerator-probe";
import { extractTransferableArrayBuffer } from "../wasm64-zero-copy-ipc/studio-zero-copy-buffer-pool";

export const STUDIO_ONNX_CASCADE_LOCAL_MODEL_IDS = Object.freeze([
  "teed",
  "u2netp",
  "tag2pix",
  "realesrgan-anime-6b",
  "animegan2-face-paint-512-v2",
  "animegan2-face-paint",
  "animegan2-paprika",
] as const);

const CASCADE_MODEL_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_ONNX_CASCADE_LOCAL_MODEL_IDS,
);

export interface StudioOnnxRuntimeEnvWasmLike {
  simd?: boolean | "fixed" | "relaxed";
  numThreads?: number;
  proxy?: boolean;
}

export interface StudioOnnxRuntimeEnvLike {
  readonly wasm?: StudioOnnxRuntimeEnvWasmLike;
}

export interface StudioOnnxHardwareTelemetry {
  readonly activeProvider: StudioHardwareCascadeProvider;
  readonly attemptedProviders: readonly StudioHardwareCascadeProvider[];
  readonly fallbackReason: string | null;
  readonly executionTier: StudioHardwareExecutionTier;
  readonly simdTier: StudioWasmSimdTier;
  readonly wasmThreads: number;
  readonly shaderF16: boolean;
  readonly subgroups: boolean;
  readonly zeroCopyEnabled: boolean;
  readonly transferableBufferCount: number;
}

export interface StudioOnnxCascadeSessionOutcome {
  readonly session: InferenceSession;
  readonly activeProvider: StudioHardwareCascadeProvider;
  readonly attemptedProviders: readonly StudioHardwareCascadeProvider[];
  readonly fallbackReason: string | null;
}

/** 6대 로컬 ONNX 모델(TEED, U-2-Netp, Tag2Pix, Real-ESRGAN, AnimeGANv2 2종) 여부 판별. */
export function isStudioOnnxLocalAcceleratedModelId(modelId: string): boolean {
  return CASCADE_MODEL_ID_SET.has(modelId);
}

/**
 * ONNX Runtime Web `ort.env.wasm`의 SIMD 및 멀티스레드 설정을 하드웨어 프로브에 맞게 안전하게 적용한다.
 * - `simd`: WASM `simd128` 지원 시 `true`, 미지원 시 `false`
 * - `numThreads`: `crossOriginIsolated && SharedArrayBuffer` 환경에서만 최적 스레드 수(최대 8),
 *   그 외에는 단일 스레드(`1`)로 고정해 COOP/COEP 미적용 탭 오류를 방지한다.
 */
export function configureStudioOnnxWasmEnv(
  env: StudioOnnxRuntimeEnvLike | undefined,
  hardware: StudioHardwareAccelerationReport,
): Readonly<{ readonly simd: boolean; readonly numThreads: number }> {
  const simd = hardware.wasm.simd128;
  const numThreads = hardware.wasm.sharedArrayBuffer
    ? hardware.wasm.optimalWorkerThreads
    : 1;
  if (env?.wasm && typeof env.wasm === "object") {
    try {
      env.wasm.simd = simd;
      env.wasm.numThreads = numThreads;
    } catch {
      // 읽기 전용 테스트 모의 객체인 경우 예외를 전파하지 않는다.
    }
  }
  return Object.freeze({ simd, numThreads });
}

/** 단일 캐스케이드 프로바이더용 ONNX Runtime Web SessionOptions를 구성한다. */
export function buildSessionOptionsForProvider(
  provider: StudioHardwareCascadeProvider,
): InferenceSession.SessionOptions {
  if (provider === "webnn-npu") {
    return {
      executionProviders: [
        {
          name: "webnn",
          deviceType: "npu",
          powerPreference: "default",
        },
      ],
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    };
  }
  if (provider === "webgpu") {
    return {
      executionProviders: [{ name: "webgpu", validationMode: "basic" }],
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    };
  }
  return {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    executionMode: "sequential",
  };
}

function summarizeProviderError(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message.trim().slice(0, 160);
  }
  return "session creation failed";
}

/**
 * `webnn` (NPU) → `webgpu` → `wasm` 순으로 세션을 생성하고 실패 시 자동 페일오버한다.
 * - Abort 신호 또는 모델 스키마 불일치(`schema-mismatch`)는 폴백하지 않고 즉시 전파한다.
 * - NPU/WebGPU가 미지원이거나 연산자 미지원(예: Resize/ConvTranspose)으로 세션 생성이
 *   실패하면 다음 프로바이더로 자동 전환하고 사유를 텔레메트리에 기록한다.
 */
export async function createStudioOnnxSessionWithCascade(input: {
  readonly hardware: StudioHardwareAccelerationReport;
  readonly createSessionForOptions: (
    options: InferenceSession.SessionOptions,
  ) => Promise<InferenceSession>;
  readonly isAbortCause: (cause: unknown) => boolean;
  readonly signal?: AbortSignal;
}): Promise<StudioOnnxCascadeSessionOutcome> {
  const { hardware, createSessionForOptions, isAbortCause, signal } = input;
  const candidates: readonly StudioHardwareCascadeProvider[] =
    hardware.cascadeOrder.length > 0 ? hardware.cascadeOrder : ["wasm"];

  const attemptedProviders: StudioHardwareCascadeProvider[] = [];
  const failureNotes: string[] = [];

  if (!hardware.webnn.npuAvailable && !candidates.includes("webnn-npu")) {
    failureNotes.push("webnn-npu-unavailable");
  }
  if (!hardware.webgpu.available && !candidates.includes("webgpu")) {
    failureNotes.push("webgpu-unavailable");
  }

  let lastCause: unknown = null;

  for (const candidate of candidates) {
    if (signal?.aborted) {
      throw new Error("ONNX cascade session creation aborted.");
    }
    attemptedProviders.push(candidate);
    try {
      const session = await createSessionForOptions(
        buildSessionOptionsForProvider(candidate),
      );
      const fallbackReason =
        candidate === "webnn-npu"
          ? null
          : failureNotes.length > 0
            ? failureNotes.join(" -> ")
            : null;
      return Object.freeze({
        session,
        activeProvider: candidate,
        attemptedProviders: Object.freeze([...attemptedProviders]),
        fallbackReason,
      });
    } catch (cause) {
      if (signal?.aborted || isAbortCause(cause)) {
        throw cause;
      }
      lastCause = cause;
      failureNotes.push(`${candidate}-session-failed: ${summarizeProviderError(cause)}`);
    }
  }

  throw lastCause instanceof Error
    ? lastCause
    : new Error("All ONNX hardware cascade providers failed.");
}

/** 출력 텐서 맵에서 워커 `postMessage` 제로카피 전송 가능한 단독 `ArrayBuffer` 목록을 수집한다. */
export function collectStudioOnnxOutputTransferables(
  outputs: Readonly<Record<string, { readonly data: ArrayBufferView }>>,
): readonly ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  for (const tensor of Object.values(outputs)) {
    const transferable = extractTransferableArrayBuffer(tensor.data);
    if (transferable && !seen.has(transferable)) {
      seen.add(transferable);
      buffers.push(transferable);
    }
  }
  return Object.freeze(buffers);
}

/** 단일 EP 경로에서 비동기 GPU/WebNN 프로브 없이 동기 WASM 기능만으로 기본 리포트를 만든다. */
export function buildSyncOnnxHardwareReport(
  webGpuAvailable: boolean,
): StudioHardwareAccelerationReport {
  return buildHardwareAccelerationReport({
    wasm: probeWasmCpuCapabilities(),
    webgpu: Object.freeze({
      apiAvailable: webGpuAvailable,
      available: webGpuAvailable,
      shaderF16: false,
      subgroups: false,
      maxStorageBufferBindingSize: null,
      maxComputeInvocationsPerWorkgroup: null,
      adapterInfo: null,
      timedOut: false,
    }),
    webnn: Object.freeze({
      apiAvailable: false,
      available: false,
      npuAvailable: false,
      deviceType: "unavailable",
      timedOut: false,
    }),
    webCodecs: Object.freeze({
      hasVideoEncoder: false,
      hasAudioEncoder: false,
      hasVideoFrame: false,
      h264: false,
      hevc: false,
      av1: false,
      opus: false,
      supportedVideoCodecs: Object.freeze([]),
      preferredVideoCodec: null,
      highestEfficiencyVideoCodec: null,
      hardwareAccelerationPreferred: false,
      zeroCopyVideoFramePath: false,
    }),
  });
}

/** 하드웨어 프로브와 세션 결과를 통합해 표준 ONNX 가속 텔레메트리를 생성한다. */
export function buildStudioOnnxHardwareTelemetry(input: {
  readonly hardware: StudioHardwareAccelerationReport;
  readonly activeProvider: StudioHardwareCascadeProvider;
  readonly attemptedProviders: readonly StudioHardwareCascadeProvider[];
  readonly fallbackReason: string | null;
  readonly zeroCopyEnabled: boolean;
  readonly transferableBufferCount?: number;
}): StudioOnnxHardwareTelemetry {
  return Object.freeze({
    activeProvider: input.activeProvider,
    attemptedProviders: Object.freeze([...input.attemptedProviders]),
    fallbackReason: input.fallbackReason,
    executionTier: input.hardware.executionTier,
    simdTier: input.hardware.wasm.simdTier,
    wasmThreads: input.hardware.wasm.wasmThreadCount,
    shaderF16: input.hardware.webgpu.shaderF16,
    subgroups: input.hardware.webgpu.subgroups,
    zeroCopyEnabled: input.zeroCopyEnabled,
    transferableBufferCount: input.transferableBufferCount ?? 0,
  });
}
