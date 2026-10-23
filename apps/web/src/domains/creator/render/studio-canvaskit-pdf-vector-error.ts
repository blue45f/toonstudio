/**
 * 벡터 PDF writer 구조화 오류 (A4 D4, R15 — §3.12).
 *
 * studio-canvaskit-pdf-vector.ts의 throw 26곳을 구조화 코드로 방출하기 위한
 * 정의. 생산자는 표시 문구 대신 {code, params}만 방출하고(Error.message =
 * 코드 문자열), 표시는 표시 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-exports-raster.ts의 pdfVector 구간).
 * fontEmbedDenied만 글꼴 임베딩 정책 모듈의 동적 문자열을
 * params.causeMessage로 실어 현행 표시와 동등하게 유지한다(부분 잔존).
 */

export type StudioPdfVectorErrorCode =
  | "nonFiniteNumber"
  | "missingObject"
  | "missingFontRef"
  | "standardFontUnicode"
  | "glyphMissing"
  | "unknownProfile"
  | "fileIdFormat"
  | "invalidDate"
  | "modifiedBeforeCreated"
  | "xmpTooLarge"
  | "iccRequired"
  | "iccTooShort"
  | "iccLengthMismatch"
  | "iccSignatureInvalid"
  | "iccColorSpaceMismatch"
  | "trimBoxRequired"
  | "trimBoxOutside"
  | "bleedBoxInvalid"
  | "noPages"
  | "invalidPageSize"
  | "duplicateFontName"
  | "fontEmbedCffUnsupported"
  | "fontEmbedDenied"
  | "fontsMustEmbed"
  | "imageNotJpeg";

export class StudioPdfVectorError extends Error {
  readonly code: StudioPdfVectorErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioPdfVectorErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioPdfVectorError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
