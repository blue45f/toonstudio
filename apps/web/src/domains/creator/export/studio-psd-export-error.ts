/**
 * PSD export 구조화 오류 (A4 D4, R15 — §3.10).
 *
 * studio-psd-export.ts의 throw 채널과 preflight 차단 사유를 구조화 코드로
 * 방출하기 위한 정의. 생산자는 표시 문구 대신 {code, params}만 방출하고
 * (Error.message = 코드 문자열), 표시는 표시 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-exports.ts의 psdExport 구간).
 * buildFailed만 하위 쓰기 실패의 동적 원인을 params.causeMessage로 실어
 * 현행 표시와 동등하게 유지한다(부분 잔존).
 */

export type StudioPsdExportErrorCode =
  | "outputTooLarge"
  | "panelCropSurfaceFailed"
  | "layerPixelsOverBudget"
  | "strokePixelsUnreadable"
  | "maskCaptureBoundsMissing"
  | "backgroundSurfaceFailed"
  | "unsupportedAdjustmentSettings"
  | "adjustmentMetadataOverBudget"
  | "adjustmentCompositeSizeMismatch"
  | "adjustmentCompositePixelsUnreadable"
  | "maskReadFailed"
  | "maskConvertFailed"
  | "buildFailed"
  | "preflightBlocked";

export type PsdExportBlockingReasonCode =
  | "psbNotYetSupported"
  | "canvasSizeInvalid"
  | "canvasDimensionExceeded"
  | "canvasPixelsExceeded"
  | "layerCountInvalid"
  | "layerCountExceeded";

/** preflight 차단 사유 1건 — 표시 문구 대신 코드와 데이터 파라미터만 싣는다. */
export interface PsdExportBlockingReason {
  readonly code: PsdExportBlockingReasonCode;
  readonly params?: Readonly<Record<string, string>>;
}

export class StudioPsdExportError extends Error {
  readonly code: StudioPsdExportErrorCode;
  readonly params?: Readonly<Record<string, string>>;
  /** code가 "preflightBlocked"일 때만 존재 — preflight가 방출한 차단 사유 배열. */
  readonly blockingReasons?: readonly PsdExportBlockingReason[];

  constructor(
    code: StudioPsdExportErrorCode,
    params?: Readonly<Record<string, string>>,
    options?: {
      readonly cause?: unknown;
      readonly blockingReasons?: readonly PsdExportBlockingReason[];
    },
  ) {
    super(code, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "StudioPsdExportError";
    this.code = code;
    if (params !== undefined) this.params = params;
    if (options?.blockingReasons !== undefined) this.blockingReasons = options.blockingReasons;
  }
}
