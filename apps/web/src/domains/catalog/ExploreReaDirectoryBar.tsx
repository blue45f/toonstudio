import { ChevronDown } from "lucide-react";
import { useState } from "react";
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
  type ExploreDirectoryModeId,
} from "@/shared/navigation/webtoon-platform-router-ux-model";

export interface ExploreReaDirectoryBarProps {
  readonly filters: TitleFilterState;
  readonly sort: string;
  readonly onApplyFilters: (next: TitleFilterState) => void;
  readonly onChangeSort: (nextSort: SortKey) => void;
}

const DIRECTORY_MODE_LABELS: Readonly<Record<ExploreDirectoryModeId, readonly [string, string]>> = {
  all: ["전체 목록", "All titles"],
  ongoing: ["연재 중", "Ongoing"],
  completed: ["완결 작품", "Completed"],
  hiatus: ["시즌 휴재", "Season hiatus"],
  alpha: ["가나다순", "A–Z order"],
  updated: ["최근 업데이트순", "Recently updated"],
};

const COMBO_LABELS: Readonly<
  Record<string, { readonly label: readonly [string, string]; readonly tag: readonly [string, string] }>
> = {
  "regression-fantasy": {
    label: ["회귀 · 헌터 판타지", "Regression & hunter fantasy"],
    tag: ["#회귀", "#Regression"],
  },
  "contract-rofan": {
    label: ["계약결혼 · 로맨스판타지", "Contract romance fantasy"],
    tag: ["#로맨스판타지", "#RoFan"],
  },
  "cyberpunk-sf": {
    label: ["근미래 · 디스토피아 SF", "Near-future & sci-fi"],
    tag: ["#SF", "#SciFi"],
  },
  "mystery-thriller": {
    label: ["추리 · 심리 스릴러", "Mystery & thriller"],
    tag: ["#반전", "#Mystery"],
  },
  "slice-of-life-cuts": {
    label: ["일상 · 가벼운 개그", "Slice of life & comedy"],
    tag: ["#일상", "#SliceOfLife"],
  },
};

const TEMPO_PRESETS: readonly {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly status: SerialStatus[];
  readonly sortKey: SortKey;
}[] = [
  {
    id: "naver-weekly-long",
    label: ["긴 호흡 주간 연재작", "Full-length weekly series"],
    status: ["ongoing"],
    sortKey: "popular",
  },
  {
    id: "tapas-bite-sized",
    label: ["가볍게 읽는 짧은 회차", "Short, quick episodes"],
    status: ["ongoing"],
    sortKey: "newest",
  },
  {
    id: "lezhin-binge-complete",
    label: ["몰아보기 좋은 완결작", "Completed series to binge"],
    status: ["completed"],
    sortKey: "rating",
  },
  {
    id: "munpia-novelpia-watcha",
    label: ["원작 소설 기반 · 높은 평점", "Novel adaptations · top rated"],
    status: ["ongoing"],
    sortKey: "rating",
  },
  {
    id: "bilibili-kuaikan-comicdays",
    label: ["독자 반응이 활발한 인기작", "Popular with active readers"],
    status: ["ongoing"],
    sortKey: "popular",
  },
];

const READER_VIEW_MODES = [
  { id: "vertical", label: ["세로 스크롤", "Vertical scroll"] },
  { id: "koma-swipe", label: ["한 컷씩 넘기기", "Single-panel swipe"] },
  { id: "spread-rtl", label: ["두 쪽 펼쳐보기", "Two-page spread"] },
  { id: "alt-text-a11y", label: ["대사 텍스트 안내", "Dialogue text guide"] },
] as const;

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
  const [readerViewMode, setReaderViewMode] = useState<"vertical" | "koma-swipe" | "spread-rtl" | "alt-text-a11y">("vertical");
  const [danmakuHeatmapOn, setDanmakuHeatmapOn] = useState<boolean>(true);

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
      aria-label={bt("빠른 조건 및 열람 화면 설정", "Quick filters and reader display options")}
      data-testid="explore-rea-directory-bar"
      className="rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bt("연재 상태 빠른 전환", "Status presets")}>
        <span className="mr-1 text-xs font-semibold text-fg-2">
          {bt("연재 상태", "Status")}
        </span>
        {EXPLORE_DIRECTORY_MODES.map((mode) => {
          const active = isModeActive(mode);
          const labelPair = DIRECTORY_MODE_LABELS[mode.id];
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
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                active
                  ? "border-accent bg-accent text-on-accent font-semibold"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <span>{bt(...labelPair)}</span>
            </button>
          );
        })}
      </div>

      <div
        role="group"
        aria-label={bt("취향 태그 조합 프리셋", "Preference tag combination presets")}
        data-testid="explore-preference-tag-combos"
        className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3"
      >
        <span className="mr-1 text-xs font-semibold text-fg-2">
          {bt("인기 조합", "Popular themes")}
        </span>
        {EXPLORE_PREFERENCE_TAG_COMBOS.map((combo) => {
          const active = filters.genres.length === 1 && filters.genres[0] === combo.genreValue;
          const comboCopy = COMBO_LABELS[combo.id];
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
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                active
                  ? "border-accent/65 bg-accent-soft text-accent font-semibold"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <span>{comboCopy ? bt(...comboCopy.label) : combo.id}</span>
              <span className="text-xs text-fg-3">{comboCopy ? bt(...comboCopy.tag) : ""}</span>
            </button>
          );
        })}
      </div>

      <div
        role="group"
        aria-label={bt("읽기 호흡별 빠른 선택", "Reading pace presets")}
        data-testid="explore-rea-reading-tempo-bar"
        className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3 text-xs"
      >
        <span className="mr-1 font-semibold text-fg-2">
          {bt("읽기 호흡", "Reading pace")}
        </span>
        {TEMPO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`explore-tempo-preset-${preset.id}`}
            onClick={() => {
              runSameDocumentViewTransition(() => {
                onApplyFilters({ ...filters, status: preset.status });
                onChangeSort(preset.sortKey);
              });
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-3 py-1.5 font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg motion-reduce:transition-none"
          >
            {bt(...preset.label)}
          </button>
        ))}
      </div>

      <details className="group mt-3 border-t border-line/70 pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 text-xs font-medium text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          <span>{bt("열람 화면 보기 설정", "Reader display options")}</span>
          <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div
          role="group"
          aria-label={bt("열람 화면 보기 설정", "Reader display options")}
          data-testid="explore-rea-reader-simulator-bar"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-semibold text-fg-2">{bt("화면 방식", "Layout")}</span>
            {READER_VIEW_MODES.map((rm) => (
              <button
                key={rm.id}
                type="button"
                aria-pressed={readerViewMode === rm.id}
                data-testid={`explore-reader-mode-${rm.id}`}
                onClick={() => setReaderViewMode(rm.id)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 font-medium transition-colors duration-150 motion-reduce:transition-none",
                  readerViewMode === rm.id
                    ? "border-accent bg-accent-soft text-accent font-semibold"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {bt(rm.label[0], rm.label[1])}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={danmakuHeatmapOn}
            data-testid="explore-danmaku-heatmap-toggle"
            onClick={() => setDanmakuHeatmapOn((v) => !v)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
              danmakuHeatmapOn
                ? "border-accent/55 bg-accent-soft text-accent font-semibold"
                : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            {danmakuHeatmapOn
              ? bt("독자 반응 표시 켜짐", "Reader reactions on")
              : bt("독자 반응 표시 꺼짐", "Reader reactions off")}
          </button>
        </div>
      </details>
    </section>
  );
}
