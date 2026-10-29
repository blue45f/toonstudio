/**
 * @file aseprite-sprite-pixels.ts
 * @description Aseprite 셀·타일셋의 zlib 해제와 RGBA8 변환.
 *
 * 출처와 이용 조건은 `aseprite-sprite-cursor.ts` 머리말과 같다. 셀 픽셀의 해제 결과는 압축하지 않은 형식과 같은
 * 바이트열이다(RGBA는 R,G,B,A, 회색은 값,알파, 인덱스드는 팔레트 인덱스 한 바이트). 압축 폭탄은 압축률이 아니라
 * 선언한 해제 크기와 호출자가 정한 예산으로 막는다. 빈 RGBA 셀은 정상적으로도 1000배 가까이 줄어든다.
 */

import type { AsepriteRgba } from "./aseprite-sprite-chunks";

/** zlib(RFC 1950) 스트림을 풀어 정확히 `expectedBytes`바이트를 돌려줘야 한다. */
export type AsepriteInflateAdapter = (
  compressed: Uint8Array,
  expectedBytes: number,
  signal?: AbortSignal,
) => Promise<Uint8Array>;

export type AsepritePixelDecodeFailureCode =
  | "budget-exceeded"
  | "size-invalid"
  | "inflate-unavailable"
  | "inflate-failed"
  | "length-mismatch";

export class AsepritePixelDecodeError extends Error {
  constructor(
    message: string,
    readonly code: AsepritePixelDecodeFailureCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AsepritePixelDecodeError";
  }
}

/** 디코드 결과 바이트의 남은 예산. 할당 전에 `reserve`로 확인한다. */
export class AsepriteDecodeBudget {
  constructor(
    private left: number,
    readonly perItemMax: number,
  ) {}

  get remaining(): number {
    return this.left;
  }

  reserve(bytes: number, what: string): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new AsepritePixelDecodeError(`${what}의 해제 크기 ${bytes}가 올바르지 않다`, "size-invalid");
    }
    if (bytes > this.perItemMax) {
      throw new AsepritePixelDecodeError(`${what}의 해제 크기 ${bytes}가 항목당 한도 ${this.perItemMax}를 넘는다`, "budget-exceeded");
    }
    if (bytes > this.left) {
      throw new AsepritePixelDecodeError(`${what}의 해제 크기 ${bytes}가 남은 예산 ${this.left}를 넘는다`, "budget-exceeded");
    }
    this.left -= bytes;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new DOMException("Aseprite 가져오기가 중단되었다", "AbortError");
}

/** 기본 해제기: `DecompressionStream("deflate")`(zlib 래퍼). 선언 크기를 넘으면 즉시 멈춘다. */
export const inflateZlibWithDecompressionStream: AsepriteInflateAdapter = async (compressed, expectedBytes, signal) => {
  if (typeof DecompressionStream === "undefined") {
    throw new AsepritePixelDecodeError("이 환경에는 zlib 해제기가 없다. inflate 어댑터를 주입해 달라", "inflate-unavailable");
  }
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    const source = new Blob([compressed.slice().buffer]).stream();
    reader = (source.pipeThrough(new DecompressionStream("deflate")) as ReadableStream<Uint8Array>).getReader();
  } catch (cause) {
    throw new AsepritePixelDecodeError("zlib 스트림을 만들지 못했다", "inflate-unavailable", { cause });
  }
  // 선언 크기만큼 미리 할당하지 않는다. 손상된 파일이 큰 크기를 선언해도 실제로 풀린 만큼만 메모리를 쓴다.
  const parts: Uint8Array[] = [];
  let written = 0;
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (written + value.byteLength > expectedBytes) {
        throw new AsepritePixelDecodeError(`해제 결과가 선언한 ${expectedBytes}바이트를 넘는다`, "length-mismatch");
      }
      parts.push(value);
      written += value.byteLength;
    }
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    if (cause instanceof AsepritePixelDecodeError || (cause instanceof DOMException && cause.name === "AbortError")) throw cause;
    throw new AsepritePixelDecodeError("zlib 스트림이 손상되었다", "inflate-failed", { cause });
  }
  if (written !== expectedBytes) {
    throw new AsepritePixelDecodeError(`해제 결과 ${written}바이트가 선언한 ${expectedBytes}바이트와 다르다`, "length-mismatch");
  }
  const out = new Uint8Array(expectedBytes);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
};

