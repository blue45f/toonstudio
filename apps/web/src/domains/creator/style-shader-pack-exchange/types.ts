/**
 * 팀 화풍 · 커스텀 브러시 · 노코드 WGSL 셰이더 팩 교환(`.tspack.json`) 도메인 타입 계약.
 *
 * - `auto-style-dna-pipeline` 화풍 DNA 스키마, `brush-custom-lab` `.tsbrush.json` 레시피,
 *   `nocode-shader-grid` WGSL 셰이더 계약을 구조적으로 호환한다.
 * - 모든 필드와 배열은 불변(`readonly`) 계약으로 정의하며 외부 네트워크 호출이나 Web Storage에 의존하지 않는다.
 */

export const TSPACK_FORMAT_ID = "toonstudio.team-style-shader-pack" as const;
export const TSPACK_SCHEMA_VERSION = 1 as const;
export const TSPACK_HASH_ALGORITHM = "sha256" as const;
export const TSPACK_CANONICALIZATION_ID = "ts-canonical-json-v1" as const;
export const TSBRUSH_COMPAT_FORMAT_ID = "toonstudio.custom-brush" as const;
export const TSBRUSH_COMPAT_SCHEMA_VERSION = 1 as const;
export const ROYALTY_TOTAL_BPS = 10_000 as const;
export const WGSL_UNIFORM_BYTE_LENGTH = 96 as const;
export const MAX_TSPACK_JSON_BYTES = 524_288 as const;

export const PACK_SECTION_KEYS = [
  "metadata",
  "styleDna",
  "brushes",
  "shaders",
  "rightsBom",
] as const;

export type PackSectionKey = (typeof PACK_SECTION_KEYS)[number];

export const PACK_TEMPLATE_IDS = [
  "romance-fantasy-watercolor-cel",
  "action-noir-ink",
  "slice-of-life-pastel-atelier",
] as const;

export type TeamStylePackTemplateId = (typeof PACK_TEMPLATE_IDS)[number];

// ============================================================================
// 1. Auto Style DNA Signature (auto-style-dna-pipeline 스키마 호환)
// ============================================================================

export type PaletteSwatchRole = "base" | "midtone" | "shadow" | "highlight" | "accent";

export interface OklchPaletteSwatch {
  readonly L: number;
  readonly C: number;
  readonly H: number;
  readonly share: number;
  readonly role: PaletteSwatchRole;
  readonly cssOklch: string;
}

export interface LineworkThicknessHistogram {
  readonly hairlineCount: number;
  readonly mediumCount: number;
  readonly boldCount: number;
  readonly heavyCount: number;
}

export interface LineworkThicknessProfile {
  readonly meanPx: number;
  readonly medianPx: number;
  readonly p10Px: number;
  readonly p90Px: number;
  readonly stdDevPx: number;
  readonly inkCoverageRatio: number;
  readonly taperVarianceRatio: number;
  readonly sampledLinePixels: number;
  readonly histogram: LineworkThicknessHistogram;
}

export interface ShadowTemperatureProfile {
  readonly meanLightness: number;
  readonly meanChroma: number;
  readonly meanHueDeg: number;
  readonly meanA: number;
  readonly meanB: number;
  readonly coolWarmIndex: number;
  readonly estimatedKelvin: number;
  readonly highlightMeanLightness: number;
  readonly highlightMeanHueDeg: number;
  readonly shadowPixelRatio: number;
  readonly cssOklch: string;
}

export interface ContrastStepsProfile {
  readonly p05L: number;
  readonly p25L: number;
  readonly p50L: number;
  readonly p75L: number;
  readonly p95L: number;
  readonly dynamicRange: number;
  readonly midtoneContrast: number;
  readonly rmsContrast: number;
  readonly detectedToneSteps: number;
}

export type ScreentonePatternKind = "none" | "halftone-dot" | "crosshatch" | "soft-grain";

export interface ScreentoneDensityProfile {
  readonly coverageRatio: number;
  readonly meanDotDensity: number;
  readonly alternatingRateX: number;
  readonly alternatingRateY: number;
  readonly estimatedLpiFrequency: number;
  readonly patternKind: ScreentonePatternKind;
}

export interface TeamStyleDnaSignature {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly artistName: string;
  readonly version: number;
  readonly sampleCount: number;
  readonly updatedAtIso: string;
  readonly dnaFingerprint: string;
  readonly linework: LineworkThicknessProfile;
  readonly dominantPalette: readonly OklchPaletteSwatch[];
  readonly shadowTemperature: ShadowTemperatureProfile;
  readonly contrast: ContrastStepsProfile;
  readonly screentone: ScreentoneDensityProfile;
}

