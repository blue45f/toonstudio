import { decode, encodeJpeg, encodePng } from "image-js";
import { describe, expect, it } from "vitest";

import {
  IEND_CHUNK,
  adam7Rows,
  idatChunk,
  ihdrChunk,
  pngChunk,
  pngFile,
  rawRows,
  splitIdatChunks,
  type PixelSource,
} from "../../../test/cover-image-fixtures";
import { transcodeCoverToWidth } from "./cover-transcode";

// 정상 PNG 의 변환 결과가 방어(청크 재조립)를 넣기 전과 같은지 본다. 기준은 방어 없이 image-js 로 곧바로 디코드→리사이즈→
// 인코드하는 원래 경로다. 색 유형·비트 깊이·인터레이스·보조 청크 조합마다 바이트 단위로 비교한다.
// image-js(fast-png)가 원래부터 풀지 못하는 조합(2·4비트 회색, 낮은 깊이의 Adam7 등)은 기준도 null 이라 둘 다 null 이어야 한다.

const TARGET_WIDTH = 32;
const JPEG_QUALITY = 82;

function referenceTranscode(body: Buffer) {
  let image: ReturnType<typeof decode>;
  try {
    image = decode(body);
  } catch {
    return null;
  }
  if (image.width <= TARGET_WIDTH) return null;
  const resized = image.resize({ width: TARGET_WIDTH });
  let transparent = false;
  if (image.alpha) {
    for (let pixel = 0; pixel < image.size; pixel += 1) {
      if (image.getValueByIndex(pixel, image.channels - 1) < 255) {
        transparent = true;
        break;
      }
    }
  }
  return transparent
    ? { body: Buffer.from(encodePng(resized)), contentType: "image/png", width: resized.width, height: resized.height }
    : {
        body: Buffer.from(encodeJpeg(resized, { quality: JPEG_QUALITY })),
        contentType: "image/jpeg",
        width: resized.width,
        height: resized.height,
      };
}

interface Format {
  readonly name: string;
  readonly colorType: number;
  readonly depth: number;
  readonly channels: number;
}

const FORMATS: readonly Format[] = [
  ...[1, 2, 4, 8, 16].map((depth) => ({ name: `회색 ${depth}비트`, colorType: 0, depth, channels: 1 })),
  ...[8, 16].map((depth) => ({ name: `트루컬러 ${depth}비트`, colorType: 2, depth, channels: 3 })),
  ...[1, 2, 4, 8].map((depth) => ({ name: `팔레트 ${depth}비트`, colorType: 3, depth, channels: 1 })),
  ...[8, 16].map((depth) => ({ name: `회색+알파 ${depth}비트`, colorType: 4, depth, channels: 2 })),
  ...[8, 16].map((depth) => ({ name: `RGBA ${depth}비트`, colorType: 6, depth, channels: 4 })),
];

/** 화소마다 값이 달라지는 결정적 화소. alpha 가 "varying" 이면 알파 채널의 일부를 투명하게 한다. */
function pixelSource(format: Format, alpha: "varying" | "opaque"): PixelSource {
  const bytesPerChannel = format.depth === 16 ? 2 : 1;
  return (x, y) => {
    if (format.depth < 8) return [(x * 3 + y * 5 + ((x * y) % 7)) % (1 << format.depth)];
    const bytes: number[] = [];
    for (let channel = 0; channel < format.channels; channel += 1) {
      const isAlpha = (format.colorType === 4 && channel === 1) || (format.colorType === 6 && channel === 3);
      let value = (x * 31 + y * 17 + channel * 53 + ((x * y) % 11) * 9) & 0xff;
      if (isAlpha) value = alpha === "opaque" ? 255 : (x + y) % 5 === 0 ? 0 : 200 + ((x * 7) % 56);
      for (let byte = 0; byte < bytesPerChannel; byte += 1) bytes.push(byte === 0 ? value : (value * 3 + x) & 0xff);
    }
    return bytes;
  };
}

const ANCILLARY: readonly Buffer[] = [
  pngChunk("gAMA", Buffer.from([0, 1, 0x86, 0xa0])),
  pngChunk("cHRM", Buffer.alloc(32, 7)),
  pngChunk("sRGB", Buffer.from([0])),
  pngChunk("iCCP", Buffer.concat([Buffer.from("icc\0", "latin1"), Buffer.from([0, 0x78, 0x9c, 0x03, 0, 0, 0, 0, 1])])),
  pngChunk("tEXt", Buffer.from("Software\0equivalence", "latin1")),
  pngChunk("pHYs", Buffer.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])),
  pngChunk("tIME", Buffer.from([0x07, 0xea, 10, 16, 12, 0, 0])),
  pngChunk("sBIT", Buffer.alloc(1, 8)),
  pngChunk("eXIf", Buffer.alloc(16)),
];

interface Shape {
  readonly width: number;
  readonly height: number;
  readonly interlace: 0 | 1;
  readonly ancillary: boolean;
  readonly alpha: "varying" | "opaque";
  readonly transparentPalette?: boolean;
  /** IDAT 를 빈 조각 포함 여러 청크로 쪼갠다(재조립이 하나로 합치는 경로). */
  readonly splitIdat?: boolean;
}

