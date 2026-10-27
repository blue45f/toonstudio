/**
 * StudioAiWebtoonEcosystemCategory34Panels.tsx
 *
 * `StudioAiWebtoonEcosystemWorkbenchPanel`의 카테고리 3 (콘티·콘셉트 기획: LlamaGen AI · 미드저니/SD · 포토샵 Firefly) 및
 * 카테고리 4 (사진·영상 만화 변환: 원더쉐어 필모라 · 캔바 AI) 탭 패널 서브컴포넌트.
 */

import { CheckCircle2, Compass, Film, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  runClaudeAcrylicStandPhotocardDielineDirector,
  runClaudeCulinaryKnifeGripPlatingSteamDirector,
  runClaudeEastAsianPalaceDancheongBracketDirector,
  runClaudeFirearmTacticalSlideEjectionLockDirector,
  runClaudeMartialArtsQigongMeridianTrajectoryDirector,
  runClaudeMedicalIcuVitalMonitorSterileDirector,
  runClaudeReaderCommentSentimentCatharsisDirector,
  runClaudeTraditionalClothingCollarGoreumLockDirector,
} from "./claude/claude-art-director";
import {
  runClaudeAnamorphicFisheyeLensOpticsDirector,
  runClaudeAnimeSettei3ToneModelSheetDirector,
  runClaudeAudiotoonAdrTactileErgonomicsDirector,
  runClaudeDrapery7FoldsMaterialBrdfDirector,
  runClaudeEmoticon24PackChibiSpecDirector,
  runClaudeGachaSsrSplashRpgSkillCutsceneDirector,
  runClaudeGlobalIpMgRsRoyaltyWaterfallDirector,
  runClaudeKoreanUrbanEverydayGeographyDirector,
  runClaudeLunarPhaseStarSkyLockDirector,
  runClaudeOttLiveActionShowrunnerBibleDirector,
  runClaudeQuadrupedCreatureWingAnatomyDirector,
  runClaudeScreentoneMoireGpenHierarchyDirector,
  runClaudeSportsBiomechanicsGaitGripDirector,
  runClaudeThaiVietnameseArabicRtlShapingDirector,
  runClaudeVehicleCockpitSeatbeltDrivetrainDirector,
  runClaudeVtuberArkit52VnSpriteMerchDirector,
} from "./claude/claude-localize";
import {
  runClaudeEyetrackScrollVelocityAoiDirector,
  runClaudeFastenerOverlapBeltBuckleLockDirector,
  runClaudeHeraldryCrestEmblemGeometryLockDirector,
  runClaudeMusicalInstrumentFingeringLockDirector,
  runClaudeSpeedlineImpactFrameFocusLockDirector,
  runClaudeTankobonPrintBleedCmykProofDirector,
  runClaudeVariableFontBalloonDiamondCopyfitDirector,
  runClaudeWoundBandageHealingTimelineLockDirector,
} from "./claude/claude-webtoon-production-assist";
import {
  buildMidjourneyStableDiffusionConceptPlan,
  buildPhotoshopFireflyGenerativePlan,
  FILMORA_WEBTOON_FILTER_PRESETS,
  runCanvaInstatoonCarouselPipeline,
  runFilmoraMediaToWebtoonPipeline,
  runLlamaGenWebtoonStoryboardDraft,
  type FilmoraWebtoonFilterPresetId,
  type FireflyEditOperationMode,
  type LlamaGenLayoutId,
  type LlamaGenSuiteFormat,
} from "./storyboard-style-transfer-suite";

import { cn } from "@/shared/lib/utils";

type Wave24ToolId =
  | "fastener"
  | "speedline"
  | "wound"
  | "heraldry"
  | "instrument"
  | "diamond-font"
  | "tankobon"
  | "eyetrack";

export interface StudioAiWebtoonCategory3PanelProps {
  readonly scriptInput: string;
  readonly storyGenre: string;
}

