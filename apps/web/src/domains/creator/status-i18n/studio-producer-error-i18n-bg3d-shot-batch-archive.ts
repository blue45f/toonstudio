/**
 * 생산자 구조화 에러 해석 모듈 — shotBatchArchive 구간: 샷 배치 archive 채널 검증 코드 64종
 * (A4 D4 조건부 묶음, R19 설계 r16 §1.3).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자(studio-bg3d-shot-batch.ts의 archive 계열 throw 67곳, 고유 문구 64종)는
 * StudioBg3dShotBatchArchiveError {code, errorKind, params}만 방출하고, 표시는 이 모듈의
 * 리졸버로만 해석한다. 워커 경계에서는 프로토콜 v5가 code/params를 causeCode/causeParams로
 * 운반하고, 클라이언트 WorkerError가 그 필드를 그대로 실어 표시 지점까지 전달한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고(동적 삽입 2종만 {param}으로 치환),
 * en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioBg3dShotBatchArchiveErrorCode } from "../bg3d/studio-bg3d-shot-batch-archive-error";

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
  "studio.producerError.shotBatchArchive.pngItemUnsafeFormatOrBudget": "컷 일괄 렌더 PNG 항목이 안전한 형식 또는 예산을 벗어났습니다.",
  "studio.producerError.shotBatchArchive.psdArtifactUnsafeFormatOrBudget": "컷 일괄 렌더 PSD artifact가 안전한 형식 또는 예산을 벗어났습니다.",
  "studio.producerError.shotBatchArchive.publicPlanUnknownOrMissingFields": "공개 컷 렌더 계획에 알 수 없거나 누락된 필드가 있습니다.",
  "studio.producerError.shotBatchArchive.publicPlanUnsafeFormatOrBudget": "공개 컷 렌더 계획이 안전한 형식 또는 예산을 벗어났습니다.",
  "studio.producerError.shotBatchArchive.publicPlanPassOrderNotCanonical": "공개 컷 렌더 계획의 pass 순서가 canonical 순서가 아닙니다.",
  "studio.producerError.shotBatchArchive.publicPlanFrozenShotInvalid": "공개 컷 렌더 계획의 frozen shot이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.publicPlanFrozenResolutionMismatch": "공개 컷 렌더 계획의 frozen 해상도가 capture profile과 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.publicPlanFileContractInvalid": "공개 컷 렌더 계획의 file contract가 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.publicPlanFileOrderNotCanonical": "공개 컷 렌더 계획의 file 순서가 canonical 순서가 아닙니다.",
  "studio.producerError.shotBatchArchive.publicPlanShotOrderNotCanonical": "공개 컷 렌더 계획의 shot 순서가 canonical 순서가 아닙니다.",
  "studio.producerError.shotBatchArchive.manifestContextInvalid": "컷 일괄 렌더 manifest 문맥이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestContextUnknownField": "컷 일괄 렌더 manifest 문맥에 알 수 없는 필드가 있습니다.",
  "studio.producerError.shotBatchArchive.manifestResumeKeyInvalid": "컷 일괄 렌더 resume key가 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.publicManifestResumeKeyForbidden": "공개 컷 렌더 manifest에는 로컬 resume key를 포함할 수 없습니다.",
  "studio.producerError.shotBatchArchive.manifestOptionalArtifactRequestContextInvalid": "컷 일괄 렌더 선택 artifact 요청 문맥이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestShotListOverLimit": "컷 일괄 렌더 manifest 컷 목록이 안전 한도를 벗어났습니다.",
  "studio.producerError.shotBatchArchive.manifestShotListInvalid": "컷 일괄 렌더 manifest 컷 목록이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestRequestedPassesInvalid": "컷 일괄 렌더 요청 패스가 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestRequestedPassesDuplicated": "컷 일괄 렌더 요청 패스가 중복되었습니다.",
  "studio.producerError.shotBatchArchive.manifestResolutionContextInvalid": "컷 일괄 렌더 해상도 문맥이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestPerShotResolutionUnknownField": "컷 일괄 렌더 컷별 최대 해상도 문맥에 알 수 없는 필드가 있습니다.",
  "studio.producerError.shotBatchArchive.manifestMaximumResolutionContextInvalid": "컷 일괄 렌더 최대 해상도 문맥이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestSkippedArtifactsOverLimit": "컷 일괄 렌더 생략 artifact가 안전 한도를 벗어났습니다.",
  "studio.producerError.shotBatchArchive.manifestSkippedArtifactInvalid": "컷 일괄 렌더 생략 artifact가 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestSkippedArtifactDuplicated": "컷 일괄 렌더 생략 artifact가 중복되었습니다.",
  "studio.producerError.shotBatchArchive.manifestPsdFallbacksOverLimit": "컷 일괄 렌더 PSD fallback 목록이 안전 한도를 벗어났습니다.",
  "studio.producerError.shotBatchArchive.manifestPsdFallbackInvalid": "컷 일괄 렌더 PSD fallback이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.manifestContactSheetFallbackInvalid": "컷 일괄 렌더 콘택트 시트 fallback이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.artifactCountOutOfRange": "컷 일괄 렌더는 1~{maxArtifacts}개 artifact만 포함할 수 있습니다.",
  "studio.producerError.shotBatchArchive.pngItemInvalid": "컷 일괄 렌더 PNG 항목이 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.psdCountOverLimit": "컷 일괄 렌더 PSD 수가 안전 한도를 벗어났습니다.",
  "studio.producerError.shotBatchArchive.psdArtifactInvalid": "컷 일괄 렌더 PSD artifact가 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.contactSheetCountOverLimit": "컷 일괄 렌더 콘택트 시트 수가 안전 한도를 벗어났습니다.",
  "studio.producerError.shotBatchArchive.contactSheetArtifactInvalid": "컷 일괄 렌더 콘택트 시트 artifact가 올바르지 않습니다.",
  "studio.producerError.shotBatchArchive.publicPlanRenderDigestMismatch": "공개 컷 렌더 계획의 render digest가 필드와 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.completedPngNotInRequestedPasses": "완료 PNG artifact가 manifest 요청 패스에 없습니다.",
  "studio.producerError.shotBatchArchive.completedArtifactNotInRequestedShots": "완료 artifact가 요청 컷 목록에 없습니다.",
  "studio.producerError.shotBatchArchive.shotNameMismatchAcrossArtifacts": "같은 컷 ID의 이름이 artifact 사이에서 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.completedArtifactMismatchPublicPlan": "완료 artifact가 공개 frozen 렌더 계획과 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.shotCountOverLimit": "컷 일괄 렌더는 최대 {maxShots}개 컷만 포함할 수 있습니다.",
  "studio.producerError.shotBatchArchive.duplicateShotPassArtifact": "컷 일괄 렌더에 중복 shot/pass artifact가 있습니다.",
  "studio.producerError.shotBatchArchive.sameShotPassShapeMismatch": "같은 컷의 pass artifact 해상도 또는 축소 문맥이 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.passRequestedHeightMismatchManifestResolution": "컷 pass artifact의 요청 높이가 manifest 최대 해상도 문맥과 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.imageTotalBytesOverBudget": "컷 일괄 렌더 이미지 합계가 브라우저 메모리 예산을 벗어났습니다.",
  "studio.producerError.shotBatchArchive.psdArtifactNotInRequestedShots": "PSD artifact가 요청 컷 목록에 없습니다.",
  "studio.producerError.shotBatchArchive.shotNameMismatchAcrossPsdArtifacts": "같은 컷 ID의 이름이 PSD artifact와 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.psdPngResolutionMismatch": "같은 컷의 PSD와 PNG pass 해상도가 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.duplicateLayeredPsd": "컷 일괄 렌더에 중복 layered PSD가 있습니다.",
  "studio.producerError.shotBatchArchive.artifactTotalBytesOverBudget": "컷 일괄 렌더 artifact 합계가 브라우저 메모리 예산을 벗어났습니다.",
  "studio.producerError.shotBatchArchive.contactSheetTotalBytesOverBudget": "컷 일괄 렌더 콘택트 시트 합계가 브라우저 메모리 예산을 벗어났습니다.",
  "studio.producerError.shotBatchArchive.contactSheetMissingRequestedShots": "컷 일괄 렌더 콘택트 시트가 요청한 모든 컷을 포함하지 않습니다.",
  "studio.producerError.shotBatchArchive.completedContactSheetConflictsFallback": "완료 콘택트 시트와 fallback이 충돌합니다.",
  "studio.producerError.shotBatchArchive.skippedArtifactNotInRequestedShots": "생략 artifact가 요청 컷 목록에 없습니다.",
  "studio.producerError.shotBatchArchive.shotNameMismatchAcrossSkippedArtifacts": "같은 컷 ID의 이름이 생략 artifact와 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.completedAndSkippedArtifactConflict": "완료 artifact와 생략 artifact가 충돌합니다.",
  "studio.producerError.shotBatchArchive.skippedArtifactNotInRequestedPasses": "생략 artifact가 manifest 요청 패스에 없습니다.",
  "studio.producerError.shotBatchArchive.psdFallbackMismatchRequestedShots": "PSD fallback이 요청 컷 목록과 일치하지 않습니다.",
  "studio.producerError.shotBatchArchive.completedPsdConflictsFallback": "완료 PSD와 PSD fallback이 충돌합니다.",
  "studio.producerError.shotBatchArchive.requestedShotPsdNotAccounted": "요청한 컷 PSD가 완료 또는 fallback으로 정확히 설명되지 않았습니다.",
  "studio.producerError.shotBatchArchive.unrequestedPsdArtifactOrFallbackIncluded": "요청하지 않은 PSD artifact 또는 fallback이 포함되었습니다.",
  "studio.producerError.shotBatchArchive.requestedContactSheetNotAccounted": "요청한 콘택트 시트가 완료 또는 fallback으로 설명되지 않았습니다.",
  "studio.producerError.shotBatchArchive.unrequestedContactSheetArtifactOrFallbackIncluded": "요청하지 않은 콘택트 시트 artifact 또는 fallback이 포함되었습니다.",
  "studio.producerError.shotBatchArchive.requestedShotPassNotAccounted": "요청한 shot/pass가 완료 또는 생략 artifact로 정확히 설명되지 않았습니다.",
  "studio.producerError.shotBatchArchive.artifactTotalOverLimit": "컷 일괄 렌더 artifact 합계가 안전 한도를 벗어났습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.shotBatchArchive.pngItemUnsafeFormatOrBudget": "The shot batch PNG entry is outside the safe format or budget.",
  "studio.producerError.shotBatchArchive.psdArtifactUnsafeFormatOrBudget": "The shot batch PSD artifact is outside the safe format or budget.",
  "studio.producerError.shotBatchArchive.publicPlanUnknownOrMissingFields": "The public shot render plan has unknown or missing fields.",
  "studio.producerError.shotBatchArchive.publicPlanUnsafeFormatOrBudget": "The public shot render plan is outside the safe format or budget.",
  "studio.producerError.shotBatchArchive.publicPlanPassOrderNotCanonical": "The pass order of the public shot render plan is not the canonical order.",
  "studio.producerError.shotBatchArchive.publicPlanFrozenShotInvalid": "A frozen shot in the public shot render plan is invalid.",
  "studio.producerError.shotBatchArchive.publicPlanFrozenResolutionMismatch": "A frozen resolution in the public shot render plan does not match the capture profile.",
  "studio.producerError.shotBatchArchive.publicPlanFileContractInvalid": "The file contract of the public shot render plan is invalid.",
  "studio.producerError.shotBatchArchive.publicPlanFileOrderNotCanonical": "The file order of the public shot render plan is not the canonical order.",
  "studio.producerError.shotBatchArchive.publicPlanShotOrderNotCanonical": "The shot order of the public shot render plan is not the canonical order.",
  "studio.producerError.shotBatchArchive.manifestContextInvalid": "The shot batch manifest context is invalid.",
  "studio.producerError.shotBatchArchive.manifestContextUnknownField": "The shot batch manifest context has an unknown field.",
  "studio.producerError.shotBatchArchive.manifestResumeKeyInvalid": "The shot batch resume key is invalid.",
  "studio.producerError.shotBatchArchive.publicManifestResumeKeyForbidden": "A public shot render manifest cannot include a local resume key.",
  "studio.producerError.shotBatchArchive.manifestOptionalArtifactRequestContextInvalid": "The shot batch optional artifact request context is invalid.",
  "studio.producerError.shotBatchArchive.manifestShotListOverLimit": "The shot batch manifest shot list exceeds the safe limit.",
  "studio.producerError.shotBatchArchive.manifestShotListInvalid": "The shot batch manifest shot list is invalid.",
  "studio.producerError.shotBatchArchive.manifestRequestedPassesInvalid": "The shot batch requested passes are invalid.",
  "studio.producerError.shotBatchArchive.manifestRequestedPassesDuplicated": "The shot batch requested passes are duplicated.",
  "studio.producerError.shotBatchArchive.manifestResolutionContextInvalid": "The shot batch resolution context is invalid.",
  "studio.producerError.shotBatchArchive.manifestPerShotResolutionUnknownField": "The shot batch per-shot maximum resolution context has an unknown field.",
  "studio.producerError.shotBatchArchive.manifestMaximumResolutionContextInvalid": "The shot batch maximum resolution context is invalid.",
  "studio.producerError.shotBatchArchive.manifestSkippedArtifactsOverLimit": "The shot batch skipped artifacts exceed the safe limit.",
  "studio.producerError.shotBatchArchive.manifestSkippedArtifactInvalid": "A shot batch skipped artifact is invalid.",
  "studio.producerError.shotBatchArchive.manifestSkippedArtifactDuplicated": "A shot batch skipped artifact is duplicated.",
  "studio.producerError.shotBatchArchive.manifestPsdFallbacksOverLimit": "The shot batch PSD fallback list exceeds the safe limit.",
  "studio.producerError.shotBatchArchive.manifestPsdFallbackInvalid": "A shot batch PSD fallback is invalid.",
  "studio.producerError.shotBatchArchive.manifestContactSheetFallbackInvalid": "The shot batch contact sheet fallback is invalid.",
  "studio.producerError.shotBatchArchive.artifactCountOutOfRange": "A shot batch archive can contain only 1 to {maxArtifacts} artifacts.",
  "studio.producerError.shotBatchArchive.pngItemInvalid": "A shot batch PNG entry is invalid.",
  "studio.producerError.shotBatchArchive.psdCountOverLimit": "The shot batch PSD count exceeds the safe limit.",
  "studio.producerError.shotBatchArchive.psdArtifactInvalid": "A shot batch PSD artifact is invalid.",
  "studio.producerError.shotBatchArchive.contactSheetCountOverLimit": "The shot batch contact sheet count exceeds the safe limit.",
  "studio.producerError.shotBatchArchive.contactSheetArtifactInvalid": "A shot batch contact sheet artifact is invalid.",
  "studio.producerError.shotBatchArchive.publicPlanRenderDigestMismatch": "The render digest of the public shot render plan does not match its fields.",
  "studio.producerError.shotBatchArchive.completedPngNotInRequestedPasses": "A completed PNG artifact is not among the manifest requested passes.",
  "studio.producerError.shotBatchArchive.completedArtifactNotInRequestedShots": "A completed artifact is not in the requested shot list.",
  "studio.producerError.shotBatchArchive.shotNameMismatchAcrossArtifacts": "The name for the same shot ID does not match across artifacts.",
  "studio.producerError.shotBatchArchive.completedArtifactMismatchPublicPlan": "A completed artifact does not match the public frozen render plan.",
  "studio.producerError.shotBatchArchive.shotCountOverLimit": "A shot batch can contain at most {maxShots} shots.",
  "studio.producerError.shotBatchArchive.duplicateShotPassArtifact": "The shot batch contains a duplicate shot/pass artifact.",
  "studio.producerError.shotBatchArchive.sameShotPassShapeMismatch": "The pass artifacts of the same shot do not match in resolution or reduction context.",
  "studio.producerError.shotBatchArchive.passRequestedHeightMismatchManifestResolution": "The requested height of a shot pass artifact does not match the manifest maximum resolution context.",
  "studio.producerError.shotBatchArchive.imageTotalBytesOverBudget": "The shot batch image total exceeds the browser memory budget.",
  "studio.producerError.shotBatchArchive.psdArtifactNotInRequestedShots": "A PSD artifact is not in the requested shot list.",
  "studio.producerError.shotBatchArchive.shotNameMismatchAcrossPsdArtifacts": "The name for the same shot ID does not match the PSD artifact.",
  "studio.producerError.shotBatchArchive.psdPngResolutionMismatch": "The PSD and PNG pass resolutions of the same shot do not match.",
  "studio.producerError.shotBatchArchive.duplicateLayeredPsd": "The shot batch contains a duplicate layered PSD.",
  "studio.producerError.shotBatchArchive.artifactTotalBytesOverBudget": "The shot batch artifact total exceeds the browser memory budget.",
  "studio.producerError.shotBatchArchive.contactSheetTotalBytesOverBudget": "The shot batch contact sheet total exceeds the browser memory budget.",
  "studio.producerError.shotBatchArchive.contactSheetMissingRequestedShots": "The shot batch contact sheet does not include all requested shots.",
  "studio.producerError.shotBatchArchive.completedContactSheetConflictsFallback": "A completed contact sheet conflicts with the fallback.",
  "studio.producerError.shotBatchArchive.skippedArtifactNotInRequestedShots": "A skipped artifact is not in the requested shot list.",
  "studio.producerError.shotBatchArchive.shotNameMismatchAcrossSkippedArtifacts": "The name for the same shot ID does not match the skipped artifact.",
  "studio.producerError.shotBatchArchive.completedAndSkippedArtifactConflict": "A completed artifact conflicts with a skipped artifact.",
  "studio.producerError.shotBatchArchive.skippedArtifactNotInRequestedPasses": "A skipped artifact is not among the manifest requested passes.",
  "studio.producerError.shotBatchArchive.psdFallbackMismatchRequestedShots": "A PSD fallback does not match the requested shot list.",
  "studio.producerError.shotBatchArchive.completedPsdConflictsFallback": "A completed PSD conflicts with the PSD fallback.",
  "studio.producerError.shotBatchArchive.requestedShotPsdNotAccounted": "A requested shot PSD is not accounted for exactly as completed or fallback.",
  "studio.producerError.shotBatchArchive.unrequestedPsdArtifactOrFallbackIncluded": "An unrequested PSD artifact or fallback is included.",
  "studio.producerError.shotBatchArchive.requestedContactSheetNotAccounted": "A requested contact sheet is not accounted for as completed or fallback.",
  "studio.producerError.shotBatchArchive.unrequestedContactSheetArtifactOrFallbackIncluded": "An unrequested contact sheet artifact or fallback is included.",
  "studio.producerError.shotBatchArchive.requestedShotPassNotAccounted": "A requested shot/pass is not accounted for exactly as a completed or skipped artifact.",
  "studio.producerError.shotBatchArchive.artifactTotalOverLimit": "The shot batch artifact total exceeds the safe limit.",
});

const SHOT_BATCH_ARCHIVE_ERROR_KEYS: Readonly<Record<StudioBg3dShotBatchArchiveErrorCode, string>> = {
  pngItemUnsafeFormatOrBudget: "studio.producerError.shotBatchArchive.pngItemUnsafeFormatOrBudget",
  psdArtifactUnsafeFormatOrBudget: "studio.producerError.shotBatchArchive.psdArtifactUnsafeFormatOrBudget",
  publicPlanUnknownOrMissingFields: "studio.producerError.shotBatchArchive.publicPlanUnknownOrMissingFields",
  publicPlanUnsafeFormatOrBudget: "studio.producerError.shotBatchArchive.publicPlanUnsafeFormatOrBudget",
  publicPlanPassOrderNotCanonical: "studio.producerError.shotBatchArchive.publicPlanPassOrderNotCanonical",
  publicPlanFrozenShotInvalid: "studio.producerError.shotBatchArchive.publicPlanFrozenShotInvalid",
  publicPlanFrozenResolutionMismatch: "studio.producerError.shotBatchArchive.publicPlanFrozenResolutionMismatch",
  publicPlanFileContractInvalid: "studio.producerError.shotBatchArchive.publicPlanFileContractInvalid",
  publicPlanFileOrderNotCanonical: "studio.producerError.shotBatchArchive.publicPlanFileOrderNotCanonical",
  publicPlanShotOrderNotCanonical: "studio.producerError.shotBatchArchive.publicPlanShotOrderNotCanonical",
  manifestContextInvalid: "studio.producerError.shotBatchArchive.manifestContextInvalid",
  manifestContextUnknownField: "studio.producerError.shotBatchArchive.manifestContextUnknownField",
  manifestResumeKeyInvalid: "studio.producerError.shotBatchArchive.manifestResumeKeyInvalid",
  publicManifestResumeKeyForbidden: "studio.producerError.shotBatchArchive.publicManifestResumeKeyForbidden",
  manifestOptionalArtifactRequestContextInvalid: "studio.producerError.shotBatchArchive.manifestOptionalArtifactRequestContextInvalid",
  manifestShotListOverLimit: "studio.producerError.shotBatchArchive.manifestShotListOverLimit",
  manifestShotListInvalid: "studio.producerError.shotBatchArchive.manifestShotListInvalid",
  manifestRequestedPassesInvalid: "studio.producerError.shotBatchArchive.manifestRequestedPassesInvalid",
  manifestRequestedPassesDuplicated: "studio.producerError.shotBatchArchive.manifestRequestedPassesDuplicated",
  manifestResolutionContextInvalid: "studio.producerError.shotBatchArchive.manifestResolutionContextInvalid",
  manifestPerShotResolutionUnknownField: "studio.producerError.shotBatchArchive.manifestPerShotResolutionUnknownField",
  manifestMaximumResolutionContextInvalid: "studio.producerError.shotBatchArchive.manifestMaximumResolutionContextInvalid",
  manifestSkippedArtifactsOverLimit: "studio.producerError.shotBatchArchive.manifestSkippedArtifactsOverLimit",
  manifestSkippedArtifactInvalid: "studio.producerError.shotBatchArchive.manifestSkippedArtifactInvalid",
  manifestSkippedArtifactDuplicated: "studio.producerError.shotBatchArchive.manifestSkippedArtifactDuplicated",
  manifestPsdFallbacksOverLimit: "studio.producerError.shotBatchArchive.manifestPsdFallbacksOverLimit",
  manifestPsdFallbackInvalid: "studio.producerError.shotBatchArchive.manifestPsdFallbackInvalid",
  manifestContactSheetFallbackInvalid: "studio.producerError.shotBatchArchive.manifestContactSheetFallbackInvalid",
  artifactCountOutOfRange: "studio.producerError.shotBatchArchive.artifactCountOutOfRange",
  pngItemInvalid: "studio.producerError.shotBatchArchive.pngItemInvalid",
  psdCountOverLimit: "studio.producerError.shotBatchArchive.psdCountOverLimit",
  psdArtifactInvalid: "studio.producerError.shotBatchArchive.psdArtifactInvalid",
  contactSheetCountOverLimit: "studio.producerError.shotBatchArchive.contactSheetCountOverLimit",
  contactSheetArtifactInvalid: "studio.producerError.shotBatchArchive.contactSheetArtifactInvalid",
  publicPlanRenderDigestMismatch: "studio.producerError.shotBatchArchive.publicPlanRenderDigestMismatch",
  completedPngNotInRequestedPasses: "studio.producerError.shotBatchArchive.completedPngNotInRequestedPasses",
  completedArtifactNotInRequestedShots: "studio.producerError.shotBatchArchive.completedArtifactNotInRequestedShots",
  shotNameMismatchAcrossArtifacts: "studio.producerError.shotBatchArchive.shotNameMismatchAcrossArtifacts",
  completedArtifactMismatchPublicPlan: "studio.producerError.shotBatchArchive.completedArtifactMismatchPublicPlan",
  shotCountOverLimit: "studio.producerError.shotBatchArchive.shotCountOverLimit",
  duplicateShotPassArtifact: "studio.producerError.shotBatchArchive.duplicateShotPassArtifact",
  sameShotPassShapeMismatch: "studio.producerError.shotBatchArchive.sameShotPassShapeMismatch",
  passRequestedHeightMismatchManifestResolution: "studio.producerError.shotBatchArchive.passRequestedHeightMismatchManifestResolution",
  imageTotalBytesOverBudget: "studio.producerError.shotBatchArchive.imageTotalBytesOverBudget",
  psdArtifactNotInRequestedShots: "studio.producerError.shotBatchArchive.psdArtifactNotInRequestedShots",
  shotNameMismatchAcrossPsdArtifacts: "studio.producerError.shotBatchArchive.shotNameMismatchAcrossPsdArtifacts",
  psdPngResolutionMismatch: "studio.producerError.shotBatchArchive.psdPngResolutionMismatch",
  duplicateLayeredPsd: "studio.producerError.shotBatchArchive.duplicateLayeredPsd",
  artifactTotalBytesOverBudget: "studio.producerError.shotBatchArchive.artifactTotalBytesOverBudget",
  contactSheetTotalBytesOverBudget: "studio.producerError.shotBatchArchive.contactSheetTotalBytesOverBudget",
  contactSheetMissingRequestedShots: "studio.producerError.shotBatchArchive.contactSheetMissingRequestedShots",
  completedContactSheetConflictsFallback: "studio.producerError.shotBatchArchive.completedContactSheetConflictsFallback",
  skippedArtifactNotInRequestedShots: "studio.producerError.shotBatchArchive.skippedArtifactNotInRequestedShots",
  shotNameMismatchAcrossSkippedArtifacts: "studio.producerError.shotBatchArchive.shotNameMismatchAcrossSkippedArtifacts",
  completedAndSkippedArtifactConflict: "studio.producerError.shotBatchArchive.completedAndSkippedArtifactConflict",
  skippedArtifactNotInRequestedPasses: "studio.producerError.shotBatchArchive.skippedArtifactNotInRequestedPasses",
  psdFallbackMismatchRequestedShots: "studio.producerError.shotBatchArchive.psdFallbackMismatchRequestedShots",
  completedPsdConflictsFallback: "studio.producerError.shotBatchArchive.completedPsdConflictsFallback",
  requestedShotPsdNotAccounted: "studio.producerError.shotBatchArchive.requestedShotPsdNotAccounted",
  unrequestedPsdArtifactOrFallbackIncluded: "studio.producerError.shotBatchArchive.unrequestedPsdArtifactOrFallbackIncluded",
  requestedContactSheetNotAccounted: "studio.producerError.shotBatchArchive.requestedContactSheetNotAccounted",
  unrequestedContactSheetArtifactOrFallbackIncluded: "studio.producerError.shotBatchArchive.unrequestedContactSheetArtifactOrFallbackIncluded",
  requestedShotPassNotAccounted: "studio.producerError.shotBatchArchive.requestedShotPassNotAccounted",
  artifactTotalOverLimit: "studio.producerError.shotBatchArchive.artifactTotalOverLimit",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const SHOT_BATCH_ARCHIVE_ERROR_KO: Readonly<Record<StudioBg3dShotBatchArchiveErrorCode, string>> = {
  pngItemUnsafeFormatOrBudget: "컷 일괄 렌더 PNG 항목이 안전한 형식 또는 예산을 벗어났습니다.",
  psdArtifactUnsafeFormatOrBudget: "컷 일괄 렌더 PSD artifact가 안전한 형식 또는 예산을 벗어났습니다.",
  publicPlanUnknownOrMissingFields: "공개 컷 렌더 계획에 알 수 없거나 누락된 필드가 있습니다.",
  publicPlanUnsafeFormatOrBudget: "공개 컷 렌더 계획이 안전한 형식 또는 예산을 벗어났습니다.",
  publicPlanPassOrderNotCanonical: "공개 컷 렌더 계획의 pass 순서가 canonical 순서가 아닙니다.",
  publicPlanFrozenShotInvalid: "공개 컷 렌더 계획의 frozen shot이 올바르지 않습니다.",
  publicPlanFrozenResolutionMismatch: "공개 컷 렌더 계획의 frozen 해상도가 capture profile과 일치하지 않습니다.",
  publicPlanFileContractInvalid: "공개 컷 렌더 계획의 file contract가 올바르지 않습니다.",
  publicPlanFileOrderNotCanonical: "공개 컷 렌더 계획의 file 순서가 canonical 순서가 아닙니다.",
  publicPlanShotOrderNotCanonical: "공개 컷 렌더 계획의 shot 순서가 canonical 순서가 아닙니다.",
  manifestContextInvalid: "컷 일괄 렌더 manifest 문맥이 올바르지 않습니다.",
  manifestContextUnknownField: "컷 일괄 렌더 manifest 문맥에 알 수 없는 필드가 있습니다.",
  manifestResumeKeyInvalid: "컷 일괄 렌더 resume key가 올바르지 않습니다.",
  publicManifestResumeKeyForbidden: "공개 컷 렌더 manifest에는 로컬 resume key를 포함할 수 없습니다.",
  manifestOptionalArtifactRequestContextInvalid: "컷 일괄 렌더 선택 artifact 요청 문맥이 올바르지 않습니다.",
  manifestShotListOverLimit: "컷 일괄 렌더 manifest 컷 목록이 안전 한도를 벗어났습니다.",
  manifestShotListInvalid: "컷 일괄 렌더 manifest 컷 목록이 올바르지 않습니다.",
  manifestRequestedPassesInvalid: "컷 일괄 렌더 요청 패스가 올바르지 않습니다.",
  manifestRequestedPassesDuplicated: "컷 일괄 렌더 요청 패스가 중복되었습니다.",
  manifestResolutionContextInvalid: "컷 일괄 렌더 해상도 문맥이 올바르지 않습니다.",
  manifestPerShotResolutionUnknownField: "컷 일괄 렌더 컷별 최대 해상도 문맥에 알 수 없는 필드가 있습니다.",
  manifestMaximumResolutionContextInvalid: "컷 일괄 렌더 최대 해상도 문맥이 올바르지 않습니다.",
  manifestSkippedArtifactsOverLimit: "컷 일괄 렌더 생략 artifact가 안전 한도를 벗어났습니다.",
  manifestSkippedArtifactInvalid: "컷 일괄 렌더 생략 artifact가 올바르지 않습니다.",
  manifestSkippedArtifactDuplicated: "컷 일괄 렌더 생략 artifact가 중복되었습니다.",
  manifestPsdFallbacksOverLimit: "컷 일괄 렌더 PSD fallback 목록이 안전 한도를 벗어났습니다.",
  manifestPsdFallbackInvalid: "컷 일괄 렌더 PSD fallback이 올바르지 않습니다.",
  manifestContactSheetFallbackInvalid: "컷 일괄 렌더 콘택트 시트 fallback이 올바르지 않습니다.",
  artifactCountOutOfRange: "컷 일괄 렌더는 1~{maxArtifacts}개 artifact만 포함할 수 있습니다.",
  pngItemInvalid: "컷 일괄 렌더 PNG 항목이 올바르지 않습니다.",
  psdCountOverLimit: "컷 일괄 렌더 PSD 수가 안전 한도를 벗어났습니다.",
  psdArtifactInvalid: "컷 일괄 렌더 PSD artifact가 올바르지 않습니다.",
  contactSheetCountOverLimit: "컷 일괄 렌더 콘택트 시트 수가 안전 한도를 벗어났습니다.",
  contactSheetArtifactInvalid: "컷 일괄 렌더 콘택트 시트 artifact가 올바르지 않습니다.",
  publicPlanRenderDigestMismatch: "공개 컷 렌더 계획의 render digest가 필드와 일치하지 않습니다.",
  completedPngNotInRequestedPasses: "완료 PNG artifact가 manifest 요청 패스에 없습니다.",
  completedArtifactNotInRequestedShots: "완료 artifact가 요청 컷 목록에 없습니다.",
  shotNameMismatchAcrossArtifacts: "같은 컷 ID의 이름이 artifact 사이에서 일치하지 않습니다.",
  completedArtifactMismatchPublicPlan: "완료 artifact가 공개 frozen 렌더 계획과 일치하지 않습니다.",
  shotCountOverLimit: "컷 일괄 렌더는 최대 {maxShots}개 컷만 포함할 수 있습니다.",
  duplicateShotPassArtifact: "컷 일괄 렌더에 중복 shot/pass artifact가 있습니다.",
  sameShotPassShapeMismatch: "같은 컷의 pass artifact 해상도 또는 축소 문맥이 일치하지 않습니다.",
  passRequestedHeightMismatchManifestResolution: "컷 pass artifact의 요청 높이가 manifest 최대 해상도 문맥과 일치하지 않습니다.",
  imageTotalBytesOverBudget: "컷 일괄 렌더 이미지 합계가 브라우저 메모리 예산을 벗어났습니다.",
  psdArtifactNotInRequestedShots: "PSD artifact가 요청 컷 목록에 없습니다.",
  shotNameMismatchAcrossPsdArtifacts: "같은 컷 ID의 이름이 PSD artifact와 일치하지 않습니다.",
  psdPngResolutionMismatch: "같은 컷의 PSD와 PNG pass 해상도가 일치하지 않습니다.",
  duplicateLayeredPsd: "컷 일괄 렌더에 중복 layered PSD가 있습니다.",
  artifactTotalBytesOverBudget: "컷 일괄 렌더 artifact 합계가 브라우저 메모리 예산을 벗어났습니다.",
  contactSheetTotalBytesOverBudget: "컷 일괄 렌더 콘택트 시트 합계가 브라우저 메모리 예산을 벗어났습니다.",
  contactSheetMissingRequestedShots: "컷 일괄 렌더 콘택트 시트가 요청한 모든 컷을 포함하지 않습니다.",
  completedContactSheetConflictsFallback: "완료 콘택트 시트와 fallback이 충돌합니다.",
  skippedArtifactNotInRequestedShots: "생략 artifact가 요청 컷 목록에 없습니다.",
  shotNameMismatchAcrossSkippedArtifacts: "같은 컷 ID의 이름이 생략 artifact와 일치하지 않습니다.",
  completedAndSkippedArtifactConflict: "완료 artifact와 생략 artifact가 충돌합니다.",
  skippedArtifactNotInRequestedPasses: "생략 artifact가 manifest 요청 패스에 없습니다.",
  psdFallbackMismatchRequestedShots: "PSD fallback이 요청 컷 목록과 일치하지 않습니다.",
  completedPsdConflictsFallback: "완료 PSD와 PSD fallback이 충돌합니다.",
  requestedShotPsdNotAccounted: "요청한 컷 PSD가 완료 또는 fallback으로 정확히 설명되지 않았습니다.",
  unrequestedPsdArtifactOrFallbackIncluded: "요청하지 않은 PSD artifact 또는 fallback이 포함되었습니다.",
  requestedContactSheetNotAccounted: "요청한 콘택트 시트가 완료 또는 fallback으로 설명되지 않았습니다.",
  unrequestedContactSheetArtifactOrFallbackIncluded: "요청하지 않은 콘택트 시트 artifact 또는 fallback이 포함되었습니다.",
  requestedShotPassNotAccounted: "요청한 shot/pass가 완료 또는 생략 artifact로 정확히 설명되지 않았습니다.",
  artifactTotalOverLimit: "컷 일괄 렌더 artifact 합계가 안전 한도를 벗어났습니다.",
};

function isArchiveErrorCode(value: unknown): value is StudioBg3dShotBatchArchiveErrorCode {
  return typeof value === "string" && Object.hasOwn(SHOT_BATCH_ARCHIVE_ERROR_KEYS, value);
}

function stringParams(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * 표시 지점 전용 해석 (샷 배치 archive): 생산자가 방출한 구조화 코드를 현재 로케일 문구로 바꾼다.
 */
