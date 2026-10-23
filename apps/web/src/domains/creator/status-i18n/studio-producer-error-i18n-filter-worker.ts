/**
 * 생산자 구조화 에러 해석 모듈 — filterWorker 구간: 이미지 필터 Worker 클라이언트
 * 자체 방출 코드 25종 (A4 D4 조건부 묶음 6호, R20 설계 r16 §5.3 결정 1-A·2-A).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자(studio-image-filter-worker-client.ts의 세 구현 + 프로토콜 assert)는
 * StudioImageFilterWorkerError {code, errorKind, params}만 방출하고, 표시는 이 모듈의
 * 리졸버로만 해석한다. 워커 경계에서는 프로토콜 failure 페이로드의 선택 필드
 * code/params가 코드를 운반하고, 클라이언트 역직렬화가 같은 클래스(code·params·name)로
 * 재구성해 표시 지점까지 전달한다. 코드가 없는 원인(필터 엔진 패스스루 등)은
 * FromCause가 null을 돌려 호출자가 기존 메시지 경로로 폴백한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고(protocol assert 5종만 {label}로
 * 치환), en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import {
  isStudioImageFilterWorkerErrorCode,
  studioImageFilterWorkerErrorParams,
  type StudioImageFilterWorkerErrorCode,
} from "../studio-image-filter-worker-error";

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
  "studio.producerError.filterWorker.aborted": "이미지 필터 계산을 취소했습니다.",
  "studio.producerError.filterWorker.errorResponseMalformed": "이미지 필터 Worker의 오류 응답 형식이 올바르지 않습니다.",
  "studio.producerError.filterWorker.resultSizeMismatch": "이미지 필터 Worker 결과 크기가 원본과 일치하지 않습니다.",
  "studio.producerError.filterWorker.unknownResponse": "이미지 필터 Worker가 알 수 없는 응답을 반환했습니다.",
  "studio.producerError.filterWorker.computeTimeout": "이미지 필터 Worker 계산 시간이 초과되었습니다.",
  "studio.producerError.filterWorker.requestPostFailed": "이미지 필터 Worker에 요청을 전달하지 못했습니다.",
  "studio.producerError.filterWorker.resultBeforeReady": "이미지 필터 Worker가 준비 전에 결과를 반환했습니다.",
  "studio.producerError.filterWorker.workerExecutionFailed": "이미지 필터 Worker 실행 중 오류가 발생했습니다.",
  "studio.producerError.filterWorker.workerPrepareFailed": "이미지 필터 Worker를 준비하지 못했습니다.",
  "studio.producerError.filterWorker.responseUnreadable": "이미지 필터 Worker 응답을 읽지 못했습니다.",
  "studio.producerError.filterWorker.readyTimeout": "이미지 필터 Worker가 준비 시간 안에 응답하지 않았습니다.",
  "studio.producerError.filterWorker.workerUnavailable": "이미지 필터 Worker를 사용할 수 없습니다.",
  "studio.producerError.filterWorker.workerCreateFailed": "이미지 필터 Worker를 만들지 못했습니다.",
  "studio.producerError.filterWorker.sourceRevisionInvalid": "이미지 필터 상주 원본 revision 형식이 올바르지 않습니다.",
  "studio.producerError.filterWorker.residentSourceIdentityMismatch": "이미지 필터 Worker 상주 원본 정체성이 일치하지 않습니다.",
  "studio.producerError.filterWorker.runRequestPostFailed": "이미지 필터 Worker에 실행 요청을 전달하지 못했습니다.",
  "studio.producerError.filterWorker.sourcePostFailed": "이미지 필터 Worker에 원본을 전달하지 못했습니다.",
  "studio.producerError.filterWorker.staleSourceResponse": "이미지 필터 Worker가 오래되었거나 잘못된 원본 응답을 반환했습니다.",
  "studio.producerError.filterWorker.staleFailureResponse": "이미지 필터 Worker가 오래되었거나 잘못된 실패 응답을 반환했습니다.",
  "studio.producerError.filterWorker.staleFilterResult": "이미지 필터 Worker가 오래되었거나 잘못된 필터 결과를 반환했습니다.",
  "studio.producerError.filterWorker.protocolFormatInvalid": "{label} 형식이 올바르지 않습니다.",
  "studio.producerError.filterWorker.protocolPixelBufferType": "{label} 픽셀 버퍼는 Uint8ClampedArray여야 합니다.",
  "studio.producerError.filterWorker.protocolSizeNotPositiveInteger": "{label} 크기는 1 이상의 정수여야 합니다.",
  "studio.producerError.filterWorker.protocolSizeOverLimit": "{label} 크기가 안전 한도를 초과했습니다.",
  "studio.producerError.filterWorker.protocolBufferLengthMismatch": "{label} 픽셀 버퍼 길이가 가로·세로 크기와 일치하지 않습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.filterWorker.aborted": "The image filter computation was cancelled.",
  "studio.producerError.filterWorker.errorResponseMalformed": "The image filter Worker's error response format is invalid.",
  "studio.producerError.filterWorker.resultSizeMismatch": "The image filter Worker result size does not match the source.",
  "studio.producerError.filterWorker.unknownResponse": "The image filter Worker returned an unknown response.",
  "studio.producerError.filterWorker.computeTimeout": "The image filter Worker computation timed out.",
  "studio.producerError.filterWorker.requestPostFailed": "Could not deliver the request to the image filter Worker.",
  "studio.producerError.filterWorker.resultBeforeReady": "The image filter Worker returned a result before it was ready.",
  "studio.producerError.filterWorker.workerExecutionFailed": "An error occurred while the image filter Worker was running.",
  "studio.producerError.filterWorker.workerPrepareFailed": "Could not prepare the image filter Worker.",
  "studio.producerError.filterWorker.responseUnreadable": "Could not read the image filter Worker response.",
  "studio.producerError.filterWorker.readyTimeout": "The image filter Worker did not respond within the ready time.",
  "studio.producerError.filterWorker.workerUnavailable": "The image filter Worker is unavailable.",
  "studio.producerError.filterWorker.workerCreateFailed": "Could not create the image filter Worker.",
  "studio.producerError.filterWorker.sourceRevisionInvalid": "The resident image filter source revision format is invalid.",
  "studio.producerError.filterWorker.residentSourceIdentityMismatch": "The image filter Worker resident source identity does not match.",
  "studio.producerError.filterWorker.runRequestPostFailed": "Could not deliver the run request to the image filter Worker.",
  "studio.producerError.filterWorker.sourcePostFailed": "Could not deliver the source to the image filter Worker.",
  "studio.producerError.filterWorker.staleSourceResponse": "The image filter Worker returned a stale or invalid source response.",
  "studio.producerError.filterWorker.staleFailureResponse": "The image filter Worker returned a stale or invalid failure response.",
  "studio.producerError.filterWorker.staleFilterResult": "The image filter Worker returned a stale or invalid filter result.",
  "studio.producerError.filterWorker.protocolFormatInvalid": "The {label} format is invalid.",
  "studio.producerError.filterWorker.protocolPixelBufferType": "The {label} pixel buffer must be a Uint8ClampedArray.",
  "studio.producerError.filterWorker.protocolSizeNotPositiveInteger": "The {label} size must be an integer of 1 or more.",
  "studio.producerError.filterWorker.protocolSizeOverLimit": "The {label} size exceeds the safe limit.",
  "studio.producerError.filterWorker.protocolBufferLengthMismatch": "The {label} pixel buffer length does not match the width and height.",
});

const FILTER_WORKER_ERROR_KEYS: Readonly<Record<StudioImageFilterWorkerErrorCode, string>> = {
  aborted: "studio.producerError.filterWorker.aborted",
  errorResponseMalformed: "studio.producerError.filterWorker.errorResponseMalformed",
  resultSizeMismatch: "studio.producerError.filterWorker.resultSizeMismatch",
  unknownResponse: "studio.producerError.filterWorker.unknownResponse",
  computeTimeout: "studio.producerError.filterWorker.computeTimeout",
  requestPostFailed: "studio.producerError.filterWorker.requestPostFailed",
  resultBeforeReady: "studio.producerError.filterWorker.resultBeforeReady",
  workerExecutionFailed: "studio.producerError.filterWorker.workerExecutionFailed",
  workerPrepareFailed: "studio.producerError.filterWorker.workerPrepareFailed",
  responseUnreadable: "studio.producerError.filterWorker.responseUnreadable",
  readyTimeout: "studio.producerError.filterWorker.readyTimeout",
  workerUnavailable: "studio.producerError.filterWorker.workerUnavailable",
  workerCreateFailed: "studio.producerError.filterWorker.workerCreateFailed",
  sourceRevisionInvalid: "studio.producerError.filterWorker.sourceRevisionInvalid",
  residentSourceIdentityMismatch: "studio.producerError.filterWorker.residentSourceIdentityMismatch",
  runRequestPostFailed: "studio.producerError.filterWorker.runRequestPostFailed",
  sourcePostFailed: "studio.producerError.filterWorker.sourcePostFailed",
  staleSourceResponse: "studio.producerError.filterWorker.staleSourceResponse",
  staleFailureResponse: "studio.producerError.filterWorker.staleFailureResponse",
  staleFilterResult: "studio.producerError.filterWorker.staleFilterResult",
  protocolFormatInvalid: "studio.producerError.filterWorker.protocolFormatInvalid",
  protocolPixelBufferType: "studio.producerError.filterWorker.protocolPixelBufferType",
  protocolSizeNotPositiveInteger: "studio.producerError.filterWorker.protocolSizeNotPositiveInteger",
  protocolSizeOverLimit: "studio.producerError.filterWorker.protocolSizeOverLimit",
  protocolBufferLengthMismatch: "studio.producerError.filterWorker.protocolBufferLengthMismatch",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const FILTER_WORKER_ERROR_KO: Readonly<Record<StudioImageFilterWorkerErrorCode, string>> = {
  aborted: "이미지 필터 계산을 취소했습니다.",
  errorResponseMalformed: "이미지 필터 Worker의 오류 응답 형식이 올바르지 않습니다.",
  resultSizeMismatch: "이미지 필터 Worker 결과 크기가 원본과 일치하지 않습니다.",
  unknownResponse: "이미지 필터 Worker가 알 수 없는 응답을 반환했습니다.",
  computeTimeout: "이미지 필터 Worker 계산 시간이 초과되었습니다.",
  requestPostFailed: "이미지 필터 Worker에 요청을 전달하지 못했습니다.",
  resultBeforeReady: "이미지 필터 Worker가 준비 전에 결과를 반환했습니다.",
  workerExecutionFailed: "이미지 필터 Worker 실행 중 오류가 발생했습니다.",
  workerPrepareFailed: "이미지 필터 Worker를 준비하지 못했습니다.",
  responseUnreadable: "이미지 필터 Worker 응답을 읽지 못했습니다.",
  readyTimeout: "이미지 필터 Worker가 준비 시간 안에 응답하지 않았습니다.",
  workerUnavailable: "이미지 필터 Worker를 사용할 수 없습니다.",
  workerCreateFailed: "이미지 필터 Worker를 만들지 못했습니다.",
  sourceRevisionInvalid: "이미지 필터 상주 원본 revision 형식이 올바르지 않습니다.",
  residentSourceIdentityMismatch: "이미지 필터 Worker 상주 원본 정체성이 일치하지 않습니다.",
  runRequestPostFailed: "이미지 필터 Worker에 실행 요청을 전달하지 못했습니다.",
  sourcePostFailed: "이미지 필터 Worker에 원본을 전달하지 못했습니다.",
  staleSourceResponse: "이미지 필터 Worker가 오래되었거나 잘못된 원본 응답을 반환했습니다.",
  staleFailureResponse: "이미지 필터 Worker가 오래되었거나 잘못된 실패 응답을 반환했습니다.",
  staleFilterResult: "이미지 필터 Worker가 오래되었거나 잘못된 필터 결과를 반환했습니다.",
  protocolFormatInvalid: "{label} 형식이 올바르지 않습니다.",
  protocolPixelBufferType: "{label} 픽셀 버퍼는 Uint8ClampedArray여야 합니다.",
  protocolSizeNotPositiveInteger: "{label} 크기는 1 이상의 정수여야 합니다.",
  protocolSizeOverLimit: "{label} 크기가 안전 한도를 초과했습니다.",
  protocolBufferLengthMismatch: "{label} 픽셀 버퍼 길이가 가로·세로 크기와 일치하지 않습니다.",
};

/**
 * 표시 지점 전용 해석 (이미지 필터 Worker): 생산자가 방출한 구조화 코드를 현재
 * 로케일 문구로 바꾼다.
 */
