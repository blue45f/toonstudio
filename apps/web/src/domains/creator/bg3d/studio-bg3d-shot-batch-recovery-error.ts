/**
 * A4 D4 (R12): 컷 배치 복구 실패 전용 오류와 메시지 단위 서브코드.
 *
 * 생산자는 표시 문구 대신 구조화 코드만 방출하고, 표시는 표시 지점에서만
 * status-i18n/studio-producer-error-i18n-shot-batch-recovery.ts의 리졸버로 해석한다.
 * 기존 code 7종은 상위 그룹으로 유지하고(code 필드), 문구 단위 구분은 subcode 필드가 맡는다
 * — studio-bg3d-shot-batch-plan-error.ts의 {code, subcode} 관례와 동일하다.
 * 이 파일을 복구 스토어 본체와 분리한 이유: 표시 지점(export-run)이 스토어 전체를
 * 런타임 import하지 않고 이 경량 클래스만으로 코드를 운반하기 위해서다.
 * Error.message는 서브코드 문자열 자체다(표시 문구가 아니다).
 */

export type StudioBg3dShotBatchRecoveryErrorCode =
  | "busy"
  | "lease-lost"
  | "cas-conflict"
  | "corrupt"
  | "budget-exceeded"
  | "access-denied"
  | "storage-unavailable";

export type StudioBg3dShotBatchRecoveryErrorSubcode =
  | "storageUnavailable.randomUnavailable"
  | "storageUnavailable.indexedDbOpenFailed"
  | "storageUnavailable.upgradeBlocked"
  | "storageUnavailable.opfsUnavailable"
  | "storageUnavailable.expiredCleanupFailed"
  | "storageUnavailable.storeReadFailed"
  | "storageUnavailable.indexedDbGone"
  | "storageUnavailable.transactionFailed"
  | "storageUnavailable.leaseRenewFailed"
  | "storageUnavailable.indexedDbMissingForDiscard"
  | "storageUnavailable.sqliteCatalogReadFailed"
  | "storageUnavailable.sqliteCatalogCommitFailed"
  | "storageUnavailable.webLocksUnavailable"
  | "budgetExceeded.artifactMetadata"
  | "budgetExceeded.jobMetadata"
  | "budgetExceeded.jobCountOrigin"
  | "budgetExceeded.memoryJobCountOrigin"
  | "budgetExceeded.memoryOrigin"
  | "budgetExceeded.artifactJobStorage"
  | "budgetExceeded.memoryExceeded"
  | "accessDenied.receiptExpired"
  | "accessDenied.scopeDenied"
  | "accessDenied.receiptReused"
  | "leaseLost.takenOver"
  | "leaseLost.memoryMissing"
  | "leaseLost.memoryTakenOver"
  | "leaseLost.sessionReleased"
  | "leaseLost.renewFailed"
  | "leaseLost.sqliteMissing"
  | "leaseLost.memoryRenewFailed"
  | "leaseLost.sqliteRenewFailed"
  | "leaseLost.sqliteJobMissingOrExpired"
  | "busy.otherTab"
  | "busy.sameTabEditor"
  | "busy.memoryOtherEditor"
  | "casConflict.stateChanged"
  | "casConflict.memoryStateChanged"
  | "casConflict.startTransition"
  | "casConflict.staleCommit"
  | "casConflict.completeTransition"
  | "casConflict.fenceChanged"
  | "casConflict.failTransition"
  | "casConflict.downloadGate"
  | "corrupt.artifactList"
  | "corrupt.artifactRecord"
  | "corrupt.artifactOwnership"
  | "corrupt.artifactMetadataLedger"
  | "corrupt.artifactIntegrityFailed"
  | "corrupt.artifactUsageLedger"
  | "corrupt.completedShotArtifactMismatch"
  | "corrupt.catalogOversized"
  | "corrupt.catalogJson"
  | "corrupt.catalogFields"
  | "corrupt.catalogInvalid"
  | "corrupt.catalogDuplicateJobKey"
  | "corrupt.catalogLedgerOrSerialization"
  | "corrupt.byteLedgerChanged"
  | "corrupt.casAddressMismatch"
  | "corrupt.pngReceiptMissing"
  | "corrupt.psdReceiptMissing"
  | "corrupt.casEnvelopeFailed"
  | "corrupt.casReferenceMismatch"
  | "corrupt.casVerificationFailed"
  | "corrupt.casBytesMissing"
  | "corrupt.storedPngReceiptMissing"
  | "corrupt.storedPsdReceiptMissing"
  | "corrupt.expiredCleanupUnsafe"
  | "corrupt.jobArtifactMissing"
  | "corrupt.artifactJobUsageMismatch"
  | "corrupt.usageOriginBudgetExceeded"
  | "corrupt.jobCorrupt"
  | "corrupt.sourceSnapshotMismatch"
  | "corrupt.leaseCorrupt"
  | "corrupt.storageUsageLedger"
  | "corrupt.memoryJobCorrupt"
  | "corrupt.planVerificationFailed"
  | "corrupt.planDigestCorrupt"
  | "corrupt.storeCorrupt"
  | "corrupt.duplicateArtifact"
  | "corrupt.discardJobCorrupt"
  | "corrupt.usageLedgerTooSmallForDiscard"
  | "corrupt.newArtifactMissingInMemory"
  | "corrupt.sqliteEntryCreateFailed"
  | "corrupt.sqliteJobMismatch"
  | "corrupt.sqliteAcquireJobMissing"
  | "corrupt.sqliteJobPlanMismatch";

export class StudioBg3dShotBatchRecoveryError extends Error {
  readonly code: StudioBg3dShotBatchRecoveryErrorCode;
  readonly subcode: StudioBg3dShotBatchRecoveryErrorSubcode;

  constructor(
    code: StudioBg3dShotBatchRecoveryErrorCode,
    subcode: StudioBg3dShotBatchRecoveryErrorSubcode,
    options?: ErrorOptions,
  ) {
    super(subcode, options);
    this.name = "StudioBg3dShotBatchRecoveryError";
    this.code = code;
    this.subcode = subcode;
  }
}
