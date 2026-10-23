/**
 * A4 D4 (R14): studio-comments 생산자 구조화 오류 정의 — 기준선 포화로 전용 파일에
 * 추출했다(studio-cbz-interchange-error.ts·music/studio-music-page-error.ts 선례).
 * 생산자는 표시 문구 대신 {code, params}만 방출하고(message = 코드 문자열),
 * 표시는 표시 지점에서 리졸버(status-i18n/studio-producer-error-i18n-comments.ts의
 * comments 구간)로만 해석한다. 생산자 본체(studio-comments.ts)는 이 파일을
 * import하고 기존 소비자를 위해 그대로 재수출한다.
 */
export type StudioCommentErrorCode =
  | "invalidTime"
  | "invalidDocument"
  | "invalidActor"
  | "invalidMentions"
  | "invalidReferenceList"
  | "tooManyReferences"
  | "invalidReference"
  | "duplicateReferenceId"
  | "emptyBody"
  | "invalidId"
  | "invalidAnchor"
  | "tooManyThreads"
  | "tooManyMessages"
  | "duplicateId"
  | "tooManyReplies"
  | "invalidPatch"
  | "forbiddenField";

/** 작성자 역할 라벨 코드 — 표시 라벨 자체(작성자·해결한 사람·담당자)는 리졸버의 라벨 표가 소유한다. */
export type StudioCommentActorLabelCode = "author" | "resolver" | "assignee";

export class StudioCommentError extends Error {
  readonly code: StudioCommentErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioCommentErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioCommentError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
