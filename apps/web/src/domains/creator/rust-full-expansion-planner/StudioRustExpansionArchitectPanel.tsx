/**
 * Wave 52D — ToonStudio 760K+ LOC 전면 Rust/WASM64 · WebGPU · NPU 전환 아키텍처 대시보드 패널.
 *
 * - 2026-11-25 저장소 실측 9대 서브시스템(2,411파일 · 818,866 LOC) 및 현행 Rust 3크레이트(9,345 LOC) 기반
 * - 4단계 전환 페이즈(Phase 1~4) + 4대 플랫폼 호환성 필터 + 순수 시맨틱 SVG 9대 서브시스템 스택 바 도표
 * - 9대 서브시스템 상세 매트릭스 + 핵심 리스크·완화 전략 + ADR Markdown / JSON 미리보기·복사
 * - Calm Atelier 시맨틱 토큰 & 탈-바이올렛 OKLCH 전용(원시 색상 0건, 브라우저 스토리지 미사용, = {} 금지)
 */

import {
  AlertTriangle, Check, CheckCircle2, Cpu, Eye, FileCode2, FileJson,
  Gauge, HardDrive, Layers, RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  EXPANSION_PLATFORM_PROFILES, EXPANSION_WAVE_PHASES,
  exportRustExpansionAdrMarkdown, exportRustExpansionJson, simulateExpansionRoadmap,
  type ActiveExpansionRisk, type ExpansionRoadmapSimulation,
  type ExpansionTargetPlatformId, type ExpansionWavePhase,
} from "./rust-expansion-planner-engine";

export interface StudioRustExpansionArchitectPanelProps {
  readonly initialPhase?: ExpansionWavePhase;
  readonly initialPlatform?: ExpansionTargetPlatformId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: ExpansionRoadmapSimulation) => void;
  readonly onExportMarkdown?: (markdown: string, plan: ExpansionRoadmapSimulation) => void;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(WASM32 155°, WASM64 215°, WebGPU 185°, WebNN 48°, TS유지 85°, 경보 25°)
const SVG_INK_WASM32 = "oklch(0.55 0.14 155)";
const SVG_INK_WASM64 = "oklch(0.54 0.13 215)";
const SVG_INK_WEBGPU = "oklch(0.58 0.13 185)";
const SVG_INK_WEBNN = "oklch(0.62 0.15 48)";
const SVG_INK_TS_SHELL = "oklch(0.68 0.11 85)";
const SVG_INK_ALERT = "oklch(0.57 0.20 25)";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

type ExportPreviewMode = "closed" | "markdown" | "json";
const fmt = (value: number): string => value.toLocaleString("en-US");

function riskToneClass(severity: ActiveExpansionRisk["severity"]): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "high" ? "border-warn bg-warning-soft text-warn" : "border-line bg-raised text-fg-2";
}

function addressSpaceToneClass(plan: ExpansionRoadmapSimulation): string {
  if (plan.addressSpace.memory64FallbackActive) return "border-warn bg-warning-soft text-warn";
  return plan.addressSpace.effectiveBits === 64 ? "border-good bg-good-soft text-good" : "border-line bg-card text-fg";
}

