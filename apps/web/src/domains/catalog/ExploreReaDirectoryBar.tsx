import type { SortKey } from "@/shared/lib/search";
import type { SerialStatus } from "@/shared/lib/types";
import type { TitleFilterState } from "@/shared/lib/title-filters";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  EXPLORE_DIRECTORY_MODES,
  EXPLORE_PREFERENCE_TAG_COMBOS,
  runSameDocumentViewTransition,
  type ExploreDirectoryMode,
} from "@/shared/navigation/webtoon-platform-router-ux-model";

export interface ExploreReaDirectoryBarProps {
  readonly filters: TitleFilterState;
  readonly sort: string;
  readonly onApplyFilters: (next: TitleFilterState) => void;
  readonly onChangeSort: (nextSort: SortKey) => void;
}

function mapSortKey(sortValue: ExploreDirectoryMode["sortValue"]): SortKey {
  if (sortValue === "latest") return "newest";
  return sortValue;
}

function mapStatusFilter(statusValue: ExploreDirectoryMode["statusValue"]): SerialStatus[] {
  if (statusValue === "ONGOING") return ["ongoing"];
  if (statusValue === "COMPLETED") return ["completed"];
  if (statusValue === "HIATUS") return ["hiatus"];
  return [];
}

export function ExploreReaDirectoryBar({
  filters,
  sort,
  onApplyFilters,
  onChangeSort,
}: ExploreReaDirectoryBarProps) {
  const bt = useBilingual("ExplorePage");

  const isModeActive = (mode: ExploreDirectoryMode): boolean => {
    const mapped = mapStatusFilter(mode.statusValue);
    const mappedSort = mapSortKey(mode.sortValue);
    if (mapped.length === 0) {
      return filters.status.length === 0 && (sort === mode.sortValue || sort === mappedSort);
    }
    return filters.status.length === 1 && filters.status[0] === mapped[0];
  };

  return (
    <section
      aria-label={bt("디렉터리 모드 및 취향 태그 조합기", "Directory modes and preference tag combinator")}
      data-testid="explore-rea-directory-bar"
      className="rounded-2xl border border-line bg-card/85 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bt("디렉터리 빠른 전환", "Directory mode presets")}>
          <span className="mr-1 text-xs font-extrabold uppercase tracking-wider text-accent">
            DIRECTORY
          </span>
          {EXPLORE_DIRECTORY_MODES.map((mode) => {
            const active = isModeActive(mode);
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  runSameDocumentViewTransition(() => {
                    onApplyFilters({
                      ...filters,
                      status: mapStatusFilter(mode.statusValue),
                    });
                    onChangeSort(mapSortKey(mode.sortValue));
                  });
                }}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                  active
                    ? "border-accent bg-accent text-canvas shadow-sm"
                    : "border-line bg-panel/70 text-fg-2 hover:border-accent/45 hover:text-fg",
                )}
              >
                <span>{mode.label}</span>
                <span className="rounded-full bg-canvas/20 px-1.5 py-0.5 text-[10px] font-extrabold">
                  {mode.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="group"
        aria-label={bt("취향 태그 조합 프리셋", "Preference tag combination presets")}
        data-testid="explore-preference-tag-combos"
        className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3"
      >
        <span className="mr-1 text-xs font-bold text-fg-3">
          {bt("취향 조합:", "Taste Combos:")}
        </span>
        {EXPLORE_PREFERENCE_TAG_COMBOS.map((combo) => {
          const active = filters.genres.length === 1 && filters.genres[0] === combo.genreValue;
          return (
            <button
              key={combo.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                runSameDocumentViewTransition(() => {
                  onApplyFilters({
                    ...filters,
                    genres: active ? [] : [combo.genreValue],
                  });
                });
              }}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                active
                  ? "border-accent/65 bg-accent-soft text-accent"
                  : "border-line bg-panel/60 text-fg-2 hover:border-accent/45 hover:text-fg",
              )}
            >
              <span>{combo.label}</span>
              <span className="text-[11px] text-fg-3">{combo.tags[0]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