/** 압축된 페이로드를 예산 안에서 풀어 정확한 길이의 바이트열을 돌려준다. */
export async function inflateWithinBudget(
  compressed: Uint8Array,
  expectedBytes: number,
  budget: AsepriteDecodeBudget,
  what: string,
  inflate: AsepriteInflateAdapter | undefined,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  budget.reserve(expectedBytes, what);
  const adapter = inflate ?? inflateZlibWithDecompressionStream;
  let result: Uint8Array;
  try {
    result = await adapter(compressed, expectedBytes, signal);
  } catch (cause) {
    if (cause instanceof AsepritePixelDecodeError || (cause instanceof DOMException && cause.name === "AbortError")) throw cause;
    throw new AsepritePixelDecodeError(`${what}의 zlib 해제에 실패했다`, "inflate-failed", { cause });
  }
  if (!(result instanceof Uint8Array)) {
    throw new AsepritePixelDecodeError(`${what}의 inflate 어댑터가 Uint8Array를 돌려주지 않았다`, "inflate-failed");
  }
  if (result.byteLength !== expectedBytes) {
    throw new AsepritePixelDecodeError(`${what}의 해제 결과 ${result.byteLength}바이트가 선언한 ${expectedBytes}바이트와 다르다`, "length-mismatch");
  }
  return result;
}

export interface AsepriteRgba8Conversion {
  /** 폭×높이×4바이트 RGBA(스트레이트 알파로 간주). */
  readonly rgba: Uint8Array;
  /** 팔레트 범위 밖 인덱스를 투명으로 바꾼 픽셀 수. */
  readonly outOfRangePaletteIndexCount: number;
}

/**
 * 셀 픽셀을 RGBA8로 바꾼다. 회색은 (값,값,값,알파), 인덱스드는 팔레트를 조회한다.
 * 투명 인덱스는 배경 레이어가 아닌 레이어에서만 투명으로 취급한다. 알파가 스트레이트인지 프리멀티플라이인지는
 * 문서에 없어 스트레이트로 가정했다. 셀·레이어 불투명도와 색 프로파일은 적용하지 않는다.
 */
export function asepriteCelToRgba8(params: {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly colorDepth: 8 | 16 | 32;
  readonly palette: readonly AsepriteRgba[];
  readonly transparentIndex: number;
  readonly isBackgroundLayer: boolean;
}): AsepriteRgba8Conversion {
  const { pixels, width, height, colorDepth, palette } = params;
  const count = width * height;
  const bytesPerPixel = colorDepth / 8;
  if (pixels.byteLength !== count * bytesPerPixel) {
    throw new RangeError(`픽셀 ${pixels.byteLength}바이트가 ${width}x${height}x${bytesPerPixel}와 다르다`);
  }
  const rgba = new Uint8Array(count * 4);
  let outOfRange = 0;
  if (colorDepth === 32) {
    rgba.set(pixels);
  } else if (colorDepth === 16) {
    for (let i = 0; i < count; i += 1) {
      const v = pixels[i * 2]!;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = pixels[i * 2 + 1]!;
    }
  } else {
    for (let i = 0; i < count; i += 1) {
      const index = pixels[i]!;
      if (!params.isBackgroundLayer && index === params.transparentIndex) continue;
      const color = palette[index];
      if (color === undefined) {
        outOfRange += 1;
        continue;
      }
      rgba[i * 4] = color.r;
      rgba[i * 4 + 1] = color.g;
      rgba[i * 4 + 2] = color.b;
      rgba[i * 4 + 3] = color.a;
    }
  }
  return { rgba, outOfRangePaletteIndexCount: outOfRange };
}

export interface AsepriteTileFields {
  readonly tileId: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly flipDiagonal: boolean;
}

/** 타일맵 셀의 원시 값을 마스크로 나눈다. 마스크는 셀 청크가 선언한 값이다. */
export function asepriteTileFields(
  value: number,
  masks: { readonly tileIdMask: number; readonly xFlipMask: number; readonly yFlipMask: number; readonly diagonalFlipMask: number },
): AsepriteTileFields {
  return {
    tileId: (value & masks.tileIdMask) >>> 0,
    flipX: (value & masks.xFlipMask) !== 0,
    flipY: (value & masks.yFlipMask) !== 0,
    flipDiagonal: (value & masks.diagonalFlipMask) !== 0,
  };
}

/** 타일맵 셀 바이트열(리틀 엔디언 8/16/32비트 값)을 값 배열로 읽는다. */
export function asepriteTilemapValues(bytes: Uint8Array, bitsPerTile: number): Uint32Array {
  const step = bitsPerTile / 8;
  if (step !== 1 && step !== 2 && step !== 4) throw new RangeError(`지원하지 않는 타일당 비트 수 ${bitsPerTile}`);
  const count = Math.floor(bytes.byteLength / step);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = step === 1 ? view.getUint8(i) : step === 2 ? view.getUint16(i * 2, true) : view.getUint32(i * 4, true);
  }
  return out;
}
