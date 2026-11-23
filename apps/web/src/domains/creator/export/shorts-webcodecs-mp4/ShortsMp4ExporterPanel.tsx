/**
 * 브라우저 WebCodecs MP4 + RIFF/WAVE 오디오 + WebVTT/SRT 9:16 숏폼 웹툰 익스포터 패널.
 *
 * 9:16 / 1:1 / 16:9 포맷 전환, 30/60fps 선택, 감정 BGM·자막 토글, 실시간 컷 카메라 무빙 프리뷰,
 * 실제 `.mp4` / `.wav` / `.vtt` / `.srt` 바이너리·텍스트 다운로드를 Calm Atelier UI로 제공한다.
 */

import "./shorts-mp4-exporter.css";

import {
  CheckCircle2,
  Download,
  Film,
  Music,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Subtitles,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildShortsExportFileName,
  createShortsBinaryBlob,
  createShortsTextBlob,
  encodeAndAssembleShortsPackage,
  type ShortsEncodingBackend,
  type ShortsMp4ExportPackageResult,
  type ShortsMp4ExportProgress,
  type ShortsMp4ExportRuntimeDeps,
} from "./shorts-mp4-audio-muxer";
import {
  DEFAULT_SHORTS_DEMO_CUTS,
  SHORTS_CAMERA_MOTION_LABELS,
  SHORTS_EMOTION_PROFILES,
  SHORTS_FORMAT_SPECS,
  compileShortsTimeline,
  type ShortsAspectRatio,
  type ShortsFps,
  type ShortsWebtoonCutInput,
} from "./shorts-timeline-compiler";

export interface ShortsMp4ExporterPanelProps {
  readonly cuts?: readonly ShortsWebtoonCutInput[];
  readonly projectTitle?: string;
  readonly locale?: "ko" | "en";
  readonly initialAspectRatio?: ShortsAspectRatio;
  readonly initialFps?: ShortsFps;
  readonly encoderDeps?: ShortsMp4ExportRuntimeDeps;
  readonly onExportComplete?: (result: ShortsMp4ExportPackageResult) => void;
}

