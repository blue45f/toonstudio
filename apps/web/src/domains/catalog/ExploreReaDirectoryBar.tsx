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
  all: ["전체 디렉터리", "All Directory"],
  ongoing: ["연재중 (Ongoing)", "Ongoing"],
  completed: ["완결 (Completed)", "Completed"],
  hiatus: ["시즌 휴재·재정비", "Season Hiatus"],
  alpha: ["가나다 · A-Z 순", "A–Z Order"],
  updated: ["최신 업데이트순", "Recently Updated"],
};

const COMBO_LABELS: Readonly<
  Record<string, { readonly label: readonly [string, string]; readonly tag: readonly [string, string] }>
> = {
  "regression-fantasy": {
    label: ["회귀 · 헌터 · 액션판타지", "Regression & Hunter Fantasy"],
    tag: ["#회귀/각성", "#Regression"],
  },
  "contract-rofan": {
    label: ["계약결혼 · 황궁 로맨스판타지", "Royal Contract RoFan"],
    tag: ["#계약관계", "#ContractMarriage"],
  },
  "cyberpunk-sf": {
    label: ["사이버펑크 · 디스토피아 SF", "Cyberpunk & Dystopian Sci-Fi"],
    tag: ["#네오서울", "#Cyberpunk"],
  },
  "mystery-thriller": {
    label: ["두뇌심리전 · 미스터리 스릴러", "Mind-Game Mystery Thriller"],
    tag: ["#반전서사", "#PlotTwist"],
  },
  "slice-of-life-cuts": {
    label: ["공감 일상 · 숏폼 개그툰", "Slice-of-Life & Short Gag"],
    tag: ["#가벼운호흡", "#BiteSized"],
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
    label: ["네이버·카카오 주간 정통 (65~80컷)", "Naver/Kakao Weekly (65-80 cuts)"],
    status: ["ongoing"],
    sortKey: "popular",
  },
  {
    id: "tapas-bite-sized",
    label: ["Tapas·WEBTOON·MANGA Plus 글로벌 동시연재 (30~45컷)", "Tapas/WEBTOON/MANGA Plus Simulrelease (30-45 cuts)"],
    status: ["ongoing"],
    sortKey: "newest",
  },
  {
    id: "lezhin-binge-complete",
    label: ["리디·레진·봄툰·피너툰·Manta·Piccoma 완결 정주행 패스", "Ridi/Lezhin/Bomtoon/Peanutoon/Manta/Piccoma Binge Pass"],
    status: ["completed"],
    sortKey: "rating",
  },
  {
    id: "munpia-novelpia-watcha",
    label: ["문피아·조아라·노벨피아·교보eBook·밀리의서재 노벨코믹스 & 왓챠피디아 고별점 픽", "Munpia/Joara/Novelpia/Kyobo/Millie Novel-Comics & Watcha Pedia Top Rated"],
    status: ["ongoing"],
    sortKey: "rating",
  },
  {
    id: "bilibili-kuaikan-comicdays",
    label: ["빌리빌리·콰이칸·동만·토나리노영점프·쿠라게번치·망가도서관Z·포켓코믹스·진강문학성·SFACG 아시아/글로벌 인기작", "Bilibili/Kuaikan/Dongman/Tonari no Young Jump/Kurage Bunch/Manga Library Z/Pocket Comics/JJWXC/SFACG Global Hits"],
    status: ["ongoing"],
    sortKey: "popular",
  },
];

const READER_VIEW_MODES = [
  { id: "vertical", label: ["네이버·카카오 세로 스크롤", "Vertical Scroll"] },
  { id: "koma-swipe", label: ["메챠코믹 코마뷰 (1컷 스와이프)", "Mecha Comic Koma-View"] },
  { id: "spread-rtl", label: ["점프+·ComicFuz 좌우 양면(RTL)", "Jump+/ComicFuz Spread (RTL)"] },
  { id: "alt-text-a11y", label: ["Corona EX·Sylph 스크린리더 대사색인", "Corona EX/Sylph Screen-Reader Alt-Text"] },
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
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-colors",
                  active
                    ? "border-accent bg-accent text-canvas shadow-sm"
                    : "border-line bg-panel/70 text-fg-2 hover:border-accent/45 hover:text-fg",
                )}
              >
                <span>{bt(...labelPair)}</span>
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
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors",
                active
                  ? "border-accent/65 bg-accent-soft text-accent"
                  : "border-line bg-panel/60 text-fg-2 hover:border-accent/45 hover:text-fg",
              )}
            >
              <span>{comboCopy ? bt(...comboCopy.label) : combo.id}</span>
              <span className="text-[11px] text-fg-3">{comboCopy ? bt(...comboCopy.tag) : ""}</span>
            </button>
          );
        })}
      </div>

      <div
        role="group"
        aria-label={bt("글로벌 포털 열독 템포·연재 호흡 프리셋", "Global portal reading tempo presets")}
        data-testid="explore-rea-reading-tempo-bar"
        className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3 text-[11px]"
      >
        <span className="mr-1 font-bold text-fg-3">
          {bt("포털 호흡 벤치마크:", "Portal Pacing:")}
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
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-panel/60 px-3 py-1.5 font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
          >
            {bt(...preset.label)}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={bt("글로벌 리더 뷰포트 & 접근성 시뮬레이터", "Global reader viewport and accessibility simulator")}
        data-testid="explore-rea-reader-simulator-bar"
        className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3 text-[11px]"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-accent">{bt("리더 뷰포트·접근성 모드:", "Reader & A11y Mode:")}</span>
          {READER_VIEW_MODES.map((rm) => (
            <button
              key={rm.id}
              type="button"
              aria-pressed={readerViewMode === rm.id}
              data-testid={`explore-reader-mode-${rm.id}`}
              onClick={() => setReaderViewMode(rm.id)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 font-semibold transition-colors",
                readerViewMode === rm.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel/60 text-fg-2 hover:border-accent/40",
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
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[10px] font-bold text-success hover:border-accent/40"
        >
          {danmakuHeatmapOn
            ? bt("빌리빌리·콰이칸 컷별 탄막 히트맵 ON · 75개 언어 동시연재", "Bilibili/Kuaikan Danmaku Heatmap ON · 75-Lang Simulpub")
            : bt("탄막 히트맵 OFF (클린 리더)", "Danmaku Heatmap OFF (Clean Reader)")}
        </button>
      </div>
    </section>
  );
}
