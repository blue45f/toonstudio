/**
 * 생산자 구조화 에러 해석 모듈 — live raster 구간: studio-crdt-raster-patch-publisher
 * 코드 39종 + studio-crdt-raster-replay-runtime 코드 57종 (A4 D4, R12).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간과 같은 분할 관례로 파일
 * 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다: 생산자는 {code, params}만
 * 방출하고, 표시는 이 모듈의 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과
 * 글자 단위 동일하고, en은 신규 번역이다. invalid-png·invalid-dependencies처럼
 * 한 코드에 서로 다른 원문이 있던 지점은 지점별 서브코드로 분리했다.
 * params.label은 표시 라벨 자체가 아니라 라벨 코드(actor·page·layer 등)를 싣고,
 * 라벨 문구는 이 모듈의 로케일별 라벨 표로 해석한다(tm 필드 라벨 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

import type {
  StudioRasterPatchPublicationError,
  StudioRasterPatchPublicationErrorCode,
} from "../live/studio-crdt-raster-patch-publisher";
import type {
  StudioRasterReplayRuntimeErrorCode,
} from "../live/studio-crdt-raster-replay-runtime";

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
  "studio.producerError.liveRasterPatch.layerWriteGuardFailed": "레이어 잠금 상태를 확인하지 못했습니다.",
  "studio.producerError.liveRasterPatch.invalidLayerWriteGuardResult": "레이어 쓰기 정책은 boolean을 반환해야 합니다.",
  "studio.producerError.liveRasterPatch.layerLocked": "잠긴 레이어에는 실시간 픽셀 획을 게시할 수 없습니다.",
  "studio.producerError.liveRasterPatch.invalidId": "{label} 식별자가 올바르지 않습니다.",
  "studio.producerError.liveRasterPatch.invalidOperationId": "래스터 작업 ID는 소문자 UUID여야 합니다.",
  "studio.producerError.liveRasterPatch.invalidLogicalClock": "Lamport 시계는 uint64 범위의 정규 십진 문자열이어야 합니다.",
  "studio.producerError.liveRasterPatch.unsupportedIntent": "현재 게시 파이프라인은 paint/erase/fill/clear만 지원합니다.",
  "studio.producerError.liveRasterPatch.invalidSemanticHash": "도구 의미 해시는 소문자 SHA-256이어야 합니다.",
  "studio.producerError.liveRasterPatch.invalidRect": "패치 영역은 x/y/width/height만 포함해야 합니다.",
  "studio.producerError.liveRasterPatch.invalidRectValue": "패치 {key}는 안전한 정수여야 합니다.",
  "studio.producerError.liveRasterPatch.patchOutOfBounds": "문서 픽셀 영역이 래스터 표면 경계를 벗어났습니다.",
  "studio.producerError.liveRasterPatch.inputByteBudget": "래스터 입력 픽셀이 클라이언트 메모리 예산을 초과했습니다.",
  "studio.producerError.liveRasterPatch.imageDataDimensionMismatch": "ImageData 크기가 문서 패치 영역과 일치하지 않습니다.",
  "studio.producerError.liveRasterPatch.invalidRgba": "RGBA 픽셀은 ImageData 또는 8비트 typed array여야 합니다.",
  "studio.producerError.liveRasterPatch.rgbaLengthMismatch": "RGBA 바이트 길이가 패치 픽셀 수와 일치하지 않습니다.",
  "studio.producerError.liveRasterPatch.patchCountBudget": "불투명 타일 패치 수가 작업별 예산을 초과했습니다.",
  "studio.producerError.liveRasterPatch.sha256Unavailable": "이 브라우저에서는 SHA-256을 사용할 수 없습니다.",
  "studio.producerError.liveRasterPatch.invalidSha256Result": "SHA-256 구현이 소문자 64자리 digest를 반환하지 않았습니다.",
  "studio.producerError.liveRasterPatch.invalidPngSignature": "인코더가 올바른 PNG 서명을 반환하지 않았습니다.",
  "studio.producerError.liveRasterPatch.invalidPngIhdr": "인코더 PNG에 표준 IHDR가 없습니다.",
  "studio.producerError.liveRasterPatch.encodedDimensionMismatch": "인코더 PNG 크기가 타일 패치 크기와 일치하지 않습니다.",
  "studio.producerError.liveRasterPatch.invalidOption": "{label} 값이 허용 범위를 벗어났습니다.",
  "studio.producerError.liveRasterPatch.uploadReceiptMismatch": "업로드 영수증이 content-addressed PNG 참조와 정확히 일치하지 않습니다.",
  "studio.producerError.liveRasterPatch.invalidDependencies": "래스터 게시 의존성이 필요합니다.",
  "studio.producerError.liveRasterPatch.invalidDependencyFunctions": "인코더, 업로더, CRDT append 및 선택적 SHA-256 함수가 올바르지 않습니다.",
  "studio.producerError.liveRasterPatch.rawSha256Collision": "서로 다른 RGBA 패치가 같은 SHA-256 식별자를 만들었습니다.",
  "studio.producerError.liveRasterPatch.invalidEncoderResult": "인코더는 bytes와 image/png 미디어 타입만 반환해야 합니다.",
  "studio.producerError.liveRasterPatch.assetByteBudget": "인코딩된 PNG 크기가 자산별 예산을 벗어났습니다.",
  "studio.producerError.liveRasterPatch.encodedSha256Collision": "같은 PNG SHA-256이 다른 픽셀 크기나 바이트를 가리킵니다.",
  "studio.producerError.liveRasterPatch.totalByteBudget": "고유 PNG 패치 전체 크기가 작업별 예산을 초과했습니다.",
  "studio.producerError.liveRasterPatch.internalAssetMapping": "타일 패치 자산 매핑을 만들지 못했습니다.",
  "studio.producerError.liveRasterPatch.pngExportUnavailable": "캔버스가 PNG Blob 내보내기를 지원하지 않습니다.",
  "studio.producerError.liveRasterPatch.canvasContextUnavailable": "PNG 캔버스 2D context를 만들지 못했습니다.",
  "studio.producerError.liveRasterPatch.invalidCanvasImageData": "캔버스 ImageData 버퍼 크기가 패치와 일치하지 않습니다.",
  "studio.producerError.liveRasterPatch.pngMediaTypeMismatch": "캔버스가 PNG가 아닌 형식을 반환했습니다.",
  "studio.producerError.liveRasterPatch.canvasUnavailable": "선택한 {backend} PNG 백엔드를 사용할 수 없습니다.",
  "studio.producerError.liveRasterPatch.aborted": "래스터 패치 게시가 취소되었습니다.",
  "studio.producerError.liveRasterPatch.cleanupTimeout": "래스터 업로드 정리 제한 시간이 지났습니다.",
  "studio.producerError.liveRasterPatch.uploadIncomplete": "PNG 인코딩에 실패했습니다.",
  "studio.producerError.liveRasterPatch.publishPrefix": "실시간 픽셀 획 게시: ",
  "studio.producerError.liveRasterPatch.publishSuffix": " 기존 벡터 획은 안전하게 유지됩니다.",
  "studio.producerError.liveRasterPatch.publishFallback": "실시간 픽셀 획을 게시하지 못해 기존 벡터 획을 유지했습니다.",
  "studio.producerError.liveRasterReplay.invalidOption": "{label} 값이 허용 범위를 벗어났습니다.",
  "studio.producerError.liveRasterReplay.invalidWorkId": "작업 범위 식별자가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngChunkType": "PNG 청크 타입 또는 예약 비트가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngSignature": "래스터 자산 {assetId}에 PNG 서명이 없습니다.",
  "studio.producerError.liveRasterReplay.pngChunkLimit": "래스터 자산 {assetId}의 PNG 청크 수가 안전 한도를 넘었습니다.",
  "studio.producerError.liveRasterReplay.invalidPngChunkTruncated": "래스터 자산 {assetId}의 PNG 청크가 잘렸습니다.",
  "studio.producerError.liveRasterReplay.invalidPngChunkLength": "래스터 자산 {assetId}의 PNG 청크 길이가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngCrc": "래스터 자산 {assetId}의 PNG 청크 CRC가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.animatedPngUnsupported": "래스터 CRDT 자산은 정적 PNG만 사용할 수 있습니다.",
  "studio.producerError.liveRasterReplay.unsupportedPngCriticalChunk": "지원하지 않는 PNG 필수 청크({typeName})가 있습니다.",
  "studio.producerError.liveRasterReplay.invalidPngFirstChunk": "래스터 자산 {assetId}의 첫 청크가 IHDR가 아닙니다.",
  "studio.producerError.liveRasterReplay.assetDimensionMismatch": "래스터 자산 {assetId}의 PNG 크기가 참조와 다릅니다.",
  "studio.producerError.liveRasterReplay.unsupportedPngProfile": "래스터 자산 {assetId}은 8-bit RGBA 비인터레이스 PNG가 아닙니다.",
  "studio.producerError.liveRasterReplay.invalidPngDuplicateIhdr": "래스터 자산 {assetId}에 IHDR가 중복되었습니다.",
  "studio.producerError.liveRasterReplay.invalidPngPalette": "래스터 자산 {assetId}의 PLTE 청크가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngIdatSequence": "래스터 자산 {assetId}의 IDAT 청크가 비어 있거나 연속되지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngIend": "래스터 자산 {assetId}의 IEND 또는 후행 바이트가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngZlibHeader": "래스터 자산 {assetId}의 IDAT zlib 헤더가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.invalidPngMissingIdatIend": "래스터 자산 {assetId}에 IDAT/IEND가 없습니다.",
  "studio.producerError.liveRasterReplay.sha256Unavailable": "이 브라우저에서는 SHA-256을 사용할 수 없습니다.",
  "studio.producerError.liveRasterReplay.invalidSha256Result": "SHA-256 구현이 소문자 64자리 digest를 반환하지 않았습니다.",
  "studio.producerError.liveRasterReplay.assetByteLengthMismatch": "래스터 자산 {assetId} 바이트 길이가 참조와 다릅니다.",
  "studio.producerError.liveRasterReplay.assetBlobMismatch": "래스터 자산 {assetId} Blob 메타데이터가 참조와 다릅니다.",
  "studio.producerError.liveRasterReplay.invalidDownloadResult": "래스터 자산 {assetId} 다운로드 결과가 바이트나 Blob이 아닙니다.",
  "studio.producerError.liveRasterReplay.invalidDecodedPng": "래스터 자산 {assetId} 디코드 결과가 올바르지 않습니다.",
  "studio.producerError.liveRasterReplay.decodedRgbaLengthMismatch": "래스터 자산 {assetId} RGBA 길이가 크기와 다릅니다.",
  "studio.producerError.liveRasterReplay.unsupportedMediaType": "브라우저 래스터 재생기는 PNG 자산만 디코드합니다.",
  "studio.producerError.liveRasterReplay.pngDecoderUnavailable": "이 브라우저에서는 createImageBitmap을 사용할 수 없습니다.",
  "studio.producerError.liveRasterReplay.decodedDimensionMismatch": "디코드된 PNG 크기가 자산 참조와 다릅니다.",
  "studio.producerError.liveRasterReplay.canvasContextUnavailable": "PNG readback 캔버스를 만들 수 없습니다.",
  "studio.producerError.liveRasterReplay.canvasUnavailable": "PNG readback 캔버스를 만들 수 없습니다.",
  "studio.producerError.liveRasterReplay.canvasContextUnavailableHtml": "PNG readback 컨텍스트를 만들 수 없습니다.",
  "studio.producerError.liveRasterReplay.visibleFilterFailed": "표시 타일 필터 실행에 실패했습니다.",
  "studio.producerError.liveRasterReplay.invalidVisibleFilterResult": "표시 타일 필터는 boolean을 반환해야 합니다.",
  "studio.producerError.liveRasterReplay.checkpointSurfaceMismatch": "checkpoint와 래스터 작업 로그의 표면이 일치하지 않습니다.",
  "studio.producerError.liveRasterReplay.checkpointOperationMismatch": "checkpoint 봉인 경계와 래스터 작업 로그의 operation 집합이 일치하지 않습니다.",
  "studio.producerError.liveRasterReplay.checkpointUndoHorizon": "checkpoint으로 봉인된 작업을 뒤늦게 실행 취소할 수 없습니다.",
  "studio.producerError.liveRasterReplay.checkpointUndoRestoreHorizon": "checkpoint으로 봉인된 실행 취소를 뒤늦게 복원할 수 없습니다.",
  "studio.producerError.liveRasterReplay.assetIdentityConflict": "checkpoint와 tail이 같은 자산 ID {assetId}에 서로 다른 내용을 선언합니다.",
  "studio.producerError.liveRasterReplay.residentMemoryBudget": "표시 타일, 디코드 자산, 동시 다운로드 및 해시 복사본이 래스터 재생 메모리 예산을 초과했습니다.",
  "studio.producerError.liveRasterReplay.assetNotPng": "래스터 자산 {assetId}은 PNG가 아닙니다.",
  "studio.producerError.liveRasterReplay.assetByteBudget": "래스터 자산 {assetId} 크기가 허용 범위를 벗어났습니다.",
  "studio.producerError.liveRasterReplay.assetDownloadFailed": "래스터 자산 {assetId} 다운로드에 실패했습니다.",
  "studio.producerError.liveRasterReplay.assetSha256Mismatch": "래스터 자산 {assetId} 내용 해시가 참조와 다릅니다.",
  "studio.producerError.liveRasterReplay.pngDecodeFailed": "래스터 자산 {assetId} 디코드에 실패했습니다.",
  "studio.producerError.liveRasterReplay.assetCacheIncomplete": "재생에 필요한 래스터 자산이 검증 캐시에 없습니다.",
  "studio.producerError.liveRasterReplay.invalidRequest": "래스터 재생 요청이 필요합니다.",
  "studio.producerError.liveRasterReplay.invalidDependencies": "래스터 자산 downloader가 필요합니다.",
  "studio.producerError.liveRasterReplay.invalidDecoder": "PNG decoder가 함수가 아닙니다.",
  "studio.producerError.liveRasterReplay.invalidSha256Implementation": "SHA-256 구현이 함수가 아닙니다.",
  "studio.producerError.liveRasterReplay.invalidVisibleFilter": "표시 타일 필터가 함수가 아닙니다.",
  "studio.producerError.liveRasterReplay.checkpointAssetCacheIncomplete": "checkpoint 타일 자산이 검증 캐시에 없습니다.",
  "studio.producerError.liveRasterReplay.tileDependencyIncomplete": "조건부 교체 타일 의존성이 누락되었습니다.",
  "studio.producerError.liveRasterReplay.patchTileMissing": "래스터 패치 대상 타일이 누락되었습니다.",
  "studio.producerError.liveRasterReplay.outputTileMissing": "출력 타일이 재생 집합에 없습니다.",
  "studio.producerError.liveRasterReplay.aborted": "래스터 CRDT 재생이 취소되었습니다.",
  "studio.producerError.liveRasterReplay.browserPngDecodeFailed": "래스터 자산 {assetId} PNG 디코드에 실패했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.liveRasterPatch.layerWriteGuardFailed": "Could not verify the layer lock state.",
  "studio.producerError.liveRasterPatch.invalidLayerWriteGuardResult": "The layer write policy must return a boolean.",
  "studio.producerError.liveRasterPatch.layerLocked": "Realtime pixel strokes cannot be published to a locked layer.",
  "studio.producerError.liveRasterPatch.invalidId": "The {label} identifier is invalid.",
  "studio.producerError.liveRasterPatch.invalidOperationId": "The raster operation ID must be a lowercase UUID.",
  "studio.producerError.liveRasterPatch.invalidLogicalClock": "The Lamport clock must be a canonical decimal string in the uint64 range.",
  "studio.producerError.liveRasterPatch.unsupportedIntent": "The current publishing pipeline supports only paint/erase/fill/clear.",
  "studio.producerError.liveRasterPatch.invalidSemanticHash": "The tool semantic hash must be a lowercase SHA-256.",
  "studio.producerError.liveRasterPatch.invalidRect": "The patch region must contain only x/y/width/height.",
  "studio.producerError.liveRasterPatch.invalidRectValue": "Patch {key} must be a safe integer.",
  "studio.producerError.liveRasterPatch.patchOutOfBounds": "The document pixel region is outside the raster surface bounds.",
  "studio.producerError.liveRasterPatch.inputByteBudget": "The raster input pixels exceed the client memory budget.",
  "studio.producerError.liveRasterPatch.imageDataDimensionMismatch": "The ImageData size does not match the document patch region.",
  "studio.producerError.liveRasterPatch.invalidRgba": "RGBA pixels must be ImageData or an 8-bit typed array.",
  "studio.producerError.liveRasterPatch.rgbaLengthMismatch": "The RGBA byte length does not match the patch pixel count.",
  "studio.producerError.liveRasterPatch.patchCountBudget": "The number of opaque tile patches exceeds the per-operation budget.",
  "studio.producerError.liveRasterPatch.sha256Unavailable": "SHA-256 is unavailable in this browser.",
  "studio.producerError.liveRasterPatch.invalidSha256Result": "The SHA-256 implementation did not return a lowercase 64-digit digest.",
  "studio.producerError.liveRasterPatch.invalidPngSignature": "The encoder did not return a valid PNG signature.",
  "studio.producerError.liveRasterPatch.invalidPngIhdr": "The encoder PNG has no standard IHDR.",
  "studio.producerError.liveRasterPatch.encodedDimensionMismatch": "The encoder PNG size does not match the tile patch size.",
  "studio.producerError.liveRasterPatch.invalidOption": "The {label} value is out of the allowed range.",
  "studio.producerError.liveRasterPatch.uploadReceiptMismatch": "The upload receipt does not exactly match the content-addressed PNG reference.",
  "studio.producerError.liveRasterPatch.invalidDependencies": "Raster publishing dependencies are required.",
  "studio.producerError.liveRasterPatch.invalidDependencyFunctions": "The encoder, uploader, CRDT append, and optional SHA-256 functions are invalid.",
  "studio.producerError.liveRasterPatch.rawSha256Collision": "Different RGBA patches produced the same SHA-256 identifier.",
  "studio.producerError.liveRasterPatch.invalidEncoderResult": "The encoder must return only bytes and the image/png media type.",
  "studio.producerError.liveRasterPatch.assetByteBudget": "The encoded PNG size is out of the per-asset budget.",
  "studio.producerError.liveRasterPatch.encodedSha256Collision": "The same PNG SHA-256 refers to different pixel dimensions or bytes.",
  "studio.producerError.liveRasterPatch.totalByteBudget": "The total size of unique PNG patches exceeds the per-operation budget.",
  "studio.producerError.liveRasterPatch.internalAssetMapping": "Could not create the tile patch asset mapping.",
  "studio.producerError.liveRasterPatch.pngExportUnavailable": "The canvas does not support exporting a PNG Blob.",
  "studio.producerError.liveRasterPatch.canvasContextUnavailable": "Could not create the PNG canvas 2D context.",
  "studio.producerError.liveRasterPatch.invalidCanvasImageData": "The canvas ImageData buffer size does not match the patch.",
  "studio.producerError.liveRasterPatch.pngMediaTypeMismatch": "The canvas returned a format other than PNG.",
  "studio.producerError.liveRasterPatch.canvasUnavailable": "The selected {backend} PNG backend is unavailable.",
  "studio.producerError.liveRasterPatch.aborted": "Raster patch publication was cancelled.",
  "studio.producerError.liveRasterPatch.cleanupTimeout": "The raster upload cleanup time limit was exceeded.",
  "studio.producerError.liveRasterPatch.uploadIncomplete": "PNG encoding failed.",
  "studio.producerError.liveRasterPatch.publishPrefix": "Realtime pixel stroke publication: ",
  "studio.producerError.liveRasterPatch.publishSuffix": " The existing vector strokes are kept safely.",
  "studio.producerError.liveRasterPatch.publishFallback": "Could not publish the realtime pixel stroke, so the existing vector strokes were kept.",
  "studio.producerError.liveRasterReplay.invalidOption": "The {label} value is out of the allowed range.",
  "studio.producerError.liveRasterReplay.invalidWorkId": "The work scope identifier is invalid.",
  "studio.producerError.liveRasterReplay.invalidPngChunkType": "The PNG chunk type or reserved bit is invalid.",
  "studio.producerError.liveRasterReplay.invalidPngSignature": "Raster asset {assetId} has no PNG signature.",
  "studio.producerError.liveRasterReplay.pngChunkLimit": "Raster asset {assetId} has more PNG chunks than the safety limit.",
  "studio.producerError.liveRasterReplay.invalidPngChunkTruncated": "A PNG chunk of raster asset {assetId} is truncated.",
  "studio.producerError.liveRasterReplay.invalidPngChunkLength": "A PNG chunk length of raster asset {assetId} is invalid.",
  "studio.producerError.liveRasterReplay.invalidPngCrc": "A PNG chunk CRC of raster asset {assetId} is invalid.",
  "studio.producerError.liveRasterReplay.animatedPngUnsupported": "Raster CRDT assets can only use static PNGs.",
  "studio.producerError.liveRasterReplay.unsupportedPngCriticalChunk": "There is an unsupported PNG critical chunk ({typeName}).",
  "studio.producerError.liveRasterReplay.invalidPngFirstChunk": "The first chunk of raster asset {assetId} is not IHDR.",
  "studio.producerError.liveRasterReplay.assetDimensionMismatch": "The PNG size of raster asset {assetId} differs from the reference.",
  "studio.producerError.liveRasterReplay.unsupportedPngProfile": "Raster asset {assetId} is not an 8-bit RGBA non-interlaced PNG.",
  "studio.producerError.liveRasterReplay.invalidPngDuplicateIhdr": "Raster asset {assetId} has a duplicate IHDR.",
  "studio.producerError.liveRasterReplay.invalidPngPalette": "The PLTE chunk of raster asset {assetId} is invalid.",
  "studio.producerError.liveRasterReplay.invalidPngIdatSequence": "The IDAT chunks of raster asset {assetId} are empty or not contiguous.",
  "studio.producerError.liveRasterReplay.invalidPngIend": "The IEND or trailing bytes of raster asset {assetId} are invalid.",
  "studio.producerError.liveRasterReplay.invalidPngZlibHeader": "The IDAT zlib header of raster asset {assetId} is invalid.",
  "studio.producerError.liveRasterReplay.invalidPngMissingIdatIend": "Raster asset {assetId} has no IDAT/IEND.",
  "studio.producerError.liveRasterReplay.sha256Unavailable": "SHA-256 is unavailable in this browser.",
  "studio.producerError.liveRasterReplay.invalidSha256Result": "The SHA-256 implementation did not return a lowercase 64-digit digest.",
  "studio.producerError.liveRasterReplay.assetByteLengthMismatch": "The byte length of raster asset {assetId} differs from the reference.",
  "studio.producerError.liveRasterReplay.assetBlobMismatch": "The Blob metadata of raster asset {assetId} differs from the reference.",
  "studio.producerError.liveRasterReplay.invalidDownloadResult": "The download result for raster asset {assetId} is neither bytes nor a Blob.",
  "studio.producerError.liveRasterReplay.invalidDecodedPng": "The decode result for raster asset {assetId} is invalid.",
  "studio.producerError.liveRasterReplay.decodedRgbaLengthMismatch": "The RGBA length of raster asset {assetId} differs from its size.",
  "studio.producerError.liveRasterReplay.unsupportedMediaType": "The browser raster player decodes only PNG assets.",
  "studio.producerError.liveRasterReplay.pngDecoderUnavailable": "createImageBitmap is unavailable in this browser.",
  "studio.producerError.liveRasterReplay.decodedDimensionMismatch": "The decoded PNG size differs from the asset reference.",
  "studio.producerError.liveRasterReplay.canvasContextUnavailable": "Could not create the PNG readback canvas.",
  "studio.producerError.liveRasterReplay.canvasUnavailable": "Could not create the PNG readback canvas.",
  "studio.producerError.liveRasterReplay.canvasContextUnavailableHtml": "Could not create the PNG readback context.",
  "studio.producerError.liveRasterReplay.visibleFilterFailed": "The visible tile filter failed to run.",
  "studio.producerError.liveRasterReplay.invalidVisibleFilterResult": "The visible tile filter must return a boolean.",
  "studio.producerError.liveRasterReplay.checkpointSurfaceMismatch": "The checkpoint and raster operation log surfaces do not match.",
  "studio.producerError.liveRasterReplay.checkpointOperationMismatch": "The checkpoint sealed boundary does not match the operation set of the raster operation log.",
  "studio.producerError.liveRasterReplay.checkpointUndoHorizon": "An operation sealed by the checkpoint cannot be undone later.",
  "studio.producerError.liveRasterReplay.checkpointUndoRestoreHorizon": "An undo sealed by the checkpoint cannot be restored later.",
  "studio.producerError.liveRasterReplay.assetIdentityConflict": "The checkpoint and tail declare different contents for the same asset ID {assetId}.",
  "studio.producerError.liveRasterReplay.residentMemoryBudget": "The visible tiles, decoded assets, concurrent downloads, and hash copies exceed the raster replay memory budget.",
  "studio.producerError.liveRasterReplay.assetNotPng": "Raster asset {assetId} is not a PNG.",
  "studio.producerError.liveRasterReplay.assetByteBudget": "The size of raster asset {assetId} is out of the allowed range.",
  "studio.producerError.liveRasterReplay.assetDownloadFailed": "Failed to download raster asset {assetId}.",
  "studio.producerError.liveRasterReplay.assetSha256Mismatch": "The content hash of raster asset {assetId} differs from the reference.",
  "studio.producerError.liveRasterReplay.pngDecodeFailed": "Failed to decode raster asset {assetId}.",
  "studio.producerError.liveRasterReplay.assetCacheIncomplete": "A raster asset required for replay is not in the verified cache.",
  "studio.producerError.liveRasterReplay.invalidRequest": "A raster replay request is required.",
  "studio.producerError.liveRasterReplay.invalidDependencies": "A raster asset downloader is required.",
  "studio.producerError.liveRasterReplay.invalidDecoder": "The PNG decoder is not a function.",
  "studio.producerError.liveRasterReplay.invalidSha256Implementation": "The SHA-256 implementation is not a function.",
  "studio.producerError.liveRasterReplay.invalidVisibleFilter": "The visible tile filter is not a function.",
  "studio.producerError.liveRasterReplay.checkpointAssetCacheIncomplete": "A checkpoint tile asset is not in the verified cache.",
  "studio.producerError.liveRasterReplay.tileDependencyIncomplete": "A conditional replacement tile dependency is missing.",
  "studio.producerError.liveRasterReplay.patchTileMissing": "The raster patch target tile is missing.",
  "studio.producerError.liveRasterReplay.outputTileMissing": "The output tile is not in the replay set.",
  "studio.producerError.liveRasterReplay.aborted": "Raster CRDT replay was cancelled.",
  "studio.producerError.liveRasterReplay.browserPngDecodeFailed": "Failed to decode the PNG of raster asset {assetId}.",
});

const PATCH_ERROR_KEYS: Readonly<Record<string, string>> = {
  "layer-write-guard-failed": "studio.producerError.liveRasterPatch.layerWriteGuardFailed",
  "invalid-layer-write-guard-result": "studio.producerError.liveRasterPatch.invalidLayerWriteGuardResult",
  "layer-locked": "studio.producerError.liveRasterPatch.layerLocked",
  "invalid-id": "studio.producerError.liveRasterPatch.invalidId",
  "invalid-operation-id": "studio.producerError.liveRasterPatch.invalidOperationId",
  "invalid-logical-clock": "studio.producerError.liveRasterPatch.invalidLogicalClock",
  "unsupported-intent": "studio.producerError.liveRasterPatch.unsupportedIntent",
  "invalid-semantic-hash": "studio.producerError.liveRasterPatch.invalidSemanticHash",
  "invalid-rect": "studio.producerError.liveRasterPatch.invalidRect",
  "invalid-rect-value": "studio.producerError.liveRasterPatch.invalidRectValue",
  "patch-out-of-bounds": "studio.producerError.liveRasterPatch.patchOutOfBounds",
  "input-byte-budget": "studio.producerError.liveRasterPatch.inputByteBudget",
  "image-data-dimension-mismatch": "studio.producerError.liveRasterPatch.imageDataDimensionMismatch",
  "invalid-rgba": "studio.producerError.liveRasterPatch.invalidRgba",
  "rgba-length-mismatch": "studio.producerError.liveRasterPatch.rgbaLengthMismatch",
  "patch-count-budget": "studio.producerError.liveRasterPatch.patchCountBudget",
  "sha256-unavailable": "studio.producerError.liveRasterPatch.sha256Unavailable",
  "invalid-sha256-result": "studio.producerError.liveRasterPatch.invalidSha256Result",
  "invalid-png-signature": "studio.producerError.liveRasterPatch.invalidPngSignature",
  "invalid-png-ihdr": "studio.producerError.liveRasterPatch.invalidPngIhdr",
  "encoded-dimension-mismatch": "studio.producerError.liveRasterPatch.encodedDimensionMismatch",
  "invalid-option": "studio.producerError.liveRasterPatch.invalidOption",
  "upload-receipt-mismatch": "studio.producerError.liveRasterPatch.uploadReceiptMismatch",
  "invalid-dependencies": "studio.producerError.liveRasterPatch.invalidDependencies",
  "invalid-dependency-functions": "studio.producerError.liveRasterPatch.invalidDependencyFunctions",
  "raw-sha256-collision": "studio.producerError.liveRasterPatch.rawSha256Collision",
  "invalid-encoder-result": "studio.producerError.liveRasterPatch.invalidEncoderResult",
  "asset-byte-budget": "studio.producerError.liveRasterPatch.assetByteBudget",
  "encoded-sha256-collision": "studio.producerError.liveRasterPatch.encodedSha256Collision",
  "total-byte-budget": "studio.producerError.liveRasterPatch.totalByteBudget",
  "internal-asset-mapping": "studio.producerError.liveRasterPatch.internalAssetMapping",
  "png-export-unavailable": "studio.producerError.liveRasterPatch.pngExportUnavailable",
  "canvas-context-unavailable": "studio.producerError.liveRasterPatch.canvasContextUnavailable",
  "invalid-canvas-image-data": "studio.producerError.liveRasterPatch.invalidCanvasImageData",
  "png-media-type-mismatch": "studio.producerError.liveRasterPatch.pngMediaTypeMismatch",
  "canvas-unavailable": "studio.producerError.liveRasterPatch.canvasUnavailable",
  "aborted": "studio.producerError.liveRasterPatch.aborted",
  "cleanup-timeout": "studio.producerError.liveRasterPatch.cleanupTimeout",
  "upload-incomplete": "studio.producerError.liveRasterPatch.uploadIncomplete",
};

const PATCH_ERROR_KO: Readonly<Record<string, string>> = {
  "layer-write-guard-failed": "레이어 잠금 상태를 확인하지 못했습니다.",
  "invalid-layer-write-guard-result": "레이어 쓰기 정책은 boolean을 반환해야 합니다.",
  "layer-locked": "잠긴 레이어에는 실시간 픽셀 획을 게시할 수 없습니다.",
  "invalid-id": "{label} 식별자가 올바르지 않습니다.",
  "invalid-operation-id": "래스터 작업 ID는 소문자 UUID여야 합니다.",
  "invalid-logical-clock": "Lamport 시계는 uint64 범위의 정규 십진 문자열이어야 합니다.",
  "unsupported-intent": "현재 게시 파이프라인은 paint/erase/fill/clear만 지원합니다.",
  "invalid-semantic-hash": "도구 의미 해시는 소문자 SHA-256이어야 합니다.",
  "invalid-rect": "패치 영역은 x/y/width/height만 포함해야 합니다.",
  "invalid-rect-value": "패치 {key}는 안전한 정수여야 합니다.",
  "patch-out-of-bounds": "문서 픽셀 영역이 래스터 표면 경계를 벗어났습니다.",
  "input-byte-budget": "래스터 입력 픽셀이 클라이언트 메모리 예산을 초과했습니다.",
  "image-data-dimension-mismatch": "ImageData 크기가 문서 패치 영역과 일치하지 않습니다.",
  "invalid-rgba": "RGBA 픽셀은 ImageData 또는 8비트 typed array여야 합니다.",
  "rgba-length-mismatch": "RGBA 바이트 길이가 패치 픽셀 수와 일치하지 않습니다.",
  "patch-count-budget": "불투명 타일 패치 수가 작업별 예산을 초과했습니다.",
  "sha256-unavailable": "이 브라우저에서는 SHA-256을 사용할 수 없습니다.",
  "invalid-sha256-result": "SHA-256 구현이 소문자 64자리 digest를 반환하지 않았습니다.",
  "invalid-png-signature": "인코더가 올바른 PNG 서명을 반환하지 않았습니다.",
  "invalid-png-ihdr": "인코더 PNG에 표준 IHDR가 없습니다.",
  "encoded-dimension-mismatch": "인코더 PNG 크기가 타일 패치 크기와 일치하지 않습니다.",
  "invalid-option": "{label} 값이 허용 범위를 벗어났습니다.",
  "upload-receipt-mismatch": "업로드 영수증이 content-addressed PNG 참조와 정확히 일치하지 않습니다.",
  "invalid-dependencies": "래스터 게시 의존성이 필요합니다.",
  "invalid-dependency-functions": "인코더, 업로더, CRDT append 및 선택적 SHA-256 함수가 올바르지 않습니다.",
  "raw-sha256-collision": "서로 다른 RGBA 패치가 같은 SHA-256 식별자를 만들었습니다.",
  "invalid-encoder-result": "인코더는 bytes와 image/png 미디어 타입만 반환해야 합니다.",
  "asset-byte-budget": "인코딩된 PNG 크기가 자산별 예산을 벗어났습니다.",
  "encoded-sha256-collision": "같은 PNG SHA-256이 다른 픽셀 크기나 바이트를 가리킵니다.",
  "total-byte-budget": "고유 PNG 패치 전체 크기가 작업별 예산을 초과했습니다.",
  "internal-asset-mapping": "타일 패치 자산 매핑을 만들지 못했습니다.",
  "png-export-unavailable": "캔버스가 PNG Blob 내보내기를 지원하지 않습니다.",
  "canvas-context-unavailable": "PNG 캔버스 2D context를 만들지 못했습니다.",
  "invalid-canvas-image-data": "캔버스 ImageData 버퍼 크기가 패치와 일치하지 않습니다.",
  "png-media-type-mismatch": "캔버스가 PNG가 아닌 형식을 반환했습니다.",
  "canvas-unavailable": "선택한 {backend} PNG 백엔드를 사용할 수 없습니다.",
  "aborted": "래스터 패치 게시가 취소되었습니다.",
  "cleanup-timeout": "래스터 업로드 정리 제한 시간이 지났습니다.",
  "upload-incomplete": "PNG 인코딩에 실패했습니다.",
};

const REPLAY_ERROR_KEYS: Readonly<Record<string, string>> = {
  "invalid-option": "studio.producerError.liveRasterReplay.invalidOption",
  "invalid-work-id": "studio.producerError.liveRasterReplay.invalidWorkId",
  "invalid-png-chunk-type": "studio.producerError.liveRasterReplay.invalidPngChunkType",
  "invalid-png-signature": "studio.producerError.liveRasterReplay.invalidPngSignature",
  "png-chunk-limit": "studio.producerError.liveRasterReplay.pngChunkLimit",
  "invalid-png-chunk-truncated": "studio.producerError.liveRasterReplay.invalidPngChunkTruncated",
  "invalid-png-chunk-length": "studio.producerError.liveRasterReplay.invalidPngChunkLength",
  "invalid-png-crc": "studio.producerError.liveRasterReplay.invalidPngCrc",
  "animated-png-unsupported": "studio.producerError.liveRasterReplay.animatedPngUnsupported",
  "unsupported-png-critical-chunk": "studio.producerError.liveRasterReplay.unsupportedPngCriticalChunk",
  "invalid-png-first-chunk": "studio.producerError.liveRasterReplay.invalidPngFirstChunk",
  "asset-dimension-mismatch": "studio.producerError.liveRasterReplay.assetDimensionMismatch",
  "unsupported-png-profile": "studio.producerError.liveRasterReplay.unsupportedPngProfile",
  "invalid-png-duplicate-ihdr": "studio.producerError.liveRasterReplay.invalidPngDuplicateIhdr",
  "invalid-png-palette": "studio.producerError.liveRasterReplay.invalidPngPalette",
  "invalid-png-idat-sequence": "studio.producerError.liveRasterReplay.invalidPngIdatSequence",
  "invalid-png-iend": "studio.producerError.liveRasterReplay.invalidPngIend",
  "invalid-png-zlib-header": "studio.producerError.liveRasterReplay.invalidPngZlibHeader",
  "invalid-png-missing-idat-iend": "studio.producerError.liveRasterReplay.invalidPngMissingIdatIend",
  "sha256-unavailable": "studio.producerError.liveRasterReplay.sha256Unavailable",
  "invalid-sha256-result": "studio.producerError.liveRasterReplay.invalidSha256Result",
  "asset-byte-length-mismatch": "studio.producerError.liveRasterReplay.assetByteLengthMismatch",
  "asset-blob-mismatch": "studio.producerError.liveRasterReplay.assetBlobMismatch",
  "invalid-download-result": "studio.producerError.liveRasterReplay.invalidDownloadResult",
  "invalid-decoded-png": "studio.producerError.liveRasterReplay.invalidDecodedPng",
  "decoded-rgba-length-mismatch": "studio.producerError.liveRasterReplay.decodedRgbaLengthMismatch",
  "unsupported-media-type": "studio.producerError.liveRasterReplay.unsupportedMediaType",
  "png-decoder-unavailable": "studio.producerError.liveRasterReplay.pngDecoderUnavailable",
  "decoded-dimension-mismatch": "studio.producerError.liveRasterReplay.decodedDimensionMismatch",
  "canvas-context-unavailable": "studio.producerError.liveRasterReplay.canvasContextUnavailable",
  "canvas-unavailable": "studio.producerError.liveRasterReplay.canvasUnavailable",
  "canvas-context-unavailable-html": "studio.producerError.liveRasterReplay.canvasContextUnavailableHtml",
  "visible-filter-failed": "studio.producerError.liveRasterReplay.visibleFilterFailed",
  "invalid-visible-filter-result": "studio.producerError.liveRasterReplay.invalidVisibleFilterResult",
  "checkpoint-surface-mismatch": "studio.producerError.liveRasterReplay.checkpointSurfaceMismatch",
  "checkpoint-operation-mismatch": "studio.producerError.liveRasterReplay.checkpointOperationMismatch",
  "checkpoint-undo-horizon": "studio.producerError.liveRasterReplay.checkpointUndoHorizon",
  "checkpoint-undo-restore-horizon": "studio.producerError.liveRasterReplay.checkpointUndoRestoreHorizon",
  "asset-identity-conflict": "studio.producerError.liveRasterReplay.assetIdentityConflict",
  "resident-memory-budget": "studio.producerError.liveRasterReplay.residentMemoryBudget",
  "asset-not-png": "studio.producerError.liveRasterReplay.assetNotPng",
  "asset-byte-budget": "studio.producerError.liveRasterReplay.assetByteBudget",
  "asset-download-failed": "studio.producerError.liveRasterReplay.assetDownloadFailed",
  "asset-sha256-mismatch": "studio.producerError.liveRasterReplay.assetSha256Mismatch",
  "png-decode-failed": "studio.producerError.liveRasterReplay.pngDecodeFailed",
  "asset-cache-incomplete": "studio.producerError.liveRasterReplay.assetCacheIncomplete",
  "invalid-request": "studio.producerError.liveRasterReplay.invalidRequest",
  "invalid-dependencies": "studio.producerError.liveRasterReplay.invalidDependencies",
  "invalid-decoder": "studio.producerError.liveRasterReplay.invalidDecoder",
  "invalid-sha256-implementation": "studio.producerError.liveRasterReplay.invalidSha256Implementation",
  "invalid-visible-filter": "studio.producerError.liveRasterReplay.invalidVisibleFilter",
  "checkpoint-asset-cache-incomplete": "studio.producerError.liveRasterReplay.checkpointAssetCacheIncomplete",
  "tile-dependency-incomplete": "studio.producerError.liveRasterReplay.tileDependencyIncomplete",
  "patch-tile-missing": "studio.producerError.liveRasterReplay.patchTileMissing",
  "output-tile-missing": "studio.producerError.liveRasterReplay.outputTileMissing",
  "aborted": "studio.producerError.liveRasterReplay.aborted",
  "browser-png-decode-failed": "studio.producerError.liveRasterReplay.browserPngDecodeFailed",
};

const REPLAY_ERROR_KO: Readonly<Record<string, string>> = {
  "invalid-option": "{label} 값이 허용 범위를 벗어났습니다.",
  "invalid-work-id": "작업 범위 식별자가 올바르지 않습니다.",
  "invalid-png-chunk-type": "PNG 청크 타입 또는 예약 비트가 올바르지 않습니다.",
  "invalid-png-signature": "래스터 자산 {assetId}에 PNG 서명이 없습니다.",
  "png-chunk-limit": "래스터 자산 {assetId}의 PNG 청크 수가 안전 한도를 넘었습니다.",
  "invalid-png-chunk-truncated": "래스터 자산 {assetId}의 PNG 청크가 잘렸습니다.",
  "invalid-png-chunk-length": "래스터 자산 {assetId}의 PNG 청크 길이가 올바르지 않습니다.",
  "invalid-png-crc": "래스터 자산 {assetId}의 PNG 청크 CRC가 올바르지 않습니다.",
  "animated-png-unsupported": "래스터 CRDT 자산은 정적 PNG만 사용할 수 있습니다.",
  "unsupported-png-critical-chunk": "지원하지 않는 PNG 필수 청크({typeName})가 있습니다.",
  "invalid-png-first-chunk": "래스터 자산 {assetId}의 첫 청크가 IHDR가 아닙니다.",
  "asset-dimension-mismatch": "래스터 자산 {assetId}의 PNG 크기가 참조와 다릅니다.",
  "unsupported-png-profile": "래스터 자산 {assetId}은 8-bit RGBA 비인터레이스 PNG가 아닙니다.",
  "invalid-png-duplicate-ihdr": "래스터 자산 {assetId}에 IHDR가 중복되었습니다.",
  "invalid-png-palette": "래스터 자산 {assetId}의 PLTE 청크가 올바르지 않습니다.",
  "invalid-png-idat-sequence": "래스터 자산 {assetId}의 IDAT 청크가 비어 있거나 연속되지 않습니다.",
  "invalid-png-iend": "래스터 자산 {assetId}의 IEND 또는 후행 바이트가 올바르지 않습니다.",
  "invalid-png-zlib-header": "래스터 자산 {assetId}의 IDAT zlib 헤더가 올바르지 않습니다.",
  "invalid-png-missing-idat-iend": "래스터 자산 {assetId}에 IDAT/IEND가 없습니다.",
  "sha256-unavailable": "이 브라우저에서는 SHA-256을 사용할 수 없습니다.",
  "invalid-sha256-result": "SHA-256 구현이 소문자 64자리 digest를 반환하지 않았습니다.",
  "asset-byte-length-mismatch": "래스터 자산 {assetId} 바이트 길이가 참조와 다릅니다.",
  "asset-blob-mismatch": "래스터 자산 {assetId} Blob 메타데이터가 참조와 다릅니다.",
  "invalid-download-result": "래스터 자산 {assetId} 다운로드 결과가 바이트나 Blob이 아닙니다.",
  "invalid-decoded-png": "래스터 자산 {assetId} 디코드 결과가 올바르지 않습니다.",
  "decoded-rgba-length-mismatch": "래스터 자산 {assetId} RGBA 길이가 크기와 다릅니다.",
  "unsupported-media-type": "브라우저 래스터 재생기는 PNG 자산만 디코드합니다.",
  "png-decoder-unavailable": "이 브라우저에서는 createImageBitmap을 사용할 수 없습니다.",
  "decoded-dimension-mismatch": "디코드된 PNG 크기가 자산 참조와 다릅니다.",
  "canvas-context-unavailable": "PNG readback 캔버스를 만들 수 없습니다.",
  "canvas-unavailable": "PNG readback 캔버스를 만들 수 없습니다.",
  "canvas-context-unavailable-html": "PNG readback 컨텍스트를 만들 수 없습니다.",
  "visible-filter-failed": "표시 타일 필터 실행에 실패했습니다.",
  "invalid-visible-filter-result": "표시 타일 필터는 boolean을 반환해야 합니다.",
  "checkpoint-surface-mismatch": "checkpoint와 래스터 작업 로그의 표면이 일치하지 않습니다.",
  "checkpoint-operation-mismatch": "checkpoint 봉인 경계와 래스터 작업 로그의 operation 집합이 일치하지 않습니다.",
  "checkpoint-undo-horizon": "checkpoint으로 봉인된 작업을 뒤늦게 실행 취소할 수 없습니다.",
  "checkpoint-undo-restore-horizon": "checkpoint으로 봉인된 실행 취소를 뒤늦게 복원할 수 없습니다.",
  "asset-identity-conflict": "checkpoint와 tail이 같은 자산 ID {assetId}에 서로 다른 내용을 선언합니다.",
  "resident-memory-budget": "표시 타일, 디코드 자산, 동시 다운로드 및 해시 복사본이 래스터 재생 메모리 예산을 초과했습니다.",
  "asset-not-png": "래스터 자산 {assetId}은 PNG가 아닙니다.",
  "asset-byte-budget": "래스터 자산 {assetId} 크기가 허용 범위를 벗어났습니다.",
  "asset-download-failed": "래스터 자산 {assetId} 다운로드에 실패했습니다.",
  "asset-sha256-mismatch": "래스터 자산 {assetId} 내용 해시가 참조와 다릅니다.",
  "png-decode-failed": "래스터 자산 {assetId} 디코드에 실패했습니다.",
  "asset-cache-incomplete": "재생에 필요한 래스터 자산이 검증 캐시에 없습니다.",
  "invalid-request": "래스터 재생 요청이 필요합니다.",
  "invalid-dependencies": "래스터 자산 downloader가 필요합니다.",
  "invalid-decoder": "PNG decoder가 함수가 아닙니다.",
  "invalid-sha256-implementation": "SHA-256 구현이 함수가 아닙니다.",
  "invalid-visible-filter": "표시 타일 필터가 함수가 아닙니다.",
  "checkpoint-asset-cache-incomplete": "checkpoint 타일 자산이 검증 캐시에 없습니다.",
  "tile-dependency-incomplete": "조건부 교체 타일 의존성이 누락되었습니다.",
  "patch-tile-missing": "래스터 패치 대상 타일이 누락되었습니다.",
  "output-tile-missing": "출력 타일이 재생 집합에 없습니다.",
  "aborted": "래스터 CRDT 재생이 취소되었습니다.",
  "browser-png-decode-failed": "래스터 자산 {assetId} PNG 디코드에 실패했습니다.",
};

/** params.label 라벨 코드 → 로케일 라벨 (patch: 식별자·옵션 라벨). */
const PATCH_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  actor: { ko: "작업자", en: "actor" },
  page: { ko: "페이지", en: "page" },
  layer: { ko: "레이어", en: "layer" },
  concurrency: { ko: "동시 작업 수", en: "concurrency" },
  patchCount: { ko: "패치 수 예산", en: "patch count budget" },
  totalBytes: { ko: "전체 PNG 바이트 예산", en: "total PNG byte budget" },
};

