/**
 * 온디바이스 화풍 DNA 일치화 · 한국어 대본->세로 스크롤 콘티 파서 · 스마트 브러시/종이결 추천 통합 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건) · Props 없이 단독 렌더링 지원 · 100% 온디바이스 실행.
 */

import {
  AudioLines,
  Brush,
  CheckCircle2,
  Cpu,
  FileText,
  Layers,
  Palette,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { ContiCutCard, MetricCard, RangeSliderRow } from "./AiLatentStoryboardSubcomponents";
import {
  createStyleHarmonizerDemoFixtures,
  extractStyleDnaFromRgba,
  harmonizeBackgroundToStyleDna,
  renderStyleComparisonStripRgba,
  STYLE_HARMONIZER_PRESETS,
  type StyleHarmonizationReport,
  type StylePresetId,
} from "./latent-style-harmonizer";
import {
  parseKoreanScriptToConti,
  SCRIPT_CONTI_PRESETS,
  type ScriptToContiReport,
} from "./script-to-conti-parser";
import {
  BRUSH_LAYER_STAGES,
  recommendSmartBrushes,
  SMART_BRUSH_TELEMETRY_PRESETS,
  type BrushLayerStage,
  type SmartBrushRecommendationReport,
  type SmartBrushTelemetryInput,
} from "./smart-brush-recommender";

export type AiLatentStoryboardTab = "conti" | "harmonizer" | "brush";

export interface StudioAiLatentStoryboardPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: AiLatentStoryboardTab;
  readonly initialStylePreset?: StylePresetId;
  readonly initialLayerStage?: BrushLayerStage;
  readonly onContiGenerated?: (report: ScriptToContiReport) => void;
  readonly onStyleHarmonized?: (report: StyleHarmonizationReport) => void;
  readonly onBrushRecommended?: (report: SmartBrushRecommendationReport) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const SELECT_CLS = `min-h-11 w-full rounded-lg border border-line bg-raised px-2.5 py-2 text-xs text-fg transition-colors motion-reduce:transition-none hover:border-line-strong ${FOCUS_RING}`;

const HARMONIZER_TILE_W = 120;
const HARMONIZER_TILE_H = 96;
const HARMONIZER_DIVIDER_W = 2;
const HARMONIZER_STRIP_W = HARMONIZER_TILE_W * 3 + HARMONIZER_DIVIDER_W * 2;

function paintRgbaToCanvas(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.createImageData !== "function" || typeof ctx.putImageData !== "function") return;
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);
}

