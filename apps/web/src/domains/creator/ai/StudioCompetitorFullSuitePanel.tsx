/**
 * StudioCompetitorFullSuitePanel.tsx
 *
 * REA(reverse-engineer-anything) 정적/의무 원장 분석 및 2025~2026 13대 글로벌·국내 웹툰 AI 경쟁사
 * 벤치마크를 통해 추가된 5대 차세대 프로덕션 AI 워크벤치:
 * - 탭 1: 크림 AiD & 클립스튜디오 5.0 스케치→벡터 선화 & 4레이어 분리 디렉터
 * - 탭 2: Komiko AI & LlamaGen 30+ 화풍 스타일 트랜스퍼 & 3D 리라이팅 디렉터
 * - 탭 3: SkyReels & Mootion 33종 표정 매트릭스 & 사쿠가 모션웹툰/숏폼 키프레임 디렉터
 * - 탭 4: 클립스튜디오 5.0 & Posemaniacs 3D 핸드·헤드 & 카툰 LT 리그 디렉터
 * - 탭 5: Katalist.ai & Anifusion 시나리오 액션 비트 분해 & FLUX/Animagine LoRA 브리지
 */

import {
  Box,
  Brush,
  Clapperboard,
  Compass,
  Cpu,
  Hand,
  Layers,
  MessageSquare,
  Sparkles,
  Swords,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  buildLocal3dHandHeadPoseAndLtRig,
  buildLocalActionWeaponMotionArcSmearLock,
  buildLocalBackgroundPerspectivePropScaleLock,
  buildLocalSakugaMotionAndFacialMatrix,
  buildLocalScreenplayBeatAndLoraLock,
  buildLocalSketchToLineartLayerSplit,
  buildLocalSpeechBubbleTailOcclusionLock,
  buildLocalStyleTransferAndRelighting,
  buildLocalTurnaroundOrthographicSheetLock,
  runAssist3dHandHeadPoseAndLtRigDirector,
  runAssistActionWeaponMotionArcDirector,
  runAssistBackgroundPerspectivePropScaleDirector,
  runAssistSakugaMotionAndFacialMatrixDirector,
  runAssistScreenplayBeatAndLoraLockBridge,
  runAssistSketchToLineartLayerSplitter,
  runAssistSpeechBubbleTailOcclusionDirector,
  runAssistStyleTransferAndRelightingDirector,
  runAssistTurnaroundOrthographicSheetDirector,
  type Assist3dHandHeadRigReport,
  type AssistActionWeaponMotionArcReport,
  type AssistBackgroundPerspectiveReport,
  type AssistSakugaMotionReport,
  type AssistScreenplayLoraBridgeReport,
  type AssistSketchToLineartReport,
  type AssistSpeechBubbleTailOcclusionReport,
  type AssistStyleTransferReport,
  type AssistTurnaroundOrthographicReport,
  type CompetitorEngineExecutionMeta,
  type WebtoonStyleTransferPresetId,
} from "./assist/assist-competitor-full-suite";
import type { WebtoonProductionAssistInput } from "./assist/assist-webtoon-production-schemas";
import { StudioPhase6EcosystemSuitePanel } from "./StudioPhase6EcosystemSuitePanel";
import { StudioRea15PlatformsWorkbenchPanel } from "./StudioRea15PlatformsWorkbenchPanel";

export type CompetitorSuiteTabId =
  | "aid-lineart-splitter"
  | "komiko-style-relighting"
  | "skyreels-sakuga-motion"
  | "csp5-3d-hand-head-lt"
  | "katalist-anifusion-lora"
  | "turnaround-orthographic-sheet"
  | "background-perspective-scale"
  | "speech-bubble-tail-occlusion"
  | "action-weapon-motion-arc";

export interface StudioCompetitorFullSuitePanelProps {
  readonly assistInput: WebtoonProductionAssistInput;
  readonly onAppendDirectionLine: (line: string) => void;
}

