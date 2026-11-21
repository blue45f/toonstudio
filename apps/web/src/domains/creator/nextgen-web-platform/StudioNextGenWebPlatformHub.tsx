import { Clapperboard, Cpu, Smartphone, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  advanceOnboardingStep,
  completeCurrentOnboardingStep,
  getOnboardingProgressSummary,
  jumpToOnboardingStep,
  loadBeginnerOnboardingState,
  resolveMobileThumbDockLayout,
  restartBeginnerOnboarding,
  retreatOnboardingStep,
  saveBeginnerOnboardingState,
  skipBeginnerOnboarding,
  type BeginnerOnboardingState,
  type MobileDockActionId,
  type MobileDockHandedness,
} from "./beginner-onboarding-mobile-dock";
import {
  STUDIO_FALLBACK_COLOR_SWATCHES,
  buildStudioSpeculationRulesSpec,
  createComputePressureMonitor,
  createStudioAudioWorkletProcessor,
  detectChromeNextGenCapabilities,
  getComputePressurePolicy,
  injectSpeculationRules,
  openStudioReferencePipWindow,
  probeCanvasHdrDisplayP3,
  probeWebNnRuntime,
  queryWebtoonLocalFonts,
  runScopedViewTransition,
  sampleScreenColorWithEyeDropper,
  type ComputePressureState,
  type LocalFontCatalogEntry,
  type WebNnProbeResult,
  type WebtoonFontCategory,
} from "./chrome-nextgen-apis";
import "./nextgen-web-platform.css";
import { StudioNextGenBeginnerTab } from "./StudioNextGenBeginnerTab";
import { StudioNextGenCutsTab } from "./StudioNextGenCutsTab";
import { StudioNextGenPlatformTab } from "./StudioNextGenPlatformTab";
import {
  DEFAULT_DEMO_CUTS_PANELS,
  buildCutsTimelinePlan,
  exportCutsMovingWebtoon,
  type CutsExportProgress,
  type CutsExportResult,
  type CutsMotionPreset,
  type CutsPreferredCodec,
} from "./webcodecs-cuts-exporter";

type HubTabId = "platform" | "cuts" | "beginner";

export interface StudioNextGenWebPlatformHubProps {
  readonly projectId: string;
  readonly locale: "ko" | "en";
  readonly manuscriptWidth?: number;
  readonly manuscriptHeight?: number;
  readonly initialTab?: HubTabId;
}

