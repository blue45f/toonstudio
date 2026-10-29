/**
 * @file gimp-brush-core.ts
 * @description GIMP 브러시(`.gbr`)·패턴(`.pat`)·파이프(`.gih`)가 함께 쓰는 입력 읽기, 오류, 한도, 헤더 해석.
 *              공개 진입점은 `gimp-brush.ts`, `gimp-brush-pipe.ts`다.
 *
 * 출처와 이용 조건: 필드 크기·순서·상수는 GIMP 개발자 사이트의 공개 포맷 문서(`developer.gimp.org/core/standards/`의
 * gbr·gih, CC BY-SA 4.0)와 Kaitai Struct 커뮤니티 명세(CC0-1.0), 오래된 패턴 문서(`devel-docs/pat.txt`)에서 확인한
 * 사실만 자체 표현으로 옮겼다. 문구를 복사하지 않았고 GIMP 소스는 읽지 않았다(ADR-0008 §4). 문서에 적히지 않은
 * 바이트 순서(big-endian)와 패턴의 매직 값(`GPAT`)은 실제 GIMP 데이터 파일 76개로 확인했다.
 */

import { openRasterSha256Hex } from "./openraster";

import type { FormatIssue } from "./format-common";

export type GimpBrushErrorCode =
  | "aborted"
  | "source-invalid"
  | "source-too-large"
  | "header-invalid"
  | "magic-invalid"
  | "version-unsupported"
  | "color-depth-unsupported"
  | "limit-exceeded"
  | "truncated";

/** 파일 하나를 해석할 수 없을 때 던지는 오류. 회복 가능한 문제는 던지지 않고 진단으로 보고한다. */
export class GimpBrushError extends Error {
  constructor(
    message: string,
    readonly code: GimpBrushErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GimpBrushError";
  }
}

export interface GimpBrushLimits {
  /** 입력 파일 최대 바이트. */
  readonly maxFileBytes: number;
  /** 브러시·패턴 한 변의 최대 픽셀 수(GIMP 공개 명세가 정한 유효 범위 1~10000). */
  readonly maxDimension: number;
  /** 헤더에 담긴 이름 영역의 최대 바이트. */
  readonly maxNameBytes: number;
  /** 파이프 하나가 담을 수 있는 브러시 수. */
  readonly maxPipeBrushes: number;
  /** 파이프·생성 브러시 텍스트 헤더의 한 줄 최대 바이트. */
  readonly maxLineBytes: number;
}

export const GIMP_BRUSH_LIMITS: GimpBrushLimits = Object.freeze({
  maxFileBytes: 256_000_000,
  maxDimension: 10_000,
  maxNameBytes: 4_096,
  maxPipeBrushes: 4_096,
  maxLineBytes: 8_192,
});

export interface GimpBrushImportOptions {
  /** 호출자는 한도를 낮추기만 할 수 있다. */
  readonly limits?: Partial<GimpBrushLimits>;
  readonly signal?: AbortSignal;
}

export function resolveLimits(requested: Partial<GimpBrushLimits> | undefined): GimpBrushLimits {
  if (requested === undefined) return GIMP_BRUSH_LIMITS;
  const resolved: { -readonly [K in keyof GimpBrushLimits]: number } = { ...GIMP_BRUSH_LIMITS };
  for (const key of Object.keys(GIMP_BRUSH_LIMITS) as Array<keyof GimpBrushLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > GIMP_BRUSH_LIMITS[key]) {
      throw new GimpBrushError(`${key}는 0 이상 ${GIMP_BRUSH_LIMITS[key]} 이하의 정수여야 한다`, "source-too-large");
    }
    resolved[key] = value;
  }
  return resolved;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new GimpBrushError("GIMP 브러시 가져오기가 중단되었다", "aborted");
}

/** 입력을 항상 복사해 읽는다. 호출자가 이후에 버퍼를 바꿔도 결과는 영향받지 않는다. */
export async function readSourceBytes(
  source: Blob | Uint8Array | ArrayBuffer,
  limits: GimpBrushLimits,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  const size = source instanceof Blob ? source.size : source.byteLength;
  if (size > limits.maxFileBytes) {
    throw new GimpBrushError(`입력 ${size}바이트가 한도 ${limits.maxFileBytes}를 넘는다`, "source-too-large");
  }
  let bytes: Uint8Array;
  if (source instanceof Blob) bytes = new Uint8Array(await source.arrayBuffer());
  else if (source instanceof Uint8Array) bytes = new Uint8Array(source);
  else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source.slice(0));
  else throw new GimpBrushError("지원하지 않는 입력 형식이다", "source-invalid");
  throwIfAborted(signal);
  return bytes;
}

