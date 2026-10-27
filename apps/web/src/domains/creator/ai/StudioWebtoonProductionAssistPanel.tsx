/**
 * StudioWebtoonProductionAssistPanel.tsx
 *
 * 국내외 8대 웹툰 AI 제작 소프트웨어 벤치마크 스코어보드 및
 * 신규 4대 웹툰 프로덕션 AI 보조 기능(스크롤 시선 유도 닥터 · 컬러 스크립트 디렉터 ·
 * 설정 연속성/복선 감수기 · 다각도 연기/SFX 오케스트레이터) 통합 워크벤치 패널.
 */
import {
  CheckCircle2,
  CloudRain,
  Eye,
  Film,
  GitCompare,
  Palette,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  buildLocalCollarTieLapelNecklineLockReport,
  buildLocalCompanionFamiliarScaleLockReport,
  buildLocalInteriorRoomGeographyLockReport,
  buildLocalScrollPaceSilentBeatRhythmReport,
  buildLocalSubsurfaceScatteringTearSpecularLockReport,
  buildLocalTattooStigmaUvTopologyLockReport,
  runClaudeCollarTieLapelNecklineLockDirector,
  runClaudeCompanionFamiliarScaleLockDirector,
  runClaudeInteriorRoomGeographyLockDirector,
  runClaudeScrollPaceSilentBeatRhythmDirector,
  runClaudeSubsurfaceScatteringTearSpecularLockDirector,
  runClaudeTattooStigmaUvTopologyLockDirector,
} from "./claude/claude-phase6-ecosystem-suite";
import {
  buildDeterministicActingSfxReport,
  buildDeterministicColorScriptReport,
  buildDeterministicContinuityForeshadowReport,
  buildDeterministicMultiCharacterWardrobeReport,
  buildDeterministicScrollEyePathReport,
  buildDeterministicWeatherTimeProgressionReport,
  runClaudeActingSfxChoreographer,
  runClaudeColorScriptDirector,
  runClaudeContinuityForeshadowAuditor,
  runClaudeMultiCharacterWardrobeUniformDirector,
  runClaudeScrollEyePathDoctor,
  runClaudeWeatherTimeProgressionContinuityDirector,
  type ClaudeActingSfxChoreographyView,
  type ClaudeColorScriptView,
  type ClaudeContinuityForeshadowView,
  type ClaudeMultiCharacterWardrobeView,
  type ClaudeScrollEyePathView,
  type ClaudeWeatherTimeProgressionView,
  type WebtoonProductionAssistInput,
  type WebtoonProductionAssistMode,
} from "./claude/claude-webtoon-production-assist";
import {
  evaluateWebtoonAiCompetitorParity,
  WEBTOON_AI_SERVICE_BENCHMARK_MATRIX,
} from "./studio-webtoon-industry-benchmarks";
import type {
  CharacterRelationshipDynamicId,
  GenvasPosePresetId,
} from "./studio-webtoon-storyboard-pipeline";
import { StudioCompetitorFullSuitePanel } from "./StudioCompetitorFullSuitePanel";
import { StudioWebtoonEpisodicDoctorPanel } from "./StudioWebtoonEpisodicDoctorPanel";

import { cn } from "@/shared/lib/utils";

const PRODUCTION_ASSIST_TABS: readonly {
  readonly id: WebtoonProductionAssistMode;
  readonly labelKo: string;
  readonly benchmarkBadgeKo: string;
}[] = [
  {
    id: "scroll-eyepath",
    labelKo: "모바일 스크롤 시선·데드존 닥터",
    benchmarkBadgeKo: "클립스튜디오 EX · 네이버웹툰",
  },
  {
    id: "color-script",
    labelKo: "컬러 스크립트 · 4레이어 조명",
    benchmarkBadgeKo: "다쉬툰 스튜디오 · 리얼드로우",
  },
  {
    id: "continuity-foreshadow",
    labelKo: "설정 연속성 · 복선 회수 감수",
    benchmarkBadgeKo: "오노마AI 페뷸레이터 · 라마젠",
  },
  {
    id: "acting-sfx",
    labelKo: "다각도 연기 · SFX 오케스트레이터",
    benchmarkBadgeKo: "라이언로켓 젠버스 · 투닝 플러스",
  },
  {
    id: "multi-character-wardrobe-lock",
    labelKo: "다중 인물·군중 제복/문장 락",
    benchmarkBadgeKo: "Faction Crest & Uniform Lock",
  },
  {
    id: "weather-time-progression-lock",
    labelKo: "날씨·젖은 모발/의상·그림자 연속성",
    benchmarkBadgeKo: "Wetness & Shadow Physics Lock",
  },
];

