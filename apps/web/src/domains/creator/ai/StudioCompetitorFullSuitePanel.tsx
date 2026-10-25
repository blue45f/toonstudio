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

import { Brush, Clapperboard, Cpu, Hand, Layers, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  buildLocal3dHandHeadPoseAndLtRig,
  buildLocalSakugaMotionAndFacialMatrix,
  buildLocalScreenplayBeatAndLoraLock,
  buildLocalSketchToLineartLayerSplit,
  buildLocalStyleTransferAndRelighting,
  runClaude3dHandHeadPoseAndLtRigDirector,
  runClaudeSakugaMotionAndFacialMatrixDirector,
  runClaudeScreenplayBeatAndLoraLockBridge,
  runClaudeSketchToLineartLayerSplitter,
  runClaudeStyleTransferAndRelightingDirector,
  type Claude3dHandHeadRigReport,
  type ClaudeSakugaMotionReport,
  type ClaudeScreenplayLoraBridgeReport,
  type ClaudeSketchToLineartReport,
  type ClaudeStyleTransferReport,
  type CompetitorEngineExecutionMeta,
  type WebtoonStyleTransferPresetId,
} from "./claude/claude-competitor-full-suite";
import type { WebtoonProductionAssistInput } from "./claude/claude-webtoon-production-schemas";

export type CompetitorSuiteTabId =
  | "aid-lineart-splitter"
  | "komiko-style-relighting"
  | "skyreels-sakuga-motion"
  | "csp5-3d-hand-head-lt"
  | "katalist-anifusion-lora";

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
    useState<CompetitorEngineExecutionMeta<ClaudeSketchToLineartReport> | null>(null);
  const [styleMeta, setStyleMeta] =
    useState<CompetitorEngineExecutionMeta<ClaudeStyleTransferReport> | null>(null);
  const [sakugaMeta, setSakugaMeta] =
    useState<CompetitorEngineExecutionMeta<ClaudeSakugaMotionReport> | null>(null);
  const [rigMeta, setRigMeta] =
    useState<CompetitorEngineExecutionMeta<Claude3dHandHeadRigReport> | null>(null);
  const [bridgeMeta, setBridgeMeta] =
    useState<CompetitorEngineExecutionMeta<ClaudeScreenplayLoraBridgeReport> | null>(null);

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

  const currentLineart = lineartMeta?.report ?? localLineart;
  const currentStyle = styleMeta?.report ?? localStyle;
  const currentSakuga = sakugaMeta?.report ?? localSakuga;
  const currentRig = rigMeta?.report ?? localRig;
  const currentBridge = bridgeMeta?.report ?? localBridge;

  const activeExecutionMeta =
    activeTab === "aid-lineart-splitter"
      ? lineartMeta
      : activeTab === "komiko-style-relighting"
        ? styleMeta
        : activeTab === "skyreels-sakuga-motion"
          ? sakugaMeta
          : activeTab === "csp5-3d-hand-head-lt"
            ? rigMeta
            : bridgeMeta;

  const handleRunActiveClaudeEngine = async () => {
    setIsRunning(true);
    try {
      if (activeTab === "aid-lineart-splitter") {
        setLineartMeta(await runClaudeSketchToLineartLayerSplitter(assistInput));
      } else if (activeTab === "komiko-style-relighting") {
        setStyleMeta(
          await runClaudeStyleTransferAndRelightingDirector(assistInput, {
            preferredPreset: selectedStylePreset,
          }),
        );
      } else if (activeTab === "skyreels-sakuga-motion") {
        setSakugaMeta(await runClaudeSakugaMotionAndFacialMatrixDirector(assistInput));
      } else if (activeTab === "csp5-3d-hand-head-lt") {
        setRigMeta(await runClaude3dHandHeadPoseAndLtRigDirector(assistInput));
      } else {
        setBridgeMeta(await runClaudeScreenplayBeatAndLoraLockBridge(assistInput));
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
    const first = currentBridge.actionBeats[0];
    onAppendDirectionLine(
      `[Katalist·Anifusion 브리지] ${first?.actionBeatSummaryKo ?? ""} · ${first?.castAngleLockSpecKo ?? ""} (${first?.modelRouterTarget ?? "flux-1-dev-webtoon-lora"})`,
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
    </div>
  );
}
