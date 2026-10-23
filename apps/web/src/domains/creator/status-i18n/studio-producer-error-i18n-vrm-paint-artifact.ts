/**
 * 생산자 구조화 에러 해석 모듈 — vrmPaintArtifact 구간: studio-vrm-texture-paint-artifact의
 * 표시 확정 템플릿 52종 (verify 코어 헬퍼군 + decode 전용, A4 D4 조건부 묶음, R18 설계 §3).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, detail, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * 기존 code 26종은 상위 분류로 유지하고, detail이 템플릿 단위 서브코드다.
 * bundle/manifest/resolver 전용 detail 19종과 ABORTED(aborted)는 키를 만들지 않는다
 * (ABORTED는 이름 기반 처리 유지). ko 값은 이관 전 템플릿 원문과 params 슬롯 포함
 * 글자 단위 동일하고, en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioVrmTexturePaintArtifactErrorDetail } from "../vrm/studio-vrm-texture-paint-artifact";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.vrmPaintArtifact.limitInvalidRange": "{limitKey} 한도는 1 이상 {hardMaximum} 이하의 안전한 정수여야 합니다.",
  "studio.producerError.vrmPaintArtifact.limitsInvalid": "VRM 표면 페인팅 PNG 안전 한도가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.bindingKeyInvalid": "VRM 표면 페인팅 bindingKey는 정규화된 안전 식별자여야 합니다.",
  "studio.producerError.vrmPaintArtifact.expectedDimensionInvalid": "예상 PNG 해상도가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.sourceTypeInvalid": "VRM 표면 페인팅 artifact는 Blob 또는 Uint8Array여야 합니다.",
  "studio.producerError.vrmPaintArtifact.blobMimeInvalid": "VRM 표면 페인팅 Blob MIME은 image/png여야 합니다.",
  "studio.producerError.vrmPaintArtifact.sourceTooSmall": "VRM 표면 페인팅 PNG가 비었거나 잘렸습니다.",
  "studio.producerError.vrmPaintArtifact.sourceByteLimitExceeded": "VRM 표면 페인팅 PNG가 개별 바이트 예산을 초과했습니다.",
  "studio.producerError.vrmPaintArtifact.blobSizeMismatch": "VRM 표면 페인팅 Blob 크기와 실제 바이트 수가 다릅니다.",
  "studio.producerError.vrmPaintArtifact.blobReadFailed": "VRM 표면 페인팅 Blob을 읽지 못했습니다.",
  "studio.producerError.vrmPaintArtifact.pngSignatureInvalid": "PNG signature 또는 전체 구조가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngChunkBoundsExceeded": "PNG chunk 수 또는 경계가 안전 범위를 벗어났습니다.",
  "studio.producerError.vrmPaintArtifact.pngChunkLengthOutOfBounds": "PNG chunk 길이가 파일 경계를 벗어났습니다.",
  "studio.producerError.vrmPaintArtifact.pngChunkTypeInvalid": "PNG chunk type 또는 reserved bit가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngUnsupportedCriticalChunk": "지원하지 않는 PNG critical chunk가 있습니다.",
  "studio.producerError.vrmPaintArtifact.pngChunkCrcMismatch": "PNG chunk CRC가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngFirstChunkNotIhdr": "PNG의 첫 chunk는 단일 13바이트 IHDR여야 합니다.",
  "studio.producerError.vrmPaintArtifact.pngIhdrProfileMismatch": "PNG IHDR 값이 표준 PNG profile과 일치하지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngIhdrDimensionMismatch": "PNG IHDR 해상도가 encoder 영수증과 일치하지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngDimensionLimitExceeded": "PNG IHDR 해상도가 축별 안전 한도를 초과했습니다.",
  "studio.producerError.vrmPaintArtifact.pngPixelLimitExceeded": "PNG IHDR 픽셀 수가 안전 예산을 초과했습니다.",
  "studio.producerError.vrmPaintArtifact.pngDuplicateIhdr": "PNG에 IHDR chunk가 중복되었습니다.",
  "studio.producerError.vrmPaintArtifact.pngPlteInvalid": "PNG PLTE chunk의 순서, 색상 profile 또는 길이가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngIdatSequenceInvalid": "PNG IDAT chunk가 비었거나 연속 순서를 벗어났습니다.",
  "studio.producerError.vrmPaintArtifact.pngPlteMissingForIndexed": "Indexed PNG에는 IDAT 앞에 PLTE가 필요합니다.",
  "studio.producerError.vrmPaintArtifact.pngIdatTotalExceeded": "PNG IDAT 합계가 안전 범위를 벗어났습니다.",
  "studio.producerError.vrmPaintArtifact.pngIendInvalid": "PNG IEND 또는 trailing bytes가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.pngStructureIncomplete": "PNG에 완전한 IHDR/IDAT/IEND 구조가 없습니다.",
  "studio.producerError.vrmPaintArtifact.cryptoUnavailable": "이 브라우저에서는 PNG SHA-256 무결성을 확인할 수 없습니다.",
  "studio.producerError.vrmPaintArtifact.hashComputeFailed": "PNG SHA-256 계산에 실패했습니다.",
  "studio.producerError.vrmPaintArtifact.hashResultLengthInvalid": "PNG SHA-256 결과 길이가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.contentHashFormatInvalid": "VRM 표면 페인팅 contentHash 형식이 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.metadataStructureInvalid": "VRM 표면 페인팅 artifact metadata 구조가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.metadataValueInvalid": "VRM 표면 페인팅 artifact metadata 값이 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.metadataByteLimitExceeded": "저장된 PNG metadata가 개별 바이트 예산을 초과했습니다.",
  "studio.producerError.vrmPaintArtifact.metadataDimensionLimitExceeded": "저장된 PNG metadata가 축별 해상도 한도를 초과했습니다.",
  "studio.producerError.vrmPaintArtifact.metadataPixelLimitExceeded": "저장된 PNG metadata가 픽셀 예산을 초과했습니다.",
  "studio.producerError.vrmPaintArtifact.storedHashMismatch": "저장된 VRM 표면 페인팅 PNG SHA-256이 metadata와 다릅니다.",
  "studio.producerError.vrmPaintArtifact.storedReceiptMismatch": "저장된 VRM 표면 페인팅 PNG receipt가 metadata와 다릅니다.",
  "studio.producerError.vrmPaintArtifact.artifactInputInvalid": "VRM 표면 페인팅 artifact 입력이 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.storedByteLengthMismatch": "저장된 VRM 표면 페인팅 PNG 바이트 수가 metadata와 다릅니다.",
  "studio.producerError.vrmPaintArtifact.decodedImageMetadataMismatch": "디코딩한 VRM 표면 페인팅 RGBA8 이미지가 PNG metadata와 일치하지 않습니다.",
  "studio.producerError.vrmPaintArtifact.decodedImageByteLengthMismatch": "디코딩한 VRM 표면 페인팅 RGBA8 바이트 수가 PNG 해상도와 일치하지 않습니다.",
  "studio.producerError.vrmPaintArtifact.decodeEnvironmentUnavailable": "이 환경에서는 PNG를 RGBA8 이미지로 디코딩할 수 없습니다.",
  "studio.producerError.vrmPaintArtifact.imageBitmapDecoderUnavailable": "이 브라우저에서는 PNG ImageBitmap 디코더를 사용할 수 없습니다.",
  "studio.producerError.vrmPaintArtifact.decoderStartFailed": "VRM 표면 페인팅 PNG 디코더를 시작하지 못했습니다.",
  "studio.producerError.vrmPaintArtifact.decodeFailed": "VRM 표면 페인팅 PNG를 디코딩하지 못했습니다.",
  "studio.producerError.vrmPaintArtifact.decodedDimensionMismatch": "디코딩한 PNG 해상도가 검증된 IHDR과 일치하지 않습니다.",
  "studio.producerError.vrmPaintArtifact.decodeCanvasFactoryInvalid": "PNG 디코딩 canvas factory가 올바르지 않습니다.",
  "studio.producerError.vrmPaintArtifact.decodeCanvasContextUnavailable": "PNG RGBA8 canvas context를 만들 수 없습니다.",
  "studio.producerError.vrmPaintArtifact.decodedPixelsReadFailed": "VRM 표면 페인팅 PNG의 RGBA8 픽셀을 읽지 못했습니다.",
  "studio.producerError.vrmPaintArtifact.customDecoderFailed": "VRM 표면 페인팅 PNG RGBA8 디코더가 실패했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vrmPaintArtifact.limitInvalidRange": "The {limitKey} limit must be a safe integer between 1 and {hardMaximum}.",
  "studio.producerError.vrmPaintArtifact.limitsInvalid": "The VRM surface paint PNG safety limits are invalid.",
  "studio.producerError.vrmPaintArtifact.bindingKeyInvalid": "The VRM surface paint bindingKey must be a normalized safe identifier.",
  "studio.producerError.vrmPaintArtifact.expectedDimensionInvalid": "The expected PNG dimensions are invalid.",
  "studio.producerError.vrmPaintArtifact.sourceTypeInvalid": "The VRM surface paint artifact must be a Blob or Uint8Array.",
  "studio.producerError.vrmPaintArtifact.blobMimeInvalid": "The VRM surface paint Blob MIME type must be image/png.",
  "studio.producerError.vrmPaintArtifact.sourceTooSmall": "The VRM surface paint PNG is empty or truncated.",
  "studio.producerError.vrmPaintArtifact.sourceByteLimitExceeded": "The VRM surface paint PNG exceeds the per-file byte budget.",
  "studio.producerError.vrmPaintArtifact.blobSizeMismatch": "The VRM surface paint Blob size differs from the actual byte count.",
  "studio.producerError.vrmPaintArtifact.blobReadFailed": "Could not read the VRM surface paint Blob.",
  "studio.producerError.vrmPaintArtifact.pngSignatureInvalid": "The PNG signature or overall structure is invalid.",
  "studio.producerError.vrmPaintArtifact.pngChunkBoundsExceeded": "The PNG chunk count or boundaries are outside the safe range.",
  "studio.producerError.vrmPaintArtifact.pngChunkLengthOutOfBounds": "The PNG chunk length exceeds the file boundaries.",
  "studio.producerError.vrmPaintArtifact.pngChunkTypeInvalid": "The PNG chunk type or reserved bit is invalid.",
  "studio.producerError.vrmPaintArtifact.pngUnsupportedCriticalChunk": "There is an unsupported PNG critical chunk.",
  "studio.producerError.vrmPaintArtifact.pngChunkCrcMismatch": "The PNG chunk CRC is invalid.",
  "studio.producerError.vrmPaintArtifact.pngFirstChunkNotIhdr": "The first PNG chunk must be a single 13-byte IHDR.",
  "studio.producerError.vrmPaintArtifact.pngIhdrProfileMismatch": "The PNG IHDR values do not match the standard PNG profile.",
  "studio.producerError.vrmPaintArtifact.pngIhdrDimensionMismatch": "The PNG IHDR dimensions do not match the encoder receipt.",
  "studio.producerError.vrmPaintArtifact.pngDimensionLimitExceeded": "The PNG IHDR dimensions exceed the per-axis safety limit.",
  "studio.producerError.vrmPaintArtifact.pngPixelLimitExceeded": "The PNG IHDR pixel count exceeds the safety budget.",
  "studio.producerError.vrmPaintArtifact.pngDuplicateIhdr": "The PNG has a duplicate IHDR chunk.",
  "studio.producerError.vrmPaintArtifact.pngPlteInvalid": "The PNG PLTE chunk order, color profile, or length is invalid.",
  "studio.producerError.vrmPaintArtifact.pngIdatSequenceInvalid": "A PNG IDAT chunk is empty or out of consecutive order.",
  "studio.producerError.vrmPaintArtifact.pngPlteMissingForIndexed": "An indexed PNG requires a PLTE before the IDAT.",
  "studio.producerError.vrmPaintArtifact.pngIdatTotalExceeded": "The PNG IDAT total is outside the safe range.",
  "studio.producerError.vrmPaintArtifact.pngIendInvalid": "The PNG IEND or trailing bytes are invalid.",
  "studio.producerError.vrmPaintArtifact.pngStructureIncomplete": "The PNG does not have a complete IHDR/IDAT/IEND structure.",
  "studio.producerError.vrmPaintArtifact.cryptoUnavailable": "PNG SHA-256 integrity cannot be verified in this browser.",
  "studio.producerError.vrmPaintArtifact.hashComputeFailed": "Failed to compute the PNG SHA-256.",
  "studio.producerError.vrmPaintArtifact.hashResultLengthInvalid": "The PNG SHA-256 result length is invalid.",
  "studio.producerError.vrmPaintArtifact.contentHashFormatInvalid": "The VRM surface paint contentHash format is invalid.",
  "studio.producerError.vrmPaintArtifact.metadataStructureInvalid": "The VRM surface paint artifact metadata structure is invalid.",
  "studio.producerError.vrmPaintArtifact.metadataValueInvalid": "The VRM surface paint artifact metadata values are invalid.",
  "studio.producerError.vrmPaintArtifact.metadataByteLimitExceeded": "The stored PNG metadata exceeds the per-file byte budget.",
  "studio.producerError.vrmPaintArtifact.metadataDimensionLimitExceeded": "The stored PNG metadata exceeds the per-axis dimension limit.",
  "studio.producerError.vrmPaintArtifact.metadataPixelLimitExceeded": "The stored PNG metadata exceeds the pixel budget.",
  "studio.producerError.vrmPaintArtifact.storedHashMismatch": "The stored VRM surface paint PNG SHA-256 differs from the metadata.",
  "studio.producerError.vrmPaintArtifact.storedReceiptMismatch": "The stored VRM surface paint PNG receipt differs from the metadata.",
  "studio.producerError.vrmPaintArtifact.artifactInputInvalid": "The VRM surface paint artifact input is invalid.",
  "studio.producerError.vrmPaintArtifact.storedByteLengthMismatch": "The stored VRM surface paint PNG byte count differs from the metadata.",
  "studio.producerError.vrmPaintArtifact.decodedImageMetadataMismatch": "The decoded VRM surface paint RGBA8 image does not match the PNG metadata.",
  "studio.producerError.vrmPaintArtifact.decodedImageByteLengthMismatch": "The decoded VRM surface paint RGBA8 byte count does not match the PNG dimensions.",
  "studio.producerError.vrmPaintArtifact.decodeEnvironmentUnavailable": "PNG cannot be decoded into an RGBA8 image in this environment.",
  "studio.producerError.vrmPaintArtifact.imageBitmapDecoderUnavailable": "The PNG ImageBitmap decoder is unavailable in this browser.",
  "studio.producerError.vrmPaintArtifact.decoderStartFailed": "Could not start the VRM surface paint PNG decoder.",
  "studio.producerError.vrmPaintArtifact.decodeFailed": "Could not decode the VRM surface paint PNG.",
  "studio.producerError.vrmPaintArtifact.decodedDimensionMismatch": "The decoded PNG dimensions do not match the verified IHDR.",
  "studio.producerError.vrmPaintArtifact.decodeCanvasFactoryInvalid": "The PNG decoding canvas factory is invalid.",
  "studio.producerError.vrmPaintArtifact.decodeCanvasContextUnavailable": "Could not create the PNG RGBA8 canvas context.",
  "studio.producerError.vrmPaintArtifact.decodedPixelsReadFailed": "Could not read the RGBA8 pixels of the VRM surface paint PNG.",
  "studio.producerError.vrmPaintArtifact.customDecoderFailed": "The VRM surface paint PNG RGBA8 decoder failed.",
});

/** 키가 있는 detail 52종만 등록한다. bundle/manifest/resolver 전용 detail과 aborted는 여기 없다. */
const ARTIFACT_ERROR_KEYS: Readonly<
  Partial<Record<StudioVrmTexturePaintArtifactErrorDetail, string>>
