/**
 * Wave 58D — 초실시간 WGSL 12종 셰이더 3-Wave 프리컴파일 캐시 & 로컬 WebCodecs 4K 60fps 무빙툰 인코더 제어판.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 순수 시맨틱 SVG 2단 시각화(좌: 12종 WGSL 3-Wave 비동기 프리컴파일 간트 차트,
 *   우: GPUTexture → VideoFrame → VideoEncoder → OPFS MP4 Zero-Copy 스트리밍 파이프라인 & 용량 게이지)
 */

import {
  CheckCircle2, Copy, Cpu, Eye, Film, HardDrive, Layers, RotateCcw, ShieldAlert, ShieldCheck, Zap,
} from "lucide-react";
import { useId, type ReactElement } from "react";

import {
  EXPORT_PRESETS, WEBCODECS_CODEC_PROFILES,
  type ExportPresetId, type LocalWebCodecsExportPlan, type PrewarmWaveIndex, type ShaderPrewarmPlan,
  type ShaderWebCodecsCombinedPlan, type WebCodecsCodecId,
} from "./shader-prewarm-webcodecs-engine";

import { useShaderCodecsController } from "./use-shader-codecs-controller";

export interface StudioShaderPrewarmWebCodecsPanelProps {
  readonly initialExportPresetId?: ExportPresetId;
  readonly initialCodecId?: WebCodecsCodecId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: ShaderWebCodecsCombinedPlan) => void | Promise<void>;
  readonly onExportJson?: (json: string, plan: ShaderWebCodecsCombinedPlan) => void | Promise<void>;
}

