/**
 * @file aseprite-sprite-chunks.ts
 * @description Aseprite 스프라이트 청크 14종의 디코더. 각 디코더는 청크 페이로드 범위로 제한된 커서를 받아 값만 읽고,
 *              해석(레이어 트리, 사용자 데이터 귀속, 픽셀 디코드)은 `aseprite-sprite.ts`가 맡는다.
 *
 * 출처와 이용 조건은 `aseprite-sprite-cursor.ts` 머리말과 같다(필드 크기·상수만 자체 표현으로 옮겼다).
 */

import { AsepriteChunkReadError, AsepriteCursor, type AsepriteSpriteLimits } from "./aseprite-sprite-cursor";

export const ASEPRITE_CHUNK_TYPE = Object.freeze({
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
} as const);

export interface AsepriteChunkContext {
  /** 헤더의 색 깊이(8, 16, 32). 셀·타일셋 픽셀 크기를 정한다. */
  readonly bytesPerPixel: 1 | 2 | 4;
  /** 헤더 플래그 4: 레이어 청크 끝에 UUID가 있다. */
  readonly layerUuidPresent: boolean;
  readonly limits: AsepriteSpriteLimits;
  /** STRING이 UTF-8로 해석되지 않아 대체 문자로 바꿨을 때 호출한다. */
  readonly noteInvalidUtf8: (field: string) => void;
}

export interface AsepriteRgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface AsepritePaletteSlot extends AsepriteRgba {
  readonly index: number;
  readonly name: string | null;
}

export interface AsepritePaletteChunk {
  readonly source: "new" | "old-0004" | "old-0011";
  /** 새 팔레트 청크가 선언한 전체 크기. 구 팔레트에는 없다. */
  readonly declaredSize: number | null;
  readonly entries: readonly AsepritePaletteSlot[];
}

export type AsepriteLayerKind = "image" | "group" | "tilemap" | "unknown";

export interface AsepriteLayerChunk {
  readonly flags: number;
  readonly kind: AsepriteLayerKind;
  /** 파일에 적힌 레이어 타입 값. */
  readonly typeValue: number;
  readonly childLevel: number;
  readonly blendMode: number;
  readonly opacity: number;
  readonly name: string;
  readonly tilesetIndex: number | null;
  readonly uuid: string | null;
}

export type AsepriteCelBody =
  | { readonly kind: "raw"; readonly width: number; readonly height: number; readonly data: Uint8Array }
  | { readonly kind: "linked"; readonly frame: number }
  | { readonly kind: "compressed-image"; readonly width: number; readonly height: number; readonly compressed: Uint8Array }
  | {
      readonly kind: "compressed-tilemap";
      readonly widthTiles: number;
      readonly heightTiles: number;
      readonly bitsPerTile: number;
      readonly tileIdMask: number;
      readonly xFlipMask: number;
      readonly yFlipMask: number;
      readonly diagonalFlipMask: number;
      readonly compressed: Uint8Array;
    }
  | { readonly kind: "unknown"; readonly typeValue: number; readonly data: Uint8Array };

export interface AsepriteCelChunk {
  readonly layerIndex: number;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly typeValue: number;
  readonly zIndex: number;
  readonly body: AsepriteCelBody;
}

