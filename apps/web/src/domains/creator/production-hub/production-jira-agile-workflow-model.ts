/**
 * 아틀라시안 지라(Atlassian Jira) REA 역공학 기반
 * 웹툰 일감 배정·회차 스프린트 컷 가중치 용량(Capacity) 밸런서·선후행 블로커(`blocks`/`is-blocked-by`) 전파·
 * `WHEN-IF-THEN` 스마트 자동화 규칙 엔진 도메인 모델.
 */

export type JiraIssueKind = "epic" | "task" | "subtask";
export type JiraStatusCategory = "todo" | "in_progress" | "in_review" | "blocked" | "done";
export type JiraPriorityLevel = "highest" | "high" | "medium" | "low";
export type JiraProcessStep = "storyboard" | "bg3d" | "lineart" | "coloring" | "typesetting";

/**
 * 웹툰 컷 난이도 가중 티어:
 * - `dialogue_1pt`: 일상/대화 컷 (컷당 1pt)
 * - `directed_2pt`: 중형 연출/감정선 컷 (컷당 2pt)
 * - `high_action_4pt`: 대형 액션/군중/3D 합성 컷 (컷당 4pt)
 */
export type CutDifficultyTier = "dialogue_1pt" | "directed_2pt" | "high_action_4pt";

export interface JiraProductionIssue {
  readonly issueId: string;
  readonly issueKey: string;
  readonly kind: JiraIssueKind;
  readonly parentIssueKey: string | null;
  readonly episodeCode: string;
  readonly processStep: JiraProcessStep;
  readonly summary: string;
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly status: JiraStatusCategory;
  readonly priority: JiraPriorityLevel;
  readonly cutCount: number;
  readonly difficultyTier: CutDifficultyTier;
  readonly effortPoints: number;
  readonly dueDateIso: string;
  readonly blockedByIssueKeys: readonly string[];
}

export interface JiraAssigneeCapacityProfile {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly roleLabel: string;
  readonly primaryProcess: JiraProcessStep;
  readonly sprintCapacityPoints: number;
  readonly wipLimitCount: number;
}

export interface IssueBlockerDiagnosis {
  readonly issueKey: string;
  readonly hasUnresolvedBlocker: boolean;
  readonly activeBlockerKeys: readonly string[];
  readonly isDeadlineAtRisk: boolean;
  readonly daysUntilDue: number;
  readonly riskReason: string | null;
}

export interface BlockerAndCriticalPathReport {
  readonly diagnosesByKey: Readonly<Record<string, IssueBlockerDiagnosis>>;
  readonly unresolvedBlockerIssueKeys: readonly string[];
  readonly criticalPathAtRiskKeys: readonly string[];
}

export interface AssigneeWorkloadSummary {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly roleLabel: string;
  readonly sprintCapacityPoints: number;
  readonly assignedActivePoints: number;
  readonly completedPoints: number;
  readonly utilizationPercent: number;
  readonly overloadPoints: number;
  readonly isOverCapacity: boolean;
  readonly inProgressIssueCount: number;
  readonly wipLimitCount: number;
  readonly isWipExceeded: boolean;
}

export interface JiraAutomationRule {
  readonly ruleId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly triggerWhenStatusBecomes: JiraStatusCategory;
  readonly ifProcessStepEquals: JiraProcessStep;
  readonly thenAction:
    | "unblock_and_start_dependents"
    | "escalate_priority_to_highest"
    | "auto_assign_next_stage_lead";
  readonly targetAssigneeId?: string;
  readonly targetAssigneeName?: string;
}

export interface JiraAutomationExecutionResult {
  readonly updatedIssues: readonly JiraProductionIssue[];
  readonly triggeredRuleNames: readonly string[];
  readonly auditLogs: readonly string[];
}

const DIFFICULTY_WEIGHT_MAP: Readonly<Record<CutDifficultyTier, number>> = {
  dialogue_1pt: 1,
  directed_2pt: 2,
  high_action_4pt: 4,
};

