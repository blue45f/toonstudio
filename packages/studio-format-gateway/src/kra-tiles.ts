/**
 * @file kra-tiles.ts
 * @description Krita 레이어 타일 파일(`<이미지>/layers/<파일>`) 파서, LZF 해제, 타일 → 레이어 RGBA8 조립.
 *
 * 근거
 * - 타일 파일의 텍스트 헤더와 레코드 형식은 KDE 커뮤니티 위키 "Krita/Tile Data Format"(CC BY-SA 4.0)이 적은
 *   `VERSION`·`TILEWIDTH`·`TILEHEIGHT`·`PIXELSIZE`·`DATA`와 `x,y,<압축 이름>,<크기>` 다음 이진 데이터이고, 실제
 *   Krita 5.2.2 산출물에서 그대로 관찰했다(위키의 옛 필드 `TILESNUMBER`는 관찰되지 않았고 `DATA`였다). 위키 문구는
 *   복사하지 않았다.
 * - 관찰로 확정한 것(위키에 없는 부분): 레코드의 압축 이름은 모두 `LZF`였고, 페이로드의 첫 바이트는 플래그다
 *   (1이면 LZF 스트림, 0이면 비압축 원본이며 압축이 안 되는 잡음 타일에서 나왔다). 타일 좌표는 레이어 로컬
 *   픽셀 좌표이고 타일 크기의 배수이며 음수도 있다. LZF로 푼 타일은 바이트 평면 배치이고(`kra-colorspace.ts`),
 *   비압축 타일은 평면으로 바꾸기 전의 원본, 곧 픽셀을 하나씩 이어 붙인 배치다: 잡음 문서의 두 배치를 Krita가
 *   읽어 준 픽셀과 대조해 서로 다름을 확인했다. 이 파일은 비압축 타일을 평면으로 바꿔 한 가지 배치로 다룬다.
 * - LZF는 liblzf(BSD-2-Clause)가 정의한 공개 압축 형식이다: 제어 바이트가 32 미만이면 `제어 + 1`바이트 리터럴이고,
 *   아니면 길이 `제어 >> 5`(7이면 다음 바이트를 더함)에 2를 더한 만큼을 거리 `((제어 & 31) << 8) + 다음 바이트 + 1`
 *   앞에서 복사한다. 구현은 이 설명과 관찰한 타일(모든 색 공간에서 정답 픽셀과 일치)로 검증했고 liblzf 소스는
 *   읽지 않았다.
 */

import { convertKraNativePixel, convertKraRow, type KraPixelFormat } from "./kra-colorspace";

import type { KraExtent, KraLimits } from "./kra-types";

export type KraTileFailureCode =
  | "header"
  | "version"
  | "record"
  | "compression"
  | "lzf"
  | "size"
  | "misaligned"
  | "duplicate"
  | "pixel-size"
  | "limit";

/** 타일 한 개나 타일 파일 전체를 읽지 못했다. 호출자는 해당 레이어의 픽셀만 포기한다. */
export class KraTileError extends Error {
  constructor(
    message: string,
    readonly code: KraTileFailureCode,
  ) {
    super(message);
    this.name = "KraTileError";
  }
}

export interface KraTileRecord {
  /** 레이어 로컬 픽셀 좌표(타일 왼쪽 위). */
  readonly x: number;
  readonly y: number;
  readonly compression: string;
  readonly payload: Uint8Array;
}

export interface KraTileFile {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly pixelBytes: number;
  readonly tiles: readonly KraTileRecord[];
  /** 마지막 타일 뒤에 남은 바이트 수. */
  readonly trailingBytes: number;
}

const HEADER_KEYS = ["VERSION", "TILEWIDTH", "TILEHEIGHT", "PIXELSIZE", "DATA"] as const;
const RECORD_LINE = /^(-?\d+),(-?\d+),([A-Za-z]+),(\d+)$/u;
/** 타일 좌표 절댓값 상한. 레이어 오프셋을 더해도 안전한 정수 범위를 유지한다(Krita 좌표는 32비트다). */
const MAX_TILE_COORDINATE = 2 ** 31;
/** 헤더·레코드 줄 하나의 최대 길이. 정상 줄은 수십 바이트다. */
const MAX_LINE_BYTES = 96;

