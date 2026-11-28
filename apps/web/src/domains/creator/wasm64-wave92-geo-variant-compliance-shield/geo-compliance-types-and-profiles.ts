/**
 * Wave 92 — 글로벌 동시 연재 지역별 심의·상표·개인정보 타입 계약 및 권역 정책 프로파일.
 */

export const GEO_REGION_CODES = [
  "KR-12+",
  "KR-15+",
  "JP-ALL",
  "US-T",
  "EU-12+",
  "MENA-G",
] as const;

export type GeoRegionCode = (typeof GEO_REGION_CODES)[number];
export type GeoTerritoryCode = "KR" | "JP" | "US" | "EU" | "MENA";

export const COMPLIANCE_CATEGORIES = [
  "gore-blood",
  "alcohol-tobacco",
  "weapon-violence",
  "wardrobe-exposure",
  "trademark-brand-signage",
  "pii-contact-identifier",
  "cultural-symbol",
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const GEO_VARIANT_REMEDIATION_TYPES = [
  "recolor-dark-ink",
  "luminance-glow-cover",
  "wardrobe-overlay",
  "parody-signage-swap",
  "mosaic-blur-mask",
  "pii-synthetic-placeholder",
] as const;

export type GeoVariantRemediationType =
  (typeof GEO_VARIANT_REMEDIATION_TYPES)[number];

/** 차단 항목 해제를 위한 최소 기하학적 덮개율 불변식(99.9%). */
export const REQUIRED_OVERRIDE_COVERAGE_RATIO = 0.999;

export interface ComplianceBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GeoRegionCategoryRule {
  readonly warnThreshold: number;
  readonly blockThreshold: number;
  readonly allowedRemediations: readonly GeoVariantRemediationType[];
  readonly preferredRemediation: GeoVariantRemediationType;
  readonly rationaleKo: string;
}

export interface GeoRegionPolicyProfile {
  readonly regionCode: GeoRegionCode;
  readonly territory: GeoTerritoryCode;
  readonly labelKo: string;
  readonly rules: Readonly<Record<ComplianceCategory, GeoRegionCategoryRule>>;
}

export interface GeoVariantOverrideLayer {
  readonly overrideId: string;
  readonly panelId: string;
  readonly targetRegions: readonly GeoRegionCode[];
  readonly remediationType: GeoVariantRemediationType;
  readonly bbox: ComplianceBoundingBox;
  readonly approvedByReviewer: boolean;
  readonly nonDestructiveToMaster: true;
  readonly reviewerId?: string;
  readonly approvedAtIso?: string;
  readonly label?: string;
  readonly zIndexOffset?: number;
  readonly payloadDigest?: string;
  readonly targetCategories?: readonly ComplianceCategory[];
}

export interface PanelTextItem {
  readonly textId: string;
  readonly panelId: string;
  readonly text: string;
  readonly bbox: ComplianceBoundingBox;
  readonly layerId?: string;
  readonly markedAsParodyOrSynthetic?: boolean;
  readonly allowedParodyTokens?: readonly string[];
}

export type PiiOrTrademarkDetectionKind =
  | "phone-number"
  | "email-address"
  | "korean-license-plate"
  | "trademark-brand";

export interface PanelTextScanFinding {
  readonly scanFindingId: string;
  readonly panelId: string;
  readonly textId: string;
  readonly layerId?: string;
  readonly category: "pii-contact-identifier" | "trademark-brand-signage";
  readonly detectionKind: PiiOrTrademarkDetectionKind;
  readonly matchedValue: string;
  readonly matchStart: number;
  readonly matchEnd: number;
  readonly severityScore: number;
  readonly bbox: ComplianceBoundingBox;
  readonly descriptionKo: string;
}

export interface PanelTextScanReport {
  readonly findings: readonly PanelTextScanFinding[];
  readonly scannedItemCount: number;
  readonly ignoredSyntheticCount: number;
  readonly piiCount: number;
  readonly trademarkCount: number;
}

export interface PanelComplianceAnnotation {
  readonly annotationId: string;
  readonly panelId: string;
  readonly category: ComplianceCategory;
  readonly severityScore: number;
  readonly bbox: ComplianceBoundingBox;
  readonly description: string;
  readonly sourceLayerId?: string;
}

export type MasterBaseLayerRole =
  | "background"
  | "lineart"
  | "flat-color"
  | "shading"
  | "dialogue-sfx"
  | "vfx"
  | "3d-prop";

export interface MasterBaseLayer {
  readonly layerId: string;
  readonly panelId: string;
  readonly role: MasterBaseLayerRole;
  readonly label: string;
  readonly contentDigest: string;
  readonly zIndex: number;
  readonly assetIds?: readonly string[];
}

export interface MasterEpisodePanel {
  readonly panelId: string;
  readonly sequenceIndex: number;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly baseLayers: readonly MasterBaseLayer[];
  readonly textItems?: readonly PanelTextItem[];
  readonly complianceAnnotations?: readonly PanelComplianceAnnotation[];
}

export interface MasterEpisodeDocument {
  readonly episodeId: string;
  readonly seriesId: string;
  readonly title: string;
  readonly masterRevision: number;
  readonly panels: readonly MasterEpisodePanel[];
  readonly variantOverrides: readonly GeoVariantOverrideLayer[];
}

export type ComplianceFindingSource = "manual-annotation" | "auto-text-scan";

export type ComplianceBlockingFailureReason =
  | "no-matching-override"
  | "unapproved-override"
  | "insufficient-bbox-coverage"
  | "invalid-bbox"
  | "non-destructive-violation"
  | "disallowed-remediation-type";

export interface RegionalComplianceFinding {
  readonly findingId: string;
  readonly panelId: string;
  readonly regionCode: GeoRegionCode;
  readonly category: ComplianceCategory;
  readonly source: ComplianceFindingSource;
  readonly severityScore: number;
  readonly warnThreshold: number;
  readonly blockThreshold: number;
  readonly status: "blocking" | "resolved-by-variant" | "warning";
  readonly bbox: ComplianceBoundingBox;
  readonly description: string;
  readonly coverageRatio: number;
  readonly requiredCoverageRatio: number;
  readonly appliedOverrideIds: readonly string[];
  readonly unapprovedOverrideIds: readonly string[];
  readonly failureReason?: ComplianceBlockingFailureReason;
  readonly recommendedRemediation: GeoVariantRemediationType;
  readonly remediationSuggestionKo: string;
}

export interface RegionalRemediationSuggestion {
  readonly findingId: string;
  readonly panelId: string;
  readonly category: ComplianceCategory;
  readonly recommendedRemediation: GeoVariantRemediationType;
  readonly currentCoverageRatio: number;
  readonly actionKo: string;
}

export type PanelRegionCellStatus = "OK" | "VAR" | "BLK";

export interface PanelRegionStatusCell {
  readonly panelId: string;
  readonly panelTitle: string;
  readonly regionCode: GeoRegionCode;
  readonly status: PanelRegionCellStatus;
  readonly blockingCount: number;
  readonly resolvedVariantCount: number;
  readonly warningCount: number;
}

export interface RegionalComplianceRegionReport {
  readonly regionCode: GeoRegionCode;
  readonly territory: GeoTerritoryCode;
  readonly labelKo: string;
  readonly exportAllowed: boolean;
  readonly blockingFindings: readonly RegionalComplianceFinding[];
  readonly resolvedFindings: readonly RegionalComplianceFinding[];
  readonly resolvedByVariantCount: number;
  readonly warningFindings: readonly RegionalComplianceFinding[];
  readonly remediationSuggestions: readonly RegionalRemediationSuggestion[];
  readonly panelStatuses: readonly PanelRegionStatusCell[];
}

export interface RegionalComplianceEvaluationOptions {
  readonly trademarkBlocklist?: readonly string[];
}

export interface RegionalComplianceMatrixReport {
  readonly episodeId: string;
  readonly seriesId: string;
  readonly episodeTitle: string;
  readonly masterRevision: number;
  readonly targetRegions: readonly GeoRegionCode[];
  readonly panelIds: readonly string[];
  readonly panelTitlesById: Readonly<Record<string, string>>;
  readonly textScanReport: PanelTextScanReport;
  readonly regions: readonly RegionalComplianceRegionReport[];
  readonly byRegion: Readonly<Partial<Record<GeoRegionCode, RegionalComplianceRegionReport>>>;
  readonly overallAllRegionsAllowed: boolean;
  readonly totalBlockingCount: number;
  readonly totalResolvedByVariantCount: number;
  readonly totalWarningCount: number;
}

const REGION_TO_TERRITORY: Readonly<Record<GeoRegionCode, GeoTerritoryCode>> = {
  "KR-12+": "KR",
  "KR-15+": "KR",
  "JP-ALL": "JP",
  "US-T": "US",
  "EU-12+": "EU",
  "MENA-G": "MENA",
};

export function regionCodeToTerritory(regionCode: GeoRegionCode): GeoTerritoryCode {
  return REGION_TO_TERRITORY[regionCode];
}

const TRADEMARK_RULE: GeoRegionCategoryRule = {
  warnThreshold: 10,
  blockThreshold: 20,
  allowedRemediations: ["parody-signage-swap", "mosaic-blur-mask"],
  preferredRemediation: "parody-signage-swap",
  rationaleKo: "실존 상표·간판 노출은 전 권역 패러디 치환 또는 가림 처리가 필요합니다.",
};

const PII_RULE: GeoRegionCategoryRule = {
  warnThreshold: 1,
  blockThreshold: 1,
  allowedRemediations: ["pii-synthetic-placeholder", "mosaic-blur-mask"],
  preferredRemediation: "pii-synthetic-placeholder",
  rationaleKo: "실제 연락처·이메일·차량번호는 전 권역에서 가상 표기로 교체해야 합니다.",
};

function buildProfile(
  regionCode: GeoRegionCode,
  labelKo: string,
  t: {
    readonly gore: readonly [number, number, GeoVariantRemediationType];
    readonly alcohol: readonly [number, number, GeoVariantRemediationType];
    readonly weapon: readonly [number, number, GeoVariantRemediationType];
    readonly wardrobe: readonly [number, number, GeoVariantRemediationType];
    readonly cultural: readonly [number, number, GeoVariantRemediationType];
  },
): GeoRegionPolicyProfile {
  return {
    regionCode,
    territory: REGION_TO_TERRITORY[regionCode],
    labelKo,
    rules: {
      "gore-blood": {
        warnThreshold: t.gore[0],
        blockThreshold: t.gore[1],
        allowedRemediations: ["recolor-dark-ink", "luminance-glow-cover", "mosaic-blur-mask"],
        preferredRemediation: t.gore[2],
        rationaleKo: "혈흔·신체 훼손 묘사는 권역 기준에 맞춰 먹색·광원 보정이 필요합니다.",
      },
      "alcohol-tobacco": {
        warnThreshold: t.alcohol[0],
        blockThreshold: t.alcohol[1],
        allowedRemediations: ["parody-signage-swap", "luminance-glow-cover", "mosaic-blur-mask"],
        preferredRemediation: t.alcohol[2],
        rationaleKo: "주류·흡연 연출은 저연령·MENA 권역에서 라벨 치환 또는 가림이 필요합니다.",
      },
      "weapon-violence": {
        warnThreshold: t.weapon[0],
        blockThreshold: t.weapon[1],
        allowedRemediations: ["luminance-glow-cover", "recolor-dark-ink", "mosaic-blur-mask"],
        preferredRemediation: t.weapon[2],
        rationaleKo: "흉기 직접 타격 장면은 권역 등급에 따라 광원 완화가 필요합니다.",
      },
      "wardrobe-exposure": {
        warnThreshold: t.wardrobe[0],
        blockThreshold: t.wardrobe[1],
        allowedRemediations: ["wardrobe-overlay", "luminance-glow-cover", "mosaic-blur-mask"],
        preferredRemediation: t.wardrobe[2],
        rationaleKo: "노출 수위가 권역 기준을 넘으면 의상 덧입힘 레이어로 가려야 합니다.",
      },
      "trademark-brand-signage": TRADEMARK_RULE,
      "pii-contact-identifier": PII_RULE,
      "cultural-symbol": {
        warnThreshold: t.cultural[0],
        blockThreshold: t.cultural[1],
        allowedRemediations: [
          "parody-signage-swap",
          "recolor-dark-ink",
          "luminance-glow-cover",
          "mosaic-blur-mask",
        ],
        preferredRemediation: t.cultural[2],
        rationaleKo: "민감 문양은 권역별 대체 심볼 레이어로 교체해야 합니다.",
      },
    },
  };
}

export const GEO_REGION_POLICY_PROFILES: Readonly<Record<GeoRegionCode, GeoRegionPolicyProfile>> = {
  "KR-12+": buildProfile("KR-12+", "한국 12세 이용가", {
    gore: [20, 45, "recolor-dark-ink"],
    alcohol: [20, 40, "parody-signage-swap"],
    weapon: [25, 50, "luminance-glow-cover"],
    wardrobe: [25, 50, "wardrobe-overlay"],
    cultural: [20, 40, "parody-signage-swap"],
  }),
  "KR-15+": buildProfile("KR-15+", "한국 15세 이용가", {
    gore: [40, 75, "recolor-dark-ink"],
    alcohol: [35, 75, "parody-signage-swap"],
    weapon: [45, 80, "luminance-glow-cover"],
    wardrobe: [45, 75, "wardrobe-overlay"],
    cultural: [20, 40, "parody-signage-swap"],
  }),
  "JP-ALL": buildProfile("JP-ALL", "일본 전연령", {
    gore: [25, 50, "luminance-glow-cover"],
    alcohol: [30, 60, "parody-signage-swap"],
    weapon: [25, 55, "luminance-glow-cover"],
    wardrobe: [30, 55, "wardrobe-overlay"],
    cultural: [30, 60, "parody-signage-swap"],
  }),
  "US-T": buildProfile("US-T", "미국 Teen (13+)", {
    gore: [25, 55, "recolor-dark-ink"],
    alcohol: [25, 50, "parody-signage-swap"],
    weapon: [35, 65, "luminance-glow-cover"],
    wardrobe: [25, 50, "wardrobe-overlay"],
    cultural: [25, 50, "parody-signage-swap"],
  }),
  "EU-12+": buildProfile("EU-12+", "유럽 12+", {
    gore: [25, 50, "recolor-dark-ink"],
    alcohol: [30, 55, "parody-signage-swap"],
    weapon: [30, 55, "luminance-glow-cover"],
    wardrobe: [35, 60, "wardrobe-overlay"],
    cultural: [20, 40, "parody-signage-swap"],
  }),
  "MENA-G": buildProfile("MENA-G", "중동·북아프리카 전체이용가", {
    gore: [15, 30, "luminance-glow-cover"],
    alcohol: [10, 20, "luminance-glow-cover"],
    weapon: [15, 35, "luminance-glow-cover"],
    wardrobe: [10, 25, "wardrobe-overlay"],
    cultural: [15, 30, "parody-signage-swap"],
  }),
};

export const DEFAULT_TRADEMARK_BLOCKLIST: readonly string[] = [
  "Starbucks", "스타벅스", "Coca-Cola", "코카콜라", "McDonald's", "맥도날드",
  "Nike", "나이키", "Samsung", "삼성전자", "Apple", "iPhone", "Chanel", "샤넬",
  "Gucci", "구찌", "Louis Vuitton", "Rolex", "Mercedes-Benz", "BMW", "Ferrari",
  "Nintendo", "PlayStation", "Disney", "Instagram", "YouTube", "KakaoTalk", "카카오톡",
];

export const REMEDIATION_LABEL_KO: Readonly<Record<GeoVariantRemediationType, string>> = {
  "recolor-dark-ink": "먹색·흑백 리컬러 레이어",
  "luminance-glow-cover": "광원·후광 덮개 레이어",
  "wardrobe-overlay": "의상 덧입힘 레이어",
  "parody-signage-swap": "패러디 간판·라벨 치환 레이어",
  "mosaic-blur-mask": "모자이크·블러 마스크",
  "pii-synthetic-placeholder": "가상 연락처·표기 치환 레이어",
};
