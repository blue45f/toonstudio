/**
 * A4 D4 (R15): studio-production-bible 생산자 구조화 오류 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-comments-error.ts 선례). 생산자는 표시 문구 대신
 * {code, params}만 방출하고(message = 코드 문자열), 표시는 표시 지점에서
 * 리졸버(status-i18n/studio-producer-error-i18n-bible.ts)로만 해석한다.
 * 생산자 본체(studio-production-bible.ts)는 이 파일을 import하고 기존 소비자를
 * 위해 그대로 재수출한다.
 */

export type StudioProductionBibleErrorCode =
  | "tooManyEntries"
  | "invalidEntryId"
  | "duplicateId"
  | "invalidPatch"
  | "forbiddenField"
  | "normalizeFailed";

export class StudioProductionBibleError extends Error {
  readonly code: StudioProductionBibleErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioProductionBibleErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioProductionBibleError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}

export type StudioProductionBibleImportErrorCode =
  | "importTooLarge"
  | "importInvalidJson"
  | "importNotDocument";

/** 가져오기 Result 오류 — throw가 아닌 Result 채널이라 클래스 없이 코드 객체로 방출한다. */
export interface StudioProductionBibleImportError {
  readonly code: StudioProductionBibleImportErrorCode;
  readonly params?: Readonly<Record<string, string>>;
}
