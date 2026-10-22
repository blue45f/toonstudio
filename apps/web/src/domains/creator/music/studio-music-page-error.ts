/**
 * A4 D4 (R10): StudioMusicPage 콜백(저장·삭제·외부 가져오기)의 진행 중·
 * 보관함 가득 참 거부 전용 오류. 생산자는 표시 문구 대신 구조화 코드를
 * 방출하고, 표시는 표시 지점(MusicTrackCard·MusicExternalImportPanel의
 * catch)에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n.ts의 music 구간).
 */
export type StudioMusicPageErrorCode =
  | "saveWhilePending"
  | "deleteWhilePending"
  | "importWhilePending"
  | "libraryFull";

export class StudioMusicPageError extends Error {
  readonly code: StudioMusicPageErrorCode;

  constructor(code: StudioMusicPageErrorCode) {
    super(code);
    this.name = "StudioMusicPageError";
    this.code = code;
  }
}
