/**
 * 합성 GIMP XCF 픽스처 빌더.
 *
 * 공개 포맷 명세의 사실(헤더, 속성 레코드, 포인터 배열, 계층·레벨·타일, RLE 연산)에서 바이트를 직접
 * 조립한다. 리더 코드(`xcf*.ts`)를 import하지 않으므로 리더와 같은 오독을 공유하지 않는다. 다만 같은 사람이
 * 같은 사실을 읽고 쓰므로 명세 자체를 잘못 이해한 경우는 잡지 못한다 — 그 반증은 실제 GIMP 파일을 쓰는
 * 로컬 코퍼스 테스트(`tests/format-gateway/xcf-local-corpus.test.ts`)가 맡는다.
 */

export interface XcfFixtureProp {
  readonly type: number;
  readonly payload: Uint8Array;
  /** 기록 길이를 페이로드 길이와 다르게 쓰고 싶을 때(구버전 색지도 같은 경우). */
  readonly declaredLength?: number;
}

export interface XcfFixtureLayer {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 0 RGB, 1 RGBA, 2 Gray, 3 GrayA, 4 Indexed, 5 IndexedA */
  readonly type: number;
  /** 픽셀당 바이트 수(색 성분 수 x 성분 바이트). */
  readonly bytesPerPixel: number;
  /** 픽셀 단위로 인터리브된 원시 바이트. 생략하면 0으로 채운다. */
  readonly raw?: Uint8Array;
  readonly props?: readonly XcfFixtureProp[];
  /** true면 레이어 마스크 포인터를 0이 아닌 값으로 쓴다(마스크 본문은 쓰지 않는다). */
  readonly hasMaskPointer?: boolean;
  /** true면 계층 포인터를 0으로 쓴다. */
  readonly omitHierarchy?: boolean;
  /** true면 첫 레벨 뒤에 타일 없는 더미 레벨 구조를 덧붙인다. */
  readonly dummyLevels?: boolean;
  /** 지정하면 모든 타일 본문을 이 바이트로 그대로 쓴다(손상된 타일 만들기용). */
  readonly tileBytesOverride?: Uint8Array;
}

export interface XcfFixtureSpec {
  /** `file`, `v003`, `v011` 같은 4글자 버전 태그. */
  readonly tag: string;
  readonly width: number;
  readonly height: number;
  /** 0 RGB, 1 Grayscale, 2 Indexed */
  readonly baseType: number;
  /** 정밀도 번호. 버전 4 이상에서만 헤더에 쓴다. */
  readonly precision?: number;
  readonly pointerBytes: 4 | 8;
  /** `PROP_COMPRESSION` 값(0 없음, 1 RLE, 2 zlib). */
  readonly compression: number;
  readonly omitCompression?: boolean;
  readonly imageProps?: readonly XcfFixtureProp[];
  readonly layers: readonly XcfFixtureLayer[];
  /** 이미지 채널 포인터 개수(본문은 쓰지 않는다). */
  readonly channelCount?: number;
  /** 압축 2에서 타일 인터리브 바이트를 압축하는 함수. */
  readonly deflate?: (bytes: Uint8Array) => Uint8Array;
}

const TILE = 64;