const ASPECT_RATIO_OPTIONS: readonly ShortsAspectRatio[] = ["9:16", "1:1", "16:9"];
const FPS_OPTIONS: readonly ShortsFps[] = [30, 60];
const HANGUL_PATTERN = /[가-힣]/u;

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  if (typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatKilobytes(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(2)} MB`;
  }
  return `${(bytes / 1_024).toFixed(1)} KB`;
}

function formatBackendLabel(backend: ShortsEncodingBackend, isKo: boolean): string {
  switch (backend) {
    case "webcodecs-hw-avc1":
      return isKo ? "WebCodecs 하드웨어 H.264(avc1)" : "WebCodecs Hardware H.264 (avc1)";
    case "webcodecs-sw-avc1":
      return isKo ? "WebCodecs 소프트웨어 H.264(avc1)" : "WebCodecs Software H.264 (avc1)";
    case "synthetic-preview-mp4":
      return isKo
        ? "구조 검증용 MP4 컨테이너 (브라우저 HW 인코더 미감지)"
        : "Preview ISO-BMFF Container (HW Encoder Unavailable)";
  }
}

export function ShortsMp4ExporterPanel({
  cuts = DEFAULT_SHORTS_DEMO_CUTS,
  projectTitle = "toonstudio-episode-01",
  locale,
  initialAspectRatio = "9:16",
  initialFps = 30,
  encoderDeps,
  onExportComplete,
}: ShortsMp4ExporterPanelProps): ReactElement {
  const storeLang = useI18n((state) => state.lang);
  const effectiveLang = locale ?? storeLang;
  const isKo = effectiveLang.toLowerCase().startsWith("ko");
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const scrubberId = useId();
  const abortRef = useRef<AbortController | null>(null);

  const [aspectRatio, setAspectRatio] = useState<ShortsAspectRatio>(initialAspectRatio);
  const [fps, setFps] = useState<ShortsFps>(initialFps);
  const [includeAudio, setIncludeAudio] = useState<boolean>(true);
  const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
  const [previewFrameIndex, setPreviewFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ShortsMp4ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<ShortsMp4ExportPackageResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null);

  const timeline = useMemo(
    () =>
      compileShortsTimeline(cuts, {
        aspectRatio,
        fps,
        includeSubtitles,
        includeAudioCues: includeAudio,
        locale: isKo ? "ko" : "en",
      }),
    [cuts, aspectRatio, fps, includeSubtitles, includeAudio, isKo],
  );

  const maxFrameIndex = Math.max(0, timeline.frames.length - 1);
  const clampedFrameIndex = Math.min(previewFrameIndex, maxFrameIndex);
  const currentFrame = timeline.frames[clampedFrameIndex] ?? timeline.frames[0];
  const currentSegment =
    timeline.segments[currentFrame?.cutIndex ?? 0] ?? timeline.segments[0];
  const currentAudioCue = includeAudio
    ? timeline.audioCues.find((cue) => cue.cutId === currentSegment?.cutId) ?? null
    : null;

  useEffect(() => {
    if (!isPlaying || maxFrameIndex <= 0) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let rafId = 0;
    let lastStamp = 0;
    const frameIntervalMs = 1_000 / timeline.fps;

    const tick = (stamp: number): void => {
      if (lastStamp === 0) lastStamp = stamp;
      if (stamp - lastStamp >= frameIntervalMs) {
        const steps = Math.max(1, Math.floor((stamp - lastStamp) / frameIntervalMs));
        lastStamp = stamp;
        setPreviewFrameIndex((prev) => (prev + steps) % (maxFrameIndex + 1));
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, maxFrameIndex, timeline.fps]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const safeTitle =
    !isKo && HANGUL_PATTERN.test(projectTitle) ? "toonstudio-shorts" : projectTitle;

  const handleRunExport = async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExporting(true);
    setErrorMessage(null);
    setLastDownloadedFile(null);

    try {
      const result = await encodeAndAssembleShortsPackage(timeline, {
        includeAudio,
        signal: controller.signal,
        onProgress: setProgress,
        deps: encoderDeps,
      });
      setExportResult(result);
      onExportComplete?.(result);
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setErrorMessage(pick("내보내기가 취소되었습니다.", "Export was cancelled."));
      } else {
        setErrorMessage(
          pick(
            "MP4 패키지를 생성하는 중 문제가 생겼어요. 다시 시도해 주세요.",
            "Failed to generate the MP4 export package. Please retry.",
          ),
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleStepCut = (delta: -1 | 1): void => {
    const activeCutIndex = currentSegment?.cutIndex ?? 0;
    const nextIndex = Math.min(
      timeline.segments.length - 1,
      Math.max(0, activeCutIndex + delta),
    );
    const nextSegment = timeline.segments[nextIndex];
    if (nextSegment) {
      setIsPlaying(false);
      setPreviewFrameIndex(nextSegment.startFrame);
    }
  };

  const handleDownloadMp4 = (): void => {
    if (!exportResult) return;
    const filename = buildShortsExportFileName(safeTitle, aspectRatio, "mp4");
    triggerBrowserDownload(createShortsBinaryBlob(exportResult.mp4.bytes, exportResult.mp4.mimeType), filename);
    setLastDownloadedFile(filename);
  };

  const handleDownloadWav = (): void => {
    if (!exportResult?.wav) return;
    const filename = buildShortsExportFileName(safeTitle, aspectRatio, "wav");
    triggerBrowserDownload(createShortsBinaryBlob(exportResult.wav.bytes, exportResult.wav.mimeType), filename);
    setLastDownloadedFile(filename);
  };

  const handleDownloadVtt = (): void => {
    const vttContent = exportResult ? exportResult.webVtt : timeline.webVtt;
    const filename = buildShortsExportFileName(safeTitle, aspectRatio, "vtt");
    triggerBrowserDownload(createShortsTextBlob(vttContent, "text/vtt;charset=utf-8"), filename);
    setLastDownloadedFile(filename);
  };

  const handleDownloadSrt = (): void => {
    const srtContent = exportResult ? exportResult.srt : timeline.srt;
    const filename = buildShortsExportFileName(safeTitle, aspectRatio, "srt");
    triggerBrowserDownload(createShortsTextBlob(srtContent, "application/x-subrip;charset=utf-8"), filename);
    setLastDownloadedFile(filename);
  };

  const previewTranslateX = currentFrame ? Math.round(currentFrame.pose.translateXPx * 0.08) : 0;
  const previewTranslateY = currentFrame ? Math.round(currentFrame.pose.translateYPx * 0.08) : 0;
  const previewScale = currentFrame ? currentFrame.pose.scale : 1;
  const previewOpacity = currentFrame ? currentFrame.opacity : 1;

  const activeEmotionProfile = currentSegment
    ? SHORTS_EMOTION_PROFILES[currentSegment.emotion]
    : SHORTS_EMOTION_PROFILES.calm;

  return (
    <section
      className="shorts-mp4-panel"
      aria-label={pick("숏폼 WebCodecs MP4 익스포터", "Shorts WebCodecs MP4 Exporter")}
      data-testid="shorts-mp4-exporter-panel"
    >
      <header className="shorts-mp4-header">
        <div>
          <div className="shorts-mp4-title-row">
            <Film size={18} aria-hidden="true" />
            <h2 className="shorts-mp4-title">
              {pick("9:16 숏폼 WebCodecs MP4 익스포터", "9:16 Shorts WebCodecs MP4 Exporter")}
            </h2>
          </div>
          <p className="shorts-mp4-subtitle">
            {pick(
              "웹툰 세로 컷을 브라우저 하드웨어 H.264 MP4 바이너리, 감정 BGM·효과음 WAV 오디오, WebVTT·SRT 자막으로 바로 조립합니다.",
              "Compiles vertical webtoon cuts directly in the browser into H.264 MP4 video, emotion-mixed WAV audio, and WebVTT/SRT subtitles.",
            )}
          </p>
        </div>
        <span className="shorts-mp4-spec-badge shorts-mp4-num" data-testid="shorts-mp4-spec-badge">
          {`${timeline.width}×${timeline.height} · ${timeline.fps}fps · ${timeline.totalDurationSec.toFixed(1)}s`}
        </span>
      </header>

      <div className="shorts-mp4-workspace">
        <div className="shorts-mp4-controls">
          <div className="shorts-mp4-section">
            <p className="shorts-mp4-section-label">{pick("화면 비율 포맷", "Aspect Ratio Format")}</p>
            <div
              className="shorts-mp4-group"
              role="group"
              aria-label={pick("화면 비율 선택", "Select aspect ratio")}
            >
              {ASPECT_RATIO_OPTIONS.map((ratio) => {
                const spec = SHORTS_FORMAT_SPECS[ratio];
                return (
                  <button
                    key={ratio}
                    type="button"
                    aria-pressed={aspectRatio === ratio}
                    data-testid={`shorts-format-${ratio}`}
                    className="shorts-mp4-btn"
                    onClick={() => {
                      setAspectRatio(ratio);
                      setExportResult(null);
                    }}
                  >
                    {pick(spec.labelKo, spec.labelEn)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shorts-mp4-section">
            <p className="shorts-mp4-section-label">
              {pick("프레임레이트 · 오디오 · 자막", "Frame Rate · Audio · Subtitles")}
            </p>
            <div className="shorts-mp4-group">
              {FPS_OPTIONS.map((optionFps) => (
                <button
                  key={optionFps}
                  type="button"
                  aria-pressed={fps === optionFps}
                  data-testid={`shorts-fps-${optionFps}`}
                  className="shorts-mp4-btn shorts-mp4-num"
                  onClick={() => {
                    setFps(optionFps);
                    setPreviewFrameIndex(0);
                    setExportResult(null);
                  }}
                >
                  {`${optionFps}fps`}
                </button>
              ))}

              <button
                type="button"
                aria-pressed={includeAudio}
                data-testid="shorts-toggle-audio"
                className="shorts-mp4-btn"
                onClick={() => {
                  setIncludeAudio((prev) => !prev);
                  setExportResult(null);
                }}
              >
                <Music size={15} aria-hidden="true" />
                {pick("감정 BGM·SFX WAV", "Emotion BGM & SFX WAV")}
              </button>

              <button
                type="button"
                aria-pressed={includeSubtitles}
                data-testid="shorts-toggle-subtitles"
                className="shorts-mp4-btn"
                onClick={() => {
                  setIncludeSubtitles((prev) => !prev);
                  setExportResult(null);
                }}
              >
                <Subtitles size={15} aria-hidden="true" />
                {pick("WebVTT·SRT 자막", "WebVTT & SRT Subtitles")}
              </button>
            </div>
          </div>

          <div className="shorts-mp4-section">
            <p className="shorts-mp4-section-label">
              {pick(
                `컷 타임라인 (${timeline.segments.length}컷 · 크로스페이드 ${timeline.crossfadeSec}초)`,
                `Cut Timeline (${timeline.segments.length} cuts · ${timeline.crossfadeSec}s crossfade)`,
              )}
            </p>
            <ol
              className="shorts-mp4-cut-list"
              aria-label={pick("컷 카메라 연출 목록", "Cut camera timeline list")}
            >
              {timeline.segments.map((segment) => {
                const isCurrent = segment.cutId === currentSegment?.cutId;
                const motionLabels = SHORTS_CAMERA_MOTION_LABELS[segment.cameraMotion];
                const emotionProfile = SHORTS_EMOTION_PROFILES[segment.emotion];
                return (
                  <li key={segment.cutId}>
                    <button
                      type="button"
                      aria-current={isCurrent ? "true" : undefined}
                      className="shorts-mp4-cut-card"
                      onClick={() => {
                        setIsPlaying(false);
                        setPreviewFrameIndex(segment.startFrame);
                      }}
                    >
                      <span className="shorts-mp4-cut-title">
                        {pick(segment.titleKo, segment.titleEn)}
                      </span>
                      <span className="shorts-mp4-cut-meta shorts-mp4-num">
                        {`${segment.startSec.toFixed(1)}s–${segment.endSec.toFixed(1)}s · ${pick(motionLabels.ko, motionLabels.en)}`}
                      </span>
                      <span className="shorts-mp4-cut-meta">
                        {pick(emotionProfile.labelKo, emotionProfile.labelEn)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="shorts-mp4-group">
            <button
              type="button"
              disabled={isExporting}
              data-testid="shorts-export-generate-btn"
              className="shorts-mp4-btn shorts-mp4-btn--primary"
              onClick={() => {
                void handleRunExport();
              }}
            >
              <Film size={16} aria-hidden="true" />
              {isExporting
                ? pick("MP4·WAV 인코딩 중…", "Encoding MP4 & WAV…")
                : pick("MP4 · WAV · VTT 패키지 생성", "Generate MP4 · WAV · VTT")}
            </button>

            <button
              type="button"
              data-testid="shorts-download-vtt-btn"
              className="shorts-mp4-btn"
              onClick={handleDownloadVtt}
            >
              <Download size={15} aria-hidden="true" />
              {pick("자막 .vtt 받기", "Download .vtt")}
            </button>

            <button
              type="button"
              data-testid="shorts-download-srt-btn"
              className="shorts-mp4-btn"
              onClick={handleDownloadSrt}
            >
              <Download size={15} aria-hidden="true" />
              {pick("자막 .srt 받기", "Download .srt")}
            </button>
          </div>
        </div>

        <div className="shorts-mp4-preview-column">
          <div
            className="shorts-mp4-stage"
            data-aspect={aspectRatio}
            data-testid="shorts-preview-stage"
          >
            <div
              className="shorts-mp4-stage-canvas"
              data-emotion={currentSegment?.emotion ?? "calm"}
              style={{
                transform: `translate3d(${previewTranslateX}px, ${previewTranslateY}px, 0) scale(${previewScale})`,
                opacity: previewOpacity,
              }}
            >
              <div className="shorts-mp4-panel-frame">
                <strong className="shorts-mp4-cut-title">
                  {currentSegment ? pick(currentSegment.titleKo, currentSegment.titleEn) : ""}
                </strong>
                <span className="shorts-mp4-cut-meta shorts-mp4-num">
                  {currentSegment
                    ? `${currentSegment.sourceWidth}×${currentSegment.sourceHeight}`
                    : ""}
                </span>
                <span className="shorts-mp4-cut-meta">
                  {pick(activeEmotionProfile.labelKo, activeEmotionProfile.labelEn)}
                </span>
              </div>
            </div>

            <div className="shorts-mp4-safe-zone" aria-hidden="true" />

            {currentAudioCue ? (
              <div className="shorts-mp4-stage-audio-pill" data-testid="shorts-preview-audio-pill">
                <Music size={12} aria-hidden="true" />
                <span>{pick(currentAudioCue.labelKo, currentAudioCue.labelEn)}</span>
              </div>
            ) : null}

            {includeSubtitles && currentFrame?.activeDialogue ? (
              <div className="shorts-mp4-stage-caption" data-testid="shorts-preview-caption">
                {currentFrame.activeDialogue}
              </div>
            ) : null}
          </div>

          <div className="shorts-mp4-group">
            <button
              type="button"
              className="shorts-mp4-btn"
              aria-label={pick("이전 컷", "Previous cut")}
              onClick={() => handleStepCut(-1)}
            >
              <SkipBack size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="shorts-mp4-btn"
              aria-pressed={isPlaying}
              data-testid="shorts-preview-play-btn"
              onClick={() => setIsPlaying((prev) => !prev)}
            >
              {isPlaying ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {isPlaying ? pick("일시정지", "Pause") : pick("무빙 프리뷰", "Play Preview")}
            </button>
            <button
              type="button"
              className="shorts-mp4-btn"
              aria-label={pick("다음 컷", "Next cut")}
              onClick={() => handleStepCut(1)}
            >
              <SkipForward size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="shorts-mp4-scrubber-wrap">
            <div className="shorts-mp4-scrubber-header shorts-mp4-num">
              <label htmlFor={scrubberId}>{pick("프레임 위치", "Frame Position")}</label>
              <span>
                {`${currentFrame?.timeSec.toFixed(2) ?? "0.00"}s / ${timeline.totalDurationSec.toFixed(2)}s`}
              </span>
            </div>
            <input
              id={scrubberId}
              type="range"
              min={0}
              max={maxFrameIndex}
              value={clampedFrameIndex}
              className="shorts-mp4-scrubber"
              onChange={(event) => {
                setIsPlaying(false);
                setPreviewFrameIndex(Number(event.target.value));
              }}
            />
          </div>

          <div className="shorts-mp4-telemetry shorts-mp4-num" data-testid="shorts-camera-telemetry">
            <span>{`Scale ${previewScale.toFixed(2)}×`}</span>
            <span>{`Pan (${currentFrame?.pose.translateXPx.toFixed(0) ?? 0}, ${currentFrame?.pose.translateYPx.toFixed(0) ?? 0})px`}</span>
            <span>{`Frame ${clampedFrameIndex + 1}/${timeline.totalFrames}`}</span>
          </div>
        </div>
      </div>

      {isExporting && progress ? (
        <div className="shorts-mp4-progress-box" role="status" aria-live="polite">
          <div className="shorts-mp4-scrubber-header shorts-mp4-num">
            <span>{pick("인코딩 및 컨테이너 조립 진행", "Encoding & Container Muxing")}</span>
            <span>{`${progress.percent}% (${progress.processedFrames}/${progress.totalFrames})`}</span>
          </div>
          <div className="shorts-mp4-progress-track">
            <div className="shorts-mp4-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="shorts-mp4-error-box" role="alert">
          <p className="shorts-mp4-subtitle">{errorMessage}</p>
          <div>
            <button
              type="button"
              className="shorts-mp4-btn"
              onClick={() => {
                void handleRunExport();
              }}
            >
              <RotateCcw size={15} aria-hidden="true" />
              {pick("다시 시도", "Retry Export")}
            </button>
          </div>
        </div>
      ) : null}

      {exportResult ? (
        <div className="shorts-mp4-receipt" data-testid="shorts-export-receipt" role="status">
          <div className="shorts-mp4-title-row">
            <CheckCircle2 size={16} aria-hidden="true" />
            <strong>
              {pick("실제 MP4·오디오·자막 패키지 조립 완료", "MP4, Audio & Subtitle Package Ready")}
            </strong>
          </div>
          <p className="shorts-mp4-subtitle">
            {formatBackendLabel(exportResult.backend, isKo)}
          </p>
          <div className="shorts-mp4-receipt-grid shorts-mp4-num">
            <div className="shorts-mp4-receipt-metric">
              <span>{pick("MP4 컨테이너", "MP4 Container")}</span>
              <strong>{formatKilobytes(exportResult.mp4.bytes.byteLength)}</strong>
              <span>
                {exportResult.mp4.inspection.topLevelBoxes.map((box) => box.type).join(" · ")}
              </span>
            </div>
            <div className="shorts-mp4-receipt-metric">
              <span>{pick("WAV 오디오 트랙", "WAV Audio Track")}</span>
              <strong>
                {exportResult.wav
                  ? formatKilobytes(exportResult.wav.bytes.byteLength)
                  : pick("오디오 꺼짐", "Muted")}
              </strong>
              <span>
                {exportResult.wav
                  ? `${exportResult.wav.sampleRate}Hz · 16-bit PCM`
                  : pick("트랙 미포함", "No audio track")}
              </span>
            </div>
            <div className="shorts-mp4-receipt-metric">
              <span>{pick("자막 큐", "Subtitle Cues")}</span>
              <strong>{String(exportResult.timeline.subtitleCues.length)}</strong>
              <span>{"WebVTT · SRT"}</span>
            </div>
          </div>

          <div className="shorts-mp4-group">
            <button
              type="button"
              data-testid="shorts-download-mp4-btn"
              className="shorts-mp4-btn shorts-mp4-btn--download"
              onClick={handleDownloadMp4}
            >
              <Download size={15} aria-hidden="true" />
              {pick("영상 .mp4 다운로드", "Download .mp4")}
            </button>
            {exportResult.wav ? (
              <button
                type="button"
                data-testid="shorts-download-wav-btn"
                className="shorts-mp4-btn shorts-mp4-btn--download"
                onClick={handleDownloadWav}
              >
                <Download size={15} aria-hidden="true" />
                {pick("오디오 .wav 다운로드", "Download .wav")}
              </button>
            ) : null}
          </div>

          {lastDownloadedFile ? (
            <p className="shorts-mp4-cut-meta" data-testid="shorts-last-downloaded">
              {pick(`다운로드 시작됨: ${lastDownloadedFile}`, `Download started: ${lastDownloadedFile}`)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
