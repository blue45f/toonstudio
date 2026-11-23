/**
 * 글로벌 스튜디오급 8단계 분업 파이프라인 · 컷 바통 터치 게이트 · 거버넌스(RBAC·외주 샌드박스·정산·SLA 병목) 엔진.
 *
 * - `evaluateStageHandoffGate`: 5대 자동 검수(레이어 명명·해상도·닫힌 영역·바이블 팔레트·Rights BOM 0건) + 이전 공정 Read-Only 잠금 & 하위 공정 열림
 * - `executeCutBatonHandoff`: 컷 상태 전이 & 감사 이력 기록
 * - `evaluateRbacPermission`: 6역할 세밀 RBAC 검증
 * - `createOutsourceSandboxPackage` & `verifyOutsourceReturnBundle`: 3~5컷 격리 반출·워터마크·반입 BOM/해상도 자동 검증
 * - `calculateCutPayoutLedger`: 컷당·공정당 원고료 정산 원장(승인/검수대기 분리)
 * - `detectPipelineBottlenecks`: 마감 SLA 지연·공정 적체·연쇄 차단 감지기 + 재배치 처방전
 */

import {
  GOVERNANCE_TIER_ORDER,
  PIPELINE_STAGE_ORDER,
  RBAC_ACTION_LABELS,
  SAMPLE_CUT_PAYOUT_ENTRIES,
  SAMPLE_SLA_WORKLOAD_CUTS,
  STUDIO_GOVERNANCE_TIERS,
  STUDIO_RBAC_ROLES,
  WEBTOON_8_STAGE_PIPELINE,
  WORKSPACE_HIERARCHY_LEVELS,
  type CutPayoutEntryInput,
  type PipelineStageId,
  type PipelineStageSpec,
  type PipelineWorkloadCut,
  type StudioGovernanceTierId,
  type StudioGovernanceTierSpec,
  type StudioRbacActionId,
  type StudioRbacRoleId,
  type StudioRbacRoleSpec,
  type WorkspaceHierarchyLevelId,
  type WorkspaceHierarchyLevelSpec,
} from "./studio-governance-catalog";

export {
  GOVERNANCE_TIER_ORDER,
  PIPELINE_STAGE_ORDER,
  RBAC_ACTION_LABELS,
  SAMPLE_CUT_PAYOUT_ENTRIES,
  SAMPLE_SLA_WORKLOAD_CUTS,
  STUDIO_GOVERNANCE_TIERS,
  STUDIO_RBAC_ROLES,
  WEBTOON_8_STAGE_PIPELINE,
  WORKSPACE_HIERARCHY_LEVELS,
};
export type {
  CutPayoutEntryInput,
  PipelineStageId,
  PipelineStageSpec,
  PipelineWorkloadCut,
  StudioGovernanceTierId,
  StudioGovernanceTierSpec,
  StudioRbacActionId,
  StudioRbacRoleId,
  StudioRbacRoleSpec,
  WorkspaceHierarchyLevelId,
  WorkspaceHierarchyLevelSpec,
};

export interface StageHandoffGateInput {
  readonly cutId: string;
  readonly currentStageId: PipelineStageId;
  readonly layerNames: readonly string[];
  readonly widthPx: number;
  readonly dpi: number;
  readonly openLineGapCount: number;
  readonly biblePaletteMatchPercent: number;
  readonly missingRightsBomCount: number;
  readonly nextAssigneeNameKo?: string;
}

export interface StageGateCheckResult {
  readonly checkId: "layer-naming" | "resolution" | "closed-regions" | "bible-palette" | "rights-bom";
  readonly labelKo: string;
  readonly passed: boolean;
  readonly required: boolean;
  readonly detailKo: string;
}

