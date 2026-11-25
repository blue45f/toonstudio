/**
 * Wave 55C — 16,384단계 스타일러스 압력 곡선 & 신경망 궤적 예측·보정 제어판 UI.
 *
 * - 5종 디지타이저 프로파일 + 5종 작가 압력 곡선 프리셋 + IAF·히스테리시스·지터·선행예측·코너보호·기울기 슬라이더
 * - 순수 시맨틱 SVG 2단 프리뷰(oklch/currentColor 전용, 원시 색·바이올렛 휴 270~320° 0%):
 *   좌: 16,384단계 PCHIP 단조 압력 곡선 + 가압/감압 히스테리시스 밴드 + IAF 데드존 + cos(tilt) 감쇠선
 *   우: 원시 지터 궤적 vs 단순 EMA vs ToonStudio One-Euro·Micro-MLP 보정 궤적(코너·삐침·선행예측 마커)
 * - 정량 비교 벤치마크 표(RMSE, 코너 보존률, 유효 지연 보정, 삐침 선명도) + JSON 복사·미리보기
 */

import {
  Activity, Check, Code2, Copy, Cpu, Gauge, PenTool, RotateCcw, ShieldCheck, SlidersHorizontal, Target, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  DIGITIZER_HARDWARE_PROFILES, MAX_LOOK_AHEAD_MS, MAX_PRESSURE_LEVEL_14BIT,
  MICRO_MLP_INFERENCE_KIND, PRESSURE_CURVE_PRESETS,
  auditPchipPressureCurve, benchmarkStrokeCompensation, createDefaultStylusCompensationConfig,
  exportStylusCompensationJson, formatOklch, getDigitizerProfile, getPressureCurvePreset,
  type DigitizerProfileId, type PchipCurveAuditReport, type PressureCurvePresetId,
  type StrokeBenchmarkReport, type StylusCompensationConfig, type StylusCompensationExportManifest,
} from "./stylus-neural-compensation-engine";

export interface StylusCompensationProfileSnapshot {
  readonly config: StylusCompensationConfig;
  readonly curveAudit: PchipCurveAuditReport;
  readonly benchmark: StrokeBenchmarkReport;
}

export interface StudioStylusNeuralCompensationPanelProps {
  readonly initialDigitizerId?: DigitizerProfileId;
  readonly initialCurvePresetId?: PressureCurvePresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onProfileChange?: (snapshot: StylusCompensationProfileSnapshot) => void;
  readonly onExportJson?: (json: string, manifest: StylusCompensationExportManifest) => void;
}

// 탈-바이올렛 순수 OKLCH SVG 팔레트 (모든 휴 270~320° 완전 배제)
const SVG_CANVAS_BG = "oklch(0.97 0.005 92)";
const SVG_GRID_LINE = "oklch(0.80 0.012 225 / 0.52)";
const SVG_IAF_ZONE = "oklch(0.68 0.12 48 / 0.24)";
const SVG_IAF_STROKE = "oklch(0.56 0.14 48)";
const SVG_HYST_BAND = "oklch(0.58 0.13 205 / 0.24)";
const SVG_HYST_EDGE = "oklch(0.52 0.13 205 / 0.72)";
const SVG_TILT_CURVE = "oklch(0.54 0.13 158)";
const SVG_RAW_JITTER = "oklch(0.58 0.15 26 / 0.65)";
const SVG_EMA_LINE = "oklch(0.58 0.14 68 / 0.88)";
const SVG_HYBRID_LINE = "oklch(0.46 0.16 228)";
const SVG_TRUTH_LINE = "oklch(0.45 0.015 232 / 0.35)";
const SVG_CUSP_MARKER = "oklch(0.54 0.19 28)";
const SVG_TAPER_MARKER = "oklch(0.50 0.15 162)";
const SVG_LEAD_ARROW = "oklch(0.52 0.14 198)";
const SVG_INK_MUTED = "oklch(0.35 0.015 232)";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function r1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildPolyline(pts: readonly { readonly x: number; readonly y: number }[]): string {
  return pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ");
}

