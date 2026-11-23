/**
 * 차세대 드로잉 프런티어 통합 패널 (Wave 26A):
 * ① 비파괴 하이브리드 스트로크 · 실시간 건조 습도맵/드라이어 · 2D 법선 1-클릭 자동 셀음영
 * ② Linear-Float16(16-bit HDR) 무밴딩 합성 · 카메라 화각(24~85mm)/3분할/황금나선/아이레벨
 * ③ 말풍선 맞춤법·고유명사·글로벌 4대 심의 린터 · 스마트 심볼 뱅크(선택 전파·언링크 보호)
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 원시 색상 0건 · 명시적 transition 속성만 사용 · 모든 props 선택형 · KO/EN.
 */

import {
  Camera, CheckCircle2, Droplets, Flame, Layers, Link2, ShieldAlert, Sparkles, Sun, Unlink2, Wand2, Wind,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  ALL_COMPLIANCE_PLATFORMS, CAMERA_FOCAL_LENGTHS, DEMO_LINTER_SAMPLE_EN, DEMO_LINTER_SAMPLE_KO,
  DEMO_WEBTOON_GLOSSARY, applyLinterFixes, computeCameraCompositionOverlay, createDemoSmartPropBank,
  lintDialogueComplianceAndGlossary,
  type CameraFocalLengthMm, type CompliancePlatformId, type DialogueLintReport, type GlossaryEntry,
  type SmartPropSymbolBank, type SymbolPropagationReport,
} from "./camera-linter-prop-bank";
import {
  HYBRID_MEDIUM_LIST, HYBRID_MEDIUM_PROFILES, WetnessMapEngine, compositeLinearFloat16Layers,
  createDemoCharacterSilhouette, createDemoHdrGradientLayers, createDemoHybridStroke,
  generateAutoCelShadingLayers, rebindHybridStrokeMedium,
  type AutoCelShadingResult, type HybridStrokeMedium, type HybridStrokeRebindResult,
  type LightPinVector, type LinearFloat16CompositeResult, type WetnessMapSnapshot, type WetnessMediumMode,
} from "./hybrid-stroke-wetness-hdr";

export type NextgenFrontierTabId = "hybrid-wet-cel" | "hdr-camera" | "linter-symbols";
type CelPreviewMode = "composite" | "shadow" | "rim" | "bounce" | "normal";

export interface StudioNextgenDrawingFrontierSnapshot {
  readonly activeTab: NextgenFrontierTabId;
  readonly strokeResult: HybridStrokeRebindResult;
  readonly wetnessSnapshot: WetnessMapSnapshot;
  readonly celResult: AutoCelShadingResult;
  readonly hdrResult: LinearFloat16CompositeResult;
  readonly focalLengthMm: CameraFocalLengthMm;
  readonly lintReport: DialogueLintReport;
  readonly lastPropagation: SymbolPropagationReport | null;
}

export interface StudioNextgenDrawingFrontierPanelProps {
  readonly locale?: "ko" | "en";
  readonly initialTab?: NextgenFrontierTabId;
  readonly initialMedium?: HybridStrokeMedium;
  readonly initialFocalLengthMm?: CameraFocalLengthMm;
  readonly initialDialogue?: string;
  readonly glossary?: readonly GlossaryEntry[];
  readonly className?: string;
  readonly onSnapshotChange?: (snapshot: StudioNextgenDrawingFrontierSnapshot) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_BTN = "border-accent bg-accent text-on-accent";
const IDLE_BTN = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;

const WIDTH_SCALES: readonly number[] = [0.75, 1.0, 1.5, 2.0];
const EXPOSURE_STEPS: readonly number[] = [-0.5, 0, 0.6];
const LIGHT_PRESETS: readonly { readonly id: string; readonly ko: string; readonly en: string; readonly pin: LightPinVector }[] = [
  { id: "top-left", ko: "좌상단 광원", en: "Top-Left Key", pin: { lx: -0.9, ly: -0.45, lz: 0.65 } },
  { id: "top-right", ko: "우상단 광원", en: "Top-Right Key", pin: { lx: 0.9, ly: -0.45, lz: 0.65 } },
  { id: "front", ko: "정면 광원", en: "Front Key", pin: { lx: 0.05, ly: -0.25, lz: 0.96 } },
  { id: "low-rim", ko: "하단 역광", en: "Low Rim", pin: { lx: -0.6, ly: 0.8, lz: 0.4 } },
];
const CEL_MODES: readonly (readonly [CelPreviewMode, string, string])[] = [
  ["composite", "통합", "All"], ["shadow", "1차 그림자", "Shadow"], ["rim", "림라이트", "Rim"], ["bounce", "반사광", "Bounce"], ["normal", "법선맵", "Normal"],
];
const PLATFORM_LABELS: Record<CompliancePlatformId, readonly [string, string]> = {
  naver: ["네이버", "Naver"], kakao: ["카카오", "Kakao"], japan: ["일본(JP)", "Japan"], "north-america": ["북미(NA)", "North America"],
};

function KpiBox({ label, value, testId, tone = "fg" }: { readonly label: string; readonly value: string; readonly testId?: string; readonly tone?: "fg" | "good" }): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-canvas p-2 text-xs tabular-nums">
      <span className="block text-fg-3">{label}</span>
      <strong data-testid={testId} className={tone === "good" ? "text-good" : "text-fg"}>{value}</strong>
    </div>
  );
}

