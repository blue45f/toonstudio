/**
 * Wave 41E — 실시간 120Hz 프레임타임 프로파일러 · WebGPU/WASM/타일캐시/OPFS WAL 헬스 진단 ·
 * 자동 적응형 성능 가드레일 2탭 닥터 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 및 팔레트 색상 0건)
 * - Props 없이 `<StudioPerfDoctorPanel />` 단독 렌더링 지원 · 브라우저 스토리지 미사용
 * - 키보드·ARIA 탭/토글 접근성, `min-h-11` 터치 타깃, `tabular-nums`, `[word-break:keep-all]` 준수
 */

import {
  Activity, AlertTriangle, CheckCircle2, Cpu, Database, Gauge, HardDrive,
  Layers, Plus, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  FRAME_PIPELINE_STAGE_IDS, PERF_DOCTOR_SCENARIO_IDS, analyzeFrameTimeRing,
  applyGuardrailPrescription, createPerfDoctorScenario, diagnoseStudioRuntimeHealth,
  pushFrameSamples, recommendAdaptiveGuardrail,
  type AdaptiveGuardrailReport, type FrameBudgetGrade, type FramePipelineStageId,
  type FrameTimeRingAnalysis, type FrameTimeSampleInput, type GuardrailApplicationResult,
  type GuardrailProfileId, type GuardrailVisualImpact, type JankSpikeSeverity,
  type PerfDoctorScenarioId, type StudioPerfDoctorSnapshot, type StudioRuntimeHealthDiagnosis,
  type TargetRefreshHz, type VramPressureLevel,
} from "./realtime-perf-profiler";

export type StudioPerfDoctorTabId = "frametime-profiler" | "runtime-health";

export interface StudioPerfDoctorPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: StudioPerfDoctorTabId;
  readonly initialScenarioId?: PerfDoctorScenarioId;
  readonly initialTargetHz?: TargetRefreshHz;
  readonly initialProfile?: GuardrailProfileId;
  readonly onGuardrailApplied?: (result: GuardrailApplicationResult) => void;
  readonly onDiagnosisChange?: (diagnosis: StudioRuntimeHealthDiagnosis, analysis: FrameTimeRingAnalysis) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;
const ACTION_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_TONE = "border-accent bg-accent text-on-accent hover:bg-accent-2";

const STAGE_META: Readonly<Record<FramePipelineStageId, { readonly ko: string; readonly en: string; readonly bar: string }>> = {
  input: { ko: "입력 · 스타일러스 예측", en: "Input & Stylus", bar: "bg-cool" },
  brushWasm: { ko: "WASM 브러시 래스터", en: "WASM Brush Raster", bar: "bg-accent" },
  webgpuComposite: { ko: "WebGPU 타일 합성", en: "WebGPU Composite", bar: "bg-warn" },
  uiReact: { ko: "React HUD · UI", en: "React HUD & UI", bar: "bg-good" },
};

const SCENARIO_LABELS: Readonly<Record<PerfDoctorScenarioId, { readonly ko: string; readonly en: string }>> = {
  "nominal-120hz": { ko: "안정 120Hz", en: "Nominal 120Hz" },
  "brush-jank-warm": { ko: "브러시 부하", en: "Wet-Brush Load" },
  "vram-tile-pressure": { ko: "4K VRAM 압박", en: "4K VRAM Pressure" },
  "critical-opfs-stall": { ko: "임계 WAL 정체", en: "Critical WAL Stall" },
};

const pressureTone = (level: VramPressureLevel): string =>
  level === "nominal" ? "border-good bg-good-soft text-good"
    : level === "warm" ? "border-line bg-info-soft text-cool"
      : level === "pressure" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";

const pressureBar = (level: VramPressureLevel): string =>
  level === "nominal" ? "bg-good" : level === "warm" ? "bg-cool" : level === "pressure" ? "bg-warn" : "bg-bad";

const frameGradeTone = (grade: FrameBudgetGrade): string =>
  grade === "optimal" ? "border-good bg-good-soft text-good"
    : grade === "guarded" ? "border-line bg-info-soft text-cool"
      : grade === "janky" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";

const spikeTone = (severity: JankSpikeSeverity): string =>
  severity === "minor" ? "border-line bg-info-soft text-cool"
    : severity === "moderate" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";