export function StudioNextGenWebPlatformHub({
  projectId,
  manuscriptWidth = 800,
  manuscriptHeight = 1280,
  initialTab = "platform",
}: StudioNextGenWebPlatformHubProps) {
  const bt = useBilingual("StudioNextGenWebPlatformHub");
  const [activeTab, setActiveTab] = useState<HubTabId>(initialTab);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const capabilities = useMemo(() => detectChromeNextGenCapabilities(), []);
  const hdrInfo = useMemo(() => probeCanvasHdrDisplayP3(), []);
  const [pressureState, setPressureState] = useState<ComputePressureState>("nominal");
  const [livePressureActive, setLivePressureActive] = useState(false);
  const pressurePolicy = useMemo(() => getComputePressurePolicy(pressureState), [pressureState]);
  const [sampledColor, setSampledColor] = useState<string>(STUDIO_FALLBACK_COLOR_SWATCHES[0].oklch);
  const [fonts, setFonts] = useState<readonly LocalFontCatalogEntry[]>([]);
  const [fontSource, setFontSource] = useState<"local-font-access" | "fallback-presets" | null>(null);
  const [webNnResult, setWebNnResult] = useState<WebNnProbeResult | null>(null);
  const [speculationApplied, setSpeculationApplied] = useState(false);
  const [pipNote, setPipNote] = useState<string>("");
  const [audioNote, setAudioNote] = useState<string>("");
  const pipCloseRef = useRef<(() => void) | null>(null);

  const [cutsDurationSec, setCutsDurationSec] = useState<15 | 30 | 45>(30);
  const [cutsCodec, setCutsCodec] = useState<CutsPreferredCodec>("av1");
  const [cutsPreset, setCutsPreset] = useState<CutsMotionPreset>("parallax-depth");
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeSfxSync, setIncludeSfxSync] = useState(true);
  const [cutsProgress, setCutsProgress] = useState<CutsExportProgress | null>(null);
  const [cutsResult, setCutsResult] = useState<CutsExportResult | null>(null);
  const [cutsExporting, setCutsExporting] = useState(false);

  const [onboardingState, setOnboardingState] = useState<BeginnerOnboardingState>(() =>
    loadBeginnerOnboardingState(typeof window !== "undefined" ? window.localStorage : null),
  );
  const [spotlightHintOpen, setSpotlightHintOpen] = useState(true);
  const [mobileViewportWidth, setMobileViewportWidth] = useState<number>(390);
  const [mobileHandedness, setMobileHandedness] = useState<MobileDockHandedness>("right");
  const [activeMobileAction, setActiveMobileAction] = useState<MobileDockActionId>("draw");

  const onboardingSummary = useMemo(
    () => getOnboardingProgressSummary(onboardingState),
    [onboardingState],
  );
  const mobileDockLayout = useMemo(
    () =>
      resolveMobileThumbDockLayout({
        viewportWidthPx: mobileViewportWidth,
        safeAreaBottomPx: 20,
        handedness: mobileHandedness,
      }),
    [mobileHandedness, mobileViewportWidth],
  );

  const configuredPanels = useMemo(
    () =>
      DEFAULT_DEMO_CUTS_PANELS.map((panel, idx) =>
        idx === 0 ? { ...panel, motionPreset: cutsPreset } : panel,
      ),
    [cutsPreset],
  );

  const cutsTimeline = useMemo(
    () =>
      buildCutsTimelinePlan(configuredPanels, {
        targetDurationSec: cutsDurationSec,
        width: Math.max(720, Math.min(1080, manuscriptWidth)),
        height: Math.max(1280, Math.min(1920, manuscriptHeight)),
        fps: 30,
        preferredCodec: cutsCodec,
        includeSubtitles,
        includeSfxSync,
        pressureState,
      }),
    [
      configuredPanels,
      cutsCodec,
      cutsDurationSec,
      includeSfxSync,
      includeSubtitles,
      manuscriptHeight,
      manuscriptWidth,
      pressureState,
    ],
  );

  useEffect(() => {
    if (!livePressureActive) return undefined;
    const monitor = createComputePressureMonitor((policy) => {
      setPressureState(policy.state);
    });
    return () => {
      monitor.disconnect();
    };
  }, [livePressureActive]);

  useEffect(() => {
    return () => {
      pipCloseRef.current?.();
    };
  }, []);

  const updateOnboarding = useCallback((next: BeginnerOnboardingState) => {
    setOnboardingState(next);
    if (typeof window !== "undefined") {
      saveBeginnerOnboardingState(window.localStorage, next);
    }
  }, []);

  const handleSelectTab = useCallback((nextTab: HubTabId) => {
    runScopedViewTransition(
      () => {
        setActiveTab(nextTab);
      },
      { scopeName: "nextgen-hub-tab", transitionTypes: ["tab-switch"] },
    );
  }, []);

  const handleSampleEyeDropper = useCallback(async () => {
    const result = await sampleScreenColorWithEyeDropper();
    setSampledColor(result.sampledColor);
    setStatusMessage(bt(result.noteKo, result.noteEn));
  }, [bt]);

  const handleLoadFonts = useCallback(
    async (category: WebtoonFontCategory | "all") => {
      const result = await queryWebtoonLocalFonts({ category, limit: 8 });
      setFonts(result.fonts);
      setFontSource(result.source);
      setStatusMessage(
        result.source === "local-font-access"
          ? bt(`내 PC 글꼴 ${result.fonts.length}종을 불러왔어요.`, `Loaded ${result.fonts.length} local fonts.`)
          : bt(`추천 웹툰 글꼴 ${result.fonts.length}종을 바로 적용할 수 있어요.`, `${result.fonts.length} recommended webtoon fonts are ready.`),
      );
    },
    [bt],
  );

  const handleOpenReferencePip = useCallback(async () => {
    pipCloseRef.current?.();
    const res = await openStudioReferencePipWindow({
      title: bt("웹툰 출고·색감 참고창", "Webtoon Export & Color Reference"),
      checklistItems: [
        bt(`프로젝트 ${projectId} · 현재 폭 ${manuscriptWidth}px`, `Project ${projectId} · Width ${manuscriptWidth}px`),
        bt("모바일 375px 대사 가독성 확인", "Check 375px mobile dialogue legibility"),
        bt("30초 컷츠 자막·효과음 싱크 점검", "Verify 30s Cuts captions & SFX sync"),
      ],
    });
    pipCloseRef.current = res.close;
    setPipNote(res.reasonKo);
    setStatusMessage(res.reasonKo);
  }, [bt, manuscriptWidth, projectId]);

  const handleCheckWebNnAndSpeculation = useCallback(async () => {
    const nn = await probeWebNnRuntime();
    setWebNnResult(nn);
    const spec = buildStudioSpeculationRulesSpec({
      prerenderPaths: ["/studio", "/market/browse"],
      prefetchPaths: ["/studio/assets", "/learn"],
    });
    const applied = injectSpeculationRules(spec);
    setSpeculationApplied(applied.applied);
    setStatusMessage(
      nn.supported
        ? bt(`기기 AI 가속(${nn.preferredDevice.toUpperCase()}) 준비 완료`, `On-device AI (${nn.preferredDevice.toUpperCase()}) ready`)
        : bt(`브라우저 표준 가속(${nn.fallbackBackend.toUpperCase()})으로 자동 전환했어요.`, `Switched automatically to ${nn.fallbackBackend.toUpperCase()} acceleration.`),
    );
  }, [bt]);

  const handleTestAudioWorklet = useCallback(async () => {
    const handle = await createStudioAudioWorkletProcessor({
      sfxGain: 0.85,
      bgmGain: 0.45,
      duckingDb: -8,
    });
    const triggered = handle.triggerSfxPreview("sfx-impact-whoosh");
    setAudioNote(
      handle.backend === "audio-worklet"
        ? bt(`저지연 효과음 준비 완료 (약 ${handle.estimatedLatencyMs}ms · ${triggered.cueId})`, `Low-latency SFX ready (~${handle.estimatedLatencyMs}ms · ${triggered.cueId})`)
        : bt(`호환 오디오 믹스 플랜 준비 완료 (약 ${handle.estimatedLatencyMs}ms)`, `Compatible audio mix planner ready (~${handle.estimatedLatencyMs}ms)`),
    );
    await handle.dispose();
  }, [bt]);

  const handleRunCutsExport = useCallback(async () => {
    setCutsExporting(true);
    setCutsResult(null);
    try {
      const result = await exportCutsMovingWebtoon(
        configuredPanels,
        {
          targetDurationSec: cutsDurationSec,
          width: Math.max(720, Math.min(1080, manuscriptWidth)),
          height: Math.max(1280, Math.min(1920, manuscriptHeight)),
          fps: 30,
          preferredCodec: cutsCodec,
          includeSubtitles,
          includeSfxSync,
          pressureState,
        },
        { onProgress: (progress) => setCutsProgress(progress) },
      );
      setCutsResult(result);
      setStatusMessage(result.summaryKo);
    } finally {
      setCutsExporting(false);
    }
  }, [
    configuredPanels,
    cutsCodec,
    cutsDurationSec,
    includeSfxSync,
    includeSubtitles,
    manuscriptHeight,
    manuscriptWidth,
    pressureState,
  ]);

  return (
    <div
      data-testid="nextgen-web-platform-hub"
      className="nextgen-hub mt-3 space-y-4 p-4 sm:p-5 [word-break:keep-all]"
    >
      <div className="nextgen-hub__spectrum-bar" aria-hidden="true" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-extrabold text-accent">
            <Sparkles size={14} aria-hidden="true" />
            {bt("차세대 웹 스튜디오 엔진", "Next-Gen Web Studio Engine")}
          </p>
          <h3 className="mt-1 text-lg font-black tracking-tight text-fg">
            {bt(
              "빠른 브라우저 가속 · 30초 컷츠 영상 · 60초 첫 1컷 가이드",
              "Fast Browser Boost · 30s Cuts Video · 60s First-Panel Guide",
            )}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "최신 Chrome 기능을 자동으로 감지해 부드럽게 켜고, 미지원 기기에서는 쉬운 대체 도구로 끊김 없이 이어집니다.",
              "Automatically activates modern Chrome capabilities and falls back smoothly on any device.",
            )}
          </p>
        </div>
        <div
          data-testid="nextgen-capability-score"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-accent/40 bg-accent-soft/45 px-3.5 text-xs font-bold text-fg tabular-nums"
        >
          <Zap size={14} className="text-accent" aria-hidden="true" />
          <span>
            {bt(
              `지원 기능 ${capabilities.supportedCount}/${capabilities.totalCount}`,
              `Ready ${capabilities.supportedCount}/${capabilities.totalCount}`,
            )}
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={bt("차세대 웹 도구 탭", "Next-gen web platform tabs")}
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {(
          [
            { id: "platform" as const, icon: <Cpu size={15} aria-hidden="true" />, labelKo: "차세대 성능·도구", labelEn: "Speed & Tools" },
            { id: "cuts" as const, icon: <Clapperboard size={15} aria-hidden="true" />, labelKo: "30초 컷츠 영상", labelEn: "30s Cuts Video" },
            { id: "beginner" as const, icon: <Smartphone size={15} aria-hidden="true" />, labelKo: "60초 첫 1컷 가이드", labelEn: "60s First-Cut Guide" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`nextgen-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`nextgen-panel-${tab.id}`}
            data-testid={`nextgen-tab-${tab.id}`}
            onClick={() => handleSelectTab(tab.id)}
            className="nextgen-hub__tab flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {tab.icon}
            <span>{bt(tab.labelKo, tab.labelEn)}</span>
          </button>
        ))}
      </div>

      {statusMessage ? (
        <p
          role="status"
          data-testid="nextgen-status-banner"
          className="rounded-xl border border-accent/35 bg-accent-soft/35 px-3 py-2 text-xs font-semibold text-fg"
        >
          {statusMessage}
        </p>
      ) : null}

      {activeTab === "platform" ? (
        <StudioNextGenPlatformTab
          capabilities={capabilities}
          hdrInfo={hdrInfo}
          pressureState={pressureState}
          pressurePolicy={pressurePolicy}
          livePressureActive={livePressureActive}
          sampledColor={sampledColor}
          fonts={fonts}
          fontSource={fontSource}
          webNnResult={webNnResult}
          speculationApplied={speculationApplied}
          pipNote={pipNote}
          audioNote={audioNote}
          onToggleLivePressure={() => setLivePressureActive((prev) => !prev)}
          onSelectPressure={setPressureState}
          onPickScreenColor={handleSampleEyeDropper}
          onSelectFallbackSwatch={setSampledColor}
          onLoadFonts={handleLoadFonts}
          onOpenPip={handleOpenReferencePip}
          onTestAudio={handleTestAudioWorklet}
          onCheckWebNn={handleCheckWebNnAndSpeculation}
        />
      ) : null}

      {activeTab === "cuts" ? (
        <StudioNextGenCutsTab
          cutsDurationSec={cutsDurationSec}
          cutsCodec={cutsCodec}
          cutsPreset={cutsPreset}
          includeSubtitles={includeSubtitles}
          includeSfxSync={includeSfxSync}
          cutsTimeline={cutsTimeline}
          cutsProgress={cutsProgress}
          cutsResult={cutsResult}
          cutsExporting={cutsExporting}
          onChangeDuration={setCutsDurationSec}
          onChangeCodec={setCutsCodec}
          onChangePreset={setCutsPreset}
          onToggleSubtitles={() => setIncludeSubtitles((prev) => !prev)}
          onToggleSfxSync={() => setIncludeSfxSync((prev) => !prev)}
          onRunExport={handleRunCutsExport}
        />
      ) : null}

      {activeTab === "beginner" ? (
        <StudioNextGenBeginnerTab
          onboardingState={onboardingState}
          onboardingSummary={onboardingSummary}
          spotlightHintOpen={spotlightHintOpen}
          mobileViewportWidth={mobileViewportWidth}
          mobileHandedness={mobileHandedness}
          activeMobileAction={activeMobileAction}
          mobileDockLayout={mobileDockLayout}
          onSkip={() => updateOnboarding(skipBeginnerOnboarding(onboardingState))}
          onRestart={() => updateOnboarding(restartBeginnerOnboarding())}
          onJumpStep={(stepId) => updateOnboarding(jumpToOnboardingStep(onboardingState, stepId))}
          onToggleHint={() => setSpotlightHintOpen((prev) => !prev)}
          onPrevStep={() => updateOnboarding(retreatOnboardingStep(onboardingState))}
          onCompleteStep={() => updateOnboarding(completeCurrentOnboardingStep(onboardingState))}
          onNextStep={() => updateOnboarding(advanceOnboardingStep(onboardingState))}
          onChangeViewport={setMobileViewportWidth}
          onToggleHandedness={() =>
            setMobileHandedness((prev) => (prev === "right" ? "left" : "right"))
          }
          onSelectMobileAction={(actionId, stepId) => {
            setActiveMobileAction(actionId);
            updateOnboarding(jumpToOnboardingStep(onboardingState, stepId));
          }}
        />
      ) : null}
    </div>
  );
}

export default StudioNextGenWebPlatformHub;
