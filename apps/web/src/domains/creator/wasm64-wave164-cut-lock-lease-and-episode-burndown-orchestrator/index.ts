/**
 * Wasm64 Wave 164 공개 배럴 진입점 (`wasm64-wave164-cut-lock-lease-and-episode-burndown-orchestrator`).
 *
 * - `cut-lock-burndown-types`: 6대 웹툰 제작 공정, 어시스턴트 역량 프로필, 컷-락 리스,
 *   단조 펜싱 토큰 패치, 번다운 궤적, 재배정 제안 및 오케스트레이션 계약
 * - `cut-lock-lease-manager`: 상호 배제·병렬 컷-락 리스 상태 머신, WIP 상한, 만료 회수,
 *   좀비 패치 차단 및 순서 무관 충돌 제로 병합기
 * - `episode-burndown-and-bottleneck-planner`: 공정 의존성 기반 완료 예상 시간 시뮬레이션,
 *   마감 여유·위험 등급 판정 및 과부하 인력 재배정 최적화 플래너
 * - `cut-lock-burndown-report`: 순수 ES2017 동기 FIPS 180-4 SHA-256, 회차 매니페스트 지문,
 *   순수 OKLCH 번다운·리스 매트릭스 SVG 및 자연스러운 한국어 PD 마감 QA 요약
 */

import {
  computeBurndownManifestFingerprint,
  renderCutLockBurndownSvg,
  summarizeCutLockBurndownKo,
} from "./cut-lock-burndown-report";
import {
  makeCutStageSlotKey,
  type AcquireCutStageLeaseResult,
  type CutLockLeaseAndBurndownOrchestratorOutput,
  type EpisodeCutStageWorkItem,
  type StudioBurndownScenario,
} from "./cut-lock-burndown-types";
import {
  acquireCutStageLease,
  createCutLockLeaseState,
  mergeCutStagePatches,
  reclaimExpiredLeases,
} from "./cut-lock-lease-manager";
import {
  computeEpisodeBurndownReport,
  planAssistantRebalanceSuggestions,
} from "./episode-burndown-and-bottleneck-planner";

export {
  DEFAULT_STAGE_DEPENDENCIES,
  STUDIO_PRODUCTION_STAGES,
  STUDIO_STAGE_LABELS_KO,
  makeCutStageSlotKey,
  type AcquireCutStageLeaseRequest,
  type AcquireCutStageLeaseResult,
  type AssistantCapacityProfile,
  type AssistantLoadSnapshot,
  type AssistantRebalanceMove,
  type AssistantRebalanceOptions,
  type AssistantRebalancePlan,
  type BurndownManifestFingerprintInput,
  type BurndownObservationPoint,
  type BurndownTimelinePoint,
  type CreateCutLockLeaseStateOptions,
  type CutLockLeaseAndBurndownOrchestratorOutput,
  type CutLockLeaseAuditEntry,
  type CutLockLeaseAuditKind,
  type CutLockLeaseState,
  type CutStageLeaseRecord,
  type CutStagePatch,
  type CutStagePatchDecision,
  type CutStagePatchMergeResult,
  type CutStagePatchOpKind,
  type CutStageSlotKey,
  type DeadlineRiskTier,
  type EpisodeBurndownInput,
  type EpisodeBurndownReport,
  type EpisodeCutStageWorkItem,
  type LeaseRejectionReason,
  type MergeCutStagePatchesOptions,
  type MergedCutStageSlotState,
  type ReclaimExpiredLeasesResult,
  type ReleaseCutStageLeaseRequest,
  type ReleaseCutStageLeaseResult,
  type RenewCutStageLeaseRequest,
  type RenewCutStageLeaseResult,
  type StageBacklogSummary,
  type StagePatchMergeOutcome,
  type StudioBurndownQaSummary,
  type StudioBurndownScenario,
  type StudioProductionStage,
  type StudioQaVerdict,
} from "./cut-lock-burndown-types";

export {
  acquireCutStageLease,
  createCutLockLeaseState,
  mergeCutStagePatches,
  reclaimExpiredLeases,
  releaseCutStageLease,
  renewCutStageLease,
} from "./cut-lock-lease-manager";