function SubsystemCoverageStackSvg(props: {
  readonly plan: ExpansionRoadmapSimulation;
  readonly isEn: boolean;
}): ReactElement {
  const { plan, isEn } = props;
  const barX = 166;
  const barW = 428;
  const rowStartY = 54;
  const rowPitch = 28;
  const barH = 16;
  const legendY = rowStartY + plan.subsystems.length * rowPitch + 18;
  const viewH = legendY + 42;
  const toPx = (pct: number): number => Math.round(((Math.max(0, Math.min(100, pct)) / 100) * barW) * 10) / 10;

  return (
    <svg
      data-testid="expansion-coverage-svg"
      data-target-phase={String(plan.targetPhase)}
      data-platform-id={plan.platform.id}
      data-address-bits={String(plan.addressSpace.effectiveBits)}
      data-native-pct={String(plan.totals.migratedNativePct)}
      viewBox={`0 0 680 ${viewH}`}
      role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={
        isEn
          ? `9-subsystem Rust, WebGPU and NPU coverage stacked bar chart for Phase ${plan.targetPhase} on ${plan.platform.labelEn}`
          : `Phase ${plan.targetPhase} · ${plan.platform.shortLabelKo} 기준 9대 서브시스템 Rust·WebGPU·NPU 전환 커버리지 스택 바 도표`
      }
    >
      <rect x="10" y="10" width="660" height={viewH - 20} rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="30" fill="currentColor" fillOpacity={0.82} fontSize="11" fontWeight="700">
        {isEn
          ? `9-SUBSYSTEM RUST / WEBGPU / NPU COVERAGE (PHASE ${plan.targetPhase} · ${plan.platform.shortLabelEn.toUpperCase()})`
          : `9대 서브시스템 Rust · WebGPU · NPU 전환 커버리지 (Phase ${plan.targetPhase} · ${plan.platform.shortLabelKo})`}
      </text>
      <text x="656" y="30" textAnchor="end" fill={plan.addressSpace.memory64FallbackActive ? SVG_INK_ALERT : SVG_INK_WASM32} fontSize="10" fontWeight="700">
        {isEn
          ? `NATIVE ${plan.totals.migratedNativePct}% · ${plan.addressSpace.effectiveBits}-BIT`
          : `네이티브 ${plan.totals.migratedNativePct}% · ${plan.addressSpace.effectiveBits}비트`}
      </text>

      {plan.subsystems.map((item, idx) => {
        const y = rowStartY + idx * rowPitch;
        const w32 = toPx(item.stackPct.rustWasm32SimdPct);
        const w64 = toPx(item.stackPct.rustWasm64Pct);
        const wGpu = toPx(item.stackPct.webgpuSubgroupsF16Pct);
        const wNn = toPx(item.stackPct.webnnNpuPct);
        const wTs = toPx(item.stackPct.tsUiImeRetainedPct);
        const wDef = Math.max(0, Math.round((barW - (w32 + w64 + wGpu + wNn + wTs)) * 10) / 10);
        const x64 = barX + w32;
        const xGpu = x64 + w64;
        const xNn = xGpu + wGpu;
        const xTs = xNn + wNn;
        const xDef = xTs + wTs;

        return (
          <g key={item.spec.id} data-testid={`svg-bar-row-${item.spec.id}`}>
            <text x="24" y={y + 12} fill="currentColor" fontSize="10.5" fontWeight="700">{item.spec.id}</text>
            <text x="158" y={y + 12} textAnchor="end" fill="currentColor" fillOpacity={0.62} fontSize="9.5">
              {fmt(item.spec.measuredLoc)} · P{item.spec.targetWavePhase}
            </text>
            <rect x={barX} y={y} width={barW} height={barH} rx="4" fill="currentColor" fillOpacity={0.07} />
            {w32 > 0 && <rect x={barX} y={y} width={w32} height={barH} rx="3" fill={SVG_INK_WASM32} fillOpacity={0.9} />}
            {w64 > 0 && <rect x={x64} y={y} width={w64} height={barH} fill={SVG_INK_WASM64} fillOpacity={0.92} />}
            {wGpu > 0 && <rect x={xGpu} y={y} width={wGpu} height={barH} fill={SVG_INK_WEBGPU} fillOpacity={0.9} />}
            {wNn > 0 && <rect x={xNn} y={y} width={wNn} height={barH} fill={SVG_INK_WEBNN} fillOpacity={0.92} />}
            {wTs > 0 && <rect x={xTs} y={y} width={wTs} height={barH} rx="2" fill={SVG_INK_TS_SHELL} fillOpacity={0.82} />}
            {wDef > 0 && <rect x={xDef} y={y} width={wDef} height={barH} rx="3" fill="currentColor" fillOpacity={0.18} />}
            <text x="656" y={y + 12} textAnchor="end" fill={item.includedInPhase ? SVG_INK_WASM32 : "currentColor"} fillOpacity={item.includedInPhase ? 1 : 0.55} fontSize="10" fontWeight="700">
              {item.includedInPhase ? `${item.effectiveNativePct}%` : isEn ? "Deferred" : "대기"}
            </text>
          </g>
        );
      })}

      <line x1="24" y1={legendY - 10} x2="656" y2={legendY - 10} stroke="currentColor" strokeOpacity={0.14} />

      <g fontSize="9.5" fill="currentColor" fillOpacity={0.82}>
        <rect x="24" y={legendY} width="10" height="10" rx="2" fill={SVG_INK_WASM32} />
        <text x="38" y={legendY + 9}>WASM32-SIMD {plan.totals.engineSharePct.rustWasm32SimdPct}%</text>
        <rect x="172" y={legendY} width="10" height="10" rx="2" fill={SVG_INK_WASM64} />
        <text x="186" y={legendY + 9}>WASM64 {plan.totals.engineSharePct.rustWasm64Pct}%</text>
        <rect x="288" y={legendY} width="10" height="10" rx="2" fill={SVG_INK_WEBGPU} />
        <text x="302" y={legendY + 9}>WebGPU f16 {plan.totals.engineSharePct.webgpuSubgroupsF16Pct}%</text>
        <rect x="434" y={legendY} width="10" height="10" rx="2" fill={SVG_INK_WEBNN} />
        <text x="448" y={legendY + 9}>WebNN {plan.totals.engineSharePct.webnnNpuPct}%</text>
        <rect x="536" y={legendY} width="10" height="10" rx="2" fill={SVG_INK_TS_SHELL} />
        <text x="550" y={legendY + 9}>
          {isEn ? `TS UI ${plan.totals.engineSharePct.tsUiImeRetainedPct}%` : `TS유지 ${plan.totals.engineSharePct.tsUiImeRetainedPct}%`}
        </text>

        <rect x="24" y={legendY + 18} width="10" height="10" rx="2" fill="currentColor" fillOpacity={0.22} />
        <text x="38" y={legendY + 27} fillOpacity={0.7}>
          {isEn
            ? `Deferred TS ${plan.totals.engineSharePct.deferredTsPct}% (${fmt(plan.totals.deferredTsLoc)} LOC) · Baseline ${fmt(plan.baseline.totalMeasuredLoc)} LOC (${plan.measurementDate})`
            : `미전환 대기 ${plan.totals.engineSharePct.deferredTsPct}% (${fmt(plan.totals.deferredTsLoc)} LOC) · 9대 실측 합계 ${fmt(plan.baseline.totalMeasuredLoc)} LOC (${plan.measurementDate})`}
        </text>
      </g>
    </svg>
  );
}

