/**
 * Wave 100 — 자율 에피소드 프로덕션 DAG 타입 계약, 전용 오류, 표준 5단계·10스테이지 DAG 정의.
 *
 * - `episode-production-dag-scheduler.ts`와 `index.ts`에서 재수출되는 단일 타입·표준 DAG 원천이다.
 */

import { sha256Wave100Hex } from "./wave100-sha256";

export const PRODUCTION_PHASES = [
  "preproduction",
  "drawing-craft",
  "reader-experience",
  "compliance-qa",
  "multi-surface-release",
] as const;

export type ProductionPhaseId = (typeof PRODUCTION_PHASES)[number];

export const CANONICAL_PRODUCTION_STAGE_IDS = [
  "script-camera-blocking",
  "continuity-bible-check",
  "causal-ink-and-kinematic-cleanup",
  "fluid-relief-and-relighting",
  "cvd-mobile-readability-audit",
  "saliency-and-audio-pacing",
  "overnight-self-healing-qa",
  "geo-compliance-and-rights-bom",
  "multi-format-packager",
  "centennial-c2pa-vault-seal",
] as const;

export type CanonicalProductionStageId = (typeof CANONICAL_PRODUCTION_STAGE_IDS)[number];

export type ProductionStageStatus =
  | "pending"
  | "passed"
  | "healed-passed"
  | "blocked"
  | "skipped-upstream-blocked";

export interface ProductionStageSpec {
  readonly id: string;
  readonly phase: ProductionPhaseId;
  readonly labelKo: string;
  readonly sourceWaves: readonly number[];
  readonly dependsOn: readonly string[];
  readonly estimatedDurationMs: number;
  readonly criticalForRelease: boolean;
  readonly supportsSelfHealing: boolean;
  readonly descriptionKo: string;
}

export interface ProductionDagDefinition {
  readonly dagId: string;
  readonly schemaVersion: "wave100-dag-v1";
  readonly stages: readonly ProductionStageSpec[];
}

export interface ParallelExecutionWave {
  readonly waveIndex: number;
  readonly stageIds: readonly string[];
  readonly stageCount: number;
  readonly maxStageDurationMs: number;
}

export interface CriticalPathStageTiming {
  readonly stageId: string;
  readonly phase: ProductionPhaseId;
  readonly waveIndex: number;
  readonly dependsOn: readonly string[];
  readonly durationMs: number;
  readonly earliestStartMs: number;
  readonly earliestFinishMs: number;
  readonly latestStartMs: number;
  readonly latestFinishMs: number;
  readonly slackMs: number;
  readonly isCritical: boolean;
}

export interface CriticalPathSchedule {
  readonly dagId: string;
  readonly topologicalOrder: readonly string[];
  readonly parallelWaves: readonly ParallelExecutionWave[];
  readonly maxConcurrentStages: number;
  readonly stageTimings: Readonly<Record<string, CriticalPathStageTiming>>;
  readonly orderedTimings: readonly CriticalPathStageTiming[];
  readonly criticalPathStageIds: readonly string[];
  readonly nonCriticalStageIds: readonly string[];
  readonly totalSerialMs: number;
  readonly parallelWallClockMs: number;
  readonly parallelSpeedupRatio: number;
}

