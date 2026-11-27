/**
 * `/compare/studio` 순수 시맨틱 SVG 9축 커버리지 도표 및 작업 환경별 툴 체인 전환 비교 패널.
 *
 * - 순수 시맨틱 SVG (`oklch` / `currentColor` 전용, 원시 hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 공개 스펙 커버리지 지수(실측 성능 아님) 명시 라벨링
 * - 작업 환경 3종(1인 웹툰 연재 / 5인 팀 분업 / iPad+데스크톱 병행) 파이프라인 단계 비교
 */

import { ArrowDown, BarChart3, Compass, Info, ShieldCheck, Workflow } from "lucide-react";
import { useState, type ReactElement } from "react";

import {
  BENCHMARK_SVG_PIGMENTS,
  WORKFLOW_ENVIRONMENTS,
  buildRadarPolygonPoints,
  computeRadarGeometry,
  computeRadarRingPath,
  getWorkflowEnvironment,
  type WorkflowEnvironmentId,
} from "./benchmark-visual-matrix-data";
import {
  BENCHMARK_AXES,
  computeToolAverageCoverageIndex,
  getBenchmarkTool,
  getToolAxisCoverageScore,
  type BenchmarkAxis,
  type BilingualText,
  type CompetitorToolId,
} from "./competitor-benchmark-data";

import { wrapSvgText } from "@/shared/lib/svg-text-wrap";
import { cn } from "@/shared/lib/utils";

export interface BenchmarkCoverageAndWorkflowPanelsProps {
  readonly locale: "ko" | "en";
  readonly selectedCompetitorId: CompetitorToolId;
  readonly selectedWorkflowId: WorkflowEnvironmentId;
  readonly onSelectWorkflow: (id: WorkflowEnvironmentId) => void;
}

type CoverageChartMode = "radar" | "bar";

const PANEL_COPY = {
  ko: {
    eyebrowChart: "SEMANTIC SVG · 9-AXIS COVERAGE",
    chartHeading: "9축 공개 스펙 커버리지 레이더 · 바 도표",
    chartHonestyBadge: "공개 스펙 커버리지 지수 · 실측 성능 아님",
    chartHonestyNote:
      "각 축에 ToonStudio가 부여한 기능 등급(현재 구현·타사 강점 100 / 전환 중 65 / 제한 35 / 목표 25 / 미지원 0)을 정규화한 기능 폭 지수입니다. FPS·렌더 속도·화질 실측값이 아닙니다.",
    chartModeRadar: "레이더 도표",
    chartModeBar: "비교 막대 도표",
    chartModeAria: "커버리지 도표 보기 방식",
    chartAvgLabel: "9축 평균 커버리지 지수",
    chartScopeLegend: "정규화 기준: 구현·강점 100 · 전환 65 · 제한 35 · 목표 25 · 미지원 0",
    eyebrowWorkflow: "WORKFLOW SWITCH · PIPELINE FLOW",
    workflowHeading: "작업 환경별 툴 체인 전환 비교",
    workflowSubtitle:
      "추정 시간 절감률 대신 실제 공정 단계 수와 앱 전환 흐름을 나란히 대조합니다.",
    workflowEnvAria: "작업 환경 선택",
    workflowLegacyHeading: "기존 멀티-툴 파이프라인",
    workflowStudioHeading: "ToonStudio 올인원 브라우저 탭",
    workflowCoexistenceLabel: "솔직한 공존 메모",
  },
  en: {
    eyebrowChart: "SEMANTIC SVG · 9-AXIS COVERAGE",
    chartHeading: "9-Axis Public-Spec Coverage Radar & Bar Chart",
    chartHonestyBadge: "Public-Spec Coverage Index · Not a Performance Benchmark",
    chartHonestyNote:
      "Normalized scope breadth derived strictly from official-spec tiers (Current/Strength 100, In Progress 65, Limited 35, Target 25, None 0). Not measured FPS or speed.",
    chartModeRadar: "Radar Chart",
    chartModeBar: "Bar Chart",
    chartModeAria: "Coverage chart display mode",
    chartAvgLabel: "9-axis scope index avg",
    chartScopeLegend: "Scale: Live/Strength 100 · Partial 65 · Limited 35 · Target 25 · None 0",
    eyebrowWorkflow: "WORKFLOW SWITCH · PIPELINE FLOW",
    workflowHeading: "Toolchain Pipeline Comparison by Work Environment",
    workflowSubtitle:
      "Compares real workflow steps and app handoffs side by side without fabricated time-saving percentages.",
    workflowEnvAria: "Select creator workflow environment",
    workflowLegacyHeading: "Traditional Multi-Tool Pipeline",
    workflowStudioHeading: "ToonStudio All-in-One Browser Tab",
    workflowCoexistenceLabel: "Candid coexistence note",
  },
} as const;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cool focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

