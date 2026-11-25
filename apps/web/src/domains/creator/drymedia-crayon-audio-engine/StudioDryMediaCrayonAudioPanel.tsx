/**
 * Wave 53A — 크레용·연필·목탄·갈필 극한 시각·청각(Foley) 라이브 질감 랩 패널.
 *
 * - 6종 건식·갈필 매체 프리셋 + 4종 이중 스케일 종이 결 + 필압·기울기(15°~90°)·속도·겹칠(1~4패스) 제어
 * - 순수 시맨틱 SVG 3단 비교 프리뷰(① 평면 알파 브러시 vs ② 이중 스케일 산/골·크럼블 확대 단면 vs ③ 청각 Foley 스펙트럼·파형)
 * - Web Audio 절차적 Foley 음량·음소거·안전 시연 + -24 LUFS 피로 방지 리미터 + 120Hz(< 0.35ms) GPU 비용 모델 고지
 * - 비파괴 적용·원복 및 WGSL/Foley 레시피 JSON 복사
 */

import {
  Brush, Check, CheckCircle2, Code2, Copy, Cpu, Gauge,
  Layers, Play, ShieldCheck, SlidersHorizontal, Undo2, Volume2, VolumeX, Waves,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  DRYMEDIA_BRUSH_PRESETS, DRYMEDIA_PAPER_SUBSTRATES,
  EXTRA_GPU_BUDGET_MS, FOLEY_LIMITER_CEILING_LUFS, FRAME_BUDGET_120HZ_MS,
  MAX_OVERLAP_PASSES, MIN_OVERLAP_PASSES, TILT_BROADSIDE_THRESHOLD_DEG, TILT_MAX_DEG, TILT_MIN_DEG,
  applyDryMediaLabPreview, bakeDualScalePaperGrainLut, createDryMediaLabSession,
  exportDryMediaRecipeJson, formatOklch, getActiveDryMediaConfig,
  getDryMediaBrushPreset, getDryMediaPaperSubstrate, playDryMediaFoleyPreview,
  previewDryMediaConfigPatch, revertDryMediaLabSession, selectDryMediaBrushPreset,
  simulateDryMediaStrokeMicrostructure, synthesizeDryMediaFoleyFrame,
  type DryMediaBrushId, type DryMediaBrushPreset, type DryMediaFoleyFrame,
  type DryMediaLabConfig, type DryMediaLabSession, type DryMediaMicrostructureResult,
  type DryMediaPaperId, type DryMediaPaperSubstrate,
} from "./drymedia-crayon-audio-engine";

