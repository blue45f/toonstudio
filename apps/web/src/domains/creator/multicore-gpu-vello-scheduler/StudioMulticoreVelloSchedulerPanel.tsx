/**
 * Wave 53C — CPU 멀티코어(Work-Stealing SAB) · Vello 6단계 GPU 컴퓨트 ·
 * WebNN NPU · 최신 Chrome Preview 차세대 웹 플랫폼 스케줄러 제어판.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 #hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 순수 시맨틱 SVG 멀티코어·Vello 6단계·NPU 병렬 실행 타임라인 간트 도해
 * - 10종 차세대 웹 플랫폼 호환성·폴백 매트릭스 및 JSON 매니페스트 복사/미리보기
 */

import {
  Activity, CheckCircle2, Copy, Cpu, Eye, Flame, Gauge,
  Layers, RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { negotiateExtremeWebGpuProfile } from "../render/webgpu-extreme-subgroups";

import {
  COMPUTE_PRESSURE_STATES, CORE_COUNT_PRESETS, DEFAULT_HARDWARE_CONCURRENCY,
  exportMulticoreVelloPlanJson, normalizeSchedulerEnvironmentInput,
  type ComputePressureState, type ExecutionLaneKind, type MulticoreVelloSchedulerPlan,
  type ProbeRuntimeState, type SchedulerEnvironmentInput, type TimelineSegmentTone,
} from "./multicore-vello-scheduler-engine";

export interface StudioMulticoreVelloSchedulerPanelProps {
  readonly initialCoreCount?: number;
  readonly initialPressureState?: ComputePressureState;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: MulticoreVelloSchedulerPlan) => void | Promise<void>;
  readonly onExportJson?: (json: string, plan: MulticoreVelloSchedulerPlan) => void | Promise<void>;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(72°·132°·158°·215°·188°·25° — 270~320° 완전 배제)
const SVG_INK_MAIN = "oklch(0.66 0.14 72)";
const SVG_INK_AUDIO = "oklch(0.56 0.13 132)";
const SVG_INK_WASM = "oklch(0.55 0.14 158)";
const SVG_INK_GPU = "oklch(0.56 0.13 215)";
const SVG_INK_NPU = "oklch(0.55 0.12 188)";
const SVG_INK_ALERT = "oklch(0.57 0.21 25)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const SWITCH_BASE = `flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;

const PRESSURE_META: Readonly<Record<ComputePressureState, { readonly ko: string; readonly en: string; readonly tone: string }>> = {
  nominal: { ko: "정상 (nominal)", en: "Nominal", tone: "border-good bg-good-soft text-good" },
  fair: { ko: "보통 (fair)", en: "Fair", tone: "border-line-strong bg-raised text-fg" },
  serious: { ko: "심각 (serious)", en: "Serious", tone: "border-warn bg-warning-soft text-warn" },
  critical: { ko: "임계 (critical)", en: "Critical", tone: "border-bad bg-bad-soft text-bad" },
};

const LANE_ROWS: readonly { readonly lane: ExecutionLaneKind; readonly ko: string; readonly en: string }[] = [
  { lane: "main-ui", ko: "메인 UI (계획)", en: "Main UI (Plan)" },
  { lane: "audio-worklet", ko: "AudioWorklet (1)", en: "AudioWorklet (1)" },
  { lane: "render-worker", ko: "Render Worker (1)", en: "Render Worker (1)" },
  { lane: "wasm-simd-pool", ko: "WASM SIMD 워커 풀", en: "WASM SIMD Pool" },
  { lane: "vello-gpu", ko: "Vello 6단계 GPU", en: "Vello 6-Stage GPU" },
  { lane: "webnn-npu", ko: "WebNN NPU / 폴백", en: "WebNN NPU / Fallback" },
];

function toneToSvgInk(tone: TimelineSegmentTone): string {
  switch (tone) {
    case "main": return SVG_INK_MAIN;
    case "audio": return SVG_INK_AUDIO;
    case "wasm": return SVG_INK_WASM;
    case "gpu": return SVG_INK_GPU;
    case "npu": return SVG_INK_NPU;
    case "alert": return SVG_INK_ALERT;
  }
}

function probeStateBadgeClass(state: ProbeRuntimeState): string {
  if (state === "active-stable") return "border-good bg-good-soft text-good";
  return state === "active-preview" ? "border-accent bg-accent-soft text-accent" : "border-warn bg-warning-soft text-warn";
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function HeterogeneousTimelineGanttSvg(props: {
  readonly plan: MulticoreVelloSchedulerPlan;
  readonly isEn: boolean;
}): ReactElement {
  const { plan, isEn } = props;
  const { cpuWorkerPool, velloComputeGraph, frameTimeline } = plan;

  const chartLeft = 148;
  const chartRight = 656;
  const chartW = chartRight - chartLeft;
  const rowStartY = 58;
  const rowStep = 36;
  const barHeight = 22;
  const scaleMaxMs = Math.max(frameTimeline.frameBudgetMs * 1.18, frameTimeline.totalFrameWallMs * 1.15, 10);
  const toX = (ms: number): number => Math.round((chartLeft + Math.min(1, Math.max(0, ms / scaleMaxMs)) * chartW) * 10) / 10;
  const budgetX = toX(frameTimeline.frameBudgetMs);
  const wallX = toX(frameTimeline.totalFrameWallMs);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    ms: Math.round(scaleMaxMs * ratio * 10) / 10,
    x: Math.round((chartLeft + chartW * ratio) * 10) / 10,
  }));
  const isSab = cpuWorkerPool.queueTransport === "sab-atomics-wait-async-ring";

  return (
    <svg
      data-testid="multicore-vello-gantt-svg"
      data-cores={cpuWorkerPool.hardwareConcurrency}
      data-pressure={cpuWorkerPool.pressureState}
      data-queue-transport={cpuWorkerPool.queueTransport}
      data-active-wasm-workers={cpuWorkerPool.activeWasmSimdWorkerCount}
      data-vello-stages={velloComputeGraph.totalStages}
      data-npu-backend={frameTimeline.npuExecutionBackend}
      data-meets-budget={frameTimeline.meetsFrameBudget ? "true" : "false"}
      viewBox="0 0 680 326"
      role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `Heterogeneous multicore CPU (${cpuWorkerPool.activeWasmSimdWorkerCount} WASM workers), Vello 6-stage GPU compute, and NPU parallel frame timeline (${frameTimeline.totalFrameWallMs} ms wall time)`
        : `CPU 멀티코어(WASM 워커 ${cpuWorkerPool.activeWasmSimdWorkerCount}개)·Vello 6단계 GPU 컴퓨트·NPU 병렬 실행 타임라인 간트 도해(프레임 합산 ${frameTimeline.totalFrameWallMs} ms)`}
    >
      <rect x="10" y="10" width="660" height="306" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />

      <text x="24" y="30" fill="currentColor" fillOpacity={0.82} fontSize="11" fontWeight="700">
        {isEn ? "HETEROGENEOUS CPU · VELLO 6-STAGE GPU · NPU FRAME TIMELINE" : "CPU 멀티코어 · Vello 6단계 GPU · NPU 동시 실행 프레임 타임라인"}
      </text>
      <text x="656" y="30" textAnchor="end" fill={frameTimeline.meetsFrameBudget ? SVG_INK_WASM : SVG_INK_ALERT} fontSize="10" fontWeight="700">
        {isEn
          ? `Model ${frameTimeline.totalFrameWallMs.toFixed(2)}ms / ${frameTimeline.frameBudgetMs.toFixed(2)}ms (${frameTimeline.effectiveFrameRateHz}Hz · -${frameTimeline.parallelOverlapGainPct.toFixed(0)}%)`
          : `모델 ${frameTimeline.totalFrameWallMs.toFixed(2)}ms / 예산 ${frameTimeline.frameBudgetMs.toFixed(2)}ms (${frameTimeline.effectiveFrameRateHz}Hz · 병렬 -${frameTimeline.parallelOverlapGainPct.toFixed(0)}%)`}
      </text>
      <text x="24" y="46" fill="currentColor" fillOpacity={0.62} fontSize="9">
        {isEn
          ? `Queue plan: ${isSab ? "SAB + Atomics.waitAsync" : "MessageChannel Transferable"} · WASM Pool: ${cpuWorkerPool.activeWasmSimdWorkerCount}/${cpuWorkerPool.rawWasmSimdWorkerCount} · Blocking unmeasured`
          : `큐 계획: ${isSab ? "SAB + Atomics.waitAsync" : "MessageChannel Transferable"} · WASM 풀: ${cpuWorkerPool.activeWasmSimdWorkerCount}/${cpuWorkerPool.rawWasmSimdWorkerCount} · 차단율 미측정`}
      </text>

      {ticks.map((tick) => (
        <g key={tick.ratio}>
          <line x1={tick.x} y1={rowStartY - 6} x2={tick.x} y2={rowStartY + LANE_ROWS.length * rowStep - 4} stroke="currentColor" strokeOpacity={0.12} strokeDasharray={tick.ratio === 0 ? undefined : "2 3"} />
          <text x={tick.x} y={rowStartY + LANE_ROWS.length * rowStep + 10} textAnchor={tick.ratio === 1 ? "end" : tick.ratio === 0 ? "start" : "middle"} fill="currentColor" fillOpacity={0.58} fontSize="8.5">
            {tick.ms}ms
          </text>
        </g>
      ))}

      {LANE_ROWS.map((row, rowIndex) => {
        const y = rowStartY + rowIndex * rowStep;
        const rowSegments = frameTimeline.segments.filter((seg) => seg.lane === row.lane);
        const laneLabel = row.lane === "wasm-simd-pool"
          ? isEn ? `WASM Pool (×${cpuWorkerPool.activeWasmSimdWorkerCount})` : `WASM 풀 (×${cpuWorkerPool.activeWasmSimdWorkerCount})`
          : isEn ? row.en : row.ko;

        return (
          <g key={row.lane}>
            <rect x="20" y={y} width="640" height={barHeight + 6} rx="6" fill="currentColor" fillOpacity={rowIndex % 2 === 0 ? 0.04 : 0.015} />
            <text x="28" y={y + 17} fill="currentColor" fillOpacity={0.82} fontSize="9.5" fontWeight="600">{laneLabel}</text>

            {rowSegments.map((seg) => {
              const x1 = toX(seg.startMs);
              const x2 = toX(seg.endMs);
              const segW = Math.max(8, Math.round((x2 - x1) * 10) / 10);
              const ink = toneToSvgInk(seg.tone);
              const shortTag = seg.stageId
                ? seg.labelEn.split(".")[0]
                : segW >= 110 ? (isEn ? seg.labelEn : seg.labelKo).slice(0, 22) : `${seg.durationMs.toFixed(1)}ms`;

              return (
                <g key={seg.id} data-vello-stage={seg.stageId}>
                  <rect x={x1} y={y + 3} width={segW} height={barHeight} rx="4" fill={ink} fillOpacity={seg.isFallback ? 0.24 : 0.82} stroke={ink} strokeWidth={seg.isFallback ? "1.6" : "1"} strokeDasharray={seg.isFallback ? "3 2" : undefined} />
                  {segW >= 18 && (
                    <text x={x1 + segW / 2} y={y + 17} textAnchor="middle" fill={seg.isFallback ? ink : "currentColor"} fontSize={seg.stageId ? "8.5" : "8"} fontWeight="700">
                      {shortTag}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      <line x1={budgetX} y1={rowStartY - 8} x2={budgetX} y2={rowStartY + LANE_ROWS.length * rowStep - 2} stroke={SVG_INK_ALERT} strokeWidth="1.8" strokeDasharray="4 2" />
      <text x={Math.min(chartRight - 4, Math.max(chartLeft + 4, budgetX - 4))} y={rowStartY - 10} textAnchor="end" fill={SVG_INK_ALERT} fontSize="8.5" fontWeight="700">
        {isEn ? `Budget ${frameTimeline.frameBudgetMs}ms` : `예산 ${frameTimeline.frameBudgetMs}ms`}
      </text>
      <line x1={wallX} y1={rowStartY - 4} x2={wallX} y2={rowStartY + LANE_ROWS.length * rowStep - 2} stroke={SVG_INK_WASM} strokeWidth="1.4" />

      <g fontSize="8.8" fill="currentColor" fillOpacity={0.78}>
        <rect x="24" y="294" width="9" height="9" rx="2" fill={SVG_INK_MAIN} />
        <text x="37" y="302">{isEn ? "Main UI plan" : "메인 UI 계획"}</text>
        <rect x="128" y="294" width="9" height="9" rx="2" fill={SVG_INK_AUDIO} />
        <text x="141" y="302">AudioWorklet</text>
        <rect x="226" y="294" width="9" height="9" rx="2" fill={SVG_INK_WASM} />
        <text x="239" y="302">WASM SIMD</text>
        <rect x="320" y="294" width="9" height="9" rx="2" fill={SVG_INK_GPU} />
        <text x="333" y="302">{isEn ? "Vello GPU ①~⑥" : "Vello GPU ①~⑥"}</text>
        <rect x="434" y="294" width="9" height="9" rx="2" fill={SVG_INK_NPU} />
        <text x="447" y="302">WebNN NPU</text>
        <rect x="526" y="294" width="9" height="9" rx="2" fill={SVG_INK_ALERT} fillOpacity={0.35} stroke={SVG_INK_ALERT} strokeDasharray="2 1" />
        <text x="539" y="302">{isEn ? "Fallback / Cap" : "폴백 · 예산선"}</text>
      </g>
    </svg>
  );
}

/** CPU 멀티코어 · Vello 6단계 GPU 컴퓨트 · NPU · Chrome Preview 스케줄러 스튜디오 제어판. */
export function StudioMulticoreVelloSchedulerPanel(props: StudioMulticoreVelloSchedulerPanelProps): ReactElement {
  const {
    initialCoreCount = DEFAULT_HARDWARE_CONCURRENCY,
    initialPressureState = "nominal",
    locale = "ko",
    className,
    onPlanChange,
    onExportJson,
  } = props;

  const headingId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialEnvironment = normalizeSchedulerEnvironmentInput({ hardwareConcurrency: initialCoreCount, pressureState: initialPressureState });
  const [coreCount, setCoreCount] = useState<number>(initialEnvironment.hardwareConcurrency);
  const [pressureState, setPressureState] = useState<ComputePressureState>(initialEnvironment.pressureState);
  const [coopCoepIsolated, setCoopCoepIsolated] = useState<boolean>(true);
  const [chromePreviewEnabled, setChromePreviewEnabled] = useState<boolean>(true);
  const [targetFrameRateHz, setTargetFrameRateHz] = useState<60 | 120>(120);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [copyPending, setCopyPending] = useState(false);

  const currentInput: SchedulerEnvironmentInput = useMemo(
    () => ({ hardwareConcurrency: coreCount, pressureState, coopCoepIsolated, chromePreviewEnabled, targetFrameRateHz }),
    [coreCount, pressureState, coopCoepIsolated, chromePreviewEnabled, targetFrameRateHz],
  );
  const { plan, json: manifestJson } = useMemo(() => exportMulticoreVelloPlanJson(currentInput), [currentInput]);
  const gpuSourceExample = useMemo(() => negotiateExtremeWebGpuProfile(
    chromePreviewEnabled ? ["subgroups", "shader-f16"] : [],
  ), [chromePreviewEnabled]);

  const commitChange = (next: SchedulerEnvironmentInput, noticeKo: string, noticeEn: string): void => {
    const { plan: nextPlan } = exportMulticoreVelloPlanJson(next);
    setStatusMessage(pick(noticeKo, noticeEn));
    try {
      Promise.resolve(onPlanChange?.(nextPlan)).catch(() => setStatusMessage(pick("로컬 계획은 계산했지만 수신자에게 전달하지 못했습니다. 설정을 다시 선택해 재시도하세요.", "Local plan calculated; delivery failed. Select the setting again to retry.")));
    } catch {
      setStatusMessage(pick("로컬 계획은 계산했지만 수신자에게 전달하지 못했습니다. 설정을 다시 선택해 재시도하세요.", "Local plan calculated; delivery failed. Select the setting again to retry."));
    }
  };

  const handleSelectCoreCount = (nextCores: number): void => {
    setCoreCount(nextCores);
    commitChange(
      { ...currentInput, hardwareConcurrency: nextCores },
      `CPU 논리 코어를 ${nextCores}코어로 조정해 Work-Stealing 풀을 재계산했습니다.`,
      `Recalculated work-stealing worker pool for ${nextCores} logical CPU cores.`,
    );
  };

  const handleSelectPressure = (nextPressure: ComputePressureState): void => {
    setPressureState(nextPressure);
    commitChange(
      { ...currentInput, pressureState: nextPressure },
      `Compute Pressure 열 상태를 ${nextPressure} 단계로 전환했습니다.`,
      `Switched Compute Pressure thermal state to ${nextPressure}.`,
    );
  };

  const handleToggleSab = (): void => {
    const nextSab = !coopCoepIsolated;
    setCoopCoepIsolated(nextSab);
    commitChange(
      { ...currentInput, coopCoepIsolated: nextSab },
      nextSab
        ? "COOP/COEP 격리 지원을 가정해 SAB 큐 계획을 계산했습니다. 실제 헤더·워커는 변경하지 않습니다."
        : "COOP/COEP 미지원 가정으로 MessageChannel Transferable 링 계획을 계산했습니다.",
      nextSab
        ? "Assumed COOP/COEP isolation for the SAB queue plan. No headers or workers changed."
        : "Assumed no isolation for the MessageChannel Transferable queue plan.",
    );
  };

  const handleToggleChromePreview = (): void => {
    const nextPreview = !chromePreviewEnabled;
    setChromePreviewEnabled(nextPreview);
    commitChange(
      { ...currentInput, chromePreviewEnabled: nextPreview },
      nextPreview
        ? "Chrome Preview API 지원을 가정한 계획입니다. 실제 기능은 검사하거나 활성화하지 않습니다."
        : "Chrome Preview API 미지원 가정으로 폴백 계획을 계산했습니다.",
      nextPreview
        ? "Assumed Chrome Preview support. APIs were neither tested nor enabled."
        : "Calculated fallback plans assuming no Chrome Preview support.",
    );
  };

  const handleSelectFrameRate = (hz: 60 | 120): void => {
    setTargetFrameRateHz(hz);
    commitChange(
      { ...currentInput, targetFrameRateHz: hz },
      `목표 주사율을 ${hz}Hz(${hz === 120 ? "8.33" : "16.67"}ms 예산)로 변경했습니다.`,
      `Set target refresh rate to ${hz}Hz (${hz === 120 ? "8.33" : "16.67"}ms budget).`,
    );
  };

  const handleReset = (): void => {
    setCoreCount(initialEnvironment.hardwareConcurrency);
    setPressureState(initialEnvironment.pressureState);
    setCoopCoepIsolated(true);
    setChromePreviewEnabled(true);
    setTargetFrameRateHz(120);
    commitChange(
      { hardwareConcurrency: initialCoreCount, pressureState: initialPressureState, coopCoepIsolated: true, chromePreviewEnabled: true, targetFrameRateHz: 120 },
      "스케줄러 설정을 초기 기본값으로 복원했습니다.",
      "Restored scheduler parameters to default values.",
    );
  };

  const handleCopyJson = async (): Promise<void> => {
    if (copyPending) return;
    setCopyPending(true);
    setShowJsonPreview(true);
    setStatusMessage(pick("JSON 매니페스트 복사 중…", "Copying JSON manifest…"));
    let copyNotice: string;
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(manifestJson);
      copyNotice = pick(`${plan.environment.hardwareConcurrency}코어 계획 JSON 매니페스트를 복사했습니다.`, `Copied the ${plan.environment.hardwareConcurrency}-core plan JSON manifest.`);
    } catch {
      copyNotice = pick("JSON 매니페스트 복사 실패. 미리보기에서 직접 복사하거나 다시 시도하세요.", "JSON manifest copy failed. Copy from the preview or retry.");
    }
    try {
      await onExportJson?.(manifestJson, plan);
      setStatusMessage(copyNotice);
    } catch {
      setStatusMessage(`${copyNotice} ${pick("수신자 전달 실패. 다시 시도하세요.", "Delivery to receiver failed. Retry.")}`);
    } finally {
      setCopyPending(false);
    }
  };

  const { cpuWorkerPool, velloComputeGraph, platformMatrix, frameTimeline } = plan;
  const pressureMeta = PRESSURE_META[pressureState];

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-multicore-vello-scheduler-panel"
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}
    >
      {/* 헤더 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("CPU · Vello GPU · NPU 스케줄러 계획 시뮬레이터", "CPU · Vello GPU · NPU Scheduler Plan Simulator")}
            </h2>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-2">Wave 53C</span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "입력한 지원 가정으로 워커 수와 수식 기반 시간을 비교합니다. 실제 Worker·GPU·NPU는 실행하지 않으며 120Hz·차단율·점유율은 실측하지 않았습니다.",
              "Compares worker allocations and modeled timings under selected assumptions. No Worker, GPU, or NPU execution; 120Hz, blocking, and occupancy are unmeasured.",
            )}
          </p>
        </div>

        <button type="button" data-testid="reset-scheduler-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("초기값 복원", "Reset")}</span>
        </button>
      </header>

      {/* 제어 바: 코어 수 · Compute Pressure · SAB/Preview 토글 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3 lg:col-span-5">
          <div className="flex items-center justify-between text-xs font-bold text-fg [word-break:keep-all]">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("CPU 논리 코어 수 (hardwareConcurrency)", "CPU Logical Cores (hardwareConcurrency)")}
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">WASM {cpuWorkerPool.activeWasmSimdWorkerCount}/{cpuWorkerPool.rawWasmSimdWorkerCount}</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("CPU 코어 프리셋", "CPU core presets")}>
            {CORE_COUNT_PRESETS.map((cores) => (
              <button key={cores} type="button" data-testid={`core-preset-${cores}`} aria-pressed={coreCount === cores} onClick={() => handleSelectCoreCount(cores)} className={`${coreCount === cores ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}>
                {isEn ? `${cores} Cores` : `${cores}코어`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-fg-3">{pick("목표 주사율", "Target Hz")}</span>
            {([120, 60] as const).map((hz) => (
              <button key={hz} type="button" data-testid={`target-hz-${hz}`} aria-pressed={targetFrameRateHz === hz} onClick={() => handleSelectFrameRate(hz)} className={`${targetFrameRateHz === hz ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}>
                {hz}Hz
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3 lg:col-span-4">
          <div className="flex items-center justify-between text-xs font-bold text-fg [word-break:keep-all]">
            <span className="inline-flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
              {pick("Compute Pressure 열 상태", "Compute Pressure State")}
            </span>
            <span data-testid="pressure-badge" className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${pressureMeta.tone}`}>
              {isEn ? pressureMeta.en : pressureMeta.ko}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("열 압력 상태 선택", "Compute pressure state")}>
            {COMPUTE_PRESSURE_STATES.map((state) => (
              <button key={state} type="button" data-testid={`pressure-state-${state}`} aria-pressed={pressureState === state} onClick={() => handleSelectPressure(state)} className={pressureState === state ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? PRESSURE_META[state].en : PRESSURE_META[state].ko}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3 lg:col-span-3">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("지원 환경 가정", "Assumed environment")}</div>
          <button type="button" role="switch" aria-checked={coopCoepIsolated} data-testid="toggle-coop-coep-sab" onClick={handleToggleSab} className={`${SWITCH_BASE} ${coopCoepIsolated ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
            <span className="text-xs font-semibold">{pick("COOP/COEP SAB 지원 가정", "Assume COOP/COEP SAB")}</span>
            <span className="font-mono text-[11px] font-bold">{coopCoepIsolated ? "SAB" : "MsgCh"}</span>
          </button>
          <button type="button" role="switch" aria-checked={chromePreviewEnabled} data-testid="toggle-chrome-preview" onClick={handleToggleChromePreview} className={`${SWITCH_BASE} ${chromePreviewEnabled ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised text-fg-2"}`}>
            <span className="text-xs font-semibold">{pick("Preview API 지원 가정", "Assume Preview APIs")}</span>
            <span className="font-mono text-[11px] font-bold">{chromePreviewEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* 4종 KPI 요약 카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("CPU Work-Stealing 풀", "CPU Work-Stealing Pool")}</span>
          </div>
          <div data-testid="kpi-worker-summary" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {pick(`1 오디오 + 1 렌더 + ${cpuWorkerPool.activeWasmSimdWorkerCount} WASM`, `1 Audio + 1 Render + ${cpuWorkerPool.activeWasmSimdWorkerCount} WASM`)}
          </div>
          <div data-testid="kpi-queue-transport" className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
            {cpuWorkerPool.queueTransport === "sab-atomics-wait-async-ring"
              ? `SAB Atomics.waitAsync (${cpuWorkerPool.estimatedDispatchOverheadUs}µs)`
              : pick(`MessageChannel 폴백 (${cpuWorkerPool.estimatedDispatchOverheadUs}µs)`, `MessageChannel Fallback (${cpuWorkerPool.estimatedDispatchOverheadUs}µs)`)}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Vello 6단계 GPU 컴퓨트", "Vello 6-Stage GPU Compute")}</span>
          </div>
          <div data-testid="kpi-vello-gpu-ms" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{formatMs(velloComputeGraph.totalEstimatedGpuMs)}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
            {pick(`비동기 사전컴파일 ${formatMs(velloComputeGraph.parallelAsyncPrecompileMs)} (${velloComputeGraph.precompileSpeedupRatio}×)`, `Async precompile ${formatMs(velloComputeGraph.parallelAsyncPrecompileMs)} (${velloComputeGraph.precompileSpeedupRatio}×)`)}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("모델 프레임 시간 · 병렬 추정", "Modeled Frame Time & Overlap")}</span>
          </div>
          <div data-testid="kpi-frame-wall-ms" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {formatMs(frameTimeline.totalFrameWallMs)} / {frameTimeline.frameBudgetMs}ms
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
            {pick(`직렬 대비 -${frameTimeline.parallelOverlapGainPct.toFixed(1)}% · ${frameTimeline.estimatedAchievableFps} FPS`, `-${frameTimeline.parallelOverlapGainPct.toFixed(1)}% vs serial · ${frameTimeline.estimatedAchievableFps} FPS`)}
          </div>
        </div>

        <div className={`rounded-xl border p-3 ${frameTimeline.meetsFrameBudget ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {frameTimeline.meetsFrameBudget ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("메인 스레드 차단 · 호환 현황", "Main Thread & Probe Status")}</span>
          </div>
          <div data-testid="kpi-main-blocking" className="mt-1 font-mono text-sm font-bold tabular-nums">{pick("차단율 미측정 · 목표 0%", "Blocking unmeasured · Target 0%")}</div>
          <div data-testid="kpi-probe-counts" className="mt-0.5 text-[11px] tabular-nums [word-break:keep-all]">
            {pick(`안정 ${platformMatrix.activeStableCount} · Preview ${platformMatrix.activePreviewCount} · 폴백 ${platformMatrix.fallbackCount}`, `Stable ${platformMatrix.activeStableCount} · Preview ${platformMatrix.activePreviewCount} · Fallback ${platformMatrix.fallbackCount}`)}
          </div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 병렬 타임라인 간트 도해 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <HeterogeneousTimelineGanttSvg plan={plan} isEn={isEn} />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <p data-testid="pressure-action-note" className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${pressureMeta.tone}`}>
            {pick("계획(미실행): ", "Plan, not executed: ")}{isEn ? cpuWorkerPool.pressureActionEn : cpuWorkerPool.pressureActionKo}
          </p>
          <p data-testid="queue-fallback-note" className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${cpuWorkerPool.fallbackReasonKo ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
            {cpuWorkerPool.fallbackReasonKo
              ? (isEn ? cpuWorkerPool.fallbackReasonEn : cpuWorkerPool.fallbackReasonKo)
              : pick(`SAB 지원 가정 — ${cpuWorkerPool.ringSlotCount}슬롯 링버퍼 계획(미실행).`, `SAB support assumed — ${cpuWorkerPool.ringSlotCount}-slot ring buffer plan, not executed.`)}
          </p>
        </div>
      </div>

      {/* Vello 6단계 GPU 멀티스레드 컴퓨트 파이프라인 표 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Vello 6단계 GPU 멀티스레드 컴퓨트 파이프라인", "Vello 6-Stage GPU Compute Pipeline")}</span>
          </div>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {isEn ? velloComputeGraph.timingSourceLabelEn : velloComputeGraph.timingSourceLabelKo}
          </span>
        </div>
        <p data-testid="vello-shader-source-example" className="text-[11px] text-fg-2">
          {pick("분광 셰이더 후보 예제", "Spectral shader candidate example")}
          {" · "}
          {gpuSourceExample.shaders.spectralBrushVariant} ({gpuSourceExample.spectralStorageBytesPerPixel} B/px)
        </p>

        <div className="overflow-x-auto">
          <table data-testid="vello-stages-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2 py-2 font-semibold">{pick("스테이지", "Stage")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("Workgroup · 바인딩", "Workgroup & Bindings")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("워프 점유율 제약", "Warp Occupancy")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("WGSL 확장 / 폴백", "WGSL / Fallback")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("사전컴파일 · GPU", "Precompile & GPU")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {velloComputeGraph.stages.map((stage) => (
                <tr key={stage.id} data-testid={`vello-stage-row-${stage.id}`} className="align-top">
                  <td className="px-2 py-2 font-semibold text-fg [word-break:keep-all]">
                    <div>{isEn ? stage.nameEn : stage.nameKo}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-fg-3">{isEn ? stage.roleEn : stage.roleKo}</div>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] text-fg-2 tabular-nums">
                    <div>[{stage.workgroupSize.join("×")}]</div>
                    <div className="text-fg-3">{stage.storageBindingCount}S + {stage.uniformBindingCount}U ({stage.totalBindings})</div>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
                    <div className="font-mono font-semibold text-fg">
                      {stage.warpOccupancy.estimatedOccupancyPct}% · SG{stage.warpOccupancy.targetSubgroupSize} · {(stage.warpOccupancy.estimatedSharedMemBytes / 1024).toFixed(0)}KB
                    </div>
                    <div className="text-fg-3">{isEn ? stage.warpOccupancy.bottleneckNoteEn : stage.warpOccupancy.bottleneckNoteKo}</div>
                  </td>
                  <td className="px-2 py-2 text-[11px] [word-break:keep-all]">
                    <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${stage.fallbackActive ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
                      {stage.activeFeatureTag}
                    </span>
                    <div className="mt-1 text-fg-3">{pick("계획: ", "Plan: ")}{isEn ? stage.fallbackNoteEn : stage.fallbackNoteKo}</div>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] tabular-nums">
                    <div className="font-bold text-fg">{formatMs(stage.estimatedGpuMs)}</div>
                    <div className="text-fg-3">W{stage.asyncPrecompile.parallelWave} · {stage.asyncPrecompile.estimatedCompileMs.toFixed(1)}ms</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 10종 최신 브라우저 / Chrome Preview 차세대 웹 플랫폼 매트릭스 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("최신 브라우저 · Chrome Preview 차세대 웹 플랫폼 10종 매트릭스", "10 Next-Gen Web Platform & Chrome Preview Matrix")}</span>
          </div>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{platformMatrix.totalProbes} APIs</span>
        </div>

        <div className="overflow-x-auto">
          <table data-testid="nextgen-platform-matrix-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2 py-2 font-semibold">{pick("웹 플랫폼 API", "Web Platform API")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("지원 단계", "Support Track")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("브라우저 현황 · 역할", "Browser Status & Role")}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{pick("미지원 폴백 경로", "Safe Fallback Path")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {platformMatrix.probes.map((entry) => (
                <tr key={entry.spec.id} data-testid={`probe-row-${entry.spec.id}`} className="align-top">
                  <td className="px-2 py-2 font-semibold text-fg [word-break:keep-all]">
                    <div>{isEn ? entry.spec.titleEn : entry.spec.titleKo}</div>
                    <div className="mt-0.5 font-mono text-[10px] font-normal text-fg-3">{entry.spec.apiName}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${probeStateBadgeClass(entry.runtimeState)}`}>
                      {entry.runtimeState === "active-stable" ? pick("기본 지원 가정", "Assumed baseline") : entry.runtimeState === "active-preview" ? pick("Preview 지원 가정", "Assumed Preview/OT") : pick("폴백 가정", "Assumed fallback")}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
                    <div>{isEn ? entry.statusReasonEn : entry.statusReasonKo}</div>
                    <div className="mt-0.5 text-fg-3">{isEn ? entry.spec.accelerationRoleEn : entry.spec.accelerationRoleKo}</div>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? entry.spec.fallbackPathEn : entry.spec.fallbackPathKo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 현재 구현 vs 목표 런타임 구분 및 JSON 매니페스트 내보내기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="grid grid-cols-1 gap-2 text-[11px] text-fg-2 md:grid-cols-2 [word-break:keep-all]">
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? plan.honestScopeDisclosure.currentImplementationEn : plan.honestScopeDisclosure.currentImplementationKo}</p>
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? plan.honestScopeDisclosure.targetRuntimeEn : plan.honestScopeDisclosure.targetRuntimeKo}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("스케줄러 JSON 매니페스트 내보내기", "Scheduler JSON Manifest Export")}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="copy-manifest-json-btn" onClick={() => void handleCopyJson()} disabled={copyPending} aria-busy={copyPending} className={BTN_SOLID}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 매니페스트 복사", "Copy Manifest JSON")}</span>
            </button>
            <button type="button" data-testid="toggle-manifest-preview-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showJsonPreview ? pick("미리보기 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}</span>
            </button>
          </div>
        </div>

        {showJsonPreview && (
          <pre data-testid="manifest-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {manifestJson}
          </pre>
        )}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="scheduler-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </div>
      )}
    </section>
  );
}