/** 온디바이스 화풍 DNA 일치화 · 대본 자동 콘티 · 스마트 브러시 추천 스튜디오 패널. */
export function StudioAiLatentStoryboardPanel({
  locale,
  className,
  initialTab = "conti",
  initialStylePreset = "sunset-slice-of-life",
  initialLayerStage = "lineart",
  onContiGenerated,
  onStyleHarmonized,
  onBrushRecommended,
}: StudioAiLatentStoryboardPanelProps): ReactElement {
  const uid = useId();
  const storeLang = useI18n((s) => s.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<AiLatentStoryboardTab>(initialTab);
  const [scriptText, setScriptText] = useState<string>(SCRIPT_CONTI_PRESETS[0]!.script);

  const [stylePreset, setStylePreset] = useState<StylePresetId>(initialStylePreset);
  const [colorStrengthPct, setColorStrengthPct] = useState<number>(88);
  const [lutStrengthPct, setLutStrengthPct] = useState<number>(84);
  const [lineartSyncPct, setLineartSyncPct] = useState<number>(72);
  const [screentoneBlendPct, setScreentoneBlendPct] = useState<number>(40);

  const [telemetry, setTelemetry] = useState<SmartBrushTelemetryInput>(
    SMART_BRUSH_TELEMETRY_PRESETS[initialLayerStage],
  );
  const harmonizerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const contiReport = useMemo<ScriptToContiReport>(() => parseKoreanScriptToConti(scriptText), [scriptText]);

  const styleFixtures = useMemo(
    () => createStyleHarmonizerDemoFixtures(stylePreset, HARMONIZER_TILE_W, HARMONIZER_TILE_H),
    [stylePreset],
  );
  const referenceStyleDna = useMemo(
    () => extractStyleDnaFromRgba(styleFixtures.reference),
    [styleFixtures.reference],
  );
  const harmonizationReport = useMemo<StyleHarmonizationReport>(
    () =>
      harmonizeBackgroundToStyleDna(referenceStyleDna, styleFixtures.target3d, {
        colorStrength: colorStrengthPct / 100,
        lutStrength: lutStrengthPct / 100,
        lineartSyncStrength: lineartSyncPct / 100,
        screentoneBlend: screentoneBlendPct / 100,
      }),
    [colorStrengthPct, lineartSyncPct, lutStrengthPct, referenceStyleDna, screentoneBlendPct, styleFixtures.target3d],
  );

  const brushReport = useMemo<SmartBrushRecommendationReport>(() => recommendSmartBrushes(telemetry), [telemetry]);

  useEffect(() => {
    onContiGenerated?.(contiReport);
  }, [contiReport, onContiGenerated]);

  useEffect(() => {
    onStyleHarmonized?.(harmonizationReport);
  }, [harmonizationReport, onStyleHarmonized]);

  useEffect(() => {
    onBrushRecommended?.(brushReport);
  }, [brushReport, onBrushRecommended]);

  useEffect(() => {
    if (activeTab !== "harmonizer") return;
    const strip = renderStyleComparisonStripRgba(
      styleFixtures.reference,
      styleFixtures.target3d,
      harmonizationReport.harmonizedBuffer,
      HARMONIZER_DIVIDER_W,
    );
    paintRgbaToCanvas(harmonizerCanvasRef.current, strip.data, strip.width, strip.height);
  }, [activeTab, harmonizationReport.harmonizedBuffer, styleFixtures.reference, styleFixtures.target3d]);

  const handleApplyOneClickHarmonize = useCallback(() => {
    setColorStrengthPct(92);
    setLutStrengthPct(88);
    setLineartSyncPct(78);
    setScreentoneBlendPct(45);
  }, []);

  const handleResetHarmonizer = useCallback(() => {
    setColorStrengthPct(0);
    setLutStrengthPct(0);
    setLineartSyncPct(0);
    setScreentoneBlendPct(0);
  }, []);

  const handleSelectLayerStage = useCallback((stage: BrushLayerStage) => {
    setTelemetry(SMART_BRUSH_TELEMETRY_PRESETS[stage]);
  }, []);

  const tabs: readonly { readonly id: AiLatentStoryboardTab; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "conti", label: pick("대본 → 세로 콘티", "Script → Conti"), icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "harmonizer", label: pick("화풍 DNA 일치화", "Style DNA Match"), icon: <Palette className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "brush", label: pick("스마트 브러시 · 종이결", "Smart Brush & Paper"), icon: <Brush className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const activeStyleMeta = STYLE_HARMONIZER_PRESETS.find((p) => p.id === stylePreset) ?? STYLE_HARMONIZER_PRESETS[0]!;

  return (
    <section
      data-testid="ai-latent-storyboard-panel"
      aria-label={pick(
        "온디바이스 화풍 DNA 일치화 · 대본 자동 콘티 · 스마트 브러시 추천기",
        "On-Device Style DNA Harmonizer, Script-to-Conti & Smart Brush Recommender",
      )}
      className={`space-y-4 rounded-xl border border-border bg-panel p-4 text-foreground [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("온디바이스 AI 화풍 DNA · 세로 콘티 · 스마트 브러시", "On-Device Style DNA · Vertical Conti · Smart Brush")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "외부 유료 API 없이 기기 안에서 대본 세로 콘티 변환, 3D 배경 화풍 일치화(ΔE00), 레이어별 브러시·종이결 추천을 실행합니다.",
              "Deterministic on-device script-to-conti parsing, OKLCH/LUT style DNA harmonization (ΔE00), and context-aware brush pairing.",
            )}
          </p>
        </div>

        <span
          data-testid="badge-ondevice-zero-cost"
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-good/40 bg-good/15 px-2.5 py-1 text-xs font-semibold text-good"
        >
          <Cpu className="h-3 w-3" aria-hidden="true" />
          {pick("온디바이스 100% · API ₩0", "100% On-Device · $0 API")}
        </span>
      </header>

      <div role="tablist" aria-label={pick("기능 전환 탭", "Feature tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BASE} ${
              activeTab === tab.id
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "conti" && (
        <div role="tabpanel" id={`${uid}-panel-conti`} aria-labelledby={`${uid}-tab-conti`} data-testid="panel-conti" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {SCRIPT_CONTI_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`preset-script-${preset.id}`} onClick={() => setScriptText(preset.script)} className={BTN_OUTLINE}>
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${uid}-script-input`} className="block text-xs font-medium text-fg-2">
              {pick('한국어 대본·웹소설 입력 ("대사", (지문), [장면 전환], SFX: 콰광!, 속마음: ...)', "Korean Script / Webnovel Input")}
            </label>
            <textarea
              id={`${uid}-script-input`}
              data-testid="conti-script-textarea"
              rows={5}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              className={`w-full rounded-lg border border-line bg-raised px-3 py-2 text-xs leading-relaxed text-fg ${FOCUS_RING}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
            <MetricCard label={pick("자동 분할 컷 수", "Generated Cuts")} value={`${contiReport.cuts.length}${pick("컷", " cuts")} (${contiReport.sceneCount}${pick("씬", " sc")})`} testId="conti-cut-count" toneClass="text-accent" />
            <MetricCard label={pick("예상 독자 스크롤", "Est. Scroll Time")} value={`${contiReport.totalEstimatedScrollSec}${pick("초", "s")}`} testId="conti-scroll-sec" toneClass="text-cool" />
            <MetricCard label={pick("총 세로 길이 · 평균 거터", "Total Height · Gutter")} value={`${contiReport.totalHeightPx}px · ${contiReport.averageGutterPx}px`} testId="conti-total-height" />
            <MetricCard label={pick("텍스트 과밀 경고", "Overcrowding Alerts")} value={`${contiReport.warnings.length}${pick("건", "")}`} testId="conti-warning-count" toneClass={contiReport.warnings.length > 0 ? "text-warn" : "text-good"} />
          </div>

          <div className="space-y-2" data-testid="conti-cut-list">
            {contiReport.cuts.map((cut, idx) => (
              <ContiCutCard key={cut.cutId} cut={cut} isLast={idx === contiReport.cuts.length - 1} pick={pick} />
            ))}
          </div>
        </div>
      )}

      {activeTab === "harmonizer" && (
        <div role="tabpanel" id={`${uid}-panel-harmonizer`} aria-labelledby={`${uid}-tab-harmonizer`} data-testid="panel-harmonizer" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor={`${uid}-style-preset`} className="block text-xs font-medium text-fg-2">
                {pick("작가 기준 컷 화풍 DNA 프리셋", "Reference Cut Style DNA Preset")}
              </label>
              <select id={`${uid}-style-preset`} data-testid="select-style-preset" value={stylePreset} onChange={(e) => setStylePreset(e.target.value as StylePresetId)} className={SELECT_CLS}>
                {STYLE_HARMONIZER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {isEn ? preset.labelEn : `${preset.labelKo} — ${preset.summaryKo}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="button" data-testid="btn-oneclick-harmonize" onClick={handleApplyOneClickHarmonize} className={`${BTN_PRIMARY} flex-1`}>
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("1클릭 일치화", "1-Click Match")}
              </button>
              <button type="button" data-testid="btn-reset-harmonize" onClick={handleResetHarmonizer} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("원본", "Raw")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <RangeSliderRow id={`${uid}-color-strength`} testId="slider-color-strength" label={pick("OKLCH 색조 일치", "OKLCH Match")} valueText={`${colorStrengthPct}%`} min={0} max={100} step={5} value={colorStrengthPct} onChange={setColorStrengthPct} />
            <RangeSliderRow id={`${uid}-lut-strength`} testId="slider-lut-strength" label={pick("3D LUT 톤 커브", "3D LUT Curve")} valueText={`${lutStrengthPct}%`} min={0} max={100} step={5} value={lutStrengthPct} onChange={setLutStrengthPct} />
            <RangeSliderRow id={`${uid}-lineart-sync`} testId="slider-lineart-sync" label={pick("선화 굵기 동기화", "Line Width Sync")} valueText={`${lineartSyncPct}%`} min={0} max={100} step={5} value={lineartSyncPct} onChange={setLineartSyncPct} />
            <RangeSliderRow id={`${uid}-screentone-blend`} testId="slider-screentone-blend" label={pick("스크린톤 피치", "Screentone Blend")} valueText={`${screentoneBlendPct}%`} min={0} max={100} step={5} value={screentoneBlendPct} onChange={setScreentoneBlendPct} />
          </div>

          <figure className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg">
                {pick(`3분할 실시간 비교 — ${activeStyleMeta.labelKo}`, `3-Way Comparison — ${activeStyleMeta.labelEn}`)}
              </span>
              <span className="text-fg-3">{pick("좌: 기준 컷 DNA · 중: 보정 전 3D 배경 · 우: 1클릭 일치화", "Left: Ref · Mid: 3D Raw · Right: Harmonized")}</span>
            </div>
            <canvas
              ref={harmonizerCanvasRef}
              width={HARMONIZER_STRIP_W}
              height={HARMONIZER_TILE_H}
              role="img"
              data-testid="style-harmonizer-canvas"
              aria-label={pick("기준 컷 화풍 DNA, 보정 전 3D 배경, 일치화 결과 3분할 비교 캔버스", "Reference cut, unadjusted 3D background, and harmonized output comparison canvas")}
              className="h-36 w-full rounded-md border border-line bg-canvas object-cover"
            />
            <figcaption className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4" aria-live="polite">
              <MetricCard label={pick("보정 전 ΔE00", "Before ΔE00")} value={`${harmonizationReport.meanDeltaE00Before}`} testId="harmonizer-delta-before" toneClass="text-warn" />
              <MetricCard label={pick("보정 후 ΔE00", "After ΔE00")} value={`${harmonizationReport.meanDeltaE00After}`} testId="harmonizer-delta-after" toneClass="text-good" />
              <MetricCard label={pick("ΔE00 거리 축소율", "ΔE00 Reduction")} value={`-${harmonizationReport.deltaE00Reduction} (${harmonizationReport.deltaE00ReductionPct}%)`} testId="harmonizer-delta-reduction" toneClass="text-accent" />
              <MetricCard label={pick("3D LUT · 선화 오차", "3D LUT · Line Err")} value={`${harmonizationReport.lutGridSize}³ · ${harmonizationReport.lineartWidthErrorAfterPx}px`} testId="harmonizer-line-error" />
            </figcaption>
          </figure>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="style-dna-summary">
            <MetricCard label={pick("그림자 OKLCH 색조", "Shadow OKLCH Hue")} value={`${Math.round(referenceStyleDna.shadowOklch.h)}° · C ${referenceStyleDna.shadowOklch.c.toFixed(3)}`} />
            <MetricCard label={pick("하이라이트 색온도", "Highlight Temp")} value={`${referenceStyleDna.highlightTempKelvin}K (${referenceStyleDna.highlightTempBias})`} />
            <MetricCard label={pick("선화 굵기 분포", "Line Width Mean")} value={`${referenceStyleDna.lineartWidthDistribution.meanPx}px (p90 ${referenceStyleDna.lineartWidthDistribution.p90Px}px)`} />
            <MetricCard label={pick("채도 대역 · 스크린톤", "Chroma · Tone")} value={`${referenceStyleDna.chromaBand.bandLabelKo} · ${referenceStyleDna.screentonePitch.detected ? `${referenceStyleDna.screentonePitch.pitchPx}px` : pick("없음", "None")}`} />
          </div>
        </div>
      )}

      {activeTab === "brush" && (
        <div role="tabpanel" id={`${uid}-panel-brush`} aria-labelledby={`${uid}-tab-brush`} data-testid="panel-brush" className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-fg-2">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("작업 레이어 단계 선택", "Working Layer Stage")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BRUSH_LAYER_STAGES.map((stage) => {
                const active = telemetry.layerStage === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    data-testid={`stage-btn-${stage.id}`}
                    aria-pressed={active}
                    onClick={() => handleSelectLayerStage(stage.id)}
                    className={`min-h-11 cursor-pointer rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                      active ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
                    }`}
                  >
                    {isEn ? stage.labelEn : stage.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <RangeSliderRow id={`${uid}-stroke-speed`} testId="slider-stroke-speed" label={pick("스트로크 속도", "Stroke Speed")} valueText={`${telemetry.strokeSpeedPxPerSec} px/s`} min={80} max={2000} step={20} value={telemetry.strokeSpeedPxPerSec} onChange={(v) => setTelemetry((prev) => ({ ...prev, strokeSpeedPxPerSec: v }))} />
            <RangeSliderRow id={`${uid}-pressure-var`} testId="slider-pressure-var" label={pick("필압 분산", "Pressure Variance")} valueText={telemetry.pressureVariance.toFixed(2)} min={0.01} max={0.32} step={0.01} value={telemetry.pressureVariance} onChange={(v) => setTelemetry((prev) => ({ ...prev, pressureVariance: v }))} />
            <RangeSliderRow id={`${uid}-curvature`} testId="slider-curvature" label={pick("스트로크 곡률", "Stroke Curvature")} valueText={telemetry.meanCurvature.toFixed(2)} min={0.05} max={0.95} step={0.05} value={telemetry.meanCurvature} onChange={(v) => setTelemetry((prev) => ({ ...prev, meanCurvature: v }))} />
            <RangeSliderRow id={`${uid}-canvas-zoom`} testId="slider-canvas-zoom" label={pick("캔버스 줌", "Canvas Zoom")} valueText={`${telemetry.canvasZoomPct}%`} min={40} max={400} step={10} value={telemetry.canvasZoomPct} onChange={(v) => setTelemetry((prev) => ({ ...prev, canvasZoomPct: v }))} />
          </div>

          <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs text-fg-2" data-testid="brush-context-summary" aria-live="polite">
            {brushReport.detectedStyleSummaryKo}
          </div>

          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="brush-top3-list">
            {brushReport.top3.map((item) => (
              <li key={item.brush.brushId} data-testid={`brush-rank-${item.rank}`} className={`space-y-2.5 rounded-lg border p-3 text-xs ${item.rank === 1 ? "border-accent bg-card" : "border-line bg-card"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 font-bold text-accent tabular-nums">TOP {item.rank}</span>
                      <span className="font-semibold text-fg">{isEn ? item.brush.nameEn : item.brush.nameKo}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-fg-3">{item.brush.strengthSummaryKo}</div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-good/40 bg-good/15 px-2 py-0.5 font-semibold text-good tabular-nums">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {item.matchScore}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 rounded-md border border-line bg-raised p-2 text-center tabular-nums">
                  <div>
                    <div className="text-[10px] text-fg-3">{pick("크기", "Size")}</div>
                    <div className="font-semibold text-fg">{item.dynamicSettings.sizePx}px</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-fg-3">{pick("보정", "Stab")}</div>
                    <div className="font-semibold text-fg">{item.dynamicSettings.stabilizationPct}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-fg-3">{pick("농도", "Flow")}</div>
                    <div className="font-semibold text-fg">{item.dynamicSettings.opacityPct}%</div>
                  </div>
                </div>

                <div className="space-y-1 rounded-md border border-cool/40 bg-cool/15 p-2 text-fg">
                  <div className="flex items-center gap-1 font-semibold text-cool">
                    <AudioLines className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pick("Wave 37A 마찰음 · 종이결 페어링", "Wave 37A Friction & Paper")}</span>
                  </div>
                  <div className="text-[11px] text-fg">
                    {item.wave37aPairing.frictionMediumLabelKo} × {item.wave37aPairing.paperTextureLabelKo}
                  </div>
                  <div className="text-[11px] text-fg-2">
                    Foley: {item.wave37aPairing.foleyPresetLabelKo} · {item.wave37aPairing.pairingRationaleKo}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
