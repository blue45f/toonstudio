/**
 * 생산자 구조화 에러 해석 모듈 — bible 구간: studio-production-bible의 가져오기
 * Result 3코드 + throw 6코드 + 진단 issue 5코드(템플릿 4종) + 종류 라벨 3키
 * (A4 D4, R15, 설계 r10-d4-trace-3.md §2.13).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * issue 템플릿의 이(가)·을(를)·은(는) 병기 마커는 이관 전 원문이 그대로 싣던
 * 형태라 ko에서는 선택하지 않고 병기 그대로 유지한다(원문 동일성 우선).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioProductionBibleError,
  StudioProductionBibleErrorCode,
  StudioProductionBibleImportError,
  StudioProductionBibleImportErrorCode,
} from "../studio-production-bible-error";
import type {
  StudioProductionBibleEntryKind,
  StudioProductionBibleReferenceIssue,
} from "../studio-production-bible";

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
  "studio.producerError.bible.importTooLarge": "바이블 파일은 {size}MB 이하여야 해요.",
  "studio.producerError.bible.importInvalidJson": "장면·장소·소품 바이블 JSON을 해석하지 못했어요.",
  "studio.producerError.bible.importNotDocument": "지원하는 바이블 항목 목록을 찾지 못했어요.",
  "studio.producerError.bible.tooManyEntries": "장면·장소·소품은 합쳐서 최대 {max}개까지 저장할 수 있어요.",
  "studio.producerError.bible.invalidEntryId": "유효한 종류와 안정적인 항목 ID가 필요해요.",
  "studio.producerError.bible.duplicateId": "이미 사용 중인 바이블 항목 ID예요.",
  "studio.producerError.bible.invalidPatch": "올바르지 않은 바이블 수정 내용이에요.",
  "studio.producerError.bible.forbiddenField": "수정할 수 없는 바이블 필드예요: {field}",
  "studio.producerError.bible.normalizeFailed": "바이블 항목을 정규화하지 못했어요.",
  "studio.producerError.bible.kind.scene": "장면",
  "studio.producerError.bible.kind.location": "장소",
  "studio.producerError.bible.kind.prop": "소품",
  "studio.producerError.bible.issueDanglingCharacter": "{entryKind} \"{name}\"이(가) 캐릭터 바이블에 없는 ID \"{referenceId}\"을(를) 참조합니다.",
  "studio.producerError.bible.issueDanglingInternal": "{entryKind} \"{name}\"이(가) 없는 {targetKind} ID \"{referenceId}\"을(를) 참조합니다.",
  "studio.producerError.bible.issueDanglingAsset": "{entryKind} \"{name}\"이(가) 로컬 에셋에 없는 ID \"{referenceId}\"을(를) 참조합니다.",
  "studio.producerError.bible.issueKindMismatch": "참조 \"{referenceId}\"은(는) {targetKind}이지만 {expectedKind} 연결에 들어 있습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.bible.importTooLarge": "The bible file must be {size}MB or smaller.",
  "studio.producerError.bible.importInvalidJson": "Could not parse the scene · location · prop bible JSON.",
  "studio.producerError.bible.importNotDocument": "No supported bible entry list was found.",
  "studio.producerError.bible.tooManyEntries": "You can save at most {max} scenes, locations, and props combined.",
  "studio.producerError.bible.invalidEntryId": "A valid kind and a stable entry ID are required.",
  "studio.producerError.bible.duplicateId": "This bible entry ID is already in use.",
  "studio.producerError.bible.invalidPatch": "The bible edit is invalid.",
  "studio.producerError.bible.forbiddenField": "This bible field cannot be edited: {field}",
  "studio.producerError.bible.normalizeFailed": "Could not normalize the bible entry.",
  "studio.producerError.bible.kind.scene": "Scene",
  "studio.producerError.bible.kind.location": "Location",
  "studio.producerError.bible.kind.prop": "Prop",
  "studio.producerError.bible.issueDanglingCharacter": "The {entryKind} \"{name}\" references ID \"{referenceId}\", which is not in the character bible.",
  "studio.producerError.bible.issueDanglingInternal": "The {entryKind} \"{name}\" references the missing {targetKind} ID \"{referenceId}\".",
  "studio.producerError.bible.issueDanglingAsset": "The {entryKind} \"{name}\" references ID \"{referenceId}\", which is not in the local assets.",
  "studio.producerError.bible.issueKindMismatch": "The reference \"{referenceId}\" is a {targetKind}, but it is in a {expectedKind} link.",
});

const BIBLE_IMPORT_ERROR_KEYS: Readonly<Record<StudioProductionBibleImportErrorCode, string>> = {
  importTooLarge: "studio.producerError.bible.importTooLarge",
  importInvalidJson: "studio.producerError.bible.importInvalidJson",
  importNotDocument: "studio.producerError.bible.importNotDocument",
};

const BIBLE_IMPORT_ERROR_KO: Readonly<Record<StudioProductionBibleImportErrorCode, string>> = {
  importTooLarge: "바이블 파일은 {size}MB 이하여야 해요.",
  importInvalidJson: "장면·장소·소품 바이블 JSON을 해석하지 못했어요.",
  importNotDocument: "지원하는 바이블 항목 목록을 찾지 못했어요.",
};

/** 표시 지점 전용 해석 (bible 가져오기): Panel importFile이 코드 그대로 부른다. */
export function resolveStudioProductionBibleImportError(
  error: StudioProductionBibleImportError,
): string {
  return resolveProducerError(BIBLE_IMPORT_ERROR_KEYS[error.code], BIBLE_IMPORT_ERROR_KO[error.code], error.params);
}