function readAsciiLine(bytes: Uint8Array, start: number, what: string, failure: KraTileFailureCode): { text: string; next: number } {
  const limit = Math.min(bytes.byteLength, start + MAX_LINE_BYTES);
  for (let index = start; index < limit; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    let text = "";
    for (let at = start; at < index; at += 1) {
      const byteValue = bytes[at]!;
      if (byteValue < 0x20 || byteValue > 0x7e) throw new KraTileError(`${what} 줄에 ASCII가 아닌 바이트가 있다`, failure);
      text += String.fromCharCode(byteValue);
    }
    return { text, next: index + 1 };
  }
  throw new KraTileError(`${what} 줄이 줄바꿈 없이 끝나거나 ${MAX_LINE_BYTES}바이트를 넘는다`, failure);
}

function safeInt(text: string, what: string, failure: KraTileFailureCode): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new KraTileError(`${what} 값 ${text}가 정수 범위를 벗어난다`, failure);
  return value;
}

/** 타일 파일을 읽는다. 타일 데이터는 복사하지 않고 입력 위의 뷰로 둔다. */
export function parseKraTileFile(bytes: Uint8Array, limits: KraLimits): KraTileFile {
  let position = 0;
  const header: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const key of HEADER_KEYS) {
    const line = readAsciiLine(bytes, position, key, "header");
    position = line.next;
    const match = /^([A-Z]+) (\d+)$/u.exec(line.text);
    if (match === null || match[1] !== key) throw new KraTileError(`헤더 줄 "${line.text}"가 ${key} 형식이 아니다`, "header");
    header[key] = safeInt(match[2]!, key, "header");
  }
  if (header["VERSION"] !== 2) throw new KraTileError(`타일 파일 버전 ${header["VERSION"]}를 지원하지 않는다 (2만 안다)`, "version");
  const tileWidth = header["TILEWIDTH"]!;
  const tileHeight = header["TILEHEIGHT"]!;
  const pixelBytes = header["PIXELSIZE"]!;
  const declared = header["DATA"]!;
  if (tileWidth < 1 || tileHeight < 1 || tileWidth > limits.maxTileSide || tileHeight > limits.maxTileSide) {
    throw new KraTileError(`타일 크기 ${tileWidth}x${tileHeight}가 1~${limits.maxTileSide} 범위를 벗어난다`, "limit");
  }
  if (pixelBytes < 1 || pixelBytes > limits.maxPixelBytes) {
    throw new KraTileError(`픽셀 크기 ${pixelBytes}바이트가 1~${limits.maxPixelBytes} 범위를 벗어난다`, "limit");
  }
  if (declared > limits.maxTilesPerLayer) {
    throw new KraTileError(`타일 ${declared}개가 한도 ${limits.maxTilesPerLayer}를 넘는다`, "limit");
  }
  const tiles: KraTileRecord[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < declared; index += 1) {
    const line = readAsciiLine(bytes, position, `타일 ${index}`, "record");
    position = line.next;
    const match = RECORD_LINE.exec(line.text);
    if (match === null) throw new KraTileError(`타일 ${index}의 레코드 줄 "${line.text}"가 x,y,압축,크기 형식이 아니다`, "record");
    const x = safeInt(match[1]!, "타일 x", "record");
    const y = safeInt(match[2]!, "타일 y", "record");
    const size = safeInt(match[4]!, "타일 크기", "record");
    if (Math.abs(x) > MAX_TILE_COORDINATE || Math.abs(y) > MAX_TILE_COORDINATE) {
      throw new KraTileError(`타일 ${index}의 좌표 (${x}, ${y})가 ±${MAX_TILE_COORDINATE} 범위를 벗어난다`, "record");
    }
    if (x % tileWidth !== 0 || y % tileHeight !== 0) {
      throw new KraTileError(`타일 ${index}의 좌표 (${x}, ${y})가 타일 크기 ${tileWidth}x${tileHeight}의 배수가 아니다`, "misaligned");
    }
    const key = `${x},${y}`;
    if (seen.has(key)) throw new KraTileError(`타일 좌표 (${x}, ${y})가 반복된다`, "duplicate");
    seen.add(key);
    if (size > bytes.byteLength - position) throw new KraTileError(`타일 ${index}의 페이로드 ${size}바이트가 파일 끝을 넘는다`, "record");
    tiles.push({ x, y, compression: match[3]!, payload: bytes.subarray(position, position + size) });
    position += size;
  }
  return { tileWidth, tileHeight, pixelBytes, tiles, trailingBytes: bytes.byteLength - position };
}

