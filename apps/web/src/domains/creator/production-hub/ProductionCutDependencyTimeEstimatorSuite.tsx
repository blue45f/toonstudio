/**
 * ClickUp (`/features/time-estimates`, `/features/gantt-chart-view`) + Miro (`/features/whiteboards`)
 * 역공학 내재화: 회차·장면·컷 의존성 DAG 임계 경로(Critical Path) & 소요 시간 추정기.
 */

import { useMemo, useState } from "react";
import { Clock, GitBranch, Sparkles, Timer, Zap } from "lucide-react";

import {
  evaluateEpisodeCutDependencyCriticalPath,
} from "./production-cut-dependency-time-estimator-model";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionCutDependencyTimeEstimatorSuite({
  defaultTargetCuts = 68,
}: {
  readonly defaultTargetCuts?: number;
}) {
  const bt = useBilingual("ProductionCutDependencyTimeEstimatorSuite");
  const [targetCutCount, setTargetCutCount] = useState<number>(defaultTargetCuts);
  const [actionCutRatioPercent, setActionCutRatioPercent] = useState<number>(35);
  const [bg3dCutRatioPercent, setBg3dCutRatioPercent] = useState<number>(40);
  const [parallelInkingAssistants, setParallelInkingAssistants] = useState<1 | 2 | 3>(2);
  const [weeklyDeadlineBudgetHours, setWeeklyDeadlineBudgetHours] = useState<number>(96);

  const report = useMemo(
    () =>
      evaluateEpisodeCutDependencyCriticalPath({
        targetCutCount,
        actionCutRatioPercent,
        bg3dCutRatioPercent,
        parallelInkingAssistants,
        weeklyDeadlineBudgetHours,
      }),
    [
      targetCutCount,
      actionCutRatioPercent,
      bg3dCutRatioPercent,
      parallelInkingAssistants,
      weeklyDeadlineBudgetHours,
    ]
  );

  const toneForRisk =
    report.deadlineRiskLevel === "safe"
      ? "success"
      : report.deadlineRiskLevel === "tight"
        ? "warning"
        : "danger";

  return (
    <ProductionSectionCard
      title={bt(
        "회차 컷 의존성 DAG · 임계 경로(Critical Path) 소요 시간 시뮬레이터",
        "Episode Cut Dependency DAG & Critical Path Time Estimator"
      )}
      description={bt(
        "ClickUp Time Estimates·Gantt & Miro Dependency Board 역공학 내재화 — 콘티 확정 직후 '3D 배경'과 '인물 선화'를 병렬 분업했을 때 단축되는 임계 경로 시간과 마감 버퍼를 정밀 산출합니다.",
        "Internalized from ClickUp Time Estimates/Gantt & Miro Dependency Boards — calculates parallel critical-path hours and deadline slack across the 6 webtoon stages."
      )}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ProductionPill tone="accent">
            <Sparkles className="mr-1 inline size-3" aria-hidden="true" />
            {bt("ClickUp · Miro 역공학", "ClickUp · Miro Internalized")}
          </ProductionPill>
          <ProductionPill tone={toneForRisk}>
            {report.slackHours >= 0
              ? bt(`마감 여유 +${report.slackHours}h`, `Slack +${report.slackHours}h`)
              : bt(`마감 초과 ${report.slackHours}h`, `Overrun ${report.slackHours}h`)}
          </ProductionPill>
        </div>
      }
    >
      <div
        data-testid="production-cut-dependency-time-estimator-suite"
        className="space-y-4"
      >
        {/* 핵심 지표 요약 카드 */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
              {bt("직렬 진행 시 총 공수", "Sequential Total Effort")}
            </p>
            <p
              data-testid="dag-sequential-hours"
              className="mt-1 text-2xl font-black text-fg"
            >
              {report.sequentialTotalHours}h
            </p>
            <p className="text-[0.6875rem] text-fg-3">
              {bt("1인 단독 순차 작업 기준", "Single-thread sequential baseline")}
            </p>
          </div>

          <div className="rounded-xl border border-accent/40 bg-accent-soft p-3">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-accent">
              {bt("병렬 분업 임계 경로 (Critical Path)", "Parallel Critical Path")}
            </p>
            <p
              data-testid="dag-critical-path-hours"
              className="mt-1 text-2xl font-black text-fg"
            >
              {report.criticalPathHours}h
            </p>
            <p className="text-[0.6875rem] text-fg-2">
              {bt(
                `3D 배경 · 선화 동시 진행으로 ${report.parallelSavedHours}h 단축`,
                `Saves ${report.parallelSavedHours}h via 3D BG + Inking concurrency`
              )}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
              {bt("주간 연재 가용 시간 예산", "Weekly Deadline Budget")}
            </p>
            <p className="mt-1 text-2xl font-black text-fg">
              {weeklyDeadlineBudgetHours}h
            </p>
            <p className="text-[0.6875rem] text-fg-3">
              {bt(
                `여유 시간: ${report.slackHours >= 0 ? `+${report.slackHours}h` : `${report.slackHours}h`}`,
                `Net buffer: ${report.slackHours >= 0 ? `+${report.slackHours}h` : `${report.slackHours}h`}`
              )}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
              {bt("최대 병목 공정 (Bottleneck)", "Primary Bottleneck Stage")}
            </p>
            <p
              data-testid="dag-bottleneck-node"
              className="mt-1 truncate text-sm font-extrabold text-fg"
            >
              {report.bottleneckNodeId}
            </p>
            <p className="mt-1 text-[0.6875rem] text-fg-3">
              {bt("우선 분업 지원 대상", "Priority assistant allocation target")}
            </p>
          </div>
        </div>

        {/* 시뮬레이션 파라미터 조절 */}
        <div className="grid gap-3 rounded-xl border border-line bg-panel p-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs font-semibold text-fg-2">
            {bt("목표 회차 컷 수", "Target Cut Count")}
            <input
              type="number"
              min={20}
              max={160}
              data-testid="dag-cut-count-input"
              value={targetCutCount}
              onChange={(event) => setTargetCutCount(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold text-fg"
            />
          </label>

          <label className="block text-xs font-semibold text-fg-2">
            {bt("고밀도 액션·군중 컷 비중 (%)", "High-Density Action Cuts (%)")}
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              data-testid="dag-action-ratio-input"
              value={actionCutRatioPercent}
              onChange={(event) => setActionCutRatioPercent(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold text-fg"
            />
          </label>

          <label className="block text-xs font-semibold text-fg-2">
            {bt("3D 배경 전환 컷 비중 (%)", "3D Background Cut Ratio (%)")}
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              data-testid="dag-bg-ratio-input"
              value={bg3dCutRatioPercent}
              onChange={(event) => setBg3dCutRatioPercent(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold text-fg"
            />
          </label>

          <label className="block text-xs font-semibold text-fg-2">
            {bt("선화 동시 투입 인원", "Parallel Inking Crew")}
            <select
              data-testid="dag-ink-crew-select"
              value={parallelInkingAssistants}
              onChange={(event) =>
                setParallelInkingAssistants(Number(event.target.value) as 1 | 2 | 3)
              }
              className="mt-1 w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold text-fg"
            >
              <option value={1}>{bt("1명 (단독 선화)", "1 Artist (Solo)")}</option>
              <option value={2}>{bt("2명 (메인+선화어시 1)", "2 Artists (Lead + 1 Assist)")}</option>
              <option value={3}>{bt("3명 (메인+선화어시 2)", "3 Artists (Lead + 2 Assists)")}</option>
            </select>
          </label>

          <label className="block text-xs font-semibold text-fg-2">
            {bt("주간 마감 목표 시간 (h)", "Deadline Budget (h)")}
            <input
              type="number"
              min={36}
              max={168}
              step={4}
              data-testid="dag-budget-hours-input"
              value={weeklyDeadlineBudgetHours}
              onChange={(event) => setWeeklyDeadlineBudgetHours(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-bold text-fg"
            />
          </label>
        </div>

        {/* 6공정 DAG 간트 & 임계 경로 타임라인 테이블 */}
        <div className="overflow-x-auto rounded-xl border border-line bg-panel p-3">
          <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[0.6875rem] text-fg-3">
                <th className="py-2 pr-3">{bt("웹툰 공정 노드", "DAG Stage Node")}</th>
                <th className="px-2 py-2">{bt("담당 역할", "Owner Role")}</th>
                <th className="px-2 py-2">{bt("선행 의존 공정", "Predecessors")}</th>
                <th className="px-2 py-2 text-right">{bt("소요 시간", "Est. Hours")}</th>
                <th className="px-2 py-2 text-right">{bt("타임라인 구간", "Start → Finish")}</th>
                <th className="pl-2 py-2 text-right">{bt("임계 경로 여부", "Critical Path")}</th>
              </tr>
            </thead>
            <tbody>
              {report.nodes.map((node) => (
                <tr
                  key={node.id}
                  data-testid={`dag-node-row-${node.id}`}
                  className="border-b border-line/60 last:border-b-0"
                >
                  <td className="py-2.5 pr-3 font-bold text-fg">
                    {bt(node.labelKo, node.labelEn)}
                  </td>
                  <td className="px-2 py-2.5 text-fg-2">
                    {bt(node.ownerRoleKo, node.ownerRoleEn)}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[0.6875rem] text-fg-3">
                    {node.dependsOn.length > 0 ? node.dependsOn.join(" + ") : bt("시작점", "Root")}
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold text-fg">
                    <Clock className="mr-1 inline size-3 text-fg-3" aria-hidden="true" />
                    {node.estimatedHours}h
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-[0.6875rem] text-fg-2">
                    T+{node.earliestStartHour}h → T+{node.earliestFinishHour}h
                  </td>
                  <td className="pl-2 py-2.5 text-right">
                    <ProductionPill tone={node.isOnCriticalPath ? "danger" : "neutral"}>
                      {node.isOnCriticalPath
                        ? bt("임계 경로 (Critical)", "Critical Path")
                        : bt("병렬 여유 (Float)", "Parallel Float")}
                    </ProductionPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 실시간 권고 배너 */}
        <div
          aria-live="polite"
          data-testid="dag-recommendation-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3.5 py-2.5 text-xs text-fg-2"
        >
          <span className="flex items-center gap-2 font-semibold text-fg">
            <GitBranch className="size-4 shrink-0 text-accent" aria-hidden="true" />
            {bt(report.recommendationKo, report.recommendationEn)}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem] text-accent">
            <Zap className="size-3.5" aria-hidden="true" />
            <Timer className="size-3.5" aria-hidden="true" />
            {bt(
              `병렬 단축 -${report.parallelSavedHours}h`,
              `Parallel Saved -${report.parallelSavedHours}h`
            )}
          </span>
        </div>
      </div>
    </ProductionSectionCard>
  );
}
