/**
 * @file kra-colorspace.ts
 * @description Krita 색 공간 이름 → 타일 픽셀 배치, 전달 함수(감마) 판정, RGBA8 환원.
 *
 * 근거는 전부 Krita 5.2.2를 블랙박스로 돌려 만든 `.kra`를 관찰한 사실이다(소스는 읽지 않았다).
 * - 타일을 LZF로 푼 데이터는 바이트 평면 배치다: 평면 k는 모든 픽셀의 k번째 바이트(평면 하나가 타일 너비 * 높이
 *   바이트)이고, 픽셀 하나의 바이트는 색 공간 고유의 인터리브 배치다. 압축이 안 되어 비압축으로 저장된 타일은
 *   픽셀을 이어 붙인 배치라서 `kra-tiles.ts`가 평면으로 바꾼 뒤 이 파일의 변환기에 넘긴다.
 * - 정수 형식: `RGBA`(8비트)의 인터리브 바이트는 B, G, R, A다. `RGBA16`은 B, G, R, A 순서의 16비트 리틀 엔디언 샘플이다.
 *   `GRAYA`는 회색, 알파 순서이고 `GRAYAU16`은 회색, 알파의 16비트 리틀 엔디언이다.
 * - 실수 형식: `RGBAF16`·`RGBAF32`는 **R, G, B, A** 순서(정수 형식과 다르다)의 리틀 엔디언 반정밀도(IEEE 754 binary16)·단정밀도
 *   부동소수 샘플이고, `GRAYAF16`·`GRAYAF32`는 회색, 알파 순서다. 값은 프로파일의 전달 함수 아래 0~1이 기준이며, 알파는 직선 알파
 *   (색이 알파로 곱해져 있지 않다)다. 불투명·반투명 문서 10개를 저장한 합성 이미지(`mergedimage.png`)와 대조해 확인했다: 프로파일이
 *   `g10`(선형)이면 sRGB 전달 함수를 거친 값이, `srgbtrc`이면 값 그대로가 8비트 PNG와 1단계 이내로 일치했고 알파는 정확히 일치했다.
 * - 16비트 정수 샘플의 의미는 문서 프로파일이 정한다. 같은 8비트 PNG를 `sRGB-elle-V2-srgbtrc.icc`(sRGB 감마)와
 *   `sRGB-elle-V2-g10.icc`(선형) 16비트 문서로 바꿔 저장했을 때, 원본 PNG의 8비트 값은 전자에서 `round(v / 257)`,
 *   후자에서 sRGB OETF를 거친 값과 일치했다(검증 결과는 설계 문서).
 * - 8비트 정수 문서도 프로파일이 선형(`g10`)이면 샘플이 선형 값이다. 같은 내용을 Krita의 프로파일 변환(`g10` -> `srgbtrc`)에 맡겨 얻은
 *   값은 sRGB 전달 함수를 거친 값과 최대 1단계 차이로 일치했다(RGBA 8비트, GRAYA 8비트 모두). 이 파일은 출력을 항상 sRGB 부호화 RGBA8로
 *   맞춘다.
 * - 그 밖의 색 공간(CMYK, Lab, XYZ, YCbCr)은 타일 배치는 같지만 이 파일은 RGBA8로 환원하지 않는다.
 *
 * 16비트를 넘는 샘플(16비트 정수, 16·32비트 실수)은 모두 같은 16비트 중간값을 거쳐 8비트가 된다: 실수는 0~1로 자르고(음수·NaN은 0,
 * 1 이상·무한대는 1) 65,535를 곱해 반올림한 정수로 바꾼 뒤 16비트 정수와 같은 표로 줄인다. 같은 값을 반정밀도·단정밀도·16비트 정수로
 * 적은 문서가 같은 RGBA8을 내고, 표 하나(65,536칸)로 처리하므로 빠르다. 정확한 식(`round(255 * OETF(값))`)과의 차이는 8비트 단계의
 * 0.03 이내라서 드물게 한 단계가 달라질 수 있고, 이 정도는 Krita 자신의 변환과의 차이(1단계)보다 작다. 범위를 벗어난 값(HDR)은 잘린다.
 */

