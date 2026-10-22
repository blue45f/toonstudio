/**
 * 생산자 구조화 에러 해석 모듈 — exports 구간: motionExport 오류 9키 +
 * psdExport 오류 14키·차단 사유 6키·요약 4키 + svgExport skip 13키·요약 4키
 * (A4 D4, R15 — 설계 r10-d4-trace-1 §3.9~3.11).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만
 * 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규
 * 번역이다. pdfVector·rasterEdit 구간은 형제 모듈
 * studio-producer-error-i18n-exports-raster.ts에 있다.
 *
 * 구간 메모:
 * - motionExport: 취소형(MotionExportCancelledError)은 표시 지점이 이미
 *   isMotionExportCancelled로 분기하므로 이 구간에 포함하지 않는다.
 * - psdExport.buildFailed는 하위 쓰기 실패 문자열을 params.causeMessage로
 *   받는 부분 잔존이다. preflightBlocked는 차단 사유 배열을 합성하는 집계
 *   경계라, 원인 객체가 실은 blockingReasons를 여기서 문구로 조립한다.
 * - svgExport skip의 말풍선 변형(manualWrapOnly·rubyPositionApprox·
 *   rubyRangeMissing)은 설계상 본문과 같은 코드라 params.variant="bubble"로
 *   구분해 서로 다른 원문을 보존한다(brush archiveTooLarge variant 전례).
 * - svgExport 루비 2종(rubyVerticalWarning·rubyVerticalUnsupported)은 하위
 *   루비 계획의 {code, message}를 params로 받는 부분 잔존이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  MotionExportCodecUnavailableErrorCode,
  StudioMotionExportErrorCode,
} from "../export/studio-motion-export-error";
import type {
  PsdExportBlockingReason,
  PsdExportBlockingReasonCode,
  StudioPsdExportErrorCode,
} from "../export/studio-psd-export-error";
import type { SvgExportSkipLabel } from "../export/studio-svg-export-types";

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

// ---------------------------------------------------------------------------
// motionExport 구간 (§3.9)
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.motionExport.cutImageLoadFailed": "컷 이미지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
  "studio.producerError.motionExport.noCuts": "내보낼 컷(페이지)이 없어요.",
  "studio.producerError.motionExport.imageCountMismatch": "컷 이미지 수가 플랜과 맞지 않아요. 다시 시도해주세요.",
  "studio.producerError.motionExport.webmUnsupported": "이 브라우저는 WebM 영상 인코딩을 지원하지 않아요.",
  "studio.producerError.motionExport.canvasContextFailed": "캔버스 컨텍스트를 만들지 못했어요.",
  "studio.producerError.motionExport.recorderFailed": "영상 인코딩 중 오류가 발생했어요. 다시 시도해주세요.",
  "studio.producerError.motionExport.noRecordedData": "녹화된 영상 데이터가 없어요. 다시 시도해주세요.",
  "studio.producerError.motionExport.codecIdentityMismatch": "선택한 WebM 코덱과 MediaRecorder의 실제 코덱 영수증이 일치하지 않아 저장하지 않았어요.",
  "studio.producerError.motionExport.containerMagicMismatch": "MediaRecorder 결과가 유효한 WebM 컨테이너가 아니어서 저장하지 않았어요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.motionExport.cutImageLoadFailed": "Could not load the cut image. Please try again in a moment.",
  "studio.producerError.motionExport.noCuts": "There are no cuts (pages) to export.",
  "studio.producerError.motionExport.imageCountMismatch": "The number of cut images does not match the plan. Please try again.",
  "studio.producerError.motionExport.webmUnsupported": "This browser does not support WebM video encoding.",
  "studio.producerError.motionExport.canvasContextFailed": "Could not create the canvas context.",
  "studio.producerError.motionExport.recorderFailed": "An error occurred while encoding the video. Please try again.",
  "studio.producerError.motionExport.noRecordedData": "There is no recorded video data. Please try again.",
  "studio.producerError.motionExport.codecIdentityMismatch": "The selected WebM codec does not match the MediaRecorder's actual codec receipt, so nothing was saved.",
  "studio.producerError.motionExport.containerMagicMismatch": "The MediaRecorder result is not a valid WebM container, so nothing was saved.",
});

type MotionExportAnyCode = StudioMotionExportErrorCode | MotionExportCodecUnavailableErrorCode;

const MOTION_EXPORT_ERROR_KEYS: Readonly<Record<MotionExportAnyCode, string>> = {
  cutImageLoadFailed: "studio.producerError.motionExport.cutImageLoadFailed",
  noCuts: "studio.producerError.motionExport.noCuts",
  imageCountMismatch: "studio.producerError.motionExport.imageCountMismatch",
  webmUnsupported: "studio.producerError.motionExport.webmUnsupported",
  canvasContextFailed: "studio.producerError.motionExport.canvasContextFailed",
  recorderFailed: "studio.producerError.motionExport.recorderFailed",
  noRecordedData: "studio.producerError.motionExport.noRecordedData",
  codecIdentityMismatch: "studio.producerError.motionExport.codecIdentityMismatch",
  containerMagicMismatch: "studio.producerError.motionExport.containerMagicMismatch",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const MOTION_EXPORT_ERROR_KO: Readonly<Record<MotionExportAnyCode, string>> = {
  cutImageLoadFailed: "컷 이미지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
  noCuts: "내보낼 컷(페이지)이 없어요.",
  imageCountMismatch: "컷 이미지 수가 플랜과 맞지 않아요. 다시 시도해주세요.",
  webmUnsupported: "이 브라우저는 WebM 영상 인코딩을 지원하지 않아요.",
  canvasContextFailed: "캔버스 컨텍스트를 만들지 못했어요.",
  recorderFailed: "영상 인코딩 중 오류가 발생했어요. 다시 시도해주세요.",
  noRecordedData: "녹화된 영상 데이터가 없어요. 다시 시도해주세요.",
  codecIdentityMismatch: "선택한 WebM 코덱과 MediaRecorder의 실제 코덱 영수증이 일치하지 않아 저장하지 않았어요.",
  containerMagicMismatch: "MediaRecorder 결과가 유효한 WebM 컨테이너가 아니어서 저장하지 않았어요.",
};

/** 표시 지점 전용 해석 (motionExport 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioMotionExportError(
  error: { readonly code: MotionExportAnyCode },
): string {
  return resolveProducerError(MOTION_EXPORT_ERROR_KEYS[error.code], MOTION_EXPORT_ERROR_KO[error.code]);
}

/**
 * 표시 지점 전용 해석 (motionExport 오류, 원인 객체 덕 타이핑): 패널 catch가
 * 원인 객체만으로 부른다. StudioMotionExportError와
 * MotionExportCodecUnavailableError 두 클래스를 이름+코드로 판정한다.
 * 취소형·그 외 원인은 null — 호출자는 기존 경로를 유지한다.
 */
