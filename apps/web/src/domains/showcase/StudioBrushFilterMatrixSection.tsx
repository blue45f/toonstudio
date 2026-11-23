import { Box, Brush, Gauge, Layers, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import {
  BRUSH_FILTER_COMPETITOR_ROWS,
  BRUSH_FILTER_SUMMARY_STATS,
  QUANTITATIVE_PERFORMANCE_METRICS,
  SHAPER_3D_BREAKTHROUGH_PILLARS,
  STUDIO_NEXTGEN_CAPABILITY_CARDS,
  type CellGrade,
} from "./brush-filter-competitor-data";
import {
  BENCHMARK_TOOLS,
  type BilingualText,
} from "./competitor-benchmark-data";

import { cn } from "@/shared/lib/utils";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

function gradeBadgeClass(grade: CellGrade): string {
  if (grade === "lead") return "ts-status-pill ts-status-good";
  if (grade === "strong") return "ts-status-pill ts-status-cool";
  if (grade === "partial") return "ts-status-pill ts-status-warn";
  return "ts-status-pill ts-status-neutral";
}

function gradeLabel(grade: CellGrade, locale: "ko" | "en"): string {
  if (locale === "ko") {
    if (grade === "lead") return "★ 선도";
    if (grade === "strong") return "● 강점";
    if (grade === "partial") return "◐ 부분";
    return "○ 비주력";
  }
  if (grade === "lead") return "★ Lead";
  if (grade === "strong") return "● Strong";
  if (grade === "partial") return "◐ Partial";
  return "○ Limited";
}

export function StudioBrushFilterMatrixSection({ locale }: { readonly locale: "ko" | "en" }) {
  const [kindFilter, setKindFilter] = useState<"all" | "brush" | "filter">("all");

  const visibleRows =
    kindFilter === "all"
      ? BRUSH_FILTER_COMPETITOR_ROWS
      : BRUSH_FILTER_COMPETITOR_ROWS.filter((row) => row.kind === kindFilter);

  return (
    <div
      data-testid="benchmark-brush-filter-3d-suite"
      className="space-y-8 [word-break:keep-all]"
    >
      {/* 1. 브러시 502종(등록 640종) · 무료 기본 필터 183종 글로벌 경쟁사 정밀 대조 */}
      <section
        aria-labelledby="bf-matrix-heading"
        className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <Brush size={14} aria-hidden="true" />
              <span>502 FREE BRUSHES (640 REGISTERED) · 183 FREE FILTERS · COMPETITOR DEEP DIVE</span>
            </p>
            <h2 id="bf-matrix-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
              {locale === "ko"
                ? "무료 기본 브러시 502종 · 무료 필터 183종 글로벌 경쟁사 정밀 대조"
                : "502 Selectable Free Brushes & 183 Free Filters — Global Competitor Breakdown"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
              {locale === "ko"
                ? `ToonStudio는 선택 가능 무료 기본 브러시 ${BRUSH_FILTER_SUMMARY_STATS.selectableFreeBrushes}종(Core+Pro ${BRUSH_FILTER_SUMMARY_STATS.coreProBrushes} + MyPaint CC0 ${BRUSH_FILTER_SUMMARY_STATS.mypaintCc0Brushes} + 글로벌 시그니처 ${BRUSH_FILTER_SUMMARY_STATS.globalSignatureFreeBrushes} · 전체 등록 ${BRUSH_FILTER_SUMMARY_STATS.totalRegisteredBrushes}종, 100% 무료)과 무료 기본 필터 ${BRUSH_FILTER_SUMMARY_STATS.freeFiltersTotal}종(스튜디오 ${BRUSH_FILTER_SUMMARY_STATS.studioCatalogFilters} + Photoshop-Web ${BRUSH_FILTER_SUMMARY_STATS.photoshopWebFilters} + 마스터 LUT/웹툰 ${BRUSH_FILTER_SUMMARY_STATS.masterLutWebtoonFilters})을 실측 정본 그대로 공개합니다. 경쟁 6개 도구의 실제 강점도 숨기지 않고 병기합니다.`
                : `ToonStudio ships ${BRUSH_FILTER_SUMMARY_STATS.selectableFreeBrushes} selectable free built-in brushes (${BRUSH_FILTER_SUMMARY_STATS.coreProBrushes} Core+Pro + ${BRUSH_FILTER_SUMMARY_STATS.mypaintCc0Brushes} MyPaint CC0 + ${BRUSH_FILTER_SUMMARY_STATS.globalSignatureFreeBrushes} Global Signature; ${BRUSH_FILTER_SUMMARY_STATS.totalRegisteredBrushes} total registered, 100% free) and ${BRUSH_FILTER_SUMMARY_STATS.freeFiltersTotal} free built-in filters (${BRUSH_FILTER_SUMMARY_STATS.studioCatalogFilters} Studio + ${BRUSH_FILTER_SUMMARY_STATS.photoshopWebFilters} Photoshop-Web + ${BRUSH_FILTER_SUMMARY_STATS.masterLutWebtoonFilters} Master LUT/Webtoon), while crediting every competitor's strengths transparently.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={locale === "ko" ? "브러시·필터 분류 필터" : "Filter brush and filter rows"}>
            {([
              ["all", locale === "ko" ? "전체 (6대 군)" : "All (6 Groups)"],
              ["brush", locale === "ko" ? "브러시 502종 (3)" : "502 Brushes (3)"],
              ["filter", locale === "ko" ? "필터 183종 (3)" : "183 Filters (3)"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`bf-filter-${id}`}
                aria-pressed={kindFilter === id}
                onClick={() => setKindFilter(id)}
                className={cn(
                  "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                  kindFilter === id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 코드베이스 실측 정본 KPI 4개 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div data-testid="bf-kpi-free-brushes" className="rounded-2xl border border-line bg-card p-3.5">
            <p className="text-[11px] font-semibold text-fg-3">
              {locale === "ko" ? "선택 가능 무료 기본 브러시" : "Selectable Free Built-In Brushes"}
            </p>
            <p className="mt-1 flex items-baseline gap-2 font-display text-2xl font-bold tabular-nums text-fg">
              <span>{BRUSH_FILTER_SUMMARY_STATS.selectableFreeBrushes}</span>
              <span className="text-xs font-semibold text-good">
                {locale === "ko"
                  ? `전체 등록 ${BRUSH_FILTER_SUMMARY_STATS.totalRegisteredBrushes}종 · 무료`
                  : `${BRUSH_FILTER_SUMMARY_STATS.totalRegisteredBrushes} registered · 100% free`}
              </span>
            </p>
            <p className="text-[11px] text-fg-2">
              {locale === "ko"
                ? `Core+Pro ${BRUSH_FILTER_SUMMARY_STATS.coreProBrushes} + MyPaint CC0 ${BRUSH_FILTER_SUMMARY_STATS.mypaintCc0Brushes} + 시그니처 ${BRUSH_FILTER_SUMMARY_STATS.globalSignatureFreeBrushes}`
                : `Core+Pro ${BRUSH_FILTER_SUMMARY_STATS.coreProBrushes} + MyPaint CC0 ${BRUSH_FILTER_SUMMARY_STATS.mypaintCc0Brushes} + Signature ${BRUSH_FILTER_SUMMARY_STATS.globalSignatureFreeBrushes}`}
            </p>
          </div>
          <div data-testid="bf-kpi-free-filters" className="rounded-2xl border border-line bg-card p-3.5">
            <p className="text-[11px] font-semibold text-fg-3">
              {locale === "ko" ? "무료 기본 필터 정본" : "Free Built-In Filters"}
            </p>
            <p className="mt-1 flex items-baseline gap-2 font-display text-2xl font-bold tabular-nums text-fg">
              <span>{BRUSH_FILTER_SUMMARY_STATS.freeFiltersTotal}</span>
              <span className="text-xs font-semibold text-cool">
                {locale === "ko"
                  ? `+ KM7 ${BRUSH_FILTER_SUMMARY_STATS.toonstudioSpectralPigmentFilters} · RGBA16F ${BRUSH_FILTER_SUMMARY_STATS.toonstudioCanonicalFilterNodes}`
                  : `+ ${BRUSH_FILTER_SUMMARY_STATS.toonstudioSpectralPigmentFilters} KM7 · ${BRUSH_FILTER_SUMMARY_STATS.toonstudioCanonicalFilterNodes} RGBA16F`}
              </span>
            </p>
            <p className="text-[11px] text-fg-2">
              {locale === "ko"
                ? `스튜디오 ${BRUSH_FILTER_SUMMARY_STATS.studioCatalogFilters} + Photoshop-Web ${BRUSH_FILTER_SUMMARY_STATS.photoshopWebFilters} + LUT/웹툰 ${BRUSH_FILTER_SUMMARY_STATS.masterLutWebtoonFilters}`
                : `Studio ${BRUSH_FILTER_SUMMARY_STATS.studioCatalogFilters} + Photoshop-Web ${BRUSH_FILTER_SUMMARY_STATS.photoshopWebFilters} + Master LUT ${BRUSH_FILTER_SUMMARY_STATS.masterLutWebtoonFilters}`}
            </p>
          </div>
          <div data-testid="bf-kpi-endurance-p95" className="rounded-2xl border border-line bg-card p-3.5">
            <p className="text-[11px] font-semibold text-fg-3">
              {locale === "ko" ? "10,000획 장시간 p95 실측" : "10,000-Stroke Endurance p95"}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-good">
              {BRUSH_FILTER_SUMMARY_STATS.measuredEnduranceP95Ms} ms
            </p>
            <p className="text-[11px] text-fg-2">
              {locale === "ko" ? "60fps 예산(16.6ms) 여유 통과" : "Well inside 16.6ms 60fps budget"}
            </p>
          </div>
          <div data-testid="bf-kpi-endurance-heap" className="rounded-2xl border border-line bg-card p-3.5">
            <p className="text-[11px] font-semibold text-fg-3">
              {locale === "ko" ? "10,000획 누적 힙 메모리 변동" : "10,000-Stroke Heap Delta"}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-cool">
              +{BRUSH_FILTER_SUMMARY_STATS.measuredEnduranceHeapDeltaMb} MB
            </p>
            <p className="text-[11px] text-fg-2">
              {locale === "ko" ? "128타일 LRU + OPFS Undo 스필" : "128-tile LRU + OPFS Undo spill"}
            </p>
          </div>
        </div>

        {/* 상세 비교 카드 목록 */}
        <div className="mt-5 space-y-4">
          {visibleRows.map((row) => (
            <article
              key={row.id}
              data-testid={`bf-row-${row.id}`}
              className="rounded-2xl border border-line bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="ts-status-pill ts-status-neutral">
                    {row.kind === "brush"
                      ? (locale === "ko" ? "브러시 군" : "Brush Family")
                      : (locale === "ko" ? "필터 군" : "Filter Suite")}
                  </span>
                  <h3 className="mt-1.5 text-base font-bold text-fg">
                    {pick(row.category, locale)}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {pick(row.toonstudioSpec, locale)}
                  </p>
                </div>
                <p className="font-mono text-[11px] text-fg-3">{row.repoEvidence}</p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {BENCHMARK_TOOLS.map((tool) => {
                  const cell = row.cells[tool.id];
                  return (
                    <div
                      key={tool.id}
                      className={cn(
                        "rounded-xl border p-2.5 text-xs",
                        tool.id === "toonstudio"
                          ? "border-accent/60 bg-accent-soft/40"
                          : "border-line bg-panel/70",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <strong className="truncate font-semibold text-fg">{tool.shortName}</strong>
                        <span className={gradeBadgeClass(cell.grade)}>
                          {gradeLabel(cell.grade, locale)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-4 text-fg-2">
                        {pick(cell.note, locale)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 2. 올인원 스튜디오 차세대 6대 핵심 역량 */}
      <section
        aria-labelledby="nextgen-capabilities-heading"
        data-testid="studio-nextgen-capabilities-section"
        className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          <Layers size={14} aria-hidden="true" />
          <span>ALL-IN-ONE STUDIO ENGINE · PPTX · DESIGN · CRDT · WEBXR · UHD 8K</span>
        </p>
        <h2 id="nextgen-capabilities-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
          {locale === "ko"
            ? "드로잉을 넘어선 차세대 올인원 스튜디오 6대 핵심 역량"
            : "6 Next-Gen All-in-One Studio Capabilities Beyond 2D Drawing"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
          {locale === "ko"
            ? "단순 페인팅 앱과 달리 실제 .pptx OOXML 제작, 미리캔버스·Canva·Figma 올인원 웹 디자인, HLC/CRDT 오프라인 무손실 병합, 홀로그램 WebXR 5-평면 웹툰, 아이디어→완성 웹툰 6단계 파이프라인, UHD 4K~8K 엣지 그리드까지 한 스튜디오에 통합했습니다."
            : "Unifies native .pptx OOXML authoring, MiriCanvas/Canva/Figma web design, HLC/CRDT lossless offline merging, 5-plane Holographic WebXR comics, a 6-stage Idea-to-Webtoon pipeline, and UHD 4K-8K edge rendering inside one workspace."}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STUDIO_NEXTGEN_CAPABILITY_CARDS.map((card) => (
            <article
              key={card.id}
              data-testid={`nextgen-capability-${card.id}`}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-card p-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="ts-status-pill ts-status-neutral">
                    {pick(card.categoryTag, locale)}
                  </span>
                  <span className={cn("ts-status-pill shrink-0", card.status === "verified" ? "ts-status-good" : "ts-status-cool")}>
                    {card.status === "verified"
                      ? (locale === "ko" ? "수학 검증" : "Verified")
                      : (locale === "ko" ? "엔진 내재화" : "Engine Shipped")}
                  </span>
                </div>
                <h3 className="text-sm font-bold leading-5 text-fg sm:text-base">
                  {pick(card.title, locale)}
                </h3>
                <p className="rounded-xl bg-raised px-3 py-2 font-mono text-[11px] font-semibold text-fg">
                  {pick(card.headlineMetric, locale)}
                </p>
                <p className="text-xs leading-5 text-fg-2">
                  {pick(card.summary, locale)}
                </p>
                <p className="border-t border-line/60 pt-2 text-xs leading-5 text-fg-3">
                  {pick(card.competitorEdge, locale)}
                </p>
              </div>
              <p className="font-mono text-[11px] text-cool">
                {card.repoAnchor}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3. 수치화 가능 항목 실측 & 필기감·초고해상도·장시간 안정성 비교 */}
      <section
        aria-labelledby="quant-perf-heading"
        className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          <Gauge size={14} aria-hidden="true" />
          <span>QUANTITATIVE PERFORMANCE · UHD EDGE · FEEL · LONG-SESSION STABILITY</span>
        </p>
        <h2 id="quant-perf-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
          {locale === "ko"
            ? "성능 · 초고해상도 엣지 · 필기감 · 장시간 안정성 실측 정량 지표"
            : "Quantitative Performance, UHD Edge Snap, Tactile Feel & Stability Metrics"}
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {QUANTITATIVE_PERFORMANCE_METRICS.map((metric) => (
            <article
              key={metric.id}
              data-testid={`quant-metric-${metric.id}`}
              className="space-y-2 rounded-2xl border border-line bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-fg sm:text-base">{pick(metric.label, locale)}</h3>
                <span className={cn("ts-status-pill shrink-0", metric.status === "measured" ? "ts-status-good" : "ts-status-cool")}>
                  {metric.status === "measured"
                    ? (locale === "ko" ? "실측 완료" : "Measured")
                    : (locale === "ko" ? "코드 불변식" : "Verified Spec")}
                </span>
              </div>
              <p className="rounded-xl bg-raised px-3 py-2 font-mono text-xs font-semibold text-fg">
                {pick(metric.toonstudioMeasured, locale)}
              </p>
              <p className="text-xs leading-5 text-fg-2">{pick(metric.measurementBasis, locale)}</p>
              <p className="border-t border-line/60 pt-2 text-xs leading-5 text-fg-3">
                <SlidersHorizontal size={12} className="mr-1 inline" aria-hidden="true" />
                {pick(metric.competitorBaseline, locale)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 4. 3D 캐릭터 셰이퍼 솔직한 현황 진단 & 경쟁사 추월 4대 돌파 로드맵 */}
      <section
        aria-labelledby="shaper-3d-heading"
        className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
      >
        <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
          <Box size={14} aria-hidden="true" />
          <span>3D CHARACTER SHAPER — CANDID GAP & BREAKTHROUGH PLAN</span>
        </p>
        <h2 id="shaper-3d-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
          {locale === "ko"
            ? "3D 셰이퍼 모델링 품질 진단 및 VRoid · CC4 추월 4대 핵심 방안"
            : "3D Shaper Quality Diagnosis & 4-Pillar Plan to Outpace VRoid & CC4"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
          {locale === "ko"
            ? "현재 절차적 기본 캐릭터의 미형·다양성 한계를 숨기지 않고 진단하며, 웹툰 실무에 바로 투입 가능한 4대 돌파 아키텍처를 단계별 내재화하고 있습니다."
            : "Candidly diagnoses where procedural characters still trail VRoid Studio and CC4 today, paired with our 4-pillar architecture to win webtoon production."}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {SHAPER_3D_BREAKTHROUGH_PILLARS.map((pillar) => (
            <article
              key={pillar.id}
              data-testid={`shaper-pillar-${pillar.id}`}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-card p-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-fg sm:text-base">{pick(pillar.title, locale)}</h3>
                  <span className={cn("ts-status-pill shrink-0", pillar.status === "current" ? "ts-status-good" : "ts-status-warn")}>
                    {pillar.status === "current"
                      ? (locale === "ko" ? "기반 구현" : "Shipped Base")
                      : (locale === "ko" ? "고도화 트랙" : "Active Upgrade")}
                  </span>
                </div>
                <p className="text-xs leading-5 text-fg-3">
                  <strong className="font-semibold text-fg-2">
                    {locale === "ko" ? "솔직한 현재 한계: " : "Honest current gap: "}
                  </strong>
                  {pick(pillar.honestGapNow, locale)}
                </p>
                <p className="text-xs leading-5 text-fg-2">
                  <strong className="font-semibold text-fg">
                    {locale === "ko" ? "추월 해법: " : "Breakthrough: "}
                  </strong>
                  {pick(pillar.breakthroughArchitecture, locale)}
                </p>
              </div>
              <p className="border-t border-line/60 pt-2 font-mono text-[11px] text-cool">
                {pillar.repoAnchor}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
