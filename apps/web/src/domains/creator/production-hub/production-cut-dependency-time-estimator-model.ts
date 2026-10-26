/**
 * ClickUp (`/features/time-estimates`, `/features/project-time-tracking`, `/features/gantt-chart-view`) +
 * Miro (`/features/whiteboards` 시각 의존성 그래프) 역공학 내재화:
 * 웹툰 6공정 DAG 병렬 경로(3D 배경 + 인물 선화 동시 진행) 기반 임계 경로(Critical Path) 및 마감 여유 시간 산출 모델.
 */

export type WebtoonDagNodeId =
  | "story-lock"
  | "storyboard-pacing"
  | "bg-3d-layout"
  | "main-inking"
  | "flat-and-shading"
  | "lettering-final-qc";

export interface CutDependencyEstimatorInput {
  readonly targetCutCount: number;
  readonly actionCutRatioPercent: number;
  readonly bg3dCutRatioPercent: number;
  readonly parallelInkingAssistants: 1 | 2 | 3;
  readonly weeklyDeadlineBudgetHours: number;
}

export interface EvaluatedDagStageNode {
  readonly id: WebtoonDagNodeId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ownerRoleKo: string;
  readonly ownerRoleEn: string;
  readonly dependsOn: readonly WebtoonDagNodeId[];
  readonly estimatedHours: number;
  readonly earliestStartHour: number;
  readonly earliestFinishHour: number;
  readonly isOnCriticalPath: boolean;
}

export interface CutDependencyCriticalPathReport {
  readonly clampedCutCount: number;
  readonly sequentialTotalHours: number;
  readonly criticalPathHours: number;
  readonly parallelSavedHours: number;
  readonly slackHours: number;
  readonly deadlineRiskLevel: "safe" | "tight" | "overrun";
  readonly bottleneckNodeId: WebtoonDagNodeId;
  readonly nodes: readonly EvaluatedDagStageNode[];
  readonly recommendationKo: string;
  readonly recommendationEn: string;
}