export function resolveStudioMotionExportErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioMotionExportError" && name !== "MotionExportCodecUnavailableError") return null;
  if (typeof code !== "string" || !Object.hasOwn(MOTION_EXPORT_ERROR_KEYS, code)) return null;
  return resolveStudioMotionExportError({ code: code as MotionExportAnyCode });
}

// ---------------------------------------------------------------------------
// psdExport 구간 (§3.10)
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.psdExport.outputTooLarge": "PSD 결과 {sizeMb}MB가 출력 한도 {limitMb}MB를 넘습니다. 대형 문서는 페이지를 나누거나 출력 배율을 낮춰 PSD로 저장 또는 레이어 교환은 OpenRaster(.ora), 완성 픽셀은 PNG로 저장해 주세요.",
  "studio.producerError.psdExport.panelCropSurfaceFailed": "PSD 패널 크롭 표면을 만들지 못해 내보내기를 중단했어요.",
  "studio.producerError.psdExport.layerPixelsOverBudget": "PSD 레이어 픽셀이 메모리 한도를 넘어요. 페이지를 나누거나 출력 배율을 낮춰 주세요.",
  "studio.producerError.psdExport.strokePixelsUnreadable": "PSD 획의 픽셀을 읽을 수 없어 내보내기를 중단했어요.",
  "studio.producerError.psdExport.maskCaptureBoundsMissing": "{label}: 적용된 레이어 마스크의 캡처 경계를 찾지 못해 PSD 내보내기를 중단했어요.",
  "studio.producerError.psdExport.backgroundSurfaceFailed": "PSD 배경 레이어 표면을 만들지 못해 내보내기를 중단했어요.",
  "studio.producerError.psdExport.unsupportedAdjustmentSettings": "지원하지 않는 보정 레이어 설정이 있어 PSD로 내보낼 수 없어요.",
  "studio.producerError.psdExport.adjustmentMetadataOverBudget": "보정 레이어 설정이 PSD 메타데이터 한도를 넘어요. 프로젝트 아카이브로 보관해 주세요.",
  "studio.producerError.psdExport.adjustmentCompositeSizeMismatch": "PSD 보정 합성의 출력 크기가 문서와 일치하지 않아요.",
  "studio.producerError.psdExport.adjustmentCompositePixelsUnreadable": "PSD 보정 합성 픽셀을 읽을 수 없어요.",
  "studio.producerError.psdExport.maskReadFailed": "{label}: 조정 레이어 마스크를 읽지 못해 PSD 내보내기를 중단했어요.",
  "studio.producerError.psdExport.maskConvertFailed": "{label}: 조정 레이어 마스크를 PSD 네이티브 마스크로 변환하지 못해 내보내기를 중단했어요.",
  "studio.producerError.psdExport.buildFailed": "PSD 파일을 만들지 못했어요: {causeMessage}",
  "studio.producerError.psdExport.block.psbNotYetSupported": "PSB 내보내기는 대형 문서 메모리·왕복 검증이 끝나지 않아 제공하지 않습니다.",
  "studio.producerError.psdExport.block.canvasSizeInvalid": "PSD 출력 캔버스 크기와 배율은 유한한 양의 정수 픽셀이어야 합니다.",
  "studio.producerError.psdExport.block.canvasDimensionExceeded": "PSD 출력 {width}×{height}px가 안전 한 변 {limit}px를 넘습니다.",
  "studio.producerError.psdExport.block.canvasPixelsExceeded": "PSD 최소 합성 픽셀 {megaPixels}MP가 브라우저 예산 {budgetMp}MP를 넘습니다.",
  "studio.producerError.psdExport.block.layerCountInvalid": "PSD 레이어 수가 올바르지 않습니다.",
  "studio.producerError.psdExport.block.layerCountExceeded": "PSD 레이어 {count}개가 안전 예산 {limit}개를 넘습니다.",
  "studio.producerError.psdExport.alternativeSplitOrLower": "대형 문서는 페이지를 나누거나 출력 배율을 낮춰 PSD로 저장",
  "studio.producerError.psdExport.alternativeOraOrPng": "레이어 교환은 OpenRaster(.ora), 완성 픽셀은 PNG로 저장",
  "studio.producerError.psdExport.resultSaved": "PSD 저장 완료 — 레이어 {layerCount}개",
  "studio.producerError.psdExport.resultSkipped": "알림 {count}건",
  "studio.producerError.psdExport.resultRasterized": "래스터화 {count}건",
  "studio.producerError.psdExport.resultDropped": "편집 구조 제외 {count}건",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.psdExport.outputTooLarge": "The PSD result is {sizeMb}MB, over the {limitMb}MB output limit. For large documents, split the pages or lower the output scale to save as PSD, or save layer exchanges as OpenRaster (.ora) and finished pixels as PNG.",
  "studio.producerError.psdExport.panelCropSurfaceFailed": "Could not create the PSD panel crop surface, so the export was stopped.",
  "studio.producerError.psdExport.layerPixelsOverBudget": "The PSD layer pixels exceed the memory limit. Please split the page or lower the output scale.",
  "studio.producerError.psdExport.strokePixelsUnreadable": "Could not read the PSD stroke pixels, so the export was stopped.",
  "studio.producerError.psdExport.maskCaptureBoundsMissing": "{label}: Could not find the capture bounds of the applied layer mask, so the PSD export was stopped.",
  "studio.producerError.psdExport.backgroundSurfaceFailed": "Could not create the PSD background layer surface, so the export was stopped.",
  "studio.producerError.psdExport.unsupportedAdjustmentSettings": "There are unsupported adjustment layer settings, so this cannot be exported as PSD.",
  "studio.producerError.psdExport.adjustmentMetadataOverBudget": "The adjustment layer settings exceed the PSD metadata limit. Please keep them in a project archive.",
  "studio.producerError.psdExport.adjustmentCompositeSizeMismatch": "The PSD adjustment composite output size does not match the document.",
  "studio.producerError.psdExport.adjustmentCompositePixelsUnreadable": "Could not read the PSD adjustment composite pixels.",
  "studio.producerError.psdExport.maskReadFailed": "{label}: Could not read the adjustment layer mask, so the PSD export was stopped.",
  "studio.producerError.psdExport.maskConvertFailed": "{label}: Could not convert the adjustment layer mask to a native PSD mask, so the export was stopped.",
  "studio.producerError.psdExport.buildFailed": "Could not create the PSD file: {causeMessage}",
  "studio.producerError.psdExport.block.psbNotYetSupported": "PSB export is not offered yet because large-document memory and round-trip verification are not finished.",
  "studio.producerError.psdExport.block.canvasSizeInvalid": "The PSD output canvas size and scale must be finite positive whole pixels.",
  "studio.producerError.psdExport.block.canvasDimensionExceeded": "The PSD output {width}×{height}px exceeds the safe per-side limit of {limit}px.",
  "studio.producerError.psdExport.block.canvasPixelsExceeded": "The PSD minimum composite of {megaPixels}MP exceeds the browser budget of {budgetMp}MP.",
  "studio.producerError.psdExport.block.layerCountInvalid": "The PSD layer count is invalid.",
  "studio.producerError.psdExport.block.layerCountExceeded": "The PSD layer count of {count} exceeds the safe budget of {limit}.",
  "studio.producerError.psdExport.alternativeSplitOrLower": "For large documents, split the pages or lower the output scale to save as PSD",
  "studio.producerError.psdExport.alternativeOraOrPng": "save layer exchanges as OpenRaster (.ora) and finished pixels as PNG",
  "studio.producerError.psdExport.resultSaved": "PSD saved — {layerCount} layers",
  "studio.producerError.psdExport.resultSkipped": "{count} notices",
  "studio.producerError.psdExport.resultRasterized": "{count} rasterized",
  "studio.producerError.psdExport.resultDropped": "{count} excluded editing structures",
});