// ============================================================================
// 2. Custom Brush Preset Bundle (.tsbrush.json 호환)
// ============================================================================

export const PACK_BRUSH_TIP_IDS = [
  "graphite-pencil-6b",
  "wax-crayon-block",
  "square-charcoal",
  "soft-pastel-chalk",
  "sable-watercolor",
  "hog-bristle-oil",
  "gpen-nib-elastic",
  "marker-chisel-felt",
] as const;

export type PackBrushTipId = (typeof PACK_BRUSH_TIP_IDS)[number];

export const PACK_PAPER_TEXTURE_IDS = [
  "smooth-bristol",
  "cold-press-watercolor",
  "rough-cotton",
  "manga-kent",
  "linen-canvas",
] as const;

export type PackPaperTextureId = (typeof PACK_PAPER_TEXTURE_IDS)[number];

export const PACK_BRUSH_MEDIA_CATEGORY_IDS = [
  "pencil",
  "crayon",
  "charcoal",
  "pastel",
  "gpen-ink",
  "watercolor",
  "oil-impasto",
  "acrylic-gouache",
  "marker",
  "airbrush",
  "blending-stump",
  "kneaded-eraser",
] as const;

export type PackBrushMediaCategoryId = (typeof PACK_BRUSH_MEDIA_CATEGORY_IDS)[number];