> = {
  limitInvalidRange: "studio.producerError.vrmPaintArtifact.limitInvalidRange",
  limitsInvalid: "studio.producerError.vrmPaintArtifact.limitsInvalid",
  bindingKeyInvalid: "studio.producerError.vrmPaintArtifact.bindingKeyInvalid",
  expectedDimensionInvalid: "studio.producerError.vrmPaintArtifact.expectedDimensionInvalid",
  sourceTypeInvalid: "studio.producerError.vrmPaintArtifact.sourceTypeInvalid",
  blobMimeInvalid: "studio.producerError.vrmPaintArtifact.blobMimeInvalid",
  sourceTooSmall: "studio.producerError.vrmPaintArtifact.sourceTooSmall",
  sourceByteLimitExceeded: "studio.producerError.vrmPaintArtifact.sourceByteLimitExceeded",
  blobSizeMismatch: "studio.producerError.vrmPaintArtifact.blobSizeMismatch",
  blobReadFailed: "studio.producerError.vrmPaintArtifact.blobReadFailed",
  pngSignatureInvalid: "studio.producerError.vrmPaintArtifact.pngSignatureInvalid",
  pngChunkBoundsExceeded: "studio.producerError.vrmPaintArtifact.pngChunkBoundsExceeded",
  pngChunkLengthOutOfBounds: "studio.producerError.vrmPaintArtifact.pngChunkLengthOutOfBounds",
  pngChunkTypeInvalid: "studio.producerError.vrmPaintArtifact.pngChunkTypeInvalid",
  pngUnsupportedCriticalChunk: "studio.producerError.vrmPaintArtifact.pngUnsupportedCriticalChunk",
  pngChunkCrcMismatch: "studio.producerError.vrmPaintArtifact.pngChunkCrcMismatch",
  pngFirstChunkNotIhdr: "studio.producerError.vrmPaintArtifact.pngFirstChunkNotIhdr",
  pngIhdrProfileMismatch: "studio.producerError.vrmPaintArtifact.pngIhdrProfileMismatch",
  pngIhdrDimensionMismatch: "studio.producerError.vrmPaintArtifact.pngIhdrDimensionMismatch",
  pngDimensionLimitExceeded: "studio.producerError.vrmPaintArtifact.pngDimensionLimitExceeded",
  pngPixelLimitExceeded: "studio.producerError.vrmPaintArtifact.pngPixelLimitExceeded",
  pngDuplicateIhdr: "studio.producerError.vrmPaintArtifact.pngDuplicateIhdr",
  pngPlteInvalid: "studio.producerError.vrmPaintArtifact.pngPlteInvalid",
  pngIdatSequenceInvalid: "studio.producerError.vrmPaintArtifact.pngIdatSequenceInvalid",
  pngPlteMissingForIndexed: "studio.producerError.vrmPaintArtifact.pngPlteMissingForIndexed",
  pngIdatTotalExceeded: "studio.producerError.vrmPaintArtifact.pngIdatTotalExceeded",
  pngIendInvalid: "studio.producerError.vrmPaintArtifact.pngIendInvalid",
  pngStructureIncomplete: "studio.producerError.vrmPaintArtifact.pngStructureIncomplete",
  cryptoUnavailable: "studio.producerError.vrmPaintArtifact.cryptoUnavailable",
  hashComputeFailed: "studio.producerError.vrmPaintArtifact.hashComputeFailed",
  hashResultLengthInvalid: "studio.producerError.vrmPaintArtifact.hashResultLengthInvalid",
  contentHashFormatInvalid: "studio.producerError.vrmPaintArtifact.contentHashFormatInvalid",
  metadataStructureInvalid: "studio.producerError.vrmPaintArtifact.metadataStructureInvalid",
  metadataValueInvalid: "studio.producerError.vrmPaintArtifact.metadataValueInvalid",
  metadataByteLimitExceeded: "studio.producerError.vrmPaintArtifact.metadataByteLimitExceeded",
  metadataDimensionLimitExceeded: "studio.producerError.vrmPaintArtifact.metadataDimensionLimitExceeded",
  metadataPixelLimitExceeded: "studio.producerError.vrmPaintArtifact.metadataPixelLimitExceeded",
  storedHashMismatch: "studio.producerError.vrmPaintArtifact.storedHashMismatch",
  storedReceiptMismatch: "studio.producerError.vrmPaintArtifact.storedReceiptMismatch",
  artifactInputInvalid: "studio.producerError.vrmPaintArtifact.artifactInputInvalid",
  storedByteLengthMismatch: "studio.producerError.vrmPaintArtifact.storedByteLengthMismatch",
  decodedImageMetadataMismatch: "studio.producerError.vrmPaintArtifact.decodedImageMetadataMismatch",
  decodedImageByteLengthMismatch: "studio.producerError.vrmPaintArtifact.decodedImageByteLengthMismatch",
  decodeEnvironmentUnavailable: "studio.producerError.vrmPaintArtifact.decodeEnvironmentUnavailable",
  imageBitmapDecoderUnavailable: "studio.producerError.vrmPaintArtifact.imageBitmapDecoderUnavailable",
  decoderStartFailed: "studio.producerError.vrmPaintArtifact.decoderStartFailed",
  decodeFailed: "studio.producerError.vrmPaintArtifact.decodeFailed",
  decodedDimensionMismatch: "studio.producerError.vrmPaintArtifact.decodedDimensionMismatch",
  decodeCanvasFactoryInvalid: "studio.producerError.vrmPaintArtifact.decodeCanvasFactoryInvalid",
  decodeCanvasContextUnavailable: "studio.producerError.vrmPaintArtifact.decodeCanvasContextUnavailable",
  decodedPixelsReadFailed: "studio.producerError.vrmPaintArtifact.decodedPixelsReadFailed",
  customDecoderFailed: "studio.producerError.vrmPaintArtifact.customDecoderFailed",
};

