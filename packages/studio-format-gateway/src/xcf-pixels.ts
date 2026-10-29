/**
 * @file xcf-pixels.ts
 * @description GIMP XCF 레이어의 계층(hierarchy) → 레벨 → 타일을 따라가 직선 RGBA8 픽셀을 복원한다.
 *
 * 공개 포맷 명세(https://developer.gimp.org/core/standards/xcf/)의 사실만 자체 표현으로 구현했다(명세는
 * GPL-2.0-or-later라 문구 비복사, GIMP 소스 미열람, ADR-0008 §4). 사용하는 사실: 계층 구조는 가로·세로·픽셀당
 * 바이트 수와 첫 레벨 포인터를 갖고, 첫 레벨만 타일을 가지며 나머지는 타일 없는 축소 더미 레벨이다. 레벨의
 * 타일 포인터는 64x64 격자를 행 우선(위에서 아래, 왼쪽에서 오른쪽)으로 ceil(w/64)*ceil(h/64)개 늘어놓고 0으로
 * 끝난다. 타일 크기는 파일에 저장되지 않고 격자에서 계산하며, 가장 오른쪽 열과 가장 아래 행만 더 작다.
 */

import { XcfCursor } from "./xcf-cursor";
import {
  blitXcfTile,
  convertXcfToRgba8,
  decodeXcfRawTile,
  decodeXcfRleTile,
  XCF_TILE_SIZE,
  XcfTileError,
  xcfBytesPerPixel,
  type XcfPixelLayout,
  type XcfPrecision,
} from "./xcf-tiles";

/**
 * 압축 2(zlib) 타일을 푸는 어댑터. 압축 형식(zlib 래퍼인지 raw deflate인지)과 타일 압축 구간의 끝을 명세가
 * 정하지 않아 실표본으로 확정하지 못했으므로, 이 라이브러리는 기본 구현을 제공하지 않는다.
 */
export type XcfInflateAdapter = (compressed: Uint8Array, expectedBytes: number) => Promise<Uint8Array>;

export type XcfPixelDecodeFailureCode =
  | "hierarchy-invalid"
  | "bpp-mismatch"
  | "raw-too-large"
  | "pointer-invalid"
  | "tile-decode-failed"
  | "inflate-unavailable"
  | "aborted";

export class XcfPixelDecodeError extends Error {
  constructor(
    message: string,
    readonly code: XcfPixelDecodeFailureCode,
  ) {
    super(message);
    this.name = "XcfPixelDecodeError";
  }
}

export interface XcfPixelDecodeRequest {
  readonly bytes: Uint8Array;
  readonly pointerBytes: 4 | 8;
  readonly hierarchyPointer: number;
  readonly width: number;
  readonly height: number;
  readonly layout: XcfPixelLayout;
  readonly precision: XcfPrecision;
  readonly compression: 0 | 1 | 2;
  readonly palette: Uint8Array | null;
  readonly inflate: XcfInflateAdapter | undefined;
  /** 레이어 원시(인터리브) 버퍼의 상한 바이트. */
  readonly maxRawBytes: number;
  readonly signal: AbortSignal | undefined;
}

function checkPointer(bytes: Uint8Array, pointer: number, what: string): void {
  if (pointer <= 0 || pointer >= bytes.byteLength) {
    throw new XcfPixelDecodeError(`${what} 포인터 ${pointer}가 파일 범위 밖이다`, "pointer-invalid");
  }
}

