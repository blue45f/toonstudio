/**
 * 생산자 구조화 에러 해석 모듈 — production 구간: studio-production-workspace
 * -runtime의 한글 throw 10코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고(message = 코드 문자열),
 * 표시는 이 모듈의 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자
 * 단위 동일하고, en은 신규 번역이다. 같은 런타임의 영문 throw는 이번 라운드
 * 무접촉이라 리졸버가 null을 반환해 표시 지점이 기존 message 경로를 쓴다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioProductionWorkspaceError,
  StudioProductionWorkspaceErrorCode,
} from "../studio-production/studio-production-workspace-error";

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
  "studio.producerError.production.storedTooLarge": "저장된 제작 운영 데이터가 크기 제한을 초과했습니다.",
  "studio.producerError.production.storedUnreadable": "저장된 제작 운영 데이터를 읽을 수 없습니다.",
  "studio.producerError.production.unsupportedFormat": "지원하지 않는 제작 운영 데이터 형식입니다.",
  "studio.producerError.production.scopeMismatch": "제작 운영 데이터의 작품 범위가 일치하지 않습니다.",
  "studio.producerError.production.storedInvalid": "저장된 제작 운영 데이터가 올바르지 않습니다.",
  "studio.producerError.production.itemInvalid": "저장된 제작 운영 항목이 올바르지 않습니다.",
  "studio.producerError.production.referenceInvalid": "제작 운영 데이터 참조가 올바르지 않습니다.",
  "studio.producerError.production.handoffMismatch": "제작 작업의 검수본 또는 인계 범위가 일치하지 않습니다.",
  "studio.producerError.production.serializeFailed": "제작 운영 공간을 직렬화할 수 없습니다.",
  "studio.producerError.production.serializeTooLarge": "제작 운영 공간이 저장 크기 제한을 초과했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.production.storedTooLarge": "The stored production data exceeds the size limit.",
  "studio.producerError.production.storedUnreadable": "Could not read the stored production data.",
  "studio.producerError.production.unsupportedFormat": "This production data format is not supported.",
  "studio.producerError.production.scopeMismatch": "The production data's work scope does not match.",
  "studio.producerError.production.storedInvalid": "The stored production data is invalid.",
  "studio.producerError.production.itemInvalid": "A stored production item is invalid.",
  "studio.producerError.production.referenceInvalid": "A production data reference is invalid.",
  "studio.producerError.production.handoffMismatch": "The production task's review copy or handoff scope does not match.",
  "studio.producerError.production.serializeFailed": "Could not serialize the production workspace.",
  "studio.producerError.production.serializeTooLarge": "The production workspace exceeds the storage size limit.",
});

const PRODUCTION_KEYS: Readonly<Record<StudioProductionWorkspaceErrorCode, string>> = {
  storedTooLarge: "studio.producerError.production.storedTooLarge",
  storedUnreadable: "studio.producerError.production.storedUnreadable",
  unsupportedFormat: "studio.producerError.production.unsupportedFormat",
  scopeMismatch: "studio.producerError.production.scopeMismatch",
  storedInvalid: "studio.producerError.production.storedInvalid",
  itemInvalid: "studio.producerError.production.itemInvalid",
  referenceInvalid: "studio.producerError.production.referenceInvalid",
  handoffMismatch: "studio.producerError.production.handoffMismatch",
  serializeFailed: "studio.producerError.production.serializeFailed",
  serializeTooLarge: "studio.producerError.production.serializeTooLarge",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PRODUCTION_KO: Readonly<Record<StudioProductionWorkspaceErrorCode, string>> = {
  storedTooLarge: "저장된 제작 운영 데이터가 크기 제한을 초과했습니다.",
  storedUnreadable: "저장된 제작 운영 데이터를 읽을 수 없습니다.",
  unsupportedFormat: "지원하지 않는 제작 운영 데이터 형식입니다.",
  scopeMismatch: "제작 운영 데이터의 작품 범위가 일치하지 않습니다.",
  storedInvalid: "저장된 제작 운영 데이터가 올바르지 않습니다.",
  itemInvalid: "저장된 제작 운영 항목이 올바르지 않습니다.",
  referenceInvalid: "제작 운영 데이터 참조가 올바르지 않습니다.",
  handoffMismatch: "제작 작업의 검수본 또는 인계 범위가 일치하지 않습니다.",
  serializeFailed: "제작 운영 공간을 직렬화할 수 없습니다.",
  serializeTooLarge: "제작 운영 공간이 저장 크기 제한을 초과했습니다.",
};

/** 표시 지점 전용 해석 (production 워크스페이스 오류). */
export function resolveStudioProductionWorkspaceError(
  error: StudioProductionWorkspaceError,
): string {
  return resolveProducerError(PRODUCTION_KEYS[error.code], PRODUCTION_KO[error.code], error.params);
}

/**
 * 표시 지점 전용 해석 (원인 객체 덕 타이핑): 서버 클라이언트 경유로 클래스가
 * 바뀌지 않은 원인만 판정한다. 이 생산자가 아닌 원인(서버 계약 오류 등)은
 * null — 호출자는 기존 message 경로를 유지한다.
 */
export function resolveStudioProductionWorkspaceErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioProductionWorkspaceError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PRODUCTION_KEYS, code)) return null;
  return resolveStudioProductionWorkspaceError(cause as StudioProductionWorkspaceError);
}
