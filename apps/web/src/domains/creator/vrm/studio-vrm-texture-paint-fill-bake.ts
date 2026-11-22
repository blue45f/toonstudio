/**
 * VRM 텍스처 페인트 런타임의 브러시·채우기 베이킹 및 채널 정규화 순수 로직.
 *
 * ColorDrop 마스크 검증·크롭·Undo RGB 스냅샷·스칼라/발광 채널 정규화·
 * 표면 브러시 오퍼레이션 베이킹을 `studio-vrm-texture-paint-runtime.ts`에서 분리한다.
 */
import { isStudioVrmTexturePaintScalarChannel, type StudioVrmTexturePaintChannel } from "./studio-vrm-texture-paint-channel";
import {
  RGBA_CHANNELS,
  estimateStudioVrmTexturePaintTargetResidentBytes,
  saturatedByteSum,
  type FillHistoryRecordBase,
  type StudioVrmTexturePaintRuntimeErrorCode,
} from "./studio-vrm-texture-paint-history-snapshot";
import {
  EMPTY_STUDIO_VRM_TEXTURE_RECT,
  applyStudioVrmTexturePaintOp,
  studioVrmTexturePaintOpRects,
  unionStudioVrmTextureRect,
  type StudioVrmTexturePaintApplyOptions,
  type StudioVrmTexturePaintOp,
} from "./studio-vrm-texture-paint-ops";

import type { StudioVrmTextureFillResult } from "./studio-vrm-texture-fill";
import type { StudioVrmTextureUndoRecorder } from "./studio-vrm-texture-undo";
import type { StudioVrmTextureRect, StudioVrmTextureSize } from "./studio-vrm-texture-uv";

export interface PreparedFillSelection {
  readonly bitMask: Uint8Array;
  readonly changedCount: number;
  readonly rect: StudioVrmTextureRect;
}

export interface FillTargetPixelBuffer {
  readonly valid: boolean;
  readonly size: StudioVrmTextureSize;
  readonly imageData: ImageData;
}

export function textureFillBitIsSet(mask: Uint8Array, position: number): boolean {
  return (mask[position >>> 3]! & (1 << (position & 7))) !== 0;
}

export function setTextureFillBit(mask: Uint8Array, position: number): void {
  const byteIndex = position >>> 3;
  mask[byteIndex] = mask[byteIndex]! | (1 << (position & 7));
}

export function countTextureFillBits(mask: Uint8Array): number {
  let count = 0;
  for (const byte of mask) {
    let value = byte;
    value -= (value >>> 1) & 0x55;
    value = (value & 0x33) + ((value >>> 2) & 0x33);
    count += (value + (value >>> 4)) & 0x0f;
  }
  return count;
}

export function isValidTextureFillRect(
  rect: StudioVrmTextureRect,
  size: StudioVrmTextureSize,
): boolean {
  return Number.isSafeInteger(rect.x)
    && Number.isSafeInteger(rect.y)
    && Number.isSafeInteger(rect.width)
    && Number.isSafeInteger(rect.height)
    && rect.x >= 0
    && rect.y >= 0
    && rect.width > 0
    && rect.height > 0
    && rect.x + rect.width <= size.width
    && rect.y + rect.height <= size.height;
}

/**
 * Validates the Worker mask, removes pixels already equal to the requested RGB, and crops the
 * retained history mask to the actually changed rectangle. Alpha is intentionally not compared or
 * changed because VRM baseColor transparency usually controls cutout hair/clothes.
 */
