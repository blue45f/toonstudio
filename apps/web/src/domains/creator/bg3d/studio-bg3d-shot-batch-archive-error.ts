/**
 * A4 D4 조건부 묶음 (R19, 설계 r16 §1.3): 샷 배치 archive 채널 검증 실패 전용 오류.
 *
 * 생산자(buildStudioBg3dShotBatchArchive·validateManifestContext·snapshotPublicRenderPlan 등)는
 * 표시 문구 대신 구조화 코드만 방출하고, 표시는 표시 지점에서만 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-bg3d-shot-batch-archive.ts의 shotBatchArchive 구간).
 * 기존 호출자가 TypeError로 잡던 계약을 지키기 위해 TypeError를 상속하고, 기존 throw가
 * TypeError/RangeError로 갈리던 종류 구분은 errorKind 필드로 보존한다.
 * Error.message는 코드 문자열 자체다(표시 문구가 아니다). 동적 삽입값은 params로만 싣는다
 * (artifactCountOutOfRange의 maxArtifacts, shotCountOverLimit의 maxShots).
 * 워커 경계에서는 프로토콜 v5가 code/params를 causeCode/causeParams로 운반한다
 * (studio-bg3d-shot-batch-worker-protocol.ts).
 */
export type StudioBg3dShotBatchArchiveErrorCode =
  | "pngItemUnsafeFormatOrBudget"
  | "psdArtifactUnsafeFormatOrBudget"
  | "publicPlanUnknownOrMissingFields"
  | "publicPlanUnsafeFormatOrBudget"
  | "publicPlanPassOrderNotCanonical"
  | "publicPlanFrozenShotInvalid"
  | "publicPlanFrozenResolutionMismatch"
  | "publicPlanFileContractInvalid"
  | "publicPlanFileOrderNotCanonical"
  | "publicPlanShotOrderNotCanonical"
  | "manifestContextInvalid"
  | "manifestContextUnknownField"
  | "manifestResumeKeyInvalid"
  | "publicManifestResumeKeyForbidden"
  | "manifestOptionalArtifactRequestContextInvalid"
  | "manifestShotListOverLimit"
  | "manifestShotListInvalid"
  | "manifestRequestedPassesInvalid"
  | "manifestRequestedPassesDuplicated"
  | "manifestResolutionContextInvalid"
  | "manifestPerShotResolutionUnknownField"
  | "manifestMaximumResolutionContextInvalid"
  | "manifestSkippedArtifactsOverLimit"
  | "manifestSkippedArtifactInvalid"
  | "manifestSkippedArtifactDuplicated"
  | "manifestPsdFallbacksOverLimit"
  | "manifestPsdFallbackInvalid"
  | "manifestContactSheetFallbackInvalid"
  | "artifactCountOutOfRange"
  | "pngItemInvalid"
  | "psdCountOverLimit"
  | "psdArtifactInvalid"
  | "contactSheetCountOverLimit"
  | "contactSheetArtifactInvalid"
  | "publicPlanRenderDigestMismatch"
  | "completedPngNotInRequestedPasses"
  | "completedArtifactNotInRequestedShots"
  | "shotNameMismatchAcrossArtifacts"
  | "completedArtifactMismatchPublicPlan"
  | "shotCountOverLimit"
  | "duplicateShotPassArtifact"
  | "sameShotPassShapeMismatch"
  | "passRequestedHeightMismatchManifestResolution"
  | "imageTotalBytesOverBudget"
  | "psdArtifactNotInRequestedShots"
  | "shotNameMismatchAcrossPsdArtifacts"
  | "psdPngResolutionMismatch"
  | "duplicateLayeredPsd"
  | "artifactTotalBytesOverBudget"
  | "contactSheetTotalBytesOverBudget"
  | "contactSheetMissingRequestedShots"
  | "completedContactSheetConflictsFallback"
  | "skippedArtifactNotInRequestedShots"
  | "shotNameMismatchAcrossSkippedArtifacts"
  | "completedAndSkippedArtifactConflict"
  | "skippedArtifactNotInRequestedPasses"
  | "psdFallbackMismatchRequestedShots"
  | "completedPsdConflictsFallback"
  | "requestedShotPsdNotAccounted"
  | "unrequestedPsdArtifactOrFallbackIncluded"
  | "requestedContactSheetNotAccounted"
  | "unrequestedContactSheetArtifactOrFallbackIncluded"
  | "requestedShotPassNotAccounted"
  | "artifactTotalOverLimit";