/** detail별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const ARTIFACT_ERROR_KO: Readonly<
  Partial<Record<StudioVrmTexturePaintArtifactErrorDetail, string>>
> = {
  limitInvalidRange: "{limitKey} 한도는 1 이상 {hardMaximum} 이하의 안전한 정수여야 합니다.",
  limitsInvalid: "VRM 표면 페인팅 PNG 안전 한도가 올바르지 않습니다.",
  bindingKeyInvalid: "VRM 표면 페인팅 bindingKey는 정규화된 안전 식별자여야 합니다.",
  expectedDimensionInvalid: "예상 PNG 해상도가 올바르지 않습니다.",
  sourceTypeInvalid: "VRM 표면 페인팅 artifact는 Blob 또는 Uint8Array여야 합니다.",
  blobMimeInvalid: "VRM 표면 페인팅 Blob MIME은 image/png여야 합니다.",
  sourceTooSmall: "VRM 표면 페인팅 PNG가 비었거나 잘렸습니다.",
  sourceByteLimitExceeded: "VRM 표면 페인팅 PNG가 개별 바이트 예산을 초과했습니다.",
  blobSizeMismatch: "VRM 표면 페인팅 Blob 크기와 실제 바이트 수가 다릅니다.",
  blobReadFailed: "VRM 표면 페인팅 Blob을 읽지 못했습니다.",
  pngSignatureInvalid: "PNG signature 또는 전체 구조가 올바르지 않습니다.",
  pngChunkBoundsExceeded: "PNG chunk 수 또는 경계가 안전 범위를 벗어났습니다.",
  pngChunkLengthOutOfBounds: "PNG chunk 길이가 파일 경계를 벗어났습니다.",
  pngChunkTypeInvalid: "PNG chunk type 또는 reserved bit가 올바르지 않습니다.",
  pngUnsupportedCriticalChunk: "지원하지 않는 PNG critical chunk가 있습니다.",
  pngChunkCrcMismatch: "PNG chunk CRC가 올바르지 않습니다.",
  pngFirstChunkNotIhdr: "PNG의 첫 chunk는 단일 13바이트 IHDR여야 합니다.",
  pngIhdrProfileMismatch: "PNG IHDR 값이 표준 PNG profile과 일치하지 않습니다.",
  pngIhdrDimensionMismatch: "PNG IHDR 해상도가 encoder 영수증과 일치하지 않습니다.",
  pngDimensionLimitExceeded: "PNG IHDR 해상도가 축별 안전 한도를 초과했습니다.",
  pngPixelLimitExceeded: "PNG IHDR 픽셀 수가 안전 예산을 초과했습니다.",
  pngDuplicateIhdr: "PNG에 IHDR chunk가 중복되었습니다.",
  pngPlteInvalid: "PNG PLTE chunk의 순서, 색상 profile 또는 길이가 올바르지 않습니다.",
  pngIdatSequenceInvalid: "PNG IDAT chunk가 비었거나 연속 순서를 벗어났습니다.",
  pngPlteMissingForIndexed: "Indexed PNG에는 IDAT 앞에 PLTE가 필요합니다.",
  pngIdatTotalExceeded: "PNG IDAT 합계가 안전 범위를 벗어났습니다.",
  pngIendInvalid: "PNG IEND 또는 trailing bytes가 올바르지 않습니다.",
  pngStructureIncomplete: "PNG에 완전한 IHDR/IDAT/IEND 구조가 없습니다.",
  cryptoUnavailable: "이 브라우저에서는 PNG SHA-256 무결성을 확인할 수 없습니다.",
  hashComputeFailed: "PNG SHA-256 계산에 실패했습니다.",
  hashResultLengthInvalid: "PNG SHA-256 결과 길이가 올바르지 않습니다.",
  contentHashFormatInvalid: "VRM 표면 페인팅 contentHash 형식이 올바르지 않습니다.",
  metadataStructureInvalid: "VRM 표면 페인팅 artifact metadata 구조가 올바르지 않습니다.",
  metadataValueInvalid: "VRM 표면 페인팅 artifact metadata 값이 올바르지 않습니다.",
  metadataByteLimitExceeded: "저장된 PNG metadata가 개별 바이트 예산을 초과했습니다.",
  metadataDimensionLimitExceeded: "저장된 PNG metadata가 축별 해상도 한도를 초과했습니다.",
  metadataPixelLimitExceeded: "저장된 PNG metadata가 픽셀 예산을 초과했습니다.",
  storedHashMismatch: "저장된 VRM 표면 페인팅 PNG SHA-256이 metadata와 다릅니다.",
  storedReceiptMismatch: "저장된 VRM 표면 페인팅 PNG receipt가 metadata와 다릅니다.",
  artifactInputInvalid: "VRM 표면 페인팅 artifact 입력이 올바르지 않습니다.",
  storedByteLengthMismatch: "저장된 VRM 표면 페인팅 PNG 바이트 수가 metadata와 다릅니다.",
  decodedImageMetadataMismatch: "디코딩한 VRM 표면 페인팅 RGBA8 이미지가 PNG metadata와 일치하지 않습니다.",
  decodedImageByteLengthMismatch: "디코딩한 VRM 표면 페인팅 RGBA8 바이트 수가 PNG 해상도와 일치하지 않습니다.",
  decodeEnvironmentUnavailable: "이 환경에서는 PNG를 RGBA8 이미지로 디코딩할 수 없습니다.",
  imageBitmapDecoderUnavailable: "이 브라우저에서는 PNG ImageBitmap 디코더를 사용할 수 없습니다.",
  decoderStartFailed: "VRM 표면 페인팅 PNG 디코더를 시작하지 못했습니다.",
  decodeFailed: "VRM 표면 페인팅 PNG를 디코딩하지 못했습니다.",
  decodedDimensionMismatch: "디코딩한 PNG 해상도가 검증된 IHDR과 일치하지 않습니다.",
  decodeCanvasFactoryInvalid: "PNG 디코딩 canvas factory가 올바르지 않습니다.",
  decodeCanvasContextUnavailable: "PNG RGBA8 canvas context를 만들 수 없습니다.",
  decodedPixelsReadFailed: "VRM 표면 페인팅 PNG의 RGBA8 픽셀을 읽지 못했습니다.",
  customDecoderFailed: "VRM 표면 페인팅 PNG RGBA8 디코더가 실패했습니다.",
};

/**
 * 표시 지점 전용 해석 (vrmPaintArtifact): 생산자가 방출한 detail+params를 현재 로케일
 * 문구로 바꾼다. 키가 없는 detail(bundle 전용·aborted)은 null — 호출자는 기존 경로로 폴백한다.
 */
