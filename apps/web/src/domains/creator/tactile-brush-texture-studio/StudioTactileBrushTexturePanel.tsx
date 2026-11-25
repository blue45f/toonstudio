/**
 * Wave 49A — 극한 브러시 시각 질감 × 120Hz 고성능 엔진 라이브 비교 랩 패널.
 *
 * - 5종 아티스트 브러시 프리셋 + 4종 종이 기판 LUT 선택 + 4대 질감 강도 슬라이더 + 필압·속도 시뮬레이션
 * - 순수 시맨틱 SVG 고해상도 2단 질감 비교(좌: 일반 평면 디지털 브러시 vs 우: 5층 물리 질감 + 단면)
 * - 120Hz(8.33ms) / 60Hz(16.67ms) 성능 예산 가드 게이지(결정론적 비용 모델 명시)
 * - 비파괴 미리보기·적용·원복 및 셰이더/브러시 레시피 JSON 복사
 * - Calm Atelier 토큰 준수(원시 색·광범위 트랜지션·기본 빈 객체 props·스토리지·BigInt·장식 아이콘 0건)
 */

import {
  AlertTriangle, Brush, Check, CheckCircle2, Code2, Copy,
  Cpu, Gauge, Layers, ShieldCheck, SlidersHorizontal, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  PAPER_GRAIN_PRESETS, TACTILE_BRUSH_PRESETS,
  applyTactileBrushPreview, createTactileBrushSession, evaluateTactileStampMetrics,
  exportTactileBrushRecipeJson, formatOklch, generatePaperGrainTileLut,
  getActiveTactileConfig, getPaperGrainPreset, getTactileBrushPreset,
  previewTactileBrushPatch, revertTactileBrushSession, samplePaperCrossSection,
  selectTactileBrushPreset,
  type PaperGrainId, type PaperGrainPreset, type PaperGrainTileLut,
  type TactileBrushConfig, type TactileBrushPreset, type TactileBrushPresetId,
  type TactileBrushSession, type TactileStampMetrics, type TargetRefreshHz,
} from "./tactile-brush-texture-engine";
import { useTactileBrushDelivery } from "./use-tactile-brush-delivery";