/** params.label 라벨 코드 → 로케일 라벨 (replay: 옵션 라벨). */
const REPLAY_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  concurrency: { ko: "동시 자산 처리 수", en: "concurrent asset processing count" },
  residentBytes: { ko: "상주 메모리 예산", en: "resident memory budget" },
};

function localizeLabel(
  params: Readonly<Record<string, string>> | undefined,
  labels: Readonly<Record<string, { readonly ko: string; readonly en: string }>>,
): Readonly<Record<string, string>> | undefined {
  if (!params?.label) return params;
  const entry = labels[params.label];
  if (!entry) return params;
  return { ...params, label: getLang().startsWith("en") ? entry.en : entry.ko };
}

/** 표시 지점 전용 해석 (live raster patch 게시): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioRasterPatchError(
  error: Pick<StudioRasterPatchPublicationError, "code" | "params">,
): string {
  return resolveProducerError(
    PATCH_ERROR_KEYS[error.code]!,
    PATCH_ERROR_KO[error.code]!,
    localizeLabel(error.params, PATCH_LABELS),
  );
}

/**
 * 표시 지점 전용 해석 (live raster patch 게시, 원인 객체 진입점): 생산자 오류 클래스를
 * 런타임 import하지 않고 이름+코드 덕 타이핑으로 판정한다(glb 선례). 해당하지 않으면
 * null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveStudioRasterPatchErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioRasterPatchPublicationError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PATCH_ERROR_KEYS, code)) return null;
  return resolveStudioRasterPatchError({
    code: code as StudioRasterPatchPublicationErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

/**
 * 표시 지점 전용 합성 (pointers-queue task.catch): 접두·접미 문구도 이 구간의 키로
 * 함께 해석한다. 구조화되지 않은 외부 오류(업로더·append 원본 오류)는 현행과 같이
 * 원문 메시지를 접두·접미 사이에 패스스루하고, 오류 객체가 아니면 고정 폴백 문구를 쓴다.
 */
