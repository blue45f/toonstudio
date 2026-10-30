/**
 * StudioWebtoonEpisodicDoctorPanel.tsx
 *
 * Phase 2 차세대 웹툰 에피소드 AI 디렉터 워크벤치 패널:
 * 1. 대본 기반 독자 관점 연출 제안 (`reader-retention-simulator`)
 * 2. 캐릭터 말투·성격 캐붕(OOC) 레이더 & 3종 서브텍스트 대사 윤색기 (`character-ooc-radar`)
 * 3. 컷별 3D 배경·소품 에셋 배치 & 카메라 렌즈/심도(DoF)/안개 디렉터 (`bg3d-lighting-asset-director`)
 * 4. 웹툰 BGM · 폴리 효과음 · 오디오툰(보이스 드라마) 큐시트 디렉터 (`bgm-audiotoon-cuesheet`)
 */
import "@/shared/ai/assist/ai-assist-i18n";

import {
  Activity,
  Archive,
  Box,
  MessageSquareWarning,
  Music,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  buildDeterministicBg3dLightingAssetReport,
  buildDeterministicBgmAudioToonReport,
  buildDeterministicCharacterOocRadarReport,
  buildDeterministicCrowdDepthFogLockReport,
  buildDeterministicFootwearStrideLockReport,
  buildDeterministicMultiEpisodeCanonVaultReport,
  buildDeterministicReaderRetentionReport,
  buildDeterministicVisualContinuityLinterReport,
  runAssistWebtoonEpisodicDoctor,
  type AssistBg3dLightingAssetView,
  type AssistBgmAudioToonView,
  type AssistCharacterOocRadarView,
  type AssistCrowdDepthFogLockView,
  type AssistFootwearStrideLockView,
  type AssistMultiEpisodeCanonVaultView,
  type AssistReaderRetentionView,
  type AssistVisualContinuityLinterView,
  type WebtoonEpisodicDoctorMode,
} from "./assist/assist-webtoon-episodic-doctor";
import type { WebtoonProductionAssistInput } from "./assist/assist-webtoon-production-schemas";

import { useAssistTask } from "./assist/use-assist-task";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const EPISODIC_DOCTOR_TABS: readonly {
  readonly id: WebtoonEpisodicDoctorMode;
  readonly labelKo: string;
  readonly benchmarkBadgeKo: string;
}[] = [
  {
    id: "reader-retention-simulator",
    labelKo: "",
    benchmarkBadgeKo: "",
  },
  {
    id: "character-ooc-radar",
    labelKo: "캐릭터 말투 캐붕(OOC) 레이더",
    benchmarkBadgeKo: "오노마AI 페뷸레이터 · 캐논",
  },
  {
    id: "bg3d-lighting-asset-director",
    labelKo: "3D 배경 · 소품 · DoF 카메라",
    benchmarkBadgeKo: "리얼드로우 · 클립스튜디오 3D",
  },
  {
    id: "bgm-audiotoon-cuesheet",
    labelKo: "웹툰 BGM · 오디오툰 큐시트",
    benchmarkBadgeKo: "네이버웹툰 BGM · 보이스드라마",
  },
  {
    id: "episodic-visual-continuity-linter",
    labelKo: "컷간 작붕(흉터·검집·부상) 린터",
    benchmarkBadgeKo: "",
  },
  {
    id: "multi-episode-canon-memory-vault",
    labelKo: "장편 연재(1~100화) 캐논 볼트",
    benchmarkBadgeKo: "Sonnet 5.5 · 외형·호칭·떡밥",
  },
  {
    id: "episodic-footwear-floor-contact-stride-lock",
    labelKo: "신발 굽 · 계단 접지 보폭 잠금",
    benchmarkBadgeKo: "Haiku 5.5 · 공중부양 작붕 차단",
  },
  {
    id: "episodic-crowd-silhouette-depth-fog-lock",
    labelKo: "군중 엑스트라 · 대기원근 안개 잠금",
    benchmarkBadgeKo: "Sonnet 5.5 · 3단 선굵기 분리",
  },
];

export interface StudioWebtoonEpisodicDoctorPanelProps {
  readonly assistInput: WebtoonProductionAssistInput;
  readonly onAppendDirectionLine: (line: string) => void;
}

