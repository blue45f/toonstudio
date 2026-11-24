/**
 * WebCodecs 4K/60fps 2.5D 무빙툰 릴스 진단·프리뷰·인코딩 검증 탭.
 */

import { CheckCircle2, Play } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  MOVING_TOON_PRESETS,
  MovingToonReelsEncoder,
  REELS_RESOLUTION_PRESETS,
  findMovingToonPresetById,
  findReelsPresetById,
  interpolateMovingToonFrame,
  planReelsFrameSchedule,
  probeWebCodecsSupport,
  type ReelsCodecProbeReport,
  type ReelsEncodeResult,
  type ReelsResolutionPresetId,
} from "./webcodecs-reels-encoder";

export interface WebcodecsReelsTabProps {
  readonly onNotify: (message: string) => void;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

function formatBytesKo(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function WebcodecsReelsTab({ onNotify }: WebcodecsReelsTabProps): ReactElement {
  const uid = useId();
  const [presetId, setPresetId] = useState<ReelsResolutionPresetId>("4k-vertical-60");
  const [timelineId, setTimelineId] = useState<string>(
    MOVING_TOON_PRESETS[0]?.id ?? "rooftop-sakura-duel",
  );
  const [scrubFrame, setScrubFrame] = useState<number>(96);
  const [probeReport, setProbeReport] = useState<ReelsCodecProbeReport | null>(null);
  const [encodeResult, setEncodeResult] = useState<ReelsEncodeResult | null>(null);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);

  const activePreset = useMemo(() => findReelsPresetById(presetId), [presetId]);
  const activeTimeline = useMemo(() => findMovingToonPresetById(timelineId), [timelineId]);
  const schedulePlan = useMemo(
    () => planReelsFrameSchedule(activeTimeline, activePreset, 2),
    [activePreset, activeTimeline],
  );
  const clampedFrame = Math.min(scrubFrame, Math.max(0, schedulePlan.totalFrames - 1));
  const evaluatedPose = useMemo(
    () =>
      interpolateMovingToonFrame(activeTimeline, clampedFrame, {
        fps: schedulePlan.fps,
        keyFrameInterval: schedulePlan.keyFrameInterval,
      }),
    [activeTimeline, clampedFrame, schedulePlan.fps, schedulePlan.keyFrameInterval],
  );

  useEffect(() => {
    let active = true;
    void probeWebCodecsSupport(presetId).then((report) => {
      if (active) setProbeReport(report);
    });
    return () => {
      active = false;
    };
  }, [presetId]);

  const handleRunReelsEncode = async (): Promise<void> => {
    setIsEncoding(true);
    try {
      const encoder = new MovingToonReelsEncoder();
      const result = await encoder.encodeTimeline(activeTimeline, {
        presetId,
        maxFramesToEncode: 30,
      });
      setEncodeResult(result);
      onNotify(
        `${result.preset.labelKo} ${result.encodedFrames}프레임 인코딩 완료 (${result.codecString}, 서버 비용 0원)`,
      );
    } finally {
      setIsEncoding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="릴스 해상도 프로파일" className="flex flex-wrap gap-2">
          {REELS_RESOLUTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={preset.id === presetId}
              onClick={() => setPresetId(preset.id)}
              className={preset.id === presetId ? CHIP_ACTIVE : BTN_OUTLINE}
            >
              <span>{preset.labelKo}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={isEncoding}
          onClick={() => {
            void handleRunReelsEncode();
          }}
          className={BTN_PRIMARY}
        >
          <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{isEncoding ? "인코딩 실행 중..." : "4K/60fps 릴스 인코딩 검증"}</span>
        </button>
      </div>

      {/* 핵심 진단 지표 */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">인코딩 실행 모드</div>
          <div className="mt-1 text-xs font-bold text-fg">
            {probeReport?.recommendedMode === "webcodecs-hardware"
              ? "WebCodecs 하드웨어 가속"
              : probeReport?.recommendedMode === "webcodecs-software"
                ? "WebCodecs 소프트웨어"
                : "안전 프레임 시퀀스 폴백"}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">목표 비트레이트 · 프레임 예산</div>
          <div className="mt-1 text-xs font-bold tabular-nums text-fg">
            {(activePreset.targetBitrateBps / 1_000_000).toFixed(1)} Mbps · {schedulePlan.frameBudgetMs}ms/f
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">15초 예상 용량 · GOP</div>
          <div className="mt-1 text-xs font-bold tabular-nums text-fg">
            {probeReport ? `${probeReport.estimatedMegabytesFor15s} MB` : "-"} · {schedulePlan.gopCount} GOP
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">서버 비용 · 10분 절감액</div>
          <div className="mt-1 text-xs font-bold tabular-nums text-good">
            0원 · 약 {probeReport?.cloudGpuSavingsKrwPer10Min.toLocaleString("ko-KR") ?? "1,800"}원 절감
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 좌측: 2.5D 패럴랙스 & 카메라 셰이크 타임라인 프리뷰 */}
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-fg">2.5D 패럴랙스 · 카메라 셰이크 프리뷰</div>
            <div className="flex flex-wrap gap-1.5">
              {MOVING_TOON_PRESETS.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  aria-pressed={scene.id === timelineId}
                  onClick={() => setTimelineId(scene.id)}
                  className={scene.id === timelineId ? CHIP_ACTIVE : BTN_OUTLINE}
                >
                  <span>{scene.titleKo.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <svg
            role="img"
            aria-label="2.5D 무빙툰 레이어 패럴랙스 및 카메라 프레이밍 프리뷰"
            viewBox="0 0 320 180"
            className="block h-auto w-full rounded-lg border border-line bg-canvas"
          >
            {evaluatedPose.layerTransforms.map((layer, index) => {
              const boxW = 220 - index * 32;
              const boxH = 120 - index * 18;
              const cx = 160 + layer.translateX * 0.25 - boxW * 0.5;
              const cy = 90 + layer.translateY * 0.2 - boxH * 0.5;
              const toneClass =
                index === 0
                  ? "fill-cool/15 stroke-cool"
                  : index === 1
                    ? "fill-accent/15 stroke-accent"
                    : "fill-good/15 stroke-good";
              return (
                <g key={layer.layerId}>
                  <rect
                    x={cx}
                    y={cy}
                    width={boxW}
                    height={boxH}
                    rx={8}
                    className={toneClass}
                    strokeWidth={1.5}
                  />
                  <text x={cx + 8} y={cy + 16} className="fill-fg text-[10px] font-semibold">
                    {layer.nameKo} (Z={layer.depthZ.toFixed(2)} · ×{layer.parallaxGain})
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`${uid}-frame-scrubber`} className="font-semibold text-fg">
                프레임 스크러버 ({clampedFrame} / {schedulePlan.totalFrames - 1}f · {evaluatedPose.timeMs}ms)
              </label>
              <span className="tabular-nums text-fg-3">
                줌 {evaluatedPose.cameraZoom.toFixed(2)}× · 셰이크 ({evaluatedPose.shakeOffsetX},{" "}
                {evaluatedPose.shakeOffsetY})
              </span>
            </div>
            <input
              id={`${uid}-frame-scrubber`}
              type="range"
              min={0}
              max={Math.max(0, schedulePlan.totalFrames - 1)}
              value={clampedFrame}
              onChange={(event) => setScrubFrame(Number(event.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>

        {/* 우측: 코덱 프로브 결과 및 인코딩 결과 카드 */}
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg">코덱 프로브 (H.264 · AV1 · VP9)</div>
          <ul className="space-y-2">
            {(probeReport?.entries ?? []).map((entry) => (
              <li
                key={entry.candidate.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-fg">{entry.candidate.labelKo}</div>
                  <div className="text-[11px] tabular-nums text-fg-3">
                    {entry.candidate.codecString} · {(entry.effectiveBitrateBps / 1_000_000).toFixed(1)} Mbps
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    entry.hardwareSupported
                      ? "border-good/40 bg-good/15 text-good"
                      : entry.softwareSupported
                        ? "border-warn/40 bg-warn/15 text-warn"
                        : "border-line bg-raised text-fg-2"
                  }`}
                >
                  {entry.statusKo}
                </span>
              </li>
            ))}
          </ul>

          {encodeResult ? (
            <div className="rounded-lg border border-good/40 bg-good/15 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-good">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>최근 인코딩 검증 완료 ({encodeResult.mode})</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 tabular-nums text-fg">
                <span>인코딩 프레임: {encodeResult.encodedFrames}f</span>
                <span>키프레임(GOP): {encodeResult.keyFrameCount}개</span>
                <span>평균 비트레이트: {encodeResult.averageBitrateMbps} Mbps</span>
                <span>총 출력 크기: {formatBytesKo(encodeResult.totalEncodedBytes)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