export interface StudioDryMediaCrayonAudioPanelProps {
  readonly initialBrushId?: DryMediaBrushId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (config: DryMediaLabConfig, microstructure: DryMediaMicrostructureResult, foley: DryMediaFoleyFrame, session: DryMediaLabSession) => void;
  readonly onExportJson?: (json: string, session: DryMediaLabSession) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_NEUTRAL_PAPER = formatOklch({ l: 0.962, c: 0.005, h: 92 });
const SVG_THRESHOLD_ACCENT = formatOklch({ l: 0.56, c: 0.145, h: 34 });
const SVG_AUDIO_WAX = formatOklch({ l: 0.58, c: 0.16, h: 42 });
const SVG_AUDIO_GRAPHITE = formatOklch({ l: 0.52, c: 0.135, h: 224 });
const SVG_AUDIO_SUMI = formatOklch({ l: 0.53, c: 0.135, h: 168 });
const SVG_AUDIO_CHARCOAL = formatOklch({ l: 0.5, c: 0.11, h: 72 });
const SVG_LIMITER_LINE = formatOklch({ l: 0.58, c: 0.15, h: 152 });

function roundCoord(v: number): number { return Math.round(v * 10) / 10; }
function acousticAccentColor(family: DryMediaFoleyFrame["acousticFamily"]): string {
  return family === "wax-drag" ? SVG_AUDIO_WAX : family === "graphite-scratch" ? SVG_AUDIO_GRAPHITE : family === "sumi-whisper" ? SVG_AUDIO_SUMI : SVG_AUDIO_CHARCOAL;
}

function LabSliderRow(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly hint: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly disabled?: boolean; readonly onChange: (nextValue: number) => void;
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

function ThreeStageComparisonSvg(props: {
  readonly brush: DryMediaBrushPreset; readonly paper: DryMediaPaperSubstrate;
  readonly microstructure: DryMediaMicrostructureResult; readonly foley: DryMediaFoleyFrame; readonly isEn: boolean;
}): ReactElement {
  const { brush, paper, microstructure, foley, isEn } = props;
  const uid = useId();
  const stage2ClipId = `${uid}-stage2-clip`;

  const pigmentCss = formatOklch(brush.pigmentOklch, microstructure.burnishAndCrumb.glazeOpacity);
  const flatPigmentCss = formatOklch(brush.pigmentOklch, 0.84);
  const bloomCss = formatOklch({ l: Math.min(0.95, brush.pigmentOklch.l + 0.24), c: brush.pigmentOklch.c * 0.45, h: brush.pigmentOklch.h }, microstructure.burnishAndCrumb.waxBloomRatio * 0.55);
  const paperSurfaceCss = formatOklch(paper.surfaceOklch);
  const paperValleyCss = formatOklch(paper.valleyOklch);
  const audioAccentCss = acousticAccentColor(foley.acousticFamily);
  const strokeWidthVisual = roundCoord(Math.min(44, 14 * microstructure.tiltShading.contactWidthMultiplier));

  const paperFiberLines = useMemo(() => {
    if (paper.id === "hanji-mulberry") {
      return Array.from({ length: 10 }, (_, i) => ({ x1: 322 + (i % 3) * 14, y1: 44 + i * 12, x2: 636 - (i % 2) * 16, y2: 44 + i * 12 + (i % 2 === 0 ? 3 : -2) }));
    }
    const count = paper.id === "kent-smooth" ? 14 : 10;
    const len = paper.id === "rough-cold-press" ? 14 : paper.id === "croquis-tooth" ? 9 : 4;
    return Array.from({ length: count }, (_, i) => {
      const x = 328 + i * Math.round(296 / count);
      const y = 48 + ((i * 29) % 102);
      return { x1: x, y1: y, x2: x + len, y2: y + 3 };
    });
  }, [paper.id]);

  const valleySpeckles = useMemo(() => {
    const count = Math.round(microstructure.dualScaleTooth.sparkleValleyExposure * 34);
    const halfBand = Math.max(6, strokeWidthVisual * 0.46);
    return Array.from({ length: count }, (_, i) => {
      const t = (i + 0.5) / Math.max(1, count);
      return {
        cx: roundCoord(346 + t * 268),
        cy: roundCoord(104 - Math.sin(t * Math.PI * 1.4) * 16 + (((i * 17 + 5) % 11) / 5 - 1) * halfBand),
        r: roundCoord(1.3 + ((i * 7) % 4) * 0.55 * (1 - microstructure.burnishAndCrumb.valleyFillRatio * 0.45)),
      };
    });
  }, [microstructure.dualScaleTooth.sparkleValleyExposure, microstructure.burnishAndCrumb.valleyFillRatio, strokeWidthVisual]);

  const crossBaseY = 274;
  const crossTopY = 204;
  const crossSpan = 48;
  const terrainPolygon = useMemo(() => {
    const pts = microstructure.dualScaleTooth.crossSection.map((pt) => `${roundCoord(326 + pt.u * 308)},${roundCoord(crossTopY + (1 - pt.combinedHeight) * crossSpan)}`);
    return `326,${crossBaseY} ${pts.join(" ")} 634,${crossBaseY}`;
  }, [microstructure.dualScaleTooth.crossSection]);

  const waxCapPolygon = useMemo(() => {
    const upper: string[] = [];
    const lower: string[] = [];
    for (const pt of microstructure.dualScaleTooth.crossSection) {
      const px = roundCoord(326 + pt.u * 308);
      const baseY = crossTopY + (1 - pt.combinedHeight) * crossSpan;
      const capY = crossTopY + (1 - pt.pigmentHeight) * crossSpan;
      upper.push(`${px},${roundCoord(pt.valleyExposed ? baseY : capY - 2.5)}`);
      lower.unshift(`${px},${roundCoord(baseY + (pt.valleyExposed ? 0 : 0.8))}`);
    }
    return `${upper.join(" ")} ${lower.join(" ")}`;
  }, [microstructure.dualScaleTooth.crossSection]);

  const thresholdY = roundCoord(crossTopY + (1 - microstructure.dualScaleTooth.toothThreshold) * crossSpan);
  const wavePolyline = useMemo(
    () => foley.waveformSamples.map((s, idx) => `${roundCoord(678 + (idx / Math.max(1, foley.waveformSamples.length - 1)) * 256)},${roundCoord(232 - s * 28)}`).join(" "),
    [foley.waveformSamples],
  );
  const sumiStrands = microstructure.tiltShading.sumiBristle;
  const lufsLabel = foley.muted ? (isEn ? "MUTED" : "음소거") : `${foley.safetyLimiter.estimatedOutputLufs} LUFS`;

  return (
    <svg
      data-testid="drymedia-three-stage-svg" data-brush-id={brush.id} data-paper-id={paper.id}
      data-width-mult={microstructure.tiltShading.contactWidthMultiplier.toFixed(2)}
      data-valley-fill={microstructure.burnishAndCrumb.valleyFillRatio.toFixed(3)}
      data-sparkle-valley={microstructure.dualScaleTooth.sparkleValleyExposure.toFixed(3)}
      data-crumb-count={microstructure.burnishAndCrumb.crumbCount} data-sumi-strands={sumiStrands.strandCount}
      data-tooth-hz={foley.toothCrossingHz} data-resonance-hz={foley.primaryResonanceHz}
      data-foley-muted={String(foley.muted)} data-violet-free="true"
      viewBox="0 0 960 300" role="img"
      aria-label={isEn
        ? `Three-stage comparison for ${brush.nameEn} on ${paper.nameEn}: flat alpha baseline, dual-scale paper tooth with wax crumbs, and live acoustic Foley spectrum`
        : `${brush.nameKo} · ${paper.nameKo} 3단 비교 프리뷰: 평면 알파 브러시, 이중 스케일 종이 산/골 및 왁스 크럼블 단면, 실시간 청각 Foley 주파수 스펙트럼`}
      className="h-auto w-full rounded-xl border border-line bg-canvas text-fg"
    >
      <defs><clipPath id={stage2ClipId}><rect x="318" y="34" width="324" height="136" rx="8" /></clipPath></defs>

      {/* ① 좌측: 기존 평면 알파 브러시 */}
      <g>
        <rect x="12" y="12" width="286" height="276" rx="10" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.14} />
        <text x="24" y="28" fill="currentColor" fillOpacity={0.8} fontSize="10" fontWeight="700">{isEn ? "1. FLAT ALPHA BRUSH" : "① 기존 평면 알파 브러시"}</text>
        <rect x="22" y="34" width="266" height="136" rx="8" fill={SVG_NEUTRAL_PAPER} stroke="currentColor" strokeOpacity={0.14} />
        <path d="M 44 120 Q 154 78 264 114" fill="none" stroke={flatPigmentCss} strokeWidth="22" strokeLinecap="round" />
        <text x="28" y="160" fill="currentColor" fillOpacity={0.62} fontSize="8.5" fontFamily="monospace">{isEn ? "Uniform alpha · No tooth break · 0 crumbs" : "균일 알파 · 종이 골짜기 없음 · 크럼블 0"}</text>
        <rect x="22" y="182" width="266" height="96" rx="8" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.12} />
        <text x="32" y="198" fill="currentColor" fillOpacity={0.72} fontSize="9" fontWeight="600">{isEn ? "Flat Cross-Section Profile" : "평면 브러시 단면(요철 미반영)"}</text>
        <rect x="36" y="230" width="238" height="14" rx="2" fill={flatPigmentCss} />
        <line x1="36" y1="246" x2="274" y2="246" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.5" />
        <text x="32" y="268" fill="currentColor" fillOpacity={0.68} fontSize="8.5" fontFamily="monospace">
          {isEn ? `Richness ${microstructure.flatAlphaBaselineScore}/100 · Flat digital feel` : `질감 지수 ${microstructure.flatAlphaBaselineScore}/100 · 평면 디지털 인상`}
        </text>
      </g>

      {/* ② 중앙: 이중 스케일 종이 산/골 + 왁스 크럼블 확대 단면 */}
      <g>
        <rect x="308" y="12" width="344" height="276" rx="10" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.2} />
        <text x="320" y="28" fill="currentColor" fillOpacity={0.86} fontSize="10" fontWeight="700">
          {isEn ? `2. DUAL-SCALE TOOTH & CRUMB (${microstructure.dryMediaRealismScore}/100)` : `② 이중 종이 산/골 · 크럼블 단면 (${microstructure.dryMediaRealismScore}/100)`}
        </text>
        <g clipPath={`url(#${stage2ClipId})`}>
          <rect x="318" y="34" width="324" height="136" rx="8" fill={paperSurfaceCss} stroke="currentColor" strokeOpacity={0.14} />
          {paperFiberLines.map((ln, idx) => (
            <line key={idx} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={paperValleyCss} strokeWidth="1.2" strokeOpacity={0.72} />
          ))}
          {sumiStrands.active ? (
            sumiStrands.strands.map((st) => {
              const dy = st.lateralOffsetNorm * (strokeWidthVisual * 0.56);
              const dashOn = roundCoord(Math.max(5, 30 * st.inkContinuity));
              const dashOff = roundCoord(Math.max(1, 18 * (1 - st.inkContinuity)));
              return (
                <path key={st.index} d={`M 340 ${roundCoord(114 + dy)} Q 480 ${roundCoord(78 + dy * 0.85)} 622 ${roundCoord(110 + dy)}`} fill="none" stroke={pigmentCss} strokeWidth={roundCoord(1.3 + st.widthWeight * 1.4)} strokeDasharray={sumiStrands.highSpeedSkipRatio > 0.22 ? `${dashOn} ${dashOff}` : undefined} strokeLinecap="round" />
              );
            })
          ) : (
            <>
              <path d="M 342 114 Q 480 80 620 110" fill="none" stroke={pigmentCss} strokeWidth={strokeWidthVisual} strokeLinecap="round" />
              {microstructure.burnishAndCrumb.waxBloomRatio > 0.08 ? <path d="M 352 111 Q 480 81 610 107" fill="none" stroke={bloomCss} strokeWidth={roundCoord(strokeWidthVisual * 0.42)} strokeLinecap="round" /> : null}
              {valleySpeckles.map((dot, idx) => <circle key={idx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={paperSurfaceCss} fillOpacity={0.95} />)}
            </>
          )}
          {microstructure.burnishAndCrumb.crumbParticles.map((c) => (
            <circle key={c.id} cx={roundCoord(342 + c.alongT * 278)} cy={roundCoord(112 - Math.sin(c.alongT * Math.PI * 1.15) * 18 + c.lateralOffsetNorm * (strokeWidthVisual * 0.56 + 5))} r={c.radiusPx} fill={pigmentCss} fillOpacity={c.opacity} />
          ))}
        </g>

        <rect x="318" y="182" width="324" height="96" rx="8" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.14} />
        <text x="328" y="197" fill="currentColor" fillOpacity={0.78} fontSize="8.5" fontWeight="600">
          {isEn ? `Cross-Section · Pass ${microstructure.overlapPasses} · Fill ${Math.round(microstructure.burnishAndCrumb.valleyFillRatio * 100)}%` : `산/골 확대 단면 · ${microstructure.overlapPasses}패스 · 골 메움 ${Math.round(microstructure.burnishAndCrumb.valleyFillRatio * 100)}%`}
        </text>
        <polygon points={terrainPolygon} fill={paperValleyCss} fillOpacity={0.86} />
        <polygon points={waxCapPolygon} fill={pigmentCss} fillOpacity={0.92} />
        <line x1="326" y1={thresholdY} x2="634" y2={thresholdY} stroke={SVG_THRESHOLD_ACCENT} strokeWidth="1.2" strokeDasharray="4 3" />
        <text x="328" y="272" fill="currentColor" fillOpacity={0.74} fontSize="8.2" fontFamily="monospace">
          {`W ×${microstructure.tiltShading.contactWidthMultiplier.toFixed(2)} · VALLEY ${Math.round(microstructure.dualScaleTooth.sparkleValleyExposure * 100)}% · CRUMB ${microstructure.burnishAndCrumb.crumbCount}`}
        </text>
      </g>

