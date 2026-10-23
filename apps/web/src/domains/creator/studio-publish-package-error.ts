/**
 * A4 D4 (R15): studio-publish-package 생산자 구조화 오류 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-comments-error.ts 선례).
 * 생산자는 표시 문구 대신 {code, params}만 방출하고(message = 코드 문자열),
 * 표시는 표시 지점에서 리졸버(status-i18n/studio-producer-error-i18n-publish.ts)로만
 * 해석한다. 게시 이슈(StudioPublishPackageIssue)는 기존 issue 코드를 그대로 코드로
 * 쓰고, 이 클래스는 throw 채널 3종(jsonReadFailed·newerVersion·unsupportedThumbnail)
 * 전용이다. jsonReadFailed·newerVersion의 {label}은 호출부가 지정하는 동적
 * 문자열이라 원문 패스스루 params로 둔다(부분 잔존 — 문장 골격만 코드화).
 */
export type StudioPublishPackageErrorCode =
  | "jsonReadFailed"
  | "newerVersion"
  | "unsupportedThumbnail";

export class StudioPublishPackageError extends Error {
  readonly code: StudioPublishPackageErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioPublishPackageErrorCode,
    params?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "StudioPublishPackageError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
