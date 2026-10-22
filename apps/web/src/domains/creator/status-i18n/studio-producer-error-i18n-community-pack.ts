/**
 * 생산자 구조화 에러 해석 모듈 — communityPack 구간: studio-community-pack-legacy-
 * migration 사유 24코드 + throw 18코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.7).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * 사유 채널은 Result 타입이 문자열로 고정된 집계 경계(runtime가 message로 합성하는
 * 지점)에서 해석하는 집계자 예외이고, throw 채널은 runtime errorResult 경계에서
 * 해석한다 — 두 경계 모두 studio-creator-pack-product-runtime.ts에 있다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioCommunityPackMigrationReason,
  StudioCommunityPackReasonCode,
  StudioCommunityPackThrowCode,
} from "../studio-community-pack-legacy-migration-error";

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
  "studio.producerError.communityPack.legacyDuplicateUuid": "레거시 Creator Pack UUID가 서로 다른 로컬 package ID로 중복되어 있습니다.",
  "studio.producerError.communityPack.legacyIdentityUnverifiable": "레거시 Creator Pack 릴리스 식별자를 서버에서 확인할 수 없어 자동 이전하지 않았습니다.",
  "studio.producerError.communityPack.legacyIdMismatch": "로컬 레거시 UUID와 서버 릴리스 식별자가 정확히 일치하지 않습니다.",
  "studio.producerError.communityPack.legacyKindMismatch": "같은 Creator Market package의 로컬 종류와 서버 종류가 일치하지 않습니다.",
  "studio.producerError.communityPack.legacyNotListed": "같은 Creator Market package의 레거시 릴리스가 현재 공개 설치 대상이 아니어서 자동 이전하지 않았습니다.",
  "studio.producerError.communityPack.legacyRecordUnverifiable": "레거시 Creator Pack 릴리스를 서버에서 확인할 수 없어 자동 이전하지 않았습니다.",
  "studio.producerError.communityPack.legacyMetaMismatch": "레거시 릴리스 식별자와 공개 릴리스의 정확한 메타데이터가 일치하지 않습니다.",
  "studio.producerError.communityPack.legacyProjectionUnsafe": "서버 릴리스를 현재 Studio 논리 팩으로 안전하게 투영할 수 없습니다.",
  "studio.producerError.communityPack.legacyMultipleInstalled": "같은 논리 팩에 속한 레거시 릴리스가 둘 이상 설치되어 자동 병합하지 않았습니다.",
  "studio.producerError.communityPack.receiptMissing": "레거시 Creator Pack 설치 영수증이 없습니다.",
  "studio.producerError.communityPack.receiptCorrupt": "레거시 Creator Pack 설치 영수증이 손상되었습니다.",
  "studio.producerError.communityPack.receiptMismatch": "레거시 Creator Pack 영수증이 서버 릴리스와 일치하지 않습니다.",
  "studio.producerError.communityPack.brushLogicalConflict": "논리 ID와 레거시 ID의 브러시 설치가 동시에 존재합니다.",
  "studio.producerError.communityPack.brushRowsMismatch": "레거시 브러시 행이 서버 entry 집합과 완전하게 일치하지 않습니다.",
  "studio.producerError.communityPack.brushDefinitionMismatch": "레거시 브러시 정의가 서버 릴리스와 일치하지 않습니다.",
  "studio.producerError.communityPack.brushStoreUnsupported": "브러시 저장소가 안전한 원자 이전을 지원하지 않습니다.",
  "studio.producerError.communityPack.filterLogicalConflict": "논리 ID와 레거시 ID의 필터 설치가 동시에 존재합니다.",
  "studio.producerError.communityPack.filterRowsMismatch": "레거시 필터 행이 서버 entry 집합과 완전하게 일치하지 않습니다.",
  "studio.producerError.communityPack.filterReceiptMismatch": "레거시 필터 영수증 필드가 서버 릴리스와 일치하지 않습니다.",
  "studio.producerError.communityPack.filterDefinitionMismatch": "레거시 필터 정의가 서버 릴리스와 일치하지 않습니다.",
  "studio.producerError.communityPack.filterStoreUnsupported": "필터 저장소가 안전한 원자 이전을 지원하지 않습니다.",
  "studio.producerError.communityPack.paletteLogicalConflict": "논리 ID와 레거시 ID의 팔레트 설치가 동시에 존재합니다.",
  "studio.producerError.communityPack.paletteRowsMismatch": "레거시 팔레트 행이 서버 entry 집합과 완전하게 일치하지 않습니다.",
  "studio.producerError.communityPack.paletteDefinitionMismatch": "레거시 팔레트 정의가 서버 릴리스와 일치하지 않습니다.",
  "studio.producerError.communityPack.brushRollbackConflict": "브러시 레거시 이전 rollback이 새 사용자 변경과 충돌했습니다.",
  "studio.producerError.communityPack.brushRollbackUnverified": "브러시 레거시 이전 rollback을 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.brushLogicalIdPrecreated": "논리 ID 브러시가 이전 중 먼저 생성되어 덮어쓰지 않았습니다.",
  "studio.producerError.communityPack.brushReceiptPrecreated": "논리 ID 브러시 영수증이 이전 중 먼저 생성되어 덮어쓰지 않았습니다.",
  "studio.producerError.communityPack.brushMigratedUnverified": "새 논리 ID 브러시를 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.brushLegacyChanged": "레거시 브러시가 이전 중 변경되어 제거하지 않았습니다.",
  "studio.producerError.communityPack.brushLegacyRemovalUnverified": "레거시 브러시 제거를 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.brushRollbackFailed": "브러시 레거시 이전 rollback 실패",
  "studio.producerError.communityPack.filterRollbackConflict": "필터 레거시 이전 rollback이 새 사용자 변경과 충돌했습니다.",
  "studio.producerError.communityPack.filterRollbackUnverified": "필터 레거시 이전 rollback을 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.filterLogicalIdPrecreated": "논리 ID 필터가 이전 중 먼저 생성되어 덮어쓰지 않았습니다.",
  "studio.producerError.communityPack.filterMigratedUnverified": "새 논리 ID 필터를 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.filterLegacyChanged": "레거시 필터가 이전 중 변경되어 제거하지 않았습니다.",
  "studio.producerError.communityPack.filterLegacyRemovalUnverified": "레거시 필터 제거를 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.filterRollbackFailed": "필터 레거시 이전 rollback 실패",
  "studio.producerError.communityPack.paletteMigratedUnverified": "팔레트 레거시 이전을 완전하게 검증하지 못했습니다.",
  "studio.producerError.communityPack.paletteRollbackConflict": "팔레트 레거시 이전 rollback이 새 사용자 변경과 충돌했습니다.",
  "studio.producerError.communityPack.paletteRollbackFailed": "팔레트 레거시 이전 rollback 실패",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.communityPack.legacyDuplicateUuid": "The legacy Creator Pack UUID is duplicated under different local package IDs.",
  "studio.producerError.communityPack.legacyIdentityUnverifiable": "The legacy Creator Pack release identifier could not be verified on the server, so it was not migrated automatically.",
  "studio.producerError.communityPack.legacyIdMismatch": "The local legacy UUID and the server release identifier do not match exactly.",
  "studio.producerError.communityPack.legacyKindMismatch": "The local kind and the server kind of the same Creator Market package do not match.",
  "studio.producerError.communityPack.legacyNotListed": "The legacy release of the same Creator Market package is not currently a public install target, so it was not migrated automatically.",
  "studio.producerError.communityPack.legacyRecordUnverifiable": "The legacy Creator Pack release could not be verified on the server, so it was not migrated automatically.",
  "studio.producerError.communityPack.legacyMetaMismatch": "The legacy release identifier and the exact metadata of the public release do not match.",
  "studio.producerError.communityPack.legacyProjectionUnsafe": "The server release cannot be projected safely onto the current Studio logical pack.",
  "studio.producerError.communityPack.legacyMultipleInstalled": "Two or more legacy releases belonging to the same logical pack are installed, so they were not merged automatically.",
  "studio.producerError.communityPack.receiptMissing": "There is no legacy Creator Pack install receipt.",
  "studio.producerError.communityPack.receiptCorrupt": "The legacy Creator Pack install receipt is corrupted.",
  "studio.producerError.communityPack.receiptMismatch": "The legacy Creator Pack receipt does not match the server release.",
  "studio.producerError.communityPack.brushLogicalConflict": "Brush installs under the logical ID and the legacy ID exist at the same time.",
  "studio.producerError.communityPack.brushRowsMismatch": "The legacy brush rows do not match the server entry set exactly.",
  "studio.producerError.communityPack.brushDefinitionMismatch": "The legacy brush definition does not match the server release.",
  "studio.producerError.communityPack.brushStoreUnsupported": "The brush store does not support a safe atomic migration.",
  "studio.producerError.communityPack.filterLogicalConflict": "Filter installs under the logical ID and the legacy ID exist at the same time.",
  "studio.producerError.communityPack.filterRowsMismatch": "The legacy filter rows do not match the server entry set exactly.",
  "studio.producerError.communityPack.filterReceiptMismatch": "The legacy filter receipt fields do not match the server release.",
  "studio.producerError.communityPack.filterDefinitionMismatch": "The legacy filter definition does not match the server release.",
  "studio.producerError.communityPack.filterStoreUnsupported": "The filter store does not support a safe atomic migration.",
  "studio.producerError.communityPack.paletteLogicalConflict": "Palette installs under the logical ID and the legacy ID exist at the same time.",
  "studio.producerError.communityPack.paletteRowsMismatch": "The legacy palette rows do not match the server entry set exactly.",
  "studio.producerError.communityPack.paletteDefinitionMismatch": "The legacy palette definition does not match the server release.",
  "studio.producerError.communityPack.brushRollbackConflict": "The brush legacy migration rollback conflicted with a new user change.",
  "studio.producerError.communityPack.brushRollbackUnverified": "The brush legacy migration rollback could not be fully verified.",
  "studio.producerError.communityPack.brushLogicalIdPrecreated": "A logical-ID brush was created first during migration, so it was not overwritten.",
  "studio.producerError.communityPack.brushReceiptPrecreated": "A logical-ID brush receipt was created first during migration, so it was not overwritten.",
  "studio.producerError.communityPack.brushMigratedUnverified": "The new logical-ID brushes could not be fully verified.",
  "studio.producerError.communityPack.brushLegacyChanged": "A legacy brush changed during migration, so it was not removed.",
  "studio.producerError.communityPack.brushLegacyRemovalUnverified": "The removal of the legacy brushes could not be fully verified.",
  "studio.producerError.communityPack.brushRollbackFailed": "Brush legacy migration rollback failed",
  "studio.producerError.communityPack.filterRollbackConflict": "The filter legacy migration rollback conflicted with a new user change.",
  "studio.producerError.communityPack.filterRollbackUnverified": "The filter legacy migration rollback could not be fully verified.",
  "studio.producerError.communityPack.filterLogicalIdPrecreated": "A logical-ID filter was created first during migration, so it was not overwritten.",
  "studio.producerError.communityPack.filterMigratedUnverified": "The new logical-ID filters could not be fully verified.",
  "studio.producerError.communityPack.filterLegacyChanged": "A legacy filter changed during migration, so it was not removed.",
  "studio.producerError.communityPack.filterLegacyRemovalUnverified": "The removal of the legacy filters could not be fully verified.",
  "studio.producerError.communityPack.filterRollbackFailed": "Filter legacy migration rollback failed",
  "studio.producerError.communityPack.paletteMigratedUnverified": "The palette legacy migration could not be fully verified.",
  "studio.producerError.communityPack.paletteRollbackConflict": "The palette legacy migration rollback conflicted with a new user change.",
  "studio.producerError.communityPack.paletteRollbackFailed": "Palette legacy migration rollback failed",
});

const COMMUNITY_PACK_REASON_KEYS: Readonly<Record<StudioCommunityPackReasonCode, string>> = {
  legacyDuplicateUuid: "studio.producerError.communityPack.legacyDuplicateUuid",
  legacyIdentityUnverifiable: "studio.producerError.communityPack.legacyIdentityUnverifiable",
  legacyIdMismatch: "studio.producerError.communityPack.legacyIdMismatch",
  legacyKindMismatch: "studio.producerError.communityPack.legacyKindMismatch",
  legacyNotListed: "studio.producerError.communityPack.legacyNotListed",
  legacyRecordUnverifiable: "studio.producerError.communityPack.legacyRecordUnverifiable",
  legacyMetaMismatch: "studio.producerError.communityPack.legacyMetaMismatch",
  legacyProjectionUnsafe: "studio.producerError.communityPack.legacyProjectionUnsafe",
  legacyMultipleInstalled: "studio.producerError.communityPack.legacyMultipleInstalled",
  receiptMissing: "studio.producerError.communityPack.receiptMissing",
  receiptCorrupt: "studio.producerError.communityPack.receiptCorrupt",
  receiptMismatch: "studio.producerError.communityPack.receiptMismatch",
  brushLogicalConflict: "studio.producerError.communityPack.brushLogicalConflict",
  brushRowsMismatch: "studio.producerError.communityPack.brushRowsMismatch",
  brushDefinitionMismatch: "studio.producerError.communityPack.brushDefinitionMismatch",
  brushStoreUnsupported: "studio.producerError.communityPack.brushStoreUnsupported",
  filterLogicalConflict: "studio.producerError.communityPack.filterLogicalConflict",
  filterRowsMismatch: "studio.producerError.communityPack.filterRowsMismatch",
  filterReceiptMismatch: "studio.producerError.communityPack.filterReceiptMismatch",
  filterDefinitionMismatch: "studio.producerError.communityPack.filterDefinitionMismatch",
  filterStoreUnsupported: "studio.producerError.communityPack.filterStoreUnsupported",
  paletteLogicalConflict: "studio.producerError.communityPack.paletteLogicalConflict",
  paletteRowsMismatch: "studio.producerError.communityPack.paletteRowsMismatch",
  paletteDefinitionMismatch: "studio.producerError.communityPack.paletteDefinitionMismatch",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const COMMUNITY_PACK_REASON_KO: Readonly<Record<StudioCommunityPackReasonCode, string>> = {
  legacyDuplicateUuid: "레거시 Creator Pack UUID가 서로 다른 로컬 package ID로 중복되어 있습니다.",
  legacyIdentityUnverifiable: "레거시 Creator Pack 릴리스 식별자를 서버에서 확인할 수 없어 자동 이전하지 않았습니다.",
  legacyIdMismatch: "로컬 레거시 UUID와 서버 릴리스 식별자가 정확히 일치하지 않습니다.",
  legacyKindMismatch: "같은 Creator Market package의 로컬 종류와 서버 종류가 일치하지 않습니다.",
  legacyNotListed: "같은 Creator Market package의 레거시 릴리스가 현재 공개 설치 대상이 아니어서 자동 이전하지 않았습니다.",
  legacyRecordUnverifiable: "레거시 Creator Pack 릴리스를 서버에서 확인할 수 없어 자동 이전하지 않았습니다.",
  legacyMetaMismatch: "레거시 릴리스 식별자와 공개 릴리스의 정확한 메타데이터가 일치하지 않습니다.",
  legacyProjectionUnsafe: "서버 릴리스를 현재 Studio 논리 팩으로 안전하게 투영할 수 없습니다.",
  legacyMultipleInstalled: "같은 논리 팩에 속한 레거시 릴리스가 둘 이상 설치되어 자동 병합하지 않았습니다.",
  receiptMissing: "레거시 Creator Pack 설치 영수증이 없습니다.",
  receiptCorrupt: "레거시 Creator Pack 설치 영수증이 손상되었습니다.",
  receiptMismatch: "레거시 Creator Pack 영수증이 서버 릴리스와 일치하지 않습니다.",
  brushLogicalConflict: "논리 ID와 레거시 ID의 브러시 설치가 동시에 존재합니다.",
  brushRowsMismatch: "레거시 브러시 행이 서버 entry 집합과 완전하게 일치하지 않습니다.",
  brushDefinitionMismatch: "레거시 브러시 정의가 서버 릴리스와 일치하지 않습니다.",
  brushStoreUnsupported: "브러시 저장소가 안전한 원자 이전을 지원하지 않습니다.",
  filterLogicalConflict: "논리 ID와 레거시 ID의 필터 설치가 동시에 존재합니다.",
  filterRowsMismatch: "레거시 필터 행이 서버 entry 집합과 완전하게 일치하지 않습니다.",
  filterReceiptMismatch: "레거시 필터 영수증 필드가 서버 릴리스와 일치하지 않습니다.",
  filterDefinitionMismatch: "레거시 필터 정의가 서버 릴리스와 일치하지 않습니다.",
  filterStoreUnsupported: "필터 저장소가 안전한 원자 이전을 지원하지 않습니다.",
  paletteLogicalConflict: "논리 ID와 레거시 ID의 팔레트 설치가 동시에 존재합니다.",
  paletteRowsMismatch: "레거시 팔레트 행이 서버 entry 집합과 완전하게 일치하지 않습니다.",
  paletteDefinitionMismatch: "레거시 팔레트 정의가 서버 릴리스와 일치하지 않습니다.",
};

/**
 * 집계 경계 전용 해석 (communityPack 사유): Result 타입이 문자열로 고정된
 * runtime 합성 경계(message: …)에서만 부른다. 표시 지점은 문자열을 그대로 렌더한다.
 */
