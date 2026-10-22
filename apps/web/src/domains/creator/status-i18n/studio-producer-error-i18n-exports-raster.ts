/**
 * 생산자 구조화 에러 해석 모듈 — exports-raster 구간: pdfVector 오류 25키
 * (+날짜 라벨 2키) + rasterEdit 사유 17키·조치 7키·throw 8키
 * (A4 D4, R15 — 설계 r10-d4-trace-1 §3.12~3.13).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만
 * 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규
 * 번역이다. motionExport·psdExport·svgExport 구간은 형제 모듈
 * studio-producer-error-i18n-exports.ts에 있다.
 *
 * 구간 메모:
 * - pdfVector.invalidDate의 params.label은 날짜 종류 코드("created"·
 *   "modified")이며, 단어 자체는 이 모듈의 라벨 키로 해석한다(tm 생성의
 *   필드 라벨 전례). fontEmbedDenied만 임베딩 정책 모듈의 동적 문자열을
 *   params.causeMessage로 받는 부분 잔존이다.
 * - rasterEdit.documentLocked는 입력 패스스루(params.message)를 그대로
 *   돌려준다 — 문장 단위 현지화는 기존 파이프라인
 *   (studio-filter-unavailable-reason-localization)이 표시 지점에서 잇는다.
 * - rasterEdit.unsupportedFidelity.*는 머리말+영향 레이어+조치 문장 조립이
 *   곧 문구라, 조립 규칙을 이 리졸버가 소유한다(이관 전 fidelityReason의
 *   조립과 글자 단위 동일).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioPdfVectorErrorCode } from "../render/studio-canvaskit-pdf-vector-error";
import type {
  StudioRasterEditErrorCode,
  StudioRasterEditReason,
} from "../render/studio-raster-edit-error";

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
// pdfVector 구간 (§3.12)
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.pdfVector.nonFiniteNumber": "PDF에 넣을 수 없는 숫자가 있어요(NaN/무한대).",
  "studio.producerError.pdfVector.missingObject": "PDF 조립에 실패했어요(오브젝트 {num} 누락). 다시 시도해주세요.",
  "studio.producerError.pdfVector.missingFontRef": "PDF에 없는 글꼴({font})을 텍스트가 참조하고 있어요.",
  "studio.producerError.pdfVector.standardFontUnicode": "PDF 표준 글꼴({baseFont})로 유니코드 텍스트를 표시할 수 없어요. CID TrueType 글꼴을 임베드해 주세요.",
  "studio.producerError.pdfVector.glyphMissing": "PDF 글꼴({baseFont})에 필요한 글리프가 없어요: {glyphs}",
  "studio.producerError.pdfVector.unknownProfile": "알 수 없는 PDF 적합성 프로필이에요.",
  "studio.producerError.pdfVector.fileIdFormat": "PDF 적합성 파일 식별자는 16바이트(32자리 hex)여야 해요.",
  "studio.producerError.pdfVector.invalidDate": "PDF {label} 날짜는 초 단위 UTC ISO-8601 형식이어야 해요.",
  "studio.producerError.pdfVector.dateLabelCreated": "생성",
  "studio.producerError.pdfVector.dateLabelModified": "수정",
  "studio.producerError.pdfVector.modifiedBeforeCreated": "PDF 수정 날짜는 생성 날짜보다 빠를 수 없어요.",
  "studio.producerError.pdfVector.xmpTooLarge": "PDF XMP 메타데이터가 1MiB 안전 예산을 초과했어요.",
  "studio.producerError.pdfVector.iccRequired": "PDF/A·PDF/X 후보에는 권리가 확인된 ICC OutputIntent가 필요해요.",
  "studio.producerError.pdfVector.iccTooShort": "PDF OutputIntent ICC 프로파일이 너무 짧아요.",
  "studio.producerError.pdfVector.iccLengthMismatch": "PDF OutputIntent ICC 프로파일의 선언 크기와 실제 크기가 다릅니다.",
  "studio.producerError.pdfVector.iccSignatureInvalid": "PDF OutputIntent에 유효한 ICC 프로파일 서명이 없습니다.",
  "studio.producerError.pdfVector.iccColorSpaceMismatch": "PDF OutputIntent의 ICC 색공간과 성분 수가 일치하지 않아요.",
  "studio.producerError.pdfVector.trimBoxRequired": "PDF/X-4 페이지 {page}에는 TrimBox가 필요해요.",
  "studio.producerError.pdfVector.trimBoxOutside": "PDF/X-4 페이지 {page}의 TrimBox가 MediaBox를 벗어났어요.",
  "studio.producerError.pdfVector.bleedBoxInvalid": "PDF/X-4 페이지 {page}의 BleedBox가 TrimBox와 MediaBox를 올바르게 감싸지 않아요.",
  "studio.producerError.pdfVector.noPages": "PDF로 내보낼 페이지가 없어요.",
  "studio.producerError.pdfVector.invalidPageSize": "페이지 {page}의 크기가 올바르지 않아요.",
  "studio.producerError.pdfVector.duplicateFontName": "PDF 글꼴 이름이 겹쳐요({font}).",
  "studio.producerError.pdfVector.fontEmbedCffUnsupported": "PDF 글꼴 '{baseFont}'을 임베드할 수 없어요: CFF 윤곽선은 CIDFontType0/FontFile3 writer가 필요하며 현재 TrueType FontFile2 경로로는 안전하게 출력할 수 없어요.",
  "studio.producerError.pdfVector.fontEmbedDenied": "PDF 글꼴 '{baseFont}'을 임베드할 수 없어요: {causeMessage}",
  "studio.producerError.pdfVector.fontsMustEmbed": "PDF/A·PDF/X 후보의 표시 텍스트는 모든 글꼴 프로그램을 임베드해야 해요.",
  "studio.producerError.pdfVector.imageNotJpeg": "이미지 {name}이 JPEG 형식이 아니에요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.pdfVector.nonFiniteNumber": "There is a number that cannot go into a PDF (NaN/infinity).",
  "studio.producerError.pdfVector.missingObject": "PDF assembly failed (object {num} is missing). Please try again.",
  "studio.producerError.pdfVector.missingFontRef": "Text references a font that is not in the PDF ({font}).",
  "studio.producerError.pdfVector.standardFontUnicode": "Unicode text cannot be shown with the PDF standard font ({baseFont}). Please embed a CID TrueType font.",
  "studio.producerError.pdfVector.glyphMissing": "The PDF font ({baseFont}) is missing glyphs it needs: {glyphs}",
  "studio.producerError.pdfVector.unknownProfile": "Unknown PDF conformance profile.",
  "studio.producerError.pdfVector.fileIdFormat": "The PDF conformance file identifier must be 16 bytes (32 hex digits).",
  "studio.producerError.pdfVector.invalidDate": "The PDF {label} date must be in UTC ISO-8601 format with second precision.",
  "studio.producerError.pdfVector.dateLabelCreated": "created",
  "studio.producerError.pdfVector.dateLabelModified": "modified",
  "studio.producerError.pdfVector.modifiedBeforeCreated": "The PDF modified date cannot be earlier than the created date.",
  "studio.producerError.pdfVector.xmpTooLarge": "The PDF XMP metadata exceeds the 1MiB safety budget.",
  "studio.producerError.pdfVector.iccRequired": "PDF/A and PDF/X candidates need an ICC OutputIntent with confirmed rights.",
  "studio.producerError.pdfVector.iccTooShort": "The PDF OutputIntent ICC profile is too short.",
  "studio.producerError.pdfVector.iccLengthMismatch": "The declared size of the PDF OutputIntent ICC profile differs from its actual size.",
  "studio.producerError.pdfVector.iccSignatureInvalid": "The PDF OutputIntent has no valid ICC profile signature.",
  "studio.producerError.pdfVector.iccColorSpaceMismatch": "The ICC color space of the PDF OutputIntent does not match its component count.",
  "studio.producerError.pdfVector.trimBoxRequired": "PDF/X-4 page {page} needs a TrimBox.",
  "studio.producerError.pdfVector.trimBoxOutside": "The TrimBox of PDF/X-4 page {page} goes outside the MediaBox.",
  "studio.producerError.pdfVector.bleedBoxInvalid": "The BleedBox of PDF/X-4 page {page} does not properly contain the TrimBox and MediaBox.",
  "studio.producerError.pdfVector.noPages": "There are no pages to export as PDF.",
  "studio.producerError.pdfVector.invalidPageSize": "The size of page {page} is invalid.",
  "studio.producerError.pdfVector.duplicateFontName": "PDF font names overlap ({font}).",
  "studio.producerError.pdfVector.fontEmbedCffUnsupported": "The PDF font '{baseFont}' cannot be embedded: CFF outlines need a CIDFontType0/FontFile3 writer, and the current TrueType FontFile2 path cannot output them safely.",
  "studio.producerError.pdfVector.fontEmbedDenied": "The PDF font '{baseFont}' cannot be embedded: {causeMessage}",
  "studio.producerError.pdfVector.fontsMustEmbed": "Display text in PDF/A and PDF/X candidates must embed every font program.",
  "studio.producerError.pdfVector.imageNotJpeg": "The image {name} is not in JPEG format.",
});

const PDF_VECTOR_ERROR_KEYS: Readonly<Record<StudioPdfVectorErrorCode, string>> = {
  nonFiniteNumber: "studio.producerError.pdfVector.nonFiniteNumber",
  missingObject: "studio.producerError.pdfVector.missingObject",
  missingFontRef: "studio.producerError.pdfVector.missingFontRef",
  standardFontUnicode: "studio.producerError.pdfVector.standardFontUnicode",
  glyphMissing: "studio.producerError.pdfVector.glyphMissing",
  unknownProfile: "studio.producerError.pdfVector.unknownProfile",
  fileIdFormat: "studio.producerError.pdfVector.fileIdFormat",
  invalidDate: "studio.producerError.pdfVector.invalidDate",
  modifiedBeforeCreated: "studio.producerError.pdfVector.modifiedBeforeCreated",
  xmpTooLarge: "studio.producerError.pdfVector.xmpTooLarge",
  iccRequired: "studio.producerError.pdfVector.iccRequired",
  iccTooShort: "studio.producerError.pdfVector.iccTooShort",
  iccLengthMismatch: "studio.producerError.pdfVector.iccLengthMismatch",
  iccSignatureInvalid: "studio.producerError.pdfVector.iccSignatureInvalid",
  iccColorSpaceMismatch: "studio.producerError.pdfVector.iccColorSpaceMismatch",
  trimBoxRequired: "studio.producerError.pdfVector.trimBoxRequired",
  trimBoxOutside: "studio.producerError.pdfVector.trimBoxOutside",
  bleedBoxInvalid: "studio.producerError.pdfVector.bleedBoxInvalid",
  noPages: "studio.producerError.pdfVector.noPages",
  invalidPageSize: "studio.producerError.pdfVector.invalidPageSize",
  duplicateFontName: "studio.producerError.pdfVector.duplicateFontName",
  fontEmbedCffUnsupported: "studio.producerError.pdfVector.fontEmbedCffUnsupported",
  fontEmbedDenied: "studio.producerError.pdfVector.fontEmbedDenied",
  fontsMustEmbed: "studio.producerError.pdfVector.fontsMustEmbed",
  imageNotJpeg: "studio.producerError.pdfVector.imageNotJpeg",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PDF_VECTOR_ERROR_KO: Readonly<Record<StudioPdfVectorErrorCode, string>> = {
  nonFiniteNumber: "PDF에 넣을 수 없는 숫자가 있어요(NaN/무한대).",
  missingObject: "PDF 조립에 실패했어요(오브젝트 {num} 누락). 다시 시도해주세요.",
  missingFontRef: "PDF에 없는 글꼴({font})을 텍스트가 참조하고 있어요.",
  standardFontUnicode: "PDF 표준 글꼴({baseFont})로 유니코드 텍스트를 표시할 수 없어요. CID TrueType 글꼴을 임베드해 주세요.",
  glyphMissing: "PDF 글꼴({baseFont})에 필요한 글리프가 없어요: {glyphs}",
  unknownProfile: "알 수 없는 PDF 적합성 프로필이에요.",
  fileIdFormat: "PDF 적합성 파일 식별자는 16바이트(32자리 hex)여야 해요.",
  invalidDate: "PDF {label} 날짜는 초 단위 UTC ISO-8601 형식이어야 해요.",
  modifiedBeforeCreated: "PDF 수정 날짜는 생성 날짜보다 빠를 수 없어요.",
  xmpTooLarge: "PDF XMP 메타데이터가 1MiB 안전 예산을 초과했어요.",
  iccRequired: "PDF/A·PDF/X 후보에는 권리가 확인된 ICC OutputIntent가 필요해요.",
  iccTooShort: "PDF OutputIntent ICC 프로파일이 너무 짧아요.",
  iccLengthMismatch: "PDF OutputIntent ICC 프로파일의 선언 크기와 실제 크기가 다릅니다.",
  iccSignatureInvalid: "PDF OutputIntent에 유효한 ICC 프로파일 서명이 없습니다.",
  iccColorSpaceMismatch: "PDF OutputIntent의 ICC 색공간과 성분 수가 일치하지 않아요.",
  trimBoxRequired: "PDF/X-4 페이지 {page}에는 TrimBox가 필요해요.",
  trimBoxOutside: "PDF/X-4 페이지 {page}의 TrimBox가 MediaBox를 벗어났어요.",
  bleedBoxInvalid: "PDF/X-4 페이지 {page}의 BleedBox가 TrimBox와 MediaBox를 올바르게 감싸지 않아요.",
  noPages: "PDF로 내보낼 페이지가 없어요.",
  invalidPageSize: "페이지 {page}의 크기가 올바르지 않아요.",
  duplicateFontName: "PDF 글꼴 이름이 겹쳐요({font}).",
  fontEmbedCffUnsupported: "PDF 글꼴 '{baseFont}'을 임베드할 수 없어요: CFF 윤곽선은 CIDFontType0/FontFile3 writer가 필요하며 현재 TrueType FontFile2 경로로는 안전하게 출력할 수 없어요.",
  fontEmbedDenied: "PDF 글꼴 '{baseFont}'을 임베드할 수 없어요: {causeMessage}",
  fontsMustEmbed: "PDF/A·PDF/X 후보의 표시 텍스트는 모든 글꼴 프로그램을 임베드해야 해요.",
  imageNotJpeg: "이미지 {name}이 JPEG 형식이 아니에요.",
};

const PDF_VECTOR_DATE_LABEL_KEYS: Readonly<Record<string, string>> = {
  created: "studio.producerError.pdfVector.dateLabelCreated",
  modified: "studio.producerError.pdfVector.dateLabelModified",
};

const PDF_VECTOR_DATE_LABEL_KO: Readonly<Record<string, string>> = {
  created: "생성",
  modified: "수정",
};

/** 표시 지점 전용 해석 (pdfVector 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioPdfVectorError(
  error: { readonly code: StudioPdfVectorErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  let params = error.params;
  if (error.code === "invalidDate" && params?.label && Object.hasOwn(PDF_VECTOR_DATE_LABEL_KEYS, params.label)) {
    const labelKey = PDF_VECTOR_DATE_LABEL_KEYS[params.label]!;
    const label = resolveProducerError(labelKey, PDF_VECTOR_DATE_LABEL_KO[params.label]!);
    params = { ...params, label };
  }
  return resolveProducerError(PDF_VECTOR_ERROR_KEYS[error.code], PDF_VECTOR_ERROR_KO[error.code], params);
}

/**
 * 표시 지점 전용 해석 (pdfVector 오류, 원인 객체 덕 타이핑): 패널 벡터
 * 핸들러 catch와 conformance-export의 writer 실패 삽입 지점이 부른다.
 * StudioPdfVectorError가 아닌 원인은 null.
 */
export function resolveStudioPdfVectorErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioPdfVectorError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PDF_VECTOR_ERROR_KEYS, code)) return null;
  return resolveStudioPdfVectorError({
    code: code as StudioPdfVectorErrorCode,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}

// ---------------------------------------------------------------------------
// rasterEdit 구간 (§3.13)
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.rasterEdit.invalidPageId": "편집용 복사본을 연결할 페이지를 찾지 못했습니다.",
  "studio.producerError.rasterEdit.invalidDimensionsSource": "현재 페이지는 {requestedPixels}픽셀로 필터 허용치 {maxPixelCount}픽셀을 넘습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
  "studio.producerError.rasterEdit.invalidDimensionsPage": "페이지 크기가 올바르지 않습니다. 양수 정수 해상도로 조정해 주세요.",
  "studio.producerError.rasterEdit.sourceSelectionMismatchEmpty": "요청한 합성 원본 {ids}이(가) 숨김·제외·누락 또는 완전 투명 상태입니다. 표시 상태와 대상을 다시 확인해 주세요.",
  "studio.producerError.rasterEdit.sourceSelectionMismatchChanged": "숨김 대상으로 지정한 원본 {ids}을(를) 현재 문서에서 찾지 못했습니다.",
  "studio.producerError.rasterEdit.noVisibleSourceDefault": "편집용 복사본으로 만들 표시 레이어가 없습니다.",
  "studio.producerError.rasterEdit.noVisibleSourcePixelSelection": "픽셀 선택용 복사본으로 만들 표시 요소가 없습니다. 완전 투명·숨김 레이어가 아닌 선이나 객체를 먼저 추가해 주세요.",
  "studio.producerError.rasterEdit.sourceLocked": "잠긴 원본 {ids}은(는) 숨길 수 없습니다. 요소 또는 그룹 잠금을 해제한 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.sourceBudgetExceededPixels": "표시 레이어 데이터를 안전하게 읽지 못해 편집용 복사본을 만들지 않았습니다.",
  "studio.producerError.rasterEdit.sourceBudgetExceededBytes": "표시 레이어 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 레이어 수를 줄여 주세요.",
  "studio.producerError.rasterEdit.svgBudgetExceeded": "현재 모습의 복사본 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 레이어 수를 줄여 주세요.",
  "studio.producerError.rasterEdit.stalePlan": "편집용 래스터를 준비하는 동안 페이지 내용이나 잠금 상태가 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.invalidCompositeNotPng": "래스터 합성 결과가 올바른 PNG가 아니어서 원본을 변경하지 않았습니다.",
  "studio.producerError.rasterEdit.invalidCompositePngTooLarge": "필터 합성 PNG가 허용치 {maxBytes}바이트를 넘어 적용하지 않았습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
  "studio.producerError.rasterEdit.invalidCompositeLayerMismatch": "필터 합성 레이어가 현재 페이지와 일치하지 않아 원본을 변경하지 않았습니다.",
  "studio.producerError.rasterEdit.fidelityPrefix": "현재 모습의 복사본을 안전하게 만들지 못해 원본은 그대로 유지했습니다.",
  "studio.producerError.rasterEdit.fidelityActionWrap": "말풍선·글상자의 글이 상자보다 길어 자동으로 줄이 바뀝니다. 상자를 조금 넓히거나 원하는 자리에서 엔터로 줄을 나눈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionVertical": "세로쓰기 안의 영문·숫자 배치가 달라질 수 있습니다. 해당 텍스트를 가로쓰기로 바꾸거나 줄을 직접 나눈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionExternal": "인터넷 주소로 연결된 이미지가 있습니다. 이미지를 작업 파일에 다시 넣거나 해당 레이어를 잠시 숨긴 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionBlend": "지원되지 않는 혼합 모드 또는 아래 레이어로 자르기 설정을 잠시 끈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionFilterEffect": "기존 색보정 효과를 확정하거나 잠시 끈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionStructure": "레이어 구조가 올바르지 않습니다. 해당 레이어를 그룹에서 꺼내거나 복제한 새 레이어로 교체한 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionFallback": "지원되지 않는 효과나 레이어 설정을 잠시 끄거나 해당 레이어를 숨긴 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.aborted": "편집용 래스터 복사본 준비를 취소했습니다.",
  "studio.producerError.rasterEdit.filterStale": "필터를 준비하는 동안 페이지 내용이 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.filterResolutionMismatch": "필터 합성 결과의 해상도가 현재 페이지와 다릅니다. 페이지 크기를 확인한 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.filterLayerCountMismatch": "필터 합성 결과의 레이어 수가 현재 페이지와 다릅니다. 최신 화면에서 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.filterNotPng": "필터 합성 결과가 올바른 PNG가 아닙니다. 레이어를 단순화한 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.filterPngTooLarge": "필터 합성 PNG가 {pngBytes}바이트로 허용치 {maxBytes}바이트를 넘습니다. 페이지를 나누거나 해상도와 레이어 복잡도를 낮춰 주세요.",
  "studio.producerError.rasterEdit.copyIdRequired": "편집용 래스터 복사본 id가 필요합니다.",
  "studio.producerError.rasterEdit.copyResultMismatch": "편집용 래스터 복사본 결과가 현재 계획과 일치하지 않습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.rasterEdit.invalidPageId": "Could not find the page to attach the editable copy to.",
  "studio.producerError.rasterEdit.invalidDimensionsSource": "This page is {requestedPixels} pixels, over the {maxPixelCount}-pixel filter budget. Please split the page or lower the resolution.",
  "studio.producerError.rasterEdit.invalidDimensionsPage": "The page size is invalid. Please use a positive whole-number resolution.",
  "studio.producerError.rasterEdit.sourceSelectionMismatchEmpty": "The requested composite sources {ids} are hidden, excluded, missing, or fully transparent. Please check the visibility and the targets again.",
  "studio.producerError.rasterEdit.sourceSelectionMismatchChanged": "The sources marked to hide ({ids}) are not in the current document.",
  "studio.producerError.rasterEdit.noVisibleSourceDefault": "There is no visible layer to make an editable copy from.",
  "studio.producerError.rasterEdit.noVisibleSourcePixelSelection": "There is no visible element to copy for a pixel selection. Please add a stroke or object that is neither fully transparent nor hidden first.",
  "studio.producerError.rasterEdit.sourceLocked": "Locked sources {ids} cannot be hidden. Please unlock the element or its group, then try again.",
  "studio.producerError.rasterEdit.sourceBudgetExceededPixels": "The visible layer data could not be read safely, so no editable copy was made.",
  "studio.producerError.rasterEdit.sourceBudgetExceededBytes": "The visible layer data exceeds the safe processing budget. Please split the page or reduce the number of visible layers.",
  "studio.producerError.rasterEdit.svgBudgetExceeded": "The current-appearance copy exceeds the safe processing budget. Please split the page or reduce the number of visible layers.",
  "studio.producerError.rasterEdit.stalePlan": "The page content or lock state changed while the editable raster was being prepared. Please try again from the current view.",
  "studio.producerError.rasterEdit.invalidCompositeNotPng": "The raster composite was not a valid PNG, so the original was left untouched.",
  "studio.producerError.rasterEdit.invalidCompositePngTooLarge": "The filter composite PNG exceeds the {maxBytes}-byte budget, so it was not applied. Please split the page or lower the resolution.",
  "studio.producerError.rasterEdit.invalidCompositeLayerMismatch": "The filter composite layer does not match the current page, so the original was left untouched.",
  "studio.producerError.rasterEdit.fidelityPrefix": "A safe copy of the current appearance could not be made, so the original was preserved.",
  "studio.producerError.rasterEdit.fidelityActionWrap": "Text in a bubble or text box is longer than its box, so lines wrap automatically. Please widen the box a little, or break the lines yourself with Enter, then try again.",
  "studio.producerError.rasterEdit.fidelityActionVertical": "Latin and numeric content inside vertical text can be laid out differently. Switch that text to horizontal writing or insert the line breaks yourself, then try again.",
  "studio.producerError.rasterEdit.fidelityActionExternal": "An image is linked by internet address. Add the image to the document again or temporarily hide that layer, then try again.",
  "studio.producerError.rasterEdit.fidelityActionBlend": "Temporarily turn off the unsupported blend mode or clip-to-layer-below setting, then try again.",
  "studio.producerError.rasterEdit.fidelityActionFilterEffect": "Commit the existing color adjustment or temporarily turn it off, then try again.",
  "studio.producerError.rasterEdit.fidelityActionStructure": "The layer structure is invalid. Move that layer out of its group or replace it with a duplicated layer, then try again.",
  "studio.producerError.rasterEdit.fidelityActionFallback": "Temporarily turn off unsupported effects or layer settings, or hide that layer, then try again.",
  "studio.producerError.rasterEdit.aborted": "Preparing the editable raster copy was cancelled.",
  "studio.producerError.rasterEdit.filterStale": "The page content changed while the filter was being prepared. Please try again from the current view.",
  "studio.producerError.rasterEdit.filterResolutionMismatch": "The filter composite resolution differs from the current page. Please check the page size, then try again.",
  "studio.producerError.rasterEdit.filterLayerCountMismatch": "The filter composite layer count differs from the current page. Please try again from the current view.",
  "studio.producerError.rasterEdit.filterNotPng": "The filter composite is not a valid PNG. Please simplify the layers, then try again.",
  "studio.producerError.rasterEdit.filterPngTooLarge": "The filter composite PNG is {pngBytes} bytes, over the {maxBytes}-byte budget. Please split the page or lower the resolution and layer complexity.",
  "studio.producerError.rasterEdit.copyIdRequired": "An editable raster copy id is required.",
  "studio.producerError.rasterEdit.copyResultMismatch": "The editable raster copy result does not match the current plan.",
});

