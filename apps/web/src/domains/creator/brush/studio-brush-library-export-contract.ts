// Brush JSON 내보내기 계약(종류·버전)과 라이브러리 오류 — studio-brush-library.ts에서
// 추출했다(동작 무변경, 소스 크기 래칫 대응). 공개 API는 원 모듈이 그대로 재수출한다.
export const BRUSH_EXPORT_KIND = "toonstudio-studio-brush";
export const BRUSH_EXPORT_VERSION = 6;

/**
 * A4 D4 (R14): writeBrushJson·importBrushFromJson 실패 전용 오류.
 * 생산자는 표시 문구 대신 구조화 코드만 방출하고(message = 코드 문자열),
 * 표시는 표시 지점(StudioBrushLibraryPanel의 catch 3곳)에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-brush.ts의 brushLibrary 구간).
 * archiveTooLarge는 내보내기(write)·가져오기(import) 양쪽에서 같은 코드로
 * 방출되지만 이관 전 원문이 서로 달라 variant로 구분한다 — palette 경고의
 * 방출 지점 suffix 전례와 같은 방식으로, 리졸버가 variant별로 해석한다.
 */
export type StudioBrushLibraryErrorCode =
  | "settingsTooLarge"
  | "archiveTooLarge"
  | "emptyFile"
  | "archiveBytesTooLarge"
  | "readFailed"
  | "unsupportedOrCorrupt"
  | "settingsNotRestorable"
  | "plainSettingsTooLarge"
  | "notJsonFile"
  | "engineNotRestorable";

export type StudioBrushLibraryErrorVariant = "write" | "import";

export class StudioBrushLibraryError extends Error {
  readonly code: StudioBrushLibraryErrorCode;
  readonly variant?: StudioBrushLibraryErrorVariant;

  constructor(code: StudioBrushLibraryErrorCode, variant?: StudioBrushLibraryErrorVariant) {
    super(code);
    this.name = "StudioBrushLibraryError";
    this.code = code;
    if (variant !== undefined) this.variant = variant;
  }
}