export function resolveStudioCommunityPackReason(
  reason: StudioCommunityPackMigrationReason,
): string {
  return resolveProducerError(COMMUNITY_PACK_REASON_KEYS[reason.code], COMMUNITY_PACK_REASON_KO[reason.code]);
}

const COMMUNITY_PACK_THROW_KEYS: Readonly<Record<StudioCommunityPackThrowCode, string>> = {
  brushRollbackConflict: "studio.producerError.communityPack.brushRollbackConflict",
  brushRollbackUnverified: "studio.producerError.communityPack.brushRollbackUnverified",
  brushLogicalIdPrecreated: "studio.producerError.communityPack.brushLogicalIdPrecreated",
  brushReceiptPrecreated: "studio.producerError.communityPack.brushReceiptPrecreated",
  brushMigratedUnverified: "studio.producerError.communityPack.brushMigratedUnverified",
  brushLegacyChanged: "studio.producerError.communityPack.brushLegacyChanged",
  brushLegacyRemovalUnverified: "studio.producerError.communityPack.brushLegacyRemovalUnverified",
  brushRollbackFailed: "studio.producerError.communityPack.brushRollbackFailed",
  filterRollbackConflict: "studio.producerError.communityPack.filterRollbackConflict",
  filterRollbackUnverified: "studio.producerError.communityPack.filterRollbackUnverified",
  filterLogicalIdPrecreated: "studio.producerError.communityPack.filterLogicalIdPrecreated",
  filterMigratedUnverified: "studio.producerError.communityPack.filterMigratedUnverified",
  filterLegacyChanged: "studio.producerError.communityPack.filterLegacyChanged",
  filterLegacyRemovalUnverified: "studio.producerError.communityPack.filterLegacyRemovalUnverified",
  filterRollbackFailed: "studio.producerError.communityPack.filterRollbackFailed",
  paletteMigratedUnverified: "studio.producerError.communityPack.paletteMigratedUnverified",
  paletteRollbackConflict: "studio.producerError.communityPack.paletteRollbackConflict",
  paletteRollbackFailed: "studio.producerError.communityPack.paletteRollbackFailed",
};

