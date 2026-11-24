/**
 * 웹툰 컷 리듬 분석 -> 2.5D 무빙툰 & 15초/30초 프로모 자동 연출 스튜디오 패널.
 *
 * - Props 없이 단독 렌더 가능(모든 props optional).
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 비사용 · 명시적 transition 속성만 사용 · 브라우저 스토리지 비의존).
 */

import {
  Film,
  Layers,
  Monitor,
  Music,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Smartphone,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  CutTimelineAndAudioInspector,
  type PromoInspectorTab,
} from "./CutTimelineAndAudioInspector";
import {
  BUILTIN_STORYBOARD_PRESETS,
  NARRATIVE_BEAT_LABELS_KO,
  createAudioCueIndex,
  createPresetEntriesIndex,
  directWebtoonPromo,
  evaluateParallaxCameraAtFrame,
  serializeRemotionPromoManifest,
} from "./cut-rhythm-promo-engine";
import { renderParallaxStageCanvas } from "./parallax-stage-renderer";
import type {
  PromoAspectPreset,
  PromoDurationSec,
  PromoFps,
  WebtoonCutInput,
} from "./types";

export interface StudioCutRhythmPromoDirectorPanelProps {
  readonly initialPresetId?: string;
  readonly initialDurationSec?: PromoDurationSec;
  readonly initialAspectPreset?: PromoAspectPreset;
  readonly initialFps?: PromoFps;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE_CHIP = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

function formatTimeSec(frame: number, fps: PromoFps): string {
  return `${(frame / fps).toFixed(2)}초`;
}

function downloadManifestJson(filename: string, content: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const url = URL.createObjectURL(new Blob([`${content}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function StudioCutRhythmPromoDirectorPanel({
  initialPresetId,
  initialDurationSec,
  initialAspectPreset,
  initialFps,
  className,
}: StudioCutRhythmPromoDirectorPanelProps = {}): ReactElement {
  const uid = useId();
  const presetEntries = useMemo(() => createPresetEntriesIndex(BUILTIN_STORYBOARD_PRESETS), []);
  const fallbackPreset = BUILTIN_STORYBOARD_PRESETS[0];
  const initialPreset =
    (initialPresetId ? presetEntries.get(initialPresetId) : undefined) ?? fallbackPreset;

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    initialPreset?.id ?? "action-awakening-15s",
  );
  const [cutsOverride, setCutsOverride] = useState<readonly WebtoonCutInput[] | null>(null);
  const [durationSec, setDurationSec] = useState<PromoDurationSec>(
    initialDurationSec ?? initialPreset?.defaultDurationSec ?? 15,
  );
  const [aspectPreset, setAspectPreset] = useState<PromoAspectPreset>(
    initialAspectPreset ?? initialPreset?.defaultAspect ?? "9:16",
  );
  const [fps, setFps] = useState<PromoFps>(initialFps ?? initialPreset?.defaultFps ?? 30);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [inspectorTab, setInspectorTab] = useState<PromoInspectorTab>("timeline");
  const [copiedNotice, setCopiedNotice] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activePreset = presetEntries.get(selectedPresetId) ?? fallbackPreset;
  const effectiveCuts = useMemo(
    () => cutsOverride ?? activePreset?.cuts ?? [],
    [activePreset, cutsOverride],
  );

  const promoPlan = useMemo(
    () =>
      directWebtoonPromo(effectiveCuts, {
        targetDurationSec: durationSec,
        fps,
        aspectPreset,
        presetId: activePreset?.id ?? "custom",
        seriesTitle: activePreset?.seriesTitle,
        episodeTitle: activePreset?.episodeTitle,
      }),
    [activePreset, aspectPreset, durationSec, effectiveCuts, fps],
  );

  const audioIndex = useMemo(
    () => createAudioCueIndex(promoPlan.audioCueSheet),
    [promoPlan.audioCueSheet],
  );
  const manifestJson = useMemo(
    () => serializeRemotionPromoManifest(promoPlan.manifest),
    [promoPlan.manifest],
  );

  const totalFrames = promoPlan.rhythm.totalFrames;
  const safeFrame = Math.min(Math.max(0, currentFrame), Math.max(0, totalFrames - 1));

  const currentPose = useMemo(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return evaluateParallaxCameraAtFrame(promoPlan.parallaxTracks, safeFrame, { reducedMotion });
  }, [promoPlan.parallaxTracks, safeFrame]);

  const activeCut = useMemo(
    () =>
      promoPlan.rhythm.cuts.find((cut) => cut.id === currentPose.cutId) ??
      promoPlan.rhythm.cuts[0],
    [currentPose.cutId, promoPlan.rhythm.cuts],
  );

  const activeTrack = useMemo(
    () =>
      promoPlan.parallaxTracks.find((track) => track.cutId === currentPose.cutId) ??
      promoPlan.parallaxTracks[0],
    [currentPose.cutId, promoPlan.parallaxTracks],
  );

  const activeFrameSfx = useMemo(
    () => promoPlan.audioCueSheet.sfxMarkers.filter((cue) => Math.abs(cue.frame - safeFrame) <= 2),
    [promoPlan.audioCueSheet.sfxMarkers, safeFrame],
  );

  const activeCutSfxList = useMemo(
    () => (activeCut ? (audioIndex.cueIndex.get(activeCut.id) ?? []) : []),
    [activeCut, audioIndex.cueIndex],
  );

  useEffect(() => {
    if (!isPlaying) return undefined;
    let rafId = 0;
    let lastTs = 0;
    let accumMs = 0;
    const frameIntervalMs = 1000 / fps;

    const tick = (now: number): void => {
      if (lastTs === 0) lastTs = now;
      accumMs += Math.min(100, now - lastTs);
      lastTs = now;

      if (accumMs >= frameIntervalMs) {
        const steps = Math.floor(accumMs / frameIntervalMs);
        accumMs -= steps * frameIntervalMs;
        setCurrentFrame((prev) => (prev + steps) % totalFrames);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [fps, isPlaying, totalFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeCut) return;
    renderParallaxStageCanvas({
      canvas,
      cut: activeCut,
      pose: currentPose,
      aspectPreset,
      activeSfx: activeFrameSfx,
      beatLabelKo: NARRATIVE_BEAT_LABELS_KO[activeCut.beat],
    });
  }, [activeCut, activeFrameSfx, aspectPreset, currentPose]);

  const handleSelectPreset = (presetId: string): void => {
    const nextPreset = presetEntries.get(presetId);
    if (!nextPreset) return;
    setSelectedPresetId(nextPreset.id);
    setCutsOverride(null);
    setDurationSec(nextPreset.defaultDurationSec);
    setAspectPreset(nextPreset.defaultAspect);
    setFps(nextPreset.defaultFps);
    setCurrentFrame(0);
    setIsPlaying(false);
    setStatusNotice(`${nextPreset.labelKo} 스토리보드를 불러왔습니다.`);
  };

  const handleChangeDuration = (nextDuration: PromoDurationSec): void => {
    setDurationSec(nextDuration);
    setCurrentFrame(0);
    setIsPlaying(false);
    setStatusNotice(`목표 길이를 ${nextDuration}초(${nextDuration * fps}f)로 재계산했습니다.`);
  };

  const handleChangeFps = (nextFps: PromoFps): void => {
    setFps(nextFps);
    setCurrentFrame(0);
    setIsPlaying(false);
    setStatusNotice(`프레임 레이트를 ${nextFps}fps(${durationSec * nextFps}f)로 맞췄습니다.`);
  };

  const handleChangeAspect = (nextAspect: PromoAspectPreset): void => {
    setAspectPreset(nextAspect);
    setStatusNotice(
      nextAspect === "9:16"
        ? "9:16 세로 쇼츠·릴스(1080×1920) 구도로 전환했습니다."
        : "16:9 가로 예고편(1920×1080) 구도로 전환했습니다.",
    );
  };

  const handleSeekFrame = (frame: number): void => {
    setIsPlaying(false);
    setCurrentFrame(frame);
  };

  const handleSeekCutDelta = (delta: -1 | 1): void => {
    if (!activeCut) return;
    const cuts = promoPlan.rhythm.cuts;
    const nextIdx = (activeCut.index + delta + cuts.length) % cuts.length;
    const targetCut = cuts[nextIdx];
    if (!targetCut) return;
    handleSeekFrame(targetCut.startFrame);
  };

  const handleUpdateActiveCutMetric = (
    field: "actionIntensity" | "gutterWhitespaceRatio",
    value: number,
  ): void => {
    if (!activeCut) return;
    setCutsOverride(
      effectiveCuts.map((cut) => (cut.id === activeCut.id ? { ...cut, [field]: value } : cut)),
    );
  };

  const handleCopyManifest = (): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(manifestJson).catch(() => undefined);
    }
    setCopiedNotice(true);
    setStatusNotice("Remotion 프로모 JSON 매니페스트를 복사했습니다.");
    window.setTimeout(() => setCopiedNotice(false), 1800);
  };

  const handleDownloadManifest = (): void => {
    downloadManifestJson(`${promoPlan.manifest.compositionId}.json`, manifestJson);
    setStatusNotice(`${promoPlan.manifest.compositionId}.json 파일을 저장했습니다.`);
  };

  const canvasWidth = aspectPreset === "9:16" ? 270 : 480;
  const canvasHeight = aspectPreset === "9:16" ? 480 : 270;
  const seriesLabel = `${activePreset?.seriesTitle ?? ""} · ${activePreset?.episodeTitle ?? ""}`;

  return (
    <section
      aria-label="웹툰 컷 리듬 2.5D 무빙툰 프로모 자동 연출기"
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg sm:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-accent bg-accent-soft text-accent">
              <Film className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
              컷 리듬 · 2.5D 무빙툰 프로모 자동 연출기
            </h2>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            말풍선 밀도·여백 호흡·액션 강도로 9:16 쇼츠 템포와 3평면 패럴랙스, 오디오 큐를 자동
            설계합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1.5 font-semibold text-fg">
            <Music className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {promoPlan.rhythm.recommendedBpm} BPM
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-good bg-good-soft px-2.5 py-1.5 font-semibold text-good">
            {totalFrames}f · 오차 {promoPlan.rhythm.frameDrift}f
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1.5 font-medium text-fg-2">
            {promoPlan.manifest.width}×{promoPlan.manifest.height} · {fps}fps
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="스토리보드 프리셋">
          {BUILTIN_STORYBOARD_PRESETS.map((preset) => {
            const active = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectPreset(preset.id)}
                className={active ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
              >
                <span>{preset.labelKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1" role="group" aria-label="프로모 길이">
              {([15, 30] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  aria-pressed={durationSec === sec}
                  onClick={() => handleChangeDuration(sec)}
                  className={durationSec === sec ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
                >
                  <span className="tabular-nums">{sec}초</span>
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1" role="group" aria-label="화면비">
              <button
                type="button"
                aria-pressed={aspectPreset === "9:16"}
                onClick={() => handleChangeAspect("9:16")}
                className={aspectPreset === "9:16" ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
              >
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular-nums">9:16</span>
              </button>
              <button
                type="button"
                aria-pressed={aspectPreset === "16:9"}
                onClick={() => handleChangeAspect("16:9")}
                className={aspectPreset === "16:9" ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
              >
                <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular-nums">16:9</span>
              </button>
            </div>

            <div className="inline-flex items-center gap-1" role="group" aria-label="프레임 레이트">
              {([30, 60] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  aria-pressed={fps === rate}
                  onClick={() => handleChangeFps(rate)}
                  className={fps === rate ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
                >
                  <span className="tabular-nums">{rate}fps</span>
                </button>
              ))}
            </div>
          </div>

          {cutsOverride && (
            <button
              type="button"
              onClick={() => {
                setCutsOverride(null);
                setStatusNotice("수동 조절한 컷 강도를 프리셋 기본값으로 복원했습니다.");
              }}
              className={BTN_OUTLINE}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>컷 수치 초기화</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 좌측: 2.5D 실시간 패럴랙스 캔버스 스테이지 & 트랜스포트 */}
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              2.5D 패럴랙스 프리뷰
            </span>
            <span className="text-xs font-medium text-fg-2 tabular-nums">
              {safeFrame}f / {totalFrames}f · {formatTimeSec(safeFrame, fps)}
            </span>
          </div>

          <div className="flex items-center justify-center rounded-xl border border-line bg-reader-canvas p-3">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              aria-label={`2.5D 패럴랙스 프리뷰 캔버스 (${aspectPreset})`}
              className={
                aspectPreset === "9:16"
                  ? "aspect-[9/16] max-h-[380px] w-auto rounded-lg border border-line-strong bg-reader-canvas text-fg"
                  : "aspect-video w-full max-w-[440px] rounded-lg border border-line-strong bg-reader-canvas text-fg"
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-scrubber`} className="sr-only">
              프리뷰 프레임 스크러버
            </label>
            <input
              id={`${uid}-scrubber`}
              type="range"
              min={0}
              max={Math.max(0, totalFrames - 1)}
              step={1}
              value={safeFrame}
              aria-label="프리뷰 프레임 스크러버"
              onChange={(event) => handleSeekFrame(Number(event.target.value))}
              className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPlaying((prev) => !prev)}
                  className={BTN_PRIMARY}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>일시정지</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>재생</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="이전 컷"
                  onClick={() => handleSeekCutDelta(-1)}
                  className={BTN_OUTLINE}
                >
                  <SkipBack className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>이전 컷</span>
                </button>
                <button
                  type="button"
                  aria-label="다음 컷"
                  onClick={() => handleSeekCutDelta(1)}
                  className={BTN_OUTLINE}
                >
                  <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>다음 컷</span>
                </button>
              </div>

              <button
                type="button"
                aria-label="처음 프레임으로 이동"
                onClick={() => handleSeekFrame(0)}
                className={BTN_OUTLINE}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>0f</span>
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-2.5 text-xs tabular-nums">
            <div>
              <dt className="text-fg-3">카메라 줌 / 틸트</dt>
              <dd className="font-semibold text-fg">
                {currentPose.zoom.toFixed(2)}x · {currentPose.tiltDeg.toFixed(1)}°
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">패닝 (X / Y)</dt>
              <dd className="font-semibold text-fg">
                {currentPose.panX.toFixed(2)} / {currentPose.panY.toFixed(2)}
              </dd>
            </div>
            <div className="col-span-2 border-t border-line pt-1.5">
              <dt className="text-fg-3">다중 평면 시차 속도</dt>
              <dd className="font-semibold text-fg-2">
                BG {currentPose.layerSpeeds.bgParallax.toFixed(2)}x · MG{" "}
                {currentPose.layerSpeeds.mgParallax.toFixed(2)}x · FG{" "}
                {currentPose.layerSpeeds.fgParallax.toFixed(2)}x
              </dd>
            </div>
          </dl>
        </div>

        {/* 우측: 컷별 비트 타임라인 · 오디오 큐시트 · Remotion 매니페스트 인스펙터 */}
        <CutTimelineAndAudioInspector
          promoPlan={promoPlan}
          activeCut={activeCut}
          activeTrack={activeTrack}
          activeCutSfxList={activeCutSfxList}
          seriesLabel={seriesLabel}
          inspectorTab={inspectorTab}
          manifestJson={manifestJson}
          copiedNotice={copiedNotice}
          onChangeTab={setInspectorTab}
          onSeekFrame={handleSeekFrame}
          onUpdateCutMetric={handleUpdateActiveCutMetric}
          onCopyManifest={handleCopyManifest}
          onDownloadManifest={handleDownloadManifest}
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
      >
        <span>
          {statusNotice ||
            `${activePreset?.labelKo ?? ""} · 클라이맥스 ${promoPlan.rhythm.climaxFrame}f · BGM ${promoPlan.audioCueSheet.bgmTransitions.length}구간 · SFX ${promoPlan.audioCueSheet.sfxMarkers.length}개 배치 완료`}
        </span>
        <span className="tabular-nums text-fg-3">schema {promoPlan.manifest.schemaVersion}</span>
      </div>
    </section>
  );
}
