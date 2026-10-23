/**
 * A4 D4 (R15): studio-promise-payoff-ledger 생산자 구조화 오류 정의 — 기준선
 * 포화로 전용 파일에 뒀다(studio-comments-error.ts 선례). 생산자는 표시 문구
 * 대신 {code, params}만 방출하고(message = 코드 문자열), 표시는 표시 지점에서
 * 리졸버(status-i18n/studio-producer-error-i18n-promise.ts)로만 해석한다.
 * 진단 경고·리캡 후보는 이미 code를 보유한 별도 채널이라 이 클래스를 쓰지
 * 않고 각 결과 타입의 params로 코드를 통과시킨다(생산자 본체 참조).
 */
export type StudioPromisePayoffErrorCode =
  | "idCreationFailed"
  | "linkIdCreationFailed"
  | "invalidEpisode"
  | "tooManyEntries"
  | "duplicateId"
  | "normalizeFailed"
  | "invalidPatch"
  | "forbiddenField";

export class StudioPromisePayoffError extends Error {
  readonly code: StudioPromisePayoffErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioPromisePayoffErrorCode,
    params?: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = "StudioPromisePayoffError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