export interface EpisodeMasterSnapshot {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly seriesId: string;
  readonly masterRevision: number;
  readonly panelCount: number;
  readonly targetRegions: readonly string[];
  readonly masterAssetFingerprint: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface StageBlockingIssue {
  readonly code: string;
  readonly severity: "hard-blocker" | "license-blocker" | "compliance-blocker";
  readonly messageKo: string;
  readonly remediationKo: string;
}

export interface StageExecutionContext {
  readonly stage: ProductionStageSpec;
  readonly masterSnapshot: Readonly<EpisodeMasterSnapshot>;
  readonly upstreamOutputs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly runId: string;
  readonly attemptNumber: number;
}

export interface StageHandlerResult {
  readonly status: "passed" | "healed-passed" | "blocked";
  readonly actualDurationMs?: number;
  readonly summaryKo: string;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly healedIssueCount?: number;
  readonly blockingReasons?: readonly StageBlockingIssue[];
}

export type StageExecutionHandler = (context: StageExecutionContext) => StageHandlerResult;

export interface StageExecutionRecord {
  readonly stageId: string;
  readonly phase: ProductionPhaseId;
  readonly labelKo: string;
  readonly waveIndex: number;
  readonly sourceWaves: readonly number[];
  readonly status: ProductionStageStatus;
  readonly reusedFromCheckpoint: boolean;
  readonly actualDurationMs: number;
  readonly estimatedDurationMs: number;
  readonly healedIssueCount: number;
  readonly summaryKo: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly outputSha256: string;
  readonly upstreamOutputHashes: Readonly<Record<string, string>>;
  readonly blockingReasons: readonly StageBlockingIssue[];
  readonly upstreamBlockedBy: readonly string[];
}

export interface ExecuteProductionPipelineRequest {
  readonly dag?: ProductionDagDefinition;
  readonly masterSnapshot: EpisodeMasterSnapshot;
  readonly runId?: string;
  readonly executedAtIso?: string;
  readonly stageHandlers?: Readonly<Partial<Record<string, StageExecutionHandler>>>;
  readonly failFastOnBlock?: boolean;
}

export interface ResumeProductionPipelineRequest {
  readonly dag?: ProductionDagDefinition;
  readonly masterSnapshot: EpisodeMasterSnapshot;
  readonly runId?: string;
  readonly executedAtIso?: string;
  readonly stageHandlers?: Readonly<Partial<Record<string, StageExecutionHandler>>>;
  readonly forceRerunStageIds?: readonly string[];
  readonly failFastOnBlock?: boolean;
}

export interface EpisodeProductionRunReport {
  readonly runId: string;
  readonly dagId: string;
  readonly dagTopologySha256: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly seriesId: string;
  readonly masterRevision: number;
  readonly masterStateDigest: string;
  readonly masterStateIsolated: boolean;
  readonly executedAtIso: string;
  readonly resumedFromCheckpointId: string | null;
  readonly schedule: CriticalPathSchedule;
  readonly stageOrder: readonly string[];
  readonly stages: readonly StageExecutionRecord[];
  readonly stagesById: Readonly<Record<string, StageExecutionRecord>>;
  readonly passedStageCount: number;
  readonly healedStageCount: number;
  readonly blockedStageCount: number;
  readonly skippedUpstreamBlockedCount: number;
  readonly reusedCachedStageCount: number;
  readonly skippedCachedStages: readonly string[];
  readonly executedStageIds: readonly string[];
  readonly allStagesSucceeded: boolean;
  readonly allCriticalStagesSucceeded: boolean;
  readonly actualSerialDurationMs: number;
  readonly actualParallelWallClockMs: number;
  readonly merkleStageDigest: string;
  readonly waveCoverage: readonly number[];
  readonly waveCoverageCount: number;
}

export interface CachedStageSnapshot {
  readonly stageId: string;
  readonly phase: ProductionPhaseId;
  readonly labelKo: string;
  readonly waveIndex: number;
  readonly sourceWaves: readonly number[];
  readonly status: "passed" | "healed-passed";
  readonly actualDurationMs: number;
  readonly estimatedDurationMs: number;
  readonly healedIssueCount: number;
  readonly summaryKo: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly outputSha256: string;
  readonly upstreamOutputHashes: Readonly<Record<string, string>>;
}

export interface PipelineCheckpointSnapshot {
  readonly schemaVersion: "wave100-checkpoint-v1";
  readonly checkpointId: string;
  readonly dagId: string;
  readonly dagTopologySha256: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly seriesId: string;
  readonly masterRevision: number;
  readonly masterStateDigest: string;
  readonly exportedAtIso: string;
  readonly sourceRunId: string;
  readonly cachedStages: Readonly<Record<string, CachedStageSnapshot>>;
  readonly cachedStageOrder: readonly string[];
  readonly blockedStageIdsAtExport: readonly string[];
  readonly checkpointSha256: string;
}

/** DAG 순환 의존성 감지 시 발생하는 전용 오류. */
export class ProductionDagCycleError extends Error {
  public readonly cyclePath: readonly string[];

  public constructor(cyclePath: readonly string[]) {
    super(`프로덕션 DAG에 순환 의존성이 존재합니다: ${cyclePath.join(" -> ")}`);
    this.name = "ProductionDagCycleError";
    this.cyclePath = cyclePath;
    Object.setPrototypeOf(this, ProductionDagCycleError.prototype);
  }
}

/** DAG 구조·메타데이터 검증 실패 시 발생하는 전용 오류. */
export class ProductionDagValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProductionDagValidationError";
    Object.setPrototypeOf(this, ProductionDagValidationError.prototype);
  }
}

/** 체크포인트 무결성 위변조 또는 불일치 시 발생하는 전용 오류. */
export class PipelineCheckpointIntegrityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PipelineCheckpointIntegrityError";
    Object.setPrototypeOf(this, PipelineCheckpointIntegrityError.prototype);
  }
}

