/**
 * 생산자 구조화 에러 해석 모듈 — 자동저장 OPFS 구간: studio-autosave-opfs-session
 * 검증 오류 16코드 + durabilityFailed 1키 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.3).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고(message = 코드 문자열), 표시는 이 모듈의
 * 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은
 * 신규 번역이다.
 *
 * 검증 14종(+세션 종료·빈 쓰기 2종)은 표시 지점이 reliability signal detail
 * (집계 문자열)이라 **집계자 예외**다: reportStudioSaveAuthorityDegraded 경계
 * (studio-storage-recovery-runtime의 causeMessage)에서만 해석한다.
 * durabilityFailed는 사유 코드 보유 구조다 — params.reason은 진단용이고 표시
 * 문구는 정적이라 해석에 쓰지 않는다. documentBusy는 표시 경로에서 제외돼 있어
 * 이 모듈에 키가 없다(생산자 현행 유지).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

import type { StudioAutosaveOpfsErrorCode } from "../studio-autosave-opfs-error";

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
  "studio.producerError.autosave.invalidTimestamp": "OPFS 자동저장 시각이 올바르지 않습니다.",
  "studio.producerError.autosave.checkpointTooLarge": "OPFS 자동저장 checkpoint 크기가 허용 범위를 벗어났습니다.",
  "studio.producerError.autosave.checkpointNotJson": "OPFS 자동저장 checkpoint가 올바른 UTF-8 JSON이 아닙니다.",
  "studio.producerError.autosave.checkpointSchema": "OPFS 자동저장 checkpoint 스키마가 올바르지 않습니다.",
  "studio.producerError.autosave.checkpointIdentity": "OPFS 자동저장 checkpoint identity가 일치하지 않습니다.",
  "studio.producerError.autosave.deletedCheckpointPayload": "삭제된 OPFS 자동저장 checkpoint에 payload가 남아 있습니다.",
  "studio.producerError.autosave.payloadIntegrity": "OPFS 자동저장 payload 무결성 검증에 실패했습니다.",
  "studio.producerError.autosave.payloadNotDocument": "OPFS 자동저장 payload가 Studio 문서가 아닙니다.",
  "studio.producerError.autosave.entryTooLarge": "OPFS 자동저장 entry 크기가 허용 범위를 벗어났습니다.",
  "studio.producerError.autosave.entryChunkBoundary": "OPFS 자동저장 entry chunk 경계가 손상되었습니다.",
  "studio.producerError.autosave.entryPartial": "OPFS 자동저장 entry가 부분적으로만 복원되었습니다.",
  "studio.producerError.autosave.sessionIdentityEmpty": "OPFS 자동저장 세션 identity가 비어 있습니다.",
  "studio.producerError.autosave.sessionDisposed": "OPFS 자동저장 세션이 이미 종료되었습니다.",
  "studio.producerError.autosave.checkpointEmpty": "OPFS 자동저장 checkpoint에 복구할 Studio 내용이 없습니다.",
  "studio.producerError.autosave.revisionLimit": "OPFS 자동저장 revision 한도를 초과했습니다.",
  "studio.producerError.autosave.emptyWrite": "내용이 없는 Studio 자동저장은 OPFS에 기록하지 않습니다.",
  "studio.producerError.autosave.durabilityFailed": "OPFS와 SQLite 자동저장에 실패했습니다. 현재 작업은 메모리에 남아 있지만 내구 저장되지 않았습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.autosave.invalidTimestamp": "The OPFS autosave timestamp is invalid.",
  "studio.producerError.autosave.checkpointTooLarge": "The OPFS autosave checkpoint size is out of the allowed range.",
  "studio.producerError.autosave.checkpointNotJson": "The OPFS autosave checkpoint is not valid UTF-8 JSON.",
  "studio.producerError.autosave.checkpointSchema": "The OPFS autosave checkpoint schema is invalid.",
  "studio.producerError.autosave.checkpointIdentity": "The OPFS autosave checkpoint identity does not match.",
  "studio.producerError.autosave.deletedCheckpointPayload": "The deleted OPFS autosave checkpoint still has a payload.",
  "studio.producerError.autosave.payloadIntegrity": "The OPFS autosave payload integrity verification failed.",
  "studio.producerError.autosave.payloadNotDocument": "The OPFS autosave payload is not a Studio document.",
  "studio.producerError.autosave.entryTooLarge": "The OPFS autosave entry size is out of the allowed range.",
  "studio.producerError.autosave.entryChunkBoundary": "The OPFS autosave entry chunk boundary is corrupted.",
  "studio.producerError.autosave.entryPartial": "The OPFS autosave entry was only partially restored.",
  "studio.producerError.autosave.sessionIdentityEmpty": "The OPFS autosave session identity is empty.",
  "studio.producerError.autosave.sessionDisposed": "The OPFS autosave session has already ended.",
  "studio.producerError.autosave.checkpointEmpty": "The OPFS autosave checkpoint has no Studio content to recover.",
  "studio.producerError.autosave.revisionLimit": "The OPFS autosave revision limit was exceeded.",
  "studio.producerError.autosave.emptyWrite": "An empty Studio autosave is not written to OPFS.",
  "studio.producerError.autosave.durabilityFailed": "Autosave to both OPFS and SQLite failed. The current work remains in memory but is not durably stored.",
});

const AUTOSAVE_ERROR_KEYS: Readonly<Record<StudioAutosaveOpfsErrorCode, string>> = {
  invalidTimestamp: "studio.producerError.autosave.invalidTimestamp",
  checkpointTooLarge: "studio.producerError.autosave.checkpointTooLarge",
  checkpointNotJson: "studio.producerError.autosave.checkpointNotJson",
  checkpointSchema: "studio.producerError.autosave.checkpointSchema",
  checkpointIdentity: "studio.producerError.autosave.checkpointIdentity",
  deletedCheckpointPayload: "studio.producerError.autosave.deletedCheckpointPayload",
  payloadIntegrity: "studio.producerError.autosave.payloadIntegrity",
  payloadNotDocument: "studio.producerError.autosave.payloadNotDocument",
  entryTooLarge: "studio.producerError.autosave.entryTooLarge",
  entryChunkBoundary: "studio.producerError.autosave.entryChunkBoundary",
  entryPartial: "studio.producerError.autosave.entryPartial",
  sessionIdentityEmpty: "studio.producerError.autosave.sessionIdentityEmpty",
  sessionDisposed: "studio.producerError.autosave.sessionDisposed",
  checkpointEmpty: "studio.producerError.autosave.checkpointEmpty",
  revisionLimit: "studio.producerError.autosave.revisionLimit",
  emptyWrite: "studio.producerError.autosave.emptyWrite",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const AUTOSAVE_ERROR_KO: Readonly<Record<StudioAutosaveOpfsErrorCode, string>> = {
  invalidTimestamp: "OPFS 자동저장 시각이 올바르지 않습니다.",
  checkpointTooLarge: "OPFS 자동저장 checkpoint 크기가 허용 범위를 벗어났습니다.",
  checkpointNotJson: "OPFS 자동저장 checkpoint가 올바른 UTF-8 JSON이 아닙니다.",
  checkpointSchema: "OPFS 자동저장 checkpoint 스키마가 올바르지 않습니다.",
  checkpointIdentity: "OPFS 자동저장 checkpoint identity가 일치하지 않습니다.",
  deletedCheckpointPayload: "삭제된 OPFS 자동저장 checkpoint에 payload가 남아 있습니다.",
  payloadIntegrity: "OPFS 자동저장 payload 무결성 검증에 실패했습니다.",
  payloadNotDocument: "OPFS 자동저장 payload가 Studio 문서가 아닙니다.",
  entryTooLarge: "OPFS 자동저장 entry 크기가 허용 범위를 벗어났습니다.",
  entryChunkBoundary: "OPFS 자동저장 entry chunk 경계가 손상되었습니다.",
  entryPartial: "OPFS 자동저장 entry가 부분적으로만 복원되었습니다.",
  sessionIdentityEmpty: "OPFS 자동저장 세션 identity가 비어 있습니다.",
  sessionDisposed: "OPFS 자동저장 세션이 이미 종료되었습니다.",
  checkpointEmpty: "OPFS 자동저장 checkpoint에 복구할 Studio 내용이 없습니다.",
  revisionLimit: "OPFS 자동저장 revision 한도를 초과했습니다.",
  emptyWrite: "내용이 없는 Studio 자동저장은 OPFS에 기록하지 않습니다.",
};

const DURABILITY_KEY = "studio.producerError.autosave.durabilityFailed";
const DURABILITY_KO =
  "OPFS와 SQLite 자동저장에 실패했습니다. 현재 작업은 메모리에 남아 있지만 내구 저장되지 않았습니다.";

/** 표시 지점 전용 해석 (자동저장 검증 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioAutosaveError(
  error: {
    readonly code: StudioAutosaveOpfsErrorCode;
    readonly params?: Readonly<Record<string, string>>;
  },
): string {
  return resolveProducerError(
    AUTOSAVE_ERROR_KEYS[error.code],
    AUTOSAVE_ERROR_KO[error.code],
    error.params,
  );
}

/**
 * 집계자 예외 전용 해석 (자동저장, 원인 객체 진입점): reliability signal detail을
 * 합성하는 경계(studio-storage-recovery-runtime의 causeMessage)에서만 부른다.
 * 검증 오류(StudioAutosaveOpfsError)와 내구성 오류(StudioAutosaveDurabilityError)를
 * 이름+코드 덕 타이핑으로 판정한다. 해당하지 않으면 null — 호출자는 기존 메시지
 * 경로로 폴백한다.
 */
export function resolveStudioAutosaveErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as {
    name?: unknown;
    code?: unknown;
    params?: unknown;
  };
  if (name === "StudioAutosaveDurabilityError" && code === "durabilityFailed") {
    return resolveProducerError(DURABILITY_KEY, DURABILITY_KO);
  }
  if (name !== "StudioAutosaveOpfsError" || typeof code !== "string") return null;
  if (!Object.hasOwn(AUTOSAVE_ERROR_KEYS, code)) return null;
  return resolveStudioAutosaveError({
    code: code as StudioAutosaveOpfsErrorCode,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}