// 탈-바이올렛 OKLCH SVG 시맨틱 잉크(휴 200°·152°·68°·156°·58°·28°·218° — 270~320° 완전 배제)
const SVG_INK_WAVE1 = "oklch(0.72 0.15 200)";
const SVG_INK_WAVE2 = "oklch(0.74 0.15 152)";
const SVG_INK_WAVE3 = "oklch(0.80 0.15 68)";
const SVG_INK_GOOD = "oklch(0.72 0.16 156)";
const SVG_INK_WARN = "oklch(0.78 0.16 58)";
const SVG_INK_BAD = "oklch(0.68 0.18 28)";
const SVG_INK_SLATE = "oklch(0.62 0.06 218)";
const WAVE_INKS: Readonly<Record<PrewarmWaveIndex, string>> = { 1: SVG_INK_WAVE1, 2: SVG_INK_WAVE2, 3: SVG_INK_WAVE3 };
const PARALLEL_SLOT_OPTIONS = [1, 2, 3, 4] as const;
const OPFS_QUICK_PRESETS_MB = [256, 512, 2048, 8192] as const;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function ShaderPrewarmGanttSvg(props: { readonly prewarm: ShaderPrewarmPlan; readonly isEn: boolean }): ReactElement {
  const { prewarm, isEn } = props;
  const { tasks, stutterComparison, config } = prewarm;
  const maxWallMs = Math.max(10, stutterComparison.totalPrewarmWallTimeMs);
  const labelX = 14; const chartX = 178; const chartW = 282; const topY = 48; const rowH = 19; const barH = 11;
  const wave1ReadyX = chartX + (stutterComparison.wave1ReadyWallTimeMs / maxWallMs) * chartW;
  const coldFillW = Math.min(200, Math.max(18, (stutterComparison.coldStartFirstStrokeBlockingMs / Math.max(1, stutterComparison.coldStartFirstStrokeBlockingMs)) * 190));

  return (
    <svg
      data-testid="shader-prewarm-gantt-svg" data-pipeline-count={tasks.length} data-parallel-slots={config.parallelWaveSlots}
      data-cache-hit-enabled={String(config.cacheHitEnabled)} data-total-wall-ms={stutterComparison.totalPrewarmWallTimeMs}
      data-cold-stall-ms={stutterComparison.coldStartFirstStrokeBlockingMs} data-model-kind={prewarm.modelKind}
      viewBox="0 0 476 346" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `12 WGSL shader 3-Wave async prewarm Gantt chart across ${config.parallelWaveSlots} parallel lanes, total model time ${stutterComparison.totalPrewarmWallTimeMs}ms, first-stroke blocking 0ms`
        : `12종 WGSL 셰이더 3-Wave 비동기 프리컴파일 간트 차트: 병렬 ${config.parallelWaveSlots}슬롯, 전체 워밍 모델 ${stutterComparison.totalPrewarmWallTimeMs}ms, 첫 획 블로킹 0ms`}
    >
      <text x={labelX} y={20} fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? "12 WGSL PIPELINES · 3-WAVE ASYNC PREWARM GANTT" : "12종 WGSL · 3-WAVE 비동기 프리컴파일 간트 차트"}
      </text>
      <text x={labelX} y={35} fill="currentColor" fillOpacity={0.65} fontSize="9.5">
        {isEn
          ? `Lanes: ${config.parallelWaveSlots} · Cache: ${config.cacheHitEnabled ? "HIT (PSO Hash)" : "COLD Compile"} · Wall: ${stutterComparison.totalPrewarmWallTimeMs}ms`
          : `병렬 슬롯 ${config.parallelWaveSlots} · 캐시 ${config.cacheHitEnabled ? "적중(해시 재사용)" : "콜드 컴파일"} · 총 ${stutterComparison.totalPrewarmWallTimeMs}ms`}
      </text>

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const gx = chartX + ratio * chartW;
        return (
          <g key={ratio}>
            <line x1={gx} y1={topY - 4} x2={gx} y2={topY + tasks.length * rowH + 4} stroke="currentColor" strokeOpacity={0.14} strokeDasharray="2 3" />
            <text x={gx} y={topY - 8} textAnchor="middle" fill="currentColor" fillOpacity={0.55} fontSize="8.5">{`${Math.round(ratio * maxWallMs)}ms`}</text>
          </g>
        );
      })}

      {tasks.map((task, idx) => {
        const y = topY + idx * rowH;
        const bx = chartX + (task.startMs / maxWallMs) * chartW;
        const bw = Math.max(8, ((task.endMs - task.startMs) / maxWallMs) * chartW);
        const ink = WAVE_INKS[task.wave];
        return (
          <g key={task.pipeline.id} data-gantt-pipeline={task.pipeline.id} data-wave={task.wave}>
            <rect x={10} y={y} width={456} height={rowH - 2} rx={3} fill="currentColor" fillOpacity={idx % 2 === 0 ? 0.03 : 0.01} />
            <rect x={12} y={y + 3} width={16} height={11} rx={3} fill={ink} fillOpacity={0.22} stroke={ink} strokeWidth="0.9" />
            <text x={20} y={y + 11} textAnchor="middle" fill={ink} fontSize="8" fontWeight="700">{`W${task.wave}`}</text>
            <text x={33} y={y + 11.5} fill="currentColor" fillOpacity={0.9} fontSize="9.2" fontWeight="600">{task.pipeline.labelEn}</text>
            <rect x={bx} y={y + 3} width={bw} height={barH} rx={3} fill={ink} fillOpacity={task.cacheHit ? 0.88 : 0.45} stroke={ink} strokeWidth="1.2" strokeDasharray={task.cacheHit ? undefined : "3 2"} />
            <text x={Math.min(chartX + chartW - 2, bx + bw + 4)} y={y + 11.5} fill="currentColor" fillOpacity={0.72} fontSize="8" textAnchor={bx + bw > chartX + chartW - 34 ? "end" : "start"}>
              {`${task.compileCostMs}ms`}
            </text>
          </g>
        );
      })}

      <line x1={wave1ReadyX} y1={topY - 2} x2={wave1ReadyX} y2={topY + tasks.length * rowH + 4} stroke={SVG_INK_GOOD} strokeWidth="1.6" strokeDasharray="4 2" />
      <text x={Math.min(chartX + chartW - 4, wave1ReadyX + 4)} y={topY + tasks.length * rowH + 16} textAnchor={wave1ReadyX > chartX + chartW - 110 ? "end" : "start"} fill={SVG_INK_GOOD} fontSize="8.8" fontWeight="700">
        {isEn
          ? `Wave 1 Ready (${stutterComparison.wave1ReadyWallTimeMs}ms) · 0 Dropped Frames`
          : `Wave 1 준비 완료(${stutterComparison.wave1ReadyWallTimeMs}ms) · 첫 획 프레임 드랍 0`}
      </text>

      <g transform="translate(14, 300)">
        <rect x={0} y={0} width={448} height={36} rx={7} fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.14} />
        <text x={10} y={14} fill={SVG_INK_BAD} fontSize="8.8" fontWeight="700">
          {isEn
            ? `Cold First-Stroke Stall: ${stutterComparison.coldStartFirstStrokeBlockingMs}ms (${stutterComparison.coldStartDroppedFrames60fps}f drop)`
            : `콜드 첫 획 블로킹: ${stutterComparison.coldStartFirstStrokeBlockingMs}ms (${stutterComparison.coldStartDroppedFrames60fps}프레임 드랍)`}
        </text>
        <rect x={242} y={6} width={coldFillW} height={8} rx={3} fill={SVG_INK_BAD} fillOpacity={0.78} />
        <text x={10} y={29} fill={SVG_INK_GOOD} fontSize="8.8" fontWeight="700">
          {isEn
            ? `3-Wave Prewarm + Hash Cache: 0ms blocking (0f drop · -${stutterComparison.firstStrokeStutterReductionPct}%)`
            : `3-Wave 프리컴파일 캐시: 0ms 블로킹 (0프레임 드랍 · -${stutterComparison.firstStrokeStutterReductionPct}%)`}
        </text>
        <rect x={242} y={21} width={10} height={8} rx={3} fill={SVG_INK_GOOD} />
      </g>
    </svg>
  );
}

