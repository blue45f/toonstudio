import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import {
  REVIEW_SEVERITY_LABELS_KO,
  STORY_REVIEW_PERSPECTIVES,
  STORY_REVIEW_PERSPECTIVE_LABELS_KO,
  type ReviewFindingStatus,
  type ReviewPerspective,
  type ReviewSeverity,
  type StoryLivingSpecState,
  type StoryReviewFinding,
} from "./studio-story-living-spec-store";

import { cn } from "@/shared/lib/utils";

export interface StudioSixPerspectiveReviewDrawerProps {
  readonly state: StoryLivingSpecState;
  readonly className?: string;
  readonly onRunIncrementalReview: () => void;
  readonly onTriageFinding: (findingId: string, status: ReviewFindingStatus) => void;
  readonly onProposeQuickFix?: (findingId: string, optionIndex: number) => void;
  readonly onJumpToNode?: (nodeKey: string) => void;
}

const SEVERITY_ORDER: readonly ReviewSeverity[] = ["critical", "warning", "suggestion"];

const STATUS_BADGE_KO: Readonly<Record<ReviewFindingStatus, string>> = {
  open: "미해결",
  resolved: "해결됨",
  deferred: "보류",
};

function severityChipStyle(severity: ReviewSeverity): string {
  if (severity === "critical") return "border-bad/40 bg-bad/10 text-bad";
  if (severity === "warning") return "border-warn/40 bg-warn/10 text-warn";
  return "border-cool/40 bg-cool/10 text-cool";
}

function SeverityIcon({ severity }: { readonly severity: ReviewSeverity }) {
  if (severity === "critical") return <AlertOctagon className="size-3.5 shrink-0" aria-hidden="true" />;
  if (severity === "warning") return <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />;
  return <Info className="size-3.5 shrink-0" aria-hidden="true" />;
}

/**
 * 웹툰 6관점 증분 자동 검수 드로어.
 * 심각/주의/제안 심각도 필터, '남은 의견 하나씩 보기' 트리아지 모드,
 * 그리고 노드 해시 불변 시 기존 해결/보류 판정 보존 결과를 보여 준다.
 */
