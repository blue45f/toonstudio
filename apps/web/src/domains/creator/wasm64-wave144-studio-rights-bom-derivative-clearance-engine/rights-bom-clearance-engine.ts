/**
 * Wave 144 — 웹툰 스튜디오 Rights BOM 2차 저작물 라이선스 fail-closed 감사기 및 크레딧 컴파일러.
 *
 * - 6대 상업 라이선스 위반(비상업/2차 범위 미포함/만료/좌석 초과/저작자 표기 누락/편집 전용)을
 *   fail-closed로 차단하고 30일 이내 만료 임박 어셋을 경고한다.
 * - 필수 저작자 표기 크레딧 컴파일러와 FIPS 180-4 SHA-256 권리 클리어런스 증명서를 발급한다.
 */

import { computeRightsBomCertificateSha256Hex } from "./rights-bom-sha256";
import {
  COMMERCIAL_DISTRIBUTION_SCOPES,
  COMMERCIAL_SCOPE_LABELS_KO,
  LICENSE_TIER_LABELS_KO,
  RIGHTS_BOM_CATEGORY_LABELS_KO,
  type AssetRightsAuditRecord,
  type AttributionCreditEntry,
  type CommercialDistributionScope,
  type CompiledAttributionCreditsResult,
  type LicenseTier,
  type RightsBomAssetEntry,
  type RightsBomAuditOptions,
  type RightsBomClearanceAuditResult,
  type RightsBomViolation,
  type ScopeMatrixCellState,
  type StudioEpisodeRightsBomProject,
} from "./rights-bom-types";

export const DEFAULT_EXPIRING_SOON_WINDOW_DAYS = 30;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_UTC_DAY = 86_400_000;

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** `YYYY-MM-DD` 형식의 달력 날짜를 UTC 기준 일수 정수로 파싱한다. 유효하지 않으면 `null`. */
export function parseIsoDateToUtcDayNumber(isoDate: string): number | null {
  const match = ISO_DATE_PATTERN.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utcMs = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utcMs)) return null;
  const verify = new Date(utcMs);
  if (
    verify.getUTCFullYear() !== year ||
    verify.getUTCMonth() !== month - 1 ||
    verify.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utcMs / MS_PER_UTC_DAY);
}

/** 라이선스 등급이 비상업 전용인지 판별한다. */
export function isNonCommercialLicenseTier(tier: LicenseTier): boolean {
  return tier === "non-commercial-personal" || tier === "cc-by-nc-4.0";
}

/** 라이선스 등급이 보도·편집 전용인지 판별한다. */
export function isEditorialOnlyLicenseTier(tier: LicenseTier): boolean {
  return tier === "editorial-only";
}

/** 라이선스 등급과 어셋 메타데이터를 합쳐 필수 저작자 표기 여부를 계산한다. */
export function isAttributionMandatory(
  tier: LicenseTier,
  attributionRequired: boolean,
): boolean {
  return attributionRequired || tier === "cc-by-4.0" || tier === "cc-by-nc-4.0";
}

export function resolveExpiringWindowDays(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_EXPIRING_SOON_WINDOW_DAYS;
  }
  return Math.max(0, Math.floor(value));
}

function canonicalizeScopes(
  scopes: readonly CommercialDistributionScope[],
): readonly CommercialDistributionScope[] {
  const present = new Set<CommercialDistributionScope>();
  for (let i = 0; i < scopes.length; i += 1) {
    const scope = scopes[i];
    if (scope !== undefined) present.add(scope);
  }
  const ordered: CommercialDistributionScope[] = [];
  for (let i = 0; i < COMMERCIAL_DISTRIBUTION_SCOPES.length; i += 1) {
    const scope = COMMERCIAL_DISTRIBUTION_SCOPES[i];
    if (scope !== undefined && present.has(scope)) ordered.push(scope);
  }
  return ordered;
}

/** 등급 제약(`commercial-webtoon-only`)을 반영한 실효 허용 배포 범위를 반환한다. */
export function resolveEffectiveAllowedScopes(
  tier: LicenseTier,
  allowedScopes: readonly CommercialDistributionScope[],
): readonly CommercialDistributionScope[] {
  const canonical = canonicalizeScopes(allowedScopes);
  if (tier === "commercial-webtoon-only") {
    return canonical.includes("webtoon-serial") ? ["webtoon-serial"] : [];
  }
  return canonical;
}