const PSD_EXPORT_ERROR_KEYS: Readonly<Record<Exclude<StudioPsdExportErrorCode, "preflightBlocked">, string>> = {
  outputTooLarge: "studio.producerError.psdExport.outputTooLarge",
  panelCropSurfaceFailed: "studio.producerError.psdExport.panelCropSurfaceFailed",
  layerPixelsOverBudget: "studio.producerError.psdExport.layerPixelsOverBudget",
  strokePixelsUnreadable: "studio.producerError.psdExport.strokePixelsUnreadable",
  maskCaptureBoundsMissing: "studio.producerError.psdExport.maskCaptureBoundsMissing",
  backgroundSurfaceFailed: "studio.producerError.psdExport.backgroundSurfaceFailed",
  unsupportedAdjustmentSettings: "studio.producerError.psdExport.unsupportedAdjustmentSettings",
  adjustmentMetadataOverBudget: "studio.producerError.psdExport.adjustmentMetadataOverBudget",
  adjustmentCompositeSizeMismatch: "studio.producerError.psdExport.adjustmentCompositeSizeMismatch",
  adjustmentCompositePixelsUnreadable: "studio.producerError.psdExport.adjustmentCompositePixelsUnreadable",
  maskReadFailed: "studio.producerError.psdExport.maskReadFailed",
  maskConvertFailed: "studio.producerError.psdExport.maskConvertFailed",
  buildFailed: "studio.producerError.psdExport.buildFailed",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PSD_EXPORT_ERROR_KO: Readonly<Record<Exclude<StudioPsdExportErrorCode, "preflightBlocked">, string>> = {
  outputTooLarge: "PSD 결과 {sizeMb}MB가 출력 한도 {limitMb}MB를 넘습니다. 대형 문서는 페이지를 나누거나 출력 배율을 낮춰 PSD로 저장 또는 레이어 교환은 OpenRaster(.ora), 완성 픽셀은 PNG로 저장해 주세요.",
  panelCropSurfaceFailed: "PSD 패널 크롭 표면을 만들지 못해 내보내기를 중단했어요.",
  layerPixelsOverBudget: "PSD 레이어 픽셀이 메모리 한도를 넘어요. 페이지를 나누거나 출력 배율을 낮춰 주세요.",
  strokePixelsUnreadable: "PSD 획의 픽셀을 읽을 수 없어 내보내기를 중단했어요.",
  maskCaptureBoundsMissing: "{label}: 적용된 레이어 마스크의 캡처 경계를 찾지 못해 PSD 내보내기를 중단했어요.",
  backgroundSurfaceFailed: "PSD 배경 레이어 표면을 만들지 못해 내보내기를 중단했어요.",
  unsupportedAdjustmentSettings: "지원하지 않는 보정 레이어 설정이 있어 PSD로 내보낼 수 없어요.",
  adjustmentMetadataOverBudget: "보정 레이어 설정이 PSD 메타데이터 한도를 넘어요. 프로젝트 아카이브로 보관해 주세요.",
  adjustmentCompositeSizeMismatch: "PSD 보정 합성의 출력 크기가 문서와 일치하지 않아요.",
  adjustmentCompositePixelsUnreadable: "PSD 보정 합성 픽셀을 읽을 수 없어요.",
  maskReadFailed: "{label}: 조정 레이어 마스크를 읽지 못해 PSD 내보내기를 중단했어요.",
  maskConvertFailed: "{label}: 조정 레이어 마스크를 PSD 네이티브 마스크로 변환하지 못해 내보내기를 중단했어요.",
  buildFailed: "PSD 파일을 만들지 못했어요: {causeMessage}",
};

const PSD_EXPORT_BLOCKING_KEYS: Readonly<Record<PsdExportBlockingReasonCode, string>> = {
  psbNotYetSupported: "studio.producerError.psdExport.block.psbNotYetSupported",
  canvasSizeInvalid: "studio.producerError.psdExport.block.canvasSizeInvalid",
  canvasDimensionExceeded: "studio.producerError.psdExport.block.canvasDimensionExceeded",
  canvasPixelsExceeded: "studio.producerError.psdExport.block.canvasPixelsExceeded",
  layerCountInvalid: "studio.producerError.psdExport.block.layerCountInvalid",
  layerCountExceeded: "studio.producerError.psdExport.block.layerCountExceeded",
};

const PSD_EXPORT_BLOCKING_KO: Readonly<Record<PsdExportBlockingReasonCode, string>> = {
  psbNotYetSupported: "PSB 내보내기는 대형 문서 메모리·왕복 검증이 끝나지 않아 제공하지 않습니다.",
  canvasSizeInvalid: "PSD 출력 캔버스 크기와 배율은 유한한 양의 정수 픽셀이어야 합니다.",
  canvasDimensionExceeded: "PSD 출력 {width}×{height}px가 안전 한 변 {limit}px를 넘습니다.",
  canvasPixelsExceeded: "PSD 최소 합성 픽셀 {megaPixels}MP가 브라우저 예산 {budgetMp}MP를 넘습니다.",
  layerCountInvalid: "PSD 레이어 수가 올바르지 않습니다.",
  layerCountExceeded: "PSD 레이어 {count}개가 안전 예산 {limit}개를 넘습니다.",
};

/** 표시·집계 지점 전용 해석 (psdExport 차단 사유 1건). */
export function resolveStudioPsdExportBlockingReason(reason: PsdExportBlockingReason): string {
  return resolveProducerError(PSD_EXPORT_BLOCKING_KEYS[reason.code], PSD_EXPORT_BLOCKING_KO[reason.code], reason.params);
}

/** 대안 안내 합성 — 이관 전 `${alternatives.join(" 또는 ")}해 주세요.`와 동일하게 조립한다. */
function resolvePsdExportAlternativesSuffix(): string {
  const alternatives = [
    resolveProducerError(
      "studio.producerError.psdExport.alternativeSplitOrLower",
      "대형 문서는 페이지를 나누거나 출력 배율을 낮춰 PSD로 저장",
    ),
    resolveProducerError(
      "studio.producerError.psdExport.alternativeOraOrPng",
      "레이어 교환은 OpenRaster(.ora), 완성 픽셀은 PNG로 저장",
    ),
  ];
  return getLang() === "en"
    ? `Please ${alternatives.join(" or ")}.`
    : `${alternatives.join(" 또는 ")}해 주세요.`;
}

/**
 * 표시 지점 전용 해석 (psdExport 오류). preflightBlocked는 차단 사유 배열을
 * 이관 전 합성문(`${사유들을 공백으로 결합} ${대안}해 주세요.`)으로 조립하는
 * 집계 경계다.
 */
export function resolveStudioPsdExportError(
  error: {
    readonly code: StudioPsdExportErrorCode;
    readonly params?: Readonly<Record<string, string>>;
    readonly blockingReasons?: readonly PsdExportBlockingReason[];
  },
): string {
  if (error.code === "preflightBlocked") {
    const reasons = (error.blockingReasons ?? []).map(resolveStudioPsdExportBlockingReason);
    return `${reasons.join(" ")} ${resolvePsdExportAlternativesSuffix()}`;
  }
  const code = error.code as Exclude<StudioPsdExportErrorCode, "preflightBlocked">;
  return resolveProducerError(PSD_EXPORT_ERROR_KEYS[code], PSD_EXPORT_ERROR_KO[code], error.params);
}

/**
 * 표시 지점 전용 해석 (psdExport 오류, 원인 객체 덕 타이핑): 패널 catch가
 * 원인 객체만으로 부른다. StudioPsdExportError가 아닌 원인은 null.
 */
export function resolveStudioPsdExportErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params, blockingReasons } = cause as {
    name?: unknown;
    code?: unknown;
    params?: unknown;
    blockingReasons?: unknown;
  };
  if (name !== "StudioPsdExportError" || typeof code !== "string") return null;
  if (code !== "preflightBlocked" && !Object.hasOwn(PSD_EXPORT_ERROR_KEYS, code)) return null;
  return resolveStudioPsdExportError({
    code: code as StudioPsdExportErrorCode,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
    blockingReasons: (blockingReasons ?? undefined) as readonly PsdExportBlockingReason[] | undefined,
  });
}

