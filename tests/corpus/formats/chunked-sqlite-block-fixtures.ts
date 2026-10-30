/**
 * 합성 픽스처: `CSFCHUNK` 문서의 오프스크린 속성 BLOB와 외부 청크의 블록 레코드 열을 공개 명세(교차 확인 표는 설계 문서
 * `chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`)대로 만든다. 읽기 코드와 같은 이해에서 나온 인코더이므로 이것만으로는
 * 읽기 코드의 정확성을 증명하지 못한다. 테스트는 이 인코더 외에도 손으로 바이트를 적은 알려진 정답 벡터를 함께 쓴다.
 */

import { deflateSync } from "node:zlib";

export const FIXTURE_BLOCK_EDGE = 256;
const BLOCK_PIXELS = FIXTURE_BLOCK_EDGE * FIXTURE_BLOCK_EDGE;

export function u32be(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0, false));
  return out;
}

export function utf16be(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    out[index * 2] = text.charCodeAt(index) >> 8;
    out[index * 2 + 1] = text.charCodeAt(index) & 0xff;
  }
  return out;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** zlib 스트림(Node zlib, 수준 1 — 명세가 CSP도 수준 1이라고 적었다). */
export function zlibCompress(bytes: Uint8Array, level = 1): Uint8Array {
  return new Uint8Array(deflateSync(bytes, { level }));
}

export type FixtureBlockKind = "rgba" | "gray8" | "mask8";

export const FIXTURE_FORMATS: Readonly<Record<FixtureBlockKind, { channelOrder: number; channelCount: number; pixelBytesCode: number; decompressedBytes: number }>> = {
  rgba: { channelOrder: 0x21, channelCount: 4, pixelBytesCode: 5, decompressedBytes: BLOCK_PIXELS * 5 },
  gray8: { channelOrder: 0x11, channelCount: 1, pixelBytesCode: 2, decompressedBytes: BLOCK_PIXELS * 2 },
  mask8: { channelOrder: 0x01, channelCount: 0, pixelBytesCode: 1, decompressedBytes: BLOCK_PIXELS },
};

export interface FixtureAttributeSpec {
  readonly width: number;
  readonly height: number;
  readonly kind: FixtureBlockKind;
  readonly hasColor?: boolean;
  readonly packedRgba?: number;
  readonly extras?: readonly number[];
  /** 생략하면 레코드 크기를 모르는 채로 0을 넣는다(속성 파서 시험용). */
  readonly blockSizes: readonly number[];
}

/** `Offscreen.Attribute` BLOB. 필드 배치는 설계 문서의 명세 표를 따른다. */
export function encodeOffscreenAttribute(spec: FixtureAttributeSpec): Uint8Array {
  const columns = Math.ceil(spec.width / FIXTURE_BLOCK_EDGE);
  const rows = Math.ceil(spec.height / FIXTURE_BLOCK_EDGE);
  const format = FIXTURE_FORMATS[spec.kind];
  const extras = spec.extras ?? [];
  const parameter = concatBytes(
    u32be(9),
    utf16be("Parameter"),
    u32be(spec.width, spec.height, columns, rows),
    u32be(format.channelOrder, 1, format.channelCount, format.pixelBytesCode),
    u32be(65_536, 4, 1_024, 1),
    u32be(FIXTURE_BLOCK_EDGE, 65_536, FIXTURE_BLOCK_EDGE, spec.kind === "rgba" ? 1_024 : 256),
    u32be(8, 8, 0, 0),
  );
  const initColor = concatBytes(
    u32be(9),
    utf16be("InitColor"),
    u32be(20, spec.hasColor === true ? 1 : 0, spec.packedRgba ?? 0, extras.length, format.channelCount),
    u32be(...extras),
  );
  const blockSize = concatBytes(u32be(9), utf16be("BlockSize"), u32be(12, spec.blockSizes.length, format.channelCount), u32be(...spec.blockSizes));
  return concatBytes(u32be(16, parameter.byteLength, initColor.byteLength, blockSize.byteLength), parameter, initColor, blockSize);
}

export interface FixtureBlock {
  /** 압축한 zlib 스트림. null이면 데이터 없는 블록(초기 색을 따른다). */
  readonly compressed: Uint8Array | null;
  /** 레코드에 적을 해제 후 크기. */
  readonly decompressedBytes: number;
}

/** 블록 레코드 하나. 압축 길이 필드만 리틀엔디언이다. */
export function encodeBlockRecord(index: number, block: FixtureBlock): Uint8Array {
  const head = concatBytes(
    u32be(19),
    utf16be("BlockDataBeginChunk"),
    u32be(index, block.decompressedBytes, FIXTURE_BLOCK_EDGE, FIXTURE_BLOCK_EDGE, block.compressed === null ? 0 : 1),
  );
  let body: Uint8Array = head;
  if (block.compressed !== null) {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, block.compressed.byteLength, true);
    body = concatBytes(head, u32be(block.compressed.byteLength + 4), length, block.compressed);
  }
  const tail = concatBytes(u32be(17), utf16be("BlockDataEndChunk"));
  const total = 4 + body.byteLength + tail.byteLength;
  return concatBytes(u32be(total), body, tail);
}

/** 블록 레코드들과 뒤따르는 `BlockStatus`·`BlockCheckSum` 절. `BlockCheckSum`은 0으로 둔다. */
export function encodeBlockStream(blocks: readonly FixtureBlock[]): { readonly payload: Uint8Array; readonly blockSizes: number[] } {
  const records = blocks.map((block, index) => encodeBlockRecord(index, block));
  const count = blocks.length;
  const status = concatBytes(u32be(11), utf16be("BlockStatus"), u32be(12, count, 4), u32be(...blocks.map(() => 1)));
  const checksum = concatBytes(u32be(13), utf16be("BlockCheckSum"), u32be(12, count, 4), u32be(...blocks.map(() => 0)));
  return { payload: concatBytes(...records, status, checksum), blockSizes: records.map((record) => record.byteLength) };
}

