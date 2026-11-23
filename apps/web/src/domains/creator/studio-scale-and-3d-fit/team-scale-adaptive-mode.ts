/**
 * 1인 작가 · 2~3인 소규모 · 7~8인 프로덕션 · 30인+ 대규모 스튜디오
 * 4단계 창작 규모별 자동 적응 워크스페이스 엔진.
 *
 * 인원 규모에 따라 불필요한 결재/배정 UI는 완전히 숨기고,
 * 필요한 협업 릴레이·병목 히트맵·RBAC·외주 샌드박스·병렬 렌더 큐만 정밀 활성화한다.
 */

export type TeamScaleTierId =
  | "solo"
  | "small-team"
  | "production-team"
  | "enterprise-studio";

export interface TeamScaleUiVisibility {
  readonly approvalWorkflow: boolean;
  readonly taskAssignment: boolean;
  readonly aiMultiAssistantDock: boolean;
  readonly relay3LaneBoard: boolean;
  readonly oneClickBatonTouch: boolean;
  readonly layerLockGuards: boolean;
  readonly kanbanBoard: boolean;
  readonly bottleneckHeatmap: boolean;
  readonly biblePaletteMandatorySync: boolean;
  readonly multiTitleControlTower: boolean;
  readonly rbacAdminPanel: boolean;
  readonly outsourceSandbox: boolean;
  readonly rightsBomAutoAudit: boolean;
  readonly renderFarmQueue: boolean;
}

export interface RelayLaneDefinition {
  readonly id: "story-lineart" | "flat-shading" | "bg-lettering";
  readonly order: 1 | 2 | 3;
  readonly labelKo: string;
  readonly ownedLayersKo: readonly string[];
  readonly lockedOnHandoff: boolean;
}

export interface BiblePaletteSyncPolicy {
  readonly mandatoryBibleSync: boolean;
  readonly mandatoryPaletteSync: boolean;
  readonly maxOklchDriftWarning: number;
  readonly lockCharacterSheetVersion: boolean;
}

export interface StudioTeamScalePreset {
  readonly id: TeamScaleTierId;
  readonly labelKo: string;
  readonly memberRangeLabelKo: string;
  readonly minMembers: number;
  readonly maxMembers: number | null;
  readonly taglineKo: string;
  readonly canvasViewportTargetPct: number;
  readonly uiVisibility: TeamScaleUiVisibility;
  readonly activeHighlightsKo: readonly string[];
  readonly hiddenClutterKo: readonly string[];
  readonly relayLanes: readonly RelayLaneDefinition[];
  readonly kanbanColumnsKo: readonly string[];
  readonly biblePaletteSyncPolicy: BiblePaletteSyncPolicy;
}

export const SMALL_TEAM_RELAY_LANES: readonly RelayLaneDefinition[] = [
  { id: "story-lineart", order: 1, labelKo: "1레인 · 콘티 / 선화", ownedLayersKo: ["콘티 러프", "선화 잉크", "말풍선 가이드"], lockedOnHandoff: true },
  { id: "flat-shading", order: 2, labelKo: "2레인 · 밑색 / 채색", ownedLayersKo: ["밑색 마스크", "셀 명암", "후보정 광원"], lockedOnHandoff: true },
  { id: "bg-lettering", order: 3, labelKo: "3레인 · 배경 / 식자", ownedLayersKo: ["3D 배경 패스", "식자 대사", "효과음(SFX)"], lockedOnHandoff: true },
] as const;

export const PRODUCTION_KANBAN_COLUMNS_KO: readonly string[] = [
  "콘티", "선화", "밑색", "명암·채색", "3D 배경", "식자·후보정", "최종 검수",
] as const;