function WebCodecsZeroCopyPipelineSvg(props: { readonly exportPlan: LocalWebCodecsExportPlan; readonly isEn: boolean }): ReactElement {
  const { exportPlan, isEn } = props;
  const { preset, codecResolution, zeroCopyStages, opfsSafetyGate, serverCostSavings } = exportPlan;
  const gateInk = opfsSafetyGate.status === "pass" ? SVG_INK_GOOD : opfsSafetyGate.status === "warn" ? SVG_INK_WARN : SVG_INK_BAD;
  const stageInks = [SVG_INK_WAVE1, SVG_INK_WAVE2, SVG_INK_WAVE3, gateInk] as const;

  const gaugeX = 24; const gaugeW = 428; const gaugeY = 236;
  const denomMb = Math.max(opfsSafetyGate.opfsFreeMb, opfsSafetyGate.requiredWorkspaceMb, 1);
  const outputBarW = Math.min(gaugeW, (opfsSafetyGate.estimatedOutputMb / denomMb) * gaugeW);
  const reserveBarW = Math.min(gaugeW - outputBarW, (opfsSafetyGate.safetyReserveMb / denomMb) * gaugeW);
  const freeMarkerX = Math.min(gaugeX + gaugeW, gaugeX + (opfsSafetyGate.opfsFreeMb / denomMb) * gaugeW);

  return (
    <svg
      data-testid="webcodecs-zerocopy-pipeline-svg" data-preset-id={preset.id}
      data-requested-codec={codecResolution.requestedCodecId} data-active-codec={codecResolution.activeCodec.id}
      data-fallback-applied={String(codecResolution.fallbackApplied)} data-opfs-gate-status={opfsSafetyGate.status}
      data-can-start-export={String(opfsSafetyGate.canStartExport)} data-server-cost-usd={serverCostSavings.localServerCostUsd}
      viewBox="0 0 476 346" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `Zero-Copy WebCodecs pipeline: ${preset.width}x${preset.height} ${preset.fps}fps ${codecResolution.activeCodec.codecFamily}, output ${exportPlan.estimatedOutputMb}MB, OPFS gate ${opfsSafetyGate.status}, $0 server cost`
        : `Zero-Copy WebCodecs 로컬 파이프라인: ${preset.width}×${preset.height} ${preset.fps}fps ${codecResolution.activeCodec.codecFamily}, 예상 출력 ${exportPlan.estimatedOutputMb}MB, OPFS 게이트 ${opfsSafetyGate.status}, 서버비 $0`}
    >
      <text x={14} y={20} fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? "ZERO-COPY WEBCODECS 4K PIPELINE · OPFS FAIL-CLOSED GAUGE" : "ZERO-COPY WEBCODECS 4K 직결 파이프라인 · OPFS 안전 게이지"}
      </text>
      <text x={14} y={35} fill="currentColor" fillOpacity={0.65} fontSize="9.5">
        {isEn
          ? `${preset.width}×${preset.height} ${preset.fps}fps · ${codecResolution.activeCodecString} · ${exportPlan.targetVideoBitrateMbps} Mbps · Server $0.00`
          : `${preset.width}×${preset.height} ${preset.fps}fps · ${codecResolution.activeCodecString} · ${exportPlan.targetVideoBitrateMbps} Mbps · 서버비 $0.00`}
      </text>

      {zeroCopyStages.map((stage, idx) => {
        const nodeW = 98; const gap = 16; const nx = 14 + idx * (nodeW + gap); const ny = 52;
        const ink = stageInks[idx] ?? SVG_INK_SLATE;
        return (
          <g key={stage.id} data-zerocopy-stage={stage.id}>
            <rect x={nx} y={ny} width={nodeW} height={92} rx={9} fill={ink} fillOpacity={0.12} stroke={ink} strokeWidth="1.4" />
            <text x={nx + 8} y={ny + 18} fill={ink} fontSize="8.5" fontWeight="700">{`0${stage.order} · ZERO-COPY`}</text>
            <text x={nx + 8} y={ny + 35} fill="currentColor" fontSize="10.2" fontWeight="700">{isEn ? stage.labelEn : stage.labelKo}</text>
            <text x={nx + 8} y={ny + 52} fill="currentColor" fillOpacity={0.72} fontSize="7.6">{stage.apiName.slice(0, 19)}</text>
            <text x={nx + 8} y={ny + 68} fill="currentColor" fillOpacity={0.85} fontSize="7.8" fontWeight="600">{(isEn ? stage.metricEn : stage.metricKo).slice(0, 20)}</text>
            <text x={nx + 8} y={ny + 83} fill={ink} fontSize="7.8" fontWeight="700">{`Readback: ${stage.cpuReadbackCopies}`}</text>
            {idx < zeroCopyStages.length - 1 && (
              <g>
                <line x1={nx + nodeW + 2} y1={ny + 46} x2={nx + nodeW + gap - 4} y2={ny + 46} stroke={SVG_INK_WAVE1} strokeWidth="1.8" />
                <polygon points={`${nx + nodeW + gap - 5},${ny + 42} ${nx + nodeW + gap},${ny + 46} ${nx + nodeW + gap - 5},${ny + 50}`} fill={SVG_INK_WAVE1} />
              </g>
            )}
          </g>
        );
      })}

      <g transform="translate(14, 156)">
        <rect x={0} y={0} width={448} height={42} rx={8} fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.14} />
        <text x={10} y={16} fill="currentColor" fontSize="9" fontWeight="700">{isEn ? "HW Codec Chain:" : "가정한 코덱 후보:"}</text>
        {codecResolution.fallbackSteps.map((step, sIdx) => {
          const sx = 112 + sIdx * 108;
          const stepInk = step.selected ? SVG_INK_GOOD : step.hardwareSupported ? SVG_INK_SLATE : SVG_INK_WARN;
          return (
            <g key={step.codecId}>
              <rect x={sx} y={5} width={96} height={16} rx={4} fill={stepInk} fillOpacity={step.selected ? 0.24 : 0.1} stroke={stepInk} strokeWidth="1" />
              <text x={sx + 48} y={16} textAnchor="middle" fill={stepInk} fontSize="8" fontWeight="700">
                {`${step.codecId.toUpperCase()} · ${step.selected ? "ACTIVE" : step.hardwareSupported ? "READY" : "FALLBACK"}`}
              </text>
            </g>
          );
        })}
        <text x={10} y={34} fill="currentColor" fillOpacity={0.75} fontSize="8.5">
          {isEn
            ? `GOP ${exportPlan.gopFrames}f (${exportPlan.keyframeCount} keyframes) · Audio ${exportPlan.audioCodec.toUpperCase()} ${exportPlan.audioBitrateKbps}kbps (${exportPlan.audioLoudnessLufs} LUFS) · Local Cost $0`
            : `GOP ${exportPlan.gopFrames}프레임(키프레임 ${exportPlan.keyframeCount}개) · 오디오 ${exportPlan.audioCodec.toUpperCase()} ${exportPlan.audioBitrateKbps}kbps (${exportPlan.audioLoudnessLufs} LUFS) · 서버비 $0`}
        </text>
      </g>

      <g>
        <text x={gaugeX} y={222} fill="currentColor" fontSize="9.8" fontWeight="700">{isEn ? "OPFS Storage & Fail-Closed Safety Gate" : "OPFS 잔여 용량 및 Fail-Closed 안전 게이지"}</text>
        <text x={gaugeX + gaugeW} y={222} textAnchor="end" fill={gateInk} fontSize="9.8" fontWeight="700">
          {opfsSafetyGate.status === "pass"
            ? isEn ? "PASS · EXPORT READY" : "PASS · 로컬 출고 안전"
            : opfsSafetyGate.status === "warn"
              ? isEn ? "WARN · LOW HEADROOM" : "WARN · 여유 공간 주의"
              : isEn ? "BLOCKED · FAIL-CLOSED" : "BLOCKED · 용량 부족 차단"}
        </text>

        <rect x={gaugeX} y={gaugeY} width={gaugeW} height={22} rx={6} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.22} />
        <rect x={gaugeX} y={gaugeY} width={Math.max(4, outputBarW)} height={22} rx={6} fill={SVG_INK_WAVE1} fillOpacity={0.85} />
        <rect x={gaugeX + outputBarW} y={gaugeY} width={Math.max(4, reserveBarW)} height={22} rx={3} fill={gateInk} fillOpacity={0.5} />
        <line x1={freeMarkerX} y1={gaugeY - 5} x2={freeMarkerX} y2={gaugeY + 28} stroke={gateInk} strokeWidth="2" />
        <text x={freeMarkerX} y={gaugeY + 40} textAnchor={freeMarkerX > gaugeX + gaugeW - 70 ? "end" : freeMarkerX < gaugeX + 70 ? "start" : "middle"} fill={gateInk} fontSize="8.5" fontWeight="700">
          {isEn ? `OPFS Free ${opfsSafetyGate.opfsFreeMb} MB` : `OPFS 여유 ${opfsSafetyGate.opfsFreeMb} MB`}
        </text>

        <rect x={14} y={294} width={448} height={40} rx={7} fill={gateInk} fillOpacity={0.11} stroke={gateInk} strokeOpacity={0.45} />
        <text x={24} y={310} fill="currentColor" fontSize="8.6" fontWeight="700">
          {isEn
            ? `Output ${opfsSafetyGate.estimatedOutputMb} MB + Safety Buffer ${opfsSafetyGate.safetyReserveMb} MB = Required ${opfsSafetyGate.requiredWorkspaceMb} MB (${opfsSafetyGate.utilizationPct}%)`
            : `예상 출력 ${opfsSafetyGate.estimatedOutputMb} MB + 임시 버퍼 ${opfsSafetyGate.safetyReserveMb} MB = 필요 공간 ${opfsSafetyGate.requiredWorkspaceMb} MB (${opfsSafetyGate.utilizationPct}%)`}
        </text>
        <text x={24} y={325} fill="currentColor" fillOpacity={0.78} fontSize="8.4">
          {isEn
            ? `Remaining after mux: ${opfsSafetyGate.remainingAfterExportMb} MB · Cloud ref saved: $${serverCostSavings.cloudReferencePerExportUsd.toFixed(2)}/export`
            : `출고 후 잔여 OPFS: ${opfsSafetyGate.remainingAfterExportMb} MB · 클라우드 참고 절감: $${serverCostSavings.cloudReferencePerExportUsd.toFixed(2)}/회`}
        </text>
      </g>
    </svg>
  );
}