const COMMUNITY_PACK_THROW_KO: Readonly<Record<StudioCommunityPackThrowCode, string>> = {
  brushRollbackConflict: "브러시 레거시 이전 rollback이 새 사용자 변경과 충돌했습니다.",
  brushRollbackUnverified: "브러시 레거시 이전 rollback을 완전하게 검증하지 못했습니다.",
  brushLogicalIdPrecreated: "논리 ID 브러시가 이전 중 먼저 생성되어 덮어쓰지 않았습니다.",
  brushReceiptPrecreated: "논리 ID 브러시 영수증이 이전 중 먼저 생성되어 덮어쓰지 않았습니다.",
  brushMigratedUnverified: "새 논리 ID 브러시를 완전하게 검증하지 못했습니다.",
  brushLegacyChanged: "레거시 브러시가 이전 중 변경되어 제거하지 않았습니다.",
  brushLegacyRemovalUnverified: "레거시 브러시 제거를 완전하게 검증하지 못했습니다.",
  brushRollbackFailed: "브러시 레거시 이전 rollback 실패",
  filterRollbackConflict: "필터 레거시 이전 rollback이 새 사용자 변경과 충돌했습니다.",
  filterRollbackUnverified: "필터 레거시 이전 rollback을 완전하게 검증하지 못했습니다.",
  filterLogicalIdPrecreated: "논리 ID 필터가 이전 중 먼저 생성되어 덮어쓰지 않았습니다.",
  filterMigratedUnverified: "새 논리 ID 필터를 완전하게 검증하지 못했습니다.",
  filterLegacyChanged: "레거시 필터가 이전 중 변경되어 제거하지 않았습니다.",
  filterLegacyRemovalUnverified: "레거시 필터 제거를 완전하게 검증하지 못했습니다.",
  filterRollbackFailed: "필터 레거시 이전 rollback 실패",
  paletteMigratedUnverified: "팔레트 레거시 이전을 완전하게 검증하지 못했습니다.",
  paletteRollbackConflict: "팔레트 레거시 이전 rollback이 새 사용자 변경과 충돌했습니다.",
  paletteRollbackFailed: "팔레트 레거시 이전 rollback 실패",
};

