import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  FileCode2,
  Minus,
  Puzzle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  ALL_DRAWING_CRITERIA,
  DRAWING_COMPARISON_CATEGORIES,
  DRAWING_SUPPORT_STATUS_META,
  DRAWING_TOOL_PRESETS,
  DRAWING_TOOL_PROFILES,
  filterDrawingCriteria,
  type BilingualText,
  type DrawingCategoryId,
  type DrawingComparisonCriterion,
  type DrawingPresetId,
  type DrawingSupportStatus,
  type DrawingToolId,
} from "./drawing-tool-comparison-data";

import { cx } from "@/shared/lib/cx";

interface DrawingToolComparisonMatrixProps {
  readonly locale: "ko" | "en";
}

const COMPETITOR_PROFILES = DRAWING_TOOL_PROFILES.filter(
  (profile): profile is (typeof DRAWING_TOOL_PROFILES)[number] & { readonly id: Exclude<DrawingToolId, "toonstudio"> } =>
    profile.id !== "toonstudio",
);

const ALL_STATUSES: readonly DrawingSupportStatus[] = [
  "supported",
  "partial",
  "plugin",
  "unsupported",
];

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

function SupportStatusIcon({ status }: { readonly status: DrawingSupportStatus }) {
  switch (status) {
    case "supported":
      return <CheckCircle2 size={13} className="shrink-0 text-good" aria-hidden="true" />;
    case "partial":
      return <CircleDot size={13} className="shrink-0 text-warn" aria-hidden="true" />;
    case "plugin":
      return <Puzzle size={13} className="shrink-0 text-cool" aria-hidden="true" />;
    case "unsupported":
      return <Minus size={13} className="shrink-0 text-fg-3" aria-hidden="true" />;
  }
}

function statusChipClasses(status: DrawingSupportStatus): string {
  const tone = DRAWING_SUPPORT_STATUS_META[status].tone;
  if (tone === "good") return "border-good/35 bg-good/10 text-good";
  if (tone === "warn") return "border-warn/35 bg-warn/10 text-warn";
  if (tone === "cool") return "border-cool/35 bg-cool/10 text-cool";
  return "border-line bg-raised/70 text-fg-3";
}

function DrawingSupportBadge({
  status,
  locale,
}: {
  readonly status: DrawingSupportStatus;
  readonly locale: "ko" | "en";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold",
        statusChipClasses(status),
      )}
    >
      <SupportStatusIcon status={status} />
      <span>{pick(DRAWING_SUPPORT_STATUS_META[status].label, locale)}</span>
    </span>
  );
}

