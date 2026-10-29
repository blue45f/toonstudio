/**
 * StudioWebtoonMasterPipelineCard.tsx
 *
 * 웹툰 작가 그림체 학습 데이터셋/모델(Artist Style DNA) 진단 + 캐릭터 말투 아키타입 기반
 * 티키타카 대사·효과음(SFX) 교차 추천 + 4막 스토리라인 클리프행어·스크롤 유지율 진단 +
 * 컷별 구도 와이어프레임 프리뷰 및 글로벌 K-콘텐츠 연재 지표를 통합 제공하는 UI 카드 컴포넌트.
 */
import {
  Award,
  Camera,
  Database,
  GitBranch,
  Globe,
  Layers,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import type { CharacterVoiceArchetype } from "../lettering/studio-dialogue-suggest";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  runAssist3dgsNerfControlnet4FacsSfx3dSaccadeDirector,
  runAssistBangpaeyeonSsireumSatbaTaekkyeonMaedeupDirector,
  runAssistCrossover1000EpParadoxWrinkleBakerSfxRedrawDirector,
  runAssistDavyLampRickshawDivingDressSwitchboardSundialDirector,
  runAssistEnigmaMorseDarkroomLetterpressPhonographDirector,
  runAssistF1KerbWrcRollcageSkydivingSurfingYachtDirector,
  runAssistGlassblowingLuthierDiamondLoupeShoemakerDirector,
  runAssistHahoeMaskLianpuKabukiTogaThuribleDirector,
  runAssistJangdokdaeKimjangHanjiOnggiNajeonchilgiDirector,
  runAssistJongmyoGayageumGeomungoDaegeumJangguDirector,
  runAssistMarshallerLighthouseAntarcticObservatoryClockDirector,
  runAssistOceanLiner4FunnelStreetcarBiplaneSemaphoreDirector,
  runAssistPipeOrganPedalHarpAccordionBagpipeDirector,
  runAssistToonstudio1140HyperSynthesisLegalOstDirector,
  runAssistToonstudio1200GrandMillenniumSimulpubChromaDirector,
  runAssistWineBarriqueCheeseJamonChocolatePotStillDirector,
} from "./assist/assist-localize";
import {
  buildDeterministicHandPropGripLock,
  buildDeterministicPanelBorderGutterLock,
  buildDeterministicStoryboardAssistFallback,
  runAssistHandPropGripAnatomyDirector,
  runAssistPanelBorderGutterTensionDirector,
  runAiWebtoonStoryboardAssist,
  type AssistHandPropGripLockView,
  type AssistPanelBorderGutterLockView,
  type AiStoryboardAssistView,
} from "./assist/ai-webtoon-storyboard-assist";
import type { StoryboardArtistStyleBinding } from "./studio-ai-storyboard-director";
import { PANEL_CARD_CLASS } from "./studio-ai-super-suite-options";
import {
  analyzeArtistDatasetSamples,
  type ArtistTrainingSampleShotType,
} from "./studio-artist-style-dna";
import {
  buildGlobalKWebtoonExportBundle,
  GENVAS_POSE_PRESETS,
  runWebtoonStoryboardMasterPipeline,
  type CharacterRelationshipDynamicId,
  type GenvasPosePresetId,
} from "./studio-webtoon-storyboard-pipeline";
import { StudioAiWebtoonEcosystemWorkbenchPanel } from "./StudioAiWebtoonEcosystemWorkbenchPanel";
import { StudioAiWebtoonPlatformSuitePanel } from "./StudioAiWebtoonPlatformSuitePanel";
import { StudioSerialStudioSuitePanel } from "./StudioSerialStudioSuitePanel";
import { StudioCreatorPlusSuitePanel } from "./StudioCreatorPlusSuitePanel";
import { StudioWebtoonProductionAssistPanel } from "./StudioWebtoonProductionAssistPanel";

import { cn } from "@/shared/lib/utils";

const VOICE_ARCHETYPE_OPTIONS: readonly {
  readonly id: CharacterVoiceArchetype;
  readonly label: string;
}[] = [
  { id: "cold-strategist", label: "냉철한 지략가 (반말)" },
  { id: "passionate-hero", label: "열혈 액션 주인공 (반말)" },
  { id: "warm-healer", label: "다정한 조력자 (해요체)" },
  { id: "cynical-rival", label: "냉소적 라이벌 (반말)" },
  { id: "noble-formal", label: "로판·사극 귀족 (격식체)" },
];

