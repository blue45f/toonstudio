/**
 * 텍스처 LOD 워커 프로토콜. 큰 시트의 반감(수십~수백 ms)을 메인 스레드 밖에서 돌리려고 직선 알파 RGBA를 넘기고
 * 프리멀티플라이드 LOD 이미지를 돌려받는다. 계산은 메인 스레드 폴백과 같은 순수 함수를 쓴다.
 */
import { studioLodImageStages, studioPremultiplyRgba, type StudioLodCell, type StudioRgbaImage } from "./studio-virtual-space-texture-lod-pixels";

export const STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION = 1;
/** 요청이 담을 수 있는 최대 한 변·화소 수. 비정상 입력이 워커 메모리를 터뜨리지 않게 한다. */
export const STUDIO_TEXTURE_LOD_WORKER_MAX_SIDE = 8_192;
export const STUDIO_TEXTURE_LOD_WORKER_MAX_PIXELS = 32 * 1024 * 1024;
export const STUDIO_TEXTURE_LOD_WORKER_MAX_CELLS = 1_024;

/** 원본 픽셀을 어떻게 넘기는지. 비트맵이면 워커가 OffscreenCanvas로 직접 읽어 메인 스레드는 픽셀을 만지지 않는다. */
export type StudioTextureLodWorkerSource =
  | { readonly kind: "pixels"; /** 직선 알파 RGBA8(행 우선). 전송되므로 보낸 쪽에서는 쓸 수 없게 된다. */ readonly data: ArrayBuffer }
  | { readonly kind: "bitmap"; /** 디코딩이 끝난 원본. 전송되므로 보낸 쪽에서는 쓸 수 없게 된다. */ readonly bitmap: ImageBitmap };

export interface StudioTextureLodWorkerRequest {
  readonly version: typeof STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly StudioLodCell[];
  readonly source: StudioTextureLodWorkerSource;
}

/** 워커에 OffscreenCanvas가 없어 비트맵 요청을 처리할 수 없을 때의 오류 메시지. 호출 측은 이후 픽셀 전송 방식으로 바꾼다. */
export const STUDIO_TEXTURE_LOD_WORKER_NO_OFFSCREEN = "offscreen-unavailable";

export type StudioTextureLodWorkerResponse =
  | { readonly version: typeof STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION; readonly kind: "result"; readonly requestId: number; readonly width: number; readonly height: number; readonly data: ArrayBuffer }
  | { readonly version: typeof STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION; readonly kind: "error"; readonly requestId: number; readonly message: string };

const isInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

function isCell(value: unknown, width: number, height: number): value is StudioLodCell {
  if (typeof value !== "object" || value === null) return false;
  const { x, y, width: w, height: h } = value as Record<string, unknown>;
  return isInteger(x, 0, width) && isInteger(y, 0, height) && isInteger(w, 1, width) && isInteger(h, 1, height) && x + w <= width && y + h <= height;
}

const isImageBitmap = (value: unknown): value is ImageBitmap => typeof ImageBitmap === "function" && value instanceof ImageBitmap;

function isWorkerSource(value: unknown, width: number, height: number): value is StudioTextureLodWorkerSource {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;
  if (source.kind === "pixels") return source.data instanceof ArrayBuffer && source.data.byteLength === width * height * 4;
  return source.kind === "bitmap" && isImageBitmap(source.bitmap) && source.bitmap.width === width && source.bitmap.height === height;
}

export function isStudioTextureLodWorkerRequest(value: unknown): value is StudioTextureLodWorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  const { width, height } = request;
  if (request.version !== STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION || !isInteger(request.requestId, 1, Number.MAX_SAFE_INTEGER)) return false;
  if (!isInteger(request.level, 1, 3) || !isInteger(width, 1, STUDIO_TEXTURE_LOD_WORKER_MAX_SIDE) || !isInteger(height, 1, STUDIO_TEXTURE_LOD_WORKER_MAX_SIDE)) return false;
  if (width * height > STUDIO_TEXTURE_LOD_WORKER_MAX_PIXELS) return false;
  if (!isWorkerSource(request.source, width, height)) return false;
  const { cells } = request;
  return Array.isArray(cells) && cells.length >= 1 && cells.length <= STUDIO_TEXTURE_LOD_WORKER_MAX_CELLS && cells.every((cell) => isCell(cell, width, height));
}

export function isStudioTextureLodWorkerResponse(value: unknown): value is StudioTextureLodWorkerResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  if (response.version !== STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION || !isInteger(response.requestId, 1, Number.MAX_SAFE_INTEGER)) return false;
  if (response.kind === "error") return typeof response.message === "string";
  return response.kind === "result" && isInteger(response.width, 1, STUDIO_TEXTURE_LOD_WORKER_MAX_SIDE) && isInteger(response.height, 1, STUDIO_TEXTURE_LOD_WORKER_MAX_SIDE)
    && response.data instanceof ArrayBuffer && response.data.byteLength === response.width * response.height * 4;
}

function runToEnd(stages: Generator<void, StudioRgbaImage>): StudioRgbaImage {
  for (;;) {
    const step = stages.next();
    if (step.done) return step.value;
  }
}

function respond(request: StudioTextureLodWorkerRequest, straight: Uint8Array): StudioTextureLodWorkerResponse {
  const base: StudioRgbaImage = { data: studioPremultiplyRgba(straight, request.width, request.height), width: request.width, height: request.height };
  const image = runToEnd(studioLodImageStages(base, request.cells, request.level));
  // 새로 만든 Uint8Array라 buffer가 곧 결과 전체다(오프셋 없음).
  return { version: STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION, kind: "result", requestId: request.requestId, width: image.width, height: image.height, data: image.data.buffer as ArrayBuffer };
}

/** 비트맵을 직선 알파 RGBA로 읽는다. 기본 구현은 OffscreenCanvas(워커 전용)이고, 테스트는 대체한다. */
export type StudioTextureLodBitmapReader = (bitmap: ImageBitmap, width: number, height: number) => Uint8ClampedArray | null;

export const readStudioTextureLodBitmap: StudioTextureLodBitmapReader = (bitmap, width, height) => {
  if (typeof OffscreenCanvas !== "function") return null;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, width, height).data;
};

/** 요청 하나를 계산한다. 워커 본체와 테스트가 같은 함수를 쓴다. */
export function studioTextureLodWorkerRespond(request: StudioTextureLodWorkerRequest, readBitmap: StudioTextureLodBitmapReader = readStudioTextureLodBitmap): StudioTextureLodWorkerResponse {
  if (request.source.kind === "pixels") return respond(request, new Uint8Array(request.source.data));
  const pixels = readBitmap(request.source.bitmap, request.width, request.height);
  if (!pixels) return { version: STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION, kind: "error", requestId: request.requestId, message: STUDIO_TEXTURE_LOD_WORKER_NO_OFFSCREEN };
  request.source.bitmap.close();
  return respond(request, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length));
}