/** 레이어 하나의 픽셀을 직선 RGBA8(width * height * 4바이트)로 복원한다. 실패하면 XcfPixelDecodeError를 던진다. */
export async function decodeXcfLayerPixels(request: XcfPixelDecodeRequest): Promise<Uint8Array> {
  const { bytes, pointerBytes, width, height, layout, precision, compression } = request;
  if (width === 0 || height === 0) return new Uint8Array(0);

  checkPointer(bytes, request.hierarchyPointer, "계층");
  const hierarchy = new XcfCursor(bytes, pointerBytes, request.hierarchyPointer);
  const hierarchyWidth = hierarchy.u32();
  const hierarchyHeight = hierarchy.u32();
  const bytesPerPixel = hierarchy.u32();
  const levelPointer = hierarchy.pointer();
  if (hierarchyWidth !== width || hierarchyHeight !== height) {
    throw new XcfPixelDecodeError(
      `계층 크기 ${hierarchyWidth}x${hierarchyHeight}가 레이어 크기 ${width}x${height}와 다르다`,
      "hierarchy-invalid",
    );
  }
  const expectedBytesPerPixel = xcfBytesPerPixel(layout, precision);
  if (bytesPerPixel !== expectedBytesPerPixel) {
    throw new XcfPixelDecodeError(
      `계층의 픽셀당 바이트 ${bytesPerPixel}가 기대값 ${expectedBytesPerPixel}와 다르다`,
      "bpp-mismatch",
    );
  }
  const rawBytes = width * height * bytesPerPixel;
  if (rawBytes > request.maxRawBytes) {
    throw new XcfPixelDecodeError(`레이어 원시 버퍼 ${rawBytes}바이트가 한도 ${request.maxRawBytes}를 넘는다`, "raw-too-large");
  }

  checkPointer(bytes, levelPointer, "레벨");
  const level = new XcfCursor(bytes, pointerBytes, levelPointer);
  const levelWidth = level.u32();
  const levelHeight = level.u32();
  if (levelWidth !== width || levelHeight !== height) {
    throw new XcfPixelDecodeError(
      `첫 레벨 크기 ${levelWidth}x${levelHeight}가 레이어 크기 ${width}x${height}와 다르다`,
      "hierarchy-invalid",
    );
  }
  const columns = Math.ceil(width / XCF_TILE_SIZE);
  const rows = Math.ceil(height / XCF_TILE_SIZE);
  const tileCount = columns * rows;
  if (tileCount * pointerBytes > level.remaining) {
    throw new XcfPixelDecodeError("타일 포인터 배열이 파일 끝을 넘는다", "hierarchy-invalid");
  }
  const tilePointers: number[] = [];
  for (let index = 0; index < tileCount; index += 1) tilePointers.push(level.pointer());

  const raw = new Uint8Array(rawBytes);
  const tileBuffer = new Uint8Array(XCF_TILE_SIZE * XCF_TILE_SIZE * bytesPerPixel);

  for (let index = 0; index < tileCount; index += 1) {
    if (request.signal?.aborted === true) {
      throw new XcfPixelDecodeError("픽셀 디코드가 중단되었다", "aborted");
    }
    const column = index % columns;
    const row = Math.floor(index / columns);
    const tileWidth = Math.min(XCF_TILE_SIZE, width - column * XCF_TILE_SIZE);
    const tileHeight = Math.min(XCF_TILE_SIZE, height - row * XCF_TILE_SIZE);
    const tilePixels = tileWidth * tileHeight;
    const tile = tileBuffer.subarray(0, tilePixels * bytesPerPixel);
    const start = tilePointers[index] ?? 0;
    checkPointer(bytes, start, `타일 ${index}`);

    try {
      if (compression === 1) {
        decodeXcfRleTile(bytes, start, bytes.byteLength, tilePixels, bytesPerPixel, tile);
      } else if (compression === 0) {
        decodeXcfRawTile(bytes, start, bytes.byteLength, tile.byteLength, tile);
      } else {
        if (request.inflate === undefined) {
          throw new XcfPixelDecodeError("압축 2(zlib) 타일에는 inflate 어댑터가 필요하다", "inflate-unavailable");
        }
        // 압축 구간의 끝은 명세에 없어 다음 타일 시작(없으면 파일 끝)까지를 어댑터에 넘긴다(미검증).
        const nextStart = tilePointers[index + 1] ?? bytes.byteLength;
        const end = nextStart > start ? nextStart : bytes.byteLength;
        const inflated = await request.inflate(bytes.subarray(start, end), tile.byteLength);
        if (inflated.byteLength !== tile.byteLength) {
          throw new XcfTileError(
            `inflate 결과 ${inflated.byteLength}바이트가 기대값 ${tile.byteLength}와 다르다`,
            "inflated-size-mismatch",
          );
        }
        tile.set(inflated);
      }
    } catch (error) {
      if (error instanceof XcfPixelDecodeError) throw error;
      if (error instanceof XcfTileError) {
        throw new XcfPixelDecodeError(`타일 ${index}(열 ${column}, 행 ${row}): ${error.message}`, "tile-decode-failed");
      }
      throw error;
    }
    blitXcfTile(raw, width, bytesPerPixel, column, row, tileWidth, tileHeight, tile);
  }

  return convertXcfToRgba8(raw, width * height, layout, precision, request.palette);
}
