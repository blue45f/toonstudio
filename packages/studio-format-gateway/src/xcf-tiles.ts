/**
 * @file xcf-tiles.ts
 * @description GIMP XCF 타일 디코드(압축 없음/RLE)와 정밀도별 RGBA8 환원.
 *
 * 공개 포맷 명세(https://developer.gimp.org/core/standards/xcf/)가 서술하는 사실만 자체 표현으로 구현했다.
 * 명세 문서는 GPL-2.0-or-later라 문구를 복사하지 않았고 GIMP 소스는 읽지 않았다(ADR-0008 §4).
 *
 * 근거 수준
 * - 실제 GIMP 산출물과 ImageMagick 6.9.12 디코드로 바이트 단위 일치를 확인한 것: RLE의 네 가지 연산(짧은
 *   반복/긴 반복/긴 리터럴/짧은 리터럴), 8비트 감마 정수(정밀도 150 또는 정밀도 필드 없음)의 RGB/RGBA/
 *   Gray/GrayA 환원.
 * - 실제 파일 한 쌍(32비트 감마 정수, 32비트 선형 실수)으로 최대 1/255 차이까지 교차 확인한 것: 정수는 값/최댓값,
 *   선형 정밀도는 sRGB OETF 적용 후 반올림.
 * - 합성 테스트로만 확인한 것(실표본 없음): 16비트 정수, 16/64비트 실수, 선형 8비트 정수, 부분 알파 환원.
 *   이 환원 정책은 설계 선택이며 GIMP의 내부 변환과 일치한다는 보증이 아니다.
 * - 미확인: 압축 2(zlib)의 정확한 형식, XCF 7~11의 8비트 초과 정밀도 바이트 순서(명세가 불특정이라고 밝힘).
 */

/** 타일 한 변의 최대 픽셀 수. 가장 오른쪽 열과 가장 아래 행만 더 작을 수 있다. */
export const XCF_TILE_SIZE = 64;

export type XcfTileErrorCode =
  | "rle-truncated"
  | "rle-overruns-plane"
  | "rle-degenerate-op"
  | "raw-truncated"
  | "inflated-size-mismatch";

/** 타일 하나를 푸는 중 생긴 오류. `xcf.ts`가 레이어 단위 진단으로 바꾼다. */
export class XcfTileError extends Error {
  constructor(
    message: string,
    readonly code: XcfTileErrorCode,
  ) {
    super(message);
    this.name = "XcfTileError";
  }
}

function byteAt(data: Uint8Array, index: number): number {
  return data[index] ?? 0;
}

/**
 * RLE 타일을 풀어 인터리브된 `out`(pixelCount * bytesPerPixel 바이트)에 채우고, 읽은 바이트 수를 돌려준다.
 * RLE는 바이트 평면별로 따로 인코딩된다: 첫 바이트 스트림(모든 픽셀의 첫 바이트), 둘째 스트림, ... 순이다.
 * 한 연산이 평면 경계를 넘거나 길이가 0인 퇴행 연산은 오류다.
 */
export function decodeXcfRleTile(
  data: Uint8Array,
  start: number,
  end: number,
  pixelCount: number,
  bytesPerPixel: number,
  out: Uint8Array,
): number {
  let position = start;
  for (let channel = 0; channel < bytesPerPixel; channel += 1) {
    let written = 0;
    while (written < pixelCount) {
      if (position >= end) {
        throw new XcfTileError("RLE 스트림이 평면이 채워지기 전에 끝났다", "rle-truncated");
      }
      const op = byteAt(data, position);
      position += 1;

      if (op >= 129) {
        // 짧은 리터럴: 뒤따르는 256 - op 바이트를 그대로 쓴다.
        const count = 256 - op;
        if (position + count > end) {
          throw new XcfTileError("RLE 리터럴이 스트림 끝을 넘는다", "rle-truncated");
        }
        if (written + count > pixelCount) {
          throw new XcfTileError("RLE 연산이 평면 경계를 넘는다", "rle-overruns-plane");
        }
        for (let index = 0; index < count; index += 1) {
          out[(written + index) * bytesPerPixel + channel] = byteAt(data, position + index);
        }
        position += count;
        written += count;
      } else if (op === 128) {
        // 긴 리터럴: 16비트 길이 다음에 그 길이만큼의 바이트.
        if (position + 2 > end) {
          throw new XcfTileError("RLE 긴 리터럴 길이가 스트림 끝을 넘는다", "rle-truncated");
        }
        const count = (byteAt(data, position) << 8) | byteAt(data, position + 1);
        position += 2;
        if (count === 0) {
          throw new XcfTileError("길이 0인 RLE 긴 리터럴 연산", "rle-degenerate-op");
        }
        if (position + count > end) {
          throw new XcfTileError("RLE 리터럴이 스트림 끝을 넘는다", "rle-truncated");
        }
        if (written + count > pixelCount) {
          throw new XcfTileError("RLE 연산이 평면 경계를 넘는다", "rle-overruns-plane");
        }
        for (let index = 0; index < count; index += 1) {
          out[(written + index) * bytesPerPixel + channel] = byteAt(data, position + index);
        }
        position += count;
        written += count;
      } else {
        // 반복: op === 127 이면 16비트 횟수가 따로 오고, 그 밖에는 op + 1 번 반복한다.
        let count = op + 1;
        if (op === 127) {
          if (position + 2 > end) {
            throw new XcfTileError("RLE 긴 반복 길이가 스트림 끝을 넘는다", "rle-truncated");
          }
          count = (byteAt(data, position) << 8) | byteAt(data, position + 1);
          position += 2;
          if (count === 0) {
            throw new XcfTileError("길이 0인 RLE 긴 반복 연산", "rle-degenerate-op");
          }
        }
        if (position >= end) {
          throw new XcfTileError("RLE 반복 값이 스트림 끝을 넘는다", "rle-truncated");
        }
        if (written + count > pixelCount) {
          throw new XcfTileError("RLE 연산이 평면 경계를 넘는다", "rle-overruns-plane");
        }
        const value = byteAt(data, position);
        position += 1;
        for (let index = 0; index < count; index += 1) {
          out[(written + index) * bytesPerPixel + channel] = value;
        }
        written += count;
      }
    }
  }
  return position - start;
}