export function prepareTextureFillSelection(
  pixels: Uint8ClampedArray,
  size: StudioVrmTextureSize,
  result: StudioVrmTextureFillResult,
  color: Readonly<{ r: number; g: number; b: number }>,
): PreparedFillSelection | null {
  const pixelCount = size.width * size.height;
  if (
    !(result.bitMask instanceof Uint8Array)
    || result.bitMask.byteLength !== Math.ceil(pixelCount / 8)
    || !Number.isSafeInteger(result.matchedCount)
    || result.matchedCount <= 0
    || result.matchedCount > pixelCount
    || !result.bounds
    || !isValidTextureFillRect(result.bounds, size)
    // A Worker result is an untrusted transaction proposal. Its declared count must cover every
    // set bit, including bits outside the declared bounds and padding bits past the texture end.
    || countTextureFillBits(result.bitMask) !== result.matchedCount
  ) {
    return null;
  }

  let observedMatches = 0;
  let changedCount = 0;
  let minX = size.width;
  let minY = size.height;
  let maxX = -1;
  let maxY = -1;
  const right = result.bounds.x + result.bounds.width;
  const bottom = result.bounds.y + result.bounds.height;
  for (let y: number = result.bounds.y; y < bottom; y += 1) {
    for (let x: number = result.bounds.x; x < right; x += 1) {
      const atlasPosition: number = y * size.width + x;
      if (!textureFillBitIsSet(result.bitMask, atlasPosition)) continue;
      observedMatches += 1;
      const offset = atlasPosition * RGBA_CHANNELS;
      if (
        pixels[offset] === color.r
        && pixels[offset + 1] === color.g
        && pixels[offset + 2] === color.b
      ) {
        continue;
      }
      changedCount += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (observedMatches !== result.matchedCount) return null;
  if (changedCount === 0) {
    return {
      bitMask: new Uint8Array(0),
      changedCount: 0,
      rect: EMPTY_STUDIO_VRM_TEXTURE_RECT,
    };
  }

  const rect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const localMask = new Uint8Array(Math.ceil((rect.width * rect.height) / 8));
  const changedRight = rect.x + rect.width;
  const changedBottom = rect.y + rect.height;
  for (let y = rect.y; y < changedBottom; y += 1) {
    for (let x = rect.x; x < changedRight; x += 1) {
      const atlasPosition = y * size.width + x;
      if (!textureFillBitIsSet(result.bitMask, atlasPosition)) continue;
      const offset = atlasPosition * RGBA_CHANNELS;
      if (
        pixels[offset] === color.r
        && pixels[offset + 1] === color.g
        && pixels[offset + 2] === color.b
      ) {
        continue;
      }
      setTextureFillBit(localMask, (y - rect.y) * rect.width + x - rect.x);
    }
  }
  return { bitMask: localMask, changedCount, rect };
}

export function textureFillHistoryBytes(
  selection: PreparedFillSelection,
): number | null {
  const beforeBytes = selection.changedCount * 3;
  if (!Number.isSafeInteger(beforeBytes) || beforeBytes < 0) return null;
  const bytes = saturatedByteSum(selection.bitMask.byteLength, beforeBytes, 32);
  return bytes === Number.MAX_SAFE_INTEGER ? null : bytes;
}

export function textureFillResultMatchesSeed(
  pixels: Uint8ClampedArray,
  size: StudioVrmTextureSize,
  seed: Readonly<{ readonly x: number; readonly y: number; readonly index: number }>,
  result: StudioVrmTextureFillResult,
): boolean {
  const pixelCount = size.width * size.height;
  const seedRgba = result.seedRgba as unknown;
  if (
    !(result.bitMask instanceof Uint8Array)
    || result.bitMask.byteLength !== Math.ceil(pixelCount / 8)
    || !textureFillBitIsSet(result.bitMask, seed.index)
    || !result.bounds
    || seed.x < result.bounds.x
    || seed.y < result.bounds.y
    || seed.x >= result.bounds.x + result.bounds.width
    || seed.y >= result.bounds.y + result.bounds.height
    || !Array.isArray(seedRgba)
    || seedRgba.length !== RGBA_CHANNELS
    || seedRgba.some(
      (channel) =>
        typeof channel !== "number"
        || !Number.isSafeInteger(channel)
        || channel < 0
        || channel > 255,
    )
  ) {
    return false;
  }
  const seedOffset = seed.index * RGBA_CHANNELS;
  return seedRgba[0] === pixels[seedOffset]
    && seedRgba[1] === pixels[seedOffset + 1]
    && seedRgba[2] === pixels[seedOffset + 2]
    && seedRgba[3] === pixels[seedOffset + 3];
}

export function applyTextureFillHistoryPixels<TTarget extends FillTargetPixelBuffer>(
  record: FillHistoryRecordBase<TTarget>,
  direction: "redo" | "undo",
): boolean {
  if (
    !record.target.valid
    || !isValidTextureFillRect(record.rect, record.target.size)
    || record.bitMask.byteLength !== Math.ceil(
      (record.rect.width * record.rect.height) / 8,
    )
  ) {
    return false;
  }
  let beforeOffset = 0;
  const right = record.rect.x + record.rect.width;
  const bottom = record.rect.y + record.rect.height;
  for (let y = record.rect.y; y < bottom; y += 1) {
    for (let x = record.rect.x; x < right; x += 1) {
      const localPosition = (y - record.rect.y) * record.rect.width + x - record.rect.x;
      if (!textureFillBitIsSet(record.bitMask, localPosition)) continue;
      const pixelOffset = (y * record.target.size.width + x) * RGBA_CHANNELS;
      if (direction === "undo") {
        const r = record.beforeRgb[beforeOffset];
        const g = record.beforeRgb[beforeOffset + 1];
        const b = record.beforeRgb[beforeOffset + 2];
        if (r === undefined || g === undefined || b === undefined) return false;
        record.target.imageData.data[pixelOffset] = r;
        record.target.imageData.data[pixelOffset + 1] = g;
        record.target.imageData.data[pixelOffset + 2] = b;
      } else {
        record.target.imageData.data[pixelOffset] = record.fillRgb.r;
        record.target.imageData.data[pixelOffset + 1] = record.fillRgb.g;
        record.target.imageData.data[pixelOffset + 2] = record.fillRgb.b;
      }
      beforeOffset += 3;
    }
  }
  return beforeOffset === record.beforeRgb.byteLength;
}

/**
 * 첫 픽셀 변이 전에 마스크가 가리키는 모든 대상 RGB 값을 검증·스냅샷한다.
 * 비정상 마스크가 부분 채색된 텍스처를 남기지 않도록 원자성을 보장한다.
 */
export function snapshotFillBeforeRgb(
  pixels: Uint8ClampedArray,
  size: StudioVrmTextureSize,
  selection: PreparedFillSelection,
  beforeRgb: Uint8Array,
): "ok" | "invalid-dimensions" | "fill-worker-failed" {
  let beforeOffset = 0;
  const right = selection.rect.x + selection.rect.width;
  const bottom = selection.rect.y + selection.rect.height;
  for (let y = selection.rect.y; y < bottom; y += 1) {
    for (let x = selection.rect.x; x < right; x += 1) {
      const localPosition =
        (y - selection.rect.y) * selection.rect.width + x - selection.rect.x;
      if (!textureFillBitIsSet(selection.bitMask, localPosition)) continue;
      const pixelOffset = (y * size.width + x) * RGBA_CHANNELS;
      const r = pixels[pixelOffset];
      const g = pixels[pixelOffset + 1];
      const b = pixels[pixelOffset + 2];
      if (r === undefined || g === undefined || b === undefined) {
        return "invalid-dimensions";
      }
      beforeRgb[beforeOffset] = r;
      beforeRgb[beforeOffset + 1] = g;
      beforeRgb[beforeOffset + 2] = b;
      beforeOffset += 3;
    }
  }
  return beforeOffset === beforeRgb.byteLength ? "ok" : "fill-worker-failed";
}

export function isTextureFillTransientAdmissible(input: Readonly<{
  size: StudioVrmTextureSize;
  includeUnpreparedTarget: boolean;
  presentationBytes: number;
  aggregateTargetResidentBytes: number;
  historyBytes: number;
  maxAggregateResidentBytes: number;
}>): boolean {
  const pixelCount = input.size.width * input.size.height;
  const rgbaBytes = pixelCount * RGBA_CHANNELS;
  if (
    !Number.isSafeInteger(pixelCount)
    || !Number.isSafeInteger(rgbaBytes)
    || pixelCount <= 0
    || rgbaBytes <= 0
  ) {
    return false;
  }
  // Transient peak: transferred RGBA input + worker Uint32 queue + returned 1-bit mask.
  const transientBytes = saturatedByteSum(
    rgbaBytes,
    rgbaBytes,
    Math.ceil(pixelCount / 8),
  );
  const unpreparedTargetBytes = input.includeUnpreparedTarget
    ? estimateStudioVrmTexturePaintTargetResidentBytes(input.size)
    : 0;
  if (
    transientBytes === Number.MAX_SAFE_INTEGER
    || unpreparedTargetBytes === null
  ) {
    return false;
  }
  return saturatedByteSum(
    input.presentationBytes,
    input.aggregateTargetResidentBytes,
    input.historyBytes,
    unpreparedTargetBytes,
    transientBytes,
  ) <= input.maxAggregateResidentBytes;
}

/**
 * 스칼라(roughness/metalness) 또는 발광(emissive) 채널의 dirty 영역을
 * 알파=255 및 단일 컴포넌트 복제로 베이킹 정규화한다.
 */
export function normalizeScalarOrEmissiveChannelRegion(
  channel: StudioVrmTexturePaintChannel,
  pixels: Uint8ClampedArray,
  size: StudioVrmTextureSize,
  dirtyRect: StudioVrmTextureRect,
): void {
  if (!isStudioVrmTexturePaintScalarChannel(channel) && channel !== "emissive") return;
  const region = dirtyRect.width > 0 && dirtyRect.height > 0
    ? dirtyRect
    : { x: 0, y: 0, ...size };
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * size.width + x) * RGBA_CHANNELS;
      if (channel !== "emissive") {
        const component = channel === "metalness" ? 2 : 1;
        const value = pixels[offset + component]!;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
      }
      pixels[offset + 3] = 255;
    }
  }
}

