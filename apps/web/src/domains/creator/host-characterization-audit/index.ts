/**
 * 호스트 특성화 감사(Host Characterization Audit) 공개 진입점.
 *
 * - `monolith-decomposition-analyzer`: 거대 스튜디오 모놀리스(`StudioCuttoonEditorHost.tsx`,
 *   `scripts/verify-studio-*.mts` 등)의 정적 도메인 클러스터·훅 그룹·상태 전이 클러스터·순수 헬퍼·
 *   유향 그래프 모듈성 점수(Q)·Strangler-Fig 추출 순서 분석 및 Wave 1~2 레거시 npm 래칫 감사.
 *
 * 주의: 초기 Studio 진입 번들에 영향을 주지 않도록 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  analyzeMonolithDecomposition,
  auditLegacyDependencyRatchet,
  classifyImportCategory,
  classifySourceFileRole,
  computeFnv1a32Hex,
  countSourceLines,
  extractModuleImportRecords,
  LEGACY_WASM64_PACKAGE_TARGETS,
  LEGACY_WASM64_RATCHET_PACKAGES,
  normalizeBarePackageName,
  scoreDomainByText,
  STUDIO_MONOLITH_DOMAINS,
  type DependencyImportFinding,
  type DependencyRatchetAuditInput,
  type DependencyRatchetAuditReport,
  type DomainClusterSummary,
  type ExtractedImportRecord,
  type HookGroupCluster,
  type ImportCategory,
  type ImportSyntaxKind,
  type LegacyPackageTargetMeta,
  type LegacyWasm64PackageName,
  type MonolithDecompositionReport,
  type MonolithDomainDescriptor,
  type MonolithDomainId,
  type MonolithImportNode,
  type MonolithSourceInput,
  type PackageManifestInput,
  type PackageRatchetAuditStatus,
  type PureHelperCandidate,
  type PureHelperPurityTier,
  type SourceFileEntry,
  type SourceFileRole,
  type StateTransitionCluster,
  type StranglerExtractionPhase,
  type StranglerFigExtractionStep,
} from "./monolith-decomposition-analyzer";
