import { Download, Film, FileText, Layers, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { downloadBlob } from "../export/studio-export";
import { formatTimelapseTime } from "../drawing/studio-timelapse";

import { buildShortformInputFromHistory } from "./timelapse-history-stage-adapter";
import {
  evaluateShortformFrameAt,
  exportShortformSubtitlesWebVtt,
  planLocalTimelapseShortform,
} from "./timelapse-shortform-planner";
import {
  SHORTFORM_ASPECT_SPECS,
  SHORTFORM_PLATFORM_PROFILES,
  WEBTOON_PROCESS_STAGES,
  WEBTOON_PROCESS_STAGE_BY_ID,
  type ShortformAspectPreset,
  type ShortformCameraIntensity,
  type ShortformFps,
  type ShortformPlatformId,
  type WebtoonProcessStage,
} from "./timelapse-stage-types";

import type { HistorySnapshot } from "../studio-history-labels";
import type { TimelapseStepInfo } from "../studio-timelapse";

export interface StudioTimelapseShortformPlannerProps {
  readonly title: string;
  readonly pageId: string;
  readonly history: readonly HistorySnapshot[];
  readonly steps: readonly TimelapseStepInfo[];
}

const DURATION_OPTIONS = [15, 30, 60] as const;

const INTENSITY_OPTIONS: ReadonlyArray<{
  readonly id: ShortformCameraIntensity;
  readonly labelKo: string;
}> = [
  { id: "static", labelKo: "정적(모션 축소)" },
  { id: "subtle", labelKo: "잔잔한 팬" },
  { id: "balanced", labelKo: "균형" },
  { id: "cinematic", labelKo: "시네마틱" },
];

const PLATFORM_IDS: readonly ShortformPlatformId[] = [
  "youtube-shorts",
  "instagram-reels",
  "x-short",
  "instagram-square",
];

function formatMbps(bps: number): string {
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

function sanitizeFileStem(title: string): string {
  const cleaned = title.trim().replace(/[\\/:*?"<>|]+/gu, "-");
  return cleaned || "toonstudio-shortform";
}

export function StudioTimelapseShortformPlanner({
  title,
  pageId,
  history,
  steps,
}: StudioTimelapseShortformPlannerProps) {
  const [aspectPreset, setAspectPreset] = useState<ShortformAspectPreset>("9:16");
  const [platform, setPlatform] = useState<ShortformPlatformId>("youtube-shorts");
  const [fps, setFps] = useState<ShortformFps>(30);
  const [targetDurationSec, setTargetDurationSec] = useState<number>(30);
  const [cameraIntensity, setCameraIntensity] = useState<ShortformCameraIntensity>("balanced");
  const [enabledStages, setEnabledStages] = useState<readonly WebtoonProcessStage[]>(() =>
    WEBTOON_PROCESS_STAGES.map((s) => s.id),
  );
  const [scrubMs, setScrubMs] = useState<number>(0);

  const enabledStageSet = useMemo(() => new Set<WebtoonProcessStage>(enabledStages), [enabledStages]);

  const plan = useMemo(() => {
    const input = buildShortformInputFromHistory({
      title,
      pageId,
      history,
      steps,
      enabledStages: enabledStageSet,
      aspectPreset,
      platform,
      fps,
      targetDurationSec,
      cameraIntensity,
      reducedMotion: cameraIntensity === "static",
    });
    return planLocalTimelapseShortform(input);
  }, [
    title,
    pageId,
    history,
    steps,
    enabledStageSet,
    aspectPreset,
    platform,
    fps,
    targetDurationSec,
    cameraIntensity,
  ]);

  const effectiveScrubMs = Math.min(scrubMs, plan.totalDurationMs);
  const currentFrame = useMemo(
    () => evaluateShortformFrameAt(plan, effectiveScrubMs),
    [plan, effectiveScrubMs],
  );

  function handleAspectChange(nextAspect: ShortformAspectPreset) {
    setAspectPreset(nextAspect);
    if (nextAspect === "1:1") {
      setPlatform("instagram-square");
    } else if (platform === "instagram-square") {
      setPlatform("youtube-shorts");
    }
  }

  function handlePlatformChange(nextPlatform: ShortformPlatformId) {
    setPlatform(nextPlatform);
    setAspectPreset(SHORTFORM_PLATFORM_PROFILES[nextPlatform].defaultAspect);
  }

  function toggleStage(stageId: WebtoonProcessStage) {
    setEnabledStages((prev) => {
      if (prev.includes(stageId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== stageId);
      }
      return WEBTOON_PROCESS_STAGES.map((s) => s.id).filter(
        (id) => id === stageId || prev.includes(id),
      );
    });
  }

  function handleDownloadSubtitles() {
    const vtt = exportShortformSubtitlesWebVtt(plan.subtitleCues);
    const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
    downloadBlob(blob, `${sanitizeFileStem(plan.title)}-${plan.aspectPreset.replace(":", "x")}.vtt`);
  }

  function handleDownloadPlanJson() {
    const blob = new Blob([`${JSON.stringify(plan, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    downloadBlob(
      blob,
      `${sanitizeFileStem(plan.title)}-${plan.aspectPreset.replace(":", "x")}-${plan.fps}fps-plan.json`,
    );
  }

  const fromLabel = currentFrame.fromStage
    ? WEBTOON_PROCESS_STAGE_BY_ID[currentFrame.fromStage].labelKo
    : "-";
  const toLabel = currentFrame.toStage
    ? WEBTOON_PROCESS_STAGE_BY_ID[currentFrame.toStage].labelKo
    : "-";
  const isDissolving =
    currentFrame.fromStage != null &&
    currentFrame.toStage != null &&
    currentFrame.fromStage !== currentFrame.toStage &&
    currentFrame.dissolveAlpha < 0.999;

  const safeTopPct = (plan.platform.safeAreaPx.top / plan.height) * 100;
  const safeBottomPct = (plan.platform.safeAreaPx.bottom / plan.height) * 100;
  const safeLeftPct = (plan.platform.safeAreaPx.left / plan.width) * 100;
  const safeRightPct = (plan.platform.safeAreaPx.right / plan.width) * 100;

  return (
    <section
      aria-label="SNS 숏폼 타임랩스 프리뷰 플래너"
      className="flex flex-col gap-3"
    >
      <div className="rounded-lg border border-line bg-card/60 px-3 py-2 text-[0.72rem] leading-relaxed text-fg-3">
        공정 단계(콘티→선화→밑색→명암→식자)와 원고 컷 배열을 바탕으로 9:16·1:1 SNS 홍보용
        카메라 팬·줌·공정 디졸브 타임라인과 자막 큐를 로컬에서 ₩0으로 설계합니다.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-2">화면 비율</span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="숏폼 화면 비율 선택">
            {(["9:16", "1:1"] as const).map((ratio) => {
              const active = aspectPreset === ratio;
              const spec = SHORTFORM_ASPECT_SPECS[ratio];
              return (
                <button
                  key={ratio}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleAspectChange(ratio)}
                  className={`min-h-11 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  <div>{ratio}</div>
                  <div className="text-[0.65rem] font-normal text-fg-3">
                    {spec.width}×{spec.height}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-2">프레임레이트</span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="프레임레이트 선택">
            {([30, 60] as const).map((candidateFps) => {
              const active = fps === candidateFps;
              return (
                <button
                  key={candidateFps}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFps(candidateFps)}
                  className={`min-h-11 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  {candidateFps}fps
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-fg-2">
          채널 프리셋
          <select
            value={platform}
            onChange={(e) => handlePlatformChange(e.target.value as ShortformPlatformId)}
            className="h-9 rounded-lg border border-line bg-canvas px-2 text-xs text-fg outline-none focus:border-accent/50"
          >
            {PLATFORM_IDS.map((id) => (
              <option key={id} value={id}>
                {SHORTFORM_PLATFORM_PROFILES[id].labelKo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-2">
          목표 길이
          <select
            value={targetDurationSec}
            onChange={(e) => setTargetDurationSec(Number(e.target.value))}
            className="h-9 rounded-lg border border-line bg-canvas px-2 text-xs text-fg outline-none focus:border-accent/50"
          >
            {DURATION_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {sec}초
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-2">
          카메라 연출
          <select
            value={cameraIntensity}
            onChange={(e) => setCameraIntensity(e.target.value as ShortformCameraIntensity)}
            className="h-9 rounded-lg border border-line bg-canvas px-2 text-xs text-fg outline-none focus:border-accent/50"
          >
            {INTENSITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.labelKo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg-2">
          <Layers size={13} aria-hidden /> 포함 공정 (콘티→선화→밑색→명암→식자)
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="포함 공정 단계">
          {WEBTOON_PROCESS_STAGES.map((stage) => {
            const active = enabledStageSet.has(stage.id);
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStage(stage.id)}
                className={`min-h-9 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "border-accent/60 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised"
                }`}
              >
                {stage.shortBadgeKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-canvas p-3 sm:grid-cols-[164px_1fr]">
        <figure className="mx-auto flex w-full max-w-[164px] flex-col items-center gap-1.5">
          <div
            data-testid="shortform-preview-viewport"
            className={`relative w-full overflow-hidden rounded-lg border border-line bg-panel ${
              aspectPreset === "9:16" ? "aspect-[9/16]" : "aspect-square"
            }`}
          >
            <div
              className="pointer-events-none absolute border border-dashed border-accent/50"
              style={{
                top: `${safeTopPct}%`,
                bottom: `${safeBottomPct}%`,
                left: `${safeLeftPct}%`,
                right: `${safeRightPct}%`,
              }}
              aria-hidden
            />
            <div className="absolute inset-x-2 top-2 flex items-center justify-between rounded bg-card/90 px-1.5 py-0.5 text-[0.64rem] font-semibold text-fg">
              <span>{isDissolving ? `${fromLabel} → ${toLabel}` : toLabel}</span>
              <span className="numeral text-accent">
                {currentFrame.camera.zoom.toFixed(2)}×
              </span>
            </div>
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 rounded border border-line bg-card/80 px-2 py-1.5 text-center text-[0.66rem] text-fg-2">
              <div>컷 {currentFrame.cutId ?? "-"}</div>
              <div className="mt-0.5 text-[0.62rem] text-fg-3">
                크롭 {Math.round(currentFrame.cropRectPx.width)}×
                {Math.round(currentFrame.cropRectPx.height)}px
              </div>
              {isDissolving && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.round(currentFrame.dissolveAlpha * 100)}%` }}
                  />
                </div>
              )}
            </div>
            {currentFrame.activeSubtitle && (
              <div
                className="absolute inset-x-2 rounded bg-card/95 px-1.5 py-1 text-center text-[0.63rem] font-medium leading-snug text-fg"
                style={{ bottom: `${Math.min(34, safeBottomPct)}%` }}
              >
                {currentFrame.activeSubtitle.text}
              </div>
            )}
          </div>
          <figcaption className="text-[0.65rem] text-fg-3">
            안전 여백 · {plan.width}×{plan.height} · {plan.fps}fps
          </figcaption>
        </figure>

        <div className="flex flex-col justify-between gap-2.5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-fg-2">
              <span className="flex items-center gap-1 font-semibold">
                <SlidersHorizontal size={13} aria-hidden /> 키프레임 스크러버
              </span>
              <span className="numeral text-[0.7rem] text-fg-3">
                {formatTimelapseTime(currentFrame.timeMs)} / {formatTimelapseTime(plan.totalDurationMs)} (
                #{currentFrame.frameIndex}/{plan.totalFrames})
              </span>
            </div>
            <input
              type="range"
              aria-label="숏폼 타임라인 위치"
              min={0}
              max={plan.totalDurationMs}
              step={Math.max(16, Math.round(1000 / plan.fps))}
              value={effectiveScrubMs}
              onChange={(e) => setScrubMs(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="flex flex-wrap gap-1">
              {plan.segments.map((seg) => (
                <button
                  key={seg.segmentId}
                  type="button"
                  onClick={() => setScrubMs(seg.startMs)}
                  className={`rounded border px-2 py-0.5 text-[0.65rem] font-medium transition-colors ${
                    currentFrame.segmentId === seg.segmentId
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-3 hover:bg-raised"
                  }`}
                >
                  {seg.isFinalShowcase
                    ? "완성 홀드"
                    : WEBTOON_PROCESS_STAGE_BY_ID[seg.toStage].labelKo}
                </button>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-1.5 rounded-lg border border-line bg-card/70 p-2 text-[0.68rem]">
            <div>
              <dt className="text-fg-3">예상 용량 · 비트레이트</dt>
              <dd className="numeral font-semibold text-fg">
                {plan.encodingEstimate.estimatedSizeLabel} ·{" "}
                {formatMbps(plan.encodingEstimate.videoBitsPerSecond)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">키프레임 · 자막 큐</dt>
              <dd className="numeral font-semibold text-fg">
                {plan.keyframes.length}개 · 자막 {plan.subtitleCues.length}줄
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">로컬 인코딩 비용</dt>
              <dd className="font-semibold text-good">
                ₩{plan.encodingEstimate.localCostKrw} (브라우저 WebM)
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">예상 로컬 생성 시간</dt>
              <dd className="numeral font-semibold text-fg">
                약 {plan.encodingEstimate.estimatedLocalRenderSec}초
              </dd>
            </div>
          </dl>

          {plan.encodingEstimate.warnings.length > 0 && (
            <ul className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[0.68rem] text-fg-2">
              {plan.encodingEstimate.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleDownloadSubtitles}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised"
            >
              <FileText size={13} aria-hidden /> WebVTT 자막 저장
            </button>
            <button
              type="button"
              onClick={handleDownloadPlanJson}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent/60 bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft/80"
            >
              <Download size={13} aria-hidden /> 타임라인 JSON 저장
            </button>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[0.68rem] text-fg-3">
        <Film size={12} aria-hidden />
        {plan.cuts.length}개 컷 · {plan.activeStages.length}단계 공정 · {plan.platform.labelKo} 안전
        여백 기준 계산 완료
      </p>
    </section>
  );
}