export interface StageHandoffGateEvaluation {
  readonly cutId: string;
  readonly currentStageId: PipelineStageId;
  readonly nextStageId: PipelineStageId | null;
  readonly passed: boolean;
  readonly canOneClickHandoff: boolean;
  readonly scorePercent: number;
  readonly checks: readonly StageGateCheckResult[];
  readonly blockingReasonsKo: readonly string[];
  readonly previousStageLayerLock: {
    readonly locked: boolean;
    readonly mode: "read-only";
    readonly stageId: PipelineStageId;
    readonly reasonKo: string;
  };
  readonly downstreamStageUnlocked: {
    readonly unlocked: boolean;
    readonly stageId: PipelineStageId | null;
    readonly notifiedAssigneeKo: string;
  };
}

export interface CutPipelineRuntimeState {
  readonly cutId: string;
  readonly currentStageId: PipelineStageId;
  readonly lockedReadOnlyStageIds: readonly PipelineStageId[];
  readonly unlockedStageId: PipelineStageId;
  readonly handoffHistory: readonly {
    readonly fromStageId: PipelineStageId;
    readonly toStageId: PipelineStageId | null;
    readonly handedOffAtIso: string;
    readonly noteKo: string;
  }[];
}

export function getPipelineStageSpec(stageId: PipelineStageId): PipelineStageSpec {
  return WEBTOON_8_STAGE_PIPELINE.find((item) => item.id === stageId) ?? WEBTOON_8_STAGE_PIPELINE[0]!;
}

export function getNextPipelineStageId(stageId: PipelineStageId): PipelineStageId | null {
  const idx = PIPELINE_STAGE_ORDER.indexOf(stageId);
  return idx >= 0 && idx < PIPELINE_STAGE_ORDER.length - 1 ? PIPELINE_STAGE_ORDER[idx + 1] ?? null : null;
}

