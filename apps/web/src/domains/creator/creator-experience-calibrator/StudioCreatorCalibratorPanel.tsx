/**
 * 창작자 체감 캘리브레이터 패널:
 * ① 4분할 디바이스 색역·색각이상(ΔE2000) 교정,
 * ② 100% 온디바이스 필압·손떨림 자동 맞춤 & 5단계 컨텍스트 퀵런처,
 * ③ 360px 독자 스크롤 템포 · 다국어(KO/EN/JA/TH) 보이스 호흡 프리뷰.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 미사용 · 명시적 transition 속성만 사용 · 460줄 이하 · KO/EN 지원).
 */

import { Activity, Eye, Gauge, Layers, PenTool, ShieldCheck, Smartphone, Volume2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_DEMO_WEBTOON_PALETTE,
  DEMO_WORKFLOW_SNAPSHOTS,
  auditPaletteGamutAndCvd,
  buildFourWayColorProofBundle,
  calibratePersonalPenProfile,
  createDemoCalibrationStrokes,
  createDemoWebtoonColorProofBuffer,
  detectWorkflowPhaseAndNextActions,
  type CvdSimulationMode,
  type DemoPenProfilePreset,
  type DeviceColorProofResult,
  type FourWayColorProofBundle,
  type PaletteGamutCvdAuditResult,
  type PenCalibrationStrokeSample,
  type PersonalPenCalibrationProfile,
  type ProofSeverity,
  type WorkflowPhaseDetectionResult,
  type WorkflowPhaseId,
} from "./device-gamut-and-pressure-calibrator";
import {
  READER_VIEWPORT_PRESETS,
  analyzeMobileReaderScrollPacing,
  createDemoWebtoonEpisodePacingData,
  simulateMultilingualVoicePacing,
  type MobileReaderScrollReport,
  type MultilingualVoicePacingReport,
  type ReaderViewportPresetId,
  type VoicePacingLocale,
} from "./reader-scroll-and-voice-pacing";

export type CreatorCalibratorTabId = "color-proof" | "pen-workflow" | "reader-voice";

export interface StudioCreatorCalibratorSnapshot {
  readonly activeTab: CreatorCalibratorTabId;
  readonly cvdMode: CvdSimulationMode;
  readonly highlightOutOfGamut: boolean;
  readonly penPreset: DemoPenProfilePreset;
  readonly workflowPhase: WorkflowPhaseId;
  readonly selectedToolId: string | null;
  readonly viewportId: ReaderViewportPresetId;
  readonly voiceLocale: VoicePacingLocale;
  readonly colorProof: FourWayColorProofBundle;
  readonly paletteAudit: PaletteGamutCvdAuditResult;
  readonly penProfile: PersonalPenCalibrationProfile;
  readonly workflowDetection: WorkflowPhaseDetectionResult;
  readonly scrollReport: MobileReaderScrollReport;
  readonly voiceReport: MultilingualVoicePacingReport;
}

export interface StudioCreatorCalibratorPanelProps {
  readonly locale?: "ko" | "en";
  readonly initialTab?: CreatorCalibratorTabId;
  readonly initialCvdMode?: CvdSimulationMode;
  readonly initialPenPreset?: DemoPenProfilePreset;
  readonly initialWorkflowPhase?: WorkflowPhaseId;
  readonly initialViewport?: ReaderViewportPresetId;
  readonly initialVoiceLocale?: VoicePacingLocale;
  readonly className?: string;
  readonly onCalibratorChange?: (snapshot: StudioCreatorCalibratorSnapshot) => void;
}

const PROOF_W = 64;
const PROOF_H = 40;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_BTN = "border-accent bg-accent text-on-accent";
const IDLE_BTN = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const SEVERITY_BADGE: Record<ProofSeverity, string> = {
  safe: "border-good/40 bg-good-soft text-good",
  caution: "border-warn/40 bg-warning-soft text-warn",
  critical: "border-bad/40 bg-bad-soft text-bad",
};

