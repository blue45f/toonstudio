/**
 * 온디바이스 WebNN 선화 보정 · WASM-SIMD Kubelka-Munk 물리 혼색 · 컷 연출·대사 어시스트 통합 패널.
 *
 * Calm Atelier 시맨틱 토큰 전용 · 원시 색상 표현 0건 · 모든 props optional · 한국어 기본 / 영어 선택 지원.
 */

import {
  Activity,
  CheckCircle2,
  Cpu,
  Droplets,
  Film,
  Palette,
  PenTool,
  RotateCcw,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  analyzeWebtoonCutDirection,
  applyDirectorAutoAssist,
  CUT_DIRECTOR_DEMO_SCENES,
  SHOT_SIZE_META_KO,
  type CutDirectorDiagnosisReport,
  type CutSceneInput,
  type ShotSize,
} from "./ondevice-cut-director";
import {
  blendPigmentBatchSimd,
  findPigmentPreset,
  mixPigmentsKubelkaMunk,
  PIGMENT_PRESETS,
  probeWasmSimdPigmentRuntime,
  renderPigmentMixPreviewRgba,
  SPECTRAL_BAND_NM,
  type KubelkaMunkMixResult,
  type PigmentPresetId,
} from "./wasm-simd-kubelka-munk";
import {
  createRoughLineartDemoFixture,
  renderLineartComparisonRgba,
  stabilizeRoughLineart,
  type LineartStabilizationReport,
} from "./webnn-lineart-stabilizer";

export type WebnnPigmentDirectorTab = "pigment" | "lineart" | "director";

export interface StudioWebnnPigmentDirectorPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: WebnnPigmentDirectorTab;
  readonly initialPigmentA?: PigmentPresetId;
  readonly initialPigmentB?: PigmentPresetId;
  readonly initialMixRatioPct?: number;
  readonly initialGapThresholdPx?: number;
  readonly onPigmentMixed?: (result: KubelkaMunkMixResult) => void;
  readonly onLineartStabilized?: (report: LineartStabilizationReport) => void;
  readonly onDirectorAnalyzed?: (report: CutDirectorDiagnosisReport) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const SELECT_CLS = `min-h-11 w-full rounded-lg border border-line bg-raised px-2.5 py-2 text-xs text-fg transition-colors motion-reduce:transition-none hover:border-line-strong ${FOCUS_RING}`;

const PIGMENT_CANVAS_W = 360;
const PIGMENT_CANVAS_H = 152;
const LINEART_CANVAS_W = 360;
const LINEART_CANVAS_H = 180;
const SHOT_ORDER: readonly ShotSize[] = ["WS", "MS", "CU", "ECU"];

function paintRgbaToCanvas(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.createImageData !== "function" || typeof ctx.putImageData !== "function") return;
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
}

function scoreToneClass(score: number): string {
  if (score >= 82) return "border-good/40 bg-good/15 text-good";
  if (score >= 60) return "border-warn/40 bg-warn/15 text-warn";
  return "border-bad/40 bg-bad/15 text-bad";
}