/**
 * 요약 함수 내부 해석 (psdExport 결과): psdExportResultMessage가 집계 경계
 * 예외로 부른다 — 반환 문자열 자체가 패널 상태 문구라 함수 내부에서 현재
 * 로케일로 조립하는 것이 전환이다(§3.10).
 */
export function resolvePsdExportResultMessage(counts: {
  readonly layerCount: number;
  readonly skippedCount: number;
  readonly rasterizedCount: number;
  readonly droppedCount: number;
}): string {
  const parts = [
    resolveProducerError(
      "studio.producerError.psdExport.resultSaved",
      "PSD 저장 완료 — 레이어 {layerCount}개",
      { layerCount: String(counts.layerCount) },
    ),
  ];
  if (counts.skippedCount > 0) {
    parts.push(resolveProducerError(
      "studio.producerError.psdExport.resultSkipped",
      "알림 {count}건",
      { count: String(counts.skippedCount) },
    ));
  }
  if (counts.rasterizedCount > 0) {
    parts.push(resolveProducerError(
      "studio.producerError.psdExport.resultRasterized",
      "래스터화 {count}건",
      { count: String(counts.rasterizedCount) },
    ));
  }
  if (counts.droppedCount > 0) {
    parts.push(resolveProducerError(
      "studio.producerError.psdExport.resultDropped",
      "편집 구조 제외 {count}건",
      { count: String(counts.droppedCount) },
    ));
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// svgExport 구간 (§3.11)
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.svgExport.rubyVerticalWarning": "세로 루비 경고({code}): {message}",
  "studio.producerError.svgExport.rubyVerticalUnsupported": "세로 루비 미지원({code}): {message}",
  "studio.producerError.svgExport.rubyCurvedTextUnsupported": "곡선 텍스트의 루비 주석은 SVG 경로 조판에서 아직 재현할 수 없어요.",
  "studio.producerError.svgExport.verticalLatinApprox": "세로쓰기 속 라틴/숫자 구간의 폭은 글꼴 실측 없이 근사해 열 나눔이 화면과 조금 다를 수 있어요.",
  "studio.producerError.svgExport.manualWrapOnly": "자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.",
  "studio.producerError.svgExport.manualWrapOnlyBubble": "말풍선 자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.",
  "studio.producerError.svgExport.rubyPositionApprox": "가로 루비 위치는 SVG에서 글꼴 advance 근사로 배치돼요.",
  "studio.producerError.svgExport.rubyPositionApproxBubble": "말풍선 가로 루비 위치는 SVG에서 글꼴 advance 근사로 배치돼요.",
  "studio.producerError.svgExport.rubyRangeMissing": "유효한 가로 루비 범위를 찾지 못해 루비 주석을 그리지 않았어요.",
  "studio.producerError.svgExport.rubyRangeMissingBubble": "유효한 말풍선 가로 루비 범위를 찾지 못해 루비 주석을 그리지 않았어요.",
  "studio.producerError.svgExport.verticalBubbleLatinApprox": "말풍선 세로쓰기 속 라틴/숫자 폭은 글꼴 실측 없이 근사해 열 나눔이 화면과 조금 다를 수 있어요.",
  "studio.producerError.svgExport.clipMaskUnsupported": "아래 레이어로 자르기(클리핑 마스크)는 SVG에서 지원되지 않아 자르지 않고 표시돼요.",
  "studio.producerError.svgExport.blendModeUnsupported": "혼합 모드({blend})는 SVG에서 지원되지 않아 보통 합성으로 표시돼요.",
  "studio.producerError.svgExport.resultSaved": "SVG 저장 완료 — 요소 {elementCount}개 벡터 변환",
  "studio.producerError.svgExport.resultDropped": "제외 {count}개",
  "studio.producerError.svgExport.resultApprox": "근사 {count}개",
  "studio.producerError.svgExport.resultAllPreserved": "전부 벡터 보존",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.svgExport.rubyVerticalWarning": "Vertical ruby warning ({code}): {message}",
  "studio.producerError.svgExport.rubyVerticalUnsupported": "Vertical ruby unsupported ({code}): {message}",
  "studio.producerError.svgExport.rubyCurvedTextUnsupported": "Ruby annotations on curved text cannot be reproduced in SVG path typesetting yet.",
  "studio.producerError.svgExport.verticalLatinApprox": "Widths of Latin/numeric runs in vertical text are approximated without font measurement, so column breaks may differ slightly from the screen.",
  "studio.producerError.svgExport.manualWrapOnly": "SVG has no automatic wrapping, so only manual line breaks (Enter) are reflected.",
  "studio.producerError.svgExport.manualWrapOnlyBubble": "SVG has no automatic bubble wrapping, so only manual line breaks (Enter) are reflected.",
  "studio.producerError.svgExport.rubyPositionApprox": "Horizontal ruby positions are placed in SVG by font advance approximation.",
  "studio.producerError.svgExport.rubyPositionApproxBubble": "Bubble horizontal ruby positions are placed in SVG by font advance approximation.",
  "studio.producerError.svgExport.rubyRangeMissing": "No valid horizontal ruby range was found, so the ruby annotation was not drawn.",
  "studio.producerError.svgExport.rubyRangeMissingBubble": "No valid bubble horizontal ruby range was found, so the ruby annotation was not drawn.",
  "studio.producerError.svgExport.verticalBubbleLatinApprox": "Widths of Latin/numeric runs in vertical bubble text are approximated without font measurement, so column breaks may differ slightly from the screen.",
  "studio.producerError.svgExport.clipMaskUnsupported": "Clipping to the layer below (clipping mask) is not supported in SVG, so it is shown unclipped.",
  "studio.producerError.svgExport.blendModeUnsupported": "The blend mode ({blend}) is not supported in SVG, so it is shown with normal compositing.",
  "studio.producerError.svgExport.resultSaved": "SVG saved — {elementCount} elements converted to vectors",
  "studio.producerError.svgExport.resultDropped": "{count} excluded",
  "studio.producerError.svgExport.resultApprox": "{count} approximated",
  "studio.producerError.svgExport.resultAllPreserved": "All vectors preserved",
});

