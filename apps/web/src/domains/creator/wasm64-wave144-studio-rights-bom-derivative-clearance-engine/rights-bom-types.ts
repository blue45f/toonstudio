/**
 * Wave 144 — 웹툰 스튜디오 Rights BOM 2차 저작물 상업 라이선스 감사 및 안전 대체 어셋 계약 타입.
 *
 * - 6종 어셋 카테고리, 5대 상업 활용 범위, 7종 라이선스 등급, 6대 위반(+만료 임박 경고) 코드를 정의한다.
 * - 모든 계약은 순수 ES2017 strict TypeScript(`verbatimModuleSyntax`, `any` 금지)를 준수한다.
 */

export const RIGHTS_BOM_ASSET_CATEGORIES = [
  "brush-pack",
  "3d-background",
  "texture-screentone",
  "font-typeface",
  "prop-model",
  "audio-sfx",
] as const;

export type RightsBomAssetCategory = (typeof RIGHTS_BOM_ASSET_CATEGORIES)[number];

export const COMMERCIAL_DISTRIBUTION_SCOPES = [
  "webtoon-serial",
  "print-book",
  "video-drama-adaptation",
  "physical-merch",
  "global-translation",
] as const;

export type CommercialDistributionScope =
  (typeof COMMERCIAL_DISTRIBUTION_SCOPES)[number];

export const LICENSE_TIERS = [
  "commercial-full",
  "commercial-webtoon-only",
  "editorial-only",
  "non-commercial-personal",
  "cc-by-4.0",
  "cc-by-nc-4.0",
  "custom-enterprise",
] as const;

export type LicenseTier = (typeof LICENSE_TIERS)[number];

export const RIGHTS_BOM_VIOLATION_CODES = [
  "non-commercial-license-blocker",
  "derivative-scope-not-covered",
  "license-expired",
  "license-expiring-soon",
  "seat-capacity-exceeded",
  "missing-attribution-credit",
  "editorial-only-in-commercial",
] as const;

export type RightsBomViolationCode = (typeof RIGHTS_BOM_VIOLATION_CODES)[number];

export type RightsBomSeverity = "blocker" | "warning";

export type RightsBomAssetAuditStatus = "cleared" | "warning" | "blocked";

export type ScopeMatrixCellState =
  | "requested-cleared"
  | "requested-blocked"
  | "unrequested-covered"
  | "unrequested-uncovered";

export const RIGHTS_BOM_CATEGORY_LABELS_KO: Readonly<
  Record<RightsBomAssetCategory, string>
> = {
  "brush-pack": "브러시 팩",
  "3d-background": "3D 배경",
  "texture-screentone": "텍스처·스크린톤",
  "font-typeface": "폰트·서체",
  "prop-model": "3D 소품",
  "audio-sfx": "오디오·효과음",
};

export const COMMERCIAL_SCOPE_LABELS_KO: Readonly<
  Record<CommercialDistributionScope, string>
> = {
  "webtoon-serial": "웹툰 연재",
  "print-book": "단행본 인쇄",
  "video-drama-adaptation": "드라마·애니 영상화",
  "physical-merch": "실물 굿즈",
  "global-translation": "글로벌 번역",
};

export const COMMERCIAL_SCOPE_SHORT_LABELS_KO: Readonly<
  Record<CommercialDistributionScope, string>
> = {
  "webtoon-serial": "연재",
  "print-book": "단행본",
  "video-drama-adaptation": "영상화",
  "physical-merch": "굿즈",
  "global-translation": "글로벌",
};

export const LICENSE_TIER_LABELS_KO: Readonly<Record<LicenseTier, string>> = {
  "commercial-full": "전체 상업용",
  "commercial-webtoon-only": "웹툰 연재 전용",
  "editorial-only": "보도·편집 전용",
  "non-commercial-personal": "비상업 개인용",
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-nc-4.0": "CC BY-NC 4.0",
  "custom-enterprise": "맞춤 기업 계약",
};