export function computeCutEffortPoints(
  cutCount: number,
  difficultyTier: CutDifficultyTier,
): number {
  const safeCuts = Math.max(0, Math.trunc(cutCount));
  return safeCuts * DIFFICULTY_WEIGHT_MAP[difficultyTier];
}

export function getJiraStatusLabelKo(status: JiraStatusCategory): string {
  switch (status) {
    case "todo":
      return "할 일(To Do)";
    case "in_progress":
      return "진행 중(In Progress)";
    case "in_review":
      return "검수 중(In Review)";
    case "blocked":
      return "차단됨(Blocked)";
    case "done":
      return "완료(Done)";
  }
}

export function getJiraProcessLabelKo(step: JiraProcessStep): string {
  switch (step) {
    case "storyboard":
      return "콘티";
    case "bg3d":
      return "3D 배경";
    case "lineart":
      return "선화";
    case "coloring":
      return "채색·명암";
    case "typesetting":
      return "식자·후보정";
  }
}

function diffDaysBetweenIso(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso.slice(0, 10));
  const toMs = Date.parse(toIso.slice(0, 10));
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * 이슈 간 `blockedByIssueKeys`(`is-blocked-by`) 의존성 그래프를 순회하여
 * 미해결 선행 블로커와 마감 임박(D-1 이하 또는 지연) 전파 리스크를 계산한다.
 */
export function analyzeBlockerAndCriticalPath(
  issues: readonly JiraProductionIssue[],
  referenceDateIso: string,
): BlockerAndCriticalPathReport {
  const issueByKey = new Map(issues.map((issue) => [issue.issueKey, issue]));
  const diagnosesByKey: Record<string, IssueBlockerDiagnosis> = {};
  const unresolvedBlockerIssueKeys: string[] = [];
  const criticalPathAtRiskKeys: string[] = [];

  for (const issue of issues) {
    const activeBlockerKeys = issue.blockedByIssueKeys.filter((blockerKey) => {
      const blocker = issueByKey.get(blockerKey);
      return blocker !== undefined && blocker.status !== "done";
    });

    const hasUnresolvedBlocker = activeBlockerKeys.length > 0 && issue.status !== "done";
    const daysUntilDue = diffDaysBetweenIso(referenceDateIso, issue.dueDateIso);
    const isDeadlineTight = issue.status !== "done" && daysUntilDue <= 1;
    const isDeadlineAtRisk = hasUnresolvedBlocker || isDeadlineTight || issue.status === "blocked";

    let riskReason: string | null = null;
    if (hasUnresolvedBlocker) {
      riskReason = `선행 일감 미완료 블로커(${activeBlockerKeys.join(", ")})`;
    } else if (issue.status === "blocked") {
      riskReason = "이슈 상태가 차단됨(Blocked)으로 지정됨";
    } else if (isDeadlineTight) {
      riskReason =
        daysUntilDue < 0
          ? `마감일 ${Math.abs(daysUntilDue)}일 초과 지연`
          : `마감 임박 (D-${daysUntilDue})`;
    }

    diagnosesByKey[issue.issueKey] = {
      issueKey: issue.issueKey,
      hasUnresolvedBlocker,
      activeBlockerKeys,
      isDeadlineAtRisk,
      daysUntilDue,
      riskReason,
    };

    if (hasUnresolvedBlocker) {
      unresolvedBlockerIssueKeys.push(issue.issueKey);
    }
    if (isDeadlineAtRisk) {
      criticalPathAtRiskKeys.push(issue.issueKey);
    }
  }

  return {
    diagnosesByKey,
    unresolvedBlockerIssueKeys,
    criticalPathAtRiskKeys,
  };
}

/**
 * 작가별 가용 스토리 포인트(컷 난이도 가중 용량) 및 WIP(동시 진행 일감 수) 상한 대비
 * 현재 부하율과 과부하(Overload) 여부를 계산한다.
 */