export function evaluateEpisodeCutDependencyCriticalPath(
  input: CutDependencyEstimatorInput
): CutDependencyCriticalPathReport {
  const cuts = Math.max(20, Math.min(160, Math.round(input.targetCutCount || 65)));
  const actionRatio = Math.max(0, Math.min(100, input.actionCutRatioPercent)) / 100;
  const bgRatio = Math.max(0, Math.min(100, input.bg3dCutRatioPercent)) / 100;
  const inkDivisor =
    input.parallelInkingAssistants === 3
      ? 2.2
      : input.parallelInkingAssistants === 2
        ? 1.65
        : 1.0;

  const storyHours = Math.round(cuts * 0.14);
  const storyboardHours = Math.round(cuts * (0.22 + actionRatio * 0.12));
  const bg3dHours = Math.round(cuts * (0.16 + bgRatio * 0.24));
  const mainInkHours = Math.max(
    4,
    Math.round((cuts * (0.38 + actionRatio * 0.22)) / inkDivisor)
  );
  const flatShadeHours = Math.round(cuts * (0.28 + actionRatio * 0.08));
  const letteringHours = Math.max(3, Math.round(cuts * 0.09));

  const storyStart = 0;
  const storyFinish = storyHours;

  const sbStart = storyFinish;
  const sbFinish = sbStart + storyboardHours;

  // Parallel branch after storyboard-pacing: bg-3d-layout || main-inking
  const bgStart = sbFinish;
  const bgFinish = bgStart + bg3dHours;

  const inkStart = sbFinish;
  const inkFinish = inkStart + mainInkHours;

  const parallelJoinHour = Math.max(bgFinish, inkFinish);
  const bgControlsParallelBranch = bgFinish >= inkFinish;

  const flatStart = parallelJoinHour;
  const flatFinish = flatStart + flatShadeHours;

  const letterStart = flatFinish;
  const letterFinish = letterStart + letteringHours;

  const sequentialTotalHours =
    storyHours + storyboardHours + bg3dHours + mainInkHours + flatShadeHours + letteringHours;
  const criticalPathHours = letterFinish;
  const parallelSavedHours = Math.max(0, sequentialTotalHours - criticalPathHours);
  const slackHours = Math.round(input.weeklyDeadlineBudgetHours - criticalPathHours);

  const deadlineRiskLevel: "safe" | "tight" | "overrun" =
    slackHours < 0 ? "overrun" : slackHours < 10 ? "tight" : "safe";

  const rawNodes: EvaluatedDagStageNode[] = [
    {
      id: "story-lock",
      labelKo: "1. 스토리·대사 락 (Story Lock)",
      labelEn: "1. Story & Dialogue Lock",
      ownerRoleKo: "스토리 작가",
      ownerRoleEn: "Story Writer",
      dependsOn: [],
      estimatedHours: storyHours,
      earliestStartHour: storyStart,
      earliestFinishHour: storyFinish,
      isOnCriticalPath: true,
    },
    {
      id: "storyboard-pacing",
      labelKo: "2. 세로 스크롤 콘티·연출",
      labelEn: "2. Vertical Scroll Storyboard",
      ownerRoleKo: "콘티·연출 작가",
      ownerRoleEn: "Storyboard Artist",
      dependsOn: ["story-lock"],
      estimatedHours: storyboardHours,
      earliestStartHour: sbStart,
      earliestFinishHour: sbFinish,
      isOnCriticalPath: true,
    },
    {
      id: "bg-3d-layout",
      labelKo: "3A. 3D 배경·카메라 화각 매칭 (병렬)",
      labelEn: "3A. 3D Background & Camera Layout (Parallel)",
      ownerRoleKo: "3D 배경 어시",
      ownerRoleEn: "3D Background Artist",
      dependsOn: ["storyboard-pacing"],
      estimatedHours: bg3dHours,
      earliestStartHour: bgStart,
      earliestFinishHour: bgFinish,
      isOnCriticalPath: bgControlsParallelBranch,
    },
    {
      id: "main-inking",
      labelKo: "3B. 인물 펜선·선화 작화 (병렬)",
      labelEn: "3B. Character Line Art & Inking (Parallel)",
      ownerRoleKo: "메인 선화 + 선화 어시",
      ownerRoleEn: "Lead Inker + Assistants",
      dependsOn: ["storyboard-pacing"],
      estimatedHours: mainInkHours,
      earliestStartHour: inkStart,
      earliestFinishHour: inkFinish,
      isOnCriticalPath: !bgControlsParallelBranch,
    },
    {
      id: "flat-and-shading",
      labelKo: "4. 밑색·명암·조명 후보정",
      labelEn: "4. Flats, Shading & Lighting FX",
      ownerRoleKo: "채색·후보정 팀",
      ownerRoleEn: "Color & Compositing Team",
      dependsOn: ["bg-3d-layout", "main-inking"],
      estimatedHours: flatShadeHours,
      earliestStartHour: flatStart,
      earliestFinishHour: flatFinish,
      isOnCriticalPath: true,
    },
    {
      id: "lettering-final-qc",
      labelKo: "5. 식자·말풍선·최종 슬라이스 QC",
      labelEn: "5. Lettering & Final Slice QC",
      ownerRoleKo: "식자 담당·총괄 PD",
      ownerRoleEn: "Letterer & Lead PD",
      dependsOn: ["flat-and-shading"],
      estimatedHours: letteringHours,
      earliestStartHour: letterStart,
      earliestFinishHour: letterFinish,
      isOnCriticalPath: true,
    },
  ];

  const bottleneckNode = [...rawNodes].sort((a, b) => b.estimatedHours - a.estimatedHours)[0];

  const recommendationKo =
    deadlineRiskLevel === "overrun"
      ? `마감 예산 대비 ${Math.abs(slackHours)}시간 초과 위험! '${bottleneckNode.labelKo}' 공정에 보조 인력을 추가 배정하거나 고밀도 액션 컷 일부를 다음 회차 클리프행어로 분할하세요.`
      : deadlineRiskLevel === "tight"
        ? `마감 여유가 ${slackHours}시간으로 타이트합니다. 3D 배경과 인물 선화를 콘티 확정 즉시 동시 착수하여 병렬 단축(${parallelSavedHours}h)을 유지하세요.`
        : `병렬 분업으로 직렬 대비 ${parallelSavedHours}시간을 단축하여 마감 대비 ${slackHours}시간의 안전 버퍼를 확보했습니다.`;

  const recommendationEn =
    deadlineRiskLevel === "overrun"
      ? `Overrun risk by ${Math.abs(slackHours)}h! Assign an extra assistant to '${bottleneckNode.labelEn}' or split dense action cuts.`
      : deadlineRiskLevel === "tight"
        ? `Tight ${slackHours}h buffer. Launch 3D Background and Character Inking concurrently right after Storyboard lock (saving ${parallelSavedHours}h).`
        : `Parallel division saves ${parallelSavedHours}h over sequential flow, securing a safe +${slackHours}h buffer.`;

  return Object.freeze({
    clampedCutCount: cuts,
    sequentialTotalHours,
    criticalPathHours,
    parallelSavedHours,
    slackHours,
    deadlineRiskLevel,
    bottleneckNodeId: bottleneckNode.id,
    nodes: Object.freeze(rawNodes),
    recommendationKo,
    recommendationEn,
  });
}
