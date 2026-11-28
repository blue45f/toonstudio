/**
 * Wasm64 Wave 144 공개 배럴 진입점 (`wasm64-wave144-studio-rights-bom-derivative-clearance-engine`).
 *
 * - `rights-bom-types`: Rights BOM 어셋·5대 상업 배포 범위·7종 라이선스 등급·감사 및 대체 계약 타입
 * - `rights-bom-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 정규 JSON 직렬화
 * - `rights-bom-clearance-engine`: 6대 상업 라이선스 fail-closed 감사기 및 크레딧 컴파일러
 * - `rights-bom-safe-swap-matcher`: 태그 자카드 유사도 기반 안전 대체 어셋 매칭 및 재감사 솔버
 * - `rights-bom-svg-and-report`: 순수 OKLCH 권리 매트릭스 SVG 렌더러 및 한국어 법무·PD 출고 보고서
 */

export {
  COMMERCIAL_DISTRIBUTION_SCOPES,
  COMMERCIAL_SCOPE_LABELS_KO,
  COMMERCIAL_SCOPE_SHORT_LABELS_KO,
  LICENSE_TIERS,
  LICENSE_TIER_LABELS_KO,
  RIGHTS_BOM_ASSET_CATEGORIES,
  RIGHTS_BOM_CATEGORY_LABELS_KO,
  RIGHTS_BOM_VIOLATION_CODES,
  VIOLATION_CODE_LABELS_KO,
  type AppliedAssetReplacement,
  type AssetReplacementRecommendation,
  type AssetRightsAuditRecord,
  type AttributionCreditEntry,
  type CommercialDistributionScope,
  type CompiledAttributionCreditsResult,
  type LicenseTier,
  type RightsBomAssetCategory,
  type RightsBomAssetEntry,
  type RightsBomAuditOptions,
  type RightsBomClearanceAuditResult,
  type RightsBomSeverity,
  type RightsBomSvgRenderOptions,
  type RightsBomViolation,
  type RightsBomViolationCode,
  type SafeCatalogAssetEntry,
  type SafeReplacementCandidateScore,
  type SafeReplacementOptions,
  type SafeReplacementPlan,
  type SafeReplacementReauditResult,
  type ScopeMatrixCellState,
  type StudioEpisodeRightsBomProject,
} from "./rights-bom-types";

export {
  canonicalizeRightsBomJson,
  computeRightsBomCertificateSha256Hex,
  encodeRightsBomUtf8Bytes,
  sha256RightsBomBytesHex,
  sha256RightsBomUtf8Hex,
} from "./rights-bom-sha256";

export {
  DEFAULT_EXPIRING_SOON_WINDOW_DAYS,
  auditEpisodeRightsBomClearance,
  compileRequiredAttributionCreditsKo,
  computeTagJaccardSimilarity,
  isAttributionMandatory,
  isEditorialOnlyLicenseTier,
  isNonCommercialLicenseTier,
  normalizeAssetTags,
  parseIsoDateToUtcDayNumber,
  resolveEffectiveAllowedScopes,
  resolveExpiringWindowDays,
  type TagJaccardResult,
} from "./rights-bom-clearance-engine";

export {
  DEFAULT_MAX_REPLACEMENT_ALTERNATIVES,
  applySafeReplacementsAndReaudit,
  recommendSafeAssetReplacements,
} from "./rights-bom-safe-swap-matcher";

export {
  escapeRightsBomXml,
  renderRightsBomClearanceSvg,
  summarizeRightsBomClearanceKo,
} from "./rights-bom-svg-and-report";