function getLabelAnchor(angleRad: number): "start" | "middle" | "end" {
  const cos = Math.cos(angleRad);
  if (Math.abs(cos) < 0.22) return "middle";
  return cos > 0 ? "start" : "end";
}

function CoverageRadarSvg(props: {
  readonly axes: readonly BenchmarkAxis[];
  readonly competitorId: CompetitorToolId;
  readonly competitorName: string;
  readonly locale: "ko" | "en";
}): ReactElement {
  const { axes, competitorId, competitorName, locale } = props;
  const viewWidth = 640;
  const viewHeight = 420;
  const cx = 320;
  const cy = 212;
  const radius = 114;
  const labelOffset = 22;

  const studioPoints = computeRadarGeometry("toonstudio", axes, cx, cy, radius, labelOffset);
  const rivalPoints = computeRadarGeometry(competitorId, axes, cx, cy, radius, labelOffset);
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      data-testid="benchmark-coverage-svg"
      data-chart-mode="radar"
      data-competitor-id={competitorId}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      role="img"
      aria-label={
        locale === "ko"
          ? `ToonStudio와 ${competitorName}의 9축 공개 스펙 커버리지 레이더 도표 (실측 성능 아님)`
          : `9-axis public-spec coverage radar chart comparing ToonStudio and ${competitorName} (not a performance benchmark)`
      }
      className="mx-auto block h-auto w-full max-w-[36rem] max-w-full text-fg"
    >
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={computeRadarRingPath(axes.length, ring, cx, cy, radius)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={ring === 1 ? 0.28 : 0.14}
          strokeWidth={ring === 1 ? 1.2 : 0.9}
          strokeDasharray={ring === 1 ? undefined : "3 3"}
        />
      ))}

      {studioPoints.map((pt) => {
        const outerX = Math.round((cx + Math.cos(pt.angleRad) * radius) * 10) / 10;
        const outerY = Math.round((cy + Math.sin(pt.angleRad) * radius) * 10) / 10;
        const anchor = getLabelAnchor(pt.angleRad);
        const fullLabel = `${pt.axis.order}. ${pick(pt.axis.shortLabel, locale)}`;
        const maxLabelWidth = anchor === "middle" ? 190 : 168;
        const lines = wrapSvgText(fullLabel, {
          maxWidth: maxLabelWidth,
          fontSize: 11,
          maxLines: 2,
          bold: true,
        });
        const lineHeight = 14;
        const firstLineY = pt.labelY - ((lines.length - 1) * lineHeight) / 2;

        return (
          <g key={pt.axis.id}>
            <line
              x1={cx}
              y1={cy}
              x2={outerX}
              y2={outerY}
              stroke="currentColor"
              strokeOpacity={0.16}
              strokeWidth={1}
            />
            <text
              x={pt.labelX}
              y={firstLineY}
              fill="currentColor"
              fillOpacity={0.88}
              fontSize="11"
              fontWeight="600"
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {lines.map((line, lineIdx) => (
                <tspan
                  key={`${pt.axis.id}-line-${lineIdx}`}
                  x={pt.labelX}
                  dy={lineIdx === 0 ? 0 : lineHeight}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      <polygon
        data-testid="radar-polygon-toonstudio"
        points={buildRadarPolygonPoints(studioPoints)}
        fill={BENCHMARK_SVG_PIGMENTS.toonstudioFill}
        stroke={BENCHMARK_SVG_PIGMENTS.toonstudioStroke}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      {studioPoints.map((pt) => (
        <circle
          key={`ts-${pt.axis.id}`}
          cx={pt.x}
          cy={pt.y}
          r={3.5}
          fill={BENCHMARK_SVG_PIGMENTS.toonstudioStroke}
        />
      ))}

      <polygon
        data-testid="radar-polygon-competitor"
        points={buildRadarPolygonPoints(rivalPoints)}
        fill={BENCHMARK_SVG_PIGMENTS.competitorFill}
        stroke={BENCHMARK_SVG_PIGMENTS.competitorStroke}
        strokeWidth={2.2}
        strokeDasharray="6 3"
        strokeLinejoin="round"
      />
      {rivalPoints.map((pt) => (
        <rect
          key={`rv-${pt.axis.id}`}
          x={pt.x - 3}
          y={pt.y - 3}
          width={6}
          height={6}
          rx={1}
          fill={BENCHMARK_SVG_PIGMENTS.competitorStroke}
        />
      ))}

      <text
        x={cx + 8}
        y={cy - radius + 12}
        fill="currentColor"
        fillOpacity={0.62}
        stroke="var(--color-card)"
        strokeWidth={3}
        paintOrder="stroke"
        fontSize="9.5"
        fontWeight="700"
        dominantBaseline="middle"
      >
        100
      </text>
      <text
        x={cx + 8}
        y={cy - radius * 0.5 + 12}
        fill="currentColor"
        fillOpacity={0.56}
        stroke="var(--color-card)"
        strokeWidth={3}
        paintOrder="stroke"
        fontSize="9.5"
        fontWeight="700"
        dominantBaseline="middle"
      >
        50
      </text>
    </svg>
  );
}

function CoverageBarSvg(props: {
  readonly axes: readonly BenchmarkAxis[];
  readonly competitorId: CompetitorToolId;
  readonly competitorName: string;
  readonly locale: "ko" | "en";
}): ReactElement {
  const { axes, competitorId, competitorName, locale } = props;
  const viewWidth = 580;
  const rowHeight = 42;
  const topPad = 36;
  const labelWidth = 178;
  const barMaxWidth = 310;
  const scoreColX = labelWidth + barMaxWidth + 14;
  const svgHeight = topPad + axes.length * rowHeight + 16;

  return (
    <svg
      data-testid="benchmark-coverage-svg"
      data-chart-mode="bar"
      data-competitor-id={competitorId}
      viewBox={`0 0 ${viewWidth} ${svgHeight}`}
      role="img"
      aria-label={
        locale === "ko"
          ? `ToonStudio와 ${competitorName}의 9축 공개 스펙 커버리지 비교 막대 도표 (실측 성능 아님)`
          : `9-axis public-spec coverage bar chart comparing ToonStudio and ${competitorName} (not a performance benchmark)`
      }
      className="block h-auto w-full max-w-full text-fg"
    >
      {/* 상단 시리즈 범례 */}
      <g>
        <circle cx={labelWidth + 6} cy={12} r={4} fill={BENCHMARK_SVG_PIGMENTS.toonstudioStroke} />
        <text
          x={labelWidth + 15}
          y={12}
          fill={BENCHMARK_SVG_PIGMENTS.toonstudioStroke}
          fontSize="10"
          fontWeight="700"
          dominantBaseline="middle"
        >
          ToonStudio
        </text>
        <rect
          x={labelWidth + 96}
          y={8}
          width={8}
          height={8}
          rx={1.5}
          fill={BENCHMARK_SVG_PIGMENTS.competitorStroke}
        />
        <text
          x={labelWidth + 110}
          y={12}
          fill={BENCHMARK_SVG_PIGMENTS.competitorStroke}
          fontSize="10"
          fontWeight="700"
          dominantBaseline="middle"
        >
          {competitorName}
        </text>
      </g>

      {[0, 50, 100].map((tick) => {
        const x = labelWidth + (barMaxWidth * tick) / 100;
        return (
          <g key={tick}>
            <line
              x1={x}
              y1={topPad - 4}
              x2={x}
              y2={svgHeight - 10}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.3 : 0.14}
              strokeDasharray={tick === 0 ? undefined : "3 3"}
            />
            <text
              x={x}
              y={26}
              fill="currentColor"
              fillOpacity={0.58}
              fontSize="9.5"
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {axes.map((axis, idx) => {
        const y = topPad + idx * rowHeight;
        const tsScore = Math.max(0, Math.min(100, getToolAxisCoverageScore(axis, "toonstudio")));
        const rvScore = Math.max(0, Math.min(100, getToolAxisCoverageScore(axis, competitorId)));
        const tsWidth = tsScore === 0 ? 0 : Math.max(4, Math.min(barMaxWidth, Math.round((barMaxWidth * tsScore) / 100)));
        const rvWidth = rvScore === 0 ? 0 : Math.max(4, Math.min(barMaxWidth, Math.round((barMaxWidth * rvScore) / 100)));
        const axisText = `${axis.order}. ${pick(axis.shortLabel, locale)}`;
        const axisLines = wrapSvgText(axisText, {
          maxWidth: labelWidth - 18,
          fontSize: 11,
          maxLines: 2,
          bold: true,
        });
        const labelLineHeight = 13;
        const labelStartY = y + 18 - ((axisLines.length - 1) * labelLineHeight) / 2;

        return (
          <g key={axis.id} data-testid={`bar-row-${axis.id}`}>
            <text
              x={labelWidth - 12}
              y={labelStartY}
              fill="currentColor"
              fillOpacity={0.9}
              fontSize="11"
              fontWeight="600"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {axisLines.map((line, lineIdx) => (
                <tspan
                  key={`${axis.id}-bar-label-${lineIdx}`}
                  x={labelWidth - 12}
                  dy={lineIdx === 0 ? 0 : labelLineHeight}
                >
                  {line}
                </tspan>
              ))}
            </text>
            {/* ToonStudio 트랙 + 막대 + 우측 정렬 수치 */}
            <rect
              x={labelWidth}
              y={y + 5}
              width={barMaxWidth}
              height={11}
              rx={3}
              fill="var(--color-raised)"
            />
            {tsWidth > 0 ? (
              <rect
                x={labelWidth}
                y={y + 5}
                width={tsWidth}
                height={11}
                rx={3}
                fill={BENCHMARK_SVG_PIGMENTS.toonstudioStroke}
              />
            ) : null}
            <text
              x={scoreColX}
              y={y + 10.5}
              fill={BENCHMARK_SVG_PIGMENTS.toonstudioStroke}
              fontSize="10.5"
              fontWeight="700"
              dominantBaseline="middle"
            >
              ● {tsScore}
            </text>
            {/* 경쟁 툴 트랙 + 막대 + 동일 열 우측 정렬 수치 */}
            <rect
              x={labelWidth}
              y={y + 20}
              width={barMaxWidth}
              height={11}
              rx={3}
              fill="var(--color-raised)"
            />
            {rvWidth > 0 ? (
              <rect
                x={labelWidth}
                y={y + 20}
                width={rvWidth}
                height={11}
                rx={3}
                fill={BENCHMARK_SVG_PIGMENTS.competitorFill}
                stroke={BENCHMARK_SVG_PIGMENTS.competitorStroke}
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            ) : null}
            <text
              x={scoreColX}
              y={y + 25.5}
              fill={BENCHMARK_SVG_PIGMENTS.competitorStroke}
              fontSize="10.5"
              fontWeight="700"
              dominantBaseline="middle"
            >
              ■ {rvScore}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BenchmarkCoverageAndWorkflowPanels(
  props: BenchmarkCoverageAndWorkflowPanelsProps,
): ReactElement {
  const { locale, selectedCompetitorId, selectedWorkflowId, onSelectWorkflow } = props;
  const copy = PANEL_COPY[locale];
  const [chartMode, setChartMode] = useState<CoverageChartMode>("radar");

  const competitorTool = getBenchmarkTool(selectedCompetitorId);
  const workflow = getWorkflowEnvironment(selectedWorkflowId);
  const studioAvgIndex = computeToolAverageCoverageIndex("toonstudio", BENCHMARK_AXES);
  const competitorAvgIndex = computeToolAverageCoverageIndex(selectedCompetitorId, BENCHMARK_AXES);

  return (
    <>
      {/* ③ 순수 시맨틱 SVG 9축 커버리지 레이더 / 바 도표 */}
      <section
        data-testid="coverage-chart-section"
        aria-labelledby="coverage-chart-heading"
        className="ts-showcase-reveal rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
                <Compass size={14} aria-hidden="true" />
                <span>{copy.eyebrowChart}</span>
              </span>
              <span
                data-testid="coverage-honesty-badge"
                className="ts-hm-cell ts-hm-amber inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
              >
                <Info size={12} aria-hidden="true" />
                {copy.chartHonestyBadge}
              </span>
            </div>
            <h2 id="coverage-chart-heading" className="mt-1.5 text-xl font-bold text-fg sm:text-2xl">
              {copy.chartHeading}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2 sm:text-sm">
              {copy.chartHonestyNote}
            </p>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.chartModeAria}>
            <button
              type="button"
              data-testid="coverage-mode-radar"
              aria-pressed={chartMode === "radar"}
              onClick={() => setChartMode("radar")}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                FOCUS_RING,
                chartMode === "radar"
                  ? "border-cool bg-raised text-cool"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <Compass size={14} aria-hidden="true" />
              {copy.chartModeRadar}
            </button>
            <button
              type="button"
              data-testid="coverage-mode-bar"
              aria-pressed={chartMode === "bar"}
              onClick={() => setChartMode("bar")}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                FOCUS_RING,
                chartMode === "bar"
                  ? "border-cool bg-raised text-cool"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <BarChart3 size={14} aria-hidden="true" />
              {copy.chartModeBar}
            </button>
          </div>
        </div>

        <div className="mt-5 grid items-center gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-2xl border border-line bg-card p-4">
            {chartMode === "radar" ? (
              <CoverageRadarSvg
                axes={BENCHMARK_AXES}
                competitorId={selectedCompetitorId}
                competitorName={competitorTool.name}
                locale={locale}
              />
            ) : (
              <CoverageBarSvg
                axes={BENCHMARK_AXES}
                competitorId={selectedCompetitorId}
                competitorName={competitorTool.name}
                locale={locale}
              />
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-good/40 bg-card px-4 py-3">
                <p className="text-xs font-bold text-good">● ToonStudio</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums text-fg">
                  {studioAvgIndex}
                  <span className="text-xs font-normal text-fg-3"> / 100</span>
                </p>
                <p className="mt-0.5 text-[11px] text-fg-3">{copy.chartAvgLabel}</p>
              </div>
              <div className="rounded-2xl border border-warn/40 bg-card px-4 py-3">
                <p className="text-xs font-bold text-warn">■ {competitorTool.shortName}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums text-fg">
                  {competitorAvgIndex}
                  <span className="text-xs font-normal text-fg-3"> / 100</span>
                </p>
                <p className="mt-0.5 text-[11px] text-fg-3">{copy.chartAvgLabel}</p>
              </div>
            </div>

            <ul className="divide-y divide-line/60 rounded-2xl border border-line bg-card px-3.5 py-2 text-xs">
              {BENCHMARK_AXES.map((axis) => {
                const tsScore = getToolAxisCoverageScore(axis, "toonstudio");
                const rvScore = getToolAxisCoverageScore(axis, selectedCompetitorId);
                return (
                  <li key={axis.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="font-medium text-fg-2">
                      {axis.order}. {pick(axis.shortLabel, locale)}
                    </span>
                    <span className="shrink-0 font-display text-[11px] font-bold tabular-nums">
                      <span className="text-good">{tsScore}</span>
                      <span className="mx-1.5 text-fg-3">vs</span>
                      <span className="text-warn">{rvScore}</span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="text-[11px] leading-5 text-fg-3">{copy.chartScopeLegend}</p>
          </div>
        </div>
      </section>

      {/* ④ 작업 환경별 툴 체인 전환 비교 */}
      <section
        data-testid="workflow-toolchain-section"
        aria-labelledby="workflow-toolchain-heading"
        className="ts-showcase-reveal rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <Workflow size={14} aria-hidden="true" />
              <span>{copy.eyebrowWorkflow}</span>
            </div>
            <h2
              id="workflow-toolchain-heading"
              className="mt-1.5 text-xl font-bold text-fg sm:text-2xl"
            >
              {copy.workflowHeading}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">{copy.workflowSubtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.workflowEnvAria}>
            {WORKFLOW_ENVIRONMENTS.map((env) => {
              const isSelected = env.id === selectedWorkflowId;
              return (
                <button
                  key={env.id}
                  type="button"
                  data-testid={`workflow-env-${env.id}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectWorkflow(env.id)}
                  className={cn(
                    "min-h-11 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm",
                    FOCUS_RING,
                    isSelected
                      ? "border-cool bg-raised text-cool"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {pick(env.label, locale)}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-4 text-sm font-medium text-fg-2">{pick(workflow.tagline, locale)}</p>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
          <div
            data-testid="workflow-track-legacy"
            data-step-count={workflow.legacySteps.length}
            className="flex h-full flex-col rounded-2xl border border-line bg-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
              <h3 className="text-sm font-bold text-fg">{copy.workflowLegacyHeading}</h3>
              <span className="ts-hm-cell ts-hm-terracotta rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                {pick(workflow.legacyAppCountLabel, locale)}
              </span>
            </div>
            <ol className="mt-3 space-y-2">
              {workflow.legacySteps.map((step, idx) => (
                <li key={step.order}>
                  <div className="rounded-xl bg-panel px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="font-bold text-fg">
                        <span className="font-display tabular-nums text-fg-3">0{step.order}</span>{" "}
                        {pick(step.toolLabel, locale)}
                      </span>
                      {step.frictionNote ? (
                        <span className="text-[11px] font-semibold text-warn">
                          {pick(step.frictionNote, locale)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 leading-5 text-fg-2">{pick(step.action, locale)}</p>
                  </div>
                  {idx < workflow.legacySteps.length - 1 ? (
                    <div className="flex justify-center py-0.5 text-fg-3" aria-hidden="true">
                      <ArrowDown size={13} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div
            data-testid="workflow-track-toonstudio"
            data-step-count={workflow.toonstudioSteps.length}
            className="flex flex-col justify-between rounded-2xl border border-good/45 bg-card p-4"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                <h3 className="text-sm font-bold text-good">{copy.workflowStudioHeading}</h3>
                <span className="ts-hm-cell ts-hm-jade rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                  {pick(workflow.toonstudioTabLabel, locale)}
                </span>
              </div>
              <ol className="mt-3 space-y-2.5">
                {workflow.toonstudioSteps.map((step, idx) => (
                  <li key={step.order}>
                    <div className="rounded-xl bg-raised/70 px-3.5 py-3 text-xs">
                      <p className="font-bold text-fg">
                        <span className="font-display tabular-nums text-good">0{step.order}</span>{" "}
                        {pick(step.toolLabel, locale)}
                      </p>
                      <p className="mt-1 leading-5 text-fg-2">{pick(step.action, locale)}</p>
                    </div>
                    {idx < workflow.toonstudioSteps.length - 1 ? (
                      <div className="flex justify-center py-0.5 text-good" aria-hidden="true">
                        <ArrowDown size={13} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>

            <div
              data-testid="workflow-coexistence-note"
              className="mt-4 flex items-start gap-2 border-t border-line/60 pt-3 text-xs leading-5 text-fg-2"
            >
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
              <p>
                <strong className="font-semibold text-fg">{copy.workflowCoexistenceLabel}: </strong>
                {pick(workflow.coexistenceNote, locale)}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
