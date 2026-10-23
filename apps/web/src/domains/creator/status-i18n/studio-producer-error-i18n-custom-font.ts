/**
 * 생산자 구조화 에러 해석 모듈 — customFont 구간: 사용자 글꼴 SQLite/OPFS 저장소 검증·손상
 * 세부 사유 47종 (A4 D4 조건부 묶음, R20 설계 r16 §4.3 A안).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자(studio-custom-font-sqlite-opfs-repository)는 거친 code(유지)와 함께 detail·params만
 * 방출하고(message는 detail 문자열), 표시는 이 모듈의 리졸버로만 해석한다. 패널은 현행
 * 코드 단위 tText 문구를 유지하고 invalid/corrupt에 한해 이 해석을 뒤에 병기한다.
 * ko 값은 이관 전 생산자 원문 템플릿과 params 정규화 후 글자 단위 동일하고, en은 신규 번역이다.
 * 단 operationFailed의 {detail} 슬롯은 하위 SQLite/OPFS 원문 패스스루 자리다 — 생산자가
 * message에 원문을 그대로 싣는 잔존 지점이며, 패널은 이 detail을 병기하지 않는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioCustomFontRepositoryErrorDetail } from "../studio-custom-font-sqlite-opfs-repository";

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
  "studio.producerError.customFont.fileNameEmpty": "글꼴 원본 파일명이 비어 있습니다.",
  "studio.producerError.customFont.fileNameTooLong": "글꼴 원본 파일명은 {maxCodePoints}자 이하여야 합니다.",
  "studio.producerError.customFont.idNotCanonical": "사용자 글꼴 ID가 canonical 안전 형식이 아닙니다.",
  "studio.producerError.customFont.contentHashNotCanonical": "사용자 글꼴 contentHash가 canonical SHA-256이 아닙니다.",
  "studio.producerError.customFont.manifestEntryNotObject": "사용자 글꼴 manifest entry가 객체가 아닙니다.",
  "studio.producerError.customFont.manifestEntryFieldsInvalid": "사용자 글꼴 manifest entry에 누락되거나 알 수 없는 필드가 있습니다.",
  "studio.producerError.customFont.idNotString": "사용자 글꼴 ID가 문자열이 아닙니다.",
  "studio.producerError.customFont.familyNotString": "사용자 글꼴 family가 문자열이 아닙니다.",
  "studio.producerError.customFont.fileNameNotString": "사용자 글꼴 파일명이 문자열이 아닙니다.",
  "studio.producerError.customFont.formatUnsupported": "사용자 글꼴 포맷이 지원 목록에 없습니다.",
  "studio.producerError.customFont.familyNotCanonical": "사용자 글꼴 family가 canonical CSS 안전 형식이 아닙니다.",
  "studio.producerError.customFont.fileNameNotCanonical": "사용자 글꼴 파일명이 canonical 형식이 아닙니다.",
  "studio.producerError.customFont.mimeFormatMismatch": "사용자 글꼴 MIME과 포맷이 일치하지 않습니다.",
  "studio.producerError.customFont.byteLengthOutOfRange": "사용자 글꼴 바이트 크기가 허용 범위를 벗어났습니다.",
  "studio.producerError.customFont.createdAtInvalid": "사용자 글꼴 생성 시각이 올바르지 않습니다.",
  "studio.producerError.customFont.duplicateId": "중복 사용자 글꼴 ID입니다: {id}",
  "studio.producerError.customFont.duplicateFamily": "중복 사용자 글꼴 family입니다: {family}",
  "studio.producerError.customFont.libraryLogicalLimitExceeded": "사용자 글꼴 라이브러리가 2 GiB 논리 상한을 넘었습니다.",
  "studio.producerError.customFont.manifestTooLarge": "사용자 글꼴 SQLite manifest가 2 MiB 상한을 넘었습니다.",
  "studio.producerError.customFont.manifestNotObject": "사용자 글꼴 manifest가 객체가 아닙니다.",
  "studio.producerError.customFont.manifestVersionOrFieldsInvalid": "사용자 글꼴 manifest 버전 또는 필드가 올바르지 않습니다.",
  "studio.producerError.customFont.manifestNotCanonical": "사용자 글꼴 manifest가 canonical 원장과 일치하지 않습니다.",
  "studio.producerError.customFont.emptyFontFile": "빈 글꼴 파일은 저장할 수 없습니다.",
  "studio.producerError.customFont.fontFileTooLarge": "글꼴 파일이 128 MiB 상한을 넘었습니다.",
  "studio.producerError.customFont.fontBytesUnsupportedFormat": "TTF·OTF·TTC·WOFF·WOFF2 글꼴 바이트가 아닙니다.",
  "studio.producerError.customFont.libraryLogicalLimitExceededOnSave": "사용자 글꼴 라이브러리가 2 GiB 논리 상한을 넘습니다.",
  "studio.producerError.customFont.providedContentHashMismatch": "제공된 contentHash가 실제 글꼴 바이트 SHA-256과 일치하지 않습니다.",
  "studio.producerError.customFont.manifestSizeLimitExceeded": "사용자 글꼴 SQLite manifest가 크기 상한을 넘었습니다.",
  "studio.producerError.customFont.manifestJsonCorrupt": "사용자 글꼴 SQLite manifest JSON이 끊어졌거나 손상되었습니다.",
  "studio.producerError.customFont.manifestCorrupt": "사용자 글꼴 SQLite manifest가 손상되었습니다.",
  "studio.producerError.customFont.casMetadataMismatch": "사용자 글꼴 CAS metadata가 manifest와 일치하지 않습니다: {entryId}",
  "studio.producerError.customFont.casBlobMissingOrTruncated": "사용자 글꼴 CAS blob이 없거나 잘렸습니다: {entryId}",
  "studio.producerError.customFont.casFormatMismatch": "사용자 글꼴 CAS 바이트의 포맷이 manifest와 다릅니다: {entryId}",
  "studio.producerError.customFont.casOwnerHashMissing": "사용자 글꼴 CAS owner 원장에 hash가 없습니다: {hash}",
  "studio.producerError.customFont.casSaveReceiptMismatch": "사용자 글꼴 OPFS CAS 저장 영수증이 입력 hash/size/MIME과 다릅니다.",
  "studio.producerError.customFont.committedEntryMissing": "커밋된 사용자 글꼴 manifest에서 신규 항목을 찾지 못했습니다.",
  "studio.producerError.customFont.invalidCursorFormat": "사용자 글꼴 page cursor 형식이 올바르지 않습니다.",
  "studio.producerError.customFont.invalidCursorStale": "사용자 글꼴 page cursor가 오래됐거나 위조되었습니다.",
  "studio.producerError.customFont.aborted": "사용자 글꼴 page 읽기가 취소되었습니다.",
  "studio.producerError.customFont.invalidPageSize": "사용자 글꼴 pageSize는 1~{maxPageSize}여야 합니다.",
  "studio.producerError.customFont.invalidPageHydrationBudget": "사용자 글꼴 page hydration 예산은 1~{maxHydratedBytes}바이트여야 합니다.",
  "studio.producerError.customFont.backpressure": "다음 사용자 글꼴 {byteLength}바이트가 page hydration 예산 {maxBytes}바이트를 넘습니다.",
  "studio.producerError.customFont.unavailable": "Web Locks가 없어 여러 탭의 사용자 글꼴 쓰기를 안전하게 직렬화할 수 없습니다.",
  "studio.producerError.customFont.invalidMaterializationBudget": "사용자 글꼴 compatibility materialization 영수증 예산이 허용 범위를 벗어났습니다.",
  "studio.producerError.customFont.integrityFailed": "사용자 글꼴 {operation} 중 OPFS 무결성 검증에 실패했습니다.",
  "studio.producerError.customFont.quotaExceeded": "사용자 글꼴 {operation} 중 기기 저장 공간이 부족합니다.",
  "studio.producerError.customFont.operationFailed": "사용자 글꼴 SQLite/OPFS {operation}를 완료하지 못했습니다: {detail}",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.customFont.fileNameEmpty": "The original font file name is empty.",
  "studio.producerError.customFont.fileNameTooLong": "The original font file name must be at most {maxCodePoints} characters.",
  "studio.producerError.customFont.idNotCanonical": "The custom font ID is not in the canonical safe format.",
  "studio.producerError.customFont.contentHashNotCanonical": "The custom font contentHash is not a canonical SHA-256.",
  "studio.producerError.customFont.manifestEntryNotObject": "A custom font manifest entry is not an object.",
  "studio.producerError.customFont.manifestEntryFieldsInvalid": "A custom font manifest entry has missing or unknown fields.",
  "studio.producerError.customFont.idNotString": "The custom font ID is not a string.",
  "studio.producerError.customFont.familyNotString": "The custom font family is not a string.",
  "studio.producerError.customFont.fileNameNotString": "The custom font file name is not a string.",
  "studio.producerError.customFont.formatUnsupported": "The custom font format is not in the supported list.",
  "studio.producerError.customFont.familyNotCanonical": "The custom font family is not in the canonical CSS-safe format.",
  "studio.producerError.customFont.fileNameNotCanonical": "The custom font file name is not in the canonical format.",
  "studio.producerError.customFont.mimeFormatMismatch": "The custom font MIME does not match its format.",
  "studio.producerError.customFont.byteLengthOutOfRange": "The custom font byte size is outside the allowed range.",
  "studio.producerError.customFont.createdAtInvalid": "The custom font creation time is invalid.",
  "studio.producerError.customFont.duplicateId": "Duplicate custom font ID: {id}",
  "studio.producerError.customFont.duplicateFamily": "Duplicate custom font family: {family}",
  "studio.producerError.customFont.libraryLogicalLimitExceeded": "The custom font library has exceeded the 2 GiB logical limit.",
  "studio.producerError.customFont.manifestTooLarge": "The custom font SQLite manifest has exceeded the 2 MiB limit.",
  "studio.producerError.customFont.manifestNotObject": "The custom font manifest is not an object.",
  "studio.producerError.customFont.manifestVersionOrFieldsInvalid": "The custom font manifest version or fields are invalid.",
  "studio.producerError.customFont.manifestNotCanonical": "The custom font manifest does not match the canonical ledger.",
  "studio.producerError.customFont.emptyFontFile": "An empty font file cannot be saved.",
  "studio.producerError.customFont.fontFileTooLarge": "The font file exceeds the 128 MiB limit.",
  "studio.producerError.customFont.fontBytesUnsupportedFormat": "The bytes are not a TTF, OTF, TTC, WOFF, or WOFF2 font.",
  "studio.producerError.customFont.libraryLogicalLimitExceededOnSave": "The custom font library exceeds the 2 GiB logical limit.",
  "studio.producerError.customFont.providedContentHashMismatch": "The provided contentHash does not match the actual font bytes SHA-256.",
  "studio.producerError.customFont.manifestSizeLimitExceeded": "The custom font SQLite manifest exceeds the size limit.",
  "studio.producerError.customFont.manifestJsonCorrupt": "The custom font SQLite manifest JSON is truncated or corrupt.",
  "studio.producerError.customFont.manifestCorrupt": "The custom font SQLite manifest is corrupt.",
  "studio.producerError.customFont.casMetadataMismatch": "The custom font CAS metadata does not match the manifest: {entryId}",
  "studio.producerError.customFont.casBlobMissingOrTruncated": "The custom font CAS blob is missing or truncated: {entryId}",
  "studio.producerError.customFont.casFormatMismatch": "The format of the custom font CAS bytes differs from the manifest: {entryId}",
  "studio.producerError.customFont.casOwnerHashMissing": "The custom font CAS owner ledger has no hash: {hash}",
  "studio.producerError.customFont.casSaveReceiptMismatch": "The custom font OPFS CAS save receipt differs from the input hash/size/MIME.",
  "studio.producerError.customFont.committedEntryMissing": "The new entry was not found in the committed custom font manifest.",
  "studio.producerError.customFont.invalidCursorFormat": "The custom font page cursor format is invalid.",
  "studio.producerError.customFont.invalidCursorStale": "The custom font page cursor is stale or forged.",
  "studio.producerError.customFont.aborted": "The custom font page read was cancelled.",
  "studio.producerError.customFont.invalidPageSize": "The custom font pageSize must be between 1 and {maxPageSize}.",
  "studio.producerError.customFont.invalidPageHydrationBudget": "The custom font page hydration budget must be between 1 and {maxHydratedBytes} bytes.",
  "studio.producerError.customFont.backpressure": "The next custom font is {byteLength} bytes and exceeds the page hydration budget of {maxBytes} bytes.",
  "studio.producerError.customFont.unavailable": "Without Web Locks, custom font writes from multiple tabs cannot be serialized safely.",
  "studio.producerError.customFont.invalidMaterializationBudget": "The custom font compatibility materialization receipt budget is outside the allowed range.",
  "studio.producerError.customFont.integrityFailed": "OPFS integrity verification failed during custom font {operation}.",
  "studio.producerError.customFont.quotaExceeded": "The device is out of storage space during custom font {operation}.",
  "studio.producerError.customFont.operationFailed": "Could not complete the custom font SQLite/OPFS {operation}: {detail}",
});

const CUSTOM_FONT_ERROR_KEYS: Readonly<Record<StudioCustomFontRepositoryErrorDetail, string>> = {
  fileNameEmpty: "studio.producerError.customFont.fileNameEmpty",
  fileNameTooLong: "studio.producerError.customFont.fileNameTooLong",
  idNotCanonical: "studio.producerError.customFont.idNotCanonical",
  contentHashNotCanonical: "studio.producerError.customFont.contentHashNotCanonical",
  manifestEntryNotObject: "studio.producerError.customFont.manifestEntryNotObject",
  manifestEntryFieldsInvalid: "studio.producerError.customFont.manifestEntryFieldsInvalid",
  idNotString: "studio.producerError.customFont.idNotString",
  familyNotString: "studio.producerError.customFont.familyNotString",
  fileNameNotString: "studio.producerError.customFont.fileNameNotString",
  formatUnsupported: "studio.producerError.customFont.formatUnsupported",
  familyNotCanonical: "studio.producerError.customFont.familyNotCanonical",
  fileNameNotCanonical: "studio.producerError.customFont.fileNameNotCanonical",
  mimeFormatMismatch: "studio.producerError.customFont.mimeFormatMismatch",
  byteLengthOutOfRange: "studio.producerError.customFont.byteLengthOutOfRange",
  createdAtInvalid: "studio.producerError.customFont.createdAtInvalid",
  duplicateId: "studio.producerError.customFont.duplicateId",
  duplicateFamily: "studio.producerError.customFont.duplicateFamily",
  libraryLogicalLimitExceeded: "studio.producerError.customFont.libraryLogicalLimitExceeded",
  manifestTooLarge: "studio.producerError.customFont.manifestTooLarge",
  manifestNotObject: "studio.producerError.customFont.manifestNotObject",
  manifestVersionOrFieldsInvalid: "studio.producerError.customFont.manifestVersionOrFieldsInvalid",
  manifestNotCanonical: "studio.producerError.customFont.manifestNotCanonical",
  emptyFontFile: "studio.producerError.customFont.emptyFontFile",
  fontFileTooLarge: "studio.producerError.customFont.fontFileTooLarge",
  fontBytesUnsupportedFormat: "studio.producerError.customFont.fontBytesUnsupportedFormat",
  libraryLogicalLimitExceededOnSave: "studio.producerError.customFont.libraryLogicalLimitExceededOnSave",
  providedContentHashMismatch: "studio.producerError.customFont.providedContentHashMismatch",
  manifestSizeLimitExceeded: "studio.producerError.customFont.manifestSizeLimitExceeded",
  manifestJsonCorrupt: "studio.producerError.customFont.manifestJsonCorrupt",
  manifestCorrupt: "studio.producerError.customFont.manifestCorrupt",
  casMetadataMismatch: "studio.producerError.customFont.casMetadataMismatch",
  casBlobMissingOrTruncated: "studio.producerError.customFont.casBlobMissingOrTruncated",
  casFormatMismatch: "studio.producerError.customFont.casFormatMismatch",
  casOwnerHashMissing: "studio.producerError.customFont.casOwnerHashMissing",
  casSaveReceiptMismatch: "studio.producerError.customFont.casSaveReceiptMismatch",
  committedEntryMissing: "studio.producerError.customFont.committedEntryMissing",
  invalidCursorFormat: "studio.producerError.customFont.invalidCursorFormat",
  invalidCursorStale: "studio.producerError.customFont.invalidCursorStale",
  aborted: "studio.producerError.customFont.aborted",
  invalidPageSize: "studio.producerError.customFont.invalidPageSize",
  invalidPageHydrationBudget: "studio.producerError.customFont.invalidPageHydrationBudget",
  backpressure: "studio.producerError.customFont.backpressure",
  unavailable: "studio.producerError.customFont.unavailable",
  invalidMaterializationBudget: "studio.producerError.customFont.invalidMaterializationBudget",
  integrityFailed: "studio.producerError.customFont.integrityFailed",
  quotaExceeded: "studio.producerError.customFont.quotaExceeded",
  operationFailed: "studio.producerError.customFont.operationFailed",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const CUSTOM_FONT_ERROR_KO: Readonly<Record<StudioCustomFontRepositoryErrorDetail, string>> = {
  fileNameEmpty: "글꼴 원본 파일명이 비어 있습니다.",
  fileNameTooLong: "글꼴 원본 파일명은 {maxCodePoints}자 이하여야 합니다.",
  idNotCanonical: "사용자 글꼴 ID가 canonical 안전 형식이 아닙니다.",
  contentHashNotCanonical: "사용자 글꼴 contentHash가 canonical SHA-256이 아닙니다.",
  manifestEntryNotObject: "사용자 글꼴 manifest entry가 객체가 아닙니다.",
  manifestEntryFieldsInvalid: "사용자 글꼴 manifest entry에 누락되거나 알 수 없는 필드가 있습니다.",
  idNotString: "사용자 글꼴 ID가 문자열이 아닙니다.",
  familyNotString: "사용자 글꼴 family가 문자열이 아닙니다.",
  fileNameNotString: "사용자 글꼴 파일명이 문자열이 아닙니다.",
  formatUnsupported: "사용자 글꼴 포맷이 지원 목록에 없습니다.",
  familyNotCanonical: "사용자 글꼴 family가 canonical CSS 안전 형식이 아닙니다.",
  fileNameNotCanonical: "사용자 글꼴 파일명이 canonical 형식이 아닙니다.",
  mimeFormatMismatch: "사용자 글꼴 MIME과 포맷이 일치하지 않습니다.",
  byteLengthOutOfRange: "사용자 글꼴 바이트 크기가 허용 범위를 벗어났습니다.",
  createdAtInvalid: "사용자 글꼴 생성 시각이 올바르지 않습니다.",
  duplicateId: "중복 사용자 글꼴 ID입니다: {id}",
  duplicateFamily: "중복 사용자 글꼴 family입니다: {family}",
  libraryLogicalLimitExceeded: "사용자 글꼴 라이브러리가 2 GiB 논리 상한을 넘었습니다.",
  manifestTooLarge: "사용자 글꼴 SQLite manifest가 2 MiB 상한을 넘었습니다.",
  manifestNotObject: "사용자 글꼴 manifest가 객체가 아닙니다.",
  manifestVersionOrFieldsInvalid: "사용자 글꼴 manifest 버전 또는 필드가 올바르지 않습니다.",
  manifestNotCanonical: "사용자 글꼴 manifest가 canonical 원장과 일치하지 않습니다.",
  emptyFontFile: "빈 글꼴 파일은 저장할 수 없습니다.",
  fontFileTooLarge: "글꼴 파일이 128 MiB 상한을 넘었습니다.",
  fontBytesUnsupportedFormat: "TTF·OTF·TTC·WOFF·WOFF2 글꼴 바이트가 아닙니다.",
  libraryLogicalLimitExceededOnSave: "사용자 글꼴 라이브러리가 2 GiB 논리 상한을 넘습니다.",
  providedContentHashMismatch: "제공된 contentHash가 실제 글꼴 바이트 SHA-256과 일치하지 않습니다.",
  manifestSizeLimitExceeded: "사용자 글꼴 SQLite manifest가 크기 상한을 넘었습니다.",
  manifestJsonCorrupt: "사용자 글꼴 SQLite manifest JSON이 끊어졌거나 손상되었습니다.",
  manifestCorrupt: "사용자 글꼴 SQLite manifest가 손상되었습니다.",
  casMetadataMismatch: "사용자 글꼴 CAS metadata가 manifest와 일치하지 않습니다: {entryId}",
  casBlobMissingOrTruncated: "사용자 글꼴 CAS blob이 없거나 잘렸습니다: {entryId}",
  casFormatMismatch: "사용자 글꼴 CAS 바이트의 포맷이 manifest와 다릅니다: {entryId}",
  casOwnerHashMissing: "사용자 글꼴 CAS owner 원장에 hash가 없습니다: {hash}",
  casSaveReceiptMismatch: "사용자 글꼴 OPFS CAS 저장 영수증이 입력 hash/size/MIME과 다릅니다.",
  committedEntryMissing: "커밋된 사용자 글꼴 manifest에서 신규 항목을 찾지 못했습니다.",
  invalidCursorFormat: "사용자 글꼴 page cursor 형식이 올바르지 않습니다.",
  invalidCursorStale: "사용자 글꼴 page cursor가 오래됐거나 위조되었습니다.",
  aborted: "사용자 글꼴 page 읽기가 취소되었습니다.",
  invalidPageSize: "사용자 글꼴 pageSize는 1~{maxPageSize}여야 합니다.",
  invalidPageHydrationBudget: "사용자 글꼴 page hydration 예산은 1~{maxHydratedBytes}바이트여야 합니다.",
  backpressure: "다음 사용자 글꼴 {byteLength}바이트가 page hydration 예산 {maxBytes}바이트를 넘습니다.",
  unavailable: "Web Locks가 없어 여러 탭의 사용자 글꼴 쓰기를 안전하게 직렬화할 수 없습니다.",
  invalidMaterializationBudget: "사용자 글꼴 compatibility materialization 영수증 예산이 허용 범위를 벗어났습니다.",
  integrityFailed: "사용자 글꼴 {operation} 중 OPFS 무결성 검증에 실패했습니다.",
  quotaExceeded: "사용자 글꼴 {operation} 중 기기 저장 공간이 부족합니다.",
  operationFailed: "사용자 글꼴 SQLite/OPFS {operation}를 완료하지 못했습니다: {detail}",
};

function isCustomFontErrorDetail(value: unknown): value is StudioCustomFontRepositoryErrorDetail {
  return typeof value === "string" && Object.hasOwn(CUSTOM_FONT_ERROR_KEYS, value);
}

function stringParams(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * 표시 지점 전용 해석 (customFont 세부 사유): 생산자가 방출한 detail+params를
 * 현재 로케일 문구로 바꾼다.
 */
export function resolveStudioCustomFontError(error: {
  readonly detail: StudioCustomFontRepositoryErrorDetail;
  readonly params?: Readonly<Record<string, string>>;
}): string {
  return resolveProducerError(
    CUSTOM_FONT_ERROR_KEYS[error.detail],
    CUSTOM_FONT_ERROR_KO[error.detail],
    error.params,
  );
}

/**
 * 표시 지점 전용 해석 (customFont, 원인 객체 진입점): 패널 catch가 원인 객체만으로 부른다.
 * 생산자 클래스를 런타임 import하면 studio 진입 그래프에 저장소 생산자가 끌려오므로
 * 클래스 이름+detail 덕 타이핑으로 판정한다. 해당하지 않으면 null — 호출자는 병기 없이
 * 기존 코드 단위 문구만 쓴다.
 */
export function resolveStudioCustomFontErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, detail, params } = cause as { name?: unknown; detail?: unknown; params?: unknown };
  if (name !== "StudioCustomFontRepositoryError" || !isCustomFontErrorDetail(detail)) return null;
  return resolveStudioCustomFontError({ detail, params: stringParams(params) });
}
