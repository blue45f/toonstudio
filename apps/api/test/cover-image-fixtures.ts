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

/** 압축 스트림 하나를 parts 개의 IDAT 로 쪼갠다. 사이에 빈 IDAT 도 끼워 청크 경계가 여러 모양이 되게 한다. */
export function splitIdatChunks(raw: Buffer, parts = 3): Buffer[] {
  const compressed = deflateSync(raw);
  const size = Math.ceil(compressed.length / parts);
  const chunks: Buffer[] = [];
  for (let start = 0; start < compressed.length; start += size) {
    chunks.push(pngChunk("IDAT", compressed.subarray(start, start + size)), pngChunk("IDAT"));
  }
  return chunks;
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

// ---- JPEG ----------------------------------------------------------------------------------------------------
// 마커 구조를 바이트 단위로 직접 만든다. 헤더만 있는 입력은 디코더가 풀 수 없지만 사전 검사·한도 시험에는 충분하다.

export const JPEG_SOI = Buffer.from([0xff, 0xd8]);
export const JPEG_EOI = Buffer.from([0xff, 0xd9]);

/** 마커 + 길이(본문 + 2) + 본문. */
export function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** 프레임 헤더(SOF). 성분은 id 1..n, 표집 계수 1x1, 양자화 표 0 이다. */
export function jpegSof(width: number, height: number, components: number, marker = 0xc0): Buffer {
  const payload = Buffer.alloc(6 + 3 * components);
  payload[0] = 8;
  payload.writeUInt16BE(height, 1);
  payload.writeUInt16BE(width, 3);
  payload[5] = components;
  for (let index = 0; index < components; index += 1) {
    payload[6 + 3 * index] = (index + 1) & 0xff;
    payload[7 + 3 * index] = 0x11;
  }
  return jpegSegment(marker, payload);
}

/** 스캔 시작(SOS) 헤더. 엔트로피 부호화 데이터는 호출부가 뒤에 붙인다. */
export function jpegSos(components = 3): Buffer {
  const payload = Buffer.alloc(4 + 2 * components);
  payload[0] = components;
  for (let index = 0; index < components; index += 1) payload[1 + 2 * index] = index + 1;
  payload[1 + 2 * components + 2] = 0; // Ah/Al
  return jpegSegment(0xda, payload);
}

export function concatBytes(...parts: readonly Buffer[]): Buffer {
  return Buffer.concat(parts);
}

/** 맨 뒤의 EOI 를 떼어, 뒤에 마커를 더 붙일 수 있게 한다. */
export function withoutEoi(jpeg: Buffer): Buffer {
  return jpeg.subarray(0, jpeg.length - 2);
}

/**
 * EXIF(APP1) 세그먼트: 방향(Orientation)과 IFD1 의 JPEG 썸네일을 가진 빅엔디언 TIFF. 카메라 사진은 APP1 안에
 * 완전한 썸네일 JPEG(자기 SOI·SOF·SOS)를 싣는다. 마커 순회가 이 안의 SOF 를 프레임으로 오인하지 않는지 본다.
 */
export function exifApp1WithThumbnail(thumbnail: Buffer, orientation = 6): Buffer {
  const ifd0 = 8;
  const ifd1 = ifd0 + 2 + 12 + 4;
  const thumbnailOffset = ifd1 + 2 + 3 * 12 + 4;
  const tiff = Buffer.alloc(thumbnailOffset + thumbnail.length);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(0x2a, 2);
  tiff.writeUInt32BE(ifd0, 4);
  tiff.writeUInt16BE(1, ifd0);
  tiff.writeUInt16BE(0x0112, ifd0 + 2); // Orientation
  tiff.writeUInt16BE(3, ifd0 + 4); // SHORT
  tiff.writeUInt32BE(1, ifd0 + 6);
  tiff.writeUInt16BE(orientation, ifd0 + 10);
  tiff.writeUInt32BE(ifd1, ifd0 + 14);
  tiff.writeUInt16BE(3, ifd1);
  const entries: ReadonlyArray<readonly [number, number, number]> = [
    [0x0103, 3, 6], // Compression: JPEG
    [0x0201, 4, thumbnailOffset], // JPEGInterchangeFormat
    [0x0202, 4, thumbnail.length], // JPEGInterchangeFormatLength
  ];
  entries.forEach(([tag, type, value], index) => {
    const at = ifd1 + 2 + index * 12;
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(1, at + 4);
    if (type === 3) tiff.writeUInt16BE(value, at + 8);
    else tiff.writeUInt32BE(value, at + 8);
  });
  thumbnail.copy(tiff, thumbnailOffset);
  return jpegSegment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]));
}

/** SOI 바로 뒤에 세그먼트를 끼운다(APPn·COM 은 SOF 앞 어디에 있어도 된다). */
export function insertAfterSoi(jpeg: Buffer, segment: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}