export type FixturePixel = readonly [number, number, number, number];

/** 해제 후 색 블록: 알파 평면 65,536바이트 뒤에 BGRA 262,144바이트(4번째 바이트는 0). */
export function colorBlockBytes(pixelAt: (x: number, y: number) => FixturePixel): Uint8Array {
  const out = new Uint8Array(BLOCK_PIXELS * 5);
  for (let y = 0; y < FIXTURE_BLOCK_EDGE; y += 1) {
    for (let x = 0; x < FIXTURE_BLOCK_EDGE; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      out[y * FIXTURE_BLOCK_EDGE + x] = a;
      const at = BLOCK_PIXELS + (y * FIXTURE_BLOCK_EDGE + x) * 4;
      out[at] = b;
      out[at + 1] = g;
      out[at + 2] = r;
    }
  }
  return out;
}

/** 해제 후 회색 8비트 블록: 알파 평면 뒤에 회색 평면. */
export function grayBlockBytes(pixelAt: (x: number, y: number) => readonly [number, number]): Uint8Array {
  const out = new Uint8Array(BLOCK_PIXELS * 2);
  for (let y = 0; y < FIXTURE_BLOCK_EDGE; y += 1) {
    for (let x = 0; x < FIXTURE_BLOCK_EDGE; x += 1) {
      const [gray, alpha] = pixelAt(x, y);
      out[y * FIXTURE_BLOCK_EDGE + x] = alpha;
      out[BLOCK_PIXELS + y * FIXTURE_BLOCK_EDGE + x] = gray;
    }
  }
  return out;
}

/** 해제 후 마스크 블록: 한 평면. */
export function maskBlockBytes(valueAt: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(BLOCK_PIXELS);
  for (let y = 0; y < FIXTURE_BLOCK_EDGE; y += 1) {
    for (let x = 0; x < FIXTURE_BLOCK_EDGE; x += 1) out[y * FIXTURE_BLOCK_EDGE + x] = valueAt(x, y);
  }
  return out;
}

export interface FixtureOffscreenSpec {
  readonly width: number;
  readonly height: number;
  readonly kind: FixtureBlockKind;
  readonly hasColor?: boolean;
  readonly packedRgba?: number;
  /** 이 번호의 블록은 데이터 없이 둔다(초기 색을 따른다). */
  readonly emptyBlocks?: ReadonlySet<number>;
  /**
   * 이미지 좌표 (x, y)의 픽셀. `rgba`는 [r, g, b, a], `gray8`은 [gray, alpha], `mask8`은 [value, 0, 0, 0]의 첫 값을 쓴다.
   * 오프스크린 밖(블록 가장자리의 남는 부분)은 `padding`을 쓴다.
   */
  readonly pixelAt: (x: number, y: number) => readonly number[];
  readonly padding?: readonly number[];
  readonly compressionLevel?: number;
}

export interface BuiltOffscreenFixture {
  readonly attribute: Uint8Array;
  /** 외부 청크의 데이터 영역(`u64 data_size`는 포함하지 않는다). */
  readonly payload: Uint8Array;
  readonly blocks: readonly FixtureBlock[];
}

/** 오프스크린 하나를 속성과 블록 열로 만든다. */
export function buildOffscreenFixture(spec: FixtureOffscreenSpec): BuiltOffscreenFixture {
  const columns = Math.ceil(spec.width / FIXTURE_BLOCK_EDGE);
  const rows = Math.ceil(spec.height / FIXTURE_BLOCK_EDGE);
  const format = FIXTURE_FORMATS[spec.kind];
  const padding = spec.padding ?? [0, 0, 0, 0];
  const blocks: FixtureBlock[] = [];
  for (let index = 0; index < columns * rows; index += 1) {
    if (spec.emptyBlocks?.has(index) === true) {
      blocks.push({ compressed: null, decompressedBytes: format.decompressedBytes });
      continue;
    }
    const originX = (index % columns) * FIXTURE_BLOCK_EDGE;
    const originY = Math.floor(index / columns) * FIXTURE_BLOCK_EDGE;
    const sample = (x: number, y: number): readonly number[] => {
      const imageX = originX + x;
      const imageY = originY + y;
      return imageX < spec.width && imageY < spec.height ? spec.pixelAt(imageX, imageY) : padding;
    };
    let raw: Uint8Array;
    if (spec.kind === "rgba") raw = colorBlockBytes((x, y) => sample(x, y) as FixturePixel);
    else if (spec.kind === "gray8") raw = grayBlockBytes((x, y) => sample(x, y) as readonly [number, number]);
    else raw = maskBlockBytes((x, y) => sample(x, y)[0]!);
    blocks.push({ compressed: zlibCompress(raw, spec.compressionLevel ?? 1), decompressedBytes: format.decompressedBytes });
  }
  const stream = encodeBlockStream(blocks);
  const attribute = encodeOffscreenAttribute({
    width: spec.width,
    height: spec.height,
    kind: spec.kind,
    ...(spec.hasColor === undefined ? {} : { hasColor: spec.hasColor }),
    ...(spec.packedRgba === undefined ? {} : { packedRgba: spec.packedRgba }),
    blockSizes: stream.blockSizes,
  });
  return { attribute, payload: stream.payload, blocks };
}