/** 해석 키: 코드 단독 또는 말풍선 변형 `${code}:bubble`. */
const SVG_EXPORT_SKIP_KEYS: Readonly<Record<string, string>> = {
  rubyVerticalWarning: "studio.producerError.svgExport.rubyVerticalWarning",
  rubyVerticalUnsupported: "studio.producerError.svgExport.rubyVerticalUnsupported",
  rubyCurvedTextUnsupported: "studio.producerError.svgExport.rubyCurvedTextUnsupported",
  verticalLatinApprox: "studio.producerError.svgExport.verticalLatinApprox",
  manualWrapOnly: "studio.producerError.svgExport.manualWrapOnly",
  "manualWrapOnly:bubble": "studio.producerError.svgExport.manualWrapOnlyBubble",
  rubyPositionApprox: "studio.producerError.svgExport.rubyPositionApprox",
  "rubyPositionApprox:bubble": "studio.producerError.svgExport.rubyPositionApproxBubble",
  rubyRangeMissing: "studio.producerError.svgExport.rubyRangeMissing",
  "rubyRangeMissing:bubble": "studio.producerError.svgExport.rubyRangeMissingBubble",
  verticalBubbleLatinApprox: "studio.producerError.svgExport.verticalBubbleLatinApprox",
  clipMaskUnsupported: "studio.producerError.svgExport.clipMaskUnsupported",
  blendModeUnsupported: "studio.producerError.svgExport.blendModeUnsupported",
};