      {/* ③ 우측: 실시간 청각 Foley 주파수 스펙트럼 & 파형 */}
      <g>
        <rect x="662" y="12" width="286" height="276" rx="10" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.18} />
        <text x="674" y="28" fill="currentColor" fillOpacity={0.86} fontSize="10" fontWeight="700">{isEn ? "3. ACOUSTIC FOLEY SPECTRUM" : "③ 실시간 청각 Foley 스펙트럼·파형"}</text>
        <rect x="672" y="34" width="266" height="136" rx="8" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.14} />
        {foley.spectrumBands.map((band, idx) => {
          const x = 681 + idx * 15.6;
          const h = Math.max(3, roundCoord(band.magnitude * 96));
          return (
            <g key={band.hz}>
              <rect x={roundCoord(x)} y={roundCoord(148 - h)} width="11" height={h} rx="2" fill={audioAccentCss} fillOpacity={foley.muted ? 0.16 : 0.82} />
              {idx % 3 === 0 ? <text x={roundCoord(x + 5.5)} y="162" textAnchor="middle" fill="currentColor" fillOpacity={0.58} fontSize="7.2" fontFamily="monospace">{band.label}</text> : null}
            </g>
          );
        })}
        <text x="930" y="48" textAnchor="end" fill={audioAccentCss} fontSize="8.5" fontWeight="700" fontFamily="monospace">{`PEAK ${foley.primaryResonanceHz}Hz · Q ${foley.primaryQ}`}</text>

        <rect x="672" y="182" width="266" height="96" rx="8" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.14} />
        <line x1="678" y1="232" x2="934" y2="232" stroke="currentColor" strokeOpacity={0.18} strokeDasharray="3 3" />
        <line x1="678" y1="200" x2="934" y2="200" stroke={SVG_LIMITER_LINE} strokeOpacity={0.7} strokeDasharray="4 3" />
        <text x="930" y="196" textAnchor="end" fill={SVG_LIMITER_LINE} fontSize="7.5" fontFamily="monospace">{`${FOLEY_LIMITER_CEILING_LUFS} LUFS CEILING`}</text>
        <polyline points={wavePolyline} fill="none" stroke={audioAccentCss} strokeWidth="2.1" strokeLinejoin="round" strokeOpacity={foley.muted ? 0.35 : 0.95} />
        <text x="680" y="272" fill="currentColor" fillOpacity={0.75} fontSize="8.2" fontFamily="monospace">{`TOOTH ${foley.toothCrossingHz}Hz · ${lufsLabel}`}</text>
      </g>
    </svg>
  );
}