export interface StudioTactileBrushTexturePanelProps {
  readonly initialBrushId?: TactileBrushPresetId;
  readonly initialPaperId?: PaperGrainId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (config: TactileBrushConfig, metrics: TactileStampMetrics, session: TactileBrushSession) => void;
  readonly onRevert?: (config: TactileBrushConfig, metrics: TactileStampMetrics, session: TactileBrushSession) => void;
  readonly onExportJson?: (json: string, session: TactileBrushSession) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_NEUTRAL_PAPER = formatOklch({ l: 0.96, c: 0.005, h: 95 });
const SVG_INK_DARK = formatOklch({ l: 0.18, c: 0.014, h: 240 });
const SVG_LIGHT_RAY = formatOklch({ l: 0.72, c: 0.145, h: 76 });
const SVG_SPECULAR = formatOklch({ l: 0.98, c: 0.015, h: 86 });
const SVG_THRESHOLD = formatOklch({ l: 0.56, c: 0.14, h: 32 });

function roundCoord(value: number): number { return Math.round(value * 10) / 10; }

function TextureSliderRow(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly hint: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly onChange: (nextValue: number) => void;
}): ReactElement {
  return (
    <div className="space-y-0.5">
      <label htmlFor={props.id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{props.label}</span>
        <span data-testid={`${props.testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{props.readout}</span>
      </label>
      <input
        id={props.id} data-testid={props.testId} type="range"
        min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
      <p className="text-[11px] text-fg-3 [word-break:keep-all]">{props.hint}</p>
    </div>
  );
}

function TactileComparisonPreviewSvg(props: {
  readonly brush: TactileBrushPreset; readonly paper: PaperGrainPreset;
  readonly lut: PaperGrainTileLut; readonly metrics: TactileStampMetrics; readonly isEn: boolean;
}): ReactElement {
  const { brush, paper, lut, metrics, isEn } = props;
  const uid = useId();
  const tactileClipId = `${uid}-tactile-clip`;

  const pigmentCss = formatOklch(brush.pigmentOklch, metrics.paperTooth.effectiveOpacity);
  const flatPigmentCss = formatOklch(brush.pigmentOklch, 0.88);
  const wetRingCss = formatOklch(
    {
      l: Math.max(0.12, brush.pigmentOklch.l - metrics.wetEdge.effectiveRimDarkening * 0.28),
      c: Math.min(0.24, brush.pigmentOklch.c + 0.022),
      h: brush.pigmentOklch.h,
    },
    metrics.wetEdge.enabled ? 0.36 + metrics.controls.wetEdgePooling * 0.44 : 0,
  );
  const backrunCenterCss = formatOklch(
    {
      l: Math.min(0.92, brush.pigmentOklch.l + metrics.wetEdge.centerBackrunLightening * 0.8),
      c: Math.max(0.01, brush.pigmentOklch.c * 0.72),
      h: brush.pigmentOklch.h,
    },
    metrics.wetEdge.enabled ? 0.45 : 0,
  );
  const impastoShadowCss = formatOklch(
    { l: Math.max(0.1, brush.pigmentOklch.l - 0.14), c: brush.pigmentOklch.c * 0.9, h: brush.pigmentOklch.h },
    metrics.controls.impastoRelief * 0.62,
  );
  const impastoLitCss = formatOklch(
    {
      l: Math.min(0.96, brush.pigmentOklch.l + 0.16 + metrics.impasto.lambertLitDot * 0.24),
      c: Math.max(0.02, brush.pigmentOklch.c * 0.65),
      h: brush.pigmentOklch.h,
    },
    Math.min(0.95, 0.2 + metrics.impasto.blinnSpecular * 0.78),
  );
  const paperSurfaceCss = formatOklch(paper.surfaceOklch);
  const paperShadowCss = formatOklch(paper.shadowOklch);
  const paperGrainTickCss = formatOklch(paper.shadowOklch, 0.52);

  const crossSamples = useMemo(() => samplePaperCrossSection(lut, 24, 28), [lut]);
  const crossBaselineY = 264;
  const crossTopY = 216;
  const crossHeightSpan = 34;

  const terrainPolygonPoints = useMemo(() => {
    const startX = 344;
    const widthX = 272;
    const pts = crossSamples.map((pt) => `${roundCoord(startX + pt.u * widthX)},${roundCoord(crossTopY + (1 - pt.height) * crossHeightSpan)}`);
    return `${startX},${crossBaselineY} ${pts.join(" ")} ${startX + widthX},${crossBaselineY}`;
  }, [crossSamples]);

  const impastoCapPoints = useMemo(() => {
    const startX = 344;
    const widthX = 272;
    const reliefLiftPx = metrics.impasto.ridgeThicknessMm * 6.5;
    const threshold = metrics.paperTooth.contactThreshold;
    const upperPts: string[] = [];
    const lowerPts: string[] = [];
    for (const pt of crossSamples) {
      const px = roundCoord(startX + pt.u * widthX);
      const surfaceY = crossTopY + (1 - pt.height) * crossHeightSpan;
      const covers = pt.height >= threshold;
      const coatThickness = covers ? 3.5 + reliefLiftPx * Math.sin(pt.u * Math.PI) : 0;
      upperPts.push(`${px},${roundCoord(surfaceY - coatThickness)}`);
      lowerPts.unshift(`${px},${roundCoord(surfaceY + (covers ? 0.6 : 0))}`);
    }
    return `${upperPts.join(" ")} ${lowerPts.join(" ")}`;
  }, [crossSamples, metrics.impasto.ridgeThicknessMm, metrics.paperTooth.contactThreshold]);

  const valleySpeckles = useMemo(() => {
    const dots: Array<{ readonly x: number; readonly y: number; readonly r: number }> = [];
    const threshold = metrics.paperTooth.contactThreshold;
    if (threshold <= 0.05) return dots;
    for (let i = 0; i < 26; i += 1) {
      const t = (i + 0.5) / 26;
      const gx = Math.floor(t * 63);
      const gy = (i * 19 + 11) & 63;
      const h = lut.height[gy * lut.size + gx] ?? 0.5;
      if (h < threshold) {
        dots.push({
          x: roundCoord(368 + t * 222),
          y: roundCoord(104 - Math.sin(t * Math.PI * 1.35) * 20 + ((gy % 7) - 3) * 4.4),
          r: roundCoord(1.4 + (threshold - h) * 3.2),
        });
      }
    }
    return dots;
  }, [lut, metrics.paperTooth.contactThreshold]);

  const paperBackdropLines = useMemo(() => {
    const items: Array<{ readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }> = [];
    if (paper.id === "hanji") {
      for (let i = 0; i < 11; i += 1) {
        const y = 44 + i * 11;
        items.push({ x1: 340 + (i % 3) * 14, y1: y, x2: 616 - (i % 2) * 18, y2: y + (i % 2 === 0 ? 4 : -3) });
      }
    } else if (paper.id === "linen-canvas") {
      for (let i = 0; i < 12; i += 1) items.push({ x1: 344 + i * 24, y1: 36, x2: 344 + i * 24, y2: 162 });
      for (let j = 0; j < 6; j += 1) items.push({ x1: 336, y1: 44 + j * 22, x2: 622, y2: 44 + j * 22 });
    } else {
      for (let i = 0; i < 10; i += 1) {
        const x = 350 + i * 28;
        const y = 48 + ((i * 23) % 92);
        items.push({ x1: x, y1: y, x2: x + (paper.id === "cold-press" ? 12 : 5), y2: y + 3 });
      }
    }
    return items;
  }, [paper.id]);

  const spreadHalfPx = 7 + metrics.splitBristle.splaySpreadRatio * 18;
  const thresholdLineY = roundCoord(crossTopY + (1 - metrics.paperTooth.contactThreshold) * crossHeightSpan);
  const hlDx = metrics.impasto.highlightOffsetPx.x;
  const hlDy = metrics.impasto.highlightOffsetPx.y;

  return (
    <svg
      data-testid="tactile-comparison-svg"
      data-brush-id={brush.id} data-paper-id={paper.id}
      data-filament-count={metrics.splitBristle.activeFilamentCount}
      data-wet-ring-pct={metrics.wetEdge.ringConcentrationPct}
      data-impasto-mm={metrics.impasto.ridgeThicknessMm}
      data-violet-free="true"
      viewBox="0 0 640 288"
      className="h-auto w-full rounded-xl border border-line bg-canvas text-fg"
      role="img"
      aria-label={
        isEn
          ? "Side-by-side comparison of flat digital brush versus 5-layer physical tactile brush and paper cross-section"
          : "일반 평면 디지털 브러시 대 5층 물리 질감 브러시 및 종이 요철 단면 실시간 비교 프리뷰"
      }
    >
      <defs>
        <clipPath id={tactileClipId}>
          <rect x="334" y="34" width="292" height="130" rx="8" />
        </clipPath>
      </defs>

      <rect x="12" y="10" width="296" height="268" rx="10" fill={SVG_NEUTRAL_PAPER} stroke="currentColor" strokeOpacity={0.16} />
      <rect x="332" y="10" width="296" height="268" rx="10" fill={paperSurfaceCss} stroke="currentColor" strokeOpacity={0.22} />

      <text x="24" y="26" fill={SVG_INK_DARK} fontSize="10.5" fontWeight="700">
        {isEn ? "Flat Digital Brush (Baseline)" : "일반 평면 디지털 브러시 (기준)"}
      </text>
      <text x="296" y="26" textAnchor="end" fill={SVG_INK_DARK} fillOpacity={0.62} fontSize="9.5" fontFamily="monospace">
        {`SCORE ${metrics.flatBaselineRichness}`}
      </text>

      <text x="344" y="26" fill={SVG_INK_DARK} fontSize="10.5" fontWeight="700">
        {isEn ? `5-Layer Tactile (${brush.nameEn})` : `5층 물리 질감 (${brush.nameKo})`}
      </text>
      <text x="616" y="26" textAnchor="end" fill={SVG_INK_DARK} fillOpacity={0.75} fontSize="9.5" fontWeight="700" fontFamily="monospace">
        {`SCORE ${metrics.tactileRichnessScore}`}
      </text>

      {/* 좌측: 평면 디지털 브러시 획 + 평면 단면 */}
      <rect x="18" y="34" width="284" height="130" rx="8" fill={SVG_NEUTRAL_PAPER} stroke="currentColor" strokeOpacity={0.1} />
      <path d="M 48 118 C 102 68, 188 134, 272 82" fill="none" stroke={flatPigmentCss} strokeWidth={Math.max(10, Math.min(34, metrics.radiusPx * 1.15))} strokeLinecap="round" />
      <text x="28" y="154" fill={SVG_INK_DARK} fillOpacity={0.58} fontSize="8.8" fontFamily="monospace">
        {isEn ? "No Tooth · 1 Solid Ribbon · Flat Alpha" : "요철 투과 없음 · 단일 평면 획 · 입체감 0"}
      </text>

      <rect x="18" y="176" width="284" height="94" rx="8" fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.1} />
      <text x="28" y="191" fill={SVG_INK_DARK} fillOpacity={0.68} fontSize="8.8" fontWeight="600">
        {isEn ? "Cross-Section: Flat Surface" : "종이·안료 단면: 평면 디지털"}
      </text>
      <rect x="30" y="236" width="260" height="28" fill={SVG_NEUTRAL_PAPER} stroke="currentColor" strokeOpacity={0.22} />
      <rect x="52" y="229" width="216" height="7" rx="2" fill={flatPigmentCss} />

      {/* 우측 상단: 5층 물리 질감 브러시 획 */}
      <g clipPath={`url(#${tactileClipId})`}>
        <rect x="334" y="34" width="292" height="130" rx="8" fill={paperSurfaceCss} stroke="currentColor" strokeOpacity={0.14} />
        {paperBackdropLines.map((ln, idx) => (
          <line key={`${paper.id}-grain-${idx}`} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={paperGrainTickCss} strokeWidth={paper.id === "linen-canvas" ? 1.1 : 1.4} />
        ))}
        {metrics.wetEdge.enabled ? (
          <>
            <path d="M 366 118 C 420 68, 506 134, 590 82" fill="none" stroke={wetRingCss} strokeWidth={Math.max(14, Math.min(44, metrics.radiusPx * 1.2 + metrics.wetEdge.ringWidthPx * 2.1))} strokeLinecap="round" />
            <path d="M 366 118 C 420 68, 506 134, 590 82" fill="none" stroke={backrunCenterCss} strokeWidth={Math.max(8, Math.min(32, metrics.radiusPx * 0.92))} strokeLinecap="round" />
          </>
        ) : null}
        {metrics.controls.impastoRelief > 0.05 ? (
          <path
            d={`M ${roundCoord(366 - hlDx)} ${roundCoord(118 - hlDy)} C ${roundCoord(420 - hlDx)} ${roundCoord(68 - hlDy)}, ${roundCoord(506 - hlDx)} ${roundCoord(134 - hlDy)}, ${roundCoord(590 - hlDx)} ${roundCoord(82 - hlDy)}`}
            fill="none" stroke={impastoShadowCss} strokeWidth={Math.max(8, Math.min(32, metrics.radiusPx * 0.95 + metrics.impasto.ridgeThicknessMm * 2.4))} strokeLinecap="round"
          />
        ) : null}
        {metrics.splitBristle.filaments.map((fil) => {
          const dy = roundCoord(fil.lateralOffsetNorm * spreadHalfPx);
          const strokeW = roundCoord(Math.max(1.2, (metrics.radiusPx * 0.34 * fil.widthWeight) / Math.sqrt(metrics.splitBristle.activeFilamentCount / 5)));
          const dashLen = fil.gapPhase > 0.28 ? `${roundCoord(18 + (1 - fil.gapPhase) * 32)} ${roundCoord(3 + fil.gapPhase * 12)}` : undefined;
          return (
            <path
              key={`fil-${fil.index}`} data-testid="tactile-filament-path"
              d={`M 366 ${roundCoord(118 + dy)} C 420 ${roundCoord(68 + dy * 0.85)}, 506 ${roundCoord(134 + dy * 1.08)}, 590 ${roundCoord(82 + dy * 0.72)}`}
              fill="none" stroke={pigmentCss} strokeOpacity={fil.opacityWeight} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={dashLen}
            />
          );
        })}
        {valleySpeckles.map((dot, idx) => (
          <circle key={`tooth-${idx}`} cx={dot.x} cy={dot.y} r={dot.r} fill={paperSurfaceCss} fillOpacity={0.78} />
        ))}
        {metrics.controls.impastoRelief > 0.05 ? (
          <>
            <path
              d={`M ${roundCoord(366 + hlDx)} ${roundCoord(118 + hlDy)} C ${roundCoord(420 + hlDx)} ${roundCoord(68 + hlDy)}, ${roundCoord(506 + hlDx)} ${roundCoord(134 + hlDy)}, ${roundCoord(590 + hlDx)} ${roundCoord(82 + hlDy)}`}
              fill="none" stroke={impastoLitCss} strokeWidth={roundCoord(1.8 + metrics.impasto.ridgeThicknessMm * 1.9)} strokeLinecap="round"
            />
            <path
              d={`M ${roundCoord(372 + hlDx * 1.15)} ${roundCoord(116 + hlDy * 1.15)} C ${roundCoord(424 + hlDx * 1.15)} ${roundCoord(67 + hlDy * 1.15)}, ${roundCoord(508 + hlDx * 1.15)} ${roundCoord(132 + hlDy * 1.15)}, ${roundCoord(586 + hlDx * 1.15)} ${roundCoord(82 + hlDy * 1.15)}`}
              fill="none" stroke={SVG_SPECULAR} strokeOpacity={roundCoord(metrics.impasto.blinnSpecular * 0.75)} strokeWidth={roundCoord(0.9 + metrics.impasto.blinnSpecular * 1.6)} strokeLinecap="round"
            />
          </>
        ) : null}
        <text x="344" y="154" fill={SVG_INK_DARK} fillOpacity={0.72} fontSize="8.8" fontFamily="monospace">
          {`FIL ${metrics.splitBristle.activeFilamentCount} · WET ${metrics.wetEdge.ringConcentrationPct}% · IMP ${metrics.impasto.ridgeThicknessMm.toFixed(2)}mm`}
        </text>
      </g>

      {/* 우측 하단: 실측 LUT 종이 요철 + 안료 침투 + 45° 임파스토 단면 */}
      <rect x="334" y="176" width="292" height="94" rx="8" fill={paperSurfaceCss} stroke="currentColor" strokeOpacity={0.14} />
      <text x="344" y="191" fill={SVG_INK_DARK} fillOpacity={0.78} fontSize="8.8" fontWeight="600">
        {isEn ? `Cross-Section: ${paper.nameEn} 64×64 LUT` : `종이·안료 단면: ${paper.nameKo} 64×64 LUT`}
      </text>
      <text x="616" y="191" textAnchor="end" fill={SVG_INK_DARK} fillOpacity={0.68} fontSize="8.2" fontFamily="monospace">
        {`45° LIGHT · SPEC ${Math.round(metrics.impasto.blinnSpecular * 100)}%`}
      </text>
      <line x1="354" y1="196" x2="372" y2="212" stroke={SVG_LIGHT_RAY} strokeWidth="1.8" strokeLinecap="round" />
      <polygon points="374,214 366,212 371,206" fill={SVG_LIGHT_RAY} />
      <polygon points={terrainPolygonPoints} fill={paperShadowCss} stroke={SVG_INK_DARK} strokeOpacity={0.35} strokeWidth="1" />
      <polygon points={impastoCapPoints} fill={pigmentCss} />
      <line x1="344" y1={thresholdLineY} x2="616" y2={thresholdLineY} stroke={SVG_THRESHOLD} strokeWidth="1.2" strokeDasharray="4 3" />
      <text x="616" y={Math.max(204, thresholdLineY - 3)} textAnchor="end" fill={SVG_THRESHOLD} fontSize="7.8" fontFamily="monospace">
        {`TH ${Math.round(metrics.paperTooth.contactThreshold * 100)}%`}
      </text>
    </svg>
  );
}

/** 극한 브러시 시각 질감 × 120Hz 고성능 엔진 라이브 비교 랩 패널. */
export function StudioTactileBrushTexturePanel(props: StudioTactileBrushTexturePanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const [session, setSession] = useState<TactileBrushSession>(() =>
    createTactileBrushSession(props.initialBrushId ?? "dry-sumi", props.initialPaperId),
  );
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const delivery = useTactileBrushDelivery();

  const activeConfig = getActiveTactileConfig(session);
  const activeBrush = getTactileBrushPreset(activeConfig.brushId);
  const activePaper = getPaperGrainPreset(activeConfig.paperId);
  const paperLut = useMemo(() => generatePaperGrainTileLut(activeConfig.paperId), [activeConfig.paperId]);

  const metrics = useMemo(
    () =>
      evaluateTactileStampMetrics({
        brushId: activeConfig.brushId, paperId: activeConfig.paperId, controls: activeConfig.controls,
        pressure: activeConfig.pressure, velocityPxPerSec: activeConfig.velocityPxPerSec,
        tiltDeg: activeConfig.tiltDeg, strokeAngleDeg: activeConfig.strokeAngleDeg,
        targetRefreshHz: activeConfig.targetRefreshHz,
        performanceGuardEnabled: activeConfig.performanceGuardEnabled, lut: paperLut,
      }),
    [activeConfig, paperLut],
  );
  const recipeJson = useMemo(() => exportTactileBrushRecipeJson(session, metrics), [session, metrics]);

  const handleSelectBrush = (brushId: TactileBrushPresetId): void => {
    const preset = getTactileBrushPreset(brushId);
    setSession((prev) => selectTactileBrushPreset(prev, brushId));
    setStatusMessage(pick(`'${preset.nameKo}' 프리셋을 미리보기로 불러왔습니다. 확인 후 적용하세요.`, `Loaded '${preset.nameEn}' preset into non-destructive preview.`));
  };

  const handleSelectPaper = (paperId: PaperGrainId): void => {
    const paper = getPaperGrainPreset(paperId);
    setSession((prev) => previewTactileBrushPatch(prev, { paperId }));
    setStatusMessage(pick(`종이 기판을 '${paper.nameKo}' 64×64 LUT로 전환했습니다.`, `Switched substrate LUT to '${paper.nameEn}' (64×64).`));
  };

  const handleControlChange = (key: "paperToothStrength" | "dryBristleSplit" | "wetEdgePooling" | "impastoRelief", value: number): void => {
    setSession((prev) => previewTactileBrushPatch(prev, { controls: { [key]: value } }));
  };

  const handleRefreshChange = (targetRefreshHz: TargetRefreshHz): void => {
    setSession((prev) => previewTactileBrushPatch(prev, { targetRefreshHz }));
    setStatusMessage(pick(`프레임 예산 목표를 ${targetRefreshHz}Hz(${targetRefreshHz === 120 ? "8.33ms" : "16.67ms"})로 변경했습니다.`, `Target frame budget set to ${targetRefreshHz}Hz (${targetRefreshHz === 120 ? "8.33ms" : "16.67ms"}).`));
  };

  const handleToggleGuard = (): void => {
    const nextGuard = !activeConfig.performanceGuardEnabled;
    setSession((prev) => previewTactileBrushPatch(prev, { performanceGuardEnabled: nextGuard }));
    setStatusMessage(
      nextGuard
        ? pick("120Hz 목표 비용 모델의 LOD 가정을 켰습니다. 실제 GPU 설정은 바꾸지 않습니다.", "Enabled LOD assumptions in the 120Hz target cost model. GPU settings are unchanged.")
        : pick("LOD 비용 가정을 껐습니다. 수식의 예상 비용만 비교합니다.", "Disabled LOD assumptions to compare analytical estimates."),
    );
  };

  const handleApply = (): void => {
    if (!session.canApply) return;
    const nextSession = applyTactileBrushPreview(session);
    setStatusMessage("");
    delivery.run(() => props.onApply?.(nextSession.committed, metrics, nextSession), () => {
      setSession(nextSession);
      setStatusMessage(pick("예제 질감 구성을 적용했습니다. 실제 브러시·원고·저장 반영은 확인하지 않습니다.", "Applied the example configuration. Real brush, manuscript and persistence changes are unverified."));
    });
  };

  const handleRevert = (): void => {
    if (!session.canRevert) return;
    const nextSession = revertTactileBrushSession(session);
    setStatusMessage("");
    delivery.run(() => nextSession.committed === session.committed ? undefined
      : props.onRevert?.(nextSession.committed, evaluateTactileStampMetrics(nextSession.committed), nextSession), () => {
      setSession(nextSession);
      setStatusMessage(pick("예제 구성을 되돌렸습니다. 외부 브러시 복원·저장은 확인하지 않습니다.", "Restored the example configuration. External brush restoration and saving are unverified."));
    });
  };

  const handleCopyJson = (): void => {
    setShowJson(true);
    setStatusMessage("");
    delivery.run(() => {
      if (props.onExportJson) return props.onExportJson(recipeJson, session);
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error(pick("복사를 사용할 수 없습니다. JSON 미리보기에서 직접 복사해 주세요.", "Clipboard unavailable. Copy directly from the JSON preview."));
      return navigator.clipboard.writeText(recipeJson);
    }, () => setStatusMessage(props.onExportJson
      ? pick("레시피 전달 콜백을 완료했습니다. 저장 여부는 확인하지 않습니다.", "Recipe delivery callback completed. Persistence is unverified.")
      : pick("예제 레시피 JSON을 클립보드에 복사했습니다.", "Copied example recipe JSON to the clipboard.")));
  };

  const statusBadgeText =
    session.status === "previewing" ? pick("미리보기 조정 중", "Previewing")
      : session.status === "applied" ? pick(`예제 적용됨 (${session.appliedCount}회)`, `Example Applied (${session.appliedCount})`)
        : session.status === "reverted" ? pick("예제 되돌림", "Example Reverted") : pick("예제 기준 프리셋", "Example Baseline");

  const budget = metrics.frameBudget;
  const gaugeFillPct = Math.min(100, Math.round(budget.utilizationPct));
  const budgetBadgeClass = budget.withinBudget ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad";

  return (
    <section
      data-testid="tactile-brush-texture-panel"
      aria-label={pick("브러시 질감·목표 프레임 비용 예제", "Brush Texture and Target Frame Cost Examples")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
      aria-busy={delivery.pending}
    >
      <fieldset disabled={delivery.pending} className="contents space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Brush className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("5층 질감 모델 · 목표 120Hz", "5-Layer Texture Model · 120Hz Target")}
            </span>
            <span data-testid="tactile-session-status-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-medium text-fg-2 tabular-nums [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {statusBadgeText}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("브러시 질감 SVG · 프레임 비용 모델", "Brush Texture SVG · Frame Cost Model")}
          </h2>
          <p data-testid="tactile-example-disclosure" className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("고정 프리셋의 CPU 계산과 합성 SVG 비교 예제입니다. 실제 GPU·WGSL 실행, 120Hz 실측, 원고 픽셀 그리기·브러시·장면 저장은 수행하지 않습니다. 콜백 완료도 외부 반영·저장 확인을 뜻하지 않습니다.", "Fixed-preset CPU calculations and synthetic SVG examples. No GPU/WGSL execution, measured 120Hz, manuscript pixel drawing, brush changes or scene saving occur here. Callback completion does not verify external changes or persistence.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="tactile-apply-btn" disabled={!session.canApply} onClick={handleApply} className={BTN_SOLID}>
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("예제 구성 적용", "Apply Example")}
          </button>
          <button type="button" data-testid="tactile-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("예제 되돌리기", "Restore Example")}
          </button>
          <button type="button" data-testid="tactile-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {props.onExportJson ? pick("레시피 JSON 전달", "Deliver Recipe JSON") : pick("레시피 JSON 복사", "Copy Recipe JSON")}
          </button>
        </div>
      </header>

      {delivery.error ? <p role="alert" className="text-xs text-fg">{delivery.error} {pick("같은 버튼으로 다시 시도해 주세요.", "Use the same button to retry.")}</p> : null}
      <div role="status" aria-live="polite" data-testid="tactile-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {delivery.pending ? pick("전달 완료를 기다리고 있습니다.", "Waiting for delivery completion.") : statusMessage || pick(`${activeBrush.nameKo} · ${activePaper.nameKo} 예제를 미리봅니다.`, `Previewing the ${activeBrush.nameEn} on ${activePaper.nameEn} example.`)}
      </div>

      {/* 5종 브러시 프리셋 + 4종 종이 기판 LUT */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Brush className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("5종 아티스트 브러시 프리셋", "5 Artist Brush Presets")}
            </h3>
            <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? activeBrush.categoryEn : activeBrush.categoryKo}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TACTILE_BRUSH_PRESETS.map((preset) => {
              const selected = preset.id === activeConfig.brushId;
              return (
                <button key={preset.id} type="button" data-testid={`tactile-brush-preset-${preset.id}`} aria-pressed={selected} onClick={() => handleSelectBrush(preset.id)} className={`${selected ? BTN_ACTIVE : BTN_OUTLINE} justify-start text-left`}>
                  <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(preset.pigmentOklch) }} />
                  <span className="truncate">{isEn ? preset.nameEn : preset.nameKo}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? activeBrush.summaryEn : activeBrush.summaryKo}</p>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("4종 종이 요철 64×64 LUT", "4 Paper Grain 64×64 LUTs")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${Math.round(paperLut.memoryBytes / 1024)}KiB · σ ${paperLut.peakStdDev.toFixed(2)}`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PAPER_GRAIN_PRESETS.map((paper) => {
              const selected = paper.id === activeConfig.paperId;
              return (
                <button key={paper.id} type="button" data-testid={`tactile-paper-preset-${paper.id}`} aria-pressed={selected} onClick={() => handleSelectPaper(paper.id)} className={`${selected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start gap-0.5 py-2 text-left`}>
                  <span className="text-xs font-semibold">{isEn ? paper.nameEn : paper.nameKo}</span>
                  <span className="text-[10px] font-normal text-fg-3">{isEn ? paper.grainTagEn : paper.grainTagKo}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? activePaper.descriptionEn : activePaper.descriptionKo}</p>
        </div>
      </div>

      {/* 2단 실시간 질감 비교 SVG */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("평면·질감 모델의 합성 SVG 비교", "Synthetic SVG Comparison of Flat and Textured Models")}
          </h3>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-2 tabular-nums">
            <span>{`${pick("봉우리 투과", "Tooth Cov")} ${Math.round(metrics.paperTooth.peakCoverageRatio * 100)}%`}</span>
            <span>·</span>
            <span>{`${pick("갈필", "Bristles")} ${metrics.splitBristle.activeFilamentCount}`}</span>
            <span>·</span>
            <span>{`${pick("습윤 링", "Wet Ring")} ${metrics.wetEdge.ringConcentrationPct}%`}</span>
            <span>·</span>
            <span>{`${pick("임파스토", "Impasto")} ${metrics.impasto.ridgeThicknessMm.toFixed(2)}mm`}</span>
          </div>
        </div>
        <TactileComparisonPreviewSvg brush={activeBrush} paper={activePaper} lut={paperLut} metrics={metrics} isEn={isEn} />
      </div>

      {/* 4대 질감 강도 슬라이더 + 120Hz/60Hz 성능 가드 게이지 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-7">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("4대 질감 강도 & 필압·속도 시뮬레이션", "4 Tactile Intensity Controls & Stylus Simulation")}
          </h3>
          <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
            <TextureSliderRow
              id={`${uid}-tooth`} testId="tactile-slider-paper-tooth" label={pick("1. 종이 요철 투과", "1. Paper-Tooth Modulation")}
              readout={`${Math.round(activeConfig.controls.paperToothStrength * 100)}%`}
              hint={pick(`임계값 ${Math.round(metrics.paperTooth.contactThreshold * 100)}% · 골 침투 ${Math.round(metrics.paperTooth.valleyPenetrationRatio * 100)}%`, `Threshold ${Math.round(metrics.paperTooth.contactThreshold * 100)}% · Valley ${Math.round(metrics.paperTooth.valleyPenetrationRatio * 100)}%`)}
              min={0} max={1} step={0.02} value={activeConfig.controls.paperToothStrength} onChange={(v) => handleControlChange("paperToothStrength", v)}
            />
            <TextureSliderRow
              id={`${uid}-bristle`} testId="tactile-slider-dry-bristle" label={pick("2. 갈필 모발 분기", "2. Dry Split-Bristle")}
              readout={`${Math.round(activeConfig.controls.dryBristleSplit * 100)}%`}
              hint={pick(`활성 ${metrics.splitBristle.activeFilamentCount}가닥 (원본 ${metrics.splitBristle.rawFilamentCount}가닥)`, `Active ${metrics.splitBristle.activeFilamentCount} strands (raw ${metrics.splitBristle.rawFilamentCount})`)}
              min={0} max={1} step={0.02} value={activeConfig.controls.dryBristleSplit} onChange={(v) => handleControlChange("dryBristleSplit", v)}
            />
            <TextureSliderRow
              id={`${uid}-wet-edge`} testId="tactile-slider-wet-edge" label={pick("3. 모세관 습윤 에지", "3. Wet-Edge Pooling")}
              readout={`${Math.round(activeConfig.controls.wetEdgePooling * 100)}%`}
              hint={pick(`가장자리 안료 농축 ${metrics.wetEdge.ringConcentrationPct}% · 폭 ${metrics.wetEdge.ringWidthPx.toFixed(1)}px`, `Rim pooling ${metrics.wetEdge.ringConcentrationPct}% · Band ${metrics.wetEdge.ringWidthPx.toFixed(1)}px`)}
              min={0} max={1} step={0.02} value={activeConfig.controls.wetEdgePooling} onChange={(v) => handleControlChange("wetEdgePooling", v)}
            />
            <TextureSliderRow
              id={`${uid}-impasto`} testId="tactile-slider-impasto" label={pick("4. 임파스토 입체감", "4. Impasto 45° Relief")}
              readout={`${Math.round(activeConfig.controls.impastoRelief * 100)}%`}
              hint={pick(`두께 ${metrics.impasto.ridgeThicknessMm.toFixed(2)}mm · Blinn 광택 ${Math.round(metrics.impasto.blinnSpecular * 100)}%`, `Ridge ${metrics.impasto.ridgeThicknessMm.toFixed(2)}mm · Blinn ${Math.round(metrics.impasto.blinnSpecular * 100)}%`)}
              min={0} max={1} step={0.02} value={activeConfig.controls.impastoRelief} onChange={(v) => handleControlChange("impastoRelief", v)}
            />
            <TextureSliderRow
              id={`${uid}-pressure`} testId="tactile-slider-pressure" label={pick("시뮬레이션 필압", "Simulated Pressure")}
              readout={`${Math.round(activeConfig.pressure * 100)}%`}
              hint={pick("약필압은 봉우리 스침, 강필압은 골짜기 밀착", "Light pressure skims peaks; heavy fills valleys")}
              min={0.05} max={1} step={0.05} value={activeConfig.pressure}
              onChange={(v) => setSession((prev) => previewTactileBrushPatch(prev, { pressure: v }))}
            />
            <TextureSliderRow
              id={`${uid}-velocity`} testId="tactile-slider-velocity" label={pick("시뮬레이션 획 속도", "Simulated Stroke Speed")}
              readout={`${activeConfig.velocityPxPerSec} px/s`}
              hint={pick("고속 플릭 시 갈필 분기와 LOD 압축이 자동 반응", "High speed triggers dry split & LOD scaling")}
              min={100} max={2800} step={50} value={activeConfig.velocityPxPerSec}
              onChange={(v) => setSession((prev) => previewTactileBrushPatch(prev, { velocityPxPerSec: v }))}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("120Hz / 60Hz 목표 비용 모델", "120Hz / 60Hz Target Cost Model")}
              </h3>
              <span data-testid="tactile-budget-status-badge" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${budgetBadgeClass}`}>
                {budget.withinBudget ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {budget.withinBudget ? pick("모델 예산 이내", "Within Model Budget") : pick("모델 예산 초과", "Over Model Budget")}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="tactile-hz-120-btn" aria-pressed={activeConfig.targetRefreshHz === 120} onClick={() => handleRefreshChange(120)} className={activeConfig.targetRefreshHz === 120 ? BTN_ACTIVE : BTN_OUTLINE}>
                120Hz (8.33ms)
              </button>
              <button type="button" data-testid="tactile-hz-60-btn" aria-pressed={activeConfig.targetRefreshHz === 60} onClick={() => handleRefreshChange(60)} className={activeConfig.targetRefreshHz === 60 ? BTN_ACTIVE : BTN_OUTLINE}>
                60Hz (16.67ms)
              </button>
              <button type="button" data-testid="tactile-guard-toggle-btn" aria-pressed={activeConfig.performanceGuardEnabled} onClick={handleToggleGuard} className={activeConfig.performanceGuardEnabled ? BTN_ACTIVE : BTN_OUTLINE}>
                <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {activeConfig.performanceGuardEnabled ? pick("LOD 모델 켜짐", "LOD Model ON") : pick("LOD 모델 꺼짐", "LOD Model OFF")}
              </button>
            </div>

            <div className="space-y-1.5 rounded-lg border border-line bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-fg-2 [word-break:keep-all]">{pick("추정 프레임 비용", "Estimated Frame Cost")}</span>
                <span data-testid="tactile-frame-ms-readout" className="font-mono text-sm font-bold text-fg tabular-nums">
                  {`${budget.estimatedFrameMs.toFixed(2)}ms / ${budget.budgetMs.toFixed(2)}ms`}
                </span>
              </div>
              <div role="meter" aria-label={pick("프레임 예산 사용률", "Frame budget utilization")} aria-valuemin={0} aria-valuemax={budget.budgetMs} aria-valuenow={budget.estimatedFrameMs} className="h-2.5 w-full overflow-hidden rounded-full bg-raised">
                <div className={`h-full rounded-full transition-[width] motion-reduce:transition-none ${budget.withinBudget ? "bg-accent" : "bg-bad"}`} style={{ width: `${gaugeFillPct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[11px] tabular-nums">
                <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                  <div className="text-[10px] text-fg-3">{pick("모델 캐시율", "Model Cache Rate")}</div>
                  <div data-testid="tactile-cache-hit-readout" className="font-mono font-bold text-fg">{`${Math.round(budget.atlasCacheHitRate * 100)}%`}</div>
                </div>
                <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                  <div className="text-[10px] text-fg-3">{pick("LOD 단계", "LOD Tier")}</div>
                  <div data-testid="tactile-lod-readout" className="font-mono font-bold text-fg">{`LOD ${budget.lodTier}`}</div>
                </div>
                <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                  <div className="text-[10px] text-fg-3">{pick("모델 Dirty 타일", "Model Dirty Tiles")}</div>
                  <div className="font-mono font-bold text-fg">{`${budget.dirtyTileCount}×256px`}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 pt-1 font-mono text-[10px] text-fg-3 tabular-nums">
                <span>{`LUT ${budget.stageBreakdownMs.lutLookupMs}ms`}</span>
                <span>{`BRISTLE ${budget.stageBreakdownMs.bristleCompositeMs}ms`}</span>
                <span>{`WET ${budget.stageBreakdownMs.wetEdgeShaderMs}ms`}</span>
                <span>{`IMP ${budget.stageBreakdownMs.impastoNormalMs}ms`}</span>
                <span>{`TILE ${budget.stageBreakdownMs.dirtyTileFlushMs}ms`}</span>
              </div>
            </div>
          </div>

          <p data-testid="tactile-cost-model-note" className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-fg-3 [word-break:keep-all]">
            {isEn ? budget.modelNoteEn : budget.modelNoteKo}
          </p>
        </div>
      </div>

      {/* 레시피 JSON 미리보기 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("WGSL / 스튜디오 브러시 레시피 JSON", "WGSL / Studio Brush Recipe JSON")}</span>
          <button type="button" data-testid="tactile-toggle-json-btn" onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJson ? pick("JSON 숨기기", "Hide JSON") : pick("JSON 미리보기", "Show JSON")}
          </button>
        </div>
        {showJson ? (
          <pre data-testid="tactile-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {recipeJson}
          </pre>
        ) : null}
      </div>
      </fieldset>
    </section>
  );
}