/** 컷 단위 바통 터치 5대 자동 검수 게이트 평가 및 이전 공정 Read-Only 잠금·하위 공정 개방 산출. */
export function evaluateStageHandoffGate(input: StageHandoffGateInput): StageHandoffGateEvaluation {
  const stage = getPipelineStageSpec(input.currentStageId);
  const nextStageId = getNextPipelineStageId(input.currentStageId);
  const nextStage = nextStageId ? getPipelineStageSpec(nextStageId) : null;

  const hasValidPrefix =
    input.layerNames.length > 0 &&
    input.layerNames.some((name) => name.startsWith(stage.requiredLayerPrefix)) &&
    input.layerNames.every((name) => !/^(?:레이어\s*\d+|Layer\s*\d+)$/iu.test(name.trim()));
  const resolutionPassed = input.widthPx >= stage.minWidthPx && input.dpi >= stage.minDpi;
  const closedRegionPassed = !stage.requiresClosedRegions || input.openLineGapCount === 0;
  const palettePassed = !stage.requiresBiblePalette || input.biblePaletteMatchPercent >= 95;
  const bomPassed = input.missingRightsBomCount === 0;

  const checks: readonly StageGateCheckResult[] = [
    {
      checkId: "layer-naming",
      labelKo: "레이어 명명 규칙",
      passed: hasValidPrefix,
      required: true,
      detailKo: hasValidPrefix
        ? `필수 접두사(${stage.requiredLayerPrefix}*) 확인 및 임시 레이어명 0건`
        : `${stage.requiredLayerPrefix}* 접두사 레이어가 필요하며 '레이어 1' 같은 미정리 명칭은 금지됩니다.`,
    },
    {
      checkId: "resolution",
      labelKo: "작업 해상도 · DPI",
      passed: resolutionPassed,
      required: true,
      detailKo: resolutionPassed
        ? `${input.widthPx}px · ${input.dpi}DPI (기준 ${stage.minWidthPx}px / ${stage.minDpi}DPI 충족)`
        : `현재 ${input.widthPx}px · ${input.dpi}DPI — 최소 ${stage.minWidthPx}px / ${stage.minDpi}DPI 필요`,
    },
    {
      checkId: "closed-regions",
      labelKo: "선화 닫힌 영역 검증",
      passed: closedRegionPassed,
      required: stage.requiresClosedRegions,
      detailKo: !stage.requiresClosedRegions
        ? "이 공정은 닫힌 영역 필수가 아니므로 자동 통과"
        : input.openLineGapCount === 0
          ? "열린 선화 틈새 0건 — 원클릭 밑색 채우기 안전"
          : `열린 틈새 ${input.openLineGapCount}건 감지 — 채우기 누수 방지를 위해 봉합 필요`,
    },
    {
      checkId: "bible-palette",
      labelKo: "캐릭터 바이블 팔레트 일치",
      passed: palettePassed,
      required: stage.requiresBiblePalette,
      detailKo: !stage.requiresBiblePalette
        ? "이 공정은 바이블 팔레트 강제 대상이 아니므로 자동 통과"
        : palettePassed
          ? `캐릭터 바이블 팔레트 일치율 ${input.biblePaletteMatchPercent}% (기준 95% 이상)`
          : `팔레트 일치율 ${input.biblePaletteMatchPercent}% — 바이블 토큰으로 맞춰 주세요.`,
    },
    {
      checkId: "rights-bom",
      labelKo: "Rights BOM 라이선스 누락 0건",
      passed: bomPassed,
      required: true,
      detailKo: bomPassed
        ? "사용 3D·브러시·폰트 상업 라이선스 BOM 누락 0건"
        : `Rights BOM 미확인 에셋 ${input.missingRightsBomCount}건 — 출고·인계 전 권리 등록 필수`,
    },
  ];

  const blockingReasonsKo = checks.filter((c) => c.required && !c.passed).map((c) => `${c.labelKo}: ${c.detailKo}`);
  const passed = blockingReasonsKo.length === 0;
  const scorePercent = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);

  return {
    cutId: input.cutId,
    currentStageId: input.currentStageId,
    nextStageId,
    passed,
    canOneClickHandoff: passed,
    scorePercent,
    checks,
    blockingReasonsKo,
    previousStageLayerLock: {
      locked: passed,
      mode: "read-only",
      stageId: input.currentStageId,
      reasonKo: passed
        ? `${stage.shortLabelKo} 공정 레이어가 Read-Only 자동 잠금되어 하위 공정 덮어쓰기를 차단합니다.`
        : "검수 게이트 미통과 상태이므로 현재 공정 레이어 편집 권한을 유지합니다.",
    },
    downstreamStageUnlocked: {
      unlocked: passed && nextStage !== null,
      stageId: nextStageId,
      notifiedAssigneeKo: input.nextAssigneeNameKo ?? (nextStage ? `${nextStage.shortLabelKo} 담당자` : "최종 출고 승인 대기"),
    },
  };
}

/** 게이트 통과 시 컷 바통 터치를 실행해 이전 공정 Read-Only 잠금과 다음 공정 열림 상태를 반영한다. */
export function executeCutBatonHandoff(
  cutState: CutPipelineRuntimeState,
  gateInput: StageHandoffGateInput,
  handedOffAtIso: string,
): {
  readonly transitioned: boolean;
  readonly evaluation: StageHandoffGateEvaluation;
  readonly nextState: CutPipelineRuntimeState;
} {
  const evaluation = evaluateStageHandoffGate(gateInput);
  if (!evaluation.passed) return { transitioned: false, evaluation, nextState: cutState };

  const lockedSet = new Set<PipelineStageId>(cutState.lockedReadOnlyStageIds);
  lockedSet.add(gateInput.currentStageId);
  const nextStageId = evaluation.nextStageId ?? gateInput.currentStageId;
  const currentSpec = getPipelineStageSpec(gateInput.currentStageId);
  const nextSpec = evaluation.nextStageId ? getPipelineStageSpec(evaluation.nextStageId) : null;

  return {
    transitioned: true,
    evaluation,
    nextState: {
      cutId: cutState.cutId,
      currentStageId: nextStageId,
      lockedReadOnlyStageIds: PIPELINE_STAGE_ORDER.filter((id) => lockedSet.has(id)),
      unlockedStageId: nextStageId,
      handoffHistory: [
        ...cutState.handoffHistory,
        {
          fromStageId: gateInput.currentStageId,
          toStageId: evaluation.nextStageId,
          handedOffAtIso,
          noteKo: nextSpec
            ? `${currentSpec.shortLabelKo} Read-Only 잠금 → ${nextSpec.shortLabelKo} 즉시 개방 (${evaluation.downstreamStageUnlocked.notifiedAssigneeKo})`
            : `${currentSpec.shortLabelKo} 최종 BOM 출고 승인 완료`,
        },
      ],
    },
  };
}

