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
 * - tm 생성 (R10): createStudioTranslationMemoryEntry의 CreateFailure 4코드.
 *   필드 검증 2코드(createFieldEmpty·createFieldTooLong)는 한국어 라벨 문자열이
 *   아니라 필드 코드(params.field, 7종)를 싣고, 라벨 자체도 이 모듈의
 *   field.* 키로 해석한다. 조사 규칙은 아래 create 구간 주석이 정본이다.
 * - bg3d 템플릿 이전 (R10): bg3d-template-library의 이전 실패 서브코드 5종.
 *   구 "migration-failed" 단일 코드를 방출 지점별로 분해했고, 표시 지점
 *   (useStudioBg3dEditorEffects)은 코드 문자열 기반 진입점으로 해석한다.
 *   보존 고지 접미사도 이 구간의 키로 함께 해석한다.
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
import type { Bg3dTemplateLibraryErrorCode } from "../bg3d/bg3d-template-library";
import type { StudioAnimaticError } from "../studio-animatic-timeline";
import type {
  StudioTranslationMemoryCreateError,
  StudioTranslationMemoryExportError,
  StudioTranslationMemoryFieldCode,
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
  "studio.producerError.tm.field.workScope": "작품 범위",
  "studio.producerError.tm.field.sourceText": "원문",
  "studio.producerError.tm.field.speaker": "화자",
  "studio.producerError.tm.field.sourceLanguage": "원문 언어",
  "studio.producerError.tm.field.targetLanguage": "대상 언어",
  "studio.producerError.tm.field.translation": "번역문",
  "studio.producerError.tm.field.sourceRevision": "원문 리비전",
  "studio.producerError.tm.createFieldEmpty": "{field}이(가) 비어 있습니다.",
  "studio.producerError.tm.createFieldTooLong": "{field}은(는) {max}자 이하여야 합니다.",
  "studio.producerError.tm.createUnsupportedStatus": "지원하지 않는 번역 메모리 상태입니다.",
  "studio.producerError.tm.createGlossaryConflict": "용어집 충돌이 있는 번역은 충돌을 해소한 뒤 승인할 수 있습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.tm.field.workScope": "Work scope",
  "studio.producerError.tm.field.sourceText": "Source text",
  "studio.producerError.tm.field.speaker": "Speaker",
  "studio.producerError.tm.field.sourceLanguage": "Source language",
  "studio.producerError.tm.field.targetLanguage": "Target language",
  "studio.producerError.tm.field.translation": "Translation",
  "studio.producerError.tm.field.sourceRevision": "Source revision",
  "studio.producerError.tm.createFieldEmpty": "{field} must not be empty.",
  "studio.producerError.tm.createFieldTooLong": "{field} must be {max} characters or fewer.",
  "studio.producerError.tm.createUnsupportedStatus": "Unsupported translation memory status.",
  "studio.producerError.tm.createGlossaryConflict": "A translation with glossary conflicts cannot be approved until the conflicts are resolved.",
});

const TM_CREATE_FIELD_LABEL_KEYS: Readonly<Record<StudioTranslationMemoryFieldCode, string>> = {
  workScope: "studio.producerError.tm.field.workScope",
  sourceText: "studio.producerError.tm.field.sourceText",
  speaker: "studio.producerError.tm.field.speaker",
  sourceLanguage: "studio.producerError.tm.field.sourceLanguage",
  targetLanguage: "studio.producerError.tm.field.targetLanguage",
  translation: "studio.producerError.tm.field.translation",
  sourceRevision: "studio.producerError.tm.field.sourceRevision",
};

/** 필드 코드별 ko 라벨 원문 — 미등록 로케일·미해석 시 폴백이며 이관 전 생산자 라벨과 동일하다. */
const TM_CREATE_FIELD_LABEL_KO: Readonly<Record<StudioTranslationMemoryFieldCode, string>> = {
  workScope: "작품 범위",
  sourceText: "원문",
  speaker: "화자",
  sourceLanguage: "원문 언어",
  targetLanguage: "대상 언어",
  translation: "번역문",
  sourceRevision: "원문 리비전",
};

