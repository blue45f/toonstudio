/**
 * A4 D4 (R15): studio-opfs-recovery-journal 생산자의 구조화 오류 정의 — 기준선
 * 포화(2077줄)라 전용 파일로 추출했다(studio-comments-error.ts 선례). 생산자 본체는
 * 이 파일에서 import하고, 외부 소비자 호환을 위해 생산자 파일이 그대로 재수출한다.
 *
 * 기존 코드 15종은 상위 그룹으로 유지하고(code 필드), 문구 단위 구분은 방출 지점
 * suffix인 subcode 필드가 맡는다. 저널 파일 내부 방출은 {code, subcode, params}만
 * 싣고(message = 거친 코드 문자열), 표시는 집계자 경계
 * (studio-storage-recovery-runtime의 causeMessage 소비 지점)에서 리졸버
 * (status-i18n/studio-producer-error-i18n-opfs-recovery.ts)로만 해석한다.
 * 이 파일 밖의 기존 생성처(pages-history 등)는 종전 시그니처 (code, message, options)를
 * 그대로 쓸 수 있다 — subcode가 없는 오류는 리졸버가 null을 반환해 기존 message
 * 경로가 유지된다. path는 내부 식별자 진단 필드라 표시 params에서 제외한다
 * (설계 r10-d4-trace-3.md §2.9).
 */

export type StudioOpfsRecoveryJournalErrorCode =
  | "ABORTED"
  | "INVALID_ARGUMENT"
  | "OPFS_UNAVAILABLE"
  | "LOCK_UNAVAILABLE"
  | "LEASE_BUSY"
  | "LEASE_LOST"
  | "IMMUTABLE_CONFLICT"
  | "ENTRY_TOO_LARGE"
  | "JOURNAL_LIMIT_EXCEEDED"
  | "COMPACTION_REQUIRED"
  | "QUOTA_EXCEEDED"
  | "STORAGE_FAILED"
  | "CORRUPT_ENTRY"
  | "CORRUPT_MANIFEST"
  | "UNSUPPORTED_VERSION";

export type StudioOpfsRecoveryJournalErrorSubcode =
  | "aborted"
  | "invalidArgumentStorageId"
  | "invalidArgumentEntryId"
  | "invalidArgumentDocumentVersion"
  | "invalidArgumentEngineVersion"
  | "invalidArgumentRange"
  | "journalLimitExceededMetadata"
  | "frameTruncated"
  | "frameMagicInvalid"
  | "unsupportedVersionFrame"
  | "frameKindInvalid"
  | "frameLengthMismatch"
  | "frameEndMarkerMissing"
  | "frameLengthComplementMismatch"
  | "frameCrcMismatch"
  | "frameJsonUnparsable"
  | "corruptEntryLeaseStructure"
  | "unsupportedVersionLease"
  | "corruptEntryLeaseValues"
  | "corruptManifestEntryReferenceStructure"
  | "corruptManifestEntryReferenceValues"
  | "corruptManifestStructure"
  | "unsupportedVersionManifest"
  | "unsupportedVersionManifestIdentity"
  | "corruptManifestValues"
  | "corruptManifestEntryOrder"
  | "corruptManifestTotalsMismatch"
  | "corruptManifestHeadStructure"
  | "unsupportedVersionHead"
  | "corruptManifestHeadValues"
  | "corruptEntryChunkReferenceStructure"
  | "corruptEntryChunkReferenceValues"
  | "corruptEntryDescriptorStructure"
  | "unsupportedVersionDescriptor"
  | "unsupportedVersionDescriptorIdentity"
  | "corruptEntryDescriptorValues"
  | "corruptEntryCheckpointBoundary"
  | "corruptEntryDescriptorPayloadLength"
  | "invalidArgumentByteLengthRequired"
  | "invalidArgumentByteLengthMismatch"
  | "invalidArgumentStreamChunkType"
  | "lockUnavailableRandom"
  | "quotaExceededStorage"
  | "storageFailedStorage"
  | "opfsUnavailableNativeRequired"
  | "lockUnavailableOriginLock"
  | "invalidArgumentRootPathLength"
  | "journalLimitExceededStagingAttempts"
  | "immutableConflictEntryPath"
  | "leaseLostForeignLease"
  | "leaseLostExpiredOrReplaced"
  | "corruptManifestCommittedMissing"
  | "corruptManifestHeadCrcMismatch"
  | "corruptManifestHeadGenerationMismatch"
  | "corruptEntryDescriptorMissing"
  | "corruptEntryDescriptorCrcMismatch"
  | "corruptEntryChunkMissing"
  | "corruptEntryChunkCorrupt"
  | "corruptEntryStoredSizeMismatch"
  | "corruptManifestBothHeadsTorn"
  | "corruptManifestSameGenerationConflict"
  | "corruptManifestRevisionRegressed"
  | "corruptManifestTotalsOrLimits"
  | "leaseBusyOtherTab"
  | "journalLimitExceededEpochSpace"
  | "leaseLostFencingVerification"
  | "quotaExceededReserve"
  | "invalidArgumentRevision"
  | "invalidArgumentCreatedAt"
  | "entryTooLarge"
  | "invalidArgumentStreamExceedsDeclared"
  | "invalidArgumentStreamEndedEarly"
  | "journalLimitExceededGenerationSpace"
  | "leaseLostHigherEpoch"
  | "journalLimitExceededSequenceSpace"
  | "invalidArgumentRevisionDecrease"
  | "invalidArgumentCheckpointCoverage"
  | "compactionRequiredJournalLimit"
  | "invalidArgumentCompactThrough"
  | "compactionRequiredOperationCount"
  | "compactionRequiredCheckpointCount"
  | "journalLimitExceededBytesAfterCompaction"
  | "unsupportedVersionForeignEntry"
  | "corruptEntryPayloadChunkVerification";

