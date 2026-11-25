/**
 * 실측 런타임 의존성 중복 감사 & Rust·WASM64 드로잉 엔진 전환 제어판 UI.
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 · 바이올렛 계열 · 광범위 전이 · 장식 아이콘 · 기본 빈 객체 props · 브라우저 스토리지 0건)
 * - 순수 시맨틱 SVG(`oklch`/`currentColor` 전용)로 중복 의존성 수렴 추이와 Rust·WASM64 전환 게이지를 시각화한다.
 */

import {
  AlertTriangle, Check, CheckCircle2, Code2, Copy, Cpu, FileText, Filter, Layers, Package, ShieldCheck,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  DEPENDENCY_AUDIT_CATEGORIES,
  DEPENDENCY_CUTOVER_WAVES,
  MEASURED_DEPENDENCY_AUDIT_CATALOG,
  evaluateDependencyCutoverPlan,
  exportDependencyAuditJson,
  exportDependencyAuditMarkdown,
  type DependencyCategoryFilter,
  type DependencyCutoverPlanResult,
  type DependencyCutoverVerdict,
  type DependencyCutoverWave,
  type DependencyOverlapGroupId,
} from "./dependency-wasm64-audit-engine";

export interface StudioDependencyWasm64AuditPanelProps {
  readonly initialWave?: DependencyCutoverWave;
  readonly initialCategory?: DependencyCategoryFilter;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: DependencyCutoverPlanResult) => void;
  readonly onExportMarkdown?: (markdown: string, plan: DependencyCutoverPlanResult) => void | Promise<void>;
}

type ExportPreviewTab = "markdown" | "json" | "hidden";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} border border-accent bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_OKLCH_RUST = "oklch(0.62 0.14 158)";
const SVG_OKLCH_OVERLAP = "oklch(0.62 0.13 218)";
const SVG_OKLCH_WARN = "oklch(0.72 0.14 78)";

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function verdictMeta(verdict: DependencyCutoverVerdict, isEn: boolean): { readonly label: string; readonly toneClass: string } {
  if (verdict === "replace-with-rust-wasm64") {
    return { label: isEn ? "Rust · WASM64" : "Rust·WASM64 대체", toneClass: "border-good/40 bg-good/15 text-good" };
  }
  if (verdict === "consolidate-single-lib") {
    return { label: isEn ? "Consolidate Lib" : "단일 라이브러리 통합", toneClass: "border-cool/40 bg-cool/15 text-cool" };
  }
  if (verdict === "lazy-isolate-chunk") {
    return { label: isEn ? "Lazy Chunk" : "지연 청크 격리", toneClass: "border-warn/40 bg-warn/15 text-warn" };
  }
  return { label: isEn ? "Platform Core" : "플랫폼 코어 유지", toneClass: "border-line-strong bg-raised text-fg-2" };
}

function AuditMetricCard(props: {
  readonly label: string; readonly value: string; readonly detail: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, detail, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{detail}</div>
    </div>
  );
}

