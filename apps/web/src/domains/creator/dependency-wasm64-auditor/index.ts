/**
 * 실측 런타임 의존성 중복 감사 및 Rust·WASM64 드로잉 엔진 단계적 전환 플래너 진입점.
 */

export {
  AUDIT_MANIFEST_PATH,
  AUDIT_MEASURED_AT,
  AUDIT_ROOT_RUNTIME_DEP_COUNT,
  AUDIT_SCANNED_DIRECTORY,
  AUDIT_SCANNED_FILE_COUNT,
  AUDIT_SCOPE_KIND,
  DEPENDENCY_AUDIT_CATEGORIES,
  DEPENDENCY_CUTOVER_WAVES,
  DEPENDENCY_OVERLAP_GROUPS,
  MEASURED_DEPENDENCY_AUDIT_CATALOG,
  RUST_CORE_WASM_ARTIFACT_PATH,
  RUST_CORE_WASM_MEASURED_BYTES,
  UNMEASURED_AUDIT_BOUNDARIES,
  evaluateDependencyCutoverPlan,
  exportDependencyAuditJson,
  exportDependencyAuditMarkdown,
  getDependencyAuditEntry,
  type CutoverChecklistStep,
  type DependencyAuditCategory,
  type DependencyAuditEntry,
  type DependencyCategoryFilter,
  type DependencyCategoryMeta,
  type DependencyCutoverMetrics,
  type DependencyCutoverPlanInput,
  type DependencyCutoverPlanResult,
  type DependencyCutoverVerdict,
  type DependencyCutoverWave,
  type DependencyOverlapGroupId,
  type DependencyOverlapGroupMeta,
  type DependencyWaveMeta,
  type OverlapGroupResolutionStatus,
  type RustTargetLane,
  type SafariCompatibilityMode,
  type UnmeasuredAuditBoundary,
  type WaveConvergencePoint,
} from "./dependency-wasm64-audit-engine";

export {
  StudioDependencyWasm64AuditPanel,
  type StudioDependencyWasm64AuditPanelProps,
} from "./StudioDependencyWasm64AuditPanel";