/** 키별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const SVG_EXPORT_SKIP_KO: Readonly<Record<string, string>> = {
  "studio.producerError.svgExport.rubyVerticalWarning": "세로 루비 경고({code}): {message}",
  "studio.producerError.svgExport.rubyVerticalUnsupported": "세로 루비 미지원({code}): {message}",
  "studio.producerError.svgExport.rubyCurvedTextUnsupported": "곡선 텍스트의 루비 주석은 SVG 경로 조판에서 아직 재현할 수 없어요.",
  "studio.producerError.svgExport.verticalLatinApprox": "세로쓰기 속 라틴/숫자 구간의 폭은 글꼴 실측 없이 근사해 열 나눔이 화면과 조금 다를 수 있어요.",
  "studio.producerError.svgExport.manualWrapOnly": "자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.",
  "studio.producerError.svgExport.manualWrapOnlyBubble": "말풍선 자동 줄바꿈은 SVG에 없어 수동 줄바꿈(엔터)만 반영돼요.",
  "studio.producerError.svgExport.rubyPositionApprox": "가로 루비 위치는 SVG에서 글꼴 advance 근사로 배치돼요.",
  "studio.producerError.svgExport.rubyPositionApproxBubble": "말풍선 가로 루비 위치는 SVG에서 글꼴 advance 근사로 배치돼요.",
  "studio.producerError.svgExport.rubyRangeMissing": "유효한 가로 루비 범위를 찾지 못해 루비 주석을 그리지 않았어요.",
  "studio.producerError.svgExport.rubyRangeMissingBubble": "유효한 말풍선 가로 루비 범위를 찾지 못해 루비 주석을 그리지 않았어요.",
  "studio.producerError.svgExport.verticalBubbleLatinApprox": "말풍선 세로쓰기 속 라틴/숫자 폭은 글꼴 실측 없이 근사해 열 나눔이 화면과 조금 다를 수 있어요.",
  "studio.producerError.svgExport.clipMaskUnsupported": "아래 레이어로 자르기(클리핑 마스크)는 SVG에서 지원되지 않아 자르지 않고 표시돼요.",
  "studio.producerError.svgExport.blendModeUnsupported": "혼합 모드({blend})는 SVG에서 지원되지 않아 보통 합성으로 표시돼요.",
};

/**
 * 표시 지점 전용 해석 (svgExport skip 라벨): 문자열 라벨(타 생산자 몫)은
 * 그대로 돌려주고, 구조화 라벨은 코드(+variant)로 해석한다. 패널의 중단
 * 문구 labels 합성과 래스터 fidelity 매칭 토큰 조립이 부른다.
 */
