import { Image, decode, encodeJpeg, encodePng } from "image-js";
import { decode as decodeJpegPixels } from "jpeg-js";

import { COVER_JPEG_DECODE_OPTIONS, guardJpeg } from "./cover-jpeg-guard";
import { PNG_SIGNATURE, guardPng } from "./cover-png-guard";

// 디코드 상한은 사전 검사 모듈과 같은 값을 쓴다(cover-decode-limits.ts). 기존 import 경로를 지키려고 다시 내보낸다.
export { COVER_MAX_DECODE_PIXELS, COVER_MAX_DECODE_RAW_BYTES } from "./cover-decode-limits";

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
//
// 바이트 최적화(optimizeCoverBytes)는 폭 변환의 형제 경로다. 폭 변환은 "폭이
// 지정됐고 원본이 더 클 때"만 동작하므로, 폭 없는 요청과 이미 폭이 맞는 표지
// (예: 320px인데 수백 KB인 불투명 PNG)는 바이트가 줄지 않았다. 최적화 경로는
// 그 경우까지 재인코딩으로 바이트를 줄이되, 결과가 원본보다 작을 때만 채택하고,
// 켜고 끄는 정책은 cover-transcode-policy.ts의 별도 opt-in 플래그가 정한다.

export interface CoverTranscodeResult {
  readonly body: Buffer;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
}

const COVER_JPEG_QUALITY = 82;

type CoverFormat = "png" | "jpeg";

/**
 * 형식은 Content-Type 이 아니라 매직 바이트로 정한다. Content-Type 은 업스트림이 마음대로 붙이는 라벨이라,
 * TIFF 에 PNG 라벨을 붙이고 12~23바이트에 가짜 IHDR(1x1)을 심으면 선언 크기 검사를 통과한 채 image-js 가 실제
 * TIFF(4100x4100)를 풀어 버렸다. PNG·JPEG 서명이 아니면 변환하지 않는다.
 */
function sniffCoverFormat(body: Buffer): CoverFormat | null {
  if (body.length >= PNG_SIGNATURE.length && body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "jpeg";
  return null;
}

/**
 * 사전 검사를 통과한 표지를 디코드한다. PNG 는 검사가 확인한 청크로 다시 조립한 PNG 를 image-js 로, JPEG 는 한도를
 * 건 jpeg-js 로 직접 풀어 화소를 image-js 의 Image 로 넘긴다(image-js 의 decode 는 jpeg-js 한도를 끄고 부른다).
 * 어느 단계든 실패하면 null.
 */
function decodeGuarded(body: Buffer, format: CoverFormat): ReturnType<typeof decode> | null {
  try {
    if (format === "png") {
      const guarded = guardPng(body);
      return guarded === null ? null : decode(guarded.sanitized);
    }
    if (guardJpeg(body) === null) return null;
    // image-js 의 decodeJpeg 와 같은 결과(8비트 RGBA)다. EXIF 메타는 리사이즈·인코드에 쓰이지 않아 읽지 않는다.
    const pixels = decodeJpegPixels(body, COVER_JPEG_DECODE_OPTIONS);
    return new Image(pixels.width, pixels.height, { data: pixels.data, colorModel: "RGBA" });
  } catch {
    return null;
  }
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

  // 디코드는 선언된 크기만큼 메모리를 할당하므로, 형식을 매직 바이트로 정하고 사전 검사를 통과한 입력만 디코드한다.
  const format = sniffCoverFormat(body);
  if (format === null) return null;
  const image = decodeGuarded(body, format);
  if (image === null) return null;
  if (image.width <= targetWidth) return null;

  try {
    const resized = image.resize({ width: targetWidth });
    // 알파 채널이 실제로 쓰이는 PNG만 PNG로 유지하고, 나머지는 JPEG로 인코딩해
    // 바이트를 더 줄인다(표지는 사진·일러스트라 JPEG 손실이 허용 범위다).
    const keepPng = format === "png" && image.alpha && hasVisibleTransparency(image);
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

/**
 * 폭 변환 대상이 아닌 표지의 바이트만 줄인다. 폭이 지정됐으면 그 폭으로 줄이는
 * 것까지 포함하지만(폭 변환 플래그가 꺼진 환경에서 최적화만 켠 경우), 폭이
 * 없거나 원본이 이미 목표 폭 이하이면 크기는 그대로 두고 재인코딩만 한다 —
 * 불투명 PNG의 JPEG 전환과 고품질 JPEG의 q82 재압축이 실제 축소분이다.
 *
 * 안전장치: 재인코딩 결과가 원본보다 작을 때만 결과를 돌려준다. 크거나 같으면
 * null이라 호출부는 원본을 그대로 중계한다 — 최적화를 켰다고 바이트가 늘거나,
 * 이득이 없는데 손실 재인코딩으로 화질만 떨어지는 일이 없다. 포맷 판정·사전
 * 검사·디코드는 폭 변환과 같은 경로(sniffCoverFormat·decodeGuarded)를 쓰고,
 * 투명 PNG는 알파 보존을 위해 PNG로 유지하는 규칙도 같다.
 */
export function optimizeCoverBytes(
  body: Buffer,
  contentType: string,
  targetWidth?: number,
): CoverTranscodeResult | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type !== "image/jpeg" && type !== "image/jpg" && type !== "image/png") return null;

  const format = sniffCoverFormat(body);
  if (format === null) return null;
  const image = decodeGuarded(body, format);
  if (image === null) return null;

  const shouldResize =
    targetWidth !== undefined && Number.isInteger(targetWidth) && targetWidth >= 1 && image.width > targetWidth;

  try {
    const output = shouldResize ? image.resize({ width: targetWidth }) : image;
    const keepPng = format === "png" && image.alpha && hasVisibleTransparency(image);
    const encoded = keepPng
      ? { body: Buffer.from(encodePng(output)), contentType: "image/png" }
      : { body: Buffer.from(encodeJpeg(output, { quality: COVER_JPEG_QUALITY })), contentType: "image/jpeg" };
    if (encoded.body.length >= body.length) return null;
    return { ...encoded, width: output.width, height: output.height };
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
