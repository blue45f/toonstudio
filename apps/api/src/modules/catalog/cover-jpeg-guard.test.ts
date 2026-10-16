import { describe, expect, it } from "vitest";

import { COVER_JPEG_SAMPLES } from "../../../test/cover-jpeg-samples";
import {
  JPEG_EOI,
  JPEG_SOI,
  concatBytes,
  exifApp1WithThumbnail,
  insertAfterSoi,
  jpegSegment,
  jpegSof,
  jpegSos,
  withoutEoi,
} from "../../../test/cover-image-fixtures";
import { COVER_JPEG_DECODE_MEMORY_MB, COVER_MAX_DECODE_PIXELS } from "./cover-decode-limits";
import { COVER_JPEG_DECODE_OPTIONS, guardJpeg } from "./cover-jpeg-guard";

/** SOI + 주어진 마커들 + EOI. */
const jpeg = (...parts: Buffer[]): Buffer => concatBytes(JPEG_SOI, ...parts, JPEG_EOI);

describe("guardJpeg 정상 입력", () => {
  it.each(Object.entries(COVER_JPEG_SAMPLES))("%s 표본은 크기와 성분 수를 그대로 읽는다", (_name, sample) => {
    expect(guardJpeg(sample.bytes)).toEqual({ width: 48, height: 32, components: sample.components });
  });

  it("APP1(EXIF) 안의 썸네일 JPEG 가 가진 SOF 는 프레임으로 읽지 않는다", () => {
    const thumbnail = COVER_JPEG_SAMPLES.gray!.bytes; // 48x32 회색 JPEG 한 장이 통째로 APP1 에 들어간다
    const real = COVER_JPEG_SAMPLES.ycbcr420!.bytes;
    const withExif = insertAfterSoi(real, exifApp1WithThumbnail(thumbnail));
    expect(withExif.includes(thumbnail)).toBe(true);
    expect(guardJpeg(withExif)).toEqual({ width: 48, height: 32, components: 3 });
  });

  it("APP 세그먼트·주석·ICC(APP2) 뒤의 프레임도 읽고, 마커 앞 채움 바이트와 FF00 은 건너뛴다", () => {
    const filler = Buffer.from([0xff, 0xff, 0xff]);
    const noise = jpegSegment(0xe2, Buffer.from("ICC_PROFILE\0\x01\x01 프로파일 조각 ".repeat(40)));
    const comment = jpegSegment(0xfe, Buffer.from("주석"));
    expect(guardJpeg(jpeg(noise, comment, filler, jpegSof(640, 960, 3)))).toEqual({ width: 640, height: 960, components: 3 });
    // jpeg-js 는 FF00 을 두 바이트 무시한다. 뒤따르는 SOF 를 놓치면 안 된다.
    expect(guardJpeg(jpeg(Buffer.from([0xff, 0x00]), jpegSof(640, 960, 3)))).toEqual({ width: 640, height: 960, components: 3 });
  });

  it("스캔 데이터 안의 스터핑(FF00)·재시작(FFDn)은 마커로 보지 않고, 프로그레시브의 여러 스캔과 그 사이의 테이블을 따라간다", () => {
    const entropy = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd7, 0x78]);
    const dht = jpegSegment(0xc4, Buffer.alloc(17));
    const progressive = jpeg(jpegSof(48, 32, 3, 0xc2), jpegSos(), entropy, dht, jpegSos(), entropy, dht, jpegSos(), entropy);
    expect(guardJpeg(progressive)).toEqual({ width: 48, height: 32, components: 3 });
  });

  it("끝(EOI)이 없이 잘려도 프레임 헤더를 읽었으면 그 값을 돌려준다(디코드 가능 여부는 디코더가 판정한다)", () => {
    expect(guardJpeg(concatBytes(JPEG_SOI, jpegSof(48, 32, 3), Buffer.from([1, 2, 3])))).toEqual({
      width: 48,
      height: 32,
      components: 3,
    });
  });
});

describe("guardJpeg 크기·성분 수", () => {
  it("화소 수 상한(1600만)은 포함하고 한 화소만 넘어도 거절한다", () => {
    expect(guardJpeg(jpeg(jpegSof(4_000, 4_000, 3)))).not.toBeNull();
    expect(guardJpeg(jpeg(jpegSof(4_001, 4_000, 3)))).toBeNull();
    expect(4_000 * 4_000).toBe(COVER_MAX_DECODE_PIXELS);
    // 16비트 필드의 극단: 65535x245 = 16,056,075 는 거절, 65535x244 = 15,990,540 은 허용.
    expect(guardJpeg(jpeg(jpegSof(65_535, 245, 3)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(65_535, 244, 3)))).not.toBeNull();
    expect(guardJpeg(jpeg(jpegSof(30_000, 30_000, 3)))).toBeNull();
  });

  it("폭·높이가 0 이면 거절한다", () => {
    expect(guardJpeg(jpeg(jpegSof(0, 32, 3)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(48, 0, 3)))).toBeNull();
  });

  it.each([1, 3, 4])("성분 %i개는 허용한다", (components) => {
    expect(guardJpeg(jpeg(jpegSof(48, 32, components)))).toMatchObject({ components });
  });

  it.each([0, 2, 5, 8, 255])("성분 %i개는 디코더가 색 변환을 모르거나 메모리를 부풀리므로 거절한다", (components) => {
    expect(guardJpeg(jpeg(jpegSof(4_000, 4_000, components)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(48, 32, components)))).toBeNull();
  });
});

