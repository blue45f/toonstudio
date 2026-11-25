/**
 * 실시간 무빙툰 릴스/쇼츠 2.5D 패럴랙스 카메라 · 세이프존 & BPM 비트싱크 · BGM 덕킹 · SRT/VTT 자막 2탭 워크벤치 (Wave 40E).
 * Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건) · Props 없이 단독 렌더링 지원 · 100% 온디바이스 결정론 연산.
 */

import {
  AudioWaveform, Camera, CheckCircle2, Download, Film, Gauge,
  Layers, Music2, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Subtitles,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  ASPECT_SAFE_ZONE_PROFILES, autoFitElementToSafeZone, CAMERA_PRESET_CATALOG, DEFAULT_MOVINGTOON_SCENES,
  evaluateParallaxFrame, evaluateParallaxSequence, MOVINGTOON_CAMERA_PRESETS,
  type EvaluatedParallaxFrame, type MovingtoonCameraPresetId, type MovingtoonFrameRate,
  type ParallaxDepthPlaneId, type ReelsAspectTarget, type SafeZoneSeverity,
} from "./movingtoon-parallax-engine";
import {
  DEFAULT_BGM_DUCKING_DB, DEFAULT_REELS_AUDIO_SESSION, evaluateDuckingGainAtTime,
  evaluateLoudnessLimiterPreflight, generateBgmSidechainDuckingCurve, generateSubtitleTracks,
  snapTimelineEventsToBeatGrid, type BeatSnapMode, type LoudnessPreflightStatus,
  type SubtitleFormatId, type SubtitleTrackExportResult,
} from "./reels-audio-beat-master";

export type MovingtoonReelsTabId = "parallax-safezone" | "audio-subtitles";

export interface StudioMovingtoonReelsPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: MovingtoonReelsTabId;
  readonly initialPresetId?: MovingtoonCameraPresetId;
  readonly initialAspectTarget?: ReelsAspectTarget;
  readonly initialFps?: MovingtoonFrameRate;
  readonly initialBpm?: number;
  readonly onParallaxEvaluated?: (frame: EvaluatedParallaxFrame) => void;
  readonly onExportSubtitles?: (payload: { readonly format: SubtitleFormatId; readonly result: SubtitleTrackExportResult }) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const SOLID_ACTIVE = "border-accent bg-accent text-on-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const ASPECT_TARGETS: readonly ReelsAspectTarget[] = ["reels-9x16", "tiktok-9x16", "shorts-9x16", "youtube-16x9"];
const BPM_PRESETS: readonly number[] = [96, 120, 128, 145];
const DUCKING_PRESETS: readonly number[] = [-9, -12, -15];
const FALLBACK_SCENE = {
  sceneId: "fallback", episodeCode: "EP.01", titleKo: "기본 컷", titleEn: "Default Cut",
  durationSec: 6, focalLengthPx: 920, depthSeparationPx: 145, layers: [],
} as const;

