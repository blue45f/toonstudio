/**
 * A4 D4 (R15): studio-vector-fill-reference 생산자 구조화 오류 정의 — 기준선
 * 포화로 전용 파일에 추출했다(studio-comments-error.ts 선례). 오류 클래스는
 * 기존 거친 code를 그대로 유지하고, 문구 단위 세부 코드 detail과 params를
 * 함께 방출한다(message = 세부 코드 문자열). 표시는 표시 지점에서 리졸버
 * (status-i18n/studio-producer-error-i18n-vector.ts의 vectorFill 구간)로만
 * 해석한다.
 *
 * 패스스루 명시: detail "invalidDimensionsDetail"과 "offscreenWorkerIncomplete"의
 * params.detail은 하위 엔진·Worker가 만든 동적 원문이라 로케일 대상이 아닌
 * 패스스루다. 계획 실패(StudioAdvancedFillVectorTargetPlan)도 같은 detail
 * 체계를 공유한다 — 계획의 code는 기존 계획 실패 코드를 그대로 쓴다.
 */
export type StudioVectorFillDetailCode =
  | "aborted"
  | "sourceUnreadable"
  | "invalidDimensionsDetail"
  | "sourceTooLarge"
  | "unsupportedFidelity"
  | "svgTooLarge"
  | "pngReadFailed"
  | "pngDataUrlFailed"
  | "imageUnavailable"
  | "svgImageReadFailed"
  | "pngEncodeFailed"
  | "pngTooLarge"
  | "canvasUnavailable"
  | "canvasCreateFailed"
  | "pngFormatUnverified"
  | "offscreenDecoderUnavailable"
  | "offscreenWorkerUnavailable"
  | "offscreenInvalidBitmap"
  | "offscreenWorkerStartFailed"
  | "offscreenWorkerIncomplete"
  | "offscreenInvalidPngResult"
  | "offscreenWrongContainer"
  | "offscreenRunFailed"
  | "pngSizeMismatch"
  | "fillResultInvalidPng"
  | "invalidPageId"
  | "noVisibleDraw"
  | "minSerializedTooLarge";

export class StudioVectorReferenceError extends Error {
  readonly code:
    | "invalid-page-id"
    | "invalid-dimensions"
    | "no-visible-vector-draw"
    | "source-budget-exceeded"
    | "svg-budget-exceeded"
    | "unsupported-vector-fidelity"
    | "aborted"
    | "png-budget-exceeded"
    | "invalid-png-output"
    | "raster-unavailable";
  readonly detail: StudioVectorFillDetailCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioVectorReferenceError["code"],
    detail: StudioVectorFillDetailCode,
    params?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(detail, options);
    this.name = "StudioVectorReferenceError";
    this.code = code;
    this.detail = detail;
    if (params !== undefined) this.params = params;
  }
}
