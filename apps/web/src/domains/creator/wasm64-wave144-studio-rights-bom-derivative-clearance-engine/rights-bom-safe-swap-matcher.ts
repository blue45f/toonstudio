/**
 * Wave 144 — 검증된 상업 안전 카탈로그 기반 태그 자카드(Jaccard) 대체 어셋 매칭 및 재감사 솔버.
 *
 * - 동일 카테고리·요청 배포 범위 100% 충족·유효기간·좌석 여유·상업 등급을 모두 만족하는 후보만 채택한다.
 * - 대체 적용 후 원본 프로젝트를 변형하지 않은 불변 사본으로 재감사해 `exportCleared === true`를 입증한다.
 */

import {
  auditEpisodeRightsBomClearance,
  computeTagJaccardSimilarity,
  isAttributionMandatory,
  isEditorialOnlyLicenseTier,
  isNonCommercialLicenseTier,
  parseIsoDateToUtcDayNumber,
  resolveEffectiveAllowedScopes,
  resolveExpiringWindowDays,
} from "./rights-bom-clearance-engine";
import {
  RIGHTS_BOM_CATEGORY_LABELS_KO,
  type AppliedAssetReplacement,
  type AssetReplacementRecommendation,
  type AssetRightsAuditRecord,
  type CommercialDistributionScope,
  type RightsBomAssetEntry,
  type RightsBomAuditOptions,
  type RightsBomClearanceAuditResult,
  type RightsBomViolationCode,
  type SafeCatalogAssetEntry,
  type SafeReplacementCandidateScore,
  type SafeReplacementOptions,
  type SafeReplacementPlan,
  type SafeReplacementReauditResult,
  type StudioEpisodeRightsBomProject,
} from "./rights-bom-types";

export const DEFAULT_MAX_REPLACEMENT_ALTERNATIVES = 3;

function evaluateCandidateEligibility(
  blocked: AssetRightsAuditRecord,
  candidate: SafeCatalogAssetEntry,
  requestedScopes: readonly CommercialDistributionScope[],
  releaseDay: number | null,
  expiringSoonWindowDays: number,
  excludeExpiringSoonCandidates: boolean,
): SafeReplacementCandidateScore | null {
  if (candidate.assetId === blocked.assetId) return null;
  if (candidate.category !== blocked.category) return null;
  if (candidate.commercialClearanceVerified === false) return null;
  if (
    isNonCommercialLicenseTier(candidate.licenseTier) ||
    isEditorialOnlyLicenseTier(candidate.licenseTier)
  ) {
    return null;
  }

  const effectiveScopes = resolveEffectiveAllowedScopes(
    candidate.licenseTier,
    candidate.allowedScopes,
  );
  const scopeSet = new Set<CommercialDistributionScope>(effectiveScopes);
  for (let i = 0; i < requestedScopes.length; i += 1) {
    const scope = requestedScopes[i];
    if (scope !== undefined && !scopeSet.has(scope)) return null;
  }

  let daysUntilExpiry: number | null = null;
  let isExpiringSoon = false;
  if (candidate.expiresOnIso !== undefined) {
    const expiryDay = parseIsoDateToUtcDayNumber(candidate.expiresOnIso);
    if (releaseDay === null || expiryDay === null) return null;
    daysUntilExpiry = expiryDay - releaseDay;
    if (daysUntilExpiry < 0) return null;
    isExpiringSoon = daysUntilExpiry <= expiringSoonWindowDays;
    if (excludeExpiringSoonCandidates && isExpiringSoon) return null;
  }

  const existingUsed = candidate.existingSeatsInUse ?? 0;
  const requiredSeats =
    Number.isFinite(blocked.activeTeamSeatsUsed) &&
    blocked.activeTeamSeatsUsed >= 0
      ? blocked.activeTeamSeatsUsed
      : 1;
  if (
    !Number.isFinite(candidate.seatLimit) ||
    !Number.isFinite(existingUsed) ||
    candidate.seatLimit < 0 ||
    existingUsed < 0
  ) {
    return null;
  }
  const projectedSeatsUsed = existingUsed + requiredSeats;
  if (projectedSeatsUsed > candidate.seatLimit) return null;

  const { jaccardSimilarity, sharedTags, unionTagCount } =
    computeTagJaccardSimilarity(blocked.tags, candidate.tags);

  return {
    candidate,
    jaccardSimilarity,
    sharedTags,
    unionTagCount,
    projectedSeatsUsed,
    spareSeatsAfterSwap: candidate.seatLimit - projectedSeatsUsed,
    daysUntilExpiry,
    isExpiringSoon,
    effectiveAttributionRequired: isAttributionMandatory(
      candidate.licenseTier,
      candidate.attributionRequired,
    ),
  };
}

