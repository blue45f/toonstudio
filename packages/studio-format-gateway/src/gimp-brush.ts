/**
 * @file gimp-brush.ts
 * @description GIMP 브러시(`.gbr`)·패턴(`.pat`) 읽기 코덱과 형식 판별(`.gbr`/`.gih`/`.pat`/`.vbr`).
 *
 * 범위는 읽기다. 픽셀은 파일에 저장된 그대로(가로 우선, 회색 1바이트·RGBA 4바이트·RGB 3바이트) 돌려주고 색 변환이나
 * 간격 적용은 하지 않는다. 출처와 이용 조건은 `gimp-brush-core.ts` 머리말과 같다. 파이프(`.gih`)는
 * `gimp-brush-pipe.ts`, 생성 브러시(`.vbr`)는 `gimp-generated-brush.ts`가 맡는다.
 */

import {
  BigEndianReader,
  GimpBrushError,
  GIMP_BRUSH_LIMITS,
  MAGIC_GIMP,
  MAGIC_GPAT,
  checkBody,
  checkDimensions,
  checkHeaderSize,
  decodeNameField,
  parseBrushAt,
  readCommonHeader,
  readSourceBytes,
  resolveLimits,
  sourceInfo,
  throwIfAborted,
  type GimpBrush,
  type GimpBrushColorMode,
  type GimpBrushImportOptions,
  type GimpBrushLimits,
} from "./gimp-brush-core";

import type { FormatIssue } from "./format-common";

export { GimpBrushError, GIMP_BRUSH_LIMITS };
export type { GimpBrush, GimpBrushColorMode, GimpBrushImportOptions, GimpBrushLimits };
export type { GimpBrushErrorCode } from "./gimp-brush-core";

const PATTERN_FIXED_BYTES = 24;

export interface GimpBrushImportResult extends GimpBrush {
  readonly specProfile: "gimp-brush-public-spec";
  readonly warnings: readonly FormatIssue[];
  /** 해석하지 못했지만 버리지 않고 표시한 것. */
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}

export type GimpPatternColorMode = "grayscale" | "grayscale-alpha" | "rgb" | "rgba";

export interface GimpPatternImportResult {
  readonly format: "gimp-pattern";
  readonly specProfile: "gimp-brush-public-spec";
  /** 지금까지 알려진 버전은 1뿐이다. */
  readonly version: 1;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 1(회색), 2(회색+알파), 3(RGB), 4(RGBA). */
  readonly bytesPerPixel: 1 | 2 | 3 | 4;
  readonly colorMode: GimpPatternColorMode;
  readonly headerBytes: number;
  /** 파일에 저장된 그대로의 픽셀(가로 우선). */
  readonly pixels: Uint8Array;
  readonly warnings: readonly FormatIssue[];
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}

// ---------------------------------------------------------------------------
// .gbr
// ---------------------------------------------------------------------------

/** `.gbr` 브러시 하나를 읽는다(버전 1·2·3). 파일 전체를 해석할 수 없으면 `GimpBrushError`를 던진다. */
export async function importGimpBrush(
  source: Blob | Uint8Array | ArrayBuffer,
  options: GimpBrushImportOptions = {},
): Promise<GimpBrushImportResult> {
  const limits = resolveLimits(options.limits);
  const bytes = await readSourceBytes(source, limits, options.signal);
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];
  const brush = parseBrushAt(bytes, 0, limits, warnings, unsupported, "brush");
  throwIfAborted(options.signal);
  if (brush.byteLength < bytes.byteLength) {
    warnings.push({
      scope: "container",
      code: "gimp-brush-trailing-bytes",
      message: `브러시 뒤에 ${bytes.byteLength - brush.byteLength}바이트가 더 있다`,
    });
  }
  return { ...brush, specProfile: "gimp-brush-public-spec", warnings, unsupported, source: sourceInfo(bytes) };
}

// ---------------------------------------------------------------------------
// .pat
// ---------------------------------------------------------------------------

const PATTERN_MODES: Readonly<Record<number, GimpPatternColorMode>> = Object.freeze({
  1: "grayscale",
  2: "grayscale-alpha",
  3: "rgb",
  4: "rgba",
});

