/**
 * A4 D4 조건부 묶음 6호 (R20, 설계 r16 §5.3 결정 2-A): 이미지 필터 Worker 클라이언트
 * 자체 방출 오류의 구조화 코드표.
 *
 * 생산자(studio-image-filter-worker-client.ts의 단발·세션·상주 세션 세 구현과
 * studio-image-filter-worker-protocol.ts의 assert)는 표시 문구 대신 구조화 코드만
 * 방출하고, 표시는 표시 지점에서만 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-filter-worker.ts의 filterWorker 구간).
 * Error.message는 코드 문자열 자체다(표시 문구가 아니다). 동적 삽입값은 params로만
 * 싣는다(protocol assert 5종의 {label}).
 * 기존 throw가 Error/TypeError/RangeError로 갈리던 종류 구분은 errorKind 필드로
 * 보존한다. Abort는 DOMException/AbortError 이름 계약이 우선이라 이 클래스를 쓰지
 * 않는 경로가 있고(클라이언트 createAbortError), 그 경우에도 이름 계약은 유지된다.
 * 워커 경계에서는 프로토콜 failure/source-failure 페이로드의 선택 필드 code/params가
 * 이 코드를 운반한다(버전 상향 없는 하위 호환 — 코드가 없으면 message 패스스루).
 */
export type StudioImageFilterWorkerErrorCode =
  | "aborted"
  | "errorResponseMalformed"
  | "resultSizeMismatch"
  | "unknownResponse"
  | "computeTimeout"
  | "requestPostFailed"
  | "resultBeforeReady"
  | "workerExecutionFailed"
  | "workerPrepareFailed"
  | "responseUnreadable"
  | "readyTimeout"
  | "workerUnavailable"
  | "workerCreateFailed"
  | "sourceRevisionInvalid"
  | "residentSourceIdentityMismatch"
  | "runRequestPostFailed"
  | "sourcePostFailed"
  | "staleSourceResponse"
  | "staleFailureResponse"
  | "staleFilterResult"
  | "protocolFormatInvalid"
  | "protocolPixelBufferType"
  | "protocolSizeNotPositiveInteger"
  | "protocolSizeOverLimit"
  | "protocolBufferLengthMismatch";

/** 기존 throw의 오류 종류 보존: "type"=구 TypeError, "range"=구 RangeError, "error"=구 Error. */
export type StudioImageFilterWorkerErrorKind = "error" | "range" | "type";

/** 코드별 기본 종류 — 워커 경계(코드만 운반)에서도 종류가 복원되도록 코드에서 도출한다. */
export const STUDIO_IMAGE_FILTER_WORKER_ERROR_KINDS: Readonly<
  Record<StudioImageFilterWorkerErrorCode, StudioImageFilterWorkerErrorKind>
> = {
  aborted: "error",
  errorResponseMalformed: "error",
  resultSizeMismatch: "range",
  unknownResponse: "error",
  computeTimeout: "error",
  requestPostFailed: "error",
  resultBeforeReady: "error",
  workerExecutionFailed: "error",
  workerPrepareFailed: "error",
  responseUnreadable: "error",
  readyTimeout: "error",
  workerUnavailable: "error",
  workerCreateFailed: "error",
  sourceRevisionInvalid: "type",
  residentSourceIdentityMismatch: "error",
  runRequestPostFailed: "error",
  sourcePostFailed: "error",
  staleSourceResponse: "error",
  staleFailureResponse: "error",
  staleFilterResult: "error",
  protocolFormatInvalid: "type",
  protocolPixelBufferType: "type",
  protocolSizeNotPositiveInteger: "range",
  protocolSizeOverLimit: "range",
  protocolBufferLengthMismatch: "range",
};

export const STUDIO_IMAGE_FILTER_WORKER_ERROR_CODES: ReadonlySet<string> = new Set([
  "aborted",
  "errorResponseMalformed",
  "resultSizeMismatch",
  "unknownResponse",
  "computeTimeout",
  "requestPostFailed",
  "resultBeforeReady",
  "workerExecutionFailed",
  "workerPrepareFailed",
  "responseUnreadable",
  "readyTimeout",
  "workerUnavailable",
  "workerCreateFailed",
  "sourceRevisionInvalid",
  "residentSourceIdentityMismatch",
  "runRequestPostFailed",
  "sourcePostFailed",
  "staleSourceResponse",
  "staleFailureResponse",
  "staleFilterResult",
  "protocolFormatInvalid",
  "protocolPixelBufferType",
  "protocolSizeNotPositiveInteger",
  "protocolSizeOverLimit",
  "protocolBufferLengthMismatch",
]);

export function isStudioImageFilterWorkerErrorCode(
  value: unknown,
): value is StudioImageFilterWorkerErrorCode {
  return typeof value === "string" && STUDIO_IMAGE_FILTER_WORKER_ERROR_CODES.has(value);
}

/** 프로토콜 페이로드·원인 객체에서 문자열 params만 추린다(리졸버·역직렬화 공용). */
export function studioImageFilterWorkerErrorParams(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export class StudioImageFilterWorkerError extends Error {
  readonly code: StudioImageFilterWorkerErrorCode;
  readonly errorKind: StudioImageFilterWorkerErrorKind;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioImageFilterWorkerErrorCode,
    options: {
      cause?: unknown;
      errorKind?: StudioImageFilterWorkerErrorKind;
      name?: string;
      params?: Readonly<Record<string, string>>;
    } = {},
  ) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = options.name ?? "StudioImageFilterWorkerError";
    this.code = code;
    this.errorKind = options.errorKind ?? STUDIO_IMAGE_FILTER_WORKER_ERROR_KINDS[code];
    if (options.params !== undefined) this.params = options.params;
  }
}
