import { decode, encodeJpeg, encodePng } from "image-js";

// 서버측 표지 픽셀 변환.
//
// 배경: /api/cover 프록시는 표준 폭(w)을 클라이언트 힌트(Width 헤더)로 업스트림에
// 전달해 왔다. 힌트를 수용하는 CDN은 그 폭으로 내려주지만, 무시하는 CDN은 원본
// 바이트를 그대로 줘서 srcSet 후보가 달라도 실제 수신 바이트는 줄지 않았다.
// 이 모듈은 폭이 지정됐는데 업스트림이 더 큰 JPEG/PNG를 준 경우에 한해, 이미
// 런타임 의존성에 있는 image-js(apps/api package.json)로 직접 디코드→리사이즈→
// 재인코딩해 "카드 폭에 맞는 이미지만 수신"을 서버에서 보장한다.
//
// 정직한 범위 (2026-10-14 image-js 1.7.0 실측 — 디코드→리사이즈→재인코딩을
// 독립 디코더(pngjs·jpeg-js)로 교차 검증):
// - 디코드 가능: JPEG·PNG(·TIFF). PNG 알파는 디코드·리사이즈·재인코딩 전 구간에서
//   보존됨을 실측했다. WebP/AVIF 디코더는 image-js에 없어서, 최신 포맷으로
//   협상된 응답은 변환하지 않고 그대로 중계한다(힌트를 받는 CDN이면 그쪽에서
//   이미 폭이 맞춰졌을 수 있다). GIF도 디코드가 안 돼 원본 중계.
// - 인코드 가능: JPEG·PNG뿐이라 WebP/AVIF로의 변환 인코딩은 하지 않는다.
//   불투명 이미지는 JPEG(q82)로, 알파가 있는 PNG는 투명도 보존을 위해 PNG로 낸다.
// - 어떤 단계에서 실패해도(손상된 바이트, 미지원 변형 등) null을 돌려주고
//   호출부는 원본을 그대로 중계한다 — 표지 표시를 깨지 않는 것이 우선이다.

export interface CoverTranscodeResult {
  readonly body: Buffer;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
}

const COVER_JPEG_QUALITY = 82;

/**
 * 디코드를 허용하는 최대 화소 수(선언 크기 기준). 압축된 바이트는 작아도 PNG·JPEG 헤더가 수만 x 수만
 * 화소를 선언할 수 있고, image-js 의 decode 는 그 크기만큼 메모리를 할당한다(이미지 폭탄, CWE-409).
 * 실제 표지는 많아야 수백만 화소라 1600만 화소(4000x4000)면 정상 이미지를 막지 않는다.
 * 상한을 넘거나 선언 크기를 읽지 못하면 변환하지 않고 호출부가 원본을 그대로 중계한다.
 */
export const COVER_MAX_DECODE_PIXELS = 16_000_000;

interface DeclaredDimensions {
  readonly width: number;
  readonly height: number;
}

/** 디코드하지 않고 PNG IHDR / JPEG SOF 헤더에서 선언된 크기만 읽는다. 읽을 수 없으면 null. */
function readDeclaredDimensions(body: Buffer, type: string): DeclaredDimensions | null {
  if (type === "image/png") {
    if (body.length < 24 || body.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  }
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= body.length) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = body[offset + 1];
    if (marker === undefined) return null;
    if (marker === 0xff) {
      // 마커 앞의 채움 바이트다.
      offset += 1;
      continue;
    }
    // 길이 필드가 없는 마커(TEM, RSTn, SOI)는 두 바이트만 건너뛴다.
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // 프레임 헤더(SOF)보다 먼저 스캔(SOS)이나 끝(EOI)이 나오면 크기를 알 수 없다.
    if (marker === 0xd9 || marker === 0xda) return null;
    const segmentLength = body.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      if (offset + 9 > body.length) return null;
      return { height: body.readUInt16BE(offset + 5), width: body.readUInt16BE(offset + 7) };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/**
 * 폭 지정 표지를 목표 폭으로 줄인다. 변환이 불필요하거나(원본이 이미 목표
 * 이하) 불가능하면(미지원 포맷·디코드 실패) null.
 */
export function transcodeCoverToWidth(
  body: Buffer,
  contentType: string,
  targetWidth: number,
): CoverTranscodeResult | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type !== "image/jpeg" && type !== "image/jpg" && type !== "image/png") return null;
  if (!Number.isInteger(targetWidth) || targetWidth < 1) return null;

  // 디코드는 선언된 크기만큼 메모리를 할당하므로, 헤더로 크기를 먼저 확인한다.
  const declared = readDeclaredDimensions(body, type === "image/png" ? "image/png" : "image/jpeg");
  if (declared === null || declared.width * declared.height > COVER_MAX_DECODE_PIXELS) return null;

  let image: ReturnType<typeof decode>;
  try {
    image = decode(body);
  } catch {
    return null;
  }
  if (image.width <= targetWidth) return null;

  try {
    const resized = image.resize({ width: targetWidth });
    // 알파 채널이 실제로 쓰이는 PNG만 PNG로 유지하고, 나머지는 JPEG로 인코딩해
    // 바이트를 더 줄인다(표지는 사진·일러스트라 JPEG 손실이 허용 범위다).
    const keepPng = type === "image/png" && image.alpha && hasVisibleTransparency(image);
    if (keepPng) {
      return {
        body: Buffer.from(encodePng(resized)),
        contentType: "image/png",
        width: resized.width,
        height: resized.height,
      };
    }
    return {
      body: Buffer.from(encodeJpeg(resized, { quality: COVER_JPEG_QUALITY })),
      contentType: "image/jpeg",
      width: resized.width,
      height: resized.height,
    };
  } catch {
    return null;
  }
}

// 알파 채널이 존재해도 전부 불투명이면 투명도는 의미가 없다 — 표지 실측 대부분이
// 이 경우라 JPEG 전환 대상이다. 전 픽셀을 훑지 않고 표본만 검사한다.
function hasVisibleTransparency(image: ReturnType<typeof decode>): boolean {
  if (!image.alpha) return false;
  const channels = image.channels;
  const alphaIndex = channels - 1;
  const step = Math.max(1, Math.floor(image.size / 4096));
  for (let pixel = 0; pixel < image.size; pixel += step) {
    if (image.getValueByIndex(pixel, alphaIndex) < 255) return true;
  }
  return false;
}
