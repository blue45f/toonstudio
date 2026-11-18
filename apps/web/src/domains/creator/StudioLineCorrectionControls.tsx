import { useId, useMemo } from "react";

import {
  describeStudioStabilizerLatency,
  STUDIO_STABILIZER_MODES,
  type StudioStabilizerMode,
} from "./brush/studio-stroke-stabilizer";
import {
  findMatchingStudioStabilizerStrengthPreset,
  simulateStudioFastFlickPreview,
  STUDIO_STABILIZER_STRENGTH_PRESETS,
} from "./brush/studio-stroke-stabilizer-fast-flick";
import {
  findActiveStudioStabilizerPreset,
  isStudioStabilizerPresetId,
  resolveStudioStabilizerPreset,
  STUDIO_STABILIZER_PRESETS,
} from "./brush/studio-stroke-stabilizer-presets";
import { STABILIZER_MAX } from "./studio-brush";

import { cx } from "@/shared/lib/cx";
import { resolveVectorMagnetRadiusPx } from "./vector/studio-vector-magnet-snap";

export interface StudioLineCorrectionControlsProps {
  stabilizer: number;
  onStabilizerChange: (value: number) => void;
  mode: StudioStabilizerMode;
  onModeChange: (value: StudioStabilizerMode) => void;
  postCorrection: number;
  onPostCorrectionChange: (value: number) => void;
  preserveCorners: boolean;
  onPreserveCornersChange: (value: boolean) => void;
  vectorMagnetEnabled?: boolean;
  onVectorMagnetEnabledChange?: (value: boolean) => void;
  vectorMagnetPower?: number;
  onVectorMagnetPowerChange?: (value: number) => void;
  density?: "compact" | "touch";
  className?: string;
}

