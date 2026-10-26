/**
 * StudioRea15PlatformsWorkbenchPanel.tsx
 *
 * Phase 7 글로벌·국내 15대 웹툰 AI 보조 플랫폼 REA 심층 역공학(기능·라우트·UI/UX 디자인 토큰) 및 창의적 AI 워크벤치:
 * - 상단: 15대 플랫폼 REA UI/UX 디자인 토큰 탐색기 (실제 캡처 evidence_id · sha256 · 컬러 팔레트 · 라우트 · 프리뷰)
 * - 탭 1: 그림나비(GlimNavi) Studio v2.3 5종 선화·6종 프리셋·컬러 분리·Relight 디렉터 (`claude-haiku-5-5`)
 * - 탭 2: 카이스토리(KAISTORY) 4단 단일 데이터 엔벨로프 & KAION 웹툰 학습카드·독자 퀴즈 (`claude-sonnet-5-5`)
 * - 탭 3: Snaptoon·Frameo 스포트라이트 콘·NAVER SHAPER 3D 직접 드로잉·Plask/Posemaniacs (`claude-sonnet-5-5`)
 * - 탭 4: ManhwaAI 6대 화풍/5대 톤·Komiko 레이어 분리/인비트윈·Anifusion 노드 플로우 (`claude-sonnet-5-5`)
 * - 탭 5: [창의적 AI] 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & UI/UX 테마 합성기 (`claude-opus-5-5`)
 */

import { Activity, Box, GraduationCap, Layers, Palette, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  buildLocalCreativeDopamineAndUxSynthesizerReport,
  buildLocalGlimnaviRelightAndLineartV23Report,
  buildLocalKaistorySingleEnvelopeAndKaionReport,
  buildLocalManhwaKomikoAnifusionFlowReport,
  buildLocalSnaptoonFrameoShaper3dDirectorReport,
  getRea15PlatformTheme,
  listRea15PlatformThemes,
  runCreativeDopamineAndUxSynthesizerAssist,
  runGlimnaviRelightAndLineartV23Assist,
  runKaistorySingleEnvelopeAndKaionAssist,
  runManhwaKomikoAnifusionFlowAssist,
  runSnaptoonFrameoShaper3dDirectorAssist,
  type CreativeDopamineAndUxSynthesizerReport,
  type GlimnaviRelightAndLineartV23Report,
  type KaistorySingleEnvelopeAndKaionReport,
  type ManhwaKomikoAnifusionFlowReport,
  type Rea15Envelope,
  type Rea15PlatformId,
  type SnaptoonFrameoShaper3dDirectorReport,
} from "./claude/claude-rea15-webtoon-ecosystem-suite";
import type { WebtoonProductionAssistInput } from "./claude/claude-webtoon-production-schemas";

export type Rea15WorkbenchTabId =
  | "glimnavi-relight-v23"
  | "kaistory-envelope-kaion"
  | "snaptoon-frameo-shaper-3d"
  | "manhwa-komiko-anifusion"
  | "creative-dopamine-ux";

export interface StudioRea15PlatformsWorkbenchPanelProps {
  readonly assistInput: WebtoonProductionAssistInput;
  readonly onAppendDirectionLine: (line: string) => void;
}

const REA15_TABS: readonly {
  readonly id: Rea15WorkbenchTabId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly tierBadgeKo: string;
}[] = [
  {
    id: "glimnavi-relight-v23",
    labelKo: "선화 v1.0~v2.3 · 컬러 분리 · Relight",
    badgeKo: "그림나비 Studio v2.3",
    tierBadgeKo: "Haiku 5.5",
  },
  {
    id: "kaistory-envelope-kaion",
    labelKo: "4단 단일 엔벨로프 · KAION 학습 퀴즈",
    badgeKo: "KAISTORY · KAITOON",
    tierBadgeKo: "Sonnet 5.5",
  },
  {
    id: "snaptoon-frameo-shaper-3d",
    labelKo: "3D 스포트라이트 콘 · SHAPER 직접 드로잉",
    badgeKo: "Snaptoon · Frameo · SHAPER",
    tierBadgeKo: "Sonnet 5.5",
  },
  {
    id: "manhwa-komiko-anifusion",
    labelKo: "6화풍/5톤 · 레이어 분리 · 노드 플로우",
    badgeKo: "ManhwaAI · Komiko · Anifusion",
    tierBadgeKo: "Sonnet 5.5",
  },
  {
    id: "creative-dopamine-ux",
    labelKo: "독자 도파민 히트맵 · UI 테마 합성기",
    badgeKo: "창의적 AI 특화",
    tierBadgeKo: "Opus 5.5",
  },
];

