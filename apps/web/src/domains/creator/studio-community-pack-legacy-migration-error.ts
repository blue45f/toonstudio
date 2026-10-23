/**
 * A4 D4 (R15): studio-community-pack-legacy-migration 생산자 구조화 오류 정의 —
 * 기준선 포화로 전용 파일에 추출했다(studio-comments-error.ts 선례).
 * 생산자는 표시 문구 대신 {code}만 방출한다(Result reason은 코드 객체, throw는
 * message = 코드 문자열). 표시는 표시·집계 지점에서 리졸버
 * (status-i18n/studio-producer-error-i18n-community-pack.ts)로만 해석한다.
 * 설계 r10-d4-trace-3.md §2.7의 23곳 집계는 resolveMatchingCandidate 구간만 센
 * 부분 집계였고, 현행 트리 실측은 사유 24곳 + throw 18곳 = 42곳이다(보고서 병기).
 */

/** 이전 결과(conflict·repair-required)의 사유 코드 — runtime 합성 경계에서 해석한다. */
export type StudioCommunityPackReasonCode =
  | "legacyDuplicateUuid"
  | "legacyIdentityUnverifiable"
  | "legacyIdMismatch"
  | "legacyKindMismatch"
  | "legacyNotListed"
  | "legacyRecordUnverifiable"
  | "legacyMetaMismatch"
  | "legacyProjectionUnsafe"
  | "legacyMultipleInstalled"
  | "receiptMissing"
  | "receiptCorrupt"
  | "receiptMismatch"
  | "brushLogicalConflict"
  | "brushRowsMismatch"
  | "brushDefinitionMismatch"
  | "brushStoreUnsupported"
  | "filterLogicalConflict"
  | "filterRowsMismatch"
  | "filterReceiptMismatch"
  | "filterDefinitionMismatch"
  | "filterStoreUnsupported"
  | "paletteLogicalConflict"
  | "paletteRowsMismatch"
  | "paletteDefinitionMismatch";

export interface StudioCommunityPackMigrationReason {
  readonly code: StudioCommunityPackReasonCode;
}

/** 이전 중단 throw 코드 — runtime errorResult 경계에서 해석한다. */
export type StudioCommunityPackThrowCode =
  | "brushRollbackConflict"
  | "brushRollbackUnverified"
  | "brushLogicalIdPrecreated"
  | "brushReceiptPrecreated"
  | "brushMigratedUnverified"
  | "brushLegacyChanged"
  | "brushLegacyRemovalUnverified"
  | "brushRollbackFailed"
  | "filterRollbackConflict"
  | "filterRollbackUnverified"
  | "filterLogicalIdPrecreated"
  | "filterMigratedUnverified"
  | "filterLegacyChanged"
  | "filterLegacyRemovalUnverified"
  | "filterRollbackFailed"
  | "paletteMigratedUnverified"
  | "paletteRollbackConflict"
  | "paletteRollbackFailed";

export class StudioCommunityPackMigrationError extends Error {
  readonly code: StudioCommunityPackThrowCode;

  constructor(code: StudioCommunityPackThrowCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "StudioCommunityPackMigrationError";
    this.code = code;
  }
}