/** 압축 없는 타일: 픽셀 단위로 인터리브된 바이트가 그대로 이어진다. */
export function decodeXcfRawTile(
  data: Uint8Array,
  start: number,
  end: number,
  byteCount: number,
  out: Uint8Array,
): void {
  if (start + byteCount > end) {
    throw new XcfTileError("압축 없는 타일이 스트림 끝을 넘는다", "raw-truncated");
  }
  out.set(data.subarray(start, start + byteCount));
}

/**
 * 타일 하나를 레이어 전체 버퍼(픽셀 단위 인터리브)의 알맞은 자리에 행 단위로 복사한다.
 * 레이어 가로 `layerWidth`는 픽셀 수, `column`/`row`는 타일 격자의 좌표다.
 */
export function blitXcfTile(
  layerRaw: Uint8Array,
  layerWidth: number,
  bytesPerPixel: number,
  column: number,
  row: number,
  tileWidth: number,
  tileHeight: number,
  tile: Uint8Array,
): void {
  const rowBytes = tileWidth * bytesPerPixel;
  for (let y = 0; y < tileHeight; y += 1) {
    const destination = ((row * XCF_TILE_SIZE + y) * layerWidth + column * XCF_TILE_SIZE) * bytesPerPixel;
    layerRaw.set(tile.subarray(y * rowBytes, (y + 1) * rowBytes), destination);
  }
}

// ---------------------------------------------------------------------------
// 정밀도와 RGBA8 환원
// ---------------------------------------------------------------------------

export interface XcfPrecision {
  readonly id: number;
  readonly bytesPerComponent: 1 | 2 | 4 | 8;
  readonly numeric: "integer" | "float";
  /** 선형 값이면 색 채널에 sRGB OETF를 적용해 환원한다. 알파에는 적용하지 않는다. */
  readonly linear: boolean;
}

type PrecisionRow = readonly [number, 1 | 2 | 4 | 8, "integer" | "float", boolean];

const PRECISION_ROWS: readonly PrecisionRow[] = [
  [100, 1, "integer", true],
  [150, 1, "integer", false],
  [200, 2, "integer", true],
  [250, 2, "integer", false],
  [300, 4, "integer", true],
  [350, 4, "integer", false],
  [500, 2, "float", true],
  [550, 2, "float", false],
  [600, 4, "float", true],
  [650, 4, "float", false],
  [700, 8, "float", true],
  [750, 8, "float", false],
];

const PRECISION_BY_ID: ReadonlyMap<number, XcfPrecision> = new Map(
  PRECISION_ROWS.map(([id, bytesPerComponent, numeric, linear]) => [
    id,
    Object.freeze({ id, bytesPerComponent, numeric, linear }),
  ]),
);

/** 정밀도 필드가 없는 XCF 3 이하는 8비트 감마 정수다. */
export const XCF_LEGACY_PRECISION_ID = 150;

/** XCF 7 이상에서 쓰이는 정밀도 번호. 알려진 집합이 아니면 null이다(개발판 값 0~4, 400/450 등 포함). */
export function describeXcfPrecision(id: number): XcfPrecision | null {
  return PRECISION_BY_ID.get(id) ?? null;
}

