/**
 * Wasm64 Wave 92 공개 배럴 진입점 (`wasm64-wave92-geo-variant-compliance-shield`).
 *
 * - `regional-compliance-policy-engine`: 6개 글로벌 권역 심의 임계치 평가,
 *   전화번호·이메일·한국 차량번호판·상표명 자동 스캐너, 비파괴 변형 레이어 기하 덮개율(>= 0.999) 검증
 * - `non-destructive-geo-variant-compositor`: 순수 동기 ES2017 FIPS 180-4 SHA-256,
 *   단일 마스터 비파괴 권역 레이어 합성, Rights BOM 권역·상업·만료 fail-closed 게이트, 권역 간 차분
 * - `compliance-matrix-svg-and-audit`: 인쇄 대응 색각안전 SVG 심의 매트릭스 및 한국어 감사 요약
 */

export {
  COMPLIANCE_CATEGORIES,
  DEFAULT_TRADEMARK_BLOCKLIST,
  GEO_REGION_CODES,
  GEO_REGION_POLICY_PROFILES,
  GEO_VARIANT_REMEDIATION_TYPES,
  REQUIRED_OVERRIDE_COVERAGE_RATIO,
  computeBoundingBoxCoverageRatio,
  computeUnionBoundingBoxCoverageRatio,
  evaluateRegionalComplianceMatrix,
  isValidBoundingBox,
  regionCodeToTerritory,
  scanPanelTextForPiiAndTrademarks,
  type ComplianceBlockingFailureReason,
  type ComplianceBoundingBox,
  type ComplianceCategory,
  type ComplianceFindingSource,
  type GeoRegionCategoryRule,
  type GeoRegionCode,
  type GeoRegionPolicyProfile,
  type GeoTerritoryCode,
  type GeoVariantOverrideLayer,
  type GeoVariantRemediationType,
  type MasterBaseLayer,
  type MasterBaseLayerRole,
  type MasterEpisodeDocument,
  type MasterEpisodePanel,
  type PanelComplianceAnnotation,
  type PanelRegionCellStatus,
  type PanelRegionStatusCell,
  type PanelTextItem,
  type PanelTextScanFinding,
  type PanelTextScanReport,
  type PiiOrTrademarkDetectionKind,
  type RegionalComplianceEvaluationOptions,
  type RegionalComplianceFinding,
  type RegionalComplianceMatrixReport,
  type RegionalComplianceRegionReport,
  type RegionalRemediationSuggestion,
} from "./regional-compliance-policy-engine";

export {
  canonicalizeGeoManifestJson,
  compileRegionalDeliveryManifest,
  diffRegionalDeliveryManifests,
  evaluateRightsBomForRegion,
  sha256GeoManifestHex,
  verifyRegionalDeliveryManifestIntegrity,
  type CompileRegionalDeliveryOptions,
  type RegionalDeliveryBlockingReason,
  type RegionalDeliveryExportDecision,
  type RegionalDeliveryManifest,
  type RegionalDeliveryManifestDiff,
  type RegionalDeliveryManifestIntegrityResult,
  type RegionalPanelDiffEntry,
  type ResolvedDeliveryLayerEntry,
  type ResolvedDeliveryPanelStack,
  type RightsBomAssetEntry,
  type RightsBomAssetKind,
  type RightsBomBlocker,
  type RightsBomBlockerCode,
  type RightsBomRegionEvaluation,
} from "./non-destructive-geo-variant-compositor";

export {
  escapeComplianceSvgXml,
  renderComplianceCoverageMatrixSvg,
  summarizeGeoComplianceAuditKo,
  type ComplianceMatrixSvgOptions,
  type GeoComplianceAuditSummaryOptions,
} from "./compliance-matrix-svg-and-audit";