export function resolveStudioImageFilterWorkerError(error: {
  readonly code: StudioImageFilterWorkerErrorCode;
  readonly params?: Readonly<Record<string, string>>;
}): string {
  return resolveProducerError(
    FILTER_WORKER_ERROR_KEYS[error.code],
    FILTER_WORKER_ERROR_KO[error.code],
    error.params,
  );
}

/**
 * 표시 지점 전용 해석 (이미지 필터 Worker, 원인 객체 진입점): Konva catch가 원인
 * 객체만으로 부른다. 생산자 클래스를 이름+code로 판정한다(워커 경유 원인은 클라이언트
 * 역직렬화가 같은 이름·code·params로 재구성하므로 동일하게 닿는다). 코드가 없는
 * 원인(필터 엔진 패스스루·브라우저 event.message 등)은 null — 호출자는 기존 메시지
 * 경로로 폴백한다.
 */
export function resolveStudioImageFilterWorkerErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as {
    name?: unknown;
    code?: unknown;
    params?: unknown;
  };
  if (name === "StudioImageFilterWorkerError" && isStudioImageFilterWorkerErrorCode(code)) {
    return resolveStudioImageFilterWorkerError({
      code,
      params: studioImageFilterWorkerErrorParams(params),
    });
  }
  if (name === "StudioImageFilterWorkerUnavailableError" && isStudioImageFilterWorkerErrorCode(code)) {
    return resolveStudioImageFilterWorkerError({
      code,
      params: studioImageFilterWorkerErrorParams(params),
    });
  }
  return null;
}