export interface AsepriteCelExtraChunk {
  /** 플래그 1이면 셀의 정밀 경계(고정소수점)가 유효하다. */
  readonly preciseBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

export type AsepriteColorProfileKind = "none" | "srgb" | "icc" | "unknown";

export interface AsepriteColorProfileChunk {
  readonly kind: AsepriteColorProfileKind;
  readonly typeValue: number;
  readonly fixedGamma: boolean;
  /** 1.0이 선형이다. */
  readonly gamma: number;
  readonly iccProfile: Uint8Array | null;
}

export interface AsepriteExternalFileEntry {
  readonly id: number;
  readonly typeValue: number;
  readonly kind: "palette" | "tileset" | "extension-properties" | "extension-tile-management" | "unknown";
  readonly name: string;
}

export type AsepriteTagDirection = "forward" | "reverse" | "ping-pong" | "ping-pong-reverse" | "unknown";

export interface AsepriteTagEntry {
  readonly from: number;
  readonly to: number;
  readonly direction: AsepriteTagDirection;
  readonly directionValue: number;
  /** 0이면 지정하지 않은 것이다(편집기는 무한, 내보내기는 1회). */
  readonly repeat: number;
  /** 폐기된 색(v1.2.x 호환). 이후 사용자 데이터의 색이 대신한다. */
  readonly deprecatedColor: { readonly r: number; readonly g: number; readonly b: number };
  readonly name: string;
}

export interface AsepriteSliceKey {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly center: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly pivot: { readonly x: number; readonly y: number } | null;
}

export interface AsepriteSliceChunk {
  readonly name: string;
  readonly hasNinePatch: boolean;
  readonly hasPivot: boolean;
  readonly keys: readonly AsepriteSliceKey[];
}

export interface AsepriteTilesetChunk {
  readonly id: number;
  readonly flags: number;
  readonly tileCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly baseIndex: number;
  readonly name: string;
  readonly externalLink: { readonly fileId: number; readonly tilesetId: number } | null;
  /** 플래그 2: 타일 이미지가 파일 안에 있다. 값은 zlib으로 압축된 원본 색 형식 픽셀이다. */
  readonly compressedTiles: Uint8Array | null;
}

export type AsepriteUserPropertyValue =
  | { readonly type: "bool"; readonly value: boolean }
  | {
      readonly type: "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "fixed" | "float" | "double";
      readonly value: number;
    }
  | { readonly type: "int64" | "uint64"; readonly value: string }
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "point"; readonly x: number; readonly y: number }
  | { readonly type: "size"; readonly width: number; readonly height: number }
  | { readonly type: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly type: "vector"; readonly elementType: number; readonly items: readonly AsepriteUserPropertyValue[] }
  | { readonly type: "map"; readonly properties: readonly AsepriteUserProperty[] }
  | { readonly type: "uuid"; readonly value: string };

export interface AsepriteUserProperty {
  readonly name: string;
  readonly value: AsepriteUserPropertyValue;
}

export interface AsepriteUserPropertyMap {
  /** 0이면 사용자 속성이고, 그 밖의 값은 확장이 쓰는 항목 ID다. */
  readonly key: number;
  readonly properties: readonly AsepriteUserProperty[];
}

export interface AsepriteUserDataChunk {
  readonly flags: number;
  readonly text: string | null;
  readonly color: AsepriteRgba | null;
  readonly propertyMaps: readonly AsepriteUserPropertyMap[] | null;
  /** 속성 해석에 실패한 이유. 텍스트·색은 이미 읽은 값을 유지한다. */
  readonly propertiesError: string | null;
}

const PIXEL_BYTES_ERROR = "색 깊이가 8, 16, 32가 아니다";

function hex2(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** 16바이트를 저장된 순서 그대로 8-4-4-4-12 소문자 16진 문자열로 쓴다(바이트 순서 규칙은 문서에 없다). */
function uuidText(bytes: Uint8Array): string {
  const h = Array.from(bytes, hex2).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readString(cursor: AsepriteCursor, ctx: AsepriteChunkContext, field: string): string {
  const decoded = cursor.string();
  if (decoded.invalidUtf8) ctx.noteInvalidUtf8(field);
  return decoded.value;
}

function ensureCount(count: number, minEntryBytes: number, cursor: AsepriteCursor, what: string): void {
  if (count * minEntryBytes > cursor.remaining) {
    throw new AsepriteChunkReadError(`${what} 개수 ${count}가 남은 바이트 ${cursor.remaining}에 비해 너무 크다`);
  }
}

export function decodeOldPaletteChunk(cursor: AsepriteCursor, sixBit: boolean): AsepritePaletteChunk {
  const packets = cursor.u16();
  const entries: AsepritePaletteSlot[] = [];
  let index = 0;
  for (let p = 0; p < packets; p += 1) {
    index += cursor.u8();
    const declared = cursor.u8();
    const count = declared === 0 ? 256 : declared;
    ensureCount(count, 3, cursor, "구 팔레트 색");
    for (let i = 0; i < count; i += 1) {
      const raw = [cursor.u8(), cursor.u8(), cursor.u8()];
      const [r, g, b] = sixBit ? raw.map((v) => ((v & 63) << 2) | ((v & 63) >> 4)) : raw;
      entries.push({ index, r: r!, g: g!, b: b!, a: 255, name: null });
      index += 1;
    }
  }
  return { source: sixBit ? "old-0011" : "old-0004", declaredSize: null, entries };
}

export function decodePaletteChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): AsepritePaletteChunk {
  const declaredSize = cursor.u32();
  const first = cursor.u32();
  const last = cursor.u32();
  cursor.skip(8);
  if (last < first) throw new AsepriteChunkReadError(`팔레트 끝 인덱스 ${last}가 시작 ${first}보다 작다`);
  if (declaredSize > ctx.limits.maxPaletteEntries || last >= ctx.limits.maxPaletteEntries) {
    throw new AsepriteChunkReadError(`팔레트 크기가 한도 ${ctx.limits.maxPaletteEntries}를 넘는다`);
  }
  const count = last - first + 1;
  ensureCount(count, 6, cursor, "팔레트 항목");
  const entries: AsepritePaletteSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const flags = cursor.u16();
    const r = cursor.u8();
    const g = cursor.u8();
    const b = cursor.u8();
    const a = cursor.u8();
    const name = (flags & 1) !== 0 ? readString(cursor, ctx, "palette.name") : null;
    entries.push({ index: first + i, r, g, b, a, name });
  }
  return { source: "new", declaredSize, entries };
}