function safeZoneTone(status: SafeZoneSeverity): string {
  if (status === "pass") return "border-good bg-good-soft text-good";
  return status === "warning" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function loudnessTone(status: LoudnessPreflightStatus): string {
  if (status === "pass") return "border-good bg-good-soft text-good";
  return status === "adjust" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function planeSurfaceTone(planeId: ParallaxDepthPlaneId): string {
  switch (planeId) {
    case "bg-sky": return "border-line bg-info-soft text-cool";
    case "mid-env": return "border-line bg-raised text-fg-2";
    case "character": return "border-accent bg-accent-soft text-accent";
    case "foreground-fx": return "border-warn bg-warning-soft text-warn";
    case "speech-balloon": return "border-good bg-good-soft text-good";
  }
}

/** 실시간 무빙툰 릴스/쇼츠 2.5D 패럴랙스 카메라 · 세이프존 · BPM 비트싱크 · BGM 덕킹 · SRT/VTT 자막 워크벤치. */
export function StudioMovingtoonReelsPanel(props: StudioMovingtoonReelsPanelProps): ReactElement {
  const {
    locale, className, initialTab = "parallax-safezone", initialPresetId = "dolly-zoom-tension",
    initialAspectTarget = "reels-9x16", initialFps = 60, initialBpm = DEFAULT_REELS_AUDIO_SESSION.bpm,
    onParallaxEvaluated, onExportSubtitles,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<MovingtoonReelsTabId>(initialTab);
  const [sceneIdx, setSceneIdx] = useState<number>(0);
  const [aspectTarget, setAspectTarget] = useState<ReelsAspectTarget>(initialAspectTarget);
  const [presetId, setPresetId] = useState<MovingtoonCameraPresetId>(initialPresetId);
  const [fps, setFps] = useState<MovingtoonFrameRate>(initialFps);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [frameIndex, setFrameIndex] = useState<number>(Math.round(initialFps * 2.4));
  const [safeOffsets, setSafeOffsets] = useState<Readonly<Partial<Record<ParallaxDepthPlaneId, { readonly dx: number; readonly dy: number }>>>>({});

  const [bpm, setBpm] = useState<number>(initialBpm);
  const [snapMode, setSnapMode] = useState<BeatSnapMode>("downbeat");
  const [duckingDepthDb, setDuckingDepthDb] = useState<number>(DEFAULT_BGM_DUCKING_DB);
  const [limiterEnabled, setLimiterEnabled] = useState<boolean>(true);
  const [playheadSec, setPlayheadSec] = useState<number>(2.5);
  const [subtitleFormat, setSubtitleFormat] = useState<SubtitleFormatId>("vtt");
  const [safeZoneSubtitleLine, setSafeZoneSubtitleLine] = useState<boolean>(true);
  const [includeSpeaker, setIncludeSpeaker] = useState<boolean>(false);
  const [lastExportLabel, setLastExportLabel] = useState<string | null>(null);

  const fallbackScene = DEFAULT_MOVINGTOON_SCENES[sceneIdx] ?? DEFAULT_MOVINGTOON_SCENES[0] ?? FALLBACK_SCENE;
  const totalFrames = Math.max(1, Math.round(fallbackScene.durationSec * fps));
  const clampedFrameIdx = Math.min(frameIndex, totalFrames - 1);

  const evaluatedFrame = useMemo(
    () => evaluateParallaxFrame(fallbackScene, {
      presetId, frameIndex: clampedFrameIdx, fps, aspectTarget, reducedMotion, extraSafeOffsetByPlane: safeOffsets,
    }),
    [fallbackScene, presetId, clampedFrameIdx, fps, aspectTarget, reducedMotion, safeOffsets],
  );

  const sequenceAudit = useMemo(
    () => evaluateParallaxSequence(fallbackScene, {
      presetId, fps, aspectTarget, reducedMotion, extraSafeOffsetByPlane: safeOffsets, sampleCount: 9,
    }),
    [fallbackScene, presetId, fps, aspectTarget, reducedMotion, safeOffsets],
  );

  const aspectProfile = ASPECT_SAFE_ZONE_PROFILES[aspectTarget];
  const activePresetSpec = CAMERA_PRESET_CATALOG[presetId];

  const beatSnapReport = useMemo(
    () => snapTimelineEventsToBeatGrid(DEFAULT_REELS_AUDIO_SESSION.events, {
      bpm, durationSec: DEFAULT_REELS_AUDIO_SESSION.durationSec,
      timeSignature: DEFAULT_REELS_AUDIO_SESSION.timeSignature, mode: snapMode,
    }),
    [bpm, snapMode],
  );

  const duckingCurve = useMemo(
    () => generateBgmSidechainDuckingCurve({
      durationSec: DEFAULT_REELS_AUDIO_SESSION.durationSec,
      triggers: DEFAULT_REELS_AUDIO_SESSION.duckingTriggers,
      bgmBaseGainDb: DEFAULT_REELS_AUDIO_SESSION.bgmBaseGainDb,
      duckingDepthDb, sampleStepMs: 100,
    }),
    [duckingDepthDb],
  );

  const playheadDucking = useMemo(
    () => evaluateDuckingGainAtTime(duckingCurve, playheadSec),
    [duckingCurve, playheadSec],
  );

  const loudnessReport = useMemo(
    () => evaluateLoudnessLimiterPreflight({
      stems: DEFAULT_REELS_AUDIO_SESSION.stems,
      totalDurationSec: DEFAULT_REELS_AUDIO_SESSION.durationSec,
      duckingCurve, limiterEnabled,
    }),
    [duckingCurve, limiterEnabled],
  );

  const subtitleResult = useMemo(
    () => generateSubtitleTracks(
      isKo ? DEFAULT_REELS_AUDIO_SESSION.subtitleCuesKo : DEFAULT_REELS_AUDIO_SESSION.subtitleCuesEn,
      {
        title: isKo ? DEFAULT_REELS_AUDIO_SESSION.titleKo : DEFAULT_REELS_AUDIO_SESSION.titleEn,
        safeZoneLinePct: safeZoneSubtitleLine ? 72 : undefined,
        includeSpeakerLabel: includeSpeaker,
      },
    ),
    [isKo, safeZoneSubtitleLine, includeSpeaker],
  );

  const duckingSparkBars = useMemo(() => {
    const bucketCount = 30;
    const step = Math.max(1, Math.floor(duckingCurve.samples.length / bucketCount));
    const bars: { readonly timeSec: number; readonly gainOffsetDb: number; readonly heightPct: number }[] = [];
    for (let i = 0; i < duckingCurve.samples.length && bars.length < bucketCount; i += step) {
      const sample = duckingCurve.samples[i];
      if (!sample) continue;
      const normalizedLevel = Math.max(18, Math.min(100, Math.round(100 + (sample.gainOffsetDb / 18) * 82)));
      bars.push({ timeSec: sample.timeSec, gainOffsetDb: sample.gainOffsetDb, heightPct: normalizedLevel });
    }
    return bars;
  }, [duckingCurve.samples]);

  const handleSelectScene = (idx: number): void => {
    setSceneIdx(idx);
    setSafeOffsets({});
    const nextScene = DEFAULT_MOVINGTOON_SCENES[idx] ?? fallbackScene;
    onParallaxEvaluated?.(evaluateParallaxFrame(nextScene, {
      presetId, frameIndex: clampedFrameIdx, fps, aspectTarget, reducedMotion,
    }));
  };

  const handleSelectAspect = (nextTarget: ReelsAspectTarget): void => {
    setAspectTarget(nextTarget);
    setSafeOffsets({});
    onParallaxEvaluated?.(evaluateParallaxFrame(fallbackScene, {
      presetId, frameIndex: clampedFrameIdx, fps, aspectTarget: nextTarget, reducedMotion,
    }));
  };

  const handleSelectPreset = (nextPreset: MovingtoonCameraPresetId): void => {
    setPresetId(nextPreset);
    onParallaxEvaluated?.(evaluateParallaxFrame(fallbackScene, {
      presetId: nextPreset, frameIndex: clampedFrameIdx, fps, aspectTarget, reducedMotion, extraSafeOffsetByPlane: safeOffsets,
    }));
  };

  const handleAutoFitSafeZone = (): void => {
    const nextOffsets: Partial<Record<ParallaxDepthPlaneId, { readonly dx: number; readonly dy: number }>> = { ...safeOffsets };
    for (const plane of evaluatedFrame.planes) {
      if (!plane.safeZoneCritical) continue;
      const { nudgePx } = autoFitElementToSafeZone(plane.projectedBounds, aspectTarget);
      if (nudgePx.dx !== 0 || nudgePx.dy !== 0) {
        const prev = nextOffsets[plane.planeId];
        nextOffsets[plane.planeId] = {
          dx: Math.round(((prev?.dx ?? 0) + nudgePx.dx) * 100) / 100,
          dy: Math.round(((prev?.dy ?? 0) + nudgePx.dy) * 100) / 100,
        };
      }
    }
    setSafeOffsets(nextOffsets);
    const updated = evaluateParallaxFrame(fallbackScene, {
      presetId, frameIndex: clampedFrameIdx, fps, aspectTarget, reducedMotion, extraSafeOffsetByPlane: nextOffsets,
    });
    onParallaxEvaluated?.(updated);
  };

  const handleExportSubtitles = (): void => {
    onExportSubtitles?.({ format: subtitleFormat, result: subtitleResult });
    setLastExportLabel(
      subtitleFormat === "vtt"
        ? pick(`WebVTT(.vtt) ${subtitleResult.cueCount}개 큐 출고 준비 완료`, `WebVTT (.vtt) ${subtitleResult.cueCount} cues ready`)
        : pick(`SubRip(.srt) ${subtitleResult.cueCount}개 큐 출고 준비 완료`, `SubRip (.srt) ${subtitleResult.cueCount} cues ready`),
    );
  };

  const tabs: readonly { readonly id: MovingtoonReelsTabId; readonly label: string; readonly icon: ReactElement }[] = [
    {
      id: "parallax-safezone",
      label: pick("2.5D 패럴랙스 릴스 카메라 · 세이프존", "2.5D Parallax Camera & Safe-Zone"),
      icon: <Film className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: "audio-subtitles",
      label: pick("BPM 비트 싱크 · BGM 덕킹 · SRT/VTT 자막", "BPM Beat Sync · BGM Ducking · SRT/VTT"),
      icon: <AudioWaveform className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  const isPortraitStage = aspectTarget !== "youtube-16x9";

  return (
    <section
      data-testid="movingtoon-reels-studio-panel"
      aria-label={pick("실시간 무빙툰 릴스/쇼츠 2.5D 패럴랙스 · BPM 비트 싱크 · 자막 출고 스튜디오", "Movingtoon Reels 2.5D Parallax, BPM Beat Mastering & Subtitle Studio")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("무빙툰 릴스/쇼츠 동시 출고 · 2.5D 패럴랙스 · BPM 오디오 마스터링", "Movingtoon Reels/Shorts · 2.5D Parallax · BPM Mastering")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("5층 깊이 패럴랙스 카메라와 9:16·16:9 세이프존을 실시간 검증하고, BPM 다운비트 스냅·-12dB BGM 덕킹·-14 LUFS 리미터·SRT/VTT 자막을 한 번에 출고합니다.", "Verify 5-plane 2.5D parallax matrices and 9:16/16:9 safe zones, then master BPM downbeat sync, -12dB ducking, -14 LUFS limiting, and SRT/VTT subtitles.")}
          </p>
        </div>
        <span data-testid="badge-reels-engine-ready" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-good bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick(`${fps}fps · 5층 2.5D · -14 LUFS`, `${fps}fps · 5-Plane 2.5D · -14 LUFS`)}
        </span>
      </header>

      <div role="tablist" aria-label={pick("무빙툰 릴스 작업 탭", "Movingtoon Reels Workbench Tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? SOLID_ACTIVE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "parallax-safezone" && (
        <div role="tabpanel" id={`${uid}-panel-parallax-safezone`} aria-labelledby={`${uid}-tab-parallax-safezone`} data-testid="panel-parallax-safezone" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap gap-2">
              {DEFAULT_MOVINGTOON_SCENES.map((scene, idx) => (
                <button
                  key={scene.sceneId} type="button" data-testid={`scene-btn-${scene.sceneId}`}
                  onClick={() => handleSelectScene(idx)}
                  className={`${PILL_BTN} ${sceneIdx === idx ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{scene.episodeCode} · {isKo ? scene.titleKo : scene.titleEn}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([30, 60] as const).map((rate) => (
                <button
                  key={rate} type="button" data-testid={`fps-btn-${rate}`}
                  onClick={() => setFps(rate)}
                  className={`${PILL_BTN} tabular-nums ${fps === rate ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  {rate}fps
                </button>
              ))}
              <button
                type="button" data-testid="btn-toggle-reduced-motion"
                aria-pressed={reducedMotion}
                onClick={() => setReducedMotion((prev) => !prev)}
                className={`${PILL_BTN} ${reducedMotion ? ACTIVE_TONE : IDLE_TONE}`}
              >
                {pick("모션 축소", "Reduced Motion")}: {reducedMotion ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Camera className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("5종 무빙툰 카메라 모션 프리셋", "5 Movingtoon Camera Motion Presets")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MOVINGTOON_CAMERA_PRESETS.map((id) => {
                  const spec = CAMERA_PRESET_CATALOG[id];
                  return (
                    <button
                      key={id} type="button" data-testid={`preset-btn-${id}`}
                      onClick={() => handleSelectPreset(id)}
                      className={`${PILL_BTN} ${presetId === id ? ACTIVE_TONE : IDLE_TONE}`}
                    >
                      {isKo ? spec.labelKo : spec.labelEn}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-fg-2">{isKo ? activePresetSpec.summaryKo : activePresetSpec.summaryEn}</p>
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("출고 화면비 · 플랫폼 세이프존 프로파일", "Aspect Ratio & Platform Safe-Zone")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_TARGETS.map((target) => {
                  const prof = ASPECT_SAFE_ZONE_PROFILES[target];
                  return (
                    <button
                      key={target} type="button" data-testid={`aspect-btn-${target}`}
                      onClick={() => handleSelectAspect(target)}
                      className={`${PILL_BTN} ${aspectTarget === target ? ACTIVE_TONE : IDLE_TONE}`}
                    >
                      {isKo ? prof.labelKo : prof.labelEn}
                    </button>
                  );
                })}
              </div>
              <div className="pt-1">
                <label htmlFor={`${uid}-frame-slider`} className="flex items-center justify-between text-xs text-fg-2">
                  <span>{pick("결정론적 프레임 스크러버", "Deterministic Frame Scrubber")}</span>
                  <span data-testid="parallax-frame-readout" className="font-semibold text-fg tabular-nums">
                    #{evaluatedFrame.frameIndex} / {evaluatedFrame.totalFrames - 1} · {evaluatedFrame.timestampSec.toFixed(2)}s ({evaluatedFrame.fps}fps)
                  </span>
                </label>
                <input
                  id={`${uid}-frame-slider`} data-testid="parallax-frame-slider" type="range"
                  min={0} max={Math.max(0, totalFrames - 1)} value={clampedFrameIdx}
                  onChange={(e) => setFrameIndex(Number(e.target.value))}
                  className="mt-1.5 w-full accent-accent"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("카메라 줌 · 롤 · FOV", "Camera Zoom · Roll · FOV")}</div>
              <div data-testid="camera-telemetry" className="mt-1 text-sm font-bold text-fg tabular-nums">
                ×{evaluatedFrame.camera.zoom.toFixed(2)} · {evaluatedFrame.camera.rollDeg.toFixed(1)}° · {evaluatedFrame.camera.fovDeg.toFixed(0)}°
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("세이프존 판정", "Safe-Zone Status")}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span data-testid="safezone-status-badge" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${safeZoneTone(evaluatedFrame.safeZone.status)}`}>
                  {evaluatedFrame.safeZone.passed ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                  {evaluatedFrame.safeZone.passed ? pick("통과 (0px²)", "Pass (0px²)") : pick(`침범 ${Math.round(evaluatedFrame.safeZone.totalOverlapAreaPx2)}px²`, `Overlap ${Math.round(evaluatedFrame.safeZone.totalOverlapAreaPx2)}px²`)}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("전 구간 표본 검사", "Full-Clip Sample Audit")}</div>
              <div data-testid="sequence-audit-readout" className="mt-1 text-sm font-bold text-fg tabular-nums">
                {sequenceAudit.offendingFrameIndices.length} / {sequenceAudit.sampledFrameCount} {pick("프레임 침범", "frames hit")}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("출고 해상도", "Output Resolution")}</div>
              <div className="mt-1 text-sm font-bold text-fg tabular-nums">
                {aspectProfile.widthPx}×{aspectProfile.heightPx} ({aspectProfile.aspectRatioLabel})
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3 lg:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">
                  {pick("실시간 2.5D 프리뷰 · 세이프존 오버레이", "Live 2.5D Stage & Safe-Zone Overlay")}
                </h3>
                {!evaluatedFrame.safeZone.passed && (
                  <button
                    type="button" data-testid="btn-autofit-safezone" onClick={handleAutoFitSafeZone}
                    className={`${PILL_BTN} ${SOLID_ACTIVE}`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pick("세이프존 자동 보정 적용", "Auto-Fit Safe Zone")}</span>
                  </button>
                )}
              </div>

              <div className="flex justify-center rounded-lg border border-line bg-canvas p-3">
                <div
                  data-testid="parallax-stage-preview"
                  className={`relative overflow-hidden rounded-lg border border-line-strong bg-panel ${isPortraitStage ? "h-72 w-40" : "h-44 w-72"}`}
                >
                  {evaluatedFrame.planes.map((plane) => {
                    const leftPct = (plane.projectedBounds.x / aspectProfile.widthPx) * 100;
                    const topPct = (plane.projectedBounds.y / aspectProfile.heightPx) * 100;
                    const widthPct = (plane.projectedBounds.width / aspectProfile.widthPx) * 100;
                    const heightPct = (plane.projectedBounds.height / aspectProfile.heightPx) * 100;
                    return (
                      <div
                        key={plane.planeId}
                        data-testid={`stage-plane-${plane.planeId}`}
                        style={{
                          left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%`,
                          zIndex: plane.zIndex, opacity: plane.opacity,
                        }}
                        className={`absolute flex items-center justify-center rounded border px-1 text-center text-[11px] font-semibold ${planeSurfaceTone(plane.planeId)}`}
                      >
                        <span className="truncate">{isKo ? plane.labelKo : plane.labelEn}</span>
                      </div>
                    );
                  })}

                  {aspectProfile.hazards.map((hazard) => (
                    <div
                      key={hazard.id}
                      aria-hidden="true"
                      style={{
                        left: `${(hazard.rect.x / aspectProfile.widthPx) * 100}%`,
                        top: `${(hazard.rect.y / aspectProfile.heightPx) * 100}%`,
                        width: `${(hazard.rect.width / aspectProfile.widthPx) * 100}%`,
                        height: `${(hazard.rect.height / aspectProfile.heightPx) * 100}%`,
                      }}
                      className={`pointer-events-none absolute z-10 border border-dashed ${hazard.severity === "critical" ? "border-bad bg-bad-soft" : "border-warn bg-warning-soft"}`}
                    />
                  ))}
                </div>
              </div>

              <p data-testid="safezone-summary-text" className="text-xs text-fg-2">
                {isKo ? evaluatedFrame.safeZone.summaryKo : evaluatedFrame.safeZone.summaryEn}
              </p>

              {evaluatedFrame.safeZone.issues.length > 0 ? (
                <ul data-testid="safezone-issues-list" className="space-y-1.5">
                  {evaluatedFrame.safeZone.issues.map((issue) => (
                    <li key={`${issue.planeId}-${issue.hazardId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-bad bg-bad-soft px-2.5 py-1.5 text-xs text-bad">
                      <span>{isKo ? `${issue.layerTitleKo} ↔ ${issue.hazardLabelKo}` : `${issue.layerTitleEn} ↔ ${issue.hazardLabelEn}`}</span>
                      <span className="font-semibold tabular-nums">
                        {Math.round(issue.overlapAreaPx2)}px² · nudge ({issue.recommendedNudgePx.dx}, {issue.recommendedNudgePx.dy})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div data-testid="safezone-clean-banner" className="rounded-md border border-good bg-good-soft px-2.5 py-2 text-xs font-semibold text-good">
                  {pick("우측 좋아요 레일·하단 캡션·플레이어 바 가림 0건 — 릴스/쇼츠 즉시 출고 가능", "0 UI overlaps across action rails & captions — ready for export")}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-card p-3 lg:col-span-7">
              <h3 className="text-xs font-semibold text-fg">
                {pick("5개 깊이 평면 2.5D 패럴랙스 변환 행렬 인스펙터", "5 Depth Planes 2.5D Parallax Transform Matrices")}
              </h3>
              <ul data-testid="parallax-planes-list" className="space-y-2">
                {evaluatedFrame.planes.map((plane) => (
                  <li key={plane.planeId} data-testid={`plane-row-${plane.planeId}`} className="rounded-md border border-line bg-raised p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${planeSurfaceTone(plane.planeId)}`}>
                          Z{plane.zIndex} · {plane.planeId}
                        </span>
                        <span className="font-semibold text-fg">{isKo ? plane.titleKo : plane.titleEn}</span>
                      </div>
                      <span className="text-[11px] text-fg-2 tabular-nums">
                        z={plane.zDepth.toFixed(2)} · ×{plane.parallaxFactor.toFixed(2)} · scale {plane.scale.toFixed(3)} · blur {plane.blurPx.toFixed(1)}px
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-3 tabular-nums">
                      <span>tx={plane.translateXpx.toFixed(1)}px, ty={plane.translateYpx.toFixed(1)}px, tz={plane.translateZpx.toFixed(0)}px</span>
                      <span>
                        M3×3 [{plane.matrix3x3[0].toFixed(3)}, {plane.matrix3x3[1].toFixed(3)}, {plane.matrix3x3[2].toFixed(1)} | {plane.matrix3x3[3].toFixed(3)}, {plane.matrix3x3[4].toFixed(3)}, {plane.matrix3x3[5].toFixed(1)}]
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === "audio-subtitles" && (
        <div role="tabpanel" id={`${uid}-panel-audio-subtitles`} aria-labelledby={`${uid}-tab-audio-subtitles`} data-testid="panel-audio-subtitles" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Music2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("BPM 비트 그리드 · 다운비트 스냅", "BPM Beat Grid & Downbeat Snap")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BPM_PRESETS.map((presetBpm) => (
                  <button
                    key={presetBpm} type="button" data-testid={`bpm-preset-${presetBpm}`}
                    onClick={() => setBpm(presetBpm)}
                    className={`${PILL_BTN} tabular-nums ${bpm === presetBpm ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {presetBpm} BPM
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor={`${uid}-bpm-slider`} className="flex items-center justify-between text-xs text-fg-2">
                  <span>{pick("정밀 템포 조절", "Fine Tempo Control")}</span>
                  <span data-testid="bpm-value-readout" className="font-semibold text-fg tabular-nums">
                    {beatSnapReport.grid.bpm} BPM · 1마디 {beatSnapReport.grid.barIntervalSec.toFixed(2)}s
                  </span>
                </label>
                <input
                  id={`${uid}-bpm-slider`} data-testid="bpm-slider" type="range"
                  min={60} max={180} value={bpm} onChange={(e) => setBpm(Number(e.target.value))}
                  className="mt-1.5 w-full accent-accent"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["downbeat", "beat", "half-beat"] as const).map((mode) => (
                  <button
                    key={mode} type="button" data-testid={`snap-mode-${mode}`}
                    onClick={() => setSnapMode(mode)}
                    className={`${PILL_BTN} ${snapMode === mode ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {mode === "downbeat" ? pick("다운비트 강박", "Downbeat") : mode === "beat" ? pick("박자 그리드", "Beat Grid") : pick("반박자(8분)", "Half-Beat")}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("BGM 사이드체인 덕킹 · -14 LUFS 리미터", "BGM Sidechain Ducking & -14 LUFS Limiter")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DUCKING_PRESETS.map((depth) => (
                  <button
                    key={depth} type="button" data-testid={`duck-depth-${Math.abs(depth)}`}
                    onClick={() => setDuckingDepthDb(depth)}
                    className={`${PILL_BTN} tabular-nums ${duckingDepthDb === depth ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {depth}dB {depth === -12 ? pick("(표준)", "(Std)") : ""}
                  </button>
                ))}
                <button
                  type="button" data-testid="btn-toggle-limiter" aria-pressed={limiterEnabled}
                  onClick={() => setLimiterEnabled((prev) => !prev)}
                  className={`${PILL_BTN} ${limiterEnabled ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  {pick("리미터 (-1.0 dBTP)", "Limiter (-1.0 dBTP)")}: {limiterEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div>
                <label htmlFor={`${uid}-playhead-slider`} className="flex items-center justify-between text-xs text-fg-2">
                  <span>{pick("덕킹 커브 재생 헤드 점검", "Ducking Playhead Probe")}</span>
                  <span data-testid="ducking-playhead-readout" className="font-semibold text-fg tabular-nums">
                    {playheadSec.toFixed(1)}s · {playheadDucking.gainOffsetDb.toFixed(1)} dB ({playheadDucking.phase})
                  </span>
                </label>
                <input
                  id={`${uid}-playhead-slider`} data-testid="ducking-playhead-slider" type="range"
                  min={0} max={DEFAULT_REELS_AUDIO_SESSION.durationSec} step={0.1} value={playheadSec}
                  onChange={(e) => setPlayheadSec(Number(e.target.value))}
                  className="mt-1.5 w-full accent-accent"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("다운비트 정렬", "Downbeat Alignment")}</div>
              <div data-testid="kpi-downbeat-sync" className="mt-1 text-sm font-bold text-fg tabular-nums">
                {beatSnapReport.downbeatAlignedCount}/{beatSnapReport.totalEventCount} · ±{beatSnapReport.meanAbsDeltaMs.toFixed(0)}ms
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("BGM 덕킹 감쇄", "BGM Ducking Depth")}</div>
              <div data-testid="kpi-ducking-depth" className="mt-1 text-sm font-bold text-fg tabular-nums">
                {duckingCurve.minGainOffsetDb.toFixed(1)} dB ({duckingCurve.duckedCoveragePct}%)
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("마스터 통합 라우드니스", "Master Integrated LUFS")}</div>
              <div data-testid="kpi-master-lufs" className="mt-1 text-sm font-bold text-fg tabular-nums">
                {loudnessReport.masteredIntegratedLufs.toFixed(1)} LUFS
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("True-Peak 리미터 프리플라이트", "True-Peak Limiter Preflight")}</div>
              <div className="mt-1">
                <span data-testid="kpi-true-peak-badge" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${loudnessTone(loudnessReport.status)}`}>
                  {loudnessReport.masteredTruePeakDbtp.toFixed(1)} dBTP · {loudnessReport.status === "pass" ? pick("적합", "Pass") : loudnessReport.status === "adjust" ? pick("조정", "Adjust") : pick("클리핑 위험", "Clip Risk")}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <h3 className="text-xs font-semibold text-fg">{pick("컷 전환·SFX 다운비트 스냅 타임라인", "Cut Transition & SFX Downbeat Snap")}</h3>
              <ul data-testid="beat-snap-list" className="space-y-1.5">
                {beatSnapReport.snappedEvents.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                    <span className="font-semibold text-fg">{isKo ? ev.labelKo : ev.labelEn}</span>
                    <span className="text-[11px] text-fg-2 tabular-nums">
                      {ev.rawTimeSec.toFixed(2)}s → <strong className="text-fg">{ev.snappedTimeSec.toFixed(2)}s</strong> (Bar {ev.targetBar}.{ev.targetBeatInBar}, {ev.deltaMs >= 0 ? "+" : ""}{ev.deltaMs}ms)
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-fg-2">{isKo ? loudnessReport.summaryKo : loudnessReport.summaryEn}</p>
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-fg">{pick("사이드체인 BGM 덕킹 커브 (0dB ↔ -12dB)", "Sidechain BGM Ducking Envelope")}</h3>
                <span className="text-[11px] text-fg-2 tabular-nums">
                  {pick("병합 구간", "Merged Spans")}: {duckingCurve.mergedSpans.length}
                </span>
              </div>
              <div data-testid="ducking-curve-bars" className="flex h-24 items-end gap-1 rounded-md border border-line bg-canvas p-2">
                {duckingSparkBars.map((bar) => (
                  <div
                    key={bar.timeSec}
                    title={`${bar.timeSec.toFixed(1)}s: ${bar.gainOffsetDb.toFixed(1)}dB`}
                    style={{ height: `${bar.heightPct}%` }}
                    className={`flex-1 rounded-t ${bar.gainOffsetDb <= -6 ? "bg-accent" : bar.gainOffsetDb < -0.5 ? "bg-warn" : "bg-good"}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-fg-2 tabular-nums">
                {loudnessReport.stemBreakdown.map((stem) => (
                  <div key={stem.stemId} className="flex items-center justify-between rounded border border-line bg-raised px-2 py-1">
                    <span className="truncate text-fg">{isKo ? stem.labelKo : stem.labelEn}</span>
                    <span>{stem.effectiveRmsDbfs.toFixed(1)}dB · {stem.energySharePct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Subtitles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("WebVTT(.vtt) · SubRip(.srt) 자막 트랙 익스포터", "WebVTT (.vtt) & SubRip (.srt) Subtitle Exporter")}</span>
              </div>
              <span data-testid="subtitle-validation-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good tabular-nums">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {subtitleResult.vttTimecodeFormatValid && subtitleResult.srtTimecodeFormatValid && subtitleResult.validation.valid
                  ? pick(`타임코드 규격 통과 (${subtitleResult.cueCount}큐)`, `Timecodes Verified (${subtitleResult.cueCount} cues)`)
                  : pick("자막 타임코드 점검 필요", "Check Subtitle Timing")}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="subtitle-format-vtt" onClick={() => setSubtitleFormat("vtt")} className={`${PILL_BTN} ${subtitleFormat === "vtt" ? ACTIVE_TONE : IDLE_TONE}`}>
                WebVTT (.vtt)
              </button>
              <button type="button" data-testid="subtitle-format-srt" onClick={() => setSubtitleFormat("srt")} className={`${PILL_BTN} ${subtitleFormat === "srt" ? ACTIVE_TONE : IDLE_TONE}`}>
                SubRip (.srt)
              </button>
              <button type="button" data-testid="btn-toggle-vtt-safezone" aria-pressed={safeZoneSubtitleLine} onClick={() => setSafeZoneSubtitleLine((p) => !p)} className={`${PILL_BTN} ${safeZoneSubtitleLine ? ACTIVE_TONE : IDLE_TONE}`}>
                {pick("9:16 세이프존 위치(line:72%)", "9:16 Safe Line (72%)")}: {safeZoneSubtitleLine ? "ON" : "OFF"}
              </button>
              <button type="button" data-testid="btn-toggle-speaker" aria-pressed={includeSpeaker} onClick={() => setIncludeSpeaker((p) => !p)} className={`${PILL_BTN} ${includeSpeaker ? ACTIVE_TONE : IDLE_TONE}`}>
                {pick("화자 표기", "Speaker Tag")}: {includeSpeaker ? "ON" : "OFF"}
              </button>
              <button type="button" data-testid="btn-export-subtitles" onClick={handleExportSubtitles} className={`${PILL_BTN} ${SOLID_ACTIVE}`}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("자막 트랙 출고 확정", "Export Subtitle Track")}</span>
              </button>
            </div>

            {lastExportLabel && (
              <div data-testid="subtitle-export-status" className="rounded-md border border-good bg-good-soft px-2.5 py-1.5 text-xs font-semibold text-good">
                {lastExportLabel}
              </div>
            )}

            <pre data-testid="subtitle-preview-code" className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg tabular-nums">
              {subtitleFormat === "vtt" ? subtitleResult.vttContent : subtitleResult.srtContent}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
