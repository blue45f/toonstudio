/**
 * A4 D4 (R15): studio-will-v1-import-bridge 생산자 구조화 오류 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-comments-error.ts 선례). 설계 r10-d4-trace-3.md §2.26의
 * "검사 throw 7·Error 1" 집계는 부분 집계였고 현행 트리 실측은 서로 다른 throw
 * 문구 9종(방출 지점 10곳)이다. 취소 오류는 호출부의 AbortError 관례를 지키기 위해
 * name만 "AbortError"로 유지하고 message는 코드 문자열을 싣는다.
 */

/** WILL v1 가져오기 검사·커밋 throw 코드 (interchange-import catch 2곳이 표시 지점). */
export type StudioWillV1ImportErrorCode =
  | "aborted"
  | "invalidValue"
  | "elementCountMismatch"
  | "profileUnverified"
  | "blockedLoss"
  | "destinationRequired"
  | "newPageNotAllowed"
  | "currentPageNotAllowed"
  | "elementLimitExceeded";

/** invalidValue의 {label} 코드 — 호출부 리터럴 라벨을 대체한다. */
export type StudioWillV1ImportLabelCode =
  | "canvasWidth"
  | "documentWidth"
  | "documentHeight";

export class StudioWillV1ImportError extends Error {
  readonly code: StudioWillV1ImportErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioWillV1ImportErrorCode,
    params?: Readonly<Record<string, string>>,
    options?: { cause?: unknown; errorName?: string },
  ) {
    super(code, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = options?.errorName ?? "StudioWillV1ImportError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
