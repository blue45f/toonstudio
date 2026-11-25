/**
 * Wave 56D — 실리콘 맞춤형 WebNN NPU 그래프 컴파일러 · 양자화 융합 · 적응형 PID 열 제어 스튜디오 패널.
 *
 * - 5대 실리콘 NPU(Apple ANE · Intel Core Ultra · AMD XDNA2 · Qualcomm Hexagon · Samsung Exynos) × 5대 웹툰 AI 워크로드
 * - 순수 시맨틱 OKLCH SVG 2단 시각화(좌: 연산자 융합 & Zero-Copy MLTensor 파이프라인 / 우: 60스텝 PID 열 안정화 vs 미제어 클리프)
 * - WebNN MLContextOptions · 그래프 IR · PID 정책 JSON 복사 및 미리보기 (원시 색·바이올렛 0%)
 */

import {
  Activity, BatteryCharging, CheckCircle2, Code2, Copy, Cpu, Eye, Flame,
  Gauge, Layers, RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  AMBIENT_THERMAL_LEVELS, COMPUTE_PRESSURE_STATES, DEFAULT_SILICON_NPU_ID, DEFAULT_SUSTAINED_MINUTES,
  DEFAULT_WEBTOON_WORKLOAD_ID, MAX_SUSTAINED_MINUTES, MIN_SUSTAINED_MINUTES, POWER_SOURCE_MODES,
  QUANTIZATION_MODES, SILICON_NPU_TARGETS, WEBTOON_AI_WORKLOADS, exportWebNnThermalPlanJson, formatOklch,
  type AmbientThermalLevel, type ComputePressureState, type DegradationTier, type PowerSourceMode,
  type QuantizationMode, type SiliconNpuTargetId, type TargetFrameRateHz, type ThermalPidStepPoint,
  type WebNnNpuThermalPlan, type WebNnNpuThermalPlanInput, type WebtoonAiWorkloadId,
} from "./webnn-npu-thermal-engine";

export interface StudioWebNnNpuThermalPanelProps {
  readonly initialSiliconId?: SiliconNpuTargetId;
  readonly initialWorkloadId?: WebtoonAiWorkloadId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: WebNnNpuThermalPlan) => void;
  readonly onExportJson?: (json: string, plan: WebNnNpuThermalPlan) => void;
}