export const STUDIO_TEAM_SCALE_PRESETS: Readonly<Record<TeamScaleTierId, StudioTeamScalePreset>> = {
  solo: {
    id: "solo",
    labelKo: "1인 작가 모드",
    memberRangeLabelKo: "1명",
    minMembers: 1,
    maxMembers: 1,
    taglineKo: "결재·배정 UI 완전 숨김 · 캔버스 90% 극대화 · AI 멀티 어시스턴트 전면 배치",
    canvasViewportTargetPct: 90,
    uiVisibility: {
      approvalWorkflow: false,
      taskAssignment: false,
      aiMultiAssistantDock: true,
      relay3LaneBoard: false,
      oneClickBatonTouch: false,
      layerLockGuards: false,
      kanbanBoard: false,
      bottleneckHeatmap: false,
      biblePaletteMandatorySync: false,
      multiTitleControlTower: false,
      rbacAdminPanel: false,
      outsourceSandbox: false,
      rightsBomAutoAudit: false,
      renderFarmQueue: false,
    },
    activeHighlightsKo: [
      "90% 울트라 와이드 캔버스 집중 뷰",
      "AI 멀티 어시스턴트(밑색·3D 배경·식자·포즈) 전면 1클릭 배치",
      "복잡한 결재·담당 배정·권한 크롬 0% 노출",
    ],
    hiddenClutterKo: [
      "결재 승인함",
      "담당자 배정 모달",
      "공정 칸반 보드",
      "RBAC 권한 관리",
      "외주 반출 샌드박스",
    ],
    relayLanes: [],
    kanbanColumnsKo: [],
    biblePaletteSyncPolicy: {
      mandatoryBibleSync: false,
      mandatoryPaletteSync: false,
      maxOklchDriftWarning: 0.08,
      lockCharacterSheetVersion: false,
    },
  },
  "small-team": {
    id: "small-team",
    labelKo: "소규모 팀 (2~3인)",
    memberRangeLabelKo: "2~3명",
    minMembers: 2,
    maxMembers: 3,
    taglineKo: "콘티/선화 · 밑색/채색 · 배경/식자 3레인 릴레이 + 1클릭 바통 터치 + 레이어 자동 잠금",
    canvasViewportTargetPct: 86,
    uiVisibility: {
      approvalWorkflow: false,
      taskAssignment: true,
      aiMultiAssistantDock: true,
      relay3LaneBoard: true,
      oneClickBatonTouch: true,
      layerLockGuards: true,
      kanbanBoard: false,
      bottleneckHeatmap: false,
      biblePaletteMandatorySync: false,
      multiTitleControlTower: false,
      rbacAdminPanel: false,
      outsourceSandbox: false,
      rightsBomAutoAudit: false,
      renderFarmQueue: false,
    },
    activeHighlightsKo: [
      "3레인 릴레이(콘티/선화 → 밑색/채색 → 배경/식자)",
      "1클릭 바통 터치 인계 & 완료 레이어 자동 잠금",
      "무거운 결재·조직 관리 메뉴 숨김 유지",
    ],
    hiddenClutterKo: ["다작품 컨트롤 타워", "RBAC 권한 매트릭스", "외주 반출 샌드박스", "병렬 렌더 팜 큐"],
    relayLanes: SMALL_TEAM_RELAY_LANES,
    kanbanColumnsKo: [],
    biblePaletteSyncPolicy: {
      mandatoryBibleSync: false,
      mandatoryPaletteSync: true,
      maxOklchDriftWarning: 0.05,
      lockCharacterSheetVersion: false,
    },
  },
  "production-team": {
    id: "production-team",
    labelKo: "프로덕션 팀 (7~8인)",
    memberRangeLabelKo: "4~15명 (권장 7~8명)",
    minMembers: 4,
    maxMembers: 15,
    taglineKo: "공정별 칸반 + 마감 병목 히트맵 + 캐릭터 바이블·팔레트 강제 동기화",
    canvasViewportTargetPct: 84,
    uiVisibility: {
      approvalWorkflow: true,
      taskAssignment: true,
      aiMultiAssistantDock: true,
      relay3LaneBoard: true,
      oneClickBatonTouch: true,
      layerLockGuards: true,
      kanbanBoard: true,
      bottleneckHeatmap: true,
      biblePaletteMandatorySync: true,
      multiTitleControlTower: false,
      rbacAdminPanel: false,
      outsourceSandbox: false,
      rightsBomAutoAudit: true,
      renderFarmQueue: false,
    },
    activeHighlightsKo: [
      "7단계 공정별 칸반 보드 & 실시간 컷 진행 현황",
      "마감 병목 히트맵(지연 공정 자동 탐지 · 인력 재배치 권고)",
      "캐릭터 바이블 · OKLCH 공식 팔레트 강제 동기화 락",
    ],
    hiddenClutterKo: ["다작품 컨트롤 타워", "엔터프라이즈 RBAC 정책 편집기"],
    relayLanes: SMALL_TEAM_RELAY_LANES,
    kanbanColumnsKo: PRODUCTION_KANBAN_COLUMNS_KO,
    biblePaletteSyncPolicy: {
      mandatoryBibleSync: true,
      mandatoryPaletteSync: true,
      maxOklchDriftWarning: 0.03,
      lockCharacterSheetVersion: true,
    },
  },
  "enterprise-studio": {
    id: "enterprise-studio",
    labelKo: "대규모 스튜디오 (30인+)",
    memberRangeLabelKo: "30명+",
    minMembers: 16,
    maxMembers: null,
    taglineKo: "다작품 컨트롤 타워 + RBAC 권한 + 외주 컷 샌드박스·워터마크·권리 BOM 감사 + 병렬 렌더 큐",
    canvasViewportTargetPct: 82,
    uiVisibility: {
      approvalWorkflow: true,
      taskAssignment: true,
      aiMultiAssistantDock: true,
      relay3LaneBoard: true,
      oneClickBatonTouch: true,
      layerLockGuards: true,
      kanbanBoard: true,
      bottleneckHeatmap: true,
      biblePaletteMandatorySync: true,
      multiTitleControlTower: true,
      rbacAdminPanel: true,
      outsourceSandbox: true,
      rightsBomAutoAudit: true,
      renderFarmQueue: true,
    },
    activeHighlightsKo: [
      "다작품 컨트롤 타워 (전체 연재작 마감·병목 통합 감시)",
      "7역할 세분화 RBAC 권한 게이트",
      "외주 컷 단위 반출 샌드박스 · 포렌식 워터마크 · 권리 BOM 자동 감사",
      "병렬 3D/셀셰이더 렌더 큐 워커 균등 분배",
    ],
    hiddenClutterKo: [],
    relayLanes: SMALL_TEAM_RELAY_LANES,
    kanbanColumnsKo: PRODUCTION_KANBAN_COLUMNS_KO,
    biblePaletteSyncPolicy: {
      mandatoryBibleSync: true,
      mandatoryPaletteSync: true,
      maxOklchDriftWarning: 0.02,
      lockCharacterSheetVersion: true,
    },
  },
};

