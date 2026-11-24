/**
 * 수공예 아날로그 미학 · 물리 관성 UI 모션 · 절차적 OKLCH 스튜디오 테마 · 습관 학습 적응형 워크벤치 3탭 패널 (Wave 40A).
 *
 * Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건) · Props 없이 단독 렌더링 지원 ·
 * 인메모리 순수 연산(브라우저 스토리지 0건) · 모션 감소 0ms 즉시 정착 및 옵트인 배치 보호 준수.
 */

import {
  Activity, CheckCircle2, Droplets, Eye, Feather, Keyboard, Layers,
  Palette, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Volume2, Wand2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useI18n } from "@/shared/lib/i18n";

import {
  applyWorkbenchProposal, buildWorkbenchProposal, createAdaptiveWorkbenchState,
  DEFAULT_HABIT_SCENARIOS, DEFAULT_WORKBENCH_TOOLS, dismissWorkbenchProposal,
  previewWorkbenchProposal, recordToolSequence, recordToolUsage,
  resetWorkbenchLearning, revertWorkbenchLayout,
  type AdaptiveWorkbenchState, type ArtistHabitScenarioSpec,
  type WorkbenchApprovalStatus, type WorkbenchToolId,
} from "./adaptive-workbench-learner";
import {
  ANALOG_ARTISAN_PRESET_IDS, ANALOG_ARTISAN_PRESETS, applyAnalogJitterProfile,
  DEFAULT_SAMPLE_STROKES, type AnalogArtisanPresetId, type AnalogJitterResult,
  type SampleAnalogStrokeSpec,
} from "./analog-jitter-engine";
import {
  PROCEDURAL_THEME_MOOD_IDS, PROCEDURAL_THEME_PRESETS, simulateTactileSpring,
  synthesizeProceduralStudioTheme, TACTILE_MATERIAL_IDS, TACTILE_MATERIAL_SIGNATURES,
  type ProceduralStudioTheme, type ProceduralThemeMoodId,
  type TactileMaterialId, type TactileSpringSimulationResult,
} from "./spring-inertia-theme-engine";

export type HandcraftedAtelierTabId = "analog-jitter" | "spring-theme" | "adaptive-workbench";

export interface StudioHandcraftedAtelierPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: HandcraftedAtelierTabId;
  readonly initialPresetId?: AnalogArtisanPresetId;
  readonly initialMaterial?: TactileMaterialId;
  readonly initialThemeMood?: ProceduralThemeMoodId;
  readonly initialReducedMotion?: boolean;
  readonly onAnalogProfileApplied?: (result: AnalogJitterResult) => void;
  readonly onThemeSynthesized?: (theme: ProceduralStudioTheme) => void;
  readonly onWorkbenchApplied?: (state: AdaptiveWorkbenchState) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

function approvalBadgeTone(status: WorkbenchApprovalStatus): string {
  if (status === "applied") return "border-good bg-good-soft text-good";
  if (status === "previewing") return "border-accent bg-accent-soft text-accent";
  if (status === "reverted") return "border-line bg-warning-soft text-warn";
  return "border-line bg-raised text-fg-2";
}

function buildSpringCurveSvgPath(sim: TactileSpringSimulationResult): string {
  const width = 300;
  const height = 108;
  const padX = 14;
  const padY = 16;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const mapY = (val: number): number => {
    const clamped = Math.max(-0.15, Math.min(1.35, val));
    return Math.round((padY + plotH * (1 - (clamped + 0.15) / 1.5)) * 100) / 100;
  };
  if (sim.reducedMotion || sim.frames.length <= 1) {
    return `M ${padX} ${mapY(0)} L ${padX} ${mapY(1)} L ${width - padX} ${mapY(1)}`;
  }
  const totalTime = Math.max(1, sim.settleTimeMs);
  return sim.frames
    .map((frame, i) => {
      const x = Math.round((padX + (frame.timeMs / totalTime) * plotW) * 100) / 100;
      return `${i === 0 ? "M" : "L"} ${x} ${mapY(frame.value)}`;
    })
    .join(" ");
}