export function StudioWebtoonEpisodicDoctorPanel({
  assistInput,
  onAppendDirectionLine,
}: StudioWebtoonEpisodicDoctorPanelProps): ReactElement {
  const [activeMode, setActiveMode] = useState<WebtoonEpisodicDoctorMode>(
    "reader-retention-simulator",
  );
  const t = useT();
  const task = useAssistTask();
  const isRunningClaude = task.running;
  const inputRevision = JSON.stringify(assistInput);
  const resetTask = task.reset;

  const [liveRetentionView, setLiveRetentionView] =
    useState<AssistReaderRetentionView | null>(null);
  const [liveOocView, setLiveOocView] = useState<AssistCharacterOocRadarView | null>(null);
  const [liveBg3dView, setLiveBg3dView] = useState<AssistBg3dLightingAssetView | null>(null);
  const [liveBgmView, setLiveBgmView] = useState<AssistBgmAudioToonView | null>(null);
  const [liveLinterView, setLiveLinterView] =
    useState<AssistVisualContinuityLinterView | null>(null);
  const [liveCanonVaultView, setLiveCanonVaultView] =
    useState<AssistMultiEpisodeCanonVaultView | null>(null);
  const [liveFootwearView, setLiveFootwearView] =
    useState<AssistFootwearStrideLockView | null>(null);
  const [liveCrowdDepthView, setLiveCrowdDepthView] =
    useState<AssistCrowdDepthFogLockView | null>(null);

  const retentionView = useMemo(
    () => liveRetentionView ?? buildDeterministicReaderRetentionReport(assistInput),
    [assistInput, liveRetentionView],
  );
  const oocView = useMemo(
    () => liveOocView ?? buildDeterministicCharacterOocRadarReport(assistInput),
    [assistInput, liveOocView],
  );
  const bg3dView = useMemo(
    () => liveBg3dView ?? buildDeterministicBg3dLightingAssetReport(assistInput),
    [assistInput, liveBg3dView],
  );
  const bgmView = useMemo(
    () => liveBgmView ?? buildDeterministicBgmAudioToonReport(assistInput),
    [assistInput, liveBgmView],
  );
  const linterView = useMemo(
    () => liveLinterView ?? buildDeterministicVisualContinuityLinterReport(assistInput),
    [assistInput, liveLinterView],
  );
  const canonVaultView = useMemo(
    () => liveCanonVaultView ?? buildDeterministicMultiEpisodeCanonVaultReport(assistInput),
    [assistInput, liveCanonVaultView],
  );
  const footwearView = useMemo(
    () => liveFootwearView ?? buildDeterministicFootwearStrideLockReport(assistInput),
    [assistInput, liveFootwearView],
  );
  const crowdDepthView = useMemo(
    () => liveCrowdDepthView ?? buildDeterministicCrowdDepthFogLockReport(assistInput),
    [assistInput, liveCrowdDepthView],
  );

  // 입력이 바뀌면 이전 요청을 취소하고, 이전 대본의 결과가 새 대본에 섞이지 않게 한다.
  useEffect(() => {
    resetTask();
    setLiveRetentionView(null);
    setLiveOocView(null);
    setLiveBg3dView(null);
    setLiveBgmView(null);
    setLiveLinterView(null);
    setLiveCanonVaultView(null);
    setLiveFootwearView(null);
    setLiveCrowdDepthView(null);
  }, [inputRevision, resetTask]);

  const handleRunLiveClaudeDoctor = async () => {
    if (task.running) return;
    const result = await task.start(async (signal) => {
      const view = await runAssistWebtoonEpisodicDoctor(activeMode, assistInput, {
        signal,
        fallbackOnError: false,
      });
      // 로컬 예시는 실제 API 실험의 성공으로 취급하지 않는다.
      if (view.source !== "claude-live") throw new Error(t("aiAssist.episodic.failed"));
      return view;
    });
    if (!result) return;
    switch (result.mode) {
      case "reader-retention-simulator": setLiveRetentionView(result); break;
      case "character-ooc-radar": setLiveOocView(result); break;
      case "bg3d-lighting-asset-director": setLiveBg3dView(result); break;
      case "bgm-audiotoon-cuesheet": setLiveBgmView(result); break;
      case "episodic-visual-continuity-linter": setLiveLinterView(result); break;
      case "multi-episode-canon-memory-vault": setLiveCanonVaultView(result); break;
      case "episodic-footwear-floor-contact-stride-lock": setLiveFootwearView(result); break;
      case "episodic-crowd-silhouette-depth-fog-lock": setLiveCrowdDepthView(result); break;
    }
  };

  const activeSource =
    activeMode === "reader-retention-simulator"
      ? retentionView.source
      : activeMode === "character-ooc-radar"
        ? oocView.source
        : activeMode === "bg3d-lighting-asset-director"
          ? bg3dView.source
          : activeMode === "bgm-audiotoon-cuesheet"
            ? bgmView.source
            : activeMode === "episodic-visual-continuity-linter"
              ? linterView.source
              : activeMode === "multi-episode-canon-memory-vault"
                ? canonVaultView.source
                : activeMode === "episodic-footwear-floor-contact-stride-lock"
                  ? footwearView.source
                  : crowdDepthView.source;

  return (
    <div
      data-testid="studio-webtoon-episodic-doctor-panel"
      className="space-y-2.5 rounded-xl border border-accent/25 bg-card/85 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span className="text-[0.68rem] font-bold text-fg">
            {t("aiAssist.episodic.title")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            data-testid="episodic-doctor-source-badge"
            className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.58rem] font-semibold text-accent"
          >
            {activeSource === "claude-live"
              ? t("aiAssist.episodic.liveSource")
              : t("aiAssist.episodic.localSource")}
          </span>
          <button
            type="button"
            disabled={isRunningClaude}
            onClick={() => void handleRunLiveClaudeDoctor()}
            data-testid="run-claude-episodic-doctor-btn"
            className={cn(
              "inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent hover:bg-accent/90 disabled:opacity-60",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <Wand2 className="h-3 w-3" aria-hidden="true" />
            {isRunningClaude ? t("aiAssist.episodic.running") : task.state.status === "error" ? t("aiAssist.episodic.retry") : t("aiAssist.episodic.run")}
          </button>
          {isRunningClaude ? (
            <button type="button" onClick={task.stop} className={cn("rounded border border-line px-2 py-1 text-xs", STUDIO_FOCUS_RING)}>
              {t("aiAssist.common.stop")}
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-fg-3">{t("aiAssist.episodic.scopeNotice")}</p>
      {task.state.status === "error" ? (
        <p role="alert" className="rounded border border-bad/40 bg-bad/10 p-2 text-xs text-bad">{t("aiAssist.episodic.failed")}</p>
      ) : null}
      {isRunningClaude || task.state.status === "stopped" ? (
        <p role="status" className="text-xs text-fg-2">{t(isRunningClaude ? "aiAssist.episodic.running" : "aiAssist.episodic.stopped")}</p>
      ) : null}

      {/* 4종 차세대 에피소드 AI 디렉터 탭 */}
      <div
        role="tablist"
        aria-label="차세대 에피소드 AI 디렉터 탭"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
      >
        {EPISODIC_DOCTOR_TABS.map((tab) => {
          const isSelected = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => { task.reset(); setActiveMode(tab.id); }}
              data-testid={`episodic-doctor-tab-${tab.id}`}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                isSelected
                  ? "border-accent bg-accent/12 text-fg"
                  : "border-line/70 bg-raised/35 text-fg-2 hover:bg-raised/65",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <span className="text-[0.64rem] font-bold">{tab.id === "reader-retention-simulator" ? t("aiAssist.episodic.readerTab") : tab.labelKo}</span>
              <span className="text-[0.55rem] text-fg-3">{tab.id === "reader-retention-simulator" ? t("aiAssist.episodic.readerBasis") : tab.id === "episodic-visual-continuity-linter" ? t("aiAssist.episodic.continuityBasis") : tab.benchmarkBadgeKo}</span>
            </button>
          );
        })}
      </div>

      {/* 탭 1: 독자 스크롤 이탈 · 댓글 · 별점 예측 시뮬레이터 */}
      {activeMode === "reader-retention-simulator" ? (
        <div
          data-testid="episodic-panel-reader-retention-simulator"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {t("aiAssist.episodic.readerHeading")}
            </span>
            <span className="text-fg-3">{t("aiAssist.episodic.noMetrics")}</span>
          </div>
          <p className="text-fg-2">{retentionView.scrollVelocitySummaryKo}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {retentionView.cutRetentionCurve.map((c) => (
              <div
                key={c.cutNumber}
                className="space-y-1 rounded border border-line/60 bg-card/80 p-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">
                    {t("aiAssist.episodic.cutLabel", { cut: c.cutNumber })}
                  </span>
                  <span className="text-fg-3">{t("aiAssist.episodic.suggestion")}</span>
                </div>
                <p className="text-[0.58rem] text-fg-3">{c.dropOffReasonKo}</p>
                <p className="text-[0.59rem] text-fg-2">{c.retentionBoostFixKo}</p>
                <button
                  type="button"
                  onClick={() => onAppendDirectionLine(c.readyRetentionDirectionLine)}
                  className={cn(
                    "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  {t("aiAssist.episodic.append")}
                </button>
              </div>
            ))}
          </div>
          {retentionView.predictedTopComments.length > 0 ? (
            <div className="space-y-1 rounded border border-accent/25 bg-accent/5 p-2">
              <p className="font-bold text-fg">{t("aiAssist.episodic.exampleComments")}</p>
              {retentionView.predictedTopComments.map((cmt, idx) => (
                <div
                  key={`${cmt.personaLabelKo}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-[0.59rem]"
                >
                  <span className="text-fg-2">
                    <strong className="text-fg">[{cmt.personaLabelKo}]</strong> {cmt.commentTextKo}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 탭 2: 캐릭터 말투·성격 캐붕(OOC) 레이더 & 3종 윤색기 */}
      {activeMode === "character-ooc-radar" ? (
        <div
          data-testid="episodic-panel-character-ooc-radar"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <MessageSquareWarning className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              캐릭터 보이스·어미 캐붕(OOC) 감수 & 3종 서브텍스트 대사 윤색
            </span>
            <span className="rounded bg-accent/15 px-2 py-0.5 font-bold text-accent">
              말투 일관성 {oocView.voiceConsistencyScore}/100점
            </span>
          </div>
          <p className="text-fg-2">{oocView.relationshipTensionSummaryKo}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {oocView.dialogueAudits.map((d) => (
              <div
                key={`${d.cutNumber}-${d.speakerName}`}
                className="space-y-1 rounded border border-line/60 bg-card/80 p-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">
                    Cut {d.cutNumber} · {d.speakerName} ({d.speechRegisterKo})
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[0.55rem] font-semibold",
                      d.oocRiskLevel === "safe"
                        ? "bg-good/15 text-good"
                        : "bg-warn/15 text-warn",
                    )}
                  >
                    {d.oocRiskLevel === "safe" ? "캐논 일치" : "말투 흔들림 주의"}
                  </span>
                </div>
                <p className="text-[0.58rem] text-fg-3">
                  진단: {d.oocDiagnosisKo} · 속뜻: {d.subtextHiddenDesireKo}
                </p>
                <div className="space-y-0.5 rounded bg-raised/60 p-1.5 text-[0.58rem]">
                  <p className="text-fg">
                    <strong>서브텍스트 강화:</strong> &ldquo;{d.highTensionSubtextLine}&rdquo;
                  </p>
                  <p className="text-fg-2">
                    <strong>모바일 42자 압축:</strong> &ldquo;{d.conciseMobileLine}&rdquo;
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onAppendDirectionLine(`${d.speakerName}: ${d.highTensionSubtextLine}`)
                    }
                    className={cn(
                      "rounded border border-line bg-raised px-2 py-0.5 text-[0.56rem] font-semibold text-fg-2 hover:bg-card",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    서브텍스트 대사 적용
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAppendDirectionLine(`${d.speakerName}: ${d.conciseMobileLine}`)
                    }
                    className={cn(
                      "rounded border border-line bg-raised px-2 py-0.5 text-[0.56rem] font-semibold text-fg-2 hover:bg-card",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    모바일 압축 대사 적용
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 3: 컷별 3D 배경·소품 에셋 배치 & 카메라 렌즈/DoF/안개 디렉터 */}
      {activeMode === "bg3d-lighting-asset-director" ? (
        <div
          data-testid="episodic-panel-bg3d-lighting-asset-director"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              컷별 3D 배경 · 소품 배치 & 카메라 렌즈/심도(DoF)/안개 프리셋
            </span>
            <span className="rounded bg-accent/15 px-2 py-0.5 font-bold text-accent">
              추천 에셋: {bg3dView.recommendedAssetPackKo}
            </span>
          </div>
          <p className="text-fg-2">{bg3dView.spatialSceneSummaryKo}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {bg3dView.cut3dSpecs.map((spec) => (
              <div
                key={spec.cutNumber}
                className="space-y-1 rounded border border-line/60 bg-card/80 p-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">
                    Cut {spec.cutNumber} · {spec.cameraLensMm}mm (높이 {spec.cameraHeightCm}cm / 틸트{" "}
                    {spec.cameraTiltDeg}°)
                  </span>
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg-2">
                    DoF {spec.dofBlurStrengthPct}% · 안개 {spec.fogDensityPct}%
                  </span>
                </div>
                <p className="text-[0.58rem] text-fg-2">소품 배치: {spec.keyPropPlacementsKo}</p>
                <p className="text-[0.57rem] text-fg-3">그림자: {spec.shadowCastDirectionKo}</p>
                <button
                  type="button"
                  onClick={() => onAppendDirectionLine(spec.ready3dStageLine)}
                  className={cn(
                    "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  3D 배경·카메라 지문 삽입
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 4: 웹툰 BGM · 폴리 효과음 · 오디오툰 큐시트 디렉터 */}
      {activeMode === "bgm-audiotoon-cuesheet" ? (
        <div
          data-testid="episodic-panel-bgm-audiotoon-cuesheet"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Music className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              웹툰 스크롤 연동 BGM · 폴리 효과음 · 오디오툰 성우 큐시트
            </span>
            <span className="rounded bg-accent/15 px-2 py-0.5 font-bold text-accent">
              {bgmView.recommendedBpm} BPM · {bgmView.musicalKeySignature}
            </span>
          </div>
          <p className="text-fg-2">테마 사운드트랙: {bgmView.episodeSoundtrackThemeKo}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {bgmView.audioCues.map((cue) => (
              <div
                key={cue.cutNumber}
                className="space-y-1 rounded border border-line/60 bg-card/80 p-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">
                    Cut {cue.cutNumber} · {cue.scrollTriggerTiming}
                  </span>
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg-2">
                    호흡 휴지 {cue.breathAndPauseMs}ms
                  </span>
                </div>
                <p className="text-[0.58rem] text-fg-2">BGM: {cue.bgmTrackStyleKo}</p>
                <p className="text-[0.58rem] text-fg-2">폴리: {cue.foleyAmbienceKo}</p>
                <p className="text-[0.57rem] text-fg-3">성우 연기: {cue.voiceActingDirectionKo}</p>
                <button
                  type="button"
                  onClick={() => onAppendDirectionLine(cue.readyAudioCueLine)}
                  className={cn(
                    "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  오디오툰 큐시트 지문 삽입
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 5: 전 회차 컷간 작붕(비대칭 흉터·검집 반전·소품 증발·부상 초기화) 자동 검출 린터 */}
      {activeMode === "episodic-visual-continuity-linter" ? (
        <div
          data-testid="episodic-panel-episodic-visual-continuity-linter"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              컷간 작붕(비대칭 흉터/검집 반전 · 소품 증발 · 부상 초기화 · 그림자 방향) 자동 검출 린터
            </span>
            <span className="rounded bg-good/15 px-2 py-0.5 font-bold text-good">
              {t("aiAssist.episodic.noGuarantee")}
            </span>
          </div>
          <p className="text-fg-2">{linterView.linterSummaryKo}</p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {linterView.cutContinuityChecks.map((chk, idx) => (
              <div
                key={`${chk.cutTransitionLabel}-${idx}`}
                className="space-y-1 rounded border border-line/60 bg-card/80 p-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">{chk.cutTransitionLabel}</span>
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.55rem] font-semibold text-accent">
                    {chk.errorCategory}
                  </span>
                </div>
                <p className="text-[0.58rem] text-fg-3">위험: {chk.detectedRiskKo}</p>
                <p className="text-[0.58rem] text-fg-2">가드: {chk.preventivePromptGuardKo}</p>
                <button
                  type="button"
                  onClick={() => onAppendDirectionLine(chk.readyContinuityGuardLine)}
                  className={cn(
                    "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  작붕 방지 가드 지문 삽입
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 6: 장편 연재(1~100화) 캐릭터·세계관·복선·비주얼 캐논 메모리 볼트 */}
      {activeMode === "multi-episode-canon-memory-vault" ? (
        <div
          data-testid="episodic-panel-multi-episode-canon-memory-vault"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Archive className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              장편 연재(1~100화) 캐릭터 외형 변천 · 상호 호칭 · 미회수 복선 캐논 메모리 볼트
            </span>
            <span className="rounded bg-accent/15 px-2 py-0.5 font-bold text-accent">
              캐논 무결성 {canonVaultView.canonVaultIntegrityScore}/100점
            </span>
          </div>
          <p className="text-fg-2">{canonVaultView.serializedArcTimelineKo}</p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {canonVaultView.canonEntries.map((entry) => (
              <div
                key={entry.entryId}
                className="space-y-1 rounded border border-line/60 bg-card/80 p-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">{entry.establishedEpisodeLabel}</span>
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg-2">
                    {entry.canonCategory}
                  </span>
                </div>
                <p className="text-[0.58rem] text-fg-2">불변 규칙: {entry.immutableRuleKo}</p>
                <p className="text-[0.57rem] text-fg-3">
                  이번 화 연동: {entry.currentEpisodeSyncDirectiveKo}
                </p>
                <button
                  type="button"
                  onClick={() => onAppendDirectionLine(entry.readyCanonVaultLine)}
                  className={cn(
                    "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  장편 캐논 볼트 지문 삽입
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 7: 신발 굽 · 계단 접지 보폭 잠금 */}
      {activeMode === "episodic-footwear-floor-contact-stride-lock" ? (
        <div
          data-testid="episodic-panel-episodic-footwear-floor-contact-stride-lock"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              신발·부츠 굽 높이 · 밑창/버클 · 계단 디딤판(Tread) 접지 보폭 고정
            </span>
            <span className="rounded bg-good/15 px-2 py-0.5 font-bold text-good">
              접지 일관성 {footwearView.footwearIntegrityScore}점 · 굽 {footwearView.heelHeightCm}cm
            </span>
          </div>
          <p className="text-fg-2">{footwearView.strideSummaryKo}</p>
          <p className="text-[0.58rem] text-fg-3">
            밑창·버클: {footwearView.soleAndBuckleSpecKo} · 계단 접지: {footwearView.stairSlopeContactRuleKo}
          </p>
          <button
            type="button"
            data-testid="episodic-footwear-insert-btn"
            onClick={() => onAppendDirectionLine(footwearView.readyFootwearGuardLine)}
            className={cn(
              "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            신발·계단 접지 지문 삽입
          </button>
        </div>
      ) : null}

      {/* 탭 8: 군중 엑스트라 · 대기원근 안개 잠금 */}
      {activeMode === "episodic-crowd-silhouette-depth-fog-lock" ? (
        <div
          data-testid="episodic-panel-episodic-crowd-silhouette-depth-fog-lock"
          className="space-y-2 rounded-lg border border-line/70 bg-raised/25 p-2.5 text-[0.62rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              전경 주연 vs 중경·원경 군중 엑스트라 선굵기 감쇠 · 대기원근 안개 잠금
            </span>
            <span className="rounded bg-accent/15 px-2 py-0.5 font-bold text-accent">
              계층 분리 {crowdDepthView.depthHierarchyScore}점 · 원경 안개 {crowdDepthView.backgroundSilhouetteFogPct}%
            </span>
          </div>
          <p className="text-fg-2">{crowdDepthView.crowdAtmosphereSummaryKo}</p>
          <p className="text-[0.58rem] text-fg-3">
            주연 선굵기 {crowdDepthView.heroLineWeightMultiplier}x · 중경 군중 {crowdDepthView.midgroundCrowdLineMultiplier}x · 원경 안개 감쇠 {crowdDepthView.backgroundSilhouetteFogPct}%
          </p>
          <button
            type="button"
            data-testid="episodic-crowd-depth-insert-btn"
            onClick={() => onAppendDirectionLine(crowdDepthView.readyCrowdDepthGuardLine)}
            className={cn(
              "rounded border border-line bg-raised px-2 py-0.5 text-[0.57rem] font-semibold text-fg-2 hover:bg-card",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            군중 대기원근 지문 삽입
          </button>
        </div>
      ) : null}
    </div>
  );
}