/** 표시 경계 전용 해석 (communityPack throw): runtime errorResult 경계가 부른다. */
export function resolveStudioCommunityPackError(
  error: { readonly code: StudioCommunityPackThrowCode },
): string {
  return resolveProducerError(COMMUNITY_PACK_THROW_KEYS[error.code], COMMUNITY_PACK_THROW_KO[error.code]);
}

/**
 * 표시 경계 전용 해석 (communityPack throw, 원인 객체 덕 타이핑): AggregateError는
 * errors 배열 안에 구조화 오류를 품으므로 재귀 탐색한다. 해당하지 않으면 null —
 * 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioCommunityPackErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, errors } = cause as { name?: unknown; code?: unknown; errors?: unknown };
  if (name === "StudioCommunityPackMigrationError" && typeof code === "string"
    && Object.hasOwn(COMMUNITY_PACK_THROW_KEYS, code)) {
    return resolveStudioCommunityPackError({ code: code as StudioCommunityPackThrowCode });
  }
  // AggregateError는 자체 메시지가 코드다(rollback 실패 합성) — 안에 품은 원인보다
  // 합성 메시지(이관 전 표시 문구)가 우선이다.
  const { message } = cause as { message?: unknown };
  if (typeof message === "string" && Object.hasOwn(COMMUNITY_PACK_THROW_KEYS, message)) {
    return resolveStudioCommunityPackError({ code: message as StudioCommunityPackThrowCode });
  }
  if (Array.isArray(errors)) {
    for (const inner of errors) {
      const resolved = resolveStudioCommunityPackErrorFromCause(inner);
      if (resolved) return resolved;
    }
  }
  return null;
}