function ControlSlider(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly hint: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly disabled?: boolean; readonly onChange: (value: number) => void;
}): ReactElement {
  return (
    <div className="space-y-0.5">
      <label htmlFor={props.id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{props.label}</span>
        <span data-testid={`${props.testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{props.readout}</span>
      </label>
      <input
        id={props.id} data-testid={props.testId} type="range"
        min={props.min} max={props.max} step={props.step} value={props.value} disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p className="text-[11px] text-fg-3 [word-break:keep-all]">{props.hint}</p>
    </div>
  );
}

function PressureCurveSvg(props: {
  readonly audit: PchipCurveAuditReport; readonly config: StylusCompensationConfig;
  readonly accentCss: string; readonly supportsTilt: boolean; readonly isEn: boolean;
}): ReactElement {
  const { audit, config, accentCss, supportsTilt, isEn } = props;
  const plotX = 48;
  const plotY = 26;
  const plotW = 282;
  const plotH = 186;
  const toX = (u: number): number => r1(plotX + u * plotW);
  const toY = (v: number): number => r1(plotY + (1 - v) * plotH);

  const neutralPts = audit.samples.map((s) => `${toX(s.rawPressure)},${toY(s.neutralOutput)}`).join(" ");
  const pressPts = audit.samples.map((s) => `${toX(s.rawPressure)},${toY(s.pressOutput)}`).join(" ");
  const releasePts = audit.samples.map((s) => `${toX(s.rawPressure)},${toY(s.releaseOutput)}`).join(" ");
  const tiltedPts = audit.samples.map((s) => `${toX(s.rawPressure)},${toY(s.tiltedOutput)}`).join(" ");
  const bandPolygon = [
    ...audit.samples.map((s) => `${toX(s.rawPressure)},${toY(s.releaseOutput)}`),
    ...[...audit.samples].reverse().map((s) => `${toX(s.rawPressure)},${toY(s.pressOutput)}`),
  ].join(" ");
  const iafWidth = r1(config.iafThreshold * plotW);

  return (
    <svg
      data-testid="svg-pressure-curve-preview"
      data-monotonic={String(audit.isStrictlyMonotonic)}
      data-iaf-pct={String(Math.round(config.iafThreshold * 1000) / 10)}
      data-hysteresis-peak={String(audit.hysteresisPeakDelta)}
      viewBox="0 0 356 254" role="img"
      aria-label={isEn ? "16,384-level PCHIP pressure curve with IAF and hysteresis band" : "16,384단계 PCHIP 단조 압력 곡선, IAF 데드존 및 히스테리시스 밴드"}
      className="h-auto w-full rounded-xl border border-line bg-card text-fg"
    >
      <rect x={plotX} y={plotY} width={plotW} height={plotH} rx={6} fill={SVG_CANVAS_BG} stroke={SVG_GRID_LINE} strokeWidth={1} />
      {[0.25, 0.5, 0.75, 1.0].map((tick) => {
        const y = toY(tick);
        const x = toX(tick);
        return (
          <g key={tick}>
            <line x1={plotX} y1={y} x2={plotX + plotW} y2={y} stroke={SVG_GRID_LINE} strokeDasharray="3 3" strokeWidth={0.8} />
            <line x1={x} y1={plotY} x2={x} y2={plotY + plotH} stroke={SVG_GRID_LINE} strokeDasharray="3 3" strokeWidth={0.8} />
            <text x={plotX - 5} y={y + 3} textAnchor="end" fontSize={8.5} fill="currentColor" fillOpacity={0.72}>
              {Math.round(tick * MAX_PRESSURE_LEVEL_14BIT).toLocaleString("en-US")}
            </text>
          </g>
        );
      })}
      <text x={plotX - 5} y={plotY + plotH + 3} textAnchor="end" fontSize={8.5} fill="currentColor" fillOpacity={0.72}>0</text>
      <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY} stroke={SVG_TRUTH_LINE} strokeDasharray="4 4" strokeWidth={1} />

      {iafWidth > 0 ? (
        <g data-testid="svg-iaf-deadzone-rect">
          <rect x={plotX} y={plotY} width={iafWidth} height={plotH} fill={SVG_IAF_ZONE} />
          <line x1={plotX + iafWidth} y1={plotY} x2={plotX + iafWidth} y2={plotY + plotH} stroke={SVG_IAF_STROKE} strokeWidth={1.1} strokeDasharray="2 2" />
          <text x={plotX + iafWidth + 4} y={plotY + 13} fontSize={8.5} fontWeight={700} fill={SVG_IAF_STROKE}>
            {`IAF ${(config.iafThreshold * 100).toFixed(1)}%`}
          </text>
        </g>
      ) : null}

      <polygon data-testid="svg-hysteresis-band" points={bandPolygon} fill={SVG_HYST_BAND} />
      <polyline points={pressPts} fill="none" stroke={SVG_HYST_EDGE} strokeWidth={1} strokeDasharray="2 2" />
      <polyline points={releasePts} fill="none" stroke={SVG_HYST_EDGE} strokeWidth={1} />
      {supportsTilt && config.previewTiltDeg > 0 && config.tiltAttenuationStrength > 0 ? (
        <polyline data-testid="svg-tilt-attenuated-curve" points={tiltedPts} fill="none" stroke={SVG_TILT_CURVE} strokeWidth={1.5} strokeDasharray="5 3" />
      ) : null}
      <polyline data-testid="svg-pchip-main-curve" points={neutralPts} fill="none" stroke={accentCss} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />

      {audit.controlPoints.map((pt, idx) => (
        <circle
          key={idx} data-testid={`svg-pchip-knot-${idx}`}
          cx={toX(config.iafThreshold + pt.x * (1 - config.iafThreshold))} cy={toY(pt.y)}
          r={3.6} fill={SVG_CANVAS_BG} stroke={accentCss} strokeWidth={2}
        />
      ))}

      <text x={plotX} y={16} fontSize={10} fontWeight={700} fill="currentColor">
        {isEn ? "16,384-Step PCHIP Transfer Curve" : "16,384단계 PCHIP 압력 전달 곡선"}
      </text>
      <text x={plotX + plotW} y={16} textAnchor="end" fontSize={9} fontWeight={600} fill={SVG_TAPER_MARKER}>
        {isEn ? "Monotone · 0 Overshoot" : "엄격 단조 · 오버슈트 0"}
      </text>
      <text x={plotX + plotW / 2} y={228} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.75}>
        {isEn ? "Raw Hardware Pressure (0% → 100%)" : "원시 디지타이저 필압 (0% → 100%)"}
      </text>
      <g fontSize={8.5} fill="currentColor" fillOpacity={0.85}>
        <line x1={48} y1={243} x2={64} y2={243} stroke={accentCss} strokeWidth={2.4} />
        <text x={68} y={246}>{isEn ? "PCHIP" : "PCHIP 주곡선"}</text>
        <rect x={144} y={238} width={12} height={8} rx={2} fill={SVG_HYST_BAND} stroke={SVG_HYST_EDGE} strokeWidth={0.8} />
        <text x={160} y={246}>{isEn ? "Hysteresis" : "히스테리시스"}</text>
        <line x1={236} y1={243} x2={252} y2={243} stroke={SVG_TILT_CURVE} strokeWidth={1.6} strokeDasharray="4 2" />
        <text x={256} y={246}>{`cos(${config.previewTiltDeg}°)`}</text>
      </g>
    </svg>
  );
}

function TrajectoryCompensationSvg(props: { readonly benchmark: StrokeBenchmarkReport; readonly isEn: boolean }): ReactElement {
  const { benchmark, isEn } = props;
  const { synthetic, simpleEmaPoints, hybridResult } = benchmark;
  const truthLine = buildPolyline(synthetic.groundTruth);
  const rawLine = buildPolyline(synthetic.noisyInput);
  const emaLine = buildPolyline(simpleEmaPoints);
  const hybridLine = buildPolyline(hybridResult.samples.map((s) => ({ x: s.compensatedX, y: s.compensatedY })));

  const cuspSample = hybridResult.samples[synthetic.cuspIndex];
  const tailSample = hybridResult.samples[hybridResult.samples.length - 1];
  const leadAnchor = hybridResult.samples[Math.min(hybridResult.samples.length - 1, synthetic.fastArcRange[0] + 6)];

  return (
    <svg
      data-testid="svg-trajectory-preview"
      data-cusp-count={String(hybridResult.cuspIndices.length)}
      data-taper-count={String(hybridResult.releaseTaperIndices.length)}
      data-inference-kind={hybridResult.inferenceKind}
      viewBox="0 0 356 254" role="img"
      aria-label={isEn ? "Trajectory comparison: raw jitter vs EMA vs ToonStudio hybrid" : "궤적 비교: 원시 지터 vs 단순 EMA vs ToonStudio 하이브리드 보정"}
      className="h-auto w-full rounded-xl border border-line bg-card text-fg"
    >
      <rect x={14} y={26} width={328} height={186} rx={8} fill={SVG_CANVAS_BG} stroke={SVG_GRID_LINE} strokeWidth={1} />
      <polyline points={truthLine} fill="none" stroke={SVG_TRUTH_LINE} strokeWidth={1.4} />
      <polyline data-testid="svg-raw-trajectory" points={rawLine} fill="none" stroke={SVG_RAW_JITTER} strokeWidth={1.25} strokeLinejoin="round" />
      <polyline data-testid="svg-ema-trajectory" points={emaLine} fill="none" stroke={SVG_EMA_LINE} strokeWidth={1.8} strokeDasharray="4 3" strokeLinejoin="round" />
      <polyline data-testid="svg-hybrid-trajectory" points={hybridLine} fill="none" stroke={SVG_HYBRID_LINE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />

      {cuspSample ? (
        <g data-testid="svg-cusp-marker">
          <circle cx={r1(cuspSample.compensatedX)} cy={r1(cuspSample.compensatedY)} r={7.5} fill="none" stroke={SVG_CUSP_MARKER} strokeWidth={1.8} />
          <circle cx={r1(cuspSample.compensatedX)} cy={r1(cuspSample.compensatedY)} r={2.5} fill={SVG_CUSP_MARKER} />
          <text x={r1(cuspSample.compensatedX + 11)} y={r1(cuspSample.compensatedY + 4)} fontSize={8.5} fontWeight={700} fill={SVG_CUSP_MARKER}>
            {isEn ? `Cusp ${cuspSample.turningAngleDeg}°` : `코너 보호 ${cuspSample.turningAngleDeg}°`}
          </text>
        </g>
      ) : null}

      {leadAnchor ? (
        <g data-testid="svg-lookahead-vector">
          <line x1={r1(leadAnchor.compensatedX)} y1={r1(leadAnchor.compensatedY)} x2={r1(leadAnchor.predictedX)} y2={r1(leadAnchor.predictedY)} stroke={SVG_LEAD_ARROW} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={r1(leadAnchor.predictedX)} cy={r1(leadAnchor.predictedY)} r={3} fill={SVG_LEAD_ARROW} />
          <text x={r1(leadAnchor.predictedX - 4)} y={r1(leadAnchor.predictedY - 8)} fontSize={8} fontWeight={700} fill={SVG_LEAD_ARROW}>
            {`+${leadAnchor.effectiveLeadMs}ms`}
          </text>
        </g>
      ) : null}

      {tailSample ? (
        <g data-testid="svg-taper-marker">
          <circle cx={r1(tailSample.compensatedX)} cy={r1(tailSample.compensatedY)} r={6.5} fill="none" stroke={SVG_TAPER_MARKER} strokeWidth={1.7} strokeDasharray="2 2" />
          <circle cx={r1(tailSample.compensatedX)} cy={r1(tailSample.compensatedY)} r={2.4} fill={SVG_TAPER_MARKER} />
          <text x={r1(tailSample.compensatedX - 6)} y={r1(tailSample.compensatedY - 10)} textAnchor="end" fontSize={8.5} fontWeight={700} fill={SVG_TAPER_MARKER}>
            {isEn ? "Release Taper" : "삐침 보호"}
          </text>
        </g>
      ) : null}

      <text x={14} y={16} fontSize={10} fontWeight={700} fill="currentColor">
        {isEn ? "Jitter vs EMA vs One-Euro + Micro-MLP" : "원시 지터 vs 단순 EMA vs 하이브리드 예측 보정"}
      </text>
      <text x={342} y={16} textAnchor="end" fontSize={8.5} fontWeight={600} fill={SVG_INK_MUTED}>
        {`Mean Lead +${hybridResult.meanLookAheadMs}ms`}
      </text>
      <g fontSize={8.5} fill="currentColor" fillOpacity={0.85}>
        <line x1={18} y1={230} x2={34} y2={230} stroke={SVG_RAW_JITTER} strokeWidth={1.5} />
        <text x={38} y={233}>{isEn ? "Raw Jitter" : "원시 지터"}</text>
        <line x1={110} y1={230} x2={126} y2={230} stroke={SVG_EMA_LINE} strokeWidth={1.8} strokeDasharray="4 2" />
        <text x={130} y={233}>{isEn ? "Simple EMA" : "단순 EMA"}</text>
        <line x1={206} y1={230} x2={224} y2={230} stroke={SVG_HYBRID_LINE} strokeWidth={2.5} />
        <text x={228} y={233}>{isEn ? "ToonStudio Hybrid" : "ToonStudio 하이브리드"}</text>
        <text x={18} y={248} fontSize={8} fill="currentColor" fillOpacity={0.68}>
          {isEn ? "Deterministic 75-param CPU Micro-MLP (no fabricated external weights)" : "결정론적 75-파라미터 CPU Micro-MLP 실측 연산 · 코너(>55°) 및 삐침 자동 보호"}
        </text>
      </g>
    </svg>
  );
}

export function StudioStylusNeuralCompensationPanel(
  props: StudioStylusNeuralCompensationPanelProps,
): ReactElement {
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const [config, setConfig] = useState<StylusCompensationConfig>(() =>
    createDefaultStylusCompensationConfig(
      props.initialDigitizerId ?? "wacom-pro-pen-3",
      props.initialCurvePresetId ?? "gpen-crisp",
    ),
  );
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const activeDigitizer = useMemo(() => getDigitizerProfile(config.digitizerId), [config.digitizerId]);
  const activePreset = useMemo(() => getPressureCurvePreset(config.curvePresetId), [config.curvePresetId]);
  const curveAudit = useMemo(() => auditPchipPressureCurve(config, 65), [config]);
  const benchmark = useMemo(() => benchmarkStrokeCompensation(config), [config]);
  const exportBundle = useMemo(() => exportStylusCompensationJson(config), [config]);

  const emitProfileChange = (nextConfig: StylusCompensationConfig): void => {
    setConfig(nextConfig);
    setCopiedNotice(false);
    if (props.onProfileChange) {
      props.onProfileChange({
        config: nextConfig,
        curveAudit: auditPchipPressureCurve(nextConfig, 65),
        benchmark: benchmarkStrokeCompensation(nextConfig),
      });
    }
  };

  const handleSelectDigitizer = (digitizerId: DigitizerProfileId): void => {
    const profile = getDigitizerProfile(digitizerId);
    const preset = getPressureCurvePreset(config.curvePresetId);
    emitProfileChange({
      ...config,
      digitizerId: profile.id,
      iafThreshold: profile.defaultIafThreshold,
      hysteresisAmount: profile.defaultHysteresis,
      tiltAttenuationStrength: profile.supportsTilt ? preset.recommendedTiltAttenuation : 0,
      previewTiltDeg: profile.supportsTilt ? Math.min(config.previewTiltDeg || 28, profile.maxTiltDeg) : 0,
      minCutoffHz: profile.reportRateHz >= 200 ? 2.2 : 1.6,
      speedBeta: profile.reportRateHz >= 200 ? 0.01 : 0.008,
      dCutoffHz: profile.reportRateHz >= 200 ? 15 : 10,
    });
  };

  const handleSelectPreset = (curvePresetId: PressureCurvePresetId): void => {
    const preset = getPressureCurvePreset(curvePresetId);
    emitProfileChange({
      ...config,
      curvePresetId: preset.id,
      tiltAttenuationStrength: activeDigitizer.supportsTilt ? preset.recommendedTiltAttenuation : 0,
    });
  };

  const handleUpdateField = <K extends keyof StylusCompensationConfig>(key: K, value: StylusCompensationConfig[K]): void => {
    emitProfileChange({ ...config, [key]: value });
  };

  const handleReset = (): void => {
    emitProfileChange(
      createDefaultStylusCompensationConfig(
        props.initialDigitizerId ?? "wacom-pro-pen-3",
        props.initialCurvePresetId ?? "gpen-crisp",
      ),
    );
  };

  const handleExportJson = (): void => {
    props.onExportJson?.(exportBundle.json, exportBundle.manifest);
    setShowJsonPreview(true);
    setCopiedNotice(true);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(exportBundle.json).catch(() => undefined);
    }
  };

  const accentCss = formatOklch(activeDigitizer.accentOklch);

  return (
    <section
      data-testid="studio-stylus-neural-compensation-panel"
      aria-label={pick("16,384단계 스타일러스 압력 곡선 및 신경망 궤적 예측·보정 엔진", "16,384-Step Stylus Pressure Curve & Neural Trajectory Compensation Engine")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${props.className ?? ""}`.trim()}
    >
      {/* 헤더 및 주요 동작 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <PenTool className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("Wave 55C · 16,384단계 PCHIP & One-Euro·Micro-MLP", "Wave 55C · 16,384-Step PCHIP & One-Euro·Micro-MLP")}
            </span>
            <span data-testid="inference-kind-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-[10px] text-fg-2">
              <Cpu className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
              {MICRO_MLP_INFERENCE_KIND}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("16,384단계 초정밀 스타일러스 압력 곡선 & 궤적 예측·보정 스튜디오", "16,384-Step Stylus Pressure Curve & Trajectory Compensation Studio")}
          </h2>
          <p className="max-w-3xl text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "디지타이저별 IAF·히스테리시스·기울기 물리 특성을 14-bit 단조 PCHIP 곡선으로 정밀 교정하고, One-Euro α-β 필터와 75-파라미터 결정론적 Micro-MLP로 손떨림은 줄이면서 급꺾임 코너와 펜 떼기 삐침을 또렷하게 살립니다.",
              "Calibrates digitizer IAF, hysteresis, and tilt attenuation with a 14-bit monotone PCHIP curve while pairing One-Euro α-β filtering and a deterministic 75-param CPU Micro-MLP to cut jitter without rounding corners or release tapers.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="reset-stylus-config-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("기본값 복원", "Reset Defaults")}
          </button>
          <button type="button" data-testid="export-stylus-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
            {copiedNotice ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {copiedNotice ? pick("프로파일 JSON 복사됨", "Profile JSON Copied") : pick("JSON 프로파일 내보내기", "Export Profile JSON")}
          </button>
        </div>
      </div>

      {/* 1. 5종 디지타이저 물리 프로파일 선택 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5종 디지타이저 물리 프로파일", "5 Digitizer Hardware Profiles")}
          </h3>
          <span data-testid="active-digitizer-readout" className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`${activeDigitizer.pressureLevels.toLocaleString("en-US")} lvl · ${activeDigitizer.reportRateHz}Hz · IAF ${activeDigitizer.iafGrams}g`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-5">
          {DIGITIZER_HARDWARE_PROFILES.map((profile) => {
            const isSelected = profile.id === activeDigitizer.id;
            return (
              <button
                key={profile.id} type="button" data-testid={`digitizer-btn-${profile.id}`} aria-pressed={isSelected}
                onClick={() => handleSelectDigitizer(profile.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  isSelected ? "border-accent bg-accent-soft text-fg" : "border-line bg-raised text-fg hover:border-line-strong"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: formatOklch(profile.accentOklch) }} aria-hidden="true" />
                  {isEn ? profile.nameEn : profile.nameKo}
                </span>
                <div className="flex flex-wrap gap-1 font-mono text-[10px] text-fg-2 tabular-nums">
                  <span className="rounded border border-line bg-card px-1.5 py-0.5">{`${profile.pressureLevels.toLocaleString("en-US")}`}</span>
                  <span className="rounded border border-line bg-card px-1.5 py-0.5">{`${profile.reportRateHz}Hz`}</span>
                  {profile.supportsBarrelRoll ? <span className="rounded border border-line bg-card px-1.5 py-0.5">Roll</span> : null}
                  {profile.supportsSqueeze ? <span className="rounded border border-line bg-card px-1.5 py-0.5">Squeeze</span> : null}
                  {profile.supportsTilt ? <span className="rounded border border-line bg-card px-1.5 py-0.5">Tilt</span> : null}
                </div>
                <p className="text-[11px] leading-snug text-fg-3">{isEn ? profile.summaryEn : profile.summaryKo}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 5종 압력 곡선 프리셋 & 미세 보정 슬라이더 */}
      <div className="space-y-4 rounded-xl border border-line bg-raised p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("5종 작가 압력 곡선 프리셋 (5-Point PCHIP)", "5 Artist Pressure Curve Presets (5-Point PCHIP)")}
            </h3>
            <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? activePreset.descriptionEn : activePreset.descriptionKo}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESSURE_CURVE_PRESETS.map((preset) => {
              const isSelected = preset.id === activePreset.id;
              return (
                <button key={preset.id} type="button" data-testid={`curve-preset-btn-${preset.id}`} aria-pressed={isSelected} onClick={() => handleSelectPreset(preset.id)} className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}>
                  {isEn ? preset.nameEn : preset.nameKo}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ControlSlider id={`${uid}-iaf`} testId="slider-iaf" label={pick("IAF 초기 활성화 데드존", "IAF Activation Deadzone")} readout={`${(config.iafThreshold * 100).toFixed(1)}%`} hint={pick("펜촉이 닿기 직전 미세 오입력을 걸러내는 하한 문턱값", "Filters micro touch jitter below initial activation force")} min={0} max={0.12} step={0.005} value={config.iafThreshold} onChange={(v) => handleUpdateField("iafThreshold", v)} />
          <ControlSlider id={`${uid}-hysteresis`} testId="slider-hysteresis" label={pick("가압 · 감압 히스테리시스", "Press / Release Hysteresis")} readout={`${(config.hysteresisAmount * 100).toFixed(1)}%`} hint={pick("누를 때와 뗄 때 펜촉 탄성 지연 차이를 대칭 포락선으로 보정", "Compensates nib spring lag between pressing and releasing")} min={0} max={0.1} step={0.004} value={config.hysteresisAmount} onChange={(v) => handleUpdateField("hysteresisAmount", v)} />
          <ControlSlider id={`${uid}-jitter`} testId="slider-jitter" label={pick("합성 손떨림 · 지터 강도", "Synthetic Jitter Strength")} readout={`${config.jitterStrength.toFixed(1)}×`} hint={pick("동일 테스트 스트로크에 주입하는 손떨림 진폭 배율", "Hand-tremor jitter amplitude injected into benchmark stroke")} min={0.2} max={2.5} step={0.1} value={config.jitterStrength} onChange={(v) => handleUpdateField("jitterStrength", v)} />
          <ControlSlider id={`${uid}-lookahead`} testId="slider-lookahead" label={pick("선행 예측 보정 (Look-Ahead)", "Kinematic Look-Ahead")} readout={`${config.lookAheadMs.toFixed(1)} ms`} hint={pick("고속 선회 구간의 위상 지연을 0~16ms 범위에서 선행 상쇄", "Offsets fast-stroke phase lag from 0 to 16ms safely")} min={0} max={MAX_LOOK_AHEAD_MS} step={0.5} value={config.lookAheadMs} onChange={(v) => handleUpdateField("lookAheadMs", v)} />
          <ControlSlider id={`${uid}-corner`} testId="slider-corner-protection" label={pick("급꺾임(>55°) · 삐침 보호", "Cusp (>55°) & Taper Guard")} readout={`${Math.round(config.cornerProtection * 100)}%`} hint={pick("예리한 꺾임에서 평활화·오버슈트를 즉시 감쇠해 각도를 유지", "Damps smoothing and overshoot immediately on sharp cusps")} min={0} max={1} step={0.05} value={config.cornerProtection} onChange={(v) => handleUpdateField("cornerProtection", v)} />
          <ControlSlider id={`${uid}-tilt`} testId="slider-tilt-deg" label={pick("기울기 감쇠 시험 각도 (cos θ)", "Tilt Attenuation Preview (cos θ)")} readout={activeDigitizer.supportsTilt ? `${config.previewTiltDeg}° (×${curveAudit.tiltFactorAtPreviewDeg.toFixed(2)})` : pick("미지원", "N/A")} hint={pick("펜을 눕힐 때 수직 하중 cos(tilt) 감쇠가 곡선에 반영되는 폭", "Previews cos(tilt) normal-force attenuation on the 14-bit curve")} min={0} max={activeDigitizer.supportsTilt ? activeDigitizer.maxTiltDeg : 0} step={1} value={config.previewTiltDeg} disabled={!activeDigitizer.supportsTilt} onChange={(v) => handleUpdateField("previewTiltDeg", v)} />
        </div>
      </div>

      {/* 3. 순수 시맨틱 SVG 2단 프리뷰 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("2단 실시간 프리뷰: 16,384단계 PCHIP 곡선 · 하이브리드 궤적 예측 보정 (순수 OKLCH SVG)", "Dual Real-Time Preview: 16,384-Step PCHIP Curve & Hybrid Trajectory Compensation (Pure OKLCH SVG)")}
          </h3>
          <span
            data-testid="monotonic-status-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
              curveAudit.isStrictlyMonotonic ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"
            }`}
          >
            <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
            {curveAudit.isStrictlyMonotonic ? pick("16,384단계 엄격 단조 검증됨", "16,384-Step Monotone Verified") : pick("단조성 재점검 필요", "Monotonicity Check")}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PressureCurveSvg audit={curveAudit} config={config} accentCss={accentCss} supportsTilt={activeDigitizer.supportsTilt} isEn={isEn} />
          <TrajectoryCompensationSvg benchmark={benchmark} isEn={isEn} />
        </div>
      </div>

      {/* 4. 정량 비교 벤치마크 표 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Target className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("동일 합성 지터 스트로크 정량 비교 벤치마크", "Quantitative Benchmark on Identical Synthetic Jitter Stroke")}
          </h3>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
            <span data-testid="rmse-reduction-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 font-bold text-good">
              <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
              {pick(`EMA 대비 RMSE ${benchmark.rmseReductionVsEmaPct}% 개선`, `${benchmark.rmseReductionVsEmaPct}% Lower RMSE vs EMA`)}
            </span>
            <span data-testid="corner-gain-badge" className="rounded-full border border-line bg-card px-2.5 py-0.5 text-fg-2">
              {pick(`코너 보존 +${benchmark.cornerGainVsEmaPct}%p`, `Corner +${benchmark.cornerGainVsEmaPct}pp`)}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="benchmark-comparison-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th className="py-2 pr-3 font-semibold [word-break:keep-all]">{pick("보정 방식", "Method")}</th>
                <th className="px-3 py-2 text-right font-semibold tabular-nums">RMSE (px)</th>
                <th className="px-3 py-2 text-right font-semibold tabular-nums">{pick("코너 보존률 (%)", "Corner (%)")}</th>
                <th className="px-3 py-2 text-right font-semibold tabular-nums">{pick("유효 지연 보정 (ms)", "Latency Comp (ms)")}</th>
                <th className="py-2 pl-3 text-right font-semibold tabular-nums">{pick("삐침 선명도", "Taper Score")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {benchmark.metrics.map((row) => {
                const isHybrid = row.methodId === "toonstudio-hybrid";
                return (
                  <tr key={row.methodId} data-testid={`benchmark-row-${row.methodId}`} className={isHybrid ? "bg-accent-soft font-semibold text-fg" : "text-fg-2"}>
                    <td className="py-2.5 pr-3 [word-break:keep-all]">{isEn ? row.labelEn : row.labelKo}</td>
                    <td data-testid={`metric-rmse-${row.methodId}`} className="px-3 py-2.5 text-right font-mono tabular-nums">{row.rmsePx.toFixed(2)}</td>
                    <td data-testid={`metric-corner-${row.methodId}`} className="px-3 py-2.5 text-right font-mono tabular-nums">{`${row.cornerPreservationPct.toFixed(1)}%`}</td>
                    <td data-testid={`metric-latency-${row.methodId}`} className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {`${row.effectiveLatencyCompMs >= 0 ? "+" : ""}${row.effectiveLatencyCompMs.toFixed(2)} ms`}
                    </td>
                    <td data-testid={`metric-taper-${row.methodId}`} className="py-2.5 pl-3 text-right font-mono tabular-nums">{`${row.releaseTaperSharpness.toFixed(1)} / 100`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. JSON 프로파일 미리보기 및 정직성 고지 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("스타일러스 압력 · 보정 프로파일 JSON", "Stylus Pressure & Compensation Profile JSON")}</span>
          <button type="button" data-testid="toggle-json-preview-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}
          </button>
        </div>
        <p data-testid="stylus-honesty-note" className="text-[11px] text-fg-3 [word-break:keep-all]">
          {isEn ? exportBundle.manifest.honestyNoteEn : exportBundle.manifest.honestyNoteKo}
        </p>
        {showJsonPreview ? (
          <pre data-testid="stylus-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {exportBundle.json}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
