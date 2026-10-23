/**
 * 생산자 구조화 에러 해석 모듈 — live CRDT 구간: studio-crdt-outbox 코드 21종
 * (도메인 liveOutbox) + studio-crdt-page-bridge 코드 19종 (livePageBridge) +
 * studio-crdt-scene-publisher 코드 5종·표시 키 2종 (liveScene) (A4 D4, R13).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고(message = 코드), 표시는 이 모듈의
 * 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은
 * 신규 번역이다. 설계 정본은 r10-d4-trace-2.md §3.1·§3.2·§3.6이다.
 *
 * 표시 지점:
 * - liveOutbox: room-binding이 outbox 오류·상태의 코드를 recovery 상태에 실어
 *   Provider 표시 지점에서 해석한다(코드 통과). 상태는 getStatus 생산 지점에서
 *   코드 상태로 바뀌어 있다.
 * - livePageBridge·liveScene: 전이 게시자(createStudioCrdtTransitionPublisher)
 *   catch가 접두 문구와 함께 해석하고, offline bridge의 unsupported 누적 지점이
 *   문자열 경계라 그 지점에서 해석한다(집계자 예외 — 최종 reportError는 이미
 *   합성된 문자열만 받는다). reconcile 경유 방출은 표시 배선이 없어 코드만
 *   부착된 잔존이다(설계 §3.2).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

import type { StudioCrdtOutboxErrorCode } from "../live/studio-crdt-outbox";
import type { StudioCrdtPageBridgeErrorCode } from "../live/studio-crdt-page-bridge-error";
import type { StudioCrdtScenePublishErrorCode } from "../live/studio-crdt-scene-publisher-error";

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
  "studio.producerError.liveOutbox.persistenceTimeout": "CRDT outbox 작업 시간이 초과됐습니다.",
  "studio.producerError.liveOutbox.persistenceCorrupted": "CRDT outbox에 손상된 미승인 변경이 있어 원고를 안전하게 열 수 없습니다.",
  "studio.producerError.liveOutbox.capacityExceeded": "CRDT outbox 한도를 초과했습니다({entryCount}개, {totalBytes}바이트). 기존 변경은 삭제하지 않았습니다.",
  "studio.producerError.liveOutbox.persistenceUnavailable": "CRDT outbox가 복구 대기 중입니다.",
  "studio.producerError.liveOutbox.idbUnavailable": "이 브라우저에서는 IndexedDB를 사용할 수 없어 같은 탭의 긴급 사본만 유지합니다.",
  "studio.producerError.liveOutbox.readUnavailable": "SQLite/OPFS CRDT 보관함 전체를 읽지 못해 긴급 사본만으로 원고를 열 수 없습니다.",
  "studio.producerError.liveOutbox.scopeMismatch": "CRDT outbox scope가 문자열이 아닙니다.",
  "studio.producerError.liveOutbox.pendingScopeMismatch": "CRDT outbox scope가 비어 있거나 허용 길이·문자 범위를 벗어났습니다.",
  "studio.producerError.liveOutbox.retryNotPossible": "CRDT outbox retry metadata가 허용 범위를 벗어났습니다.",
  "studio.producerError.liveOutbox.requestFailed": "IndexedDB 요청이 실패했습니다.",
  "studio.producerError.liveOutbox.transactionAborted": "IndexedDB 작업이 취소되었습니다.",
  "studio.producerError.liveOutbox.transactionFailed": "IndexedDB 작업이 실패했습니다.",
  "studio.producerError.liveOutbox.openFailed": "CRDT outbox를 열지 못했습니다.",
  "studio.producerError.liveOutbox.upgradeBlocked": "CRDT outbox 업그레이드가 다른 탭에 의해 차단됐습니다.",
  "studio.producerError.liveOutbox.emergencyCopyInvalid": "CRDT outbox 긴급 사본을 만들지 못했습니다.",
  "studio.producerError.liveOutbox.invalidLimits": "CRDT outbox limits는 V12 상한 안의 양의 정수여야 합니다.",
  "studio.producerError.liveOutbox.degradedEmergencyOnly": "일부 오프라인 변경은 아직 같은 탭의 긴급 사본에만 보관되어 있습니다.",
  "studio.producerError.liveOutbox.degradedEmergencyOnlySqlite": "일부 공동 편집 변경은 아직 같은 탭의 긴급 사본에만 보관되어 있습니다.",
  "studio.producerError.liveOutbox.degradedFallbackLegacy": "오프라인 CRDT 보관함을 사용할 수 없어 같은 탭의 긴급 사본을 사용합니다.",
  "studio.producerError.liveOutbox.degradedFallbackSqlite": "SQLite/OPFS CRDT 보관함을 사용할 수 없어 같은 탭 사본만 남았습니다.",
  "studio.producerError.liveOutbox.degradedFallbackSerialized": "오프라인 CRDT 보관함 대신 같은 탭의 긴급 사본을 사용합니다.",
  "studio.producerError.livePageBridge.r8GrainReferenceInvalid": "R8 브러시 그레인 자산 참조가 올바르지 않습니다.",
  "studio.producerError.livePageBridge.strokePayloadVersionUnsupported": "지원하지 않는 획 페이로드 버전입니다.",
  "studio.producerError.livePageBridge.brushProgramVersionIncompatible": "브러시 엔진 프로그램과 획 페이로드 버전이 호환되지 않습니다.",
  "studio.producerError.livePageBridge.outlineStrokeVersionIncompatible": "외곽선 획 계약과 페이로드 버전이 호환되지 않습니다.",
  "studio.producerError.livePageBridge.outlineStrokeInvalid": "외곽선 획 계약이 올바르지 않습니다.",
  "studio.producerError.livePageBridge.strokeInputContractInvalid": "획 입력 센서 계약이 올바르지 않습니다.",
  "studio.producerError.livePageBridge.taperSpacingVersionRequired": "테이퍼 간격 브러시는 획 페이로드 v5가 필요합니다.",
  "studio.producerError.livePageBridge.dynamicMinDiameterInvalid": "동적 브러시 최소 굵기 스냅샷이 올바르지 않습니다.",
  "studio.producerError.livePageBridge.continuationPipelineVersionIncompatible": "분할 연속 브러시 파이프라인과 페이로드 버전이 호환되지 않습니다.",
  "studio.producerError.livePageBridge.r8GrainVersionIncompatible": "R8 브러시 그레인과 페이로드 버전이 호환되지 않습니다.",
  "studio.producerError.livePageBridge.materialPressureVersionIncompatible": "획 재질 필압 모델과 페이로드 버전이 호환되지 않습니다.",
  "studio.producerError.livePageBridge.materialPressureInvalid": "획 재질 필압 모델이 올바르지 않습니다.",
  "studio.producerError.livePageBridge.materialMinDiameterInvalid": "획 재질 최소 굵기 스냅샷이 올바르지 않습니다.",
  "studio.producerError.livePageBridge.elementTypeUnsupported": "{elementType} 요소는 장면 CRDT에서 지원하지 않습니다.",
  "studio.producerError.livePageBridge.drawElementStrokeSyncRequired": "드로우 요소는 획 CRDT로 동기화해야 합니다.",
  "studio.producerError.livePageBridge.filterMaskNonImageReference": "필터 마스크 surface는 이미지 참조에만 연결할 수 있습니다.",
  "studio.producerError.livePageBridge.filterMaskSurfaceIdInvalid": "필터 마스크 surface ID가 올바르지 않습니다.",
  "studio.producerError.livePageBridge.filterMaskSurfaceStateInvalid": "필터 마스크 surface 상태가 올바르지 않습니다.",
  "studio.producerError.livePageBridge.referenceSourceMissing": "참조 장면 요소를 복원할 원본 에셋 요소가 없습니다.",
  "studio.producerError.liveScene.duplicateSceneElementId": "페이지 간에 중복된 장면 요소 식별자가 있습니다.",
  "studio.producerError.liveScene.duplicateLayerGroupId": "같은 페이지에 중복된 레이어 그룹 식별자가 있습니다.",
  "studio.producerError.liveScene.duplicateDrawId": "페이지 간에 중복된 드로우 식별자가 있습니다.",
  "studio.producerError.liveScene.elementTypeChangeNotAllowed": "같은 장면 요소 식별자의 타입을 변경할 수 없습니다.",
  "studio.producerError.liveScene.sharedStageCorrupted": "페이지 공유 3D 장면 연결 정보가 손상되었습니다.",
  "studio.producerError.liveScene.publishPrefix": "실시간 장면 동기화: ",
  "studio.producerError.liveScene.publishFallback": "장면 요소와 페이지 순서를 팀 문서에 반영하지 못했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.liveOutbox.persistenceTimeout": "The CRDT outbox operation timed out.",
  "studio.producerError.liveOutbox.persistenceCorrupted": "The CRDT outbox contains a corrupted unapproved change, so the manuscript cannot be opened safely.",
  "studio.producerError.liveOutbox.capacityExceeded": "The CRDT outbox limit was exceeded ({entryCount} entries, {totalBytes} bytes). Existing changes were not deleted.",
  "studio.producerError.liveOutbox.persistenceUnavailable": "The CRDT outbox is waiting for recovery.",
  "studio.producerError.liveOutbox.idbUnavailable": "IndexedDB is unavailable in this browser, so only the same-tab emergency copy is kept.",
  "studio.producerError.liveOutbox.readUnavailable": "Could not read the entire SQLite/OPFS CRDT outbox, so the manuscript cannot be opened with only the emergency copy.",
  "studio.producerError.liveOutbox.scopeMismatch": "The CRDT outbox scope is not a string.",
  "studio.producerError.liveOutbox.pendingScopeMismatch": "The CRDT outbox scope is empty or outside the allowed length and character range.",
  "studio.producerError.liveOutbox.retryNotPossible": "The CRDT outbox retry metadata is outside the allowed range.",
  "studio.producerError.liveOutbox.requestFailed": "The IndexedDB request failed.",
  "studio.producerError.liveOutbox.transactionAborted": "The IndexedDB transaction was cancelled.",
  "studio.producerError.liveOutbox.transactionFailed": "The IndexedDB transaction failed.",
  "studio.producerError.liveOutbox.openFailed": "Could not open the CRDT outbox.",
  "studio.producerError.liveOutbox.upgradeBlocked": "The CRDT outbox upgrade was blocked by another tab.",
  "studio.producerError.liveOutbox.emergencyCopyInvalid": "Could not create the CRDT outbox emergency copy.",
  "studio.producerError.liveOutbox.invalidLimits": "CRDT outbox limits must be positive integers within the V12 caps.",
  "studio.producerError.liveOutbox.degradedEmergencyOnly": "Some offline changes are still kept only in this tab's emergency copy.",
  "studio.producerError.liveOutbox.degradedEmergencyOnlySqlite": "Some co-editing changes are still kept only in this tab's emergency copy.",
  "studio.producerError.liveOutbox.degradedFallbackLegacy": "The offline CRDT outbox is unavailable, so the same-tab emergency copy is used.",
  "studio.producerError.liveOutbox.degradedFallbackSqlite": "The SQLite/OPFS CRDT outbox is unavailable, so only this tab's copy remains.",
  "studio.producerError.liveOutbox.degradedFallbackSerialized": "The same-tab emergency copy is used instead of the offline CRDT outbox.",
  "studio.producerError.livePageBridge.r8GrainReferenceInvalid": "The R8 brush grain asset reference is invalid.",
  "studio.producerError.livePageBridge.strokePayloadVersionUnsupported": "Unsupported stroke payload version.",
  "studio.producerError.livePageBridge.brushProgramVersionIncompatible": "The brush engine program is incompatible with the stroke payload version.",
  "studio.producerError.livePageBridge.outlineStrokeVersionIncompatible": "The outline stroke contract is incompatible with the payload version.",
  "studio.producerError.livePageBridge.outlineStrokeInvalid": "The outline stroke contract is invalid.",
  "studio.producerError.livePageBridge.strokeInputContractInvalid": "The stroke input sensor contract is invalid.",
  "studio.producerError.livePageBridge.taperSpacingVersionRequired": "Taper spacing brushes require stroke payload v5.",
  "studio.producerError.livePageBridge.dynamicMinDiameterInvalid": "The dynamic brush minimum diameter snapshot is invalid.",
  "studio.producerError.livePageBridge.continuationPipelineVersionIncompatible": "The split continuation brush pipeline is incompatible with the payload version.",
  "studio.producerError.livePageBridge.r8GrainVersionIncompatible": "The R8 brush grain is incompatible with the payload version.",
  "studio.producerError.livePageBridge.materialPressureVersionIncompatible": "The stroke material pressure model is incompatible with the payload version.",
  "studio.producerError.livePageBridge.materialPressureInvalid": "The stroke material pressure model is invalid.",
  "studio.producerError.livePageBridge.materialMinDiameterInvalid": "The stroke material minimum diameter snapshot is invalid.",
  "studio.producerError.livePageBridge.elementTypeUnsupported": "The {elementType} element is not supported in the scene CRDT.",
  "studio.producerError.livePageBridge.drawElementStrokeSyncRequired": "Draw elements must be synced through the stroke CRDT.",
  "studio.producerError.livePageBridge.filterMaskNonImageReference": "A filter mask surface can only be attached to an image reference.",
  "studio.producerError.livePageBridge.filterMaskSurfaceIdInvalid": "The filter mask surface ID is invalid.",
  "studio.producerError.livePageBridge.filterMaskSurfaceStateInvalid": "The filter mask surface state is invalid.",
  "studio.producerError.livePageBridge.referenceSourceMissing": "There is no source asset element to restore the reference scene element from.",
  "studio.producerError.liveScene.duplicateSceneElementId": "There are duplicate scene element identifiers across pages.",
  "studio.producerError.liveScene.duplicateLayerGroupId": "There are duplicate layer group identifiers on the same page.",
  "studio.producerError.liveScene.duplicateDrawId": "There are duplicate draw identifiers across pages.",
  "studio.producerError.liveScene.elementTypeChangeNotAllowed": "The type of the same scene element identifier cannot be changed.",
  "studio.producerError.liveScene.sharedStageCorrupted": "The page shared 3D scene connection information is corrupted.",
  "studio.producerError.liveScene.publishPrefix": "Realtime scene sync: ",
  "studio.producerError.liveScene.publishFallback": "Could not apply the scene elements and page order to the team document.",
});

const OUTBOX_ERROR_KEYS: Readonly<Record<StudioCrdtOutboxErrorCode, string>> = {
  "persistence-timeout": "studio.producerError.liveOutbox.persistenceTimeout",
  "persistence-corrupted": "studio.producerError.liveOutbox.persistenceCorrupted",
  "capacity-exceeded": "studio.producerError.liveOutbox.capacityExceeded",
  "persistence-unavailable": "studio.producerError.liveOutbox.persistenceUnavailable",
  "idb-unavailable": "studio.producerError.liveOutbox.idbUnavailable",
  "read-unavailable": "studio.producerError.liveOutbox.readUnavailable",
  "scope-mismatch": "studio.producerError.liveOutbox.scopeMismatch",
  "pending-scope-mismatch": "studio.producerError.liveOutbox.pendingScopeMismatch",
  "retry-not-possible": "studio.producerError.liveOutbox.retryNotPossible",
  "request-failed": "studio.producerError.liveOutbox.requestFailed",
  "transaction-aborted": "studio.producerError.liveOutbox.transactionAborted",
  "transaction-failed": "studio.producerError.liveOutbox.transactionFailed",
  "open-failed": "studio.producerError.liveOutbox.openFailed",
  "upgrade-blocked": "studio.producerError.liveOutbox.upgradeBlocked",
  "emergency-copy-invalid": "studio.producerError.liveOutbox.emergencyCopyInvalid",
  "invalid-limits": "studio.producerError.liveOutbox.invalidLimits",
  "degraded-emergency-only": "studio.producerError.liveOutbox.degradedEmergencyOnly",
  "degraded-emergency-only-sqlite": "studio.producerError.liveOutbox.degradedEmergencyOnlySqlite",
  "degraded-fallback-legacy": "studio.producerError.liveOutbox.degradedFallbackLegacy",
  "degraded-fallback-sqlite": "studio.producerError.liveOutbox.degradedFallbackSqlite",
  "degraded-fallback-serialized": "studio.producerError.liveOutbox.degradedFallbackSerialized",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const OUTBOX_ERROR_KO: Readonly<Record<StudioCrdtOutboxErrorCode, string>> = {
  "persistence-timeout": "CRDT outbox 작업 시간이 초과됐습니다.",
  "persistence-corrupted": "CRDT outbox에 손상된 미승인 변경이 있어 원고를 안전하게 열 수 없습니다.",
  "capacity-exceeded": "CRDT outbox 한도를 초과했습니다({entryCount}개, {totalBytes}바이트). 기존 변경은 삭제하지 않았습니다.",
  "persistence-unavailable": "CRDT outbox가 복구 대기 중입니다.",
  "idb-unavailable": "이 브라우저에서는 IndexedDB를 사용할 수 없어 같은 탭의 긴급 사본만 유지합니다.",
  "read-unavailable": "SQLite/OPFS CRDT 보관함 전체를 읽지 못해 긴급 사본만으로 원고를 열 수 없습니다.",
  "scope-mismatch": "CRDT outbox scope가 문자열이 아닙니다.",
  "pending-scope-mismatch": "CRDT outbox scope가 비어 있거나 허용 길이·문자 범위를 벗어났습니다.",
  "retry-not-possible": "CRDT outbox retry metadata가 허용 범위를 벗어났습니다.",
  "request-failed": "IndexedDB 요청이 실패했습니다.",
  "transaction-aborted": "IndexedDB 작업이 취소되었습니다.",
  "transaction-failed": "IndexedDB 작업이 실패했습니다.",
  "open-failed": "CRDT outbox를 열지 못했습니다.",
  "upgrade-blocked": "CRDT outbox 업그레이드가 다른 탭에 의해 차단됐습니다.",
  "emergency-copy-invalid": "CRDT outbox 긴급 사본을 만들지 못했습니다.",
  "invalid-limits": "CRDT outbox limits는 V12 상한 안의 양의 정수여야 합니다.",
  "degraded-emergency-only": "일부 오프라인 변경은 아직 같은 탭의 긴급 사본에만 보관되어 있습니다.",
  "degraded-emergency-only-sqlite": "일부 공동 편집 변경은 아직 같은 탭의 긴급 사본에만 보관되어 있습니다.",
  "degraded-fallback-legacy": "오프라인 CRDT 보관함을 사용할 수 없어 같은 탭의 긴급 사본을 사용합니다.",
  "degraded-fallback-sqlite": "SQLite/OPFS CRDT 보관함을 사용할 수 없어 같은 탭 사본만 남았습니다.",
  "degraded-fallback-serialized": "오프라인 CRDT 보관함 대신 같은 탭의 긴급 사본을 사용합니다.",
};

const OUTBOX_ERROR_NAMES: ReadonlySet<string> = new Set([
  "StudioCrdtOutboxError",
  "StudioCrdtOutboxUnavailableError",
  "StudioCrdtOutboxReadUnavailableError",
  "StudioCrdtOutboxTimeoutError",
  "StudioCrdtOutboxCorruptionError",
  "StudioCrdtOutboxCapacityError",
]);

/** 표시 지점 전용 해석 (live outbox): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioCrdtOutboxError(
  error: { readonly code: StudioCrdtOutboxErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(OUTBOX_ERROR_KEYS[error.code], OUTBOX_ERROR_KO[error.code], error.params);
}

/**
 * 표시 지점 전용 해석 (live outbox, 원인 객체 진입점): 생산자 오류 클래스를
 * 런타임 import하지 않고 이름+코드 덕 타이핑으로 판정한다(glb·live-raster 선례).
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로(하위 생산자 패스스루)를 유지한다.
 */
export function resolveStudioCrdtOutboxErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (typeof name !== "string" || !OUTBOX_ERROR_NAMES.has(name) || typeof code !== "string") return null;
  if (!Object.hasOwn(OUTBOX_ERROR_KEYS, code)) return null;
  return resolveStudioCrdtOutboxError({
    code: code as StudioCrdtOutboxErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

const PAGE_BRIDGE_ERROR_KEYS: Readonly<Record<StudioCrdtPageBridgeErrorCode, string>> = {
  "r8-grain-reference-invalid": "studio.producerError.livePageBridge.r8GrainReferenceInvalid",
  "stroke-payload-version-unsupported": "studio.producerError.livePageBridge.strokePayloadVersionUnsupported",
  "brush-program-version-incompatible": "studio.producerError.livePageBridge.brushProgramVersionIncompatible",
  "outline-stroke-version-incompatible": "studio.producerError.livePageBridge.outlineStrokeVersionIncompatible",
  "outline-stroke-invalid": "studio.producerError.livePageBridge.outlineStrokeInvalid",
  "stroke-input-contract-invalid": "studio.producerError.livePageBridge.strokeInputContractInvalid",
  "taper-spacing-version-required": "studio.producerError.livePageBridge.taperSpacingVersionRequired",
  "dynamic-min-diameter-invalid": "studio.producerError.livePageBridge.dynamicMinDiameterInvalid",
  "continuation-pipeline-version-incompatible": "studio.producerError.livePageBridge.continuationPipelineVersionIncompatible",
  "r8-grain-version-incompatible": "studio.producerError.livePageBridge.r8GrainVersionIncompatible",
  "material-pressure-version-incompatible": "studio.producerError.livePageBridge.materialPressureVersionIncompatible",
  "material-pressure-invalid": "studio.producerError.livePageBridge.materialPressureInvalid",
  "material-min-diameter-invalid": "studio.producerError.livePageBridge.materialMinDiameterInvalid",
  "element-type-unsupported": "studio.producerError.livePageBridge.elementTypeUnsupported",
  "draw-element-stroke-sync-required": "studio.producerError.livePageBridge.drawElementStrokeSyncRequired",
  "filter-mask-non-image-reference": "studio.producerError.livePageBridge.filterMaskNonImageReference",
  "filter-mask-surface-id-invalid": "studio.producerError.livePageBridge.filterMaskSurfaceIdInvalid",
  "filter-mask-surface-state-invalid": "studio.producerError.livePageBridge.filterMaskSurfaceStateInvalid",
  "reference-source-missing": "studio.producerError.livePageBridge.referenceSourceMissing",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PAGE_BRIDGE_ERROR_KO: Readonly<Record<StudioCrdtPageBridgeErrorCode, string>> = {
  "r8-grain-reference-invalid": "R8 브러시 그레인 자산 참조가 올바르지 않습니다.",
  "stroke-payload-version-unsupported": "지원하지 않는 획 페이로드 버전입니다.",
  "brush-program-version-incompatible": "브러시 엔진 프로그램과 획 페이로드 버전이 호환되지 않습니다.",
  "outline-stroke-version-incompatible": "외곽선 획 계약과 페이로드 버전이 호환되지 않습니다.",
  "outline-stroke-invalid": "외곽선 획 계약이 올바르지 않습니다.",
  "stroke-input-contract-invalid": "획 입력 센서 계약이 올바르지 않습니다.",
  "taper-spacing-version-required": "테이퍼 간격 브러시는 획 페이로드 v5가 필요합니다.",
  "dynamic-min-diameter-invalid": "동적 브러시 최소 굵기 스냅샷이 올바르지 않습니다.",
  "continuation-pipeline-version-incompatible": "분할 연속 브러시 파이프라인과 페이로드 버전이 호환되지 않습니다.",
  "r8-grain-version-incompatible": "R8 브러시 그레인과 페이로드 버전이 호환되지 않습니다.",
  "material-pressure-version-incompatible": "획 재질 필압 모델과 페이로드 버전이 호환되지 않습니다.",
  "material-pressure-invalid": "획 재질 필압 모델이 올바르지 않습니다.",
  "material-min-diameter-invalid": "획 재질 최소 굵기 스냅샷이 올바르지 않습니다.",
  "element-type-unsupported": "{elementType} 요소는 장면 CRDT에서 지원하지 않습니다.",
  "draw-element-stroke-sync-required": "드로우 요소는 획 CRDT로 동기화해야 합니다.",
  "filter-mask-non-image-reference": "필터 마스크 surface는 이미지 참조에만 연결할 수 있습니다.",
  "filter-mask-surface-id-invalid": "필터 마스크 surface ID가 올바르지 않습니다.",
  "filter-mask-surface-state-invalid": "필터 마스크 surface 상태가 올바르지 않습니다.",
  "reference-source-missing": "참조 장면 요소를 복원할 원본 에셋 요소가 없습니다.",
};

/** 표시 지점 전용 해석 (live page-bridge): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioCrdtPageBridgeError(
  error: { readonly code: StudioCrdtPageBridgeErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(PAGE_BRIDGE_ERROR_KEYS[error.code], PAGE_BRIDGE_ERROR_KO[error.code], error.params);
}

/** 표시 지점 전용 해석 (live page-bridge, 원인 객체 진입점). 해당하지 않으면 null. */
export function resolveStudioCrdtPageBridgeErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioCrdtPageBridgeError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PAGE_BRIDGE_ERROR_KEYS, code)) return null;
  return resolveStudioCrdtPageBridgeError({
    code: code as StudioCrdtPageBridgeErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

const SCENE_ERROR_KEYS: Readonly<Record<StudioCrdtScenePublishErrorCode, string>> = {
  "duplicate-scene-element-id": "studio.producerError.liveScene.duplicateSceneElementId",
  "duplicate-layer-group-id": "studio.producerError.liveScene.duplicateLayerGroupId",
  "duplicate-draw-id": "studio.producerError.liveScene.duplicateDrawId",
  "element-type-change-not-allowed": "studio.producerError.liveScene.elementTypeChangeNotAllowed",
  "shared-stage-corrupted": "studio.producerError.liveScene.sharedStageCorrupted",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const SCENE_ERROR_KO: Readonly<Record<StudioCrdtScenePublishErrorCode, string>> = {
  "duplicate-scene-element-id": "페이지 간에 중복된 장면 요소 식별자가 있습니다.",
  "duplicate-layer-group-id": "같은 페이지에 중복된 레이어 그룹 식별자가 있습니다.",
  "duplicate-draw-id": "페이지 간에 중복된 드로우 식별자가 있습니다.",
  "element-type-change-not-allowed": "같은 장면 요소 식별자의 타입을 변경할 수 없습니다.",
  "shared-stage-corrupted": "페이지 공유 3D 장면 연결 정보가 손상되었습니다.",
};

/** 표시 지점 전용 해석 (live scene): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioCrdtScenePublishError(
  error: { readonly code: StudioCrdtScenePublishErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(SCENE_ERROR_KEYS[error.code], SCENE_ERROR_KO[error.code], error.params);
}

/** 표시 지점 전용 해석 (live scene, 원인 객체 진입점). 해당하지 않으면 null. */
export function resolveStudioCrdtScenePublishErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioCrdtScenePublishError" || typeof code !== "string") return null;
  if (!Object.hasOwn(SCENE_ERROR_KEYS, code)) return null;
  return resolveStudioCrdtScenePublishError({
    code: code as StudioCrdtScenePublishErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

/**
 * 표시 지점 전용 합성 (전이 게시자 catch): 접두 문구도 이 구간의 키로 함께
 * 해석한다. scene·page-bridge 구조화 오류는 코드로 해석하고, 구조화되지 않은
 * 외부 오류는 현행과 같이 원문 메시지를 접두 뒤에 패스스루하며, 오류 객체가
 * 아니면 고정 폴백 문구를 쓴다.
 */
export function resolveStudioCrdtScenePublishNotice(cause: unknown): string {
  const resolved = resolveStudioCrdtScenePublishErrorFromCause(cause)
    ?? resolveStudioCrdtPageBridgeErrorFromCause(cause);
  if (resolved !== null || cause instanceof Error) {
    const prefix = resolveProducerError("studio.producerError.liveScene.publishPrefix", "실시간 장면 동기화: ");
    return prefix + (resolved ?? (cause as Error).message);
  }
  return resolveProducerError(
    "studio.producerError.liveScene.publishFallback",
    "장면 요소와 페이지 순서를 팀 문서에 반영하지 못했습니다.",
  );
}