export interface RbacPermissionDecision {
  readonly roleId: StudioRbacRoleId;
  readonly actionId: StudioRbacActionId;
  readonly allowed: boolean;
  readonly reasonKo: string;
}

/** 6역할 RBAC 권한 매트릭스와 외주 샌드박스 경계를 판정한다. */
export function evaluateRbacPermission(
  roleId: StudioRbacRoleId,
  actionId: StudioRbacActionId,
  context?: { readonly isAssignedCutInSandbox?: boolean },
): RbacPermissionDecision {
  const role = STUDIO_RBAC_ROLES[roleId];
  const baseAllowed = role.allowedActions.includes(actionId);
  if (roleId === "outsource-guest" && actionId === "edit-assigned-stage-only" && context?.isAssignedCutInSandbox === false) {
    return {
      roleId,
      actionId,
      allowed: false,
      reasonKo: "외주 게스트는 샌드박스에 포함된 배정 컷(3~5장) 외 타 컷 편집이 차단됩니다.",
    };
  }
  return {
    roleId,
    actionId,
    allowed: baseAllowed,
    reasonKo: baseAllowed
      ? `${role.labelKo} 권한으로 '${RBAC_ACTION_LABELS[actionId]}' 작업을 수행할 수 있습니다.`
      : `${role.labelKo} 권한에는 '${RBAC_ACTION_LABELS[actionId]}' 권한이 부여되지 않았습니다.`,
  };
}

export interface OutsourceSandboxRequest {
  readonly episodeId: string;
  readonly totalEpisodeCuts: number;
  readonly requestedCutIds: readonly string[];
  readonly stageId: PipelineStageId;
  readonly contractorHandle: string;
  readonly sessionCode: string;
  readonly expiresInHours?: number;
}

export interface OutsourceSandboxPackage {
  readonly packageId: string;
  readonly episodeId: string;
  readonly stageId: PipelineStageId;
  readonly exposedCutIds: readonly string[];
  readonly truncatedOverflowCount: number;
  readonly hiddenOtherCutCount: number;
  readonly upstreamLayersReadOnlyLocked: boolean;
  readonly sessionWatermarkSignature: string;
  readonly contractorHandle: string;
  readonly expiresInHours: number;
  readonly minReturnWidthPx: number;
  readonly requiresZeroMissingBom: boolean;
  readonly noticeKo: string;
}

