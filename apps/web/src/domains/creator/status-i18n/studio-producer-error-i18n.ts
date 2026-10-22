/**
 * 생산자 구조화 에러 해석 모듈 (A4 D4 파일럿 2026-10-23, R9 확장 2026-10-23).
 *
 * D4 계약: 비UI 생산자는 표시 문구 대신 구조화 코드(키+파라미터)를 방출하고,
 * 표시는 표시 지점에서 이 모듈의 리졸버로 해석한다. 생산자 모듈은 i18n 사전
 * 내용을 모르고 코드만 안다(집계 경계 해석용 import는 아래 예외 참조).
 * ko 값은 이관 전 생산자 원문 그대로(표시 문구 무변경), en은 신규 번역이다.
 *
 * 코드 구간:
 * - tm 가져오기 (파일럿): importStudioTranslationMemory의 ImportFailure 5코드.
 * - tm 내보내기 (R9): exportStudioTranslationMemory의 ExportFailure 2코드.
 * - tm 저장소 (R9): load/save가 LoadResult·SaveResult 문자열 집계 경계에서만
 *   해석하는 4코드. 결과 타입이 문자열로 고정돼 있어 코드가 경계 밖으로
 *   나가지 않는다(집계자 예외 — 표시 지점 통과가 원칙, 문자열 고정 경계만 예외).
 * - animatic (R9): studio-animatic-timeline의 Failure 23코드 전부. LoadResult·
 *   SaveResult는 문자열 집계 경계라 load/save 함수 안에서만 해석하고, Failure
 *   채널은 표시 지점(StudioAnimaticTimelinePanel)까지 코드를 통과시킨다.
 *   R9 통합 후속: 같은 Failure 타입을 재사용하는 자막 파서(parseStudioAnimaticSubtitles)의
 *   방출 2코드(subtitlesEmpty·subtitlesNoCues)도 이 구간에 등록한다 — 소비처는 .ok만 본다.
 * 후속 생산자는 이 모듈에 코드 구간을 추가하는 반복으로 소진한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioAnimaticError } from "../studio-animatic-timeline";
import type {
  StudioTranslationMemoryExportError,
  StudioTranslationMemoryImportError,
  StudioTranslationMemoryStorageError,
} from "../studio-translation-memory";

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
  "studio.producerError.tm.importTooLarge": "가져오기 파일은 {size}MB 이하여야 합니다.",
  "studio.producerError.tm.importInvalidJson": "번역 메모리 JSON을 해석하지 못했습니다.",
  "studio.producerError.tm.importNotDocument": "번역 메모리 문서 형식이 아닙니다.",
  "studio.producerError.tm.importUnsupportedDocument": "지원하는 ToonStudio 번역 메모리 v1 문서가 아닙니다.",
  "studio.producerError.tm.importTooManyCandidates": "한 번에 최대 {count}개 후보만 가져올 수 있습니다.",
  "studio.producerError.tm.exportInvalidEntries": "유효하지 않거나 저장 한도를 넘는 항목이 있어 내보내기를 중단했습니다.",
  "studio.producerError.tm.exportTooLarge": "내보내기 결과가 {size}MB 제한을 넘습니다.",
  "studio.producerError.tm.storageUnavailable": "브라우저 로컬 저장소를 사용할 수 없습니다.",
  "studio.producerError.tm.storageReadFailed": "브라우저 로컬 저장소를 읽을 수 없습니다.",
  "studio.producerError.tm.saveNoStorage": "로컬 저장소가 없어 현재 탭에서만 유지됩니다.",
  "studio.producerError.tm.saveStorageFull": "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.tm.importTooLarge": "The import file must be {size}MB or smaller.",
  "studio.producerError.tm.importInvalidJson": "Could not parse the translation memory JSON.",
  "studio.producerError.tm.importNotDocument": "This is not a translation memory document.",
  "studio.producerError.tm.importUnsupportedDocument": "This is not a supported ToonStudio translation memory v1 document.",
  "studio.producerError.tm.importTooManyCandidates": "You can import at most {count} candidates at a time.",
  "studio.producerError.tm.exportInvalidEntries": "Some entries are invalid or exceed the storage limit, so the export was stopped.",
  "studio.producerError.tm.exportTooLarge": "The export result exceeds the {size}MB limit.",
  "studio.producerError.tm.storageUnavailable": "Browser local storage is unavailable.",
  "studio.producerError.tm.storageReadFailed": "Could not read browser local storage.",
  "studio.producerError.tm.saveNoStorage": "There is no local storage, so this is kept only in the current tab.",
  "studio.producerError.tm.saveStorageFull": "Browser storage is full or local saving is blocked.",
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
  return resolveProducerError(TM_IMPORT_ERROR_KEYS[error.code], TM_IMPORT_ERROR_KO[error.code], error.params);
}

const TM_EXPORT_ERROR_KEYS: Readonly<Record<StudioTranslationMemoryExportError["code"], string>> = {
  exportInvalidEntries: "studio.producerError.tm.exportInvalidEntries",
  exportTooLarge: "studio.producerError.tm.exportTooLarge",
};

const TM_EXPORT_ERROR_KO: Readonly<Record<StudioTranslationMemoryExportError["code"], string>> = {
  exportInvalidEntries: "유효하지 않거나 저장 한도를 넘는 항목이 있어 내보내기를 중단했습니다.",
  exportTooLarge: "내보내기 결과가 {size}MB 제한을 넘습니다.",
};

/** 표시 지점 전용 해석 (tm 내보내기). SaveResult 문자열 경계에서는 save 함수가 집계자 예외로 부른다. */
export function resolveStudioTranslationMemoryExportError(
  error: StudioTranslationMemoryExportError,
): string {
  return resolveProducerError(TM_EXPORT_ERROR_KEYS[error.code], TM_EXPORT_ERROR_KO[error.code], error.params);
}