export function decodeLayerChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): AsepriteLayerChunk {
  const flags = cursor.u16();
  const typeValue = cursor.u16();
  const childLevel = cursor.u16();
  cursor.skip(4);
  const blendMode = cursor.u16();
  const opacity = cursor.u8();
  cursor.skip(3);
  const name = readString(cursor, ctx, "layer.name");
  const kind: AsepriteLayerKind = typeValue === 0 ? "image" : typeValue === 1 ? "group" : typeValue === 2 ? "tilemap" : "unknown";
  const tilesetIndex = typeValue === 2 ? cursor.u32() : null;
  const uuid = ctx.layerUuidPresent ? uuidText(cursor.take(16, "레이어 UUID")) : null;
  return { flags, kind, typeValue, childLevel, blendMode, opacity, name, tilesetIndex, uuid };
}

export function decodeCelChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): AsepriteCelChunk {
  const layerIndex = cursor.u16();
  const x = cursor.i16();
  const y = cursor.i16();
  const opacity = cursor.u8();
  const typeValue = cursor.u16();
  const zIndex = cursor.i16();
  cursor.skip(5);

  let body: AsepriteCelBody;
  if (typeValue === 0) {
    const width = cursor.u16();
    const height = cursor.u16();
    const expected = width * height * ctx.bytesPerPixel;
    body = { kind: "raw", width, height, data: cursor.take(expected, "원시 셀 픽셀") };
  } else if (typeValue === 1) {
    body = { kind: "linked", frame: cursor.u16() };
  } else if (typeValue === 2) {
    const width = cursor.u16();
    const height = cursor.u16();
    body = { kind: "compressed-image", width, height, compressed: cursor.take(cursor.remaining) };
  } else if (typeValue === 3) {
    const widthTiles = cursor.u16();
    const heightTiles = cursor.u16();
    const bitsPerTile = cursor.u16();
    const tileIdMask = cursor.u32();
    const xFlipMask = cursor.u32();
    const yFlipMask = cursor.u32();
    const diagonalFlipMask = cursor.u32();
    cursor.skip(10);
    body = {
      kind: "compressed-tilemap",
      widthTiles,
      heightTiles,
      bitsPerTile,
      tileIdMask,
      xFlipMask,
      yFlipMask,
      diagonalFlipMask,
      compressed: cursor.take(cursor.remaining),
    };
  } else {
    body = { kind: "unknown", typeValue, data: cursor.take(cursor.remaining) };
  }
  return { layerIndex, x, y, opacity, typeValue, zIndex, body };
}

export function decodeCelExtraChunk(cursor: AsepriteCursor): AsepriteCelExtraChunk {
  const flags = cursor.u32();
  const x = cursor.fixed();
  const y = cursor.fixed();
  const width = cursor.fixed();
  const height = cursor.fixed();
  cursor.skip(16);
  return { preciseBounds: (flags & 1) !== 0 ? { x, y, width, height } : null };
}

export function decodeColorProfileChunk(cursor: AsepriteCursor): AsepriteColorProfileChunk {
  const typeValue = cursor.u16();
  const flags = cursor.u16();
  const gamma = cursor.fixed();
  cursor.skip(8);
  const kind: AsepriteColorProfileKind = typeValue === 0 ? "none" : typeValue === 1 ? "srgb" : typeValue === 2 ? "icc" : "unknown";
  let iccProfile: Uint8Array | null = null;
  if (typeValue === 2) {
    const length = cursor.u32();
    iccProfile = cursor.take(length, "ICC 프로파일");
  }
  return { kind, typeValue, fixedGamma: (flags & 1) !== 0, gamma, iccProfile };
}