describe("guardJpeg 프레임 개수와 은닉", () => {
  it("프레임 헤더가 둘이면 어느 순서든 거절한다(jpeg-js 는 SOF 마다 메모리를 먼저 할당한다)", () => {
    expect(guardJpeg(jpeg(jpegSof(1, 1, 3), jpegSof(4_001, 4_000, 3)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(4_001, 4_000, 3), jpegSof(1, 1, 3)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(48, 32, 3), jpegSof(48, 32, 3)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(48, 32, 3), jpegSof(48, 32, 3, 0xc2)))).toBeNull();
  });

  it("스캔 뒤에 숨긴 두 번째 프레임 헤더도 거절한다", () => {
    const entropy = Buffer.from([0x12, 0xff, 0x00, 0x34]);
    const real = withoutEoi(COVER_JPEG_SAMPLES.ycbcr420!.bytes);
    expect(guardJpeg(real)).not.toBeNull();
    expect(guardJpeg(concatBytes(real, jpegSof(4_001, 4_000, 3), JPEG_EOI))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(48, 32, 3), jpegSos(), entropy, jpegSof(48, 32, 3), jpegSos(), entropy))).toBeNull();
    // 스캔 데이터에 재시작 마커(FFD0~FFD7)와 스터핑(FF00)이 섞여 있어도 그 뒤의 마커까지 따라가 숨긴 프레임을 본다.
    const restarts = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd7, 0x78]);
    expect(guardJpeg(jpeg(jpegSof(48, 32, 3), jpegSos(), restarts, jpegSof(4_001, 4_000, 3)))).toBeNull();
  });

  it("첫 EOI 뒤의 바이트는 보지 않는다(MPF 처럼 완전한 JPEG 가 더 이어져도 첫 이미지만 디코드 대상이다)", () => {
    const first = COVER_JPEG_SAMPLES.ycbcr420!.bytes;
    const second = COVER_JPEG_SAMPLES.sampling411!.bytes;
    expect(guardJpeg(concatBytes(first, second))).toEqual({ width: 48, height: 32, components: 3 });
    expect(guardJpeg(concatBytes(first, jpegSof(30_000, 30_000, 3)))).toEqual({ width: 48, height: 32, components: 3 });
    // 뒤따르는 이미지(MPF 의 게인 맵 등)는 64KB 를 넘기도 하고 끝에 다른 프레임 헤더가 있을 수 있다.
    expect(guardJpeg(concatBytes(first, Buffer.alloc(70_000, 0x41), jpegSof(30_000, 30_000, 3)))).toEqual({
      width: 48,
      height: 32,
      components: 3,
    });
  });

  it("옛 검사기를 비껴가던 FF00 은닉(길이를 가진 마커로 읽어 FFC0 바이트를 건너뜀)을 거절한다", () => {
    // jpeg-js: FF00 무시 -> 곧바로 큰 SOF. 옛 검사기: FF00 뒤 2바이트(FFC0)를 길이로 읽어 65472바이트를 건너뛰어 작은 SOF 를 봤다.
    const front = concatBytes(JPEG_SOI, Buffer.from([0xff, 0x00]), jpegSof(8_000, 8_000, 3));
    const skipTo = 2 + 2 + 0xffc0;
    const hidden = concatBytes(front, Buffer.alloc(skipTo - front.length, 0xff), jpegSof(1, 1, 3), JPEG_EOI);
    expect(hidden.length).toBeGreaterThan(skipTo);
    expect(guardJpeg(hidden)).toBeNull();
  });

  it("지원하지 않는 프레임 유형(SOF3 무손실·SOF9 산술 부호화)만 있으면 거절한다", () => {
    expect(guardJpeg(jpeg(jpegSof(48, 32, 3, 0xc3)))).toBeNull();
    expect(guardJpeg(jpeg(jpegSof(48, 32, 3, 0xc9)))).toBeNull();
    // DHT(C4)·JPG(C8)·DAC(CC)는 프레임이 아니라 일반 세그먼트다.
    expect(guardJpeg(jpeg(jpegSegment(0xc4, Buffer.alloc(17)), jpegSegment(0xcc, Buffer.alloc(2)), jpegSof(48, 32, 3)))).not.toBeNull();
  });

  it("프레임 헤더가 없거나, 스캔이 프레임보다 먼저 오거나, 구조가 깨졌으면 거절한다", () => {
    expect(guardJpeg(jpeg())).toBeNull();
    expect(guardJpeg(jpeg(jpegSos(), Buffer.from([1, 2, 3])))).toBeNull();
    expect(guardJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]))).toBeNull();
    expect(guardJpeg(Buffer.from("PNG 이거나 아무 바이트나"))).toBeNull();
    expect(guardJpeg(Buffer.from([0xff, 0xd8]))).toBeNull();
    // 세그먼트 길이가 2 미만이면 구조가 깨진 것이다.
    expect(guardJpeg(concatBytes(JPEG_SOI, Buffer.from([0xff, 0xe0, 0x00, 0x01]), jpegSof(48, 32, 3)))).toBeNull();
    // 프레임 헤더가 파일 끝에서 잘렸다.
    expect(guardJpeg(concatBytes(JPEG_SOI, jpegSof(48, 32, 3).subarray(0, 8)))).toBeNull();
  });
});

describe("COVER_JPEG_DECODE_OPTIONS", () => {
  it("화소 수는 사전 검사와 같은 상한이고 메모리 예산은 512MB 이며 typed array 로 받는다", () => {
    expect(COVER_JPEG_DECODE_OPTIONS).toEqual({
      useTArray: true,
      maxResolutionInMP: COVER_MAX_DECODE_PIXELS / 1_000_000,
      maxMemoryUsageInMB: COVER_JPEG_DECODE_MEMORY_MB,
    });
    expect(COVER_JPEG_DECODE_OPTIONS).toEqual({ useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 512 });
  });
});
