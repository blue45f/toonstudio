/**
 * A4 D4 (R14): studio-writer-room 제안·결정 채널 구조화 오류 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-cbz-interchange-error.ts 선례). 생산자는 표시 문구
 * 대신 {code, params}만 방출하고(message = 코드 문자열), 표시는 표시 지점에서
 * 리졸버(status-i18n/studio-producer-error-i18n-comments.ts의 writerRoom 구간)로만
 * 해석한다. Admission·Capacity typed error(입장·용량 채널)는 이 클래스의 범위가
 * 아니다. 생산자 본체(studio-writer-room.ts)는 이 파일을 import하고 재수출한다.
 */
export type StudioWriterRoomErrorCode =
  | "invalidTimestamp"
  | "unknownStage"
  | "invalidSuggestionId"
  | "targetNotAllowed"
  | "targetMissing"
  | "valueMismatch"
  | "sameValue"
  | "invalidSourceRef"
  | "batchLimit"
  | "duplicateFieldInBatch"
  | "batchTargetInvalid"
  | "targetChanged"
  | "batchValueMismatch";

export class StudioWriterRoomError extends Error {
  readonly code: StudioWriterRoomErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioWriterRoomErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioWriterRoomError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
