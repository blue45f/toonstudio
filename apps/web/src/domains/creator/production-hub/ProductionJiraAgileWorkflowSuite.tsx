import { useMemo, useState } from "react";
import {
  analyzeBlockerAndCriticalPath,
  computeCutEffortPoints,
  evaluateAssigneeWorkloadBalance,
  filterJiraIssuesSmart,
  getJiraProcessLabelKo,
  getJiraStatusLabelKo,
  recommendWorkloadReassignment,
  transitionIssueWithAutomation,
  type CutDifficultyTier,
  type JiraAssigneeCapacityProfile,
  type JiraAutomationRule,
  type JiraProcessStep,
  type JiraProductionIssue,
  type JiraStatusCategory,
} from "./production-jira-agile-workflow-model";

const INITIAL_CAPACITIES: readonly JiraAssigneeCapacityProfile[] = [
  {
    assigneeId: "artist-line-1",
    assigneeName: "선화팀 김도현",
    roleLabel: "메인 선화 작가",
    primaryProcess: "lineart",
    sprintCapacityPoints: 24,
    wipLimitCount: 2,
  },
  {
    assigneeId: "artist-line-2",
    assigneeName: "선화팀 윤서아",
    roleLabel: "어시스턴트 선화 작가",
    primaryProcess: "lineart",
    sprintCapacityPoints: 24,
    wipLimitCount: 2,
  },
  {
    assigneeId: "artist-color-1",
    assigneeName: "채색팀 이지안",
    roleLabel: "메인 채색·조명 작가",
    primaryProcess: "coloring",
    sprintCapacityPoints: 28,
    wipLimitCount: 3,
  },
  {
    assigneeId: "artist-bg-1",
    assigneeName: "배경3D팀 박도윤",
    roleLabel: "3D 배경 모델러",
    primaryProcess: "bg3d",
    sprintCapacityPoints: 20,
    wipLimitCount: 2,
  },
];

const INITIAL_ISSUES: readonly JiraProductionIssue[] = [
  {
    issueId: "issue-401",
    issueKey: "TOON-401",
    kind: "epic",
    parentIssueKey: null,
    episodeCode: "EP04",
    processStep: "bg3d",
    summary: "[EP04 에픽] 북부 대공 성채 대연회장 3D 라이팅 & 렌더 패스 구축",
    assigneeId: "artist-bg-1",
    assigneeName: "배경3D팀 박도윤",
    status: "in_progress",
    priority: "highest",
    cutCount: 4,
    difficultyTier: "high_action_4pt",
    effortPoints: computeCutEffortPoints(4, "high_action_4pt"),
    dueDateIso: "2026-10-26",
    blockedByIssueKeys: [],
  },
  {
    issueId: "issue-402",
    issueKey: "TOON-402",
    kind: "task",
    parentIssueKey: "TOON-401",
    episodeCode: "EP04",
    processStep: "lineart",
    summary: "EP04 11~16컷 성채 잠입 및 봉인석 각성 메인 액션 선화",
    assigneeId: "artist-line-1",
    assigneeName: "선화팀 김도현",
    status: "in_progress",
    priority: "highest",
    cutCount: 5,
    difficultyTier: "high_action_4pt",
    effortPoints: computeCutEffortPoints(5, "high_action_4pt"),
    dueDateIso: "2026-10-27",
    blockedByIssueKeys: ["TOON-401"],
  },
  {
    issueId: "issue-403",
    issueKey: "TOON-403",
    kind: "subtask",
    parentIssueKey: "TOON-402",
    episodeCode: "EP04",
    processStep: "lineart",
    summary: "EP04 17~22컷 기사단 검술 대련 클로즈업 펜터치",
    assigneeId: "artist-line-1",
    assigneeName: "선화팀 김도현",
    status: "todo",
    priority: "high",
    cutCount: 5,
    difficultyTier: "directed_2pt",
    effortPoints: computeCutEffortPoints(5, "directed_2pt"),
    dueDateIso: "2026-10-27",
    blockedByIssueKeys: [],
  },
  {
    issueId: "issue-404",
    issueKey: "TOON-404",
    kind: "task",
    parentIssueKey: "TOON-402",
    episodeCode: "EP04",
    processStep: "coloring",
    summary: "EP04 11~16컷 봉인석 발광 마력 이펙트 및 명암 채색",
    assigneeId: "artist-color-1",
    assigneeName: "채색팀 이지안",
    status: "blocked",
    priority: "high",
    cutCount: 5,
    difficultyTier: "directed_2pt",
    effortPoints: computeCutEffortPoints(5, "directed_2pt"),
    dueDateIso: "2026-10-28",
    blockedByIssueKeys: ["TOON-402"],
  },
];

