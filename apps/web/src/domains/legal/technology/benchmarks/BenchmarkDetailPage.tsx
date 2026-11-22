import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Filter,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AboutSectionNav } from "../../AboutSectionNav";
import { BENCHMARK_3D_STUDIO_DATASET } from "./benchmark-3d-studio-data";
import { BENCHMARK_AI_ASSIST_DATASET } from "./benchmark-ai-assist-data";
import { BENCHMARK_BRUSHES_DATASET } from "./benchmark-brushes-data";
import { BENCHMARK_COLLAB_OFFICE_DATASET } from "./benchmark-collab-office-data";
import { BENCHMARK_FILTERS_DATASET } from "./benchmark-filters-data";
import { BENCHMARK_CATEGORY_ICONS } from "./benchmark-datasets";
import {
  BenchmarkCategoryNavBar,
  BenchmarkCellView,
  BenchmarkFooterSections,
  BenchmarkRowEvidenceDetails,
} from "./BenchmarkDetailPrimitives";
import {
  BENCHMARK_HUB_PATH,
  BENCHMARK_SUPPORT_META,
  filterBenchmarkRows,
  pickBenchmarkText,
  summarizeToolSupport,
  type BenchmarkDataset,
  type BenchmarkLocale,
  type BenchmarkToolProfile,
} from "./benchmark-types";

import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";
import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useMetaDescription } from "@/shared/seo/use-document-title";

const COPY = {
  ko: {
    suiteNavAria: "세부 벤치마크 5대 영역 전환",
    hubTab: "벤치마크 허브",
    backToHub: "5대 벤치마크 허브로",
    factItems: "1:1 대조 항목",
    factTools: "비교 대상 도구",
    factFull: "ToonStudio 완전 지원",
    factCost: "브라우저 로컬 비용",
    toolbarHeading: "세부 항목 필터 및 비교 도구 선택",
    subGroupAll: "전체 영역",
    searchLabel: "항목·도구·근거 경로 검색",
    searchPlaceholder: "예: 수채화, PatchMatch, Yjs, Shapr3D, Rights BOM...",
    levelAll: "전체 항목",
    levelFull: "완전 지원만",
    levelWatch: "부분·고도화 중 확인",
    toolsLabel: "비교할 경쟁 도구 선택 (ToonStudio 고정)",
    selectAllTools: "전체 도구 선택",
    selectTopTools: "핵심 3개만 보기",
    coverageAria: "도구별 항목 지원 현황",
    coverageHint: "아래 수치는 임의 점수가 아니라 현재 표시된 비교 표의 항목별 지원 상태 단순 집계입니다.",
    resultCountSuffix: "개 항목 표시 중",
    emptyTitle: "조건에 맞는 벤치마크 항목이 없습니다.",
    emptyReset: "필터 초기화",
    colFeature: "세부 항목 · 기준",
    evidenceOpen: "근거·벤치마킹 출처·정직한 한계 보기",
    evidenceClose: "근거·한계 접기",
    originLabel: "벤치마킹 원천 & 내재화",
    evidenceLabel: "코드베이스 실측 근거",
    limitLabel: "정직한 한계 / 경쟁 툴 우위",
    profilesEyebrow: "TOOLS COMPARED",
    profilesTitle: "비교 대상 도구 프로필 · 과금 구조 · 핵심 강점",
    pricingLabel: "과금 구조",
    platformLabel: "실행 환경",
    takeawayLabel: "벤치마킹 포인트",
    strengthLabel: "경쟁 툴 강점",
    tradeoffsEyebrow: "HONEST TRADEOFFS",
    tradeoffsTitle: "경쟁 도구가 앞서는 영역과 정직한 한계",
    tradeoffsSubtitle:
      "ToonStudio가 모든 상황에서 최선이라고 주장하지 않습니다. 각 전문 도구의 성숙도와 생태계 우위를 그대로 밝힙니다.",
    competitorEdgeLabel: "경쟁 툴 우위 영역",
    toonstudioPosLabel: "ToonStudio의 접근",
    nextEyebrow: "CONTINUE EXPLORING",
    nextTitle: "다른 벤치마크 영역 & 종합 비교",
  },
  en: {
    suiteNavAria: "Switch across 5 granular benchmark areas",
    hubTab: "Benchmark hub",
    backToHub: "Back to benchmark hub",
    factItems: "1:1 criteria",
    factTools: "Tools compared",
    factFull: "ToonStudio full support",
    factCost: "Local browser cost",
    toolbarHeading: "Filter criteria and select tools",
    subGroupAll: "All groups",
    searchLabel: "Search criteria, tools or repo paths",
    searchPlaceholder: "e.g. watercolor, PatchMatch, Yjs, Shapr3D, Rights BOM...",
    levelAll: "All items",
    levelFull: "Full support",
    levelWatch: "Partial / in progress",
    toolsLabel: "Toggle competitor columns (ToonStudio pinned)",
    selectAllTools: "Select all",
    selectTopTools: "Focus top 3",
    coverageAria: "Per-tool support breakdown",
    coverageHint: "Counts reflect factual status tallies from the active table below — never arbitrary scores.",
    resultCountSuffix: "items shown",
    emptyTitle: "No benchmark rows match the current filter.",
    emptyReset: "Reset filters",
    colFeature: "Criterion & benchmark",
    evidenceOpen: "Inspect origin, code evidence & honest limit",
    evidenceClose: "Hide evidence & limits",
    originLabel: "Benchmark origin & internalization",
    evidenceLabel: "Verified codebase evidence",
    limitLabel: "Honest limit / competitor edge",
    profilesEyebrow: "TOOLS COMPARED",
    profilesTitle: "Tool profiles, billing models & core strengths",
    pricingLabel: "Pricing",
    platformLabel: "Platform",
    takeawayLabel: "Benchmark takeaway",
    strengthLabel: "Competitor strength",
    tradeoffsEyebrow: "HONEST TRADEOFFS",
    tradeoffsTitle: "Where competitors lead & candid limits",
    tradeoffsSubtitle:
      "ToonStudio does not claim universal superiority. Each specialist tool's maturity and ecosystem edge is listed openly.",
    competitorEdgeLabel: "Competitor advantage",
    toonstudioPosLabel: "ToonStudio position",
    nextEyebrow: "CONTINUE EXPLORING",
    nextTitle: "Other benchmark areas & overview matrices",
  },
} as const;