const RELATIONSHIP_OPTIONS: readonly {
  readonly id: CharacterRelationshipDynamicId;
  readonly label: string;
}[] = [
  { id: "fated-rivals", label: "숙명적 라이벌" },
  { id: "contract-allies", label: "비밀 계약 동맹" },
  { id: "mentor-disciple", label: "사제·전승 성장" },
  { id: "enemies-to-lovers", label: "혐관·적대 로맨스" },
];

const DATASET_SHOT_OPTIONS: readonly {
  readonly id: ArtistTrainingSampleShotType;
  readonly label: string;
}[] = [
  { id: "close-up", label: "표정 클로즈업" },
  { id: "bust", label: "반신 바스트" },
  { id: "full-body", label: "전신 등신대" },
  { id: "action", label: "역동 액션" },
  { id: "background", label: "배경 세계관" },
];

export interface StudioWebtoonMasterPipelineCardProps {
  readonly scriptInput: string;
  readonly storyGenre: string;
  readonly coreConflict: string;
  readonly creatorLevel: "aspiring" | "pro";
  readonly targetLocale: "ko" | "en" | "ja" | "es";
  readonly activeArtistStyle: StoryboardArtistStyleBinding | null;
  readonly onApplyScript: (nextScript: string) => void;
}

export function StudioWebtoonMasterPipelineCard({
  scriptInput,
  storyGenre,
  coreConflict,
  creatorLevel,
  targetLocale,
  activeArtistStyle,
  onApplyScript,
}: StudioWebtoonMasterPipelineCardProps): ReactElement {
  const [voiceArchetype, setVoiceArchetype] = useState<CharacterVoiceArchetype>("cold-strategist");
  const [relationshipDynamic, setRelationshipDynamic] =
    useState<CharacterRelationshipDynamicId>("fated-rivals");
  const [posePresetId, setPosePresetId] = useState<GenvasPosePresetId>("pose-dynamic-slash");
  const [selectedShotTypes, setSelectedShotTypes] = useState<readonly ArtistTrainingSampleShotType[]>([
    "close-up",
    "bust",
    "full-body",
    "action",
  ]);

  const datasetSamples = useMemo(
    () =>
      selectedShotTypes.map((shotType, idx) => ({
        id: `sim-sample-${idx + 1}`,
        width: 1024,
        height: 1280,
        shotType,
        lineDensity:
          activeArtistStyle?.lineWeight === "bold"
            ? 0.82
            : activeArtistStyle?.lineWeight === "fine"
              ? 0.28
              : 0.52,
        shadingContrast:
          activeArtistStyle?.shadingMode === "hatching"
            ? 0.78
            : activeArtistStyle?.shadingMode === "soft-gradient"
              ? 0.36
              : 0.66,
        colorSaturation:
          activeArtistStyle?.paletteMood === "noir"
            ? 0.38
            : activeArtistStyle?.paletteMood === "pastel"
              ? 0.45
              : 0.75,
      })),
    [selectedShotTypes, activeArtistStyle],
  );

  const datasetReport = useMemo(
    () =>
      analyzeArtistDatasetSamples(datasetSamples, {
        artistLabel: activeArtistStyle?.artistLabel ?? "작가 커스텀 화풍 모델",
        triggerWord: activeArtistStyle?.triggerWord ?? "custom_artist_style",
      }),
    [datasetSamples, activeArtistStyle],
  );

  const masterOutput = useMemo(
    () =>
      runWebtoonStoryboardMasterPipeline({
        scriptText: scriptInput,
        storylineInput: {
          genre: storyGenre,
          coreConflict,
        },
        voiceArchetype,
        relationshipDynamic,
        posePresetId,
        artistTrainingSamples: datasetSamples,
        artistStyle: activeArtistStyle,
        creatorLevel,
        targetLocale,
      }),
    [
      scriptInput,
      storyGenre,
      coreConflict,
      voiceArchetype,
      relationshipDynamic,
      posePresetId,
      datasetSamples,
      activeArtistStyle,
      creatorLevel,
      targetLocale,
    ],
  );

  const exportBundle = useMemo(() => buildGlobalKWebtoonExportBundle(masterOutput), [masterOutput]);

  const [aiAssistOverride, setAiAssistOverride] = useState<AiStoryboardAssistView | null>(
    null,
  );
  const [borderGutterLock, setBorderGutterLock] = useState<AssistPanelBorderGutterLockView>(() =>
    buildDeterministicPanelBorderGutterLock({ sceneSummaryKo: coreConflict || "클라이맥스 결투 컷" }),
  );
  const [handPropGripLock, setHandPropGripLock] = useState<AssistHandPropGripLockView>(() =>
    buildDeterministicHandPropGripLock({ characterName: "서진", propNameKo: "청류검(장검)" }),
  );
  const [isRunningAiAssist, setIsRunningAiAssist] = useState(false);

  const defaultAiAssist = useMemo(
    () =>
      buildDeterministicStoryboardAssistFallback({
        scriptText: scriptInput,
        genre: storyGenre,
        coreConflict,
        relationshipDynamic,
        posePresetId,
        artistLabel: activeArtistStyle?.artistLabel,
        triggerWord: activeArtistStyle?.triggerWord,
      }),
    [
      scriptInput,
      storyGenre,
      coreConflict,
      relationshipDynamic,
      posePresetId,
      activeArtistStyle,
    ],
  );

  const activeAiAssist = aiAssistOverride ?? defaultAiAssist;

  const handleRunClaudeStoryboardAssist = async (): Promise<void> => {
    setIsRunningAiAssist(true);
    try {
      const [res, nextBorder, nextGrip] = await Promise.all([
        runAiWebtoonStoryboardAssist({
          scriptText: scriptInput,
          genre: storyGenre,
          coreConflict,
          relationshipDynamic,
          posePresetId,
          artistLabel: activeArtistStyle?.artistLabel,
          triggerWord: activeArtistStyle?.triggerWord,
        }),
        runAssistPanelBorderGutterTensionDirector({
          sceneSummaryKo: coreConflict || "클라이맥스 결투 시퀀스",
          cutCount: 3,
          peakTensionCutIndex: 2,
        }),
        runAssistHandPropGripAnatomyDirector({
          characterName: "서진",
          propNameKo: "청류검(장검)",
          dominantHand: "right-hand",
        }),
      ]);
      setAiAssistOverride(res);
      setBorderGutterLock(nextBorder);
      setHandPropGripLock(nextGrip);
    } finally {
      setIsRunningAiAssist(false);
    }
  };

  const {
    cliffhangerDiagnostic,
    dialogueExchange,
    fabulatorNarrativeChain,
    genvasCharacterPoseLock,
    enrichedCuts,
    creatorEcosystemReport,
  } = masterOutput;

  return (
    <section
      aria-label="K-웹툰 마스터 파이프라인 및 캐릭터 대사·클리프행어 진단"
      data-testid="studio-webtoon-master-pipeline-card"
      className={cn(PANEL_CARD_CLASS, "gap-2.5 border-accent bg-panel")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
          <Wand2 size={14} className="text-accent" aria-hidden="true" />
          통합 K-웹툰 마스터 파이프라인 (대사 말투 · 클리프행어 · 와이어프레임)
        </span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent">
          글로벌 플랫폼 적합도 {creatorEcosystemReport.globalKContentPlatformScore}점 · 예상 절감{" "}
          {creatorEcosystemReport.estimatedTimeSavedMinutes}분
        </span>
      </div>

      {/* 캐릭터 말투 아키타입 선택 및 티키타카 대사·효과음 교차 추천 */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2.5 text-[0.65rem]">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1 font-bold text-fg-2">
            <MessageSquareQuote size={12} className="text-accent" aria-hidden="true" />
            캐릭터 말투 아키타입 대사·독백·효과음(SFX) 교차 추천 ({dialogueExchange.speechEndingStyle} · 일관성{" "}
            {dialogueExchange.voiceConsistencyScore}점)
          </span>
          <button
            type="button"
            data-testid="apply-voice-exchange-script-btn"
            onClick={() => {
              const combined = scriptInput.trim()
                ? `${scriptInput.trim()}\n${dialogueExchange.scriptBlock}`
                : dialogueExchange.scriptBlock;
              onApplyScript(combined);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <Sparkles size={11} aria-hidden="true" />
            티키타카 대사 대본에 추가
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {VOICE_ARCHETYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={voiceArchetype === opt.id}
              onClick={() => setVoiceArchetype(opt.id)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[0.6rem] font-semibold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                voiceArchetype === opt.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-raised text-fg-2 hover:bg-card",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <ul className="flex list-none flex-col gap-1 p-0 text-[0.62rem]">
          {dialogueExchange.beats.map((beat) => (
            <li
              key={beat.turnOrder}
              className="flex flex-wrap items-center justify-between gap-1 rounded bg-raised px-2 py-1"
            >
              <span className="text-fg">
                <strong className="text-accent">
                  {beat.kind === "narration" ? "나레이션" : beat.speaker}
                </strong>
                : {beat.text}
              </span>
              <span className="text-[0.58rem] font-semibold text-fg-3">
                SFX: {beat.suggestedSfx} · 말풍선 {beat.mobileBubbles.length}개
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[0.6rem] text-fg-3">{dialogueExchange.pacingAdvice}</p>
      </div>

      {/* 상호 배타적 디테일 아코디언 (<details name="...">) — 클리프행어 진단 & 창작자 성장 커리큘럼 & 컷 와이어프레임 */}
      <details
        name={`${storyGenre}-master-pipeline-disclosure`}
        className="rounded-lg border border-line bg-card p-2 text-[0.64rem]"
      >
        <summary className="cursor-pointer font-bold text-fg-2">
          <span className="inline-flex items-center gap-1">
            <Award size={12} className="text-accent" aria-hidden="true" />
            4막 클리프행어 훅 강도 ({cliffhangerDiagnostic.hookPowerScore}점) · 스크롤 유지율 (
            {cliffhangerDiagnostic.scrollRetentionScore}점) · 창작자 성장 가이드
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 text-[0.62rem] text-fg-2">
          <p className="font-semibold text-fg">{creatorEcosystemReport.proProductionGuide}</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-fg-3">
            {cliffhangerDiagnostic.plotDoctorNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          {creatorLevel === "aspiring" ? (
            <ol className="mt-1 flex list-decimal flex-col gap-0.5 border-t border-line pt-1.5 pl-4 text-[0.6rem] text-fg-2">
              {creatorEcosystemReport.aspiringCreatorCurriculum.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
      </details>

      {enrichedCuts.length > 0 ? (
        <details
          name={`${storyGenre}-master-pipeline-disclosure`}
          className="rounded-lg border border-line bg-card p-2 text-[0.64rem]"
        >
          <summary className="cursor-pointer font-bold text-fg-2">
            <span className="inline-flex items-center gap-1">
              <Layers size={12} className="text-accent" aria-hidden="true" />
              컷별 구도 와이어프레임 & 말풍선 감정 모양 프리뷰 ({enrichedCuts.length}컷)
            </span>
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {enrichedCuts.slice(0, 4).map((item) => (
              <div
                key={item.cutPlan.cutNumber}
                className="flex items-center gap-2 rounded border border-line bg-raised p-1.5 text-[0.6rem]"
              >
                <img
                  src={item.cutWireframeDataUrl}
                  alt={`컷 ${item.cutPlan.cutNumber} 구도 와이어프레임`}
                  className="h-14 w-20 shrink-0 rounded border border-line object-cover"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-fg">
                    #{item.cutPlan.cutNumber} {item.cutPlan.shotScale} ({item.cutPlan.cameraAngle})
                  </span>
                  <span className="text-accent">
                    말풍선 모양: {item.emotionBubble.recommendedBubbleShape} (신뢰도{" "}
                    {item.emotionBubble.confidenceScore}%)
                  </span>
                  <span className="text-fg-3">
                    렌즈: {item.productionLayers.lensFocalLengthMm}mm · 4레이어(선화/밑색/명암/3D)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* 오노마AI 페뷸레이터 & 투툰 벤치마크: 5단계 서사 빌드업 체인 및 캐릭터 관계성 텐션 */}
      <details
        name={`${storyGenre}-master-pipeline-disclosure`}
        className="rounded-lg border border-line bg-card p-2 text-[0.64rem]"
      >
        <summary className="cursor-pointer font-bold text-fg-2">
          <span className="inline-flex items-center gap-1">
            <GitBranch size={12} className="text-accent" aria-hidden="true" />
            페뷸레이터·투툰형 5단계 서사 체인 ({fabulatorNarrativeChain.relationshipLabel} · 로그라인→세계관→콘티)
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 text-[0.61rem]">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1" role="group" aria-label="캐릭터 관계성 구도 선택">
              {RELATIONSHIP_OPTIONS.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  aria-pressed={relationshipDynamic === rel.id}
                  onClick={() => setRelationshipDynamic(rel.id)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[0.59rem] font-semibold",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    relationshipDynamic === rel.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-raised text-fg-3 hover:bg-card",
                  )}
                >
                  {rel.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="apply-fabulator-chain-script-btn"
              onClick={() => onApplyScript(fabulatorNarrativeChain.readyToDirectScript)}
              className={cn(
                "inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent hover:bg-raised",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <Sparkles size={10} aria-hidden="true" />
              페뷸레이터 5단계 대본 적용
            </button>
          </div>
          <p className="text-fg-3">{fabulatorNarrativeChain.relationshipSubtextGuide}</p>
          <ol className="flex list-none flex-col gap-1 p-0">
            {fabulatorNarrativeChain.stages.map((st) => (
              <li key={st.stageCode} className="rounded bg-raised px-2 py-1 text-[0.59rem] text-fg-2">
                <strong className="text-accent">{st.stageLabel}</strong>: {st.content}
              </li>
            ))}
          </ol>
        </div>
      </details>

      {/* 라이언로켓 젠버스(Genvas) 포즈·캐릭터 고정 & 리얼드로우(RealDraw) 4레이어 PD 분해 */}
      <details
        name={`${storyGenre}-master-pipeline-disclosure`}
        className="rounded-lg border border-line bg-card p-2 text-[0.64rem]"
      >
        <summary className="cursor-pointer font-bold text-fg-2">
          <span className="inline-flex items-center gap-1">
            <Camera size={12} className="text-accent" aria-hidden="true" />
            젠버스 포즈·캐릭터 고정 ({genvasCharacterPoseLock.posePreset.label}) & 리얼드로우 4레이어 PD 분해
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 text-[0.61rem]">
          <div className="flex flex-wrap items-center justify-between gap-1 rounded bg-raised px-2 py-1">
            <span className="inline-flex items-center gap-1 font-bold text-good">
              <ShieldCheck size={12} aria-hidden="true" />
              {genvasCharacterPoseLock.copyrightProvenanceBadge.labelKo}
            </span>
            <span className="font-mono text-[0.58rem] text-fg-3">
              고정 시드: {genvasCharacterPoseLock.characterIdentityToken}
            </span>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="젠버스 웹툰 포즈 프리셋 선택">
            {GENVAS_POSE_PRESETS.map((pose) => (
              <button
                key={pose.id}
                type="button"
                aria-pressed={posePresetId === pose.id}
                onClick={() => setPosePresetId(pose.id)}
                className={cn(
                  "rounded border px-2 py-0.5 text-[0.59rem] font-semibold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  posePresetId === pose.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-raised text-fg-3 hover:bg-card",
                )}
              >
                {pose.label}
              </button>
            ))}
          </div>
          <p data-testid="genvas-pose-guide" className="text-fg-2">
            투시·동세 가이드: {genvasCharacterPoseLock.posePreset.foreshorteningGuide}
          </p>
          {enrichedCuts[0] ? (
            <div className="grid grid-cols-1 gap-1 border-t border-line pt-1.5 sm:grid-cols-2">
              {enrichedCuts[0].productionLayers.layers.map((layer) => (
                <div key={layer.layerId} className="rounded bg-raised px-2 py-1 text-[0.58rem]">
                  <strong className="text-accent">{layer.layerLabelKo}</strong> ({layer.blendMode}):{" "}
                  <span className="text-fg-2">{layer.technicalDirective}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </details>

      {/* 작가 학습 데이터셋 큐레이션 & 화풍 DNA 자동 추론 시뮬레이터 + 글로벌 K-웹툰 플랫폼 규격 */}
      <details
        name={`${storyGenre}-master-pipeline-disclosure`}
        className="rounded-lg border border-line bg-card p-2 text-[0.64rem]"
      >
        <summary className="cursor-pointer font-bold text-fg-2">
          <span className="inline-flex items-center gap-1">
            <Database size={12} className="text-accent" aria-hidden="true" />
            작가 학습 데이터셋 준비도 ({datasetReport.readinessScore}점 · 샷 다양성{" "}
            {Math.round(datasetReport.shotCoverage.diversityRatio * 100)}%) & 글로벌 플랫폼 규격
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 text-[0.61rem]">
          <div className="flex flex-wrap gap-1" role="group" aria-label="학습 데이터셋 샷 구성 선택">
            {DATASET_SHOT_OPTIONS.map((shot) => {
              const active = selectedShotTypes.includes(shot.id);
              return (
                <button
                  key={shot.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setSelectedShotTypes((prev) =>
                      prev.includes(shot.id)
                        ? prev.length > 1
                          ? prev.filter((id) => id !== shot.id)
                          : prev
                        : [...prev, shot.id],
                    )
                  }
                  className={cn(
                    "rounded border px-2 py-0.5 text-[0.59rem] font-semibold",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-raised text-fg-3 hover:bg-card",
                  )}
                >
                  {shot.label}
                </button>
              );
            })}
          </div>
          <p data-testid="dataset-dna-auto-caption" className="font-mono text-[0.58rem] text-fg-2">
            자동 학습 캡션 예시: {datasetReport.autoCaptions[0]?.caption}
          </p>
          <p className="text-fg-3">{datasetReport.coachingTips[0]}</p>
          <div className="border-t border-line pt-1.5">
            <span className="inline-flex items-center gap-1 font-bold text-fg-2">
              <Globe size={11} className="text-accent" aria-hidden="true" /> 글로벌 연재 플랫폼 출고 규격:
            </span>
            <ul className="mt-0.5 grid grid-cols-1 gap-1 sm:grid-cols-3">
              {exportBundle.platformSpecs.map((spec) => (
                <li key={spec.platformId} className="rounded bg-raised px-1.5 py-1 text-[0.58rem]">
                  <strong className="text-accent">{spec.platformLabel}</strong> ({spec.recommendedWidthPx}×
                  {spec.maxSliceHeightPx}px): {spec.typesettingRule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      {/* AI 수석 PD 스토리보드·대사 서브텍스트·4레이어 실시간 코칭 */}
      <div
        data-testid="claude-storyboard-assist-panel"
        className="flex flex-col gap-1.5 rounded-lg border border-accent bg-card p-2.5 text-[0.62rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1 font-bold text-fg">
            <Sparkles size={12} className="text-accent" aria-hidden="true" />
            AI 수석 PD 코칭 ({activeAiAssist.source === "claude-live" ? "AI 실시간" : "로컬 하이브리드"} · 모델:{" "}
            {activeAiAssist.model})
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              data-testid="run-claude-storyboard-assist-btn"
              disabled={isRunningAiAssist}
              onClick={() => void handleRunClaudeStoryboardAssist()}
              className={cn(
                "inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent hover:bg-raised disabled:opacity-50",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <Wand2 size={10} aria-hidden="true" />
              {isRunningAiAssist ? "AI 분석 중..." : "AI 수석 PD 코칭 실행"}
            </button>
            <button
              type="button"
              data-testid="apply-claude-cliffhanger-btn"
              onClick={() => {
                const nextLine = `주인공: "${activeAiAssist.cliffhangerHookLine}" (클리프행어 훅)`;
                const combined = scriptInput.trim()
                  ? `${scriptInput.trim()}\n${nextLine}`
                  : nextLine;
                onApplyScript(combined);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded border border-line bg-raised px-2 py-0.5 text-[0.6rem] font-semibold text-fg-2 hover:bg-card",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              클리프행어 대사 반영
            </button>
          </div>
        </div>
        <p data-testid="ai-assist-cliffhanger-line" className="font-semibold text-accent">
          추천 엔딩 대사: &ldquo;{activeAiAssist.cliffhangerHookLine}&rdquo;
        </p>
        {activeAiAssist.subtextDialogueUpgrade[0] ? (
          <p className="text-fg-2">
            서브텍스트 대사: [{activeAiAssist.subtextDialogueUpgrade[0].speaker}]{" "}
            {activeAiAssist.subtextDialogueUpgrade[0].line} (
            {activeAiAssist.subtextDialogueUpgrade[0].subtextNote})
          </p>
        ) : null}
        <p className="text-[0.59rem] text-fg-3">
          카메라: {activeAiAssist.cutDirectingNotes[0]?.poseAndCameraNote ?? "50mm 표준 렌즈"} · 현지화:{" "}
          {activeAiAssist.globalLocalizationNotes[0] ?? "번역 팽창률 여유 확보"}
        </p>
        <div
          data-testid="storyboard-border-grip-consistency-strip"
          className="grid grid-cols-1 gap-1 border-t border-line pt-1.5 text-[0.58rem] sm:grid-cols-2"
        >
          <div className="rounded bg-raised px-2 py-1 text-fg-2">
            <strong className="text-accent">컷 테두리·여백(Gutter) 연속성 ({borderGutterLock.overallTensionCurveScore}점):</strong>{" "}
            컷#2 {borderGutterLock.panelBorderSpecs[1]?.frameStyle} ({borderGutterLock.panelBorderSpecs[1]?.diagonalTiltDeg}°) · 여백{" "}
            {borderGutterLock.panelBorderSpecs[1]?.gutterHeightPx}px ({borderGutterLock.panelBorderSpecs[1]?.gutterGradientFromHex}→
            {borderGutterLock.panelBorderSpecs[1]?.gutterGradientToHex})
          </div>
          <div className="rounded bg-raised px-2 py-1 text-fg-2">
            <strong className="text-accent">손가락 관절·파지법 고정 ({handPropGripLock.anatomyConsistencyScore}점):</strong>{" "}
            {handPropGripLock.characterName} ({handPropGripLock.dominantHand}) · {handPropGripLock.propNameKo} ({handPropGripLock.cutGripDirectives[0]?.gripArchetype})
          </div>
        </div>
        <div
          data-testid="wave57-59-domain-consistency-bar"
          className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-[0.58rem]"
        >
          <span className="font-semibold text-accent">Wave 57~59 (1,140대 플랫폼 · 188태스크):</span>
          {(
            [
              ["국악·종묘제례악", () => runAssistJongmyoGayageumGeomungoDaegeumJangguDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "국악" }).then((r) => onApplyScript(`${scriptInput}\n[국악고증] ${r.data.gayageum12AnjokAndGeomungoSuldaeKo}`))],
              ["하회탈·경극·토가", () => runAssistHahoeMaskLianpuKabukiTogaThuribleDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "가면극" }).then((r) => onApplyScript(`${scriptInput}\n[가면/토가] ${r.data.hahoeSplitChinAndPekingLianpuColorKo}`))],
              ["오르간·하프·백파이프", () => runAssistPipeOrganPedalHarpAccordionBagpipeDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "악기" }).then((r) => onApplyScript(`${scriptInput}\n[클래식악기] ${r.data.pedalHarp47StringRedCBlueFRightShoulderKo}`))],
              ["F1·WRC·서핑·요트", () => runAssistF1KerbWrcRollcageSkydivingSurfingYachtDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "레이싱" }).then((r) => onApplyScript(`${scriptInput}\n[익스트림스포츠] ${r.data.f1ApexKerbTireCompoundAndWrcRollcageKo}`))],
              ["마샬러·등대·시계탑", () => runAssistMarshallerLighthouseAntarcticObservatoryClockDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "등대" }).then((r) => onApplyScript(`${scriptInput}\n[특수시설] ${r.data.observatoryDomeSlitAndClockTowerEscapementKo}`))],
              ["유리·루시어·보석루페", () => runAssistGlassblowingLuthierDiamondLoupeShoemakerDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "공예" }).then((r) => onApplyScript(`${scriptInput}\n[명장공예] ${r.data.gemologist10xLoupeAtEyeAndLockingTweezersKo}`))],
              ["3DGS·NeRF·FACS·시선", () => runAssist3dgsNerfControlnet4FacsSfx3dSaccadeDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "3DGS" }).then((r) => onApplyScript(`${scriptInput}\n[3DGS/FACS] ${r.data.controlnet4WayMixerAndFacsDuchenneSmileKo}`))],
              ["1140대하이퍼·독소조항", () => runAssistToonstudio1140HyperSynthesisLegalOstDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "하이퍼" }).then((r) => onApplyScript(`${scriptInput}\n[1140하이퍼] ${r.data.unfairContractLegalScannerAndBirthdayCafeSpecKo}`))],
            ] as const
          ).map(([label, act]) => (
            <button
              key={label}
              type="button"
              onClick={() => void act()}
              className="rounded border border-line bg-panel px-1.5 py-0.5 text-fg-2 hover:border-accent hover:text-accent"
            >
              {label}
            </button>
          ))}
        </div>
        <div
          data-testid="wave60-62-domain-consistency-bar"
          className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-[0.58rem]"
        >
          <span className="font-semibold text-accent">Wave 60~62 (1,200대 플랫폼 · 196태스크):</span>
          {(
            [
              ["에니그마·암실·활판", () => runAssistEnigmaMorseDarkroomLetterpressPhonographDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "에니그마" }).then((r) => onApplyScript(`${scriptInput}\n[근대통신/인쇄] ${r.data.trenchPeriscopeAndEnigma3RotorPlugboardKo}`))],
              ["4굴뚝여객선·복엽기", () => runAssistOceanLiner4FunnelStreetcarBiplaneSemaphoreDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "여객선" }).then((r) => onApplyScript(`${scriptInput}\n[근대교통] ${r.data.airshipMooringMastAndOceanLiner4thDummyFunnelKo}`))],
              ["안전등·인력거·잠수모", () => runAssistDavyLampRickshawDivingDressSwitchboardSundialDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "탄광" }).then((r) => onApplyScript(`${scriptInput}\n[근대소품] ${r.data.divingDress12BoltSwitchboardPatchAndSundialGnomonKo}`))],
              ["장독대·한지·나전칠기", () => runAssistJangdokdaeKimjangHanjiOnggiNajeonchilgiDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "전통공예" }).then((r) => onApplyScript(`${scriptInput}\n[전통발효/공예] ${r.data.jangdokdaeMejuStrawRopeAndKimjangBuriedOnggiKo}`))],
              ["와인배럴·하몽·증류기", () => runAssistWineBarriqueCheeseJamonChocolatePotStillDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "양조" }).then((r) => onApplyScript(`${scriptInput}\n[미식/양조] ${r.data.oakWineBarrique225LAndParmigianoSoundingHammerKo}`))],
              ["방패연·씨름샅바·택견", () => runAssistBangpaeyeonSsireumSatbaTaekkyeonMaedeupDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "민속" }).then((r) => onApplyScript(`${scriptInput}\n[민속/무예] ${r.data.danoSwingStandingWaitAndSsireumSatbaRightLoopKo}`))],
              ["1000화패러독스·SFX복원", () => runAssistCrossover1000EpParadoxWrinkleBakerSfxRedrawDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "패러독스" }).then((r) => onApplyScript(`${scriptInput}\n[패러독스/SFX] ${r.data.multiStudioCrossoverBridgeAnd1000EpParadoxSolverKo}`))],
              ["1200밀레니엄·4:4:4무손실", () => runAssistToonstudio1200GrandMillenniumSimulpubChromaDirector({ episodeTitle: "1화", genre: storyGenre, scriptSummary: scriptInput || "밀레니엄" }).then((r) => onApplyScript(`${scriptInput}\n[1200밀레니엄] ${r.data.simulpub6PlatformRoyaltySplitAndChroma444LosslessKo}`))],
            ] as const
          ).map(([label, act]) => (
            <button key={label} type="button" onClick={() => void act()} className="rounded border border-line bg-panel px-1.5 py-0.5 text-fg-2 hover:border-accent hover:text-accent">
              {label}
            </button>
          ))}
        </div>
      </div>

      <StudioWebtoonProductionAssistPanel
        scriptInput={scriptInput}
        storyGenre={storyGenre}
        coreConflict={coreConflict}
        relationshipDynamic={relationshipDynamic}
        posePresetId={posePresetId}
        targetLocale={targetLocale}
        artistLabel={activeArtistStyle?.artistLabel}
        triggerWord={activeArtistStyle?.triggerWord}
        onApplyScript={onApplyScript}
      />

      {/* 투닝 플러스 (Tooning Plus: TG·TD·ED·MG·DV·TB·CM) 전 제품군 통합 워크스페이스 */}
      <StudioCreatorPlusSuitePanel scriptInput={scriptInput} onApplyScript={onApplyScript} />

      {/* 4대 카테고리 12대 AI 웹툰·인스타툰 보조 어플 REA 역공학 내재화 통합 워크벤치 */}
      <StudioAiWebtoonEcosystemWorkbenchPanel
        scriptInput={scriptInput}
        storyGenre={storyGenre}
        onApplyScript={onApplyScript}
      />

      {/* 꿈툰 (Ggumtoon: 스타일·캐릭터·장면·부분수정·여백컷·웹소설·뷰어·지갑·정산) 통합 스튜디오 */}
      <StudioSerialStudioSuitePanel scriptInput={scriptInput} onApplyScript={onApplyScript} />

      {/* AI 만화·인스타툰 4대 플랫폼(젠툰·망고툰·라마젠·투닝) 통합 워크스페이스 */}
      <StudioAiWebtoonPlatformSuitePanel scriptInput={scriptInput} onApplyScript={onApplyScript} />
    </section>
  );
}