export {
  computeEpisodeBurndownReport,
  planAssistantRebalanceSuggestions,
} from "./episode-burndown-and-bottleneck-planner";

export {
  canonicalJsonStringify,
  computeBurndownManifestFingerprint,
  renderCutLockBurndownSvg,
  sha256StudioOpsHex,
  summarizeCutLockBurndownKo,
  type RenderCutLockBurndownSvgOptions,
  type SummarizeCutLockBurndownOptions,
} from "./cut-lock-burndown-report";

const SAMPLE_BASE_NOW_MS = 1_760_000_000_000;
const SAMPLE_TTL_MS = 30 * 60 * 1000;

/**
 * `/studio` 런타임 허브 셀프 체크 및 데모용 웹툰 연재 스튜디오 마감 번다운 시나리오를 생성한다.
 * 동일 컷 병렬 락(명암·3D 배경·식자), 충돌 제로 패치 병합, 선화 공정 과부하 병목과
 * 유휴 숙련 어시스턴트 재배정 단축 효과를 모두 검증할 수 있도록 구성한다.
 */
export function createSampleStudioBurndownScenario(
  overrides?: Partial<StudioBurndownScenario>,
): StudioBurndownScenario {
  const nowMs = overrides?.nowMs ?? SAMPLE_BASE_NOW_MS;
  const leaseAcquireMs = nowMs - 5 * 60 * 1000;

  const base: StudioBurndownScenario = {
    episodeId: "ep-042",
    episodeTitleKo: "제42화: 빗속의 대치",
    nowMs,
    totalWindowHours: 48,
    elapsedHours: 28,
    deadlineRemainingHours: 20,
    workdayHours: 8,
    defaultLeaseTtlMs: SAMPLE_TTL_MS,
    assistants: [
      {
        assistantId: "asst-doyun",
        nameKo: "김도윤",
        skills: ["line-art", "final-qa"],
        maxConcurrentLeases: 2,
        velocityHoursPerDay: 8,
      },
      {
        assistantId: "asst-seoyeon",
        nameKo: "이서연",
        skills: ["line-art", "flat-color"],
        maxConcurrentLeases: 2,
        velocityHoursPerDay: 8,
      },
      {
        assistantId: "asst-jihu",
        nameKo: "박지후",
        skills: ["flat-color", "shading"],
        maxConcurrentLeases: 2,
        velocityHoursPerDay: 8,
      },
      {
        assistantId: "asst-haeun",
        nameKo: "최하은",
        skills: ["background-3d", "lettering-sfx", "final-qa"],
        maxConcurrentLeases: 3,
        velocityHoursPerDay: 8,
      },
    ],
    workItems: [
      { cutId: "C01", stage: "line-art", estimatedHours: 4, completedHours: 4, assignedAssistantId: "asst-doyun" },
      { cutId: "C01", stage: "flat-color", estimatedHours: 3, completedHours: 3, assignedAssistantId: "asst-jihu" },
      { cutId: "C01", stage: "shading", estimatedHours: 4, completedHours: 2.5, assignedAssistantId: "asst-jihu" },
      { cutId: "C01", stage: "background-3d", estimatedHours: 4, completedHours: 2, assignedAssistantId: "asst-haeun" },
      { cutId: "C01", stage: "lettering-sfx", estimatedHours: 2, completedHours: 1, assignedAssistantId: "asst-haeun" },
      { cutId: "C01", stage: "final-qa", estimatedHours: 2, completedHours: 0, assignedAssistantId: "asst-haeun" },
      { cutId: "C02", stage: "line-art", estimatedHours: 6, completedHours: 2, assignedAssistantId: "asst-doyun" },
      { cutId: "C02", stage: "flat-color", estimatedHours: 3, completedHours: 0, assignedAssistantId: "asst-jihu" },
      { cutId: "C02", stage: "shading", estimatedHours: 3, completedHours: 0, assignedAssistantId: "asst-jihu" },
      { cutId: "C02", stage: "background-3d", estimatedHours: 3, completedHours: 2, assignedAssistantId: "asst-haeun" },
      { cutId: "C03", stage: "line-art", estimatedHours: 6, completedHours: 0, assignedAssistantId: "asst-doyun" },
      { cutId: "C03", stage: "flat-color", estimatedHours: 3, completedHours: 0, assignedAssistantId: "asst-seoyeon" },
      { cutId: "C03", stage: "lettering-sfx", estimatedHours: 2, completedHours: 0, assignedAssistantId: "asst-haeun" },
      { cutId: "C04", stage: "line-art", estimatedHours: 6, completedHours: 0, assignedAssistantId: "asst-doyun" },
      { cutId: "C04", stage: "flat-color", estimatedHours: 3, completedHours: 0, assignedAssistantId: "asst-seoyeon" },
      { cutId: "C05", stage: "line-art", estimatedHours: 6, completedHours: 0, assignedAssistantId: "asst-doyun" },
      { cutId: "C05", stage: "background-3d", estimatedHours: 3, completedHours: 1, assignedAssistantId: "asst-haeun" },
      {
        cutId: "C05",
        stage: "final-qa",
        estimatedHours: 2,
        completedHours: 0,
        assignedAssistantId: "asst-doyun",
        dependsOnStages: ["line-art", "background-3d"],
      },
    ],
    initialLeaseRequests: [
      { cutId: "C01", stage: "shading", assistantId: "asst-jihu", nowMs: leaseAcquireMs },
      { cutId: "C01", stage: "background-3d", assistantId: "asst-haeun", nowMs: leaseAcquireMs + 1000 },
      { cutId: "C01", stage: "lettering-sfx", assistantId: "asst-haeun", nowMs: leaseAcquireMs + 2000 },
      { cutId: "C02", stage: "line-art", assistantId: "asst-doyun", nowMs: leaseAcquireMs + 3000 },
    ],
    submittedPatches: [
      {
        patchId: "patch-c01-shading-01",
        cutId: "C01",
        stage: "shading",
        authorId: "asst-jihu",
        fencingToken: 1,
        baseRevision: 0,
        submittedAtMs: nowMs - 120_000,
        opKind: "cel-shading",
        layerPath: "cuts/C01/shading/rain-rim.layer",
        payloadDigestHex: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        progressDeltaHours: 0.5,
        completedRatio: 0.75,
        summaryKo: "빗물 역광 셀 명암 1차 반영",
      },
      {
        patchId: "patch-c01-bg3d-01",
        cutId: "C01",
        stage: "background-3d",
        authorId: "asst-haeun",
        fencingToken: 2,
        baseRevision: 0,
        submittedAtMs: nowMs - 90_000,
        opKind: "background-render",
        layerPath: "cuts/C01/bg3d/alley-wet-pass.layer",
        payloadDigestHex: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
        progressDeltaHours: 0.5,
        completedRatio: 0.625,
        summaryKo: "골목 젖은 아스팔트 3D 렌더 패스 반영",
      },
      {
        patchId: "patch-c02-line-01",
        cutId: "C02",
        stage: "line-art",
        authorId: "asst-doyun",
        fencingToken: 4,
        baseRevision: 0,
        submittedAtMs: nowMs - 60_000,
        opKind: "stroke-batch",
        layerPath: "cuts/C02/line-art/character-ink.layer",
        payloadDigestHex: "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100",
        progressDeltaHours: 1,
        completedRatio: 0.5,
        summaryKo: "주인공 클로즈업 펜선 정리 반영",
      },
    ],
    historicalObservations: [
      { elapsedHours: 8, actualRemainingHours: 61 },
      { elapsedHours: 16, actualRemainingHours: 55.5 },
      { elapsedHours: 24, actualRemainingHours: 50 },
    ],
  };

  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...overrides,
  };
}

