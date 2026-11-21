import { CheckCircle2, Film, Play } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  CUTS_CODEC_CANDIDATES,
  CUTS_MOTION_PRESET_LABELS,
  type CutsExportProgress,
  type CutsExportResult,
  type CutsMotionPreset,
  type CutsPreferredCodec,
  type CutsTimelinePlan,
} from "./webcodecs-cuts-exporter";

const TONE_CLASSES = [
  "nextgen-chip--tone-1",
  "nextgen-chip--tone-2",
  "nextgen-chip--tone-3",
  "nextgen-chip--tone-4",
  "nextgen-chip--tone-5",
] as const;

export interface StudioNextGenCutsTabProps {
  readonly cutsDurationSec: 15 | 30 | 45;
  readonly cutsCodec: CutsPreferredCodec;
  readonly cutsPreset: CutsMotionPreset;
  readonly includeSubtitles: boolean;
  readonly includeSfxSync: boolean;
  readonly cutsTimeline: CutsTimelinePlan;
  readonly cutsProgress: CutsExportProgress | null;
  readonly cutsResult: CutsExportResult | null;
  readonly cutsExporting: boolean;
  readonly onChangeDuration: (sec: 15 | 30 | 45) => void;
  readonly onChangeCodec: (codec: CutsPreferredCodec) => void;
  readonly onChangePreset: (preset: CutsMotionPreset) => void;
  readonly onToggleSubtitles: () => void;
  readonly onToggleSfxSync: () => void;
  readonly onRunExport: () => void;
}

