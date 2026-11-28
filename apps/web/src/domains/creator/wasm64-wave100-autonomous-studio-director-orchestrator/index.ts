/**
 * Wasm64 Wave 100 공개 배럴 진입점 (`wasm64-wave100-autonomous-studio-director-orchestrator`).
 *
 * - `episode-production-dag-scheduler`: 5단계·10스테이지 크로스-웨이브 표준 DAG, 순환 검출,
 *   병렬 웨이브 그룹핑, CPM 임계 경로 스케줄러, 재개 가능 체크포인트 런타임
 * - `master-release-gatekeeper-and-certificate`: 순수 동기 ES2017 SHA-256, 7대 불변식 Fail-Closed
 *   출고 게이트키퍼, 5대 멀티 서피스 판정, 위변조 검출 마스터 출고 인증서
 * - `production-director-svg-and-audit`: OKLCH 고대비 DAG/간트 SVG 및 자연스러운 한국어 출고 보고서
 */

export {
  CANONICAL_PRODUCTION_STAGE_IDS,
  PRODUCTION_PHASES,
  PipelineCheckpointIntegrityError,
  ProductionDagCycleError,
  ProductionDagValidationError,
  computeCriticalPathSchedule,
  computeDagTopologySha256,
  computeParallelExecutionWaves,
  createCanonicalWebtoonProductionDag,
  executeProductionPipeline,
  exportPipelineCheckpoint,
  resumeProductionPipelineFromCheckpoint,
  verifyPipelineCheckpointIntegrity,
  type CachedStageSnapshot,
  type CanonicalProductionStageId,
  type CriticalPathSchedule,
  type CriticalPathStageTiming,
  type EpisodeMasterSnapshot,
  type EpisodeProductionRunReport,
  type ExecuteProductionPipelineRequest,
  type ParallelExecutionWave,
  type PipelineCheckpointSnapshot,
  type ProductionDagDefinition,
  type ProductionPhaseId,
  type ProductionStageSpec,
  type ProductionStageStatus,
  type ResumeProductionPipelineRequest,
  type StageBlockingIssue,
  type StageExecutionContext,
  type StageExecutionHandler,
  type StageExecutionRecord,
  type StageHandlerResult,
} from "./episode-production-dag-scheduler";

export {
  MASTER_RELEASE_INVARIANT_IDS,
  RELEASE_SURFACE_PROFILES,
  RELEASE_SURFACE_TARGETS,
  canonicalizeWave100Json,
  evaluateMasterEpisodeReleaseGate,
  sha256Wave100Hex,
  verifyMasterReleaseCertificateIntegrity,
  type EvaluateMasterReleaseGateOptions,
  type MasterReleaseCertificate,
  type MasterReleaseCertificateIntegrityResult,
  type MasterReleaseDecision,
  type MasterReleaseGateEvaluation,
  type MasterReleaseGateSignalOverrides,
  type MasterReleaseInvariantCheck,
  type MasterReleaseInvariantId,
  type MasterReleaseInvariantMap,
  type ReleaseRemediationAction,
  type ReleaseSurfaceProfile,
  type ReleaseSurfaceTarget,
  type SurfaceReleaseDecision,
  type SurfaceReleaseEvaluation,
} from "./master-release-gatekeeper-and-certificate";

export {
  computeWave100MerkleRootHex,
} from "./wave100-sha256";

export {
  escapeDirectorSvgXml,
  renderWave100ProductionDirectorSvg,
  summarizeMasterProductionReleaseKo,
  type ProductionDirectorSvgOptions,
} from "./production-director-svg-and-audit";