function findToolLabel(toolId: WorkbenchToolId, isKo: boolean): string {
  const found = DEFAULT_WORKBENCH_TOOLS.find((item) => item.id === toolId);
  return found ? (isKo ? found.labelKo : found.labelEn) : toolId;
}

/** 수공예 아날로그 미학 · 물리 관성 UI 모션 · 절차적 테마 · 습관 학습 적응형 워크벤치 통합 패널. */
export function StudioHandcraftedAtelierPanel(props: StudioHandcraftedAtelierPanelProps): ReactElement {
  const {
    locale, className, initialTab = "analog-jitter", initialPresetId = "fountain-watercolor",
    initialMaterial = "wood", initialThemeMood = "noir-ink", initialReducedMotion = false,
    onAnalogProfileApplied, onThemeSynthesized, onWorkbenchApplied,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<HandcraftedAtelierTabId>(initialTab);
  const [presetId, setPresetId] = useState<AnalogArtisanPresetId>(initialPresetId);
  const [sampleStrokeId, setSampleStrokeId] = useState<SampleAnalogStrokeSpec["id"]>("slow-ink-pause");
  const [seed, setSeed] = useState<number>(20261124);
  const [materialId, setMaterialId] = useState<TactileMaterialId>(initialMaterial);
  const [reducedMotion, setReducedMotion] = useState<boolean>(initialReducedMotion);
  const [themeMoodId, setThemeMoodId] = useState<ProceduralThemeMoodId>(initialThemeMood);
  const [chromaScalePct, setChromaScalePct] = useState<number>(100);
  const [workbenchState, setWorkbenchState] = useState<AdaptiveWorkbenchState>(() => createAdaptiveWorkbenchState());

  const activeSampleStroke = useMemo<SampleAnalogStrokeSpec>(() => {
    const matched = DEFAULT_SAMPLE_STROKES.find((s) => s.id === sampleStrokeId);
    if (matched) return matched;
    return DEFAULT_SAMPLE_STROKES[0] ?? { id: "slow-ink-pause", labelKo: "기본 선", labelEn: "Default Stroke", points: [] };
  }, [sampleStrokeId]);

  const analogResult = useMemo<AnalogJitterResult>(
    () => applyAnalogJitterProfile(activeSampleStroke.points, presetId, seed),
    [activeSampleStroke.points, presetId, seed],
  );
  const springSimulation = useMemo<TactileSpringSimulationResult>(
    () => simulateTactileSpring({ material: materialId, from: 0, to: 1, reducedMotion }),
    [materialId, reducedMotion],
  );
  const springCurvePath = useMemo(() => buildSpringCurveSvgPath(springSimulation), [springSimulation]);
  const proceduralTheme = useMemo<ProceduralStudioTheme>(
    () => synthesizeProceduralStudioTheme(themeMoodId, { chromaScale: chromaScalePct / 100 }),
    [themeMoodId, chromaScalePct],
  );
  const liveProposal = useMemo(
    () => workbenchState.pendingProposal ?? buildWorkbenchProposal(workbenchState),
    [workbenchState],
  );

  const tabs: readonly { readonly id: HandcraftedAtelierTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "analog-jitter", label: pick("아날로그 지터·잉크 번짐", "Analog Jitter & Ink Bloom"), icon: <Feather className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "spring-theme", label: pick("물리 관성·절차적 테마", "Tactile Spring & OKLCH Theme"), icon: <Palette className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "adaptive-workbench", label: pick("적응형 워크벤치 학습", "Adaptive Workbench Learner"), icon: <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const handleSelectPreset = (nextPreset: AnalogArtisanPresetId): void => {
    setPresetId(nextPreset);
    onAnalogProfileApplied?.(applyAnalogJitterProfile(activeSampleStroke.points, nextPreset, seed));
  };
  const handleStepSeed = (): void => {
    const nextSeed = seed + 137;
    setSeed(nextSeed);
    onAnalogProfileApplied?.(applyAnalogJitterProfile(activeSampleStroke.points, presetId, nextSeed));
  };
  const handleSelectThemeMood = (nextMood: ProceduralThemeMoodId): void => {
    setThemeMoodId(nextMood);
    onThemeSynthesized?.(synthesizeProceduralStudioTheme(nextMood, { chromaScale: chromaScalePct / 100 }));
  };
  const handleTapTool = (toolId: WorkbenchToolId): void => setWorkbenchState((prev) => recordToolUsage(prev, toolId));
  const handleRunScenario = (scenario: ArtistHabitScenarioSpec): void => setWorkbenchState((prev) => recordToolSequence(prev, scenario.sequence));
  const handlePreviewProposal = (): void => setWorkbenchState((prev) => previewWorkbenchProposal(prev));
  const handleApplyProposal = (): void => {
    const next = applyWorkbenchProposal(workbenchState);
    setWorkbenchState(next);
    if (next.approvalStatus === "applied") onWorkbenchApplied?.(next);
  };
  const handleRevertLayout = (): void => setWorkbenchState((prev) => revertWorkbenchLayout(prev));
  const handleDismissProposal = (): void => setWorkbenchState((prev) => dismissWorkbenchProposal(prev));
  const handleResetWorkbench = (): void => setWorkbenchState((prev) => resetWorkbenchLearning(prev));

  const approvalStatusLabel =
    workbenchState.approvalStatus === "applied"
      ? pick("승인 반영됨 · 언제든 복구 가능", "Applied (Revert Ready)")
      : workbenchState.approvalStatus === "previewing"
        ? pick("미리보기 중 · 실제 버튼 미이동", "Previewing (Buttons Unmoved)")
        : workbenchState.approvalStatus === "reverted"
          ? pick("이전 배치로 복구됨", "Reverted to Previous Layout")
          : pick("관찰 중 · 임의 이동 없음", "Observing (No Auto-Move)");

  return (
    <section
      data-testid="handcrafted-atelier-feel-panel"
      aria-label={pick("수공예 아날로그 미학 · 물리 관성 모션 · 절차적 OKLCH 테마 · 적응형 워크벤치", "Handcrafted Analog Aesthetics, Tactile Spring Motion, Procedural OKLCH Theme, and Adaptive Workbench")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("수공예 아날로그 화실 · 물리 관성 모션 · 절차적 테마 · 적응형 워크벤치", "Handcrafted Atelier · Tactile Spring · Procedural Theme · Adaptive Workbench")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("기계적인 벡터 균일선을 손맛 있는 잉크·종이결 선으로 다듬고, 화구 물리 관성과 WCAG AA 절차 테마, 사용자 승인 기반 습관 학습 배치를 제어합니다.", "Replace sterile vector strokes with organic ink bloom and paper grain, simulate tactile RK4 springs with WCAG AA OKLCH themes, and learn tool habits strictly opt-in.")}
          </p>
        </div>
        <span data-testid="badge-atelier-craft-mode" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-good bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick("온디바이스 수공예 엔진 · AA 대비 보증", "On-Device Craft · WCAG AA")}
        </span>
      </header>

      <div role="tablist" aria-label={pick("수공예 아틀리에 기능 탭", "Handcrafted atelier tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? ACTIVE_TONE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "analog-jitter" && (
        <div role="tabpanel" id={`${uid}-panel-analog-jitter`} aria-labelledby={`${uid}-tab-analog-jitter`} data-testid="panel-analog-jitter" className="space-y-4">
          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">{pick("장인 필기구 5종 프리셋", "5 Artisan Analog Presets")}</h3>
              <button type="button" data-testid="btn-reseed-jitter" onClick={handleStepSeed} className={`${PILL_BTN} ${IDLE_TONE}`}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular-nums">{pick(`결 시드 변경 (#${seed})`, `Reseed Grain (#${seed})`)}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {ANALOG_ARTISAN_PRESET_IDS.map((id) => {
                const p = ANALOG_ARTISAN_PRESETS[id];
                return (
                  <button key={id} type="button" data-testid={`preset-btn-${id}`} onClick={() => handleSelectPreset(id)} className={`${PILL_BTN} ${presetId === id ? ACTIVE_TONE : IDLE_TONE}`}>
                    <span>{isKo ? p.labelKo : p.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-fg">{isKo ? analogResult.preset.mediumKo : analogResult.preset.mediumEn}</div>
                <p className="text-fg-2">{isKo ? analogResult.preset.descriptionKo : analogResult.preset.descriptionEn}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_SAMPLE_STROKES.map((sample) => (
                  <button key={sample.id} type="button" data-testid={`sample-stroke-${sample.id}`} onClick={() => setSampleStrokeId(sample.id)} className={`${PILL_BTN} ${sampleStrokeId === sample.id ? ACTIVE_TONE : IDLE_TONE}`}>
                    {isKo ? sample.labelKo : sample.labelEn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("수공예 자연도", "Organic Craft Score")}</div>
              <div data-testid="analog-humanization-score" className="mt-1 text-lg font-bold text-accent tabular-nums">{analogResult.metrics.organicHumanizationScore} / 100</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("평균 손떨림 지터", "Mean Hand Jitter")}</div>
              <div data-testid="analog-mean-jitter" className="mt-1 text-lg font-bold text-fg tabular-nums">{analogResult.metrics.meanJitterPx.toFixed(2)}px</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("모세관 잉크 번짐", "Capillary Bloom")}</div>
              <div data-testid="analog-bloom-readout" className="mt-1 text-lg font-bold text-cool tabular-nums">
                {analogResult.metrics.bloomSpotCount}{pick("곳 · ", " · ")}{analogResult.metrics.maxBloomRadiusPx.toFixed(1)}px
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("종이결 페더링", "Paper Feathering")}</div>
              <div data-testid="analog-feather-readout" className="mt-1 text-lg font-bold text-fg tabular-nums">{analogResult.metrics.meanFeatherSpreadPx.toFixed(2)}px</div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                <Droplets className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
                {pick("기계 벡터 원본(점선) vs 아날로그 수공예 변환(실선)", "Mechanical Vector (Dashed) vs Analog Craft (Solid)")}
              </span>
              <span className="text-[11px] text-fg-2 tabular-nums">
                {pick(`섬유 잔털 ${analogResult.featherWhiskers.length}가닥 · 비백률 ${Math.round(analogResult.metrics.meanDrySkipRatio * 100)}%`, `${analogResult.featherWhiskers.length} fiber wisps · ${Math.round(analogResult.metrics.meanDrySkipRatio * 100)}% dry skip`)}
              </span>
            </div>
            <svg data-testid="analog-stroke-preview" viewBox="0 0 328 152" role="img" aria-label={pick("아날로그 지터와 모세관 잉크 번짐 비교 미리보기", "Analog jitter and capillary ink bloom comparison preview")} className="h-40 w-full rounded-lg border border-line bg-canvas">
              <path d={analogResult.sourceSvgPathData} className="fill-none stroke-fg-3/55" strokeWidth={1.25} strokeDasharray="4 4" />
              {analogResult.bloomSpots.map((spot) => (
                <circle key={`bloom-${spot.pointIndex}`} cx={spot.x} cy={spot.y} r={Math.min(18, Math.max(3, spot.radiusPx * 1.45))} className="fill-accent/20 stroke-accent/55" strokeWidth={0.8} />
              ))}
              {analogResult.featherWhiskers.map((whisker) => (
                <line key={`feather-${whisker.pointIndex}`} x1={whisker.originX} y1={whisker.originY} x2={whisker.tipX} y2={whisker.tipY} className="stroke-cool/70" strokeWidth={0.9} strokeLinecap="round" />
              ))}
              <path d={analogResult.svgPathData} className="fill-none stroke-accent" strokeWidth={analogResult.preset.baseStrokeWidthPx} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

      {activeTab === "spring-theme" && (
        <div role="tabpanel" id={`${uid}-panel-spring-theme`} aria-labelledby={`${uid}-tab-spring-theme`} data-testid="panel-spring-theme" className="space-y-4">
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fg">{pick("화구 물성 RK4 스프링 관성 시뮬레이터", "Tactile Instrument RK4 Spring Simulator")}</h3>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-reduced-motion`} className="text-xs font-medium text-fg-2">
                  {pick("모션 감소 (0ms 즉시 정착)", "Reduced Motion (0ms Instant)")}
                </label>
                <Switch id={`${uid}-reduced-motion`} data-testid="switch-reduced-motion" checked={reducedMotion} onCheckedChange={setReducedMotion} aria-label={pick("모션 감소 모드 전환", "Toggle reduced motion mode")} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {TACTILE_MATERIAL_IDS.map((matId) => {
                const sig = TACTILE_MATERIAL_SIGNATURES[matId];
                return (
                  <button key={matId} type="button" data-testid={`material-btn-${matId}`} onClick={() => setMaterialId(matId)} className={`${PILL_BTN} ${materialId === matId ? ACTIVE_TONE : IDLE_TONE}`}>
                    <span>{isKo ? sig.labelKo : sig.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <svg data-testid="spring-curve-preview" viewBox="0 0 300 108" role="img" aria-label={pick("RK4 스프링 변위 응답 곡선", "RK4 spring displacement response curve")} className="h-32 w-full rounded-lg border border-line bg-canvas">
                <line x1={14} y1={33.73} x2={286} y2={33.73} className="stroke-fg-3/50" strokeWidth={1} strokeDasharray="4 4" />
                <path d={springCurvePath} className="fill-none stroke-accent" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-[11px] text-fg-3">{pick("정착 시간", "Settle Time")}</div>
                    <div data-testid="spring-settle-ms" className="font-bold text-fg tabular-nums">
                      {springSimulation.settleTimeMs}ms{springSimulation.settledImmediately ? pick(" (즉시 정착)", " (Instant)") : ""}
                    </div>
                  </div>
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-[11px] text-fg-3">{pick("감쇠비 · 오버슈트", "Damping · Overshoot")}</div>
                    <div className="font-bold text-accent tabular-nums">ζ {springSimulation.dampingRatio.toFixed(2)} · {Math.round(springSimulation.peakOvershootRatio * 100)}%</div>
                  </div>
                </div>
                <div className="rounded-md border border-line bg-raised p-2.5 text-[11px] text-fg-2">
                  <div className="flex items-center gap-1.5 font-semibold text-fg">
                    <Volume2 className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
                    <span className="tabular-nums">
                      {pick(`촉각·음향 시그니처 · ${springSimulation.materialSignature.acoustic.fundamentalHz}Hz · ${springSimulation.materialSignature.acoustic.decayMs}ms 감쇠`, `Tactile & Acoustic · ${springSimulation.materialSignature.acoustic.fundamentalHz}Hz · ${springSimulation.materialSignature.acoustic.decayMs}ms decay`)}
                    </span>
                  </div>
                  <p className="mt-1">{isKo ? springSimulation.materialSignature.acoustic.descriptionKo : springSimulation.materialSignature.acoustic.descriptionEn}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fg">{pick("프로젝트 장르별 절차적 OKLCH 스튜디오 테마", "Procedural OKLCH Studio Theme by Genre")}</h3>
              </div>
              <span data-testid="theme-wcag-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${proceduralTheme.contrastAudit.wcagAaPassed ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {pick(`WCAG AA 통과 · 최소 ${proceduralTheme.contrastAudit.minTextContrastRatio.toFixed(2)}:1`, `WCAG AA Pass · Min ${proceduralTheme.contrastAudit.minTextContrastRatio.toFixed(2)}:1`)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {PROCEDURAL_THEME_MOOD_IDS.map((mood) => {
                const meta = PROCEDURAL_THEME_PRESETS[mood];
                return (
                  <button key={mood} type="button" data-testid={`theme-mood-${mood}`} onClick={() => handleSelectThemeMood(mood)} className={`${PILL_BTN} ${themeMoodId === mood ? ACTIVE_TONE : IDLE_TONE}`}>
                    <span>{isKo ? meta.labelKo : meta.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label htmlFor={`${uid}-chroma-scale`} className="font-medium text-fg-2">{pick("분위기 채도 강도", "Atmosphere Chroma")}</label>
              <input id={`${uid}-chroma-scale`} data-testid="theme-chroma-slider" type="range" min={50} max={140} step={5} value={chromaScalePct} onChange={(e) => setChromaScalePct(Number(e.target.value))} className="min-h-11 w-44 accent-accent" />
              <span className="font-semibold text-fg tabular-nums">{chromaScalePct}%</span>
            </div>

            <div
              data-testid="procedural-theme-preview"
              style={{ backgroundColor: proceduralTheme.tokens.canvas.css, borderColor: proceduralTheme.tokens.line.css, color: proceduralTheme.tokens.fg.css }}
              className="space-y-2.5 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold">{isKo ? proceduralTheme.labelKo : proceduralTheme.labelEn}</div>
                  <div style={{ color: proceduralTheme.tokens.fg2.css }} className="text-[11px]">{isKo ? proceduralTheme.atmosphereKo : proceduralTheme.atmosphereEn}</div>
                </div>
                <span style={{ backgroundColor: proceduralTheme.tokens.accent.css, color: proceduralTheme.tokens.onAccent.css }} className="rounded-md px-2.5 py-1 text-[11px] font-semibold">
                  {pick("주 행동 CTA 예시", "Primary CTA")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["canvas", "panel", "card", "raised"] as const).map((surfaceKey) => (
                  <div key={surfaceKey} style={{ backgroundColor: proceduralTheme.tokens[surfaceKey].css, borderColor: proceduralTheme.tokens.lineStrong.css, color: proceduralTheme.tokens.fg.css }} className="rounded-md border p-2 text-[11px]">
                    <div className="font-semibold">{surfaceKey}</div>
                    <div style={{ color: proceduralTheme.tokens.fg3.css }} className="truncate font-mono text-[10px] tabular-nums">{proceduralTheme.tokens[surfaceKey].css}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-fg-3">{isKo ? proceduralTheme.artworkIsolationNoticeKo : proceduralTheme.artworkIsolationNoticeEn}</p>
          </div>
        </div>
      )}

      {activeTab === "adaptive-workbench" && (
        <div role="tabpanel" id={`${uid}-panel-adaptive-workbench`} aria-labelledby={`${uid}-tab-adaptive-workbench`} data-testid="panel-adaptive-workbench" className="space-y-4">
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Keyboard className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fg">{pick("현재 활성 툴바 (승인 전 자동 이동 절대 금지)", "Active Toolbar (Zero Unconsented Moves)")}</h3>
              </div>
              <span data-testid="workbench-approval-status" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${approvalBadgeTone(workbenchState.approvalStatus)}`}>
                {approvalStatusLabel}
              </span>
            </div>

            <div data-testid="active-toolbar-strip" className="flex flex-wrap gap-2">
              {workbenchState.activeToolbarOrder.map((toolId, idx) => (
                <button key={toolId} type="button" data-testid={`active-tool-${toolId}`} data-order-index={idx} onClick={() => handleTapTool(toolId)} className={`${PILL_BTN} ${workbenchState.lastToolId === toolId ? ACTIVE_TONE : IDLE_TONE}`}>
                  <span>{findToolLabel(toolId, isKo)}</span>
                  <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{workbenchState.activeShortcuts[toolId]}</kbd>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_HABIT_SCENARIOS.map((scenario) => (
                  <button key={scenario.id} type="button" data-testid={`scenario-btn-${scenario.id}`} onClick={() => handleRunScenario(scenario)} className={`${PILL_BTN} ${IDLE_TONE}`}>
                    {isKo ? scenario.labelKo : scenario.labelEn}
                  </button>
                ))}
              </div>
              <button type="button" data-testid="btn-workbench-reset" onClick={handleResetWorkbench} className={`${PILL_BTN} ${IDLE_TONE}`}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("학습 초기화", "Reset Memory")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">{pick("마르코프 1차 전이 빈도 상위 쌍", "Top Markov 1st-Order Transitions")}</h3>
                <span data-testid="workbench-transition-count" className="text-[11px] text-fg-2 tabular-nums">
                  {pick(`총 전환 ${workbenchState.totalTransitions}회`, `${workbenchState.totalTransitions} transitions`)}
                </span>
              </div>
              {liveProposal.topTransitions.length === 0 ? (
                <p className="rounded-md border border-line bg-raised p-2.5 text-xs text-fg-2">
                  {pick("위 툴바 버튼을 눌러 도구를 오가거나 작업 루틴을 실행하면 1차 전이 행렬이 인메모리에 누적됩니다.", "Tap tools above or replay a workflow routine to populate the in-memory transition matrix.")}
                </p>
              ) : (
                <ul data-testid="markov-top-pairs" className="space-y-1.5 text-xs">
                  {liveProposal.topTransitions.map((pair) => (
                    <li key={`${pair.fromToolId}-${pair.toToolId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2">
                      <span className="font-semibold text-fg">{findToolLabel(pair.fromToolId, isKo)} → {findToolLabel(pair.toToolId, isKo)}</span>
                      <span className="text-[11px] text-accent tabular-nums">{pair.count}{pick("회 · ", "x · ")}{Math.round(pair.probability * 100)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
              <h3 className="text-xs font-semibold text-fg">{pick("옵트인 배치·단축키 제안 (미리보기 → 승인 → 복구)", "Opt-In Layout & Shortcut Proposal")}</h3>
              <p data-testid="workbench-proposal-summary" className="text-xs text-fg-2">{isKo ? liveProposal.summaryKo : liveProposal.summaryEn}</p>

              {workbenchState.approvalStatus === "previewing" && workbenchState.pendingProposal && (
                <div data-testid="workbench-preview-box" className="space-y-2 rounded-md border border-accent bg-accent-soft p-2.5 text-xs">
                  <div className="font-semibold text-accent tabular-nums">
                    {pick(`제안 순서 (동선 ${workbenchState.pendingProposal.estimatedTravelReductionPct}% 단축 예정)`, `Proposed Order (${workbenchState.pendingProposal.estimatedTravelReductionPct}% shorter travel)`)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {workbenchState.pendingProposal.proposedToolbarOrder.map((id) => (
                      <span key={id} className="rounded border border-line bg-card px-2 py-0.5 text-[11px] text-fg">
                        {findToolLabel(id, isKo)} ({workbenchState.pendingProposal?.proposedShortcuts[id]})
                      </span>
                    ))}
                  </div>
                  {workbenchState.pendingProposal.shortcutPromotions.length > 0 && (
                    <ul className="space-y-1 text-[11px] text-fg-2">
                      {workbenchState.pendingProposal.shortcutPromotions.map((promo) => (
                        <li key={promo.toolId}>• {isKo ? promo.reasonKo : promo.reasonEn} ({promo.currentShortcut} → {promo.suggestedShortcut})</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="btn-workbench-preview" disabled={!liveProposal.readyForProposal || !liveProposal.hasActionableChanges} onClick={handlePreviewProposal} className={`${PILL_BTN} disabled:cursor-not-allowed disabled:opacity-45 ${workbenchState.approvalStatus === "previewing" ? ACTIVE_TONE : IDLE_TONE}`}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {pick("배치안 미리보기", "Preview Proposal")}
                </button>
                <button type="button" data-testid="btn-workbench-apply" disabled={!liveProposal.readyForProposal || !liveProposal.hasActionableChanges} onClick={handleApplyProposal} className={`${PILL_BTN} border-accent bg-accent text-on-accent disabled:cursor-not-allowed disabled:opacity-45`}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {pick("승인 후 적용", "Approve & Apply")}
                </button>
                <button type="button" data-testid="btn-workbench-revert" disabled={workbenchState.appliedCount === 0} onClick={handleRevertLayout} className={`${PILL_BTN} disabled:cursor-not-allowed disabled:opacity-45 ${IDLE_TONE}`}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {pick("이전 배치 복구", "Revert Layout")}
                </button>
                {workbenchState.approvalStatus === "previewing" && (
                  <button type="button" data-testid="btn-workbench-dismiss" onClick={handleDismissProposal} className={`${PILL_BTN} ${IDLE_TONE}`}>
                    {pick("미리보기 닫기", "Dismiss")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