/** ToonStudio 760K+ LOC 전면 Rust/WASM64 · WebGPU · NPU 전환 아키텍처 대시보드 패널. */
export function StudioRustExpansionArchitectPanel(
  props: StudioRustExpansionArchitectPanelProps,
): ReactElement {
  const {
    initialPhase = 4, initialPlatform = "chrome-desktop", locale = "ko",
    className, onPlanChange, onExportMarkdown,
  } = props;

  const headingId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [targetPhase, setTargetPhase] = useState<ExpansionWavePhase>(initialPhase);
  const [platformId, setPlatformId] = useState<ExpansionTargetPlatformId>(initialPlatform);
  const [previewMode, setPreviewMode] = useState<ExportPreviewMode>("closed");
  const [copiedFormat, setCopiedFormat] = useState<"markdown" | "json" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const plan = useMemo(() => simulateExpansionRoadmap({ targetPhase, platformId }), [targetPhase, platformId]);
  const adrMarkdown = useMemo(() => exportRustExpansionAdrMarkdown(plan, { locale }), [plan, locale]);
  const planJson = useMemo(() => exportRustExpansionJson(plan), [plan]);

  const applySelection = (
    nextPhase: ExpansionWavePhase, nextPlatform: ExpansionTargetPlatformId, noticeKo: string, noticeEn: string,
  ): void => {
    setTargetPhase(nextPhase);
    setPlatformId(nextPlatform);
    setCopiedFormat(null);
    onPlanChange?.(simulateExpansionRoadmap({ targetPhase: nextPhase, platformId: nextPlatform }));
    setStatusMessage(pick(noticeKo, noticeEn));
  };

  const handleSelectPhase = (nextPhase: ExpansionWavePhase): void => {
    const meta = EXPANSION_WAVE_PHASES.find((item) => item.phase === nextPhase);
    applySelection(
      nextPhase, platformId,
      `전환 목표를 ${meta?.badgeKo ?? `Phase ${nextPhase}`}로 변경해 9대 서브시스템 비중을 재계산했다.`,
      `Switched target wave to ${meta?.badgeEn ?? `Phase ${nextPhase}`} and recomputed subsystem shares.`,
    );
  };

  const handleSelectPlatform = (nextPlatform: ExpansionTargetPlatformId): void => {
    const meta = EXPANSION_PLATFORM_PROFILES.find((item) => item.id === nextPlatform);
    applySelection(
      targetPhase, nextPlatform,
      `대상 플랫폼을 ${meta?.shortLabelKo ?? nextPlatform}로 전환해 주소공간과 폴백 경로를 재계산했다.`,
      `Switched target platform to ${meta?.shortLabelEn ?? nextPlatform} and recomputed address space & fallbacks.`,
    );
  };

  const handleReset = (): void => {
    setPreviewMode("closed");
    applySelection(
      initialPhase, initialPlatform,
      `초기 설정(Phase ${initialPhase} · ${initialPlatform})으로 복원했다.`,
      `Reset to initial selection (Phase ${initialPhase} · ${initialPlatform}).`,
    );
  };

  const copyToClipboard = (text: string, format: "markdown" | "json"): void => {
    setCopiedFormat(format);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleExportAdrMarkdown = (): void => {
    setPreviewMode("markdown");
    copyToClipboard(adrMarkdown, "markdown");
    onExportMarkdown?.(adrMarkdown, plan);
    setStatusMessage(pick(
      `Phase ${plan.targetPhase} · ${plan.platform.shortLabelKo} ADR Markdown을 생성해 미리보기를 열었다.`,
      `Generated ADR Markdown for Phase ${plan.targetPhase} · ${plan.platform.shortLabelEn}.`,
    ));
  };

  const handleExportJson = (): void => {
    setPreviewMode("json");
    copyToClipboard(planJson, "json");
    setStatusMessage(pick(
      `Phase ${plan.targetPhase} · ${plan.platform.shortLabelKo} JSON 아키텍처 매니페스트를 생성했다.`,
      `Generated architecture plan JSON for Phase ${plan.targetPhase} · ${plan.platform.shortLabelEn}.`,
    ));
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-rust-expansion-architect-panel"
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold text-fg [word-break:keep-all]">
              {pick("ToonStudio 전면 Rust/WASM64 · WebGPU · NPU 전환 아키텍처 플래너", "ToonStudio Full Rust/WASM64, WebGPU & NPU Expansion Architect")}
            </h2>
          </div>
          <p className="text-xs text-fg-2 tabular-nums [word-break:keep-all]">
            {pick(
              `${plan.measurementDate} 저장소 실측 9대 서브시스템 ${fmt(plan.baseline.totalMeasuredFiles)}파일 · ${fmt(plan.baseline.totalMeasuredLoc)} LOC와 현행 Rust 3크레이트 ${fmt(plan.baseline.currentRustLoc)} LOC(${plan.baseline.currentRustShareOfCombinedPct}%)를 기준으로 단계별 전환 비중·청크 상한·주소공간을 시뮬레이션한다.`,
              `Simulates phased migration share, lazy chunk caps & 32/64-bit addressing from the ${plan.measurementDate} measured baseline (${fmt(plan.baseline.totalMeasuredFiles)} files · ${fmt(plan.baseline.totalMeasuredLoc)} TS LOC vs ${fmt(plan.baseline.currentRustLoc)} current Rust LOC, ${plan.baseline.currentRustShareOfCombinedPct}%).`,
            )}
          </p>
        </div>
        <button type="button" data-testid="reset-expansion-plan-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("초기값 복원", "Reset")}</span>
        </button>
      </header>

      {/* 4단계 전환 페이즈 선택 + 4대 플랫폼 호환성 필터 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-6">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("전환 웨이브 단계 선택 (Phase 1~4)", "Migration Wave Phase (Phase 1-4)")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPANSION_WAVE_PHASES.map((phaseItem) => {
              const selected = targetPhase === phaseItem.phase;
              return (
                <button
                  key={phaseItem.phase} type="button" data-testid={`phase-btn-${phaseItem.phase}`} aria-pressed={selected}
                  onClick={() => handleSelectPhase(phaseItem.phase)}
                  className={`${selected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start p-2.5 text-left`}
                >
                  <span className="text-xs font-bold">{isEn ? phaseItem.badgeEn : phaseItem.badgeKo}</span>
                  <span className="text-[11px] font-normal text-fg-2">+{phaseItem.addedSubsystems.join(", ")}</span>
                </button>
              );
            })}
          </div>
          <p data-testid="active-phase-objective" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
            {isEn ? plan.phaseSpec.objectiveEn : plan.phaseSpec.objectiveKo}
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-6">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("대상 플랫폼 호환성 필터 (4대 프로파일)", "Target Platform Compatibility Filter")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPANSION_PLATFORM_PROFILES.map((profile) => {
              const selected = platformId === profile.id;
              return (
                <button
                  key={profile.id} type="button" data-testid={`platform-btn-${profile.id}`} aria-pressed={selected}
                  onClick={() => handleSelectPlatform(profile.id)}
                  className={`${selected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start p-2.5 text-left`}
                >
                  <span className="text-xs font-bold">{isEn ? profile.shortLabelEn : profile.shortLabelKo}</span>
                  <span className="font-mono text-[10px] font-normal text-fg-2 tabular-nums">
                    {profile.supportsWasmMemory64 ? "64b" : "32b"} · {profile.supportsWebGpuSubgroupsF16 ? "GPU" : "CPU"} · {profile.supportsWebNnNpu ? "NPU" : "No-NPU"}
                  </span>
                </button>
              );
            })}
          </div>
          <p data-testid="active-platform-notes" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
            {isEn ? plan.platform.notesEn : plan.platform.notesKo}
          </p>
        </div>
      </div>

      {/* 핵심 4대 시뮬레이션 KPI 카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("전환 대상 네이티브 비중", "Target Native Migration")}</span>
          </div>
          <div data-testid="kpi-migrated-native-pct" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">
            {plan.totals.migratedNativePct}%
          </div>
          <div data-testid="kpi-migrated-native-loc" className="mt-0.5 text-[11px] text-fg-2 tabular-nums">
            {fmt(plan.totals.migratedNativeLoc)} LOC ({plan.totals.includedSubsystemCount}/9)
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("TS UI·IME 유지 / 대기", "Retained TS Shell / Deferred")}</div>
          <div data-testid="kpi-retained-ts-pct" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">
            {plan.totals.retainedTsShellPct}% / {plan.totals.deferredTsPct}%
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums">
            {pick(`유지 ${fmt(plan.totals.retainedTsShellLoc)} · 대기 ${fmt(plan.totals.deferredTsLoc)} LOC`, `Shell ${fmt(plan.totals.retainedTsShellLoc)} · Later ${fmt(plan.totals.deferredTsLoc)} LOC`)}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <HardDrive className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("WASM 청크 분할 상한 (gzip)", "WASM Chunk Cap (gzip)")}</span>
          </div>
          <div data-testid="kpi-wasm-bundle-kb" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">
            {fmt(plan.bundlePlan.eagerBootGzipCapKb)} + {fmt(plan.bundlePlan.lazyOnIntentGzipCapKb)} KB
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums">
            {pick(`초기 ${plan.bundlePlan.eagerBootChunks.length}개 · 지연 ${plan.bundlePlan.lazyOnIntentChunks.length}개 · 최대 ${plan.bundlePlan.maxSingleChunkCapKb}KB`, `Eager ${plan.bundlePlan.eagerBootChunks.length} · Lazy ${plan.bundlePlan.lazyOnIntentChunks.length} · Max ${plan.bundlePlan.maxSingleChunkCapKb} KB`)}
          </div>
        </div>

        <div className={`rounded-xl border p-3 ${addressSpaceToneClass(plan)}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {plan.addressSpace.memory64FallbackActive ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("메모리 주소공간 요구", "Address Space Mode")}</span>
          </div>
          <div data-testid="kpi-address-space-bits" className="mt-1 font-mono text-base font-bold tabular-nums">
            {plan.addressSpace.effectiveBits}-bit ({plan.addressSpace.mode})
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums">
            {pick(`요구 ${plan.addressSpace.requiredBits}비트 · RAM 상한 ${fmt(plan.addressSpace.safeResidentRamMb)}MB`, `Req ${plan.addressSpace.requiredBits}-bit · RAM cap ${fmt(plan.addressSpace.safeResidentRamMb)} MB`)}
          </div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 9대 서브시스템 전환 커버리지 스택 바 도표 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <SubsystemCoverageStackSvg plan={plan} isEn={isEn} />
        <p data-testid="address-space-summary" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 tabular-nums [word-break:keep-all]">
          {isEn ? plan.addressSpace.summaryEn : plan.addressSpace.summaryKo}
        </p>
      </div>

      {/* 9대 서브시스템 상세 매트릭스 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">
            {pick("9대 서브시스템 Rust/WASM64 · WebGPU · NPU 상세 매트릭스", "9-Subsystem Rust/WASM64, WebGPU & NPU Matrix")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {pick(`총 ${fmt(plan.baseline.totalMeasuredFiles)}파일 · ${fmt(plan.baseline.totalMeasuredLoc)} LOC · 폴백 재배치 ${fmt(plan.totals.fallbackReassignedLoc)} LOC`, `${fmt(plan.baseline.totalMeasuredFiles)} files · ${fmt(plan.baseline.totalMeasuredLoc)} LOC · Fallback ${fmt(plan.totals.fallbackReassignedLoc)} LOC`)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table data-testid="subsystem-expansion-matrix" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("서브시스템 (실측)", "Subsystem (Measured)")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("단계", "Wave")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("네이티브", "Native")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("엔진 조합 (%)", "Engine Mix (%)")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("WASM 청크 상한", "Chunk Cap")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("TS 경계 · 현재 vs 목표", "TS Boundary & Current vs Target")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {plan.subsystems.map((item) => (
                <tr key={item.spec.id} data-testid={`subsystem-row-${item.spec.id}`} data-included={item.includedInPhase ? "true" : "false"} className={item.includedInPhase ? "align-top" : "align-top opacity-65"}>
                  <td className="px-2.5 py-2.5 font-semibold text-fg [word-break:keep-all]">
                    <div>{isEn ? item.spec.nameEn : item.spec.nameKo}</div>
                    <div className="mt-0.5 font-mono text-[11px] font-normal text-fg-3 tabular-nums">
                      {fmt(item.spec.measuredFileCount)}{pick("파일", " files")} · {fmt(item.spec.measuredLoc)} LOC
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 font-mono tabular-nums">
                    <span className="inline-block rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold">P{item.spec.targetWavePhase}</span>
                    <div className="mt-1 text-[10px] text-fg-3">{item.includedInPhase ? pick("포함", "In scope") : pick("대기", "Deferred")}</div>
                  </td>
                  <td className="px-2.5 py-2.5 font-mono font-bold tabular-nums">
                    <div className={item.includedInPhase ? "text-good" : "text-fg-3"}>{item.includedInPhase ? `${item.effectiveNativePct}%` : "0%"}</div>
                    <div className="mt-0.5 text-[10px] font-normal text-fg-3">{pick(`권장 ${item.spec.recommendedNativeTargetPct}%`, `Rec ${item.spec.recommendedNativeTargetPct}%`)}</div>
                  </td>
                  <td className="px-2.5 py-2.5 font-mono text-[11px] text-fg-2 tabular-nums">
                    {item.includedInPhase ? (
                      <div className="space-y-0.5">
                        <div>W32 {item.stackPct.rustWasm32SimdPct}% · W64 {item.stackPct.rustWasm64Pct}%</div>
                        <div>GPU {item.stackPct.webgpuSubgroupsF16Pct}% · NPU {item.stackPct.webnnNpuPct}% · TS {item.stackPct.tsUiImeRetainedPct}%</div>
                      </div>
                    ) : (
                      <div className="text-fg-3">{pick("후속 Phase 대기 (TS 100%)", "Deferred to later phase (100% TS)")}</div>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 font-mono text-[11px] tabular-nums">
                    {item.activeWasmChunk ? (
                      <div>
                        <div className="font-semibold text-fg">{item.activeWasmChunk.activeGzipCapKb} KB</div>
                        <div className="text-[10px] text-fg-3">
                          {item.activeWasmChunk.loadStrategy === "eager-boot" ? pick("초기 부트", "eager") : pick("지연 로드", "lazy")} · {item.activeWasmChunk.activeAbi === "wasm64-memory64" ? "64b" : "32b"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </td>
                  <td className="space-y-1 px-2.5 py-2.5 text-[11px] text-fg-2 [word-break:keep-all]">
                    <div>{isEn ? item.spec.tsBoundaryReasonEn : item.spec.tsBoundaryReasonKo}</div>
                    <div className="text-fg-3">{isEn ? item.spec.targetStateEn : item.spec.targetStateKo}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 현행 Rust 3크레이트 실측 기준선 + 핵심 리스크·완화 전략 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">
              {pick("현행 Rust 3크레이트 실측 (2026-11-25)", "Current Rust Crates Baseline (2026-11-25)")}
            </h3>
            <span className="font-mono text-[11px] font-bold text-accent tabular-nums">{fmt(plan.baseline.currentRustLoc)} LOC</span>
          </div>
          <ul data-testid="current-rust-crates-list" className="space-y-2">
            {plan.baseline.crates.map((crate) => (
              <li key={crate.crateName} className="rounded-lg border border-line bg-raised p-2.5 text-xs [word-break:keep-all]">
                <div className="flex items-center justify-between gap-2 font-mono font-bold text-fg">
                  <span>{crate.crateName}</span>
                  <span className="tabular-nums text-accent">{fmt(crate.measuredLoc)} LOC</span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-fg-3">{crate.repoPath}</div>
                <p className="mt-1 text-[11px] text-fg-2">{isEn ? crate.roleEn : crate.roleKo}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1.5 rounded-lg border border-good bg-good-soft px-3 py-2 text-[11px] text-good [word-break:keep-all]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {pick(
                `Eager 진입 가드: ${plan.bundlePlan.eagerGraphSafe ? "안전(bg3d·vrm·export·hybrid-dcc 정적 제외)" : "점검 필요"}`,
                `Eager graph guard: ${plan.bundlePlan.eagerGraphSafe ? "Safe (bg3d/vrm/export/hybrid-dcc lazy-only)" : "Check required"}`,
              )}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">
            {pick("핵심 기술 리스크 및 완화 전략 (정직 모델링)", "Core Architectural Risks & Mitigations")}
          </h3>
          <ul data-testid="expansion-risks-list" className="space-y-2">
            {plan.risks.map((risk) => (
              <li key={risk.code} data-testid={`risk-card-${risk.code}`} className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${riskToneClass(risk.severity)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{isEn ? risk.titleEn : risk.titleKo}</span>
                  </span>
                  <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {risk.severity} · {risk.affectedSubsystems.join(", ")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] opacity-90">{isEn ? risk.detailEn : risk.detailKo}</p>
                <p className="mt-1 text-[11px] font-semibold">{pick("완화:", "Mitigation:")} {isEn ? risk.mitigationEn : risk.mitigationKo}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ADR Markdown / JSON 내보내기 · 미리보기 · 복사 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">
            {pick("ADR Markdown · JSON 아키텍처 문서 미리보기 및 복사", "ADR Markdown & JSON Plan Preview / Copy")}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="export-adr-markdown-btn" onClick={handleExportAdrMarkdown} className={BTN_SOLID}>
              {copiedFormat === "markdown" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{pick("ADR Markdown 복사·미리보기", "Copy & Preview ADR Markdown")}</span>
            </button>
            <button type="button" data-testid="export-plan-json-btn" onClick={handleExportJson} className={BTN_OUTLINE}>
              {copiedFormat === "json" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <FileJson className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{pick("JSON 복사·미리보기", "Copy & Preview JSON")}</span>
            </button>
            <button type="button" data-testid="toggle-preview-btn" onClick={() => setPreviewMode((prev) => (prev === "closed" ? "markdown" : "closed"))} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{previewMode === "closed" ? pick("미리보기 열기", "Open Preview") : pick("미리보기 닫기", "Close Preview")}</span>
            </button>
          </div>
        </div>
        {previewMode !== "closed" && (
          <pre data-testid="expansion-export-preview" data-preview-mode={previewMode} className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {previewMode === "markdown" ? adrMarkdown : planJson}
          </pre>
        )}
      </div>

      <p data-testid="expansion-honesty-disclosure" className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
        {isEn ? plan.honestyDisclosureEn : plan.honestyDisclosureKo}
      </p>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="expansion-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </div>
      )}
    </section>
  );
}