const CVD_MODES: readonly (readonly [CvdSimulationMode, string, string])[] = [
  ["protanopia", "제1색각(적색맹)", "Protanopia"],
  ["deuteranopia", "제2색각(녹색맹)", "Deuteranopia"],
  ["tritanopia", "제3색각(청황맹)", "Tritanopia"],
];
const PEN_PRESETS: readonly (readonly [DemoPenProfilePreset, string, string])[] = [
  ["light-shaky", "가벼운 손힘·떨림", "Light & Shaky"],
  ["balanced-steady", "균형 필압·안정", "Balanced & Steady"],
  ["heavy-fast", "강한 손힘·속필", "Heavy & Fast"],
];
const WORKFLOW_PHASES: readonly (readonly [WorkflowPhaseId, string, string])[] = [
  ["sketch", "스케치", "Sketch"], ["lineart", "선화", "Lineart"], ["coloring", "채색", "Coloring"],
  ["lettering", "식자", "Lettering"], ["finishing", "마감", "Finishing"],
];
const VIEWPORT_IDS: readonly ReaderViewportPresetId[] = ["android-360", "iphone-390", "tablet-768"];
const VOICE_LOCALES: readonly (readonly [VoicePacingLocale, string, string])[] = [
  ["ko", "한국어 (KO)", "Korean (KO)"], ["en", "영어 (EN)", "English (EN)"],
  ["ja", "일본어 세로 (JA)", "Japanese Vert (JA)"], ["th", "태국어 (TH)", "Thai (TH)"],
];

function KpiTile({ label, value, testId, tone = "default" }: { readonly label: string; readonly value: string; readonly testId?: string; readonly tone?: "default" | "good" | "bad" }): ReactElement {
  const toneCls = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-fg";
  return (
    <div className="rounded-lg border border-line bg-canvas p-2.5 text-xs tabular-nums">
      <span className="text-fg-3">{label}</span>
      <div data-testid={testId} className={`mt-0.5 text-sm font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}

function ProofTileCard({ title, testId, result, severityLabel, isKo }: { readonly title: string; readonly testId: string; readonly result: DeviceColorProofResult; readonly severityLabel: string; readonly isKo: boolean }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height), 0, 0);
  }, [result.height, result.rgba, result.width]);

  return (
    <article data-testid={testId} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg">{title}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_BADGE[result.severity]}`}>{severityLabel}</span>
      </div>
      <canvas ref={canvasRef} width={result.width} height={result.height} aria-label={title} className="h-20 w-full rounded-lg border border-line bg-canvas object-cover" />
      <div className="grid grid-cols-3 gap-1.5 text-xs tabular-nums text-fg-2">
        <div><span className="block text-fg-3">{isKo ? "평균 ΔE" : "Mean ΔE"}</span><strong className="font-semibold text-fg">{result.meanDeltaE2000.toFixed(1)}</strong></div>
        <div><span className="block text-fg-3">P95 ΔE</span><strong className="font-semibold text-fg">{result.p95DeltaE2000.toFixed(1)}</strong></div>
        <div>
          <span className="block text-fg-3">{result.maxInkCoveragePct > 0 ? "CMYK TAC" : isKo ? "이탈률" : "OOG %"}</span>
          <strong className="font-semibold text-fg">{result.maxInkCoveragePct > 0 ? `${result.maxInkCoveragePct.toFixed(0)}%` : `${(result.outOfGamutRatio01 * 100).toFixed(1)}%`}</strong>
        </div>
      </div>
    </article>
  );
}