export function evaluateAssigneeWorkloadBalance(
  issues: readonly JiraProductionIssue[],
  capacities: readonly JiraAssigneeCapacityProfile[],
): readonly AssigneeWorkloadSummary[] {
  return capacities.map((cap) => {
    const assigneeIssues = issues.filter((issue) => issue.assigneeId === cap.assigneeId);
    const assignedActivePoints = assigneeIssues
      .filter((issue) => issue.status !== "done")
      .reduce((sum, issue) => sum + issue.effortPoints, 0);
    const completedPoints = assigneeIssues
      .filter((issue) => issue.status === "done")
      .reduce((sum, issue) => sum + issue.effortPoints, 0);
    const inProgressIssueCount = assigneeIssues.filter(
      (issue) => issue.status === "in_progress",
    ).length;

    const safeCap = Math.max(1, cap.sprintCapacityPoints);
    const utilizationPercent = Math.round((assignedActivePoints / safeCap) * 100);
    const overloadPoints = Math.max(0, assignedActivePoints - cap.sprintCapacityPoints);

    return {
      assigneeId: cap.assigneeId,
      assigneeName: cap.assigneeName,
      roleLabel: cap.roleLabel,
      sprintCapacityPoints: cap.sprintCapacityPoints,
      assignedActivePoints,
      completedPoints,
      utilizationPercent,
      overloadPoints,
      isOverCapacity: overloadPoints > 0,
      inProgressIssueCount,
      wipLimitCount: cap.wipLimitCount,
      isWipExceeded: inProgressIssueCount > cap.wipLimitCount,
    };
  });
}

/**
 * 과부하된 일감을 재배정할 때 가용 용량 여유가 가장 큰(또는 부하율이 가장 낮은) 담당자를 추천한다.
 */
export function recommendWorkloadReassignment(
  issues: readonly JiraProductionIssue[],
  capacities: readonly JiraAssigneeCapacityProfile[],
  targetIssueKey: string,
): {
  readonly recommendedAssigneeId: string;
  readonly recommendedAssigneeName: string;
  readonly projectedUtilizationPercent: number;
} | null {
  const targetIssue = issues.find((item) => item.issueKey === targetIssueKey);
  if (!targetIssue) return null;

  const summaries = evaluateAssigneeWorkloadBalance(issues, capacities);
  const candidates = summaries.filter((item) => item.assigneeId !== targetIssue.assigneeId);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aProjected = (a.assignedActivePoints + targetIssue.effortPoints) / Math.max(1, a.sprintCapacityPoints);
    const bProjected = (b.assignedActivePoints + targetIssue.effortPoints) / Math.max(1, b.sprintCapacityPoints);
    return aProjected - bProjected;
  });

  const best = sorted[0]!;
  const projectedUtilizationPercent = Math.round(
    ((best.assignedActivePoints + targetIssue.effortPoints) / Math.max(1, best.sprintCapacityPoints)) * 100,
  );

  return {
    recommendedAssigneeId: best.assigneeId,
    recommendedAssigneeName: best.assigneeName,
    projectedUtilizationPercent,
  };
}

/**
 * JQL 스타일 다중 조건(검색어, 공정 스텝, 상태, 블로커/마감 리스크 전용 필터)으로 이슈 목록을 필터링한다.
 */
