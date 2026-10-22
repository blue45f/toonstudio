/**
 * A4 D4 (R15): studio-production-workspace-runtime 생산자 구조화 오류 정의 —
 * 기준선 포화로 전용 파일에 뒀다(studio-comments-error.ts 선례). 생산자는
 * 표시 문구 대신 {code, params}만 방출하고(message = 코드 문자열), 표시는
 * 표시 지점에서 리졸버(status-i18n/studio-producer-error-i18n-production.ts)로만
 * 해석한다. 이 파일이 담당하는 것은 한글 throw 10코드뿐이다 — 같은 런타임의
 * 영문 throw(scope/timestamp/mutation 등)는 설계상 이번 라운드 무접촉이다.
 */
export type StudioProductionWorkspaceErrorCode =
  | "storedTooLarge"
  | "storedUnreadable"
  | "unsupportedFormat"
  | "scopeMismatch"
  | "storedInvalid"
  | "itemInvalid"
  | "referenceInvalid"
  | "handoffMismatch"
  | "serializeFailed"
  | "serializeTooLarge";

export class StudioProductionWorkspaceError extends Error {
  readonly code: StudioProductionWorkspaceErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioProductionWorkspaceErrorCode,
    params?: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = "StudioProductionWorkspaceError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