/** 사유 코드별 해석 키 — documentLocked·unsupportedFidelity.*는 전용 경로로 해석한다. */
const RASTER_EDIT_REASON_KEYS: Readonly<Record<string, string>> = {
  invalidPageId: "studio.producerError.rasterEdit.invalidPageId",
  "invalidDimensions.source": "studio.producerError.rasterEdit.invalidDimensionsSource",
  "invalidDimensions.page": "studio.producerError.rasterEdit.invalidDimensionsPage",
  "sourceSelectionMismatch.empty": "studio.producerError.rasterEdit.sourceSelectionMismatchEmpty",
  "sourceSelectionMismatch.changed": "studio.producerError.rasterEdit.sourceSelectionMismatchChanged",
  "noVisibleSource.default": "studio.producerError.rasterEdit.noVisibleSourceDefault",
  "noVisibleSource.pixelSelection": "studio.producerError.rasterEdit.noVisibleSourcePixelSelection",
  sourceLocked: "studio.producerError.rasterEdit.sourceLocked",
  "sourceBudgetExceeded.pixels": "studio.producerError.rasterEdit.sourceBudgetExceededPixels",
  "sourceBudgetExceeded.bytes": "studio.producerError.rasterEdit.sourceBudgetExceededBytes",
  svgBudgetExceeded: "studio.producerError.rasterEdit.svgBudgetExceeded",
  stalePlan: "studio.producerError.rasterEdit.stalePlan",
  "invalidComposite.notPng": "studio.producerError.rasterEdit.invalidCompositeNotPng",
  "invalidComposite.pngTooLarge": "studio.producerError.rasterEdit.invalidCompositePngTooLarge",
  "invalidComposite.layerMismatch": "studio.producerError.rasterEdit.invalidCompositeLayerMismatch",
};