export interface StudioWebtoonProductionAssistPanelProps {
  readonly scriptInput: string;
  readonly storyGenre: string;
  readonly coreConflict: string;
  readonly relationshipDynamic: CharacterRelationshipDynamicId;
  readonly posePresetId: GenvasPosePresetId;
  readonly targetLocale: "ko" | "en" | "ja" | "es";
  readonly artistLabel?: string;
  readonly triggerWord?: string;
  readonly onApplyScript: (nextScript: string) => void;
}

export function StudioWebtoonProductionAssistPanel({
  scriptInput,
  storyGenre,
  coreConflict,
  relationshipDynamic,
  posePresetId,
  targetLocale,
  artistLabel,
  triggerWord,
  onApplyScript,
}: StudioWebtoonProductionAssistPanelProps): ReactElement {
  const [activeMode, setActiveMode] = useState<WebtoonProductionAssistMode>("scroll-eyepath");
  const [isRunningClaude, setIsRunningClaude] = useState(false);

  const [liveScrollView, setLiveScrollView] = useState<ClaudeScrollEyePathView | null>(null);
  const [liveColorView, setLiveColorView] = useState<ClaudeColorScriptView | null>(null);
  const [liveContinuityView, setLiveContinuityView] =
    useState<ClaudeContinuityForeshadowView | null>(null);
  const [liveActingView, setLiveActingView] = useState<ClaudeActingSfxChoreographyView | null>(
    null,
  );
  const [liveWardrobeView, setLiveWardrobeView] =
    useState<ClaudeMultiCharacterWardrobeView | null>(null);
  const [liveWeatherView, setLiveWeatherView] =
    useState<ClaudeWeatherTimeProgressionView | null>(null);

  const assistInput: WebtoonProductionAssistInput = useMemo(
    () => ({
      scriptText: scriptInput,
      genre: storyGenre,
      coreConflict,
      relationshipDynamic,
      posePresetId,
      targetLocale,
      artistLabel,
      triggerWord,
    }),
    [
      scriptInput,
      storyGenre,
      coreConflict,
      relationshipDynamic,
      posePresetId,
      targetLocale,
      artistLabel,
      triggerWord,
    ],
  );

  const parityReport = useMemo(() => evaluateWebtoonAiCompetitorParity(), []);

  const fallbackScrollView = useMemo(
    () => buildDeterministicScrollEyePathReport(assistInput),
    [assistInput],
  );
  const fallbackColorView = useMemo(
    () => buildDeterministicColorScriptReport(assistInput),
    [assistInput],
  );
  const fallbackContinuityView = useMemo(
    () => buildDeterministicContinuityForeshadowReport(assistInput),
    [assistInput],
  );
  const fallbackActingView = useMemo(
    () => buildDeterministicActingSfxReport(assistInput),
    [assistInput],
  );
  const fallbackWardrobeView = useMemo(
    () => buildDeterministicMultiCharacterWardrobeReport(assistInput),
    [assistInput],
  );
  const fallbackWeatherView = useMemo(
    () => buildDeterministicWeatherTimeProgressionReport(assistInput),
    [assistInput],
  );

  const currentScrollView = liveScrollView ?? fallbackScrollView;
  const currentColorView = liveColorView ?? fallbackColorView;
  const currentContinuityView = liveContinuityView ?? fallbackContinuityView;
  const currentActingView = liveActingView ?? fallbackActingView;
  const currentWardrobeView = liveWardrobeView ?? fallbackWardrobeView;
  const currentWeatherView = liveWeatherView ?? fallbackWeatherView;

  const currentActiveSource =
    activeMode === "scroll-eyepath"
      ? currentScrollView.source
      : activeMode === "color-script"
        ? currentColorView.source
        : activeMode === "continuity-foreshadow"
          ? currentContinuityView.source
          : activeMode === "acting-sfx"
            ? currentActingView.source
            : activeMode === "multi-character-wardrobe-lock"
              ? currentWardrobeView.source
              : currentWeatherView.source;

  const currentActiveModel =
    activeMode === "scroll-eyepath"
      ? currentScrollView.model
      : activeMode === "color-script"
        ? currentColorView.model
        : activeMode === "continuity-foreshadow"
          ? currentContinuityView.model
          : activeMode === "acting-sfx"
            ? currentActingView.model
            : activeMode === "multi-character-wardrobe-lock"
              ? currentWardrobeView.model
              : currentWeatherView.model;

  const handleRunActiveClaudeEngine = async (): Promise<void> => {
    setIsRunningClaude(true);
    try {
      if (activeMode === "scroll-eyepath") {
        const res = await runClaudeScrollEyePathDoctor(assistInput);
        setLiveScrollView(res);
      } else if (activeMode === "color-script") {
        const res = await runClaudeColorScriptDirector(assistInput);
        setLiveColorView(res);
      } else if (activeMode === "continuity-foreshadow") {
        const res = await runClaudeContinuityForeshadowAuditor(assistInput);
        setLiveContinuityView(res);
      } else if (activeMode === "acting-sfx") {
        const res = await runClaudeActingSfxChoreographer(assistInput);
        setLiveActingView(res);
      } else if (activeMode === "multi-character-wardrobe-lock") {
        const res = await runClaudeMultiCharacterWardrobeUniformDirector(assistInput);
        setLiveWardrobeView(res);
      } else {
        const res = await runClaudeWeatherTimeProgressionContinuityDirector(assistInput);
        setLiveWeatherView(res);
      }
    } finally {
      setIsRunningClaude(false);
    }
  };

  const handleApplyActiveStageLine = (): void => {
    let stageLine: string;
    if (activeMode === "scroll-eyepath") {
      stageLine =
        currentScrollView.cutDiagnostics[0]?.readyStageDirectionLine ??
        currentScrollView.cliffhangerScrollHookKo;
    } else if (activeMode === "color-script") {
      stageLine =
        currentColorView.cutDirectives[0]?.readyColorStageLine ??
        currentColorView.episodeArcColorSummaryKo;
    } else if (activeMode === "continuity-foreshadow") {
      stageLine =
        currentContinuityView.foreshadowPayoffs[0]?.suggestedSubtextLineKo ??
        currentContinuityView.executiveSummaryKo;
    } else if (activeMode === "acting-sfx") {
      stageLine =
        currentActingView.cutChoreographies[0]?.readyActingScriptLine ??
        currentActingView.genvasConsistencySummaryKo;
    } else if (activeMode === "multi-character-wardrobe-lock") {
      stageLine =
        currentWardrobeView.castUniformSpecs[0]?.readyWardrobeStageLine ??
        currentWardrobeView.factionUniformSummaryKo;
    } else {
      stageLine =
        currentWeatherView.cutWeatherLocks[0]?.readyWeatherStageLine ??
        currentWeatherView.atmosphericArcSummaryKo;
    }
    const nextScript = scriptInput.trim() ? `${scriptInput.trim()}\n${stageLine}` : stageLine;
    onApplyScript(nextScript);
  };

  return (
    <div
      data-testid="studio-webtoon-production-assist-panel"
      className="flex flex-col gap-2 rounded-lg border border-accent bg-card p-2.5 text-[0.62rem]"
    >
      {/* 상단 헤더 & 8대 경쟁사 벤치마크 우위 배지 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-fg">
          <Film size={13} className="text-accent" aria-hidden="true" />
          웹툰 AI 8대 경쟁사 벤치마크 & 4대 프로덕션 AI 감수 워크벤치
        </span>
        <span
          data-testid="competitor-parity-badge"
          className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.59rem] font-bold text-accent"
        >
          <CheckCircle2 size={11} aria-hidden="true" />
          {parityReport.benchmarkedServiceCount}개 글로벌·국내 웹툰 AI 대비 달성도{" "}
          {parityReport.overallParityScore}%
        </span>
      </div>

      {/* 8대 웹툰 AI 경쟁사 벤치마크 매트릭스 접이식 요약 */}
      <details className="rounded border border-line bg-raised px-2 py-1.5 text-[0.6rem]">
        <summary className="cursor-pointer font-semibold text-fg-2">
          국내외 8대 웹툰 AI 솔루션 벤치마크 매트릭스 (젠버스 · 페뷸레이터 · 리얼드로우 · 클립스튜디오 · 투닝 · 다쉬툰 · 라마젠 · 쾌간/네이버)
        </summary>
        <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {WEBTOON_AI_SERVICE_BENCHMARK_MATRIX.map((item) => (
            <div
              key={item.serviceId}
              data-testid={`benchmark-service-${item.serviceId}`}
              className="rounded border border-line bg-card px-2 py-1 text-[0.58rem]"
            >
              <div className="font-bold text-accent">{item.serviceNameKo}</div>
              <div className="text-fg-3">핵심 강점: {item.coreStrengthKo}</div>
              <div className="text-fg-2">ToonStudio 고도화: {item.toonStudioIntegrationKo}</div>
            </div>
          ))}
        </div>
      </details>

      {/* 4대 신규 AI 보조 기능 탭 스위처 */}
      <div
        role="tablist"
        aria-label="신규 웹툰 프로덕션 AI 보조 기능 선택"
        className="grid grid-cols-2 gap-1 sm:grid-cols-4"
      >
        {PRODUCTION_ASSIST_TABS.map((tab) => {
          const selected = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`production-assist-tab-${tab.id}`}
              onClick={() => setActiveMode(tab.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded border px-2 py-1 text-left",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-raised text-fg-2 hover:bg-card",
              )}
            >
              <span className="text-[0.6rem] font-bold">{tab.labelKo}</span>
              <span className="text-[0.54rem] text-fg-3">{tab.benchmarkBadgeKo}</span>
            </button>
          );
        })}
      </div>

      {/* 실행 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded bg-raised px-2 py-1.5">
        <span
          data-testid="production-assist-engine-status"
          className="text-[0.59rem] font-semibold text-fg-2"
        >
          엔진 상태:{" "}
          <strong className="text-accent">
            {currentActiveSource === "claude-live" ? "Claude API 실시간" : "로컬 하이브리드"}
          </strong>{" "}
          ({currentActiveModel})
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-testid="run-claude-production-assist-btn"
            disabled={isRunningClaude}
            onClick={() => void handleRunActiveClaudeEngine()}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent hover:bg-card disabled:opacity-50",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <Wand2 size={10} aria-hidden="true" />
            {isRunningClaude ? "Claude AI 감수 중..." : "Claude AI 실시간 감수 실행"}
          </button>
          <button
            type="button"
            data-testid="apply-production-assist-script-btn"
            onClick={handleApplyActiveStageLine}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-line bg-card px-2 py-0.5 text-[0.6rem] font-semibold text-fg-2 hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <Sparkles size={10} aria-hidden="true" />
            연출 지문 대본에 반영
          </button>
        </div>
      </div>

      {/* 탭 1: 모바일 스크롤 시선 유도(S-curve) · 데드존 닥터 */}
      {activeMode === "scroll-eyepath" ? (
        <div
          data-testid="panel-scroll-eyepath"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2 text-[0.6rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Eye size={12} className="text-accent" aria-hidden="true" />
              390×844 모바일 스크롤 가독성 점수: {currentScrollView.overallReadabilityScore}점
            </span>
            <span className="text-[0.58rem] text-accent">
              {currentScrollView.cliffhangerScrollHookKo}
            </span>
          </div>
          <p className="text-fg-2">{currentScrollView.sCurveContinuitySummaryKo}</p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentScrollView.cutDiagnostics.slice(0, 4).map((diag) => (
              <li
                key={diag.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.58rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{diag.cutNumber} · {diag.eyePathPattern}
                  </span>
                  <span className="text-accent">여백 {diag.recommendedGutterAfterPx}px</span>
                </div>
                <div className="text-fg-3">{diag.bubbleRelocationHint}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 탭 2: 에피소드 컬러 스크립트 & 4레이어 조명 디렉터 */}
      {activeMode === "color-script" ? (
        <div
          data-testid="panel-color-script"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2 text-[0.6rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Palette size={12} className="text-accent" aria-hidden="true" />
              에피소드 컬러 아크 (전환점: 컷 #{currentColorView.emotionalTurningPointCutNumber})
            </span>
          </div>
          <p className="text-fg-2">{currentColorView.episodeArcColorSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {currentColorView.cutDirectives.slice(0, 4).map((dir) => (
              <div
                key={dir.cutNumber}
                className="flex flex-col gap-1 rounded border border-line bg-card p-1.5 text-[0.58rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{dir.cutNumber} ({dir.timeOfDay})
                  </span>
                  <span className="text-accent">
                    {dir.kelvinTemperature}K · Multiply {dir.l3CelMultiplyOpacityPct}%
                  </span>
                </div>
                <div className="flex items-center gap-1" aria-label={`컷 ${dir.cutNumber} 컬러 스와치`}>
                  {[
                    dir.bgSkyHex,
                    dir.bgGroundHex,
                    dir.keyLightHex,
                    dir.fillShadowHex,
                    dir.rimAccentHex,
                    dir.l4VectorInkColorHoldHex,
                  ].map((hex, i) => (
                    <span
                      key={`${dir.cutNumber}-${i}`}
                      title={hex}
                      style={{ backgroundColor: hex }}
                      className="h-3.5 w-6 rounded border border-line"
                    />
                  ))}
                </div>
                <span className="text-fg-3">{dir.moodTransitionNoteKo}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 3: 설정 연속성 · 180도 카메라 축 · 복선 회수 감수기 */}
      {activeMode === "continuity-foreshadow" ? (
        <div
          data-testid="panel-continuity-foreshadow"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2 text-[0.6rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <GitCompare size={12} className="text-accent" aria-hidden="true" />
              설정 연속성 건강도: {currentContinuityView.continuityHealthScore}점
            </span>
          </div>
          <p className="text-fg-2">{currentContinuityView.executiveSummaryKo}</p>
          <ul className="flex flex-col gap-1">
            {currentContinuityView.conflicts.map((conf, idx) => (
              <li
                key={`${conf.cutNumber}-${idx}`}
                className="rounded border border-line bg-card px-2 py-1 text-[0.58rem]"
              >
                <strong className="text-accent">
                  컷 #{conf.cutNumber} [{conf.category}]
                </strong>
                : {conf.conflictDescriptionKo} →{" "}
                <span className="font-semibold text-fg">{conf.concreteFixSuggestionKo}</span>
              </li>
            ))}
          </ul>
          {currentContinuityView.foreshadowPayoffs[0] ? (
            <div className="rounded border border-accent bg-accent-soft px-2 py-1 text-[0.58rem] text-fg">
              <strong className="text-accent">
                복선 회수 제안 (컷 #{currentContinuityView.foreshadowPayoffs[0].recommendedCutNumber}):
              </strong>{" "}
              {currentContinuityView.foreshadowPayoffs[0].suggestedVisualDetailKo} ·{" "}
              {currentContinuityView.foreshadowPayoffs[0].suggestedSubtextLineKo}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 탭 4: 다각도 표정·포즈 매트릭스 & 효과음(SFX)·말풍선 오케스트레이터 */}
      {activeMode === "acting-sfx" ? (
        <div
          data-testid="panel-acting-sfx"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2 text-[0.6rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Volume2 size={12} className="text-accent" aria-hidden="true" />
              젠버스 다각도 캐릭터 시트 & 투닝 SFX 오케스트레이션
            </span>
          </div>
          <p className="text-fg-2">{currentActingView.genvasConsistencySummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentActingView.cutChoreographies.slice(0, 4).map((chor) => (
              <div
                key={chor.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.58rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{chor.cutNumber} [{chor.characterName}] · {chor.expressionPresetId}
                  </span>
                  <span className="text-accent">
                    SFX: {chor.sfxTextKo} ({chor.sfxRomanized})
                  </span>
                </div>
                <div className="text-fg-2">{chor.microExpressionNoteKo}</div>
                <div className="text-fg-3">
                  말풍선({chor.bubbleFrameKind}) · 회전 {chor.sfxRotationDeg}° · 배율{" "}
                  {chor.sfxScaleMultiplier}x
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 5: 다중 등장인물·조연·엑스트라 제복/문장(Crest) 복식 규율 일관성 디렉터 */}
      {activeMode === "multi-character-wardrobe-lock" ? (
        <div
          data-testid="panel-multi-character-wardrobe-lock"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2 text-[0.6rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <ShieldCheck size={12} className="text-accent" aria-hidden="true" />
              다중 인물·군중 제복/문장(Crest) 규율 준수도: {currentWardrobeView.wardrobeComplianceScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentWardrobeView.factionUniformSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {currentWardrobeView.castUniformSpecs.map((spec) => (
              <div
                key={spec.characterOrGroupRole}
                className="rounded border border-line bg-card px-2 py-1 text-[0.58rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>{spec.characterOrGroupRole}</span>
                  <span className="text-accent">
                    {spec.primaryFabricHex} / {spec.trimAndCrestHex}
                  </span>
                </div>
                <div className="text-fg-2">{spec.factionAndRankKo}</div>
                <div className="text-fg-3">{spec.insigniaPlacementRuleKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 6: 컷간 날씨(비·눈·안개)·젖은 모발/의상·그림자 길이 물리 연속성 고정기 */}
      {activeMode === "weather-time-progression-lock" ? (
        <div
          data-testid="panel-weather-time-progression-lock"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2 text-[0.6rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <CloudRain size={12} className="text-accent" aria-hidden="true" />
              날씨·젖은 모발/의상·그림자 길이 연속성 점수: {currentWeatherView.weatherContinuityScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentWeatherView.atmosphericArcSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentWeatherView.cutWeatherLocks.slice(0, 4).map((w) => (
              <div
                key={w.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.58rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{w.cutNumber} (+{w.elapsedMinutesFromStart}분 · {w.weatherState})
                  </span>
                  <span className="text-accent">
                    젖음 {w.hairAndClothWetnessPct}% · 그림자 {w.groundShadowLengthRatio}x
                  </span>
                </div>
                <div className="text-fg-3">{w.readyWeatherStageLine}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        data-testid="wave15-17-consistency-quick-bar"
        className="flex flex-col gap-1.5 rounded border border-accent/25 bg-raised/40 p-2 text-[0.58rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-fg">
            Wave 15~17 300대 플랫폼 REA & 6대 초정밀 작붕 방지 가드 (단추/칼라 · 성흔 UV · 소환수 비례 · 실내 평면도 · 무대사 호흡 · 역광 SSS)
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
            300 Platforms · 80 Routed Tasks
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            data-testid="wave15-collar-tie-lock-btn"
            onClick={async () => {
              const env = await runClaudeCollarTieLapelNecklineLockDirector(assistInput);
              const line = env.report.readyNecklineGuardLine || buildLocalCollarTieLapelNecklineLockReport(assistInput).readyNecklineGuardLine;
              onApplyScript(scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line);
            }}
            className={cn("rounded border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            칼라·단추·크라바트 잠금
          </button>
          <button
            type="button"
            data-testid="wave15-tattoo-stigma-uv-btn"
            onClick={async () => {
              const env = await runClaudeTattooStigmaUvTopologyLockDirector(assistInput);
              const line = env.report.readyStigmaUvGuardLine || buildLocalTattooStigmaUvTopologyLockReport(assistInput).readyStigmaUvGuardLine;
              onApplyScript(scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line);
            }}
            className={cn("rounded border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            문신·성흔 UV 곡면 잠금
          </button>
          <button
            type="button"
            data-testid="wave15-companion-scale-btn"
            onClick={async () => {
              const env = await runClaudeCompanionFamiliarScaleLockDirector(assistInput);
              const line = env.report.readyCompanionGuardLine || buildLocalCompanionFamiliarScaleLockReport(assistInput).readyCompanionGuardLine;
              onApplyScript(scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line);
            }}
            className={cn("rounded border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            소환수·신수 체구/뿔 잠금
          </button>
          <button
            type="button"
            data-testid="wave15-interior-geography-btn"
            onClick={async () => {
              const env = await runClaudeInteriorRoomGeographyLockDirector(assistInput);
              const line = env.report.readyRoomGeographyGuardLine || buildLocalInteriorRoomGeographyLockReport(assistInput).readyRoomGeographyGuardLine;
              onApplyScript(scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line);
            }}
            className={cn("rounded border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            실내 평면도·문 경첩 잠금
          </button>
          <button
            type="button"
            data-testid="wave15-silent-beat-rhythm-btn"
            onClick={async () => {
              const env = await runClaudeScrollPaceSilentBeatRhythmDirector(assistInput);
              const line = env.report.readySilentBeatGuardLine || buildLocalScrollPaceSilentBeatRhythmReport(assistInput).readySilentBeatGuardLine;
              onApplyScript(scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line);
            }}
            className={cn("rounded border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            무대사 여운 픽셀 호흡
          </button>
          <button
            type="button"
            data-testid="wave15-sss-tear-specular-btn"
            onClick={async () => {
              const env = await runClaudeSubsurfaceScatteringTearSpecularLockDirector(assistInput);
              const line = env.report.readySssTearGuardLine || buildLocalSubsurfaceScatteringTearSpecularLockReport(assistInput).readySssTearGuardLine;
              onApplyScript(scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line);
            }}
            className={cn("rounded border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            역광 피하산란(SSS)·눈물 굴절
          </button>
        </div>
      </div>

      <StudioWebtoonEpisodicDoctorPanel
        assistInput={assistInput}
        onAppendDirectionLine={(line) => {
          const nextScript = scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line;
          onApplyScript(nextScript);
        }}
      />

      <StudioCompetitorFullSuitePanel
        assistInput={assistInput}
        onAppendDirectionLine={(line) => {
          const nextScript = scriptInput.trim() ? `${scriptInput.trim()}\n${line}` : line;
          onApplyScript(nextScript);
        }}
      />
    </div>
  );
}