/** 어셋 태그 배열을 소문자·공백제거·중복제거·사전순 정렬로 정규화한다. */
export function normalizeAssetTags(tags: readonly string[]): readonly string[] {
  const unique = new Set<string>();
  for (let i = 0; i < tags.length; i += 1) {
    const raw = tags[i];
    if (raw === undefined) continue;
    const normalized = raw.trim().toLowerCase();
    if (normalized.length > 0) unique.add(normalized);
  }
  return Array.from(unique).sort();
}

export interface TagJaccardResult {
  readonly jaccardSimilarity: number;
  readonly sharedTags: readonly string[];
  readonly unionTagCount: number;
}

/** 두 태그 목록의 자카드(Jaccard) 유사도(`|A ∩ B| / |A ∪ B|`)를 결정론적으로 계산한다. */
export function computeTagJaccardSimilarity(
  tagsA: readonly string[],
  tagsB: readonly string[],
): TagJaccardResult {
  const normA = normalizeAssetTags(tagsA);
  const normB = normalizeAssetTags(tagsB);
  if (normA.length === 0 && normB.length === 0) {
    return { jaccardSimilarity: 0, sharedTags: [], unionTagCount: 0 };
  }
  const setB = new Set<string>(normB);
  const sharedTags: string[] = [];
  for (let i = 0; i < normA.length; i += 1) {
    const tag = normA[i];
    if (tag !== undefined && setB.has(tag)) sharedTags.push(tag);
  }
  const unionTagCount = normA.length + normB.length - sharedTags.length;
  const jaccardSimilarity =
    unionTagCount > 0 ? round4(sharedTags.length / unionTagCount) : 0;
  return { jaccardSimilarity, sharedTags, unionTagCount };
}

function formatAssetCreditLineKo(asset: {
  readonly nameKo: string;
  readonly vendor: string;
  readonly category: RightsBomAssetEntry["category"];
  readonly licenseTier: LicenseTier;
  readonly attributionTemplateKo?: string;
  readonly usedInCutIds: readonly string[];
}): string {
  const custom = asset.attributionTemplateKo?.trim();
  if (custom && custom.length > 0) return custom;
  const categoryLabel = RIGHTS_BOM_CATEGORY_LABELS_KO[asset.category];
  const tierLabel = LICENSE_TIER_LABELS_KO[asset.licenseTier];
  const cutIds = Array.from(new Set(asset.usedInCutIds)).sort();
  const cutSuffix = cutIds.length > 0 ? ` · 사용 컷: ${cutIds.join(", ")}` : "";
  return `[${categoryLabel}] ${asset.nameKo} — ${asset.vendor} (${tierLabel}${cutSuffix})`;
}

function formatScopeListKo(scopes: readonly CommercialDistributionScope[]): string {
  return scopes.map((scope) => COMMERCIAL_SCOPE_LABELS_KO[scope]).join(", ");
}

function buildScopeMatrix(
  requestedScopes: readonly CommercialDistributionScope[],
  effectiveAllowedScopes: readonly CommercialDistributionScope[],
  hasCommercialTierBlocker: boolean,
): Readonly<Record<CommercialDistributionScope, ScopeMatrixCellState>> {
  const requestedSet = new Set<CommercialDistributionScope>(requestedScopes);
  const allowedSet = new Set<CommercialDistributionScope>(effectiveAllowedScopes);
  const matrix: Record<CommercialDistributionScope, ScopeMatrixCellState> = {
    "webtoon-serial": "unrequested-uncovered",
    "print-book": "unrequested-uncovered",
    "video-drama-adaptation": "unrequested-uncovered",
    "physical-merch": "unrequested-uncovered",
    "global-translation": "unrequested-uncovered",
  };
  for (let i = 0; i < COMMERCIAL_DISTRIBUTION_SCOPES.length; i += 1) {
    const scope = COMMERCIAL_DISTRIBUTION_SCOPES[i];
    if (scope === undefined) continue;
    const isRequested = requestedSet.has(scope);
    const isAllowed = !hasCommercialTierBlocker && allowedSet.has(scope);
    matrix[scope] = isRequested
      ? isAllowed
        ? "requested-cleared"
        : "requested-blocked"
      : isAllowed
        ? "unrequested-covered"
        : "unrequested-uncovered";
  }
  return matrix;
}