function RangeSliderField({
  id,
  testId,
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly valueText: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex justify-between text-xs text-fg-2">
        <span>{label}</span>
        <span className="font-semibold text-fg tabular-nums">{valueText}</span>
      </label>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

function MetricTile({
  label,
  value,
  testId,
  toneClass = "text-fg",
}: {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
  readonly toneClass?: string;
}): ReactElement {
  return (
    <div className="rounded-md border border-line bg-raised p-2">
      <div className="text-fg-3">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${toneClass}`} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

/** 온디바이스 WebNN 선화 보정 · Kubelka-Munk 물리 혼색 · 컷 연출 어시스트 스튜디오 패널. */
export function StudioWebnnPigmentDirectorPanel({
  locale,
  className,
  initialTab = "pigment",
  initialPigmentA = "ultramarine-blue",
  initialPigmentB = "cadmium-yellow",
  initialMixRatioPct = 50,
  initialGapThresholdPx = 18,
  onPigmentMixed,
  onLineartStabilized,
  onDirectorAnalyzed,
}: StudioWebnnPigmentDirectorPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<WebnnPigmentDirectorTab>(initialTab);
  const [pigmentA, setPigmentA] = useState<PigmentPresetId>(initialPigmentA);
  const [pigmentB, setPigmentB] = useState<PigmentPresetId>(initialPigmentB);
  const [mixRatioPct, setMixRatioPct] = useState<number>(Math.max(10, Math.min(90, initialMixRatioPct)));
  const [wetBackrunPct, setWetBackrunPct] = useState<number>(35);
  const [sedimentationPct, setSedimentationPct] = useState<number>(40);

  const [smoothingPct, setSmoothingPct] = useState<number>(74);
  const [gapThresholdPx, setGapThresholdPx] = useState<number>(Math.max(0, Math.min(32, initialGapThresholdPx)));
  const [curvatureAdaptPct, setCurvatureAdaptPct] = useState<number>(75);

  const [scenes, setScenes] = useState<readonly CutSceneInput[]>(CUT_DIRECTOR_DEMO_SCENES);
  const [autoAssistApplied, setAutoAssistApplied] = useState<boolean>(false);

  const pigmentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lineartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const wasmRuntime = useMemo(() => probeWasmSimdPigmentRuntime(), []);
  const rawLineartDemo = useMemo(() => createRoughLineartDemoFixture(), []);

  const pigmentResult = useMemo<KubelkaMunkMixResult>(() => {
    const ratioB = mixRatioPct / 100;
    return mixPigmentsKubelkaMunk(
      [
        { pigmentId: pigmentA, ratio: 1 - ratioB },
        { pigmentId: pigmentB, ratio: ratioB },
      ],
      { wetBackrun: wetBackrunPct / 100, sedimentation: sedimentationPct / 100, layerThickness: 2.3 },
    );
  }, [mixRatioPct, pigmentA, pigmentB, sedimentationPct, wetBackrunPct]);

  const batchSample = useMemo(() => {
    const ratios = new Float32Array(128);
    for (let i = 0; i < 128; i += 1) ratios[i] = i / 127;
    return blendPigmentBatchSimd(pigmentA, pigmentB, ratios);
  }, [pigmentA, pigmentB]);

  const lineartReport = useMemo<LineartStabilizationReport>(
    () =>
      stabilizeRoughLineart(rawLineartDemo, {
        smoothingStrength: smoothingPct / 100,
        gapClosingThresholdPx: gapThresholdPx,
        curvatureAdaptivity: curvatureAdaptPct / 100,
      }),
    [curvatureAdaptPct, gapThresholdPx, rawLineartDemo, smoothingPct],
  );

  const directorReport = useMemo<CutDirectorDiagnosisReport>(() => analyzeWebtoonCutDirection(scenes), [scenes]);

  useEffect(() => {
    onPigmentMixed?.(pigmentResult);
  }, [onPigmentMixed, pigmentResult]);

  useEffect(() => {
    onLineartStabilized?.(lineartReport);
  }, [lineartReport, onLineartStabilized]);

  useEffect(() => {
    onDirectorAnalyzed?.(directorReport);
  }, [directorReport, onDirectorAnalyzed]);

  useEffect(() => {
    if (activeTab !== "pigment") return;
    const rgba = renderPigmentMixPreviewRgba(
      pigmentA,
      pigmentB,
      mixRatioPct / 100,
      { wetBackrun: wetBackrunPct / 100, sedimentation: sedimentationPct / 100, layerThickness: 2.3 },
      PIGMENT_CANVAS_W,
      PIGMENT_CANVAS_H,
    );
    paintRgbaToCanvas(pigmentCanvasRef.current, rgba, PIGMENT_CANVAS_W, PIGMENT_CANVAS_H);
  }, [activeTab, mixRatioPct, pigmentA, pigmentB, sedimentationPct, wetBackrunPct]);

  useEffect(() => {
    if (activeTab !== "lineart") return;
    const rgba = renderLineartComparisonRgba(rawLineartDemo, lineartReport, LINEART_CANVAS_W, LINEART_CANVAS_H);
    paintRgbaToCanvas(lineartCanvasRef.current, rgba, LINEART_CANVAS_W, LINEART_CANVAS_H);
  }, [activeTab, lineartReport, rawLineartDemo]);

  const handleResetLineart = useCallback(() => {
    setSmoothingPct(74);
    setGapThresholdPx(18);
    setCurvatureAdaptPct(75);
  }, []);

  const handleFirstBalloonEdit = useCallback((nextText: string) => {
    setAutoAssistApplied(false);
    setScenes((prev) =>
      prev.map((cut, cIdx) =>
        cIdx !== 0 ? cut : { ...cut, balloons: cut.balloons.map((b, bIdx) => (bIdx === 0 ? { ...b, text: nextText } : b)) },
      ),
    );
  }, []);

  const handleFirstCutShotChange = useCallback((nextShot: ShotSize) => {
    setAutoAssistApplied(false);
    setScenes((prev) => prev.map((cut, cIdx) => (cIdx === 0 ? { ...cut, shotSize: nextShot } : cut)));
  }, []);

  const handleApplyAutoAssist = useCallback(() => {
    setScenes((prev) => applyDirectorAutoAssist(prev));
    setAutoAssistApplied(true);
  }, []);

  const handleResetDirectorDemo = useCallback(() => {
    setScenes(CUT_DIRECTOR_DEMO_SCENES);
    setAutoAssistApplied(false);
  }, []);

  const presetA = findPigmentPreset(pigmentA);
  const presetB = findPigmentPreset(pigmentB);
  const firstCut = scenes[0] ?? CUT_DIRECTOR_DEMO_SCENES[0]!;
  const firstBalloonText = firstCut.balloons[0]?.text ?? "";

  const webnnBadgeLabel =
    lineartReport.backend === "cpu-simd-typedarray"
      ? pick("CPU SIMD-정렬 폴백", "CPU SIMD-Aligned Fallback")
      : `WebNN (${lineartReport.backend.replace("webnn-", "").toUpperCase()})`;
  const wasmBadgeLabel = wasmRuntime.simd128Supported ? "WASM-SIMD128" : pick("TypedArray 폴백", "TypedArray Fallback");

  const tabs: readonly { readonly id: WebnnPigmentDirectorTab; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "pigment", label: pick("Kubelka-Munk 물리 혼색", "Kubelka-Munk Mix"), icon: <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "lineart", label: pick("WebNN 선화 보정", "WebNN Lineart"), icon: <PenTool className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "director", label: pick("온디바이스 컷·대사 어시스트", "Cut & Dialogue Assist"), icon: <Film className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  return (
    <section
      data-testid="webnn-pigment-director-panel"
      aria-label={pick(
        "온디바이스 WebNN 선화 보정 · 물리 혼색 · 컷 연출 어시스트",
        "On-Device WebNN Lineart, Kubelka-Munk Pigment & Cut Director",
      )}
      className={`space-y-4 rounded-xl border border-border bg-panel p-4 text-foreground [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("온디바이스 WebNN 선화 · 물리 혼색 · 컷 디렉터", "On-Device WebNN Lineart · Physical Mix · Cut Director")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "외부 전송 없이 기기 안에서 실시간 선화 정선화, Kubelka-Munk 안료 혼색, 컷·대사 진단을 실행합니다.",
              "Runs real-time lineart stabilization, Kubelka-Munk spectral mixing, and cut/dialogue coaching 100% on-device.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="badge-wasm-simd" className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good/15 px-2.5 py-1 text-xs font-semibold text-good">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            {wasmBadgeLabel}
          </span>
          <span data-testid="badge-webnn-backend" className="inline-flex items-center gap-1 rounded-full border border-cool/40 bg-cool/15 px-2.5 py-1 text-xs font-semibold text-cool">
            <Activity className="h-3 w-3" aria-hidden="true" />
            {webnnBadgeLabel}
          </span>
          <span data-testid="badge-ondevice-privacy" className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2">
            {pick("로컬 100% · 외부 전송 0", "100% Local · Zero Upload")}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("워크벤치 전환", "Workbench selector")} className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`${uid}-panel-${t.id}`}
            data-testid={`tab-${t.id}`}
            className={`${TAB_BASE} ${
              activeTab === t.id
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "pigment" && (
        <div role="tabpanel" id={`${uid}-panel-pigment`} aria-labelledby={`${uid}-tab-pigment`} data-testid="panel-pigment" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-pigment-a`} className="block text-xs font-medium text-fg-2">
                {pick("기준 안료 A", "Primary Pigment A")}
              </label>
              <select id={`${uid}-pigment-a`} data-testid="select-pigment-a" value={pigmentA} onChange={(e) => setPigmentA(e.target.value as PigmentPresetId)} className={SELECT_CLS}>
                {PIGMENT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isEn ? `${p.nameEn} (${p.colorIndexCode})` : `${p.nameKo} (${p.colorIndexCode})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-pigment-b`} className="block text-xs font-medium text-fg-2">
                {pick("혼합 안료 B", "Secondary Pigment B")}
              </label>
              <select id={`${uid}-pigment-b`} data-testid="select-pigment-b" value={pigmentB} onChange={(e) => setPigmentB(e.target.value as PigmentPresetId)} className={SELECT_CLS}>
                {PIGMENT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isEn ? `${p.nameEn} (${p.colorIndexCode})` : `${p.nameKo} (${p.colorIndexCode})`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RangeSliderField id={`${uid}-mix-ratio`} testId="slider-mix-ratio" label={pick("안료 B 비율", "Pigment B Ratio")} valueText={`${mixRatioPct}%`} min={10} max={90} step={5} value={mixRatioPct} onChange={setMixRatioPct} />
            <RangeSliderField id={`${uid}-wet-backrun`} testId="slider-wet-backrun" label={pick("습윤 백런", "Wet Backrun")} valueText={`${wetBackrunPct}%`} min={0} max={100} step={5} value={wetBackrunPct} onChange={setWetBackrunPct} />
            <RangeSliderField id={`${uid}-sediment`} testId="slider-sedimentation" label={pick("안료 침전", "Sedimentation")} valueText={`${sedimentationPct}%`} min={0} max={100} step={5} value={sedimentationPct} onChange={setSedimentationPct} />
          </div>

          <figure className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg">
                {pick(`실시간 광학 혼색 비교 — ${presetA.nameKo} + ${presetB.nameKo}`, `Live Optical Mix — ${presetA.nameEn} + ${presetB.nameEn}`)}
              </span>
              <span className="text-fg-3">{pick("상단: Kubelka-Munk(8-밴드) · 하단: 단순 RGB 선형", "Top: Kubelka-Munk 8-Band · Bottom: Naive RGB")}</span>
            </div>
            <canvas
              ref={pigmentCanvasRef}
              width={PIGMENT_CANVAS_W}
              height={PIGMENT_CANVAS_H}
              role="img"
              data-testid="km-pigment-canvas"
              aria-label={pick(
                `${presetA.nameKo}와 ${presetB.nameKo}의 Kubelka-Munk 물리 혼색 대 단순 RGB 비교 캔버스`,
                `Kubelka-Munk vs naive RGB mixing preview for ${presetA.nameEn} and ${presetB.nameEn}`,
              )}
              className="h-36 w-full rounded-md border border-line bg-canvas object-cover"
            />
            <figcaption className="grid grid-cols-2 gap-2 pt-1 text-xs sm:grid-cols-4">
              <MetricTile label={pick("KM 물리 색상각·채도", "KM Hue · Sat")} value={`${pigmentResult.kmHueDeg}° · ${pigmentResult.kmSaturationPct}%`} testId="km-hue-sat" toneClass="text-good" />
              <MetricTile label={pick("단순 RGB 색상각·채도", "RGB Hue · Sat")} value={`${pigmentResult.rgbHueDeg}° · ${pigmentResult.rgbSaturationPct}%`} testId="rgb-hue-sat" toneClass="text-fg-2" />
              <MetricTile label={pick("지각 색차 ΔE00 / ΔE76", "Delta-E00 / E76")} value={`${pigmentResult.deltaE2000} / ${pigmentResult.deltaE76}`} testId="km-delta-e" toneClass="text-accent" />
              <MetricTile label={pick("배치 처리량", "Batch Speed")} value={`${batchSample.pixelsPerMs} px/ms`} testId="km-batch-speed" />
            </figcaption>
          </figure>

          <div className="rounded-lg border border-line bg-card p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">{pick("8-밴드 스펙트럴 반사율 곡선 (415nm–665nm)", "8-Band Spectral Reflectance (415–665nm)")}</span>
              <span className="text-fg-3 tabular-nums">
                {pick("채도 이득", "Chroma Gain")}: {pigmentResult.chromaGain >= 0 ? "+" : ""}
                {pigmentResult.chromaGain}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {SPECTRAL_BAND_NM.map((nm, idx) => (
                <div key={nm} className="flex flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end rounded bg-raised p-0.5">
                    <div
                      className="w-full rounded-sm bg-accent transition-[height] motion-reduce:transition-none"
                      style={{ height: `${Math.max(8, Math.round((pigmentResult.spectralReflectance[idx] ?? 0) * 100))}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-fg-3 tabular-nums">{nm}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "lineart" && (
        <div role="tabpanel" id={`${uid}-panel-lineart`} aria-labelledby={`${uid}-tab-lineart`} data-testid="panel-lineart" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RangeSliderField id={`${uid}-smooth-strength`} testId="slider-smoothing" label={pick("떨림 보정 강도", "Jitter Smoothing")} valueText={`${smoothingPct}%`} min={0} max={100} step={2} value={smoothingPct} onChange={setSmoothingPct} />
            <RangeSliderField id={`${uid}-gap-threshold`} testId="slider-gap-threshold" label={pick("열린 틈 닫기 반경", "Gap Close Radius")} valueText={`${gapThresholdPx} px`} min={0} max={32} step={2} value={gapThresholdPx} onChange={setGapThresholdPx} />
            <RangeSliderField id={`${uid}-curvature-adapt`} testId="slider-curvature-adapt" label={pick("곡률 적응 정밀도", "Curvature Adaptivity")} valueText={`${curvatureAdaptPct}%`} min={0} max={100} step={5} value={curvatureAdaptPct} onChange={setCurvatureAdaptPct} />
          </div>

          <figure className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg">{pick("좌: 러프 선화 원본 · 우: Catmull-Rom 베지어 정선화", "Left: Rough Sketch · Right: Stabilized Bézier Ink")}</span>
              <button type="button" className={BTN_OUTLINE} onClick={handleResetLineart}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("권장값 복원", "Reset")}
              </button>
            </div>
            <canvas
              ref={lineartCanvasRef}
              width={LINEART_CANVAS_W}
              height={LINEART_CANVAS_H}
              role="img"
              data-testid="webnn-lineart-canvas"
              aria-label={pick("러프 선화 원본과 WebNN 정선화·열린 틈 닫기 결과 비교 캔버스", "Comparison canvas of rough strokes and stabilized Bezier lineart with closed gaps")}
              className="h-44 w-full rounded-md border border-line bg-canvas object-contain"
            />
            <figcaption className="grid grid-cols-2 gap-2 pt-1 text-xs sm:grid-cols-4">
              <MetricTile label={pick("지터 감소율", "Jitter Reduction")} value={`${lineartReport.jitterReductionPct}%`} testId="lineart-jitter-reduction" toneClass="text-good" />
              <MetricTile label={pick("닫힌 틈 수", "Closed Gaps")} value={`${lineartReport.closedGapCount}${pick("곳", "")}`} testId="lineart-closed-gaps" toneClass="text-accent" />
              <MetricTile label={pick("정점 압축률", "Vertex Compression")} value={`${lineartReport.vertexCompressionPct}% (${lineartReport.inputPointCount}→${lineartReport.outputKnotCount})`} testId="lineart-compression" />
              <MetricTile label={pick("스트로크당 속도", "Per-Stroke Time")} value={`${lineartReport.avgMsPerStroke} ms`} testId="lineart-latency" toneClass="text-cool" />
            </figcaption>
          </figure>
        </div>
      )}

      {activeTab === "director" && (
        <div role="tabpanel" id={`${uid}-panel-director`} aria-labelledby={`${uid}-tab-director`} data-testid="panel-director" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor={`${uid}-balloon-editor`} className="block text-xs font-medium text-fg-2">
                {pick("1컷 대표 대사 실시간 점검", "Cut 1 Live Dialogue Check")}
              </label>
              <textarea
                id={`${uid}-balloon-editor`}
                data-testid="director-dialogue-input"
                rows={2}
                value={firstBalloonText}
                onChange={(e) => handleFirstBalloonEdit(e.target.value)}
                className={`w-full rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-shot-select`} className="block text-xs font-medium text-fg-2">
                {pick("1컷 샷 크기", "Cut 1 Shot Size")}
              </label>
              <select id={`${uid}-shot-select`} data-testid="director-shot-select" value={firstCut.shotSize} onChange={(e) => handleFirstCutShotChange(e.target.value as ShotSize)} className={SELECT_CLS}>
                {SHOT_ORDER.map((shot) => (
                  <option key={shot} value={shot}>
                    {shot} · {SHOT_SIZE_META_KO[shot].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
              <span data-testid="director-overall-score" className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold tabular-nums ${scoreToneClass(directorReport.overallScore)}`}>
                {pick("연출 종합", "Overall")} {directorReport.overallScore}
                {pick("점", "pt")}
              </span>
              <span className="rounded-full border border-line bg-card px-2.5 py-1 text-fg-2 tabular-nums">
                {pick("리듬", "Rhythm")} {directorReport.rhythmScore} · {pick("대사", "Dialogue")} {directorReport.dialogueNaturalnessScore} · {pick("시선", "EyeFlow")} {directorReport.eyeFlowScore}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="director-auto-assist-btn" className={BTN_PRIMARY} onClick={handleApplyAutoAssist}>
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("추천 대사·배치 자동 적용", "Apply Auto-Assist")}
              </button>
              <button type="button" data-testid="director-reset-btn" className={BTN_OUTLINE} onClick={handleResetDirectorDemo}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("데모 복원", "Reset Demo")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs">
            {SHOT_ORDER.map((shot) => (
              <div key={shot} className="rounded-md border border-line bg-card p-2 text-center">
                <div className="font-semibold text-fg">{shot}</div>
                <div className="mt-0.5 text-fg-2 tabular-nums">
                  {directorReport.shotDistribution.counts[shot]}
                  {pick("컷", "")} ({directorReport.shotDistribution.ratiosPct[shot]}%)
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3" data-testid="director-findings-list">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">{pick("온디바이스 진단 결과", "On-Device Diagnosis Findings")}</span>
              {autoAssistApplied && (
                <span className="inline-flex items-center gap-1 text-good">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {pick("자동 어시스트 반영 완료", "Auto-assist applied")}
                </span>
              )}
            </div>

            {directorReport.rhythmIssues.length === 0 &&
            directorReport.dialogueFindings.length === 0 &&
            directorReport.eyeFlowIssues.length === 0 ? (
              <p className="text-xs text-good" data-testid="director-all-clear">
                {pick("샷 리듬, 한국어 대사 자연스러움, 말풍선 시선 흐름 모두 안정 구간입니다.", "Shot rhythm, Korean dialogue naturalness, and eye-flow all look clean.")}
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {directorReport.dialogueFindings.map((finding) => (
                  <li key={`${finding.balloonId}-${finding.kind}`} className="rounded-md border border-warn/40 bg-warn/15 p-2.5 text-fg">
                    <div className="font-semibold text-warn">{finding.message}</div>
                    <div className="mt-1 text-fg-2">{pick("추천 대사", "Suggested")}: {finding.suggestedSplitBalloons.join(" / ")}</div>
                  </li>
                ))}
                {directorReport.eyeFlowIssues.map((issue) => (
                  <li key={`${issue.cutId}-${issue.toBalloonId}-${issue.kind}`} className="rounded-md border border-bad/40 bg-bad/15 p-2.5 text-fg">
                    <div className="font-semibold text-bad">{issue.message}</div>
                    <div className="mt-1 text-fg-2 tabular-nums">
                      {pick("권장 좌표", "Suggested pos")}: X {issue.suggestedPosition.xPct}% · Y {issue.suggestedPosition.yPct}%
                    </div>
                  </li>
                ))}
                {directorReport.rhythmIssues.map((issue, idx) => (
                  <li key={`${issue.kind}-${idx}`} className="rounded-md border border-line bg-raised p-2.5 text-fg">
                    <div className="font-semibold text-fg">{issue.message}</div>
                    <div className="mt-1 text-fg-2">{issue.recommendation}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