export const STUDIO_TEAM_SCALE_ORDER: readonly TeamScaleTierId[] = [
  "solo",
  "small-team",
  "production-team",
  "enterprise-studio",
] as const;

export interface ResolvedTeamScaleWorkspaceConfig {
  readonly tierId: TeamScaleTierId;
  readonly memberCount: number;
  readonly preset: StudioTeamScalePreset;
  readonly uiVisibility: TeamScaleUiVisibility;
  readonly canvasViewportTargetPct: number;
  readonly activeModuleCount: number;
  readonly hiddenClutterCount: number;
}

export function classifyTeamScaleByMemberCount(memberCount: number): TeamScaleTierId {
  const safeCount = Math.max(1, Math.floor(memberCount));
  if (safeCount <= 1) return "solo";
  if (safeCount <= 3) return "small-team";
  if (safeCount <= 15) return "production-team";
  return "enterprise-studio";
}

/**
 * 인원수 또는 명시적 규모 ID로 스튜디오 UI 가시성·레이아웃·협업 권한 정책을 결정한다.
 */
export function resolveTeamScaleWorkspaceConfig(
  tierOrMemberCount: TeamScaleTierId | number,
  visibilityOverrides?: Partial<TeamScaleUiVisibility>,
): ResolvedTeamScaleWorkspaceConfig {
  const tierId: TeamScaleTierId =
    typeof tierOrMemberCount === "number"
      ? classifyTeamScaleByMemberCount(tierOrMemberCount)
      : tierOrMemberCount;
  const preset = STUDIO_TEAM_SCALE_PRESETS[tierId];
  const defaultMembers =
    tierId === "solo" ? 1 : tierId === "small-team" ? 3 : tierId === "production-team" ? 8 : 36;
  const memberCount =
    typeof tierOrMemberCount === "number" ? Math.max(1, Math.floor(tierOrMemberCount)) : defaultMembers;

  const uiVisibility: TeamScaleUiVisibility = {
    ...preset.uiVisibility,
    ...visibilityOverrides,
  };

  const activeModuleCount = Object.values(uiVisibility).filter(Boolean).length;
  const hiddenClutterCount = Object.values(uiVisibility).filter((visible) => !visible).length;

  return {
    tierId,
    memberCount,
    preset,
    uiVisibility,
    canvasViewportTargetPct: preset.canvasViewportTargetPct,
    activeModuleCount,
    hiddenClutterCount,
  };
}

