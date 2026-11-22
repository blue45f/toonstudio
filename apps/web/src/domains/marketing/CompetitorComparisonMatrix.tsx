import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  Compass,
  FileCode2,
  Minus,
  Sparkles,
  Star,
} from "lucide-react";
import { useState } from "react";

import {
  CAPABILITY_STATUS_META,
  COMPARISON_AXES,
  COMPETITOR_FOCUS_GROUPS,
  COMPETITOR_PROFILES,
  getComparisonAxis,
  type BilingualCopy,
  type CapabilityStatus,
  type ComparisonAxisId,
  type ComparisonCriterion,
  type CompetitorFocusGroupId,
  type CompetitorId,
} from "./competitor-comparison-data";

import { cn } from "@/shared/lib/utils";

interface CompetitorComparisonMatrixProps {
  readonly locale: "ko" | "en";
}

function pick(copy: BilingualCopy, locale: "ko" | "en"): string {
  return locale === "ko" ? copy.ko : copy.en;
}

function StatusIcon({ status }: { readonly status: CapabilityStatus }) {
  switch (status) {
    case "current":
      return <CheckCircle2 size={14} className="shrink-0 text-good" aria-hidden="true" />;
    case "partial":
      return <Clock size={14} className="shrink-0 text-warn" aria-hidden="true" />;
    case "target":
      return <Sparkles size={14} className="shrink-0 text-cool" aria-hidden="true" />;
    case "native-strength":
      return <Star size={14} className="shrink-0 text-cool" aria-hidden="true" />;
    case "limited":
      return <CircleDot size={14} className="shrink-0 text-fg-3" aria-hidden="true" />;
    case "none":
      return <Minus size={14} className="shrink-0 text-fg-3" aria-hidden="true" />;
  }
}

function statusBadgeToneClass(status: CapabilityStatus): string {
  const tone = CAPABILITY_STATUS_META[status].tone;
  if (tone === "good") return "bg-raised text-good";
  if (tone === "warn") return "bg-raised text-warn";
  if (tone === "cool") return "bg-raised text-cool";
  return "bg-raised/70 text-fg-3";
}

function StatusBadge({
  status,
  locale,
}: {
  readonly status: CapabilityStatus;
  readonly locale: "ko" | "en";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        statusBadgeToneClass(status),
      )}
    >
      <StatusIcon status={status} />
      <span>{pick(CAPABILITY_STATUS_META[status].label, locale)}</span>
    </span>
  );
}