function TechnicalDetailDisclosure({
  criterion,
  locale,
  expanded,
  onToggle,
}: {
  readonly criterion: DrawingComparisonCriterion;
  readonly locale: "ko" | "en";
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { evidence } = criterion;
  const maturityLabel = evidence.maturity === "current"
    ? (locale === "ko" ? "현재 구현 (Current)" : "Current implementation")
    : (locale === "ko" ? "전환·검증 중 (In progress)" : "In progress / validating");
  const maturityClass = evidence.maturity === "current"
    ? "border-good/35 bg-good/10 text-good"
    : "border-warn/35 bg-warn/10 text-warn";

  return (
    <div className="mt-2.5 border-t border-line/60 pt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`drawing-detail-toggle-${criterion.id}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-bold text-accent transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FileCode2 size={14} className="shrink-0" aria-hidden="true" />
        <span className="break-keep">
          {locale === "ko"
            ? `기술 근거 · 구현 차이 (${evidence.repoPaths.length}건)`
            : `Technical rationale & diff (${evidence.repoPaths.length})`}
        </span>
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {expanded ? (
        <div
          data-testid={`drawing-detail-panel-${criterion.id}`}
          className="mt-2 space-y-2.5 rounded-2xl border border-line/70 bg-raised/65 p-3.5 text-xs leading-5 text-fg-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", maturityClass)}>
              {maturityLabel}
            </span>
            <span className="font-bold text-fg">
              {locale === "ko" ? "ToonStudio 구현 근거" : "ToonStudio implementation basis"}
            </span>
          </div>
          <p className="break-keep">{pick(evidence.rationale, locale)}</p>
          <div className="rounded-xl border border-line/60 bg-card/80 px-3 py-2">
            <p className="text-[11px] font-bold text-fg">
              {locale === "ko" ? "경쟁 툴과의 구현 차이" : "Architecture difference vs. peers"}
            </p>
            <p className="mt-1 break-keep text-fg-2">{pick(evidence.implementationDiff, locale)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-fg-3">
              {locale === "ko" ? "검증된 저장소 경로" : "Verified repository paths"}
            </p>
            <ul className="mt-1 space-y-1 font-mono text-[11px] text-fg-3">
              {evidence.repoPaths.map((repoPath) => (
                <li key={repoPath} className="break-all">
                  {repoPath}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DrawingToolComparisonMatrix({ locale }: DrawingToolComparisonMatrixProps) {
  const [activeCategory, setActiveCategory] = useState<"all" | DrawingCategoryId>("all");
  const [selectedCompetitors, setSelectedCompetitors] = useState<readonly Exclude<DrawingToolId, "toonstudio">[]>(
    DRAWING_TOOL_PRESETS[0]!.competitors,
  );
  const [activePreset, setActivePreset] = useState<DrawingPresetId | "custom">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DrawingSupportStatus>("all");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(["km7-spectral-mixing"]),
  );

  const visibleProfiles = useMemo(
    () => [
      DRAWING_TOOL_PROFILES[0]!,
      ...COMPETITOR_PROFILES.filter((profile) => selectedCompetitors.includes(profile.id)),
    ],
    [selectedCompetitors],
  );

  const visibleToolIds = useMemo(
    () => visibleProfiles.map((profile) => profile.id),
    [visibleProfiles],
  );

  const filteredCriteria = useMemo(
    () =>
      filterDrawingCriteria({
        categoryId: activeCategory,
        query,
        statusFilter,
        visibleTools: visibleToolIds,
      }),
    [activeCategory, query, statusFilter, visibleToolIds],
  );

  const activeCategoryMeta = activeCategory === "all"
    ? undefined
    : DRAWING_COMPARISON_CATEGORIES.find((category) => category.id === activeCategory);

  const categoryLabelMap = useMemo(
    () => new Map(DRAWING_COMPARISON_CATEGORIES.map((category) => [category.id, category.shortLabel])),
    [],
  );

  function handleSelectPreset(presetId: DrawingPresetId) {
    const preset = DRAWING_TOOL_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setSelectedCompetitors(preset.competitors);
  }

  function handleToggleCompetitor(toolId: Exclude<DrawingToolId, "toonstudio">) {
    const exists = selectedCompetitors.includes(toolId);
    if (exists && selectedCompetitors.length <= 1) return;
    const next = exists
      ? selectedCompetitors.filter((item) => item !== toolId)
      : [...selectedCompetitors, toolId];
    setSelectedCompetitors(next);
    const matched = DRAWING_TOOL_PRESETS.find(
      (preset) =>
        preset.competitors.length === next.length
        && preset.competitors.every((item) => next.includes(item)),
    );
    setActivePreset(matched?.id ?? "custom");
  }

  function handleToggleDetail(criterionId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) next.delete(criterionId);
      else next.add(criterionId);
      return next;
    });
  }

  function handleExpandVisible(expand: boolean) {
    if (!expand) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds(new Set(filteredCriteria.map((item) => item.id)));
  }

  function handleResetFilters() {
    setActiveCategory("all");
    setQuery("");
    setStatusFilter("all");
    handleSelectPreset("all");
  }

  const allVisibleExpanded =
    filteredCriteria.length > 0 && filteredCriteria.every((item) => expandedIds.has(item.id));

  return (
    <section
      aria-labelledby="drawing-matrix-heading"
      data-testid="drawing-comparison-matrix"
      className="mt-8 rounded-[2rem] border border-line/80 bg-panel/75 p-4 shadow-sm sm:mt-10 sm:p-6 lg:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-accent">7-DOMAIN · 8-TOOL TECHNICAL MATRIX</p>
          <h2
            id="drawing-matrix-heading"
            className="mt-1.5 break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {locale === "ko"
              ? "7개 기술 영역 · 37개 드로잉 기능 실측 대조표"
              : "37 drawing capabilities compared across 7 engineering domains"}
          </h2>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label={locale === "ko" ? "지원 상태 배지 범례" : "Support status legend"}
        >
          {ALL_STATUSES.map((status) => (
            <DrawingSupportBadge key={status} status={status} locale={locale} />
          ))}
        </div>
      </div>

      {/* 카테고리 필터 탭 (전체 + 7개 영역) */}
      <div
        role="tablist"
        aria-label={locale === "ko" ? "비교 영역 필터" : "Filter comparison domain"}
        className="mt-5 flex gap-2 overflow-x-auto overscroll-x-contain border-b border-line/70 pb-4 [scrollbar-width:thin]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "all"}
          data-testid="drawing-category-tab-all"
          onClick={() => setActiveCategory("all")}
          className={cx(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm",
            activeCategory === "all"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
          )}
        >
          <span>{locale === "ko" ? "전체 영역" : "All domains"}</span>
          <span className="rounded-full bg-panel px-1.5 py-0.5 text-[11px] tabular-nums text-fg-3">
            {ALL_DRAWING_CRITERIA.length}
          </span>
        </button>

        {DRAWING_COMPARISON_CATEGORIES.map((category) => {
          const selected = activeCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`drawing-category-tab-${category.id}`}
              onClick={() => setActiveCategory(category.id)}
              className={cx(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm",
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <span>{pick(category.shortLabel, locale)}</span>
              <span className="rounded-full bg-panel px-1.5 py-0.5 text-[11px] tabular-nums text-fg-3">
                {category.criteria.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* 검색 + 비교 툴 선택 칩 + 프리셋 */}
      <div className="mt-4 grid gap-4 border-b border-line/70 pb-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <label htmlFor="drawing-compare-search" className="sr-only">
              {locale === "ko" ? "기능·알고리즘·파일 경로 검색" : "Search features, algorithms or paths"}
            </label>
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden="true"
            />
            <input
              id="drawing-compare-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="drawing-compare-search"
              placeholder={
                locale === "ko"
                  ? "기능·알고리즘·포맷 검색 (예: Kubelka-Munk, Watershed, PatchMatch, .sut, Magma, JFA)"
                  : "Search features, algorithms or formats (e.g. Kubelka-Munk, Watershed, PatchMatch, .sut, Magma, JFA)"
              }
              className="min-h-11 w-full rounded-xl border border-line-strong bg-card pl-10 pr-10 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={locale === "ko" ? "검색어 지우기" : "Clear search"}
                className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={locale === "ko" ? "ToonStudio 지원 상태 필터" : "Filter by ToonStudio support"}
          >
            <span className="inline-flex items-center gap-1 px-1 text-xs font-bold text-fg-3">
              <SlidersHorizontal size={13} aria-hidden="true" />
              {locale === "ko" ? "ToonStudio 상태:" : "ToonStudio:"}
            </span>
            <button
              type="button"
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              className={cx(
                "inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                statusFilter === "all"
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg",
              )}
            >
              {locale === "ko" ? "전체" : "All"}
            </button>
            {(["supported", "partial"] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                className={cx(
                  "inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  statusFilter === status
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                {pick(DRAWING_SUPPORT_STATUS_META[status].label, locale)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div>
            <p className="text-xs font-bold text-fg-3">
              {locale === "ko" ? "비교 조합 프리셋" : "Tool comparison presets"}
            </p>
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              role="group"
              aria-label={locale === "ko" ? "비교 조합 프리셋" : "Tool comparison presets"}
            >
              {DRAWING_TOOL_PRESETS.map((preset) => {
                const selected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    data-testid={`drawing-preset-${preset.id}`}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={cx(
                      "inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {pick(preset.label, locale)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-fg-3">
              {locale === "ko"
                ? "경쟁 툴 선택/해제 (ToonStudio 기준 고정 · 최소 1종 유지)"
                : "Toggle competitors (ToonStudio pinned · minimum 1 kept)"}
            </p>
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              role="group"
              aria-label={locale === "ko" ? "비교할 경쟁 툴 선택" : "Toggle compared drawing tools"}
            >
              {COMPETITOR_PROFILES.map((profile) => {
                const selected = selectedCompetitors.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={selected}
                    data-testid={`drawing-tool-chip-${profile.id}`}
                    onClick={() => handleToggleCompetitor(profile.id)}
                    className={cx(
                      "inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "border-line-strong bg-raised text-fg"
                        : "border-line/70 bg-card/50 text-fg-3 hover:text-fg-2",
                    )}
                  >
                    {profile.shortName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 현재 필터 상태 요약 + 전체 근거 펼치기/접기 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-keep text-base font-black text-fg sm:text-lg">
            {activeCategoryMeta
              ? `${activeCategoryMeta.number}. ${pick(activeCategoryMeta.title, locale)}`
              : (locale === "ko" ? "전체 7개 드로잉 기술 영역" : "All 7 drawing engineering domains")}
          </h3>
          <p className="mt-0.5 break-keep text-xs leading-5 text-fg-2 sm:text-sm">
            {activeCategoryMeta
              ? pick(activeCategoryMeta.summary, locale)
              : (locale === "ko"
                  ? "각 항목의 ‘기술 근거 · 구현 차이’ 버튼을 누르면 실제 저장소 경로와 경쟁 툴 간 아키텍처 차이를 바로 확인할 수 있습니다."
                  : "Expand 'Technical rationale & diff' on any row to inspect repository paths and architectural differences.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="drawing-visible-count"
            className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold tabular-nums text-fg-2"
          >
            {locale === "ko"
              ? `표시 중: ${filteredCriteria.length}개 항목 · ToonStudio + ${selectedCompetitors.length}종`
              : `Showing ${filteredCriteria.length} items · ToonStudio + ${selectedCompetitors.length} tools`}
          </span>
          {filteredCriteria.length > 0 ? (
            <button
              type="button"
              onClick={() => handleExpandVisible(!allVisibleExpanded)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {allVisibleExpanded
                ? (locale === "ko" ? "근거 모두 접기" : "Collapse all")
                : (locale === "ko" ? "표시 항목 근거 펼치기" : "Expand all rationale")}
            </button>
          ) : null}
        </div>
      </div>

      {/* 검색 결과 없음 */}
      {filteredCriteria.length === 0 ? (
        <div
          data-testid="drawing-empty-state"
          className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-card/60 px-6 py-10 text-center"
        >
          <p className="break-keep text-sm font-bold text-fg">
            {locale === "ko"
              ? "조건에 맞는 비교 항목이 없습니다."
              : "No comparison criteria match your current filter."}
          </p>
          <p className="break-keep text-xs text-fg-3">
            {locale === "ko"
              ? "검색어를 줄이거나 전체 영역으로 되돌려 37개 항목을 다시 탐색해 보세요."
              : "Try shortening your query or reset filters to browse all 37 items."}
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {locale === "ko" ? "필터 초기화" : "Reset filters"}
          </button>
        </div>
      ) : (
        <>
          {/* 데스크톱 가로 스크롤 비교 테이블 */}
          <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-line/70 lg:block [scrollbar-width:thin]">
            <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-card/90">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 w-[19rem] border-r border-line/60 bg-card px-4 py-3.5 align-bottom text-xs font-black text-fg-2"
                  >
                    {locale === "ko" ? "비교 항목 · 기술 근거" : "Feature & technical basis"}
                  </th>
                  {visibleProfiles.map((profile) => (
                    <th
                      key={profile.id}
                      scope="col"
                      className={cx(
                        "min-w-[10.5rem] px-3.5 py-3.5 align-bottom",
                        profile.id === "toonstudio" ? "bg-accent-soft/55 text-accent" : "text-fg",
                      )}
                    >
                      <div className="text-sm font-black">{profile.name}</div>
                      <div className="mt-0.5 break-keep text-[11px] font-medium text-fg-3">
                        {pick(profile.platforms, locale)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filteredCriteria.map((criterion) => {
                  const expanded = expandedIds.has(criterion.id);
                  const categoryShort = categoryLabelMap.get(criterion.categoryId);
                  return (
                    <tr
                      key={criterion.id}
                      data-testid={`drawing-row-${criterion.id}`}
                      className="align-top"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-r border-line/60 bg-panel px-4 py-4 font-normal"
                      >
                        {activeCategory === "all" && categoryShort ? (
                          <span className="inline-block rounded-full border border-line bg-card px-2 py-0.5 text-[10px] font-bold text-fg-3">
                            {pick(categoryShort, locale)}
                          </span>
                        ) : null}
                        <div className="mt-1 break-keep text-sm font-black text-fg">
                          {pick(criterion.title, locale)}
                        </div>
                        <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
                          {pick(criterion.summary, locale)}
                        </p>
                        <TechnicalDetailDisclosure
                          criterion={criterion}
                          locale={locale}
                          expanded={expanded}
                          onToggle={() => handleToggleDetail(criterion.id)}
                        />
                      </th>
                      {visibleProfiles.map((profile) => {
                        const cellData = criterion.cells[profile.id];
                        return (
                          <td
                            key={profile.id}
                            className={cx(
                              "px-3.5 py-4",
                              profile.id === "toonstudio" ? "bg-accent-soft/25" : "bg-card/40",
                            )}
                          >
                            <DrawingSupportBadge status={cellData.status} locale={locale} />
                            <div className="mt-2 break-keep text-xs font-bold text-fg">
                              {pick(cellData.label, locale)}
                            </div>
                            <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
                              {pick(cellData.detail, locale)}
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

          {/* 모바일·태블릿 카드 뷰 */}
          <div className="mt-5 space-y-4 lg:hidden">
            {filteredCriteria.map((criterion) => {
              const expanded = expandedIds.has(criterion.id);
              const categoryShort = categoryLabelMap.get(criterion.categoryId);
              return (
                <article
                  key={criterion.id}
                  data-testid={`drawing-card-${criterion.id}`}
                  className="rounded-2xl border border-line/70 bg-card/85 p-4"
                >
                  {activeCategory === "all" && categoryShort ? (
                    <span className="inline-block rounded-full border border-line bg-panel px-2.5 py-0.5 text-[11px] font-bold text-fg-3">
                      {pick(categoryShort, locale)}
                    </span>
                  ) : null}
                  <h4 className="mt-1.5 break-keep text-base font-black text-fg">
                    {pick(criterion.title, locale)}
                  </h4>
                  <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
                    {pick(criterion.summary, locale)}
                  </p>
                  <dl className="mt-3 divide-y divide-line/60">
                    {visibleProfiles.map((profile) => {
                      const cellData = criterion.cells[profile.id];
                      return (
                        <div
                          key={profile.id}
                          className={cx(
                            "py-2.5",
                            profile.id === "toonstudio" && "rounded-xl bg-accent-soft/35 px-3",
                          )}
                        >
                          <dt className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black text-fg sm:text-sm">{profile.name}</span>
                            <DrawingSupportBadge status={cellData.status} locale={locale} />
                          </dt>
                          <dd className="mt-1 break-keep text-xs leading-5 text-fg-2">
                            <strong className="font-bold text-fg">{pick(cellData.label, locale)}</strong>
                            {" — "}
                            {pick(cellData.detail, locale)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                  <TechnicalDetailDisclosure
                    criterion={criterion}
                    locale={locale}
                    expanded={expanded}
                    onToggle={() => handleToggleDetail(criterion.id)}
                  />
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