const BIBLE_ERROR_KEYS: Readonly<Record<StudioProductionBibleErrorCode, string>> = {
  tooManyEntries: "studio.producerError.bible.tooManyEntries",
  invalidEntryId: "studio.producerError.bible.invalidEntryId",
  duplicateId: "studio.producerError.bible.duplicateId",
  invalidPatch: "studio.producerError.bible.invalidPatch",
  forbiddenField: "studio.producerError.bible.forbiddenField",
  normalizeFailed: "studio.producerError.bible.normalizeFailed",
};

const BIBLE_ERROR_KO: Readonly<Record<StudioProductionBibleErrorCode, string>> = {
  tooManyEntries: "장면·장소·소품은 합쳐서 최대 {max}개까지 저장할 수 있어요.",
  invalidEntryId: "유효한 종류와 안정적인 항목 ID가 필요해요.",
  duplicateId: "이미 사용 중인 바이블 항목 ID예요.",
  invalidPatch: "올바르지 않은 바이블 수정 내용이에요.",
  forbiddenField: "수정할 수 없는 바이블 필드예요: {field}",
  normalizeFailed: "바이블 항목을 정규화하지 못했어요.",
};

/** 표시 지점 전용 해석 (bible throw): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioProductionBibleError(
  error: Pick<StudioProductionBibleError, "code" | "params">,
): string {
  return resolveProducerError(BIBLE_ERROR_KEYS[error.code], BIBLE_ERROR_KO[error.code], error.params);
}

/**
 * 표시 지점 전용 해석 (bible throw, 원인 객체 덕 타이핑): Panel catch가 원인
 * 객체만으로 부른다. bible 생산자가 아닌 원인은 null — 호출자는 기존 메시지
 * 경로를 유지한다.
 */
export function resolveStudioProductionBibleErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioProductionBibleError" || typeof code !== "string") return null;
  if (!Object.hasOwn(BIBLE_ERROR_KEYS, code)) return null;
  return resolveStudioProductionBibleError({
    code: code as StudioProductionBibleErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

const BIBLE_KIND_LABEL_KO: Readonly<Record<StudioProductionBibleEntryKind, string>> = {
  scene: "장면",
  location: "장소",
  prop: "소품",
};

function kindLabel(kind: StudioProductionBibleEntryKind): string {
  return resolveProducerError(
    `studio.producerError.bible.kind.${kind}`,
    BIBLE_KIND_LABEL_KO[kind],
  );
}

/**
 * 표시 지점 전용 해석 (bible 진단 issue): Panel 이슈 렌더가 부른다. 종류 라벨은
 * 코드로 먼저 해석해 템플릿에 넣고, 병기 마커는 ko 원문 형태 그대로 둔다.
 * 내부 참조의 대상 종류는 field에서, 종류 불일치의 실제 종류는 params에서 온다.
 */
export function resolveStudioProductionBibleIssue(issue: StudioProductionBibleReferenceIssue): string {
  const entryKind = kindLabel(issue.entryKind);
  const name = issue.messageParams.name;
  const referenceId = issue.referenceId;
  if (issue.code === "DANGLING_CHARACTER") {
    return resolveProducerError(
      "studio.producerError.bible.issueDanglingCharacter",
      "{entryKind} \"{name}\"이(가) 캐릭터 바이블에 없는 ID \"{referenceId}\"을(를) 참조합니다.",
      { entryKind, name, referenceId },
    );
  }
  if (issue.code === "DANGLING_ASSET") {
    return resolveProducerError(
      "studio.producerError.bible.issueDanglingAsset",
      "{entryKind} \"{name}\"이(가) 로컬 에셋에 없는 ID \"{referenceId}\"을(를) 참조합니다.",
      { entryKind, name, referenceId },
    );
  }
  if (issue.code === "REFERENCE_KIND_MISMATCH") {
    const expectedKind = kindLabel(issue.field === "linkedLocationIds" ? "location" : "prop");
    const targetKind = issue.messageParams.targetKind
      ? kindLabel(issue.messageParams.targetKind)
      : expectedKind;
    return resolveProducerError(
      "studio.producerError.bible.issueKindMismatch",
      "참조 \"{referenceId}\"은(는) {targetKind}이지만 {expectedKind} 연결에 들어 있습니다.",
      { referenceId, targetKind, expectedKind },
    );
  }
  const targetKind = kindLabel(issue.field === "linkedLocationIds" ? "location" : "prop");
  return resolveProducerError(
    "studio.producerError.bible.issueDanglingInternal",
    "{entryKind} \"{name}\"이(가) 없는 {targetKind} ID \"{referenceId}\"을(를) 참조합니다.",
    { entryKind, name, targetKind, referenceId },
  );
}