const SUITE_TABS: readonly {
  readonly id: CompetitorSuiteTabId;
  readonly labelKo: string;
  readonly benchmarkBadgeKo: string;
}[] = [
  {
    id: "aid-lineart-splitter",
    labelKo: "스케치→선화 4레이어 분리",
    benchmarkBadgeKo: "Cream AiD · CSP 5.0",
  },
  {
    id: "komiko-style-relighting",
    labelKo: "30+ 화풍 & 3D 리라이팅",
    benchmarkBadgeKo: "Komiko AI · LlamaGen",
  },
  {
    id: "skyreels-sakuga-motion",
    labelKo: "33종 표정 · 사쿠가 모션웹툰",
    benchmarkBadgeKo: "SkyReels · Mootion",
  },
  {
    id: "csp5-3d-hand-head-lt",
    labelKo: "3D 핸드·헤드 & LT 리그",
    benchmarkBadgeKo: "Clip Studio 5.0 · Posemaniacs",
  },
  {
    id: "katalist-anifusion-lora",
    labelKo: "액션 비트 & LoRA 브리지",
    benchmarkBadgeKo: "Katalist.ai · Anifusion",
  },
  {
    id: "turnaround-orthographic-sheet",
    labelKo: "360° 5뷰 정투영 턴어라운드",
    benchmarkBadgeKo: "5-View Orthographic Lock",
  },
  {
    id: "background-perspective-scale",
    labelKo: "3D 배경 투시 · 발 접지 스케일",
    benchmarkBadgeKo: "3D Vanishing Point & Foot AO",
  },
  {
    id: "speech-bubble-tail-occlusion",
    labelKo: "말풍선·SFX 안면 비가림 & 꼬리 락",
    benchmarkBadgeKo: "Anti-Occlusion & Tail Vector",
  },
  {
    id: "action-weapon-motion-arc",
    labelKo: "검격·마법 궤적 & 잔상(Smear) 락",
    benchmarkBadgeKo: "Motion Arc & Hit-Stop Lock",
  },
];

const STYLE_PRESETS: readonly {
  readonly id: WebtoonStyleTransferPresetId;
  readonly labelKo: string;
}[] = [
  { id: "rofan-watercolor-glow", labelKo: "로판 소프트 수채화·글로우" },
  { id: "webtoon-pop-cel", labelKo: "웹툰 팝 고채도 셀채색" },
  { id: "noir-high-contrast-ink", labelKo: "느와르 고대비 잉크·림라이트" },
  { id: "classic-bw-screentone", labelKo: "정통 흑백 만화 스크린톤" },
  { id: "cyberpunk-neon-rim", labelKo: "SF 사이버펑크 네온 림" },
  { id: "martial-arts-brush-wash", labelKo: "정통 무협 수묵 담채" },
];

