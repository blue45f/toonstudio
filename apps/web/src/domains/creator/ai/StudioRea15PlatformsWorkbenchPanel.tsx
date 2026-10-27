/**
 * StudioRea15PlatformsWorkbenchPanel.tsx
 * Phase 7 글로벌·국내 100대 웹툰·스토리보드·3D·드로잉·오디오·무빙툰·출판·식자·애니메이션 AI 보조 플랫폼 전수 REA 역공학 및 16대 창의적 AI 워크벤치
 */

import { Activity, Box, GraduationCap, Layers, Palette, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  buildLocalCotransVroidSkyboxWorldLocalizerReport,
  buildLocalCreativeDopamineAndUxSynthesizerReport,
  buildLocalGlimnaviRelightAndLineartV23Report,
  buildLocalKaistorySingleEnvelopeAndKaionReport,
  buildLocalKreaSplineLumiereRealtimeShaderReport,
  buildLocalLtxBoordsCascadeurRiveAnimaticReport,
  buildLocalManhwaKomikoAnifusionFlowReport,
  buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport,
  buildLocalNijiPixaiCivitaiLoraSrefDirectorReport,
  buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport,
  buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport,
  buildLocalSnaptoonFrameoShaper3dDirectorReport,
  buildLocalStoryboarderDreamsKritaArtbreederDirectorReport,
  buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport,
  buildLocalTootoonGentoonTooningKrSuiteReport,
  buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport,
  getRea15PlatformTheme,
  listRea15PlatformThemes,
  runCotransVroidSkyboxWorldLocalizerAssist,
  runCreativeDopamineAndUxSynthesizerAssist,
  runGlimnaviRelightAndLineartV23Assist,
  runKaistorySingleEnvelopeAndKaionAssist,
  runKreaSplineLumiereRealtimeShaderAssist,
  runLtxBoordsCascadeurRiveAnimaticAssist,
  runManhwaKomikoAnifusionFlowAssist,
  runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist,
  runNijiPixaiCivitaiLoraSrefDirectorAssist,
  runRunwayLumaPikaViggleLive2dSpineMotionAssist,
  runSketchupBlenderPetalicaMagmaRecraftStudioAssist,
  runSnaptoonFrameoShaper3dDirectorAssist,
  runStoryboarderDreamsKritaArtbreederDirectorAssist,
  runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist,
  runTootoonGentoonTooningKrSuiteAssist,
  runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist,
  type CotransVroidSkyboxWorldLocalizerReport,
  type CreativeDopamineAndUxSynthesizerReport,
  type GlimnaviRelightAndLineartV23Report,
  type KaistorySingleEnvelopeAndKaionReport,
  type KreaSplineLumiereRealtimeShaderReport,
  type LtxBoordsCascadeurRiveAnimaticReport,
  type ManhwaKomikoAnifusionFlowReport,
  type MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport,
  type NijiPixaiCivitaiLoraSrefDirectorReport,
  type Rea15Envelope,
  type Rea15PlatformId,
  type RunwayLumaPikaViggleLive2dSpineMotionReport,
  type SketchupBlenderPetalicaMagmaRecraftStudioReport,
  type SnaptoonFrameoShaper3dDirectorReport,
  type StoryboarderDreamsKritaArtbreederDirectorReport,
  type TapasTappytoonRidiPostypeSudowriteNovelcrafterReport,
  type TootoonGentoonTooningKrSuiteReport,
  type TripoMeshyHeroforgeSunoElevenlabsOsmuReport,
} from "./claude/claude-rea15-webtoon-ecosystem-suite";
import { REA15_TABS, type Rea15WorkbenchTabId } from "./claude/claude-rea39-extended-engines";
import {
  runClaudeAnimalPupilSpider8LegOctopusSharkDirector,
  runClaudeCyberTerminalServerRackCctvRooftopDirector,
  runClaudeHanokOndolBongsuWatermillMatchlockDirector,
  runClaudeHwachaGeobukseonTrebuchetJoustDirector,
  runClaudeJoseonGatBinyeoKatanaSayaDirector,
  runClaudeMensSuitBottomButtonTieHeelStrapDirector,
  runClaudeSignLanguageHearingAidLegalDepositDirector,
  runClaudeZombieBarricadeGasMaskLockpickLaserDirector,
} from "./claude/claude-localize";
import type { WebtoonProductionAssistInput } from "./claude/claude-webtoon-production-schemas";
import { StudioRea39ExtendedTabPanels } from "./StudioRea39ExtendedTabPanels";

export interface StudioRea15PlatformsWorkbenchPanelProps {
  readonly assistInput: WebtoonProductionAssistInput;
  readonly onAppendDirectionLine: (line: string) => void;
}