/** 외주 반출 샌드박스 패키지 생성(최대 5컷 격리, 타 컷 비공개, 세션 워터마크·Read-Only 잠금). */
export function createOutsourceSandboxPackage(request: OutsourceSandboxRequest): OutsourceSandboxPackage {
  const uniqueRequested = [...new Set(request.requestedCutIds.map((id) => id.trim()).filter(Boolean))];
  const exposedCutIds = uniqueRequested.slice(0, 5);
  const truncatedOverflowCount = Math.max(0, uniqueRequested.length - exposedCutIds.length);
  const hiddenOtherCutCount = Math.max(0, request.totalEpisodeCuts - exposedCutIds.length);
  const safeSession = request.sessionCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "SBX01";
  const safeHandle = request.contractorHandle.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "GUEST";
  const stage = getPipelineStageSpec(request.stageId);
  const sessionWatermarkSignature = `WM-SBX-${safeSession.toUpperCase()}-${safeHandle.toUpperCase()}`;

  return {
    packageId: `pkg-${request.episodeId}-${safeSession.toLowerCase()}`,
    episodeId: request.episodeId,
    stageId: request.stageId,
    exposedCutIds,
    truncatedOverflowCount,
    hiddenOtherCutCount,
    upstreamLayersReadOnlyLocked: true,
    sessionWatermarkSignature,
    contractorHandle: request.contractorHandle,
    expiresInHours: Math.max(12, Math.min(168, Math.round(request.expiresInHours ?? 72))),
    minReturnWidthPx: stage.minWidthPx,
    requiresZeroMissingBom: true,
    noticeKo:
      truncatedOverflowCount > 0
        ? `보안 정책상 1회 반출 최대 5컷 제한으로 ${truncatedOverflowCount}컷을 제외하고 ${exposedCutIds.length}컷만 격리했습니다(타 ${hiddenOtherCutCount}컷 비공개).`
        : `담당 ${exposedCutIds.length}컷만 격리 노출하고 나머지 ${hiddenOtherCutCount}컷을 완전 비공개 처리했습니다.`,
  };
}

export interface OutsourceReturnVerificationInput {
  readonly returnedCutIds: readonly string[];
  readonly watermarkSignature: string;
  readonly minDetectedWidthPx: number;
  readonly missingRightsBomCount: number;
  readonly layerNamingCompliant: boolean;
}

export interface OutsourceReturnVerificationResult {
  readonly accepted: boolean;
  readonly violationsKo: readonly string[];
  readonly summaryKo: string;
}

/** 외주 반입 시 Rights BOM·해상도·레이어 규칙·허용 컷 범위·세션 워터마크 자동 검증. */
export function verifyOutsourceReturnBundle(
  sandbox: OutsourceSandboxPackage,
  returned: OutsourceReturnVerificationInput,
): OutsourceReturnVerificationResult {
  const violations: string[] = [];
  const allowedSet = new Set(sandbox.exposedCutIds);
  const unauthorized = returned.returnedCutIds.filter((id) => !allowedSet.has(id));
  if (unauthorized.length > 0) violations.push(`비인가 컷 포함 차단: ${unauthorized.join(", ")}`);
  if (returned.returnedCutIds.length === 0) violations.push("반입된 컷 파일이 0건입니다.");
  if (returned.watermarkSignature !== sandbox.sessionWatermarkSignature) {
    violations.push("세션 워터마크 서명 불일치 — 반출 패키지와 동일 세션이 아닙니다.");
  }
  if (returned.minDetectedWidthPx < sandbox.minReturnWidthPx) {
    violations.push(`해상도 미달(${returned.minDetectedWidthPx}px < 최소 ${sandbox.minReturnWidthPx}px)`);
  }
  if (returned.missingRightsBomCount > 0) {
    violations.push(`Rights BOM 미등록 에셋 ${returned.missingRightsBomCount}건 감지 — 반입 보류`);
  }
  if (!returned.layerNamingCompliant) violations.push("표준 공정 레이어 명명 규칙 미준수");

  return {
    accepted: violations.length === 0,
    violationsKo: violations,
    summaryKo:
      violations.length === 0
        ? `${returned.returnedCutIds.length}컷 반입 검증 통과 (BOM 0누락 · 해상도 · 워터마크 일치)`
        : `반입 보류 (${violations.length}건 사유 해소 필요)`,
  };
}

export interface AssigneePayoutSummary {
  readonly assigneeId: string;
  readonly assigneeNameKo: string;
  readonly cutCount: number;
  readonly approvedPayableKrw: number;
  readonly pendingReviewKrw: number;
  readonly totalKrw: number;
}

