import {
  Aperture,
  Columns2,
  Eye,
  PenTool,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useState, type CSSProperties, type ReactElement } from "react";

import { StudioSplitWipeOverlay } from "../studio-cuttoon-editor/StudioSplitWipeOverlay";

import { STUDIO_FILTER_LABELS, type StudioFilterDraft, type StudioFilterKind } from "./studio-filter-menu";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioFilterCompareAndQuickBarProps {
  readonly activeKind: StudioFilterKind;
  readonly draft: StudioFilterDraft;
  readonly imageSrc?: string | null;
  readonly applying: boolean;
  readonly previewEnabled: boolean;
  readonly comparingOriginal: boolean;
  readonly onResetDraft: () => void;
  readonly onStartCompareOriginal: () => void;
  readonly onPreviewEnabledChange: (enabled: boolean) => void;
  readonly onSelectQuickFilter: (kind: StudioFilterKind) => void;
}

const QUICK_CSP_FILTERS: readonly {
  readonly kind: StudioFilterKind;
  readonly label: string;
  readonly hint: string;
  readonly toneClass: string;
}[] = [
  {
    kind: "lens-blur",
    label: "렌즈 블러",
    hint: "보케 · 심도",
    toneClass:
      "border-cool/45 bg-[color-mix(in_oklch,var(--color-cool)_16%,var(--color-card))] text-fg",
  },
  {
    kind: "difference-of-gaussians",
    label: "이미지→선화 추출",
    hint: "윤곽선 변환",
    toneClass:
      "border-accent/45 bg-[color-mix(in_oklch,var(--color-accent)_16%,var(--color-card))] text-fg",
  },
  {
    kind: "line-cleanup",
    label: "스케치 선화 정리",
    hint: "먹선 보정",
    toneClass:
      "border-accent-2/45 bg-[color-mix(in_oklch,var(--color-accent-2)_16%,var(--color-card))] text-fg",
  },
];

function previewCssFilterForDraft(draft: StudioFilterDraft): CSSProperties {
  if (draft.kind === "gaussian-blur") {
    return { filter: `blur(${Math.min(12, Math.max(0.5, draft.radius * 0.35)).toFixed(1)}px)` };
  }
  if (draft.kind === "motion-blur") {
    return { filter: `blur(${Math.min(10, Math.max(0.5, draft.distance * 0.25)).toFixed(1)}px)` };
  }
  if (draft.kind === "hue-saturation-brightness") {
    const sat = Math.max(0, 100 + draft.saturation);
    const bri = Math.max(20, 100 + draft.brightness);
    return { filter: `hue-rotate(${draft.hue}deg) saturate(${sat}%) brightness(${bri}%)` };
  }
  if (draft.kind === "brightness-contrast") {
    const bri = Math.max(20, 100 + draft.brightness);
    const con = Math.max(20, 100 + draft.contrast);
    return { filter: `brightness(${bri}%) contrast(${con}%)` };
  }
  if (draft.kind === "lens-blur") {
    const radius = typeof draft.values.radius === "number" ? draft.values.radius : 8;
    return { filter: `blur(${Math.min(12, Math.max(1, radius * 0.4)).toFixed(1)}px) saturate(112%)` };
  }
  if (draft.kind === "difference-of-gaussians" || draft.kind === "line-cleanup") {
    return { filter: "grayscale(100%) contrast(220%) brightness(112%)" };
  }
  return { filter: "contrast(112%) saturate(108%)" };
}

/**
 * 필터 다이얼로그 하단 제어 막대 + 실시간 드래그 분할 비교(Split-Wipe Before/After) +
 * CSP 핵심 필터(렌즈 블러 · 이미지→선화 추출 · 선화 정리) 원클릭 전환 바.
 */