export function StudioRea15PlatformsWorkbenchPanel({
  assistInput,
  onAppendDirectionLine,
}: StudioRea15PlatformsWorkbenchPanelProps) {
  const [selectedPlatformId, setSelectedPlatformId] = useState<Rea15PlatformId>("glimnavi");
  const [activeTab, setActiveTab] = useState<Rea15WorkbenchTabId>("glimnavi-relight-v23");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedQuizChoice, setSelectedQuizChoice] = useState<Record<string, number>>({});

  const [glimnaviEnv, setGlimnaviEnv] = useState<Rea15Envelope<GlimnaviRelightAndLineartV23Report> | null>(null);
  const [kaistoryEnv, setKaistoryEnv] = useState<Rea15Envelope<KaistorySingleEnvelopeAndKaionReport> | null>(null);
  const [snaptoon3dEnv, setSnaptoon3dEnv] = useState<Rea15Envelope<SnaptoonFrameoShaper3dDirectorReport> | null>(null);
  const [manhwaFlowEnv, setManhwaFlowEnv] = useState<Rea15Envelope<ManhwaKomikoAnifusionFlowReport> | null>(null);
  const [dopamineUxEnv, setDopamineUxEnv] = useState<Rea15Envelope<CreativeDopamineAndUxSynthesizerReport> | null>(null);
  const [krSuiteEnv, setKrSuiteEnv] = useState<Rea15Envelope<TootoonGentoonTooningKrSuiteReport> | null>(null);
  const [realtimeShaderEnv, setRealtimeShaderEnv] = useState<Rea15Envelope<KreaSplineLumiereRealtimeShaderReport> | null>(null);
  const [animaticEnv, setAnimaticEnv] = useState<Rea15Envelope<LtxBoordsCascadeurRiveAnimaticReport> | null>(null);
  const [worldLocalizerEnv, setWorldLocalizerEnv] = useState<Rea15Envelope<CotransVroidSkyboxWorldLocalizerReport> | null>(null);
  const [dreamsKritaEnv, setDreamsKritaEnv] = useState<Rea15Envelope<StoryboarderDreamsKritaArtbreederDirectorReport> | null>(null);
  const [loraSrefEnv, setLoraSrefEnv] = useState<Rea15Envelope<NijiPixaiCivitaiLoraSrefDirectorReport> | null>(null);
  const [tripoSunoEnv, setTripoSunoEnv] = useState<Rea15Envelope<TripoMeshyHeroforgeSunoElevenlabsOsmuReport> | null>(null);
  const [runwayMotionEnv, setRunwayMotionEnv] = useState<Rea15Envelope<RunwayLumaPikaViggleLive2dSpineMotionReport> | null>(null);
  const [sketchupStudioEnv, setSketchupStudioEnv] = useState<Rea15Envelope<SketchupBlenderPetalicaMagmaRecraftStudioReport> | null>(null);
  const [tapasCodexEnv, setTapasCodexEnv] = useState<Rea15Envelope<TapasTappytoonRidiPostypeSudowriteNovelcrafterReport> | null>(null);
  const [mixamoToonboomEnv, setMixamoToonboomEnv] = useState<Rea15Envelope<MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport> | null>(null);
  const [wave45Notice, setWave45Notice] = useState<string | null>(null);
  const wave45Input = useMemo(() => ({ episodeTitle: assistInput.episodeTitle || "01화", genre: assistInput.genre || "판타지", scriptSummary: assistInput.scriptText || "주요 장면" }), [assistInput.episodeTitle, assistInput.genre, assistInput.scriptText]);

  const platformThemes = useMemo(() => listRea15PlatformThemes(), []);
  const activePlatformTheme = useMemo(() => getRea15PlatformTheme(selectedPlatformId), [selectedPlatformId]);

  const currentGlimnavi = useMemo(() => glimnaviEnv?.report ?? buildLocalGlimnaviRelightAndLineartV23Report(assistInput), [glimnaviEnv, assistInput]);
  const currentKaistory = useMemo(() => kaistoryEnv?.report ?? buildLocalKaistorySingleEnvelopeAndKaionReport(assistInput), [kaistoryEnv, assistInput]);
  const currentSnaptoon3d = useMemo(() => snaptoon3dEnv?.report ?? buildLocalSnaptoonFrameoShaper3dDirectorReport(assistInput), [snaptoon3dEnv, assistInput]);
  const currentManhwaFlow = useMemo(() => manhwaFlowEnv?.report ?? buildLocalManhwaKomikoAnifusionFlowReport(assistInput), [manhwaFlowEnv, assistInput]);
  const currentDopamineUx = useMemo(() => dopamineUxEnv?.report ?? buildLocalCreativeDopamineAndUxSynthesizerReport(assistInput), [dopamineUxEnv, assistInput]);
  const currentKrSuite = useMemo(() => krSuiteEnv?.report ?? buildLocalTootoonGentoonTooningKrSuiteReport(assistInput), [krSuiteEnv, assistInput]);
  const currentRealtimeShader = useMemo(() => realtimeShaderEnv?.report ?? buildLocalKreaSplineLumiereRealtimeShaderReport(assistInput), [realtimeShaderEnv, assistInput]);
  const currentAnimatic = useMemo(() => animaticEnv?.report ?? buildLocalLtxBoordsCascadeurRiveAnimaticReport(assistInput), [animaticEnv, assistInput]);
  const currentWorldLocalizer = useMemo(() => worldLocalizerEnv?.report ?? buildLocalCotransVroidSkyboxWorldLocalizerReport(assistInput), [worldLocalizerEnv, assistInput]);
  const currentDreamsKritaDirector = useMemo(() => dreamsKritaEnv?.report ?? buildLocalStoryboarderDreamsKritaArtbreederDirectorReport(assistInput), [dreamsKritaEnv, assistInput]);
  const currentLoraSrefDirector = useMemo(() => loraSrefEnv?.report ?? buildLocalNijiPixaiCivitaiLoraSrefDirectorReport(assistInput), [loraSrefEnv, assistInput]);
  const currentTripoSunoOsmu = useMemo(() => tripoSunoEnv?.report ?? buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport(assistInput), [tripoSunoEnv, assistInput]);
  const currentRunwayMotion = useMemo(() => runwayMotionEnv?.report ?? buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport(assistInput), [runwayMotionEnv, assistInput]);
  const currentSketchupStudio = useMemo(() => sketchupStudioEnv?.report ?? buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport(assistInput), [sketchupStudioEnv, assistInput]);
  const currentTapasCodex = useMemo(() => tapasCodexEnv?.report ?? buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport(assistInput), [tapasCodexEnv, assistInput]);
  const currentMixamoToonboom = useMemo(() => mixamoToonboomEnv?.report ?? buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport(assistInput), [mixamoToonboomEnv, assistInput]);

  const activeEnvelope =
    activeTab === "glimnavi-relight-v23"
      ? glimnaviEnv
      : activeTab === "kaistory-envelope-kaion"
        ? kaistoryEnv
        : activeTab === "snaptoon-frameo-shaper-3d"
          ? snaptoon3dEnv
          : activeTab === "manhwa-komiko-anifusion"
            ? manhwaFlowEnv
            : activeTab === "creative-dopamine-ux"
              ? dopamineUxEnv
              : activeTab === "tootoon-gentoon-tooning-kr"
                ? krSuiteEnv
                : activeTab === "krea-spline-lumiere-shader"
                  ? realtimeShaderEnv
                  : activeTab === "ltx-boords-cascadeur-rive"
                    ? animaticEnv
                    : activeTab === "cotrans-vroid-skybox-localizer"
                      ? worldLocalizerEnv
                      : activeTab === "storyboarder-dreams-krita-artbreeder"
                        ? dreamsKritaEnv
                        : activeTab === "niji-pixai-civitai-lora-sref"
                          ? loraSrefEnv
                          : activeTab === "tripo-meshy-heroforge-suno-osmu"
                            ? tripoSunoEnv
                            : activeTab === "runway-luma-pika-viggle-live2d-spine"
                              ? runwayMotionEnv
                              : activeTab === "sketchup-blender-petalica-magma-recraft"
                                ? sketchupStudioEnv
                                : activeTab === "tapas-tappytoon-ridi-postype-sudowrite-novelcrafter"
                                  ? tapasCodexEnv
                                  : mixamoToonboomEnv;

  const handleRunActiveTab = async () => {
    setIsRunning(true);
    try {
      if (activeTab === "glimnavi-relight-v23") {
        const res = await runGlimnaviRelightAndLineartV23Assist(assistInput);
        setGlimnaviEnv(res);
        onAppendDirectionLine(`[GlimNavi v2.3 (${res.modelUsed})] ${res.report.selectedLineartVersion} / ${res.report.selectedLineartPreset} · ${res.report.relightPass.relightDirectiveKo}`);
      } else if (activeTab === "kaistory-envelope-kaion") {
        const res = await runKaistorySingleEnvelopeAndKaionAssist(assistInput);
        setKaistoryEnv(res);
        onAppendDirectionLine(`[KAISTORY & KAION (${res.modelUsed})] ${res.report.envelopeSummaryKo} (퀴즈 카드 ${res.report.kaionLearningCards.length}종 생성)`);
      } else if (activeTab === "snaptoon-frameo-shaper-3d") {
        const res = await runSnaptoonFrameoShaper3dDirectorAssist(assistInput);
        setSnaptoon3dEnv(res);
        onAppendDirectionLine(`[Snaptoon·Frameo·SHAPER (${res.modelUsed})] ${res.report.frameoSpotlightShader.shortDramaTransitionRuleKo}`);
      } else if (activeTab === "manhwa-komiko-anifusion") {
        const res = await runManhwaKomikoAnifusionFlowAssist(assistInput);
        setManhwaFlowEnv(res);
        onAppendDirectionLine(`[ManhwaAI·Komiko·Anifusion (${res.modelUsed})] 화풍 ${res.report.manhwaStylePreset} · 인비트윈 ${res.report.komikoLayerSplitterAndInbetween.inbetweenFrameCount}프레임 · 노드 ${res.report.anifusionNodeFlowGraph.length}개`);
      } else if (activeTab === "creative-dopamine-ux") {
        const res = await runCreativeDopamineAndUxSynthesizerAssist(assistInput);
        setDopamineUxEnv(res);
        onAppendDirectionLine(`[독자 도파민 & UI 합성기 (${res.modelUsed})] 도파민 피크 ${res.report.overallDopaminePeakScore}점 · 완독률 ${res.report.predictedEpisodeCompletionRatePct}% · 테마 '${res.report.synthesizedUiUxTheme.themeTitleKo}'`);
      } else if (activeTab === "tootoon-gentoon-tooning-kr") {
        const res = await runTootoonGentoonTooningKrSuiteAssist(assistInput);
        setKrSuiteEnv(res);
        onAppendDirectionLine(`[TooToon·GenToon·Tooning (${res.modelUsed})] ${res.report.suiteSummaryKo}`);
      } else if (activeTab === "krea-spline-lumiere-shader") {
        const res = await runKreaSplineLumiereRealtimeShaderAssist(assistInput);
        setRealtimeShaderEnv(res);
        onAppendDirectionLine(`[Krea·Spline·Lumiere (${res.modelUsed})] ${res.report.lumiereAndNodeGraphShaders.compositeShaderNoteKo}`);
      } else if (activeTab === "ltx-boords-cascadeur-rive") {
        const res = await runLtxBoordsCascadeurRiveAnimaticAssist(assistInput);
        setAnimaticEnv(res);
        onAppendDirectionLine(`[LTX·Boords·Cascadeur·Rive (${res.modelUsed})] ${res.report.cascadeurPhysicsRig.ballisticTrajectoryArcKo}`);
      } else if (activeTab === "cotrans-vroid-skybox-localizer") {
        const res = await runCotransVroidSkyboxWorldLocalizerAssist(assistInput);
        setWorldLocalizerEnv(res);
        onAppendDirectionLine(`[Cotrans·VRoid·Skybox (${res.modelUsed})] ${res.report.worldLocalizerSummaryKo}`);
      } else if (activeTab === "storyboarder-dreams-krita-artbreeder") {
        const res = await runStoryboarderDreamsKritaArtbreederDirectorAssist(assistInput);
        setDreamsKritaEnv(res);
        onAppendDirectionLine(`[Storyboarder·Dreams·Krita·Artbreeder (${res.modelUsed})] ${res.report.directorExecutiveSummaryKo}`);
      } else if (activeTab === "niji-pixai-civitai-lora-sref") {
        const res = await runNijiPixaiCivitaiLoraSrefDirectorAssist(assistInput);
        setLoraSrefEnv(res);
        onAppendDirectionLine(`[Niji·Civitai·PixAI·Picrew (${res.modelUsed})] ${res.report.loraAndSrefSummaryKo}`);
      } else if (activeTab === "tripo-meshy-heroforge-suno-osmu") {
        const res = await runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist(assistInput);
        setTripoSunoEnv(res);
        onAppendDirectionLine(`[Tripo3D·Suno·ElevenLabs·MANGA Plus (${res.modelUsed})] ${res.report.osmuExecutiveSummaryKo}`);
      } else if (activeTab === "runway-luma-pika-viggle-live2d-spine") {
        const res = await runRunwayLumaPikaViggleLive2dSpineMotionAssist(assistInput);
        setRunwayMotionEnv(res);
        onAppendDirectionLine(`[Runway·Luma·Pika·Viggle·Live2D·Spine (${res.modelUsed})] ${res.report.movingToonExecutiveSummaryKo}`);
      } else if (activeTab === "sketchup-blender-petalica-magma-recraft") {
        const res = await runSketchupBlenderPetalicaMagmaRecraftStudioAssist(assistInput);
        setSketchupStudioEnv(res);
        onAppendDirectionLine(`[SketchUp·Blender·Petalica·Magma·Recraft (${res.modelUsed})] ${res.report.hybridStudioExecutiveSummaryKo}`);
      } else if (activeTab === "tapas-tappytoon-ridi-postype-sudowrite-novelcrafter") {
        const res = await runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist(assistInput);
        setTapasCodexEnv(res);
        onAppendDirectionLine(`[Tapas·Tappytoon·RIDI·Postype·Sudowrite·Novelcrafter (${res.modelUsed})] ${res.report.publishingAndCodexSummaryKo}`);
      } else {
        const res = await runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist(assistInput);
        setMixamoToonboomEnv(res);
        onAppendDirectionLine(`[Mixamo·Marvelous·Coolors·눈누·Blambot·ToonBoom·Eagle (${res.modelUsed})] ${res.report.productionPipelineSummaryKo}`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      data-testid="studio-rea15-platforms-workbench-panel"
      className="mt-2 flex flex-col gap-2 rounded-md border border-accent/35 bg-card/95 p-2.5 text-[0.62rem]"
    >
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-line pb-1.5">
        <div className="flex items-center gap-1.5">
          <Palette className="size-3.5 text-accent" aria-hidden="true" />
          <span className="font-bold text-fg">
            Phase 7 · 100대 웹툰·스토리보드·3D·드로잉·오디오·무빙툰·출판·식자·애니메이션 AI 플랫폼 전수 REA UI/UX 디자인 토큰 & 16대 AI 워크벤치
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.54rem] font-semibold text-accent">
            100개 플랫폼 · 102 브라우저 캡처 · 205만+ AST 노드 검증
          </span>
        </div>

        <button
          type="button"
          data-testid="run-rea15-active-tab-btn"
          disabled={isRunning}
          onClick={() => void handleRunActiveTab()}
          className={cn(
            "inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[0.58rem] font-semibold text-on-accent",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            isRunning && "opacity-60",
          )}
        >
          <Wand2 className="size-3" aria-hidden="true" />
          {isRunning ? "Claude 추론 중..." : "현재 탭 Claude 스마트 실행 & 원고 반영"}
        </button>
      </div>

      {/* 100대 플랫폼 UI/UX 디자인 토큰 탐색기 */}
      <div
        data-testid="rea15-ui-token-inspector"
        className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-fg">
            100대 웹툰·창작 AI 플랫폼 REA 디자인 토큰 & 라우트 인스펙터 ({platformThemes.length}종)
          </span>
          <button
            type="button"
            data-testid="apply-rea15-theme-token-btn"
            onClick={() =>
              onAppendDirectionLine(
                `[REA UI/UX 토큰 적용: ${activePlatformTheme.nameKo}] 배경 ${activePlatformTheme.surfaceHex} · 패널 ${activePlatformTheme.panelHex} · 강조 ${activePlatformTheme.accentPrimaryHex}/${activePlatformTheme.accentSecondaryHex} · 폰트 ${activePlatformTheme.fontStack}`,
              )
            }
            className={cn(
              "rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[0.55rem] font-semibold text-accent hover:bg-accent/20",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            선택 플랫폼 UI 토큰을 원고 무드보드에 반영
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {platformThemes.map((theme) => {
            const isSelected = theme.platformId === selectedPlatformId;
            return (
              <button
                key={theme.platformId}
                type="button"
                data-testid={`rea15-platform-chip-${theme.platformId}`}
                onClick={() => setSelectedPlatformId(theme.platformId)}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.54rem]",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  isSelected
                    ? "border-accent bg-accent/15 font-bold text-fg"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                <span
                  className="inline-block size-2 rounded-full border border-line"
                  style={{ backgroundColor: theme.accentPrimaryHex }}
                />
                <span>{theme.platformId}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-1.5 rounded border border-line bg-card p-2 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-fg">{activePlatformTheme.nameKo}</span>
            <span className="text-[0.54rem] text-fg-3">{activePlatformTheme.originUrl}</span>
            <span className="text-[0.52rem] text-fg-3">
              REA ID: <code>{activePlatformTheme.reaEvidenceId.slice(0, 18)}…</code>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.54rem] font-semibold text-fg-2">추출 컬러 토큰 & 곡률</span>
            <div className="flex flex-wrap items-center gap-1 text-[0.52rem]">
              <span className="rounded border border-line px-1 py-0.5">
                Surface {activePlatformTheme.surfaceHex}
              </span>
              <span className="rounded border border-line px-1 py-0.5">
                Panel {activePlatformTheme.panelHex}
              </span>
              <span className="rounded border border-line px-1 py-0.5 font-semibold text-accent">
                Accent {activePlatformTheme.accentPrimaryHex}
              </span>
              <span className="rounded border border-line px-1 py-0.5">
                Radius {activePlatformTheme.borderRadiusPx}px
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[0.54rem]">
            <span className="font-semibold text-fg-2">{activePlatformTheme.coreWorkflowKo}</span>
            <span className="text-fg-3">
              주요 라우트: {activePlatformTheme.keyRoutes.slice(0, 4).join(" · ")}
            </span>
          </div>
        </div>
      </div>

      {/* 10대 AI 엔진 탭 네비게이션 */}
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-5" role="tablist">
        {REA15_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`rea15-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded border px-2 py-1 text-left",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                isSelected
                  ? "border-accent bg-accent/15 text-fg"
                  : "border-line bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span className="text-[0.52rem] font-semibold text-accent">{tab.badgeKo}</span>
                <span className="rounded bg-card px-1 py-0.2 text-[0.48rem] text-fg-3">
                  {tab.tierBadgeKo}
                </span>
              </div>
              <span className="line-clamp-1 font-bold">{tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      {/* 실행 메타 배지 */}
      {activeEnvelope ? (
        <div
          data-testid="rea15-execution-meta-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded bg-raised px-2 py-1 text-[0.55rem] text-fg-2"
        >
          <span>
            실행 소스:{" "}
            <strong className="text-fg">
              {activeEnvelope.source === "claude-live"
                ? `Claude Live (${activeEnvelope.modelUsed})`
                : `결정적 로컬 엔진 (${activeEnvelope.routedModel} 라우팅 규격)`}
            </strong>
          </span>
          <span>
            프로필: <strong>{activeEnvelope.taskProfile}</strong> · 추정 비용:{" "}
            <strong>${activeEnvelope.estimatedCostUsd.toFixed(5)}</strong>
          </span>
        </div>
      ) : null}

      {/* 탭 1: GlimNavi Studio v2.3 */}
      {activeTab === "glimnavi-relight-v23" ? (
        <div
          data-testid="rea15-panel-glimnavi-relight-v23"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3 text-accent" aria-hidden="true" />
              그림나비(GlimNavi) Studio v2.3 5종 선화 · 6종 프리셋 · 컬러 분리 · Relight
            </span>
            <span className="text-accent">
              {currentGlimnavi.selectedLineartVersion} · {currentGlimnavi.selectedLineartPreset} (
              {currentGlimnavi.canvasBaseSize})
            </span>
          </div>
          <p className="text-fg-2">{currentGlimnavi.studioStageSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentGlimnavi.separatedColorLayers.map((layer) => (
              <div
                key={layer.layerId}
                className="flex items-center justify-between rounded border border-line bg-card px-2 py-1 text-[0.55rem]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded border border-line"
                    style={{ backgroundColor: layer.dominantHex }}
                  />
                  <span className="font-bold text-fg">{layer.layerNameKo}</span>
                </div>
                <span className="text-fg-3">
                  {layer.blendMode} · {layer.opacityPct}% · Gap {layer.strokeGapTolerancePx}px
                </span>
              </div>
            ))}
          </div>
          <div className="rounded border border-line bg-card px-2 py-1 text-[0.55rem] text-fg-2">
            <strong>Relight 패스:</strong> 광원 {currentGlimnavi.relightPass.aiShadowDirectionDeg}° ·
            색온도 {currentGlimnavi.relightPass.lightingKelvin}K · 림라이트{" "}
            {currentGlimnavi.relightPass.rimLightHex} —{" "}
            {currentGlimnavi.relightPass.relightDirectiveKo}
          </div>
        </div>
      ) : null}

      {/* 탭 2: KAISTORY 4단계 단일 엔벨로프 & KAION 학습 퀴즈 */}
      {activeTab === "kaistory-envelope-kaion" ? (
        <div
          data-testid="rea15-panel-kaistory-envelope-kaion"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="size-3 text-accent" aria-hidden="true" />
              KAISTORY 4단 단일 데이터 엔벨로프 & KAION 웹툰 학습카드·독자 퀴즈
            </span>
            <span className="text-accent">
              {currentKaistory.projectEnvelopeVersion} ({currentKaistory.offlineFirstSyncStatus})
            </span>
          </div>
          <p className="text-fg-2">{currentKaistory.envelopeSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentKaistory.subdomainStages.map((stage) => (
              <div
                key={stage.subdomain}
                className="rounded border border-line bg-card px-2 py-1 text-[0.55rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>{stage.stageNameKo}</span>
                  <span className="text-accent">{stage.subdomain}</span>
                </div>
                <div className="text-fg-2">{stage.keyOutputSummaryKo}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {currentKaistory.kaionLearningCards.map((card) => {
              const chosen = selectedQuizChoice[card.cardId];
              return (
                <div
                  key={card.cardId}
                  data-testid={`kaion-learning-card-${card.cardId}`}
                  className="flex flex-col gap-1 rounded border border-accent/30 bg-card p-2 text-[0.55rem]"
                >
                  <div className="flex items-center justify-between font-bold text-fg">
                    <span>{card.titleKo}</span>
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.5rem] text-accent">
                      {card.rewardBadgeNameKo}
                    </span>
                  </div>
                  <div className="font-semibold text-fg-2">Q. {card.quizQuestionKo}</div>
                  <div className="flex flex-col gap-0.5">
                    {card.choicesKo.map((choice, idx) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() =>
                          setSelectedQuizChoice((prev) => ({ ...prev, [card.cardId]: idx }))
                        }
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-left text-[0.53rem]",
                          chosen === idx
                            ? idx === card.correctChoiceIndex
                              ? "border-good/60 bg-good/15 font-bold text-fg"
                              : "border-bad/60 bg-bad/15 font-bold text-fg"
                            : "border-line bg-raised/60 text-fg-2 hover:text-fg",
                        )}
                      >
                        {idx + 1}. {choice}
                      </button>
                    ))}
                  </div>
                  {chosen !== undefined ? (
                    <div className="text-[0.52rem] text-accent">해설: {card.explanationKo}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 탭 3: Snaptoon · Frameo · NAVER SHAPER · Plask · Posemaniacs */}
      {activeTab === "snaptoon-frameo-shaper-3d" ? (
        <div
          data-testid="rea15-panel-snaptoon-frameo-shaper-3d"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Box className="size-3 text-accent" aria-hidden="true" />
              Snaptoon 3D · Frameo 스포트라이트 콘 · NAVER SHAPER 3D 직접 드로잉
            </span>
            <span className="text-accent">
              렌즈 {currentSnaptoon3d.snaptoonBridge.cameraFocalLengthMm}mm · 선화 보존{" "}
              {currentSnaptoon3d.snaptoonBridge.preservedLineFidelityPct}%
            </span>
          </div>
          <p className="text-fg-2">{currentSnaptoon3d.directorSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Snaptoon → Snapboard AI</div>
              <div className="text-fg-2">
                {currentSnaptoon3d.snaptoonBridge.warehouseScenePresetNameKo}
              </div>
              <div className="text-fg-3">
                테마 {currentSnaptoon3d.snaptoonBridge.themeMode} · 변환 강도{" "}
                {currentSnaptoon3d.snaptoonBridge.snapboardAiTransformStrengthPct}%
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Frameo 스포트라이트 콘 셰이더</div>
              <div className="text-fg-2">
                --cursor-angle: {currentSnaptoon3d.frameoSpotlightShader.cursorAngleDeg}deg ·
                --cone-spread: {currentSnaptoon3d.frameoSpotlightShader.coneSpreadDeg}
              </div>
              <div className="text-fg-3">
                Glow {currentSnaptoon3d.frameoSpotlightShader.glowPrimaryHex} /{" "}
                {currentSnaptoon3d.frameoSpotlightShader.glowSecondaryHex}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">SHAPER & Plask / Posemaniacs</div>
              <div className="text-fg-2">{currentSnaptoon3d.shaperAndPoseRig.shaperPresetComboKo}</div>
              <div className="text-fg-3">
                표면 직접 드로잉 {currentSnaptoon3d.shaperAndPoseRig.surfaceDirectDrawLayerCount}층 ·
                발 접지 신뢰도 {currentSnaptoon3d.shaperAndPoseRig.plaskMocapFootLockConfidencePct}%
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 4: ManhwaAI · Komiko · Anifusion */}
      {activeTab === "manhwa-komiko-anifusion" ? (
        <div
          data-testid="rea15-panel-manhwa-komiko-anifusion"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3 text-accent" aria-hidden="true" />
              ManhwaAI 6화풍/5톤 · Komiko 레이어 분리/인비트윈 · Anifusion 노드 플로우
            </span>
            <span className="text-accent">
              화풍: {currentManhwaFlow.manhwaStylePreset} · 인비트윈{" "}
              {currentManhwaFlow.komikoLayerSplitterAndInbetween.inbetweenFrameCount}프레임
            </span>
          </div>
          <p className="text-fg-2">{currentManhwaFlow.pipelineSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {currentManhwaFlow.activeToneOverlays.map((tone) => (
              <div
                key={`${tone.toneType}-${tone.targetCutNumber}`}
                className="rounded border border-line bg-card px-2 py-1 text-[0.55rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{tone.targetCutNumber} · {tone.toneType}
                  </span>
                  <span className="text-accent">
                    {tone.opacityPct}% ({tone.angleDeg}°)
                  </span>
                </div>
                <div className="text-fg-2">{tone.dramaticPurposeKo}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {currentManhwaFlow.anifusionNodeFlowGraph.map((node) => (
              <span
                key={node.nodeId}
                className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.53rem] text-fg-2"
              >
                <strong>{node.nodeType}</strong>: {node.outputSummaryKo}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 5: 창의적 AI — 독자 도파민 히트맵 & UI/UX 테마 합성기 */}
      {activeTab === "creative-dopamine-ux" ? (
        <div
          data-testid="rea15-panel-creative-dopamine-ux"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Activity className="size-3 text-accent" aria-hidden="true" />
              [창의적 AI] 웹툰 독자 도파민·스크롤 정지 히트맵 & 15대 플랫폼 UI/UX 테마 합성기
            </span>
            <span className="text-accent">
              도파민 피크 {currentDopamineUx.overallDopaminePeakScore}점 · 완독률{" "}
              {currentDopamineUx.predictedEpisodeCompletionRatePct}% · 클리프행어{" "}
              {currentDopamineUx.cliffhangerHookPowerPct}%
            </span>
          </div>
          <p className="text-fg-2">{currentDopamineUx.executiveSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {currentDopamineUx.cutScrollHeatmap.map((cut) => (
              <div
                key={cut.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.55rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>컷 #{cut.cutNumber}</span>
                  <span className="text-accent">
                    체류 {cut.predictedDwellTimeMs}ms · 도파민 {cut.dopamineSpikePct}%
                  </span>
                </div>
                <div className="text-fg-2">{cut.narrativeBeatKo}</div>
                <div className="text-fg-3">처방: {cut.recommendedVisualAmplifierKo}</div>
              </div>
            ))}
          </div>

          <div className="rounded border border-accent/35 bg-card p-2 text-[0.55rem]">
            <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-fg">
              <span>
                합성 테마: {currentDopamineUx.synthesizedUiUxTheme.themeTitleKo} (
                {currentDopamineUx.synthesizedUiUxTheme.primarySourcePlatform} ×{" "}
                {currentDopamineUx.synthesizedUiUxTheme.secondarySourcePlatform})
              </span>
              <span className="text-accent">
                WCAG 명암비 {currentDopamineUx.synthesizedUiUxTheme.wcagContrastRatio}:1
              </span>
            </div>
            <div className="mt-0.5 text-fg-2">
              {currentDopamineUx.synthesizedUiUxTheme.designRationaleKo}
            </div>
          </div>
        </div>
      ) : null}

      <StudioRea39ExtendedTabPanels
        activeTab={activeTab}
        currentKrSuite={currentKrSuite}
        currentRealtimeShader={currentRealtimeShader}
        currentAnimatic={currentAnimatic}
        currentWorldLocalizer={currentWorldLocalizer}
        currentDreamsKritaDirector={currentDreamsKritaDirector}
        currentLoraSrefDirector={currentLoraSrefDirector}
        currentTripoSunoOsmu={currentTripoSunoOsmu}
        currentRunwayMotion={currentRunwayMotion}
        currentSketchupStudio={currentSketchupStudio}
        currentTapasCodex={currentTapasCodex}
        currentMixamoToonboom={currentMixamoToonboom}
      />

      <div data-testid="wave45-47-domain-consistency-bar" className="flex flex-col gap-1.5 rounded border border-accent/30 bg-raised p-2 text-[0.55rem]">
        <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-fg">
          <span>Wave 45~47 (900대 플랫폼): 사극갓/비녀/카타나 · 남성수트/힐 · 신기전/거북선/투석기 · 한옥온돌/조총 · 바리케이드/락픽 · 해킹/서버랙 · 동물동공/8다리 · 수어/ISBN</span>
          <div className="flex flex-wrap gap-1">
            <button type="button" data-testid="wave45-joseon-gat-katana-btn" onClick={() => void runClaudeJoseonGatBinyeoKatanaSayaDirector(wave45Input, { route: null }).then((r) => { const line = `[갓/비녀/카타나 (${r.model})] ${r.data.gatYangtaeMeshAndGatgeunKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>갓/비녀/카타나</button>
            <button type="button" data-testid="wave45-mens-suit-heel-btn" onClick={() => void runClaudeMensSuitBottomButtonTieHeelStrapDirector(wave45Input, { route: null }).then((r) => { const line = `[수트단추/힐 (${r.model})] ${r.data.suitBottomButtonUnbuttonedRuleKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>수트단추/힐</button>
            <button type="button" data-testid="wave45-hwacha-geobukseon-btn" onClick={() => void runClaudeHwachaGeobukseonTrebuchetJoustDirector(wave45Input, { route: null }).then((r) => { const line = `[신기전/거북선/투석기 (${r.model})] ${r.data.hwachaSingijeonAndGeobukseonOarKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>신기전/거북선</button>
            <button type="button" data-testid="wave46-hanok-ondol-matchlock-btn" onClick={() => void runClaudeHanokOndolBongsuWatermillMatchlockDirector(wave45Input, { route: null }).then((r) => { const line = `[한옥온돌/조총 (${r.model})] ${r.data.hanokAgungiGulddukAndGiwaKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>한옥온돌/조총</button>
            <button type="button" data-testid="wave46-zombie-lockpick-btn" onClick={() => void runClaudeZombieBarricadeGasMaskLockpickLaserDirector(wave45Input, { route: null }).then((r) => { const line = `[바리케이드/락픽 (${r.model})] ${r.data.inwardDoorWedgeAndPlankNailKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>바리케이드/락픽</button>
            <button type="button" data-testid="wave46-cyber-server-cctv-btn" onClick={() => void runClaudeCyberTerminalServerRackCctvRooftopDirector(wave45Input, { route: null }).then((r) => { const line = `[터미널/서버랙/CCTV (${r.model})] ${r.data.bashCliSyntaxAndPrivateIpv4Ko}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>터미널/서버랙</button>
            <button type="button" data-testid="wave47-animal-pupil-spider-btn" onClick={() => void runClaudeAnimalPupilSpider8LegOctopusSharkDirector(wave45Input, { route: null }).then((r) => { const line = `[동물동공/8다리/문어 (${r.model})] ${r.data.goatHorizontalVsCatVerticalPupilKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>동물동공/8다리</button>
            <button type="button" data-testid="wave47-sign-language-isbn-btn" onClick={() => void runClaudeSignLanguageHearingAidLegalDepositDirector(wave45Input, { route: null }).then((r) => { const line = `[한국수어/보청기/ISBN (${r.model})] ${r.data.kslHandshapeNonManualMarkerKo}`; setWave45Notice(line); onAppendDirectionLine(line); })} className={cn("rounded border border-line bg-card px-1.5 py-0.5 font-semibold text-fg hover:border-accent/50", STUDIO_FOCUS_RING)}>한국수어/ISBN</button>
          </div>
        </div>
        {wave45Notice ? <div data-testid="wave45-47-domain-notice" className="text-fg-2">{wave45Notice}</div> : null}
      </div>
    </div>
  );
}