/** 초실시간 WGSL 12종 3-Wave 프리컴파일 캐시 & 로컬 WebCodecs 4K 60fps 무빙툰 제어판. */
export function StudioShaderPrewarmWebCodecsPanel(props: StudioShaderPrewarmWebCodecsPanelProps): ReactElement {
  const { locale = "ko", className } = props;

  const headingId = useId();
  const opfsSliderId = useId();
  const durationSliderId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const { plan, manifestJson, presetId, codecId, parallelWaveSlots, cacheHitEnabled, opfsFreeMb, durationSec,
    av1HwSupported, hevcHwSupported, showJsonPreview, setShowJsonPreview, statusMessage, delivery, exportDelivery, copy, busy,
    handleSelectPreset, handleSelectCodec, handleParallelSlots, handleToggleCacheHit, handleOpfsChange,
    handleDurationChange, handleToggleHwFallback, handleCopyJson, handleExportJson, handleReset } = useShaderCodecsController(props, pick);

  const { prewarm, webCodecsExport } = plan;
  const gate = webCodecsExport.opfsSafetyGate;
  const gateToneClass = gate.status === "pass" ? "border-good bg-good-soft text-good" : gate.status === "warn" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
  const totalIdleSlices = prewarm.waves.reduce((sum, w) => sum + w.idleSlicesRequired, 0);

  return (
    <section aria-labelledby={headingId} data-testid="studio-shader-prewarm-webcodecs-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-bold text-accent">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" /><span>WAVE 58D</span>
            </span>
            <span data-testid="panel-model-kind" className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-fg-3">{plan.modelKind}</span>
          </div>
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("CPU 예제 · 셰이더 3-Wave 일정과 WebCodecs 4K 예산", "CPU Example · 3-Wave Shader Schedule & WebCodecs 4K Budget")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("12종 메타데이터의 가상 일정·캐시 적중과 코덱 지원·용량 가정을 계산합니다. 실제 WGSL 컴파일·캐시·지원 확인·인코딩·저장은 실행하지 않습니다.", "Models a schedule/cache hits for 12 metadata records and assumed codec/storage budgets, without actual compilation, persisted cache, support checks, encoding or storage.")}
          </p>
        </div>
        <button type="button" data-testid="reset-shader-webcodecs-btn" disabled={busy} onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("초기값 복원", "Reset")}</span>
        </button>
      </div>

      <p data-testid="shader-codecs-example-scope" className="text-xs text-fg-2 [word-break:keep-all]">{pick("GPU·VideoEncoder·OPFS 미연결 CPU 계획입니다. 스터터·zero-copy·LUFS·서버비는 가정이며, 지원 여부는 확인하지 않았습니다. H.264 software 폴백도 미검증 후보입니다. 용량 통과는 입력한 가정치 판정이며 출고 권한·저장 성공이 아닙니다.", "CPU plan without GPU, VideoEncoder or OPFS integration. Stutter, zero-copy, LUFS and cost are assumptions; support is unverified, including H.264 software fallback. Capacity fit only evaluates input assumptions, without export authority or persistence.")}</p>
      <div data-testid="shader-codecs-plan-state" className="text-xs text-fg-2" aria-live="polite">
        {delivery.status === "pending" ? pick("계획 수신 확인 대기", "Awaiting plan recipient") : delivery.status === "failed" ? pick("계획 알림 실패", "Plan notification failed") : delivery.status === "notified" ? pick("마지막 계획 수신 확인 · 실행 아님", "Last plan acknowledged · not executed") : pick("실제 런타임 미연결 · 로컬 계획", "No runtime connection · local plan")}
        {delivery.status === "failed" ? <button type="button" data-testid="shader-codecs-plan-retry" onClick={delivery.retry} className={BTN_OUTLINE}>{pick("같은 계획 알림 재시도", "Retry plan notification")}</button> : null}
      </div>
      <div data-testid="shader-codecs-export-state" className="text-xs text-fg-2" aria-live="polite">
        {exportDelivery.status === "pending" ? pick("JSON 수신 확인 대기", "Awaiting JSON recipient") : exportDelivery.status === "failed" ? pick("JSON 알림 실패", "JSON notification failed") : exportDelivery.status === "notified" ? pick("JSON 수신 확인 · 파일 저장 아님", "JSON acknowledged · not file storage") : pick("외부 수신자 미연결 · JSON 준비만", "No external recipient · JSON preparation only")}
        {exportDelivery.status === "failed" ? <button type="button" data-testid="shader-codecs-export-retry" onClick={exportDelivery.retry} className={BTN_OUTLINE}>{pick("같은 JSON 알림 재시도", "Retry JSON notification")}</button> : null}
      </div>
      <div data-testid="shader-codecs-copy-state" data-copy-state={copy.state} className="text-xs text-fg-2" aria-live="polite">
        {copy.state === "pending" ? pick("복사 확인 대기", "Awaiting clipboard") : copy.state === "error" ? pick("복사 실패", "Copy failed") : copy.state === "copied" ? pick("클립보드 복사 확인", "Clipboard confirmed") : pick("복사 대기", "Ready to copy")}{` · UTF-8 ${copy.bytes} ${pick("바이트", "bytes")}`}
        {copy.state === "error" ? <button type="button" data-testid="shader-codecs-copy-retry" onClick={copy.retry} className={BTN_OUTLINE}>{pick("같은 JSON 복사 재시도", "Retry clipboard copy")}</button> : null}
      </div>

      {/* 2단 순수 시맨틱 SVG 시각화 */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ShaderPrewarmGanttSvg prewarm={prewarm} isEn={isEn} />
        <WebCodecsZeroCopyPipelineSvg exportPlan={webCodecsExport} isEn={isEn} />
      </div>

      {/* 4종 출고 프리셋 선택 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Film className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("플랫폼 출고 프리셋 (4종)", "Platform Export Presets (4)")}</span>
          </div>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${webCodecsExport.preset.width}×${webCodecsExport.preset.height} · ${webCodecsExport.preset.fps}fps · ${webCodecsExport.preset.aspectLabel}`}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label={pick("출고 프리셋 선택", "Select export preset")}>
          {EXPORT_PRESETS.map((preset) => (
            <button
              key={preset.id} type="button" data-testid={`preset-btn-${preset.id}`} aria-pressed={preset.id === presetId}
              onClick={() => handleSelectPreset(preset.id)}
              className={`${preset.id === presetId ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start px-3 py-2.5 text-left`}
            >
              <span className="text-xs font-bold">{isEn ? preset.labelEn : preset.labelKo}</span>
              <span className="text-[11px] font-normal text-fg-2 [word-break:keep-all]">{isEn ? preset.platformNoteEn : preset.platformNoteKo}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3종 코덱 체인 + 병렬 웨이브·캐시·OPFS·영상 길이 제어 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("하드웨어 코덱 체인 (AV1 → HEVC → H.264 자동 폴백)", "Hardware Codec Chain (AV1 -> HEVC -> H.264 Fallback)")}</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={pick("코덱 선택", "Select codec")}>
            {WEBCODECS_CODEC_PROFILES.map((profile) => (
              <button key={profile.id} type="button" data-testid={`codec-btn-${profile.id}`} aria-pressed={codecId === profile.id} onClick={() => handleSelectCodec(profile.id)} className={codecId === profile.id ? BTN_ACTIVE : BTN_OUTLINE}>
                <span>{isEn ? profile.labelEn : profile.labelKo}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="hw-fallback-av1-toggle" aria-pressed={!av1HwSupported} onClick={() => handleToggleHwFallback("av1")} className={!av1HwSupported ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{av1HwSupported ? pick("AV1 HW: 지원 가정", "AV1 HW: assumed") : pick("AV1 HW: 미지원 가정", "AV1 HW: Off (Fallback)")}</span>
            </button>
            <button type="button" data-testid="hw-fallback-hevc-toggle" aria-pressed={!hevcHwSupported} onClick={() => handleToggleHwFallback("hevc")} className={!hevcHwSupported ? BTN_ACTIVE : BTN_OUTLINE}>
              <span>{hevcHwSupported ? pick("HEVC HW: 지원 가정", "HEVC HW: assumed") : pick("HEVC HW: 미지원 가정", "HEVC HW: Off (Fallback)")}</span>
            </button>
          </div>
          <p data-testid="codec-fallback-reason" className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
            {isEn ? webCodecsExport.codecResolution.reasonEn : webCodecsExport.codecResolution.reasonKo}
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("병렬 웨이브 슬롯 · 캐시 히트 · OPFS 여유 용량", "Parallel Lanes, Prewarm Cache & OPFS Headroom")}</span>
            </div>
            <button type="button" data-testid="cache-hit-toggle-btn" aria-pressed={cacheHitEnabled} onClick={handleToggleCacheHit} className={cacheHitEnabled ? BTN_ACTIVE : BTN_OUTLINE}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{cacheHitEnabled ? pick("프리컴파일 캐시: HIT", "Prewarm Cache: HIT") : pick("프리컴파일 캐시: COLD", "Prewarm Cache: COLD")}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("병렬 웨이브 슬롯 수", "Parallel compile lanes")}>
            <span className="mr-1 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("병렬 웨이브 수:", "Parallel Lanes:")}</span>
            {PARALLEL_SLOT_OPTIONS.map((slot) => (
              <button key={slot} type="button" data-testid={`parallel-slot-${slot}`} aria-pressed={parallelWaveSlots === slot} onClick={() => handleParallelSlots(slot)} className={`${parallelWaveSlots === slot ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}>{`${slot}×`}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor={opfsSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("OPFS 여유 용량", "OPFS Free Space")}</label>
                <span data-testid="opfs-free-readout" className="font-mono font-bold text-fg tabular-nums">{`${opfsFreeMb} MB`}</span>
              </div>
              <input id={opfsSliderId} data-testid="opfs-free-slider" type="range" min={64} max={8192} step={64} value={opfsFreeMb} onChange={(e) => handleOpfsChange(Number(e.target.value))} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              <div className="flex flex-wrap gap-1.5">
                {OPFS_QUICK_PRESETS_MB.map((mb) => (
                  <button key={mb} type="button" data-testid={`opfs-preset-${mb}`} aria-pressed={opfsFreeMb === mb} onClick={() => handleOpfsChange(mb)} className={`${opfsFreeMb === mb ? BTN_ACTIVE : BTN_OUTLINE} px-2.5 text-[11px] tabular-nums`}>{mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor={durationSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("무빙툰 영상 길이", "Moving-Toon Duration")}</label>
                <span data-testid="duration-readout" className="font-mono font-bold text-fg tabular-nums">{`${durationSec}s`}</span>
              </div>
              <input id={durationSliderId} data-testid="duration-slider" type="range" min={15} max={300} step={15} value={durationSec} onChange={(e) => handleDurationChange(Number(e.target.value))} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              <p className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{pick(`총 ${webCodecsExport.totalFrames.toLocaleString("en-US")}프레임 · 키프레임 ${webCodecsExport.keyframeCount}개`, `${webCodecsExport.totalFrames.toLocaleString("en-US")} frames · ${webCodecsExport.keyframeCount} keyframes`)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4종 KPI 요약 카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("첫 획 스터터 비교 모델", "First-Stroke Stutter Model")}</div>
          <div data-testid="kpi-stutter-summary" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{pick(`0ms vs 콜드 ${prewarm.stutterComparison.coldStartFirstStrokeBlockingMs}ms`, `0ms vs Cold ${prewarm.stutterComparison.coldStartFirstStrokeBlockingMs}ms`)}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`60fps 드랍 0 vs ${prewarm.stutterComparison.coldStartDroppedFrames60fps}프레임 · Wave 1 ${prewarm.stutterComparison.wave1ReadyWallTimeMs}ms`, `0 vs ${prewarm.stutterComparison.coldStartDroppedFrames60fps} dropped frames · Wave 1 ${prewarm.stutterComparison.wave1ReadyWallTimeMs}ms`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("12종 3-Wave 캐시 적중", "12-Pipeline 3-Wave Cache")}</div>
          <div data-testid="kpi-prewarm-summary" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${prewarm.stutterComparison.cacheHitCount}/${prewarm.stutterComparison.totalPipelineCount} · ${prewarm.stutterComparison.totalPrewarmWallTimeMs}ms`}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{pick(`병렬 ${prewarm.config.parallelWaveSlots}슬롯 · 유휴 슬라이스 ${totalIdleSlices}회`, `${prewarm.config.parallelWaveSlots} parallel lanes · ${totalIdleSlices} idle slices`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("코덱 · 비트레이트 · 출력 용량", "Codec, Bitrate & Output Size")}</div>
          <div data-testid="kpi-export-summary" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${webCodecsExport.codecResolution.activeCodec.codecFamily} · ${webCodecsExport.targetVideoBitrateMbps}Mbps · ${webCodecsExport.estimatedOutputMb}MB`}</div>
          <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{`${webCodecsExport.audioCodec.toUpperCase()} ${webCodecsExport.audioBitrateKbps}kbps (${webCodecsExport.audioLoudnessLufs} LUFS) · 서버비 $0.00`}</div>
        </div>
        <div data-testid="kpi-opfs-gate" className={`rounded-xl border p-3 ${gateToneClass}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {gate.canStartExport ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("OPFS Fail-Closed 안전 게이트", "OPFS Fail-Closed Safety Gate")}</span>
          </div>
          <div className="mt-1 font-mono text-sm font-bold tabular-nums">{`${gate.status.toUpperCase()} · ${gate.requiredWorkspaceMb}/${gate.opfsFreeMb} MB`}</div>
          <div className="mt-0.5 text-[11px] [word-break:keep-all]">{isEn ? gate.messageEn : gate.messageKo}</div>
        </div>
      </div>

      {/* 12종 WGSL 파이프라인 캐시 테이블 + 정직한 범위 안내 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <HardDrive className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("12종 WGSL 파이프라인 3-Wave 스케줄 · 내용 해시 캐시 키", "12 WGSL Pipeline 3-Wave Schedule & Content-Hash Cache Keys")}</span>
          </div>
          <span data-testid="cache-namespace-key" className="font-mono text-[10px] text-fg-3">{prewarm.cacheNamespaceKey}</span>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="wgsl-prewarm-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2 py-1.5 font-semibold">Wave</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("파이프라인", "Pipeline")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("디스패치 API", "Dispatch API")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("내용 해시 캐시 키", "Content-Hash Cache Key")}</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">{pick("모델 소요(콜드→캐시)", "Model Cost")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {prewarm.tasks.map((task) => (
                <tr key={task.pipeline.id} data-testid={`pipeline-row-${task.pipeline.id}`}>
                  <td className="px-2 py-1.5 font-mono text-[11px] font-bold text-accent tabular-nums">{`W${task.wave}·L${task.laneIndex + 1}`}</td>
                  <td className="px-2 py-1.5 font-semibold text-fg [word-break:keep-all]">
                    <div>{isEn ? task.pipeline.labelEn : task.pipeline.labelKo}</div>
                    <div className="text-[10px] font-normal text-fg-3">{isEn ? task.pipeline.summaryEn : task.pipeline.summaryKo}</div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-fg-2">{task.dispatchApi}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-fg-2">{task.cacheKey}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-fg tabular-nums">{`${task.compileCostMs}ms (${task.coldCompileCostMs}→${task.warmCacheCostMs})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-2 text-[11px] text-fg-2 md:grid-cols-2 [word-break:keep-all]">
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? prewarm.honestScopeDisclosure.currentImplementationEn : prewarm.honestScopeDisclosure.currentImplementationKo}</p>
          <p className="rounded-lg border border-line bg-canvas px-3 py-2">{isEn ? prewarm.honestScopeDisclosure.targetRuntimeEn : prewarm.honestScopeDisclosure.targetRuntimeKo}</p>
        </div>
      </div>

      {/* JSON 매니페스트 내보내기 · 복사 · 미리보기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("WGSL 프리컴파일 · WebCodecs 4K 출고 매니페스트 JSON", "WGSL Prewarm & WebCodecs 4K Export Manifest JSON")}</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="copy-manifest-json-btn" disabled={busy} onClick={handleCopyJson} className={BTN_OUTLINE}><Copy className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("JSON 복사", "Copy JSON")}</span></button>
            <button type="button" data-testid="export-manifest-json-btn" disabled={busy} onClick={handleExportJson} className={BTN_SOLID}><Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("JSON 준비·알림", "Prepare/notify JSON")}</span></button>
            <button type="button" data-testid="toggle-json-preview-btn" aria-pressed={showJsonPreview} onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{showJsonPreview ? pick("미리보기 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}</span>
            </button>
          </div>
        </div>
        {showJsonPreview && <pre data-testid="manifest-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{manifestJson}</pre>}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="shader-webcodecs-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">{statusMessage}</div>
      )}
    </section>
  );
}
