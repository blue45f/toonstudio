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
