/**
 * `/compare/studio` 한눈에 보는 시각 비교 허브.
 *
 * 1) 7종 × 9축 탈-바이올렛 5대 안료 히트맵 매트릭스 + 4대 축 필터
 * 2) 1:1 맞대결 비교기 (ToonStudio 우위 / 상대 강점 / 왕복 호환 경로)
 * 3) 순수 시맨틱 SVG 9축 커버리지 레이더·바 도표 (`BenchmarkCoverageAndWorkflowPanels`)
 * 4) 작업 환경 3종(1인 연재 / 5인 팀 / iPad+데스크톱) 툴 체인 전환 플로우
 */

import { ArrowLeftRight, CheckCircle2, Grid3X3, ShieldCheck, Star } from "lucide-react";
import { useState, type ReactElement } from "react";

import { BenchmarkCoverageAndWorkflowPanels } from "./BenchmarkCoverageAndWorkflowPanels";
import {
  BENCHMARK_HEATMAP_LEGEND,
  COMPETITOR_IDS,
  getHeadToHeadProfile,
  getHeatmapPigmentForStatus,
  type WorkflowEnvironmentId,
} from "./benchmark-visual-matrix-data";
import {
  BENCHMARK_AXES,
  BENCHMARK_AXIS_CATEGORIES,
  BENCHMARK_STATUS_META,
  BENCHMARK_TOOLS,
  getBenchmarkAxesByCategory,
  getBenchmarkTool,
  type BenchmarkAxisCategoryId,
  type BenchmarkAxisId,
  type BenchmarkToolId,
  type BilingualText,
  type CompetitorToolId,
} from "./competitor-benchmark-data";

import { cn } from "@/shared/lib/utils";

export interface BenchmarkVisualMatrixSectionProps {
  readonly locale?: "ko" | "en";
  readonly initialCompetitorId?: CompetitorToolId;
  readonly initialWorkflowId?: WorkflowEnvironmentId;
  readonly onSelectAxis?: (axisId: BenchmarkAxisId) => void;
}

interface InspectedHeatmapCell {
  readonly axisId: BenchmarkAxisId;
  readonly toolId: BenchmarkToolId;
}

const SECTION_COPY = {
  ko: {
    eyebrowHeatmap: "VISUAL HEATMAP · 7 TOOLS × 9 AXES",
    heatmapHeading: "7종 도구 × 9대 축 한눈에 보는 히트맵 도표",
    heatmapSubtitle:
      "5대 탈-바이올렛 안료와 기호로 각 도구의 공식 스펙 상태를 한 화면에서 비교합니다. 셀을 누르면 상세 근거가 열리고 경쟁사 열을 누르면 1:1 맞대결이 전환됩니다.",
    heatmapFilterAria: "비교 축 분야 필터",
    heatmapAxisCol: "비교 축 (9대 기준)",
    heatmapSelectOpponentSuffix: "1:1 맞대결 선택",
    heatmapInspectorPrefix: "선택 셀 상세",
    eyebrowH2h: "HEAD-TO-HEAD · 1:1 MATCHUP",
    h2hHeading: "1:1 맞대결 비교기 · 우위 · 상대 강점 · 왕복 호환",
    h2hSubtitle:
      "경쟁사 1종을 고르면 ToonStudio가 앞서는 영역뿐 아니라 상대 도구의 검증된 강점과 함께 쓰는 왕복 포맷 경로까지 숨기지 않고 보여줍니다.",
    h2hSelectorAria: "1:1 맞대결 경쟁 도구 선택",
    h2hLeadsTitle: "ToonStudio가 앞서는 영역",
    h2hCompetitorTitleSuffix: "강점 (정직 표기)",
    h2hRoundTripTitle: "함께 쓰는 왕복 호환 경로",
    h2hVerdictLabel: "실전 병행 결론",
    h2hBillingLabel: "과금",
    h2hPlatformLabel: "지원 OS",
  },
  en: {
    eyebrowHeatmap: "VISUAL HEATMAP · 7 TOOLS × 9 AXES",
    heatmapHeading: "7 Tools × 9 Axes At-a-Glance Visual Heatmap",
    heatmapSubtitle:
      "Scan every tool across 9 official-spec axes using five violet-free editorial pigments and symbols. Click any cell to inspect details or switch the 1:1 matchup.",
    heatmapFilterAria: "Filter benchmark axes by domain",
    heatmapAxisCol: "Comparison Axis (9 Criteria)",
    heatmapSelectOpponentSuffix: "Select for 1:1 matchup",
    heatmapInspectorPrefix: "Inspected cell",
    eyebrowH2h: "HEAD-TO-HEAD · 1:1 MATCHUP",
    h2hHeading: "1:1 Head-to-Head Comparator — Leads, Rival Strengths & Round-Trip",
    h2hSubtitle:
      "Pick any tool to compare where ToonStudio leads, where the rival shines natively, and how both coexist via open formats.",
    h2hSelectorAria: "Select competitor tool for head-to-head view",
    h2hLeadsTitle: "Where ToonStudio Leads",
    h2hCompetitorTitleSuffix: "Native Strengths (Candid)",
    h2hRoundTripTitle: "Coexisting Round-Trip Path",
    h2hVerdictLabel: "Practical coexistence",
    h2hBillingLabel: "Billing",
    h2hPlatformLabel: "Platforms",
  },
} as const;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cool focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