export const VIOLATION_CODE_LABELS_KO: Readonly<
  Record<RightsBomViolationCode, string>
> = {
  "non-commercial-license-blocker": "비상업 라이선스 상업 출고 차단",
  "derivative-scope-not-covered": "2차 저작물 배포 범위 미포함",
  "license-expired": "라이선스 유효기간 만료",
  "license-expiring-soon": "라이선스 만료 임박",
  "seat-capacity-exceeded": "계약 좌석 수 초과",
  "missing-attribution-credit": "필수 저작자 표기 누락",
  "editorial-only-in-commercial": "편집·보도 전용 어셋 상업 사용 차단",
};

export interface RightsBomAssetEntry {
  readonly assetId: string;
  readonly nameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly vendor: string;
  readonly licenseTier: LicenseTier;
  readonly allowedScopes: readonly CommercialDistributionScope[];
  readonly seatLimit: number;
  readonly activeTeamSeatsUsed: number;
  readonly expiresOnIso?: string;
  readonly attributionRequired: boolean;
  readonly attributionIncludedInCredits: boolean;
  readonly attributionTemplateKo?: string;
  readonly licenseReferenceCode?: string;
  readonly tags: readonly string[];
  readonly usedInCutIds: readonly string[];
}

export interface StudioEpisodeRightsBomProject {
  readonly episodeId: string;
  readonly projectTitleKo: string;
  readonly releaseDateIso: string;
  readonly requestedScopes: readonly CommercialDistributionScope[];
  readonly assets: readonly RightsBomAssetEntry[];
}

export interface SafeCatalogAssetEntry {
  readonly assetId: string;
  readonly nameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly vendor: string;
  readonly licenseTier: LicenseTier;
  readonly allowedScopes: readonly CommercialDistributionScope[];
  readonly seatLimit: number;
  readonly existingSeatsInUse?: number;
  readonly expiresOnIso?: string;
  readonly attributionRequired: boolean;
  readonly attributionTemplateKo?: string;
  readonly licenseReferenceCode?: string;
  readonly commercialClearanceVerified?: boolean;
  readonly tags: readonly string[];
}

export interface RightsBomAuditOptions {
  readonly expiringSoonWindowDays?: number;
}

export interface RightsBomViolation {
  readonly assetId: string;
  readonly assetNameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly code: RightsBomViolationCode;
  readonly severity: RightsBomSeverity;
  readonly messageKo: string;
  readonly remediationHintKo: string;
  readonly missingScopes: readonly CommercialDistributionScope[];
  readonly daysUntilExpiry: number | null;
  readonly seatOverflowCount: number;
  readonly usedInCutIds: readonly string[];
}

export interface AssetRightsAuditRecord {
  readonly assetId: string;
  readonly nameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly vendor: string;
  readonly licenseTier: LicenseTier;
  readonly status: RightsBomAssetAuditStatus;
  readonly effectiveAllowedScopes: readonly CommercialDistributionScope[];
  readonly missingRequestedScopes: readonly CommercialDistributionScope[];
  readonly scopeMatrix: Readonly<
    Record<CommercialDistributionScope, ScopeMatrixCellState>
  >;
  readonly seatLimit: number;
  readonly activeTeamSeatsUsed: number;
  readonly expiresOnIso: string | null;
  readonly daysUntilExpiry: number | null;
  readonly effectiveAttributionRequired: boolean;
  readonly attributionIncludedInCredits: boolean;
  readonly suggestedCreditLineKo: string | null;
  readonly tags: readonly string[];
  readonly usedInCutIds: readonly string[];
  readonly violations: readonly RightsBomViolation[];
  readonly blockerCount: number;
  readonly warningCount: number;
}

export interface AttributionCreditEntry {
  readonly assetId: string;
  readonly nameKo: string;
  readonly vendor: string;
  readonly category: RightsBomAssetCategory;
  readonly licenseTier: LicenseTier;
  readonly creditLineKo: string;
  readonly alreadyIncluded: boolean;
  readonly usedInCutIds: readonly string[];
}