/** 필수 저작자 표기 대상 어셋의 한국어 엔딩 크레딧 목록을 결정론적으로 컴파일한다. */
export function compileRequiredAttributionCreditsKo(
  input: readonly RightsBomAssetEntry[] | RightsBomClearanceAuditResult,
): CompiledAttributionCreditsResult {
  const rawEntries: AttributionCreditEntry[] = [];
  if (Array.isArray(input)) {
    const assets = input as readonly RightsBomAssetEntry[];
    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i];
      if (!asset || !isAttributionMandatory(asset.licenseTier, asset.attributionRequired)) {
        continue;
      }
      rawEntries.push({
        assetId: asset.assetId,
        nameKo: asset.nameKo,
        vendor: asset.vendor,
        category: asset.category,
        licenseTier: asset.licenseTier,
        creditLineKo: formatAssetCreditLineKo(asset),
        alreadyIncluded: asset.attributionIncludedInCredits,
        usedInCutIds: Array.from(new Set(asset.usedInCutIds)).sort(),
      });
    }
  } else {
    const audit = input as RightsBomClearanceAuditResult;
    for (let i = 0; i < audit.assetAudits.length; i += 1) {
      const record = audit.assetAudits[i];
      if (!record || !record.effectiveAttributionRequired) continue;
      rawEntries.push({
        assetId: record.assetId,
        nameKo: record.nameKo,
        vendor: record.vendor,
        category: record.category,
        licenseTier: record.licenseTier,
        creditLineKo:
          record.suggestedCreditLineKo ??
          formatAssetCreditLineKo({
            nameKo: record.nameKo,
            vendor: record.vendor,
            category: record.category,
            licenseTier: record.licenseTier,
            usedInCutIds: record.usedInCutIds,
          }),
        alreadyIncluded: record.attributionIncludedInCredits,
        usedInCutIds: record.usedInCutIds,
      });
    }
  }

  rawEntries.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
    if (a.nameKo !== b.nameKo) return a.nameKo.localeCompare(b.nameKo);
    return a.assetId.localeCompare(b.assetId);
  });

  const creditLinesKo = rawEntries.map((entry) => entry.creditLineKo);
  const missingCreditAssetIds = rawEntries
    .filter((entry) => !entry.alreadyIncluded)
    .map((entry) => entry.assetId);
  const formattedBlockKo =
    creditLinesKo.length > 0
      ? ["[사용 어셋 저작자 표기]", ...creditLinesKo.map((line) => `- ${line}`)].join("\n")
      : "필수 저작자 표기 대상 어셋이 없습니다.";

  return {
    entries: rawEntries,
    creditLinesKo,
    formattedBlockKo,
    missingCreditAssetIds,
  };
}

