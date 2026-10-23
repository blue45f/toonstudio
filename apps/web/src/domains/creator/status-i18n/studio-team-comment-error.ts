/**
 * A4 D4 (R14): studio-team-comment-client 생산자 구조화 오류 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-cbz-interchange-error.ts 선례). 생산자는 표시 문구
 * 대신 {code, params}만 방출하고(message = 코드 문자열), 표시는 표시 지점에서
 * 리졸버(status-i18n/studio-producer-error-i18n-comments.ts의 teamComment 구간)로만
 * 해석한다. 클라이언트 본체는 이 파일을 import하고 기존 소비자를 위해 재수출한다.
 *
 * 코드 구간: 입력 검증(parseInput 지정 7 + 직접 방출 2)과 응답 계약
 * (parseResponse 계약 지정 8 + 직접 방출 10)으로 나뉜다. 전부 고정 문구라
 * 동적 params는 없다.
 */
export type StudioTeamCommentErrorCode =
  | "invalidWorkId"
  | "invalidThreadId"
  | "invalidListOptions"
  | "invalidThreadOptions"
  | "invalidCreateInput"
  | "invalidReplyInput"
  | "invalidReanchorInput"
  | "mutationIdUnavailable"
  | "invalidLocalDocument"
  | "contractListResponse"
  | "contractThreadResponse"
  | "contractCreateResponse"
  | "contractReplyResponse"
  | "contractReanchorResponse"
  | "contractTransitionResponse"
  | "contractReadResponse"
  | "contractReadAllResponse"
  | "contractScopeMismatch"
  | "contractPageRangeExceeded"
  | "contractMessageRangeExceeded"
  | "contractCapabilitiesChanged"
  | "contractIncompleteHistory"
  | "contractDuplicateThread"
  | "contractSnapshotThreadLimit"
  | "contractSnapshotMessageLimit"
  | "contractCursorCycle"
  | "contractSnapshotIncomplete";

export class StudioTeamCommentResponseContractError extends Error {
  readonly code: StudioTeamCommentErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioTeamCommentErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioTeamCommentResponseContractError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}

export class StudioTeamCommentInputError extends Error {
  readonly code: StudioTeamCommentErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioTeamCommentErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioTeamCommentInputError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
