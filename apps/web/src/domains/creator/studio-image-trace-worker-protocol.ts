import type { StudioImageTraceLuminanceGrid } from "./studio-image-trace-grid";
import type {
  StudioImageTraceLayer,
  StudioImageTracePreset,
} from "./studio-image-trace";

export const STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION = 1 as const;

export interface StudioImageTraceWorkerRunRequest {
  /** 샘플링된 RGBA 픽셀. 소유권이 Worker 로 이전(detach)된다. */
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** 프리셋은 원시값만으로 이뤄진 객체라 그대로 구조화 복제된다. */
  readonly preset: StudioImageTracePreset;
}

export interface StudioImageTraceWorkerRunMessage {
  type: "studio-image-trace/run";
  version: typeof STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION;
  request: StudioImageTraceWorkerRunRequest;
}

export interface StudioImageTraceWorkerSuccessMessage {
  type: "studio-image-trace/success";
  version: typeof STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION;
  grid: StudioImageTraceLuminanceGrid;
  layers: readonly StudioImageTraceLayer[];
}

export interface StudioImageTraceWorkerReadyMessage {
  type: "studio-image-trace/ready";
  version: typeof STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION;
}

export interface StudioImageTraceWorkerFailureMessage {
  type: "studio-image-trace/failure";
  version: typeof STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
  };
}

export type StudioImageTraceWorkerResponseMessage =
  | StudioImageTraceWorkerReadyMessage
  | StudioImageTraceWorkerSuccessMessage
  | StudioImageTraceWorkerFailureMessage;

/** 픽셀 버퍼는 편도 전송(메인 → Worker). 응답에는 되돌릴 픽셀 버퍼가 없다. */
export function studioImageTraceRequestTransfers(
  message: StudioImageTraceWorkerRunMessage,
): Transferable[] {
  const buffer = message.request.data.buffer;
  return buffer instanceof ArrayBuffer ? [buffer] : [];
}

/** 성공 응답의 전송 목록: 명도 격자 버퍼 + 레이어 마스크 버퍼들(중복 제거). */
export function studioImageTraceResponseTransfers(
  message: StudioImageTraceWorkerSuccessMessage,
): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  const collect = (array: Uint8Array): void => {
    if (array.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
  };
  collect(message.grid.luminance);
  for (const layer of message.layers) collect(layer.mask);
  return [...buffers];
}