const TM_CREATE_ERROR_KEYS: Readonly<Record<StudioTranslationMemoryCreateError["code"], string>> = {
  createFieldEmpty: "studio.producerError.tm.createFieldEmpty",
  createFieldTooLong: "studio.producerError.tm.createFieldTooLong",
  createUnsupportedStatus: "studio.producerError.tm.createUnsupportedStatus",
  createGlossaryConflict: "studio.producerError.tm.createGlossaryConflict",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백. 필드 템플릿은 이관 전 병기 형태(이(가)/은(는))를 유지하고, 조사 선택은 resolveStudioTranslationMemoryCreateError가 수행한다. */
const TM_CREATE_ERROR_KO: Readonly<Record<StudioTranslationMemoryCreateError["code"], string>> = {
  createFieldEmpty: "{field}이(가) 비어 있습니다.",
  createFieldTooLong: "{field}은(는) {max}자 이하여야 합니다.",
  createUnsupportedStatus: "지원하지 않는 번역 메모리 상태입니다.",
  createGlossaryConflict: "용어집 충돌이 있는 번역은 충돌을 해소한 뒤 승인할 수 있습니다.",
};

/**
 * 조사 선택 규칙 (R10 명문화): ko 템플릿은 이(가)·은(는) 병기 마커를 유지하고,
 * 해석 시점에 해석된 ko 라벨의 마지막 한글 음절 받침 유무로 하나로 선택한다
 * (받침 있음 → 이/은, 받침 없음 → 가/는). 받침은 한글 음절 U+AC00–U+D7A3의
 * 종성 인덱스((코드 − 0xAC00) % 28)가 0이 아닌지로 판정한다. en 템플릿은
 * 조사 마커가 없어 이 규칙이 적용되지 않는다. 라벨이 한글 음절로 끝나지
 * 않으면 받침 없음으로 간주한다(병기 마커가 없는 템플릿에서는 무영향).
 */
function hasKoreanFinalConsonant(label: string): boolean {
  const last = [...label.trim()].at(-1);
  if (!last) return false;
  const code = last.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function applyKoreanParticles(text: string, label: string): string {
  const batchim = hasKoreanFinalConsonant(label);
  return text
    .replaceAll("이(가)", batchim ? "이" : "가")
    .replaceAll("은(는)", batchim ? "은" : "는");
}

function isTranslationMemoryFieldCode(value: string | undefined): value is StudioTranslationMemoryFieldCode {
  return value !== undefined && Object.hasOwn(TM_CREATE_FIELD_LABEL_KEYS, value);
}

/**
 * 표시 지점 전용 해석 (tm 생성): 패널의 saveDraft 실패 notice가 부른다.
 * 필드 코드(params.field)는 라벨 키로 먼저 해석해 {field}에 넣고, ko 병기
 * 조사는 위 규칙으로 선택한다. 알 수 없는 필드 코드는 원문 값을 그대로 쓴다.
 */
export function resolveStudioTranslationMemoryCreateError(
  error: StudioTranslationMemoryCreateError,
): string {
  const fieldParam = error.params?.field;
  const label = isTranslationMemoryFieldCode(fieldParam)
    ? resolveProducerError(TM_CREATE_FIELD_LABEL_KEYS[fieldParam], TM_CREATE_FIELD_LABEL_KO[fieldParam])
    : (fieldParam ?? "");
  const params: Record<string, string> = { ...error.params, field: label };
  const resolved = resolveProducerError(TM_CREATE_ERROR_KEYS[error.code], TM_CREATE_ERROR_KO[error.code], params);
  return applyKoreanParticles(resolved, label);
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

registerI18nLocaleEntries("ko", {
  "studio.producerError.bg3dTemplate.migrationLegacyReadFailed": "기존 IndexedDB 3D 템플릿을 SQLite/OPFS로 이전하지 못했습니다.",
  "studio.producerError.bg3dTemplate.migrationCorruptRows": "기존 3D 템플릿 저장소에 손상되거나 지원하지 않는 행이 있어 자동 이전을 중단했습니다.",
  "studio.producerError.bg3dTemplate.migrationConversionFailed": "기존 3D 템플릿을 정규 V12 행으로 변환하지 못했습니다.",
  "studio.producerError.bg3dTemplate.migrationTotalSizeExceeded": "기존 3D 템플릿의 전체 크기가 V12 이전 한도를 초과했습니다.",
  "studio.producerError.bg3dTemplate.migrationPublishFailed": "기존 3D 템플릿을 SQLite/OPFS manifest에 최종 게시하지 못했습니다.",
  "studio.producerError.bg3dTemplate.migrationDataPreservedNote": "기존 IndexedDB 데이터는 삭제하지 않았습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.bg3dTemplate.migrationLegacyReadFailed": "Could not migrate the existing IndexedDB 3D templates to SQLite/OPFS.",
  "studio.producerError.bg3dTemplate.migrationCorruptRows": "The existing 3D template store contains corrupted or unsupported rows, so the automatic migration was stopped.",
  "studio.producerError.bg3dTemplate.migrationConversionFailed": "Could not convert the existing 3D templates into canonical V12 rows.",
  "studio.producerError.bg3dTemplate.migrationTotalSizeExceeded": "The total size of the existing 3D templates exceeds the V12 migration limit.",
  "studio.producerError.bg3dTemplate.migrationPublishFailed": "Could not publish the existing 3D templates to the SQLite/OPFS manifest.",
  "studio.producerError.bg3dTemplate.migrationDataPreservedNote": "Your existing IndexedDB data was not deleted.",
});

const BG3D_TEMPLATE_MIGRATION_ERROR_KEYS: Readonly<
  Partial<Record<Bg3dTemplateLibraryErrorCode, string>>
> = {
  "migration-legacy-read-failed": "studio.producerError.bg3dTemplate.migrationLegacyReadFailed",
  "migration-corrupt-rows": "studio.producerError.bg3dTemplate.migrationCorruptRows",
  "migration-conversion-failed": "studio.producerError.bg3dTemplate.migrationConversionFailed",
  "migration-total-size-exceeded": "studio.producerError.bg3dTemplate.migrationTotalSizeExceeded",
  "migration-publish-failed": "studio.producerError.bg3dTemplate.migrationPublishFailed",
};

const BG3D_TEMPLATE_MIGRATION_ERROR_KO: Readonly<Record<string, string>> = {
  "studio.producerError.bg3dTemplate.migrationLegacyReadFailed": "기존 IndexedDB 3D 템플릿을 SQLite/OPFS로 이전하지 못했습니다.",
  "studio.producerError.bg3dTemplate.migrationCorruptRows": "기존 3D 템플릿 저장소에 손상되거나 지원하지 않는 행이 있어 자동 이전을 중단했습니다.",
  "studio.producerError.bg3dTemplate.migrationConversionFailed": "기존 3D 템플릿을 정규 V12 행으로 변환하지 못했습니다.",
  "studio.producerError.bg3dTemplate.migrationTotalSizeExceeded": "기존 3D 템플릿의 전체 크기가 V12 이전 한도를 초과했습니다.",
  "studio.producerError.bg3dTemplate.migrationPublishFailed": "기존 3D 템플릿을 SQLite/OPFS manifest에 최종 게시하지 못했습니다.",
};

/**
 * 표시 지점 전용 해석 (bg3d 템플릿 이전, R10): useStudioBg3dEditorEffects의
 * 로드 실패 catch가 코드 문자열만으로 부른다(호스트 백 경유라 생산자 클래스를
 * 직접 import하지 않는 표시 지점 사정에 맞춘 코드 기반 진입점).
 * 이전 서브코드가 아니면 null — 호출자는 일반 저장소 오류 문구로 폴백한다.
 */
export function resolveBg3dTemplateMigrationErrorByCode(code: string): string | null {
  const key = BG3D_TEMPLATE_MIGRATION_ERROR_KEYS[code as Bg3dTemplateLibraryErrorCode];
  if (!key) return null;
  return resolveProducerError(key, BG3D_TEMPLATE_MIGRATION_ERROR_KO[key]);
}

/** 이전 실패 안내에 붙는 보존 고지 — 이관 전 표시 지점의 접미 문구 그대로다. */
export function resolveBg3dTemplateMigrationDataPreservedNote(): string {
  return resolveProducerError(
    "studio.producerError.bg3dTemplate.migrationDataPreservedNote",
    "기존 IndexedDB 데이터는 삭제하지 않았습니다.",
  );
}