export function filterJiraIssuesSmart(
  issues: readonly JiraProductionIssue[],
  filter: {
    readonly query?: string;
    readonly processStep?: JiraProcessStep | "all";
    readonly status?: JiraStatusCategory | "all";
    readonly onlyBlockedOrAtRisk?: boolean;
    readonly referenceDateIso?: string;
  },
): readonly JiraProductionIssue[] {
  const normalizedQuery = (filter.query ?? "").trim().toLocaleLowerCase("ko-KR");
  const report = filter.onlyBlockedOrAtRisk
    ? analyzeBlockerAndCriticalPath(issues, filter.referenceDateIso ?? "2026-10-26")
    : null;

  return issues.filter((issue) => {
    if (filter.processStep && filter.processStep !== "all" && issue.processStep !== filter.processStep) {
      return false;
    }
    if (filter.status && filter.status !== "all" && issue.status !== filter.status) {
      return false;
    }
    if (filter.onlyBlockedOrAtRisk && report) {
      const diag = report.diagnosesByKey[issue.issueKey];
      if (!diag?.isDeadlineAtRisk) return false;
    }
    if (normalizedQuery) {
      const hay = `${issue.issueKey} ${issue.summary} ${issue.assigneeName} ${issue.episodeCode}`.toLocaleLowerCase("ko-KR");
      if (!hay.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

/**
 * 특정 이슈의 상태가 변경될 때 활성화된 Jira Automation 규칙(`WHEN-IF-THEN`)을 평가·실행한다.
 * - `unblock_and_start_dependents`: 선행 이슈가 `done`이 되면 이를 기다리던 후행 이슈의 블로커가 모두 해소되었을 때 상태를 `in_progress`로 자동 전환
 * - `escalate_priority_to_highest`: 해당 이슈 우선순위를 `highest`로 즉시 격상
 * - `auto_assign_next_stage_lead`: 후행 의존 이슈들의 담당자를 지정된 차기 공정 리드로 자동 배정
 */
export function transitionIssueWithAutomation(
  issues: readonly JiraProductionIssue[],
  rules: readonly JiraAutomationRule[],
  targetIssueKey: string,
  nextStatus: JiraStatusCategory,
): JiraAutomationExecutionResult {
  const targetIssue = issues.find((item) => item.issueKey === targetIssueKey);
  if (!targetIssue) {
    return { updatedIssues: issues, triggeredRuleNames: [], auditLogs: [] };
  }

  let workingIssues = issues.map((item) =>
    item.issueKey === targetIssueKey ? { ...item, status: nextStatus } : item,
  );

  const matchingRules = rules.filter(
    (rule) =>
      rule.enabled &&
      rule.triggerWhenStatusBecomes === nextStatus &&
      rule.ifProcessStepEquals === targetIssue.processStep,
  );

  const triggeredRuleNames: string[] = [];
  const auditLogs: string[] = [];

  for (const rule of matchingRules) {
    triggeredRuleNames.push(rule.name);

    if (rule.thenAction === "unblock_and_start_dependents") {
      const statusByKey = new Map(workingIssues.map((i) => [i.issueKey, i.status]));
      workingIssues = workingIssues.map((candidate) => {
        if (!candidate.blockedByIssueKeys.includes(targetIssueKey)) {
          return candidate;
        }
        const allBlockersDone = candidate.blockedByIssueKeys.every(
          (bKey) => statusByKey.get(bKey) === "done",
        );
        if (allBlockersDone && (candidate.status === "blocked" || candidate.status === "todo")) {
          auditLogs.push(
            `[자동화: ${rule.name}] 선행 ${targetIssueKey} 완료로 후속 ${candidate.issueKey} 상태를 '진행 중(In Progress)'으로 자동 전환했습니다.`,
          );
          return { ...candidate, status: "in_progress" };
        }
        return candidate;
      });
    } else if (rule.thenAction === "escalate_priority_to_highest") {
      workingIssues = workingIssues.map((candidate) => {
        if (candidate.issueKey === targetIssueKey && candidate.priority !== "highest") {
          auditLogs.push(
            `[자동화: ${rule.name}] ${targetIssueKey} 우선순위를 '긴급(Highest)'으로 자동 격상했습니다.`,
          );
          return { ...candidate, priority: "highest" };
        }
        return candidate;
      });
    } else if (
      rule.thenAction === "auto_assign_next_stage_lead" &&
      rule.targetAssigneeId &&
      rule.targetAssigneeName
    ) {
      const nextAssigneeId = rule.targetAssigneeId;
      const nextAssigneeName = rule.targetAssigneeName;
      workingIssues = workingIssues.map((candidate) => {
        if (candidate.blockedByIssueKeys.includes(targetIssueKey)) {
          auditLogs.push(
            `[자동화: ${rule.name}] 후속 ${candidate.issueKey} 담당자를 '${nextAssigneeName}'(으)로 자동 배정했습니다.`,
          );
          return {
            ...candidate,
            assigneeId: nextAssigneeId,
            assigneeName: nextAssigneeName,
          };
        }
        return candidate;
      });
    }
  }

  return {
    updatedIssues: workingIssues,
    triggeredRuleNames,
    auditLogs,
  };
}