function RgbaCanvas({ width, height, rgba, label, className }: {
  readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray; readonly label: string; readonly className?: string;
}): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [height, rgba, width]);
  return <canvas ref={ref} width={width} height={height} aria-label={label} className={className ?? "h-20 w-full rounded-lg border border-line bg-canvas object-contain"} />;
}

function maskToPreviewRgba(mask: Uint8ClampedArray, tone: "shadow" | "rim" | "bounce"): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4);
  const c = tone === "shadow" ? [58, 68, 128] : tone === "rim" ? [246, 212, 126] : [118, 186, 232];
  for (let i = 0; i < mask.length; i += 1) {
    const o = i * 4;
    out[o] = c[0] ?? 128; out[o + 1] = c[1] ?? 128; out[o + 2] = c[2] ?? 128; out[o + 3] = mask[i] ?? 0;
  }
  return out;
}

function createSeededWetnessEngine(medium: WetnessMediumMode): WetnessMapEngine {
  const engine = new WetnessMapEngine({ width: 48, height: 32, medium });
  engine.depositWetStroke(16, 16, 8, medium === "watercolor" ? 0.92 : 0.68, { r: 46, g: 120, b: 196 });
  engine.depositWetStroke(30, 17, 7, medium === "watercolor" ? 0.84 : 0.62, { r: 196, g: 84, b: 102 });
  return engine;
}