/** `.pat` 패턴 하나를 읽는다. */
export async function importGimpPattern(
  source: Blob | Uint8Array | ArrayBuffer,
  options: GimpBrushImportOptions = {},
): Promise<GimpPatternImportResult> {
  const limits = resolveLimits(options.limits);
  const bytes = await readSourceBytes(source, limits, options.signal);
  const warnings: FormatIssue[] = [];
  const reader = new BigEndianReader(bytes);
  const header = readCommonHeader(reader, 0);
  const magic = reader.u32(20);
  // 오래된 문서는 GIMP라고 적었지만 실제 패턴은 모두 GPAT다. GIMP 매직은 매직이 없는 v1 브러시와 바이트 배치가 같아
  // (이름이 오프셋 20에서 시작한다) 형식 판별로 가를 수 없으므로 패턴으로 받지 않는다.
  if (magic !== MAGIC_GPAT) {
    throw new GimpBrushError(`패턴 매직 0x${magic.toString(16)}가 GPAT가 아니다`, "magic-invalid");
  }
  if (header.version !== 1) {
    throw new GimpBrushError(`패턴 버전 ${header.version}를 지원하지 않는다 (1만 안다)`, "version-unsupported");
  }
  checkHeaderSize(header.headerSize, PATTERN_FIXED_BYTES, bytes.byteLength, limits, "패턴");
  checkDimensions(header.width, header.height, limits, "패턴");
  const colorMode = PATTERN_MODES[header.bytesValue];
  if (colorMode === undefined) {
    throw new GimpBrushError(`패턴 bytes 값 ${header.bytesValue}는 1~4가 아니다`, "color-depth-unsupported");
  }
  const name = decodeNameField(bytes.subarray(PATTERN_FIXED_BYTES, header.headerSize), warnings, "pattern");
  const bodyBytes = header.width * header.height * header.bytesValue;
  checkBody(0, header.headerSize, bodyBytes, bytes.byteLength, "패턴");
  throwIfAborted(options.signal);
  const end = header.headerSize + bodyBytes;
  if (end < bytes.byteLength) {
    warnings.push({ scope: "container", code: "gimp-pattern-trailing-bytes", message: `패턴 뒤에 ${bytes.byteLength - end}바이트가 더 있다` });
  }
  return {
    format: "gimp-pattern",
    specProfile: "gimp-brush-public-spec",
    version: 1,
    name,
    width: header.width,
    height: header.height,
    bytesPerPixel: header.bytesValue as 1 | 2 | 3 | 4,
    colorMode,
    headerBytes: header.headerSize,
    pixels: bytes.slice(header.headerSize, end),
    warnings,
    unsupported: [],
    source: sourceInfo(bytes),
  };
}

// ---------------------------------------------------------------------------
// 형식 판별
// ---------------------------------------------------------------------------

export type GimpBrushFormat = "gbr" | "gih" | "pat" | "vbr" | "unknown";

const VBR_MAGIC = [0x47, 0x49, 0x4d, 0x50, 0x2d, 0x56, 0x42, 0x52]; // "GIMP-VBR"

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  return bytes.byteLength >= offset + prefix.length && prefix.every((value, index) => bytes[offset + index] === value);
}

/** 구형(v1) 브러시는 매직이 없어 헤더가 입력 안에서 앞뒤가 맞는지로 판단한다. */
function looksLikeBrushAt(bytes: Uint8Array, offset: number): boolean {
  if (bytes.byteLength < offset + 20) return false;
  const reader = new BigEndianReader(bytes);
  const { headerSize, version, width, height, bytesValue } = readCommonHeader(reader, offset);
  if (width < 1 || height < 1 || width > GIMP_BRUSH_LIMITS.maxDimension || height > GIMP_BRUSH_LIMITS.maxDimension) return false;
  if (version === 2 || version === 3) {
    return headerSize >= 28 && bytes.byteLength >= offset + 28 && reader.u32(offset + 20) === MAGIC_GIMP;
  }
  if (version === 1) {
    return headerSize >= 20 && (bytesValue === 1 || bytesValue === 4) && offset + headerSize + width * height * bytesValue <= bytes.byteLength;
  }
  return false;
}

/** 파일 앞부분으로 GIMP 브러시 계열 형식을 가른다. 확장자는 보지 않는다. */
export function inspectGimpBrushFormat(bytes: Uint8Array): GimpBrushFormat {
  if (startsWith(bytes, VBR_MAGIC) && (bytes[8] === 0x0a || bytes[8] === 0x0d)) return "vbr";
  if (bytes.byteLength >= 24) {
    const reader = new BigEndianReader(bytes);
    if (reader.u32(20) === MAGIC_GPAT && reader.u32(4) === 1) return "pat";
  }
  if (looksLikeBrushAt(bytes, 0)) return "gbr";
  // 파이프: 첫 줄은 이름, 둘째 줄은 `개수 매개변수...`이고 그 뒤에 브러시가 이어진다.
  const limit = Math.min(bytes.byteLength, GIMP_BRUSH_LIMITS.maxLineBytes * 2 + 2);
  const first = bytes.subarray(0, limit).indexOf(0x0a);
  if (first < 0) return "unknown";
  const second = bytes.subarray(first + 1, limit).indexOf(0x0a);
  if (second < 0) return "unknown";
  const line = new TextDecoder("utf-8").decode(bytes.subarray(first + 1, first + 1 + second));
  if (/^\d+(?:[ \t]|$)/u.test(line) && looksLikeBrushAt(bytes, first + 1 + second + 1)) return "gih";
  return "unknown";
}
