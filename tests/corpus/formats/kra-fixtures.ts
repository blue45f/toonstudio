/**
 * @file kra-fixtures.ts
 * @description Krita `.kra` 읽기 코덱의 합성 픽스처 빌더: LZF 압축기(테스트 전용), 타일 파일, `maindoc.xml`, ZIP.
 *
 * 형식은 Krita 5.2.2가 저장한 파일을 관찰한 사실에 맞췄다(`docs/design/krita-kra-reader-observed-2026-10-29.md`).
 * 실제 파일은 저장소에 넣지 않으므로 실제 압축기의 출력은 `kra-real-tile-vectors.ts`의 알려진 정답 벡터가 맡는다.
 */

import { buildFormatZipFixture, type ZipFixtureEntry } from "./krita-bundle-fixtures";

const encoder = new TextEncoder();

export const KRA_PIXEL_BYTES: Readonly<Record<string, number>> = Object.freeze({
  RGBA: 4,
  RGBA16: 8,
  GRAYA: 2,
  GRAYAU16: 4,
  RGBAF16: 8,
  RGBAF32: 16,
  GRAYAF16: 4,
  GRAYAF32: 8,
});

// ---------------------------------------------------------------------------
// 실수 샘플 (시험용 독립 구현: 리더의 halfFloatToNumber와 코드를 공유하지 않는다)
// ---------------------------------------------------------------------------

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest < 0.5) return floor;
  if (rest > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** 수를 IEEE 754 binary16 비트로 바꾼다(가장 가까운 짝수로 반올림, 범위를 넘으면 무한대). */
export function halfFloatBits(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const magnitude = Math.abs(value);
  if (magnitude === Number.POSITIVE_INFINITY) return sign | 0x7c00;
  if (magnitude === 0) return sign;
  if (magnitude < 2 ** -14) return sign | roundHalfEven(magnitude * 2 ** 24); // 비정규 수. 올림해 1024가 되면 가장 작은 정규 수의 비트와 같다
  let exponent = Math.floor(Math.log2(magnitude));
  if (2 ** exponent > magnitude) exponent -= 1;
  if (2 ** (exponent + 1) <= magnitude) exponent += 1;
  let mantissa = roundHalfEven((magnitude / 2 ** exponent - 1) * 1024);
  if (mantissa === 1024) {
    mantissa = 0;
    exponent += 1;
  }
  if (exponent > 15) return sign | 0x7c00;
  return sign | ((exponent + 15) << 10) | mantissa;
}

/** 샘플 하나의 리틀 엔디언 바이트: 2바이트면 반정밀도, 4바이트면 단정밀도다. */
export function floatSampleBytes(value: number, bytes: 2 | 4): number[] {
  if (bytes === 2) {
    const bits = halfFloatBits(value);
    return [bits & 0xff, bits >> 8];
  }
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

/** 실수 형식의 네이티브 픽셀 바이트: RGBA는 R, G, B, A 순서, 회색은 회색, 알파 순서의 샘플이다(정수 형식의 B, G, R, A와 다르다). */
export function kraNativeFloat(colorSpace: string, channels: readonly number[]): number[] {
  const bytes = colorSpace.endsWith("F16") ? 2 : 4;
  return channels.flatMap((value) => floatSampleBytes(value, bytes));
}

// ---------------------------------------------------------------------------
// 타일 픽셀
// ---------------------------------------------------------------------------

/** 픽셀 함수로 타일 하나(픽셀을 이어 붙인 네이티브 배치)를 만든다. */
export function tilePixels(
  pixelBytes: number,
  pixel: (x: number, y: number) => readonly number[],
  width = 64,
  height = 64,
): Uint8Array {
  const out = new Uint8Array(width * height * pixelBytes);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      if (value.length !== pixelBytes) throw new Error(`픽셀 ${value.length}바이트가 ${pixelBytes}바이트와 다르다`);
      out.set(value, (y * width + x) * pixelBytes);
    }
  }
  return out;
}