const impactTone = (impact: GuardrailVisualImpact): string =>
  impact === "zero" ? "border-good bg-good-soft text-good"
    : impact === "preview-only" ? "border-line bg-info-soft text-cool" : "border-warn bg-warning-soft text-warn";

function buildInjectedBatch(kind: "smooth" | "brush-spike" | "gpu-stall"): readonly FrameTimeSampleInput[] {
  if (kind === "brush-spike") {
    return [
      { stages: { input: 0.7, brushWasm: 7.4, webgpuComposite: 2.3, uiReact: 0.9 }, totalMs: 11.6 },
      { stages: { input: 0.8, brushWasm: 9.8, webgpuComposite: 2.6, uiReact: 1.0 }, totalMs: 14.5 },
      { stages: { input: 0.7, brushWasm: 6.1, webgpuComposite: 2.1, uiReact: 0.8 }, totalMs: 9.9 },
      { stages: { input: 0.65, brushWasm: 3.1, webgpuComposite: 1.9, uiReact: 0.75 }, totalMs: 6.6 },
    ];
  }
  if (kind === "gpu-stall") {
    return [
      { stages: { input: 0.9, brushWasm: 3.4, webgpuComposite: 18.2, uiReact: 1.8 }, totalMs: 24.8 },
      { stages: { input: 0.85, brushWasm: 3.1, webgpuComposite: 13.6, uiReact: 1.4 }, totalMs: 19.3 },
      { stages: { input: 0.75, brushWasm: 2.9, webgpuComposite: 7.8, uiReact: 1.1 }, totalMs: 12.9 },
    ];
  }
  return Array.from({ length: 12 }, (_, idx) => {
    const r = (idx % 3) * 0.14;
    const stages = { input: 0.55, brushWasm: 2.15 + r, webgpuComposite: 1.7 + r, uiReact: 0.65 };
    return { stages, totalMs: stages.input + stages.brushWasm + stages.webgpuComposite + stages.uiReact + 0.2 };
  });
}