export type KraTransfer = "srgb" | "linear";

/** `g10`·`linear`가 단어로 들어 있는 이름만 선형으로 본다(`g100`, `Canon_G100.icc` 같은 이름은 선형이 아니다). */
const LINEAR_PROFILE_TOKEN = /(?:^|[^a-z0-9])(?:g10|linear)(?:[^a-z0-9]|$)/u;

export interface KraPixelFormat {
  /** `colorspacename` 속성 값. */
  readonly colorSpace: string;
  readonly pixelBytes: number;
  readonly model: "rgb" | "gray";
  /** 샘플 하나의 비트 수. */
  readonly depth: 8 | 16 | 32;
  /** 정수 샘플이면 "int", IEEE 754 부동소수 샘플(16비트는 반정밀도, 32비트는 단정밀도)이면 "float". */
  readonly sample: "int" | "float";
}

const FORMATS: readonly KraPixelFormat[] = [
  { colorSpace: "RGBA", pixelBytes: 4, model: "rgb", depth: 8, sample: "int" },
  { colorSpace: "RGBA16", pixelBytes: 8, model: "rgb", depth: 16, sample: "int" },
  { colorSpace: "GRAYA", pixelBytes: 2, model: "gray", depth: 8, sample: "int" },
  { colorSpace: "GRAYAU16", pixelBytes: 4, model: "gray", depth: 16, sample: "int" },
  { colorSpace: "RGBAF16", pixelBytes: 8, model: "rgb", depth: 16, sample: "float" },
  { colorSpace: "RGBAF32", pixelBytes: 16, model: "rgb", depth: 32, sample: "float" },
  { colorSpace: "GRAYAF16", pixelBytes: 4, model: "gray", depth: 16, sample: "float" },
  { colorSpace: "GRAYAF32", pixelBytes: 8, model: "gray", depth: 32, sample: "float" },
];

const FORMATS_BY_NAME: ReadonlyMap<string, KraPixelFormat> = new Map(FORMATS.map((format) => [format.colorSpace, format]));

/** RGBA8로 환원할 수 있는 색 공간 이름들(진단 메시지용). */
export const KRA_SUPPORTED_COLOR_SPACES: readonly string[] = Object.freeze(FORMATS.map((format) => format.colorSpace));

/** RGBA8로 환원할 수 있는 색 공간이면 배치를, 아니면 null을 돌려준다. */
export function describeKraPixelFormat(colorSpace: string | null): KraPixelFormat | null {
  return colorSpace === null ? null : (FORMATS_BY_NAME.get(colorSpace) ?? null);
}

export interface KraProfileTransfer {
  readonly transfer: KraTransfer;
  /** 이름에서 전달 함수를 읽어 냈는지. false면 sRGB 감마로 가정한 것이다. */
  readonly recognized: boolean;
}

/**
 * 프로파일 이름으로 전달 함수를 판정한다. `g10`(감마 1.0)·`linear`가 들어 있으면 선형, `srgbtrc`·`sRGB built-in`이면
 * sRGB 감마다. 이름만 보므로 임베드된 ICC 곡선을 읽지 않으며, 원색(primaries) 변환도 하지 않는다.
 */
export function classifyKraProfileTransfer(profileName: string | null): KraProfileTransfer {
  const name = (profileName ?? "").toLowerCase();
  if (LINEAR_PROFILE_TOKEN.test(name)) return { transfer: "linear", recognized: true };
  if (/srgbtrc|srgb[ -]?built|srgb[ -]?iec/u.test(name)) return { transfer: "srgb", recognized: true };
  return { transfer: "srgb", recognized: false };
}