/** 키별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const RASTER_EDIT_REASON_KO: Readonly<Record<string, string>> = {
  "studio.producerError.rasterEdit.invalidPageId": "편집용 복사본을 연결할 페이지를 찾지 못했습니다.",
  "studio.producerError.rasterEdit.invalidDimensionsSource": "현재 페이지는 {requestedPixels}픽셀로 필터 허용치 {maxPixelCount}픽셀을 넘습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
  "studio.producerError.rasterEdit.invalidDimensionsPage": "페이지 크기가 올바르지 않습니다. 양수 정수 해상도로 조정해 주세요.",
  "studio.producerError.rasterEdit.sourceSelectionMismatchEmpty": "요청한 합성 원본 {ids}이(가) 숨김·제외·누락 또는 완전 투명 상태입니다. 표시 상태와 대상을 다시 확인해 주세요.",
  "studio.producerError.rasterEdit.sourceSelectionMismatchChanged": "숨김 대상으로 지정한 원본 {ids}을(를) 현재 문서에서 찾지 못했습니다.",
  "studio.producerError.rasterEdit.noVisibleSourceDefault": "편집용 복사본으로 만들 표시 레이어가 없습니다.",
  "studio.producerError.rasterEdit.noVisibleSourcePixelSelection": "픽셀 선택용 복사본으로 만들 표시 요소가 없습니다. 완전 투명·숨김 레이어가 아닌 선이나 객체를 먼저 추가해 주세요.",
  "studio.producerError.rasterEdit.sourceLocked": "잠긴 원본 {ids}은(는) 숨길 수 없습니다. 요소 또는 그룹 잠금을 해제한 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.sourceBudgetExceededPixels": "표시 레이어 데이터를 안전하게 읽지 못해 편집용 복사본을 만들지 않았습니다.",
  "studio.producerError.rasterEdit.sourceBudgetExceededBytes": "표시 레이어 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 레이어 수를 줄여 주세요.",
  "studio.producerError.rasterEdit.svgBudgetExceeded": "현재 모습의 복사본 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 레이어 수를 줄여 주세요.",
  "studio.producerError.rasterEdit.stalePlan": "편집용 래스터를 준비하는 동안 페이지 내용이나 잠금 상태가 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.invalidCompositeNotPng": "래스터 합성 결과가 올바른 PNG가 아니어서 원본을 변경하지 않았습니다.",
  "studio.producerError.rasterEdit.invalidCompositePngTooLarge": "필터 합성 PNG가 허용치 {maxBytes}바이트를 넘어 적용하지 않았습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
  "studio.producerError.rasterEdit.invalidCompositeLayerMismatch": "필터 합성 레이어가 현재 페이지와 일치하지 않아 원본을 변경하지 않았습니다.",
};

const RASTER_EDIT_FIDELITY_ACTION_KEYS: Readonly<Record<string, string>> = {
  wrap: "studio.producerError.rasterEdit.fidelityActionWrap",
  vertical: "studio.producerError.rasterEdit.fidelityActionVertical",
  external: "studio.producerError.rasterEdit.fidelityActionExternal",
  blend: "studio.producerError.rasterEdit.fidelityActionBlend",
  filterEffect: "studio.producerError.rasterEdit.fidelityActionFilterEffect",
  structure: "studio.producerError.rasterEdit.fidelityActionStructure",
  fallback: "studio.producerError.rasterEdit.fidelityActionFallback",
};

const RASTER_EDIT_FIDELITY_ACTION_KO: Readonly<Record<string, string>> = {
  "studio.producerError.rasterEdit.fidelityActionWrap": "말풍선·글상자의 글이 상자보다 길어 자동으로 줄이 바뀝니다. 상자를 조금 넓히거나 원하는 자리에서 엔터로 줄을 나눈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionVertical": "세로쓰기 안의 영문·숫자 배치가 달라질 수 있습니다. 해당 텍스트를 가로쓰기로 바꾸거나 줄을 직접 나눈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionExternal": "인터넷 주소로 연결된 이미지가 있습니다. 이미지를 작업 파일에 다시 넣거나 해당 레이어를 잠시 숨긴 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionBlend": "지원되지 않는 혼합 모드 또는 아래 레이어로 자르기 설정을 잠시 끈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionFilterEffect": "기존 색보정 효과를 확정하거나 잠시 끈 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionStructure": "레이어 구조가 올바르지 않습니다. 해당 레이어를 그룹에서 꺼내거나 복제한 새 레이어로 교체한 뒤 다시 시도해 주세요.",
  "studio.producerError.rasterEdit.fidelityActionFallback": "지원되지 않는 효과나 레이어 설정을 잠시 끄거나 해당 레이어를 숨긴 뒤 다시 시도해 주세요.",
};

/** fidelity 사유 조립 — 이관 전 fidelityReason의 조립(머리말+레이어 안내+조치 최대 2문장)과 동일하다. */
function resolveRasterEditFidelityReason(params?: Readonly<Record<string, string>>): string {
  const prefix = resolveProducerError(
    "studio.producerError.rasterEdit.fidelityPrefix",
    "현재 모습의 복사본을 안전하게 만들지 못해 원본은 그대로 유지했습니다.",
  );
  const layers = params?.layers ?? "";
  const moreCount = params?.moreCount ?? "";
  let layerPart = "";
  if (layers) {
    layerPart = getLang() === "en"
      ? ` Layers to check: ${layers}${moreCount ? ` and ${moreCount} more` : ""}.`
      : ` 확인이 필요한 레이어: ${layers}${moreCount ? ` 외 ${moreCount}개` : ""}.`;
  }
  const actionCodes = (params?.actions ?? "fallback").split(",").filter(Boolean);
  const actions = actionCodes.map((actionCode) => {
    const key = RASTER_EDIT_FIDELITY_ACTION_KEYS[actionCode] ?? RASTER_EDIT_FIDELITY_ACTION_KEYS.fallback!;
    return resolveProducerError(key, RASTER_EDIT_FIDELITY_ACTION_KO[key]);
  });
  return `${prefix}${layerPart} ${actions.join(" ")}`;
}

