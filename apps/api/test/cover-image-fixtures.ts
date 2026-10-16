import { constants, crc32, deflateRawSync, deflateSync } from "node:zlib";

// 표지 변환 시험용 PNG 조립 도구. 진짜 인코더로 만들 수 없는 모양(청크 순서·중복·팽창·인터레이스)을
// 바이트 단위로 직접 만든다. 큰 입력은 메모리에 펼치지 않고 압축된 조각으로 만든다.

export const PNG_SIGNATURE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 길이·형식·본문·CRC 가 모두 정상인 PNG 청크 하나. */
export function pngChunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export interface PngHeaderOptions {
  readonly width: number;
  readonly height: number;
  readonly bitDepth?: number;
  readonly colorType?: number;
  readonly interlace?: number;
}

export function ihdrChunk({ width, height, bitDepth = 8, colorType = 0, interlace = 0 }: PngHeaderOptions): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  data[12] = interlace;
  return pngChunk("IHDR", data);
}

/** 서명 + 주어진 청크들. 청크의 순서·중복을 시험이 정한다. */
export function pngFile(...chunks: readonly Buffer[]): Buffer {
  return Buffer.concat([PNG_SIGNATURE_BYTES, ...chunks]);
}

export const IEND_CHUNK = pngChunk("IEND");

/** 필터 바이트(0)가 붙은 행 데이터를 압축해 넣은 IDAT. */
export function idatChunk(raw: Buffer): Buffer {
  return pngChunk("IDAT", deflateSync(raw));
}

/**
 * total 바이트의 0 을 압축한 zlib 스트림. 1MiB 조각을 SYNC_FLUSH 로 이어 붙여, 수십~수백 MB 로 풀리는 데이터도
 * 만드는 쪽은 1MiB 와 수 KB 만 쓴다(디코더가 풀면 total 바이트가 된다).
 */
export function zeroRunZlib(total: number): Buffer {
  const piece = 1 << 20;
  const compress = (size: number) =>
    deflateRawSync(Buffer.alloc(size), { level: 9, finishFlush: constants.Z_SYNC_FLUSH });
  const block = compress(piece);
  const rest = total % piece;
  const parts: Buffer[] = [Buffer.from([0x78, 0x01])];
  for (let index = 0; index < Math.floor(total / piece); index += 1) parts.push(block);
  if (rest > 0) parts.push(compress(rest));
  parts.push(Buffer.from([0x03, 0x00])); // 비어 있는 마지막 블록
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE((((total % 65521) << 16) | 1) >>> 0, 0); // 0 만 있는 데이터의 Adler-32
  parts.push(adler);
  return Buffer.concat(parts);
}

/** total 바이트의 0 으로 풀리는 IDAT. */
export function zeroRunIdat(total: number): Buffer {
  return pngChunk("IDAT", zeroRunZlib(total));
}

/** 본문이 total 바이트의 0 으로 풀리는 iCCP(색 프로파일) 청크. 파일은 작고 디코더가 풀면 total 바이트가 된다. */
export function inflatingIccpChunk(total: number): Buffer {
  return pngChunk("iCCP", Buffer.concat([Buffer.from("x\0", "latin1"), Buffer.from([0]), zeroRunZlib(total)]));
}

/** 압축 해제 크기가 total 바이트인 zTXt 청크. */
export function inflatingZtxtChunk(total: number): Buffer {
  return pngChunk("zTXt", Buffer.concat([Buffer.from("k\0", "latin1"), Buffer.from([0]), zeroRunZlib(total)]));
}

export interface PixelSource {
  /** 화소 (x, y) 의 바이트(채널·비트 깊이를 합친 bytesPerPixel 개 또는 1비트 이하 깊이의 패킹 전 값 하나). */
  (x: number, y: number): readonly number[];
}

/** 비트 깊이 8 미만 화소를 한 줄에 패킹한다(깊이 1·2·4, 값은 pixels 의 첫 요소). */
function packLowDepthRow(depth: number, values: readonly number[]): Buffer {
  const row = Buffer.alloc(Math.ceil((values.length * depth) / 8));
  values.forEach((value, index) => {
    const bit = index * depth;
    row[bit >> 3] = (row[bit >> 3] ?? 0) | ((value & ((1 << depth) - 1)) << (8 - depth - (bit & 7)));
  });
  return row;
}

/** 한 행(필터 0)을 만든다. 깊이가 8 이상이면 화소마다 bytesPerPixel 바이트, 미만이면 패킹한다. */
function filteredRow(depth: number, pixels: ReadonlyArray<readonly number[]>): Buffer {
  if (depth < 8) return Buffer.concat([Buffer.from([0]), packLowDepthRow(depth, pixels.map((pixel) => pixel[0] ?? 0))]);
  return Buffer.concat([Buffer.from([0]), Buffer.from(pixels.flat())]);
}

/** 인터레이스 없는 PNG 의 압축 해제 데이터(모든 행 필터 0). */
export function rawRows(width: number, height: number, depth: number, pixelAt: PixelSource): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(filteredRow(depth, Array.from({ length: width }, (_, x) => pixelAt(x, y))));
  }
  return Buffer.concat(rows);
}

const ADAM7_PASSES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** Adam7 인터레이스 PNG 의 압축 해제 데이터: 일곱 패스를 차례로, 패스마다 행마다 필터 바이트 0 을 붙인다. */
export function adam7Rows(width: number, height: number, depth: number, pixelAt: PixelSource): Buffer {
  const rows: Buffer[] = [];
  for (const [x0, y0, dx, dy] of ADAM7_PASSES) {
    for (let y = y0; y < height; y += dy) {
      const pixels: Array<readonly number[]> = [];
      for (let x = x0; x < width; x += dx) pixels.push(pixelAt(x, y));
      if (pixels.length > 0) rows.push(filteredRow(depth, pixels));
    }
  }
  return Buffer.concat(rows);
}

/** PNG 의 청크 형식을 순서대로 읽는다(서명 뒤부터, IEND 까지). */
export function pngChunkTypes(png: Buffer): string[] {
  const types: string[] = [];
  let offset = PNG_SIGNATURE_BYTES.length;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    types.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return types;
}

/** PNG 의 모든 청크가 CRC 를 통과하는지(길이 경계 포함) 확인한다. */
export function pngChunksHaveValidCrc(png: Buffer): boolean {
  let offset = PNG_SIGNATURE_BYTES.length;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    if (offset + 12 + length > png.length) return false;
    const stored = png.readUInt32BE(offset + 8 + length);
    if (crc32(png.subarray(offset + 4, offset + 8 + length)) !== stored) return false;
    const type = png.toString("latin1", offset + 4, offset + 8);
    offset += 12 + length;
    if (type === "IEND") return offset === png.length;
  }
  return false;
}