/** 5단계·10스테이지 크로스-웨이브 표준 웹툰 제작 DAG를 생성한다. */
export function createCanonicalWebtoonProductionDag(): ProductionDagDefinition {
  const stages: readonly ProductionStageSpec[] = [
    {
      id: "script-camera-blocking",
      phase: "preproduction",
      labelKo: "대본·카메라 블로킹",
      sourceWaves: [96],
      dependsOn: [],
      estimatedDurationMs: 1400,
      criticalForRelease: true,
      supportsSelfHealing: false,
      descriptionKo: "대본 컷 분할, 카메라 구도, 동선 프리비즈 레이아웃을 확정한다.",
    },
    {
      id: "continuity-bible-check",
      phase: "preproduction",
      labelKo: "연속성 바이블 검증",
      sourceWaves: [80],
      dependsOn: [],
      estimatedDurationMs: 950,
      criticalForRelease: true,
      supportsSelfHealing: false,
      descriptionKo: "캐릭터 설정·의상·소품·세계관 연대기 모순 여부를 대조한다.",
    },
    {
      id: "causal-ink-and-kinematic-cleanup",
      phase: "drawing-craft",
      labelKo: "인과 펜선·키네마틱 클린업",
      sourceWaves: [87, 91],
      dependsOn: ["script-camera-blocking", "continuity-bible-check"],
      estimatedDurationMs: 2600,
      criticalForRelease: true,
      supportsSelfHealing: true,
      descriptionKo: "필압·속도 트윈 기반 선화 정제와 인과 히스토리 그래프를 확정한다.",
    },
    {
      id: "fluid-relief-and-relighting",
      phase: "drawing-craft",
      labelKo: "유체 채색·릴리프 재조명",
      sourceWaves: [68, 73, 74],
      dependsOn: ["script-camera-blocking"],
      estimatedDurationMs: 2100,
      criticalForRelease: true,
      supportsSelfHealing: true,
      descriptionKo: "유체 색채 확산, 음각·양각 재질 릴리프, 2.5D 리라이팅을 합성한다.",
    },
    {
      id: "cvd-mobile-readability-audit",
      phase: "reader-experience",
      labelKo: "색각안전·모바일 가독성 감사",
      sourceWaves: [83],
      dependsOn: ["fluid-relief-and-relighting"],
      estimatedDurationMs: 1100,
      criticalForRelease: true,
      supportsSelfHealing: true,
      descriptionKo: "색각이상 시뮬레이션, WCAG 대비, 저감 모션 안전성과 말풍선 가독성을 점검한다.",
    },
    {
      id: "saliency-and-audio-pacing",
      phase: "reader-experience",
      labelKo: "시선 유도·오디오 페이싱",
      sourceWaves: [82, 86],
      dependsOn: ["causal-ink-and-kinematic-cleanup", "fluid-relief-and-relighting"],
      estimatedDurationMs: 1800,
      criticalForRelease: true,
      supportsSelfHealing: true,
      descriptionKo: "시선 집중 히트맵과 스크롤 연동 효과음·호흡 템포를 조율한다.",
    },
    {
      id: "overnight-self-healing-qa",
      phase: "compliance-qa",
      labelKo: "야간 자가치유 QA",
      sourceWaves: [94],
      dependsOn: ["causal-ink-and-kinematic-cleanup", "fluid-relief-and-relighting"],
      estimatedDurationMs: 2400,
      criticalForRelease: true,
      supportsSelfHealing: true,
      descriptionKo: "결손 선화·레이어 틈·말풍선 잘림을 자동 보정하고 잔여 하드 블로커를 판정한다.",
    },
    {
      id: "geo-compliance-and-rights-bom",
      phase: "compliance-qa",
      labelKo: "권역 심의·권리 BOM 검증",
      sourceWaves: [92, 79],
      dependsOn: ["causal-ink-and-kinematic-cleanup", "continuity-bible-check"],
      estimatedDurationMs: 1600,
      criticalForRelease: true,
      supportsSelfHealing: false,
      descriptionKo: "글로벌 권역별 심의 기준과 폰트·소품·오디오 상업 라이선스 BOM을 검사한다.",
    },
    {
      id: "multi-format-packager",
      phase: "multi-surface-release",
      labelKo: "멀티 서피스 패키저",
      sourceWaves: [76, 88, 95, 97],
      dependsOn: [
        "cvd-mobile-readability-audit",
        "saliency-and-audio-pacing",
        "overnight-self-healing-qa",
        "geo-compliance-and-rights-bom",
      ],
      estimatedDurationMs: 1900,
      criticalForRelease: true,
      supportsSelfHealing: false,
      descriptionKo: "세로 웹툰·라이브 리액티브·B5 CMYK 인쇄·WebXR 시어터 배포 패키지를 빌드한다.",
    },
    {
      id: "centennial-c2pa-vault-seal",
      phase: "multi-surface-release",
      labelKo: "100년 보존 C2PA 금고 봉인",
      sourceWaves: [98],
      dependsOn: ["multi-format-packager", "geo-compliance-and-rights-bom"],
      estimatedDurationMs: 1150,
      criticalForRelease: true,
      supportsSelfHealing: false,
      descriptionKo: "마스터 에피소드와 권리 출처 매니페스트에 비트-정확 100년 C2PA 봉인을 찍는다.",
    },
  ];
  return {
    dagId: "toonstudio-canonical-webtoon-episode-dag-v100",
    schemaVersion: "wave100-dag-v1",
    stages,
  };
}