function auditSingleAsset(
  asset: RightsBomAssetEntry,
  requestedScopes: readonly CommercialDistributionScope[],
  releaseDateIso: string,
  releaseDay: number | null,
  expiringSoonWindowDays: number,
): AssetRightsAuditRecord {
  const cutIds = Array.from(new Set(asset.usedInCutIds)).sort();
  const normalizedTags = normalizeAssetTags(asset.tags);
  const effectiveAllowedScopes = resolveEffectiveAllowedScopes(
    asset.licenseTier,
    asset.allowedScopes,
  );
  const effectiveAllowedSet = new Set<CommercialDistributionScope>(effectiveAllowedScopes);
  const missingRequestedScopes = requestedScopes.filter(
    (scope) => !effectiveAllowedSet.has(scope),
  );
  const nonCommercial = isNonCommercialLicenseTier(asset.licenseTier);
  const editorialOnly = isEditorialOnlyLicenseTier(asset.licenseTier);
  const effectiveAttributionRequired = isAttributionMandatory(
    asset.licenseTier,
    asset.attributionRequired,
  );
  const suggestedCreditLineKo = effectiveAttributionRequired
    ? formatAssetCreditLineKo(asset)
    : null;
  const violations: RightsBomViolation[] = [];

  if (nonCommercial) {
    violations.push({
      assetId: asset.assetId,
      assetNameKo: asset.nameKo,
      category: asset.category,
      code: "non-commercial-license-blocker",
      severity: "blocker",
      messageKo: `${asset.nameKo}(${LICENSE_TIER_LABELS_KO[asset.licenseTier]})은 비상업 라이선스이므로 상업 출고에 포함할 수 없습니다.`,
      remediationHintKo:
        "동일 카테고리의 상업 라이선스 어셋으로 교체하거나 저작권자와 상업 이용 계약을 별도 체결하세요.",
      missingScopes: requestedScopes,
      daysUntilExpiry: null,
      seatOverflowCount: 0,
      usedInCutIds: cutIds,
    });
  }

  if (editorialOnly) {
    violations.push({
      assetId: asset.assetId,
      assetNameKo: asset.nameKo,
      category: asset.category,
      code: "editorial-only-in-commercial",
      severity: "blocker",
      messageKo: `${asset.nameKo}은 보도·편집 전용(Editorial Only) 라이선스이므로 상업 웹툰·2차 저작물 출고에 사용할 수 없습니다.`,
      remediationHintKo:
        "상업 모델·재산권 클리어런스가 완료된 대체 어셋으로 교체하세요.",
      missingScopes: requestedScopes,
      daysUntilExpiry: null,
      seatOverflowCount: 0,
      usedInCutIds: cutIds,
    });
  }

  if (missingRequestedScopes.length > 0) {
    violations.push({
      assetId: asset.assetId,
      assetNameKo: asset.nameKo,
      category: asset.category,
      code: "derivative-scope-not-covered",
      severity: "blocker",
      messageKo: `${asset.nameKo} 라이선스에 목표 배포 범위(${formatScopeListKo(missingRequestedScopes)}) 권한이 빠져 있습니다.`,
      remediationHintKo:
        "확장 2차 저작물(단행본·영상화·굿즈·글로벌) 권한을 포함한 라이선스로 업그레이드하거나 안전 대체 어셋으로 교체하세요.",
      missingScopes: missingRequestedScopes,
      daysUntilExpiry: null,
      seatOverflowCount: 0,
      usedInCutIds: cutIds,
    });
  }

  let daysUntilExpiry: number | null = null;
  if (asset.expiresOnIso !== undefined) {
    const expiryDay = parseIsoDateToUtcDayNumber(asset.expiresOnIso);
    if (releaseDay === null || expiryDay === null) {
      violations.push({
        assetId: asset.assetId,
        assetNameKo: asset.nameKo,
        category: asset.category,
        code: "license-expired",
        severity: "blocker",
        messageKo: `${asset.nameKo}의 출고 기준일(${releaseDateIso}) 또는 만료일(${asset.expiresOnIso}) 형식이 유효하지 않아 출고를 보류합니다.`,
        remediationHintKo: "YYYY-MM-DD 형식의 정확한 계약 만료일을 확인해 갱신하세요.",
        missingScopes: [],
        daysUntilExpiry: null,
        seatOverflowCount: 0,
        usedInCutIds: cutIds,
      });
    } else {
      daysUntilExpiry = expiryDay - releaseDay;
      if (daysUntilExpiry < 0) {
        violations.push({
          assetId: asset.assetId,
          assetNameKo: asset.nameKo,
          category: asset.category,
          code: "license-expired",
          severity: "blocker",
          messageKo: `${asset.nameKo} 라이선스가 출고 기준일(${releaseDateIso}) 기준 ${Math.abs(daysUntilExpiry)}일 전(${asset.expiresOnIso})에 만료되었습니다.`,
          remediationHintKo:
            "라이선스를 즉시 갱신하거나 유효 기간이 남은 상업 대체 어셋으로 교체하세요.",
          missingScopes: [],
          daysUntilExpiry,
          seatOverflowCount: 0,
          usedInCutIds: cutIds,
        });
      } else if (daysUntilExpiry <= expiringSoonWindowDays) {
        violations.push({
          assetId: asset.assetId,
          assetNameKo: asset.nameKo,
          category: asset.category,
          code: "license-expiring-soon",
          severity: "warning",
          messageKo: `${asset.nameKo} 라이선스가 ${daysUntilExpiry}일 뒤(${asset.expiresOnIso}) 만료 예정입니다.`,
          remediationHintKo:
            "차기 회차 출고나 단행본 인쇄 전에 갱신 일정을 PD 일정표에 등록하세요.",
          missingScopes: [],
          daysUntilExpiry,
          seatOverflowCount: 0,
          usedInCutIds: cutIds,
        });
      }
    }
  }

  const seatMetricsValid =
    Number.isFinite(asset.seatLimit) &&
    Number.isFinite(asset.activeTeamSeatsUsed) &&
    asset.seatLimit >= 0 &&
    asset.activeTeamSeatsUsed >= 0;
  if (!seatMetricsValid || asset.activeTeamSeatsUsed > asset.seatLimit) {
    const seatOverflowCount = seatMetricsValid
      ? Math.ceil(asset.activeTeamSeatsUsed - asset.seatLimit)
      : 1;
    violations.push({
      assetId: asset.assetId,
      assetNameKo: asset.nameKo,
      category: asset.category,
      code: "seat-capacity-exceeded",
      severity: "blocker",
      messageKo: seatMetricsValid
        ? `${asset.nameKo}의 현재 팀 사용 좌석(${asset.activeTeamSeatsUsed}석)이 계약 한도(${asset.seatLimit}석)를 ${seatOverflowCount}석 초과했습니다.`
        : `${asset.nameKo}의 좌석 수 메타데이터가 손상되어 출고를 보류합니다.`,
      remediationHintKo:
        "추가 좌석 라이선스를 구매하거나 팀 인원을 수용하는 기업형 대체 어셋으로 교체하세요.",
      missingScopes: [],
      daysUntilExpiry,
      seatOverflowCount,
      usedInCutIds: cutIds,
    });
  }

  if (effectiveAttributionRequired && !asset.attributionIncludedInCredits) {
    violations.push({
      assetId: asset.assetId,
      assetNameKo: asset.nameKo,
      category: asset.category,
      code: "missing-attribution-credit",
      severity: "blocker",
      messageKo: `${asset.nameKo}은 저작자 표기가 필수이나 회차 엔딩 크레딧에 누락되었습니다.`,
      remediationHintKo: `엔딩 크레딧에 다음 문구를 추가하세요: ${suggestedCreditLineKo ?? asset.nameKo}`,
      missingScopes: [],
      daysUntilExpiry,
      seatOverflowCount: 0,
      usedInCutIds: cutIds,
    });
  }

  let blockerCount = 0;
  let warningCount = 0;
  for (let v = 0; v < violations.length; v += 1) {
    const violation = violations[v];
    if (!violation) continue;
    if (violation.severity === "blocker") blockerCount += 1;
    else warningCount += 1;
  }

  const status =
    blockerCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "cleared";

  return {
    assetId: asset.assetId,
    nameKo: asset.nameKo,
    category: asset.category,
    vendor: asset.vendor,
    licenseTier: asset.licenseTier,
    status,
    effectiveAllowedScopes,
    missingRequestedScopes,
    scopeMatrix: buildScopeMatrix(
      requestedScopes,
      effectiveAllowedScopes,
      nonCommercial || editorialOnly,
    ),
    seatLimit: asset.seatLimit,
    activeTeamSeatsUsed: asset.activeTeamSeatsUsed,
    expiresOnIso: asset.expiresOnIso ?? null,
    daysUntilExpiry,
    effectiveAttributionRequired,
    attributionIncludedInCredits: asset.attributionIncludedInCredits,
    suggestedCreditLineKo,
    tags: normalizedTags,
    usedInCutIds: cutIds,
    violations,
    blockerCount,
    warningCount,
  };
}