export function StudioRea15PlatformsWorkbenchPanel({
  assistInput,
  onAppendDirectionLine,
}: StudioRea15PlatformsWorkbenchPanelProps) {
  const [selectedPlatformId, setSelectedPlatformId] = useState<Rea15PlatformId>("glimnavi");
  const [activeTab, setActiveTab] = useState<Rea15WorkbenchTabId>("glimnavi-relight-v23");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedQuizChoice, setSelectedQuizChoice] = useState<Record<string, number>>({});

  const [glimnaviEnv, setGlimnaviEnv] =
    useState<Rea15Envelope<GlimnaviRelightAndLineartV23Report> | null>(null);
  const [kaistoryEnv, setKaistoryEnv] =
    useState<Rea15Envelope<KaistorySingleEnvelopeAndKaionReport> | null>(null);
  const [snaptoon3dEnv, setSnaptoon3dEnv] =
    useState<Rea15Envelope<SnaptoonFrameoShaper3dDirectorReport> | null>(null);
  const [manhwaFlowEnv, setManhwaFlowEnv] =
    useState<Rea15Envelope<ManhwaKomikoAnifusionFlowReport> | null>(null);
  const [dopamineUxEnv, setDopamineUxEnv] =
    useState<Rea15Envelope<CreativeDopamineAndUxSynthesizerReport> | null>(null);

  const platformThemes = useMemo(() => listRea15PlatformThemes(), []);
  const activePlatformTheme = useMemo(
    () => getRea15PlatformTheme(selectedPlatformId),
    [selectedPlatformId],
  );

  const currentGlimnavi = useMemo(
    () => glimnaviEnv?.report ?? buildLocalGlimnaviRelightAndLineartV23Report(assistInput),
    [glimnaviEnv, assistInput],
  );
  const currentKaistory = useMemo(
    () => kaistoryEnv?.report ?? buildLocalKaistorySingleEnvelopeAndKaionReport(assistInput),
    [kaistoryEnv, assistInput],
  );
  const currentSnaptoon3d = useMemo(
    () => snaptoon3dEnv?.report ?? buildLocalSnaptoonFrameoShaper3dDirectorReport(assistInput),
    [snaptoon3dEnv, assistInput],
  );
  const currentManhwaFlow = useMemo(
    () => manhwaFlowEnv?.report ?? buildLocalManhwaKomikoAnifusionFlowReport(assistInput),
    [manhwaFlowEnv, assistInput],
  );
  const currentDopamineUx = useMemo(
    () =>
      dopamineUxEnv?.report ?? buildLocalCreativeDopamineAndUxSynthesizerReport(assistInput),
    [dopamineUxEnv, assistInput],
  );

  const activeEnvelope =
    activeTab === "glimnavi-relight-v23"
      ? glimnaviEnv
      : activeTab === "kaistory-envelope-kaion"
        ? kaistoryEnv
        : activeTab === "snaptoon-frameo-shaper-3d"
          ? snaptoon3dEnv
          : activeTab === "manhwa-komiko-anifusion"
            ? manhwaFlowEnv
            : dopamineUxEnv;

  const handleRunActiveTab = async () => {
    setIsRunning(true);
    try {
      if (activeTab === "glimnavi-relight-v23") {
        const res = await runGlimnaviRelightAndLineartV23Assist(assistInput);
        setGlimnaviEnv(res);
        onAppendDirectionLine(
          `[GlimNavi v2.3 (${res.modelUsed})] ${res.report.selectedLineartVersion} / ${res.report.selectedLineartPreset} · ${res.report.relightPass.relightDirectiveKo}`,
        );
      } else if (activeTab === "kaistory-envelope-kaion") {
        const res = await runKaistorySingleEnvelopeAndKaionAssist(assistInput);
        setKaistoryEnv(res);
        onAppendDirectionLine(
          `[KAISTORY & KAION (${res.modelUsed})] ${res.report.envelopeSummaryKo} (퀴즈 카드 ${res.report.kaionLearningCards.length}종 생성)`,
        );
      } else if (activeTab === "snaptoon-frameo-shaper-3d") {
        const res = await runSnaptoonFrameoShaper3dDirectorAssist(assistInput);
        setSnaptoon3dEnv(res);
        onAppendDirectionLine(
          `[Snaptoon·Frameo·SHAPER (${res.modelUsed})] ${res.report.frameoSpotlightShader.shortDramaTransitionRuleKo}`,
        );
      } else if (activeTab === "manhwa-komiko-anifusion") {
        const res = await runManhwaKomikoAnifusionFlowAssist(assistInput);
        setManhwaFlowEnv(res);
        onAppendDirectionLine(
          `[ManhwaAI·Komiko·Anifusion (${res.modelUsed})] 화풍 ${res.report.manhwaStylePreset} · 인비트윈 ${res.report.komikoLayerSplitterAndInbetween.inbetweenFrameCount}프레임 · 노드 ${res.report.anifusionNodeFlowGraph.length}개`,
        );
      } else {
        const res = await runCreativeDopamineAndUxSynthesizerAssist(assistInput);
        setDopamineUxEnv(res);
        onAppendDirectionLine(
          `[독자 도파민 & UI 합성기 (${res.modelUsed})] 도파민 피크 ${res.report.overallDopaminePeakScore}점 · 완독률 ${res.report.predictedEpisodeCompletionRatePct}% · 테마 '${res.report.synthesizedUiUxTheme.themeTitleKo}'`,
        );
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
            Phase 7 · 15대 웹툰 AI 플랫폼 REA UI/UX 디자인 토큰 & 창의적 AI 워크벤치
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.54rem] font-semibold text-accent">
            17 브라우저 캡처 · 112만 AST 노드 검증
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

      {/* 15대 플랫폼 UI/UX 디자인 토큰 탐색기 */}
      <div
        data-testid="rea15-ui-token-inspector"
        className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-fg">
            15대 웹툰 AI 플랫폼 REA 디자인 토큰 & 라우트 인스펙터
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

      {/* 5대 AI 엔진 탭 네비게이션 */}
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
    </div>
  );
}