/** Wave 41E 실시간 120Hz 프레임타임 프로파일러 · 런타임 헬스 · 적응형 성능 가드레일 2탭 패널. */
export function StudioPerfDoctorPanel(props: StudioPerfDoctorPanelProps): ReactElement {
  const {
    locale, className, initialTab = "frametime-profiler", initialScenarioId = "vram-tile-pressure",
    initialTargetHz = 120, initialProfile = "smooth-120hz", onGuardrailApplied, onDiagnosisChange,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<StudioPerfDoctorTabId>(initialTab);
  const [scenarioId, setScenarioId] = useState<PerfDoctorScenarioId>(initialScenarioId);
  const [targetHz, setTargetHz] = useState<TargetRefreshHz>(initialTargetHz);
  const [preferredProfile, setPreferredProfile] = useState<GuardrailProfileId>(initialProfile);
  const [snapshot, setSnapshot] = useState<StudioPerfDoctorSnapshot>(() => createPerfDoctorScenario(initialScenarioId));
  const [baselineSnapshot, setBaselineSnapshot] = useState<StudioPerfDoctorSnapshot | null>(null);
  const [disabledStepIds, setDisabledStepIds] = useState<readonly string[]>([]);
  const [lastApplied, setLastApplied] = useState<GuardrailApplicationResult | null>(null);

  const frameAnalysis = useMemo<FrameTimeRingAnalysis>(
    () => analyzeFrameTimeRing(snapshot.ring, { targetHz }),
    [snapshot.ring, targetHz],
  );
  const diagnosis = useMemo<StudioRuntimeHealthDiagnosis>(
    () => diagnoseStudioRuntimeHealth({ ...snapshot.telemetry, frameAnalysis }),
    [snapshot.telemetry, frameAnalysis],
  );
  const guardrailReport = useMemo<AdaptiveGuardrailReport>(
    () => recommendAdaptiveGuardrail({ diagnosis, frameAnalysis, preferredProfile, canvasContext: snapshot.telemetry.canvasContext }),
    [diagnosis, frameAnalysis, preferredProfile, snapshot.telemetry.canvasContext],
  );

  const activePlan = guardrailReport.activePlan;
  const selectedStepIds = useMemo(() => {
    const off = new Set(disabledStepIds);
    return activePlan.steps.filter((s) => !off.has(s.id)).map((s) => s.id);
  }, [activePlan.steps, disabledStepIds]);
  const maxBinCount = useMemo(() => Math.max(1, ...frameAnalysis.histogram.map((b) => b.count)), [frameAnalysis.histogram]);

  const emitDiagnostics = (nextSnap: StudioPerfDoctorSnapshot, nextHz: TargetRefreshHz): void => {
    const nextAnalysis = analyzeFrameTimeRing(nextSnap.ring, { targetHz: nextHz });
    onDiagnosisChange?.(diagnoseStudioRuntimeHealth({ ...nextSnap.telemetry, frameAnalysis: nextAnalysis }), nextAnalysis);
  };

  const handleSelectScenario = (nextId: PerfDoctorScenarioId): void => {
    const fresh = createPerfDoctorScenario(nextId);
    setScenarioId(nextId);
    setSnapshot(fresh);
    setBaselineSnapshot(null);
    setDisabledStepIds([]);
    setLastApplied(null);
    emitDiagnostics(fresh, targetHz);
  };

  const handleSwitchTargetHz = (nextHz: TargetRefreshHz): void => {
    setTargetHz(nextHz);
    emitDiagnostics(snapshot, nextHz);
  };

  const handleInjectSamples = (kind: "smooth" | "brush-spike" | "gpu-stall"): void => {
    const nextSnap: StudioPerfDoctorSnapshot = { ...snapshot, ring: pushFrameSamples(snapshot.ring, buildInjectedBatch(kind)) };
    setSnapshot(nextSnap);
    emitDiagnostics(nextSnap, targetHz);
  };

  const handleResetScenario = (): void => handleSelectScenario(scenarioId);

  const handleToggleStep = (stepId: string): void => {
    setDisabledStepIds((prev) => (prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId]));
  };

  const handleApplyGuardrail = (): void => {
    if (selectedStepIds.length === 0) return;
    if (!baselineSnapshot) setBaselineSnapshot(snapshot);
    const result = applyGuardrailPrescription(snapshot, activePlan, selectedStepIds, targetHz);
    setSnapshot({ ...snapshot, ring: result.nextRing, telemetry: result.nextTelemetry });
    setTargetHz(result.targetHzAfter);
    setLastApplied(result);
    onGuardrailApplied?.(result);
    onDiagnosisChange?.(result.afterDiagnosis, result.afterFrameAnalysis);
  };

  const handleRevertGuardrail = (): void => {
    if (!baselineSnapshot) return;
    setSnapshot(baselineSnapshot);
    setTargetHz(initialTargetHz);
    setBaselineSnapshot(null);
    setLastApplied(null);
    emitDiagnostics(baselineSnapshot, initialTargetHz);
  };

  const pressureLabel = (level: VramPressureLevel): string =>
    level === "nominal" ? pick("정상 (nominal)", "Nominal")
      : level === "warm" ? pick("주의 (warm)", "Warm")
        : level === "pressure" ? pick("압박 (pressure)", "Pressure") : pick("임계 (critical)", "Critical");

  const impactLabel = (impact: GuardrailVisualImpact): string =>
    impact === "zero" ? pick("화질 무손실", "Zero Quality Loss")
      : impact === "preview-only" ? pick("프리뷰만 축소", "Preview-Only Scale") : pick("60Hz 주사율 락", "60Hz Cadence Lock");

  const severityLabel = (severity: JankSpikeSeverity): string =>
    severity === "minor" ? pick("경미", "Minor") : severity === "moderate" ? pick("중간", "Moderate") : pick("심각", "Severe");

  const tabs: readonly { readonly id: StudioPerfDoctorTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "frametime-profiler", label: pick("120Hz 프레임타임 히스토그램 · 스테이지 분해", "120Hz Frame Histogram & Stage Breakdown"), icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "runtime-health", label: pick("GPU VRAM · 타일 캐시 · OPFS WAL 헬스 & 1클릭 처방", "GPU VRAM · Tile Cache · OPFS WAL & 1-Click Fix"), icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  return (
    <section
      data-testid="studio-perf-doctor-panel"
      aria-label={pick("실시간 120Hz 프레임타임 프로파일러 및 스튜디오 성능 닥터", "Realtime 120Hz Frame-Time Profiler & Studio Performance Doctor")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("스튜디오 성능 닥터 · 120Hz 프로파일러 & 적응형 가드레일", "Studio Perf Doctor · 120Hz Profiler & Adaptive Guardrail")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "고정 길이 링버퍼로 p50/p95/p99·1% low FPS·4스테이지 비중을 계측하고 VRAM·희소 타일 캐시·OPFS WAL 압박을 화질 손실 최소화 처방으로 해소합니다.",
              "Track p50/p95/p99, 1% low FPS, and 4 pipeline stages in a fixed ring buffer, then diagnose VRAM, sparse tile cache, and OPFS WAL lag with 1-click guardrails.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="overall-health-badge" className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${pressureTone(diagnosis.overallLevel)}`}>
            <span>{pick("헬스", "Health")}</span>
            <span>{diagnosis.healthGrade} ({diagnosis.healthScore}/100)</span>
          </span>
          <span data-testid="vram-pressure-badge" className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${pressureTone(diagnosis.vram.level)}`}>
            <span>VRAM</span>
            <span>{diagnosis.vram.level}</span>
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("진단 시나리오 선택", "Diagnostic scenario selector")}>
          {PERF_DOCTOR_SCENARIO_IDS.map((id) => (
            <button key={id} type="button" data-testid={`btn-scenario-${id}`} aria-pressed={scenarioId === id} onClick={() => handleSelectScenario(id)} className={`${ACTION_BTN} ${scenarioId === id ? ACTIVE_TONE : IDLE_TONE}`}>
              {isKo ? SCENARIO_LABELS[id].ko : SCENARIO_LABELS[id].en}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={pick("목표 주사율 전환", "Target refresh rate toggle")}>
          {([120, 60] as const).map((hz) => (
            <button key={hz} type="button" data-testid={`btn-hz-${hz}`} aria-pressed={targetHz === hz} onClick={() => handleSwitchTargetHz(hz)} className={`${ACTION_BTN} tabular-nums ${targetHz === hz ? ACTIVE_TONE : IDLE_TONE}`}>
              {hz}Hz ({hz === 120 ? "8.33ms" : "16.67ms"})
            </button>
          ))}
        </div>
      </div>

      <div role="tablist" aria-label={pick("성능 닥터 탭", "Performance doctor tabs")} className="flex flex-col gap-2 sm:flex-row">
        {tabs.map((tab) => (
          <button
            key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab"
            data-testid={`tab-${tab.id}`} aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? ACTIVE_TONE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "frametime-profiler" && (
        <div id={`${uid}-panel-frametime-profiler`} role="tabpanel" aria-labelledby={`${uid}-tab-frametime-profiler`} data-testid="panel-frametime-profiler" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <p className="text-xs text-fg-2">{isKo ? snapshot.summaryKo : snapshot.summaryEn}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" data-testid="btn-inject-smooth" onClick={() => handleInjectSamples("smooth")} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("안정 +12프레임", "Add 12 Smooth")}</span>
              </button>
              <button type="button" data-testid="btn-inject-brush-spike" onClick={() => handleInjectSamples("brush-spike")} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <Zap className="h-3.5 w-3.5 text-warn" aria-hidden="true" /><span>{pick("브러시 쟁크 주입", "Inject Brush Jank")}</span>
              </button>
              <button type="button" data-testid="btn-inject-gpu-stall" onClick={() => handleInjectSamples("gpu-stall")} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <AlertTriangle className="h-3.5 w-3.5 text-bad" aria-hidden="true" /><span>{pick("WebGPU 정체 주입", "Inject GPU Stall")}</span>
              </button>
              <button type="button" data-testid="btn-reset-ring" onClick={handleResetScenario} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("초기화", "Reset")}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">p50 ({pick("중앙", "Median")})</div>
              <div data-testid="metric-p50" className="mt-1 text-base font-bold text-fg tabular-nums">{frameAnalysis.p50Ms.toFixed(2)} ms</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">p95</div>
              <div data-testid="metric-p95" className="mt-1 text-base font-bold text-fg tabular-nums">{frameAnalysis.p95Ms.toFixed(2)} ms</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">p99 ({pick("꼬리", "Tail")})</div>
              <div data-testid="metric-p99" className={`mt-1 text-base font-bold tabular-nums ${frameAnalysis.p99Ms > frameAnalysis.budgetMs ? "text-warn" : "text-good"}`}>{frameAnalysis.p99Ms.toFixed(2)} ms</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">1% Low FPS</div>
              <div data-testid="metric-1pct-low-fps" className="mt-1 text-base font-bold text-fg tabular-nums">{frameAnalysis.onePercentLowFps.toFixed(1)}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick(`> ${frameAnalysis.jank.thresholdMs}ms 쟁크율`, `> ${frameAnalysis.jank.thresholdMs}ms Jank`)}</div>
              <div data-testid="metric-jank-rate" className={`mt-1 text-base font-bold tabular-nums ${frameAnalysis.jank.totalSpikes > 0 ? "text-bad" : "text-good"}`}>
                {frameAnalysis.jank.jankRatePct.toFixed(1)}% ({frameAnalysis.jank.totalSpikes})
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("예산 판정", "Budget Grade")}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span data-testid="metric-frame-grade" className={`rounded border px-2 py-0.5 text-xs font-semibold ${frameGradeTone(frameAnalysis.grade)}`}>{frameAnalysis.grade}</span>
                <span className="text-[11px] text-fg-3 tabular-nums">{frameAnalysis.sampleCount}/{frameAnalysis.capacity}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">
                  {pick(`${targetHz}Hz 프레임타임 히스토그램 (예산 ${frameAnalysis.budgetMs}ms)`, `${targetHz}Hz Frame-Time Histogram (${frameAnalysis.budgetMs}ms budget)`)}
                </h3>
                <span className="text-[11px] text-fg-3 tabular-nums">{pick(`> 8.33ms: ${frameAnalysis.jank.over833MsCount}프레임`, `> 8.33ms: ${frameAnalysis.jank.over833MsCount} frames`)}</span>
              </div>
              <div data-testid="frametime-histogram" className="space-y-2">
                {frameAnalysis.histogram.map((bin) => {
                  const widthPct = Math.round((bin.count / maxBinCount) * 100);
                  const barTone = !bin.isOverBudget ? "bg-good" : bin.minMs >= 16.67 ? "bg-bad" : "bg-warn";
                  return (
                    <div key={bin.id} className="grid grid-cols-[5.75rem_1fr_4.5rem] items-center gap-2 text-xs">
                      <span className={`font-medium tabular-nums ${bin.isOverBudget ? "text-warn" : "text-fg-2"}`}>{bin.label}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-raised">
                        <div className={`h-full rounded-full transition-all motion-reduce:transition-none ${barTone}`} style={{ width: `${bin.count > 0 ? Math.max(4, widthPct) : 0}%` }} />
                      </div>
                      <span className="text-right text-[11px] text-fg-2 tabular-nums">{bin.count} ({bin.ratioPct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1.5 border-t border-line pt-2.5">
                <div className="flex items-center justify-between text-[11px] text-fg-3">
                  <span>{pick("최근 프레임 타임라인 (최대 48프레임)", "Recent Frame Timeline (up to 48 frames)")}</span>
                  <span className="tabular-nums">{pick("최장 연속 쟁크", "Max streak")}: {frameAnalysis.jank.longestStreak}</span>
                </div>
                <div className="flex h-12 items-end gap-0.5 rounded-lg border border-line bg-panel p-1.5" aria-hidden="true">
                  {frameAnalysis.recentWindowMs.map((ms, idx) => (
                    <div
                      key={`${idx}-${ms}`}
                      className={`flex-1 rounded-t ${ms <= frameAnalysis.budgetMs ? "bg-good" : ms > frameAnalysis.budgetMs * 2 ? "bg-bad" : "bg-warn"}`}
                      style={{ height: `${Math.min(100, Math.max(10, Math.round((ms / 28) * 100)))}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">{pick("파이프라인 4스테이지 비중 분해", "4-Stage Pipeline Breakdown")}</h3>
                <span data-testid="dominant-stage-badge" className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {pick("지배 병목", "Dominant")}: {frameAnalysis.dominantStage}
                </span>
              </div>
              <div className="flex h-3.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                {FRAME_PIPELINE_STAGE_IDS.map((stageId) => (
                  <div key={stageId} className={STAGE_META[stageId].bar} style={{ width: `${Math.max(0, frameAnalysis.stages[stageId].sharePct)}%` }} />
                ))}
              </div>
              <div data-testid="stage-breakdown-list" className="space-y-2">
                {FRAME_PIPELINE_STAGE_IDS.map((stageId) => {
                  const metric = frameAnalysis.stages[stageId];
                  const meta = STAGE_META[stageId];
                  return (
                    <div key={stageId} data-testid={`stage-row-${stageId}`} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.bar}`} aria-hidden="true" />
                        <div>
                          <div className="font-semibold text-fg">{isKo ? meta.ko : meta.en}</div>
                          <div className="text-[11px] text-fg-3 tabular-nums">{stageId} · {pick("스파이크 기인", "Spike causes")} {metric.spikeAttributionCount}</div>
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="font-semibold text-fg">{metric.meanMs.toFixed(2)} ms ({metric.sharePct.toFixed(1)}%)</div>
                        <div className="text-[11px] text-fg-3">p95 {metric.p95Ms.toFixed(2)}ms · max {metric.maxMs.toFixed(2)}ms</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-center text-xs tabular-nums">
                <div className={`rounded-lg border px-2 py-1.5 ${spikeTone("minor")}`}>
                  <div className="text-[10px]">{pick("경미 스파이크", "Minor")}</div>
                  <div data-testid="spike-minor-count" className="font-bold">{frameAnalysis.jank.minorCount}</div>
                </div>
                <div className={`rounded-lg border px-2 py-1.5 ${spikeTone("moderate")}`}>
                  <div className="text-[10px]">{pick("중간 스파이크", "Moderate")}</div>
                  <div data-testid="spike-moderate-count" className="font-bold">{frameAnalysis.jank.moderateCount}</div>
                </div>
                <div className={`rounded-lg border px-2 py-1.5 ${spikeTone("severe")}`}>
                  <div className="text-[10px]">{pick("심각 정체", "Severe")}</div>
                  <div data-testid="spike-severe-count" className="font-bold">{frameAnalysis.jank.severeCount}</div>
                </div>
              </div>
            </div>
          </div>

          {frameAnalysis.jank.topSpikes.length > 0 && (
            <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
              <h3 className="text-xs font-semibold text-fg">{pick("상위 쟁크 스파이크 프레임", "Top Jank Spike Frames")}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {frameAnalysis.jank.topSpikes.map((spike) => (
                  <div key={`${spike.frameIndex}-${spike.totalMs}`} className="flex items-center justify-between rounded-lg border border-line bg-panel px-2.5 py-2 text-xs tabular-nums">
                    <div><span className="font-semibold text-fg">#{spike.frameIndex}</span><span className="ml-1.5 text-fg-3">{spike.dominantStage}</span></div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-fg">{spike.totalMs.toFixed(2)}ms</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${spikeTone(spike.severity)}`}>{severityLabel(spike.severity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "runtime-health" && (
        <div id={`${uid}-panel-runtime-health`} role="tabpanel" aria-labelledby={`${uid}-tab-runtime-health`} data-testid="panel-runtime-health" className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div data-testid="card-vram-health" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg"><Cpu className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("GPU VRAM 압박", "GPU VRAM Pressure")}</span></div>
                <span data-testid="vram-level-pill" className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${pressureTone(diagnosis.vram.level)}`}>{pressureLabel(diagnosis.vram.level)}</span>
              </div>
              <div className="flex items-baseline justify-between tabular-nums">
                <span data-testid="vram-usage-text" className="text-lg font-bold text-fg">{diagnosis.vram.utilizationPct.toFixed(1)}%</span>
                <span className="text-xs text-fg-2">{diagnosis.vram.allocatedMb} / {diagnosis.vram.budgetMb} MB</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div className={`h-full rounded-full ${pressureBar(diagnosis.vram.level)}`} style={{ width: `${Math.min(100, diagnosis.vram.utilizationPct)}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[11px] text-fg-2 tabular-nums">
                <div className="rounded bg-panel px-2 py-1">{pick("아틀라스", "Atlas")} {diagnosis.vram.textureAtlasMb}MB</div>
                <div className="rounded bg-panel px-2 py-1">{pick("타깃", "RT")} {diagnosis.vram.renderTargetMb}MB</div>
                <div className="rounded bg-panel px-2 py-1">{pick("스테이징", "Stage")} {diagnosis.vram.stagingBufferMb}MB</div>
              </div>
            </div>

            <div data-testid="card-tile-health" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg"><Layers className="h-4 w-4 text-cool" aria-hidden="true" /><span>{pick("희소 타일 캐시", "Sparse Tile Cache")}</span></div>
                <span data-testid="tile-level-pill" className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${pressureTone(diagnosis.tileCache.level)}`}>{pressureLabel(diagnosis.tileCache.level)}</span>
              </div>
              <div className="flex items-baseline justify-between tabular-nums">
                <span data-testid="tile-hit-rate-text" className="text-lg font-bold text-fg">{diagnosis.tileCache.hitRatePct.toFixed(1)}%</span>
                <span className="text-xs text-fg-2">{diagnosis.tileCache.residentTiles}/{diagnosis.tileCache.maxResidentTiles} ({diagnosis.tileCache.tileSizePx}px)</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div className={`h-full rounded-full ${pressureBar(diagnosis.tileCache.level)}`} style={{ width: `${Math.min(100, diagnosis.tileCache.hitRatePct)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-fg-2 tabular-nums">
                <span>{pick("축출", "Evict")} {diagnosis.tileCache.evictionsPerSec}/s · {pick("더티", "Dirty")} {diagnosis.tileCache.dirtyTilesQueued}</span>
                {diagnosis.tileCache.thrashingDetected && <span className="rounded border border-bad bg-bad-soft px-1.5 py-0.5 text-[10px] font-semibold text-bad">{pick("스래싱", "Thrashing")}</span>}
              </div>
            </div>

            <div data-testid="card-opfs-health" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg"><Database className="h-4 w-4 text-warn" aria-hidden="true" /><span>{pick("OPFS · SQLite WAL", "OPFS & SQLite WAL")}</span></div>
                <span data-testid="opfs-level-pill" className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${pressureTone(diagnosis.opfsWal.level)}`}>{pressureLabel(diagnosis.opfsWal.level)}</span>
              </div>
              <div className="flex items-baseline justify-between tabular-nums">
                <span data-testid="opfs-wal-delay-text" className="text-lg font-bold text-fg">{diagnosis.opfsWal.lastCheckpointDelayMs.toFixed(0)} ms</span>
                <span className="text-xs text-fg-2">OPFS {diagnosis.opfsWal.quotaUsagePct.toFixed(1)}% ({diagnosis.opfsWal.usedMb}/{diagnosis.opfsWal.quotaMb}MB)</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div className={`h-full rounded-full ${pressureBar(diagnosis.opfsWal.level)}`} style={{ width: `${Math.min(100, diagnosis.opfsWal.quotaUsagePct)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-fg-2 tabular-nums">
                <span>WAL {diagnosis.opfsWal.walSizeMb}MB ({diagnosis.opfsWal.walFramesPending}f)</span>
                <span data-testid="wal-mode-pill" className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-fg">{diagnosis.opfsWal.recommendedCheckpointMode}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
                  <span>{pick("적응형 성능 가드레일 비교 & 단계별 1클릭 처방", "Adaptive Guardrail Profile Comparison & 1-Click Prescription")}</span>
                </div>
                <p className="text-[11px] text-fg-2">{isKo ? activePlan.tradeoffSummaryKo : activePlan.tradeoffSummaryEn}</p>
              </div>
              <div className="flex items-center gap-1.5" role="group" aria-label={pick("가드레일 프로파일 선택", "Guardrail profile selector")}>
                {(["smooth-120hz", "precision-4k"] as const).map((profileId) => (
                  <button
                    key={profileId} type="button" data-testid={`btn-profile-${profileId}`} aria-pressed={preferredProfile === profileId}
                    onClick={() => { setPreferredProfile(profileId); setDisabledStepIds([]); }}
                    className={`${ACTION_BTN} ${preferredProfile === profileId ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {profileId === "smooth-120hz" ? pick("120Hz 유지 우선", "Maintain 120Hz") : pick("4K 정밀 우선", "4K Precision")}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-line bg-panel">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[11px] text-fg-3">
                    <th className="px-3 py-2 font-semibold">{pick("비교 항목", "Metric")}</th>
                    <th className={`px-3 py-2 font-semibold ${preferredProfile === "smooth-120hz" ? "text-accent" : "text-fg"}`}>{pick("120Hz 유지 우선", "Maintain 120Hz")}</th>
                    <th className={`px-3 py-2 font-semibold ${preferredProfile === "precision-4k" ? "text-accent" : "text-fg"}`}>{pick("4K 정밀 우선", "4K Precision")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {guardrailReport.comparisonRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium text-fg-2">{isKo ? row.labelKo : row.labelEn}</td>
                      <td className={`px-3 py-2 font-semibold ${row.winner === "smooth-120hz" ? "text-good" : "text-fg"}`}>{row.smooth120HzValue}</td>
                      <td className={`px-3 py-2 font-semibold ${row.winner === "precision-4k" ? "text-good" : "text-fg"}`}>{row.precision4KValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              {activePlan.steps.map((step) => {
                const enabled = selectedStepIds.includes(step.id);
                return (
                  <button
                    key={step.id} type="button" data-testid={`btn-step-${step.id}`} aria-pressed={enabled}
                    onClick={() => handleToggleStep(step.id)}
                    className={`flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${enabled ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-fg">
                        <span className="tabular-nums">Step {step.order}.</span>
                        <span>{isKo ? step.titleKo : step.titleEn}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${impactTone(step.visualImpact)}`}>{impactLabel(step.visualImpact)}</span>
                      </div>
                      <p className="text-[11px] font-normal text-fg-2">{isKo ? step.actionKo : step.actionEn}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tabular-nums text-fg-2">
                      {step.estimatedP99ReductionMs > 0 && <span>p99 -{step.estimatedP99ReductionMs}ms</span>}
                      {step.estimatedVramReleaseMb > 0 && <span>VRAM -{step.estimatedVramReleaseMb}MB</span>}
                      {step.estimatedTileHitGainPct > 0 && <span>Hit +{step.estimatedTileHitGainPct}%</span>}
                      {step.estimatedWalReductionMs > 0 && <span>WAL -{step.estimatedWalReductionMs}ms</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex items-center gap-1.5 text-xs text-fg-2 tabular-nums">
                <HardDrive className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" />
                <span>{pick(`선택 단계 ${selectedStepIds.length}/${activePlan.steps.length} · 커밋 해상도 100% 보존`, `Selected ${selectedStepIds.length}/${activePlan.steps.length} steps · 100% commit resolution preserved`)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {baselineSnapshot && (
                  <button type="button" data-testid="btn-revert-guardrail" onClick={handleRevertGuardrail} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("처방 되돌리기", "Revert Prescription")}</span>
                  </button>
                )}
                <button type="button" data-testid="btn-apply-guardrail" disabled={selectedStepIds.length === 0} onClick={handleApplyGuardrail} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("1클릭 처방 적용", "Apply 1-Click Guardrail")}</span>
                </button>
              </div>
            </div>

            {lastApplied && (
              <div data-testid="guardrail-applied-banner" role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good tabular-nums">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{pick(`${lastApplied.profileId === "smooth-120hz" ? "120Hz 유지 우선" : "4K 정밀 우선"} 처방 적용 완료 (${lastApplied.appliedStepIds.length}단계)`, `Applied ${lastApplied.profileId === "smooth-120hz" ? "120Hz Priority" : "4K Precision"} (${lastApplied.appliedStepIds.length} steps)`)}</span>
                </div>
                <div className="flex flex-wrap gap-2 font-semibold">
                  <span>p99 {lastApplied.deltas.p99DeltaMs}ms</span>
                  <span>VRAM {lastApplied.deltas.vramPctDelta}%</span>
                  <span>Hit +{lastApplied.deltas.tileHitPctDelta}%</span>
                  <span>WAL {lastApplied.deltas.walDelayDeltaMs}ms</span>
                  <span>Score +{lastApplied.deltas.healthScoreDelta}</span>
                </div>
              </div>
            )}
          </div>

          {diagnosis.bottlenecks.length > 0 && (
            <div data-testid="bottleneck-list" className="space-y-2 rounded-xl border border-line bg-card p-3.5">
              <h3 className="text-xs font-semibold text-fg">{pick("감지된 런타임 병목", "Detected Runtime Bottlenecks")}</h3>
              <div className="space-y-2">
                {diagnosis.bottlenecks.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-fg">{isKo ? item.titleKo : item.titleEn}</div>
                      <div className="text-[11px] text-fg-2">{isKo ? item.detailKo : item.detailEn}</div>
                    </div>
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${pressureTone(item.severity)}`}>{item.metricText}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
