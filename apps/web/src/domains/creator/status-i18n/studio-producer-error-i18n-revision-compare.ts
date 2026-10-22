/**
 * 생산자 구조화 에러 해석 모듈 — revisionCompare 구간:
 * studio-revision-compare-worker-client의 complexity 템플릿 1 + 세부 사유 라벨 21
 * + worker 계열 11코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.19).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * Worker 페이로드 동적 message 패스스루 1건(workerError)은 잔존 채널이라
 * 리졸버가 null을 돌려주고 호출자가 기존 message 경로를 유지한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioRevisionCompareComplexityLabelCode,
  StudioRevisionCompareErrorCode,
} from "../studio-revision-compare-error";

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
  "studio.producerError.revisionCompare.complexityExceeded": "버전 비교 입력이 안전 한도를 넘었습니다: {detail}",
  "studio.producerError.revisionCompare.label.inputFormat": "입력 객체 형식",
  "studio.producerError.revisionCompare.label.revisionFormat": "revision 형식",
  "studio.producerError.revisionCompare.label.individualString": "개별 문자열 최대 {max}자",
  "studio.producerError.revisionCompare.label.stringTotal": "문자열 총 길이 최대 {max}",
  "studio.producerError.revisionCompare.label.depth": "중첩 깊이 최대 {max}",
  "studio.producerError.revisionCompare.label.nodes": "노드 수 최대 {max}",
  "studio.producerError.revisionCompare.label.uncloneable": "복제할 수 없는 값",
  "studio.producerError.revisionCompare.label.elements": "페이지·마스터 요소 수 최대 {max}",
  "studio.producerError.revisionCompare.label.circular": "순환 참조는 허용되지 않음",
  "studio.producerError.revisionCompare.label.arrayItems": "배열 항목 수 최대 {max}",
  "studio.producerError.revisionCompare.label.arrayNonEnumerable": "배열 비열거 속성은 허용되지 않음",
  "studio.producerError.revisionCompare.label.arrayCustomProperty": "배열 사용자 정의 속성은 허용되지 않음",
  "studio.producerError.revisionCompare.label.arrayPropertyFormat": "배열 속성 형식",
  "studio.producerError.revisionCompare.label.symbolProperty": "Symbol 속성은 허용되지 않음",
  "studio.producerError.revisionCompare.label.nonPlainObject": "일반 객체가 아닌 값",
  "studio.producerError.revisionCompare.label.nonEnumerable": "비열거 속성은 허용되지 않음",
  "studio.producerError.revisionCompare.label.keysPerObject": "객체당 키 수 최대 {max}",
  "studio.producerError.revisionCompare.label.objectKeys": "객체 키 수 최대 {max}",
  "studio.producerError.revisionCompare.label.accessorProperty": "접근자 속성은 허용되지 않음",
  "studio.producerError.revisionCompare.label.unverifiableStructure": "검증할 수 없는 객체 구조",
  "studio.producerError.revisionCompare.label.projectionFormat": "안전 투영 결과 형식",
  "studio.producerError.revisionCompare.directLimitExceeded": "선택한 direct 버전 비교는 안전 상한({max}개 요소)을 적용합니다.",
  "studio.producerError.revisionCompare.workerContractInvalid": "버전 비교 Worker 응답 계약이 올바르지 않습니다.",
  "studio.producerError.revisionCompare.workerVersionInvalid": "버전 비교 Worker 응답 버전이 올바르지 않습니다.",
  "studio.producerError.revisionCompare.workerFailed": "버전 비교 Worker 실행에 실패했습니다.",
  "studio.producerError.revisionCompare.workerTimeout": "버전 비교 시간이 너무 오래 걸려 중단했습니다.",
  "studio.producerError.revisionCompare.workerRevisionMismatch": "버전 비교 Worker가 다른 revision 결과를 반환했습니다.",
  "studio.producerError.revisionCompare.workerRequestFailed": "버전 비교 Worker 요청을 시작하지 못했습니다.",
  "studio.producerError.revisionCompare.workerUnavailable": "버전 비교 Worker를 사용할 수 없습니다.",
  "studio.producerError.revisionCompare.workerCreateFailed": "버전 비교 Worker를 생성하지 못했습니다.",
  "studio.producerError.revisionCompare.backendInvalid": "버전 비교 실행 backend가 올바르지 않습니다.",
  "studio.producerError.revisionCompare.aborted": "버전 비교를 취소했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.revisionCompare.complexityExceeded": "The version comparison input exceeded the safety limit: {detail}",
  "studio.producerError.revisionCompare.label.inputFormat": "Input object format",
  "studio.producerError.revisionCompare.label.revisionFormat": "Revision format",
  "studio.producerError.revisionCompare.label.individualString": "Individual string max {max} characters",
  "studio.producerError.revisionCompare.label.stringTotal": "Total string length max {max}",
  "studio.producerError.revisionCompare.label.depth": "Nesting depth max {max}",
  "studio.producerError.revisionCompare.label.nodes": "Node count max {max}",
  "studio.producerError.revisionCompare.label.uncloneable": "Uncloneable value",
  "studio.producerError.revisionCompare.label.elements": "Page and master element count max {max}",
  "studio.producerError.revisionCompare.label.circular": "Circular references are not allowed",
  "studio.producerError.revisionCompare.label.arrayItems": "Array item count max {max}",
  "studio.producerError.revisionCompare.label.arrayNonEnumerable": "Non-enumerable array properties are not allowed",
  "studio.producerError.revisionCompare.label.arrayCustomProperty": "Custom array properties are not allowed",
  "studio.producerError.revisionCompare.label.arrayPropertyFormat": "Array property format",
  "studio.producerError.revisionCompare.label.symbolProperty": "Symbol properties are not allowed",
  "studio.producerError.revisionCompare.label.nonPlainObject": "Value is not a plain object",
  "studio.producerError.revisionCompare.label.nonEnumerable": "Non-enumerable properties are not allowed",
  "studio.producerError.revisionCompare.label.keysPerObject": "Keys per object max {max}",
  "studio.producerError.revisionCompare.label.objectKeys": "Object key count max {max}",
  "studio.producerError.revisionCompare.label.accessorProperty": "Accessor properties are not allowed",
  "studio.producerError.revisionCompare.label.unverifiableStructure": "Unverifiable object structure",
  "studio.producerError.revisionCompare.label.projectionFormat": "Safe projection result format",
  "studio.producerError.revisionCompare.directLimitExceeded": "The selected direct version comparison applies a safety cap of {max} elements.",
  "studio.producerError.revisionCompare.workerContractInvalid": "The version comparison Worker response contract is invalid.",
  "studio.producerError.revisionCompare.workerVersionInvalid": "The version comparison Worker response version is invalid.",
  "studio.producerError.revisionCompare.workerFailed": "The version comparison Worker failed to run.",
  "studio.producerError.revisionCompare.workerTimeout": "The version comparison took too long and was stopped.",
  "studio.producerError.revisionCompare.workerRevisionMismatch": "The version comparison Worker returned a result for a different revision.",
  "studio.producerError.revisionCompare.workerRequestFailed": "Could not start the version comparison Worker request.",
  "studio.producerError.revisionCompare.workerUnavailable": "The version comparison Worker is unavailable.",
  "studio.producerError.revisionCompare.workerCreateFailed": "Could not create the version comparison Worker.",
  "studio.producerError.revisionCompare.backendInvalid": "The version comparison execution backend is invalid.",
  "studio.producerError.revisionCompare.aborted": "The version comparison was cancelled.",
});

const COMPLEXITY_LABEL_KO: Readonly<Record<StudioRevisionCompareComplexityLabelCode, string>> = {
  inputFormat: "입력 객체 형식",
  revisionFormat: "revision 형식",
  individualString: "개별 문자열 최대 {max}자",
  stringTotal: "문자열 총 길이 최대 {max}",
  depth: "중첩 깊이 최대 {max}",
  nodes: "노드 수 최대 {max}",
  uncloneable: "복제할 수 없는 값",
  elements: "페이지·마스터 요소 수 최대 {max}",
  circular: "순환 참조는 허용되지 않음",
  arrayItems: "배열 항목 수 최대 {max}",
  arrayNonEnumerable: "배열 비열거 속성은 허용되지 않음",
  arrayCustomProperty: "배열 사용자 정의 속성은 허용되지 않음",
  arrayPropertyFormat: "배열 속성 형식",
  symbolProperty: "Symbol 속성은 허용되지 않음",
  nonPlainObject: "일반 객체가 아닌 값",
  nonEnumerable: "비열거 속성은 허용되지 않음",
  keysPerObject: "객체당 키 수 최대 {max}",
  objectKeys: "객체 키 수 최대 {max}",
  accessorProperty: "접근자 속성은 허용되지 않음",
  unverifiableStructure: "검증할 수 없는 객체 구조",
  projectionFormat: "안전 투영 결과 형식",
};

const REVISION_COMPARE_ERROR_KEYS: Readonly<Record<StudioRevisionCompareErrorCode, string>> = {
  complexityExceeded: "studio.producerError.revisionCompare.complexityExceeded",
  directLimitExceeded: "studio.producerError.revisionCompare.directLimitExceeded",
  workerContractInvalid: "studio.producerError.revisionCompare.workerContractInvalid",
  workerVersionInvalid: "studio.producerError.revisionCompare.workerVersionInvalid",
  workerFailed: "studio.producerError.revisionCompare.workerFailed",
  workerTimeout: "studio.producerError.revisionCompare.workerTimeout",
  workerRevisionMismatch: "studio.producerError.revisionCompare.workerRevisionMismatch",
  workerRequestFailed: "studio.producerError.revisionCompare.workerRequestFailed",
  workerUnavailable: "studio.producerError.revisionCompare.workerUnavailable",
  workerCreateFailed: "studio.producerError.revisionCompare.workerCreateFailed",
  backendInvalid: "studio.producerError.revisionCompare.backendInvalid",
  aborted: "studio.producerError.revisionCompare.aborted",
};

const REVISION_COMPARE_ERROR_KO: Readonly<Record<StudioRevisionCompareErrorCode, string>> = {
  complexityExceeded: "버전 비교 입력이 안전 한도를 넘었습니다: {detail}",
  directLimitExceeded: "선택한 direct 버전 비교는 안전 상한({max}개 요소)을 적용합니다.",
  workerContractInvalid: "버전 비교 Worker 응답 계약이 올바르지 않습니다.",
  workerVersionInvalid: "버전 비교 Worker 응답 버전이 올바르지 않습니다.",
  workerFailed: "버전 비교 Worker 실행에 실패했습니다.",
  workerTimeout: "버전 비교 시간이 너무 오래 걸려 중단했습니다.",
  workerRevisionMismatch: "버전 비교 Worker가 다른 revision 결과를 반환했습니다.",
  workerRequestFailed: "버전 비교 Worker 요청을 시작하지 못했습니다.",
  workerUnavailable: "버전 비교 Worker를 사용할 수 없습니다.",
  workerCreateFailed: "버전 비교 Worker를 생성하지 못했습니다.",
  backendInvalid: "버전 비교 실행 backend가 올바르지 않습니다.",
  aborted: "버전 비교를 취소했습니다.",
};

/** 표시 지점 전용 해석 (revisionCompare): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioRevisionCompareError(error: {
  readonly code: StudioRevisionCompareErrorCode;
  readonly params?: Readonly<Record<string, string>>;
  readonly labelCode?: StudioRevisionCompareComplexityLabelCode;
}): string {
  let params = error.params;
  if (error.code === "complexityExceeded" && error.labelCode) {
    const detail = resolveProducerError(
      `studio.producerError.revisionCompare.label.${error.labelCode}`,
      COMPLEXITY_LABEL_KO[error.labelCode],
      error.params,
    );
    params = { ...error.params, detail };
  }
  return resolveProducerError(
    REVISION_COMPARE_ERROR_KEYS[error.code],
    REVISION_COMPARE_ERROR_KO[error.code],
    params,
  );
}

const REVISION_COMPARE_ERROR_NAMES: ReadonlySet<string> = new Set([
  "StudioRevisionCompareError",
  "StudioRevisionCompareWorkerError",
  "TimeoutError",
  "RangeError",
  "AbortError",
]);

/**
 * 표시 지점 전용 해석 (revisionCompare, 원인 객체 덕 타이핑): CheckpointPanel
 * catch가 원인 객체만으로 부른다. Worker 페이로드 패스스루 오류(plain Error) 등
 * 이 생산자가 아닌 원인은 null — 호출자는 기존 message 경로를 유지한다.
 */
export function resolveStudioRevisionCompareErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params, labelCode } = cause as {
    name?: unknown;
    code?: unknown;
    params?: unknown;
    labelCode?: unknown;
  };
  if (typeof name !== "string" || !REVISION_COMPARE_ERROR_NAMES.has(name)) return null;
  if (typeof code !== "string" || !Object.hasOwn(REVISION_COMPARE_ERROR_KEYS, code)) return null;
  return resolveStudioRevisionCompareError({
    code: code as StudioRevisionCompareErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
    labelCode: labelCode as StudioRevisionCompareComplexityLabelCode | undefined,
  });
}
