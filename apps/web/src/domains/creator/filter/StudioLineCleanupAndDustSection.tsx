/**
 * CSP 선화 정리·먼지 제거·입체 팽창·분위기 색감 맞추기 통합 한국어 인스펙터 섹션.
 *
 * `imageSrc`와 `onCommitImageSrc`가 전달되면 모든 버튼이 실제 픽셀 엔진(`applyDustRemoval`,
 * `selectDustMask`, `applyBrightnessToAlpha`, `applyChangeLineColor`, `applyAdjustLineWidth`,
 * `applyInflateFilter`, `buildMoodPresetColorTransferLut` + `applyLabColorTransferLut`)을
 * 오프스크린 캔버스에서 직접 실행해 레이어 이미지를 갱신한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_15e228e28971596b30e7ed81ed1948b9b94a4f9f1077f50da55441fb336580be
 * - evidence_id: ev_4f970b12670bb3db0bd75cc35c039d7a757606a7655565c3acfe41c7a8741e42
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import { Eraser, Palette, PenLine, Sparkles, SunMedium, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  applyLabColorTransferLut,
  buildMoodPresetColorTransferLut,
  extractGradientStopsFromColorTransferLut,
  STUDIO_COLOR_TRANSFER_MOOD_PRESETS,
} from "../color/studio-lab-color-transfer-lut";

import {
  applyDustRemoval,
  selectDustMask,
  STUDIO_DUST_REMOVAL_MODE_LABELS,
  STUDIO_DUST_REMOVAL_MODES,
} from "./studio-dust-removal";
import { applyInflateFilter } from "./studio-inflate-filter";
import {
  applyAdjustLineWidth,
  applyBrightnessToAlpha,
  applyChangeLineColor,
} from "./studio-line-art-cleanup";
import {
  overlayDustSelectionMaskRgba,
  runStudioRasterDataUrlProcessor,
} from "./studio-raster-dataurl-runner";

import type { ColorTransferMoodPresetId } from "../color/studio-lab-color-transfer-lut";
import type { GradientStop } from "../studio-gradient-map";
import type { DustRemovalMode, DustRemovalOptions } from "./studio-dust-removal";
import type { InflateFilterOptions } from "./studio-inflate-filter";
import type {
  AdjustLineWidthMode,
  AdjustLineWidthOptions,
  BrightnessToAlphaOptions,
  ChangeLineColorOptions,
} from "./studio-line-art-cleanup";
import type { StudioRgbaProcessor } from "./studio-raster-dataurl-runner";

import { cn } from "@/shared/lib/utils";

export interface StudioLineCleanupAndDustSectionProps {
  readonly imageSrc?: string;
  readonly onCommitImageSrc?: (nextSrc: string) => void;
  readonly disabled?: boolean;
  readonly onApplyDustRemoval?: (options: DustRemovalOptions) => void;
  readonly onSelectDustMask?: (options: DustRemovalOptions) => void;
  readonly onApplyBrightnessToAlpha?: (options: BrightnessToAlphaOptions) => void;
  readonly onApplyChangeLineColor?: (options: ChangeLineColorOptions) => void;
  readonly onApplyAdjustLineWidth?: (options: AdjustLineWidthOptions) => void;
  readonly onApplyInflate?: (options: InflateFilterOptions) => void;
  readonly onApplyMoodColorTransfer?: (
    presetId: ColorTransferMoodPresetId,
    intensity: number,
  ) => void;
  readonly onExtractGradientStops?: (
    stops: readonly GradientStop[],
    presetId: ColorTransferMoodPresetId,
  ) => void;
  readonly className?: string;
}

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const BUTTON_BASE = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
);

export function StudioLineCleanupAndDustSection({
  imageSrc,
  onCommitImageSrc,
  disabled = false,
  onApplyDustRemoval,
  onSelectDustMask,
  onApplyBrightnessToAlpha,
  onApplyChangeLineColor,
  onApplyAdjustLineWidth,
  onApplyInflate,
  onApplyMoodColorTransfer,
  onExtractGradientStops,
  className,
}: StudioLineCleanupAndDustSectionProps) {
  const [dustSize, setDustSize] = useState<number>(3);
  const [dustMode, setDustMode] = useState<DustRemovalMode>("remove-from-transparency");
  const [dustFgColor, setDustFgColor] = useState<string>("#000000");

  const [inkColor, setInkColor] = useState<string>("#000000");
  const [targetLineColor, setTargetLineColor] = useState<string>("#3b2f2f");
  const [lineColorBlendPct, setLineColorBlendPct] = useState<number>(100);

  const [lineWidthMode, setLineWidthMode] = useState<AdjustLineWidthMode>("narrow");
  const [scalePx, setScalePx] = useState<number>(2);
  const [atLeastOnePixel, setAtLeastOnePixel] = useState<boolean>(true);

  const [heightLimitPct, setHeightLimitPct] = useState<number>(75);
  const [smoothingRadius, setSmoothingRadius] = useState<number>(2);
  const [lightX, setLightX] = useState<number>(-0.45);
  const [lightY, setLightY] = useState<number>(-0.55);
  const [shininess, setShininess] = useState<number>(36);
  const [inflateStrengthPct, setInflateStrengthPct] = useState<number>(75);

  const [moodPresetId, setMoodPresetId] = useState<ColorTransferMoodPresetId>("sunrise");
  const [transferIntensityPct, setTransferIntensityPct] = useState<number>(80);

  const [busy, setBusy] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const previewStops = useMemo(() => {
    const lut = buildMoodPresetColorTransferLut(moodPresetId);
    return extractGradientStopsFromColorTransferLut(lut);
  }, [moodPresetId]);

  const currentDustOptions: DustRemovalOptions = {
    dustSize,
    mode: dustMode,
    foregroundColor: dustFgColor,
  };

  const executeLivePixelOp = async (
    label: string,
    processor: StudioRgbaProcessor,
  ) => {
    if (!imageSrc || !onCommitImageSrc) return;
    setBusy(true);
    setStatusNote(null);
    try {
      const nextSrc = await runStudioRasterDataUrlProcessor(imageSrc, processor);
      onCommitImageSrc(nextSrc);
      setStatusNote(`${label} 결과를 이미지에 반영했어요.`);
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : `${label} 처리 중 오류가 발생했어요.`);
    } finally {
      setBusy(false);
    }
  };

  const controlsLocked = disabled || busy;

  return (
    <section
      aria-label="선화 정리·먼지 제거 및 분위기 색감 도구"
      data-studio-line-cleanup-dust-section="true"
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-line bg-panel/90 p-3 text-xs text-fg [word-break:keep-all]",
        className,
      )}
    >
      {statusNote ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-accent/35 bg-accent-soft/30 px-2.5 py-1.5 text-xs text-fg"
        >
          {statusNote}
        </p>
      ) : null}

      {/* 1. 먼지 제거 */}
      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Eraser size={15} aria-hidden />
            <span>먼지 제거 · 실구멍 메우기</span>
          </span>
          <span className="tabular-nums text-xs text-fg-3">{dustSize}px 이하</span>
        </summary>

        <div className="mt-2 flex flex-col gap-2.5 px-1">
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            <span>먼지 처리 방식</span>
            <select
              aria-label="먼지 처리 방식"
              disabled={controlsLocked}
              value={dustMode}
              onChange={(e) => setDustMode(e.target.value as DustRemovalMode)}
              className="min-h-11 rounded border border-line bg-panel px-2 text-xs text-fg"
            >
              {STUDIO_DUST_REMOVAL_MODES.map((m) => (
                <option key={m} value={m}>
                  {STUDIO_DUST_REMOVAL_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>먼지 크기 상한</span>
              <span>{dustSize}px</span>
            </span>
            <input
              type="range"
              aria-label="먼지 크기 상한"
              min={1}
              max={24}
              step={1}
              disabled={controlsLocked}
              value={dustSize}
              onChange={(e) => setDustSize(Number(e.target.value))}
              className="min-h-11 accent-accent"
            />
          </label>

          {dustMode === "fill-gaps-foreground" ? (
            <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
              <span>메움 전경색</span>
              <input
                type="text"
                aria-label="메움 전경색"
                disabled={controlsLocked}
                value={dustFgColor}
                onChange={(e) => setDustFgColor(e.target.value)}
                className="min-h-11 w-28 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                onSelectDustMask?.(currentDustOptions);
                void executeLivePixelOp("먼지 마스크 표시", (rgba, width, height) => {
                  const detected = selectDustMask({ data: rgba, width, height }, currentDustOptions);
                  return overlayDustSelectionMaskRgba({ data: rgba, width, height }, detected.mask);
                });
              }}
              className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
            >
              먼지 마스크 표시
            </button>
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                onApplyDustRemoval?.(currentDustOptions);
                void executeLivePixelOp("먼지 제거", (rgba, width, height) =>
                  applyDustRemoval({ data: rgba, width, height }, currentDustOptions),
                );
              }}
              className={cn(
                BUTTON_BASE,
                "border-accent bg-accent text-on-accent hover:brightness-105",
              )}
            >
              먼지 제거 적용
            </button>
          </div>
        </div>
      </details>

      {/* 2 & 3 & 4. 선화 추출 · 선 색 변경 · 선 폭 수정 */}
      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <PenLine size={15} aria-hidden />
            <span>휘도→투명도 · 선 색 변경 · 선 폭 수정</span>
          </span>
          <span className="tabular-nums text-xs text-fg-3">
            {lineWidthMode === "narrow" ? "가늘게" : "굵게"} {scalePx}px
          </span>
        </summary>

        <div className="mt-2 flex flex-col gap-2.5 px-1">
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center justify-between gap-2 text-xs text-fg-2">
              <span>추출 잉크 색</span>
              <input
                type="text"
                aria-label="추출 잉크 색"
                disabled={controlsLocked}
                value={inkColor}
                onChange={(e) => setInkColor(e.target.value)}
                className="min-h-11 w-24 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                onApplyBrightnessToAlpha?.({ inkColor });
                void executeLivePixelOp("휘도→투명도 변환", (rgba, width, height) =>
                  applyBrightnessToAlpha({ data: rgba, width, height }, { inkColor }),
                );
              }}
              className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
            >
              <WandSparkles size={13} aria-hidden />
              휘도→투명도 변환
            </button>
          </div>

          <div className="flex flex-col gap-1.5 rounded-md border border-line/65 bg-panel/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-fg-2">
                <span>선 색상</span>
                <input
                  type="text"
                  aria-label="변경할 선 색상"
                  disabled={controlsLocked}
                  value={targetLineColor}
                  onChange={(e) => setTargetLineColor(e.target.value)}
                  className="min-h-11 w-24 rounded border border-line bg-card px-2 text-xs tabular-nums text-fg"
                />
              </label>
              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => {
                  const opts = {
                    targetColor: targetLineColor,
                    blendStrength: lineColorBlendPct / 100,
                  };
                  onApplyChangeLineColor?.(opts);
                  void executeLivePixelOp("선 색 변경", (rgba, width, height) =>
                    applyChangeLineColor({ data: rgba, width, height }, opts),
                  );
                }}
                className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
              >
                선 색 변경 적용
              </button>
            </div>
            <label className="flex flex-col gap-0.5 text-xs text-fg-3">
              <span className="flex justify-between tabular-nums">
                <span>색상 교체 강도</span>
                <span>{lineColorBlendPct}%</span>
              </span>
              <input
                type="range"
                aria-label="색상 교체 강도"
                min={0}
                max={100}
                step={5}
                disabled={controlsLocked}
                value={lineColorBlendPct}
                onChange={(e) => setLineColorBlendPct(Number(e.target.value))}
                className="min-h-11 accent-accent"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-line/65 bg-panel/60 p-2">
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="선 폭 조절 방향">
              <button
                type="button"
                disabled={controlsLocked}
                aria-pressed={lineWidthMode === "thicken"}
                onClick={() => setLineWidthMode("thicken")}
                className={cn(
                  BUTTON_BASE,
                  lineWidthMode === "thicken"
                    ? "border-accent bg-accent-soft/65 text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                선 굵게
              </button>
              <button
                type="button"
                disabled={controlsLocked}
                aria-pressed={lineWidthMode === "narrow"}
                onClick={() => setLineWidthMode("narrow")}
                className={cn(
                  BUTTON_BASE,
                  lineWidthMode === "narrow"
                    ? "border-accent bg-accent-soft/65 text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                선 가늘게
              </button>
            </div>

            <label className="flex flex-col gap-0.5 text-xs text-fg-2">
              <span className="flex justify-between tabular-nums">
                <span>두께 조절 폭 (1~16px)</span>
                <span>{scalePx}px</span>
              </span>
              <input
                type="range"
                aria-label="두께 조절 폭"
                min={1}
                max={16}
                step={1}
                disabled={controlsLocked}
                value={scalePx}
                onChange={(e) => setScalePx(Number(e.target.value))}
                className="min-h-11 accent-accent"
              />
            </label>

            {lineWidthMode === "narrow" ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-1 text-xs text-fg-2">
                <input
                  type="checkbox"
                  checked={atLeastOnePixel}
                  disabled={controlsLocked}
                  onChange={(e) => setAtLeastOnePixel(e.target.checked)}
                  className="size-4 accent-accent"
                />
                <span>1픽셀 남기기 (선 끊김 방지)</span>
              </label>
            ) : null}

            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                const opts = { mode: lineWidthMode, scalePx, atLeastOnePixel };
                onApplyAdjustLineWidth?.(opts);
                void executeLivePixelOp("선 폭 수정", (rgba, width, height) =>
                  applyAdjustLineWidth({ data: rgba, width, height }, opts),
                );
              }}
              className={cn(
                BUTTON_BASE,
                "border-accent bg-accent text-on-accent hover:brightness-105",
              )}
            >
              선 폭 수정 적용
            </button>
          </div>
        </div>
      </details>

      {/* 5. 입체 팽창 */}
      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <SunMedium size={15} aria-hidden />
            <span>입체 팽창 (볼록 음영)</span>
          </span>
          <span className="tabular-nums text-xs text-fg-3">강도 {inflateStrengthPct}%</span>
        </summary>

        <div className="mt-2 flex flex-col gap-2 px-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span className="tabular-nums">높이 상한 ({heightLimitPct}%)</span>
              <input
                type="range"
                aria-label="입체 높이 상한"
                min={10}
                max={100}
                step={5}
                disabled={controlsLocked}
                value={heightLimitPct}
                onChange={(e) => setHeightLimitPct(Number(e.target.value))}
                className="min-h-11 accent-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span className="tabular-nums">부드러움 반경 ({smoothingRadius}px)</span>
              <input
                type="range"
                aria-label="입체 부드러움 반경"
                min={0}
                max={12}
                step={1}
                disabled={controlsLocked}
                value={smoothingRadius}
                onChange={(e) => setSmoothingRadius(Number(e.target.value))}
                className="min-h-11 accent-accent"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-xs text-fg-3">
              <span>광원 가로</span>
              <input
                type="number"
                aria-label="입체 광원 X"
                step={0.1}
                min={-1}
                max={1}
                disabled={controlsLocked}
                value={lightX}
                onChange={(e) => setLightX(Number(e.target.value))}
                className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-fg-3">
              <span>광원 세로</span>
              <input
                type="number"
                aria-label="입체 광원 Y"
                step={0.1}
                min={-1}
                max={1}
                disabled={controlsLocked}
                value={lightY}
                onChange={(e) => setLightY(Number(e.target.value))}
                className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-fg-3">
              <span>광택도</span>
              <input
                type="number"
                aria-label="입체 광택도"
                min={1}
                max={256}
                disabled={controlsLocked}
                value={shininess}
                onChange={(e) => setShininess(Number(e.target.value))}
                className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
          </div>

          <label className="flex flex-col gap-0.5 text-xs text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>입체 음영 강도</span>
              <span>{inflateStrengthPct}%</span>
            </span>
            <input
              type="range"
              aria-label="입체 음영 강도"
              min={0}
              max={100}
              step={5}
              disabled={controlsLocked}
              value={inflateStrengthPct}
              onChange={(e) => setInflateStrengthPct(Number(e.target.value))}
              className="min-h-11 accent-accent"
            />
          </label>

          <button
            type="button"
            disabled={controlsLocked}
            onClick={() => {
              const opts = {
                heightLimit: heightLimitPct / 100,
                smoothingRadius,
                lightX,
                lightY,
                shininess,
                strength: inflateStrengthPct / 100,
              };
              onApplyInflate?.(opts);
              void executeLivePixelOp("입체 팽창", (rgba, width, height) =>
                applyInflateFilter({ data: rgba, width, height }, opts),
              );
            }}
            className={cn(
              BUTTON_BASE,
              "border-accent bg-accent text-on-accent hover:brightness-105",
            )}
          >
            입체 팽창 적용
          </button>
        </div>
      </details>

      {/* 6. 분위기 색감 맞추기 */}
      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Palette size={15} aria-hidden />
            <span>분위기 색감 맞추기</span>
          </span>
          <span className="tabular-nums text-xs text-fg-3">{transferIntensityPct}%</span>
        </summary>

        <div className="mt-2 flex flex-col gap-2.5 px-1">
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="색감 무드 프리셋">
            {STUDIO_COLOR_TRANSFER_MOOD_PRESETS.map((preset) => {
              const selected = moodPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={controlsLocked}
                  aria-pressed={selected}
                  title={preset.description}
                  onClick={() => setMoodPresetId(preset.id)}
                  className={cn(
                    BUTTON_BASE,
                    "px-2 text-xs",
                    selected
                      ? "border-accent bg-accent-soft/65 text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div
            aria-label="추출된 5단계 그라데이션 미리보기"
            className="h-4 w-full rounded-md border border-line/80"
            style={{
              backgroundImage: `linear-gradient(to right, ${previewStops
                .map((s) => `${s.color} ${Math.round(s.pos * 100)}%`)
                .join(", ")})`,
            }}
          />

          <label className="flex flex-col gap-0.5 text-xs text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>색감 적용 강도</span>
              <span>{transferIntensityPct}%</span>
            </span>
            <input
              type="range"
              aria-label="색감 적용 강도"
              min={0}
              max={100}
              step={5}
              disabled={controlsLocked}
              value={transferIntensityPct}
              onChange={(e) => setTransferIntensityPct(Number(e.target.value))}
              className="min-h-11 accent-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => onExtractGradientStops?.(previewStops, moodPresetId)}
              className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
            >
              <Sparkles size={13} aria-hidden />
              그라데이션 추출
            </button>
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                const intensity = transferIntensityPct / 100;
                onApplyMoodColorTransfer?.(moodPresetId, intensity);
                void executeLivePixelOp("분위기 색감 맞추기", (rgba, width, height) => {
                  const src = { data: rgba, width, height };
                  const lut = buildMoodPresetColorTransferLut(moodPresetId, src);
                  return applyLabColorTransferLut(src, lut, intensity);
                });
              }}
              className={cn(
                BUTTON_BASE,
                "border-accent bg-accent text-on-accent hover:brightness-105",
              )}
            >
              분위기 색감 적용
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
