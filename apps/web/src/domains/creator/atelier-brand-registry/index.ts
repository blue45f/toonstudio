/**
 * Wave 60A — ToonStudio 고유 브랜드 아키텍처 네이밍 정본 및 자동 감사 엔진 공개 배럴.
 */

export {
  ALLOWED_EXTERNAL_REFERENCE_SCOPES,
  BRAND_ARCHITECTURE_LAYERS,
  BRAND_AUDIT_SAMPLE_PROBES,
  BRAND_REGISTRY_BASELINE_COMMIT,
  BRAND_REGISTRY_MEASURED_AT,
  BRAND_REGISTRY_SCHEMA_VERSION,
  EXTERNAL_NAME_DETECTION_RULES,
  LEGACY_PATH_MIGRATION_ENTRIES,
  MIGRATION_PHASES,
  REPOSITORY_SCAN_ROOTS,
  REPOSITORY_SCAN_SUMMARY,
  TOONSTUDIO_PROPRIETARY_BRANDS,
  auditNamingBatch,
  auditProprietaryBrandNaming,
  exportBrandGovernanceMarkdown,
  exportBrandRegistryJson,
  filterMigrationEntries,
  formatOklch,
  getBrandsByLayer,
  getProprietaryBrand,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  tokenizeNamingInput,
} from "./atelier-brand-registry-engine";

export type {
  AllowedExternalReferenceScope,
  AuditInputContext,
  BrandArchitectureLayerId,
  BrandArchitectureLayerSpec,
  BrandAuditOptions,
  BrandAuditSampleProbe,
  BrandAuditVerdict,
  BrandBatchAuditSummary,
  BrandGovernanceExportOptions,
  BrandNamingAuditResult,
  BrandNamingFinding,
  BrandRegistryExportBundle,
  BrandRegistryExportPayload,
  DetectionRuleCategory,
  ExternalNameDetectionRule,
  ExternalReferenceExemptionReason,
  LegacyPathMigrationEntry,
  MigrationFilterOptions,
  MigrationPhaseId,
  MigrationPhaseSpec,
  OklchColor,
  ProprietaryBrandId,
  ProprietaryBrandSpec,
  RepositoryScanRootId,
  RepositoryScanRootMeasurement,
  RepositoryScanSummary,
} from "./atelier-brand-registry-engine";

export { StudioAtelierBrandRegistryPanel } from "./StudioAtelierBrandRegistryPanel";
export type { StudioAtelierBrandRegistryPanelProps } from "./StudioAtelierBrandRegistryPanel";
