/**
 * 생산자 구조화 에러 해석 모듈 (A4 D4 파일럿, 2026-10-23).
 *
 * D4 계약: 비UI 생산자는 표시 문구 대신 구조화 코드(키+파라미터)를 방출하고,
 * 표시는 표시 지점에서 이 모듈의 리졸버로 해석한다. 생산자 모듈
 * (studio-translation-memory.ts)은 i18n을 import하지 않으며 코드만 안다.
 * ko 값은 이관 전 생산자 원문 그대로(표시 문구 무변경), en은 신규 번역이다.
 * 파일럿 범위: importStudioTranslationMemory의 ImportFailure 5코드.
 * 나머지 생산자(같은 파일의 export·load·save 등)는 후속 라운드에서 같은
 * 패턴으로 이 모듈에 코드 구간을 추가해 소진한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioTranslationMemoryImportError } from "../studio-translation-memory";

registerI18nLocaleEntries("ko", {
  "studio.producerError.tm.importTooLarge": "가져오기 파일은 {size}MB 이하여야 합니다.",
  "studio.producerError.tm.importInvalidJson": "번역 메모리 JSON을 해석하지 못했습니다.",
  "studio.producerError.tm.importNotDocument": "번역 메모리 문서 형식이 아닙니다.",
  "studio.producerError.tm.importUnsupportedDocument": "지원하는 ToonStudio 번역 메모리 v1 문서가 아닙니다.",
  "studio.producerError.tm.importTooManyCandidates": "한 번에 최대 {count}개 후보만 가져올 수 있습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.tm.importTooLarge": "The import file must be {size}MB or smaller.",
  "studio.producerError.tm.importInvalidJson": "Could not parse the translation memory JSON.",
  "studio.producerError.tm.importNotDocument": "This is not a translation memory document.",
  "studio.producerError.tm.importUnsupportedDocument": "This is not a supported ToonStudio translation memory v1 document.",
  "studio.producerError.tm.importTooManyCandidates": "You can import at most {count} candidates at a time.",
});

const TM_IMPORT_ERROR_KEYS: Readonly<Record<StudioTranslationMemoryImportError["code"], string>> = {
  importTooLarge: "studio.producerError.tm.importTooLarge",
  importInvalidJson: "studio.producerError.tm.importInvalidJson",
  importNotDocument: "studio.producerError.tm.importNotDocument",
  importUnsupportedDocument: "studio.producerError.tm.importUnsupportedDocument",
  importTooManyCandidates: "studio.producerError.tm.importTooManyCandidates",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const TM_IMPORT_ERROR_KO: Readonly<Record<StudioTranslationMemoryImportError["code"], string>> = {
  importTooLarge: "가져오기 파일은 {size}MB 이하여야 합니다.",
  importInvalidJson: "번역 메모리 JSON을 해석하지 못했습니다.",
  importNotDocument: "번역 메모리 문서 형식이 아닙니다.",
  importUnsupportedDocument: "지원하는 ToonStudio 번역 메모리 v1 문서가 아닙니다.",
  importTooManyCandidates: "한 번에 최대 {count}개 후보만 가져올 수 있습니다.",
};

/**
 * 표시 지점 전용 해석: 생산자가 방출한 구조화 코드를 현재 로케일 문구로 바꾼다.
 * 생산자·집계자는 이 함수를 부르지 않고 코드를 그대로 전달하는 것이 원칙이며,
 * 예외는 결과 타입이 문자열로 고정된 집계 경계뿐이다(파일럿에서는
 * loadStudioTranslationMemory의 LoadResult.error 패스스루가 해당한다).
 */
export function resolveStudioTranslationMemoryImportError(
  error: StudioTranslationMemoryImportError,
): string {
  const key = TM_IMPORT_ERROR_KEYS[error.code];
  const fallback = TM_IMPORT_ERROR_KO[error.code];
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const params = error.params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
