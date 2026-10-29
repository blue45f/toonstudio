import { describe, expect, it } from "vitest";

import {
  blitXcfTile,
  convertXcfToRgba8,
  decodeXcfRawTile,
  decodeXcfRleTile,
  describeXcfPrecision,
  XcfTileError,
  xcfBytesPerPixel,
  type XcfPrecision,
} from "../xcf-tiles";

function precision(id: number): XcfPrecision {
  const found = describeXcfPrecision(id);
  if (found === null) throw new Error(`정밀도 ${id}가 표에 없다`);
  return found;
}

function rle(stream: readonly number[], pixelCount: number, bytesPerPixel: number) {
  const data = Uint8Array.from(stream);
  const out = new Uint8Array(pixelCount * bytesPerPixel);
  const consumed = decodeXcfRleTile(data, 0, data.length, pixelCount, bytesPerPixel, out);
  return { out, consumed };
}

function tileErrorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof XcfTileError) return error.code;
    throw error;
  }
  return "no-error";
}

describe("XCF RLE 타일 디코드", () => {
  it("짧은 반복은 n+1번 반복한다", () => {
    const { out, consumed } = rle([4, 0xaa], 5, 1);

    expect([...out]).toEqual([0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
    expect(consumed).toBe(2);
  });

  it("긴 반복(127)은 16비트 횟수만큼 반복한다", () => {
    const { out, consumed } = rle([127, 0x01, 0x2c, 0x07], 300, 1);

    expect(out.every((value) => value === 7)).toBe(true);
    expect(consumed).toBe(4);
  });

  it("짧은 리터럴(129~255)은 256-n 바이트를 그대로 쓴다", () => {
    const { out } = rle([253, 1, 2, 3], 3, 1);

    expect([...out]).toEqual([1, 2, 3]);
  });

  it("긴 리터럴(128)은 16비트 길이 뒤의 바이트를 그대로 쓴다", () => {
    const literal = Array.from({ length: 200 }, (_, index) => (index * 7) & 0xff);
    const { out, consumed } = rle([128, 0x00, 0xc8, ...literal], 200, 1);

    expect([...out]).toEqual(literal);
    expect(consumed).toBe(3 + 200);
  });

  it("바이트 평면별로 따로 인코딩된 스트림을 픽셀 단위로 인터리브한다", () => {
    // 평면 0: 리터럴 1,2,3 / 평면 1: 9를 세 번 반복
    const { out } = rle([253, 1, 2, 3, 2, 9], 3, 2);

    expect([...out]).toEqual([1, 9, 2, 9, 3, 9]);
  });

  it("평면 경계를 넘는 연산은 거부한다", () => {
    expect(tileErrorCode(() => rle([2, 5], 2, 1))).toBe("rle-overruns-plane");
    expect(tileErrorCode(() => rle([253, 1, 2, 3], 2, 1))).toBe("rle-overruns-plane");
  });

  it("스트림이 평면을 채우기 전에 끝나면 거부한다", () => {
    expect(tileErrorCode(() => rle([], 1, 1))).toBe("rle-truncated");
    expect(tileErrorCode(() => rle([0, 5], 3, 1))).toBe("rle-truncated");
    expect(tileErrorCode(() => rle([253, 1], 3, 1))).toBe("rle-truncated");
    expect(tileErrorCode(() => rle([127, 0x00], 3, 1))).toBe("rle-truncated");
    expect(tileErrorCode(() => rle([4], 5, 1))).toBe("rle-truncated");
  });

  it("길이 0인 퇴행 연산은 거부한다", () => {
    expect(tileErrorCode(() => rle([128, 0, 0], 1, 1))).toBe("rle-degenerate-op");
    expect(tileErrorCode(() => rle([127, 0, 0, 5], 1, 1))).toBe("rle-degenerate-op");
  });
});

describe("XCF 압축 없는 타일과 배치", () => {
  it("압축 없는 타일은 인터리브 바이트를 그대로 복사하고 모자라면 거부한다", () => {
    const data = Uint8Array.from([9, 1, 2, 3, 4]);
    const out = new Uint8Array(4);

    decodeXcfRawTile(data, 1, data.length, 4, out);

    expect([...out]).toEqual([1, 2, 3, 4]);
    expect(tileErrorCode(() => decodeXcfRawTile(data, 2, data.length, 4, out))).toBe("raw-truncated");
  });

  it("부분 타일을 레이어 버퍼의 알맞은 자리에 행 단위로 복사한다", () => {
    // 70x66 레이어, 픽셀당 1바이트. 열 1·행 1 타일은 6x2다.
    const layer = new Uint8Array(70 * 66);
    const tile = Uint8Array.from({ length: 12 }, (_, index) => index + 1);

    blitXcfTile(layer, 70, 1, 1, 1, 6, 2, tile);

    expect([...layer.subarray(64 * 70 + 64, 64 * 70 + 70)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...layer.subarray(65 * 70 + 64, 65 * 70 + 70)]).toEqual([7, 8, 9, 10, 11, 12]);
    expect(layer.reduce((sum, value) => sum + value, 0)).toBe(78);
  });
});

describe("XCF 정밀도 표", () => {
  it("12개 정밀도 번호를 성분 크기·수치 종류·선형 여부로 해석한다", () => {
    expect(precision(150)).toMatchObject({ bytesPerComponent: 1, numeric: "integer", linear: false });
    expect(precision(100)).toMatchObject({ bytesPerComponent: 1, numeric: "integer", linear: true });
    expect(precision(350)).toMatchObject({ bytesPerComponent: 4, numeric: "integer", linear: false });
    expect(precision(500)).toMatchObject({ bytesPerComponent: 2, numeric: "float", linear: true });
    expect(precision(650)).toMatchObject({ bytesPerComponent: 4, numeric: "float", linear: false });
    expect(precision(700)).toMatchObject({ bytesPerComponent: 8, numeric: "float", linear: true });
  });

  it("개발판 값과 모르는 번호는 null이다", () => {
    for (const id of [0, 1, 4, 400, 450, 99, 800]) expect(describeXcfPrecision(id)).toBeNull();
  });

  it("인덱스드는 정밀도와 무관하게 성분당 1바이트다", () => {
    expect(xcfBytesPerPixel({ baseType: "indexed", hasAlpha: true }, precision(750))).toBe(2);
    expect(xcfBytesPerPixel({ baseType: "rgb", hasAlpha: true }, precision(350))).toBe(16);
    expect(xcfBytesPerPixel({ baseType: "grayscale", hasAlpha: false }, precision(550))).toBe(2);
  });
});

describe("XCF RGBA8 환원", () => {
  const p150 = precision(150);

  it("8비트 감마 정수 RGB·RGBA·Gray·GrayA를 직선 RGBA8로 옮긴다", () => {
    expect([...convertXcfToRgba8(Uint8Array.from([10, 20, 30]), 1, { baseType: "rgb", hasAlpha: false }, p150, null)]).toEqual([10, 20, 30, 255]);
    expect([...convertXcfToRgba8(Uint8Array.from([10, 20, 30, 40]), 1, { baseType: "rgb", hasAlpha: true }, p150, null)]).toEqual([10, 20, 30, 40]);
    expect([...convertXcfToRgba8(Uint8Array.from([77]), 1, { baseType: "grayscale", hasAlpha: false }, p150, null)]).toEqual([77, 77, 77, 255]);
    expect([...convertXcfToRgba8(Uint8Array.from([77, 5]), 1, { baseType: "grayscale", hasAlpha: true }, p150, null)]).toEqual([77, 77, 77, 5]);
  });

  it("인덱스드는 색지도로 색을 찾고 범위 밖 인덱스는 검정이다", () => {
    const palette = Uint8Array.from([255, 0, 0, 0, 255, 0]);

    expect([...convertXcfToRgba8(Uint8Array.from([1, 0, 9]), 3, { baseType: "indexed", hasAlpha: false }, p150, palette)]).toEqual([
      0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255,
    ]);
    expect([...convertXcfToRgba8(Uint8Array.from([0, 200]), 1, { baseType: "indexed", hasAlpha: true }, p150, palette)]).toEqual([255, 0, 0, 200]);
    expect([...convertXcfToRgba8(Uint8Array.from([0]), 1, { baseType: "indexed", hasAlpha: false }, p150, null)]).toEqual([0, 0, 0, 255]);
  });

  it("선형 정밀도의 색 채널에는 sRGB OETF를 적용하고 알파에는 적용하지 않는다", () => {
    // 선형 0.5는 sRGB 8비트로 188이고, 알파 0.5는 그대로 128이다.
    const float32 = new DataView(new ArrayBuffer(16));
    float32.setFloat32(0, 0.5, false);
    float32.setFloat32(4, 0, false);
    float32.setFloat32(8, 1, false);
    float32.setFloat32(12, 0.5, false);
    const raw = new Uint8Array(float32.buffer);

    expect([...convertXcfToRgba8(raw, 1, { baseType: "rgb", hasAlpha: true }, precision(600), null)]).toEqual([188, 0, 255, 128]);
    // 같은 값이 감마 정밀도(650)면 OETF 없이 0.5가 128이다.
    expect([...convertXcfToRgba8(raw, 1, { baseType: "rgb", hasAlpha: true }, precision(650), null)]).toEqual([128, 0, 255, 128]);
  });

  it("선형 8비트 정수도 OETF를 거친다", () => {
    expect([...convertXcfToRgba8(Uint8Array.from([128]), 1, { baseType: "grayscale", hasAlpha: false }, precision(100), null)]).toEqual([188, 188, 188, 255]);
  });

  it("16비트·32비트 정수는 값/최댓값으로 환원한다", () => {
    const sixteen = new DataView(new ArrayBuffer(6));
    sixteen.setUint16(0, 0xffff, false);
    sixteen.setUint16(2, 0, false);
    sixteen.setUint16(4, 0x4000, false);
    expect([...convertXcfToRgba8(new Uint8Array(sixteen.buffer), 1, { baseType: "rgb", hasAlpha: false }, precision(250), null)]).toEqual([255, 0, 64, 255]);

    const thirtyTwo = new DataView(new ArrayBuffer(4));
    thirtyTwo.setUint32(0, 0x40000000, false);
    expect([...convertXcfToRgba8(new Uint8Array(thirtyTwo.buffer), 1, { baseType: "grayscale", hasAlpha: false }, precision(350), null)]).toEqual([64, 64, 64, 255]);
  });

  it("16비트 실수(half)와 64비트 실수를 해석하고 범위 밖 값은 자른다", () => {
    const half = new DataView(new ArrayBuffer(8));
    half.setUint16(0, 0x3c00, false); // 1.0
    half.setUint16(2, 0x3800, false); // 0.5
    half.setUint16(4, 0xb800, false); // -0.5
    half.setUint16(6, 0x7e00, false); // NaN
    expect([...convertXcfToRgba8(new Uint8Array(half.buffer), 1, { baseType: "rgb", hasAlpha: true }, precision(550), null)]).toEqual([255, 128, 0, 0]);

    const double = new DataView(new ArrayBuffer(8));
    double.setFloat64(0, 0.25, false);
    expect([...convertXcfToRgba8(new Uint8Array(double.buffer), 1, { baseType: "grayscale", hasAlpha: false }, precision(750), null)]).toEqual([64, 64, 64, 255]);

    const overflow = new DataView(new ArrayBuffer(8));
    overflow.setFloat32(0, 5, false);
    overflow.setFloat32(4, Number.POSITIVE_INFINITY, false);
    expect([...convertXcfToRgba8(new Uint8Array(overflow.buffer), 1, { baseType: "grayscale", hasAlpha: true }, precision(650), null)]).toEqual([255, 255, 255, 255]);
  });

  it("바이트 오프셋이 있는 뷰에서도 DataView 경로가 올바른 자리를 읽는다", () => {
    // 16비트 정밀도(250): 앞뒤 99 패딩 사이의 R=0x8000, G=0xffff, B=0
    const backing = Uint8Array.from([99, 99, 0x80, 0x00, 0xff, 0xff, 0x00, 0x00, 99]);
    const view = backing.subarray(2, 8);

    expect([...convertXcfToRgba8(view, 1, { baseType: "rgb", hasAlpha: false }, precision(250), null)]).toEqual([128, 255, 0, 255]);
    // 8비트 빠른 경로도 같은 방식으로 오프셋을 존중한다.
    expect([...convertXcfToRgba8(backing.subarray(2, 5), 1, { baseType: "rgb", hasAlpha: false }, p150, null)]).toEqual([0x80, 0, 0xff, 255]);
  });
});
