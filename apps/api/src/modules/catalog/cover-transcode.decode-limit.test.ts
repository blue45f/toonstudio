import { deflateSync } from "node:zlib";

import { Image, encode, encodePng } from "image-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IEND_CHUNK,
  JPEG_EOI,
  JPEG_SOI,
  concatBytes,
  ihdrChunk,
  inflatingIccpChunk,
  jpegSof,
  jpegSos,
  pngChunk,
  pngChunkTypes,
  pngFile,
  withoutEoi,
  zeroRunIdat,
} from "../../../test/cover-image-fixtures";
import { COVER_JPEG_SAMPLES } from "../../../test/cover-jpeg-samples";
import { COVER_MAX_DECODE_RAW_BYTES, transcodeCoverToWidth } from "./cover-transcode";

// 디코드 호출 여부가 핵심 계약이라 image-js 의 decode 를 실제 구현 그대로 감싸서 호출만 센다.
const { decodeSpy } = vi.hoisted(() => ({ decodeSpy: vi.fn() }));
vi.mock("image-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("image-js")>();
  decodeSpy.mockImplementation(actual.decode);
  return { ...actual, decode: decodeSpy };
});
// JPEG 는 image-js 가 아니라 jpeg-js 를 한도와 함께 직접 부른다. 호출과 옵션을 세고, 실제 구현은 따로 꺼내 둔다
// (사전 검사를 비껴간 입력을 한도만으로 막는지 시험할 때 실제 jpeg-js 에 같은 옵션을 준다).
const { jpegDecodeSpy, actualJpegDecode } = vi.hoisted(() => ({
  jpegDecodeSpy: vi.fn(),
  actualJpegDecode: { current: undefined as undefined | ((data: Uint8Array, options: object) => unknown) },
}));
vi.mock("jpeg-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jpeg-js")>();
  actualJpegDecode.current = actual.decode as (data: Uint8Array, options: object) => unknown;
  jpegDecodeSpy.mockImplementation(actual.decode);
  return { ...actual, decode: jpegDecodeSpy };
});

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

interface HandmadePng {
  readonly width: number;
  readonly height: number;
  readonly bitDepth?: number;
  readonly colorType?: number;
  readonly interlace?: number;
  /** IDAT 로 압축해 넣을 원본 바이트(필터 바이트 포함). */
  readonly raw: Buffer;
  readonly extraChunks?: readonly Buffer[];
}

/** 헤더·CRC 가 모두 정상인 PNG 를 손으로 만든다. IDAT 의 팽창 크기를 선언과 다르게 조절하려고 쓴다. */
function handmadePng({ width, height, bitDepth = 8, colorType = 0, interlace = 0, raw, extraChunks = [] }: HandmadePng): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[12] = interlace;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extraChunks,
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 1비트 회색 PNG: 4000x4000 이어도 압축 해제 크기가 약 2MB 라 시험이 가볍다. */
function bilevelPng(width: number, height: number): Buffer {
  return handmadePng({ width, height, bitDepth: 1, colorType: 0, raw: Buffer.alloc(height * (1 + Math.ceil(width / 8))) });
}

function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8; // 비트 깊이
  header[25] = 6; // RGBA
  return header;
}

function jpegHeader(width: number, height: number, marker = 0xc0): Buffer {
  const header = Buffer.alloc(2 + 2 + 17);
  header[0] = 0xff;
  header[1] = 0xd8;
  header[2] = 0xff;
  header[3] = marker;
  header.writeUInt16BE(17, 4);
  header[6] = 8;
  header.writeUInt16BE(height, 7);
  header.writeUInt16BE(width, 9);
  header[11] = 3;
  return header;
}

function realImage(width: number, height: number): Image {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = index % 251;
    data[index + 1] = (index >> 2) % 241;
    data[index + 2] = 90;
    data[index + 3] = 255;
  }
  return new Image(width, height, { data, colorModel: "RGBA" });
}