/** LZF 스트림을 정확히 `expectedLength` 바이트로 푼다. 참조가 앞쪽을 벗어나거나 길이가 맞지 않으면 던진다. */
export function lzfDecompress(source: Uint8Array, expectedLength: number): Uint8Array {
  const out = new Uint8Array(expectedLength);
  const end = source.byteLength;
  let input = 0;
  let output = 0;
  while (input < end) {
    const control = source[input]!;
    input += 1;
    if (control < 32) {
      const run = control + 1;
      if (input + run > end) throw new KraTileError("LZF 리터럴이 입력 끝을 넘는다", "lzf");
      if (output + run > expectedLength) throw new KraTileError("LZF 출력이 예상 크기를 넘는다", "lzf");
      out.set(source.subarray(input, input + run), output);
      input += run;
      output += run;
    } else {
      let length = control >> 5;
      if (length === 7) {
        if (input >= end) throw new KraTileError("LZF 길이 바이트가 입력 끝을 넘는다", "lzf");
        length += source[input]!;
        input += 1;
      }
      if (input >= end) throw new KraTileError("LZF 거리 바이트가 입력 끝을 넘는다", "lzf");
      const distance = ((control & 0x1f) << 8) + source[input]! + 1;
      input += 1;
      length += 2;
      if (distance > output) throw new KraTileError("LZF 참조가 출력 앞쪽을 벗어난다", "lzf");
      if (output + length > expectedLength) throw new KraTileError("LZF 출력이 예상 크기를 넘는다", "lzf");
      // 겹치는 복사(거리 < 길이)는 앞에서 만든 바이트를 다시 읽어야 하므로 한 바이트씩 복사한다.
      for (let copied = 0; copied < length; copied += 1) {
        out[output] = out[output - distance]!;
        output += 1;
      }
    }
  }
  if (output !== expectedLength) throw new KraTileError(`LZF 출력 ${output}바이트가 예상 ${expectedLength}바이트와 다르다`, "lzf");
  return out;
}

/** 픽셀을 하나씩 이어 붙인 배치를 바이트 평면 배치(평면 k = 모든 픽셀의 k번째 바이트)로 바꾼다. */
function interleavedToPlanar(body: Uint8Array, pixelBytes: number, pixels: number): Uint8Array {
  const planar = new Uint8Array(body.byteLength);
  let source = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    for (let byte = 0; byte < pixelBytes; byte += 1) {
      planar[byte * pixels + pixel] = body[source]!;
      source += 1;
    }
  }
  return planar;
}

/**
 * 타일 레코드의 구조(압축 이름, 플래그, 비압축 길이)만 검사한다. LZF 스트림 자체는 풀어 봐야 알 수 있지만 이 검사는 풀기 전에 끝나므로, 조립이
 * 큰 출력 버퍼를 만들기 전에 모든 타일에 먼저 적용해 깨진 레이어가 할당 비용을 치르게 하지 않는다.
 */
export function validateKraTileRecord(file: KraTileFile, tile: KraTileRecord): void {
  if (tile.compression !== "LZF") throw new KraTileError(`압축 이름 "${tile.compression}"를 지원하지 않는다 (LZF만 안다)`, "compression");
  if (tile.payload.byteLength < 1) throw new KraTileError("타일 페이로드가 비었다", "size");
  const flag = tile.payload[0]!;
  if (flag === 0) {
    const rawBytes = file.tileWidth * file.tileHeight * file.pixelBytes;
    if (tile.payload.byteLength - 1 !== rawBytes) {
      throw new KraTileError(`비압축 타일 ${tile.payload.byteLength - 1}바이트가 예상 ${rawBytes}바이트와 다르다`, "size");
    }
  } else if (flag !== 1) {
    throw new KraTileError(`타일 플래그 ${flag}를 지원하지 않는다 (0, 1만 안다)`, "compression");
  }
}

/** 타일 하나를 바이트 평면 배치의 원본 바이트(`너비 * 높이 * 픽셀 크기`)로 푼다. */
export function decodeKraTile(file: KraTileFile, tile: KraTileRecord): Uint8Array {
  validateKraTileRecord(file, tile);
  const body = tile.payload.subarray(1);
  if (tile.payload[0] === 0) return interleavedToPlanar(body, file.pixelBytes, file.tileWidth * file.tileHeight);
  return lzfDecompress(body, file.tileWidth * file.tileHeight * file.pixelBytes);
}