/** 창작자 체감 캘리브레이터 · 4분할 색역 교정 · 온디바이스 필압 맞춤 · 독자 스크롤/다국어 보이스 패널. */
export function StudioCreatorCalibratorPanel({
  locale,
  initialTab = "color-proof",
  initialCvdMode = "deuteranopia",
  initialPenPreset = "light-shaky",
  initialWorkflowPhase = "lineart",
  initialViewport = "android-360",
  initialVoiceLocale = "ko",
  className,
  onCalibratorChange,
}: StudioCreatorCalibratorPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<CreatorCalibratorTabId>(initialTab);
  const [cvdMode, setCvdMode] = useState<CvdSimulationMode>(initialCvdMode);
  const [highlightOutOfGamut, setHighlightOutOfGamut] = useState<boolean>(false);
  const [penPreset, setPenPreset] = useState<DemoPenProfilePreset>(initialPenPreset);
  const [extraSamples, setExtraSamples] = useState<readonly PenCalibrationStrokeSample[]>([]);
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhaseId>(initialWorkflowPhase);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [viewportId, setViewportId] = useState<ReaderViewportPresetId>(initialViewport);
  const [scrollSpeedPxPerSec, setScrollSpeedPxPerSec] = useState<number>(READER_VIEWPORT_PRESETS[initialViewport].defaultScrollSpeedPxPerSec);
  const [voiceLocale, setVoiceLocale] = useState<VoicePacingLocale>(initialVoiceLocale);

  const proofBuffer = useMemo(() => createDemoWebtoonColorProofBuffer(PROOF_W, PROOF_H), []);
  const colorProof = useMemo(() => buildFourWayColorProofBundle(proofBuffer, cvdMode, { highlightOutOfGamut }), [cvdMode, highlightOutOfGamut, proofBuffer]);
  const paletteAudit = useMemo(() => auditPaletteGamutAndCvd(DEFAULT_DEMO_WEBTOON_PALETTE), []);
  const penProfile = useMemo(() => calibratePersonalPenProfile([...createDemoCalibrationStrokes(penPreset), ...extraSamples]), [extraSamples, penPreset]);
  const workflowDetection = useMemo(() => detectWorkflowPhaseAndNextActions(DEMO_WORKFLOW_SNAPSHOTS[workflowPhase]), [workflowPhase]);
  const demoEpisode = useMemo(() => createDemoWebtoonEpisodePacingData(), []);
  const scrollReport = useMemo(() => analyzeMobileReaderScrollPacing({ ...demoEpisode.scrollEpisode, scrollSpeedPxPerSec }, viewportId), [demoEpisode.scrollEpisode, scrollSpeedPxPerSec, viewportId]);
  const voiceReport = useMemo(() => simulateMultilingualVoicePacing(demoEpisode.dialogueBeats, voiceLocale), [demoEpisode.dialogueBeats, voiceLocale]);

  useEffect(() => {
    onCalibratorChange?.({
      activeTab, cvdMode, highlightOutOfGamut, penPreset, workflowPhase, selectedToolId, viewportId, voiceLocale,
      colorProof, paletteAudit, penProfile, workflowDetection, scrollReport, voiceReport,
    });
  }, [
    activeTab, colorProof, cvdMode, highlightOutOfGamut, onCalibratorChange, paletteAudit, penPreset,
    penProfile, scrollReport, selectedToolId, viewportId, voiceLocale, voiceReport, workflowDetection, workflowPhase,
  ]);

  const severityText = (sev: ProofSeverity): string => (sev === "safe" ? pick("안전", "Safe") : sev === "caution" ? pick("주의", "Caution") : pick("이탈", "Critical"));
  const handleSelectViewport = (nextViewport: ReaderViewportPresetId): void => {
    setViewportId(nextViewport);
    setScrollSpeedPxPerSec(READER_VIEWPORT_PRESETS[nextViewport].defaultScrollSpeedPxPerSec);
  };
  const handleAppendTestStroke = (): void => {
    const base = extraSamples.length;
    setExtraSamples((prev) => [
      ...prev,
      ...Array.from({ length: 8 }, (_, idx) => ({
        x: 24 + idx * 24, y: 48 + Math.sin(idx * 0.6) * 8,
        pressure: penPreset === "light-shaky" ? 0.22 : penPreset === "heavy-fast" ? 0.84 : 0.5,
        timestampMs: (base + idx) * 24, strokeId: `live-sample-${base}`,
      })),
    ]);
  };

  const tabs: readonly { readonly id: CreatorCalibratorTabId; readonly ko: string; readonly en: string; readonly icon: ReactElement }[] = [
    { id: "color-proof", ko: "4분할 색역·ΔE 교정", en: "4-Way Gamut & ΔE Proof", icon: <Eye className="h-4 w-4" aria-hidden="true" /> },
    { id: "pen-workflow", ko: "온디바이스 필압 맞춤 & 단계 퀵런처", en: "On-Device Pen & Phase Launcher", icon: <PenTool className="h-4 w-4" aria-hidden="true" /> },
    { id: "reader-voice", ko: "360px 독자 스크롤 · 다국어 보이스 호흡", en: "360px Scroll & Multilingual Voice", icon: <Smartphone className="h-4 w-4" aria-hidden="true" /> },
  ];
  const cvdEntry = CVD_MODES.find(([id]) => id === cvdMode);
  const primaryCliffhanger = scrollReport.cliffhangerPauses[0] ?? null;

  return (
    <section
      aria-label={pick("창작자 체감 캘리브레이터 패널", "Creator Experience Calibrator Panel")}
      data-testid="studio-creator-calibrator-panel"
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("온디바이스 전용 · 서버 전송 0B", "On-Device Only · 0B Network")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("창작자 체감 캘리브레이터", "Creator Experience Calibrator")}</h2>
          <p className="text-xs text-fg-2">
            {pick(
              "디바이스 4분할 색역 교정, 손힘 자동 필압 맞춤, 360px 독자 스크롤·다국어 보이스 호흡을 한곳에서 검증합니다.",
              "Verify 4-way device color proof, on-device pen pressure fit, and 360px scroll plus multilingual voice pacing.",
            )}
          </p>
        </div>
        <span data-testid="calibrator-summary-score" className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold tabular-nums text-fg">
          {pick(`팔레트 ${paletteAudit.overallScore0To100}점 · 시선 ${scrollReport.eyeFlowScore0To100}점`, `Palette ${paletteAudit.overallScore0To100} · Flow ${scrollReport.eyeFlowScore0To100}`)}
        </span>
      </header>

      <div role="tablist" aria-label={pick("캘리브레이터 기능 탭", "Calibrator tabs")} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`${PILL_BTN} ${activeTab === tab.id ? ACTIVE_BTN : IDLE_BTN}`}
          >
            {tab.icon}<span>{pick(tab.ko, tab.en)}</span>
          </button>
        ))}
      </div>

      {activeTab === "color-proof" && (
        <div role="tabpanel" id={`${uid}-panel-color-proof`} aria-labelledby={`${uid}-tab-color-proof`} className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div role="radiogroup" aria-label={pick("색각이상 시뮬레이션 모드", "Color vision deficiency mode")} className="flex flex-wrap gap-2">
              {CVD_MODES.map(([id, ko, en]) => (
                <button key={id} type="button" role="radio" aria-checked={cvdMode === id} onClick={() => setCvdMode(id)} className={`${PILL_BTN} ${cvdMode === id ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(ko, en)}
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={highlightOutOfGamut} onClick={() => setHighlightOutOfGamut((p) => !p)} className={`${PILL_BTN} ${highlightOutOfGamut ? "border-warn bg-warning-soft text-warn" : IDLE_BTN}`}>
              {pick("색역 이탈 픽셀 강조", "Highlight Out-of-Gamut")}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <ProofTileCard title={pick("① iPhone Display-P3", "1. iPhone Display-P3")} testId="proof-card-p3" result={colorProof.iphoneDisplayP3} severityLabel={severityText(colorProof.iphoneDisplayP3.severity)} isKo={isKo} />
            <ProofTileCard title={pick("② Android OLED (Vivid D65)", "2. Android OLED (Vivid D65)")} testId="proof-card-oled" result={colorProof.androidOledVivid} severityLabel={severityText(colorProof.androidOledVivid.severity)} isKo={isKo} />
            <ProofTileCard title={pick("③ 인쇄 CMYK FOGRA39", "3. Print CMYK FOGRA39")} testId="proof-card-cmyk" result={colorProof.printCmykFogra39} severityLabel={severityText(colorProof.printCmykFogra39.severity)} isKo={isKo} />
            <ProofTileCard title={pick(`④ 색각이상 (${cvdEntry?.[1] ?? ""})`, `4. CVD (${cvdEntry?.[2] ?? ""})`)} testId="proof-card-cvd" result={colorProof.cvdProof} severityLabel={severityText(colorProof.cvdProof.severity)} isKo={isKo} />
          </div>
          <div data-testid="palette-audit-summary" className="rounded-xl border border-line bg-card p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-fg">{pick("팔레트 CMYK 이탈 · 색각 혼동 감사", "Palette CMYK Gamut & CVD Collision Audit")}</strong>
              <span className="tabular-nums text-fg-2">
                {pick(`CMYK 이탈 ${paletteAudit.cmykOutOfGamutCount}색 · 색각 혼동 ${paletteAudit.cvdCollisionCount}쌍 · 종합 ${paletteAudit.overallScore0To100}점`, `CMYK OOG ${paletteAudit.cmykOutOfGamutCount} · CVD Collisions ${paletteAudit.cvdCollisionCount} · Score ${paletteAudit.overallScore0To100}`)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {paletteAudit.swatches.map((sw) => (
                <span key={sw.swatchId} className={`rounded-md border px-2 py-1 text-xs tabular-nums ${sw.cmykOutOfGamut ? "border-warn/40 bg-warning-soft text-warn" : "border-line bg-canvas text-fg-2"}`}>
                  {pick(sw.labelKo, sw.labelEn)} · ΔE {sw.cmykDeltaE2000.toFixed(1)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "pen-workflow" && (
        <div role="tabpanel" id={`${uid}-panel-pen-workflow`} aria-labelledby={`${uid}-tab-pen-workflow`} className="mt-3 space-y-3">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Gauge className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("온디바이스 작가 필압·손떨림 자동 보정", "On-Device Pressure & Tremor Calibration")}
              </span>
              <span data-testid="pen-network-badge" className="text-xs tabular-nums text-good">
                {pick(`전송 ${penProfile.networkTransmissionBytes}B · 표본 ${penProfile.sampleCount}점`, `Sent ${penProfile.networkTransmissionBytes}B · ${penProfile.sampleCount} pts`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PEN_PRESETS.map(([id, ko, en]) => (
                <button key={id} type="button" aria-pressed={penPreset === id} onClick={() => { setPenPreset(id); setExtraSamples([]); }} className={`${PILL_BTN} ${penPreset === id ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(ko, en)}
                </button>
              ))}
              <button type="button" onClick={handleAppendTestStroke} className={`${PILL_BTN} ${IDLE_BTN}`}>{pick("테스트 획 추가 측정", "Add Test Stroke")}</button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiTile label={pick("최적 필압 감마", "Pressure Gamma")} value={`γ ${penProfile.optimalPressureGamma.toFixed(2)}`} testId="pen-gamma-value" />
              <KpiTile label={pick("안정화 윈도우", "Stabilizer Window")} value={`${penProfile.stabilizationWindowPx.toFixed(1)} px`} testId="pen-stabilizer-value" />
              <KpiTile label={pick("시작 / 끝 테이퍼", "Start / End Taper")} value={`${Math.round(penProfile.startTaperRatio01 * 100)}% / ${Math.round(penProfile.endTaperRatio01 * 100)}%`} />
              <KpiTile label={pick("곡률 지터 지수", "Curvature Jitter")} value={`${Math.round(penProfile.curvatureJitterIndex01 * 100)}%`} />
            </div>
            <p className="text-xs text-fg-2">{pick(penProfile.summaryKo, penProfile.summaryEn)}</p>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("작업 단계 감지 컨텍스트 퀵런처 (핵심 3도구)", "Workflow Phase Quick-Launcher (Top 3 Tools)")}
              </span>
              <span data-testid="detected-phase-label" className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                {pick(workflowDetection.phaseLabelKo, workflowDetection.phaseLabelEn)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {WORKFLOW_PHASES.map(([id, ko, en]) => (
                <button key={id} type="button" aria-pressed={workflowPhase === id} onClick={() => { setWorkflowPhase(id); setSelectedToolId(null); }} className={`${PILL_BTN} ${workflowPhase === id ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(ko, en)}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-2">{pick(workflowDetection.reasonKo, workflowDetection.reasonEn)}</p>
            <div data-testid="quick-launcher-actions" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {workflowDetection.nextActions.map((act) => (
                <button
                  key={act.id} type="button" aria-pressed={selectedToolId === act.targetToolId}
                  onClick={() => setSelectedToolId(act.targetToolId)}
                  className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${selectedToolId === act.targetToolId ? "border-accent bg-accent-soft text-fg" : "border-line bg-canvas text-fg-2 hover:bg-raised"}`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <strong className="text-fg">{pick(act.titleKo, act.titleEn)}</strong>
                    <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs tabular-nums text-fg-3">{act.shortcut}</kbd>
                  </div>
                  <span className="text-fg-2">{pick(act.hintKo, act.hintEn)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "reader-voice" && (
        <div role="tabpanel" id={`${uid}-panel-reader-voice`} aria-labelledby={`${uid}-tab-reader-voice`} className="mt-3 space-y-3">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("스마트폰 독자 스크롤 템포 시뮬레이터", "Mobile Reader Scroll Pacing Simulator")}
              </span>
              <span className="text-xs tabular-nums text-fg-3">{pick(`배율 ${(scrollReport.scaleRatio * 100).toFixed(0)}% · ${scrollSpeedPxPerSec}px/s`, `Scale ${(scrollReport.scaleRatio * 100).toFixed(0)}% · ${scrollSpeedPxPerSec}px/s`)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {VIEWPORT_IDS.map((vid) => (
                <button key={vid} type="button" aria-pressed={viewportId === vid} onClick={() => handleSelectViewport(vid)} className={`${PILL_BTN} ${viewportId === vid ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(READER_VIEWPORT_PRESETS[vid].labelKo, READER_VIEWPORT_PRESETS[vid].labelEn)}
                </button>
              ))}
              <label htmlFor={`${uid}-speed`} className="ml-auto flex items-center gap-2 text-xs text-fg-2">
                <span>{pick("스크롤 속도", "Scroll Speed")}</span>
                <input id={`${uid}-speed`} type="range" min={280} max={680} step={20} value={scrollSpeedPxPerSec} onChange={(e) => setScrollSpeedPxPerSec(Number(e.target.value))} className={`w-28 accent-accent ${FOCUS_RING}`} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiTile label={pick("시선 흐름 점수", "Eye-Flow Score")} value={`${scrollReport.eyeFlowScore0To100} / 100`} testId="scroll-eyeflow-score" />
              <KpiTile label={pick("최소 말풍선 폰트", "Min Bubble Font")} value={`${scrollReport.minRenderedFontPx.toFixed(1)} px`} testId="scroll-min-font" tone={scrollReport.unreadableBubbleCount > 0 ? "bad" : "good"} />
              <KpiTile label={pick("클리프행어 정적 여백", "Cliffhanger Pause")} value={primaryCliffhanger ? `${primaryCliffhanger.breathPauseSec.toFixed(2)}s (${Math.round(primaryCliffhanger.renderedGutterPx)}px)` : "—"} testId="scroll-cliffhanger-pause" />
              <KpiTile label={pick("평균 컷 여백 / 총 시간", "Avg Gutter / Total")} value={`${Math.round(scrollReport.averageGutterPx)}px · ${scrollReport.totalScrollSec.toFixed(1)}s`} />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Volume2 className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("다국어 보이스 · 연출 호흡 프리뷰", "Multilingual Voice & Directing Pacing")}
              </span>
              <span data-testid="voice-rhythm-score" className="text-xs font-semibold tabular-nums text-fg-2">
                {pick(`리듬 ${voiceReport.rhythmScore0To100}점 · 총 발화 ${voiceReport.totalDurationSec.toFixed(1)}초`, `Rhythm ${voiceReport.rhythmScore0To100} · Total ${voiceReport.totalDurationSec.toFixed(1)}s`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {VOICE_LOCALES.map(([id, ko, en]) => (
                <button key={id} type="button" aria-pressed={voiceLocale === id} onClick={() => setVoiceLocale(id)} className={`${PILL_BTN} ${voiceLocale === id ? ACTIVE_BTN : IDLE_BTN}`}>
                  {pick(ko, en)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiTile label={pick("컷당 최대 발화", "Max Cut Speech")} value={`${voiceReport.maxCutSpeechSec.toFixed(2)}s`} />
              <KpiTile label={pick("말풍선 넘침 위험", "Overflow Risk")} value={`${voiceReport.overflowBubbleCount}`} testId="voice-overflow-count" tone={voiceReport.overflowBubbleCount > 0 ? "bad" : "good"} />
              <KpiTile label={pick("JA 세로 최대 열", "JA Max Columns")} value={voiceLocale === "ja" ? `${voiceReport.maxJaVerticalColumns}` : "—"} testId="voice-ja-columns" />
              <KpiTile label={pick("연출 경고", "Directing Alerts")} value={`${voiceReport.warnings.length}`} />
            </div>
            {voiceReport.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-warn">
                {voiceReport.warnings.slice(0, 3).map((w, idx) => (
                  <li key={`${w.code}-${w.panelId}-${idx}`} className="rounded-lg border border-warn/40 bg-warning-soft px-2.5 py-1.5">
                    {pick(w.messageKo, w.messageEn)}
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