export function decodeExternalFilesChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): readonly AsepriteExternalFileEntry[] {
  const count = cursor.u32();
  cursor.skip(8);
  ensureCount(count, 14, cursor, "외부 파일 항목");
  const entries: AsepriteExternalFileEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = cursor.u32();
    const typeValue = cursor.u8();
    cursor.skip(7);
    const name = readString(cursor, ctx, "externalFile.name");
    const kind =
      typeValue === 0
        ? "palette"
        : typeValue === 1
          ? "tileset"
          : typeValue === 2
            ? "extension-properties"
            : typeValue === 3
              ? "extension-tile-management"
              : "unknown";
    entries.push({ id, typeValue, kind, name });
  }
  return entries;
}

const TAG_DIRECTIONS: readonly AsepriteTagDirection[] = ["forward", "reverse", "ping-pong", "ping-pong-reverse"];

export function decodeTagsChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): readonly AsepriteTagEntry[] {
  const count = cursor.u16();
  cursor.skip(8);
  if (count > ctx.limits.maxTags) throw new AsepriteChunkReadError(`태그 ${count}개가 한도 ${ctx.limits.maxTags}를 넘는다`);
  ensureCount(count, 19, cursor, "태그");
  const tags: AsepriteTagEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = cursor.u16();
    const to = cursor.u16();
    const directionValue = cursor.u8();
    const repeat = cursor.u16();
    cursor.skip(6);
    const deprecatedColor = { r: cursor.u8(), g: cursor.u8(), b: cursor.u8() };
    cursor.skip(1);
    const name = readString(cursor, ctx, "tag.name");
    tags.push({
      from,
      to,
      direction: TAG_DIRECTIONS[directionValue] ?? "unknown",
      directionValue,
      repeat,
      deprecatedColor,
      name,
    });
  }
  return tags;
}

export function decodeSliceChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): AsepriteSliceChunk {
  const keyCount = cursor.u32();
  const flags = cursor.u32();
  cursor.skip(4);
  const name = readString(cursor, ctx, "slice.name");
  const hasNinePatch = (flags & 1) !== 0;
  const hasPivot = (flags & 2) !== 0;
  ensureCount(keyCount, 20, cursor, "슬라이스 키");
  const keys: AsepriteSliceKey[] = [];
  for (let i = 0; i < keyCount; i += 1) {
    const frame = cursor.u32();
    const x = cursor.i32();
    const y = cursor.i32();
    const width = cursor.u32();
    const height = cursor.u32();
    const center = hasNinePatch ? { x: cursor.i32(), y: cursor.i32(), width: cursor.u32(), height: cursor.u32() } : null;
    const pivot = hasPivot ? { x: cursor.i32(), y: cursor.i32() } : null;
    keys.push({ frame, x, y, width, height, center, pivot });
  }
  return { name, hasNinePatch, hasPivot, keys };
}

export function decodeTilesetChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): AsepriteTilesetChunk {
  const id = cursor.u32();
  const flags = cursor.u32();
  const tileCount = cursor.u32();
  const tileWidth = cursor.u16();
  const tileHeight = cursor.u16();
  const baseIndex = cursor.i16();
  cursor.skip(14);
  const name = readString(cursor, ctx, "tileset.name");
  if (tileCount > ctx.limits.maxTilesetTiles) {
    throw new AsepriteChunkReadError(`타일 ${tileCount}개가 한도 ${ctx.limits.maxTilesetTiles}를 넘는다`);
  }
  const externalLink = (flags & 1) !== 0 ? { fileId: cursor.u32(), tilesetId: cursor.u32() } : null;
  let compressedTiles: Uint8Array | null = null;
  if ((flags & 2) !== 0) {
    const length = cursor.u32();
    compressedTiles = cursor.take(length, "타일셋 이미지");
  }
  return { id, flags, tileCount, tileWidth, tileHeight, baseIndex, name, externalLink, compressedTiles };
}

interface PropertyBudget {
  remaining: number;
}

