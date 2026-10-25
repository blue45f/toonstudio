/**
 * StudioPhase6EcosystemSuitePanel.tsx
 *
 * Phase 6 글로벌·국내 20대 웹툰/만화 AI 경쟁사 생태계 내재화 워크벤치 (신규 6대 AI 엔진 + Task-Aware Smart Model Router 표시):
 * - 탭 1: NovelAI V4.5/V5 다중 캐릭터 X/Y 공간 좌표 분리 & Vibe Transfer 디렉터 (`claude-sonnet-5-5`)
 * - 탭 2: MangaFlow Studio & DiffSensei 캐릭터 동일성(ArcFace) & 말풍선 꼬리 벡터 디렉터 (`claude-sonnet-5-5`)
 * - 탭 3: 그림나비(Glimnavi) 휴먼인더루프 브러시 컬러 힌트 스트로크 자동 채색 디렉터 (`claude-haiku-5-5`)
 * - 탭 4: 스냅툰(Snaptoon) & 에이콘3D(ACON3D) 3D 배경 툰셰이더·환경광 디렉터 (`claude-haiku-5-5`)
 * - 탭 5: 더컬쳐툰·마이닝5000·Storyflow 웹소설→웹툰 각색 & 2차 IP OSMU 스코어카드 (`claude-opus-5-5`)
 * - 탭 6: ToonCrafter/AniDoc 인비트윈 동화 보간 & Krita/Comistitch 무한 캔버스 스티칭 (`claude-sonnet-5-5`)
 */