export function StudioFilterCompareAndQuickBar({
  activeKind,
  draft,
  imageSrc,
  applying,
  previewEnabled,
  comparingOriginal,
  onResetDraft,
  onStartCompareOriginal,
  onPreviewEnabledChange,
  onSelectQuickFilter,
}: StudioFilterCompareAndQuickBarProps): ReactElement {
  const [splitCompareOpen, setSplitCompareOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);

  const activeTitle = STUDIO_FILTER_LABELS[activeKind];
  const filteredStyle = previewCssFilterForDraft(draft);

  return (
    <div className="mt-4 space-y-3 border-t border-line/70 pt-3 break-keep">
      {/* CSP 핵심 필터 원클릭 바로가기 */}
      <div
        role="group"
        aria-label="자주 쓰는 핵심 필터 빠른 전환"
        data-studio-filter-quick-shortcuts="true"
        className="flex flex-wrap items-center gap-1.5"
      >
        {QUICK_CSP_FILTERS.map((item) => {
          const active = activeKind === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              disabled={applying}
              aria-pressed={active}
              data-studio-filter-quick-kind={item.kind}
              onClick={() => onSelectQuickFilter(item.kind)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none",
                active
                  ? "border-accent bg-[linear-gradient(120deg,color-mix(in_oklch,var(--color-accent)_26%,var(--color-card)),color-mix(in_oklch,var(--color-accent-2)_18%,var(--color-card)))] text-fg ring-1 ring-accent/45"
                  : cn(item.toneClass, "hover:border-line-strong"),
              )}
            >
              {item.kind === "lens-blur" ? (
                <Aperture size={14} className="shrink-0 text-cool" aria-hidden="true" />
              ) : item.kind === "difference-of-gaussians" ? (
                <PenTool size={14} className="shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <Sparkles size={14} className="shrink-0 text-accent-2" aria-hidden="true" />
              )}
              <span>{item.label}</span>
              <span className="text-[0.64rem] font-normal text-fg-3">{item.hint}</span>
            </button>
          );
        })}
      </div>

      {/* 기본값 · 원본 비교(누르고 보기) · 분할 비교(Split-Wipe) · 캔버스 미리보기 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={applying}
          onClick={onResetDraft}
          className={buttonClass({
            size: "sm",
            variant: "quiet",
            className: "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
          })}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          기본값
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={applying || !previewEnabled}
            aria-pressed={comparingOriginal}
            title="누르고 있는 동안 원본을 보여줍니다"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              onStartCompareOriginal();
            }}
            onKeyDown={(event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              onStartCompareOriginal();
            }}
            className={buttonClass({
              size: "sm",
              variant: comparingOriginal ? "outline" : "quiet",
              className: "min-h-11 select-none sm:min-h-8 pointer-coarse:min-h-11",
            })}
          >
            <Eye className="size-3.5" aria-hidden />
            원본 비교
          </button>

          <button
            type="button"
            disabled={applying || !previewEnabled}
            aria-pressed={splitCompareOpen}
            data-studio-filter-split-compare-toggle="true"
            onClick={() => setSplitCompareOpen((open) => !open)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] disabled:opacity-45 sm:min-h-8 pointer-coarse:min-h-11 motion-reduce:transition-none motion-reduce:transform-none",
              splitCompareOpen
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Columns2 size={14} aria-hidden="true" />
            <span>분할 비교</span>
          </button>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-xs font-semibold text-fg-2 hover:bg-raised">
          <input
            type="checkbox"
            checked={previewEnabled}
            onChange={(event) => onPreviewEnabledChange(event.target.checked)}
            className="size-4 accent-accent"
          />
          캔버스 미리보기
        </label>
      </div>

      {/* 실시간 드래그 분할 비교(Split-Wipe Before/After) 프리뷰 */}
      {splitCompareOpen && previewEnabled ? (
        <div
          data-studio-filter-split-compare-stage="true"
          className="space-y-2 rounded-2xl border border-accent/35 bg-card/70 p-2.5"
        >
          <div className="flex items-center justify-between gap-2 text-[0.7rem] text-fg-2">
            <span className="font-semibold text-fg">실시간 분할 비교 · {activeTitle}</span>
            <span className="tabular-nums text-fg-3">
              원본 {Math.round(splitRatio * 100)}% / 적용 후 {100 - Math.round(splitRatio * 100)}%
            </span>
          </div>
          <StudioSplitWipeOverlay
            ratio={splitRatio}
            onRatioChange={setSplitRatio}
            leftLabel="원본"
            rightLabel="적용 후"
            ariaLabel={`${activeTitle} 원본과 적용 후 분할 비교 슬라이더`}
            className="h-44 w-full"
            leftContent={
              imageSrc ? (
                <img
                  src={imageSrc}
                  alt="필터 적용 전 원본 미리보기"
                  className="size-full object-contain bg-canvas"
                />
              ) : (
                <div className="grid size-full place-items-center bg-[linear-gradient(135deg,color-mix(in_oklch,var(--color-cool)_22%,var(--color-canvas)),color-mix(in_oklch,var(--color-panel)_88%,var(--color-canvas)))] text-xs font-semibold text-fg-2">
                  원본 이미지
                </div>
              )
            }
            rightContent={
              imageSrc ? (
                <img
                  src={imageSrc}
                  alt="필터 적용 후 미리보기"
                  style={filteredStyle}
                  className="size-full object-contain bg-canvas"
                />
              ) : (
                <div
                  style={filteredStyle}
                  className="grid size-full place-items-center bg-[linear-gradient(135deg,color-mix(in_oklch,var(--color-accent)_26%,var(--color-canvas)),color-mix(in_oklch,var(--color-accent-2)_22%,var(--color-canvas)))] text-xs font-semibold text-fg"
                >
                  {activeTitle} 적용 후
                </div>
              )
            }
          />
          <p className="text-[0.66rem] text-fg-3">
            가운데 핸들을 좌우로 끌거나 방향키로 움직여 전·후 차이를 세밀하게 확인하세요 (더블클릭 시 50% 복원)
          </p>
        </div>
      ) : null}
    </div>
  );
}