const TM_STORAGE_ERROR_KEYS: Readonly<Record<StudioTranslationMemoryStorageError["code"], string>> = {
  storageUnavailable: "studio.producerError.tm.storageUnavailable",
  storageReadFailed: "studio.producerError.tm.storageReadFailed",
  saveNoStorage: "studio.producerError.tm.saveNoStorage",
  saveStorageFull: "studio.producerError.tm.saveStorageFull",
};

const TM_STORAGE_ERROR_KO: Readonly<Record<StudioTranslationMemoryStorageError["code"], string>> = {
  storageUnavailable: "브라우저 로컬 저장소를 사용할 수 없습니다.",
  storageReadFailed: "브라우저 로컬 저장소를 읽을 수 없습니다.",
  saveNoStorage: "로컬 저장소가 없어 현재 탭에서만 유지됩니다.",
  saveStorageFull: "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.",
};

/**
 * 집계 경계 전용 해석 (tm load/save): LoadResult·SaveResult의 error가 문자열로
 * 고정돼 있어, 코드를 방출한 load/save 함수 안에서만 이 함수로 해석한다.
 * 표시 지점은 문자열을 그대로 렌더하므로 이 함수를 부르지 않는다.
 */
export function resolveStudioTranslationMemoryStorageError(
  error: StudioTranslationMemoryStorageError,
): string {
  return resolveProducerError(TM_STORAGE_ERROR_KEYS[error.code], TM_STORAGE_ERROR_KO[error.code], error.params);
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.animatic.notDocument": "애니매틱 문서 형식이 아닙니다.",
  "studio.producerError.animatic.unsupportedDocument": "지원하는 ToonStudio 애니매틱 v1 문서가 아닙니다.",
  "studio.producerError.animatic.invalidSettings": "애니매틱 설정 또는 세그먼트 한도가 올바르지 않습니다.",
  "studio.producerError.animatic.invalidItems": "유효하지 않은 컷·카메라·cue 항목이 있습니다.",
  "studio.producerError.animatic.duplicateSegmentId": "중복된 애니매틱 세그먼트 ID가 있습니다.",
  "studio.producerError.animatic.textLimitExceeded": "애니매틱 텍스트 메타데이터 한도를 넘었습니다.",
  "studio.producerError.animatic.invalidWorkScope": "유효한 작품 범위가 필요합니다.",
  "studio.producerError.animatic.invalidPageId": "{page}페이지 ID가 올바르지 않습니다.",
  "studio.producerError.animatic.duplicatePageId": "중복된 페이지 ID가 있습니다.",
  "studio.producerError.animatic.tooManySegments": "애니매틱은 최대 {max}개 페이지·컷까지 만들 수 있습니다.",
  "studio.producerError.animatic.invalidCutId": "유효하지 않은 컷 ID가 있습니다.",
  "studio.producerError.animatic.stripTooLong": "세로 페이지 스트립 길이 한도를 넘었습니다.",
  "studio.producerError.animatic.invalidSegmentDuration": "유효하지 않은 컷 길이가 있습니다.",
  "studio.producerError.animatic.totalDurationTooLong": "총 길이는 {minutes}분 이하여야 합니다.",
  "studio.producerError.animatic.tooManyFrames": "미리보기는 최대 {max}프레임까지 만들 수 있습니다.",
  "studio.producerError.animatic.exportTooLarge": "애니매틱 JSON은 {size}KB 이하여야 합니다.",
  "studio.producerError.animatic.importTooLarge": "가져오기 파일은 {size}KB 이하여야 합니다.",
  "studio.producerError.animatic.importInvalidJson": "애니매틱 JSON을 해석하지 못했습니다.",
  "studio.producerError.animatic.storageUnavailable": "브라우저 로컬 저장소를 사용할 수 없습니다.",
  "studio.producerError.animatic.storageReadFailed": "브라우저 로컬 저장소를 읽을 수 없습니다.",
  "studio.producerError.animatic.wrongWorkScope": "다른 작품 범위의 애니매틱 문서입니다.",
  "studio.producerError.animatic.saveNoStorage": "로컬 저장소가 없어 현재 탭에서만 유지됩니다.",
  "studio.producerError.animatic.saveStorageFull": "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.",
  "studio.producerError.animatic.subtitlesEmpty": "자막 파일 내용이 비어 있습니다.",
  "studio.producerError.animatic.subtitlesNoCues": "자막 파일에서 읽을 수 있는 큐가 없습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.animatic.notDocument": "This is not an animatic document.",
  "studio.producerError.animatic.unsupportedDocument": "This is not a supported ToonStudio animatic v1 document.",
  "studio.producerError.animatic.invalidSettings": "The animatic settings or segment limits are invalid.",
  "studio.producerError.animatic.invalidItems": "Some cut, camera, or cue entries are invalid.",
  "studio.producerError.animatic.duplicateSegmentId": "There are duplicate animatic segment IDs.",
  "studio.producerError.animatic.textLimitExceeded": "The animatic text metadata limit has been exceeded.",
  "studio.producerError.animatic.invalidWorkScope": "A valid work scope is required.",
  "studio.producerError.animatic.invalidPageId": "The page {page} ID is invalid.",
  "studio.producerError.animatic.duplicatePageId": "There are duplicate page IDs.",
  "studio.producerError.animatic.tooManySegments": "An animatic can contain at most {max} pages and cuts.",
  "studio.producerError.animatic.invalidCutId": "An invalid cut ID was found.",
  "studio.producerError.animatic.stripTooLong": "The vertical page strip length limit has been exceeded.",
  "studio.producerError.animatic.invalidSegmentDuration": "An invalid cut duration was found.",
  "studio.producerError.animatic.totalDurationTooLong": "The total length must be {minutes} minutes or less.",
  "studio.producerError.animatic.tooManyFrames": "A preview can contain at most {max} frames.",
  "studio.producerError.animatic.exportTooLarge": "The animatic JSON must be {size}KB or smaller.",
  "studio.producerError.animatic.importTooLarge": "The import file must be {size}KB or smaller.",
  "studio.producerError.animatic.importInvalidJson": "Could not parse the animatic JSON.",
  "studio.producerError.animatic.storageUnavailable": "Browser local storage is unavailable.",
  "studio.producerError.animatic.storageReadFailed": "Could not read browser local storage.",
  "studio.producerError.animatic.wrongWorkScope": "This animatic document belongs to a different work scope.",
  "studio.producerError.animatic.saveNoStorage": "There is no local storage, so this is kept only in the current tab.",
  "studio.producerError.animatic.saveStorageFull": "Browser storage is full or local saving is blocked.",
  "studio.producerError.animatic.subtitlesEmpty": "The subtitle file is empty.",
  "studio.producerError.animatic.subtitlesNoCues": "No readable cues were found in the subtitle file.",
});