import { BookOpen, Box, Brush, Film, Layers, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { summarizeCreatorModelRouterCatalog } from "./claude/claude-creator-model-router";
import {
  buildLocalGlimnaviColorHintReport,
  buildLocalMangaFlowIdentityVerificationReport,
  buildLocalNovelAdaptationAndIpExpansionReport,
  buildLocalNovelAiMultiCharVibeReport,
  buildLocalSnaptoon3dEnvironmentShaderReport,
  buildLocalToonCrafterInbetweenAndStitchReport,
  runClaudeGlimnaviColorHintStrokeDirector,
  runClaudeMangaFlowIdentityVerificationDirector,
  runClaudeNovelAdaptationAndIpExpansionDirector,
  runClaudeNovelAiMultiCharVibeDirector,
  runClaudeSnaptoon3dEnvironmentShaderDirector,
  runClaudeToonCrafterInbetweenAndStitchDirector,
  type GlimnaviColorHintReport,
  type MangaFlowIdentityVerificationReport,
  type NovelAdaptationAndIpExpansionReport,
  type NovelAiMultiCharVibeReport,
  type Phase6EcosystemEnvelope,
  type Snaptoon3dEnvironmentShaderReport,
  type ToonCrafterInbetweenAndStitchReport,
} from "./claude/claude-phase6-ecosystem-suite";
import type { WebtoonProductionAssistInput } from "./claude/claude-webtoon-production-schemas";

export type Phase6EcosystemTabId =
  | "novelai-multi-char-vibe"
  | "mangaflow-identity-audit"
  | "glimnavi-color-hint"
  | "snaptoon-acon3d-shader"
  | "culturetoon-osmu-adaptation"
  | "tooncrafter-krita-stitch";

export interface StudioPhase6EcosystemSuitePanelProps {
  readonly assistInput: WebtoonProductionAssistInput;
  readonly onAppendDirectionLine: (line: string) => void;
}

const PHASE6_TABS: readonly {
  readonly id: Phase6EcosystemTabId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly tierBadgeKo: string;
}[] = [
  {
    id: "novelai-multi-char-vibe",
    labelKo: "다중 캐릭터 좌표 · Vibe Transfer",
    badgeKo: "NovelAI V4.5/V5",
    tierBadgeKo: "Sonnet 5.5",
  },
  {
    id: "mangaflow-identity-audit",
    labelKo: "ArcFace 동일성 · 말풍선 꼬리 벡터",
    badgeKo: "MangaFlow · DiffSensei",
    tierBadgeKo: "Sonnet 5.5",
  },
  {
    id: "glimnavi-color-hint",
    labelKo: "브러시 컬러 힌트 · Close-Gap 채색",
    badgeKo: "그림나비(Glimnavi)",
    tierBadgeKo: "Haiku 5.5",
  },
  {
    id: "snaptoon-acon3d-shader",
    labelKo: "3D 배경 툰셰이더 · 창문 발광",
    badgeKo: "스냅툰 · ACON3D",
    tierBadgeKo: "Haiku 5.5",
  },
  {
    id: "culturetoon-osmu-adaptation",
    labelKo: "웹소설 각색 · 2차 IP OSMU",
    badgeKo: "더컬쳐툰 · 마이닝5000",
    tierBadgeKo: "Opus 5.5",
  },
  {
    id: "tooncrafter-krita-stitch",
    labelKo: "인비트윈 동화 · Comistitch 분할",
    badgeKo: "ToonCrafter · Krita",
    tierBadgeKo: "Sonnet 5.5",
  },
];

export function StudioPhase6EcosystemSuitePanel({
  assistInput,
  onAppendDirectionLine,
}: StudioPhase6EcosystemSuitePanelProps) {
  const [activeTab, setActiveTab] = useState<Phase6EcosystemTabId>("novelai-multi-char-vibe");
  const [isRunning, setIsRunning] = useState(false);

  const [novelAiEnv, setNovelAiEnv] =
    useState<Phase6EcosystemEnvelope<NovelAiMultiCharVibeReport> | null>(null);
  const [mangaFlowEnv, setMangaFlowEnv] =
    useState<Phase6EcosystemEnvelope<MangaFlowIdentityVerificationReport> | null>(null);
  const [glimnaviEnv, setGlimnaviEnv] =
    useState<Phase6EcosystemEnvelope<GlimnaviColorHintReport> | null>(null);
  const [snaptoonEnv, setSnaptoonEnv] =
    useState<Phase6EcosystemEnvelope<Snaptoon3dEnvironmentShaderReport> | null>(null);
  const [adaptationEnv, setAdaptationEnv] =
    useState<Phase6EcosystemEnvelope<NovelAdaptationAndIpExpansionReport> | null>(null);
  const [toonCrafterEnv, setToonCrafterEnv] =
    useState<Phase6EcosystemEnvelope<ToonCrafterInbetweenAndStitchReport> | null>(null);

  const routerSummary = useMemo(() => summarizeCreatorModelRouterCatalog(), []);
  const localNovelAi = useMemo(() => buildLocalNovelAiMultiCharVibeReport(assistInput), [assistInput]);
  const localMangaFlow = useMemo(
    () => buildLocalMangaFlowIdentityVerificationReport(assistInput),
    [assistInput],
  );
  const localGlimnavi = useMemo(() => buildLocalGlimnaviColorHintReport(assistInput), [assistInput]);
  const localSnaptoon = useMemo(
    () => buildLocalSnaptoon3dEnvironmentShaderReport(assistInput),
    [assistInput],
  );
  const localAdaptation = useMemo(
    () => buildLocalNovelAdaptationAndIpExpansionReport(assistInput),
    [assistInput],
  );
  const localToonCrafter = useMemo(
    () => buildLocalToonCrafterInbetweenAndStitchReport(assistInput),
    [assistInput],
  );

  const activeNovelAi = novelAiEnv?.report ?? localNovelAi;
  const activeMangaFlow = mangaFlowEnv?.report ?? localMangaFlow;
  const activeGlimnavi = glimnaviEnv?.report ?? localGlimnavi;
  const activeSnaptoon = snaptoonEnv?.report ?? localSnaptoon;
  const activeAdaptation = adaptationEnv?.report ?? localAdaptation;
  const activeToonCrafter = toonCrafterEnv?.report ?? localToonCrafter;

  const activeEnvelope =
    activeTab === "novelai-multi-char-vibe"
      ? novelAiEnv
      : activeTab === "mangaflow-identity-audit"
        ? mangaFlowEnv
        : activeTab === "glimnavi-color-hint"
          ? glimnaviEnv
          : activeTab === "snaptoon-acon3d-shader"
            ? snaptoonEnv
            : activeTab === "culturetoon-osmu-adaptation"
              ? adaptationEnv
              : toonCrafterEnv;

  async function handleRunCurrentEngine() {
    if (isRunning) return;
    setIsRunning(true);
    try {
      if (activeTab === "novelai-multi-char-vibe") {
        setNovelAiEnv(await runClaudeNovelAiMultiCharVibeDirector(assistInput));
      } else if (activeTab === "mangaflow-identity-audit") {
        setMangaFlowEnv(await runClaudeMangaFlowIdentityVerificationDirector(assistInput));
      } else if (activeTab === "glimnavi-color-hint") {
        setGlimnaviEnv(await runClaudeGlimnaviColorHintStrokeDirector(assistInput));
      } else if (activeTab === "snaptoon-acon3d-shader") {
        setSnaptoonEnv(await runClaudeSnaptoon3dEnvironmentShaderDirector(assistInput));
      } else if (activeTab === "culturetoon-osmu-adaptation") {
        setAdaptationEnv(await runClaudeNovelAdaptationAndIpExpansionDirector(assistInput));
      } else {
        setToonCrafterEnv(await runClaudeToonCrafterInbetweenAndStitchDirector(assistInput));
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div
      data-testid="studio-phase6-ecosystem-suite-panel"
      className="mt-2.5 flex flex-col gap-2 rounded-lg border border-line bg-panel/95 p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-accent" />
          <span className="text-[11px] font-semibold text-fg">
            Phase 6 글로벌·국내 20대 웹툰 AI 생태계 확장 & 스마트 모델 라우터
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-accent">
            Haiku 5.5 ({routerSummary.byModel["claude-haiku-5-5"]}) · Sonnet 5.5 (
            {routerSummary.byModel["claude-sonnet-5-5"]}) · Opus 5.5 (
            {routerSummary.byModel["claude-opus-5-5"]})
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleRunCurrentEngine()}
          disabled={isRunning}
          data-testid="phase6-ecosystem-run-claude-btn"
          className={cn(
            "inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-semibold text-accent hover:bg-accent/25 disabled:opacity-50",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
        >
          <Wand2 className="size-3" />
          {isRunning ? "최적 티어 모델 추론 중…" : "기능별 최적 모델로 Claude 실행"}
        </button>
      </div>

      {/* 6개 생태계 엔진 탭 */}
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {PHASE6_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`phase6-ecosystem-tab-${tab.id}`}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded border px-2 py-1 text-left transition-colors",
                isSelected
                  ? "border-accent bg-accent/15 text-fg"
                  : "border-line bg-card/60 text-fg-2 hover:bg-card",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <span className="text-[10px] font-semibold leading-tight">{tab.labelKo}</span>
              <span className="text-[9px] text-fg-3">
                {tab.badgeKo} · <strong className="text-accent">{tab.tierBadgeKo}</strong>
              </span>
            </button>
          );
        })}
      </div>

      {activeEnvelope ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-accent/30 bg-accent/5 px-2 py-1 text-[10px] text-fg-2">
          <span>
            실행 소스:{" "}
            <strong className="text-fg">
              {activeEnvelope.source === "claude-live" ? "Claude Live API" : "로컬 결정적 폴백"}
            </strong>{" "}
            · 프로필: <code>{activeEnvelope.taskProfile}</code> · 모델:{" "}
            <code>{activeEnvelope.modelUsed}</code>
          </span>
          <span>
            토큰:{" "}
            {(
              activeEnvelope.usage.inputTokens + activeEnvelope.usage.outputTokens
            ).toLocaleString()}
            tok · 추정 비용: ${activeEnvelope.estimatedCostUsd.toFixed(4)}
          </span>
        </div>
      ) : null}

      {/* 탭 1: NovelAI V4.5/V5 */}
      {activeTab === "novelai-multi-char-vibe" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Layers className="mr-1 inline size-3 text-accent" />
              NovelAI V4.5/V5 다중 캐릭터 X/Y 공간 격리 (혼선 0% 보장:{" "}
              {activeNovelAi.attributeBleedingZeroGuarantee ? "ON" : "OFF"})
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[NovelAI V4.5/V5 다중 캐릭터 좌표·Vibe] ${activeNovelAi.sceneCompositionSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeNovelAi.sceneCompositionSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeNovelAi.characterRegions.map((region) => (
              <div
                key={region.characterName}
                className="rounded border border-line bg-panel/80 p-1.5"
              >
                <div className="font-semibold text-fg">
                  {region.characterName} ({region.roleLabelKo}) · X:[
                  {region.bboxNormalized.xMin.toFixed(2)}~{region.bboxNormalized.xMax.toFixed(2)}]
                </div>
                <div className="text-fg-3">Positive: {region.positiveAppearanceTags}</div>
                <div className="text-fg-3">Bleeding Guard: {region.negativeBleedingGuardTags}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 2: MangaFlow & DiffSensei */}
      {activeTab === "mangaflow-identity-audit" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <ShieldCheck className="mr-1 inline size-3 text-accent" />
              MangaFlow & DiffSensei 동일성 감사 (평균 ArcFace:{" "}
              {(activeMangaFlow.averageArcFaceScore * 100).toFixed(1)}% · 통과율:{" "}
              {activeMangaFlow.identityPassRatePct}%)
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[MangaFlow & DiffSensei 동일성] ${activeMangaFlow.diffSenseiAdapterSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeMangaFlow.diffSenseiAdapterSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {activeMangaFlow.cutAudits.map((audit) => (
              <div
                key={audit.cutNumber}
                className="rounded border border-line bg-panel/80 p-1.5"
              >
                <div className="font-semibold text-fg">
                  #{audit.cutNumber}컷 {audit.speakerName} · ArcFace{" "}
                  {(audit.arcFaceSimilarityScore * 100).toFixed(0)}%
                </div>
                <div className="text-fg-3">
                  말풍선({audit.balloonAnchorXY.x},{audit.balloonAnchorXY.y}) → 입(
                  {audit.speakerMouthTargetXY.x},{audit.speakerMouthTargetXY.y})
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 3: 그림나비 (Glimnavi) */}
      {activeTab === "glimnavi-color-hint" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Brush className="mr-1 inline size-3 text-accent" />
              그림나비(Glimnavi) 브러시 컬러 힌트 (Close-Gap: {activeGlimnavi.closeGapTolerancePx}px ·
              시간 절감 {activeGlimnavi.coloringTimeSavedEstPct}%)
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[그림나비 컬러 힌트 채색] ${activeGlimnavi.humanInTheLoopGuideKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeGlimnavi.humanInTheLoopGuideKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeGlimnavi.hintStrokes.map((stroke) => (
              <div
                key={stroke.strokeId}
                className="flex items-center justify-between rounded border border-line bg-panel/80 p-1.5"
              >
                <div>
                  <div className="font-semibold text-fg">{stroke.targetRegionLabelKo}</div>
                  <div className="text-fg-3">
                    레이어: {stroke.targetLayer} · 반경 {stroke.brushRadiusPx}px
                  </div>
                </div>
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px]">
                  {stroke.hexColor}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 4: 스냅툰 & ACON3D */}
      {activeTab === "snaptoon-acon3d-shader" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Box className="mr-1 inline size-3 text-accent" />
              스냅툰(Snaptoon) & 에이콘3D 배경 툰셰이더·환경광 디렉터
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[스냅툰·ACON3D 배경] ${activeSnaptoon.masterEnvironmentSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeSnaptoon.masterEnvironmentSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeSnaptoon.cutEnvironments.map((env) => (
              <div
                key={env.cutNumber}
                className="rounded border border-line bg-panel/80 p-1.5"
              >
                <div className="font-semibold text-fg">
                  #{env.cutNumber}컷 {env.acon3dAssetPackKo} ({env.timeOfDayPreset})
                </div>
                <div className="text-fg-3">
                  태양광 {env.sunAzimuthDeg}°/{env.sunElevationDeg}° · 창문발광{" "}
                  {env.windowGlowIntensity} · 신장 {env.characterHeadHeightMatchCm}cm
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 5: 더컬쳐툰·마이닝5000·Storyflow */}
      {activeTab === "culturetoon-osmu-adaptation" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <BookOpen className="mr-1 inline size-3 text-accent" />
              더컬쳐툰·마이닝5000 웹소설 각색 (독백 압축 {activeAdaptation.overallProseCompressionPct}
              % · {activeAdaptation.storyArchetype})
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[웹소설 각색·OSMU] ${activeAdaptation.narrativePacingVerdictKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeAdaptation.narrativePacingVerdictKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {activeAdaptation.osmuExpansionScores.map((osmu) => (
              <div
                key={osmu.mediaFormat}
                className="rounded border border-line bg-panel/80 p-1.5"
              >
                <div className="font-semibold text-fg">
                  {osmu.mediaFormat} · 적합도 {osmu.readinessScore}점
                </div>
                <div className="text-fg-3">{osmu.keySellingPointKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 6: ToonCrafter & Krita/Comistitch */}
      {activeTab === "tooncrafter-krita-stitch" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Film className="mr-1 inline size-3 text-accent" />
              ToonCrafter 인비트윈 동화 & Krita/Comistitch 안전 분할 (총 높이{" "}
              {activeToonCrafter.totalStitchedHeightPx.toLocaleString()}px)
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[ToonCrafter·Comistitch] ${activeToonCrafter.productionSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeToonCrafter.productionSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeToonCrafter.inbetweenBridges.map((bridge) => (
              <div
                key={bridge.bridgeId}
                className="rounded border border-line bg-panel/80 p-1.5"
              >
                <div className="font-semibold text-fg">
                  #{bridge.startKeyframeCut}→#{bridge.endKeyframeCut}컷 ({bridge.inbetweenFrameCount}
                  프레임 · {bridge.motionCurveType})
                </div>
                <div className="text-fg-3">{bridge.occlusionRepairGuideKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