export interface CutPayoutLedgerSummary {
  readonly totalEntries: number;
  readonly approvedCutCount: number;
  readonly pendingCutCount: number;
  readonly totalApprovedPayableKrw: number;
  readonly totalPendingReviewKrw: number;
  readonly grandTotalKrw: number;
  readonly byAssignee: readonly AssigneePayoutSummary[];
  readonly byStageKrw: Readonly<Partial<Record<PipelineStageId, number>>>;
}

/** 컷당·공정당 원고료 자동 정산 원장(승인 확정 지급액 vs 검수 대기액 분리 집계). */
export function calculateCutPayoutLedger(entries: readonly CutPayoutEntryInput[]): CutPayoutLedgerSummary {
  const assigneeMap = new Map<string, { assigneeNameKo: string; cutCount: number; approvedPayableKrw: number; pendingReviewKrw: number }>();
  const byStageKrw: Partial<Record<PipelineStageId, number>> = {};
  let approvedCutCount = 0;
  let pendingCutCount = 0;
  let totalApprovedPayableKrw = 0;
  let totalPendingReviewKrw = 0;

  for (const entry of entries) {
    const stageSpec = getPipelineStageSpec(entry.stageId);
    const base = Math.max(0, Math.round(entry.baseRateKrw ?? stageSpec.baseCutRateKrw));
    const multiplier = Math.max(0.5, Math.min(3.0, entry.complexityMultiplier ?? 1.0));
    const rush = Math.max(0, Math.round(entry.rushBonusKrw ?? 0));
    const lineAmountKrw = Math.round(base * multiplier) + rush;

    if (entry.gateApproved) {
      approvedCutCount += 1;
      totalApprovedPayableKrw += lineAmountKrw;
    } else {
      pendingCutCount += 1;
      totalPendingReviewKrw += lineAmountKrw;
    }
    byStageKrw[entry.stageId] = (byStageKrw[entry.stageId] ?? 0) + lineAmountKrw;

    const row = assigneeMap.get(entry.assigneeId) ?? {
      assigneeNameKo: entry.assigneeNameKo,
      cutCount: 0,
      approvedPayableKrw: 0,
      pendingReviewKrw: 0,
    };
    row.cutCount += 1;
    if (entry.gateApproved) row.approvedPayableKrw += lineAmountKrw;
    else row.pendingReviewKrw += lineAmountKrw;
    assigneeMap.set(entry.assigneeId, row);
  }

  const byAssignee: AssigneePayoutSummary[] = [...assigneeMap.entries()]
    .map(([assigneeId, row]) => ({
      assigneeId,
      assigneeNameKo: row.assigneeNameKo,
      cutCount: row.cutCount,
      approvedPayableKrw: row.approvedPayableKrw,
      pendingReviewKrw: row.pendingReviewKrw,
      totalKrw: row.approvedPayableKrw + row.pendingReviewKrw,
    }))
    .sort((a, b) => b.totalKrw - a.totalKrw);

  return {
    totalEntries: entries.length,
    approvedCutCount,
    pendingCutCount,
    totalApprovedPayableKrw,
    totalPendingReviewKrw,
    grandTotalKrw: totalApprovedPayableKrw + totalPendingReviewKrw,
    byAssignee,
    byStageKrw,
  };
}

export type BottleneckSeverity = "healthy" | "watch" | "warning" | "critical";

export interface StageBottleneckAlert {
  readonly stageId: PipelineStageId;
  readonly stageLabelKo: string;
  readonly severity: BottleneckSeverity;
  readonly wipCutCount: number;
  readonly overdueCutCount: number;
  readonly blockedCutCount: number;
  readonly estimatedDelayHours: number;
  readonly prescriptionKo: string;
}