/** 미지정 스테이지에 적용되는 결정론적 기본 핸들러 결과를 생성한다. */
export function createDefaultCanonicalStageOutcome(
  context: StageExecutionContext,
): StageHandlerResult {
  const { stage, masterSnapshot } = context;
  switch (stage.id) {
    case "script-camera-blocking":
      return {
        status: "passed",
        summaryKo: `패널 ${masterSnapshot.panelCount}컷 카메라 블로킹 및 동선 프리비즈 확정`,
        output: { blockedPanelCount: masterSnapshot.panelCount, cameraRigPreset: "vertical-cinematic-v100" },
      };
    case "continuity-bible-check":
      return {
        status: "passed",
        summaryKo: "캐릭터·소품·세계관 연속성 바이블 모순 0건 확인",
        output: { continuityContradictions: 0, verifiedCanonEntries: Math.max(1, masterSnapshot.panelCount * 2) },
      };
    case "causal-ink-and-kinematic-cleanup":
      return {
        status: "passed",
        summaryKo: "인과 펜선 그래프 및 키네마틱 필압 클린업 완료",
        output: { causalInkGraphVerified: true, kinematicOvershootFixedCount: 0 },
      };
    case "fluid-relief-and-relighting":
      return {
        status: "passed",
        summaryKo: "유체 채색 확산 및 2.5D 릴리프 재조명 합성 완료",
        output: { relightingLutApplied: true, reliefNormalMapVerified: true },
      };
    case "cvd-mobile-readability-audit":
      return {
        status: "passed",
        summaryKo: "색각안전·WCAG 대비·저감 모션·모바일 가독성 기준 통과",
        output: { cvdAuditPassed: true, reducedMotionSafe: true, minContrastRatio: 7.4 },
      };
    case "saliency-and-audio-pacing":
      return {
        status: "passed",
        summaryKo: "시선 유도 동선 및 스크롤 오디오 페이싱 조율 완료",
        output: { saliencyFlowScore: 0.94, audioPacingSyncVerified: true },
      };
    case "overnight-self-healing-qa":
      return {
        status: "passed",
        summaryKo: "야간 자가치유 QA 완료 (잔여 하드 블로커 0건)",
        output: { unhealedHardQaBlockers: 0, autoHealedDefectCount: 0 },
      };
    case "geo-compliance-and-rights-bom":
      return {
        status: "passed",
        summaryKo: `대상 권역(${masterSnapshot.targetRegions.join(", ")}) 심의 및 권리 BOM 검증 통과`,
        output: {
          rightsBomCleared: true,
          geoComplianceCleared: true,
          unresolvedGeoBlockers: 0,
          expiredLicenseCount: 0,
          territoryViolationCount: 0,
          verifiedRegions: masterSnapshot.targetRegions,
        },
      };
    case "multi-format-packager":
      return {
        status: "passed",
        summaryKo: "5개 멀티 서피스 배포 패키지 빌드 및 무결성 확인 완료",
        output: {
          packagedSurfaces: [
            "vertical-webtoon-strip",
            "tstudio-live-reactive",
            "print-b5-cmyk",
            "webxr-spatial-theater",
            "centennial-c2pa-vault",
          ],
          cmykInkLimitVerified: true,
        },
      };
    case "centennial-c2pa-vault-seal":
      return {
        status: "passed",
        summaryKo: "100년 보존 C2PA 금고 매니페스트 봉인 완료",
        output: {
          c2paVaultSealValid: true,
          vaultRetentionYears: 100,
          vaultManifestSha256: sha256Wave100Hex(
            `c2pa-vault:${masterSnapshot.episodeId}:rev${masterSnapshot.masterRevision}:${masterSnapshot.masterAssetFingerprint}`,
          ),
        },
      };
    default:
      return { status: "passed", summaryKo: `${stage.labelKo} 단계 정상 통과`, output: { completed: true } };
  }
}