export function StudioCompetitorFullSuitePanel({
  assistInput,
  onAppendDirectionLine,
}: StudioCompetitorFullSuitePanelProps) {
  const [activeTab, setActiveTab] = useState<CompetitorSuiteTabId>("aid-lineart-splitter");
  const [selectedStylePreset, setSelectedStylePreset] =
    useState<WebtoonStyleTransferPresetId>("rofan-watercolor-glow");
  const [isRunning, setIsRunning] = useState(false);

  const [lineartMeta, setLineartMeta] =
    useState<CompetitorEngineExecutionMeta<AssistSketchToLineartReport> | null>(null);
  const [styleMeta, setStyleMeta] =
    useState<CompetitorEngineExecutionMeta<AssistStyleTransferReport> | null>(null);
  const [sakugaMeta, setSakugaMeta] =
    useState<CompetitorEngineExecutionMeta<AssistSakugaMotionReport> | null>(null);
  const [rigMeta, setRigMeta] =
    useState<CompetitorEngineExecutionMeta<Assist3dHandHeadRigReport> | null>(null);
  const [bridgeMeta, setBridgeMeta] =
    useState<CompetitorEngineExecutionMeta<AssistScreenplayLoraBridgeReport> | null>(null);
  const [turnaroundMeta, setTurnaroundMeta] =
    useState<CompetitorEngineExecutionMeta<AssistTurnaroundOrthographicReport> | null>(null);
  const [perspectiveMeta, setPerspectiveMeta] =
    useState<CompetitorEngineExecutionMeta<AssistBackgroundPerspectiveReport> | null>(null);
  const [bubbleOcclusionMeta, setBubbleOcclusionMeta] =
    useState<CompetitorEngineExecutionMeta<AssistSpeechBubbleTailOcclusionReport> | null>(null);
  const [motionArcMeta, setMotionArcMeta] =
    useState<CompetitorEngineExecutionMeta<AssistActionWeaponMotionArcReport> | null>(null);

  const localLineart = useMemo(
    () => buildLocalSketchToLineartLayerSplit(assistInput),
    [assistInput],
  );
  const localStyle = useMemo(
    () => buildLocalStyleTransferAndRelighting(assistInput, selectedStylePreset),
    [assistInput, selectedStylePreset],
  );
  const localSakuga = useMemo(
    () => buildLocalSakugaMotionAndFacialMatrix(assistInput),
    [assistInput],
  );
  const localRig = useMemo(
    () => buildLocal3dHandHeadPoseAndLtRig(assistInput),
    [assistInput],
  );
  const localBridge = useMemo(
    () => buildLocalScreenplayBeatAndLoraLock(assistInput),
    [assistInput],
  );
  const localTurnaround = useMemo(
    () => buildLocalTurnaroundOrthographicSheetLock(assistInput),
    [assistInput],
  );
  const localPerspective = useMemo(
    () => buildLocalBackgroundPerspectivePropScaleLock(assistInput),
    [assistInput],
  );
  const localBubbleOcclusion = useMemo(
    () => buildLocalSpeechBubbleTailOcclusionLock(assistInput),
    [assistInput],
  );
  const localMotionArc = useMemo(
    () => buildLocalActionWeaponMotionArcSmearLock(assistInput),
    [assistInput],
  );

  const currentLineart = lineartMeta?.report ?? localLineart;
  const currentStyle = styleMeta?.report ?? localStyle;
  const currentSakuga = sakugaMeta?.report ?? localSakuga;
  const currentRig = rigMeta?.report ?? localRig;
  const currentBridge = bridgeMeta?.report ?? localBridge;
  const currentTurnaround = turnaroundMeta?.report ?? localTurnaround;
  const currentPerspective = perspectiveMeta?.report ?? localPerspective;
  const currentBubbleOcclusion = bubbleOcclusionMeta?.report ?? localBubbleOcclusion;
  const currentMotionArc = motionArcMeta?.report ?? localMotionArc;

  const activeExecutionMeta =
    activeTab === "aid-lineart-splitter"
      ? lineartMeta
      : activeTab === "komiko-style-relighting"
        ? styleMeta
        : activeTab === "skyreels-sakuga-motion"
          ? sakugaMeta
          : activeTab === "csp5-3d-hand-head-lt"
            ? rigMeta
            : activeTab === "katalist-anifusion-lora"
              ? bridgeMeta
              : activeTab === "turnaround-orthographic-sheet"
                ? turnaroundMeta
                : activeTab === "background-perspective-scale"
                  ? perspectiveMeta
                  : activeTab === "speech-bubble-tail-occlusion"
                    ? bubbleOcclusionMeta
                    : motionArcMeta;

  const handleRunActiveClaudeEngine = async () => {
    setIsRunning(true);
    try {
      if (activeTab === "aid-lineart-splitter") {
        setLineartMeta(await runAssistSketchToLineartLayerSplitter(assistInput));
      } else if (activeTab === "komiko-style-relighting") {
        setStyleMeta(
          await runAssistStyleTransferAndRelightingDirector(assistInput, {
            preferredPreset: selectedStylePreset,
          }),
        );
      } else if (activeTab === "skyreels-sakuga-motion") {
        setSakugaMeta(await runAssistSakugaMotionAndFacialMatrixDirector(assistInput));
      } else if (activeTab === "csp5-3d-hand-head-lt") {
        setRigMeta(await runAssist3dHandHeadPoseAndLtRigDirector(assistInput));
      } else if (activeTab === "katalist-anifusion-lora") {
        setBridgeMeta(await runAssistScreenplayBeatAndLoraLockBridge(assistInput));
      } else if (activeTab === "turnaround-orthographic-sheet") {
        setTurnaroundMeta(await runAssistTurnaroundOrthographicSheetDirector(assistInput));
      } else if (activeTab === "background-perspective-scale") {
        setPerspectiveMeta(await runAssistBackgroundPerspectivePropScaleDirector(assistInput));
      } else if (activeTab === "speech-bubble-tail-occlusion") {
        setBubbleOcclusionMeta(await runAssistSpeechBubbleTailOcclusionDirector(assistInput));
      } else {
        setMotionArcMeta(await runAssistActionWeaponMotionArcDirector(assistInput));
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleAppendActiveLine = () => {
    if (activeTab === "aid-lineart-splitter") {
      const first = currentLineart.cutSpecs[0];
      onAppendDirectionLine(
        `[AiD 선화·4레이어 분리] 외곽 ${first?.outerSilhouetteStrokeMm ?? 0.6}mm / 내부 ${first?.innerCreaseStrokeMm ?? 0.2}mm · ${first?.vectorIntersectionEraseRuleKo ?? ""}`,
      );
      return;
    }
    if (activeTab === "komiko-style-relighting") {
      const first = currentStyle.cutDirectives[0];
      onAppendDirectionLine(
        `[Komiko 화풍·리라이팅] ${currentStyle.selectedStyleFamilyKo} · ${first?.relightingDirectiveKo ?? ""}`,
      );
      return;
    }
    if (activeTab === "skyreels-sakuga-motion") {
      const first = currentSakuga.keyframes[0];
      onAppendDirectionLine(
        `[SkyReels 표정·사쿠가 모션] ${first?.expressionMatrixCode ?? "EXP-01"} (${first?.facsActionUnitsKo ?? ""}) · ${first?.shortForm9x16CropGuideKo ?? ""}`,
      );
      return;
    }
    if (activeTab === "csp5-3d-hand-head-lt") {
      const first = currentRig.cutRigs[0];
      onAppendDirectionLine(
        `[CSP 5.0 3D 핸드·헤드 & LT] ${first?.handPosePresetKo ?? ""} · ${first?.riggingGuideKo ?? ""}`,
      );
      return;
    }
    if (activeTab === "katalist-anifusion-lora") {
      const first = currentBridge.actionBeats[0];
      onAppendDirectionLine(
        `[Katalist·Anifusion 브리지] ${first?.actionBeatSummaryKo ?? ""} · ${first?.castAngleLockSpecKo ?? ""} (${first?.modelRouterTarget ?? "flux-1-dev-webtoon-lora"})`,
      );
      return;
    }
    if (activeTab === "turnaround-orthographic-sheet") {
      const first = currentTurnaround.views[0];
      onAppendDirectionLine(
        `[360° 5뷰 정투영 턴어라운드] ${currentTurnaround.characterName} (${first?.headToBodyRatio ?? 7.5}등신) · ${first?.orthographicLockDirectiveKo ?? ""}`,
      );
      return;
    }
    if (activeTab === "background-perspective-scale") {
      const first = currentPerspective.cutLocks[0];
      onAppendDirectionLine(
        `[3D 배경 투시·발 접지 락] ${first?.vanishingPointMode ?? "2-point-architectural"} (FOV ${first?.cameraFovMm ?? 35}mm) · ${first?.footContactShadowSpecKo ?? ""}`,
      );
      return;
    }
    if (activeTab === "speech-bubble-tail-occlusion") {
      const first = currentBubbleOcclusion.cutBubbleLocks[0];
      onAppendDirectionLine(
        `[말풍선·SFX 비가림 락] ${first?.speakerName ?? "서진"} (${first?.safeAnchorZone ?? "top-left-sky-margin"}) · ${first?.antiOcclusionDirectiveKo ?? ""}`,
      );
      return;
    }
    const first = currentMotionArc.cutArcs[0];
    onAppendDirectionLine(
      `[검격·마법 궤적 & 잔상 락] ${first?.actionPhase ?? "slash-release-smear"} (${first?.entryVectorAngleDeg ?? -45}°→${first?.exitVectorAngleDeg ?? 135}°) · ${first?.arcContinuityDirectiveKo ?? ""}`,
    );
  };

  return (
    <div
      data-testid="studio-competitor-full-suite-panel"
      className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5 text-[0.6rem]"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-fg">
          <Cpu size={12} className="text-accent" aria-hidden="true" />
          REA 경쟁사 역공학 기반 5대 신기능 스위트 (AiD · Komiko · SkyReels · CSP 5.0 · Katalist/Anifusion)
        </span>
        <span
          data-testid="competitor-suite-engine-badge"
          className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.56rem] font-bold text-accent"
        >
          {activeExecutionMeta?.source === "claude-live"
            ? `Claude Opus 실시간 (${activeExecutionMeta.modelUsed})`
            : "로컬 결정적 프리뷰 + Opus 실시간 대기"}
        </span>
      </div>

      {/* 5대 탭 스위처 */}
      <div
        role="tablist"
        aria-label="경쟁사 벤치마크 5대 확장 AI 엔진 선택"
        className="grid grid-cols-2 gap-1 sm:grid-cols-5"
      >
        {SUITE_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`competitor-suite-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded border px-2 py-1 text-left",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-raised text-fg-2 hover:bg-card",
              )}
            >
              <span className="text-[0.58rem] font-bold">{tab.labelKo}</span>
              <span className="text-[0.52rem] text-fg-3">{tab.benchmarkBadgeKo}</span>
            </button>
          );
        })}
      </div>

      {/* 실행 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded bg-raised px-2 py-1.5">
        <span className="text-[0.57rem] text-fg-2">
          활성 벤치마크 엔진:{" "}
          <strong className="text-accent">
            {SUITE_TABS.find((t) => t.id === activeTab)?.benchmarkBadgeKo}
          </strong>
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-testid="run-claude-competitor-suite-btn"
            disabled={isRunning}
            onClick={() => void handleRunActiveClaudeEngine()}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.58rem] font-bold text-accent hover:bg-card disabled:opacity-50",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <Wand2 size={10} aria-hidden="true" />
            {isRunning ? "Claude Opus 분석 중..." : "Claude Opus 실시간 분석"}
          </button>
          <button
            type="button"
            data-testid="append-competitor-suite-line-btn"
            onClick={handleAppendActiveLine}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-line bg-card px-2 py-0.5 text-[0.58rem] font-semibold text-fg-2 hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <Sparkles size={10} aria-hidden="true" />
            지시문 원고에 추가
          </button>
        </div>
      </div>

      {/* 탭 1: 크림 AiD & CSP 5.0 스케치→벡터 선화 & 4레이어 분리 */}
      {activeTab === "aid-lineart-splitter" ? (
        <div
          data-testid="suite-panel-aid-lineart-splitter"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Layers size={11} className="text-accent" aria-hidden="true" />
              크림 AiD 벡터 선화 & 4레이어 자동 분리
            </span>
            <span className="text-accent">
              펜선 시간 단축 추정: {currentLineart.inkingTimeReductionEstPct}%
            </span>
          </div>
          <p className="text-fg-2">{currentLineart.artistBrushDnaSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentLineart.cutSpecs.slice(0, 4).map((spec) => (
              <div
                key={spec.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>컷 #{spec.cutNumber} 필압 계층</span>
                  <span className="text-accent">
                    외곽 {spec.outerSilhouetteStrokeMm}mm / 내선 {spec.innerCreaseStrokeMm}mm
                  </span>
                </div>
                <div className="text-fg-2">{spec.vectorIntersectionEraseRuleKo}</div>
                <div className="text-fg-3">
                  분리 레이어: {spec.separatedLayers.map((l) => l.layerCode).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 2: Komiko AI & LlamaGen 30+ 화풍 트랜스퍼 & 3D 리라이팅 */}
      {activeTab === "komiko-style-relighting" ? (
        <div
          data-testid="suite-panel-komiko-style-relighting"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Brush size={11} className="text-accent" aria-hidden="true" />
              {currentStyle.selectedStyleFamilyKo}
            </span>
            <select
              aria-label="화풍 스타일 프리셋 선택"
              data-testid="komiko-style-preset-select"
              value={selectedStylePreset}
              onChange={(e) =>
                setSelectedStylePreset(e.target.value as WebtoonStyleTransferPresetId)
              }
              className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.56rem] text-fg"
            >
              {STYLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.labelKo}
                </option>
              ))}
            </select>
          </div>
          <p className="text-fg-2">{currentStyle.ocUniverseConsistencyRuleKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentStyle.cutDirectives.slice(0, 4).map((dir) => (
              <div
                key={dir.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>컷 #{dir.cutNumber} 리라이팅</span>
                  <span className="text-accent">
                    선화 보존 {dir.lineartPreservationPct}% · {dir.colorTemperatureKelvin}K
                  </span>
                </div>
                <div className="text-fg-2">{dir.relightingDirectiveKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 3: SkyReels & Mootion 33종 표정 매트릭스 & 사쿠가 모션웹툰 */}
      {activeTab === "skyreels-sakuga-motion" ? (
        <div
          data-testid="suite-panel-skyreels-sakuga-motion"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Clapperboard size={11} className="text-accent" aria-hidden="true" />
              SkyReels 33종 표정 매트릭스 & 사쿠가 모션 타임라인
            </span>
            <span className="text-accent">
              트레일러 총 길이: {currentSakuga.totalTrailerDurationSec}초
            </span>
          </div>
          <p className="text-fg-2">{currentSakuga.facialMatrixSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentSakuga.keyframes.slice(0, 4).map((kf) => (
              <div
                key={kf.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{kf.cutNumber} · {kf.expressionMatrixCode}
                  </span>
                  <span className="text-accent">
                    {kf.durationSec}s · 동공 수축 {kf.pupilConstrictionPct}%
                  </span>
                </div>
                <div className="text-fg-2">{kf.facsActionUnitsKo}</div>
                <div className="text-fg-3">{kf.shortForm9x16CropGuideKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 4: 클립스튜디오 5.0 3D 핸드·헤드 & 카툰 LT 리그 */}
      {activeTab === "csp5-3d-hand-head-lt" ? (
        <div
          data-testid="suite-panel-csp5-3d-hand-head-lt"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Hand size={11} className="text-accent" aria-hidden="true" />
              CSP 5.0 3D 핸드·헤드 관절 & Posemaniacs LT 리그
            </span>
          </div>
          <p className="text-fg-2">{currentRig.anatomyRigSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentRig.cutRigs.slice(0, 4).map((rig) => (
              <div
                key={rig.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>컷 #{rig.cutNumber} · 투시 {rig.posemaniacsForeshorteningRatio}x</span>
                  <span className="text-accent">
                    Pitch {rig.headPitchDeg}° / Yaw {rig.headYawDeg}° / Roll {rig.headRollDeg}°
                  </span>
                </div>
                <div className="text-fg-2">{rig.handPosePresetKo}</div>
                <div className="text-fg-3">{rig.riggingGuideKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 5: Katalist.ai & Anifusion 시나리오 비트 분해 & LoRA 브리지 */}
      {activeTab === "katalist-anifusion-lora" ? (
        <div
          data-testid="suite-panel-katalist-anifusion-lora"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span>Katalist 액션 비트 & Anifusion LoRA · REA 의무 원장 브리지</span>
            <span className="text-accent">
              파이프라인 호환성: {currentBridge.pipelineCompatibilityScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentBridge.mcpBridgeSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentBridge.actionBeats.slice(0, 4).map((beat) => (
              <div
                key={beat.beatIndex}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    비트 #{beat.beatIndex} ({beat.panelGridTemplate})
                  </span>
                  <span className="text-accent">
                    {beat.modelRouterTarget} (LoRA {beat.loraWeight})
                  </span>
                </div>
                <div className="text-fg-2">{beat.actionBeatSummaryKo}</div>
                <div className="text-fg-3">
                  {beat.castAngleLockSpecKo} · REA `{beat.reaObligationId}`
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 6: 360° 5뷰 정투영 턴어라운드 시트 락 */}
      {activeTab === "turnaround-orthographic-sheet" ? (
        <div
          data-testid="suite-panel-turnaround-orthographic-sheet"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Compass size={11} className="text-accent" aria-hidden="true" />
              360° 5뷰(0°·45°·90°·270°·180°) 정투영 등신대 & 비대칭 장신구 락
            </span>
            <span className="text-accent">
              정투영 일관성 점수: {currentTurnaround.orthographicConsistencyScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentTurnaround.turnaroundSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentTurnaround.views.map((view) => (
              <div
                key={view.viewAngle}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    {view.viewAngle} · {view.headToBodyRatio}등신
                  </span>
                  <span className="text-accent">
                    어깨 {view.shoulderWidthHeadUnits}두신 · 골반 Y {view.pelvisLineYRatioPct}%
                  </span>
                </div>
                <div className="text-fg-2">노출: {view.visibleAsymmetricAnchorKo}</div>
                <div className="text-fg-3">차폐: {view.occludedFeaturesKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 7: 3D 배경 투시 그리드 & 2D 인물 발 접지 스케일 감독 */}
      {activeTab === "background-perspective-scale" ? (
        <div
          data-testid="suite-panel-background-perspective-scale"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Box size={11} className="text-accent" aria-hidden="true" />
              3D 배경 소실점(1/2/3점) ↔ 2D 인물 발 접지(Foot Contact AO) · 소품 스케일 감독
            </span>
            <span className="text-accent">
              공간 투시 정합성: {currentPerspective.perspectiveAlignmentScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentPerspective.spatialIntegrationSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentPerspective.cutLocks.slice(0, 4).map((lock) => (
              <div
                key={lock.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{lock.cutNumber} ({lock.vanishingPointMode})
                  </span>
                  <span className="text-accent">
                    지평선 Y {lock.horizonLineYRatioPct}% · FOV {lock.cameraFovMm}mm
                  </span>
                </div>
                <div className="text-fg-2">{lock.footContactShadowSpecKo}</div>
                <div className="text-fg-3">{lock.propScaleRatioAnchorKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 8: 말풍선·효과음(SFX) 안면 비가림 & 화자 입 방향 꼬리 벡터 고정기 */}
      {activeTab === "speech-bubble-tail-occlusion" ? (
        <div
          data-testid="suite-panel-speech-bubble-tail-occlusion"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={11} className="text-accent" aria-hidden="true" />
              말풍선·SFX 안면/눈빛 비가림(Anti-Occlusion) & 입 방향 꼬리 벡터 락
            </span>
            <span className="text-accent">
              비가림 안전도: {currentBubbleOcclusion.antiOcclusionHealthScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentBubbleOcclusion.letteringSpatialSummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentBubbleOcclusion.cutBubbleLocks.slice(0, 4).map((b) => (
              <div
                key={b.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{b.cutNumber} [{b.speakerName}] · {b.safeAnchorZone}
                  </span>
                  <span className="text-accent">
                    안면 가림 {b.faceAndEyeOcclusionPct}% · 꼬리 {b.tailTargetMouthAngleDeg}°
                  </span>
                </div>
                <div className="text-fg-2">{b.antiOcclusionDirectiveKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 9: 검격·마법 궤적(Motion Arc) 연속성 & 잔상(Smear) 감독 */}
      {activeTab === "action-weapon-motion-arc" ? (
        <div
          data-testid="suite-panel-action-weapon-motion-arc"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Swords size={11} className="text-accent" aria-hidden="true" />
              검격·마법·타격 궤적(Motion Arc) 연속성 · 잔상(Smear) · 역경직(Hit-Stop) 감독
            </span>
            <span className="text-accent">
              궤적 연속성 점수: {currentMotionArc.kineticContinuityScore}%
            </span>
          </div>
          <p className="text-fg-2">{currentMotionArc.combatChoreographySummaryKo}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {currentMotionArc.cutArcs.slice(0, 4).map((arc) => (
              <div
                key={arc.cutNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.56rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    컷 #{arc.cutNumber} ({arc.actionPhase})
                  </span>
                  <span className="text-accent">
                    {arc.entryVectorAngleDeg}° → {arc.exitVectorAngleDeg}° · Smear {arc.smearStretchRatio}x
                  </span>
                </div>
                <div className="text-fg-2">{arc.arcContinuityDirectiveKo}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <StudioPhase6EcosystemSuitePanel
        assistInput={assistInput}
        onAppendDirectionLine={onAppendDirectionLine}
      />

      <StudioRea15PlatformsWorkbenchPanel
        assistInput={assistInput}
        onAppendDirectionLine={onAppendDirectionLine}
      />
    </div>
  );
}