export function resolveStudioRasterPatchPublishNotice(cause: unknown): string {
  const prefix = resolveProducerError("studio.producerError.liveRasterPatch.publishPrefix", "실시간 픽셀 획 게시: ");
  const suffix = resolveProducerError("studio.producerError.liveRasterPatch.publishSuffix", " 기존 벡터 획은 안전하게 유지됩니다.");
  const resolved = resolveStudioRasterPatchErrorFromCause(cause);
  if (resolved !== null) return prefix + resolved + suffix;
  if (cause instanceof Error) return prefix + cause.message + suffix;
  return resolveProducerError("studio.producerError.liveRasterPatch.publishFallback", "실시간 픽셀 획을 게시하지 못해 기존 벡터 획을 유지했습니다.");
}

/** replay 구조화 오류 전달 형태: StudioRasterCrdtSurface가 onError로 넘기고 표시 지점이 해석한다. */
export interface StudioRasterReplayErrorInfo {
  readonly code: StudioRasterReplayRuntimeErrorCode;
  readonly params?: Readonly<Record<string, string>>;
}

/**
 * 원인 객체에서 replay 구조화 오류를 추출한다(Surface catch·hydrator 분류 공용):
 * 생산자 클래스를 런타임 import하지 않고 이름+코드 덕 타이핑으로 판정한다.
 */
export function studioRasterReplayErrorInfoFromCause(
  cause: unknown,
): StudioRasterReplayErrorInfo | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioRasterReplayRuntimeError" || typeof code !== "string") return null;
  if (!Object.hasOwn(REPLAY_ERROR_KEYS, code)) return null;
  return {
    code: code as StudioRasterReplayRuntimeErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  };
}

/** 표시 지점 전용 해석 (live raster replay): ViewportStageHost·hydrator 집계 경계가 부른다. */
export function resolveStudioRasterReplayError(info: StudioRasterReplayErrorInfo): string {
  return resolveProducerError(
    REPLAY_ERROR_KEYS[info.code]!,
    REPLAY_ERROR_KO[info.code]!,
    localizeLabel(info.params, REPLAY_LABELS),
  );
}

/** 표시 지점 전용 해석 (live raster replay, 원인 객체 진입점). 해당하지 않으면 null. */
export function resolveStudioRasterReplayErrorFromCause(cause: unknown): string | null {
  const info = studioRasterReplayErrorInfoFromCause(cause);
  return info ? resolveStudioRasterReplayError(info) : null;
}