interface PanelConfigState {
  readonly siliconId: SiliconNpuTargetId;
  readonly workloadId: WebtoonAiWorkloadId;
  readonly quantizationMode: QuantizationMode;
  readonly zeroCopyMlTensorEnabled: boolean;
  readonly penHoverWarmupEnabled: boolean;
  readonly batteryMode: PowerSourceMode;
  readonly ambientLoadLevel: AmbientThermalLevel;
  readonly pressureState: ComputePressureState;
  readonly sustainedMinutes: number;
  readonly targetFrameRateHz: TargetFrameRateHz;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const SWITCH_BASE = `flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(휴 28°·72°·152°·185°·228°·240° — 270~320° 완전 배제)
const SVG_BG_PANEL = formatOklch({ l: 0.98, c: 0.005, h: 240 }, 0.04);
const SVG_GRID_STROKE = formatOklch({ l: 0.62, c: 0.014, h: 240 }, 0.25);
const SVG_GPU_INK = formatOklch({ l: 0.56, c: 0.13, h: 228 });
const SVG_NPU_INK = formatOklch({ l: 0.54, c: 0.13, h: 185 });
const SVG_GOOD_INK = formatOklch({ l: 0.54, c: 0.14, h: 152 });
const SVG_WARN_INK = formatOklch({ l: 0.6, c: 0.14, h: 72 });
const SVG_CLIFF_INK = formatOklch({ l: 0.56, c: 0.19, h: 28 });
const SVG_CLIFF_ZONE = formatOklch({ l: 0.56, c: 0.19, h: 28 }, 0.13);
const SVG_HUD_FILL = formatOklch({ l: 0.2, c: 0.014, h: 240 }, 0.88);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.005, h: 85 });

const PRESSURE_LABELS: Readonly<Record<ComputePressureState, { readonly ko: string; readonly en: string }>> = {
  nominal: { ko: "정상", en: "Nominal" }, fair: { ko: "보통", en: "Fair" },
  serious: { ko: "높음", en: "Serious" }, critical: { ko: "임계", en: "Critical" },
};
const BATTERY_LABELS: Readonly<Record<PowerSourceMode, { readonly ko: string; readonly en: string }>> = {
  "ac-plugged": { ko: "AC 전원", en: "AC" }, "battery-balanced": { ko: "균형", en: "Balanced" }, "battery-saver": { ko: "절전", en: "Saver" },
};
const AMBIENT_LABELS: Readonly<Record<AmbientThermalLevel, { readonly ko: string; readonly en: string }>> = {
  cool: { ko: "여유", en: "Cool" }, normal: { ko: "보통", en: "Normal" }, warm: { ko: "더움", en: "Warm" },
};
const QUANT_LABELS: Readonly<Record<QuantizationMode, { readonly ko: string; readonly en: string }>> = {
  auto: { ko: "Auto 최적", en: "Auto" }, fp16: { ko: "FP16 / BF16", en: "FP16 / BF16" },
  int8: { ko: "INT8", en: "INT8" }, int4: { ko: "INT4 / W4A8", en: "INT4 / W4A8" },
};

const formatShape = (shape: readonly [number, number, number, number]): string => `[${shape.join("×")}]`;
const tierBadgeClass = (tier: DegradationTier): string =>
  tier === 0 ? "border-good bg-good-soft text-good" : tier <= 2 ? "border-accent bg-accent-soft text-accent" : "border-warn bg-warning-soft text-warn";
const buildPolyline = (points: readonly ThermalPidStepPoint[], xOf: (step: number) => number, yOf: (pt: ThermalPidStepPoint) => number): string =>
  points.map((p) => `${xOf(p.step)},${yOf(p)}`).join(" ");

function SiliconPipelineSvg(props: { readonly plan: WebNnNpuThermalPlan; readonly isEn: boolean }): ReactElement {
  const { plan, isEn } = props;
  const { compiledGraph: g, siliconTarget: s } = plan;
  const isZeroCopy = g.zeroCopyPass.zeroCopyActive;
  const accentInk = formatOklch(s.accentOklch);
  const transferInk = isZeroCopy ? SVG_GOOD_INK : SVG_CLIFF_INK;
  const warmupInk = g.hoverWarmupPass.enabled ? SVG_NPU_INK : SVG_WARN_INK;

  return (
    <svg
      data-testid="webnn-pipeline-svg" data-silicon-id={s.id} data-workload-id={plan.workload.id}
      data-zero-copy={isZeroCopy ? "true" : "false"} data-cpu-readback={g.zeroCopyPass.cpuReadbackCount}
      data-quant-format={g.quantizationPass.effectiveFormat} data-hover-warmup={g.hoverWarmupPass.enabled ? "true" : "false"}
      data-violet-free="true" viewBox="0 0 680 304" role="img"
      aria-label={isEn ? `${s.nameEn} WebNN operator fusion and WebGPU MLTensor zero-copy pipeline` : `${s.nameKo} WebNN 연산자 융합 및 WebGPU MLTensor Zero-Copy 파이프라인 도해`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="680" height="304" fill={SVG_BG_PANEL} />
      <text x="16" y="24" fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? `1. ${s.shortLabel} (${s.executionProvider}) Graph Fusion & MLTensor Path` : `1. ${s.shortLabel} (${s.executionProvider}) 연산 융합 · MLTensor 공유 경로`}
      </text>
      <text x="664" y="24" textAnchor="end" fill={transferInk} fontSize="10" fontWeight="700">
        {isZeroCopy
          ? (isEn ? "ZERO-COPY · 0 CPU READBACK" : "ZERO-COPY · CPU Readback 0회")
          : (isEn ? `FALLBACK COPY · ${g.zeroCopyPass.cpuReadbackCount} READBACKS` : `폴백 복사 · CPU Readback ${g.zeroCopyPass.cpuReadbackCount}회`)}
      </text>

      {/* 펜 호버 투기적 NPU 워밍업 레인 */}
      <rect x="16" y="38" width="648" height="44" rx="8" fill={formatOklch({ l: 0.54, c: 0.13, h: 185 }, 0.08)} stroke={warmupInk} strokeWidth="1" strokeDasharray={g.hoverWarmupPass.enabled ? undefined : "4 3"} />
      <text x="28" y="55" fill={warmupInk} fontSize="9.5" fontWeight="700">
        {g.hoverWarmupPass.enabled
          ? (isEn ? `Stylus Hover Speculative Warmup (-${g.hoverWarmupPass.hoverLeadWindowMs}ms lead · saves ${g.hoverWarmupPass.firstStrokeLatencySavedMs}ms)` : `펜 호버 투기적 NPU 워밍업 (-${g.hoverWarmupPass.hoverLeadWindowMs}ms 선행 · 첫 획 ${g.hoverWarmupPass.firstStrokeLatencySavedMs}ms 단축)`)
          : (isEn ? `Hover Warmup OFF (Cold start on Pen-Down: ${g.hoverWarmupPass.coldStartLatencyMs}ms)` : `펜 호버 워밍업 꺼짐 (펜 접촉 후 콜드 스타트: ${g.hoverWarmupPass.coldStartLatencyMs}ms)`)}
      </text>
      {g.hoverWarmupPass.phases.map((phase, idx) => (
        <g key={phase.phaseId}>
          <rect x={28 + idx * 156} y="62" width="144" height="14" rx="4" fill={warmupInk} fillOpacity={g.hoverWarmupPass.enabled ? 0.2 : 0.08} />
          <text x={100 + idx * 156} y="72" textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="600">
            {`${isEn ? phase.labelEn : phase.labelKo} (${phase.durationMs}ms)`}
          </text>
        </g>
      ))}

      {/* 메인 WebGPU <-> WebNN 4단계 파이프라인 */}
      <rect x="16" y="102" width="128" height="110" rx="10" fill={formatOklch({ l: 0.56, c: 0.13, h: 228 }, 0.12)} stroke={SVG_GPU_INK} strokeWidth="1.4" />
      <text x="80" y="124" textAnchor="middle" fill={SVG_GPU_INK} fontSize="10" fontWeight="700">WebGPU Canvas</text>
      <text x="80" y="144" textAnchor="middle" fill="currentColor" fontSize="9">{isEn ? "Input Tensor" : "입력 텐서"}</text>
      <text x="80" y="162" textAnchor="middle" fill="currentColor" fontFamily="monospace" fontSize="9.5" fontWeight="700">{formatShape(g.fusionPass.originalShape)}</text>
      <text x="80" y="182" textAnchor="middle" fill="currentColor" fillOpacity={0.75} fontSize="8.5">
        {g.fusionPass.staticShapePaddingApplied ? `→ ${formatShape(g.fusionPass.compiledShape)}` : (isEn ? "No Static Pad" : "패딩 불필요")}
      </text>
      <text x="80" y="199" textAnchor="middle" fill={SVG_GPU_INK} fontSize="8.5" fontWeight="600">{`${plan.thermalSimulation.targetFrameRateHz}Hz (${g.frameBudgetMs}ms)`}</text>

      <line x1="144" y1="156" x2="174" y2="156" stroke={transferInk} strokeWidth="2" strokeDasharray={isZeroCopy ? undefined : "4 3"} />
      <rect x="174" y="102" width="144" height="110" rx="10" fill={formatOklch(isZeroCopy ? { l: 0.54, c: 0.14, h: 152 } : { l: 0.56, c: 0.19, h: 28 }, 0.12)} stroke={transferInk} strokeWidth="1.5" strokeDasharray={isZeroCopy ? undefined : "5 3"} />
      <text x="246" y="124" textAnchor="middle" fill={transferInk} fontSize="10" fontWeight="700">{isZeroCopy ? "Shared MLTensor" : (isEn ? "CPU Staging Copy" : "CPU 스테이징 복사")}</text>
      <text x="246" y="144" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="600">{isZeroCopy ? (isEn ? "Direct GPU↔NPU" : "GPU↔NPU 직접 바인딩") : (isEn ? "Readback #1 + #2" : "Readback #1 + 업로드 #2")}</text>
      <text x="246" y="164" textAnchor="middle" fill={transferInk} fontFamily="monospace" fontSize="9.5" fontWeight="700">{isZeroCopy ? "0.00 ms copy" : `+${g.zeroCopyPass.copyOverheadMs.toFixed(2)} ms copy`}</text>
      <text x="246" y="184" textAnchor="middle" fill="currentColor" fillOpacity={0.78} fontSize="8.2">{g.zeroCopyPass.transportMode}</text>
      <text x="246" y="200" textAnchor="middle" fill={transferInk} fontSize="8.5" fontWeight="700">{isZeroCopy ? (isEn ? "Zero-Copy Active" : "Zero-Copy 활성") : (isEn ? "Fallback Detour" : "폴백 우회 경로")}</text>

      <line x1="318" y1="156" x2="348" y2="156" stroke={accentInk} strokeWidth="2" />
      <rect x="348" y="96" width="194" height="122" rx="10" fill={formatOklch(s.accentOklch, 0.12)} stroke={accentInk} strokeWidth="1.6" />
      <text x="445" y="116" textAnchor="middle" fill={accentInk} fontSize="10" fontWeight="700">{`${s.shortLabel} · ${s.spatialTileGrid.layoutLabel}`}</text>
      <text x="445" y="135" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="700">
        {isEn ? `Fused Ops: ${g.fusionPass.rawOpCount} → ${g.fusionPass.fusedOpCount} (-${g.fusionPass.fusionRatioPct}%)` : `연산자 융합: ${g.fusionPass.rawOpCount} → ${g.fusionPass.fusedOpCount} (-${g.fusionPass.fusionRatioPct}%)`}
      </text>
      <rect x="362" y="145" width="166" height="22" rx="5" fill={accentInk} fillOpacity={0.18} />
      <text x="445" y="159" textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="700">{g.quantizationPass.effectiveFormatLabel}</text>
      <text x="445" y="182" textAnchor="middle" fill="currentColor" fillOpacity={0.82} fontSize="8.5">
        {isEn ? `Mem Trips -${g.fusionPass.memoryRoundTripReductionPct}% · Weight ${g.quantizationPass.weightCompressionRatio}x` : `메모리 왕복 -${g.fusionPass.memoryRoundTripReductionPct}% · 가중치 ${g.quantizationPass.weightCompressionRatio}x`}
      </text>
      <text x="445" y="198" textAnchor="middle" fill={g.quantizationPass.withinAccuracyBudget ? SVG_GOOD_INK : SVG_CLIFF_INK} fontSize="8.5" fontWeight="700">
        {isEn ? `Loss ${g.quantizationPass.estimatedAccuracyLossPct}% / Cap ${g.quantizationPass.maxAllowedAccuracyLossPct}%` : `정확도 손실 ${g.quantizationPass.estimatedAccuracyLossPct}% / 한계 ${g.quantizationPass.maxAllowedAccuracyLossPct}%`}
      </text>
      <text x="445" y="211" textAnchor="middle" fill="currentColor" fillOpacity={0.72} fontSize="8">{s.primaryFusionSignature}</text>

      <line x1="542" y1="156" x2="564" y2="156" stroke={SVG_GPU_INK} strokeWidth="2" />
      <rect x="564" y="102" width="100" height="110" rx="10" fill={formatOklch({ l: 0.56, c: 0.13, h: 228 }, 0.12)} stroke={SVG_GPU_INK} strokeWidth="1.4" />
      <text x="614" y="126" textAnchor="middle" fill={SVG_GPU_INK} fontSize="9.5" fontWeight="700">WebGPU Out</text>
      <text x="614" y="148" textAnchor="middle" fill="currentColor" fontFamily="monospace" fontSize="11" fontWeight="700">{`${g.modeledInferenceMs.toFixed(2)}ms`}</text>
      <text x="614" y="168" textAnchor="middle" fill="currentColor" fillOpacity={0.78} fontSize="8.5">{`${g.frameBudgetUtilizationPct}% budget`}</text>
      <text x="614" y="192" textAnchor="middle" fill={g.meetsFrameBudget ? SVG_GOOD_INK : SVG_WARN_INK} fontSize="9" fontWeight="700">{g.meetsFrameBudget ? (isEn ? "In Budget" : "예산 충족") : (isEn ? "Paced 2f" : "2프레임 분산")}</text>

      <rect x="16" y="236" width="648" height="52" rx="8" fill={SVG_HUD_FILL} />
      <text x="28" y="256" fill={SVG_HUD_TEXT} fontFamily="monospace" fontSize="9.2" fontWeight="700">
        {`MLContextOptions: { deviceType: "${g.mlContextOptions.deviceType}", powerPreference: "${g.mlContextOptions.powerPreference}", mlTensorZeroCopy: ${g.mlContextOptions.mlTensorZeroCopyActive} }`}
      </text>
      <text x="28" y="275" fill={SVG_HUD_TEXT} fillOpacity={0.85} fontSize="8.8">{isEn ? g.zeroCopyPass.statusNoteEn : g.zeroCopyPass.statusNoteKo}</text>
    </svg>
  );
}

function ThermalPidTrajectorySvg(props: { readonly plan: WebNnNpuThermalPlan; readonly isEn: boolean }): ReactElement {
  const { plan, isEn } = props;
  const sim = plan.thermalSimulation;
  const left = 52;
  const right = 656;
  const width = right - left;
  const xOf = (step: number): number => Math.round((left + ((step - 1) / Math.max(1, sim.stepCount - 1)) * width) * 10) / 10;
  const yThermal = (idx: number): number => Math.round((166 - (Math.min(100, Math.max(0, idx)) / 100) * 122) * 10) / 10;
  const yFps = (fps: number): number => Math.round((260 - (Math.min(sim.targetFrameRateHz, Math.max(0, fps)) / sim.targetFrameRateHz) * 64) * 10) / 10;

  const pidTempLine = buildPolyline(sim.trajectory, xOf, (p) => yThermal(p.pidThermalIndex));
  const rawTempLine = buildPolyline(sim.trajectory, xOf, (p) => yThermal(p.uncontrolledThermalIndex));
  const pidFpsLine = buildPolyline(sim.trajectory, xOf, (p) => yFps(p.pidEffectiveFps));
  const rawFpsLine = buildPolyline(sim.trajectory, xOf, (p) => yFps(p.uncontrolledEffectiveFps));
  const cliffY = yThermal(sim.cliffThresholdIndex);
  const setpointY = yThermal(sim.setpointThermalIndex);

  return (
    <svg
      data-testid="thermal-pid-curve-svg" data-silicon-id={sim.siliconId} data-pressure={sim.pressureState}
      data-steps={sim.stepCount} data-max-tier={sim.maxDegradationTier} data-cliff-avoided={sim.pidCliffAvoided ? "true" : "false"}
      data-min-pid-fps={sim.minPidEffectiveFps} data-min-uncontrolled-fps={sim.minUncontrolledEffectiveFps}
      data-violet-free="true" viewBox="0 0 680 304" role="img"
      aria-label={isEn ? "60-step adaptive PID thermal stabilization curve comparing controlled trajectory against uncontrolled thermal cliff" : "60스텝 PID 적응형 열 안정화 곡선 및 미제어 서멀 클리프 비교 그래프"}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="680" height="304" fill={SVG_BG_PANEL} />
      <text x="16" y="24" fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? `2. 60-Step PID Thermal Curve (${sim.sustainedMinutes}m · Setpoint ${sim.setpointThermalIndex})` : `2. 60스텝 PID 적응형 열 안정화 (${sim.sustainedMinutes}분 · 목표 지수 ${sim.setpointThermalIndex})`}
      </text>
      <text x="664" y="24" textAnchor="end" fill={sim.pidCliffAvoided ? SVG_GOOD_INK : SVG_CLIFF_INK} fontSize="10" fontWeight="700">
        {sim.pidCliffAvoided
          ? (isEn ? `CLIFF AVOIDED · Headroom ${Math.round(sim.finalThermalHeadroom01 * 100)}%` : `서멀 클리프 차단 · 열 여유 ${Math.round(sim.finalThermalHeadroom01 * 100)}%`)
          : (isEn ? "THERMAL CAP ACTIVE" : "열 보호 상한 도달")}
      </text>

      <rect x={left} y="44" width={width} height={Math.max(4, cliffY - 44)} fill={SVG_CLIFF_ZONE} />
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={`th-${tick}`}>
          <line x1={left} y1={yThermal(tick)} x2={right} y2={yThermal(tick)} stroke={SVG_GRID_STROKE} strokeWidth="0.7" />
          <text x={left - 6} y={yThermal(tick) + 3} textAnchor="end" fill="currentColor" fillOpacity={0.68} fontSize="8.2" fontFamily="monospace">{tick}</text>
        </g>
      ))}
      <line x1={left} y1={cliffY} x2={right} y2={cliffY} stroke={SVG_CLIFF_INK} strokeWidth="1.2" strokeDasharray="4 3" />
      <text x={right - 4} y={cliffY - 4} textAnchor="end" fill={SVG_CLIFF_INK} fontSize="8.3" fontWeight="700">{isEn ? `Thermal Cliff (${sim.cliffThresholdIndex})` : `서멀 클리프 경계 (${sim.cliffThresholdIndex})`}</text>
      <line x1={left} y1={setpointY} x2={right} y2={setpointY} stroke={SVG_WARN_INK} strokeWidth="1.1" strokeDasharray="3 3" />
      <text x={left + 4} y={setpointY - 4} fill={SVG_WARN_INK} fontSize="8.2" fontWeight="700">{isEn ? `PID Setpoint (${sim.setpointThermalIndex})` : `PID 설정점 (${sim.setpointThermalIndex})`}</text>

      <polyline points={rawTempLine} fill="none" stroke={SVG_CLIFF_INK} strokeWidth="1.8" strokeDasharray="5 3" />
      <polyline points={pidTempLine} fill="none" stroke={SVG_NPU_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {([1, 2, 3, 4] as const).map((tier) => {
        const engagedStep = sim.tierFirstEngagedStep[tier];
        const pt = engagedStep !== null ? sim.trajectory[engagedStep - 1] : undefined;
        if (engagedStep === null || !pt) return null;
        const cx = xOf(engagedStep);
        const cy = yThermal(pt.pidThermalIndex);
        return (
          <g key={`tier-dot-${tier}`}>
            <circle cx={cx} cy={cy} r="5.5" fill={SVG_WARN_INK} />
            <text x={cx} y={cy + 3} textAnchor="middle" fill={SVG_HUD_TEXT} fontSize="7.5" fontWeight="700">{`T${tier}`}</text>
          </g>
        );
      })}

      <text x={left} y="188" fill="currentColor" fontSize="9.2" fontWeight="700">
        {isEn ? `Effective Frame Rate (0..${sim.targetFrameRateHz}Hz)` : `실효 프레임률 추이 (0..${sim.targetFrameRateHz}Hz)`}
      </text>
      <line x1={left} y1="196" x2={right} y2="196" stroke={SVG_GRID_STROKE} strokeWidth="0.7" />
      <line x1={left} y1="260" x2={right} y2="260" stroke={SVG_GRID_STROKE} strokeWidth="0.9" />
      <text x={left - 6} y="200" textAnchor="end" fill="currentColor" fillOpacity={0.7} fontSize="8" fontFamily="monospace">{sim.targetFrameRateHz}</text>
      <text x={left - 6} y={yFps(15) + 3} textAnchor="end" fill={SVG_CLIFF_INK} fontSize="8" fontFamily="monospace">15</text>

      <polyline points={rawFpsLine} fill="none" stroke={SVG_CLIFF_INK} strokeWidth="1.7" strokeDasharray="4 3" />
      <polyline points={pidFpsLine} fill="none" stroke={SVG_GOOD_INK} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />

      <g fontSize="8.6" fill="currentColor" fillOpacity={0.85}>
        <line x1="18" y1="285" x2="36" y2="285" stroke={SVG_NPU_INK} strokeWidth="2.4" />
        <text x="41" y="288">{isEn ? "PID Thermal Index" : "PID 안정화 열 지수"}</text>
        <line x1="158" y1="285" x2="176" y2="285" stroke={SVG_GOOD_INK} strokeWidth="2.4" />
        <text x="181" y="288">{isEn ? `PID FPS (min ${sim.minPidEffectiveFps})` : `PID FPS (최저 ${sim.minPidEffectiveFps})`}</text>
        <line x1="308" y1="285" x2="326" y2="285" stroke={SVG_CLIFF_INK} strokeWidth="1.8" strokeDasharray="4 3" />
        <text x="331" y="288">{isEn ? `Uncontrolled Cliff (min ${sim.minUncontrolledEffectiveFps}fps)` : `미제어 급락 (최저 ${sim.minUncontrolledEffectiveFps}fps)`}</text>
        <text x="664" y="288" textAnchor="end" fontFamily="monospace" fill={SVG_NPU_INK} fontWeight="700">{`Kp=${sim.gains.kp} Ki=${sim.gains.ki} Kd=${sim.gains.kd}`}</text>
      </g>
    </svg>
  );
}

/** 실리콘 맞춤형 WebNN NPU 그래프 컴파일러 · 양자화 융합 · 적응형 PID 열 제어 스튜디오 패널. */
export function StudioWebNnNpuThermalPanel(props: StudioWebNnNpuThermalPanelProps): ReactElement {
  const initialSiliconId = props.initialSiliconId ?? DEFAULT_SILICON_NPU_ID;
  const initialWorkloadId = props.initialWorkloadId ?? DEFAULT_WEBTOON_WORKLOAD_ID;
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const headingId = useId();
  const minutesSliderId = useId();

  const buildDefaults = (): PanelConfigState => ({
    siliconId: initialSiliconId, workloadId: initialWorkloadId, quantizationMode: "auto",
    zeroCopyMlTensorEnabled: true, penHoverWarmupEnabled: true, batteryMode: "ac-plugged",
    ambientLoadLevel: "normal", pressureState: "nominal", sustainedMinutes: DEFAULT_SUSTAINED_MINUTES, targetFrameRateHz: 120,
  });

  const [config, setConfig] = useState<PanelConfigState>(buildDefaults);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const { plan, json: planJson } = useMemo(() => exportWebNnThermalPlanJson(config), [config]);

  const updateConfig = (patch: Partial<PanelConfigState>, noticeKo: string, noticeEn: string): void => {
    const next: WebNnNpuThermalPlanInput = { ...config, ...patch };
    setConfig((prev) => ({ ...prev, ...patch }));
    const { plan: nextPlan } = exportWebNnThermalPlanJson(next);
    props.onPlanChange?.(nextPlan);
    setStatusMessage(pick(noticeKo, noticeEn));
  };

  const handleExportJson = (): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(planJson).catch(() => undefined);
    }
    setShowJsonPreview(true);
    props.onExportJson?.(planJson, plan);
    setStatusMessage(pick("MLContextOptions · 그래프 IR · PID 열 제어 정책 JSON을 복사했습니다.", "Copied MLContextOptions, graph IR, and PID thermal policy JSON."));
  };

  const handleReset = (): void => {
    const defaults = buildDefaults();
    setConfig(defaults);
    setShowJsonPreview(false);
    const { plan: nextPlan } = exportWebNnThermalPlanJson(defaults);
    props.onPlanChange?.(nextPlan);
    setStatusMessage(pick("실리콘 컴파일러와 PID 열 제어 설정을 초기값으로 되돌렸습니다.", "Reset silicon compiler and PID thermal settings to defaults."));
  };

  const { compiledGraph: g, thermalSimulation: sim } = plan;

  return (
    <section
      data-testid="webnn-npu-thermal-panel" aria-labelledby={headingId}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {plan.siliconTarget.executionProvider}
            </span>
            <span
              data-testid="webnn-zero-copy-badge"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${g.zeroCopyPass.zeroCopyActive ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}
            >
              {g.zeroCopyPass.zeroCopyActive ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {g.zeroCopyPass.zeroCopyActive ? pick("MLTensor Zero-Copy · Readback 0회", "MLTensor Zero-Copy · 0 Readbacks") : pick(`Fallback 복사 · Readback ${g.zeroCopyPass.cpuReadbackCount}회`, `Fallback Copy · ${g.zeroCopyPass.cpuReadbackCount} Readbacks`)}
            </span>
            <span data-testid="thermal-headroom-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${tierBadgeClass(sim.finalDegradationTier)}`}>
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(`열 여유도 ${Math.round(sim.finalThermalHeadroom01 * 100)}% · 최대 ${sim.maxDegradationTier}단`, `Headroom ${Math.round(sim.finalThermalHeadroom01 * 100)}% · Max Tier ${sim.maxDegradationTier}`)}
            </span>
          </div>
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("실리콘 맞춤형 WebNN NPU 그래프 컴파일러 & 적응형 PID 열 제어", "Silicon-Tailored WebNN NPU Compiler & Adaptive PID Thermal Controller")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("5대 실리콘 NPU 아키텍처별 연산자 융합·양자화·Zero-Copy MLTensor 경로를 컴파일하고, 이산 시간 PID + Anti-Windup 제어로 서멀 클리프 없이 부드럽게 4단 강등합니다.", "Compiles operator fusion, precision guards, and zero-copy MLTensor paths across five NPU architectures while smoothing sustained thermal load via discrete PID control.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="webnn-export-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("정책 JSON 복사", "Copy Policy JSON")}
          </button>
          <button type="button" data-testid="webnn-toggle-json-btn" onClick={() => setShowJsonPreview((p) => !p)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("IR/JSON 보기", "View IR JSON")}
          </button>
          <button type="button" data-testid="webnn-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {/* 5대 실리콘 NPU 아키텍처 카드 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all]">
          <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("대상 실리콘 NPU 아키텍처 (5종)", "Target Silicon NPU Architecture (5)")}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {SILICON_NPU_TARGETS.map((item) => {
            const active = item.id === config.siliconId;
            return (
              <button
                key={item.id} type="button" data-testid={`silicon-card-${item.id}`} aria-pressed={active}
                onClick={() => updateConfig({ siliconId: item.id }, `${item.nameKo} 프로파일로 그래프 컴파일과 PID 게인을 재계산했습니다.`, `Recompiled graph and PID gains for ${item.nameEn}.`)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-xs font-bold">{item.shortLabel}</span>
                  <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{item.executionProvider.split(" ")[0]}</span>
                </div>
                <span className="text-[11px] leading-snug text-fg-2">{item.nativePrecisionsLabel}</span>
                <span className="font-mono text-[10px] text-fg-3">{item.spatialTileGrid.layoutLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 제어 패널 2단 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("웹툰 AI 워크로드 & 그래프 컴파일 옵션", "Webtoon AI Workload & Compiler Options")}
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {WEBTOON_AI_WORKLOADS.map((wl) => (
              <button
                key={wl.id} type="button" data-testid={`workload-btn-${wl.id}`} aria-pressed={wl.id === config.workloadId}
                onClick={() => updateConfig({ workloadId: wl.id }, `웹툰 AI 워크로드를 '${wl.nameKo}'로 전환했습니다.`, `Switched workload to '${wl.nameEn}'.`)}
                className={`${wl.id === config.workloadId ? BTN_ACTIVE : BTN_OUTLINE} justify-start text-left`}
              >
                <span className="font-mono text-[10px] opacity-75">{`0${wl.order}`}</span>
                <span className="truncate">{isEn ? wl.nameEn : wl.nameKo}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold text-fg-2">{pick("양자화 정밀도 정책", "Quantization Precision")}</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {QUANTIZATION_MODES.map((mode) => (
                <button
                  key={mode} type="button" data-testid={`quant-btn-${mode}`} aria-pressed={mode === config.quantizationMode}
                  onClick={() => updateConfig({ quantizationMode: mode }, `양자화 모드를 ${QUANT_LABELS[mode].ko}로 변경해 정확도 한계를 검증했습니다.`, `Changed quantization mode to ${QUANT_LABELS[mode].en}.`)}
                  className={mode === config.quantizationMode ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? QUANT_LABELS[mode].en : QUANT_LABELS[mode].ko}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button" role="switch" data-testid="zero-copy-switch" aria-checked={config.zeroCopyMlTensorEnabled}
              onClick={() => {
                const next = !config.zeroCopyMlTensorEnabled;
                updateConfig({ zeroCopyMlTensorEnabled: next }, next ? "WebGPU↔WebNN MLTensor Zero-Copy 경로를 우선 활성화했습니다." : "Zero-Copy를 끄고 CPU Readback 2회 폴백 경로로 전환했습니다.", next ? "Enabled WebGPU-to-WebNN MLTensor zero-copy." : "Disabled zero-copy to inspect CPU readback fallback.");
              }}
              className={`${SWITCH_BASE} ${config.zeroCopyMlTensorEnabled ? "border-accent bg-accent-soft text-fg" : "border-line bg-panel text-fg-2"}`}
            >
              <div>
                <div className="text-xs font-semibold">MLTensor Zero-Copy</div>
                <div className="text-[11px] text-fg-2">{pick("GPU↔NPU CPU 복사 제거", "Skip CPU readback")}</div>
              </div>
              <span className="font-mono text-[11px] font-bold">{config.zeroCopyMlTensorEnabled ? "ON" : "OFF"}</span>
            </button>
            <button
              type="button" role="switch" data-testid="hover-warmup-switch" aria-checked={config.penHoverWarmupEnabled}
              onClick={() => {
                const next = !config.penHoverWarmupEnabled;
                updateConfig({ penHoverWarmupEnabled: next }, next ? "펜 호버 투기적 NPU 워밍업 스케줄을 켰습니다." : "펜 호버 워밍업을 꺼 콜드 스타트 지연을 확인합니다.", next ? "Enabled speculative NPU warmup on stylus hover." : "Disabled hover warmup to inspect cold-start latency.");
              }}
              className={`${SWITCH_BASE} ${config.penHoverWarmupEnabled ? "border-accent bg-accent-soft text-fg" : "border-line bg-panel text-fg-2"}`}
            >
              <div>
                <div className="text-xs font-semibold">{pick("펜 호버 투기적 워밍업", "Pen Hover Warmup")}</div>
                <div className="text-[11px] text-fg-2">{pick("접촉 전 SRAM 예열", "Pre-prime SRAM")}</div>
              </div>
              <span className="font-mono text-[11px] font-bold">{config.penHoverWarmupEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("열 · 전력 · Compute Pressure 환경 시뮬레이션", "Thermal, Power & Compute Pressure Environment")}
          </div>
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold text-fg-2">{pick("Compute Pressure 상태", "Compute Pressure State")}</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {COMPUTE_PRESSURE_STATES.map((state) => (
                <button
                  key={state} type="button" data-testid={`pressure-btn-${state}`} aria-pressed={state === config.pressureState}
                  onClick={() => updateConfig({ pressureState: state }, `Compute Pressure 상태를 ${state}로 설정했습니다.`, `Set Compute Pressure state to ${state}.`)}
                  className={state === config.pressureState ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? PRESSURE_LABELS[state].en : `${PRESSURE_LABELS[state].ko} (${state})`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-fg-2"><BatteryCharging className="h-3.5 w-3.5" aria-hidden="true" />{pick("전원 · 배터리 모드", "Power Source")}</span>
              <div className="grid grid-cols-3 gap-1">
                {POWER_SOURCE_MODES.map((mode) => (
                  <button
                    key={mode} type="button" data-testid={`battery-btn-${mode}`} aria-pressed={mode === config.batteryMode}
                    onClick={() => updateConfig({ batteryMode: mode }, `전원 정책을 '${BATTERY_LABELS[mode].ko}'로 바꿨습니다.`, `Switched power policy to ${BATTERY_LABELS[mode].en}.`)}
                    className={`${mode === config.batteryMode ? BTN_ACTIVE : BTN_OUTLINE} px-2 text-[11px]`}
                  >
                    {isEn ? BATTERY_LABELS[mode].en : BATTERY_LABELS[mode].ko}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-fg-2"><Flame className="h-3.5 w-3.5" aria-hidden="true" />{pick("주변 열 부하 · 목표 Hz", "Ambient Load & Target Hz")}</span>
              <div className="flex flex-wrap gap-1">
                {AMBIENT_THERMAL_LEVELS.map((lvl) => (
                  <button
                    key={lvl} type="button" data-testid={`ambient-btn-${lvl}`} aria-pressed={lvl === config.ambientLoadLevel}
                    onClick={() => updateConfig({ ambientLoadLevel: lvl }, `주변 열 부하를 '${AMBIENT_LABELS[lvl].ko}'으로 조정했습니다.`, `Set ambient thermal baseline to ${AMBIENT_LABELS[lvl].en}.`)}
                    className={`${lvl === config.ambientLoadLevel ? BTN_ACTIVE : BTN_OUTLINE} px-2.5 text-[11px]`}
                  >
                    {isEn ? AMBIENT_LABELS[lvl].en : AMBIENT_LABELS[lvl].ko}
                  </button>
                ))}
                {([60, 120] as const).map((hz) => (
                  <button
                    key={hz} type="button" data-testid={`hz-btn-${hz}`} aria-pressed={hz === config.targetFrameRateHz}
                    onClick={() => updateConfig({ targetFrameRateHz: hz }, `목표 주사율을 ${hz}Hz로 변경했습니다.`, `Set target refresh rate to ${hz}Hz.`)}
                    className={`${hz === config.targetFrameRateHz ? BTN_ACTIVE : BTN_OUTLINE} px-2.5 font-mono text-[11px] tabular-nums`}
                  >
                    {`${hz}Hz`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={minutesSliderId} className="font-semibold text-fg-2 [word-break:keep-all]">{pick("연속 작업 부하 시간 (1~60분)", "Sustained Workload Duration (1–60 min)")}</label>
              <span data-testid="sustained-minutes-readout" className="font-mono font-bold text-accent tabular-nums">{pick(`${config.sustainedMinutes}분`, `${config.sustainedMinutes} min`)}</span>
            </div>
            <input
              id={minutesSliderId} data-testid="sustained-minutes-slider" type="range"
              min={MIN_SUSTAINED_MINUTES} max={MAX_SUSTAINED_MINUTES} step={1} value={config.sustainedMinutes}
              onChange={(e) => {
                const nextMin = Number(e.target.value);
                updateConfig({ sustainedMinutes: nextMin }, `연속 작업 시간을 ${nextMin}분으로 조정했습니다.`, `Adjusted sustained workload to ${nextMin} min.`);
              }}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>
        </div>
      </div>

      {/* 핵심 지표 4카드 */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1 text-[11px] text-fg-2"><Zap className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("연산자 융합", "Op Fusion")}</div>
          <div data-testid="kpi-fusion-ops" className="mt-1 font-mono text-base font-bold tabular-nums">{`${g.fusionPass.rawOpCount} → ${g.fusionPass.fusedOpCount}`}</div>
          <div className="text-[11px] text-fg-3 tabular-nums">{pick(`메모리 왕복 -${g.fusionPass.memoryRoundTripReductionPct}%`, `Mem trips -${g.fusionPass.memoryRoundTripReductionPct}%`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1 text-[11px] text-fg-2"><Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("실효 양자화", "Quantization")}</div>
          <div data-testid="kpi-quant-format" className="mt-1 truncate text-sm font-bold">{g.quantizationPass.effectiveFormatLabel}</div>
          <div className="text-[11px] text-fg-3 tabular-nums">{pick(`손실 ${g.quantizationPass.estimatedAccuracyLossPct}% / 한계 ${g.quantizationPass.maxAllowedAccuracyLossPct}%`, `Loss ${g.quantizationPass.estimatedAccuracyLossPct}% / ${g.quantizationPass.maxAllowedAccuracyLossPct}%`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1 text-[11px] text-fg-2"><Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("호버 예열 · 복사", "Hover & Copy")}</div>
          <div data-testid="kpi-warmup-saved" className="mt-1 font-mono text-base font-bold tabular-nums">{`-${g.hoverWarmupPass.firstStrokeLatencySavedMs} ms`}</div>
          <div className="text-[11px] text-fg-3 tabular-nums">{pick(`Readback ${g.zeroCopyPass.cpuReadbackCount}회 · ${g.modeledInferenceMs}ms`, `${g.zeroCopyPass.cpuReadbackCount} readbacks · ${g.modeledInferenceMs}ms`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1 text-[11px] text-fg-2"><Flame className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("PID 열 여유 · 최저 FPS", "Thermal Headroom")}</div>
          <div data-testid="kpi-pid-fps" className="mt-1 font-mono text-base font-bold tabular-nums">{`${sim.minPidEffectiveFps} vs ${sim.minUncontrolledEffectiveFps} fps`}</div>
          <div className="text-[11px] text-fg-3 tabular-nums">{pick(`열 지수 ${sim.finalThermalIndex}/100 · AW ${sim.antiWindupClampCount}회`, `Idx ${sim.finalThermalIndex}/100 · AW ${sim.antiWindupClampCount}`)}</div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2단 시각화 */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <SiliconPipelineSvg plan={plan} isEn={isEn} />
        <ThermalPidTrajectorySvg plan={plan} isEn={isEn} />
      </div>

      {/* 하단 2단: 4단 강등 사다리 & 융합 패스 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between text-xs font-semibold text-fg">
            <span>{pick("PID 4단 그레이스풀 열 강등 사다리", "4-Tier Graceful Thermal Degradation Ladder")}</span>
            <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`Steady Err ${sim.steadyStateError}`}</span>
          </div>
          <ul className="space-y-1.5">
            {plan.degradationLadder.slice(1).map((step) => {
              const engagedAt = sim.tierFirstEngagedStep[step.tier];
              const isCurrent = sim.finalDegradationTier === step.tier;
              return (
                <li
                  key={step.code} data-testid={`degradation-tier-${step.tier}`}
                  className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${isCurrent ? "border-accent bg-accent-soft" : engagedAt !== null ? "border-line-strong bg-raised" : "border-line bg-panel opacity-80"}`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    <span>{isEn ? step.titleEn : step.titleKo}</span>
                    <span className="font-mono text-[10px] tabular-nums text-fg-2">{engagedAt !== null ? pick(`스텝 #${engagedAt} 진입`, `Step #${engagedAt}`) : pick("대기", "Standby")}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-fg-2">{isEn ? step.actionEn : step.actionKo}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between text-xs font-semibold text-fg">
            <span>{pick("실리콘 연산자 융합 패스 & 정밀도 가드", "Silicon Fusion Blocks & Precision Guard")}</span>
            <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`Tile ${g.fusionPass.spatialTileUtilizationPct}%`}</span>
          </div>
          <ul className="space-y-1.5">
            {g.fusionPass.fusedBlocks.map((b) => (
              <li key={b.blockId} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-mono font-semibold text-fg">{b.pattern}</div>
                  <div className="truncate text-[11px] text-fg-2">{b.siliconPassTag}</div>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-bold text-accent tabular-nums">{`${b.originalOpCount}→${b.fusedOpCount}`}</span>
              </li>
            ))}
          </ul>
          <p data-testid="quant-guard-note" className="rounded-lg border border-line bg-raised px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
            {isEn ? g.quantizationPass.guardNoteEn : g.quantizationPass.guardNoteKo}
          </p>
          <p data-testid="honesty-notice" className="flex items-start gap-1.5 text-[11px] text-fg-3 [word-break:keep-all]">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{isEn ? plan.honestyNoticeEn : plan.honestyNoticeKo}</span>
          </p>
        </div>
      </div>

      {showJsonPreview && (
        <pre data-testid="webnn-json-preview" className="max-h-64 overflow-auto rounded-xl border border-line-strong bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg">
          {planJson}
        </pre>
      )}
      {statusMessage && (
        <p role="status" aria-live="polite" data-testid="webnn-status-message" className="text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