/** 차세대 드로잉 프런티어 3탭 패널 (하이브리드 스트로크·건조기·자동 셀음영 / 16-bit HDR·카메라 / 심의 린터·스마트 심볼). */
export function StudioNextgenDrawingFrontierPanel({
  locale, initialTab = "hybrid-wet-cel", initialMedium = "watercolor", initialFocalLengthMm = 35,
  initialDialogue, glossary = DEMO_WEBTOON_GLOSSARY, className, onSnapshotChange,
}: StudioNextgenDrawingFrontierPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((s) => s.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<NextgenFrontierTabId>(initialTab);
  const [baseStroke] = useState(() => createDemoHybridStroke(initialMedium));
  const [medium, setMedium] = useState<HybridStrokeMedium>(initialMedium);
  const [widthScale, setWidthScale] = useState<number>(1.0);
  const [wetEngine] = useState(() => createSeededWetnessEngine("watercolor"));
  const [wetMedium, setWetMedium] = useState<WetnessMediumMode>("watercolor");
  const [wetSnapshot, setWetSnapshot] = useState<WetnessMapSnapshot>(() => wetEngine.getSnapshot());
  const [dryerBanner, setDryerBanner] = useState<string | null>(null);
  const [lightPresetId, setLightPresetId] = useState<string>("top-left");
  const [celPreviewMode, setCelPreviewMode] = useState<CelPreviewMode>("composite");
  const [exposureEv, setExposureEv] = useState<number>(0);
  const [enableDither, setEnableDither] = useState<boolean>(true);
  const [focalLengthMm, setFocalLengthMm] = useState<CameraFocalLengthMm>(initialFocalLengthMm);
  const [eyeLevelRatio01, setEyeLevelRatio01] = useState<number>(0.42);
  const [showThirds, setShowThirds] = useState<boolean>(true);
  const [showSpiral, setShowSpiral] = useState<boolean>(true);
  const [showEyeLevel, setShowEyeLevel] = useState<boolean>(true);
  const [dialogueText, setDialogueText] = useState<string>(() => initialDialogue ?? (isKo ? DEMO_LINTER_SAMPLE_KO : DEMO_LINTER_SAMPLE_EN));
  const [activePlatforms, setActivePlatforms] = useState<readonly CompliancePlatformId[]>(ALL_COMPLIANCE_PLATFORMS);
  const [symbolBank] = useState<SmartPropSymbolBank>(() => createDemoSmartPropBank());
  const [selectedMasterId, setSelectedMasterId] = useState<string>("sym-relic-blade");
  const [bankRevision, setBankRevision] = useState<number>(0);
  const [lastPropagation, setLastPropagation] = useState<SymbolPropagationReport | null>(null);

  const strokeResult = useMemo(() => rebindHybridStrokeMedium(baseStroke, { targetMedium: medium, widthScale, canvasWidth: 96, canvasHeight: 64 }), [baseStroke, medium, widthScale]);
  const silhouette = useMemo(() => createDemoCharacterSilhouette(64, 64), []);
  const activeLight = LIGHT_PRESETS.find((p) => p.id === lightPresetId) ?? LIGHT_PRESETS[0];
  const celResult = useMemo(() => generateAutoCelShadingLayers({ width: 64, height: 64, silhouetteAlpha: silhouette, lightPin: activeLight?.pin ?? { lx: -0.9, ly: -0.45, lz: 0.65 } }), [activeLight?.pin, silhouette]);
  const celPreviewRgba = useMemo(() => {
    if (celPreviewMode === "shadow") return maskToPreviewRgba(celResult.primaryShadowMask, "shadow");
    if (celPreviewMode === "rim") return maskToPreviewRgba(celResult.rimLightMask, "rim");
    if (celPreviewMode === "bounce") return maskToPreviewRgba(celResult.bounceLightMask, "bounce");
    return celPreviewMode === "normal" ? celResult.normalMapRgba : celResult.compositePreviewRgba;
  }, [celPreviewMode, celResult]);
  const hdrLayers = useMemo(() => createDemoHdrGradientLayers(96, 40), []);
  const hdrResult = useMemo(() => compositeLinearFloat16Layers({ width: 96, height: 40, layers: hdrLayers, exposureEv, enableTpdfBlueNoiseDither: enableDither }), [enableDither, exposureEv, hdrLayers]);
  const cameraOverlay = useMemo(() => computeCameraCompositionOverlay({ canvasWidthPx: 240, canvasHeightPx: 150, focalLengthMm, eyeLevelRatio01 }), [eyeLevelRatio01, focalLengthMm]);
  const lintReport = useMemo(() => lintDialogueComplianceAndGlossary({ text: dialogueText, glossary, targetPlatforms: activePlatforms }), [activePlatforms, dialogueText, glossary]);
  const masters = useMemo(() => { void bankRevision; return symbolBank.listMasters(); }, [bankRevision, symbolBank]);
  const selectedMaster = masters.find((m) => m.id === selectedMasterId) ?? masters[0];
  const masterInstances = useMemo(() => { void bankRevision; return selectedMaster ? symbolBank.listInstances(selectedMaster.id) : []; }, [bankRevision, selectedMaster, symbolBank]);

  useEffect(() => {
    onSnapshotChange?.({ activeTab, strokeResult, wetnessSnapshot: wetSnapshot, celResult, hdrResult, focalLengthMm, lintReport, lastPropagation });
  }, [activeTab, celResult, focalLengthMm, hdrResult, lastPropagation, lintReport, onSnapshotChange, strokeResult, wetSnapshot]);

  const handleWetMediumChange = (next: WetnessMediumMode): void => {
    setWetMedium(next); wetEngine.setMedium(next);
    wetEngine.depositWetStroke(18, 16, 8, next === "watercolor" ? 0.92 : 0.68);
    setWetSnapshot(wetEngine.getSnapshot()); setDryerBanner(null);
  };
  const handleStepDry = (): void => { wetEngine.stepTime(5); setWetSnapshot(wetEngine.getSnapshot()); setDryerBanner(null); };
  const handleHairDryer = (): void => {
    const res = wetEngine.applyHairDryerInstantDry();
    setWetSnapshot(wetEngine.getSnapshot());
    setDryerBanner(pick(`즉시 건조 완료 · ${res.driedCellCount}셀 건조 · 잔여 습도 ${res.residualMaxWetness.toFixed(3)}`, `Instant dry complete · ${res.driedCellCount} cells · residual ${res.residualMaxWetness.toFixed(3)}`));
  };
  const handleRewet = (): void => { wetEngine.depositWetStroke(16, 16, 8, 0.92); wetEngine.depositWetStroke(30, 17, 7, 0.84); setWetSnapshot(wetEngine.getSnapshot()); setDryerBanner(null); };
  const handleTogglePlatform = (pl: CompliancePlatformId): void => {
    setActivePlatforms((prev) => (prev.includes(pl) ? (prev.length > 1 ? prev.filter((p) => p !== pl) : prev) : [...prev, pl]));
  };
  const handlePropagateMaster = (): void => {
    if (!selectedMaster) return;
    setLastPropagation(symbolBank.updateMasterAndPropagate(selectedMaster.id, { strokeWeightPx: Number((selectedMaster.geometry.strokeWeightPx + 1).toFixed(1)) }));
    setBankRevision((v) => v + 1);
  };
  const handleToggleInstanceLink = (instanceId: string, linked: boolean): void => {
    if (linked) symbolBank.unlinkInstance(instanceId);
    else symbolBank.relinkInstance(instanceId, true);
    setBankRevision((v) => v + 1);
  };

  const tabs: readonly { readonly id: NextgenFrontierTabId; readonly ko: string; readonly en: string; readonly icon: ReactElement }[] = [
    { id: "hybrid-wet-cel", ko: "하이브리드 스트로크 · 건조기 · 자동 셀음영", en: "Hybrid Stroke · Dryer · Auto Cel", icon: <Droplets className="h-4 w-4" aria-hidden="true" /> },
    { id: "hdr-camera", ko: "16-bit HDR · 카메라 구도", en: "16-bit HDR · Camera Framing", icon: <Camera className="h-4 w-4" aria-hidden="true" /> },
    { id: "linter-symbols", ko: "심의/고유명사 린터 · 스마트 심볼 뱅크", en: "Dialogue Linter · Smart Symbols", icon: <Sparkles className="h-4 w-4" aria-hidden="true" /> },
  ];
  const spiralPointsAttr = cameraOverlay.goldenSpiral.curvePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <section
      aria-label={pick("차세대 드로잉 프런티어 패널", "Nextgen Drawing Frontier Panel")}
      data-testid="studio-nextgen-drawing-frontier-panel"
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("비파괴 하이브리드 · Float16 HDR · 2D 법선 셀음영", "Non-Destructive Hybrid · Float16 HDR · 2D Normal Cel")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("차세대 드로잉 프런티어 스튜디오", "Nextgen Drawing Frontier Studio")}</h2>
          <p className="text-xs text-fg-2">
            {pick("제어점 무손실 매체 전환, 수채·유화 건조기, 2D 법선 셀음영, 16-bit HDR, 카메라 구도, 심의 린터와 스마트 심볼을 제어합니다.", "Control lossless hybrid strokes, live wetness drying, 2D normal cel shading, 16-bit HDR, camera framing, dialogue linting, and smart symbols.")}
          </p>
        </div>
        <span data-testid="frontier-summary-pill" className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold tabular-nums text-fg">
          {pick(`제어점 ${strokeResult.preservedControlPointCount}점 · 심의 ${lintReport.complianceScore0To100}점`, `${strokeResult.preservedControlPointCount} Ctrl Pts · Lint ${lintReport.complianceScore0To100}`)}
        </span>
      </header>

      <div role="tablist" aria-label={pick("차세대 드로잉 기능 탭", "Nextgen drawing tabs")} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`} aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`${PILL_BTN} ${activeTab === tab.id ? ACTIVE_BTN : IDLE_BTN}`}>
            {tab.icon}<span>{pick(tab.ko, tab.en)}</span>
          </button>
        ))}
      </div>

      {activeTab === "hybrid-wet-cel" && (
        <div id={`${uid}-panel-hybrid-wet-cel`} role="tabpanel" aria-labelledby={`${uid}-tab-hybrid-wet-cel`} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("비파괴 하이브리드 스트로크", "Hybrid Stroke Rebind")}</h3>
              <span data-testid="hybrid-checksum" className="rounded border border-line bg-canvas px-2 py-0.5 text-xs tabular-nums text-fg-2">{strokeResult.controlPointChecksum}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {HYBRID_MEDIUM_LIST.map((m) => (
                <button key={m} type="button" aria-pressed={medium === m} onClick={() => setMedium(m)} className={`${PILL_BTN} px-2 ${medium === m ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(HYBRID_MEDIUM_PROFILES[m].labelKo, HYBRID_MEDIUM_PROFILES[m].labelEn)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WIDTH_SCALES.map((sc) => (
                <button key={sc} type="button" aria-pressed={widthScale === sc} onClick={() => setWidthScale(sc)} className={`${PILL_BTN} px-2.5 tabular-nums ${widthScale === sc ? ACTIVE_BTN : IDLE_BTN}`}>{sc.toFixed(2)}×</button>
              ))}
            </div>
            <RgbaCanvas width={strokeResult.rasterWidth} height={strokeResult.rasterHeight} rgba={strokeResult.rasterRgba} label={pick("하이브리드 스트로크 미리보기", "Hybrid stroke preview")} />
            <div className="grid grid-cols-2 gap-2">
              <KpiBox label={pick("평균 폭", "Mean Width")} value={`${strokeResult.meanStrokeWidthPx.toFixed(1)}px`} testId="hybrid-mean-width" />
              <KpiBox label={pick("주입 습도", "Wetness")} value={`${(strokeResult.wetnessInjectedMean * 100).toFixed(0)}%`} testId="hybrid-wetness-deposit" />
            </div>
          </article>

          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("건조 습도맵 & 드라이어", "Wetness Map & Dryer")}</h3>
              <span data-testid="wetness-max-value" className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${wetSnapshot.maxWetness01 === 0 ? "border-good/40 bg-good-soft text-good" : "border-warn/40 bg-warning-soft text-warn"}`}>{wetSnapshot.maxWetness01.toFixed(3)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["watercolor", "oil"] as const).map((wm) => (
                <button key={wm} type="button" aria-pressed={wetMedium === wm} onClick={() => handleWetMediumChange(wm)} className={`${PILL_BTN} ${wetMedium === wm ? ACTIVE_BTN : IDLE_BTN}`}>
                  {wm === "watercolor" ? pick("수채화 (빠른 건조)", "Watercolor (Fast)") : pick("유화 (저속 건조)", "Oil (Slow)")}
                </button>
              ))}
            </div>
            <RgbaCanvas width={wetSnapshot.width} height={wetSnapshot.height} rgba={wetSnapshot.rgbaPreview} label={pick("습도맵 미리보기", "Wetness map preview")} />
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <KpiBox label="Wet" value={String(wetSnapshot.wetCellCount)} testId="wet-cell-count" />
              <KpiBox label="Damp" value={String(wetSnapshot.dampCellCount)} />
              <KpiBox label="Dry" value={String(wetSnapshot.dryCellCount)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={handleStepDry} className={`${PILL_BTN} ${IDLE_BTN}`}><Flame className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("+5초 건조", "Step +5s")}</span></button>
              <button type="button" onClick={handleHairDryer} className={PRIMARY_BTN}><Wind className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("즉시 건조(드라이어)", "Instant Hair Dryer")}</span></button>
              <button type="button" onClick={handleRewet} className={`${PILL_BTN} ${IDLE_BTN}`}>{pick("다시 적시기", "Re-Wet")}</button>
            </div>
            {dryerBanner && <p data-testid="dryer-banner" className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1.5 text-xs font-medium text-good tabular-nums">{dryerBanner}</p>}
          </article>

          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("2D 법선 자동 셀 음영", "2D Normal Auto Cel")}</h3>
              <Sun className="h-4 w-4 text-accent" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {LIGHT_PRESETS.map((lp) => (
                <button key={lp.id} type="button" aria-pressed={lightPresetId === lp.id} onClick={() => setLightPresetId(lp.id)} className={`${PILL_BTN} px-2 ${lightPresetId === lp.id ? ACTIVE_BTN : IDLE_BTN}`}>{pick(lp.ko, lp.en)}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {CEL_MODES.map(([id, ko, en]) => (
                <button key={id} type="button" aria-pressed={celPreviewMode === id} onClick={() => setCelPreviewMode(id)} className={`${PILL_BTN} px-2 ${celPreviewMode === id ? ACTIVE_BTN : IDLE_BTN}`}>{pick(ko, en)}</button>
              ))}
            </div>
            <RgbaCanvas width={celResult.width} height={celResult.height} rgba={celPreviewRgba} label={pick("자동 셀 음영 미리보기", "Auto cel shading preview")} />
            <div className="grid grid-cols-3 gap-1.5">
              <KpiBox label={pick("그림자 X", "Shadow X")} value={celResult.shadowCentroidX01.toFixed(2)} testId="cel-shadow-cx" />
              <KpiBox label={pick("림 X", "Rim X")} value={celResult.rimCentroidX01.toFixed(2)} testId="cel-rim-cx" />
              <KpiBox label={pick("반사광", "Bounce")} value={`${(celResult.bounceCoverageRatio01 * 100).toFixed(0)}%`} />
            </div>
          </article>
        </div>
      )}

      {activeTab === "hdr-camera" && (
        <div id={`${uid}-panel-hdr-camera`} role="tabpanel" aria-labelledby={`${uid}-tab-hdr-camera`} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("Linear-Float16 HDR & 무밴딩 디더링", "Linear-Float16 HDR & TPDF Dither")}</h3>
              <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {EXPOSURE_STEPS.map((ev) => (
                <button key={ev} type="button" aria-pressed={exposureEv === ev} onClick={() => setExposureEv(ev)} className={`${PILL_BTN} tabular-nums ${exposureEv === ev ? ACTIVE_BTN : IDLE_BTN}`}>{ev >= 0 ? `+${ev.toFixed(1)}` : ev.toFixed(1)} EV</button>
              ))}
              <button type="button" aria-pressed={enableDither} onClick={() => setEnableDither((v) => !v)} className={`${PILL_BTN} ${enableDither ? ACTIVE_BTN : IDLE_BTN}`}>
                {enableDither ? pick("TPDF 블루노이즈 ON", "TPDF Blue-Noise ON") : pick("디더링 OFF (밴딩 비교)", "Dither OFF (Compare)")}
              </button>
            </div>
            <RgbaCanvas width={hdrResult.width} height={hdrResult.height} rgba={hdrResult.outputRgba8} label={pick("Linear-Float16 HDR 출력", "Linear-Float16 HDR output")} className="h-24 w-full rounded-lg border border-line bg-canvas object-cover" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiBox label={pick("피크 휘도", "Peak Lum")} value={hdrResult.metrics.peakLinearLuminance.toFixed(2)} testId="hdr-peak-lum" />
              <KpiBox label={pick("HDR 픽셀", "HDR Px")} value={String(hdrResult.metrics.hdrSpecularPixelCount)} />
              <KpiBox label={pick("밴딩 제거", "Anti-Band")} value={`${(hdrResult.metrics.bandingEliminationRatio01 * 100).toFixed(0)}%`} testId="hdr-banding-ratio" tone="good" />
              <KpiBox label={pick("최대 평탄폭", "Max Run")} value={`${hdrResult.metrics.ditheredBandingRunMax}px`} testId="hdr-max-run" />
            </div>
          </article>

          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("카메라 화각 · 3분할 · 황금나선 · 아이레벨", "Camera FOV · Thirds · Spiral · Eye-Level")}</h3>
              <span data-testid="camera-fov-badge" className="rounded border border-line bg-canvas px-2 py-0.5 text-xs font-semibold tabular-nums text-fg">{cameraOverlay.horizontalFovDeg.toFixed(1)}° FOV</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {CAMERA_FOCAL_LENGTHS.map((mm) => (
                <button key={mm} type="button" aria-pressed={focalLengthMm === mm} onClick={() => setFocalLengthMm(mm)} className={`${PILL_BTN} tabular-nums ${focalLengthMm === mm ? ACTIVE_BTN : IDLE_BTN}`}>{mm}mm</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label htmlFor={`${uid}-eyelevel`} className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 tabular-nums text-fg-2">
                <span>{pick("아이레벨", "Eye Level")}</span>
                <input id={`${uid}-eyelevel`} type="range" min={0.2} max={0.8} step={0.02} value={eyeLevelRatio01} onChange={(e) => setEyeLevelRatio01(Number(e.target.value))} className="flex-1 accent-accent" />
                <strong className="text-fg">{Math.round(eyeLevelRatio01 * 100)}%</strong>
              </label>
              <button type="button" aria-pressed={showThirds} onClick={() => setShowThirds((v) => !v)} className={`${PILL_BTN} px-2.5 ${showThirds ? ACTIVE_BTN : IDLE_BTN}`}>{pick("3분할", "Thirds")}</button>
              <button type="button" aria-pressed={showSpiral} onClick={() => setShowSpiral((v) => !v)} className={`${PILL_BTN} px-2.5 ${showSpiral ? ACTIVE_BTN : IDLE_BTN}`}>{pick("황금나선", "Spiral")}</button>
              <button type="button" aria-pressed={showEyeLevel} onClick={() => setShowEyeLevel((v) => !v)} className={`${PILL_BTN} px-2.5 ${showEyeLevel ? ACTIVE_BTN : IDLE_BTN}`}>{pick("아이레벨", "Horizon")}</button>
            </div>
            <svg viewBox="0 0 240 150" role="img" aria-label={pick("카메라 구도 오버레이", "Camera composition overlay")} className="h-28 w-full rounded-lg border border-line bg-canvas">
              <rect x={cameraOverlay.cropRelativeTo24mm.x} y={cameraOverlay.cropRelativeTo24mm.y} width={cameraOverlay.cropRelativeTo24mm.width} height={cameraOverlay.cropRelativeTo24mm.height} className="fill-none stroke-line-strong" strokeDasharray="4 3" strokeWidth={1.2} />
              {showThirds && [...cameraOverlay.ruleOfThirds.verticalLines, ...cameraOverlay.ruleOfThirds.horizontalLines].map((ln, idx) => (
                <line key={idx} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} className="stroke-line" strokeWidth={1} />
              ))}
              {showSpiral && <polyline points={spiralPointsAttr} className="fill-none stroke-accent" strokeWidth={1.6} />}
              {showSpiral && <circle cx={cameraOverlay.goldenSpiral.focalEye.x} cy={cameraOverlay.goldenSpiral.focalEye.y} r={3} className="fill-accent" />}
              {showEyeLevel && <line x1={0} y1={cameraOverlay.eyeLevel.yPx} x2={240} y2={cameraOverlay.eyeLevel.yPx} className="stroke-warn" strokeDasharray="3 2" strokeWidth={1.5} />}
            </svg>
            <p className="text-xs text-fg-2"><strong className="text-fg">{pick(cameraOverlay.labelKo, cameraOverlay.labelEn)}</strong> · {pick(cameraOverlay.framingAdviceKo, cameraOverlay.framingAdviceEn)}</p>
          </article>
        </div>
      )}

      {activeTab === "linter-symbols" && (
        <div id={`${uid}-panel-linter-symbols`} role="tabpanel" aria-labelledby={`${uid}-tab-linter-symbols`} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("실시간 말풍선 심의·고유명사 린터", "Live Dialogue Compliance & Glossary Linter")}</h3>
              <span data-testid="linter-issue-count" className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${lintReport.issues.length === 0 ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                {pick(`검출 ${lintReport.issues.length}건`, `${lintReport.issues.length} issues`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COMPLIANCE_PLATFORMS.map((pl) => (
                <button key={pl} type="button" aria-pressed={activePlatforms.includes(pl)} onClick={() => handleTogglePlatform(pl)} className={`${PILL_BTN} px-2.5 ${activePlatforms.includes(pl) ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(PLATFORM_LABELS[pl][0], PLATFORM_LABELS[pl][1])}
                </button>
              ))}
            </div>
            <label htmlFor={`${uid}-dialogue`} className="sr-only">{pick("말풍선 대사 입력", "Dialogue balloon text")}</label>
            <textarea id={`${uid}-dialogue`} rows={3} value={dialogueText} onChange={(e) => setDialogueText(e.target.value)} className={`w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg ${FOCUS_RING}`} />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setDialogueText(applyLinterFixes(dialogueText, lintReport.issues, ["glossary-typo", "spelling-typo"]))} className={PRIMARY_BTN}>
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("고유명사·맞춤법 교정", "Fix Glossary & Spelling")}</span>
              </button>
              <button type="button" onClick={() => setDialogueText(applyLinterFixes(dialogueText, lintReport.issues))} className={`${PILL_BTN} ${IDLE_BTN}`}>{pick("심의 포함 일괄 순화", "Apply All Suggestions")}</button>
            </div>
            <ul data-testid="linter-issues-list" className="max-h-36 space-y-1.5 overflow-y-auto text-xs">
              {lintReport.issues.length === 0 ? (
                <li className="flex items-center gap-1.5 rounded-lg border border-good/40 bg-good-soft p-2 text-good"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /><span>{pick("오타·고유명사 불일치·심의 주의 표현 0건!", "Zero spelling, glossary, or compliance issues!")}</span></li>
              ) : (
                lintReport.issues.map((item) => (
                  <li key={item.id} className="rounded-lg border border-line bg-canvas p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-fg"><ShieldAlert className="h-3.5 w-3.5 text-warn" aria-hidden="true" /><span>{item.matchedText} → {item.suggestions[0] ?? ""}</span></span>
                      <span className="tabular-nums text-fg-3">[{item.startOffset}..{item.endOffset}]</span>
                    </div>
                    <p className="mt-0.5 text-fg-2">{pick(item.messageKo, item.messageEn)}</p>
                  </li>
                ))
              )}
            </ul>
          </article>

          <article className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("스마트 심볼 뱅크 (선택 일괄 전파)", "Smart Prop Symbol Bank")}</h3>
              <span data-testid="symbol-master-version" className="rounded border border-line bg-canvas px-2 py-0.5 text-xs font-semibold tabular-nums text-fg">v{selectedMaster?.version ?? 1}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {masters.map((m) => (
                <button key={m.id} type="button" aria-pressed={selectedMaster?.id === m.id} onClick={() => setSelectedMasterId(m.id)} className={`${PILL_BTN} px-2.5 ${selectedMaster?.id === m.id ? ACTIVE_BTN : IDLE_BTN}`}>{pick(m.nameKo, m.nameEn)}</button>
              ))}
            </div>
            <button type="button" onClick={handlePropagateMaster} className={`${PRIMARY_BTN} w-full`}>{pick("마스터 선두께 +1.0px 수정 후 연결 컷 일괄 전파", "Update Master (+1.0px Stroke) & Propagate Linked Cuts")}</button>
            {lastPropagation && (
              <p data-testid="symbol-propagation-summary" className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1.5 text-xs font-medium text-good tabular-nums">
                {pick(`v${lastPropagation.newVersion} 전파 완료 · 갱신 ${lastPropagation.updatedInstanceIds.length}컷 · 언링크 보호 ${lastPropagation.skippedUnlinkedInstanceIds.length}컷`, `Propagated v${lastPropagation.newVersion} · updated ${lastPropagation.updatedInstanceIds.length} · unlinked protected ${lastPropagation.skippedUnlinkedInstanceIds.length}`)}
              </p>
            )}
            <ul data-testid="symbol-instances-list" className="space-y-1.5 text-xs">
              {masterInstances.map((inst) => (
                <li key={inst.instanceId} data-testid={`symbol-inst-${inst.instanceId}`} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas p-2">
                  <div>
                    <div className="font-semibold text-fg">{pick(inst.cutLabelKo, inst.cutLabelEn)}</div>
                    <div className="tabular-nums text-fg-2">v{inst.syncedVersion} · {inst.resolvedGeometry.strokeWeightPx.toFixed(1)}px · {inst.linked ? pick("마스터 연결됨", "Linked") : pick("언링크 보호", "Unlinked Protected")}</div>
                  </div>
                  <button type="button" onClick={() => handleToggleInstanceLink(inst.instanceId, inst.linked)} className={`${PILL_BTN} px-2.5 ${inst.linked ? IDLE_BTN : ACTIVE_BTN}`}>
                    {inst.linked ? <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlink2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span>{inst.linked ? pick("언링크", "Unlink") : pick("재연결", "Relink")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}
