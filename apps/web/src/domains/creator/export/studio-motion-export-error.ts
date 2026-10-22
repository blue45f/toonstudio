/**
 * Motion export 구조화 오류 (A4 D4, R15 — §3.9).
 *
 * studio-motion-export.ts에서 추출했다(소스 크기 래칫 대응). 생산자는 표시
 * 문구 대신 구조화 코드만 방출하고(message = 코드 문자열), 표시는 표시
 * 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-exports.ts의 motionExport 구간).
 * 공개 API는 원 모듈이 그대로 재수출한다.
 */

export type StudioMotionExportErrorCode =
  | "cutImageLoadFailed"
  | "noCuts"
  | "imageCountMismatch"
  | "webmUnsupported"
  | "canvasContextFailed"
  | "recorderFailed"
  | "noRecordedData";

export class StudioMotionExportError extends Error {
  readonly code: StudioMotionExportErrorCode;

  constructor(code: StudioMotionExportErrorCode) {
    super(code);
    this.name = "StudioMotionExportError";
    this.code = code;
  }
}

export type MotionExportCodecUnavailableErrorCode =
  | "codecIdentityMismatch"
  | "containerMagicMismatch";

/**
 * 선택한 WebM 코덱 영수증이 어긋나 저장을 중단할 때의 오류. 기존 `reason`
 * 필드("codec-identity"·"container-magic")는 호환을 위해 유지하고, 같은
 * 구분을 code로 승격했다(R15 §3.9).
 */
export class MotionExportCodecUnavailableError extends Error {
  readonly selectedMime: string;
  readonly recorderMime: string;
  readonly reason: "codec-identity" | "container-magic";
  readonly code: MotionExportCodecUnavailableErrorCode;

  constructor(input: {
    selectedMime: string;
    recorderMime: string;
    reason: "codec-identity" | "container-magic";
  }) {
    const code: MotionExportCodecUnavailableErrorCode =
      input.reason === "codec-identity" ? "codecIdentityMismatch" : "containerMagicMismatch";
    super(code);
    this.name = "MotionExportCodecUnavailableError";
    this.selectedMime = input.selectedMime;
    this.recorderMime = input.recorderMime;
    this.reason = input.reason;
    this.code = code;
  }
}
