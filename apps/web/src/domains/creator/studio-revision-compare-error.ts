/**
 * A4 D4 (R15): studio-revision-compare-worker-client 구조화 오류 정의 — 기준선
 * 포화로 전용 파일에 추출했다(studio-comments-error.ts 선례). 생산자는 표시 문구
 * 대신 {code, params}만 방출하고(message = 코드 문자열), 표시는 표시 지점에서
 * 리졸버(status-i18n/studio-producer-error-i18n-revision-compare.ts)로만
 * 해석한다. Worker 페이로드가 실어 보낸 동적 message 패스스루 1건은 이 클래스를
 * 쓰지 않는 잔존 채널이다(workerError).
 */

export type StudioRevisionCompareErrorCode =
  | "complexityExceeded"
  | "directLimitExceeded"
  | "workerContractInvalid"
  | "workerVersionInvalid"
  | "workerFailed"
  | "workerTimeout"
  | "workerRevisionMismatch"
  | "workerRequestFailed"
  | "workerUnavailable"
  | "workerCreateFailed"
  | "backendInvalid"
  | "aborted";

/** complexity 세부 사유 코드 — label은 내부 고정 문자열이라 labelCode화했다(설계 §2.19). */
export type StudioRevisionCompareComplexityLabelCode =
  | "inputFormat"
  | "revisionFormat"
  | "individualString"
  | "stringTotal"
  | "depth"
  | "nodes"
  | "uncloneable"
  | "elements"
  | "circular"
  | "arrayItems"
  | "arrayNonEnumerable"
  | "arrayCustomProperty"
  | "arrayPropertyFormat"
  | "symbolProperty"
  | "nonPlainObject"
  | "nonEnumerable"
  | "keysPerObject"
  | "objectKeys"
  | "accessorProperty"
  | "unverifiableStructure"
  | "projectionFormat";

export class StudioRevisionCompareError extends Error {
  readonly code: StudioRevisionCompareErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioRevisionCompareErrorCode,
    name = "StudioRevisionCompareError",
    params?: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = name;
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}

/** 입력 복잡도 한도 오류 — 이관 전과 같은 RangeError 정체성을 유지한다. */
export class StudioRevisionCompareComplexityError extends RangeError {
  readonly code = "complexityExceeded" as const;
  readonly labelCode: StudioRevisionCompareComplexityLabelCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    labelCode: StudioRevisionCompareComplexityLabelCode,
    params?: Readonly<Record<string, string>>,
  ) {
    super("complexityExceeded");
    this.name = "RangeError";
    this.labelCode = labelCode;
    if (params !== undefined) this.params = params;
  }
}
