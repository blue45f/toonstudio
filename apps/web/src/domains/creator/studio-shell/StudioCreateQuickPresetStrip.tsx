import { ArrowRight, Palette, SlidersHorizontal } from "lucide-react";
import React, { Suspense, useCallback, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_GUIDED_GENRE_STARTERS,
  type GuidedGenreStarterSpec,
} from "./guided-flow/studio-guided-flow-catalog";

const StudioSmartAutofillAssistantCard = React.lazy(
  () => import("../smart-form-autofill/StudioSmartAutofillAssistantCard"),
);

export type StudioCreateQuickPreset = GuidedGenreStarterSpec;

function resolveStarterForSmartAutofill(payload: {
  readonly genre: string | null;
  readonly targetPlatformSpec: string | null;
}): GuidedGenreStarterSpec {
  const spec = payload.targetPlatformSpec ?? "";
  const genre = payload.genre ?? "";
  if (spec.includes("컷툰") || genre.includes("일상")) {
    return STUDIO_GUIDED_GENRE_STARTERS[2] ?? STUDIO_GUIDED_GENRE_STARTERS[0];
  }
  if (spec.includes("단행본") || genre.includes("미스터리")) {
    return STUDIO_GUIDED_GENRE_STARTERS[3] ?? STUDIO_GUIDED_GENRE_STARTERS[0];
  }
  if (genre.includes("액션") || genre.includes("SF")) {
    return STUDIO_GUIDED_GENRE_STARTERS[1] ?? STUDIO_GUIDED_GENRE_STARTERS[0];
  }
  return STUDIO_GUIDED_GENRE_STARTERS[0];
}

export function StudioCreateQuickPresetStrip({
  activePresetId,
  onSelectPreset,
  onQuickStart,
  quickStartSummary,
  creating = false,
  quickStartLabel,
}: {
  readonly activePresetId: string | null;
  readonly onSelectPreset: (preset: StudioCreateQuickPreset) => void;
  readonly onQuickStart?: () => void;
  readonly quickStartSummary?: string;
  readonly creating?: boolean;
  readonly quickStartLabel?: string;
}) {
  const bt = useBilingual("StudioCreateQuickPresetStrip");
  const [autofillOpen, setAutofillOpen] = useState(false);
  const activePreset = STUDIO_GUIDED_GENRE_STARTERS.find(
    (item) => item.quickPresetId === activePresetId,
  ) ?? null;

  const handleSmartAutofillApply = useCallback(
    (payload: { readonly genre: string | null; readonly targetPlatformSpec: string | null }) => {
      onSelectPreset(resolveStarterForSmartAutofill(payload));
    },
    [onSelectPreset],
  );

  return (
    <section
      aria-label={bt("장르 예시", "Genre examples")}
      data-testid="studio-create-quick-presets"
      className="mt-4 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft to-panel p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Palette size={13} aria-hidden="true" />
            {bt("장르별 빠른 시작", "GENRE QUICK STARTERS")}
          </p>
          <h2 className="mt-1 text-base font-black text-fg sm:text-lg">
            {bt(
              "분위기 카드를 고르면 판형·시작 단계·가제가 한 번에 채워집니다.",
              "Pick a genre mood card to prefill format, starting step, and working title.",
            )}
          </h2>
        </div>
        <span className="rounded-full border border-line bg-card px-3 py-1 text-[0.68rem] font-bold text-accent">
          {bt("언제든 아래에서 직접 바꿀 수 있어요", "Editable anytime below")}
        </span>
      </div>

      <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {STUDIO_GUIDED_GENRE_STARTERS.map((preset) => {
          const active = activePresetId === preset.quickPresetId;
          return (
            <button
              key={preset.quickPresetId}
              type="button"
              aria-pressed={active}
              data-testid={`studio-quick-preset-${preset.quickPresetId}`}
              onClick={() => onSelectPreset(preset)}
              className={cn(
                "group flex min-h-11 flex-col overflow-hidden rounded-2xl border text-left transition-[transform,border-color,background-color] duration-150 motion-reduce:transform-none motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent-soft/45 shadow-sm"
                  : "border-line bg-card hover:-translate-y-0.5 hover:border-accent/50 hover:bg-raised",
              )}
            >
              <span className="relative block h-24 w-full overflow-hidden bg-canvas">
                <img
                  src={preset.imageUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas/85 via-transparent to-transparent"
                />
                <span className="absolute bottom-2 left-2.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[10px] font-bold text-fg">
                  {bt(preset.badgeKo, preset.badgeEn)}
                </span>
              </span>
              <span className="flex flex-1 flex-col justify-between p-3">
                <span>
                  <strong className="block text-sm font-black text-fg">
                    {bt(preset.titleKo, preset.titleEn)}
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-2">
                    {bt(preset.descKo, preset.descEn)}
                  </span>
                </span>
                <span className="mt-2.5 inline-flex items-center justify-between text-[0.68rem] font-extrabold text-accent">
                  <span>
                    {active
                      ? bt("이 구성으로 준비됨", "Preset applied")
                      : bt("이 구성으로 채우기", "Apply this preset")}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {activePreset && onQuickStart ? (
        <div
          data-testid="studio-quick-preset-launch-bar"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/35 bg-card/90 px-4 py-3"
        >
          <div className="min-w-0">
            <strong className="block text-xs font-black text-fg sm:text-sm">
              {bt(
                `${activePreset.titleKo} 구성이 준비됐어요`,
                `${activePreset.titleEn} preset is ready`,
              )}
            </strong>
            {quickStartSummary ? (
              <span className="mt-0.5 block text-xs text-fg-2">{quickStartSummary}</span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={creating}
            data-testid="studio-quick-preset-start-now"
            onClick={onQuickStart}
            className={buttonClass({ className: "min-h-11 shrink-0 gap-2" })}
          >
            {quickStartLabel ?? bt("이 프리셋으로 바로 시작", "Start right away with preset")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <details
        data-testid="studio-smart-autofill-disclosure"
        open={autofillOpen}
        onToggle={(event) => setAutofillOpen(event.currentTarget.open)}
        className="mt-3.5 rounded-2xl border border-accent/30 bg-card/90 p-3"
      >
        <summary
          data-testid="studio-smart-autofill-summary"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-1 text-sm font-extrabold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal size={15} className="shrink-0 text-accent" aria-hidden="true" />
            <span>
              {bt("핵심 입력 1개로 자동 채우기", "Auto-fill from 1 required line")}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-xs font-bold text-good tabular-nums">
            {bt("무료 · 펼쳐서 사용", "Free · Expand")}
          </span>
        </summary>
        {autofillOpen ? (
          <div className="mt-3">
            <Suspense
              fallback={
                <div
                  role="status"
                  className="rounded-xl border border-line bg-panel p-4 text-xs font-semibold text-fg-2"
                >
                  {bt(
                    "필수 1개 · AI 자동 채우기 도우미를 불러오는 중입니다…",
                    "Loading 1-required AI autofill helper…",
                  )}
                </div>
              }
            >
              <StudioSmartAutofillAssistantCard
                initialWorkflowId="project-create"
                onApplyRecommendation={handleSmartAutofillApply}
              />
            </Suspense>
          </div>
        ) : null}
      </details>
    </section>
  );
}