const INITIAL_AUTOMATION_RULES: readonly JiraAutomationRule[] = [
  {
    ruleId: "rule-unblock-dependents",
    name: "선행 3D배경/선화 완료 시 후속 차단 일감 자동 착수(In Progress)",
    enabled: true,
    triggerWhenStatusBecomes: "done",
    ifProcessStepEquals: "bg3d",
    thenAction: "unblock_and_start_dependents",
  },
  {
    ruleId: "rule-lineart-done-unblock-color",
    name: "선화(Line Art) 완료 시 후속 채색 일감 블로커 자동 해제 및 진행 전환",
    enabled: true,
    triggerWhenStatusBecomes: "done",
    ifProcessStepEquals: "lineart",
    thenAction: "unblock_and_start_dependents",
  },
  {
    ruleId: "rule-blocked-escalate",
    name: "선화 일감 차단(Blocked) 발생 시 우선순위 긴급(Highest) 자동 격상",
    enabled: true,
    triggerWhenStatusBecomes: "blocked",
    ifProcessStepEquals: "lineart",
    thenAction: "escalate_priority_to_highest",
  },
];

export function ProductionJiraAgileWorkflowSuite() {
  const [issues, setIssues] = useState<readonly JiraProductionIssue[]>(INITIAL_ISSUES);
  const [rules, setRules] = useState<readonly JiraAutomationRule[]>(INITIAL_AUTOMATION_RULES);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [processFilter, setProcessFilter] = useState<JiraProcessStep | "all">("all");
  const [statusFilter, setStatusFilter] = useState<JiraStatusCategory | "all">("all");
  const [onlyBlockedOrAtRisk, setOnlyBlockedOrAtRisk] = useState<boolean>(false);
  const [automationLogs, setAutomationLogs] = useState<readonly string[]>([
    "[시스템 준비] Jira 애자일 스프린트 블로커 그래프 및 자동화 규칙 엔진이 활성화되었습니다.",
  ]);

  // 빠른 일감 추가 폼 상태
  const [newSummary, setNewSummary] = useState<string>("EP04 23~26컷 엔딩 클리프행어 식자 및 효과음 배치");
  const [newDifficulty, setNewDifficulty] = useState<CutDifficultyTier>("directed_2pt");
  const defaultNewProcess: JiraProcessStep = "typesetting";
  const defaultNewCutCount = 4;

  const blockerReport = useMemo(
    () => analyzeBlockerAndCriticalPath(issues, "2026-10-26"),
    [issues],
  );

  const workloadSummaries = useMemo(
    () => evaluateAssigneeWorkloadBalance(issues, INITIAL_CAPACITIES),
    [issues],
  );

  const filteredIssues = useMemo(
    () =>
      filterJiraIssuesSmart(issues, {
        query: searchQuery,
        processStep: processFilter,
        status: statusFilter,
        onlyBlockedOrAtRisk,
        referenceDateIso: "2026-10-26",
      }),
    [issues, searchQuery, processFilter, statusFilter, onlyBlockedOrAtRisk],
  );

  const handleStatusTransition = (issueKey: string, nextStatus: JiraStatusCategory) => {
    const result = transitionIssueWithAutomation(issues, rules, issueKey, nextStatus);
    setIssues(result.updatedIssues);
    if (result.auditLogs.length > 0) {
      setAutomationLogs((prev) => [...result.auditLogs, ...prev].slice(0, 8));
    } else {
      setAutomationLogs((prev) =>
        [
          `[상태 변경] ${issueKey} 상태가 '${getJiraStatusLabelKo(nextStatus)}'(으)로 업데이트되었습니다.`,
          ...prev,
        ].slice(0, 8),
      );
    }
  };

  const handleRebalanceOverloadedIssue = (issueKey: string) => {
    const recommendation = recommendWorkloadReassignment(issues, INITIAL_CAPACITIES, issueKey);
    if (!recommendation) return;

    setIssues((prev) =>
      prev.map((item) =>
        item.issueKey === issueKey
          ? {
              ...item,
              assigneeId: recommendation.recommendedAssigneeId,
              assigneeName: recommendation.recommendedAssigneeName,
            }
          : item,
      ),
    );
    setAutomationLogs((prev) =>
      [
        `[용량 밸런서] 과부하 해소를 위해 ${issueKey} 일감을 '${recommendation.recommendedAssigneeName}'(예상 가동률 ${recommendation.projectedUtilizationPercent}%)에게 재배정했습니다.`,
        ...prev,
      ].slice(0, 8),
    );
  };

  const handleCreateQuickIssue = () => {
    const trimmed = newSummary.trim();
    if (!trimmed) return;
    const nextNum = 401 + issues.length;
    const nextKey = `TOON-${nextNum}`;
    const points = computeCutEffortPoints(defaultNewCutCount, newDifficulty);
    const created: JiraProductionIssue = {
      issueId: `issue-${nextNum}`,
      issueKey: nextKey,
      kind: "task",
      parentIssueKey: "TOON-401",
      episodeCode: "EP04",
      processStep: defaultNewProcess,
      summary: trimmed,
      assigneeId: "artist-line-2",
      assigneeName: "선화팀 윤서아",
      status: "todo",
      priority: "medium",
      cutCount: defaultNewCutCount,
      difficultyTier: newDifficulty,
      effortPoints: points,
      dueDateIso: "2026-10-29",
      blockedByIssueKeys: [],
    };
    setIssues((prev) => [...prev, created]);
    setAutomationLogs((prev) =>
      [
        `[일감 생성] ${nextKey} (${defaultNewCutCount}컷 · ${points}pt) 일감이 스프린트 백로그에 추가되었습니다.`,
        ...prev,
      ].slice(0, 8),
    );
  };

  const handleToggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.ruleId === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
      ),
    );
  };

  return (
    <section
      aria-label="지라 애자일 일감 배정 및 마감 트래킹 스위트"
      data-testid="jira-agile-workflow-suite"
      className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-cool/15 px-2 py-0.5 text-[11px] font-bold text-cool">
              Atlassian Jira 내재화
            </span>
            <span className="text-xs text-fg-3">
              컷 가중치 스프린트 용량 밸런서 · 선후행 블로커 그래프 · WHEN-IF-THEN 자동화
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-fg">
            웹툰 애자일 일감 배정 · 마감 블로커 추적 & 워크플로 자동화 엔진
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            data-testid="jira-blocker-count-badge"
            className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-1.5 font-bold text-bad"
          >
            미해결 선행 블로커: {blockerReport.unresolvedBlockerIssueKeys.length}건
          </span>
          <span
            data-testid="jira-critical-risk-badge"
            className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-1.5 font-bold text-warn"
          >
            마감 리스크(D-1/차단): {blockerReport.criticalPathAtRiskKeys.length}건
          </span>
        </div>
      </header>

      {/* 1. 작가별 컷 가중치 용량(Sprint Capacity) & WIP 병목 모니터 */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
          작가별 스프린트 컷 가중치 용량(Cut Effort Point Capacity) & WIP 밸런서
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workloadSummaries.map((summary) => (
            <div
              key={summary.assigneeId}
              data-testid={`jira-capacity-card-${summary.assigneeId}`}
              className={`rounded-xl border p-3.5 text-xs ${
                summary.isOverCapacity
                  ? "border-bad/50 bg-bad/10"
                  : "border-line bg-panel"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-fg">{summary.assigneeName}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    summary.isOverCapacity
                      ? "bg-bad text-canvas"
                      : "bg-good/15 text-good"
                  }`}
                >
                  {summary.utilizationPercent}% 가동
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-fg-3">{summary.roleLabel}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-fg-2">
                <span>
                  할당: <strong>{summary.assignedActivePoints}pt</strong> / 상한 {summary.sprintCapacityPoints}pt
                </span>
                <span>
                  WIP: {summary.inProgressIssueCount}/{summary.wipLimitCount}
                </span>
              </div>
              {summary.isOverCapacity ? (
                <p className="mt-1.5 text-[11px] font-semibold text-bad">
                  용량 초과 +{summary.overloadPoints}pt · 하위 일감 분산 권고
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* 2. JQL 스타일 스마트 필터 바 + 빠른 일감 등록 */}
      <div className="grid gap-3 lg:grid-cols-12 rounded-xl border border-line bg-panel p-3.5">
        <div className="lg:col-span-7 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="search"
            aria-label="지라 이슈 검색어"
            data-testid="jira-smart-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이슈 키(TOON-402), 컷 설명, 담당자 검색..."
            className="min-w-44 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg"
          />
          <select
            aria-label="공정 스텝 필터"
            data-testid="jira-process-filter-select"
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value as JiraProcessStep | "all")}
            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg"
          >
            <option value="all">전체 공정</option>
            <option value="storyboard">콘티</option>
            <option value="bg3d">3D 배경</option>
            <option value="lineart">선화</option>
            <option value="coloring">채색·명암</option>
            <option value="typesetting">식자·후보정</option>
          </select>
          <select
            aria-label="이슈 상태 필터"
            data-testid="jira-status-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as JiraStatusCategory | "all")}
            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg"
          >
            <option value="all">전체 상태</option>
            <option value="todo">할 일(To Do)</option>
            <option value="in_progress">진행 중(In Progress)</option>
            <option value="in_review">검수 중(In Review)</option>
            <option value="blocked">차단됨(Blocked)</option>
            <option value="done">완료(Done)</option>
          </select>
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 font-medium text-fg-2">
            <input
              type="checkbox"
              data-testid="jira-only-risk-checkbox"
              checked={onlyBlockedOrAtRisk}
              onChange={(e) => setOnlyBlockedOrAtRisk(e.target.checked)}
            />
            <span>블로커·마감 위험만</span>
          </label>
        </div>

        <div className="lg:col-span-5 flex flex-wrap items-center gap-1.5 text-xs">
          <input
            type="text"
            aria-label="신규 일감 요약"
            data-testid="jira-new-issue-summary-input"
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
            className="min-w-36 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg"
          />
          <select
            aria-label="신규 일감 난이도"
            data-testid="jira-new-issue-difficulty-select"
            value={newDifficulty}
            onChange={(e) => setNewDifficulty(e.target.value as CutDifficultyTier)}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs text-fg"
          >
            <option value="dialogue_1pt">일상(1pt/컷)</option>
            <option value="directed_2pt">연출(2pt/컷)</option>
            <option value="high_action_4pt">액션/3D(4pt/컷)</option>
          </select>
          <button
            type="button"
            data-testid="jira-add-issue-btn"
            onClick={handleCreateQuickIssue}
            className="rounded-lg bg-accent px-3 py-1.5 font-bold text-on-accent hover:opacity-90"
          >
            +일감 배정 ({computeCutEffortPoints(defaultNewCutCount, newDifficulty)}pt)
          </button>
        </div>
      </div>

      {/* 3. 이슈 계층(Epic/Task/Sub-task) & 선후행 블로커 리스트 */}
      <div className="space-y-2.5">
        {filteredIssues.map((issue) => {
          const diag = blockerReport.diagnosesByKey[issue.issueKey];
          const assigneeSummary = workloadSummaries.find(
            (w) => w.assigneeId === issue.assigneeId,
          );
          const recommendation = assigneeSummary?.isOverCapacity
            ? recommendWorkloadReassignment(issues, INITIAL_CAPACITIES, issue.issueKey)
            : null;

          return (
            <div
              key={issue.issueKey}
              data-testid={`jira-issue-row-${issue.issueKey}`}
              className={`rounded-xl border p-3.5 text-xs transition ${
                diag?.hasUnresolvedBlocker
                  ? "border-bad/40 bg-bad/5"
                  : "border-line bg-card"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-cool">
                    {issue.issueKey}
                  </span>
                  <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fg-2">
                    {issue.kind}
                  </span>
                  <span className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                    {getJiraProcessLabelKo(issue.processStep)}
                  </span>
                  <span className="font-semibold text-fg">{issue.summary}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[11px] font-bold text-fg">
                    {issue.cutCount}컷 · {issue.effortPoints}pt
                  </span>
                  <select
                    aria-label={`${issue.issueKey} 상태 변경`}
                    data-testid={`jira-status-select-${issue.issueKey}`}
                    value={issue.status}
                    onChange={(e) =>
                      handleStatusTransition(issue.issueKey, e.target.value as JiraStatusCategory)
                    }
                    className="rounded-lg border border-line bg-raised px-2.5 py-1 text-xs font-bold text-fg"
                  >
                    <option value="todo">할 일(To Do)</option>
                    <option value="in_progress">진행 중(In Progress)</option>
                    <option value="in_review">검수 중(In Review)</option>
                    <option value="blocked">차단됨(Blocked)</option>
                    <option value="done">완료(Done)</option>
                  </select>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    담당자: <strong className="text-fg">{issue.assigneeName}</strong>
                  </span>
                  <span>마감: {issue.dueDateIso}</span>
                  <span>우선순위: {issue.priority.toUpperCase()}</span>
                  {issue.blockedByIssueKeys.length > 0 ? (
                    <span className="font-mono text-fg-3">
                      선행 의존(is-blocked-by): {issue.blockedByIssueKeys.join(", ")}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {diag?.riskReason ? (
                    <span
                      data-testid={`jira-risk-reason-${issue.issueKey}`}
                      className="rounded bg-warn/15 px-2 py-0.5 font-semibold text-warn"
                    >
                      {diag.riskReason}
                    </span>
                  ) : null}
                  {recommendation ? (
                    <button
                      type="button"
                      data-testid={`jira-rebalance-btn-${issue.issueKey}`}
                      onClick={() => handleRebalanceOverloadedIssue(issue.issueKey)}
                      className="rounded-md bg-bad px-2.5 py-1 font-bold text-canvas hover:opacity-90"
                    >
                      과부하 분산 → {recommendation.recommendedAssigneeName}에게 재배정
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Jira Automation WHEN-IF-THEN 규칙 제어 및 실행 감사 로그 */}
      <div className="grid gap-4 lg:grid-cols-12 rounded-xl border border-line bg-panel p-4">
        <div className="lg:col-span-6 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
            워크플로 자동화 규칙 (WHEN 상태 변경 → IF 공정 조건 → THEN 자동 실행)
          </h4>
          <div className="space-y-1.5">
            {rules.map((rule) => (
              <label
                key={rule.ruleId}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs"
              >
                <span className="font-medium text-fg">{rule.name}</span>
                <input
                  type="checkbox"
                  data-testid={`jira-rule-toggle-${rule.ruleId}`}
                  checked={rule.enabled}
                  onChange={() => handleToggleRule(rule.ruleId)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
            자동화 트리거 & 배정 감사 로그 (Audit Trail)
          </h4>
          <ul
            data-testid="jira-automation-audit-log"
            className="space-y-1 rounded-lg border border-line bg-card p-3 font-mono text-[11px] text-fg-2"
          >
            {automationLogs.map((log, index) => (
              <li key={`${index}-${log}`} className="truncate">
                {log}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
