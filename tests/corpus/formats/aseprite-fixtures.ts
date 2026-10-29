/**
 * 합성 Aseprite 스프라이트 빌더. 리더(`aseprite-sprite*.ts`)를 import하지 않고 바이트 배치만으로 만든다.
 *
 * 필드 크기와 상수는 Aseprite가 공개한 파일 포맷 문서(고정 커밋 24086ec0)에서 확인한 사실만 쓴다(문구는 옮기지
 * 않았다). 리더와 같은 사람이 같은 해석으로 쓴 빌더라서 공통 오독은 이 테스트로 잡지 못한다. 그 한계는 실제 파일
 * 16개와 독립 디코더 대조(설계 문서 3절)로 보완했다.
 */
import { deflateSync } from "node:zlib";

export class ByteWriter {
  private readonly parts: number[] = [];

  get length(): number {
    return this.parts.length;
  }

  u8(v: number): this {
    this.parts.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    return this.u8(v).u8(v >> 8);
  }

  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }

  u32(v: number): this {
    return this.u16(v & 0xffff).u16(Math.floor(v / 0x10000) & 0xffff);
  }

  i32(v: number): this {
    return this.u32(v < 0 ? v + 0x1_0000_0000 : v);
  }

  fixed(v: number): this {
    return this.i32(Math.round(v * 65536));
  }

  f32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    return this.bytes(b);
  }

  f64(v: number): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    return this.bytes(b);
  }

  u64(v: bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, v, true);
    return this.bytes(b);
  }

  i64(v: bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, v, true);
    return this.bytes(b);
  }

  zeros(count: number): this {
    for (let i = 0; i < count; i += 1) this.parts.push(0);
    return this;
  }

  bytes(data: ArrayLike<number>): this {
    for (let i = 0; i < data.length; i += 1) this.parts.push(data[i]! & 0xff);
    return this;
  }

  /** WORD 길이 + UTF-8. */
  string(text: string): this {
    const encoded = new TextEncoder().encode(text);
    return this.u16(encoded.length).bytes(encoded);
  }

  rawString(bytes: ArrayLike<number>): this {
    return this.u16(bytes.length).bytes(bytes);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

export interface FixtureChunk {
  readonly type: number;
  readonly payload: Uint8Array;
  /** 청크 크기 필드를 실제와 다르게 쓴다(손상 주입). */
  readonly sizeOverride?: number;
}

export interface FixtureFrame {
  readonly duration?: number;
  readonly chunks: readonly FixtureChunk[];
  readonly oldCount?: number;
  readonly newCount?: number;
  readonly magic?: number;
  /** 프레임 크기 필드를 실제와 다르게 쓴다. */
  readonly bytesOverride?: number;
  /** 마지막 청크 뒤에 붙는 바이트. */
  readonly trailing?: Uint8Array;
}

export interface FixtureSpec {
  readonly width: number;
  readonly height: number;
  readonly depth: 8 | 16 | 32;
  readonly headerFlags?: number;
  readonly speed?: number;
  readonly transparentIndex?: number;
  readonly colorCount?: number;
  readonly pixelWidth?: number;
  readonly pixelHeight?: number;
  readonly grid?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly frames: readonly FixtureFrame[];
  readonly frameCountOverride?: number;
  readonly fileSizeOverride?: number;
  readonly magicOverride?: number;
  readonly depthOverride?: number;
  readonly trailing?: Uint8Array;
}

function frameBytes(frame: FixtureFrame): Uint8Array {
  const body = new ByteWriter();
  for (const chunk of frame.chunks) {
    body.u32(chunk.sizeOverride ?? chunk.payload.length + 6).u16(chunk.type).bytes(chunk.payload);
  }
  if (frame.trailing) body.bytes(frame.trailing);
  const bodyBytes = body.toBytes();
  const total = 16 + bodyBytes.length;
  const head = new ByteWriter()
    .u32(frame.bytesOverride ?? total)
    .u16(frame.magic ?? 0xf1fa)
    .u16(frame.oldCount ?? (frame.chunks.length < 0xffff ? frame.chunks.length : 0xffff))
    .u16(frame.duration ?? 100)
    .zeros(2)
    .u32(frame.newCount ?? frame.chunks.length);
  return Uint8Array.from([...head.toBytes(), ...bodyBytes]);
}

export function buildAsepriteFixture(spec: FixtureSpec): Uint8Array {
  const frames = spec.frames.map(frameBytes);
  const framesTotal = frames.reduce((n, f) => n + f.length, 0);
  const trailing = spec.trailing ?? new Uint8Array(0);
  const head = new ByteWriter()
    .u32(spec.fileSizeOverride ?? 128 + framesTotal + trailing.length)
    .u16(spec.magicOverride ?? 0xa5e0)
    .u16(spec.frameCountOverride ?? spec.frames.length)
    .u16(spec.width)
    .u16(spec.height)
    .u16(spec.depthOverride ?? spec.depth)
    .u32(spec.headerFlags ?? 1)
    .u16(spec.speed ?? 100)
    .zeros(8)
    .u8(spec.transparentIndex ?? 0)
    .zeros(3)
    .u16(spec.colorCount ?? 0)
    .u8(spec.pixelWidth ?? 1)
    .u8(spec.pixelHeight ?? 1)
    .i16(spec.grid?.x ?? 0)
    .i16(spec.grid?.y ?? 0)
    .u16(spec.grid?.width ?? 16)
    .u16(spec.grid?.height ?? 16)
    .zeros(84);
  const out = [...head.toBytes()];
  for (const f of frames) out.push(...f);
  out.push(...trailing);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// 청크 빌더
// ---------------------------------------------------------------------------

export const TYPE = {
  oldPalette0004: 0x0004,
  oldPalette0011: 0x0011,
  layer: 0x2004,
  cel: 0x2005,
  celExtra: 0x2006,
  colorProfile: 0x2007,
  externalFiles: 0x2008,
  mask: 0x2016,
  path: 0x2017,
  tags: 0x2018,
  palette: 0x2019,
  userData: 0x2020,
  slice: 0x2022,
  tileset: 0x2023,
} as const;

export function chunk(type: number, payload: Uint8Array, sizeOverride?: number): FixtureChunk {
  return sizeOverride === undefined ? { type, payload } : { type, payload, sizeOverride };
}

export function layerChunk(opts: {
  readonly name: string;
  readonly flags?: number;
  readonly type?: number;
  readonly level?: number;
  readonly blend?: number;
  readonly opacity?: number;
  readonly tilesetIndex?: number;
  readonly uuid?: readonly number[];
  readonly rawName?: readonly number[];
}): FixtureChunk {
  const w = new ByteWriter()
    .u16(opts.flags ?? 3)
    .u16(opts.type ?? 0)
    .u16(opts.level ?? 0)
    .u16(0)
    .u16(0)
    .u16(opts.blend ?? 0)
    .u8(opts.opacity ?? 255)
    .zeros(3);
  if (opts.rawName) w.rawString(opts.rawName);
  else w.string(opts.name);
  if ((opts.type ?? 0) === 2) w.u32(opts.tilesetIndex ?? 0);
  if (opts.uuid) w.bytes(opts.uuid);
  return chunk(TYPE.layer, w.toBytes());
}

export function zlibBytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(deflateSync(data));
}

export type FixtureCelBody =
  | { readonly kind: "raw"; readonly width: number; readonly height: number; readonly pixels: Uint8Array }
  | { readonly kind: "compressed"; readonly width: number; readonly height: number; readonly pixels: Uint8Array; readonly compressedOverride?: Uint8Array }
  | { readonly kind: "linked"; readonly frame: number }
  | {
      readonly kind: "tilemap";
      readonly widthTiles: number;
      readonly heightTiles: number;
      readonly bits?: number;
      readonly tiles: Uint8Array;
      readonly masks?: readonly [number, number, number, number];
    }
  | { readonly kind: "unknown"; readonly type: number; readonly data: Uint8Array };

export function celChunk(opts: {
  readonly layer: number;
  readonly x?: number;
  readonly y?: number;
  readonly opacity?: number;
  readonly z?: number;
  readonly body: FixtureCelBody;
}): FixtureChunk {
  const body = opts.body;
  const type = body.kind === "raw" ? 0 : body.kind === "linked" ? 1 : body.kind === "compressed" ? 2 : body.kind === "tilemap" ? 3 : body.type;
  const w = new ByteWriter().u16(opts.layer).i16(opts.x ?? 0).i16(opts.y ?? 0).u8(opts.opacity ?? 255).u16(type).i16(opts.z ?? 0).zeros(5);
  if (body.kind === "raw") w.u16(body.width).u16(body.height).bytes(body.pixels);
  else if (body.kind === "compressed") w.u16(body.width).u16(body.height).bytes(body.compressedOverride ?? zlibBytes(body.pixels));
  else if (body.kind === "linked") w.u16(body.frame);
  else if (body.kind === "tilemap") {
    const masks = body.masks ?? [0x1fffffff, 0x20000000, 0x40000000, 0x80000000];
    w.u16(body.widthTiles).u16(body.heightTiles).u16(body.bits ?? 32).u32(masks[0]).u32(masks[1]).u32(masks[2]).u32(masks[3]).zeros(10).bytes(zlibBytes(body.tiles));
  } else w.bytes(body.data);
  return chunk(TYPE.cel, w.toBytes());
}

export function celExtraChunk(bounds: { x: number; y: number; width: number; height: number } | null): FixtureChunk {
  const w = new ByteWriter().u32(bounds ? 1 : 0);
  w.fixed(bounds?.x ?? 0).fixed(bounds?.y ?? 0).fixed(bounds?.width ?? 0).fixed(bounds?.height ?? 0).zeros(16);
  return chunk(TYPE.celExtra, w.toBytes());
}

export function paletteChunk(opts: {
  readonly size: number;
  readonly first: number;
  readonly colors: readonly (readonly [number, number, number, number] | readonly [number, number, number, number, string])[];
}): FixtureChunk {
  const w = new ByteWriter().u32(opts.size).u32(opts.first).u32(opts.first + opts.colors.length - 1).zeros(8);
  for (const c of opts.colors) {
    const named = c.length === 5;
    w.u16(named ? 1 : 0).u8(c[0]).u8(c[1]).u8(c[2]).u8(c[3]);
    if (named) w.string(c[4] as string);
  }
  return chunk(TYPE.palette, w.toBytes());
}

export function oldPaletteChunk(type: 0x0004 | 0x0011, packets: readonly { skip: number; colors: readonly (readonly [number, number, number])[] }[]): FixtureChunk {
  const w = new ByteWriter().u16(packets.length);
  for (const p of packets) {
    w.u8(p.skip).u8(p.colors.length === 256 ? 0 : p.colors.length);
    for (const c of p.colors) w.u8(c[0]).u8(c[1]).u8(c[2]);
  }
  return chunk(type, w.toBytes());
}

export function tagsChunk(
  tags: readonly { from: number; to: number; direction?: number; repeat?: number; rgb?: readonly [number, number, number]; name: string }[],
): FixtureChunk {
  const w = new ByteWriter().u16(tags.length).zeros(8);
  for (const t of tags) {
    w.u16(t.from).u16(t.to).u8(t.direction ?? 0).u16(t.repeat ?? 0).zeros(6).u8(t.rgb?.[0] ?? 0).u8(t.rgb?.[1] ?? 0).u8(t.rgb?.[2] ?? 0).u8(0).string(t.name);
  }
  return chunk(TYPE.tags, w.toBytes());
}

export function sliceChunk(opts: {
  readonly name: string;
  readonly ninePatch?: boolean;
  readonly pivot?: boolean;
  readonly keys: readonly { frame: number; x: number; y: number; w: number; h: number; center?: readonly [number, number, number, number]; pivot?: readonly [number, number] }[];
}): FixtureChunk {
  const flags = (opts.ninePatch ? 1 : 0) | (opts.pivot ? 2 : 0);
  const w = new ByteWriter().u32(opts.keys.length).u32(flags).u32(0).string(opts.name);
  for (const k of opts.keys) {
    w.u32(k.frame).i32(k.x).i32(k.y).u32(k.w).u32(k.h);
    if (opts.ninePatch) w.i32(k.center?.[0] ?? 0).i32(k.center?.[1] ?? 0).u32(k.center?.[2] ?? 0).u32(k.center?.[3] ?? 0);
    if (opts.pivot) w.i32(k.pivot?.[0] ?? 0).i32(k.pivot?.[1] ?? 0);
  }
  return chunk(TYPE.slice, w.toBytes());
}

export function tilesetChunk(opts: {
  readonly id: number;
  readonly tileCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly name: string;
  readonly flags?: number;
  readonly baseIndex?: number;
  readonly external?: readonly [number, number];
  readonly pixels?: Uint8Array;
}): FixtureChunk {
  const flags = opts.flags ?? ((opts.external ? 1 : 0) | (opts.pixels ? 2 : 0));
  const w = new ByteWriter().u32(opts.id).u32(flags).u32(opts.tileCount).u16(opts.tileWidth).u16(opts.tileHeight).i16(opts.baseIndex ?? 1).zeros(14).string(opts.name);
  if (flags & 1) w.u32(opts.external?.[0] ?? 0).u32(opts.external?.[1] ?? 0);
  if (flags & 2) {
    const z = zlibBytes(opts.pixels ?? new Uint8Array(0));
    w.u32(z.length).bytes(z);
  }
  return chunk(TYPE.tileset, w.toBytes());
}

export type FixtureProp =
  | { readonly t: "bool"; readonly v: boolean }
  | { readonly t: "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "fixed" | "float" | "double"; readonly v: number }
  | { readonly t: "int64" | "uint64"; readonly v: bigint }
  | { readonly t: "string"; readonly v: string }
  | { readonly t: "point"; readonly x: number; readonly y: number }
  | { readonly t: "size"; readonly w: number; readonly h: number }
  | { readonly t: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly t: "vector"; readonly elementType: number; readonly items: readonly FixtureProp[] }
  | { readonly t: "map"; readonly props: readonly (readonly [string, FixtureProp])[] }
  | { readonly t: "uuid"; readonly v: readonly number[] }
  | { readonly t: "raw"; readonly type: number; readonly bytes: readonly number[] };

const PROP_TYPE: Record<string, number> = {
  bool: 1, int8: 2, uint8: 3, int16: 4, uint16: 5, int32: 6, uint32: 7, int64: 8, uint64: 9, fixed: 10, float: 11, double: 12,
  string: 13, point: 14, size: 15, rect: 16, vector: 17, map: 18, uuid: 19,
};

function writePropValue(w: ByteWriter, p: FixtureProp): void {
  switch (p.t) {
    case "bool": w.u8(p.v ? 1 : 0); break;
    case "int8": w.u8(p.v < 0 ? p.v + 256 : p.v); break;
    case "uint8": w.u8(p.v); break;
    case "int16": w.i16(p.v); break;
    case "uint16": w.u16(p.v); break;
    case "int32": w.i32(p.v); break;
    case "uint32": w.u32(p.v); break;
    case "int64": w.i64(p.v); break;
    case "uint64": w.u64(p.v); break;
    case "fixed": w.fixed(p.v); break;
    case "float": w.f32(p.v); break;
    case "double": w.f64(p.v); break;
    case "string": w.string(p.v); break;
    case "point": w.i32(p.x).i32(p.y); break;
    case "size": w.i32(p.w).i32(p.h); break;
    case "rect": w.i32(p.x).i32(p.y).i32(p.w).i32(p.h); break;
    case "vector":
      w.u32(p.items.length).u16(p.elementType);
      for (const item of p.items) {
        if (p.elementType === 0) w.u16(PROP_TYPE[item.t]!);
        writePropValue(w, item);
      }
      break;
    case "map":
      w.u32(p.props.length);
      for (const [name, value] of p.props) writeNamedProp(w, name, value);
      break;
    case "uuid": w.bytes(p.v); break;
    case "raw": w.bytes(p.bytes); break;
  }
}

function writeNamedProp(w: ByteWriter, name: string, p: FixtureProp): void {
  w.string(name).u16(p.t === "raw" ? p.type : PROP_TYPE[p.t]!);
  writePropValue(w, p);
}

export function userDataChunk(opts: {
  readonly text?: string;
  readonly rawText?: readonly number[];
  readonly color?: readonly [number, number, number, number];
  readonly maps?: readonly { readonly key: number; readonly props: readonly (readonly [string, FixtureProp])[] }[];
}): FixtureChunk {
  const flags = (opts.text !== undefined || opts.rawText ? 1 : 0) | (opts.color ? 2 : 0) | (opts.maps ? 4 : 0);
  const w = new ByteWriter().u32(flags);
  if (opts.rawText) w.rawString(opts.rawText);
  else if (opts.text !== undefined) w.string(opts.text);
  if (opts.color) w.u8(opts.color[0]).u8(opts.color[1]).u8(opts.color[2]).u8(opts.color[3]);
  if (opts.maps) {
    const body = new ByteWriter().u32(opts.maps.length);
    for (const m of opts.maps) {
      body.u32(m.key).u32(m.props.length);
      for (const [name, value] of m.props) writeNamedProp(body, name, value);
    }
    const bytes = body.toBytes();
    w.u32(bytes.length + 4).bytes(bytes);
  }
  return chunk(TYPE.userData, w.toBytes());
}

export function colorProfileChunk(opts: { readonly type: 0 | 1 | 2; readonly fixedGamma?: boolean; readonly gamma?: number; readonly icc?: Uint8Array }): FixtureChunk {
  const w = new ByteWriter().u16(opts.type).u16(opts.fixedGamma ? 1 : 0).fixed(opts.gamma ?? 1).zeros(8);
  if (opts.type === 2) w.u32(opts.icc?.length ?? 0).bytes(opts.icc ?? []);
  return chunk(TYPE.colorProfile, w.toBytes());
}

export function externalFilesChunk(entries: readonly { id: number; type: number; name: string }[]): FixtureChunk {
  const w = new ByteWriter().u32(entries.length).zeros(8);
  for (const e of entries) w.u32(e.id).u8(e.type).zeros(7).string(e.name);
  return chunk(TYPE.externalFiles, w.toBytes());
}

/** 단색 RGBA 픽셀 버퍼. */
export function solidRgba(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) out.set(rgba, i * 4);
  return out;
}

// ---------------------------------------------------------------------------
// 테스트 공용 조립 도구
// ---------------------------------------------------------------------------

export function frameOf(chunks: readonly FixtureChunk[], extra: Partial<FixtureFrame> = {}): FixtureFrame {
  return { chunks, ...extra };
}

export function spriteOf(frames: readonly FixtureFrame[], extra: Partial<FixtureSpec> = {}): FixtureSpec {
  return { width: 4, height: 3, depth: 32, frames, ...extra };
}

export const RICH_RAW_2X2 = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
export const RICH_PIXELS_3X2 = Uint8Array.from({ length: 24 }, (_, index) => (index * 7 + 3) & 0xff);

/** 프레임 3개, 레이어 3개(그룹 포함), 셀 5개(링크 2개 포함), 태그 2개, 슬라이스 1개, 팔레트 갱신 2번을 가진 RGBA 스프라이트. */
export function richAsepriteSpec(): FixtureSpec {
  return spriteOf(
    [
      frameOf([
        colorProfileChunk({ type: 1 }),
        externalFilesChunk([{ id: 1, type: 0, name: "pal.gpl" }]),
        paletteChunk({
          size: 4,
          first: 0,
          colors: [
            [0, 0, 0, 0],
            [255, 0, 0, 255],
            [0, 255, 0, 255, "green"],
            [0, 0, 255, 128],
          ],
        }),
        userDataChunk({ text: "sprite", color: [9, 8, 7, 6] }),
        layerChunk({ name: "Background", flags: 1 | 2 | 8 }),
        userDataChunk({ text: "bg layer" }),
        layerChunk({ name: "Group", type: 1, flags: 1 | 32 }),
        layerChunk({ name: "Ink", level: 1, flags: 1 | 2, blend: 1, opacity: 128 }),
        celChunk({ layer: 0, body: { kind: "raw", width: 2, height: 2, pixels: RICH_RAW_2X2 } }),
        userDataChunk({ text: "cel note", color: [1, 2, 3, 4] }),
        celChunk({ layer: 2, x: -1, y: 1, opacity: 200, z: 1, body: { kind: "compressed", width: 3, height: 2, pixels: RICH_PIXELS_3X2 } }),
        celExtraChunk({ x: 0.5, y: 1.25, width: 2.5, height: 1.75 }),
        tagsChunk([
          { from: 0, to: 1, direction: 2, repeat: 3, rgb: [1, 2, 3], name: "walk" },
          { from: 2, to: 2, name: "idle" },
        ]),
        userDataChunk({ text: "walk", color: [255, 0, 0, 255] }),
        userDataChunk({ text: "idle" }),
        sliceChunk({
          name: "hit",
          ninePatch: true,
          pivot: true,
          keys: [{ frame: 0, x: 1, y: 1, w: 2, h: 2, center: [0, 0, 1, 1], pivot: [1, 1] }],
        }),
        userDataChunk({ text: "slice note" }),
      ], { duration: 100 }),
      frameOf(
        [
          celChunk({ layer: 0, body: { kind: "linked", frame: 0 } }),
          celChunk({ layer: 2, x: 3, y: 2, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(9, 8, 7, 6) } }),
        ],
        { duration: 0 },
      ),
      frameOf(
        [
          paletteChunk({ size: 2, first: 1, colors: [[10, 20, 30, 255]] }),
          celChunk({ layer: 0, body: { kind: "linked", frame: 1 } }),
        ],
        { duration: 250 },
      ),
    ],
    { headerFlags: 3, speed: 120 },
  );
}
