/**
 * Wasm64 Wave 117 공개 배럴 진입점 (`wasm64-wave117-layer-tree-hygiene-and-vram-diet-compiler`).
 *
 * - `layer-tree-hygiene-types`: 웹툰 원고 레이어 노드·역할 코드·안전 장벽·VRAM/OPFS 메트릭 계약
 * - `layer-tree-auditor-and-normalizer`: 순환/고아 트리 fail-closed 감사, 9단계 한국 스튜디오 코드명 자동 정규화,
 *   빈·숨김 대용량 레이어 및 고아/중복 클리핑 마스크 진단
 * - `safe-layer-merge-and-vram-diet`: Porter-Duff 합성 대수 불변식 안전 병합, 타일-희소 VRAM/OPFS 절감 산출,
 *   순수 ES2017 FIPS 180-4 SHA-256 매니페스트 지문 생성
 * - `layer-hygiene-svg-and-report`: 인쇄 안전 순수 OKLCH 다이어그램 SVG 및 한국어 어시스턴트 인계 리포트
 */

export {
  DEFAULT_HIDDEN_HEAVY_VRAM_THRESHOLD_BYTES,
  LAYER_OPFS_HEADER_OVERHEAD_BYTES,
  NON_DESTRUCTIVE_LAYER_KINDS,
  STUDIO_ROLE_ORDER,
  STUDIO_ROLE_SPECS,
  TILE_PAGE_TABLE_ENTRY_BYTES,
  type CompiledLayerManifestNode,
  type DietPlanStatus,
  type LayerBlendMode,
  type LayerDietActionKind,
  type LayerDietDecision,
  type LayerHygieneIssue,
  type LayerHygieneIssueCode,
  type LayerHygieneSeverity,
  type LayerNodeKind,
  type LayerRenameEntry,
  type LayerRenameReason,
  type LayerTreeAuditOptions,
  type LayerTreeHygieneAuditResult,
  type LayerTreeNodeInput,
  type LayerVramDietCompileOptions,
  type LayerVramDietPlanResult,
  type PrunedEmptyLayerRecord,
  type SafeMergeGroup,
  type SafetyBarrierReasonCode,
  type SafetyBarrierRecord,
  type SanitizedLayerNode,
  type StudioLayerRole,
  type StudioRoleSpec,
  type TileOverlapEstimationMode,
  type TreeIntegrityStatus,
  type VramAndOpfsMetrics,
} from "./layer-tree-hygiene-types";

export {
  auditLayerTreeHygiene,
  inferStudioLayerRole,
  isCanonicalStudioLayerName,
  isMeaninglessLayerName,
} from "./layer-tree-auditor-and-normalizer";

export {
  canonicalizeLayerManifestJson,
  compileLayerVramDietPlan,
  sha256LayerManifestHex,
} from "./safe-layer-merge-and-vram-diet";

export {
  escapeXmlText,
  renderLayerTreeHygieneSvg,
  summarizeLayerTreeHygieneKo,
  type LayerHandoverVerdict,
  type LayerHygieneSvgOptions,
  type LayerHygieneSvgTheme,
  type LayerTreeHygieneReportKo,
} from "./layer-hygiene-svg-and-report";
