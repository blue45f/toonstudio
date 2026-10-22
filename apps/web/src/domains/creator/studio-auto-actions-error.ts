/**
 * A4 D4 (R15): studio-auto-actions 생산자 구조화 오류 정의 — 기준선 포화로 전용
 * 파일에 추출했다(studio-comments-error.ts 선례). 생산자는 표시 문구 대신
 * {code(기존 거친 코드), detail(문구 단위 세부 코드), params}만 방출하고
 * (message = 세부 코드 문자열), 표시는 표시 지점에서 리졸버
 * (status-i18n/studio-producer-error-i18n-auto-actions.ts)로만 해석한다.
 * 유일한 예외는 detail "zodIssue" 2곳이다: zod 스키마 문구 자체가 동적이라
 * params로 분해할 수 없어 message에 원문을 패스스루한다(설계 r10-d4-trace-3
 * §2.2 잔존 확정). 리졸버는 zodIssue에 null을 반환해 표시 지점이 그 원문을
 * 그대로 쓰게 한다.
 */
export type StudioAutoActionValidationErrorCode =
  | "invalid_json"
  | "invalid_structure"
  | "future_version"
  | "unsafe_key"
  | "size_limit"
  | "work_limit";

export type StudioAutoActionValidationDetail =
  | "sizeLimitStructure"
  | "sizeLimitDepth"
  | "sizeLimitStrings"
  | "nonJsonValue"
  | "circular"
  | "unsafeObject"
  | "symbolKey"
  | "unsafeKey"
  | "accessor"
  | "futureVersion"
  | "emptyJson"
  | "sizeLimitJson"
  | "invalidJson"
  | "sizeLimitExport"
  | "pageCount"
  | "invalidPageObject"
  | "invalidPageId"
  | "duplicatePageId"
  | "elementsPerPage"
  | "sizeLimitElementCount"
  | "workLimit"
  | "zodIssue";

export class StudioAutoActionValidationError extends Error {
  readonly code: StudioAutoActionValidationErrorCode;
  readonly detail: StudioAutoActionValidationDetail;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioAutoActionValidationErrorCode,
    detail: StudioAutoActionValidationDetail,
    params?: Readonly<Record<string, string>>,
    options?: { message?: string },
  ) {
    super(options?.message ?? detail);
    this.name = "StudioAutoActionValidationError";
    this.code = code;
    this.detail = detail;
    if (params !== undefined) this.params = params;
  }
}