// ---------------------------------------------------------------------------
// 2~3인 1클릭 바통 터치 & 레이어 잠금
// ---------------------------------------------------------------------------

export interface BatonTouchHandoffResult {
  readonly fromLane: RelayLaneDefinition;
  readonly toLane: RelayLaneDefinition | null;
  readonly lockedLayerNamesKo: readonly string[];
  readonly unlockedLayerNamesKo: readonly string[];
  readonly cutRangeLabel: string;
  readonly handedOffBy: string;
  readonly statusMessageKo: string;
}

export function createBatonTouchHandoff(
  currentLaneId: RelayLaneDefinition["id"],
  handedOffBy: string,
  cutRangeLabel: string,
): BatonTouchHandoffResult {
  const currentIndex = SMALL_TEAM_RELAY_LANES.findIndex((lane) => lane.id === currentLaneId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const fromLane = SMALL_TEAM_RELAY_LANES[safeIndex];
  const toLane = SMALL_TEAM_RELAY_LANES[safeIndex + 1] ?? null;

  return {
    fromLane,
    toLane,
    lockedLayerNamesKo: fromLane.ownedLayersKo,
    unlockedLayerNamesKo: toLane ? toLane.ownedLayersKo : [],
    cutRangeLabel,
    handedOffBy,
    statusMessageKo: toLane
      ? `${cutRangeLabel} · ${fromLane.labelKo} 레이어를 잠그고 ${toLane.labelKo}으로 바통을 넘겼습니다.`
      : `${cutRangeLabel} · 최종 레인(${fromLane.labelKo})까지 릴레이를 완료해 출고 대기 상태로 잠갔습니다.`,
  };
}

// ---------------------------------------------------------------------------
// 7~8인 마감 병목 히트맵
// ---------------------------------------------------------------------------

export interface StageWorkloadInput {
  readonly stageKo: string;
  readonly queuedCuts: number;
  readonly activeArtists: number;
  readonly avgMinutesPerCut: number;
  readonly hoursUntilDeadline: number;
}

export interface StageBottleneckCell {
  readonly stageKo: string;
  readonly queuedCuts: number;
  readonly estimatedHoursRemaining: number;
  readonly pressureRatio: number;
  readonly severity: "smooth" | "watch" | "bottleneck" | "critical";
  readonly actionHintKo: string;
}

export function computeDeadlineBottleneckHeatmap(
  stages: readonly StageWorkloadInput[],
): readonly StageBottleneckCell[] {
  return stages.map((stage) => {
    const artists = Math.max(1, stage.activeArtists);
    const deadlineHours = Math.max(0.5, stage.hoursUntilDeadline);
    const estimatedHoursRemaining =
      Math.round(((stage.queuedCuts * stage.avgMinutesPerCut) / 60 / artists) * 10) / 10;
    const pressureRatio = Math.round((estimatedHoursRemaining / deadlineHours) * 100) / 100;

    const severity: StageBottleneckCell["severity"] =
      pressureRatio >= 1.15
        ? "critical"
        : pressureRatio >= 0.85
          ? "bottleneck"
          : pressureRatio >= 0.6
            ? "watch"
            : "smooth";

    const actionHintKo =
      severity === "critical"
        ? `${stage.stageKo} 공정 마감 초과 위험 — 유휴 인력 1~2명 긴급 재배치 필요`
        : severity === "bottleneck"
          ? `${stage.stageKo} 공정 병목 임박 — 선행 완료 컷 우선 전달 권장`
          : severity === "watch"
            ? `${stage.stageKo} 공정 정상 가동 중 · 2시간 후 재점검`
            : `${stage.stageKo} 공정 여유 있음`;

    return {
      stageKo: stage.stageKo,
      queuedCuts: stage.queuedCuts,
      estimatedHoursRemaining,
      pressureRatio,
      severity,
      actionHintKo,
    };
  });
}

// ---------------------------------------------------------------------------
// 30인+ RBAC · 외주 컷 샌드박스/워터마크/권리 BOM 감사 · 병렬 렌더 큐
// ---------------------------------------------------------------------------

export type EnterpriseStudioRole =
  | "studio-director"
  | "line-producer"
  | "lead-artist"
  | "colorist"
  | "bg3d-specialist"
  | "external-contractor"
  | "legal-rights-auditor";

export type EnterpriseRbacAction =
  | "approveFinal"
  | "manageRbac"
  | "exportCutSandbox"
  | "auditRightsBom"
  | "dispatchRenderQueue"
  | "editMasterBible"
  | "viewAllTitles";

const ENTERPRISE_RBAC_MATRIX: Readonly<
  Record<EnterpriseStudioRole, readonly EnterpriseRbacAction[]>
> = {
  "studio-director": [
    "approveFinal",
    "manageRbac",
    "exportCutSandbox",
    "auditRightsBom",
    "dispatchRenderQueue",
    "editMasterBible",
    "viewAllTitles",
  ],
  "line-producer": [
    "approveFinal",
    "exportCutSandbox",
    "dispatchRenderQueue",
    "viewAllTitles",
  ],
  "lead-artist": ["approveFinal", "editMasterBible", "dispatchRenderQueue"],
  colorist: ["dispatchRenderQueue"],
  "bg3d-specialist": ["dispatchRenderQueue"],
  "external-contractor": [],
  "legal-rights-auditor": ["auditRightsBom", "viewAllTitles"],
};

export function evaluateEnterpriseRbacPermission(
  role: EnterpriseStudioRole,
  action: EnterpriseRbacAction,
): boolean {
  return ENTERPRISE_RBAC_MATRIX[role].includes(action);
}

export interface RightsBomAssetItem {
  readonly assetId: string;
  readonly titleKo: string;
  readonly kind: "font" | "3d-prop" | "3d-bg" | "brush" | "texture";
  readonly licenseCleared: boolean;
  readonly allowOutsourceRedistribution: boolean;
}

export interface OutsourceCutSandboxInput {
  readonly episodeId: string;
  readonly cutIds: readonly string[];
  readonly recipientId: string;
  readonly expiresInHours: number;
  readonly bomAssets: readonly RightsBomAssetItem[];
}

export interface OutsourceCutSandboxPackage {
  readonly allowed: boolean;
  readonly scopeMode: "cut-slice-only";
  readonly cutCount: number;
  readonly forensicWatermarkId: string;
  readonly expiresInHours: number;
  readonly rightsBomPassed: boolean;
  readonly blockedAssetIds: readonly string[];
  readonly auditSummaryKo: string;
}

export function buildOutsourceCutSandboxPackage(
  input: OutsourceCutSandboxInput,
): OutsourceCutSandboxPackage {
  const blockedAssetIds = input.bomAssets
    .filter((item) => !item.licenseCleared || !item.allowOutsourceRedistribution)
    .map((item) => item.assetId);
  const rightsBomPassed = blockedAssetIds.length === 0;
  const safeHours = Math.min(168, Math.max(1, Math.round(input.expiresInHours)));
  const cleanRecipient = input.recipientId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 16) || "partner";
  const forensicWatermarkId = `TS-WM-${input.episodeId.toUpperCase()}-${cleanRecipient.toUpperCase()}-C${input.cutIds.length}`;

  return {
    allowed: rightsBomPassed && input.cutIds.length > 0,
    scopeMode: "cut-slice-only",
    cutCount: input.cutIds.length,
    forensicWatermarkId,
    expiresInHours: safeHours,
    rightsBomPassed,
    blockedAssetIds,
    auditSummaryKo: rightsBomPassed
      ? `권리 BOM ${input.bomAssets.length}종 전수 통과 · ${input.cutIds.length}컷 샌드박스 반출 허용 (${safeHours}시간 만료 · 워터마크 ${forensicWatermarkId})`
      : `권리 BOM 감사 차단: 외주 재배포 불가 또는 미검증 에셋 ${blockedAssetIds.length}건 (${blockedAssetIds.join(", ")})`,
  };
}