function buildPng(format: Format, shape: Shape): Buffer {
  const { width, height, interlace } = shape;
  const source = pixelSource(format, shape.alpha);
  const raw = interlace === 1 ? adam7Rows(width, height, format.depth, source) : rawRows(width, height, format.depth, source);
  const palette: Buffer[] = [];
  if (format.colorType === 3) {
    const entries = 1 << format.depth;
    const colors = Buffer.alloc(entries * 3);
    for (let index = 0; index < entries; index += 1) {
      colors[index * 3] = (index * 47 + 11) & 0xff;
      colors[index * 3 + 1] = (index * 29 + 90) & 0xff;
      colors[index * 3 + 2] = (index * 13 + 200) & 0xff;
    }
    palette.push(pngChunk("PLTE", colors));
    if (shape.transparentPalette) {
      palette.push(pngChunk("tRNS", Buffer.from(Array.from({ length: entries }, (_, index) => (index % 2 === 0 ? 0 : 255)))));
    }
  }
  return pngFile(
    ihdrChunk({ width, height, bitDepth: format.depth, colorType: format.colorType, interlace }),
    ...(shape.ancillary ? ANCILLARY : []),
    ...palette,
    ...(shape.splitIdat ? splitIdatChunks(raw, 4) : [idatChunk(raw)]),
    IEND_CHUNK,
  );
}

const SHAPES: readonly Shape[] = [
  { interlace: 0, ancillary: false, width: 64, height: 48, alpha: "varying" },
  { interlace: 0, ancillary: true, width: 61, height: 37, alpha: "varying" },
  { interlace: 1, ancillary: false, width: 64, height: 48, alpha: "varying" },
  { interlace: 1, ancillary: true, width: 61, height: 37, alpha: "varying" },
  { interlace: 0, ancillary: true, width: 64, height: 48, alpha: "opaque" },
  { interlace: 0, ancillary: false, width: 61, height: 37, alpha: "varying", splitIdat: true },
  { interlace: 1, ancillary: true, width: 64, height: 48, alpha: "varying", splitIdat: true },
];

const CORPUS = FORMATS.flatMap((format) =>
  SHAPES.map((shape) => ({
    name: `${format.name} / 인터레이스 ${shape.interlace} / 보조 청크 ${shape.ancillary ? "있음" : "없음"} / ${shape.width}x${shape.height} / 알파 ${shape.alpha}${shape.splitIdat ? " / IDAT 쪼갬" : ""}`,
    png: buildPng(format, shape),
  })),
);

describe("정상 PNG 의 변환 결과는 청크 재조립 이전과 바이트까지 같다", () => {
  it.each(CORPUS)("$name", ({ png }) => {
    const expected = referenceTranscode(png);
    const actual = transcodeCoverToWidth(png, "image/png", TARGET_WIDTH);
    if (expected === null) {
      expect(actual).toBeNull();
      return;
    }
    expect(actual).toMatchObject({ contentType: expected.contentType, width: expected.width, height: expected.height });
    expect(actual!.body.equals(expected.body)).toBe(true);
  });

  it("기준 경로가 풀 수 있는 조합이 말뭉치의 대부분이다(둘 다 null 인 비교로 시험이 비지 않았다)", () => {
    const decodable = CORPUS.filter(({ png }) => referenceTranscode(png) !== null);
    expect(decodable.length).toBeGreaterThanOrEqual(50);
    expect(new Set(decodable.map(({ png }) => transcodeCoverToWidth(png, "image/png", TARGET_WIDTH)?.contentType))).toEqual(
      new Set(["image/jpeg", "image/png"]),
    );
  });

  it("알파가 모두 불투명이면 JPEG, 투명 화소가 있으면 PNG 로 낸다(판정도 같다)", () => {
    const rgba = FORMATS.find((format) => format.colorType === 6 && format.depth === 8)!;
    const base = { width: 64, height: 48, interlace: 0 as const, ancillary: true };
    expect(transcodeCoverToWidth(buildPng(rgba, { ...base, alpha: "opaque" }), "image/png", TARGET_WIDTH)?.contentType).toBe("image/jpeg");
    expect(transcodeCoverToWidth(buildPng(rgba, { ...base, alpha: "varying" }), "image/png", TARGET_WIDTH)?.contentType).toBe("image/png");
  });

  it("팔레트의 tRNS 투명도는 보존되어 PNG 로 나온다", () => {
    const palette = FORMATS.find((format) => format.colorType === 3 && format.depth === 8)!;
    const png = buildPng(palette, { width: 64, height: 48, interlace: 0, ancillary: true, alpha: "opaque", transparentPalette: true });
    const expected = referenceTranscode(png);
    const actual = transcodeCoverToWidth(png, "image/png", TARGET_WIDTH);
    expect(actual?.contentType).toBe("image/png");
    expect(actual!.body.equals(expected!.body)).toBe(true);
  });

  it("변환된 PNG 출력에는 색 프로파일·감마 같은 보조 청크가 없다(입력에 있어도 원래부터 출력에 쓰지 않던 정보다)", () => {
    const rgba = FORMATS.find((format) => format.colorType === 6 && format.depth === 8)!;
    const result = transcodeCoverToWidth(
      buildPng(rgba, { width: 64, height: 48, interlace: 0, ancillary: true, alpha: "varying" }),
      "image/png",
      TARGET_WIDTH,
    );
    expect(result?.contentType).toBe("image/png");
    for (const type of ["iCCP", "gAMA", "cHRM", "sRGB", "pHYs", "tEXt"]) {
      expect(result!.body.includes(Buffer.from(type))).toBe(false);
    }
  });
});
