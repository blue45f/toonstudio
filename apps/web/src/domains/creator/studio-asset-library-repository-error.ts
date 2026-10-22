/**
 * A4 D4 (R15): studio-asset-library-sqlite-opfs-repository 생산자의 구조화 오류 정의 —
 * 기준선 포화(983줄)라 전용 파일로 추출했다(studio-comments-error.ts 선례).
 * 생산자는 표시 문구 대신 {code, subcode, params}만 방출하고(message = 거친 코드 문자열),
 * 표시는 표시 지점에서 리졸버(status-i18n/studio-producer-error-i18n-asset-library.ts)로만
 * 해석한다. 기존 거친 코드 5종은 상위 그룹으로 유지하고, 문구 단위 구분은 subcode가 맡는다.
 * 필드 라벨·작업 이름은 파일 내부 고정 집합이라 라벨 코드로 방출하고, 표시 라벨은
 * 리졸버의 라벨 표가 소유한다. quotaExceeded/operationFailed의 detail은 하위 OPFS/SQLite
 * 원문 패스스루라 로케일 대상이 아닌 params로 명시한다(설계 r10-d4-trace-3.md §2.1).
 */

export type StudioAssetLibraryRepositoryErrorCode =
  | "invalid"
  | "corrupt"
  | "unavailable"
  | "quota-exceeded"
  | "not-found";

export type StudioAssetLibraryRepositoryErrorSubcode =
  | "quotaExceeded"
  | "operationFailed"
  | "fieldMustBeString"
  | "fieldLengthOrChars"
  | "fieldMustBeStringOrNull"
  | "fieldLength"
  | "rightsInvalid"
  | "rightsUnknownField"
  | "rightsSourceKind"
  | "rightsUrlHttps"
  | "rightsUrlInvalid"
  | "attributionType"
  | "rightsConfirmedType"
  | "entryNotObject"
  | "entryFields"
  | "entryIdFormat"
  | "entryContentHash"
  | "entryByteSize"
  | "entryMime"
  | "entrySize"
  | "entryCreatedAt"
  | "tooManyAssets"
  | "duplicateAssetId"
  | "totalBytesExceeded"
  | "manifestTooLarge"
  | "manifestSizeLimit"
  | "manifestJsonCorrupt"
  | "manifestNotObject"
  | "manifestVersionOrFields"
  | "manifestCanonicalMismatch"
  | "manifestCorrupt"
  | "dataUrlTooLarge"
  | "casVerificationFailed"
  | "casBlobMissing"
  | "casLedgerMismatch"
  | "searchTooLong"
  | "binaryStoreOpfsUnavailable"
  | "casIndexReadFailed"
  | "casManifestLedgerMismatch"
  | "commitReconcileFailed"
  | "commitRollbackFailed"
  | "manifestMismatch"
  | "webLocksUnavailable"
  | "bytesDecodeFailed"
  | "bytesOutOfRange"
  | "generatedIdFormat"
  | "generatedIdConflict"
  | "contentHashMismatch"
  | "casReceiptMismatch"
  | "committedEntryMissing"
  | "pageLimit"
  | "cursorInvalid"
  | "deleteIdInvalid"
  | "renameIdInvalid"
  | "notFound";

/** 필드 라벨 코드 — 표시 라벨 자체는 리졸버의 라벨 표가 소유한다. */
export type StudioAssetLibraryFieldLabelCode =
  | "rightsSourceId"
  | "rightsLicenseId"
  | "rightsLicenseLabel"
  | "rightsLicenseUrl"
  | "rightsAttributionText"
  | "assetName"
  | "assetKind";

/** 저장 작업 코드 — quotaExceeded/operationFailed의 {operation} 자리. */
export type StudioAssetLibraryOperationCode =
  | "open"
  | "manifestRead"
  | "blobSave"
  | "manifestCommit";

export class StudioAssetLibraryRepositoryError extends Error {
  readonly code: StudioAssetLibraryRepositoryErrorCode;
  readonly subcode: StudioAssetLibraryRepositoryErrorSubcode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioAssetLibraryRepositoryErrorCode,
    subcode: StudioAssetLibraryRepositoryErrorSubcode,
    params?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "StudioAssetLibraryRepositoryError";
    this.code = code;
    this.subcode = subcode;
    if (params !== undefined) this.params = params;
  }
}

/**
 * manifest 커밋 결과 재확인 실패 전용 AggregateError — 기존 방출이 AggregateError였으므로
 * 타입은 그대로 유지하고 {code, subcode}만 실어 보낸다(message = subcode 문자열).
 * errors/cause 구성은 이관 전과 동일하다.
 */
export class StudioAssetLibraryCommitAggregateError extends AggregateError {
  readonly code = "unavailable" as const;
  readonly subcode: StudioAssetLibraryRepositoryErrorSubcode;

  constructor(
    subcode: StudioAssetLibraryRepositoryErrorSubcode,
    errors: readonly unknown[],
    cause?: unknown,
  ) {
    super([...errors], subcode, { cause });
    this.name = "StudioAssetLibraryCommitAggregateError";
    this.subcode = subcode;
  }
}