export interface RenderQueueJob {
  readonly jobId: string;
  readonly titleKo: string;
  readonly estimatedSeconds: number;
  readonly priority: "urgent" | "normal" | "batch";
}

export interface RenderWorkerAssignment {
  readonly workerId: string;
  readonly assignedJobIds: readonly string[];
  readonly totalEstimatedSeconds: number;
}

export interface ParallelRenderQueuePlan {
  readonly workers: readonly RenderWorkerAssignment[];
  readonly makespanSeconds: number;
  readonly sequentialTotalSeconds: number;
  readonly speedupFactor: number;
}

/** 우선순위 + 최장 작업 우선(LPT) 그리디 알고리즘으로 병렬 렌더 큐를 균등 분배한다. */
export function distributeParallelRenderQueue(
  jobs: readonly RenderQueueJob[],
  workerIds: readonly string[],
): ParallelRenderQueuePlan {
  const safeWorkers = workerIds.length > 0 ? workerIds : ["gpu-node-1"];
  const priorityRank: Record<RenderQueueJob["priority"], number> = {
    urgent: 0,
    normal: 1,
    batch: 2,
  };
  const sorted = [...jobs].sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      b.estimatedSeconds - a.estimatedSeconds,
  );

  const buckets = safeWorkers.map((workerId) => ({
    workerId,
    assignedJobIds: [] as string[],
    totalEstimatedSeconds: 0,
  }));

  for (const job of sorted) {
    let target = buckets[0];
    for (const bucket of buckets) {
      if (bucket.totalEstimatedSeconds < target.totalEstimatedSeconds) {
        target = bucket;
      }
    }
    target.assignedJobIds.push(job.jobId);
    target.totalEstimatedSeconds += Math.max(1, job.estimatedSeconds);
  }

  const sequentialTotalSeconds = sorted.reduce(
    (sum, job) => sum + Math.max(1, job.estimatedSeconds),
    0,
  );
  const makespanSeconds = buckets.reduce(
    (max, bucket) => Math.max(max, bucket.totalEstimatedSeconds),
    0,
  );
  const speedupFactor =
    makespanSeconds > 0
      ? Math.round((sequentialTotalSeconds / makespanSeconds) * 100) / 100
      : 1;

  return {
    workers: buckets,
    makespanSeconds,
    sequentialTotalSeconds,
    speedupFactor,
  };
}