/** 표시 지점 전용 해석 (rasterEdit Result 사유): Host·SessionDialogs·사전점검 상태가 부른다. */
export function resolveStudioRasterEditReason(reason: StudioRasterEditReason): string {
  if (reason.code === "documentLocked") return reason.params?.message ?? "";
  if (reason.code === "unsupportedFidelity.filter" || reason.code === "unsupportedFidelity.effect") {
    return resolveRasterEditFidelityReason(reason.params);
  }
  const key = RASTER_EDIT_REASON_KEYS[reason.code];
  if (!key) return reason.code;
  return resolveProducerError(key, RASTER_EDIT_REASON_KO[key], reason.params);
}

const RASTER_EDIT_ERROR_KEYS: Readonly<Record<StudioRasterEditErrorCode, string>> = {
  aborted: "studio.producerError.rasterEdit.aborted",
  filterStale: "studio.producerError.rasterEdit.filterStale",
  filterResolutionMismatch: "studio.producerError.rasterEdit.filterResolutionMismatch",
  filterLayerCountMismatch: "studio.producerError.rasterEdit.filterLayerCountMismatch",
  filterNotPng: "studio.producerError.rasterEdit.filterNotPng",
  filterPngTooLarge: "studio.producerError.rasterEdit.filterPngTooLarge",
  copyIdRequired: "studio.producerError.rasterEdit.copyIdRequired",
  copyResultMismatch: "studio.producerError.rasterEdit.copyResultMismatch",
};