export interface PackRgbPigment {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PackBrushRecipe {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly baseCatalogUid: string | null;
  readonly tipId: PackBrushTipId;
  readonly paperTextureId: PackPaperTextureId;
  readonly mediaCategory: PackBrushMediaCategoryId;
  readonly radiusPx: number;
  readonly spacingRatio: number;
  readonly flow01: number;
  readonly opacity01: number;
  readonly paperGrainStrength01: number;
  readonly dryOutRate01: number;
  readonly initialPaintLoad01: number;
  readonly initialMoisture01: number;
  readonly kmMixStrength01: number;
  readonly wetEdgeBloom01: number;
  readonly taper01: number;
  readonly primaryColor: PackRgbPigment;
  readonly underlayerColor: PackRgbPigment;
  readonly seed: number;
}

export interface SignedPackBrushEntry {
  readonly format: typeof TSBRUSH_COMPAT_FORMAT_ID;
  readonly schemaVersion: typeof TSBRUSH_COMPAT_SCHEMA_VERSION;
  readonly fingerprintAlgorithm: typeof TSPACK_HASH_ALGORITHM;
  readonly fingerprintSha256: string;
  readonly recipe: PackBrushRecipe;
}

// ============================================================================
// 3. No-Code WGSL Shader Recipes (@compute / @fragment)
// ============================================================================

export type PackShaderStageMode = "compute" | "fragment";

export type PackTextureStyleKind =
  | "watercolor-paper"
  | "neon-halftone"
  | "oil-impasto"
  | "cel-2step"
  | "pencil-hatch"
  | "film-grain"
  | "clean-studio";

export type PackLightingStyleKind =
  | "warm-rim"
  | "cyber-neon"
  | "directional-key"
  | "cel-hard-shadow"
  | "soft-ambient"
  | "moonlight-backrim";

export interface PackUnitRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PackWgslUniformSpec {
  readonly styleId: number;
  readonly lightingId: number;
  readonly keyColor: PackUnitRgb;
  readonly rimColor: PackUnitRgb;
  readonly shadowColor: PackUnitRgb;
  readonly accentColor: PackUnitRgb;
  readonly intensity: number;
  readonly rimStrength: number;
  readonly shadowFloor: number;
  readonly saturationBoost: number;
  readonly grainScale: number;
  readonly patternParam: number;
  readonly reliefStrength: number;
  readonly seedNorm: number;
  readonly uniformByteLength: typeof WGSL_UNIFORM_BYTE_LENGTH;
}

export interface PackWgslValidationSummary {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly stage: PackShaderStageMode;
  readonly entryPoint: string;
  readonly lineCount: number;
  readonly bindingCount: number;
  readonly uniformByteLength: number;
}

export interface TeamWgslShaderRecipeInput {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly promptKo: string;
  readonly promptEn: string;
  readonly stage: PackShaderStageMode;
  readonly style: PackTextureStyleKind;
  readonly lighting: PackLightingStyleKind;
  readonly uniforms: PackWgslUniformSpec;
  readonly wgslSource: string;
}

export interface TeamWgslShaderRecipe extends TeamWgslShaderRecipeInput {
  readonly wgslSha256: string;
  readonly validation: PackWgslValidationSummary;
}

// ============================================================================
// 4. Rights BOM & License Attribution
// ============================================================================

export type PackLicenseTier =
  | "commercial-team"
  | "commercial-enterprise"
  | "editorial-noncommercial"
  | "internal-draft-only";

export type RoyaltyContributorRole =
  | "lead-artist"
  | "color-director"
  | "shader-td"
  | "brush-smith"
  | "studio-org";

export interface RoyaltyContributor {
  readonly handle: string;
  readonly displayName: string;
  readonly role: RoyaltyContributorRole;
  readonly shareBps: number;
}

export type ProvenanceSourceKind =
  | "original-inhouse"
  | "cc0-public-domain"
  | "cc-by-4.0"
  | "mit-oss-kernel"
  | "licensed-commercial";

export interface ThirdPartyAssetProvenance {
  readonly assetId: string;
  readonly title: string;
  readonly sourceKind: ProvenanceSourceKind;
  readonly licenseSpdx: string;
  readonly attributionText: string;
  readonly commercialCleared: boolean;
  readonly originHashSha256: string;
}

export type PackTerritoryScope = "global" | "kr-jp-na" | "internal-team-only";

export interface PackRightsBom {
  readonly ownerTeamHandle: string;
  readonly ownerTeamName: string;
  readonly licenseTier: PackLicenseTier;
  readonly commercialUseAllowed: boolean;
  readonly redistributionAllowed: boolean;
  readonly attributionRequired: boolean;
  readonly territoryScope: PackTerritoryScope;
  readonly royaltySplits: readonly RoyaltyContributor[];
  readonly provenance: readonly ThirdPartyAssetProvenance[];
  readonly auditNote: string;
}

// ============================================================================
// 5. Pack Metadata, Signed Envelope, Verification, Diff, Import Planner
// ============================================================================

export interface TeamStylePackMetadata {
  readonly packId: string;
  readonly slug: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly version: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly genreTag: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly tags: readonly string[];
}

export type PackSectionDigests = Readonly<Record<PackSectionKey, string>>;

export interface TeamStylePackManifest {
  readonly algorithm: typeof TSPACK_HASH_ALGORITHM;
  readonly canonicalization: typeof TSPACK_CANONICALIZATION_ID;
  readonly sectionDigests: PackSectionDigests;
  readonly manifestRootSha256: string;
  readonly packSealSha256: string;
  readonly signedByHandle: string;
  readonly signedAtIso: string;
}

export interface CreateTeamStylePackInput {
  readonly metadata: TeamStylePackMetadata;
  readonly styleDna: TeamStyleDnaSignature;
  readonly brushes: readonly PackBrushRecipe[];
  readonly shaders: readonly TeamWgslShaderRecipeInput[];
  readonly rightsBom: PackRightsBom;
  readonly signedByHandle: string;
  readonly signedAtIso?: string;
}

export interface SignedTeamStylePack {
  readonly format: typeof TSPACK_FORMAT_ID;
  readonly schemaVersion: typeof TSPACK_SCHEMA_VERSION;
  readonly metadata: TeamStylePackMetadata;
  readonly styleDna: TeamStyleDnaSignature;
  readonly brushes: readonly SignedPackBrushEntry[];
  readonly shaders: readonly TeamWgslShaderRecipe[];
  readonly rightsBom: PackRightsBom;
  readonly manifest: TeamStylePackManifest;
}

export interface SectionIntegrityDiagnostic {
  readonly section: PackSectionKey;
  readonly matched: boolean;
  readonly expectedSha256: string;
  readonly actualSha256: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface ElementDigestMismatch {
  readonly id: string;
  readonly expectedSha256: string;
  readonly actualSha256: string;
}

export interface TeamStylePackIntegrityReport {
  readonly valid: boolean;
  readonly schemaValid: boolean;
  readonly manifestRootMatched: boolean;
  readonly packSealMatched: boolean;
  readonly expectedManifestRootSha256: string;
  readonly actualManifestRootSha256: string;
  readonly expectedPackSealSha256: string;
  readonly actualPackSealSha256: string;
  readonly mismatchedSections: readonly PackSectionKey[];
  readonly sectionDiagnostics: readonly SectionIntegrityDiagnostic[];
  readonly brushDigestMismatches: readonly ElementDigestMismatch[];
  readonly shaderDigestMismatches: readonly ElementDigestMismatch[];
  readonly shaderValidationErrors: readonly { readonly shaderId: string; readonly errors: readonly string[] }[];
  readonly rightsTotalBps: number;
  readonly rightsIssues: readonly string[];
  readonly schemaErrors: readonly string[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface PaletteRoleDiffEntry {
  readonly role: PaletteSwatchRole;
  readonly baseCssOklch: string | null;
  readonly targetCssOklch: string | null;
  readonly deltaE: number;
}

export interface TeamStylePackDiff {
  readonly basePackId: string;
  readonly targetPackId: string;
  readonly baseVersion: string;
  readonly targetVersion: string;
  readonly identical: boolean;
  readonly changedSections: readonly PackSectionKey[];
  readonly styleDna: {
    readonly changed: boolean;
    readonly lineMeanPxDelta: number;
    readonly shadowKelvinDelta: number;
    readonly toneStepsDelta: number;
    readonly screentoneDensityDelta: number;
    readonly screentonePatternChanged: boolean;
    readonly paletteMeanDeltaE: number;
    readonly paletteRoleDiffs: readonly PaletteRoleDiffEntry[];
  };
  readonly brushes: {
    readonly changed: boolean;
    readonly addedIds: readonly string[];
    readonly removedIds: readonly string[];
    readonly modified: readonly { readonly id: string; readonly nameKo: string; readonly changedFields: readonly string[] }[];
    readonly unchangedIds: readonly string[];
  };
  readonly shaders: {
    readonly changed: boolean;
    readonly addedIds: readonly string[];
    readonly removedIds: readonly string[];
    readonly modified: readonly {
      readonly id: string;
      readonly nameKo: string;
      readonly wgslChanged: boolean;
      readonly stageChanged: boolean;
      readonly uniformFieldsChanged: readonly string[];
    }[];
    readonly unchangedIds: readonly string[];
  };
  readonly rightsBom: {
    readonly changed: boolean;
    readonly licenseTierChanged: boolean;
    readonly baseLicenseTier: PackLicenseTier;
    readonly targetLicenseTier: PackLicenseTier;
    readonly commercialAllowedChanged: boolean;
    readonly royaltySplitChanged: boolean;
    readonly provenanceAddedIds: readonly string[];
    readonly provenanceRemovedIds: readonly string[];
    readonly provenanceModifiedIds: readonly string[];
  };
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export type ImportConflictStrategy = "keep-local" | "overwrite" | "fork-versioned";
export type StudioTargetUsageMode = "commercial-publication" | "editorial-noncommercial" | "internal-review";
export type ImportPlannedActionKind = "install-new" | "keep-local" | "overwrite" | "fork-versioned";

export interface ExistingStudioPresetIndex {
  readonly styleDnaSeriesIds: readonly string[];
  readonly brushIds: readonly string[];
  readonly shaderIds: readonly string[];
}

export interface TeamStylePackImportOptions {
  readonly existingPresets: ExistingStudioPresetIndex;
  readonly conflictStrategy: ImportConflictStrategy;
  readonly targetUsageMode: StudioTargetUsageMode;
  readonly requireCommercialLicense?: boolean;
  readonly forkSuffix?: string;
}

export interface ImportPlannedItem {
  readonly domain: "style-dna" | "brush" | "shader";
  readonly sourceId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly collided: boolean;
  readonly action: ImportPlannedActionKind;
  readonly resolvedId: string;
}

export type ImportBlockingCode =
  | "INTEGRITY_FAILED"
  | "COMMERCIAL_LICENSE_INCOMPATIBLE"
  | "THIRD_PARTY_PROVENANCE_UNCLEARED"
  | "INTERNAL_DRAFT_NOT_PUBLISHABLE"
  | "ROYALTY_SPLIT_INVALID";

export interface ImportBlockingIssue {
  readonly code: ImportBlockingCode;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface RightsCompatibilityAssessment {
  readonly compatible: boolean;
  readonly targetUsageMode: StudioTargetUsageMode;
  readonly licenseTier: PackLicenseTier;
  readonly commercialUseAllowed: boolean;
  readonly unclearedProvenanceIds: readonly string[];
  readonly royaltyTotalBps: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface TeamStylePackImportPlan {
  readonly packId: string;
  readonly packSealSha256: string;
  readonly strategy: ImportConflictStrategy;
  readonly canApply: boolean;
  readonly integrity: TeamStylePackIntegrityReport;
  readonly rightsCompatibility: RightsCompatibilityAssessment;
  readonly blockingIssues: readonly ImportBlockingIssue[];
  readonly warnings: readonly string[];
  readonly items: readonly ImportPlannedItem[];
  readonly counts: {
    readonly total: number;
    readonly collisions: number;
    readonly installNew: number;
    readonly keepLocal: number;
    readonly overwrite: number;
    readonly forkVersioned: number;
  };
}

export type TsPackParseResult =
  | { readonly ok: true; readonly pack: SignedTeamStylePack; readonly integrity: TeamStylePackIntegrityReport }
  | {
      readonly ok: false;
      readonly errorCode: "PAYLOAD_TOO_LARGE" | "INVALID_JSON" | "INVALID_SCHEMA";
      readonly messageKo: string;
      readonly messageEn: string;
    };

export type TamperSimulationTarget = "palette" | "brush" | "wgsl" | "license";