export function solidTile(native: readonly number[], width = 64, height = 64): Uint8Array {
  return tilePixels(native.length, () => native, width, height);
}

/** 픽셀마다 값이 달라 채널·행·열 순서를 가리는 결정적 패턴. */
export function patternTile(pixelBytes: number, seed: number, width = 64, height = 64): Uint8Array {
  return tilePixels(
    pixelBytes,
    (x, y) => Array.from({ length: pixelBytes }, (_, channel) => (x * (37 + 2 * channel) + y * (11 + 3 * channel) + seed * 17 + channel * 53) & 0xff),
    width,
    height,
  );
}

/** 압축이 거의 안 되는 결정적 잡음. */
export function noiseTile(pixelBytes: number, seed: number, width = 64, height = 64): Uint8Array {
  const out = new Uint8Array(width * height * pixelBytes);
  let state = (seed * 2_654_435_761 + 1) >>> 0;
  for (let index = 0; index < out.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    out[index] = state >>> 24;
  }
  return out;
}

/** 네이티브(픽셀을 이어 붙인) 배치 → 바이트 평면 배치. */
export function planarize(interleaved: Uint8Array, pixelBytes: number): Uint8Array {
  const pixels = interleaved.byteLength / pixelBytes;
  const planar = new Uint8Array(interleaved.byteLength);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    for (let byte = 0; byte < pixelBytes; byte += 1) planar[byte * pixels + pixel] = interleaved[pixel * pixelBytes + byte]!;
  }
  return planar;
}

// ---------------------------------------------------------------------------
// LZF (테스트 전용 압축기: 리터럴과 앞쪽 참조를 모두 만든다)
// ---------------------------------------------------------------------------

export function lzfCompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  const last = new Map<number, number>();
  let literalStart = 0;
  const flushLiterals = (end: number): void => {
    while (literalStart < end) {
      const run = Math.min(32, end - literalStart);
      out.push(run - 1);
      for (let offset = 0; offset < run; offset += 1) out.push(input[literalStart + offset]!);
      literalStart += run;
    }
  };
  let position = 0;
  while (position + 2 < input.length) {
    const key = input[position]! | (input[position + 1]! << 8) | (input[position + 2]! << 16);
    const candidate = last.get(key);
    last.set(key, position);
    if (candidate !== undefined && position - candidate <= 8192) {
      let length = 3;
      const limit = Math.min(264, input.length - position);
      while (length < limit && input[candidate + length] === input[position + length]) length += 1;
      flushLiterals(position);
      const distance = position - candidate - 1;
      const stored = length - 2;
      if (stored < 7) {
        out.push((stored << 5) | (distance >> 8));
      } else {
        out.push((7 << 5) | (distance >> 8), stored - 7);
      }
      out.push(distance & 0xff);
      position += length;
      literalStart = position;
    } else {
      position += 1;
    }
  }
  flushLiterals(input.length);
  return Uint8Array.from(out);
}

/**
 * 타일 페이로드: 첫 바이트가 플래그다. 1이면 평면 배치를 LZF로 압축한 스트림, 0이면 압축하지 않은 원본(픽셀을 이어
 * 붙인 배치). `auto`는 Krita처럼 압축이 이득일 때만 LZF를 쓴다.
 */
export function kraTilePayload(interleaved: Uint8Array, pixelBytes: number, mode: "auto" | "lzf" | "raw" = "auto"): Uint8Array {
  const compressed = lzfCompress(planarize(interleaved, pixelBytes));
  const useRaw = mode === "raw" || (mode === "auto" && compressed.byteLength >= interleaved.byteLength);
  const body = useRaw ? interleaved : compressed;
  const out = new Uint8Array(1 + body.byteLength);
  out[0] = useRaw ? 0 : 1;
  out.set(body, 1);
  return out;
}

// ---------------------------------------------------------------------------
// 타일 파일
// ---------------------------------------------------------------------------

