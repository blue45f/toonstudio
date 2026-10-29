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

import {
  BookOpen,
  Box,
  Brush,
  Compass,
  Eye,
  Film,
  Layers,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { summarizeCreatorModelRouterCatalog } from "./assist/assist-creator-model-router";
import {
  buildLocalAsymmetricCostumePropWoundLedgerReport,
  buildLocalCameraAxisEyelineHeightLockReport,
  buildLocalCrossCutColorScriptAlbedoLockReport,
  buildLocalGlimnaviColorHintReport,
  buildLocalMangaFlowIdentityVerificationReport,
  buildLocalMicroExpressionActingContinuityReport,
  buildLocalNovelAdaptationAndIpExpansionReport,
  buildLocalNovelAiMultiCharVibeReport,
  buildLocalSnaptoon3dEnvironmentShaderReport,
  buildLocalToonCrafterInbetweenAndStitchReport,
  runAssistAsymmetricCostumePropWoundLedgerDirector,
  runAssistCameraAxisEyelineHeightLockDirector,
  runAssistCrossCutColorScriptAlbedoLockDirector,
  runAssistGlimnaviColorHintStrokeDirector,
  runAssistMangaFlowIdentityVerificationDirector,
  runAssistMicroExpressionActingContinuityDirector,
  runAssistNovelAdaptationAndIpExpansionDirector,
  runAssistNovelAiMultiCharVibeDirector,
  runAssistSnaptoon3dEnvironmentShaderDirector,
  runAssistToonCrafterInbetweenAndStitchDirector,
  type AsymmetricCostumePropWoundLedgerReport,
  type CameraAxisEyelineHeightLockReport,
  type CrossCutColorScriptAlbedoLockReport,
  type GlimnaviColorHintReport,
  type MangaFlowIdentityVerificationReport,
  type MicroExpressionActingContinuityReport,
  type NovelAdaptationAndIpExpansionReport,
  type NovelAiMultiCharVibeReport,
  type Phase6EcosystemEnvelope,
  type Snaptoon3dEnvironmentShaderReport,
  type ToonCrafterInbetweenAndStitchReport,
} from "./assist/assist-phase6-ecosystem-suite";
import type { WebtoonProductionAssistInput } from "./assist/assist-webtoon-production-schemas";

export type Phase6EcosystemTabId =
  | "novelai-multi-char-vibe"
  | "mangaflow-identity-audit"
  | "glimnavi-color-hint"
  | "snaptoon-acon3d-shader"
  | "culturetoon-osmu-adaptation"
  | "tooncrafter-krita-stitch"
  | "asymmetric-costume-wound-ledger"
  | "camera-axis-eyeline-height-lock"
  | "cross-cut-color-albedo-lock"
  | "micro-expression-acting-continuity";

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
  {
    id: "asymmetric-costume-wound-ledger",
    labelKo: "비대칭 복식·흉터·무기 비례·부상 원장",
    badgeKo: "좌우반전 0% 일관성",
    tierBadgeKo: "Sonnet 5.5",
  },
  {
    id: "camera-axis-eyeline-height-lock",
    labelKo: "180° 시선 축 · 다중 인물 키 차이 락",
    badgeKo: "공간·신장 일관성",
    tierBadgeKo: "Opus 5.5",
  },
  {
    id: "cross-cut-color-albedo-lock",
    labelKo: "컷간 피부·의상 고유색(Albedo) 고정기",
    badgeKo: "Delta-E 컬러스크립트",
    tierBadgeKo: "Haiku 5.5",
  },
  {
    id: "micro-expression-acting-continuity",
    labelKo: "FACS 미세 표정 · 시선 궤적 연속성",
    badgeKo: "감정선 관성 액팅",
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
  const [asymLedgerEnv, setAsymLedgerEnv] =
    useState<Phase6EcosystemEnvelope<AsymmetricCostumePropWoundLedgerReport> | null>(null);
  const [cameraAxisEnv, setCameraAxisEnv] =
    useState<Phase6EcosystemEnvelope<CameraAxisEyelineHeightLockReport> | null>(null);
  const [colorAlbedoEnv, setColorAlbedoEnv] =
    useState<Phase6EcosystemEnvelope<CrossCutColorScriptAlbedoLockReport> | null>(null);
  const [microExprEnv, setMicroExprEnv] =
    useState<Phase6EcosystemEnvelope<MicroExpressionActingContinuityReport> | null>(null);

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
  const localAsymLedger = useMemo(
    () => buildLocalAsymmetricCostumePropWoundLedgerReport(assistInput),
    [assistInput],
  );
  const localCameraAxis = useMemo(
    () => buildLocalCameraAxisEyelineHeightLockReport(assistInput),
    [assistInput],
  );
  const localColorAlbedo = useMemo(
    () => buildLocalCrossCutColorScriptAlbedoLockReport(assistInput),
    [assistInput],
  );
  const localMicroExpr = useMemo(
    () => buildLocalMicroExpressionActingContinuityReport(assistInput),
    [assistInput],
  );

  const activeNovelAi = novelAiEnv?.report ?? localNovelAi;
  const activeMangaFlow = mangaFlowEnv?.report ?? localMangaFlow;
  const activeGlimnavi = glimnaviEnv?.report ?? localGlimnavi;
  const activeSnaptoon = snaptoonEnv?.report ?? localSnaptoon;
  const activeAdaptation = adaptationEnv?.report ?? localAdaptation;
  const activeToonCrafter = toonCrafterEnv?.report ?? localToonCrafter;
  const activeAsymLedger = asymLedgerEnv?.report ?? localAsymLedger;
  const activeCameraAxis = cameraAxisEnv?.report ?? localCameraAxis;
  const activeColorAlbedo = colorAlbedoEnv?.report ?? localColorAlbedo;
  const activeMicroExpr = microExprEnv?.report ?? localMicroExpr;

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
              : activeTab === "tooncrafter-krita-stitch"
                ? toonCrafterEnv
                : activeTab === "asymmetric-costume-wound-ledger"
                  ? asymLedgerEnv
                  : activeTab === "camera-axis-eyeline-height-lock"
                    ? cameraAxisEnv
                    : activeTab === "cross-cut-color-albedo-lock"
                      ? colorAlbedoEnv
                      : microExprEnv;

  async function handleRunCurrentEngine() {
    if (isRunning) return;
    setIsRunning(true);
    try {
      if (activeTab === "novelai-multi-char-vibe") {
        setNovelAiEnv(await runAssistNovelAiMultiCharVibeDirector(assistInput));
      } else if (activeTab === "mangaflow-identity-audit") {
        setMangaFlowEnv(await runAssistMangaFlowIdentityVerificationDirector(assistInput));
      } else if (activeTab === "glimnavi-color-hint") {
        setGlimnaviEnv(await runAssistGlimnaviColorHintStrokeDirector(assistInput));
      } else if (activeTab === "snaptoon-acon3d-shader") {
        setSnaptoonEnv(await runAssistSnaptoon3dEnvironmentShaderDirector(assistInput));
      } else if (activeTab === "culturetoon-osmu-adaptation") {
        setAdaptationEnv(await runAssistNovelAdaptationAndIpExpansionDirector(assistInput));
      } else if (activeTab === "tooncrafter-krita-stitch") {
        setToonCrafterEnv(await runAssistToonCrafterInbetweenAndStitchDirector(assistInput));
      } else if (activeTab === "asymmetric-costume-wound-ledger") {
        setAsymLedgerEnv(await runAssistAsymmetricCostumePropWoundLedgerDirector(assistInput));
      } else if (activeTab === "camera-axis-eyeline-height-lock") {
        setCameraAxisEnv(await runAssistCameraAxisEyelineHeightLockDirector(assistInput));
      } else if (activeTab === "cross-cut-color-albedo-lock") {
        setColorAlbedoEnv(await runAssistCrossCutColorScriptAlbedoLockDirector(assistInput));
      } else {
        setMicroExprEnv(await runAssistMicroExpressionActingContinuityDirector(assistInput));
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
              {activeEnvelope.source === "claude-live" ? "AI 실시간" : "로컬 결정적 폴백"}
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

      {/* 탭 7: 비대칭 복식·흉터·무기 파지 비례·부상 누적 연속성 원장 */}
      {activeTab === "asymmetric-costume-wound-ledger" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <ShieldAlert className="mr-1 inline size-3 text-accent" />
              비대칭 복식·흉터·무기 비례·부상 원장 (좌우 일관성{" "}
              {activeAsymLedger.chiralityConsistencyScore}% · 미러링 0% 보장:{" "}
              {activeAsymLedger.zeroMirrorFlipGuarantee ? "ON" : "OFF"})
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[비대칭 복식·흉터·부상 락] ${activeAsymLedger.ledgerSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeAsymLedger.ledgerSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {activeAsymLedger.ledgerItems.map((item) => (
              <div key={item.itemId} className="rounded border border-line bg-panel/80 p-1.5">
                <div className="font-semibold text-fg">
                  {item.characterName} ({item.anatomicalAnchorSide}) · {item.featureCategory}
                </div>
                <div className="text-fg-2">{item.canonicalSpecKo}</div>
                <div className="text-fg-3">비례: {item.weaponToHandScaleRatio}</div>
                <div className="font-mono text-[9px] text-accent">{item.persistencePromptLock}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 8: 180도 시선 축·다중 인물 키 차이·원근 소실점 일관성 감독 */}
      {activeTab === "camera-axis-eyeline-height-lock" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Compass className="mr-1 inline size-3 text-accent" />
              180° 시선 축 & 다중 인물 키 차이({activeCameraAxis.canonicalHeightDeltaCm}cm) 고정 (축
              침범 {activeCameraAxis.axis180ViolationCount}건)
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[180° 카메라 축·신장비 락] ${activeCameraAxis.spatialContinuitySummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeCameraAxis.spatialContinuitySummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeCameraAxis.cutAxisAudits.map((audit) => (
              <div key={audit.cutNumber} className="rounded border border-line bg-panel/80 p-1.5">
                <div className="font-semibold text-fg">
                  #{audit.cutNumber}컷 좌:{audit.leftScreenCharacter} / 우:
                  {audit.rightScreenCharacter} · 체감 키차이 {audit.heightDeltaApparentCm}cm
                </div>
                <div className="text-fg-3">{audit.spatialCorrectionGuideKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 9: 컷간 피부톤·의상 고유색(Albedo) 드리프트 방지 고정기 */}
      {activeTab === "cross-cut-color-albedo-lock" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Palette className="mr-1 inline size-3 text-accent" />
              컷간 피부톤·의상 고유색(Albedo) 드리프트 방지 (최대 Delta-E:{" "}
              {activeColorAlbedo.maxDeltaEDrift})
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[컷간 고유색 Albedo 락] ${activeColorAlbedo.sceneLightingKelvinsSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeColorAlbedo.sceneLightingKelvinsSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeColorAlbedo.colorLocks.map((lock, idx) => (
              <div
                key={`${lock.characterOrPropName}-${idx}`}
                className="flex items-center justify-between rounded border border-line bg-panel/80 p-1.5"
              >
                <div>
                  <div className="font-semibold text-fg">
                    {lock.characterOrPropName} · {lock.partLabelKo}
                  </div>
                  <div className="text-fg-3">
                    고유색 {lock.albedoBaseHex} · 그림자 {lock.shadowMultiplyHex} · 조명{" "}
                    {lock.lightingKelvinK}K
                  </div>
                </div>
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px]">
                  {lock.renderedApparentHex}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 10: 컷간 미세 표정(FACS 근육)·시선 궤적·호흡 감정선 연속성 디렉터 */}
      {activeTab === "micro-expression-acting-continuity" ? (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-card/40 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              <Eye className="mr-1 inline size-3 text-accent" />
              컷간 미세 표정(FACS 근육)·시선 궤적 연속성 (감정 일관성{" "}
              {activeMicroExpr.emotionalContinuityScore}% · 급발진 0% 보장)
            </span>
            <button
              type="button"
              onClick={() =>
                onAppendDirectionLine(
                  `[FACS 미세표정·시선 락] ${activeMicroExpr.actingArcSummaryKo}`,
                )
              }
              className="rounded border border-line bg-panel px-2 py-0.5 text-[9px] font-medium text-fg-2 hover:text-fg"
            >
              콘티 지시문에 추가
            </button>
          </div>
          <p className="text-fg-2">{activeMicroExpr.actingArcSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeMicroExpr.microExpressionBeats.map((beat) => (
              <div
                key={`${beat.cutNumber}-${beat.characterName}`}
                className="rounded border border-line bg-panel/80 p-1.5"
              >
                <div className="font-semibold text-fg">
                  #{beat.cutNumber}컷 {beat.characterName} · {beat.facsActionUnits}
                </div>
                <div className="text-fg-3">
                  동공: {beat.pupilConstrictionLevel} · 시선: {beat.gazeTrajectoryKo}
                </div>
                <div className="font-mono text-[9px] text-accent">{beat.actingPromptLock}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
