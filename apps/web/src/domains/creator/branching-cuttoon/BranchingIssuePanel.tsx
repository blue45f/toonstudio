"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import type {
  BranchingCuttoonGraph,
  BranchingIssue,
  BranchingValidationReport,
} from "./model";
import { AlertTriangle, ArrowRight, CheckCircle2, OctagonX } from "lucide-react";
import { useId, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import { issueMessage } from "./branching-cuttoon-copy";
import { BC_FOCUS_RING, BC_HEADING, BC_HINT, BC_SURFACE } from "./branching-cuttoon-styles";
import { useBranchingT, type BranchingT } from "./use-branching-t";

interface BranchingIssuePanelProps {
  readonly graph: BranchingCuttoonGraph;
  readonly report: BranchingValidationReport;
  /** 항목을 눌렀다. 해당 장면(과 선택지·컷)으로 이동하는 일은 부모가 맡는다. */
  readonly onJump: (issue: BranchingIssue) => void;
}

function statRows(t: BranchingT, report: BranchingValidationReport): ReadonlyArray<readonly [string, string]> {
  const { stats } = report;
  const count = (value: number): string => t("branchingCuttoon.stats.unitCount", { count: value });
  const steps = (value: number | null): string => (value === null ? t("branchingCuttoon.stats.none") : t("branchingCuttoon.stats.unitSteps", { count: value }));
  return [
    [t("branchingCuttoon.stats.nodes"), count(stats.nodeCount)],
    [t("branchingCuttoon.stats.endings"), count(stats.endingCount)],
    [t("branchingCuttoon.stats.choices"), count(stats.choiceCount)],
    [t("branchingCuttoon.stats.shortest"), steps(stats.shortestPathSteps)],
    [t("branchingCuttoon.stats.longest"), steps(stats.longestPathSteps)],
    [
      t("branchingCuttoon.stats.paths"),
      stats.pathCountExact ? count(stats.pathCount) : t("branchingCuttoon.stats.pathsApprox", { count: stats.pathCount }),
    ],
    [t("branchingCuttoon.stats.loops"), t("branchingCuttoon.stats.unitPlaces", { count: stats.loopBackCount })],
  ];
}

function IssueItem({ issue, graph, onJump }: { readonly issue: BranchingIssue; readonly graph: BranchingCuttoonGraph; readonly onJump: (issue: BranchingIssue) => void }): ReactElement {
  const t = useBranchingT();
  const message = issueMessage(t, issue, graph);
  const Icon = issue.severity === "error" ? OctagonX : AlertTriangle;
  const body = (
    <>
      <Icon size={16} className="mt-1 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{message}</span>
    </>
  );
  const tone = issue.severity === "error" ? "border-bad/35 bg-bad/10" : "border-warn/35 bg-warn/10";
  const canJump = issue.nodeId !== undefined && graph.nodes.some((node) => node.id === issue.nodeId);
  return (
    <li>
      {canJump ? (
        <button
          type="button"
          onClick={() => onJump(issue)}
          className={cn("flex min-h-11 w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm leading-6 text-fg-2 hover:text-fg", tone, BC_FOCUS_RING)}
        >
          {body}
          <ArrowRight size={15} className="mt-1 shrink-0" aria-hidden="true" />
          <span className="sr-only">{t("branchingCuttoon.issues.jumpHint")}</span>
        </button>
      ) : (
        <p className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm leading-6 text-fg-2", tone)}>{body}</p>
      )}
    </li>
  );
}

/** 점검 결과: 오류·경고 요약과 통계, 항목 목록. 장면이 있는 항목은 눌러서 그 장면으로 이동한다. */
export function BranchingIssuePanel({ graph, report, onJump }: BranchingIssuePanelProps): ReactElement {
  const t = useBranchingT();
  const headingId = useId().replace(/:/gu, "");
  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter((issue) => issue.severity === "warning");

  let summary: string;
  if (report.valid && warnings.length === 0) summary = t("branchingCuttoon.issues.allClear");
  else if (report.valid) summary = t("branchingCuttoon.issues.summaryWarningsOnly", { warnings: report.warningCount });
  else summary = t("branchingCuttoon.issues.summaryErrors", { errors: report.errorCount, warnings: report.warningCount });

  return (
    <section aria-labelledby={headingId} className={BC_SURFACE}>
      <h3 id={headingId} className={BC_HEADING}>{t("branchingCuttoon.issues.heading")}</h3>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 flex items-start gap-2 text-sm font-bold leading-6 text-fg">
        {report.valid ? <CheckCircle2 size={16} className="mt-1 shrink-0 text-good" aria-hidden="true" /> : <OctagonX size={16} className="mt-1 shrink-0 text-bad" aria-hidden="true" />}
        <span>{summary}</span>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {statRows(t, report).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className={BC_HINT}>{label}</dt>
            <dd className="font-bold text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      {report.issues.length > 0 ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 항목이 많아 넘치는 목록을 키보드만으로 스크롤하려면 이름 있는 영역이 초점을 받아야 한다(WCAG 2.1.1).
        <div tabIndex={0} role="region" aria-label={t("branchingCuttoon.issues.listLabel")} className={cn("mt-4 max-h-72 overflow-y-auto pr-1", BC_FOCUS_RING)}>
          {errors.length > 0 ? (
            <ul aria-label={t("branchingCuttoon.issues.errorsLabel")} className="grid gap-2">
              {errors.map((issue, index) => <IssueItem key={`e${index}`} issue={issue} graph={graph} onJump={onJump} />)}
            </ul>
          ) : null}
          {warnings.length > 0 ? (
            <ul aria-label={t("branchingCuttoon.issues.warningsLabel")} className={cn("grid gap-2", errors.length > 0 ? "mt-3" : "")}>
              {warnings.map((issue, index) => <IssueItem key={`w${index}`} issue={issue} graph={graph} onJump={onJump} />)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