/**
 * 웹툰 에피소드의 Rights BOM 어셋 전체를 6대 상업 라이선스 규칙으로 fail-closed 감사하고
 * SHA-256 권리 클리어런스 증명서를 발급한다.
 */
export function auditEpisodeRightsBomClearance(
  project: StudioEpisodeRightsBomProject,
  options?: RightsBomAuditOptions,
): RightsBomClearanceAuditResult {
  const expiringSoonWindowDays = resolveExpiringWindowDays(
    options?.expiringSoonWindowDays,
  );
  const requestedScopes = canonicalizeScopes(project.requestedScopes);
  const releaseDay = parseIsoDateToUtcDayNumber(project.releaseDateIso);
  const releaseDateValid = releaseDay !== null;

  const assetAudits: AssetRightsAuditRecord[] = [];
  const allViolations: RightsBomViolation[] = [];
  let clearedAssetCount = 0;
  let warningAssetCount = 0;
  let blockedAssetCount = 0;
  let totalBlockerCount = 0;
  let totalWarningCount = 0;

  for (let i = 0; i < project.assets.length; i += 1) {
    const asset = project.assets[i];
    if (!asset) continue;
    const record = auditSingleAsset(
      asset,
      requestedScopes,
      project.releaseDateIso,
      releaseDay,
      expiringSoonWindowDays,
    );
    assetAudits.push(record);
    for (let v = 0; v < record.violations.length; v += 1) {
      const violation = record.violations[v];
      if (violation) allViolations.push(violation);
    }
    totalBlockerCount += record.blockerCount;
    totalWarningCount += record.warningCount;
    if (record.status === "blocked") blockedAssetCount += 1;
    else if (record.status === "warning") warningAssetCount += 1;
    else clearedAssetCount += 1;
  }

  const attributionCredits = compileRequiredAttributionCreditsKo(project.assets);
  const exportCleared =
    releaseDateValid && requestedScopes.length > 0 && totalBlockerCount === 0;

  const sortedDigests = [...assetAudits]
    .sort((a, b) => a.assetId.localeCompare(b.assetId))
    .map((record) => ({
      assetId: record.assetId,
      category: record.category,
      vendor: record.vendor,
      licenseTier: record.licenseTier,
      status: record.status,
      effectiveAllowedScopes: record.effectiveAllowedScopes,
      seatLimit: record.seatLimit,
      activeTeamSeatsUsed: record.activeTeamSeatsUsed,
      expiresOnIso: record.expiresOnIso,
      effectiveAttributionRequired: record.effectiveAttributionRequired,
      attributionIncludedInCredits: record.attributionIncludedInCredits,
      usedInCutIds: record.usedInCutIds,
      violationCodes: record.violations.map((v) => v.code).sort(),
    }));

  const clearanceCertificateSha256Hex = computeRightsBomCertificateSha256Hex({
    schemaVersion: "toonstudio-rights-bom-clearance-v1",
    episodeId: project.episodeId,
    projectTitleKo: project.projectTitleKo,
    releaseDateIso: project.releaseDateIso,
    releaseDateValid,
    requestedScopes,
    expiringSoonWindowDays,
    exportCleared,
    blockerCount: totalBlockerCount,
    warningCount: totalWarningCount,
    clearedAssetCount,
    assetDigests: sortedDigests,
    requiredAttributionCreditsKo: attributionCredits.creditLinesKo,
  });
  const clearanceCertificateId = `CERT-${clearanceCertificateSha256Hex.slice(0, 12).toUpperCase()}`;

  return {
    schemaVersion: "toonstudio-rights-bom-clearance-v1",
    episodeId: project.episodeId,
    projectTitleKo: project.projectTitleKo,
    releaseDateIso: project.releaseDateIso,
    releaseDateValid,
    requestedScopes,
    expiringSoonWindowDays,
    exportCleared,
    totalAssetCount: assetAudits.length,
    clearedAssetCount,
    warningAssetCount,
    blockedAssetCount,
    blockerCount: totalBlockerCount,
    warningCount: totalWarningCount,
    violations: allViolations,
    assetAudits,
    attributionCredits,
    clearanceCertificateId,
    clearanceCertificateSha256Hex,
  };
}