export function sourceInfo(bytes: Uint8Array): { readonly byteLength: number; readonly sha256: string } {
  return { byteLength: bytes.byteLength, sha256: openRasterSha256Hex(bytes) };
}

export function issue(scope: FormatIssue["scope"], code: string, message: string, path?: string): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

// ---------------------------------------------------------------------------
// 헤더 해석
// ---------------------------------------------------------------------------

/** ASCII `GIMP`을 big-endian 32비트로 본 값. 브러시(v2 이상)의 매직. */
export const MAGIC_GIMP = 0x47494d50;
/** ASCII `GPAT`. 실제 패턴 파일 20개가 모두 이 값을 쓴다(문서는 `GIMP`라고 적었다). */
export const MAGIC_GPAT = 0x47504154;

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });
const LENIENT_UTF8 = new TextDecoder("utf-8");

/** 범위를 벗어난 읽기를 막는 big-endian 읽기. */
export class BigEndianReader {
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u32(offset: number): number {
    if (offset < 0 || offset + 4 > this.bytes.byteLength) {
      throw new GimpBrushError(`오프셋 ${offset}에서 32비트 값을 읽을 바이트가 부족하다`, "truncated");
    }
    return this.view.getUint32(offset, false);
  }
}

/** 이름 영역을 널 종결 UTF-8로 읽는다. UTF-8이 아니면 대체 문자로 읽고 경고한다. */
export function decodeNameField(raw: Uint8Array, warnings: FormatIssue[], where: string): string {
  const nul = raw.indexOf(0);
  const text = nul === -1 ? raw : raw.subarray(0, nul);
  if (nul !== -1 && raw.subarray(nul + 1).some((byte) => byte !== 0)) {
    warnings.push(issue("metadata", "gimp-brush-name-trailing-bytes", "이름의 널 종결자 뒤에 0이 아닌 바이트가 있어 무시했다", where));
  }
  try {
    return STRICT_UTF8.decode(text);
  } catch {
    warnings.push(issue("metadata", "gimp-brush-name-utf8-invalid", "이름에 UTF-8로 해석되지 않는 바이트가 있어 대체 문자로 바꿨다", where));
    return LENIENT_UTF8.decode(text);
  }
}

export function checkDimensions(width: number, height: number, limits: GimpBrushLimits, what: string): void {
  if (width === 0 || height === 0) {
    throw new GimpBrushError(`${what} 크기 ${width}x${height}가 비어 있다`, "header-invalid");
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    throw new GimpBrushError(`${what} 크기 ${width}x${height}가 한 변 한도 ${limits.maxDimension}를 넘는다`, "limit-exceeded");
  }
}

export interface GimpHeaderLayout {
  readonly headerSize: number;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly bytesValue: number;
}

/** 브러시·패턴이 같은 앞 20바이트(헤더 크기, 버전, 너비, 높이, bytes)를 읽는다. */
export function readCommonHeader(reader: BigEndianReader, offset: number): GimpHeaderLayout {
  return {
    headerSize: reader.u32(offset),
    version: reader.u32(offset + 4),
    width: reader.u32(offset + 8),
    height: reader.u32(offset + 12),
    bytesValue: reader.u32(offset + 16),
  };
}

/** 헤더 크기가 고정 영역 이상이고 이름 한도 안이며 입력 안에 들어오는지 확인하고 이름 영역 길이를 돌려준다. */
export function checkHeaderSize(
  headerSize: number,
  fixedBytes: number,
  available: number,
  limits: GimpBrushLimits,
  what: string,
): number {
  if (headerSize < fixedBytes) {
    throw new GimpBrushError(`${what} 헤더 크기 ${headerSize}가 고정 영역 ${fixedBytes}바이트보다 작다`, "header-invalid");
  }
  if (headerSize - fixedBytes > limits.maxNameBytes) {
    throw new GimpBrushError(`${what} 이름 영역 ${headerSize - fixedBytes}바이트가 한도 ${limits.maxNameBytes}를 넘는다`, "limit-exceeded");
  }
  if (headerSize > available) {
    throw new GimpBrushError(`${what} 헤더 크기 ${headerSize}가 남은 ${available}바이트를 넘는다`, "truncated");
  }
  return headerSize - fixedBytes;
}

/** 본문이 입력 안에 온전히 들어오는지 확인한다. 크기 곱은 안전 정수 범위 안(한 변 ≤ 10000, ≤ 4바이트)이다. */
export function checkBody(offset: number, headerSize: number, bodyBytes: number, end: number, what: string): void {
  if (offset + headerSize + bodyBytes > end) {
    throw new GimpBrushError(
      `${what} 픽셀 ${bodyBytes}바이트가 남은 ${Math.max(0, end - offset - headerSize)}바이트보다 크다`,
      "truncated",
    );
  }
}

