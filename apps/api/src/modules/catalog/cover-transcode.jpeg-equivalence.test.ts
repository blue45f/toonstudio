import { Image, decode, encode, encodeJpeg } from "image-js";
import { describe, expect, it } from "vitest";

import { COVER_JPEG_SAMPLES } from "../../../test/cover-jpeg-samples";
import { exifApp1WithThumbnail, insertAfterSoi, jpegSegment } from "../../../test/cover-image-fixtures";
import { transcodeCoverToWidth } from "./cover-transcode";

// 정상 JPEG 의 변환 결과가 jpeg-js 직접 디코드로 바꾸기 전과 같은지 본다. 기준은 image-js 의 decode(jpeg-js 한도를 끄고
// EXIF 까지 읽는 원래 경로)로 디코드→리사이즈→인코드한 결과다. 회색·YCbCr(4:4:4·4:2:2·4:2:0·4:1:1·4:4:0)·프로그레시브·
// 재시작 간격·CMYK(Adobe) 표본과 APP 세그먼트 변형마다 바이트 단위로 비교한다.

const JPEG_QUALITY = 82;

function referenceTranscode(body: Buffer, targetWidth: number) {
  let image: ReturnType<typeof decode>;
  try {
    image = decode(body);
  } catch {
    return null;
  }
  if (image.width <= targetWidth) return null;
  const resized = image.resize({ width: targetWidth });
  return {
    body: Buffer.from(encodeJpeg(resized, { quality: JPEG_QUALITY })),
    contentType: "image/jpeg",
    width: resized.width,
    height: resized.height,
  };
}

function expectSameAsReference(jpeg: Buffer, targetWidth: number) {
  const expected = referenceTranscode(jpeg, targetWidth);
  const actual = transcodeCoverToWidth(jpeg, "image/jpeg", targetWidth);
  expect(expected).not.toBeNull();
  expect(actual).toMatchObject({ contentType: "image/jpeg", width: expected!.width, height: expected!.height });
  expect(actual!.body.equals(expected!.body)).toBe(true);
}

function photo(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      data[at] = (x * 255) / width;
      data[at + 1] = (y * 255) / height;
      data[at + 2] = ((x * 7 + y * 13) ^ (x * y)) & 0xff;
      data[at + 3] = 255;
    }
  }
  return Buffer.from(encode(new Image(width, height, { data, colorModel: "RGBA" }), { format: "jpeg" }));
}

describe("정상 JPEG 의 변환 결과는 jpeg-js 직접 디코드 이전과 바이트까지 같다", () => {
  describe.each(Object.entries(COVER_JPEG_SAMPLES))("%s", (_name, sample) => {
    it.each([16, 24, 47])("목표 폭 %i", (width) => {
      expectSameAsReference(sample.bytes, width);
    });
  });

  it("목표 폭이 원본 이하이면 변환하지 않는다", () => {
    for (const sample of Object.values(COVER_JPEG_SAMPLES)) {
      expect(transcodeCoverToWidth(sample.bytes, "image/jpeg", 48)).toBeNull();
      expect(transcodeCoverToWidth(sample.bytes, "image/jpeg", 320)).toBeNull();
    }
  });

  it("카메라 사진처럼 EXIF 방향·APP1 안의 썸네일 JPEG·ICC·주석이 붙어도 같다", () => {
    const base = COVER_JPEG_SAMPLES.ycbcr420!.bytes;
    const thumbnail = COVER_JPEG_SAMPLES.gray!.bytes;
    const withExif = insertAfterSoi(base, exifApp1WithThumbnail(thumbnail, 6));
    const withIcc = insertAfterSoi(withExif, jpegSegment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0\x01\x01"), Buffer.alloc(300, 7)])));
    const withComment = insertAfterSoi(withIcc, jpegSegment(0xfe, Buffer.from("주석 comment")));
    for (const jpeg of [withExif, withIcc, withComment]) expectSameAsReference(jpeg, 24);
    // EXIF 방향은 리사이즈·인코드에 쓰이지 않으므로 방향이 달라도 결과 화소는 같다.
    const rotated = insertAfterSoi(base, exifApp1WithThumbnail(thumbnail, 3));
    expect(transcodeCoverToWidth(rotated, "image/jpeg", 24)!.body.equals(transcodeCoverToWidth(withExif, "image/jpeg", 24)!.body)).toBe(true);
  });

  it("첫 이미지 뒤에 완전한 JPEG 가 더 이어진 파일(MPF)도 첫 이미지만 같은 결과로 변환한다", () => {
    const first = COVER_JPEG_SAMPLES.ycbcr420!.bytes;
    expectSameAsReference(Buffer.concat([first, COVER_JPEG_SAMPLES.gray!.bytes, Buffer.from("뒤따르는 바이트")]), 24);
    expect(transcodeCoverToWidth(Buffer.concat([first, COVER_JPEG_SAMPLES.gray!.bytes]), "image/jpeg", 24)!.body.equals(
      transcodeCoverToWidth(first, "image/jpeg", 24)!.body,
    )).toBe(true);
  });

  it("실제 크기의 표지(800x1200)도 같다", () => {
    expectSameAsReference(photo(800, 1200), 320);
    expectSameAsReference(photo(641, 961), 160);
  });

  it("EXIF 를 읽지 않으므로 EXIF(APP1)가 깨진 JPEG 도 변환된다(예전엔 EXIF 파싱 실패가 디코드 실패였다)", () => {
    const base = COVER_JPEG_SAMPLES.ycbcr420!.bytes;
    const broken = insertAfterSoi(base, jpegSegment(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), Buffer.alloc(40, 0xff)])));
    const plain = transcodeCoverToWidth(base, "image/jpeg", 24);
    const result = transcodeCoverToWidth(broken, "image/jpeg", 24);
    expect(result?.body.equals(plain!.body)).toBe(true);
    // 기준 경로(image-js)는 이 파일을 디코드하지 못한다. 결과가 달라지는 유일한 경우이고 더 나은 쪽이다.
    expect(referenceTranscode(broken, 24)).toBeNull();
  });
});
