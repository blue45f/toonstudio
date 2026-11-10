import { Sparkles } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_GUIDED_GENRE_STARTERS,
  type GuidedGenreStarterSpec,
} from "./guided-flow/studio-guided-flow-catalog";

export type StudioCreateQuickPreset = GuidedGenreStarterSpec;

export function StudioCreateQuickPresetStrip({
  activePresetId,
  onSelectPreset,
}: {
  readonly activePresetId: string | null;
  readonly onSelectPreset: (preset: StudioCreateQuickPreset) => void;
}) {
  const bt = useBilingual("StudioCreateQuickPresetStrip");

  return (
    <section
      aria-label={bt("1초 장르 스타터", "1-second genre starters")}
      data-testid="studio-create-quick-presets"
      className="mt-4 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft to-panel p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Sparkles size={13} aria-hidden="true" />
            {bt("초보자 맞춤 추천 · 1초 장르 스타터", "BEGINNER QUICK STARTERS")}
          </p>
          <h2 className="mt-1 text-base font-black text-fg sm:text-lg">
            {bt(
              "복잡한 설정 없이 원하는 분위기 카드를 누르면 형식·시작점·가제가 한 번에 채워져요",
              "Pick a mood card to prefill format, starting step, and working title in one tap",
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
                "group flex min-h-11 flex-col overflow-hidden rounded-2xl border text-left transition-all motion-reduce:transform-none",
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
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
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
                      ? bt("✓ 이 구성으로 준비됨", "✓ Preset applied")
                      : bt("원클릭으로 채우기 →", "Apply in 1 tap →")}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
