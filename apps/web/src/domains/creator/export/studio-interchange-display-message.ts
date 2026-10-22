/**
 * A4 D4 (R12): 문서 교환(cbz/openraster) 표시 지점의 집계 해석 경계.
 * 생산자는 구조화 코드만 방출하므로, 내보내기 메뉴처럼 두 생산자의 오류를
 * 한 catch에서 받는 지점은 여기서 덕 타이핑 리졸버로 해석한다.
 * 타 생산자 오류는 기존 message 경로를 유지한다.
 */
import { frozenStatusText } from "../studio-frozen-status-i18n";
import {
  resolveStudioCbzErrorFromCause,
  resolveStudioCbzWarning,
} from "../status-i18n/studio-producer-error-i18n-interchange-cbz";
import {
  resolveStudioOpenRasterErrorFromCause,
  resolveStudioOpenRasterWarning,
} from "../status-i18n/studio-producer-error-i18n-interchange-ora";

export { resolveStudioCbzWarning, resolveStudioOpenRasterWarning };

export function resolveStudioInterchangeExportErrorMessage(error: unknown): string {
  return resolveStudioCbzErrorFromCause(error)
    ?? resolveStudioOpenRasterErrorFromCause(error)
    ?? (error instanceof Error
      ? error.message
      : frozenStatusText("studio.frozenStatus.export.archiveFailed", "문서 교환 파일을 만들지 못했습니다."));
}