export class StudioOpfsRecoveryJournalError extends Error {
  readonly code: StudioOpfsRecoveryJournalErrorCode;
  /** 방출 지점 suffix (A4 D4) — 저널 파일 내부 방출만 보유하고, 표시 문구는 리졸버가 해석한다. */
  readonly subcode: StudioOpfsRecoveryJournalErrorSubcode | null;
  readonly params?: Readonly<Record<string, string>>;
  readonly path: string | null;
  /**
   * 내부 식별자(writer ownerId, epoch, 토큰 …)를 담는 진단 전용 자리.
   *
   * `message` 는 저장 강등 배너처럼 **사용자 화면에 그대로 흘러가는** 문자열이다
   * (`studio-storage-recovery-runtime`의 `causeMessage`). 그래서 사람이 읽을 문장만
   * 남기고, 사람이 읽을 수 없는 식별자는 지우는 대신 이 필드로 옮긴다 — 진단 가치는
   * 로그·버그리포트 쪽에 그대로 두고 청중만 나눈다.
   */
  readonly diagnostics: string | null;
  override readonly cause?: unknown;

  constructor(
    code: StudioOpfsRecoveryJournalErrorCode,
    message: string,
    options: {
      readonly path?: string;
      readonly cause?: unknown;
      readonly diagnostics?: string;
      readonly subcode?: StudioOpfsRecoveryJournalErrorSubcode;
      readonly params?: Readonly<Record<string, string>>;
    } = {},
  ) {
    super(message);
    this.name = "StudioOpfsRecoveryJournalError";
    this.code = code;
    this.subcode = options.subcode ?? null;
    if (options.params !== undefined) this.params = options.params;
    this.path = options.path ?? null;
    this.diagnostics = options.diagnostics ?? null;
    this.cause = options.cause;
  }
}

/**
 * 로그·버그리포트용 한 줄. 사용자 문구 + 코드 + 내부 진단을 한 번에 붙인다.
 * 화면에 쓰지 말 것 — 화면은 `error.message` 만 쓴다.
 */
export function describeStudioOpfsRecoveryJournalError(
  error: StudioOpfsRecoveryJournalError,
): string {
  const parts = [`[${error.code}] ${error.message}`];
  if (error.path) parts.push(`path=${error.path}`);
  if (error.diagnostics) parts.push(error.diagnostics);
  return parts.join(" ");
}