export function resolveStudioBg3dShotBatchArchiveError(error: {
  readonly code: StudioBg3dShotBatchArchiveErrorCode;
  readonly params?: Readonly<Record<string, string>>;
}): string {
  return resolveProducerError(
    SHOT_BATCH_ARCHIVE_ERROR_KEYS[error.code],
    SHOT_BATCH_ARCHIVE_ERROR_KO[error.code],
    error.params,
  );
}

/**
 * 표시 지점 전용 해석 (샷 배치 archive, 원인 객체 진입점): export-run의 두 번째 catch가
 * 원인 객체만으로 부른다. 워커 경유 원인은 클라이언트 WorkerError가 실은 causeCode/causeParams로
 * 판정하고(프로토콜 v5), 메인스레드 직접 원인은 생산자 클래스 이름+code로 판정한다.
 * 생산자 클래스를 런타임 import하면 studio 진입 그래프에 bg3d 생산자가 끌려오므로 덕 타이핑으로
 * 판정한다. 해당하지 않으면 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveBg3dShotBatchArchiveErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, causeCode, causeParams, params } = cause as {
    name?: unknown;
    code?: unknown;
    causeCode?: unknown;
    causeParams?: unknown;
    params?: unknown;
  };
  if (isArchiveErrorCode(causeCode)) {
    return resolveStudioBg3dShotBatchArchiveError({
      code: causeCode,
      params: stringParams(causeParams),
    });
  }
  if (name === "StudioBg3dShotBatchArchiveError" && isArchiveErrorCode(code)) {
    return resolveStudioBg3dShotBatchArchiveError({ code, params: stringParams(params) });
  }
  return null;
}
