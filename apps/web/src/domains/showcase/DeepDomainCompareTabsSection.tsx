/**
 * `/compare/studio` 5대 심층 도표 비교 탭 섹션 (Magma Studio 포함 8종 × 42개 기능 항목).
 *
 * - 5대 도메인 탭(`brushes` · `filters` · `drawing` · `collab` · `studio3d`) + URL 쿼리(`?compareTab=`) 동기화
 * - 상단 요약 바(현재 구현 · 타사 강점 · 확장/목표 · 표시 도구 열 `tabular-nums`)
 * - 검색 · 4종 필터(`전체 보기` / `ToonStudio 강점` / `타사 강점 정직 비교` / `확장 중`)
 * - 경쟁사 열 토글(2~8종 자유 비교 + 3종 빠른 프리셋)
 * - 탈-바이올렛 OKLCH 시맨틱 토큰 전용 (원시 hex/rgb/hsl 0건, `<Sparkles>` 0건, `transition-all` 0건)
 */

import {
  Box, Brush, Columns3, FileCode2, PenTool, RotateCcw,
  Search, ShieldCheck, SlidersHorizontal, Table2, Users, X,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { useInRouterContext, useSearchParams } from "react-router-dom";

import type { BenchmarkStatus, BilingualText } from "./competitor-benchmark-data";
import {
  DEEP_COMPARE_COLUMN_PRESETS, DEEP_COMPARE_COMPETITOR_IDS, DEEP_COMPARE_DOMAINS,
  DEEP_COMPARE_STATUS_META, DEEP_COMPARE_TOOLS,
  computeDomainSummary, filterDeepCompareRows, getDeepCompareDomain, getDeepCompareTool,
  isDeepCompareDomainId, parseDeepCompareDomainId,
  type DeepCompareCompetitorId, type DeepCompareDomainId,
  type DeepCompareFilterMode, type DeepCompareToolId,
} from "./deep-domain-compare-data";
import { startSafeViewTransition } from "./nextgen-web-platform-enhancer";

import { cn } from "@/shared/lib/utils";

export interface DeepDomainCompareTabsSectionProps {
  readonly locale?: "ko" | "en";
  readonly initialDomainId?: DeepCompareDomainId;
  readonly className?: string;
}

interface InspectedDeepCell {
  readonly domainId: DeepCompareDomainId;
  readonly rowId: string;
  readonly toolId: DeepCompareToolId;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cool focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const LEGEND_STATUSES: readonly BenchmarkStatus[] = ["current", "native-strength", "partial", "target", "limited", "none"];
const ALL_TOOL_IDS: readonly DeepCompareToolId[] = DEEP_COMPARE_TOOLS.map((tool) => tool.id);

const COPY = {
  ko: {
    eyebrow: "5-DOMAIN DEEP MATRIX · 8 TOOLS INCLUDING MAGMA STUDIO",
    heading: "브러시 · 필터 · 드로잉 · 협업 · 3D 셰이퍼 5대 심층 도표 비교 (8종)",
    subtitle:
      "ToonStudio와 Magma Studio·CSP·Procreate·Photoshop·Rebelle 7·Blender·ibisPaint 8종을 5개 전문 탭(총 42개 실무 항목)으로 나란히 비교합니다. 경쟁사의 검증된 강점(★)도 숨기지 않고 표기합니다.",
    tablistAria: "5대 심층 비교 도메인 탭",
    summaryCurrent: "ToonStudio 현재 구현",
    summaryRival: "타사 강점 정직 표기",
    summaryExpanding: "확장·고도화 / 목표",
    summaryVisibleCols: "표시 중인 도구 열",
    summaryRowsSuffix: "항목",
    summaryCellsSuffix: "개 강점 셀",
    summaryGoalPrefix: "목표",
    takeawayLabel: "이 영역 솔직 요약",
    searchLabel: "기능 항목 또는 도구 설명 검색",
    searchPlaceholder: "기능명·브러시·필터·저장소 경로 검색 (예: 크레용, C2PA, BVH, Magma)",
    searchClearAria: "검색어 지우기",
    filterAria: "비교 항목 상태 필터",
    filterAll: "전체 보기",
    filterToonstudio: "ToonStudio 강점",
    filterRival: "타사 강점 정직 비교",
    filterExpanding: "확장 중",
    columnsLabel: "비교 열 선택 (2~8종 자유 비교)",
    columnsPresetsAria: "비교 도구 프리셋",
    columnsToggleAria: "경쟁사 열 표시 전환",
    pinnedBadge: "기준 고정",
    minColumnsHint: "최소 2종(ToonStudio + 경쟁사 1종 이상)을 유지합니다.",
    featureColumnHeader: "세부 비교 항목",
    emptyTitle: "조건에 맞는 비교 항목이 없습니다.",
    emptyBody: "검색어를 줄이거나 필터를 초기화하면 전체 항목을 다시 볼 수 있습니다.",
    resetFilters: "검색 · 필터 초기화",
    inspectorPrefix: "선택 셀 상세 근거",
    inspectorSpecLabel: "ToonStudio 구현 기준",
    inspectorEvidenceLabel: "저장소 실측 경로",
    tableCaptionPrefix: "5대 심층 도표 비교",
  },
  en: {
    eyebrow: "5-DOMAIN DEEP MATRIX · 8 TOOLS INCLUDING MAGMA STUDIO",
    heading: "5-Domain Deep Comparison Tables — Brushes, Filters, Drawing, Collab & 3D (8 Tools)",
    subtitle:
      "Compare ToonStudio side by side with Magma Studio, CSP, Procreate, Photoshop, Rebelle 7, Blender and ibisPaint across 5 specialist tabs (42 production criteria), crediting every competitor's strengths (★) transparently.",
    tablistAria: "Five deep comparison domain tabs",
    summaryCurrent: "ToonStudio Current",
    summaryRival: "Candid Rival Strengths",
    summaryExpanding: "Expanding / Target",
    summaryVisibleCols: "Visible Tool Columns",
    summaryRowsSuffix: "items",
    summaryCellsSuffix: "strength cells",
    summaryGoalPrefix: "Target",
    takeawayLabel: "Candid domain takeaway",
    searchLabel: "Search criteria or tool details",
    searchPlaceholder: "Search features, brushes, filters or repo paths (e.g. Crayon, C2PA, BVH, Magma)",
    searchClearAria: "Clear search query",
    filterAria: "Filter comparison rows by status",
    filterAll: "All Items",
    filterToonstudio: "ToonStudio Strengths",
    filterRival: "Candid Rival Strengths",
    filterExpanding: "Expanding",
    columnsLabel: "Compare Columns (2-8 Tools)",
    columnsPresetsAria: "Column comparison presets",
    columnsToggleAria: "Toggle competitor columns",
    pinnedBadge: "Pinned",
    minColumnsHint: "Keeps at least 2 tools visible (ToonStudio + 1 or more rivals).",
    featureColumnHeader: "Detailed Capability",
    emptyTitle: "No matching comparison items.",
    emptyBody: "Broaden your search query or reset the status filter to inspect all items.",
    resetFilters: "Reset Search & Filter",
    inspectorPrefix: "Selected Cell Evidence",
    inspectorSpecLabel: "ToonStudio Specification",
    inspectorEvidenceLabel: "Repository Path",
    tableCaptionPrefix: "Deep domain comparison table",
  },
} as const;

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

function renderDomainIcon(domainId: DeepCompareDomainId): ReactElement {
  if (domainId === "brushes") return <Brush size={15} aria-hidden="true" />;
  if (domainId === "filters") return <SlidersHorizontal size={15} aria-hidden="true" />;
  if (domainId === "drawing") return <PenTool size={15} aria-hidden="true" />;
  if (domainId === "collab") return <Users size={15} aria-hidden="true" />;
  return <Box size={15} aria-hidden="true" />;
}

function readWindowQueryDomain(fallback: DeepCompareDomainId): DeepCompareDomainId {
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("compareTab") ?? params.get("domain");
  return isDeepCompareDomainId(raw) ? raw : fallback;
}

interface ContentProps {
  readonly locale: "ko" | "en";
  readonly activeDomainId: DeepCompareDomainId;
  readonly onSelectDomain: (nextId: DeepCompareDomainId) => void;
  readonly className?: string;
}

function DeepDomainCompareContent(props: ContentProps): ReactElement {
  const { locale, activeDomainId, onSelectDomain, className } = props;
  const copy = COPY[locale];

  const [filterMode, setFilterMode] = useState<DeepCompareFilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleToolIds, setVisibleToolIds] = useState<readonly DeepCompareToolId[]>(ALL_TOOL_IDS);
  const [inspectedCell, setInspectedCell] = useState<InspectedDeepCell | null>(null);
  const tabRefs = useRef<Partial<Record<DeepCompareDomainId, HTMLButtonElement | null>>>({});

  const activeDomain = getDeepCompareDomain(activeDomainId);
  const visibleTools = DEEP_COMPARE_TOOLS.filter((tool) => visibleToolIds.includes(tool.id));
  const visibleRivalCount = visibleToolIds.filter((id) => id !== "toonstudio").length;
  const summary = computeDomainSummary(activeDomain.rows, visibleToolIds);
  const filteredRows = filterDeepCompareRows(activeDomain.rows, filterMode, searchQuery, locale, visibleToolIds);

  const fallbackRow = filteredRows[0] ?? activeDomain.rows[0];
  const resolvedRow =
    (inspectedCell && inspectedCell.domainId === activeDomain.id
      ? filteredRows.find((item) => item.id === inspectedCell.rowId) ??
        activeDomain.rows.find((item) => item.id === inspectedCell.rowId)
      : undefined) ?? fallbackRow;
  const resolvedToolId: DeepCompareToolId =
    inspectedCell && inspectedCell.domainId === activeDomain.id && visibleToolIds.includes(inspectedCell.toolId)
      ? inspectedCell.toolId
      : "toonstudio";
  const resolvedTool = getDeepCompareTool(resolvedToolId);
  const resolvedCell = resolvedRow ? resolvedRow.cells[resolvedTool.id] : null;
  const resolvedStatusMeta = resolvedCell ? DEEP_COMPARE_STATUS_META[resolvedCell.status] : null;

  const filterCounts: Readonly<Record<DeepCompareFilterMode, number>> = {
    all: activeDomain.rows.length,
    "toonstudio-lead": summary.currentCount,
    "rival-strength": summary.competitorStrengthRowCount,
    expanding: summary.expandingCount,
  };

  const handleToggleCompetitor = (competitorId: DeepCompareCompetitorId) => {
    setVisibleToolIds((prev) => {
      if (prev.includes(competitorId)) {
        const nextRivals = prev.filter((id) => id !== "toonstudio" && id !== competitorId);
        return nextRivals.length === 0 ? prev : ["toonstudio", ...nextRivals];
      }
      return DEEP_COMPARE_TOOLS.map((tool) => tool.id).filter(
        (id) => id === "toonstudio" || id === competitorId || prev.includes(id),
      );
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const count = DEEP_COMPARE_DOMAINS.length;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % count;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + count) % count;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = count - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const targetDomain = DEEP_COMPARE_DOMAINS[nextIndex];
    if (!targetDomain) return;
    onSelectDomain(targetDomain.id);
    tabRefs.current[targetDomain.id]?.focus();
  };

  const filterOptions: readonly { readonly id: DeepCompareFilterMode; readonly label: string }[] = [
    { id: "all", label: copy.filterAll },
    { id: "toonstudio-lead", label: copy.filterToonstudio },
    { id: "rival-strength", label: copy.filterRival },
    { id: "expanding", label: copy.filterExpanding },
  ];

  return (
    <section
      data-testid="deep-domain-compare-section"
      aria-labelledby="deep-domain-compare-heading"
      className={cn(
        "ts-showcase-reveal rounded-3xl border border-line bg-panel p-5 [word-break:keep-all] tabular-nums sm:p-6",
        className,
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          <Table2 size={14} aria-hidden="true" />
          <span>{copy.eyebrow}</span>
        </div>
        <h2 id="deep-domain-compare-heading" className="text-xl font-bold text-fg sm:text-2xl">
          {copy.heading}
        </h2>
        <p className="max-w-4xl text-sm leading-6 text-fg-2">{copy.subtitle}</p>
      </div>

      {/* 5대 도메인 탭바 */}
      <div role="tablist" aria-label={copy.tablistAria} className="mt-5 flex flex-wrap gap-2 border-b border-line pb-4">
        {DEEP_COMPARE_DOMAINS.map((domain, index) => {
          const isSelected = domain.id === activeDomain.id;
          return (
            <button
              key={domain.id}
              ref={(node) => { tabRefs.current[domain.id] = node; }}
              id={`deep-compare-tab-${domain.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`deep-compare-panel-${domain.id}`}
              tabIndex={isSelected ? 0 : -1}
              data-testid={`deep-compare-tab-${domain.id}`}
              onClick={() => onSelectDomain(domain.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm",
                FOCUS_RING,
                isSelected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {renderDomainIcon(domain.id)}
              <span>{pick(domain.shortLabel, locale)}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-display text-[11px] leading-none tabular-nums",
                  isSelected ? "bg-on-accent/20 text-on-accent" : "bg-raised text-fg-3",
                )}
              >
                {domain.rows.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* 활성 도메인 탭 패널 */}
      <div
        id={`deep-compare-panel-${activeDomain.id}`}
        role="tabpanel"
        aria-labelledby={`deep-compare-tab-${activeDomain.id}`}
        data-testid={`deep-compare-panel-${activeDomain.id}`}
        className="ts-showcase-stage mt-5 space-y-5"
      >
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-bold text-fg">{pick(activeDomain.title, locale)}</h3>
            <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm">{pick(activeDomain.subtitle, locale)}</p>
          </div>

          {/* 상단 요약 바 */}
          <dl data-testid="deep-compare-summary-bar" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div data-testid="deep-compare-summary-current" className="rounded-2xl border border-line bg-card px-4 py-3">
              <dt className="text-[11px] font-semibold text-fg-3">{copy.summaryCurrent}</dt>
              <dd className="mt-1 font-display text-xl font-bold tabular-nums text-good">
                {summary.currentCount}
                <span className="ml-1 text-xs font-semibold text-fg-3">/ {summary.totalRows} {copy.summaryRowsSuffix}</span>
              </dd>
            </div>
            <div data-testid="deep-compare-summary-rival" className="rounded-2xl border border-line bg-card px-4 py-3">
              <dt className="text-[11px] font-semibold text-fg-3">{copy.summaryRival}</dt>
              <dd className="mt-1 font-display text-xl font-bold tabular-nums text-cool">
                {summary.competitorStrengthRowCount}
                <span className="ml-1 text-xs font-semibold text-fg-3">
                  {copy.summaryRowsSuffix} ({summary.competitorStrengthCellCount} {copy.summaryCellsSuffix})
                </span>
              </dd>
            </div>
            <div data-testid="deep-compare-summary-expanding" className="rounded-2xl border border-line bg-card px-4 py-3">
              <dt className="text-[11px] font-semibold text-fg-3">{copy.summaryExpanding}</dt>
              <dd className="mt-1 font-display text-xl font-bold tabular-nums text-warn">
                {summary.expandingCount}
                <span className="ml-1 text-xs font-semibold text-fg-3">
                  {copy.summaryRowsSuffix}
                  {summary.targetCount > 0 ? ` (${copy.summaryGoalPrefix} ${summary.targetCount})` : ""}
                </span>
              </dd>
            </div>
            <div data-testid="deep-compare-summary-tools" className="rounded-2xl border border-line bg-card px-4 py-3">
              <dt className="text-[11px] font-semibold text-fg-3">{copy.summaryVisibleCols}</dt>
              <dd className="mt-1 font-display text-xl font-bold tabular-nums text-fg">
                {visibleTools.length}
                <span className="ml-1 text-xs font-semibold text-fg-3">/ {DEEP_COMPARE_TOOLS.length}</span>
              </dd>
            </div>
          </dl>

          <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-card/80 px-4 py-3 text-xs leading-5 text-fg-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
            <p>
              <strong className="font-semibold text-fg">{copy.takeawayLabel}: </strong>
              {pick(activeDomain.candidTakeaway, locale)}
            </p>
          </div>
        </div>

        {/* 검색 & 4종 상태 필터 */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center">
          <div className="relative">
            <label htmlFor="deep-compare-search" className="sr-only">{copy.searchLabel}</label>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" />
            <input
              id="deep-compare-search"
              type="search"
              data-testid="deep-compare-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className={cn(
                "min-h-11 w-full rounded-xl border border-line bg-card pr-11 pl-10 text-xs text-fg placeholder:text-fg-3 sm:text-sm",
                FOCUS_RING,
              )}
            />
            {searchQuery.length > 0 ? (
              <button
                type="button"
                data-testid="deep-compare-search-clear"
                aria-label={copy.searchClearAria}
                onClick={() => setSearchQuery("")}
                className={cn(
                  "absolute top-1/2 right-1 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-fg-3 transition-colors hover:text-fg",
                  FOCUS_RING,
                )}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.filterAria}>
            {filterOptions.map((option) => {
              const isSelected = filterMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`deep-compare-filter-${option.id}`}
                  aria-pressed={isSelected}
                  onClick={() => setFilterMode(option.id)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                    FOCUS_RING,
                    isSelected
                      ? "border-cool bg-raised text-cool"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {option.label} <span className="font-display tabular-nums">({filterCounts[option.id]})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 경쟁사 열 토글 (2~8종 자유 비교 + 프리셋) */}
        <div data-testid="deep-compare-column-controls" className="space-y-2.5 rounded-2xl border border-line bg-card/75 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-fg">
              <Columns3 size={14} className="text-cool" aria-hidden="true" />
              <span>{copy.columnsLabel}</span>
              <span className="font-normal text-fg-3">· {copy.minColumnsHint}</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy.columnsPresetsAria}>
              {DEEP_COMPARE_COLUMN_PRESETS.map((preset) => {
                const isActive =
                  preset.tools.length === visibleToolIds.length &&
                  preset.tools.every((id) => visibleToolIds.includes(id));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`deep-compare-preset-${preset.id}`}
                    aria-pressed={isActive}
                    onClick={() => setVisibleToolIds(preset.tools)}
                    className={cn(
                      "min-h-11 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                      FOCUS_RING,
                      isActive
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {pick(preset.label, locale)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={copy.columnsToggleAria}>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-good/50 bg-raised px-3 text-xs font-bold text-good">
              <span>ToonStudio</span>
              <span className="text-[10px] font-semibold text-fg-3">({copy.pinnedBadge})</span>
            </span>
            {DEEP_COMPARE_COMPETITOR_IDS.map((compId) => {
              const tool = getDeepCompareTool(compId);
              const isVisible = visibleToolIds.includes(compId);
              const isLockedLast = isVisible && visibleRivalCount <= 1;
              return (
                <button
                  key={compId}
                  type="button"
                  data-testid={`deep-compare-col-toggle-${compId}`}
                  aria-pressed={isVisible}
                  aria-disabled={isLockedLast}
                  onClick={() => handleToggleCompetitor(compId)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors",
                    FOCUS_RING,
                    isVisible
                      ? "border-cool/60 bg-raised text-fg"
                      : "border-line bg-panel text-fg-3 hover:border-line-strong hover:text-fg-2",
                    isLockedLast && "cursor-not-allowed opacity-75",
                  )}
                >
                  {isVisible ? "✓ " : "+ "}
                  {tool.shortName}
                </button>
              );
            })}
          </div>
        </div>

        {/* 시맨틱 상태 범례 */}
        <ul data-testid="deep-compare-legend" className="flex flex-wrap items-center gap-2">
          {LEGEND_STATUSES.map((status) => {
            const meta = DEEP_COMPARE_STATUS_META[status];
            return (
              <li
                key={status}
                className={cn("ts-hm-cell inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", meta.cellClass)}
              >
                <span aria-hidden="true">{meta.symbol}</span>
                <span>{pick(meta.label, locale)}</span>
              </li>
            );
          })}
        </ul>

        {/* 8종 심층 도표 테이블 */}
        {filteredRows.length === 0 ? (
          <div
            data-testid="deep-compare-empty"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong bg-card px-6 py-10 text-center"
          >
            <p className="text-sm font-bold text-fg">{copy.emptyTitle}</p>
            <p className="max-w-md text-xs text-fg-2">{copy.emptyBody}</p>
            <button
              type="button"
              data-testid="deep-compare-reset-filters"
              onClick={() => { setFilterMode("all"); setSearchQuery(""); }}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-raised px-4 py-2 text-xs font-bold text-fg transition-colors hover:border-accent hover:text-accent",
                FOCUS_RING,
              )}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {copy.resetFilters}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-card">
            <table data-testid="deep-compare-table" className="w-full border-collapse text-left text-xs">
              <caption className="sr-only">
                {copy.tableCaptionPrefix}: {pick(activeDomain.title, locale)}
              </caption>
              <thead>
                <tr className="border-b border-line bg-panel">
                  <th scope="col" className="sticky left-0 z-10 min-w-[12.5rem] bg-panel px-3.5 py-3 font-bold text-fg">
                    {copy.featureColumnHeader} ({filteredRows.length})
                  </th>
                  {visibleTools.map((tool) => (
                    <th
                      key={tool.id}
                      scope="col"
                      data-testid={`deep-compare-th-${tool.id}`}
                      className={cn(
                        "min-w-[8.75rem] px-2.5 py-3 text-left align-top font-bold",
                        tool.id === "toonstudio"
                          ? "bg-accent-soft/45 text-good"
                          : tool.id === "magma"
                            ? "text-cool"
                            : "text-fg",
                      )}
                    >
                      <div className="text-xs font-bold">{tool.shortName}</div>
                      <div className="mt-0.5 text-[10px] font-medium text-fg-3">{pick(tool.billingHint, locale)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((item, rowIndex) => (
                  <tr key={item.id} data-testid={`deep-compare-row-${item.id}`} className="border-b border-line/60 last:border-b-0">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-3.5 py-2.5 align-top font-semibold text-fg">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[11px] font-bold text-fg-3 tabular-nums">
                          {String(rowIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="leading-5">{pick(item.title, locale)}</span>
                      </div>
                    </th>
                    {visibleTools.map((tool) => {
                      const cellData = item.cells[tool.id];
                      const statusMeta = DEEP_COMPARE_STATUS_META[cellData.status];
                      const isSelectedCell = resolvedRow?.id === item.id && resolvedTool.id === tool.id;
                      return (
                        <td key={`${item.id}-${tool.id}`} className={cn("p-1.5 align-top", tool.id === "toonstudio" && "bg-accent-soft/20")}>
                          <button
                            type="button"
                            data-testid={`deep-compare-cell-${item.id}-${tool.id}`}
                            data-status={cellData.status}
                            aria-pressed={isSelectedCell}
                            onClick={() => setInspectedCell({ domainId: activeDomain.id, rowId: item.id, toolId: tool.id })}
                            className={cn(
                              "ts-hm-cell flex min-h-11 w-full flex-col items-start gap-1 rounded-xl p-2 text-left transition-colors",
                              FOCUS_RING,
                              statusMeta.cellClass,
                              isSelectedCell && "ts-hm-col-active",
                            )}
                          >
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold leading-none whitespace-nowrap">
                              <span aria-hidden="true">{statusMeta.symbol}</span>
                              <span>{pick(statusMeta.shortLabel, locale)}</span>
                            </span>
                            <span className="text-[11px] font-medium leading-4 text-fg-2">{pick(cellData.summary, locale)}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 선택 셀 상세 근거 바 */}
        {resolvedRow && resolvedCell && resolvedStatusMeta ? (
          <div data-testid="deep-compare-inspector" className="grid gap-3 rounded-2xl border border-line bg-card p-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-fg-3">{copy.inspectorPrefix}</span>
                <strong className="text-sm text-fg">{resolvedTool.name} · {pick(resolvedRow.title, locale)}</strong>
                <span className={cn("ts-status-pill shrink-0 whitespace-nowrap", resolvedStatusMeta.pillClass)}>
                  <span aria-hidden="true">{resolvedStatusMeta.symbol}</span>
                  {pick(resolvedStatusMeta.label, locale)}
                </span>
              </div>
              <p className="text-xs leading-5 text-fg-2">{pick(resolvedCell.summary, locale)}</p>
            </div>
            <div className="space-y-1.5 border-t border-line/60 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
              <p className="text-xs leading-5 text-fg-2">
                <strong className="font-semibold text-fg">{copy.inspectorSpecLabel}: </strong>
                {pick(resolvedRow.toonstudioSpec, locale)}
              </p>
              <p className="flex items-center gap-1.5 font-mono text-[11px] text-cool">
                <FileCode2 size={13} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{copy.inspectorEvidenceLabel}: {resolvedRow.evidencePath}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DeepDomainCompareRouterHost(props: DeepDomainCompareTabsSectionProps): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const locale: "ko" | "en" = props.locale === "en" ? "en" : "ko";
  const queryTab = searchParams.get("compareTab") ?? searchParams.get("domain");
  const activeDomainId = isDeepCompareDomainId(queryTab)
    ? queryTab
    : parseDeepCompareDomainId(props.initialDomainId);

  const handleSelectDomain = (nextId: DeepCompareDomainId) => {
    startSafeViewTransition(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("compareTab", nextId);
          next.delete("domain");
          return next;
        },
        { replace: true },
      );
    });
  };

  return <DeepDomainCompareContent locale={locale} activeDomainId={activeDomainId} onSelectDomain={handleSelectDomain} className={props.className} />;
}

function DeepDomainCompareStandaloneHost(props: DeepDomainCompareTabsSectionProps): ReactElement {
  const locale: "ko" | "en" = props.locale === "en" ? "en" : "ko";
  const [activeDomainId, setActiveDomainId] = useState<DeepCompareDomainId>(() =>
    readWindowQueryDomain(parseDeepCompareDomainId(props.initialDomainId)),
  );

  const handleSelectDomain = (nextId: DeepCompareDomainId) => {
    startSafeViewTransition(() => {
      setActiveDomainId(nextId);
      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("compareTab", nextId);
          url.searchParams.delete("domain");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        } catch {
          // 제한된 히스토리 환경에서는 상태 전환만 유지한다.
        }
      }
    });
  };

  return <DeepDomainCompareContent locale={locale} activeDomainId={activeDomainId} onSelectDomain={handleSelectDomain} className={props.className} />;
}

export function DeepDomainCompareTabsSection(props: DeepDomainCompareTabsSectionProps): ReactElement {
  return useInRouterContext() ? (
    <DeepDomainCompareRouterHost locale={props.locale} initialDomainId={props.initialDomainId} className={props.className} />
  ) : (
    <DeepDomainCompareStandaloneHost locale={props.locale} initialDomainId={props.initialDomainId} className={props.className} />
  );
}