export function BenchmarkDetailPage({ dataset }: { readonly dataset: BenchmarkDataset }) {
  const lang = useI18n((state) => state.lang);
  const locale: BenchmarkLocale = lang === "en" ? "en" : "ko";
  const copy = COPY[locale];

  const competitors = useMemo(
    () => dataset.tools.filter((tool) => tool.id !== "toonstudio"),
    [dataset.tools],
  );
  const toonstudioProfile = dataset.tools[0];

  const [activeSubGroup, setActiveSubGroup] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<"all" | "full" | "watch">("all");
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<readonly string[]>(() =>
    competitors.map((tool) => tool.id),
  );
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(
    () => new Set(dataset.rows[0] ? [dataset.rows[0].id] : []),
  );

  const visibleTools = useMemo<readonly BenchmarkToolProfile[]>(() => {
    const picked = competitors.filter((tool) => selectedCompetitorIds.includes(tool.id));
    return toonstudioProfile ? [toonstudioProfile, ...picked] : picked;
  }, [competitors, selectedCompetitorIds, toonstudioProfile]);

  const filteredRows = useMemo(
    () => filterBenchmarkRows(dataset.rows, { subGroupId: activeSubGroup, query, levelFilter, locale }),
    [dataset.rows, activeSubGroup, query, levelFilter, locale],
  );

  const toonFullCount = useMemo(
    () => summarizeToolSupport(dataset.rows, "toonstudio").full,
    [dataset.rows],
  );

  useDocumentTitle(`${pickBenchmarkText(dataset.title, locale)} · ToonStudio`);
  useMetaDescription(pickBenchmarkText(dataset.subtitle, locale));

  function toggleCompetitor(toolId: string) {
    setSelectedCompetitorIds((prev) => {
      const exists = prev.includes(toolId);
      if (exists && prev.length <= 1) return prev;
      return exists ? prev.filter((id) => id !== toolId) : [...prev, toolId];
    });
  }

  function toggleRowEvidence(rowId: string) {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function resetFilters() {
    setActiveSubGroup("all");
    setQuery("");
    setLevelFilter("all");
  }

  const CategoryIcon = BENCHMARK_CATEGORY_ICONS[dataset.id];
  const evidenceLabels = {
    origin: copy.originLabel,
    evidence: copy.evidenceLabel,
    limit: copy.limitLabel,
  };

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav variant="compact" />
      <BenchmarkCategoryNavBar
        activeId={dataset.id}
        locale={locale}
        navAria={copy.suiteNavAria}
        hubTabLabel={copy.hubTab}
      />

      <header className="mt-6 rounded-[2rem] border border-line/75 bg-panel/80 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 font-display text-xs font-bold tracking-[0.1em] text-accent uppercase">
            <CategoryIcon size={15} aria-hidden="true" />
            {dataset.eyebrow}
          </p>
          <Link
            href={BENCHMARK_HUB_PATH}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {copy.backToHub}
          </Link>
        </div>

        <h1 className="mt-3 max-w-4xl break-keep text-2xl font-black tracking-tight text-fg sm:text-4xl">
          {pickBenchmarkText(dataset.title, locale)}
        </h1>
        <p className="mt-3 max-w-3xl break-keep text-sm leading-7 text-fg-2 sm:text-base">
          {pickBenchmarkText(dataset.subtitle, locale)}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-3.5">
            <dd className="font-display text-2xl font-black tabular-nums text-fg">{dataset.rows.length}</dd>
            <dt className="mt-0.5 break-keep text-xs font-semibold text-fg-3">{copy.factItems}</dt>
          </div>
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-3.5">
            <dd className="font-display text-2xl font-black tabular-nums text-fg">{dataset.tools.length}</dd>
            <dt className="mt-0.5 break-keep text-xs font-semibold text-fg-3">{copy.factTools}</dt>
          </div>
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-3.5">
            <dd className="font-display text-2xl font-black tabular-nums text-good">
              {toonFullCount}/{dataset.rows.length}
            </dd>
            <dt className="mt-0.5 break-keep text-xs font-semibold text-fg-3">{copy.factFull}</dt>
          </div>
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-3.5">
            <dd className="font-display text-2xl font-black tabular-nums text-accent">₩0</dd>
            <dt className="mt-0.5 break-keep text-xs font-semibold text-fg-3">{copy.factCost}</dt>
          </div>
        </dl>

        <p className="mt-4 break-keep text-xs leading-6 text-fg-3">
          {pickBenchmarkText(dataset.scopeNote, locale)}
        </p>
      </header>

      <section
        aria-label={copy.toolbarHeading}
        className="mt-7 grid gap-4 rounded-3xl border border-line/75 bg-panel/70 p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={copy.subGroupAll}>
          <button
            type="button"
            aria-pressed={activeSubGroup === "all"}
            onClick={() => setActiveSubGroup("all")}
            className={cx(
              "inline-flex min-h-11 min-w-11 items-center rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              activeSubGroup === "all"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
            )}
          >
            {copy.subGroupAll}
          </button>
          {dataset.subGroups.map((group) => {
            const active = activeSubGroup === group.id;
            return (
              <button
                key={group.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveSubGroup(group.id)}
                className={cx(
                  "inline-flex min-h-11 min-w-11 items-center rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                )}
              >
                {pickBenchmarkText(group.label, locale)}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block">
            <span className="sr-only">{copy.searchLabel}</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-4 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", copy.levelAll],
                ["full", copy.levelFull],
                ["watch", copy.levelWatch],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={levelFilter === value}
                onClick={() => setLevelFilter(value)}
                className={cx(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  levelFilter === value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/45",
                )}
              >
                <Filter size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-line/60 pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-fg-3">{copy.toolsLabel}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCompetitorIds(competitors.map((tool) => tool.id))}
                className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {copy.selectAllTools}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCompetitorIds(competitors.slice(0, 3).map((tool) => tool.id))}
                className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {copy.selectTopTools}
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={copy.toolsLabel}>
            {competitors.map((tool) => {
              const selected = selectedCompetitorIds.includes(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-pressed={selected}
                  data-testid={`benchmark-tool-toggle-${tool.id}`}
                  onClick={() => toggleCompetitor(tool.id)}
                  className={cx(
                    "inline-flex min-h-11 min-w-11 items-center rounded-full border px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    selected
                      ? "border-accent/55 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-3 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {tool.shortName}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-label={copy.coverageAria} className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold tabular-nums text-fg-2">
            {filteredRows.length} {copy.resultCountSuffix}
          </p>
          <p className="break-keep text-xs text-fg-3">{copy.coverageHint}</p>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {visibleTools.map((tool) => {
            const summary = summarizeToolSupport(filteredRows, tool.id);
            return (
              <li
                key={tool.id}
                className={cx(
                  "rounded-2xl border px-3.5 py-2.5",
                  tool.id === "toonstudio" ? "border-accent/55 bg-panel" : "border-line/70 bg-card/75",
                )}
              >
                <p className="truncate text-xs font-black text-fg">{tool.shortName}</p>
                <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] font-semibold tabular-nums text-fg-3">
                  <span className="text-good">{BENCHMARK_SUPPORT_META.full.shortLabel[locale]} {summary.full}</span>
                  <span className="text-warn">{BENCHMARK_SUPPORT_META.partial.shortLabel[locale]} {summary.partial}</span>
                  {summary.plugin > 0 ? (
                    <span className="text-cool">{BENCHMARK_SUPPORT_META.plugin.shortLabel[locale]} {summary.plugin}</span>
                  ) : null}
                  <span>{BENCHMARK_SUPPORT_META.none.shortLabel[locale]} {summary.none}</span>
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {filteredRows.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-line bg-card/70 p-8 text-center">
          <p className="break-keep text-sm font-bold text-fg">{copy.emptyTitle}</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {copy.emptyReset}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-x-auto rounded-3xl border border-line/75 bg-card/85 shadow-sm lg:block">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-panel/80">
                  <th scope="col" className="sticky left-0 z-10 w-72 bg-panel px-4 py-3.5 text-xs font-black text-fg">
                    {copy.colFeature}
                  </th>
                  {visibleTools.map((tool) => (
                    <th
                      key={tool.id}
                      scope="col"
                      className={cx(
                        "min-w-44 px-3.5 py-3.5 text-xs font-black",
                        tool.id === "toonstudio" ? "bg-accent-soft/45 text-accent" : "text-fg",
                      )}
                    >
                      {tool.shortName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/65">
                {filteredRows.map((row) => {
                  const expanded = expandedRowIds.has(row.id);
                  return (
                    <tr key={row.id} data-testid={`benchmark-row-${row.id}`} className="align-top">
                      <td className="sticky left-0 z-10 bg-card px-4 py-4">
                        <p className="break-keep text-sm font-black text-fg">
                          {pickBenchmarkText(row.title, locale)}
                        </p>
                        <p className="mt-1 break-keep text-[11px] font-semibold text-fg-3">
                          {pickBenchmarkText(row.metricTag, locale)}
                        </p>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          data-testid={`benchmark-evidence-toggle-${row.id}`}
                          onClick={() => toggleRowEvidence(row.id)}
                          className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-[11px] font-bold text-accent transition-colors hover:border-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <FileCode2 size={13} aria-hidden="true" />
                          <span>{expanded ? copy.evidenceClose : copy.evidenceOpen}</span>
                          {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                        </button>
                        {expanded ? (
                          <div className="mt-3">
                            <BenchmarkRowEvidenceDetails row={row} locale={locale} surface="table" labels={evidenceLabels} />
                          </div>
                        ) : null}
                      </td>
                      {visibleTools.map((tool) => (
                        <td
                          key={tool.id}
                          className={cx("px-3.5 py-4", tool.id === "toonstudio" && "bg-accent-soft/20")}
                        >
                          <BenchmarkCellView
                            cell={row.cells[tool.id]}
                            locale={locale}
                            highlighted={tool.id === "toonstudio"}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 lg:hidden">
            {filteredRows.map((row) => {
              const expanded = expandedRowIds.has(row.id);
              return (
                <article
                  key={row.id}
                  data-testid={`benchmark-card-${row.id}`}
                  className="rounded-3xl border border-line/75 bg-card/85 p-4"
                >
                  <h2 className="break-keep text-base font-black text-fg">
                    {pickBenchmarkText(row.title, locale)}
                  </h2>
                  <p className="mt-1 break-keep text-xs font-semibold text-fg-3">
                    {pickBenchmarkText(row.metricTag, locale)}
                  </p>
                  <dl className="mt-3.5 grid gap-2.5 border-t border-line/60 pt-3">
                    {visibleTools.map((tool) => (
                      <div
                        key={tool.id}
                        className={cx(
                          "rounded-2xl border px-3 py-2.5",
                          tool.id === "toonstudio" ? "border-accent/45 bg-accent-soft/25" : "border-line/60 bg-panel/50",
                        )}
                      >
                        <dt className="mb-1 text-xs font-black text-fg">{tool.name}</dt>
                        <dd>
                          <BenchmarkCellView
                            cell={row.cells[tool.id]}
                            locale={locale}
                            highlighted={tool.id === "toonstudio"}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleRowEvidence(row.id)}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <FileCode2 size={14} aria-hidden="true" />
                    {expanded ? copy.evidenceClose : copy.evidenceOpen}
                    {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  </button>
                  {expanded ? (
                    <div className="mt-3">
                      <BenchmarkRowEvidenceDetails row={row} locale={locale} surface="card" labels={evidenceLabels} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}

      <BenchmarkFooterSections
        dataset={dataset}
        locale={locale}
        labels={{
          tradeoffsEyebrow: copy.tradeoffsEyebrow,
          tradeoffsTitle: copy.tradeoffsTitle,
          tradeoffsSubtitle: copy.tradeoffsSubtitle,
          competitorEdge: copy.competitorEdgeLabel,
          toonstudioPos: copy.toonstudioPosLabel,
          profilesEyebrow: copy.profilesEyebrow,
          profilesTitle: copy.profilesTitle,
          pricing: copy.pricingLabel,
          platform: copy.platformLabel,
          takeaway: copy.takeawayLabel,
          strength: copy.strengthLabel,
          nextEyebrow: copy.nextEyebrow,
          nextTitle: copy.nextTitle,
        }}
      />
    </Container>
  );
}

export function BenchmarkBrushesPage() {
  return <BenchmarkDetailPage dataset={BENCHMARK_BRUSHES_DATASET} />;
}

export function BenchmarkFiltersPage() {
  return <BenchmarkDetailPage dataset={BENCHMARK_FILTERS_DATASET} />;
}

export function BenchmarkCollabOfficePage() {
  return <BenchmarkDetailPage dataset={BENCHMARK_COLLAB_OFFICE_DATASET} />;
}

export function Benchmark3dStudioPage() {
  return <BenchmarkDetailPage dataset={BENCHMARK_3D_STUDIO_DATASET} />;
}

export function BenchmarkAiAssistPage() {
  return <BenchmarkDetailPage dataset={BENCHMARK_AI_ASSIST_DATASET} />;
}