export function StudioSixPerspectiveReviewDrawer({
  state,
  className,
  onRunIncrementalReview,
  onTriageFinding,
  onProposeQuickFix,
  onJumpToNode,
}: StudioSixPerspectiveReviewDrawerProps) {
  const [activePerspective, setActivePerspective] = useState<ReviewPerspective | "all">("all");
  const [activeSeverity, setActiveSeverity] = useState<ReviewSeverity | "all">("all");
  const [singleTriageMode, setSingleTriageMode] = useState(false);
  const [triageIndex, setTriageIndex] = useState(0);

  const staleCount = state.reviewFindings.filter((item) => item.isStale).length;

  const filteredFindings = state.reviewFindings.filter((finding) => {
    if (activePerspective !== "all" && finding.perspective !== activePerspective) return false;
    if (activeSeverity !== "all" && finding.severity !== activeSeverity) return false;
    if (singleTriageMode && finding.status !== "open") return false;
    return true;
  });

  const clampedIndex =
    filteredFindings.length === 0 ? 0 : Math.min(triageIndex, filteredFindings.length - 1);
  const visibleFindings: readonly StoryReviewFinding[] = singleTriageMode
    ? filteredFindings[clampedIndex]
      ? [filteredFindings[clampedIndex]!]
      : []
    : filteredFindings;

  const countOpenForPerspective = (perspective: ReviewPerspective) =>
    state.reviewFindings.filter(
      (item) => item.perspective === perspective && item.status === "open",
    ).length;

  const countForSeverity = (severity: ReviewSeverity) =>
    state.reviewFindings.filter((item) => item.severity === severity && item.status === "open").length;

  return (
    <section
      aria-label="웹툰 6관점 증분 자동 검수"
      data-testid="studio-six-perspective-review-drawer"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-bold text-fg">웹툰 6관점 증분 자동 검수</h2>
          {state.lastReviewReport ? (
            <p className="text-[0.72rem] text-fg-2 tabular-nums">
              해시 불변 보존 {state.lastReviewReport.preservedNodeKeys.length}노드 · 재검수{" "}
              {state.lastReviewReport.reevaluatedNodeKeys.length}노드 · 해결{" "}
              {state.lastReviewReport.resolvedCount} · 보류 {state.lastReviewReport.deferredCount}
            </p>
          ) : (
            <p className="text-[0.72rem] text-fg-2">
              바뀐 노드만 골라 검수해 기존 해결·보류 판정을 유지합니다.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={singleTriageMode}
            onClick={() => {
              setSingleTriageMode((prev) => !prev);
              setTriageIndex(0);
            }}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              singleTriageMode
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            남은 의견 하나씩 보기
          </button>

          <button
            type="button"
            onClick={onRunIncrementalReview}
            className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent transition-[background-color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            증분 재검수
          </button>
        </div>
      </header>

      {staleCount > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            이전 검수 이후 내용이 바뀐 항목 {staleCount}건이 있습니다.
          </span>
          <button
            type="button"
            onClick={onRunIncrementalReview}
            className="inline-flex min-h-11 items-center rounded-lg border border-warn/40 bg-card px-3 text-xs font-semibold text-warn hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            바뀐 노드만 다시 검수
          </button>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="검수 관점 필터"
        className="flex flex-wrap gap-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activePerspective === "all"}
          onClick={() => {
            setActivePerspective("all");
            setTriageIndex(0);
          }}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            activePerspective === "all"
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <span>전체 관점</span>
          <span className="tabular-nums">
            {state.reviewFindings.filter((item) => item.status === "open").length}
          </span>
        </button>

        {STORY_REVIEW_PERSPECTIVES.map((perspective) => {
          const active = activePerspective === perspective;
          const openCount = countOpenForPerspective(perspective);
          return (
            <button
              key={perspective}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActivePerspective(perspective);
                setTriageIndex(0);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <span>{STORY_REVIEW_PERSPECTIVE_LABELS_KO[perspective]}</span>
              <span className="tabular-nums opacity-85">{openCount}</span>
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="심각도 필터" className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={activeSeverity === "all"}
          onClick={() => {
            setActiveSeverity("all");
            setTriageIndex(0);
          }}
          className={cn(
            "inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            activeSeverity === "all"
              ? "border-line-strong bg-raised text-fg"
              : "border-line bg-card text-fg-2 hover:text-fg",
          )}
        >
          모든 심각도
        </button>
        {SEVERITY_ORDER.map((severity) => {
          const active = activeSeverity === severity;
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setActiveSeverity(active ? "all" : severity);
                setTriageIndex(0);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                active ? severityChipStyle(severity) : "border-line bg-card text-fg-2 hover:text-fg",
              )}
            >
              <SeverityIcon severity={severity} />
              <span>{REVIEW_SEVERITY_LABELS_KO[severity]}</span>
              <span className="tabular-nums">{countForSeverity(severity)}</span>
            </button>
          );
        })}
      </div>

      {singleTriageMode && filteredFindings.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2">
          <span className="text-xs font-semibold text-fg tabular-nums">
            미해결 트리아지 {clampedIndex + 1} / {filteredFindings.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={clampedIndex <= 0}
              onClick={() => setTriageIndex(Math.max(0, clampedIndex - 1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-raised text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              aria-label="이전 의견"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={clampedIndex >= filteredFindings.length - 1}
              onClick={() => setTriageIndex(Math.min(filteredFindings.length - 1, clampedIndex + 1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-raised text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              aria-label="다음 의견"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {visibleFindings.length === 0 ? (
        <p className="rounded-xl border border-line bg-card px-4 py-6 text-center text-xs text-fg-2">
          조건에 맞는 검수 항목이 없습니다.
        </p>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-2.5 overflow-y-auto overscroll-contain">
          {visibleFindings.map((finding) => (
            <li
              key={finding.id}
              data-testid={`review-finding-${finding.id}`}
              className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[0.7rem] font-bold",
                      severityChipStyle(finding.severity),
                    )}
                  >
                    <SeverityIcon severity={finding.severity} />
                    {REVIEW_SEVERITY_LABELS_KO[finding.severity]}
                  </span>
                  <span className="rounded border border-line bg-raised px-2 py-0.5 text-[0.7rem] font-medium text-fg-2">
                    {STORY_REVIEW_PERSPECTIVE_LABELS_KO[finding.perspective]}
                  </span>
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[0.7rem] font-semibold",
                      finding.status === "resolved"
                        ? "border-good/40 bg-good/10 text-good"
                        : finding.status === "deferred"
                          ? "border-line bg-raised text-fg-2"
                          : "border-accent/35 bg-accent-soft text-accent",
                    )}
                  >
                    {STATUS_BADGE_KO[finding.status]}
                  </span>
                  {finding.isStale ? (
                    <span className="rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.7rem] font-semibold text-warn">
                      재검수 필요
                    </span>
                  ) : null}
                </div>

                {onJumpToNode ? (
                  <button
                    type="button"
                    onClick={() => onJumpToNode(finding.targetNodeKey)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.72rem] font-semibold text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <span>원문으로 이동</span>
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div>
                <h3 className="text-xs font-bold text-fg">{finding.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-2">{finding.message}</p>
                <p className="mt-1 rounded-md border border-line bg-panel px-2.5 py-1.5 text-[0.7rem] text-fg-2">
                  근거: {finding.quote}
                </p>
              </div>

              {finding.quickFixOptions.length > 0 && onProposeQuickFix ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-cool/30 bg-cool/10 p-2.5">
                  <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-cool">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    선택형 보완 제안 (승인 게이트로 전달)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {finding.quickFixOptions.map((option, optIdx) => (
                      <button
                        key={`${finding.id}-opt-${option.label}`}
                        type="button"
                        onClick={() => onProposeQuickFix(finding.id, optIdx)}
                        className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-0.5">
                {finding.status !== "resolved" ? (
                  <button
                    type="button"
                    onClick={() => onTriageFinding(finding.id, "resolved")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-good/40 bg-good/10 px-3 text-xs font-semibold text-good hover:bg-good/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    해결 완료
                  </button>
                ) : null}
                {finding.status !== "deferred" ? (
                  <button
                    type="button"
                    onClick={() => onTriageFinding(finding.id, "deferred")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <Clock className="size-4" aria-hidden="true" />
                    보류
                  </button>
                ) : null}
                {finding.status !== "open" ? (
                  <button
                    type="button"
                    onClick={() => onTriageFinding(finding.id, "open")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    다시 열기
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default StudioSixPerspectiveReviewDrawer;