export function StudioAiWebtoonCategory3Panel({
  scriptInput,
  storyGenre,
}: StudioAiWebtoonCategory3PanelProps): ReactElement {
  const [llamaFormat, setLlamaFormat] = useState<LlamaGenSuiteFormat>("Webtoon");
  const [llamaLayout, setLlamaLayout] = useState<LlamaGenLayoutId>("Layout0");
  const [mjLocksCostume, setMjLocksCostume] = useState<boolean>(true);
  const [fireflyMode, setFireflyMode] = useState<FireflyEditOperationMode>(
    "generative-expand-vertical",
  );
  const [wave24ActiveTool, setWave24ActiveTool] = useState<Wave24ToolId | null>(null);
  const [wave24Summary, setWave24Summary] = useState<string>("");
  const [wave24Badge, setWave24Badge] = useState<string>("");

  async function handleRunWave24Tool(toolId: Wave24ToolId): Promise<void> {
    setWave24ActiveTool(toolId);
    const input = {
      episodeTitle: `${storyGenre} 콘티 마스터`,
      genre: storyGenre,
      scriptSummary: scriptInput,
      cutCount: 4,
    };
    if (toolId === "fastener") {
      const res = await runClaudeFastenerOverlapBeltBuckleLockDirector(input);
      setWave24Badge(`${res.model} · 여밈일관성 ${res.data.fastenerLockScore}점`);
      setWave24Summary(`${res.data.placketOverlapRuleKo} | 단추 ${res.data.buttonCount}개 | ${res.data.mirrorFlipGuardKo}`);
    } else if (toolId === "speedline") {
      const res = await runClaudeSpeedlineImpactFrameFocusLockDirector(input);
      setWave24Badge(`${res.model} · 타격초점 ${res.data.focusLockScore}점`);
      setWave24Summary(`${res.data.vanishingApexNormalizedXY} | 보호반경 ${res.data.innerClearRadiusPx}px | ${res.data.impactFrameInversionRuleKo}`);
    } else if (toolId === "wound") {
      const res = await runClaudeWoundBandageHealingTimelineLockDirector(input);
      setWave24Badge(`${res.model} · 부상타임라인 ${res.data.medicalContinuityScore}점`);
      setWave24Summary(`${res.data.anatomicalLandmarkKo} | ${res.data.healingStageProgressionKo}`);
    } else if (toolId === "heraldry") {
      const res = await runClaudeHeraldryCrestEmblemGeometryLockDirector(input);
      setWave24Badge(`${res.model} · 문장기하학 ${res.data.crestGeometryScore}점`);
      setWave24Summary(`${res.data.motifRatioSpecKo} | ${res.data.metallicFoilBevelRuleKo}`);
    } else if (toolId === "instrument") {
      const res = await runClaudeMusicalInstrumentFingeringLockDirector(input);
      setWave24Badge(`${res.model} · 악기운지 ${res.data.instrumentAccuracyScore}점`);
      setWave24Summary(`${res.data.instrumentAndStringCountKo} | ${res.data.leftHandFingeringPositionKo}`);
    } else if (toolId === "diamond-font") {
      const res = await runClaudeVariableFontBalloonDiamondCopyfitDirector(input);
      setWave24Badge(`${res.model} · 마름모식자 ${res.data.diamondCopyfitScore}점`);
      setWave24Summary(`wght ${res.data.fontWeightWght} / wdth ${res.data.fontWidthWdthPct}% | 줄글자수 [${res.data.lineLengthsCharCount.join(",")}] | ${res.data.widowOrphanPreventionNoteKo}`);
    } else if (toolId === "tankobon") {
      const res = await runClaudeTankobonPrintBleedCmykProofDirector(input);
      setWave24Badge(`${res.model} · 단행본인쇄 ${res.data.printReadinessScore}점`);
      setWave24Summary(`${res.data.trimAndBleedSpecMmKo} | TAC ${res.data.maxTotalAreaCoverageTacPct}% | ${res.data.scrollToPageReflowStrategyKo}`);
    } else {
      const res = await runClaudeEyetrackScrollVelocityAoiDirector(input);
      setWave24Badge(`${res.model} · 시선트래킹 ${res.data.eyePathSmoothnessScore}점`);
      setWave24Summary(`체류 ${res.data.averageDwellTimeMsPerCut}ms · 사카드 ${res.data.saccadeJumpAngleDeg}° | ${res.data.aoiHeatmapOptimizationKo}`);
    }
  }

  const llamaGenResult = useMemo(
    () =>
      runLlamaGenWebtoonStoryboardDraft({
        scriptText: scriptInput,
        format: llamaFormat,
        activeLayout: llamaLayout,
      }),
    [scriptInput, llamaFormat, llamaLayout],
  );

  const mjSdResult = useMemo(
    () =>
      buildMidjourneyStableDiffusionConceptPlan({
        genreEra: storyGenre,
        locksCostume: mjLocksCostume,
      }),
    [storyGenre, mjLocksCostume],
  );

  const fireflyResult = useMemo(
    () => buildPhotoshopFireflyGenerativePlan({ mode: fireflyMode }),
    [fireflyMode],
  );

  return (
    <div
      role="tabpanel"
      id="panel-cat-3-storyboard"
      aria-labelledby="tab-cat-3-storyboard"
      data-testid="ecosystem-panel-cat-3"
      className="flex flex-col gap-2"
    >
      {/* 3-A. LlamaGen AI 세로 스크롤 비트별 감정 전환 초안 */}
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 font-bold text-fg">
            <Compass size={12} className="text-accent" aria-hidden="true" />
            LlamaGen AI 한국형 세로 스크롤({llamaGenResult.pageShape}) 스토리 비트 감정 전환 초안
          </span>
          <div className="flex flex-wrap gap-1">
            {(["Webtoon", "Comic", "Manga"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                aria-pressed={llamaFormat === fmt}
                onClick={() => setLlamaFormat(fmt)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.57rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  llamaFormat === fmt
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {fmt}
              </button>
            ))}
            {llamaGenResult.availableLayouts.map((ly) => (
              <button
                key={ly}
                type="button"
                aria-pressed={llamaLayout === ly}
                onClick={() => setLlamaLayout(ly)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.57rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  llamaLayout === ly
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {ly}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {llamaGenResult.panels.map((p) => (
            <div key={p.panelIndex} className="rounded border border-line bg-card p-1.5 text-[0.58rem]">
              <strong className="text-accent">{p.caption}</strong> (여백 {p.verticalGapPx}px · {p.imageStatus})
            </div>
          ))}
        </div>
        <span className="text-[0.56rem] text-fg-3">
          지원 에디터 포맷: Comic({llamaGenResult.supportedImportFormats.comicEditor.join("/")}) · Character(
          {llamaGenResult.supportedImportFormats.characterEditor.join("/")}) · 동기화 디바운스{" "}
          {llamaGenResult.revisionSyncSpec.debounceMs}ms
        </span>
      </div>

      {/* 3-B. 미드저니 v6.1 / 스테이블 디퓨전 & 포토샵 AI (Adobe Firefly) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
          <div className="flex items-center justify-between gap-1">
            <strong className="text-accent">미드저니 v6.1 & 스테이블 디퓨전 고증·무드보드</strong>
            <button
              type="button"
              aria-pressed={mjLocksCostume}
              onClick={() => setMjLocksCostume((prev) => !prev)}
              className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.56rem] font-semibold text-fg-2"
            >
              --cw {mjSdResult.midjourneyParams.crefWeightCw} ({mjLocksCostume ? "의상 고정" : "얼굴만 고정"})
            </button>
          </div>
          <code
            data-testid="midjourney-v6-command-code"
            className="block rounded bg-card p-1 font-mono text-[0.55rem] text-fg-2"
          >
            {mjSdResult.midjourneyV6Command}
          </code>
          <span className="text-fg-3">
            고증: {mjSdResult.historicalCostumeReference.silhouetteAndFabricKo}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
          <strong className="text-accent">포토샵 AI (Adobe Firefly) 생성형 채우기·확장</strong>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Firefly 작업 모드 선택">
            {(
              [
                { id: "generative-expand-vertical", label: "세로 배경 확장" },
                { id: "object-removal-cleanplate", label: "불필요 사물 지우기" },
                { id: "costume-prop-partial-edit", label: "캐릭터 의상 부분 수정" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={fireflyMode === m.id}
                onClick={() => setFireflyMode(m.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold",
                  fireflyMode === m.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-fg-2">{fireflyResult.seamBlendingGuaranteeKo}</p>
          <span className="font-mono text-[0.55rem] text-fg-3">
            레이어: {fireflyResult.nonDestructiveLayerNameKo} (Feather {fireflyResult.maskRegionSpec.featherPx}px)
          </span>
        </div>
      </div>

      {/* 3-C. Wave 24~26 (480대 플랫폼 내재화): 의상 여밈·부상 타임라인·문장·악기·다이아몬드 식자·단행본 CMYK·시선 AOI 8종 */}
      <div
        data-testid="wave24-26-category34-consistency-bar"
        className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[0.58rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <strong className="inline-flex items-center gap-1 text-accent">
            <Sparkles size={12} aria-hidden="true" />
            Wave 24~26 고증·식자·단행본·시선추적 AI 일관성 디렉터 (480대 플랫폼 내재화)
          </strong>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Wave 24~26 일관성 도구">
            {(
              [
                { id: "fastener", label: "단추·여밈·버클 고정" },
                { id: "speedline", label: "집중선·임팩트 초점" },
                { id: "wound", label: "부상·붕대 타임라인" },
                { id: "heraldry", label: "가문 문장·엠블럼" },
                { id: "instrument", label: "악기 운지·보잉 고증" },
                { id: "diamond-font", label: "말풍선 마름모 식자" },
                { id: "tankobon", label: "단행본 도련·CMYK" },
                { id: "eyetrack", label: "아이트래킹·스크롤 AOI" },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                data-testid={`wave24-tool-btn-${btn.id}`}
                aria-pressed={wave24ActiveTool === btn.id}
                onClick={() => void handleRunWave24Tool(btn.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.55rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  wave24ActiveTool === btn.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
        {wave24Summary && (
          <div
            data-testid="wave24-26-result-card"
            className="flex flex-col gap-0.5 rounded border border-line bg-card p-1.5 text-[0.57rem]"
          >
            <span className="font-mono font-bold text-accent">{wave24Badge}</span>
            <p className="text-fg-2">{wave24Summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export interface StudioAiWebtoonCategory4PanelProps {
  readonly storyGenre: string;
}

export function StudioAiWebtoonCategory4Panel({
  storyGenre,
}: StudioAiWebtoonCategory4PanelProps): ReactElement {
  const [filmoraPresetId, setFilmoraPresetId] =
    useState<FilmoraWebtoonFilterPresetId>("filmora-k-webtoon-cel");
  const [canvaRatio, setCanvaRatio] = useState<
    "4:5-instatoon-1080x1350" | "1:1-square-1080x1080"
  >("4:5-instatoon-1080x1350");
  const [canvaSlides, setCanvaSlides] = useState<number>(6);
  const [wave27Tool, setWave27Tool] = useState<string | null>(null);
  const [wave27Badge, setWave27Badge] = useState<string>("");
  const [wave27Summary, setWave27Summary] = useState<string>("");

  async function handleRunWave27Tool(toolId: string): Promise<void> {
    setWave27Tool(toolId);
    const input = {
      episodeTitle: `${storyGenre} 에피소드`,
      genre: storyGenre,
      scriptSummary: "주인공이 결전지에서 장비를 점검하고 마지막 일격을 준비한다.",
    };
    if (toolId === "goreum") {
      const res = await runClaudeTraditionalClothingCollarGoreumLockDirector(input);
      setWave27Badge(`${res.model} · 전통복식여밈 ${res.data.collarLockScore}점`);
      setWave27Summary(`${res.data.overlapDirectionRuleKo} | ${res.data.knotLoopSideKo}`);
    } else if (toolId === "firearm") {
      const res = await runClaudeFirearmTacticalSlideEjectionLockDirector(input);
      setWave27Badge(`${res.model} · 전술총기고증 ${res.data.tacticalAccuracyScore}점`);
      setWave27Summary(`${res.data.ejectionPortSideKo} | ${res.data.triggerDisciplineRuleKo}`);
    } else if (toolId === "qigong") {
      const res = await runClaudeMartialArtsQigongMeridianTrajectoryDirector(input);
      setWave27Badge(`${res.model} · 무협기혈검결 ${res.data.qigongContinuityScore}점`);
      setWave27Summary(`${res.data.meridianPathwayKo} | ${res.data.swordFingerMudraKo}`);
    } else if (toolId === "icu") {
      const res = await runClaudeMedicalIcuVitalMonitorSterileDirector(input);
      setWave27Badge(`${res.model} · 중환자실고증 ${res.data.medicalAccuracyScore}점`);
      setWave27Summary(`${res.data.vitalMonitorReadoutKo} | ${res.data.sterileFieldRuleKo}`);
    } else if (toolId === "culinary") {
      const res = await runClaudeCulinaryKnifeGripPlatingSteamDirector(input);
      setWave27Badge(`${res.model} · 셰프나이프그립 ${res.data.culinaryAccuracyScore}점`);
      setWave27Summary(`${res.data.knifeAndGuideHandGripKo} | ${res.data.platingAndSauceGeometryKo}`);
    } else if (toolId === "acrylic") {
      const res = await runClaudeAcrylicStandPhotocardDielineDirector(input);
      setWave27Badge(`${res.model} · 아크릴굿즈칼선 ${res.data.merchReadinessScore}점`);
      setWave27Summary(`${res.data.acrylicCutlineAndWhitePlateKo} | ${res.data.baseSlotToleranceMmKo}`);
    } else if (toolId === "dancheong") {
      const res = await runClaudeEastAsianPalaceDancheongBracketDirector(input);
      setWave27Badge(`${res.model} · 궁궐단청공포 ${res.data.architecturalIntegrityScore}점`);
      setWave27Summary(`${res.data.bracketGongpoStructureKo} | ${res.data.dancheongPaletteHexRuleKo}`);
    } else {
      const res = await runClaudeReaderCommentSentimentCatharsisDirector(input);
      setWave27Badge(`${res.model} · 예상별점 ${res.data.predictedRatingScore}`);
      setWave27Summary(`${res.data.frustrationToCatharsisRatioKo} | ${res.data.predictedTopCommentKo}`);
    }
  }

  async function handleRunWave30Tool(toolId: string): Promise<void> {
    setWave27Tool(toolId);
    const input = {
      episodeTitle: `${storyGenre} 글로벌 OSMU`,
      genre: storyGenre,
      scriptSummary: "초승달 밤 옥탑방 결전 이후 글로벌 연재와 애니메이션·OTT 드라마화가 진행된다.",
    };
    if (toolId === "lunar") {
      const res = await runClaudeLunarPhaseStarSkyLockDirector(input);
      setWave27Badge(`${res.model} · 천문달위상 ${res.data.skyIntegrityScore}점`);
      setWave27Summary(`${res.data.lunarPhaseAndLitSideKo} | ${res.data.darkLimbStarOcclusionGuardKo}`);
    } else if (toolId === "emoticon") {
      const res = await runClaudeEmoticon24PackChibiSpecDirector(input);
      setWave27Badge(`${res.model} · 이모티콘24종 ${res.data.emoticonPackReadinessScore}점`);
      setWave27Summary(`${res.data.chibiHeadRatioAndCanvasSpecKo} | ${res.data.darkModeStrokeVisibilityKo}`);
    } else if (toolId === "creature") {
      const res = await runClaudeQuadrupedCreatureWingAnatomyDirector(input);
      setWave27Badge(`${res.model} · 신수해부학 ${res.data.creatureAnatomyScore}점`);
      setWave27Summary(`${res.data.hindlimbHockAndCarpusRuleKo} | ${res.data.wingFingerPatagiumFoldKo}`);
    } else if (toolId === "k-urban") {
      const res = await runClaudeKoreanUrbanEverydayGeographyDirector(input);
      setWave27Badge(`${res.model} · 한국일상고증 ${res.data.urbanRealismScore}점`);
      setWave27Summary(`${res.data.subwayAndClassroomLayoutKo} | ${res.data.convenienceStoreAndRooftopKo}`);
    } else if (toolId === "rtl-thai") {
      const res = await runClaudeThaiVietnameseArabicRtlShapingDirector(input);
      setWave27Badge(`${res.model} · 글로벌식자 ${res.data.shapingIntegrityScore}점`);
      setWave27Summary(`${res.data.thaiVietStackedDiacriticRuleKo} | ${res.data.asymmetricCharacterGuardKo}`);
    } else if (toolId === "settei") {
      const res = await runClaudeAnimeSettei3ToneModelSheetDirector(input);
      setWave27Badge(`${res.model} · 애니색지정표 ${res.data.setteiConversionScore}점`);
      setWave27Summary(`${res.data.skinThreeToneHexSpecKo} | ${res.data.colorTraceLineRuleKo}`);
    } else if (toolId === "ott-bible") {
      const res = await runClaudeOttLiveActionShowrunnerBibleDirector(input);
      setWave27Badge(`${res.model} · OTT8부작바이블 ${res.data.adaptationFeasibilityScore}점`);
      setWave27Summary(`${res.data.eightEpisodeCliffhangerArcKo} | ${res.data.locationConsolidationPlanKo}`);
    } else {
      const res = await runClaudeGlobalIpMgRsRoyaltyWaterfallDirector(input);
      setWave27Badge(`${res.model} · MG/RS정산안전 ${res.data.contractSafetyScore}점`);
      setWave27Summary(`${res.data.mgDeductionMethodComparisonKo} | ${res.data.netRevenueShareWaterfallKo}`);
    }
  }

  async function handleRunWave33Tool(toolId: string): Promise<void> {
    setWave27Tool(toolId);
    const input = {
      episodeTitle: `${storyGenre} 렌즈·주름·게임화`,
      genre: storyGenre,
      scriptSummary: "아나모픽 야간 추격전 후 벨벳 망토를 휘날리며 궁극기 컷신으로 보스를 격파한다.",
    };
    if (toolId === "vehicle") {
      const res = await runClaudeVehicleCockpitSeatbeltDrivetrainDirector(input);
      setWave27Badge(`${res.model} · 차량좌우핸들·구동계 ${res.data.vehicleContinuityScore}점`);
      setWave27Summary(`${res.data.lhdRhdSteeringAndShifterRuleKo} | ${res.data.seatbeltDiagonalStrapRuleKo}`);
    } else if (toolId === "screentone") {
      const res = await runClaudeScreentoneMoireGpenHierarchyDirector(input);
      setWave27Badge(`${res.model} · 망점모아레·G펜위계 ${res.data.inkingIntegrityScore}점`);
      setWave27Summary(`${res.data.screentoneLpiAndAngleRuleKo} | ${res.data.gpenThreeTierLineWeightKo}`);
    } else if (toolId === "lens") {
      const res = await runClaudeAnamorphicFisheyeLensOpticsDirector(input);
      setWave27Badge(`${res.model} · 시네마틱렌즈광학 ${res.data.lensOpticsScore}점`);
      setWave27Summary(`${res.data.anamorphicBokehAndFlareKo} | ${res.data.dutchTiltAndSplitDiopterKo}`);
    } else if (toolId === "drapery") {
      const res = await runClaudeDrapery7FoldsMaterialBrdfDirector(input);
      setWave27Badge(`${res.model} · 7대주름·벨벳BRDF ${res.data.fabricPhysicsScore}점`);
      setWave27Summary(`${res.data.hogarthFoldTensionOriginKo} | ${res.data.velvetAndSilkBrdfSpecKo}`);
    } else if (toolId === "biomech") {
      const res = await runClaudeSportsBiomechanicsGaitGripDirector(input);
      setWave27Badge(`${res.model} · 스포츠인체역학 ${res.data.biomechanicsScore}점`);
      setWave27Summary(`${res.data.contraLateralSprintGaitKo} | ${res.data.ballSportsGripAndReleaseKo}`);
    } else if (toolId === "vtuber") {
      const res = await runClaudeVtuberArkit52VnSpriteMerchDirector(input);
      setWave27Badge(`${res.model} · 버튜버·캔배지 ${res.data.ipAssetReadinessScore}점`);
      setWave27Summary(`${res.data.vtuberArkitBlendshapeSpecKo} | ${res.data.canBadgeAndLenticularSpecKo}`);
    } else if (toolId === "gacha-rpg") {
      const res = await runClaudeGachaSsrSplashRpgSkillCutsceneDirector(input);
      setWave27Badge(`${res.model} · SSR스플래시·궁극기 ${res.data.gameAdaptationScore}점`);
      setWave27Summary(`${res.data.fivePlaneSplashArtParallaxKo} | ${res.data.ultimateSkillCutsceneCameraKo}`);
    } else {
      const res = await runClaudeAudiotoonAdrTactileErgonomicsDirector(input);
      setWave27Badge(`${res.model} · ADR대본·촉각점자·손목보호 ${res.data.productionAccessibilityScore}점`);
      setWave27Summary(`${res.data.adrTimecodeAndBreathCueKo} | ${res.data.artistWristStrokeBudgetKo}`);
    }
  }

  const filmoraResult = useMemo(
    () => runFilmoraMediaToWebtoonPipeline({ filterPresetId: filmoraPresetId }),
    [filmoraPresetId],
  );

  const canvaResult = useMemo(
    () =>
      runCanvaInstatoonCarouselPipeline({
        topicTitle: `${storyGenre} 인스타툰`,
        slideCount: canvaSlides,
        canvasRatio: canvaRatio,
      }),
    [storyGenre, canvaSlides, canvaRatio],
  );

  return (
    <div
      role="tabpanel"
      id="panel-cat-4-style-transfer"
      aria-labelledby="tab-cat-4-style-transfer"
      data-testid="ecosystem-panel-cat-4"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {/* 4-A. 원더쉐어 필모라 (Filmora) */}
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[0.59rem]">
        <strong className="inline-flex items-center gap-1 text-accent">
          <Film size={12} aria-hidden="true" />
          원더쉐어 필모라 (Filmora) 비디오·사진 → 웹툰/애니메이션 필터 변환
        </strong>
        <div className="flex flex-wrap gap-1" role="group" aria-label="필모라 웹툰 필터 선택">
          {FILMORA_WEBTOON_FILTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={filmoraPresetId === preset.id}
              onClick={() => setFilmoraPresetId(preset.id)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold",
                filmoraPresetId === preset.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-3",
              )}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
        <p className="text-fg-2">
          플리커 억제율 {filmoraResult.keyframeExtractionSpec.temporalFlickerSuppressionScore}% · 키프레임{" "}
          {filmoraResult.keyframeExtractionSpec.extractedKeyframesCount}컷 자동 추출
        </p>
        <ul className="flex list-none flex-col gap-0.5 p-0 text-[0.57rem] text-fg-3">
          {filmoraResult.convertedPanels.map((frame) => (
            <li key={frame.frameNumber}>
              #{frame.frameNumber} ({frame.timestampSec}s): {frame.motionEffectKo}
            </li>
          ))}
        </ul>
      </div>

      {/* 4-B. 캔바 (Canva) AI 인스타툰·카드뉴스 & 원클릭 누끼 */}
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[0.59rem]">
        <div className="flex items-center justify-between gap-1">
          <strong className="inline-flex items-center gap-1 text-accent">
            <CheckCircle2 size={12} aria-hidden="true" />
            캔바 (Canva) AI 인스타툰 캐러셀 & 원클릭 배경 제거(누끼)
          </strong>
          <div className="flex gap-1" role="group" aria-label="캔바 인스타툰 비율 선택">
            {(
              [
                { id: "4:5-instatoon-1080x1350", label: "4:5 (1080×1350)" },
                { id: "1:1-square-1080x1080", label: "1:1 (1080×1080)" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={canvaRatio === r.id}
                onClick={() => setCanvaRatio(r.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold",
                  canvaRatio === r.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-fg-2">
            슬라이드 {canvaResult.slideCount}장 · 누끼 머리카락 정밀도{" "}
            {canvaResult.backgroundRemoverSpec.hairEdgeRefinementScore}% · 스티커 외곽선{" "}
            {canvaResult.backgroundRemoverSpec.stickerWhiteOutlinePx}px
          </span>
          <button
            type="button"
            data-testid="canva-carousel-10-slides-btn"
            onClick={() => setCanvaSlides((prev) => (prev === 6 ? 10 : 6))}
            className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[0.56rem] font-bold text-accent"
          >
            {canvaSlides === 6 ? "10장 캐러셀 확장" : "6장 기본으로"}
          </button>
        </div>
        <ul className="flex list-none flex-col gap-0.5 p-0 text-[0.57rem] text-fg-3">
          {canvaResult.slides.slice(0, 4).map((sl) => (
            <li key={sl.slideNumber}>
              슬라이드 #{sl.slideNumber} [{sl.slideRoleKo}]: {sl.headlineText}
            </li>
          ))}
        </ul>
      </div>

      {/* 4-C. Wave 27~29 (540대 플랫폼 내재화): 전통복식·전술총기·무협기혈·ICU의학·요리·아크릴칼선·단청·댓글감성 8종 */}
      <div
        data-testid="wave27-29-category4-consistency-bar"
        className="col-span-full flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[0.58rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <strong className="inline-flex items-center gap-1 text-accent">
            <Sparkles size={12} aria-hidden="true" />
            Wave 27~29 전통·전술·의학·요리·굿즈칼선·댓글감성 AI 일관성 디렉터 (540대 플랫폼 내재화)
          </strong>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Wave 27~29 일관성 도구">
            {(
              [
                { id: "goreum", label: "한복·기모노 우임" },
                { id: "firearm", label: "총기 탄피·울외손가락" },
                { id: "qigong", label: "무협 경맥·검결" },
                { id: "icu", label: "ICU 바이탈·무균" },
                { id: "culinary", label: "셰프 칼그립·플레이팅" },
                { id: "acrylic", label: "아크릴·포카 칼선" },
                { id: "dancheong", label: "궁궐 공포·단청" },
                { id: "catharsis", label: "독자 사이다·별점예측" },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                data-testid={`wave27-tool-btn-${btn.id}`}
                aria-pressed={wave27Tool === btn.id}
                onClick={() => void handleRunWave27Tool(btn.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.55rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  wave27Tool === btn.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
        <div
          data-testid="wave30-32-category4-osmu-bar"
          className="flex flex-wrap gap-1 pt-1"
          role="group"
          aria-label="Wave 30~32 600대 플랫폼 일관성 및 글로벌 OSMU 도구"
        >
          {(
            [
              { id: "lunar", label: "초승달 별침범 차단" },
              { id: "emoticon", label: "SD 이모티콘 24종" },
              { id: "creature", label: "드래곤·사족 관절" },
              { id: "k-urban", label: "한국 지하철·옥탑방" },
              { id: "rtl-thai", label: "아랍어RTL·태국성조" },
              { id: "settei", label: "TV애니 3단색지정표" },
              { id: "ott-bible", label: "OTT 8부작 바이블" },
              { id: "royalty", label: "글로벌 MG·RS 정산" },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              data-testid={`wave30-tool-btn-${btn.id}`}
              aria-pressed={wave27Tool === btn.id}
              onClick={() => void handleRunWave30Tool(btn.id)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[0.55rem] font-semibold",
                STUDIO_FOCUS_RING,
                wave27Tool === btn.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div
          data-testid="wave33-35-category4-optics-bar"
          className="flex flex-wrap gap-1 pt-1"
          role="group"
          aria-label="Wave 33~35 660대 플랫폼 렌즈광학·주름BRDF·인체역학·게임화 도구"
        >
          {(
            [
              { id: "vehicle", label: "좌우핸들·안전벨트·체인링" },
              { id: "screentone", label: "망점모아레·G펜선위계" },
              { id: "lens", label: "아나모픽·어안·더치틸트" },
              { id: "drapery", label: "7대주름·벨벳실크BRDF" },
              { id: "biomech", label: "질주교차보행·스포츠그립" },
              { id: "vtuber", label: "버튜버ARKit·캔배지도련" },
              { id: "gacha-rpg", label: "SSR스플래시·3초궁극기" },
              { id: "adr-ergo", label: "ADR대본·촉각점자·손목보호" },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              data-testid={`wave33-tool-btn-${btn.id}`}
              aria-pressed={wave27Tool === btn.id}
              onClick={() => void handleRunWave33Tool(btn.id)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[0.55rem] font-semibold",
                STUDIO_FOCUS_RING,
                wave27Tool === btn.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {wave27Summary && (
          <div
            data-testid="wave27-29-result-card"
            className="flex flex-col gap-0.5 rounded border border-line bg-card p-1.5 text-[0.57rem]"
          >
            <span className="font-mono font-bold text-accent">{wave27Badge}</span>
            <p className="text-fg-2">{wave27Summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