export interface KraAssembleRequest {
  readonly file: KraTileFile;
  readonly format: KraPixelFormat;
  /** 색 채널 환원 표(`kraColorLut`): 8비트 형식은 256칸, 16비트 형식은 65,536칸. */
  readonly lut: Uint8Array;
  /** `.defaultpixel` 파일 내용(인터리브된 기본 픽셀). 없으면 null(투명으로 본다). */
  readonly defaultPixelNative: Uint8Array | null;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly limits: KraLimits;
  /** 타일 몇 개마다 호출한다. 중단 신호를 확인하는 용도다. */
  readonly checkpoint?: () => void;
  /**
   * 출력 버퍼를 만들기 직전에 바이트 수를 알린다. 호출자가 전체 출력 예산에 미리 청구하는 자리이며, 던지면 아무것도 할당하지 않는다.
   * 청구는 환불하지 않는다: 이후 타일이 깨져 레이어를 포기해도 그 버퍼를 채우는 일은 이미 했기 때문이다.
   */
  readonly reserve?: (bytes: number) => void;
}

export interface KraAssembleResult {
  readonly extent: KraExtent | null;
  readonly pixels: Uint8Array | null;
  readonly defaultPixel: readonly [number, number, number, number];
}

/**
 * 타일들을 이미지 좌표의 RGBA8 버퍼 하나로 조립한다. 기본 픽셀이 투명하지 않으면 캔버스 사각형을 포함해
 * 타일이 없는 곳을 기본 픽셀로 채운다(Krita의 기본 `Background`가 타일 없이 기본 픽셀 흰색만 갖는 경우).
 */
export function assembleKraLayer(request: KraAssembleRequest): KraAssembleResult {
  const { file, format, lut, offsetX, offsetY, limits } = request;
  if (file.pixelBytes !== format.pixelBytes) {
    throw new KraTileError(`타일 헤더의 픽셀 크기 ${file.pixelBytes}가 색 공간 ${format.colorSpace}의 ${format.pixelBytes}와 다르다`, "pixel-size");
  }
  let defaultPixel: [number, number, number, number] = [0, 0, 0, 0];
  if (request.defaultPixelNative !== null) {
    if (request.defaultPixelNative.byteLength !== format.pixelBytes) {
      throw new KraTileError(`기본 픽셀 ${request.defaultPixelNative.byteLength}바이트가 픽셀 크기 ${format.pixelBytes}와 다르다`, "pixel-size");
    }
    defaultPixel = convertKraNativePixel(format, lut, request.defaultPixelNative);
  }
  const fillsCanvas = defaultPixel[3] !== 0;
  if (file.tiles.length === 0 && !fillsCanvas) return { extent: null, pixels: null, defaultPixel };
  for (const tile of file.tiles) validateKraTileRecord(file, tile);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const tile of file.tiles) {
    minX = Math.min(minX, tile.x + offsetX);
    minY = Math.min(minY, tile.y + offsetY);
    maxX = Math.max(maxX, tile.x + offsetX + file.tileWidth);
    maxY = Math.max(maxY, tile.y + offsetY + file.tileHeight);
  }
  if (fillsCanvas) {
    minX = Math.min(minX, 0);
    minY = Math.min(minY, 0);
    maxX = Math.max(maxX, request.canvasWidth);
    maxY = Math.max(maxY, request.canvasHeight);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width * height > limits.maxLayerPixels) {
    throw new KraTileError(`레이어 출력 ${width}x${height}픽셀이 한도 ${limits.maxLayerPixels}를 넘는다`, "limit");
  }
  request.reserve?.(width * height * 4);
  let pixels: Uint8Array;
  try {
    pixels = new Uint8Array(width * height * 4);
  } catch (error) {
    if (error instanceof RangeError) throw new KraTileError(`레이어 출력 ${width}x${height}픽셀의 버퍼를 만들 수 없다 (메모리 부족)`, "limit");
    throw error;
  }
  if (fillsCanvas || defaultPixel.some((channel) => channel !== 0)) {
    // 기본 픽셀로 채운다: 첫 픽셀을 쓰고 이미 채운 구간을 두 배씩 복사한다.
    pixels.set(defaultPixel, 0);
    for (let filled = 4; filled < pixels.byteLength; filled *= 2) pixels.copyWithin(filled, 0, Math.min(filled, pixels.byteLength - filled));
  }

  const plane = file.tileWidth * file.tileHeight;
  let sinceCheckpoint = 0;
  for (const tile of file.tiles) {
    const raw = decodeKraTile(file, tile);
    const left = tile.x + offsetX - minX;
    const top = tile.y + offsetY - minY;
    for (let row = 0; row < file.tileHeight; row += 1) {
      convertKraRow(format, lut, raw, plane, row * file.tileWidth, file.tileWidth, pixels, ((top + row) * width + left) * 4);
    }
    sinceCheckpoint += 1;
    if (sinceCheckpoint >= 64) {
      sinceCheckpoint = 0;
      request.checkpoint?.();
    }
  }
  return { extent: { x: minX, y: minY, width, height }, pixels, defaultPixel };
}