/**
 * sRGB 원색을 쓰는 프로파일로 보이는지. 회색 프로파일(원색 없음)도 true다. 이름 앞머리로 판정한다: `...-srgbtrc.icc`의 `srgbtrc`는 전달 함수
 * 이름이라서(예: `Rec2020-elle-V4-srgbtrc.icc`는 원색이 Rec2020) 이름 어디든 `srgb`가 있다고 sRGB로 보지 않는다.
 */
export function kraProfileLooksSrgb(profileName: string | null): boolean {
  return /^\s*(?:srgb|gray|grey)/u.test((profileName ?? "").toLowerCase());
}

let srgbReduceLut: Uint8Array | null = null;
let linearReduceLut: Uint8Array | null = null;
let alphaReduceLut: Uint8Array | null = null;

function srgbOetf(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

/** 16비트 샘플(0~65535) → 8비트. 감마 부호화 값은 비례로, 선형 값은 sRGB OETF를 거쳐 반올림한다. */
export function kraReduceLut(transfer: KraTransfer): Uint8Array {
  if (transfer === "srgb") {
    if (srgbReduceLut === null) {
      srgbReduceLut = new Uint8Array(65_536);
      for (let value = 0; value < 65_536; value += 1) srgbReduceLut[value] = Math.round(value / 257);
    }
    return srgbReduceLut;
  }
  if (linearReduceLut === null) {
    linearReduceLut = new Uint8Array(65_536);
    for (let value = 0; value < 65_536; value += 1) linearReduceLut[value] = Math.round(255 * srgbOetf(value / 65_535));
  }
  return linearReduceLut;
}

let identityLut8: Uint8Array | null = null;
let linearLut8: Uint8Array | null = null;

/** 8비트 샘플 -> 8비트. 감마 부호화 문서는 값 그대로, 선형 문서는 sRGB 전달 함수를 거친다. 알파에는 쓰지 않는다. */
export function kraReduceLut8(transfer: KraTransfer): Uint8Array {
  if (transfer === "srgb") {
    identityLut8 ??= Uint8Array.from({ length: 256 }, (_, value) => value);
    return identityLut8;
  }
  linearLut8 ??= Uint8Array.from({ length: 256 }, (_, value) => Math.round(255 * srgbOetf(value / 255)));
  return linearLut8;
}

/** IEEE 754 binary16 비트(0~65535) -> 수. 비정규 수, 무한대, NaN을 포함한다. */
export function halfFloatToNumber(bits: number): number {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/** 샘플 값을 16비트 정수로 양자화한다: 0~1로 자르고(음수·NaN은 0, 1 이상은 65,535) 65,535를 곱해 반올림한다. */
function quantizeUnit16(value: number): number {
  return value > 0 ? (value >= 1 ? 65_535 : Math.round(value * 65_535)) : 0;
}

const halfColorLuts = new Map<KraTransfer, Uint8Array>();
let halfAlphaLut: Uint8Array | null = null;

/** 반정밀도 부동소수 비트(0~65535) -> 8비트 색 채널. 16비트로 양자화한 값을 `kraReduceLut`와 같은 식으로 줄인다. */
export function kraHalfFloatLut(transfer: KraTransfer): Uint8Array {
  let lut = halfColorLuts.get(transfer);
  if (lut === undefined) {
    const reduce = kraReduceLut(transfer);
    lut = new Uint8Array(65_536);
    for (let bits = 0; bits < 65_536; bits += 1) lut[bits] = reduce[quantizeUnit16(halfFloatToNumber(bits))]!;
    halfColorLuts.set(transfer, lut);
  }
  return lut;
}

/** 반정밀도 부동소수 비트 -> 8비트 알파. 알파에는 전달 함수가 없다. */
function kraHalfAlphaLut(): Uint8Array {
  if (halfAlphaLut === null) {
    const alpha = kraAlphaLut();
    halfAlphaLut = new Uint8Array(65_536);
    for (let bits = 0; bits < 65_536; bits += 1) halfAlphaLut[bits] = alpha[quantizeUnit16(halfFloatToNumber(bits))]!;
  }
  return halfAlphaLut;
}

/**
 * 형식에 맞는 색 채널 환원 표. 8비트 정수는 256칸(샘플 값이 색인), 16비트 정수는 65,536칸(샘플 값이 색인), 16비트 실수는 65,536칸(반정밀도
 * 비트가 색인), 32비트 실수는 65,536칸(16비트로 양자화한 값이 색인)이다.
 */
export function kraColorLut(format: KraPixelFormat, transfer: KraTransfer): Uint8Array {
  if (format.sample === "float") return format.depth === 16 ? kraHalfFloatLut(transfer) : kraReduceLut(transfer);
  return format.depth === 16 ? kraReduceLut(transfer) : kraReduceLut8(transfer);
}

/** 알파는 감마가 없으므로 항상 비례로 줄인다. */
function kraAlphaLut(): Uint8Array {
  if (alphaReduceLut === null) {
    alphaReduceLut = new Uint8Array(65_536);
    for (let value = 0; value < 65_536; value += 1) alphaReduceLut[value] = Math.round(value / 257);
  }
  return alphaReduceLut;
}

const f32Bits = new Uint32Array(1);
const f32Value = new Float32Array(f32Bits.buffer);

/** 리틀 엔디언 4바이트 단정밀도 부동소수 -> 16비트로 양자화한 값. */
function quantizeF32(b0: number, b1: number, b2: number, b3: number): number {
  f32Bits[0] = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
  return quantizeUnit16(f32Value[0]!);
}

/** 실수 형식의 한 행. 바이트 위치는 헤더 주석을 따른다(RGBA는 R, G, B, A, 회색은 회색, 알파 순서). */
function convertFloatRow(
  format: KraPixelFormat,
  lut: Uint8Array,
  raw: Uint8Array,
  plane: number,
  firstPixel: number,
  count: number,
  out: Uint8Array,
  outOffset: number,
): void {
  let o = outOffset;
  const end = firstPixel + count;
  if (format.depth === 16) {
    const alphaLut = kraHalfAlphaLut();
    if (format.model === "rgb") {
      for (let p = firstPixel; p < end; p += 1) {
        out[o] = lut[raw[p]! | (raw[plane + p]! << 8)]!;
        out[o + 1] = lut[raw[2 * plane + p]! | (raw[3 * plane + p]! << 8)]!;
        out[o + 2] = lut[raw[4 * plane + p]! | (raw[5 * plane + p]! << 8)]!;
        out[o + 3] = alphaLut[raw[6 * plane + p]! | (raw[7 * plane + p]! << 8)]!;
        o += 4;
      }
    } else {
      for (let p = firstPixel; p < end; p += 1) {
        const gray = lut[raw[p]! | (raw[plane + p]! << 8)]!;
        out[o] = gray;
        out[o + 1] = gray;
        out[o + 2] = gray;
        out[o + 3] = alphaLut[raw[2 * plane + p]! | (raw[3 * plane + p]! << 8)]!;
        o += 4;
      }
    }
    return;
  }
  const alphaLut = kraAlphaLut();
  if (format.model === "rgb") {
    for (let p = firstPixel; p < end; p += 1) {
      out[o] = lut[quantizeF32(raw[p]!, raw[plane + p]!, raw[2 * plane + p]!, raw[3 * plane + p]!)]!;
      out[o + 1] = lut[quantizeF32(raw[4 * plane + p]!, raw[5 * plane + p]!, raw[6 * plane + p]!, raw[7 * plane + p]!)]!;
      out[o + 2] = lut[quantizeF32(raw[8 * plane + p]!, raw[9 * plane + p]!, raw[10 * plane + p]!, raw[11 * plane + p]!)]!;
      out[o + 3] = alphaLut[quantizeF32(raw[12 * plane + p]!, raw[13 * plane + p]!, raw[14 * plane + p]!, raw[15 * plane + p]!)]!;
      o += 4;
    }
  } else {
    for (let p = firstPixel; p < end; p += 1) {
      const gray = lut[quantizeF32(raw[p]!, raw[plane + p]!, raw[2 * plane + p]!, raw[3 * plane + p]!)]!;
      out[o] = gray;
      out[o + 1] = gray;
      out[o + 2] = gray;
      out[o + 3] = alphaLut[quantizeF32(raw[4 * plane + p]!, raw[5 * plane + p]!, raw[6 * plane + p]!, raw[7 * plane + p]!)]!;
      o += 4;
    }
  }
}

/**
 * 바이트 평면 배치의 한 행(`count` 픽셀)을 직선 RGBA8로 바꿔 `out`의 `outOffset`부터 쓴다.
 * `raw`의 평면 k는 `raw[k * plane + 픽셀 번호]`다. `lut`는 `kraColorLut`이 돌려주는 색 채널용 표다(알파에는 쓰지 않는다).
 */
export function convertKraRow(
  format: KraPixelFormat,
  lut: Uint8Array,
  raw: Uint8Array,
  plane: number,
  firstPixel: number,
  count: number,
  out: Uint8Array,
  outOffset: number,
): void {
  if (format.sample === "float") {
    convertFloatRow(format, lut, raw, plane, firstPixel, count, out, outOffset);
    return;
  }
  let o = outOffset;
  const end = firstPixel + count;
  if (format.model === "rgb" && format.depth === 8) {
    for (let p = firstPixel; p < end; p += 1) {
      out[o] = lut[raw[2 * plane + p]!]!;
      out[o + 1] = lut[raw[plane + p]!]!;
      out[o + 2] = lut[raw[p]!]!;
      out[o + 3] = raw[3 * plane + p]!;
      o += 4;
    }
  } else if (format.model === "gray" && format.depth === 8) {
    for (let p = firstPixel; p < end; p += 1) {
      const gray = lut[raw[p]!]!;
      out[o] = gray;
      out[o + 1] = gray;
      out[o + 2] = gray;
      out[o + 3] = raw[plane + p]!;
      o += 4;
    }
  } else if (format.model === "rgb") {
    const alphaLut = kraAlphaLut();
    for (let p = firstPixel; p < end; p += 1) {
      out[o] = lut[raw[4 * plane + p]! | (raw[5 * plane + p]! << 8)]!;
      out[o + 1] = lut[raw[2 * plane + p]! | (raw[3 * plane + p]! << 8)]!;
      out[o + 2] = lut[raw[p]! | (raw[plane + p]! << 8)]!;
      out[o + 3] = alphaLut[raw[6 * plane + p]! | (raw[7 * plane + p]! << 8)]!;
      o += 4;
    }
  } else {
    const alphaLut = kraAlphaLut();
    for (let p = firstPixel; p < end; p += 1) {
      const gray = lut[raw[p]! | (raw[plane + p]! << 8)]!;
      out[o] = gray;
      out[o + 1] = gray;
      out[o + 2] = gray;
      out[o + 3] = alphaLut[raw[2 * plane + p]! | (raw[3 * plane + p]! << 8)]!;
      o += 4;
    }
  }
}

/** 인터리브된 기본 픽셀 한 개(`.defaultpixel` 파일의 내용)를 RGBA8로 바꾼다. */
export function convertKraNativePixel(format: KraPixelFormat, lut: Uint8Array, native: Uint8Array): [number, number, number, number] {
  const out = new Uint8Array(4);
  // 평면 크기가 1인 "타일 하나, 픽셀 하나"로 보면 raw[k]가 곧 k번째 바이트다.
  convertKraRow(format, lut, native, 1, 0, 1, out, 0);
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}