/** 기존 throw의 오류 종류 보존: "type"=구 TypeError, "range"=구 RangeError. */
export type StudioBg3dShotBatchArchiveErrorKind = "type" | "range";

/** 프로토콜 v5의 causeCode 열거 검증이 쓰는 허용 집합 — 코드 union과 전수 일치해야 한다. */
export const STUDIO_BG3D_SHOT_BATCH_ARCHIVE_ERROR_CODES: ReadonlySet<string> = new Set([
  "pngItemUnsafeFormatOrBudget",
  "psdArtifactUnsafeFormatOrBudget",
  "publicPlanUnknownOrMissingFields",
  "publicPlanUnsafeFormatOrBudget",
  "publicPlanPassOrderNotCanonical",
  "publicPlanFrozenShotInvalid",
  "publicPlanFrozenResolutionMismatch",
  "publicPlanFileContractInvalid",
  "publicPlanFileOrderNotCanonical",
  "publicPlanShotOrderNotCanonical",
  "manifestContextInvalid",
  "manifestContextUnknownField",
  "manifestResumeKeyInvalid",
  "publicManifestResumeKeyForbidden",
  "manifestOptionalArtifactRequestContextInvalid",
  "manifestShotListOverLimit",
  "manifestShotListInvalid",
  "manifestRequestedPassesInvalid",
  "manifestRequestedPassesDuplicated",
  "manifestResolutionContextInvalid",
  "manifestPerShotResolutionUnknownField",
  "manifestMaximumResolutionContextInvalid",
  "manifestSkippedArtifactsOverLimit",
  "manifestSkippedArtifactInvalid",
  "manifestSkippedArtifactDuplicated",
  "manifestPsdFallbacksOverLimit",
  "manifestPsdFallbackInvalid",
  "manifestContactSheetFallbackInvalid",
  "artifactCountOutOfRange",
  "pngItemInvalid",
  "psdCountOverLimit",
  "psdArtifactInvalid",
  "contactSheetCountOverLimit",
  "contactSheetArtifactInvalid",
  "publicPlanRenderDigestMismatch",
  "completedPngNotInRequestedPasses",
  "completedArtifactNotInRequestedShots",
  "shotNameMismatchAcrossArtifacts",
  "completedArtifactMismatchPublicPlan",
  "shotCountOverLimit",
  "duplicateShotPassArtifact",
  "sameShotPassShapeMismatch",
  "passRequestedHeightMismatchManifestResolution",
  "imageTotalBytesOverBudget",
  "psdArtifactNotInRequestedShots",
  "shotNameMismatchAcrossPsdArtifacts",
  "psdPngResolutionMismatch",
  "duplicateLayeredPsd",
  "artifactTotalBytesOverBudget",
  "contactSheetTotalBytesOverBudget",
  "contactSheetMissingRequestedShots",
  "completedContactSheetConflictsFallback",
  "skippedArtifactNotInRequestedShots",
  "shotNameMismatchAcrossSkippedArtifacts",
  "completedAndSkippedArtifactConflict",
  "skippedArtifactNotInRequestedPasses",
  "psdFallbackMismatchRequestedShots",
  "completedPsdConflictsFallback",
  "requestedShotPsdNotAccounted",
  "unrequestedPsdArtifactOrFallbackIncluded",
  "requestedContactSheetNotAccounted",
  "unrequestedContactSheetArtifactOrFallbackIncluded",
  "requestedShotPassNotAccounted",
  "artifactTotalOverLimit",
]);

export function isStudioBg3dShotBatchArchiveErrorCode(
  value: unknown,
): value is StudioBg3dShotBatchArchiveErrorCode {
  return typeof value === "string" && STUDIO_BG3D_SHOT_BATCH_ARCHIVE_ERROR_CODES.has(value);
}

export class StudioBg3dShotBatchArchiveError extends TypeError {
  readonly code: StudioBg3dShotBatchArchiveErrorCode;
  readonly errorKind: StudioBg3dShotBatchArchiveErrorKind;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioBg3dShotBatchArchiveErrorCode,
    errorKind: StudioBg3dShotBatchArchiveErrorKind,
    params?: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = "StudioBg3dShotBatchArchiveError";
    this.code = code;
    this.errorKind = errorKind;
    if (params !== undefined) this.params = params;
  }
}