const RASTER_EDIT_ERROR_KO: Readonly<Record<StudioRasterEditErrorCode, string>> = {
  aborted: "편집용 래스터 복사본 준비를 취소했습니다.",
  filterStale: "필터를 준비하는 동안 페이지 내용이 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.",
  filterResolutionMismatch: "필터 합성 결과의 해상도가 현재 페이지와 다릅니다. 페이지 크기를 확인한 뒤 다시 시도해 주세요.",
  filterLayerCountMismatch: "필터 합성 결과의 레이어 수가 현재 페이지와 다릅니다. 최신 화면에서 다시 시도해 주세요.",
  filterNotPng: "필터 합성 결과가 올바른 PNG가 아닙니다. 레이어를 단순화한 뒤 다시 시도해 주세요.",
  filterPngTooLarge: "필터 합성 PNG가 {pngBytes}바이트로 허용치 {maxBytes}바이트를 넘습니다. 페이지를 나누거나 해상도와 레이어 복잡도를 낮춰 주세요.",
  copyIdRequired: "편집용 래스터 복사본 id가 필요합니다.",
  copyResultMismatch: "편집용 래스터 복사본 결과가 현재 계획과 일치하지 않습니다.",
};

/** 표시 지점 전용 해석 (rasterEdit throw 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioRasterEditError(
  error: { readonly code: StudioRasterEditErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(RASTER_EDIT_ERROR_KEYS[error.code], RASTER_EDIT_ERROR_KO[error.code], error.params);
}

/**
 * 표시 지점 전용 해석 (rasterEdit throw 오류, 원인 객체 덕 타이핑): Host의
 * 준비 흐름 catch가 부른다. aborted는 이관 전 규약대로 이름이 "AbortError"라
 * 두 이름을 모두 판정한다. 해당하지 않으면 null — 호출자는 기존 메시지
 * 경로를 유지한다.
 */
export function resolveStudioRasterEditErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioRasterEditError" && name !== "AbortError") return null;
  if (typeof code !== "string" || !Object.hasOwn(RASTER_EDIT_ERROR_KEYS, code)) return null;
  return resolveStudioRasterEditError({
    code: code as StudioRasterEditErrorCode,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}
