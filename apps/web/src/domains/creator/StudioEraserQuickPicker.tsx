import { Check } from "lucide-react";

import { STUDIO_ERASER_PRESETS, type StudioEraserPresetId } from "./brush/studio-eraser-presets";
import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "./studio-panel-ui";

import { lazy, Suspense, useState, type ReactElement } from "react";

import {
  DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS,
  type StudioAdvancedEraserSettings,
} from "./brush/studio-eraser-advanced-plan";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const StudioEraserAdvancedSection = lazy(() =>
  import("./brush/StudioEraserAdvancedSection").then((m) => ({ default: m.StudioEraserAdvancedSection })),
);

export type StudioEraserQuickPickerId = StudioEraserPresetId;

export interface StudioEraserQuickPickerProps {
  selectedId: StudioEraserQuickPickerId;
  onSelect: (id: StudioEraserQuickPickerId) => void;
  className?: string;
  /** Accessible name for the reusable desktop popover or mobile sheet group. */
  ariaLabel?: string;
  placement?: "mobile" | "catalog";
  /** 선택적 고급 지우개 설정 (자 스냅 · 여러 레이어 지우기 · 부드러운/거친/다이나믹 감도). */
  advancedSettings?: Partial<StudioAdvancedEraserSettings> | null;
  onAdvancedSettingsChange?: (next: StudioAdvancedEraserSettings) => void;
}

type StudioEraserQuickOption = (typeof STUDIO_ERASER_PRESETS)[number];

function StudioEraserBeforeAfterPreview({
  option,
}: {
  option: StudioEraserQuickOption;
}): ReactElement {
  const bt = useBilingual("studio.eraserPicker");
  const name = bt(option.name, option.en.name);
  const residualOpacity = Math.round((1 - option.defaultOpacity) * 100) / 100;
  return (
    <div
      data-studio-eraser-preview={option.id}
      className="rounded-xl bg-canvas/80 px-2.5 pb-2 pt-1.5 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.055)]"
    >
      <div
        aria-hidden
        className="mb-1 flex items-center justify-between text-[0.58rem] font-semibold text-fg-3"
      >
        <span>{bt("지우기 전", "Before")}</span>
        <span>{bt("한 번 지운 뒤", "One pass")}</span>
      </div>
      <svg
        viewBox="0 0 220 48"
        role="img"
        aria-label={bt(`${option.name} 미리보기: ${option.previewLabel}`, `${name} preview: ${option.en.previewLabel}`)}
        className="block h-10 w-full overflow-visible text-fg"
      >
        <rect
          x="0"
          y="4"
          width="98"
          height="40"
          rx="9"
          className="fill-card"
        />
        <rect
          x="122"
          y="4"
          width="98"
          height="40"
          rx="9"
          className="fill-card"
        />
        <path
          d="M 12 25 C 31 18, 56 31, 86 23"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          data-studio-eraser-after-line={option.id}
          data-studio-residual-opacity={residualOpacity}
          d="M 134 25 C 153 18, 178 31, 208 23"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          opacity={residualOpacity}
        />
        {option.id === "precision-eraser" || option.id === "broad-eraser" ? (
          <path d="M 134 25 C 153 18, 178 31, 208 23" pathLength="100" fill="none"
            stroke="currentColor" strokeWidth="8" strokeLinecap="butt"
            strokeDasharray={option.id === "precision-eraser" ? "47 6 47" : "17 66 17"} />
        ) : null}
        <path
          d="m 105 18 7 7-7 7"
          fill="none"
          className="stroke-fg-3"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Controlled eraser preset picker shared by desktop popovers and mobile sheets.
 * The preview demonstrates the result on ink instead of drawing a decorative eraser swatch.
 */
export function StudioEraserQuickPicker({
  selectedId,
  onSelect,
  className,
  ariaLabel, placement,
  advancedSettings,
  onAdvancedSettingsChange,
}: StudioEraserQuickPickerProps): ReactElement {
  const [fallbackAdvanced, setFallbackAdvanced] = useState<StudioAdvancedEraserSettings>(DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS);
  const resolvedAdvanced = advancedSettings ?? fallbackAdvanced;
  const handleAdvancedChange = (next: StudioAdvancedEraserSettings): void => {
    if (advancedSettings === undefined) setFallbackAdvanced(next);
    onAdvancedSettingsChange?.(next);
  };
  const bt = useBilingual("studio.eraserPicker");
  const group = placement === "mobile" ? bt("모바일 지우개 종류 빠른 선택", "Mobile eraser presets")
    : placement === "catalog" ? bt("지우개 종류 선택", "Eraser presets") : bt("지우개 종류 빠른 선택", "Quick eraser presets");
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? group}
      data-studio-eraser-quick-picker="true"
      className={cn(
        "grid grid-cols-1 gap-2",
        placement === "mobile" ? "min-[480px]:grid-cols-2" : "min-[340px]:grid-cols-2",
        className,
      )}
    >
      {STUDIO_ERASER_PRESETS.map((option) => {
        const strengthPercent = Math.round(option.defaultOpacity * 100);
        const name = bt(option.name, option.en.name);
        const description = bt(option.description, option.en.description);
        const selected = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            aria-label={bt(`${option.name}, ${strengthPercent}% 지움. ${option.description}`, `${name}, ${strengthPercent}% erase. ${option.en.description}`)}
            onClick={() => onSelect(option.id)}
            data-studio-eraser-quick-option={option.id}
            data-studio-min-target-px="44"
            className={cn(
              "relative w-full gap-2 border text-left",
              placement === "mobile"
                ? "grid min-h-24 grid-cols-[minmax(0,1fr)_minmax(5rem,34%)] items-center rounded-xl px-3 py-2"
                : "flex min-h-[8.5rem] flex-col rounded-2xl p-3",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              selected
                ? "border-accent/65 bg-accent-soft/45 text-fg shadow-[0_3px_12px_oklch(0.08_0.01_70/0.24)]"
                : "border-line/70 bg-card/75 text-fg hover:border-line-strong hover:bg-raised/85",
            )}
          >
            <span className="flex w-full flex-wrap items-start gap-2">
              <span className="min-w-[5rem] flex-1">
                <strong className="block text-sm font-extrabold tracking-tight text-fg">
                  {name}
                </strong>
                <span className="mt-1 block text-[0.7rem] leading-5 text-fg-2">
                  {description}
                </span>
              </span>
              <span
                aria-label={bt(`지우기 강도 ${strengthPercent}%`, `Erase strength ${strengthPercent}%`)}
                className={cn(
                  "inline-flex min-h-6 shrink-0 items-center rounded-full border px-2 text-[0.64rem] font-extrabold tabular-nums",
                  selected
                    ? "border-accent/45 bg-accent text-on-accent"
                    : "border-line bg-canvas/80 text-fg-2",
                )}
              >
                {bt(`${strengthPercent}% 지움`, `${strengthPercent}% erase`)}
              </span>
            </span>

            <StudioEraserBeforeAfterPreview option={option} />

            <span
              aria-hidden
              className={cn(
                "absolute bottom-2.5 right-2.5 grid size-5 place-items-center rounded-full border",
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-strong bg-card text-transparent",
              )}
            >
              <Check size={12} strokeWidth={2.5} />
            </span>
          </button>
        );
      })}
      <Suspense fallback={null}>
        <StudioEraserAdvancedSection
          advancedSettings={resolvedAdvanced}
          onAdvancedSettingsChange={handleAdvancedChange}
        />
      </Suspense>
    </div>
  );
}