export interface KraFixtureTile {
  readonly x: number;
  readonly y: number;
  readonly payload: Uint8Array;
  readonly compression?: string;
}

export interface KraTileFileOptions {
  readonly pixelBytes: number;
  readonly tiles: readonly KraFixtureTile[];
  readonly tileWidth?: number;
  readonly tileHeight?: number;
  readonly version?: number;
  /** 헤더의 `DATA` 값(생략하면 타일 수). */
  readonly declaredCount?: number;
  /** 마지막 타일 뒤에 붙일 바이트. */
  readonly trailing?: Uint8Array;
  /** 헤더 줄 전체를 대체한다(잘못된 헤더 실험용). */
  readonly headerOverride?: string;
}

export function buildKraTileFile(options: KraTileFileOptions): Uint8Array {
  const header =
    options.headerOverride ??
    [
      `VERSION ${options.version ?? 2}`,
      `TILEWIDTH ${options.tileWidth ?? 64}`,
      `TILEHEIGHT ${options.tileHeight ?? 64}`,
      `PIXELSIZE ${options.pixelBytes}`,
      `DATA ${options.declaredCount ?? options.tiles.length}`,
    ].join("\n") + "\n";
  const parts: Uint8Array[] = [encoder.encode(header)];
  for (const tile of options.tiles) {
    parts.push(encoder.encode(`${tile.x},${tile.y},${tile.compression ?? "LZF"},${tile.payload.byteLength}\n`), tile.payload);
  }
  if (options.trailing !== undefined) parts.push(options.trailing);
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export interface KraMaskTile {
  /** 마스크 로컬 픽셀 좌표(64의 배수). */
  readonly x: number;
  readonly y: number;
  /** 타일의 값 4096개(행 우선)나 (타일 안 x, y) → 값 함수. */
  readonly values: Uint8Array | ((x: number, y: number) => number);
}

/** 마스크 타일 파일(`PIXELSIZE 1`). 픽셀이 1바이트라 평면 배치와 픽셀 순서 배치가 같다. */
export function buildKraMaskTileFile(tiles: readonly KraMaskTile[], mode: "auto" | "lzf" | "raw" = "auto"): Uint8Array {
  return buildKraTileFile({
    pixelBytes: 1,
    tiles: tiles.map((tile) => {
      const values =
        typeof tile.values === "function"
          ? Uint8Array.from({ length: 64 * 64 }, (_, index) => (tile.values as (x: number, y: number) => number)(index % 64, Math.floor(index / 64)) & 0xff)
          : tile.values;
      return { x: tile.x, y: tile.y, payload: kraTilePayload(values, 1, mode) };
    }),
  });
}

// ---------------------------------------------------------------------------
// 문서
// ---------------------------------------------------------------------------

export interface KraFixtureMask {
  readonly nodetype: string;
  readonly name: string;
  readonly attrs?: Readonly<Record<string, string | null>>;
  /** `<filename>.pixelselection` 내용(마스크 타일 파일). 생략하면 값 항목을 만들지 않는다. */
  readonly valuesFile?: Uint8Array;
  /** `….pixelselection.defaultpixel` 내용. `valuesFile`이 있을 때 생략하면 `[0]`, null이면 항목을 만들지 않는다. */
  readonly defaultValue?: Uint8Array | null;
}

export interface KraFixtureLayer {
  readonly nodetype?: string;
  readonly name: string;
  /** 기본 속성을 덮어쓰거나(문자열) 뺀다(null). */
  readonly attrs?: Readonly<Record<string, string | null>>;
  readonly children?: readonly KraFixtureLayer[];
  readonly masks?: readonly KraFixtureMask[];
  /** 래스터 레이어의 타일 파일. 생략하면 타일 0개짜리 파일, null이면 ZIP 항목을 만들지 않는다. */
  readonly tileFile?: Uint8Array | null;
  /** `.defaultpixel` 내용. 생략하면 투명 한 픽셀, null이면 항목을 만들지 않는다. */
  readonly defaultPixel?: Uint8Array | null;
}

export interface KraFixtureOptions {
  readonly imageName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly colorSpace?: string;
  readonly profile?: string | null;
  readonly layers: readonly KraFixtureLayer[];
  /** `null`이면 mimetype 항목을 넣지 않는다. */
  readonly mimetype?: string | null;
  /** `maindoc.xml` 전체를 대체한다(적대적 XML 실험용). */
  readonly maindoc?: string;
  readonly mergedImage?: Uint8Array;
  readonly preview?: Uint8Array;
  readonly icc?: Uint8Array;
  readonly extraEntries?: readonly ZipFixtureEntry[];
  readonly kritaVersion?: string;
  /** IMAGE 요소에 덧붙일 속성(덮어쓰기). */
  readonly imageAttrs?: Readonly<Record<string, string | null>>;
  /** true면 모든 항목을 압축하지 않고 저장한다(해제가 비동기 경계를 만들지 않아 메모리 입력이 마이크로태스크로만 처리된다). */
  readonly stored?: boolean;
}

const KRITA_DOCTYPE = "<!DOCTYPE DOC PUBLIC '-//KDE//DTD krita 2.0//EN' 'http://www.calligra.org/DTD/krita-2.0.dtd'>";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function attributeText(attributes: Readonly<Record<string, string | null>>): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(" ");
}