const ANIMATIC_ERROR_KEYS: Readonly<Record<StudioAnimaticError["code"], string>> = {
  notDocument: "studio.producerError.animatic.notDocument",
  unsupportedDocument: "studio.producerError.animatic.unsupportedDocument",
  invalidSettings: "studio.producerError.animatic.invalidSettings",
  invalidItems: "studio.producerError.animatic.invalidItems",
  duplicateSegmentId: "studio.producerError.animatic.duplicateSegmentId",
  textLimitExceeded: "studio.producerError.animatic.textLimitExceeded",
  invalidWorkScope: "studio.producerError.animatic.invalidWorkScope",
  invalidPageId: "studio.producerError.animatic.invalidPageId",
  duplicatePageId: "studio.producerError.animatic.duplicatePageId",
  tooManySegments: "studio.producerError.animatic.tooManySegments",
  invalidCutId: "studio.producerError.animatic.invalidCutId",
  stripTooLong: "studio.producerError.animatic.stripTooLong",
  invalidSegmentDuration: "studio.producerError.animatic.invalidSegmentDuration",
  totalDurationTooLong: "studio.producerError.animatic.totalDurationTooLong",
  tooManyFrames: "studio.producerError.animatic.tooManyFrames",
  exportTooLarge: "studio.producerError.animatic.exportTooLarge",
  importTooLarge: "studio.producerError.animatic.importTooLarge",
  importInvalidJson: "studio.producerError.animatic.importInvalidJson",
  storageUnavailable: "studio.producerError.animatic.storageUnavailable",
  storageReadFailed: "studio.producerError.animatic.storageReadFailed",
  wrongWorkScope: "studio.producerError.animatic.wrongWorkScope",
  saveNoStorage: "studio.producerError.animatic.saveNoStorage",
  saveStorageFull: "studio.producerError.animatic.saveStorageFull",
  subtitlesEmpty: "studio.producerError.animatic.subtitlesEmpty",
  subtitlesNoCues: "studio.producerError.animatic.subtitlesNoCues",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const ANIMATIC_ERROR_KO: Readonly<Record<StudioAnimaticError["code"], string>> = {
  subtitlesEmpty: "자막 파일 내용이 비어 있습니다.",
  subtitlesNoCues: "자막 파일에서 읽을 수 있는 큐가 없습니다.",
  notDocument: "애니매틱 문서 형식이 아닙니다.",
  unsupportedDocument: "지원하는 ToonStudio 애니매틱 v1 문서가 아닙니다.",
  invalidSettings: "애니매틱 설정 또는 세그먼트 한도가 올바르지 않습니다.",
  invalidItems: "유효하지 않은 컷·카메라·cue 항목이 있습니다.",
  duplicateSegmentId: "중복된 애니매틱 세그먼트 ID가 있습니다.",
  textLimitExceeded: "애니매틱 텍스트 메타데이터 한도를 넘었습니다.",
  invalidWorkScope: "유효한 작품 범위가 필요합니다.",
  invalidPageId: "{page}페이지 ID가 올바르지 않습니다.",
  duplicatePageId: "중복된 페이지 ID가 있습니다.",
  tooManySegments: "애니매틱은 최대 {max}개 페이지·컷까지 만들 수 있습니다.",
  invalidCutId: "유효하지 않은 컷 ID가 있습니다.",
  stripTooLong: "세로 페이지 스트립 길이 한도를 넘었습니다.",
  invalidSegmentDuration: "유효하지 않은 컷 길이가 있습니다.",
  totalDurationTooLong: "총 길이는 {minutes}분 이하여야 합니다.",
  tooManyFrames: "미리보기는 최대 {max}프레임까지 만들 수 있습니다.",
  exportTooLarge: "애니매틱 JSON은 {size}KB 이하여야 합니다.",
  importTooLarge: "가져오기 파일은 {size}KB 이하여야 합니다.",
  importInvalidJson: "애니매틱 JSON을 해석하지 못했습니다.",
  storageUnavailable: "브라우저 로컬 저장소를 사용할 수 없습니다.",
  storageReadFailed: "브라우저 로컬 저장소를 읽을 수 없습니다.",
  wrongWorkScope: "다른 작품 범위의 애니매틱 문서입니다.",
  saveNoStorage: "로컬 저장소가 없어 현재 탭에서만 유지됩니다.",
  saveStorageFull: "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.",
};

/**
 * 표시 지점 전용 해석 (animatic): 패널의 documentError·setNotice가 부른다.
 * 생산자 내부에서는 LoadResult·SaveResult 문자열 집계 경계(load/save 함수)에서만
 * 집계자 예외로 부른다 — 그 경계 밖으로 코드는 표시 지점까지 그대로 통과한다.
 */
export function resolveStudioAnimaticError(error: StudioAnimaticError): string {
  return resolveProducerError(ANIMATIC_ERROR_KEYS[error.code], ANIMATIC_ERROR_KO[error.code], error.params);
}
