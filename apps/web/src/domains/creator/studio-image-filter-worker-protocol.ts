import {
  StudioImageFilterWorkerError,
  type StudioImageFilterWorkerErrorCode,
} from "./studio-image-filter-worker-error";

import type { ImageFilterFields } from "./render/studio-konva-filter-fields";
import type { StudioImageDataLike } from "./studio-filters";

export const STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION = 1 as const;

// 필터 일부는 입력 크기만큼 보조 버퍼를 추가로 만든다. 64 MP(원본 RGBA 256 MiB)를
// 넘는 요청은 탭 전체 메모리를 고갈시킬 수 있으므로 Worker 경계에서 일관되게 거부한다.
export const STUDIO_IMAGE_FILTER_MAX_PIXELS = 64 * 1024 * 1024;

export interface StudioImageFilterWorkerRunRequest {
  readonly imageData: StudioImageDataLike;
  readonly el: ImageFilterFields;
}

export interface StudioImageFilterWorkerRunMessage {
  type: "studio-image-filter/run";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  request: StudioImageFilterWorkerRunRequest;
}

/**
 * Interactive filters keep one immutable source in the Worker and send only filter parameters
 * after this message. `sourceGeneration` is session-local and must increase whenever either the
 * source pixels or their caller-owned revision changes.
 */
export interface StudioImageFilterWorkerLoadSourceMessage {
  type: "studio-image-filter/load-source";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  sourceId: string;
  sourceGeneration: number;
  imageData: StudioImageDataLike;
}

export interface StudioImageFilterWorkerRunSourceMessage {
  type: "studio-image-filter/run-source";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  sourceId: string;
  sourceGeneration: number;
  requestId: number;
  el: ImageFilterFields;
}

export type StudioImageFilterWorkerRequestMessage =
  | StudioImageFilterWorkerRunMessage
  | StudioImageFilterWorkerLoadSourceMessage
  | StudioImageFilterWorkerRunSourceMessage;

export interface StudioImageFilterWorkerSuccessMessage {
  type: "studio-image-filter/success";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  imageData: StudioImageDataLike;
}

export interface StudioImageFilterWorkerSourceLoadedMessage {
  type: "studio-image-filter/source-loaded";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  sourceId: string;
  sourceGeneration: number;
}

export interface StudioImageFilterWorkerSourceSuccessMessage {
  type: "studio-image-filter/source-success";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  sourceId: string;
  sourceGeneration: number;
  requestId: number;
  imageData: StudioImageDataLike;
}

export interface StudioImageFilterWorkerSourceFailureMessage {
  type: "studio-image-filter/source-failure";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  sourceId: string;
  sourceGeneration: number;
  requestId?: number;
  error: {
    name: string;
    message: string;
    /** 구조화 코드 운반 (R20 결정 2-A): 원인이 코드를 보유할 때만 싣는 선택 필드 — 없으면 수신측이 message 패스스루를 유지한다. */
    code?: StudioImageFilterWorkerErrorCode;
    params?: Readonly<Record<string, string>>;
  };
}

export interface StudioImageFilterWorkerReadyMessage {
  type: "studio-image-filter/ready";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
}

export interface StudioImageFilterWorkerFailureMessage {
  type: "studio-image-filter/failure";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
    /** 구조화 코드 운반 (R20 결정 2-A): 원인이 코드를 보유할 때만 싣는 선택 필드 — 없으면 수신측이 message 패스스루를 유지한다. */
    code?: StudioImageFilterWorkerErrorCode;
    params?: Readonly<Record<string, string>>;
  };
}

export type StudioImageFilterWorkerResponseMessage =
  | StudioImageFilterWorkerReadyMessage
  | StudioImageFilterWorkerSuccessMessage
  | StudioImageFilterWorkerFailureMessage
  | StudioImageFilterWorkerSourceLoadedMessage
  | StudioImageFilterWorkerSourceSuccessMessage
  | StudioImageFilterWorkerSourceFailureMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Worker/direct 양 경로가 같은 픽셀 메모리 계약을 사용하도록 런타임에서 검증한다. */
export function assertStudioImageFilterImageData(
  value: unknown,
  label = "이미지 필터 입력",
): asserts value is StudioImageDataLike {
  if (!isRecord(value)) {
    throw new StudioImageFilterWorkerError("protocolFormatInvalid", { params: { label } });
  }
  const { data, width, height } = value;
  if (!(data instanceof Uint8ClampedArray)) {
    throw new StudioImageFilterWorkerError("protocolPixelBufferType", { params: { label } });
  }
  if (
    typeof width !== "number"
    || typeof height !== "number"
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw new StudioImageFilterWorkerError("protocolSizeNotPositiveInteger", { params: { label } });
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > STUDIO_IMAGE_FILTER_MAX_PIXELS) {
    throw new StudioImageFilterWorkerError("protocolSizeOverLimit", { params: { label } });
  }
  if (data.byteLength !== pixels * 4) {
    throw new StudioImageFilterWorkerError("protocolBufferLengthMismatch", { params: { label } });
  }
}

function uniqueArrayBufferTransfers(views: readonly { readonly buffer: ArrayBufferLike }[]): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  const transfers: Transferable[] = [];
  for (const view of views) {
    const buffer = view.buffer;
    if (!(buffer instanceof ArrayBuffer) || seen.has(buffer)) continue;
    seen.add(buffer);
    transfers.push(buffer);
  }
  return transfers;
}

export function studioImageFilterRequestTransfers(message: StudioImageFilterWorkerRunMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.request.imageData.data]);
}

export function studioImageFilterSourceLoadTransfers(
  message: StudioImageFilterWorkerLoadSourceMessage,
): Transferable[] {
  return uniqueArrayBufferTransfers([message.imageData.data]);
}

export function studioImageFilterSuccessTransfers(message: StudioImageFilterWorkerSuccessMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.imageData.data]);
}

export function studioImageFilterSourceSuccessTransfers(
  message: StudioImageFilterWorkerSourceSuccessMessage,
): Transferable[] {
  return uniqueArrayBufferTransfers([message.imageData.data]);
}