function DependencyConvergenceSvg(props: {
  readonly plan: DependencyCutoverPlanResult; readonly isEn: boolean;
}): ReactElement {
  const { plan, isEn } = props;
  const radius = 34;
  const circumference = Math.round(2 * Math.PI * radius * 10) / 10;
  const rustDash = Math.round((plan.metrics.rustWasm64CoveragePct / 100) * circumference * 10) / 10;
  const overlapDash = Math.round((plan.metrics.overlapResolutionPct / 100) * circumference * 10) / 10;

  return (
    <svg
      data-testid="dep-audit-convergence-svg"
      data-target-wave={plan.targetWave}
      data-rust-coverage={plan.metrics.rustWasm64CoveragePct}
      data-overlap-resolution={plan.metrics.overlapResolutionPct}
      data-safari-mode={plan.safariCompatibilityMode}
      viewBox="0 0 640 168"
      className="h-auto w-full text-fg"
      role="img"
      aria-label={
        isEn
          ? `Wave ${plan.targetWave} overlap convergence ${plan.metrics.overlapResolutionPct}% and Rust WASM64 coverage ${plan.metrics.rustWasm64CoveragePct}%`
          : `Wave ${plan.targetWave} 중복군 해소율 ${plan.metrics.overlapResolutionPct}% 및 Rust·WASM64 전환율 ${plan.metrics.rustWasm64CoveragePct}% 도해`
      }
    >
      <rect x="2" y="2" width="636" height="164" rx="12" className="text-card" fill="currentColor" />
      <rect x="2" y="2" width="636" height="164" rx="12" className="text-line-strong" fill="none" stroke="currentColor" strokeWidth="1" />

      <g transform="translate(74, 80)">
        <circle cx="0" cy="0" r={radius} className="text-raised" fill="none" stroke="currentColor" strokeWidth="8" />
        <circle cx="0" cy="0" r={radius} fill="none" stroke={SVG_OKLCH_OVERLAP} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${overlapDash} ${circumference}`} transform="rotate(-90)" />
        <text x="0" y="2" textAnchor="middle" className="text-fg" fill="currentColor" fontSize="14" fontWeight="700">{`${plan.metrics.overlapResolutionPct}%`}</text>
        <text x="0" y="16" textAnchor="middle" className="text-fg-3" fill="currentColor" fontSize="8.5" fontWeight="600">{isEn ? "Overlap" : "중복 해소"}</text>
        <text x="0" y="56" textAnchor="middle" className="text-fg-2" fill="currentColor" fontSize="9.5" fontWeight="600">
          {isEn ? `${plan.metrics.resolvedOverlapGroupCount}/${plan.metrics.overlapGroupCount} groups` : `${plan.metrics.resolvedOverlapGroupCount}/${plan.metrics.overlapGroupCount}군 완료`}
        </text>
      </g>

      <g transform="translate(184, 80)">
        <circle cx="0" cy="0" r={radius} className="text-raised" fill="none" stroke="currentColor" strokeWidth="8" />
        <circle cx="0" cy="0" r={radius} fill="none" stroke={plan.maintainSafariWasm32Fallback ? SVG_OKLCH_RUST : SVG_OKLCH_WARN} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${rustDash} ${circumference}`} transform="rotate(-90)" />
        <text x="0" y="2" textAnchor="middle" className="text-fg" fill="currentColor" fontSize="14" fontWeight="700">{`${plan.metrics.rustWasm64CoveragePct}%`}</text>
        <text x="0" y="16" textAnchor="middle" className="text-fg-3" fill="currentColor" fontSize="8.5" fontWeight="600">Rust·W64</text>
        <text x="0" y="56" textAnchor="middle" className="text-fg-2" fill="currentColor" fontSize="9.5" fontWeight="600">
          {isEn ? `${plan.metrics.replaceWithRustWasm64Count}/${plan.metrics.totalReplaceableInScope} pkgs` : `${plan.metrics.replaceWithRustWasm64Count}/${plan.metrics.totalReplaceableInScope}종 전환`}
        </text>
      </g>

      <line x1="252" y1="18" x2="252" y2="150" className="text-line-strong" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />

      <text x="272" y="28" className="text-fg" fill="currentColor" fontSize="10.5" fontWeight="700">
        {isEn ? "Wave 1 -> 4 Dependency Convergence & Rust Coverage" : "Wave 1 → 4 누적 중복 해소 · Rust/WASM64 전환 추이"}
      </text>
      <text x="618" y="28" textAnchor="end" className="text-fg-3" fill="currentColor" fontSize="9" fontWeight="600">
        {plan.maintainSafariWasm32Fallback
          ? isEn ? "Safari wasm32 4GiB Guard ON" : "Safari wasm32 4GiB 폴백 활성"
          : isEn ? "wasm64-only (Safari risk)" : "wasm64 단독 (Safari 주의)"}
      </text>

      {plan.waveBreakdown.map((point, index) => {
        const y = 44 + index * 27;
        const barMaxW = 246;
        const overlapW = Math.max(4, Math.round((point.cumulativeOverlapResolutionPct / 100) * barMaxW));
        const rustW = Math.round((point.cumulativeRustCoveragePct / 100) * barMaxW);
        const isCurrent = point.wave === plan.targetWave;
        const isReached = point.wave <= plan.targetWave;
        return (
          <g key={point.wave} data-svg-wave={point.wave} data-svg-reached={String(isReached)}>
            <text x="272" y={y + 11} className={isCurrent ? "text-accent" : isReached ? "text-fg" : "text-fg-3"} fill="currentColor" fontSize="10" fontWeight={isCurrent ? "700" : "600"}>
              {`W${point.wave}`}
            </text>
            <rect x="300" y={y + 1} width={barMaxW} height="13" rx="6.5" className="text-raised" fill="currentColor" />
            <rect x="300" y={y + 1} width={overlapW} height="6" rx="3" fill={SVG_OKLCH_OVERLAP} fillOpacity={isReached ? 0.95 : 0.32} />
            {rustW > 0 ? <rect x="300" y={y + 8} width={Math.max(4, rustW)} height="6" rx="3" fill={SVG_OKLCH_RUST} fillOpacity={isReached ? 0.95 : 0.32} /> : null}
            <text x="618" y={y + 11} textAnchor="end" className={isReached ? "text-fg-2" : "text-fg-3"} fill="currentColor" fontSize="9.5" fontWeight="600">
              {`${point.cumulativeOverlapResolutionPct}% · R${point.cumulativeRustCoveragePct}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 실측 런타임 의존성 정밀 감사 및 Rust·WASM64 드로잉 엔진 단계적 전환 플래너 패널. */
export function StudioDependencyWasm64AuditPanel(props: StudioDependencyWasm64AuditPanelProps): ReactElement {
  const {
    initialWave = 1,
    initialCategory = "all",
    locale = "ko",
    className,
    onPlanChange,
    onExportMarkdown,
  } = props;

  const headingId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [targetWave, setTargetWave] = useState<DependencyCutoverWave>(initialWave);
  const [categoryFilter, setCategoryFilter] = useState<DependencyCategoryFilter>(initialCategory);
  const [maintainSafariFallback, setMaintainSafariFallback] = useState<boolean>(true);
  const [highlightedGroupId, setHighlightedGroupId] = useState<DependencyOverlapGroupId | null>(null);
  const [exportTab, setExportTab] = useState<ExportPreviewTab>("markdown");
  const [copyResult, setCopyResult] = useState<{ plan: DependencyCutoverPlanResult; tab: ExportPreviewTab; copied: boolean; notified: boolean } | null>(null);
  const copyRequest = useRef(0);

  const plan = useMemo<DependencyCutoverPlanResult>(
    () => evaluateDependencyCutoverPlan({ targetWave, categoryFilter, maintainSafariWasm32Fallback: maintainSafariFallback }),
    [targetWave, categoryFilter, maintainSafariFallback],
  );
  const markdownReport = useMemo<string>(() => exportDependencyAuditMarkdown(plan, locale), [plan, locale]);
  const jsonReport = useMemo<string>(() => exportDependencyAuditJson(plan), [plan]);

  useEffect(() => {
    onPlanChange?.(plan);
  }, [plan, onPlanChange]);

  const effectiveHighlightedGroup = useMemo<DependencyOverlapGroupId | null>(
    () => (highlightedGroupId && plan.overlapGroups.some((g) => g.groupId === highlightedGroupId) ? highlightedGroupId : null),
    [highlightedGroupId, plan.overlapGroups],
  );

  const handleToggleOverlapGroup = (groupId: DependencyOverlapGroupId): void => {
    setHighlightedGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const handleCopyExport = async (): Promise<void> => {
    const request = ++copyRequest.current;
    const tab = exportTab === "json" ? "json" : "markdown";
    if (exportTab === "hidden") setExportTab(tab);
    setCopyResult(null);
    const copying = copyText(tab === "json" ? jsonReport : markdownReport);
    let notified = true;
    try {
      if (tab === "markdown") await onExportMarkdown?.(markdownReport, plan);
    } catch {
      notified = false;
    }
    const copied = await copying;
    if (copyRequest.current === request) setCopyResult({ plan, tab, copied, notified });
  };
  const copyFeedback = copyResult?.plan === plan && copyResult.tab === exportTab ? copyResult : null;

  const categoryCounts = useMemo(() => {
    const counts: Record<DependencyCategoryFilter, number> = {
      all: MEASURED_DEPENDENCY_AUDIT_CATALOG.length,
      "2d-canvas-renderer": 0, "stroke-geometry": 0, "color-physics": 0, "3d-cad-engine": 0, "image-vision": 0,
    };
    for (const entry of MEASURED_DEPENDENCY_AUDIT_CATALOG) counts[entry.category] += 1;
    return counts;
  }, []);

  return (
    <section
      data-testid="dependency-wasm64-audit-panel"
      aria-labelledby={headingId}
      className={`flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-semibold text-fg">
              {pick("런타임 의존성 중복 감사 · Rust/WASM64 전환 플래너", "Runtime Dependency Audit & Rust/WASM64 Cutover Planner")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              `루트 ${plan.manifestPath} 의존성 ${plan.rootRuntimeDependencyCount}종 · ${plan.measuredAt} 의존성 기록으로 전환 계획을 살펴봅니다.`,
              `Review cutover plans with the ${plan.measuredAt} catalog and ${plan.rootRuntimeDependencyCount} dependencies in ${plan.manifestPath}.`,
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="dep-audit-scope-badge" className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 tabular-nums">
            {plan.auditScopeKind}
          </span>
          <span data-testid="dep-audit-wasm-size-badge" className="inline-flex items-center rounded-full border border-good/40 bg-good/15 px-2.5 py-1 text-xs font-semibold text-good tabular-nums">
            {`Rust Core ${formatKiB(plan.rustCoreWasmMeasuredBytes)}`}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("전환 웨이브 선택", "Select cutover wave")}>
            {DEPENDENCY_CUTOVER_WAVES.map((w) => (
              <button
                key={w.wave}
                type="button"
                data-testid={`dep-audit-wave-${w.wave}`}
                aria-pressed={targetWave === w.wave}
                onClick={() => setTargetWave(w.wave)}
                className={targetWave === w.wave ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <span className="tabular-nums">{`Wave ${w.wave}`}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={maintainSafariFallback}
            data-testid="dep-audit-safari-switch"
            onClick={() => setMaintainSafariFallback((prev) => !prev)}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
              maintainSafariFallback ? "border-good/40 bg-good/15 text-good" : "border-warn/40 bg-warn/15 text-warn"
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{maintainSafariFallback ? pick("iOS Safari WASM32 폴백 유지", "Safari WASM32 Fallback ON") : pick("Safari WASM32 폴백 꺼짐", "Safari WASM32 Fallback OFF")}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("의존성 카테고리 필터", "Dependency category filter")}>
          <Filter className="mr-1 h-3.5 w-3.5 text-fg-3" aria-hidden="true" />
          <button type="button" data-testid="dep-audit-cat-all" aria-pressed={categoryFilter === "all"} onClick={() => setCategoryFilter("all")} className={categoryFilter === "all" ? BTN_ACTIVE : BTN_OUTLINE}>
            <span>{pick("전체", "All")}</span>
            <span className="tabular-nums text-fg-3">{categoryCounts.all}</span>
          </button>
          {DEPENDENCY_AUDIT_CATEGORIES.map((cat) => (
            <button key={cat.id} type="button" data-testid={`dep-audit-cat-${cat.id}`} aria-pressed={categoryFilter === cat.id} onClick={() => setCategoryFilter(cat.id)} className={categoryFilter === cat.id ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{isEn ? cat.labelEn : cat.labelKo}</span>
              <span className="tabular-nums text-fg-3">{categoryCounts[cat.id]}</span>
            </button>
          ))}
        </div>

        {plan.safariCompatibilityWarningKo && plan.safariCompatibilityWarningEn ? (
          <div data-testid="dep-audit-safari-warning" role="alert" className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/15 px-3 py-2 text-xs text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{isEn ? plan.safariCompatibilityWarningEn : plan.safariCompatibilityWarningKo}</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <AuditMetricCard
          testId="dep-audit-kpi-removable"
          label={pick("제거·통합 패키지", "Removable / Consolidated")}
          value={`${plan.metrics.removableOrConsolidatableCount} / ${plan.metrics.totalAuditedPackages}`}
          detail={pick(`Rust 대체 ${plan.metrics.replaceWithRustWasm64Count} · 단일 통합 ${plan.metrics.consolidateSingleLibCount}`, `Rust ${plan.metrics.replaceWithRustWasm64Count} · Consolidate ${plan.metrics.consolidateSingleLibCount}`)}
          valueTone="text-accent"
        />
        <AuditMetricCard
          testId="dep-audit-kpi-overlap"
          label={pick("중복군 해소율", "Overlap Resolution")}
          value={`${plan.metrics.overlapResolutionPct}%`}
          detail={pick(`${plan.metrics.resolvedOverlapGroupCount}/${plan.metrics.overlapGroupCount} 중복군 완료`, `${plan.metrics.resolvedOverlapGroupCount}/${plan.metrics.overlapGroupCount} groups resolved`)}
          valueTone={plan.metrics.overlapResolutionPct >= 80 ? "text-good" : "text-cool"}
        />
        <AuditMetricCard
          testId="dep-audit-kpi-rust-coverage"
          label={pick("Rust·WASM64 전환 계획", "Rust/WASM64 Cutover Plan")}
          value={`${plan.metrics.rustWasm64CoveragePct}%`}
          detail={pick(`대상 ${plan.metrics.replaceWithRustWasm64Count}/${plan.metrics.totalReplaceableInScope}종 전환`, `${plan.metrics.replaceWithRustWasm64Count}/${plan.metrics.totalReplaceableInScope} replaceable`)}
          valueTone={plan.metrics.rustWasm64CoveragePct >= 75 ? "text-good" : "text-fg"}
        />
        <AuditMetricCard
          testId="dep-audit-kpi-imports"
          label={pick("기록된 임포트 수", "Catalog Import Count")}
          value={`${plan.metrics.addressedImportFileCount} / ${plan.metrics.totalMeasuredImportFiles}`}
          detail={pick(`운영 소스 총 ${plan.metrics.totalMeasuredProdImportFiles}건`, `${plan.metrics.totalMeasuredProdImportFiles} prod imports`)}
        />
      </div>

      <DependencyConvergenceSvg plan={plan} isEn={isEn} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("중복 의존성군 하이라이트 (클릭하여 매트릭스 강조)", "Overlap Groups (Click to Highlight Matrix)")}</span>
          </div>
          {effectiveHighlightedGroup ? (
            <button type="button" data-testid="dep-audit-clear-highlight" onClick={() => setHighlightedGroupId(null)} className={BTN_OUTLINE}>
              {pick("강조 해제", "Clear Highlight")}
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.overlapGroups.map((group) => {
            const selected = effectiveHighlightedGroup === group.groupId;
            return (
              <button
                key={group.groupId}
                type="button"
                data-testid={`dep-audit-overlap-${group.groupId}`}
                aria-pressed={selected}
                onClick={() => handleToggleOverlapGroup(group.groupId)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                  selected ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{isEn ? group.labelEn : group.labelKo}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${group.isFullyResolved ? "border-good/40 bg-good/15 text-good" : "border-cool/40 bg-cool/15 text-cool"}`}>
                    {`${group.resolutionPct}%`}
                  </span>
                </div>
                <span className="text-[11px] text-fg-2 tabular-nums">
                  {pick(`패키지 ${group.totalPackages}종 · 해소 ${group.addressedActionablePackages}/${group.actionablePackages}`, `${group.totalPackages} pkgs · ${group.addressedActionablePackages}/${group.actionablePackages} addressed`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
          <Package className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick(`패키지별 임포트 기록과 전환 제안 (${plan.entries.length}종)`, `Package Import Catalog and Cutover Plan (${plan.entries.length})`)}</span>
        </div>

        <div data-testid="dep-audit-matrix" className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-raised text-[11px] font-semibold text-fg-2">
                <th className="px-3 py-2">{pick("패키지 · 기록된 버전", "Package · Recorded Version")}</th>
                <th className="px-3 py-2 text-right">{pick("임포트(운영/테스트)", "Imports (P/T)")}</th>
                <th className="px-3 py-2">{pick("중복군 · 단계", "Overlap · Wave")}</th>
                <th className="px-3 py-2">{pick("전환 판정", "Verdict")}</th>
                <th className="px-3 py-2">{pick("대응 Rust·WASM64 모듈", "Target Rust/WASM64 Module")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {plan.entries.map((entry) => {
                const isActiveWave = entry.cutoverWave <= plan.targetWave;
                const isHighlighted = effectiveHighlightedGroup === entry.overlapGroupId;
                const isDimmed = effectiveHighlightedGroup !== null && !isHighlighted;
                const badge = verdictMeta(entry.verdict, isEn);
                return (
                  <tr
                    key={entry.packageName}
                    data-testid={`dep-audit-row-${entry.packageName}`}
                    data-highlighted={String(isHighlighted)}
                    data-wave-state={isActiveWave ? "active" : "deferred"}
                    className={`transition-colors motion-reduce:transition-none ${isHighlighted ? "bg-accent-soft/60" : isActiveWave ? "bg-card" : "bg-raised/40"} ${isDimmed ? "opacity-45" : "opacity-100"}`}
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono font-semibold text-fg">{entry.packageName}</div>
                      <div className="text-[11px] text-fg-3 tabular-nums">{entry.version}</div>
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums">
                      <div className="font-semibold text-fg">{entry.importFileCount}</div>
                      <div className="text-[11px] text-fg-3">{`${entry.prodImportFileCount} / ${entry.testImportFileCount}`}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-fg-2">{isEn ? entry.overlapGroupLabelEn : entry.overlapGroupLabelKo}</div>
                      <div className="text-[11px] text-fg-3 tabular-nums">{`Wave ${entry.cutoverWave} · ${isActiveWave ? pick("포함", "In scope") : pick("후속", "Deferred")}`}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.toneClass}`}>{badge.label}</span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-[11px] text-fg">{entry.rustTargetModule}</div>
                      <div className="mt-0.5 text-[11px] text-fg-3">{isEn ? entry.zeroDiffGateEn : entry.zeroDiffGateKo}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div data-testid="dep-audit-checklist" className="space-y-2 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            <span>{pick("단계별 실행 체크리스트", "Wave Execution Checklist")}</span>
          </div>
          {plan.checklist.length === 0 ? (
            <p className="text-xs text-fg-3">{pick("선택한 웨이브·카테고리에 신규 전환 항목이 없습니다.", "No actionable cutover steps in this wave/category.")}</p>
          ) : (
            <ul className="space-y-2">
              {plan.checklist.map((step) => (
                <li key={step.id} className="rounded-md border border-line bg-raised p-2.5 text-xs">
                  <div className="font-semibold text-fg">{isEn ? step.titleEn : step.titleKo}</div>
                  <div className="mt-1 font-mono text-[11px] text-fg-2">{step.targetPackages.join(", ")}</div>
                  <div className="mt-1 text-[11px] text-fg-3">{isEn ? step.safariFallbackDirectiveEn : step.safariFallbackDirectiveKo}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div data-testid="dep-audit-scope-disclosure" className="space-y-2 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
            <span>{pick("전환 전에 확인할 항목", "Checks Before Cutover")}</span>
          </div>
          <p className="text-[11px] text-fg-2">
            {pick("이 예제는 저장소 임포트 기록을 사용합니다. 현재 임포트 수, 번들 크기, 실기기 FPS는 전환 전에 다시 확인하세요.", "This example uses a recorded import catalog. Recheck import counts, bundle size, and device FPS before cutover.")}
          </p>
          <ul className="space-y-1.5">
            {plan.unmeasuredBoundaries.map((item) => (
              <li key={item.id} className="rounded-md border border-line bg-raised px-2.5 py-2 text-[11px] text-fg-2">
                <div>{isEn ? item.labelEn : item.labelKo}</div>
                <code className="mt-0.5 block font-mono text-fg-3">{item.verificationCommand}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="dep-audit-tab-markdown" aria-pressed={exportTab === "markdown"} onClick={() => setExportTab("markdown")} className={exportTab === "markdown" ? BTN_ACTIVE : BTN_OUTLINE}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ADR Markdown</span>
            </button>
            <button type="button" data-testid="dep-audit-tab-json" aria-pressed={exportTab === "json"} onClick={() => setExportTab("json")} className={exportTab === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>JSON</span>
            </button>
            <button type="button" data-testid="dep-audit-tab-hidden" aria-pressed={exportTab === "hidden"} onClick={() => setExportTab("hidden")} className={exportTab === "hidden" ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{pick("미리보기 닫기", "Hide Preview")}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {copyFeedback ? (
              <span role="status" data-testid="dep-audit-copy-status" className="inline-flex items-center gap-1 text-xs font-medium text-fg-2">
                {copyFeedback.copied && <Check className="h-3.5 w-3.5 text-good" aria-hidden="true" />}
                {copyFeedback.copied ? pick("보고서를 복사했습니다.", "Copied the report.") : pick("미리보기에서 직접 복사해 주세요.", "Copy from the preview.")}
                {!copyFeedback.notified && pick(" 내보내기 알림은 전달하지 못했습니다.", " The export receiver was not notified.")}
              </span>
            ) : null}
            <button type="button" data-testid="dep-audit-copy-btn" onClick={() => void handleCopyExport()} className={BTN_SOLID}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{exportTab === "json" ? pick("JSON 복사", "Copy JSON") : pick("ADR Markdown 복사", "Copy ADR Markdown")}</span>
            </button>
          </div>
        </div>

        {exportTab !== "hidden" ? (
          <pre data-testid="dep-audit-export-preview" className="max-h-56 overflow-auto rounded-md border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {exportTab === "json" ? jsonReport : markdownReport}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