function compareReplacementScores(
  a: SafeReplacementCandidateScore,
  b: SafeReplacementCandidateScore,
): number {
  if (a.jaccardSimilarity !== b.jaccardSimilarity) {
    return b.jaccardSimilarity - a.jaccardSimilarity;
  }
  if (a.sharedTags.length !== b.sharedTags.length) {
    return b.sharedTags.length - a.sharedTags.length;
  }
  if (a.isExpiringSoon !== b.isExpiringSoon) {
    return a.isExpiringSoon ? 1 : -1;
  }
  if (a.effectiveAttributionRequired !== b.effectiveAttributionRequired) {
    return a.effectiveAttributionRequired ? 1 : -1;
  }
  if (a.spareSeatsAfterSwap !== b.spareSeatsAfterSwap) {
    return b.spareSeatsAfterSwap - a.spareSeatsAfterSwap;
  }
  return a.candidate.assetId.localeCompare(b.candidate.assetId);
}

/**
 * 차단된 어셋별로 검증된 상업 안전 카탈로그에서 태그 자카드 유사도 기반 최적 대체 어셋을 매칭한다.
 */
export function recommendSafeAssetReplacements(
  auditResult: RightsBomClearanceAuditResult,
  safeCatalog: readonly SafeCatalogAssetEntry[],
  options?: SafeReplacementOptions,
): SafeReplacementPlan {
  const expiringSoonWindowDays = resolveExpiringWindowDays(
    options?.expiringSoonWindowDays ?? auditResult.expiringSoonWindowDays,
  );
  const maxAlternatives = Math.max(
    1,
    Math.floor(
      options?.maxAlternativesPerAsset ?? DEFAULT_MAX_REPLACEMENT_ALTERNATIVES,
    ),
  );
  const excludeExpiringSoon = options?.excludeExpiringSoonCandidates === true;
  const allowCreditFix = options?.autoIncludeAttributionCredits !== false;
  const releaseDay = parseIsoDateToUtcDayNumber(auditResult.releaseDateIso);

  const recommendations: AssetReplacementRecommendation[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let allBlockersResolvable = true;

  for (let i = 0; i < auditResult.assetAudits.length; i += 1) {
    const record = auditResult.assetAudits[i];
    if (!record || record.status !== "blocked") continue;

    const blockerCodes: RightsBomViolationCode[] = [];
    for (let v = 0; v < record.violations.length; v += 1) {
      const violation = record.violations[v];
      if (violation && violation.severity === "blocker") {
        blockerCodes.push(violation.code);
      }
    }
    const creditOnlyFixAvailable =
      blockerCodes.length === 1 &&
      blockerCodes[0] === "missing-attribution-credit";

    const scored: SafeReplacementCandidateScore[] = [];
    for (let c = 0; c < safeCatalog.length; c += 1) {
      const candidate = safeCatalog[c];
      if (!candidate) continue;
      const evaluated = evaluateCandidateEligibility(
        record,
        candidate,
        auditResult.requestedScopes,
        releaseDay,
        expiringSoonWindowDays,
        excludeExpiringSoon,
      );
      if (evaluated !== null) scored.push(evaluated);
    }

    scored.sort(compareReplacementScores);
    const alternatives = scored.slice(0, maxAlternatives);
    const bestMatch = alternatives[0] ?? null;

    if (bestMatch !== null) matchedCount += 1;
    else unmatchedCount += 1;

    if (!(bestMatch !== null || (allowCreditFix && creditOnlyFixAvailable))) {
      allBlockersResolvable = false;
    }

    const unmatchedReasonKo =
      bestMatch === null
        ? creditOnlyFixAvailable
          ? `대체 카탈로그 후보는 없으나 ${record.nameKo}의 저작자 표기를 엔딩 크레딧에 반영하면 출고가 가능합니다.`
          : `동일 카테고리(${RIGHTS_BOM_CATEGORY_LABELS_KO[record.category]}) 중 요청 배포 범위·유효기간·좌석 여유를 모두 충족하는 상업 안전 대체 어셋이 없습니다.`
        : null;

    recommendations.push({
      blockedAssetId: record.assetId,
      blockedAssetNameKo: record.nameKo,
      category: record.category,
      blockerCodes,
      creditOnlyFixAvailable,
      bestMatch,
      alternatives,
      unmatchedReasonKo,
    });
  }

  return {
    episodeId: auditResult.episodeId,
    releaseDateIso: auditResult.releaseDateIso,
    requestedScopes: auditResult.requestedScopes,
    recommendations,
    matchedCount,
    unmatchedCount,
    allBlockersResolvable,
  };
}

/**
 * 차단 어셋에 안전 대체 어셋(및 필수 크레딧 자동 반영)을 적용하고 재감사해 출고 승인 여부를 입증한다.
 */
export function applySafeReplacementsAndReaudit(
  project: StudioEpisodeRightsBomProject,
  safeCatalog: readonly SafeCatalogAssetEntry[],
  options?: SafeReplacementOptions,
): SafeReplacementReauditResult {
  const auditOptions: RightsBomAuditOptions = {
    expiringSoonWindowDays: options?.expiringSoonWindowDays,
  };
  const initialAudit = auditEpisodeRightsBomClearance(project, auditOptions);
  const replacementPlan = recommendSafeAssetReplacements(
    initialAudit,
    safeCatalog,
    options,
  );

  const autoIncludeAttributionCredits =
    options?.autoIncludeAttributionCredits !== false;
  const preferCreditFixForAttributionOnly =
    options?.preferCreditFixForAttributionOnly !== false;

  const recByAssetId = new Map<string, AssetReplacementRecommendation>();
  for (let i = 0; i < replacementPlan.recommendations.length; i += 1) {
    const rec = replacementPlan.recommendations[i];
    if (rec) recByAssetId.set(rec.blockedAssetId, rec);
  }

  const appliedSwaps: AppliedAssetReplacement[] = [];
  const autoCreditedAssetIds: string[] = [];
  const unresolvedBlockedAssetIds: string[] = [];
  const updatedAssets: RightsBomAssetEntry[] = [];

  for (let i = 0; i < project.assets.length; i += 1) {
    const original = project.assets[i];
    if (!original) continue;
    const recommendation = recByAssetId.get(original.assetId);
    if (!recommendation) {
      updatedAssets.push(original);
      continue;
    }

    if (
      recommendation.creditOnlyFixAvailable &&
      autoIncludeAttributionCredits &&
      (preferCreditFixForAttributionOnly || recommendation.bestMatch === null)
    ) {
      autoCreditedAssetIds.push(original.assetId);
      updatedAssets.push({ ...original, attributionIncludedInCredits: true });
      continue;
    }

    if (recommendation.bestMatch !== null) {
      const match = recommendation.bestMatch;
      const candidate = match.candidate;
      const includeCredit = match.effectiveAttributionRequired
        ? autoIncludeAttributionCredits
        : false;
      updatedAssets.push({
        assetId: candidate.assetId,
        nameKo: candidate.nameKo,
        category: candidate.category,
        vendor: candidate.vendor,
        licenseTier: candidate.licenseTier,
        allowedScopes: candidate.allowedScopes,
        seatLimit: candidate.seatLimit,
        activeTeamSeatsUsed: match.projectedSeatsUsed,
        expiresOnIso: candidate.expiresOnIso,
        attributionRequired: candidate.attributionRequired,
        attributionIncludedInCredits: includeCredit,
        attributionTemplateKo: candidate.attributionTemplateKo,
        licenseReferenceCode: candidate.licenseReferenceCode,
        tags: candidate.tags,
        usedInCutIds: original.usedInCutIds,
      });
      appliedSwaps.push({
        fromAssetId: original.assetId,
        fromAssetNameKo: original.nameKo,
        toAssetId: candidate.assetId,
        toAssetNameKo: candidate.nameKo,
        toVendor: candidate.vendor,
        category: candidate.category,
        jaccardSimilarity: match.jaccardSimilarity,
        sharedTags: match.sharedTags,
        usedInCutIds: Array.from(new Set(original.usedInCutIds)).sort(),
      });
      if (match.effectiveAttributionRequired && includeCredit) {
        autoCreditedAssetIds.push(candidate.assetId);
      }
      continue;
    }

    unresolvedBlockedAssetIds.push(original.assetId);
    updatedAssets.push(original);
  }

  const updatedProject: StudioEpisodeRightsBomProject = {
    ...project,
    assets: updatedAssets,
  };
  const reAudit = auditEpisodeRightsBomClearance(updatedProject, auditOptions);

  return {
    initialAudit,
    replacementPlan,
    updatedProject,
    appliedSwaps,
    autoCreditedAssetIds,
    unresolvedBlockedAssetIds,
    reAudit,
    clearedAfterReaudit: reAudit.exportCleared && reAudit.blockerCount === 0,
  };
}