/** 크레용·연필·목탄·갈필 극한 시각·청각(Foley) 물리 엔진 & 라이브 질감 랩 패널. */
export function StudioDryMediaCrayonAudioPanel(props: StudioDryMediaCrayonAudioPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const [session, setSession] = useState<DryMediaLabSession>(() => createDryMediaLabSession(props.initialBrushId ? { brushId: props.initialBrushId } : undefined));
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string>("");

  const activeConfig = getActiveDryMediaConfig(session);
  const activeBrush = useMemo(() => getDryMediaBrushPreset(activeConfig.brushId), [activeConfig.brushId]);
  const activePaper = useMemo(() => getDryMediaPaperSubstrate(activeConfig.paperId), [activeConfig.paperId]);
  const paperLut = useMemo(() => bakeDualScalePaperGrainLut(activeConfig.paperId), [activeConfig.paperId]);
  const microstructure = useMemo(
    () => simulateDryMediaStrokeMicrostructure({
      brushId: activeConfig.brushId, paperId: activeConfig.paperId, pressure: activeConfig.pressure,
      tiltDeg: activeConfig.tiltDeg, speedPxPerSec: activeConfig.speedPxPerSec, overlapPasses: activeConfig.overlapPasses,
      grainIntensity: activeConfig.grainIntensity, crumbIntensity: activeConfig.crumbIntensity, lut: paperLut,
    }),
    [activeConfig, paperLut],
  );
  const foley = useMemo(
    () => synthesizeDryMediaFoleyFrame({
      brushId: activeConfig.brushId, paperId: activeConfig.paperId, pressure: activeConfig.pressure,
      tiltDeg: activeConfig.tiltDeg, speedPxPerSec: activeConfig.speedPxPerSec, overlapPasses: activeConfig.overlapPasses,
      volume: activeConfig.foleyVolume, muted: activeConfig.foleyMuted,
    }),
    [activeConfig],
  );
  const recipeJson = useMemo(() => exportDryMediaRecipeJson(session, microstructure, foley), [session, microstructure, foley]);

  const handleSelectBrush = (brushId: DryMediaBrushId): void => {
    const next = getDryMediaBrushPreset(brushId);
    setSession((prev) => selectDryMediaBrushPreset(prev, brushId));
    setStatusNote(pick(`${next.nameKo} 프리셋을 미리봅니다. 적용 버튼으로 확정하세요.`, `Previewing ${next.nameEn}. Click Apply to commit.`));
  };
  const handleSelectPaper = (paperId: DryMediaPaperId): void => {
    const next = getDryMediaPaperSubstrate(paperId);
    setSession((prev) => previewDryMediaConfigPatch(prev, { paperId }));
    setStatusNote(pick(`${next.nameKo}(피치 ${next.paperToothPitchPx}px) 종이 결을 반영했습니다.`, `Loaded ${next.nameEn} (${next.paperToothPitchPx}px tooth pitch).`));
  };
  const handleApply = (): void => {
    const next = applyDryMediaLabPreview(session);
    setSession(next);
    setStatusNote(pick(`${activeBrush.nameKo} · ${activePaper.nameKo} 시각·청각 레시피를 적용했습니다.`, `Applied ${activeBrush.nameEn} on ${activePaper.nameEn}.`));
    props.onApply?.(next.committed, microstructure, foley, next);
  };
  const handleRevert = (): void => {
    const next = revertDryMediaLabSession(session);
    setSession(next);
    const restored = getDryMediaBrushPreset(next.committed.brushId);
    setStatusNote(pick(`이전 확정 상태(${restored.nameKo})로 되돌렸습니다.`, `Reverted to ${restored.nameEn}.`));
  };
  const handleToggleMute = (): void => {
    const nextMuted = !activeConfig.foleyMuted;
    setSession((prev) => previewDryMediaConfigPatch(prev, { foleyMuted: nextMuted }));
    setStatusNote(nextMuted ? pick("청각 Foley 출력을 음소거했습니다.", "Muted acoustic Foley output.") : pick("청각 Foley 출력을 다시 켰습니다(-24 LUFS 리미터 보호).", "Unmuted acoustic Foley (-24 LUFS limiter active)."));
  };
  const handleAuditionFoley = (): void => {
    const res = playDryMediaFoleyPreview(foley);
    setStatusNote(
      res.played ? pick(`${activeBrush.nameKo} 절차적 Foley 시연음을 재생했습니다(${foley.primaryResonanceHz}Hz, ${foley.safetyLimiter.estimatedOutputLufs} LUFS).`, `Played ${activeBrush.nameEn} Foley burst (${foley.primaryResonanceHz}Hz, ${foley.safetyLimiter.estimatedOutputLufs} LUFS).`)
        : res.reason === "muted" ? pick("음소거 상태입니다. 음소거를 해제한 뒤 시연하세요.", "Foley is muted. Unmute before auditioning.")
          : pick(`헤드리스 환경이므로 오디오 그래프 파라미터(${foley.primaryResonanceHz}Hz · ${foley.safetyLimiter.estimatedOutputLufs} LUFS)만 검증했습니다.`, `Headless environment: verified Web Audio graph (${foley.primaryResonanceHz}Hz · ${foley.safetyLimiter.estimatedOutputLufs} LUFS).`),
    );
  };
  const handleCopyJson = (): void => {
    setShowJson(true);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) void navigator.clipboard.writeText(recipeJson).catch(() => undefined);
    setStatusNote(pick("WGSL 셰이더 + Web Audio Foley 레시피 JSON을 준비했습니다.", "Copied WGSL shader & Web Audio Foley recipe JSON."));
    props.onExportJson?.(recipeJson, session);
  };

  const statusBadgeText =
    session.status === "previewing" ? pick("미리보기 중", "Previewing")
      : session.status === "applied" ? pick(`적용됨 #${session.appliedCount}`, `Applied #${session.appliedCount}`)
        : session.status === "reverted" ? pick("원복됨", "Reverted") : pick("기본 상태", "Clean");
  const gpuFillPct = Math.min(100, Math.round((microstructure.gpuBudget120Hz.additionalGpuCostMs / EXTRA_GPU_BUDGET_MS) * 100));
  const lufsMeterPct = foley.muted ? 0 : Math.min(100, Math.max(8, Math.round(((foley.safetyLimiter.estimatedOutputLufs + 60) / 36) * 100)));

  return (
    <section data-testid="drymedia-crayon-audio-panel" className={`space-y-4 rounded-2xl border border-line bg-card p-4 text-fg sm:p-5 ${props.className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-fg [word-break:keep-all]">
              <Brush className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {pick("크레용·연필·갈필 극한 질감 & 청각 Foley 랩", "Dry-Media Crayon, Pencil & Acoustic Foley Lab")}
            </h2>
            <span data-testid="drymedia-session-status-badge" className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">
              {statusBadgeText}
            </span>
          </div>
          <p className="text-xs text-fg-3 [word-break:keep-all]">
            {pick("이중 스케일 종이 산/골, 기울기 2.8배 광폭 셰이딩, 왁스 버니싱·크럼블과 매체별 Web Audio Foley를 120Hz 예산 안에서 즉시 대조합니다.", "Compare dual-scale paper tooth, 2.8× broadside tilt shading, wax burnishing/crumbs, and media-matched Web Audio Foley within the 120Hz frame budget.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="drymedia-apply-btn" disabled={!session.canApply} onClick={handleApply} className={BTN_SOLID}>
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("레시피 적용", "Apply Recipe")}
          </button>
          <button type="button" data-testid="drymedia-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("원복", "Revert")}
          </button>
          <button type="button" data-testid="drymedia-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("JSON 복사", "Copy JSON")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="drymedia-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusNote || pick(`${activeBrush.nameKo} · ${activePaper.nameKo} 조합을 미리보는 중입니다. 필압·기울기·겹칠 패스를 조절해 질감과 소리를 확인하세요.`, `Previewing ${activeBrush.nameEn} on ${activePaper.nameEn}. Adjust pressure, tilt, speed, and passes to inspect tactile grain and Foley.`)}
      </div>

      {/* 6종 건식·갈필 매체 프리셋 + 4종 종이 결 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Brush className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("6종 건식·갈필 매체 프리셋", "6 Dry-Media & Sumi Presets")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${isEn ? activeBrush.pigmentNameEn : activeBrush.pigmentNameKo} · ${activeBrush.baseWidthPx}px`}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DRYMEDIA_BRUSH_PRESETS.map((preset) => {
              const selected = preset.id === activeConfig.brushId;
              return (
                <button key={preset.id} type="button" data-testid={`drymedia-brush-preset-${preset.id}`} aria-pressed={selected} onClick={() => handleSelectBrush(preset.id)} className={`${selected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start gap-0.5 py-2 text-left`}>
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(preset.pigmentOklch) }} />
                    <span>{isEn ? preset.nameEn : preset.nameKo}</span>
                  </span>
                  <span className="text-[10px] font-normal text-fg-3">{isEn ? preset.tagEn : preset.tagKo}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? activeBrush.summaryEn : activeBrush.summaryKo}</p>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("4종 이중 스케일 종이 결 (256×256 LUT)", "4 Dual-Scale Papers (256×256 LUT)")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${Math.round(paperLut.gpuTileRg8Bytes / 1024)}KiB RG8`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DRYMEDIA_PAPER_SUBSTRATES.map((paper) => {
              const selected = paper.id === activeConfig.paperId;
              return (
                <button key={paper.id} type="button" data-testid={`drymedia-paper-preset-${paper.id}`} aria-pressed={selected} onClick={() => handleSelectPaper(paper.id)} className={`${selected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start gap-0.5 py-2 text-left`}>
                  <span className="text-xs font-semibold">{isEn ? paper.nameEn : paper.nameKo}</span>
                  <span className="text-[10px] font-normal text-fg-3">{isEn ? paper.grainTagEn : paper.grainTagKo}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? activePaper.descriptionEn : activePaper.descriptionKo}</p>
        </div>
      </div>

      {/* 3단 실시간 시맨틱 SVG 비교 프리뷰 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("3단 라이브 비교: 평면 알파 vs 이중 종이 산/골·크럼블 vs 청각 Foley 스펙트럼", "3-Stage Live View: Flat Alpha vs Dual-Scale Tooth/Crumbs vs Acoustic Foley")}
          </h3>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-2 tabular-nums">
            <span data-testid="drymedia-width-mult-readout">{`${pick("접촉 폭", "Width")} ×${microstructure.tiltShading.contactWidthMultiplier.toFixed(2)}`}</span>
            <span>·</span>
            <span data-testid="drymedia-valley-fill-readout">{`${pick("골 메움", "Fill")} ${Math.round(microstructure.burnishAndCrumb.valleyFillRatio * 100)}%`}</span>
            <span>·</span>
            <span data-testid="drymedia-tooth-hz-readout">{`${pick("결 통과", "Tooth")} ${foley.toothCrossingHz}Hz`}</span>
          </div>
        </div>
        <ThreeStageComparisonSvg brush={activeBrush} paper={activePaper} microstructure={microstructure} foley={foley} isEn={isEn} />
      </div>

      {/* 물리 슬라이더 + 청각 Foley 제어 + 120Hz GPU 예산 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("필압·기울기·속도·겹칠 물리 제어", "Pressure, Tilt, Speed & Multi-Pass Physics")}
          </h3>
          <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
            <LabSliderRow id={`${uid}-pressure`} testId="drymedia-slider-pressure" label={pick("필압 (Pressure)", "Pressure")} readout={`${Math.round(activeConfig.pressure * 100)}%`} hint={pick(`봉우리 압착 ${Math.round(microstructure.dualScaleTooth.peakDepositRatio * 100)}% · 백색 골 노출 ${Math.round(microstructure.dualScaleTooth.sparkleValleyExposure * 100)}%`, `Peak deposit ${Math.round(microstructure.dualScaleTooth.peakDepositRatio * 100)}% · Valley exposure ${Math.round(microstructure.dualScaleTooth.sparkleValleyExposure * 100)}%`)} min={0.05} max={1} step={0.05} value={activeConfig.pressure} onChange={(v) => setSession((prev) => previewDryMediaConfigPatch(prev, { pressure: v }))} />
            <LabSliderRow id={`${uid}-tilt`} testId="drymedia-slider-tilt" label={pick("펜 기울기 (Tilt)", "Stylus Tilt")} readout={`${activeConfig.tiltDeg}°`} hint={microstructure.tiltShading.isBroadSideActive ? pick(`${TILT_BROADSIDE_THRESHOLD_DEG}° 미만 광폭 셰이딩 활성 · 폭 ×${microstructure.tiltShading.contactWidthMultiplier.toFixed(2)}`, `Broadside shading (<${TILT_BROADSIDE_THRESHOLD_DEG}°) · Width ×${microstructure.tiltShading.contactWidthMultiplier.toFixed(2)}`) : pick(`수직 정밀 접촉 · 입자 대비 ${Math.round(microstructure.tiltShading.granulationContrast * 100)}%`, `Upright precision · Granulation ${Math.round(microstructure.tiltShading.granulationContrast * 100)}%`)} min={TILT_MIN_DEG} max={TILT_MAX_DEG} step={1} value={activeConfig.tiltDeg} onChange={(v) => setSession((prev) => previewDryMediaConfigPatch(prev, { tiltDeg: v }))} />
            <LabSliderRow id={`${uid}-speed`} testId="drymedia-slider-speed" label={pick("획 속도 (Speed)", "Stroke Speed")} readout={`${activeConfig.speedPxPerSec} px/s`} hint={microstructure.tiltShading.sumiBristle.active ? pick(`갈필 ${microstructure.tiltShading.sumiBristle.strandCount}가닥 분기 · 결 끊김 ${Math.round(microstructure.tiltShading.sumiBristle.highSpeedSkipRatio * 100)}%`, `Dry sumi ${microstructure.tiltShading.sumiBristle.strandCount} strands · Skip ${Math.round(microstructure.tiltShading.sumiBristle.highSpeedSkipRatio * 100)}%`) : pick(`결 통과 ${foley.toothCrossingHz}Hz · 크럼블 ${microstructure.burnishAndCrumb.crumbCount}개`, `Tooth crossing ${foley.toothCrossingHz}Hz · ${microstructure.burnishAndCrumb.crumbCount} crumbs`)} min={60} max={3200} step={20} value={activeConfig.speedPxPerSec} onChange={(v) => setSession((prev) => previewDryMediaConfigPatch(prev, { speedPxPerSec: v }))} />
            <LabSliderRow id={`${uid}-passes`} testId="drymedia-slider-passes" label={pick("겹칠 횟수 (Passes)", "Overlap Passes")} readout={pick(`${activeConfig.overlapPasses}패스`, `${activeConfig.overlapPasses} pass`)} hint={pick(`골짜기 충전 ${Math.round(microstructure.burnishAndCrumb.valleyFillRatio * 100)}% · 왁스 블룸 ${Math.round(microstructure.burnishAndCrumb.waxBloomRatio * 100)}%`, `Valley fill ${Math.round(microstructure.burnishAndCrumb.valleyFillRatio * 100)}% · Wax bloom ${Math.round(microstructure.burnishAndCrumb.waxBloomRatio * 100)}%`)} min={MIN_OVERLAP_PASSES} max={MAX_OVERLAP_PASSES} step={1} value={activeConfig.overlapPasses} onChange={(v) => setSession((prev) => previewDryMediaConfigPatch(prev, { overlapPasses: v }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-6">
          <div className="flex flex-col justify-between space-y-2.5 rounded-xl border border-line bg-raised p-3.5">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                  <Waves className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("Web Audio 청각 Foley", "Web Audio Foley")}
                </h3>
                <span data-testid="drymedia-lufs-badge" className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-good tabular-nums">
                  <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />{foley.muted ? pick("음소거", "Muted") : `${foley.safetyLimiter.estimatedOutputLufs} LUFS`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-testid="drymedia-foley-mute-btn" aria-pressed={activeConfig.foleyMuted} onClick={handleToggleMute} className={activeConfig.foleyMuted ? BTN_ACTIVE : BTN_OUTLINE}>
                  {activeConfig.foleyMuted ? <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {activeConfig.foleyMuted ? pick("음소거 해제", "Unmute") : pick("음소거", "Mute")}
                </button>
                <button type="button" data-testid="drymedia-foley-play-btn" onClick={handleAuditionFoley} className={BTN_OUTLINE}>
                  <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("질감음 시연", "Audition")}
                </button>
              </div>
              <LabSliderRow id={`${uid}-volume`} testId="drymedia-slider-foley-volume" label={pick("Foley 강도", "Foley Gain")} readout={`${Math.round(activeConfig.foleyVolume * 100)}%`} hint={isEn ? foley.acousticSummaryEn : foley.acousticSummaryKo} min={0} max={1} step={0.05} value={activeConfig.foleyVolume} disabled={activeConfig.foleyMuted} onChange={(v) => setSession((prev) => previewDryMediaConfigPatch(prev, { foleyVolume: v }))} />
            </div>
            <div className="space-y-1 rounded-lg border border-line bg-card p-2.5">
              <div className="flex items-center justify-between text-[11px] text-fg-2 tabular-nums">
                <span>{pick("청각 피로 방지 리미터", "Fatigue Guard Limiter")}</span>
                <span className="font-mono font-bold text-fg">{`<= ${FOLEY_LIMITER_CEILING_LUFS} LUFS`}</span>
              </div>
              <div role="meter" aria-label={pick("청각 Foley 리미터 출력 수준", "Foley limiter output level")} aria-valuemin={-60} aria-valuemax={FOLEY_LIMITER_CEILING_LUFS} aria-valuenow={foley.muted ? -60 : foley.safetyLimiter.estimatedOutputLufs} className="h-2 w-full overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${lufsMeterPct}%` }} />
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-2.5 rounded-xl border border-line bg-raised p-3.5">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                  <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("120Hz GPU 예산 가드", "120Hz GPU Budget")}
                </h3>
                <span data-testid="drymedia-gpu-budget-badge" className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-good tabular-nums">
                  <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />{`${microstructure.gpuBudget120Hz.additionalGpuCostMs.toFixed(3)}ms`}
                </span>
              </div>
              <div className="space-y-1.5 rounded-lg border border-line bg-card p-2.5">
                <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                  <span className="text-fg-2">{pick("추가 셰이더 비용", "Extra Shader Cost")}</span>
                  <span data-testid="drymedia-gpu-cost-readout" className="font-mono font-bold text-fg">{`${microstructure.gpuBudget120Hz.additionalGpuCostMs.toFixed(3)} / ${EXTRA_GPU_BUDGET_MS}ms`}</span>
                </div>
                <div role="meter" aria-label={pick("추가 GPU 셰이더 비용", "Extra GPU shader cost")} aria-valuemin={0} aria-valuemax={EXTRA_GPU_BUDGET_MS} aria-valuenow={microstructure.gpuBudget120Hz.additionalGpuCostMs} className="h-2 w-full overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${gpuFillPct}%` }} />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-fg-3 tabular-nums">
                  <span>1×256 LUT + 3op smoothstep</span>
                  <span>{`총 ${microstructure.gpuBudget120Hz.totalEstimatedFrameMs.toFixed(2)}/${FRAME_BUDGET_120HZ_MS}ms`}</span>
                </div>
              </div>
            </div>
            <p data-testid="drymedia-cost-model-note" className="flex items-start gap-1.5 rounded-lg border border-line bg-card px-2.5 py-2 text-[11px] text-fg-3 [word-break:keep-all]">
              <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span>{isEn ? microstructure.gpuBudget120Hz.costModelNoteEn : microstructure.gpuBudget120Hz.costModelNoteKo}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("WGSL 이중 스케일 셰이더 · Web Audio Foley 레시피 JSON", "WGSL Dual-Scale Shader & Web Audio Foley Recipe JSON")}</span>
          <button type="button" data-testid="drymedia-toggle-json-btn" onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{showJson ? pick("JSON 숨기기", "Hide JSON") : pick("JSON 미리보기", "Show JSON")}
          </button>
        </div>
        {showJson ? (
          <pre data-testid="drymedia-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {recipeJson}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