export type XcfBaseType = "rgb" | "grayscale" | "indexed";

export interface XcfPixelLayout {
  readonly baseType: XcfBaseType;
  readonly hasAlpha: boolean;
}

/** 색 채널 수(알파 제외). */
export function xcfColorComponents(baseType: XcfBaseType): number {
  return baseType === "rgb" ? 3 : 1;
}

/** 픽셀당 바이트 수. 인덱스드는 정밀도와 무관하게 항상 8비트다. */
export function xcfBytesPerPixel(layout: XcfPixelLayout, precision: XcfPrecision): number {
  const components = xcfColorComponents(layout.baseType) + (layout.hasAlpha ? 1 : 0);
  return components * (layout.baseType === "indexed" ? 1 : precision.bytesPerComponent);
}

function srgbEncode(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

function toByte(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 255;
  return Math.round(value * 255);
}

function halfToFloat(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * mantissa * Math.pow(2, -24);
  if (exponent === 31) return mantissa === 0 ? sign * Infinity : Number.NaN;
  return sign * (1 + mantissa / 1024) * Math.pow(2, exponent - 15);
}

/**
 * 레이어의 인터리브 원시 바이트를 직선(비 premultiplied) RGBA8로 바꾼다.
 * - 인덱스드는 `palette`(3바이트 RGB 반복)로 색을 찾는다. 범위를 벗어난 인덱스는 검정이다.
 * - 회색은 R=G=B로 펼치고, 알파가 없으면 255다.
 * - 8비트 초과 정수는 값/최댓값, 실수는 그대로 0~1로 보고, 선형 정밀도의 색 채널에는 sRGB OETF를 적용한 뒤
 *   반올림한다. 범위를 벗어난 값과 NaN은 0~1로 자른다.
 */
export function convertXcfToRgba8(
  raw: Uint8Array,
  pixelCount: number,
  layout: XcfPixelLayout,
  precision: XcfPrecision,
  palette: Uint8Array | null,
): Uint8Array {
  const out = new Uint8Array(pixelCount * 4);
  const colorComponents = xcfColorComponents(layout.baseType);
  const components = colorComponents + (layout.hasAlpha ? 1 : 0);

  if (layout.baseType === "indexed") {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const index = byteAt(raw, pixel * components);
      const paletteOffset = index * 3;
      const inRange = palette !== null && paletteOffset + 2 < palette.length;
      const target = pixel * 4;
      out[target] = inRange ? byteAt(palette, paletteOffset) : 0;
      out[target + 1] = inRange ? byteAt(palette, paletteOffset + 1) : 0;
      out[target + 2] = inRange ? byteAt(palette, paletteOffset + 2) : 0;
      out[target + 3] = layout.hasAlpha ? byteAt(raw, pixel * components + 1) : 255;
    }
    return out;
  }

  // 8비트 감마 정수는 값을 그대로 옮기면 된다. 가장 흔한 경로라 따로 둔다.
  if (precision.bytesPerComponent === 1 && precision.numeric === "integer" && !precision.linear) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const source = pixel * components;
      const target = pixel * 4;
      if (colorComponents === 3) {
        out[target] = byteAt(raw, source);
        out[target + 1] = byteAt(raw, source + 1);
        out[target + 2] = byteAt(raw, source + 2);
      } else {
        const gray = byteAt(raw, source);
        out[target] = gray;
        out[target + 1] = gray;
        out[target + 2] = gray;
      }
      out[target + 3] = layout.hasAlpha ? byteAt(raw, source + colorComponents) : 255;
    }
    return out;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const step = precision.bytesPerComponent;
  const normalized = (offset: number): number => {
    if (precision.numeric === "float") {
      if (step === 2) return halfToFloat(view.getUint16(offset, false));
      if (step === 4) return view.getFloat32(offset, false);
      return view.getFloat64(offset, false);
    }
    if (step === 1) return view.getUint8(offset) / 255;
    if (step === 2) return view.getUint16(offset, false) / 65535;
    return view.getUint32(offset, false) / 4294967295;
  };
  const colorByte = (offset: number): number => {
    const value = normalized(offset);
    return toByte(precision.linear ? srgbEncode(Math.min(Math.max(value, 0), 1)) : value);
  };

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = pixel * components * step;
    const target = pixel * 4;
    if (colorComponents === 3) {
      out[target] = colorByte(source);
      out[target + 1] = colorByte(source + step);
      out[target + 2] = colorByte(source + 2 * step);
    } else {
      const gray = colorByte(source);
      out[target] = gray;
      out[target + 1] = gray;
      out[target + 2] = gray;
    }
    out[target + 3] = layout.hasAlpha ? toByte(normalized(source + colorComponents * step)) : 255;
  }
  return out;
}