export interface PipelineBottleneckReport {
  readonly overallSeverity: BottleneckSeverity;
  readonly totalMonitoredCuts: number;
  readonly totalOverdueCuts: number;
  readonly maxEstimatedDelayHours: number;
  readonly stageAlerts: readonly StageBottleneckAlert[];
}

const SEVERITY_RANK: Readonly<Record<BottleneckSeverity, number>> = Object.freeze({
  healthy: 0,
  watch: 1,
  warning: 2,
  critical: 3,
});

/** 마감 SLA 기준 공정별 적체·지연·선행 차단을 감지하고 실무 재배치 처방전을 생성한다. */
export function detectPipelineBottlenecks(
  cuts: readonly PipelineWorkloadCut[],
  options: { readonly stageWipCapacity?: number } = {},
): PipelineBottleneckReport {
  const capacity = Math.max(1, Math.round(options.stageWipCapacity ?? 2));
  const byStage = new Map<PipelineStageId, PipelineWorkloadCut[]>();
  for (const cut of cuts) {
    const bucket = byStage.get(cut.stageId) ?? [];
    bucket.push(cut);
    byStage.set(cut.stageId, bucket);
  }

  const stageAlerts: StageBottleneckAlert[] = [];
  let totalOverdueCuts = 0;
  let maxEstimatedDelayHours = 0;
  let overallSeverity: BottleneckSeverity = "healthy";

  for (const stageId of PIPELINE_STAGE_ORDER) {
    const bucket = byStage.get(stageId);
    if (!bucket || bucket.length === 0) continue;
    const spec = getPipelineStageSpec(stageId);
    const overdueCuts = bucket.filter((cut) => cut.elapsedHours > spec.defaultSlaHours);
    const blockedCount = bucket.filter((cut) => Boolean(cut.blockedByPreviousStage)).length;
    const maxOverrunHours = overdueCuts.reduce(
      (max, cut) => Math.max(max, Math.ceil(cut.elapsedHours - spec.defaultSlaHours)),
      0,
    );
    const tightDeadline = bucket.some(
      (cut) => cut.remainingDeadlineHours <= Math.max(6, Math.round(spec.defaultSlaHours * 0.75)),
    );
    const congested = bucket.length > capacity;

    let severity: BottleneckSeverity = "healthy";
    if ((overdueCuts.length >= 2 && tightDeadline) || maxOverrunHours >= 6) severity = "critical";
    else if (overdueCuts.length >= 1 || (congested && blockedCount > 0)) severity = "warning";
    else if (congested || blockedCount > 0) severity = "watch";

    totalOverdueCuts += overdueCuts.length;
    if (maxOverrunHours > maxEstimatedDelayHours) maxEstimatedDelayHours = maxOverrunHours;
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[overallSeverity]) overallSeverity = severity;

    const prescriptionKo =
      severity === "critical"
        ? `${spec.shortLabelKo} 병목 심각(+${maxOverrunHours}h): 외주 3~5컷 샌드박스 분할 반출 + AI 보조 어시 즉시 투입 권장`
        : severity === "warning"
          ? `${spec.shortLabelKo} SLA 지연 감지(${overdueCuts.length}컷 초과): 유휴 어시 병렬 투입 또는 AI 초벌 보조 권장`
          : severity === "watch"
            ? `${spec.shortLabelKo} 대기열 주의(WIP ${bucket.length}/${capacity}): 선행 공정 바통 터치 우선 정리 권장`
            : `${spec.shortLabelKo} SLA 정상 흐름 유지 중`;

    stageAlerts.push({
      stageId,
      stageLabelKo: spec.labelKo,
      severity,
      wipCutCount: bucket.length,
      overdueCutCount: overdueCuts.length,
      blockedCutCount: blockedCount,
      estimatedDelayHours: maxOverrunHours,
      prescriptionKo,
    });
  }

  stageAlerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return { overallSeverity, totalMonitoredCuts: cuts.length, totalOverdueCuts, maxEstimatedDelayHours, stageAlerts };
}