export function BenchmarkVisualMatrixSection(
  props: BenchmarkVisualMatrixSectionProps,
): ReactElement {
  const locale: "ko" | "en" = props.locale === "en" ? "en" : "ko";
  const copy = SECTION_COPY[locale];

  const [categoryFilter, setCategoryFilter] = useState<BenchmarkAxisCategoryId>("all");
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<CompetitorToolId>(
    props.initialCompetitorId ?? "csp",
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<WorkflowEnvironmentId>(
    props.initialWorkflowId ?? "solo-webtoon",
  );
  const [inspectedCell, setInspectedCell] = useState<InspectedHeatmapCell>({
    axisId: "brush-tactile-perf",
    toolId: "toonstudio",
  });

  const filteredAxes = getBenchmarkAxesByCategory(categoryFilter);
  const inspectedAxis =
    filteredAxes.find((axis) => axis.id === inspectedCell.axisId) ??
    filteredAxes[0] ??
    BENCHMARK_AXES[0]!;
  const inspectedTool = getBenchmarkTool(inspectedCell.toolId);
  const inspectedData = inspectedAxis.cells[inspectedTool.id];
  const inspectedMeta = BENCHMARK_STATUS_META[inspectedData.status];

  const competitorTool = getBenchmarkTool(selectedCompetitorId);
  const studioTool = getBenchmarkTool("toonstudio");
  const h2h = getHeadToHeadProfile(selectedCompetitorId);

  const handleHeatmapCellClick = (axisId: BenchmarkAxisId, toolId: BenchmarkToolId) => {
    setInspectedCell({ axisId, toolId });
    if (toolId !== "toonstudio") {
      setSelectedCompetitorId(toolId);
    }
    props.onSelectAxis?.(axisId);
  };

  return (
    <div
      data-testid="benchmark-visual-matrix-hub"
      className="space-y-8 [word-break:keep-all] tabular-nums"
    >
      {/* ① 7종 × 9축 시각 히트맵 매트릭스 도표 */}
      <section
        data-testid="visual-heatmap-section"
        aria-labelledby="visual-heatmap-heading"
        className="ts-showcase-reveal rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <Grid3X3 size={14} aria-hidden="true" />
              <span>{copy.eyebrowHeatmap}</span>
            </div>
            <h2 id="visual-heatmap-heading" className="mt-1.5 text-xl font-bold text-fg sm:text-2xl">
              {copy.heatmapHeading}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">{copy.heatmapSubtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.heatmapFilterAria}>
            {BENCHMARK_AXIS_CATEGORIES.map((category) => {
              const count = getBenchmarkAxesByCategory(category.id).length;
              const isSelected = categoryFilter === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  data-testid={`heatmap-filter-${category.id}`}
                  aria-pressed={isSelected}
                  onClick={() => setCategoryFilter(category.id)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                    FOCUS_RING,
                    isSelected
                      ? "border-cool bg-raised text-cool"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {pick(category.label, locale)}{" "}
                  <span className="font-display tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5대 탈-바이올렛 안료 범례 */}
        <ul
          data-testid="visual-heatmap-legend"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          {BENCHMARK_HEATMAP_LEGEND.map((item) => (
            <li
              key={item.status}
              className={cn(
                "ts-hm-cell inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                item.cssClass,
              )}
            >
              <span aria-hidden="true">{item.symbol}</span>
              <span>{pick(item.label, locale)}</span>
            </li>
          ))}
        </ul>

        {/* 7종 × 9축 히트맵 테이블 */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
          <table
            data-testid="visual-heatmap-table"
            className="w-full min-w-[44rem] border-collapse text-left text-xs"
          >
            <thead>
              <tr className="border-b border-line bg-panel/80">
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-[11.5rem] bg-panel px-3.5 py-3 font-bold text-fg"
                >
                  {copy.heatmapAxisCol}
                </th>
                {BENCHMARK_TOOLS.map((tool) => {
                  const isActiveOpponent = tool.id === selectedCompetitorId;
                  return (
                    <th
                      key={tool.id}
                      scope="col"
                      className={cn(
                        "px-2 py-2.5 text-center font-bold",
                        tool.id === "toonstudio"
                          ? "text-good"
                          : isActiveOpponent
                            ? "text-cool"
                            : "text-fg",
                      )}
                    >
                      {tool.id === "toonstudio" ? (
                        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-good/40 bg-raised/70 px-2.5 text-xs font-bold text-good">
                          {tool.shortName}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`heatmap-col-${tool.id}`}
                          aria-pressed={isActiveOpponent}
                          title={`${tool.name} — ${copy.heatmapSelectOpponentSuffix}`}
                          onClick={() => {
                            if (tool.id !== "toonstudio") {
                              setSelectedCompetitorId(tool.id);
                            }
                          }}
                          className={cn(
                            "inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-2 text-xs font-bold transition-colors",
                            FOCUS_RING,
                            isActiveOpponent
                              ? "border-cool bg-raised text-cool"
                              : "border-transparent bg-transparent text-fg hover:border-line hover:bg-raised/60",
                          )}
                        >
                          {tool.shortName}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredAxes.map((axis) => (
                <tr
                  key={axis.id}
                  data-testid={`heatmap-row-${axis.id}`}
                  className="border-b border-line/60 last:border-b-0"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-card px-3.5 py-2.5 font-semibold text-fg"
                  >
                    <span className="font-display text-[11px] font-bold text-fg-3">
                      {String(axis.order).padStart(2, "0")}
                    </span>{" "}
                    <span>{pick(axis.shortLabel, locale)}</span>
                  </th>
                  {BENCHMARK_TOOLS.map((tool) => {
                    const cellData = axis.cells[tool.id];
                    const pigment = getHeatmapPigmentForStatus(cellData.status);
                    const isFocused =
                      inspectedAxis.id === axis.id && inspectedTool.id === tool.id;
                    const isColHighlighted = tool.id === selectedCompetitorId;
                    return (
                      <td
                        key={`${axis.id}-${tool.id}`}
                        className={cn("p-1.5 text-center", isColHighlighted && "bg-raised/35")}
                      >
                        <button
                          type="button"
                          data-testid={`heatmap-cell-${axis.id}-${tool.id}`}
                          data-status={cellData.status}
                          data-pigment={pigment.pigmentKey}
                          aria-pressed={isFocused}
                          aria-label={`${pick(axis.shortLabel, locale)} — ${tool.name}: ${pick(BENCHMARK_STATUS_META[cellData.status].label, locale)} (${pick(cellData.badge, locale)})`}
                          onClick={() => handleHeatmapCellClick(axis.id, tool.id)}
                          className={cn(
                            "ts-hm-cell flex min-h-11 w-full flex-col items-center justify-center rounded-xl px-1.5 py-1.5 text-[11px] font-bold leading-tight",
                            FOCUS_RING,
                            pigment.cssClass,
                            isFocused && "ts-hm-col-active",
                          )}
                        >
                          <span aria-hidden="true" className="text-xs leading-none">
                            {pigment.symbol}
                          </span>
                          <span className="mt-0.5 whitespace-nowrap">
                            {pick(pigment.shortBadge, locale)}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 선택 셀 즉시 상세 근거 바 */}
        <div
          data-testid="heatmap-inspector-bar"
          className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-line/70 pt-4 text-xs"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-fg-3">{copy.heatmapInspectorPrefix}:</span>
              <strong className="text-sm text-fg">
                {inspectedTool.name} · {pick(inspectedAxis.shortLabel, locale)}
              </strong>
              <span
                className={cn(
                  "ts-hm-cell inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                  getHeatmapPigmentForStatus(inspectedData.status).cssClass,
                )}
              >
                <span aria-hidden="true">
                  {getHeatmapPigmentForStatus(inspectedData.status).symbol}
                </span>
                {pick(inspectedMeta.label, locale)}
              </span>
            </div>
            <p className="font-semibold text-fg">{pick(inspectedData.badge, locale)}</p>
            <p className="leading-5 text-fg-2">{pick(inspectedData.note, locale)}</p>
          </div>
          <div className="max-w-md font-mono text-[11px] text-fg-3">
            {inspectedTool.id === "toonstudio" ? inspectedAxis.evidencePaths[0]
              : inspectedAxis.documentation?.[inspectedTool.id] ? (
                <a className="underline underline-offset-2" href={inspectedAxis.documentation[inspectedTool.id]} target="_blank" rel="noreferrer">
                  {locale === "en" ? "Official documentation" : "공식 설명서"}
                </a>
              ) : null}
          </div>
        </div>
      </section>

      {/* ② 1:1 맞대결 비교기 (Head-to-Head VS Selector) */}
      <section
        data-testid="head-to-head-section"
        aria-labelledby="head-to-head-heading"
        className="ts-showcase-reveal rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <div className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
          <ArrowLeftRight size={14} aria-hidden="true" />
          <span>{copy.eyebrowH2h}</span>
        </div>
        <h2 id="head-to-head-heading" className="mt-1.5 text-xl font-bold text-fg sm:text-2xl">
          {copy.h2hHeading}
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">{copy.h2hSubtitle}</p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={copy.h2hSelectorAria}>
          {COMPETITOR_IDS.map((compId) => {
            const tool = getBenchmarkTool(compId);
            const isSelected = compId === selectedCompetitorId;
            return (
              <button
                key={compId}
                type="button"
                data-testid={`h2h-competitor-${compId}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedCompetitorId(compId)}
                className={cn(
                  "min-h-11 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm",
                  FOCUS_RING,
                  isSelected
                    ? "border-cool bg-raised text-cool"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                ToonStudio vs {tool.shortName}
              </button>
            );
          })}
        </div>

        <div
          data-testid={`h2h-active-panel-${selectedCompetitorId}`}
          className="mt-5 space-y-5 border-t border-line/70 pt-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <p className="font-display text-xs font-bold tracking-[0.08em] text-good uppercase">
                TOONSTUDIO VS {competitorTool.name.toUpperCase()}
              </p>
              <h3 className="text-lg font-bold text-fg">{pick(h2h.headline, locale)}</h3>
              <p className="text-sm leading-6 text-fg-2">{pick(h2h.summary, locale)}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-card px-3.5 py-3">
                <dt className="font-bold text-good">{studioTool.name}</dt>
                <dd className="mt-1 text-fg-2">
                  <span className="font-semibold text-fg">{copy.h2hBillingLabel}: </span>
                  {pick(studioTool.officialBilling, locale)}
                </dd>
                <dd className="mt-1 text-fg-3">
                  <span className="font-semibold text-fg-2">{copy.h2hPlatformLabel}: </span>
                  {pick(studioTool.platforms, locale)}
                </dd>
              </div>
              <div className="rounded-2xl bg-card px-3.5 py-3">
                <dt className="font-bold text-cool">{competitorTool.name}</dt>
                <dd className="mt-1 text-fg-2">
                  <span className="font-semibold text-fg">{copy.h2hBillingLabel}: </span>
                  {pick(competitorTool.officialBilling, locale)}
                </dd>
                <dd className="mt-1 text-fg-3">
                  <span className="font-semibold text-fg-2">{copy.h2hPlatformLabel}: </span>
                  {pick(competitorTool.platforms, locale)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <article
              data-testid="h2h-toonstudio-leads"
              className="rounded-2xl border border-good/40 bg-card p-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-good">
                <CheckCircle2 size={15} aria-hidden="true" />
                <h4>{copy.h2hLeadsTitle}</h4>
              </div>
              <ul className="mt-3 space-y-2.5 text-xs leading-5 text-fg-2">
                {h2h.toonstudioLeads.map((point) => (
                  <li key={point.en} className="flex items-start gap-2">
                    <span className="mt-1 text-good" aria-hidden="true">
                      ●
                    </span>
                    <span>{pick(point, locale)}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article
              data-testid="h2h-competitor-strengths"
              className="rounded-2xl border border-cool/40 bg-card p-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-cool">
                <Star size={15} aria-hidden="true" />
                <h4>
                  {competitorTool.shortName} {copy.h2hCompetitorTitleSuffix}
                </h4>
              </div>
              <ul className="mt-3 space-y-2.5 text-xs leading-5 text-fg-2">
                {h2h.competitorStrengths.map((point) => (
                  <li key={point.en} className="flex items-start gap-2">
                    <span className="mt-1 text-cool" aria-hidden="true">
                      ★
                    </span>
                    <span>{pick(point, locale)}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article
              data-testid="h2h-roundtrip-paths"
              className="rounded-2xl border border-warn/40 bg-card p-4"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-warn">
                <ArrowLeftRight size={15} aria-hidden="true" />
                <h4>{copy.h2hRoundTripTitle}</h4>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {h2h.roundTripFormats.map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-full bg-raised px-2.5 py-0.5 font-mono text-[11px] font-bold text-fg"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
              <ol className="mt-3 space-y-2.5 text-xs leading-5 text-fg-2">
                {h2h.roundTripSteps.map((step, index) => (
                  <li
                    key={step.fromTool.en}
                    className="border-t border-line/50 pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-bold text-fg">
                        {index + 1}. {pick(step.fromTool, locale)}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-warn">
                        {step.formatBadge}
                      </span>
                    </div>
                    <p className="mt-0.5 text-fg-2">{pick(step.detail, locale)}</p>
                  </li>
                ))}
              </ol>
            </article>
          </div>

          <div className="flex items-start gap-2 border-t border-line/60 pt-3 text-xs leading-5 text-fg-2">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
            <p>
              <strong className="font-semibold text-fg">{copy.h2hVerdictLabel}: </strong>
              {pick(h2h.honestVerdict, locale)}
            </p>
          </div>
        </div>
      </section>

      {/* ③ 순수 시맨틱 SVG 9축 커버리지 도표 + ④ 작업 환경별 툴 체인 전환 비교 */}
      <BenchmarkCoverageAndWorkflowPanels
        locale={locale}
        selectedCompetitorId={selectedCompetitorId}
        selectedWorkflowId={selectedWorkflowId}
        onSelectWorkflow={setSelectedWorkflowId}
      />
    </div>
  );
}
