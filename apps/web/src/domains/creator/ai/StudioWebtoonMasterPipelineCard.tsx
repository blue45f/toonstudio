/**
 * StudioWebtoonMasterPipelineCard.tsx
 *
 * 웹툰 작가 그림체 학습 데이터셋/모델(Artist Style DNA) 진단 + 캐릭터 말투 아키타입 기반
 * 티키타카 대사·효과음(SFX) 교차 추천 + 4막 스토리라인 클리프행어·스크롤 유지율 진단 +
 * 컷별 구도 와이어프레임 프리뷰 및 글로벌 K-콘텐츠 연재 지표를 통합 제공하는 UI 카드 컴포넌트.
 */
import { Award, Database, Globe, Layers, MessageSquareQuote, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import type { CharacterVoiceArchetype } from "../lettering/studio-dialogue-suggest";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import type { StoryboardArtistStyleBinding } from "./studio-ai-storyboard-director";
import { PANEL_CARD_CLASS } from "./studio-ai-super-suite-options";
import {
  analyzeArtistDatasetSamples,
  type ArtistTrainingSampleShotType,
} from "./studio-artist-style-dna";
import {
  buildGlobalKWebtoonExportBundle,
  runWebtoonStoryboardMasterPipeline,
} from "./studio-webtoon-storyboard-pipeline";

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
        artistTrainingSamples: datasetSamples,
        artistStyle: activeArtistStyle,
        creatorLevel,
        targetLocale,
      }),
    [scriptInput, storyGenre, coreConflict, voiceArchetype, datasetSamples, activeArtistStyle, creatorLevel, targetLocale],
  );

  const exportBundle = useMemo(() => buildGlobalKWebtoonExportBundle(masterOutput), [masterOutput]);

  const {
    cliffhangerDiagnostic,
    dialogueExchange,
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
                    지원 플랫폼: {creatorEcosystemReport.supportedGlobalPlatforms[0]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

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
    </section>
  );
}