// ---------------------------------------------------------------------------
// 브러시(.gbr) 한 개
// ---------------------------------------------------------------------------

export type GimpBrushColorMode = "grayscale" | "rgba" | "float16" | "unknown";

export interface GimpBrush {
  readonly format: "gimp-brush";
  /** 1은 폐기된 구형, 2가 표준, 3은 다른 도구(FilmGimp/CinePaint)가 도입한 변형이다. */
  readonly version: 1 | 2 | 3;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 헤더의 bytes 값. v1·v2는 1(회색)·4(RGBA), v3는 데이터 형식 식별자(알려진 값은 18 = 16비트 부동소수)다. */
  readonly bytesValue: number;
  readonly colorMode: GimpBrushColorMode;
  /** 기본 간격(브러시 너비의 백분율). v1에는 없어 null이다. */
  readonly spacing: number | null;
  readonly headerBytes: number;
  /**
   * 파일에 저장된 그대로의 픽셀(가로 우선, 회색은 1바이트, RGBA는 4바이트). 회색 값은 클수록 칠해진다(실표본 20개에서
   * 중심이 높고 가장자리가 0이었다). 해석하지 못하는 v3 형식이면 null이다.
   */
  readonly pixels: Uint8Array | null;
  /** 입력 안에서 이 브러시가 차지하는 구간. 파이프 안의 위치를 찾는 데 쓴다. */
  readonly byteOffset: number;
  readonly byteLength: number;
}

/** `offset`에서 시작하는 브러시 하나를 읽는다. 읽을 수 없으면 `GimpBrushError`를 던진다. */
export function parseBrushAt(
  bytes: Uint8Array,
  offset: number,
  limits: GimpBrushLimits,
  warnings: FormatIssue[],
  unsupported: FormatIssue[],
  where: string,
): GimpBrush {
  const reader = new BigEndianReader(bytes);
  const header = readCommonHeader(reader, offset);
  if (header.version !== 1 && header.version !== 2 && header.version !== 3) {
    throw new GimpBrushError(`브러시 버전 ${header.version}를 지원하지 않는다 (1, 2, 3만 안다)`, "version-unsupported");
  }
  const version = header.version;
  const fixedBytes = version === 1 ? 20 : 28;
  let spacing: number | null = null;
  if (version !== 1) {
    const magic = reader.u32(offset + 20);
    if (magic !== MAGIC_GIMP) {
      throw new GimpBrushError(`브러시 매직 0x${magic.toString(16)}가 GIMP가 아니다`, "magic-invalid");
    }
    spacing = reader.u32(offset + 24);
  }
  checkHeaderSize(header.headerSize, fixedBytes, bytes.byteLength - offset, limits, "브러시");
  checkDimensions(header.width, header.height, limits, "브러시");
  const name = decodeNameField(bytes.subarray(offset + fixedBytes, offset + header.headerSize), warnings, where);

  let colorMode: GimpBrushColorMode;
  if (version === 3) {
    colorMode = header.bytesValue === 18 ? "float16" : "unknown";
  } else if (header.bytesValue === 1) {
    colorMode = "grayscale";
  } else if (header.bytesValue === 4) {
    colorMode = "rgba";
  } else {
    throw new GimpBrushError(`브러시 bytes 값 ${header.bytesValue}는 1(회색)이나 4(RGBA)가 아니다`, "color-depth-unsupported");
  }

  let pixels: Uint8Array | null = null;
  let byteLength: number;
  if (version === 3) {
    // 문서는 v3의 bytes가 데이터 형식 식별자라고만 적고 픽셀 배치를 말하지 않는다. 본문 크기를 알 수 없어 남은 바이트 전부를 차지한 것으로 본다.
    unsupported.push(
      issue("semantic", "gimp-brush-v3-data-not-decoded", `버전 3 브러시의 데이터 형식 ${header.bytesValue}는 픽셀 배치가 문서에 없어 해석하지 않았다`, where),
    );
    byteLength = bytes.byteLength - offset;
  } else {
    const bodyBytes = header.width * header.height * header.bytesValue;
    checkBody(offset, header.headerSize, bodyBytes, bytes.byteLength, "브러시");
    pixels = bytes.slice(offset + header.headerSize, offset + header.headerSize + bodyBytes);
    byteLength = header.headerSize + bodyBytes;
  }
  return {
    format: "gimp-brush",
    version,
    name,
    width: header.width,
    height: header.height,
    bytesValue: header.bytesValue,
    colorMode,
    spacing,
    headerBytes: header.headerSize,
    pixels,
    byteOffset: offset,
    byteLength,
  };
}
