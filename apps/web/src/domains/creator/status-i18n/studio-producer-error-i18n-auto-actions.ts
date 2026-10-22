/**
 * 생산자 구조화 에러 해석 모듈 — autoActions 구간: studio-auto-actions 검증
 * 오류 세부 21코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.2).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code(기존 거친 코드), detail, params}만 방출하고
 * (message = 세부 코드 문자열), 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * detail "zodIssue" 2곳은 설계상 잔존이라 리졸버가 null을 반환한다 —
 * 표시 지점은 그때 생산자가 패스스루한 zod 원문(message)을 그대로 쓴다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioAutoActionValidationError } from "../studio-auto-actions-error";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.autoActions.sizeLimitStructure": "Action Set 구조가 너무 큽니다.",
  "studio.producerError.autoActions.sizeLimitDepth": "Action Set 중첩 깊이가 너무 큽니다.",
  "studio.producerError.autoActions.sizeLimitStrings": "Action Set 문자열 데이터가 너무 큽니다.",
  "studio.producerError.autoActions.nonJsonValue": "Action Set에는 JSON으로 표현할 수 있는 값만 사용할 수 있습니다.",
  "studio.producerError.autoActions.circular": "순환 참조 Action Set은 지원하지 않습니다.",
  "studio.producerError.autoActions.unsafeObject": "Action Set 객체 형식이 안전하지 않습니다.",
  "studio.producerError.autoActions.symbolKey": "Symbol 키는 사용할 수 없습니다.",
  "studio.producerError.autoActions.unsafeKey": "안전하지 않은 키를 거부했습니다: {key}",
  "studio.producerError.autoActions.accessor": "접근자 속성은 사용할 수 없습니다.",
  "studio.producerError.autoActions.futureVersion": "이 앱보다 새로운 Action Set 버전({version})은 가져올 수 없습니다.",
  "studio.producerError.autoActions.emptyJson": "Action Set JSON이 비어 있습니다.",
  "studio.producerError.autoActions.sizeLimitJson": "Action Set JSON 파일이 너무 큽니다.",
  "studio.producerError.autoActions.invalidJson": "Action Set JSON을 해석할 수 없습니다.",
  "studio.producerError.autoActions.sizeLimitExport": "내보낼 Action Set JSON이 너무 큽니다.",
  "studio.producerError.autoActions.pageCount": "페이지는 1~{max}개여야 합니다.",
  "studio.producerError.autoActions.invalidPageObject": "페이지 객체 형식이 안전하지 않습니다.",
  "studio.producerError.autoActions.invalidPageId": "페이지 ID가 올바르지 않습니다.",
  "studio.producerError.autoActions.duplicatePageId": "페이지 ID가 중복되었습니다: {pageId}",
  "studio.producerError.autoActions.elementsPerPage": "페이지당 요소는 {max}개 이하여야 합니다.",
  "studio.producerError.autoActions.sizeLimitElementCount": "문서의 전체 요소 수가 Auto Actions 상한을 넘었습니다.",
  "studio.producerError.autoActions.workLimit": "예상 작업량 {work}이 안전 상한 {max}을 넘었습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.autoActions.sizeLimitStructure": "The Action Set structure is too large.",
  "studio.producerError.autoActions.sizeLimitDepth": "The Action Set nesting is too deep.",
  "studio.producerError.autoActions.sizeLimitStrings": "The Action Set string data is too large.",
  "studio.producerError.autoActions.nonJsonValue": "Action Sets can only contain values that can be expressed as JSON.",
  "studio.producerError.autoActions.circular": "Action Sets with circular references are not supported.",
  "studio.producerError.autoActions.unsafeObject": "The Action Set object format is not safe.",
  "studio.producerError.autoActions.symbolKey": "Symbol keys cannot be used.",
  "studio.producerError.autoActions.unsafeKey": "Rejected an unsafe key: {key}",
  "studio.producerError.autoActions.accessor": "Accessor properties cannot be used.",
  "studio.producerError.autoActions.futureVersion": "Action Sets from a newer version ({version}) than this app cannot be imported.",
  "studio.producerError.autoActions.emptyJson": "The Action Set JSON is empty.",
  "studio.producerError.autoActions.sizeLimitJson": "The Action Set JSON file is too large.",
  "studio.producerError.autoActions.invalidJson": "Could not parse the Action Set JSON.",
  "studio.producerError.autoActions.sizeLimitExport": "The Action Set JSON to export is too large.",
  "studio.producerError.autoActions.pageCount": "There must be between 1 and {max} pages.",
  "studio.producerError.autoActions.invalidPageObject": "The page object format is not safe.",
  "studio.producerError.autoActions.invalidPageId": "The page ID is invalid.",
  "studio.producerError.autoActions.duplicatePageId": "Duplicate page ID: {pageId}",
  "studio.producerError.autoActions.elementsPerPage": "Each page can have at most {max} elements.",
  "studio.producerError.autoActions.sizeLimitElementCount": "The document's total element count exceeds the Auto Actions limit.",
  "studio.producerError.autoActions.workLimit": "The estimated workload {work} exceeds the safety limit of {max}.",
});

const AUTO_ACTION_DETAIL_KEYS: Readonly<Record<string, string>> = {
  sizeLimitStructure: "studio.producerError.autoActions.sizeLimitStructure",
  sizeLimitDepth: "studio.producerError.autoActions.sizeLimitDepth",
  sizeLimitStrings: "studio.producerError.autoActions.sizeLimitStrings",
  nonJsonValue: "studio.producerError.autoActions.nonJsonValue",
  circular: "studio.producerError.autoActions.circular",
  unsafeObject: "studio.producerError.autoActions.unsafeObject",
  symbolKey: "studio.producerError.autoActions.symbolKey",
  unsafeKey: "studio.producerError.autoActions.unsafeKey",
  accessor: "studio.producerError.autoActions.accessor",
  futureVersion: "studio.producerError.autoActions.futureVersion",
  emptyJson: "studio.producerError.autoActions.emptyJson",
  sizeLimitJson: "studio.producerError.autoActions.sizeLimitJson",
  invalidJson: "studio.producerError.autoActions.invalidJson",
  sizeLimitExport: "studio.producerError.autoActions.sizeLimitExport",
  pageCount: "studio.producerError.autoActions.pageCount",
  invalidPageObject: "studio.producerError.autoActions.invalidPageObject",
  invalidPageId: "studio.producerError.autoActions.invalidPageId",
  duplicatePageId: "studio.producerError.autoActions.duplicatePageId",
  elementsPerPage: "studio.producerError.autoActions.elementsPerPage",
  sizeLimitElementCount: "studio.producerError.autoActions.sizeLimitElementCount",
  workLimit: "studio.producerError.autoActions.workLimit",
};

/** 세부 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const AUTO_ACTION_DETAIL_KO: Readonly<Record<string, string>> = {
  sizeLimitStructure: "Action Set 구조가 너무 큽니다.",
  sizeLimitDepth: "Action Set 중첩 깊이가 너무 큽니다.",
  sizeLimitStrings: "Action Set 문자열 데이터가 너무 큽니다.",
  nonJsonValue: "Action Set에는 JSON으로 표현할 수 있는 값만 사용할 수 있습니다.",
  circular: "순환 참조 Action Set은 지원하지 않습니다.",
  unsafeObject: "Action Set 객체 형식이 안전하지 않습니다.",
  symbolKey: "Symbol 키는 사용할 수 없습니다.",
  unsafeKey: "안전하지 않은 키를 거부했습니다: {key}",
  accessor: "접근자 속성은 사용할 수 없습니다.",
  futureVersion: "이 앱보다 새로운 Action Set 버전({version})은 가져올 수 없습니다.",
  emptyJson: "Action Set JSON이 비어 있습니다.",
  sizeLimitJson: "Action Set JSON 파일이 너무 큽니다.",
  invalidJson: "Action Set JSON을 해석할 수 없습니다.",
  sizeLimitExport: "내보낼 Action Set JSON이 너무 큽니다.",
  pageCount: "페이지는 1~{max}개여야 합니다.",
  invalidPageObject: "페이지 객체 형식이 안전하지 않습니다.",
  invalidPageId: "페이지 ID가 올바르지 않습니다.",
  duplicatePageId: "페이지 ID가 중복되었습니다: {pageId}",
  elementsPerPage: "페이지당 요소는 {max}개 이하여야 합니다.",
  sizeLimitElementCount: "문서의 전체 요소 수가 Auto Actions 상한을 넘었습니다.",
  workLimit: "예상 작업량 {work}이 안전 상한 {max}을 넘었습니다.",
};

/** 표시 지점 전용 해석 (auto-actions 검증 오류). */
export function resolveStudioAutoActionValidationError(
  error: StudioAutoActionValidationError,
): string | null {
  const key = AUTO_ACTION_DETAIL_KEYS[error.detail];
  if (!key) return null;
  return resolveProducerError(key, AUTO_ACTION_DETAIL_KO[error.detail]!, error.params);
}

/**
 * 표시 지점 전용 해석 (원인 객체 덕 타이핑): 컨트롤러는 auto-actions 모듈을
 * 지연 로드하므로 클래스 import 없이 name+detail만으로 판정한다.
 * zodIssue(잔존 패스스루)와 이 생산자가 아닌 원인은 null — 호출자는 기존
 * message 경로를 유지한다.
 */
export function resolveStudioAutoActionValidationErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, detail } = cause as { name?: unknown; detail?: unknown };
  if (name !== "StudioAutoActionValidationError" || typeof detail !== "string") return null;
  if (!Object.hasOwn(AUTO_ACTION_DETAIL_KEYS, detail)) return null;
  return resolveStudioAutoActionValidationError(cause as StudioAutoActionValidationError);
}