class Sink {
  readonly bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u32(value: number): void {
    this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  i32(value: number): void {
    this.u32(value | 0);
  }

  f32(value: number): void {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setFloat32(0, value, false);
    for (let index = 0; index < 4; index += 1) this.bytes.push(buffer.getUint8(index));
  }

  pointer(value: number, pointerBytes: 4 | 8): void {
    if (pointerBytes === 4) this.u32(value);
    else {
      this.u32(Math.floor(value / 0x1_0000_0000));
      this.u32(value % 0x1_0000_0000);
    }
  }

  patchPointer(at: number, value: number, pointerBytes: 4 | 8): void {
    const patch = new Sink();
    patch.pointer(value, pointerBytes);
    patch.bytes.forEach((byte, index) => {
      this.bytes[at + index] = byte;
    });
  }

  string(text: string): void {
    if (text === "") {
      this.u32(0);
      return;
    }
    const encoded = new TextEncoder().encode(text);
    this.u32(encoded.length + 1);
    for (const byte of encoded) this.bytes.push(byte);
    this.bytes.push(0);
  }

  append(bytes: ArrayLike<number>): void {
    for (let index = 0; index < bytes.length; index += 1) this.bytes.push(bytes[index] ?? 0);
  }
}

export function fixtureU32(value: number): Uint8Array {
  const sink = new Sink();
  sink.u32(value);
  return Uint8Array.from(sink.bytes);
}

export function fixtureI32(value: number): Uint8Array {
  const sink = new Sink();
  sink.i32(value);
  return Uint8Array.from(sink.bytes);
}

export function fixtureI32Pair(first: number, second: number): Uint8Array {
  const sink = new Sink();
  sink.i32(first);
  sink.i32(second);
  return Uint8Array.from(sink.bytes);
}

export function fixtureF32(value: number): Uint8Array {
  const sink = new Sink();
  sink.f32(value);
  return Uint8Array.from(sink.bytes);
}

export function fixtureString(text: string): Uint8Array {
  const sink = new Sink();
  sink.string(text);
  return Uint8Array.from(sink.bytes);
}

export function fixtureProp(type: number, payload: Uint8Array, declaredLength?: number): XcfFixtureProp {
  return declaredLength === undefined ? { type, payload } : { type, payload, declaredLength };
}

function writeProps(sink: Sink, props: readonly XcfFixtureProp[]): void {
  for (const prop of props) {
    sink.u32(prop.type);
    sink.u32(prop.declaredLength ?? prop.payload.length);
    sink.append(prop.payload);
  }
  sink.u32(0);
  sink.u32(0);
}

/** 바이트 평면 하나를 RLE로 인코딩한다. 짧은/긴 반복과 짧은/긴 리터럴 네 연산을 모두 쓴다. */
export function encodeFixturePlaneRle(plane: Uint8Array): number[] {
  const out: number[] = [];
  let index = 0;
  while (index < plane.length) {
    let run = 1;
    while (index + run < plane.length && plane[index + run] === plane[index] && run < 65535) run += 1;
    if (run >= 3) {
      if (run <= 127) out.push(run - 1, plane[index] ?? 0);
      else out.push(127, run >> 8, run & 0xff, plane[index] ?? 0);
      index += run;
      continue;
    }
    let end = index;
    while (end < plane.length && end - index < 65535) {
      let ahead = 1;
      while (end + ahead < plane.length && plane[end + ahead] === plane[end] && ahead < 3) ahead += 1;
      if (ahead >= 3) break;
      end += 1;
    }
    const count = end - index;
    if (count <= 127) out.push(256 - count);
    else out.push(128, count >> 8, count & 0xff);
    for (let offset = index; offset < end; offset += 1) out.push(plane[offset] ?? 0);
    index = end;
  }
  return out;
}

function tileBytes(layer: XcfFixtureLayer, column: number, row: number): Uint8Array {
  const tileWidth = Math.min(TILE, layer.width - column * TILE);
  const tileHeight = Math.min(TILE, layer.height - row * TILE);
  const bpp = layer.bytesPerPixel;
  const out = new Uint8Array(tileWidth * tileHeight * bpp);
  const raw = layer.raw ?? new Uint8Array(layer.width * layer.height * bpp);
  for (let y = 0; y < tileHeight; y += 1) {
    for (let x = 0; x < tileWidth; x += 1) {
      const source = ((row * TILE + y) * layer.width + column * TILE + x) * bpp;
      const target = (y * tileWidth + x) * bpp;
      for (let channel = 0; channel < bpp; channel += 1) out[target + channel] = raw[source + channel] ?? 0;
    }
  }
  return out;
}

function encodeTile(spec: XcfFixtureSpec, tile: Uint8Array, bpp: number): Uint8Array {
  if (spec.compression === 0) return tile;
  if (spec.compression === 2) {
    if (spec.deflate === undefined) throw new Error("압축 2 픽스처에는 deflate 함수가 필요하다");
    return spec.deflate(tile);
  }
  const pixels = tile.length / bpp;
  const encoded: number[] = [];
  for (let channel = 0; channel < bpp; channel += 1) {
    const plane = new Uint8Array(pixels);
    for (let pixel = 0; pixel < pixels; pixel += 1) plane[pixel] = tile[pixel * bpp + channel] ?? 0;
    for (const byte of encodeFixturePlaneRle(plane)) encoded.push(byte);
  }
  return Uint8Array.from(encoded);
}

function versionOf(tag: string): number {
  return tag === "file" ? 0 : Number.parseInt(tag.slice(1), 10);
}

/** 명세에서 유도한 구조로 XCF 바이트를 조립한다. */
export function buildXcfFixture(spec: XcfFixtureSpec): Uint8Array {
  const sink = new Sink();
  const pointerBytes = spec.pointerBytes;
  sink.append(new TextEncoder().encode(`gimp xcf ${spec.tag}`));
  sink.u8(0);
  sink.u32(spec.width);
  sink.u32(spec.height);
  sink.u32(spec.baseType);
  if (versionOf(spec.tag) >= 4) sink.u32(spec.precision ?? 150);

  const imageProps: XcfFixtureProp[] = [];
  if (spec.omitCompression !== true) {
    imageProps.push({ type: 17, payload: Uint8Array.of(spec.compression) });
  }
  imageProps.push(...(spec.imageProps ?? []));
  writeProps(sink, imageProps);

  const layerPointerAt: number[] = [];
  for (let index = 0; index < spec.layers.length; index += 1) {
    layerPointerAt.push(sink.length);
    sink.pointer(0, pointerBytes);
  }
  sink.pointer(0, pointerBytes);
  const channelCount = spec.channelCount ?? 0;
  for (let index = 0; index < channelCount; index += 1) sink.pointer(sink.length + 1, pointerBytes);
  sink.pointer(0, pointerBytes);
  // 벡터 포인터 배열(비어 있음)
  sink.pointer(0, pointerBytes);

  const hierarchyPointerAt: number[] = [];
  spec.layers.forEach((layer, layerIndex) => {
    sink.patchPointer(layerPointerAt[layerIndex] ?? 0, sink.length, pointerBytes);
    sink.u32(layer.width);
    sink.u32(layer.height);
    sink.u32(layer.type);
    sink.string(layer.name);
    writeProps(sink, layer.props ?? []);
    hierarchyPointerAt.push(sink.length);
    sink.pointer(0, pointerBytes);
    sink.pointer(layer.hasMaskPointer === true ? sink.length + 1 : 0, pointerBytes);
  });

  spec.layers.forEach((layer, layerIndex) => {
    if (layer.omitHierarchy === true) return;
    sink.patchPointer(hierarchyPointerAt[layerIndex] ?? 0, sink.length, pointerBytes);
    sink.u32(layer.width);
    sink.u32(layer.height);
    sink.u32(layer.bytesPerPixel);
    const levelPointerAt = sink.length;
    sink.pointer(0, pointerBytes);
    const dummyPointerAts: number[] = [];
    if (layer.dummyLevels === true) {
      dummyPointerAts.push(sink.length);
      sink.pointer(0, pointerBytes);
    }
    sink.pointer(0, pointerBytes);

    sink.patchPointer(levelPointerAt, sink.length, pointerBytes);
    sink.u32(layer.width);
    sink.u32(layer.height);
    const columns = Math.ceil(layer.width / TILE);
    const rows = Math.ceil(layer.height / TILE);
    const tilePointerAt: number[] = [];
    for (let index = 0; index < columns * rows; index += 1) {
      tilePointerAt.push(sink.length);
      sink.pointer(0, pointerBytes);
    }
    sink.pointer(0, pointerBytes);

    for (let index = 0; index < columns * rows; index += 1) {
      sink.patchPointer(tilePointerAt[index] ?? 0, sink.length, pointerBytes);
      const column = index % columns;
      const row = Math.floor(index / columns);
      sink.append(layer.tileBytesOverride ?? encodeTile(spec, tileBytes(layer, column, row), layer.bytesPerPixel));
    }

    if (layer.dummyLevels === true) {
      // 타일 없는 축소 더미 레벨: 크기와 빈 포인터 배열만 갖는다.
      sink.patchPointer(dummyPointerAts[0] ?? 0, sink.length, pointerBytes);
      sink.u32(Math.max(1, Math.floor(layer.width / 2)));
      sink.u32(Math.max(1, Math.floor(layer.height / 2)));
      sink.pointer(0, pointerBytes);
    }
  });

  return Uint8Array.from(sink.bytes);
}