export function StudioLineCorrectionControls({
  stabilizer,
  onStabilizerChange,
  mode,
  onModeChange,
  postCorrection,
  onPostCorrectionChange,
  preserveCorners,
  onPreserveCornersChange,
  vectorMagnetEnabled = false,
  onVectorMagnetEnabledChange,
  vectorMagnetPower = 12,
  onVectorMagnetPowerChange,
  density = "compact",
  className,
}: StudioLineCorrectionControlsProps) {
  const descriptionId = useId();
  const latencyDescriptionId = useId();
  const touch = density === "touch";
  const selectedMode = STUDIO_STABILIZER_MODES.find((candidate) => candidate.id === mode)
    ?? STUDIO_STABILIZER_MODES[1];
  const latency = describeStudioStabilizerLatency(selectedMode.id, stabilizer);
  const instantResponseActive = selectedMode.id === "standard" && stabilizer <= 0;
  const latencyTone = latency.kind === "instant"
    ? "border-good/35 bg-good/10 text-good"
    : latency.kind === "guided" || (latency.estimatedMs !== null && latency.estimatedMs >= 75)
      ? "border-warn/35 bg-warn/10 text-warn"
      : "border-cool/30 bg-cool/10 text-cool";
  const activePreset = findMatchingStudioStabilizerStrengthPreset(mode, stabilizer, postCorrection);
  const activeStabilizerPreset = findActiveStudioStabilizerPreset(mode, stabilizer);
  const flickPreview = useMemo(
    () => simulateStudioFastFlickPreview(selectedMode.id, stabilizer),
    [selectedMode.id, stabilizer],
  );
  const rawSvgPath = flickPreview.rawPoints
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const fullCommittedPoints = [
    ...flickPreview.stabilizedPoints,
    ...flickPreview.catchupSamples.map((sample): readonly [number, number] => [sample.x, sample.y]),
  ];
  const committedSvgPath = fullCommittedPoints
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const rawEndpoint = flickPreview.rawPoints.at(-1) ?? [150, 18];

  const strengthPresetGroup = (
    <div
      className={cx("grid grid-cols-5 gap-1", touch && "gap-1.5")}
      role="group"
      aria-label="선 보정 강도 프리셋"
    >
      {STUDIO_STABILIZER_STRENGTH_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={activePreset === preset.id}
          data-studio-stabilizer-strength-preset={preset.id}
          onClick={() => {
            onModeChange(preset.mode);
            onStabilizerChange(preset.stabilizer);
            onPostCorrectionChange(preset.postCorrection);
          }}
          className={cx(
            "rounded-lg border px-1 font-semibold transition-colors",
            touch ? "min-h-11 text-[0.68rem]" : "min-h-7 text-[0.62rem]",
            activePreset === preset.id
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-accent/45 hover:bg-raised"
          )}
        >
          {touch ? preset.label : preset.shortLabel}
        </button>
      ))}
    </div>
  );

  const detailedControls = (
    <div className={cx("space-y-2.5", touch && "pt-2")}>
      <label className={cx("flex items-center justify-between gap-3 text-fg-3", touch ? "min-h-11 text-[0.7rem]" : "text-xs")}>
        <span className="shrink-0">보정 프리셋</span>
        <select
          value={activeStabilizerPreset?.id ?? ""}
          onChange={(event) => {
            if (!isStudioStabilizerPresetId(event.target.value)) return;
            const preset = resolveStudioStabilizerPreset(event.target.value);
            onModeChange(preset.mode);
            onStabilizerChange(preset.strength);
          }}
          aria-label="선 보정 프리셋"
          className={cx(
            "min-w-0 rounded-lg border border-line bg-card px-2 text-fg outline-none focus:border-accent",
            touch ? "min-h-11 flex-1 text-xs" : "h-7 w-32 text-xs"
          )}
        >
          <option value="">직접 설정</option>
          {STUDIO_STABILIZER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>
      <p className="text-[0.62rem] leading-relaxed text-fg-3">
        {activeStabilizerPreset
          ? activeStabilizerPreset.description
          : "프리셋을 고르면 보정 방식과 강도가 목적에 맞게 한 번에 바뀝니다."}
      </p>

      <label className={cx("flex items-center justify-between gap-2 text-fg-3", touch ? "text-[0.7rem]" : "text-xs")}>
        <span>입력 선 보정</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <input
            type="range"
            min={0}
            max={STABILIZER_MAX}
            step={1}
            value={stabilizer}
            onChange={(event) => onStabilizerChange(Number(event.target.value))}
            aria-label="입력 선 보정 강도"
            aria-describedby={latencyDescriptionId}
            className={cx("cursor-pointer accent-accent", touch ? "h-11 w-full max-w-52" : "w-24")}
          />
          <span className="w-5 text-right tabular-nums">{stabilizer}</span>
        </span>
      </label>

      <label className={cx("flex items-center justify-between gap-3 text-fg-3", touch ? "min-h-11 text-[0.7rem]" : "text-xs")}>
        <span className="shrink-0">보정 방식</span>
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as StudioStabilizerMode)}
          aria-describedby={`${descriptionId} ${latencyDescriptionId}`}
          className={cx(
            "min-w-0 rounded-lg border border-line bg-card px-2 text-fg outline-none focus:border-accent",
            touch ? "min-h-11 flex-1 text-xs" : "h-7 w-32 text-xs"
          )}
        >
          {STUDIO_STABILIZER_MODES.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
        </select>
      </label>
      <p id={descriptionId} className="text-[0.62rem] leading-relaxed text-fg-3">
        {selectedMode.description}
      </p>

      <div
        role="group"
        aria-label="입력 반응 예상"
        className={cx("flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2", latencyTone)}
      >
        <span className="min-w-0">
          <span className="block text-[0.68rem] font-bold tabular-nums">{latency.label}</span>
          <span id={latencyDescriptionId} className="block text-[0.6rem] leading-relaxed text-fg-3">
            {latency.description}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onModeChange("standard");
            onStabilizerChange(0);
          }}
          disabled={instantResponseActive}
          aria-pressed={instantResponseActive}
          aria-describedby={latencyDescriptionId}
          aria-label={instantResponseActive
            ? "즉시 반응 사용 중"
            : "즉시 반응: 고정 주기 모드와 입력 보정 0으로 전환"}
          className={cx(
            "inline-flex shrink-0 items-center justify-center rounded-lg border border-line bg-card px-2.5 font-semibold text-fg-2 transition-colors",
            "hover:border-accent/45 hover:bg-raised hover:text-fg disabled:cursor-default disabled:border-good/30 disabled:bg-good/10 disabled:text-good",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            touch ? "min-h-11 text-xs" : "min-h-8 text-[0.68rem]"
          )}
        >
          즉시 반응
        </button>
      </div>

      <label className={cx("flex items-center justify-between gap-2 text-fg-3", touch ? "text-[0.7rem]" : "text-xs")}>
        <span title="펜을 놓은 뒤 좌표를 한 번 더 정리합니다.">그린 후 보정</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <input
            type="range"
            min={0}
            max={STABILIZER_MAX}
            step={1}
            value={postCorrection}
            onChange={(event) => onPostCorrectionChange(Number(event.target.value))}
            aria-label="그린 후 선 보정 강도"
            className={cx("cursor-pointer accent-accent", touch ? "h-11 w-full max-w-52" : "w-24")}
          />
          <span className="w-5 text-right tabular-nums">{postCorrection}</span>
        </span>
      </label>

      <label className={cx(
        "flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-card/45 px-2.5 text-fg-2",
        touch ? "min-h-11 text-xs" : "min-h-8 text-xs"
      )}>
        <span>
          <span className="block font-medium">각진 선 보존</span>
          {touch ? <span className="block text-[0.62rem] leading-relaxed text-fg-3">말풍선·의상 모서리가 둥글어지는 것을 방지</span> : null}
        </span>
        <input
          type="checkbox"
          checked={preserveCorners}
          onChange={(event) => onPreserveCornersChange(event.target.checked)}
          className={cx("shrink-0 rounded accent-accent", touch ? "size-5" : "size-4")}
        />
      </label>

      {onVectorMagnetEnabledChange ? (
        <div className="space-y-1.5 rounded-lg bg-card/45 px-2.5 py-2 text-xs text-fg-2 [word-break:keep-all]">
          <label className="flex min-h-9 cursor-pointer items-center justify-between gap-2">
            <span className="font-medium">벡터 끝점 자석 결합</span>
            <input
              type="checkbox"
              aria-label="벡터 끝점 자석 결합"
              checked={vectorMagnetEnabled}
              onChange={(event) => onVectorMagnetEnabledChange(event.target.checked)}
              className={cx("shrink-0 rounded accent-accent", touch ? "size-5" : "size-4")}
            />
          </label>
          {vectorMagnetEnabled && onVectorMagnetPowerChange ? (
            <label className="flex items-center justify-between gap-2 text-fg-3">
              <span>자석 흡착 반경</span>
              <span className="flex items-center gap-1.5">
                <input
                  type="range"
                  aria-label="자석 흡착 반경"
                  min={0}
                  max={100}
                  step={5}
                  value={vectorMagnetPower}
                  onChange={(event) => onVectorMagnetPowerChange(Number(event.target.value))}
                  className="w-24 cursor-pointer accent-accent"
                />
                <span className="w-12 text-right tabular-nums">
                  {Math.round(resolveVectorMagnetRadiusPx({ useVectorMagnet: vectorMagnetEnabled, magnetPower: vectorMagnetPower }))}px
                </span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      aria-label="선 보정"
      className={cx("border-t border-line/35", touch ? "mt-2.5 space-y-2.5 pt-2.5" : "space-y-2 pt-2", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cx("font-semibold text-fg-2", touch ? "text-xs" : "text-[0.7rem]")}>선 보정</span>
        <span className="text-[0.62rem] tabular-nums text-fg-3">입력 {stabilizer} · 후보정 {postCorrection}</span>
      </div>

      {touch ? (
        <>
          <p className="text-[0.65rem] leading-relaxed text-fg-3">흔들림을 얼마나 부드럽게 다듬을지 먼저 고르세요.</p>
          {strengthPresetGroup}
          <details className="rounded-lg border border-line bg-card/35 px-2.5">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-fg-2">
              세부 선 보정 설정
            </summary>
            {detailedControls}
          </details>
        </>
      ) : (
        <>
          {strengthPresetGroup}
          {detailedControls}
        </>
      )}

      <div
        data-studio-stabilizer-flick-preview="true"
        aria-label="빠른 손동작 끝점·필압 보존 미리보기"
        className="rounded-lg border border-line/65 bg-card/55 px-2.5 py-2"
      >
        <div className="flex items-center justify-between gap-2 text-[0.6rem]">
          <span className="font-semibold text-fg-2">빠른 손동작 끝점·필압 보존</span>
          <span className="tabular-nums text-good">
            끝점 오차 {flickPreview.endpointErrorPx.toFixed(1)}px · 끝 필압 {Math.round(flickPreview.preservedEndPressure * 100)}%
          </span>
        </div>
        <svg
          viewBox="0 0 160 44"
          className="mt-1.5 h-10 w-full overflow-visible rounded bg-raised/55"
          aria-hidden="true"
        >
          <path
            d={rawSvgPath}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.28}
            strokeDasharray="2.5 2.5"
            strokeWidth={1.25}
          />
          <path
            d={committedSvgPath}
            fill="none"
            stroke="var(--accent, #2dd4bf)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <circle
            cx={rawEndpoint[0]}
            cy={rawEndpoint[1]}
            r={2.8}
            fill="var(--accent, #2dd4bf)"
          />
        </svg>
      </div>
    </section>
  );
}