export function resolveSvgExportSkipLabel(label: SvgExportSkipLabel): string {
  if (typeof label === "string") return label;
  const key = SVG_EXPORT_SKIP_KEYS[`${label.code}:${label.params?.variant ?? ""}`]
    ?? SVG_EXPORT_SKIP_KEYS[label.code];
  if (!key) return label.code;
  return resolveProducerError(key, SVG_EXPORT_SKIP_KO[key], label.params);
}

/**
 * 요약 함수 내부 해석 (svgExport 결과): svgExportResultMessage가 집계 경계
 * 예외로 부른다(§3.11 — psdExport 요약과 같은 취급).
 */
export function resolveSvgExportResultMessage(counts: {
  readonly elementCount: number;
  readonly droppedCount: number;
  readonly approxCount: number;
}): string {
  const parts = [
    resolveProducerError(
      "studio.producerError.svgExport.resultSaved",
      "SVG 저장 완료 — 요소 {elementCount}개 벡터 변환",
      { elementCount: String(counts.elementCount) },
    ),
  ];
  if (counts.droppedCount > 0) {
    parts.push(resolveProducerError(
      "studio.producerError.svgExport.resultDropped",
      "제외 {count}개",
      { count: String(counts.droppedCount) },
    ));
  }
  if (counts.approxCount > 0) {
    parts.push(resolveProducerError(
      "studio.producerError.svgExport.resultApprox",
      "근사 {count}개",
      { count: String(counts.approxCount) },
    ));
  }
  if (counts.droppedCount === 0 && counts.approxCount === 0 && counts.elementCount > 0) {
    parts.push(resolveProducerError(
      "studio.producerError.svgExport.resultAllPreserved",
      "전부 벡터 보존",
    ));
  }
  return parts.join(" · ");
}
