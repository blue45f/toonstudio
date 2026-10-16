import { Image, encode, encodePng } from "image-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { transcodeCoverToWidth } from "./cover-transcode";

// 디코드 호출 여부가 핵심 계약이라 image-js 의 decode 를 실제 구현 그대로 감싸서 호출만 센다.
const { decodeSpy } = vi.hoisted(() => ({ decodeSpy: vi.fn() }));
vi.mock("image-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("image-js")>();
  decodeSpy.mockImplementation(actual.decode);
  return { ...actual, decode: decodeSpy };
});

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
  });

  it("상한(1600만 화소) 이하의 정상 이미지는 그대로 변환한다", () => {
    const png = Buffer.from(encodePng(realImage(640, 960)));
    const jpeg = Buffer.from(encode(realImage(800, 1200), { format: "jpeg" }));
    expect(transcodeCoverToWidth(png, "image/png", 160)?.width).toBe(160);
    expect(transcodeCoverToWidth(jpeg, "image/jpeg", 320)?.width).toBe(320);
    expect(decodeSpy).toHaveBeenCalledTimes(2);
  });

  it("상한 바로 위의 선언 크기는 거절하고 바로 아래는 디코드를 시도한다", () => {
    expect(transcodeCoverToWidth(pngHeader(4_001, 4_000), "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
    // 상한 이하는 디코드를 시도한다(IDAT 가 없어 디코드 자체는 실패해 null 이다).
    expect(transcodeCoverToWidth(pngHeader(4_000, 4_000), "image/png", 320)).toBeNull();
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  it("헤더에서 크기를 읽을 수 없으면 디코드하지 않는다", () => {
    const jpegWithoutFrame = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    expect(transcodeCoverToWidth(jpegWithoutFrame, "image/jpeg", 320)).toBeNull();
    expect(transcodeCoverToWidth(Buffer.from("not an image at all, just text"), "image/png", 320)).toBeNull();
    expect(decodeSpy).not.toHaveBeenCalled();
  });
});