export interface CompiledAttributionCreditsResult {
  readonly entries: readonly AttributionCreditEntry[];
  readonly creditLinesKo: readonly string[];
  readonly formattedBlockKo: string;
  readonly missingCreditAssetIds: readonly string[];
}

export interface RightsBomClearanceAuditResult {
  readonly schemaVersion: "toonstudio-rights-bom-clearance-v1";
  readonly episodeId: string;
  readonly projectTitleKo: string;
  readonly releaseDateIso: string;
  readonly releaseDateValid: boolean;
  readonly requestedScopes: readonly CommercialDistributionScope[];
  readonly expiringSoonWindowDays: number;
  readonly exportCleared: boolean;
  readonly totalAssetCount: number;
  readonly clearedAssetCount: number;
  readonly warningAssetCount: number;
  readonly blockedAssetCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly violations: readonly RightsBomViolation[];
  readonly assetAudits: readonly AssetRightsAuditRecord[];
  readonly attributionCredits: CompiledAttributionCreditsResult;
  readonly clearanceCertificateId: string;
  readonly clearanceCertificateSha256Hex: string;
}

export interface SafeReplacementOptions {
  readonly expiringSoonWindowDays?: number;
  readonly maxAlternativesPerAsset?: number;
  readonly excludeExpiringSoonCandidates?: boolean;
  readonly autoIncludeAttributionCredits?: boolean;
  readonly preferCreditFixForAttributionOnly?: boolean;
}

export interface SafeReplacementCandidateScore {
  readonly candidate: SafeCatalogAssetEntry;
  readonly jaccardSimilarity: number;
  readonly sharedTags: readonly string[];
  readonly unionTagCount: number;
  readonly projectedSeatsUsed: number;
  readonly spareSeatsAfterSwap: number;
  readonly daysUntilExpiry: number | null;
  readonly isExpiringSoon: boolean;
  readonly effectiveAttributionRequired: boolean;
}

export interface AssetReplacementRecommendation {
  readonly blockedAssetId: string;
  readonly blockedAssetNameKo: string;
  readonly category: RightsBomAssetCategory;
  readonly blockerCodes: readonly RightsBomViolationCode[];
  readonly creditOnlyFixAvailable: boolean;
  readonly bestMatch: SafeReplacementCandidateScore | null;
  readonly alternatives: readonly SafeReplacementCandidateScore[];
  readonly unmatchedReasonKo: string | null;
}

export interface SafeReplacementPlan {
  readonly episodeId: string;
  readonly releaseDateIso: string;
  readonly requestedScopes: readonly CommercialDistributionScope[];
  readonly recommendations: readonly AssetReplacementRecommendation[];
  readonly matchedCount: number;
  readonly unmatchedCount: number;
  readonly allBlockersResolvable: boolean;
}

export interface AppliedAssetReplacement {
  readonly fromAssetId: string;
  readonly fromAssetNameKo: string;
  readonly toAssetId: string;
  readonly toAssetNameKo: string;
  readonly toVendor: string;
  readonly category: RightsBomAssetCategory;
  readonly jaccardSimilarity: number;
  readonly sharedTags: readonly string[];
  readonly usedInCutIds: readonly string[];
}

export interface SafeReplacementReauditResult {
  readonly initialAudit: RightsBomClearanceAuditResult;
  readonly replacementPlan: SafeReplacementPlan;
  readonly updatedProject: StudioEpisodeRightsBomProject;
  readonly appliedSwaps: readonly AppliedAssetReplacement[];
  readonly autoCreditedAssetIds: readonly string[];
  readonly unresolvedBlockedAssetIds: readonly string[];
  readonly reAudit: RightsBomClearanceAuditResult;
  readonly clearedAfterReaudit: boolean;
}

export interface RightsBomSvgRenderOptions {
  readonly width?: number;
  readonly titleKo?: string;
  readonly replacementPlan?: SafeReplacementPlan;
  readonly appliedSwaps?: readonly AppliedAssetReplacement[];
}