export function resolveStudioVrmTexturePaintArtifactError(error: {
  readonly detail: StudioVrmTexturePaintArtifactErrorDetail;
  readonly params?: Readonly<Record<string, string>>;
}): string | null {
  const key = ARTIFACT_ERROR_KEYS[error.detail];
  const fallback = ARTIFACT_ERROR_KO[error.detail];
  if (!key || !fallback) return null;
  return resolveProducerError(key, fallback, error.params);
}

/**
 * 표시 지점 전용 해석 (vrmPaintArtifact, 원인 객체 진입점): RuntimeA rehydrate catch와
 * RuntimeE persist catch가 원인 객체만으로 부른다. 생산자 클래스를 런타임 import하면
 * 진입 그래프에 artifact 생산자가 끌려오므로, 이름+detail 덕 타이핑으로 판정한다.
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveStudioVrmTexturePaintArtifactErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, detail, params } = cause as {
    name?: unknown; detail?: unknown; params?: unknown;
  };
  if (name !== "StudioVrmTexturePaintArtifactError") return null;
  if (typeof detail !== "string" || !Object.hasOwn(ARTIFACT_ERROR_KEYS, detail)) return null;
  const safeParams =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Readonly<Record<string, string>>)
      : undefined;
  return resolveStudioVrmTexturePaintArtifactError({
    detail: detail as StudioVrmTexturePaintArtifactErrorDetail,
    ...(safeParams ? { params: safeParams } : {}),
  });
}