export function StudioNextGenCutsTab({
  cutsDurationSec,
  cutsCodec,
  cutsPreset,
  includeSubtitles,
  includeSfxSync,
  cutsTimeline,
  cutsProgress,
  cutsResult,
  cutsExporting,
  onChangeDuration,
  onChangeCodec,
  onChangePreset,
  onToggleSubtitles,
  onToggleSfxSync,
  onRunExport,
}: StudioNextGenCutsTabProps) {
  const bt = useBilingual("StudioNextGenCutsTab");

  return (
    <section
      id="nextgen-panel-cuts"
      role="tabpanel"
      aria-labelledby="nextgen-tab-cuts"
      data-testid="nextgen-panel-cuts"
      className="nextgen-hub__panel space-y-4"
    >
      <div className="nextgen-hub__card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-black text-fg">
              <Film size={16} className="text-accent" aria-hidden="true" />
              {bt("30초 컷츠 무빙 웹툰 자동 연출", "30s Cuts Moving Webtoon Exporter")}
            </h4>
            <p className="mt-0.5 text-xs text-fg-2">
              {bt(
                "웹툰 컷에 패럴랙스·줌인 움직임과 자막·효과음을 자동으로 붙여 세로 숏폼 영상으로 내보냅니다.",
                "Adds automatic parallax, zoom motion, subtitles, and SFX cues to export vertical Cuts video.",
              )}
            </p>
          </div>
          <span className="rounded-full border border-accent/40 bg-accent-soft/45 px-3 py-1 text-xs font-bold text-fg tabular-nums">
            {`${cutsTimeline.width}×${cutsTimeline.height} · ${cutsTimeline.fps}fps · ${cutsTimeline.totalDurationSec}s`}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-fg-2">{bt("영상 길이", "Duration")}</span>
            <div className="flex gap-1.5">
              {([15, 30, 45] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  aria-pressed={cutsDurationSec === sec}
                  onClick={() => onChangeDuration(sec)}
                  className={cn(
                    "min-h-11 flex-1 rounded-xl border text-xs font-bold tabular-nums",
                    cutsDurationSec === sec
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-card text-fg-2",
                  )}
                >
                  {`${sec}초`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold text-fg-2">{bt("영상 코덱", "Video Codec")}</span>
            <div className="flex gap-1.5">
              {(["av1", "h264"] as const).map((codec) => (
                <button
                  key={codec}
                  type="button"
                  aria-pressed={cutsCodec === codec}
                  onClick={() => onChangeCodec(codec)}
                  className={cn(
                    "min-h-11 flex-1 rounded-xl border px-2 text-xs font-bold",
                    cutsCodec === codec
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-card text-fg-2",
                  )}
                >
                  {CUTS_CODEC_CANDIDATES[codec].codecKey.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold text-fg-2">{bt("연출 옵션", "Sync Options")}</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-pressed={includeSubtitles}
                onClick={onToggleSubtitles}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border px-2 text-xs font-bold",
                  includeSubtitles
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {bt("자막 자동", "Captions")}
              </button>
              <button
                type="button"
                aria-pressed={includeSfxSync}
                onClick={onToggleSfxSync}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border px-2 text-xs font-bold",
                  includeSfxSync
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {bt("효과음 싱크", "SFX Sync")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CUTS_MOTION_PRESET_LABELS) as CutsMotionPreset[]).map((preset) => {
            const info = CUTS_MOTION_PRESET_LABELS[preset];
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={cutsPreset === preset}
                onClick={() => onChangePreset(preset)}
                className={cn(
                  "min-h-11 rounded-full border px-3 text-xs font-bold",
                  cutsPreset === preset
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                {bt(info.ko, info.en)}
              </button>
            );
          })}
        </div>

        <ol
          aria-label={bt("30초 컷츠 컷별 연출 순서", "Cuts storyboard timeline")}
          className="grid gap-2 sm:grid-cols-5"
        >
          {cutsTimeline.segments.map((segment, index) => (
            <li
              key={segment.panelId}
              className={cn(
                "rounded-xl border p-2.5 text-xs",
                TONE_CLASSES[index % TONE_CLASSES.length],
              )}
            >
              <p className="font-extrabold text-fg">{segment.title}</p>
              <p className="mt-0.5 text-[0.68rem] text-fg-2 tabular-nums">
                {`${segment.startSec}s – ${segment.endSec}s`}
              </p>
              <p className="mt-1 text-[0.68rem] font-semibold text-accent">
                {bt(
                  CUTS_MOTION_PRESET_LABELS[segment.motionPreset].ko,
                  CUTS_MOTION_PRESET_LABELS[segment.motionPreset].en,
                )}
              </p>
              {segment.sfxLabel ? (
                <p className="mt-0.5 text-[0.66rem] text-fg-3">{`♪ ${segment.sfxLabel}`}</p>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-2 tabular-nums">
            {bt(
              `총 ${cutsTimeline.totalFrames}프레임 · 예상 약 ${(cutsTimeline.estimatedBytes / 1024 / 1024).toFixed(1)} MB · 자막 ${cutsTimeline.subtitleCues.length}줄 · 효과음 ${cutsTimeline.sfxCues.length}개`,
              `${cutsTimeline.totalFrames} frames · Est. ${(cutsTimeline.estimatedBytes / 1024 / 1024).toFixed(1)} MB · ${cutsTimeline.subtitleCues.length} captions`,
            )}
          </p>
          <button
            type="button"
            disabled={cutsExporting}
            data-testid="nextgen-cuts-export-btn"
            onClick={onRunExport}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Play size={14} aria-hidden="true" />
            {cutsExporting
              ? bt("컷츠 만드는 중…", "Exporting Cuts…")
              : bt(`${cutsDurationSec}초 컷츠 만들기`, `Export ${cutsDurationSec}s Cuts`)}
          </button>
        </div>

        {cutsProgress ? (
          <div
            data-testid="nextgen-cuts-progress"
            className="space-y-1.5 rounded-xl border border-line bg-card p-3 text-xs tabular-nums"
          >
            <div className="flex justify-between font-bold text-fg">
              <span>{bt("인코딩 진행률", "Encoding progress")}</span>
              <span>{`${cutsProgress.percent}% (양보 ${cutsProgress.yieldCount}회)`}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel">
              <div
                className="nextgen-hub__spectrum-bar h-full"
                style={{ width: `${cutsProgress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        {cutsResult ? (
          <div
            data-testid="nextgen-cuts-result"
            className="rounded-xl border border-good/40 bg-good/10 p-3 text-xs text-fg"
          >
            <p className="flex items-center gap-1.5 font-extrabold text-good">
              <CheckCircle2 size={15} aria-hidden="true" />
              {cutsResult.summaryKo}
            </p>
            <p className="mt-1 text-fg-2 tabular-nums">
              {bt(
                `처리 프레임 ${cutsResult.encodedFrames}장 · 출력 청크 ${cutsResult.chunkCount}개 · 자막 WebVTT ${cutsResult.webVtt.length}자`,
                `Processed ${cutsResult.encodedFrames} frames · ${cutsResult.chunkCount} chunks · WebVTT ${cutsResult.webVtt.length} chars`,
              )}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
