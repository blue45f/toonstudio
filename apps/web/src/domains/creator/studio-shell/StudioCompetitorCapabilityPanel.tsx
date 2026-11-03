import {
  CheckCircle2,
  ChevronDown,
  Compass,
  FlaskConical,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import {
  STUDIO_COMPETITOR_CAPABILITY_EVALUATION,
  STUDIO_COMPETITOR_CAPABILITY_RECORDS,
} from "../studio-platform/studio-competitor-capability-evidence";
import {
  matchStudioCompetitorWorkflowPreset,
} from "../studio-workspace-recommendation";
import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

export type StudioCompetitorCapabilityLocale = "ko" | "en";

export function StudioCompetitorCapabilityPanel({
  locale,
  compact = false,
  onSelectWorkspacePreset,
  activeWorkspaceId,
}: {
  readonly locale: StudioCompetitorCapabilityLocale;
  readonly compact?: boolean;
  readonly activeWorkspaceId?: StudioDefaultWorkspaceId;
  readonly onSelectWorkspacePreset?: (workspaceId: StudioDefaultWorkspaceId) => void;
}) {
  const evaluation = STUDIO_COMPETITOR_CAPABILITY_EVALUATION;
  const pending = STUDIO_COMPETITOR_CAPABILITY_RECORDS.filter(
    (record) => record.externalValidationRequired,
  );
  const [toolQuery, setToolQuery] = useState("");
  const matchedWorkflows = useMemo(
    () => matchStudioCompetitorWorkflowPreset(toolQuery),
    [toolQuery],
  );

  const handleSelectWorkspace = (workspaceId: StudioDefaultWorkspaceId) => {
    onSelectWorkspacePreset?.(workspaceId);
  };

  return (
    <section
      className={cn(
        "mt-5 rounded-2xl border p-4 sm:p-5",
        evaluation.incompleteCount === 0
          ? "border-success/30 bg-success/5"
          : "border-danger/35 bg-danger/5",
      )}
      aria-labelledby="studio-competitor-capability-title"
      data-replacement-claim-allowed={String(evaluation.replacementClaimAllowed)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-success" aria-hidden="true" />
            <h2 id="studio-competitor-capability-title" className="text-sm font-black text-fg">
              {locale === "ko"
                ? "전문 제작 기능 구현·검증 원장"
                : "Professional production capability ledger"}
            </h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            {locale === "ko"
              ? "계획한 57개 기능을 실제 제품 경로·저장·복구·호환·테스트 근거에 연결했습니다. 외부 실기기와 전문 작가 검증이 끝나기 전에는 ‘완전 대체’ 문구를 표시하지 않습니다."
              : "All 57 planned capabilities are connected to product, durability, compatibility and test evidence. A complete replacement claim stays disabled until independent device and creator validation is attached."}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2" aria-label={locale === "ko" ? "검증 요약" : "Validation summary"}>
          <Metric
            value={evaluation.verifiedCount}
            label={locale === "ko" ? "검증됨" : "Verified"}
            tone="success"
          />
          <Metric
            value={evaluation.externalValidationPendingCount}
            label={locale === "ko" ? "외부 검증" : "External"}
            tone="warning"
          />
          <Metric
            value={evaluation.incompleteCount}
            label={locale === "ko" ? "구현 누락" : "Gaps"}
            tone={evaluation.incompleteCount === 0 ? "success" : "danger"}
          />
        </div>
      </div>

      {!compact ? (
        <div
          className="mt-4 rounded-xl border border-line bg-card/85 p-3.5"
          data-testid="competitor-workflow-quick-match"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass size={15} className="text-accent" aria-hidden="true" />
              <h3 className="text-xs font-black text-fg">
                {locale === "ko"
                  ? "익숙한 도구로 작업공간 찾기"
                  : "Find a workspace by familiar tool"}
              </h3>
            </div>
            <label className="relative flex w-full min-w-0 items-center sm:w-56">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 text-fg-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={toolQuery}
                onChange={(event) => setToolQuery(event.target.value)}
                aria-label={
                  locale === "ko"
                    ? "익숙한 도구 또는 작업 검색"
                    : "Search familiar tool or workflow"
                }
                placeholder={
                  locale === "ko"
                    ? "예: 클튜, Procreate, 포토샵, SketchUp, Kitsu..."
                    : "e.g. Clip Studio, Procreate, SketchUp, Kitsu..."
                }
                className="min-h-8 w-full rounded-lg border border-line bg-panel pl-7 pr-2.5 text-xs text-fg placeholder:text-fg-3"
              />
            </label>
          </div>
          {matchedWorkflows.length === 0 ? <p role="status" className="mt-3 text-sm text-fg-2">{locale === "ko" ? "일치하는 작업공간이 없습니다." : "No matching workspace."}</p> : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {matchedWorkflows.map((item) => {
              const isSelected = activeWorkspaceId === item.workspaceId;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col justify-between rounded-xl border p-3 transition-colors",
                    isSelected
                      ? "border-accent bg-accent-soft/35"
                      : "border-line bg-panel/70 hover:border-accent/40",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-black text-fg">
                        {item.competitorFamily}
                      </span>
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                        {item.workspaceName}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.7rem] leading-4 text-fg-2">
                      {locale === "ko" ? item.summary : "Suggested layout; review the available tools before switching."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(locale === "ko" ? item.keyCapabilities.slice(0, 3) : []).map((cap) => (
                        <span
                          key={cap}
                          className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.62rem] text-fg-3"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!onSelectWorkspacePreset || isSelected}
                    onClick={() => handleSelectWorkspace(item.workspaceId)}
                    className={cn(
                      "mt-2.5 min-h-8 w-full rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors",
                      isSelected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg hover:border-accent/50 hover:text-accent",
                    )}
                  >
                    {isSelected
                      ? (locale === "ko" ? `${item.workspaceName} 사용 중` : `${item.workspaceId} active`)
                      : (locale === "ko" ? `${item.workspaceName} 배치 선택` : `Choose ${item.workspaceId}`)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!compact && pending.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-line bg-card/75">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            <span className="inline-flex items-center gap-2">
              <FlaskConical size={15} className="text-warning" aria-hidden="true" />
              {locale === "ko"
                ? `외부 검증 대기 ${pending.length}건 보기`
                : `Show ${pending.length} pending external validations`}
            </span>
            <ChevronDown
              size={15}
              className="text-fg-3 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
            {pending.map((record) => {
              const note = record.evidence.find(
                (item) => item.dimension === "external-validation",
              )?.note;
              return (
                <li key={record.id} className="rounded-lg border border-line bg-panel/60 px-3 py-2">
                  <strong className="block text-xs text-fg">
                    {String(record.sequence).padStart(2, "0")} · {record.title}
                  </strong>
                  {note ? <span className="mt-1 block text-[0.68rem] leading-4 text-fg-3">{note}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  readonly value: number;
  readonly label: string;
  readonly tone: "success" | "warning" | "danger";
}) {
  return (
    <span className={cn(
      "flex min-w-20 flex-col items-center rounded-xl border px-2 py-2",
      tone === "success" && "border-success/25 bg-success/10 text-success",
      tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
      tone === "danger" && "border-danger/25 bg-danger/10 text-danger",
    )}>
      <span className="inline-flex items-center gap-1 text-lg font-black">
        {tone === "success" ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
        {value}
      </span>
      <span className="mt-0.5 text-[0.62rem] font-bold">{label}</span>
    </span>
  );
}