function EvidenceBlock({
  criterion,
  locale,
  expanded,
  onToggle,
}: {
  readonly criterion: ComparisonCriterion;
  readonly locale: "ko" | "en";
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { toonStudioEvidence } = criterion;
  const maturityStatus: CapabilityStatus = toonStudioEvidence.maturity;
  return (
    <div className="mt-2.5 border-t border-line/60 pt-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`compare-evidence-toggle-${criterion.id}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FileCode2 size={14} aria-hidden="true" />
        <span>
          {locale === "ko"
            ? `ToonStudio 구현 근거 (${toonStudioEvidence.repoPaths.length}건)`
            : `ToonStudio code evidence (${toonStudioEvidence.repoPaths.length})`}
        </span>
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {expanded ? (
        <div
          data-testid={`compare-evidence-panel-${criterion.id}`}
          className="mt-2 rounded-xl bg-raised/70 px-3.5 py-3 text-xs leading-5 text-fg-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={maturityStatus} locale={locale} />
            <span className="font-semibold text-fg">
              {locale === "ko" ? "저장소 실측 근거" : "Verified repository evidence"}
            </span>
          </div>
          <p className="mt-1.5 break-keep">{pick(toonStudioEvidence.summary, locale)}</p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-fg-3">
            {toonStudioEvidence.repoPaths.map((repoPath) => (
              <li key={repoPath} className="break-all">
                {repoPath}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const OTHER_COMPETITORS = COMPETITOR_PROFILES.filter((profile) => profile.id !== "toonstudio");

export function CompetitorComparisonMatrix({ locale }: CompetitorComparisonMatrixProps) {
  const [activeAxisId, setActiveAxisId] = useState<ComparisonAxisId>("drawing-spectral");
  const [focusGroupId, setFocusGroupId] = useState<CompetitorFocusGroupId>("all");
  const [selectedOthers, setSelectedOthers] = useState<readonly CompetitorId[]>(
    COMPETITOR_FOCUS_GROUPS[0]!.competitors,
  );
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<ReadonlySet<string>>(
    () => new Set(["spectral-pigment-km7"]),
  );

  const activeAxis = getComparisonAxis(activeAxisId);
  const visibleProfiles = [
    COMPETITOR_PROFILES[0]!,
    ...OTHER_COMPETITORS.filter((profile) => selectedOthers.includes(profile.id)),
  ];

  function handleSelectFocusGroup(groupId: CompetitorFocusGroupId) {
    const group = COMPETITOR_FOCUS_GROUPS.find((item) => item.id === groupId);
    if (!group) return;
    setFocusGroupId(groupId);
    setSelectedOthers(group.competitors);
  }

  function handleToggleCompetitor(id: CompetitorId) {
    if (id === "toonstudio") return;
    const exists = selectedOthers.includes(id);
    if (exists && selectedOthers.length <= 1) return;
    const next = exists
      ? selectedOthers.filter((item) => item !== id)
      : [...selectedOthers, id];
    setSelectedOthers(next);
    const matchingGroup = COMPETITOR_FOCUS_GROUPS.find(
      (group) =>
        group.competitors.length === next.length
        && group.competitors.every((item) => next.includes(item)),
    );
    setFocusGroupId(matchingGroup?.id ?? "all");
  }

  function handleToggleEvidence(criterionId: string) {
    setExpandedEvidenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) next.delete(criterionId);
      else next.add(criterionId);
      return next;
    });
  }

  return (
    <section
      aria-labelledby="comparison-matrix-heading"
      data-testid="competitor-comparison-matrix"
      className="mt-10 rounded-3xl border border-line bg-panel p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
            {locale === "ko" ? "5-AXIS CAPABILITY MATRIX" : "5-AXIS CAPABILITY MATRIX"}
          </p>
          <h2
            id="comparison-matrix-heading"
            className="mt-1 break-keep text-xl font-bold tracking-[-0.02em] text-fg sm:text-2xl"
          >
            {locale === "ko"
              ? "5대 비교 축별 기능·품질·비용 실측 대조"
              : "Side-by-side comparison across 5 production axes"}
          </h2>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 text-xs text-fg-3"
          aria-label={locale === "ko" ? "상태 범례" : "Status legend"}
        >
          <StatusBadge status="current" locale={locale} />
          <StatusBadge status="partial" locale={locale} />
          <StatusBadge status="native-strength" locale={locale} />
          <StatusBadge status="limited" locale={locale} />
        </div>
      </div>

      {/* 5개 비교 축 탭 */}
      <div
        role="tablist"
        aria-label={locale === "ko" ? "비교 영역 선택" : "Select comparison axis"}
        className="mt-5 flex flex-wrap gap-2 border-b border-line/70 pb-4"
      >
        {COMPARISON_AXES.map((axis) => {
          const selected = axis.id === activeAxisId;
          return (
            <button
              key={axis.id}
              type="button"
              role="tab"
              id={`compare-tab-${axis.id}`}
              aria-selected={selected}
              aria-controls={`compare-panel-${axis.id}`}
              data-testid={`compare-axis-tab-${axis.id}`}
              onClick={() => setActiveAxisId(axis.id)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {pick(axis.tabLabel, locale)}
            </button>
          );
        })}
      </div>

      {/* 비교 대상 그룹 및 개별 툴 필터 */}
      <div className="mt-4 grid gap-3 border-b border-line/70 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <p className="text-xs font-semibold text-fg-3">
            {locale === "ko" ? "비교 묶음 프리셋" : "Comparison presets"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={locale === "ko" ? "비교 묶음 프리셋" : "Comparison presets"}>
            {COMPETITOR_FOCUS_GROUPS.map((group) => {
              const active = focusGroupId === group.id
                && group.competitors.length === selectedOthers.length
                && group.competitors.every((id) => selectedOthers.includes(id));
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`compare-group-${group.id}`}
                  onClick={() => handleSelectFocusGroup(group.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {pick(group.label, locale)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-fg-3">
            {locale === "ko"
              ? "비교할 도구 선택 (ToonStudio 기준 고정 · 최소 1종 유지)"
              : "Toggle compared tools (ToonStudio pinned · minimum 1 competitor)"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={locale === "ko" ? "비교 도구 선택" : "Toggle compared tools"}>
            {OTHER_COMPETITORS.map((profile) => {
              const selected = selectedOthers.includes(profile.id);
              return (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={selected}
                  data-testid={`compare-tool-toggle-${profile.id}`}
                  onClick={() => handleToggleCompetitor(profile.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    selected
                      ? "border-line-strong bg-raised text-fg"
                      : "border-line/70 bg-card/50 text-fg-3 hover:text-fg-2",
                  )}
                >
                  {profile.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 활성 축 본문 */}
      <div
        role="tabpanel"
        id={`compare-panel-${activeAxis.id}`}
        aria-labelledby={`compare-tab-${activeAxis.id}`}
        className="mt-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h3 className="break-keep text-lg font-bold text-fg sm:text-xl">
              {pick(activeAxis.title, locale)}
            </h3>
            <p className="mt-1 break-keep text-sm leading-6 text-fg-2">
              {pick(activeAxis.subtitle, locale)}
            </p>
          </div>
          <span className="rounded-full bg-raised px-3 py-1.5 font-display text-xs font-semibold tabular-nums text-fg-2">
            {locale === "ko"
              ? `표시 중: ToonStudio + ${selectedOthers.length}종`
              : `Showing: ToonStudio + ${selectedOthers.length} tools`}
          </span>
        </div>

        {/* 축별 객관적 선택 가이드 */}
        <div
          data-testid={`compare-axis-guide-${activeAxis.id}`}
          className="mt-4 flex items-start gap-3 rounded-2xl bg-card px-4 py-3.5 text-sm leading-6 text-fg-2"
        >
          <Compass size={18} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="text-xs font-bold text-fg">
              {locale === "ko" ? "이 영역에서 언제 어떤 도구가 유리한가요?" : "When to choose which tool in this area"}
            </p>
            <p className="mt-1 break-keep">{pick(activeAxis.whenToUseGuide, locale)}</p>
          </div>
        </div>

        {/* 데스크톱: 구조화 비교 테이블 */}
        <div className="mt-5 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[54rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-card/80">
                <th scope="col" className="w-[18rem] px-4 py-3.5 align-bottom text-xs font-bold text-fg-2">
                  {locale === "ko" ? "비교 항목 · ToonStudio 실측 근거" : "Criterion & ToonStudio evidence"}
                </th>
                {visibleProfiles.map((profile) => (
                  <th
                    key={profile.id}
                    scope="col"
                    className={cn(
                      "min-w-[10.5rem] px-3.5 py-3.5 align-bottom",
                      profile.id === "toonstudio" ? "bg-accent-soft/60 text-accent" : "text-fg",
                    )}
                  >
                    <div className="text-sm font-bold">{profile.name}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-fg-3">
                      {pick(profile.role, locale)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {activeAxis.criteria.map((criterion) => {
                const expanded = expandedEvidenceIds.has(criterion.id);
                return (
                  <tr key={criterion.id} data-testid={`compare-row-${criterion.id}`} className="align-top">
                    <th scope="row" className="bg-panel px-4 py-4 font-normal">
                      <div className="break-keep text-sm font-bold text-fg">
                        {pick(criterion.title, locale)}
                      </div>
                      <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
                        {pick(criterion.summary, locale)}
                      </p>
                      <EvidenceBlock
                        criterion={criterion}
                        locale={locale}
                        expanded={expanded}
                        onToggle={() => handleToggleEvidence(criterion.id)}
                      />
                    </th>
                    {visibleProfiles.map((profile) => {
                      const cell = criterion.cells[profile.id];
                      return (
                        <td
                          key={profile.id}
                          className={cn(
                            "px-3.5 py-4",
                            profile.id === "toonstudio" ? "bg-accent-soft/30" : "bg-card/30",
                          )}
                        >
                          <StatusBadge status={cell.status} locale={locale} />
                          <div className="mt-2 break-keep text-xs font-semibold text-fg">
                            {pick(cell.label, locale)}
                          </div>
                          <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
                            {pick(cell.detail, locale)}
                          </p>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 모바일·태블릿: 좁은 화면용 구조화 카드 리스트 (DESIGN.md §5 준수) */}
        <div className="mt-5 space-y-5 lg:hidden">
          {activeAxis.criteria.map((criterion) => {
            const expanded = expandedEvidenceIds.has(criterion.id);
            return (
              <article
                key={criterion.id}
                className="rounded-2xl bg-card p-4"
              >
                <h4 className="break-keep text-base font-bold text-fg">
                  {pick(criterion.title, locale)}
                </h4>
                <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
                  {pick(criterion.summary, locale)}
                </p>
                <dl className="mt-3 divide-y divide-line/60">
                  {visibleProfiles.map((profile) => {
                    const cell = criterion.cells[profile.id];
                    return (
                      <div
                        key={profile.id}
                        className={cn(
                          "py-3",
                          profile.id === "toonstudio" ? "rounded-xl bg-accent-soft/40 px-3" : undefined,
                        )}
                      >
                        <dt className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-fg">{profile.name}</span>
                          <StatusBadge status={cell.status} locale={locale} />
                        </dt>
                        <dd className="mt-1.5 text-xs leading-5 text-fg-2">
                          <strong className="font-semibold text-fg">{pick(cell.label, locale)}</strong>
                          {" — "}
                          {pick(cell.detail, locale)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <EvidenceBlock
                  criterion={criterion}
                  locale={locale}
                  expanded={expanded}
                  onToggle={() => handleToggleEvidence(criterion.id)}
                />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