describe("transcodeCoverToWidth 디코드 크기 상한(이미지 폭탄 방어)", () => {
  beforeEach(() => {
    decodeSpy.mockClear();
    jpegDecodeSpy.mockClear();
  });

  it("작은 파일이 거대한 픽셀로 풀리는 PNG 는 디코드하지 않고 null 을 돌려준다", () => {
    // 40000x40000 RGBA 는 디코드하면 6GB 를 할당한다. 헤더만 보고 거절해야 한다.
    expect(transcodeCoverToWidth(pngHeader(40_000, 40_000), "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["기본(SOF0)", 0xc0],
    ["프로그레시브(SOF2)", 0xc2],
  ])("거대한 크기를 선언한 %s JPEG 도 디코드하지 않는다", (_label, marker) => {
    expect(transcodeCoverToWidth(jpegHeader(30_000, 30_000, marker), "image/jpeg", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
    expect(jpegDecodeSpy).not.toHaveBeenCalled();
  });

  it("상한(1600만 화소) 이하의 정상 이미지는 그대로 변환한다", () => {
    const png = Buffer.from(encodePng(realImage(640, 960)));
    const jpeg = Buffer.from(encode(realImage(800, 1200), { format: "jpeg" }));
    expect(transcodeCoverToWidth(png, "image/png", 160)?.width).toBe(160);
    expect(transcodeCoverToWidth(jpeg, "image/jpeg", 320)?.width).toBe(320);
    // PNG 는 image-js 로, JPEG 는 한도를 건 jpeg-js 로 디코드한다.
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(jpegDecodeSpy).toHaveBeenCalledTimes(1);
  });

  it("상한 바로 위의 선언 크기는 거절하고 바로 아래는 실제로 디코드해 변환한다", () => {
    expect(transcodeCoverToWidth(bilevelPng(4_001, 4_000), "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
    // 정확히 상한(1600만 화소)인 정상 PNG 는 변환된다.
    const atLimit = transcodeCoverToWidth(bilevelPng(4_000, 4_000), "image/png", 320);
    expect(atLimit?.width).toBe(320);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  it("IDAT 가 없는 PNG 는 크기가 상한 이하여도 디코드하지 않는다", () => {
    expect(transcodeCoverToWidth(pngHeader(4_000, 4_000), "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it("헤더에서 크기를 읽을 수 없으면 디코드하지 않는다", () => {
    const jpegWithoutFrame = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    expect(transcodeCoverToWidth(jpegWithoutFrame, "image/jpeg", 320)).toBeNull();
    expect(transcodeCoverToWidth(Buffer.from("not an image at all, just text"), "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
    expect(jpegDecodeSpy).not.toHaveBeenCalled();
  });
});

describe("transcodeCoverToWidth 형식 위장·팽창 우회 방어", () => {
  beforeEach(() => {
    decodeSpy.mockClear();
    jpegDecodeSpy.mockClear();
  });

  it("TIFF 에 PNG 라벨과 가짜 IHDR(1x1)을 붙여도 서명이 PNG·JPEG 가 아니면 디코드하지 않는다", () => {
    // 리뷰가 실측한 우회: 12~23바이트에 IHDR 1x1 을 심은 TIFF(실제 4100x4100)가 선언 크기 검사를 통과했다.
    const tiff = Buffer.alloc(64);
    tiff.write("II", 0, "ascii");
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(32, 4);
    tiff.writeUInt32BE(13, 8);
    tiff.write("IHDR", 12, "ascii");
    tiff.writeUInt32BE(1, 16);
    tiff.writeUInt32BE(1, 20);
    tiff[24] = 8;
    tiff[25] = 6;
    expect(transcodeCoverToWidth(tiff, "image/png", 320)).toBeNull();
    expect(transcodeCoverToWidth(tiff, "image/jpeg", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it("선언은 1x1 인데 IDAT 가 그보다 훨씬 크게 풀리는 PNG 는 디코드하지 않는다", () => {
    // 선언 1x1 8비트 회색의 압축 해제 크기는 2바이트다. 8MB 로 팽창하면 상한을 넘으므로 거절한다.
    const bomb = handmadePng({ width: 1, height: 1, raw: Buffer.alloc(8 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(transcodeCoverToWidth(bomb, "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it("선언한 크기대로 풀리는 정직한 PNG 는 팽창 검사를 통과해 변환된다", () => {
    const honest = Buffer.from(encodePng(realImage(640, 960)));
    expect(transcodeCoverToWidth(honest, "image/png", 160)?.width).toBe(160);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  it("압축 해제 후 크기가 상한을 넘는 선언은 IDAT 를 풀어 보기 전에 거절한다", () => {
    // 16비트 RGB 3500x3500 은 화소 수(1225만)는 통과하지만 압축 해제 크기가 약 73.5MB 라 상한(64MiB)을 넘는다.
    // IDAT 는 실제로 그 크기로 풀리는 정상 스트림이다(헤더만 있는 가짜는 IDAT 부재로도 거절돼 상한을 증명하지 못한다).
    const raw = 3_500 * (1 + 3_500 * 6);
    expect(raw).toBeGreaterThan(COVER_MAX_DECODE_RAW_BYTES);
    const png = pngFile(
      ihdrChunk({ width: 3_500, height: 3_500, bitDepth: 16, colorType: 2 }),
      zeroRunIdat(raw),
      IEND_CHUNK,
    );
    expect(png.length).toBeLessThan(256 * 1024);
    expect(transcodeCoverToWidth(png, "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it("IHDR 이 둘인 PNG 는 변환하지 않는다(디코더가 마지막 IHDR 로 푸는 화소 상한 우회)", () => {
    // 첫 IHDR(2000x2000 RGBA8, 압축 해제 상한 16MB)로 사전 검사를 통과하고, 마지막 IHDR(6000x6000 1비트 = 3600만
    // 화소, 압축 해제 4.5MB)이 디코드 크기를 정한다. 실제 공격은 5.1억 화소였고 같은 구조를 가볍게 줄인 입력이다.
    const raw = 6_000 * (1 + 6_000 / 8);
    const bomb = pngFile(
      ihdrChunk({ width: 2_000, height: 2_000, bitDepth: 8, colorType: 6 }),
      ihdrChunk({ width: 6_000, height: 6_000, bitDepth: 1, colorType: 0 }),
      zeroRunIdat(raw),
      IEND_CHUNK,
    );
    expect(transcodeCoverToWidth(bomb, "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it("빈 청크를 수십만 개 끼운 PNG 도 디코더에는 IHDR·IDAT·IEND 세 청크짜리 PNG 가 넘어가고 결과는 같다", () => {
    // 실제 입력은 빈 IDAT 80만 개로 채운 9.6MB 파일이었고 디코더가 IDAT 마다 inflate 를 따로 밀어 넣어 4.5초가 걸렸다.
    const clean = Buffer.from(encodePng(realImage(640, 960)));
    const empty = pngChunk("IDAT");
    const idatAt = clean.indexOf(Buffer.from("IDAT")) - 4;
    const crowded = Buffer.concat([
      clean.subarray(0, idatAt),
      Buffer.concat(Array.from({ length: 200_000 }, () => empty)),
      clean.subarray(idatAt),
    ]);
    expect(crowded.length).toBeGreaterThan(2_400_000);
    const expected = transcodeCoverToWidth(clean, "image/png", 160);
    decodeSpy.mockClear();

    const result = transcodeCoverToWidth(crowded, "image/png", 160);

    expect(result?.body.equals(expected!.body)).toBe(true);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    const decoded = Buffer.from(decodeSpy.mock.calls[0]![0] as Uint8Array);
    expect(pngChunkTypes(decoded)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("압축 해제 후 수백 MB 로 풀리는 iCCP 가 붙은 정상 PNG 는 그 청크를 버린 PNG 로 디코드하고 결과는 같다", () => {
    // 실제 공격은 261KB 파일의 iCCP 가 256MB 로 풀렸다(디코더가 iCCP 를 상한 없이 inflate 한다). 시험은 같은 구조를
    // 8MB 로 줄였다: 디코더에 넘어간 바이트에 iCCP 가 없으면 그 inflate 는 일어나지 않는다.
    const clean = Buffer.from(encodePng(realImage(640, 960)));
    const bomb = Buffer.concat([clean.subarray(0, 33), inflatingIccpChunk(8 * 1024 * 1024), clean.subarray(33)]);
    expect(bomb.length).toBeLessThan(clean.length + 64 * 1024);

    const expected = transcodeCoverToWidth(clean, "image/png", 160);
    decodeSpy.mockClear();
    const result = transcodeCoverToWidth(bomb, "image/png", 160);

    expect(result?.width).toBe(160);
    expect(result?.body.equals(expected!.body)).toBe(true);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    const decoded = Buffer.from(decodeSpy.mock.calls[0]![0] as Uint8Array);
    expect(decoded.includes(Buffer.from("iCCP"))).toBe(false);
    expect(decoded.length).toBeLessThan(bomb.length);
  });

  it("애니메이션 PNG(acTL)와 알 수 없는 색 유형·깊이 조합은 변환하지 않는다", () => {
    const raw = Buffer.alloc(1 + 640);
    const animated = handmadePng({ width: 640, height: 1, raw, extraChunks: [chunk("acTL", Buffer.alloc(8))] });
    expect(transcodeCoverToWidth(animated, "image/png", 160)).toBeNull();
    const badDepth = handmadePng({ width: 640, height: 1, colorType: 2, bitDepth: 4, raw });
    expect(transcodeCoverToWidth(badDepth, "image/png", 160)).toBeNull();
    const badColor = handmadePng({ width: 640, height: 1, colorType: 5, raw });
    expect(transcodeCoverToWidth(badColor, "image/png", 160)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });

  it("라벨이 틀려도 서명이 PNG·JPEG 면 서명대로 변환한다(JPEG 를 PNG 라벨로 보낸 업스트림)", () => {
    const jpeg = Buffer.from(encode(realImage(800, 1200), { format: "jpeg" }));
    const result = transcodeCoverToWidth(jpeg, "image/png", 320);
    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.width).toBe(320);
  });

  it("잘린 PNG(IEND 없이 IDAT 중간에서 끊김)는 변환하지 않고 원본 중계에 맡긴다", () => {
    const honest = Buffer.from(encodePng(realImage(640, 960)));
    expect(transcodeCoverToWidth(honest.subarray(0, Math.floor(honest.length / 2)), "image/png", 160)).toBeNull();
  });
});

describe("transcodeCoverToWidth JPEG 프레임 은닉·성분 수 방어", () => {
  beforeEach(() => {
    decodeSpy.mockClear();
    jpegDecodeSpy.mockClear();
  });

  /** 디코더를 전혀 부르지 않고 거절했는지: 이전 구현은 이런 입력도 image-js 로 디코드했다(그 사이 수백 MB~수 GB 를 할당). */
  function expectRejectedBeforeDecode(jpeg: Buffer): void {
    expect(transcodeCoverToWidth(jpeg, "image/jpeg", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
    expect(jpegDecodeSpy).not.toHaveBeenCalled();
  }

  const realJpeg = (): Buffer => COVER_JPEG_SAMPLES.ycbcr420!.bytes;

  it("프레임 헤더가 둘이면 디코드하지 않는다(작은 SOF 뒤에 상한을 넘는 SOF, 이전엔 두 번째 SOF 의 블록까지 할당했다)", () => {
    // 실제 공격은 1x1 뒤 8000x8000(+1.8GB)·30000x30000(힙 OOM 으로 프로세스 종료)이었다. 같은 구조를 상한 바로 위로 줄였다.
    expectRejectedBeforeDecode(concatBytes(JPEG_SOI, jpegSof(1, 1, 3), jpegSof(4_001, 4_000, 3), JPEG_EOI));
    expectRejectedBeforeDecode(concatBytes(JPEG_SOI, jpegSof(4_001, 4_000, 3), jpegSof(1, 1, 3), JPEG_EOI));
  });

  it("FF00 으로 옛 검사기를 비껴가던 파일도 디코드하지 않는다", () => {
    const front = concatBytes(JPEG_SOI, Buffer.from([0xff, 0x00]), jpegSof(4_001, 4_000, 3));
    const skipTo = 2 + 2 + 0xffc0; // 옛 검사기는 FF00 뒤 FFC0(=65472)를 길이로 읽어 여기까지 건너뛰고 작은 SOF 를 봤다
    expectRejectedBeforeDecode(
      concatBytes(front, Buffer.alloc(skipTo - front.length, 0xff), jpegSof(1, 1, 3), JPEG_EOI),
    );
  });

  it("정상 스캔 뒤에 숨긴 두 번째 프레임 헤더도 디코드하지 않는다", () => {
    expectRejectedBeforeDecode(concatBytes(withoutEoi(realJpeg()), jpegSof(4_001, 4_000, 3), JPEG_EOI));
  });

  it.each([
    [8, 4_000, 4_000],
    [255, 4_000, 4_000],
    [5, 500, 500],
    [2, 500, 500],
  ])("성분이 %i개인 JPEG(%ix%i)는 크기가 상한 안이어도 디코드하지 않는다", (components, width, height) => {
    // 실제 공격은 4000x4000 선언에 8성분(+1.2GB)·255성분(힙 OOM)이었다. jpeg-js 의 메모리 예산만으로는 7성분 분량
    // (약 700MB)을 할당한 뒤에야 멈춘다.
    expectRejectedBeforeDecode(concatBytes(JPEG_SOI, jpegSof(width, height, components), jpegSos(components), JPEG_EOI));
  });

  it("정상 JPEG 는 image-js 의 decode 가 아니라 화소·메모리 한도를 건 jpeg-js 로 디코드한다", () => {
    const result = transcodeCoverToWidth(realJpeg(), "image/jpeg", 24);

    expect(result?.width).toBe(24);
    expect(decodeSpy).not.toHaveBeenCalled();
    expect(jpegDecodeSpy).toHaveBeenCalledTimes(1);
    expect(jpegDecodeSpy.mock.calls[0]![1]).toEqual({ useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 512 });
  });

  it("사전 검사를 비껴간 입력도 같은 옵션의 jpeg-js 가 할당 전에 거절한다(한도가 디코더 안에서 걸린다)", () => {
    transcodeCoverToWidth(realJpeg(), "image/jpeg", 24);
    const options = jpegDecodeSpy.mock.calls[0]![1] as object;
    const decodeWithLimits = actualJpegDecode.current!;

    // 검사기는 이런 파일을 거절하지만, 검사기가 없다고 가정해 한도만 건 디코더에 바로 준다. 디코더는 SOF 를 읽자마자 화소 수를
    // 확인하므로 두 번째 프레임의 블록을 할당하기 전에 던진다(밀리초, 메모리 증가 없음).
    const secondFrameTooLarge = concatBytes(withoutEoi(realJpeg()), jpegSof(4_001, 4_000, 3), JPEG_EOI);
    expect(() => decodeWithLimits(secondFrameTooLarge, options)).toThrow(/maxResolutionInMP/u);
    const hugeSecondFrame = concatBytes(JPEG_SOI, jpegSof(1, 1, 3), jpegSof(30_000, 30_000, 3), JPEG_EOI);
    expect(() => decodeWithLimits(hugeSecondFrame, options)).toThrow(/maxResolutionInMP/u);
  });
});