export function kraNativeRgba(r: number, g: number, b: number, a: number): number[] {
  return [b, g, r, a];
}

export interface KraBuiltFixture {
  readonly bytes: Uint8Array;
  readonly maindoc: string;
  readonly entries: readonly ZipFixtureEntry[];
}

export function buildKraFixtureDetailed(options: KraFixtureOptions): KraBuiltFixture {
  const imageName = options.imageName ?? "doc";
  const colorSpace = options.colorSpace ?? "RGBA";
  const pixelBytes = KRA_PIXEL_BYTES[colorSpace] ?? 4;
  const layerEntries: ZipFixtureEntry[] = [];
  let nextFile = 2;

  const nodeXml = (layer: KraFixtureLayer, indent: string): string => {
    const nodetype = layer.nodetype ?? "paintlayer";
    const number = nextFile;
    nextFile += 1;
    const filename = `layer${number}`;
    const defaults: Record<string, string | null> = {
      ...(nodetype === "paintlayer" ? { colorspacename: colorSpace, channellockflags: "", onionskin: "0" } : {}),
      channelflags: "",
      uuid: `{00000000-0000-4000-8000-${String(number).padStart(12, "0")}}`,
      nodetype,
      visible: "1",
      x: "0",
      y: "0",
      locked: "0",
      collapsed: "0",
      ...(nodetype === "grouplayer" ? { passthrough: "0" } : {}),
      name: layer.name,
      compositeop: "normal",
      intimeline: "0",
      filename,
      colorlabel: "0",
      opacity: "255",
    };
    const attributes = { ...defaults, ...layer.attrs };
    const dataName = attributes["filename"] ?? filename;
    if (nodetype === "paintlayer") {
      if (layer.tileFile !== null) {
        layerEntries.push({
          path: `${imageName}/layers/${dataName}`,
          data: layer.tileFile ?? buildKraTileFile({ pixelBytes, tiles: [] }),
          method: 8,
        });
      }
      if (layer.defaultPixel !== null) {
        layerEntries.push({
          path: `${imageName}/layers/${dataName}.defaultpixel`,
          data: layer.defaultPixel ?? new Uint8Array(pixelBytes),
          method: 8,
        });
      }
    }
    const inner: string[] = [];
    if (layer.children !== undefined && layer.children.length > 0) {
      inner.push(`${indent} <layers>`, ...layer.children.map((child) => nodeXml(child, `${indent}  `)), `${indent} </layers>`);
    }
    if (layer.masks !== undefined && layer.masks.length > 0) {
      const masks = layer.masks.map((mask) => {
        const maskNumber = nextFile;
        nextFile += 1;
        const attributes: Record<string, string | null> = {
          x: "0",
          y: "0",
          intimeline: "0",
          name: mask.name,
          locked: "0",
          visible: "1",
          nodetype: mask.nodetype,
          colorlabel: "0",
          filename: `mask${maskNumber}`,
          uuid: `{00000000-0000-4000-8000-${String(maskNumber).padStart(12, "0")}}`,
          ...mask.attrs,
        };
        if (mask.valuesFile !== undefined) {
          const dataName = attributes["filename"] ?? `mask${maskNumber}`;
          layerEntries.push({ path: `${imageName}/layers/${dataName}.pixelselection`, data: mask.valuesFile, method: 8 });
          if (mask.defaultValue !== null) {
            layerEntries.push({
              path: `${imageName}/layers/${dataName}.pixelselection.defaultpixel`,
              data: mask.defaultValue ?? Uint8Array.of(0),
              method: 8,
            });
          }
        }
        return `${indent}  <mask ${attributeText(attributes)}/>`;
      });
      inner.push(`${indent} <masks>`, ...masks, `${indent} </masks>`);
    }
    return inner.length === 0
      ? `${indent}<layer ${attributeText(attributes)}/>`
      : [`${indent}<layer ${attributeText(attributes)}>`, ...inner, `${indent}</layer>`].join("\n");
  };

  const layersXml = options.layers.map((layer) => nodeXml(layer, "   ")).join("\n");
  const imageAttributes = attributeText({
    colorspacename: colorSpace,
    height: String(options.height ?? 48),
    profile: options.profile === undefined ? "sRGB-elle-V2-srgbtrc.icc" : options.profile,
    "y-res": "72",
    name: imageName,
    width: String(options.width ?? 64),
    mime: "application/x-kra",
    "x-res": "72",
    description: "",
    ...options.imageAttrs,
  });
  const maindoc =
    options.maindoc ??
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      KRITA_DOCTYPE,
      `<DOC xmlns="http://www.calligra.org/DTD/krita" kritaVersion="${options.kritaVersion ?? "5.2.2"}" syntaxVersion="2.0" editor="Krita">`,
      ` <IMAGE ${imageAttributes}>`,
      "  <layers>",
      layersXml,
      "  </layers>",
      " </IMAGE>",
      "</DOC>",
      "",
    ].join("\n");

  const entries: ZipFixtureEntry[] = [];
  if (options.mimetype !== null) entries.push({ path: "mimetype", data: encoder.encode(options.mimetype ?? "application/x-krita"), method: 0 });
  entries.push({ path: "maindoc.xml", data: encoder.encode(maindoc), method: 8 });
  entries.push({ path: "documentinfo.xml", data: encoder.encode("<document-info/>"), method: 8 });
  if (options.preview !== undefined) entries.push({ path: "preview.png", data: options.preview, method: 8 });
  entries.push(...layerEntries);
  if (options.icc !== undefined) entries.push({ path: `${imageName}/annotations/icc`, data: options.icc, method: 8 });
  if (options.mergedImage !== undefined) entries.push({ path: "mergedimage.png", data: options.mergedImage, method: 8 });
  entries.push(...(options.extraEntries ?? []));
  const finalEntries = options.stored === true ? entries.map((entry) => ({ ...entry, method: 0 as const })) : entries;
  return { bytes: buildFormatZipFixture(finalEntries), maindoc, entries: finalEntries };
}

export function buildKraFixture(options: KraFixtureOptions): Uint8Array {
  return buildKraFixtureDetailed(options).bytes;
}

/** PNG 서명으로 시작하는 가짜 PNG(서명만 검사하는 코드용). */
export function fakePng(extra = 16): Uint8Array {
  const out = new Uint8Array(8 + extra);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let index = 8; index < out.length; index += 1) out[index] = index & 0xff;
  return out;
}