export type BakeSurfaceBrushOperationsResult =
  | Readonly<{ ok: true; changedTexels: number; dirtyRect: StudioVrmTextureRect }>
  | Readonly<{ ok: false; errorCode: StudioVrmTexturePaintRuntimeErrorCode }>;

/**
 * 표면 브러시 커밋 시 오퍼레이션 목록을 Undo 레코더와 함께 대상 픽셀 버퍼에 순차 베이킹한다.
 */
export function bakeSurfaceBrushOperations(input: Readonly<{
  operations: readonly StudioVrmTexturePaintOp[];
  pixels: Uint8ClampedArray;
  originalPixels: Uint8ClampedArray;
  size: StudioVrmTextureSize;
  paintWrap: StudioVrmTexturePaintApplyOptions;
  recorder: StudioVrmTextureUndoRecorder;
  signal?: AbortSignal;
}>): BakeSurfaceBrushOperationsResult {
  let changedTexels = 0;
  let dirtyRect = EMPTY_STUDIO_VRM_TEXTURE_RECT;
  for (const operation of input.operations) {
    if (input.signal?.aborted) {
      return { ok: false, errorCode: "source-read-aborted" };
    }
    const rects = studioVrmTexturePaintOpRects(operation, input.size, input.paintWrap);
    if (!input.recorder.recordAll(rects)) {
      return { ok: false, errorCode: "history-budget" };
    }
    for (const rect of rects) dirtyRect = unionStudioVrmTextureRect(dirtyRect, rect);
    changedTexels += applyStudioVrmTexturePaintOp(
      input.pixels,
      input.size,
      operation,
      { ...input.paintWrap, originalPixels: input.originalPixels },
    );
  }
  if (changedTexels === 0) {
    return { ok: false, errorCode: "surface-operation-invalid" };
  }
  return { ok: true, changedTexels, dirtyRect };
}