function applyMergedProgressToWorkItems(
  workItems: readonly EpisodeCutStageWorkItem[],
  mergedSlots: CutLockLeaseAndBurndownOrchestratorOutput["mergeResult"]["mergedSlots"],
): readonly EpisodeCutStageWorkItem[] {
  return workItems.map((item) => {
    const slotKey = makeCutStageSlotKey(item.cutId, item.stage);
    if (!Object.prototype.hasOwnProperty.call(mergedSlots, slotKey)) {
      return { ...item };
    }
    const merged = mergedSlots[slotKey];
    const nextCompleted = Math.min(
      Math.max(0, item.estimatedHours),
      Math.max(0, item.completedHours) + merged.accumulatedProgressHours,
    );
    return {
      ...item,
      completedHours: Math.round(nextCompleted * 100) / 100,
    };
  });
}

/**
 * 컷-락 리스 발급·만료 회수·펜싱 토큰 검증 병합·번다운 분석·병목 재배정·
 * 매니페스트 지문·OKLCH SVG·한국어 PD QA 브리프를 일괄 실행하는 최상위 오케스트레이터.
 */
export function runCutLockLeaseAndBurndownOrchestrator(
  scenario?: StudioBurndownScenario,
): CutLockLeaseAndBurndownOrchestratorOutput {
  const activeScenario = scenario ?? createSampleStudioBurndownScenario();

  let leaseState = createCutLockLeaseState({
    episodeId: activeScenario.episodeId,
    assistants: activeScenario.assistants,
    defaultLeaseTtlMs: activeScenario.defaultLeaseTtlMs,
  });

  const leaseAcquisitions: AcquireCutStageLeaseResult[] = [];
  for (let i = 0; i < activeScenario.initialLeaseRequests.length; i += 1) {
    const res = acquireCutStageLease(leaseState, activeScenario.initialLeaseRequests[i]);
    leaseAcquisitions.push(res);
    leaseState = res.state;
  }

  const reclaimedExpired = reclaimExpiredLeases(leaseState, activeScenario.nowMs);
  leaseState = reclaimedExpired.state;

  const mergeResult = mergeCutStagePatches(
    leaseState,
    activeScenario.submittedPatches,
    { nowMs: activeScenario.nowMs },
  );

  const updatedWorkItems = applyMergedProgressToWorkItems(
    activeScenario.workItems,
    mergeResult.mergedSlots,
  );

  const burndownInput = {
    episodeId: activeScenario.episodeId,
    episodeTitleKo: activeScenario.episodeTitleKo,
    totalWindowHours: activeScenario.totalWindowHours,
    elapsedHours: activeScenario.elapsedHours,
    deadlineRemainingHours: activeScenario.deadlineRemainingHours,
    workdayHours: activeScenario.workdayHours,
    assistants: activeScenario.assistants,
    workItems: updatedWorkItems,
    leaseState,
    nowMs: activeScenario.nowMs,
    historicalObservations: activeScenario.historicalObservations,
  };

  const burndownReport = computeEpisodeBurndownReport(burndownInput);
  const rebalancePlan = planAssistantRebalanceSuggestions(burndownInput);
  const postRebalanceBurndownReport = computeEpisodeBurndownReport({
    ...burndownInput,
    workItems: rebalancePlan.rebalancedWorkItems,
  });

  const manifestFingerprintSha256Hex = computeBurndownManifestFingerprint({
    leaseState,
    mergeResult,
    burndownReport,
    rebalancePlan,
  });

  const burndownSvg = renderCutLockBurndownSvg({
    burndownReport,
    leaseState,
    rebalancePlan,
    mergeResult,
    nowMs: activeScenario.nowMs,
  });

  const qaSummary = summarizeCutLockBurndownKo({
    burndownReport,
    leaseState,
    mergeResult,
    rebalancePlan,
  });

  return {
    episodeId: activeScenario.episodeId,
    episodeTitleKo: activeScenario.episodeTitleKo,
    evaluatedAtMs: activeScenario.nowMs,
    leaseState,
    leaseAcquisitions,
    reclaimedExpired,
    mergeResult,
    burndownReport,
    rebalancePlan,
    postRebalanceBurndownReport,
    manifestFingerprintSha256Hex,
    burndownSvg,
    qaSummary,
  };
}