function readPropertyValue(
  cursor: AsepriteCursor,
  ctx: AsepriteChunkContext,
  type: number,
  depth: number,
  budget: PropertyBudget,
): AsepriteUserPropertyValue {
  if (depth > ctx.limits.maxUserDataDepth) {
    throw new AsepriteChunkReadError(`사용자 속성 중첩이 ${ctx.limits.maxUserDataDepth}단계를 넘는다`);
  }
  budget.remaining -= 1;
  if (budget.remaining < 0) throw new AsepriteChunkReadError(`사용자 속성 개수가 한도 ${ctx.limits.maxUserDataValues}를 넘는다`);
  switch (type) {
    case 0x0001:
      return { type: "bool", value: cursor.u8() !== 0 };
    case 0x0002: {
      const v = cursor.u8();
      return { type: "int8", value: v > 127 ? v - 256 : v };
    }
    case 0x0003:
      return { type: "uint8", value: cursor.u8() };
    case 0x0004:
      return { type: "int16", value: cursor.i16() };
    case 0x0005:
      return { type: "uint16", value: cursor.u16() };
    case 0x0006:
      return { type: "int32", value: cursor.i32() };
    case 0x0007:
      return { type: "uint32", value: cursor.u32() };
    case 0x0008:
      return { type: "int64", value: cursor.i64Decimal() };
    case 0x0009:
      return { type: "uint64", value: cursor.u64Decimal() };
    case 0x000a:
      return { type: "fixed", value: cursor.fixed() };
    case 0x000b:
      return { type: "float", value: cursor.f32() };
    case 0x000c:
      return { type: "double", value: cursor.f64() };
    case 0x000d:
      return { type: "string", value: readString(cursor, ctx, "userData.property.string") };
    case 0x000e:
      return { type: "point", x: cursor.i32(), y: cursor.i32() };
    case 0x000f:
      return { type: "size", width: cursor.i32(), height: cursor.i32() };
    case 0x0010:
      return { type: "rect", x: cursor.i32(), y: cursor.i32(), width: cursor.i32(), height: cursor.i32() };
    case 0x0011: {
      const count = cursor.u32();
      const elementType = cursor.u16();
      ensureCount(count, elementType === 0 ? 3 : 1, cursor, "벡터 원소");
      const items: AsepriteUserPropertyValue[] = [];
      for (let i = 0; i < count; i += 1) {
        const itemType = elementType === 0 ? cursor.u16() : elementType;
        items.push(readPropertyValue(cursor, ctx, itemType, depth + 1, budget));
      }
      return { type: "vector", elementType, items };
    }
    case 0x0012: {
      const count = cursor.u32();
      ensureCount(count, 4, cursor, "중첩 맵 속성");
      return { type: "map", properties: readProperties(cursor, ctx, count, depth + 1, budget) };
    }
    case 0x0013:
      return { type: "uuid", value: uuidText(cursor.take(16, "속성 UUID")) };
    default:
      throw new AsepriteChunkReadError(`알 수 없는 사용자 속성 타입 0x${type.toString(16)} (크기를 몰라 이어 읽을 수 없다)`);
  }
}

function readProperties(
  cursor: AsepriteCursor,
  ctx: AsepriteChunkContext,
  count: number,
  depth: number,
  budget: PropertyBudget,
): AsepriteUserProperty[] {
  const properties: AsepriteUserProperty[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = readString(cursor, ctx, "userData.property.name");
    const type = cursor.u16();
    properties.push({ name, value: readPropertyValue(cursor, ctx, type, depth, budget) });
  }
  return properties;
}

export function decodeUserDataChunk(cursor: AsepriteCursor, ctx: AsepriteChunkContext): AsepriteUserDataChunk {
  const flags = cursor.u32();
  const text = (flags & 1) !== 0 ? readString(cursor, ctx, "userData.text") : null;
  const color = (flags & 2) !== 0 ? { r: cursor.u8(), g: cursor.u8(), b: cursor.u8(), a: cursor.u8() } : null;
  let propertyMaps: AsepriteUserPropertyMap[] | null = null;
  let propertiesError: string | null = null;
  if ((flags & 4) !== 0) {
    try {
      const total = cursor.u32();
      if (total < 8) throw new AsepriteChunkReadError(`속성 블록 크기 ${total}가 최소값 8보다 작다`);
      const mapCount = cursor.u32();
      ensureCount(mapCount, 8, cursor, "속성 맵");
      const budget: PropertyBudget = { remaining: ctx.limits.maxUserDataValues };
      const maps: AsepriteUserPropertyMap[] = [];
      for (let i = 0; i < mapCount; i += 1) {
        const key = cursor.u32();
        const count = cursor.u32();
        ensureCount(count, 4, cursor, "속성");
        maps.push({ key, properties: readProperties(cursor, ctx, count, 1, budget) });
      }
      propertyMaps = maps;
    } catch (error) {
      if (!(error instanceof AsepriteChunkReadError)) throw error;
      propertiesError = error.message;
    }
  }
  return { flags, text, color, propertyMaps, propertiesError };
}

export function bytesPerPixelForDepth(depth: number): 1 | 2 | 4 {
  if (depth === 8) return 1;
  if (depth === 16) return 2;
  if (depth === 32) return 4;
  throw new AsepriteChunkReadError(PIXEL_BYTES_ERROR);
}
