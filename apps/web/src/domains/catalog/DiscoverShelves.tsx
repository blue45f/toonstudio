import { useRef, useState } from "react";

import { ErrorState } from "@/shared/components/feedback/error-state";
import { Rail, Section } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import { buildDiscoverShelves, type DiscoverHomeSnapshot, type DiscoverShelfId } from "./discover-home";
import { discoverShelfCopies } from "./discover-shelf-copy";
import { useCatalogInkIndicator } from "./use-catalog-ink-indicator";

const SKELETON_SHELF_COUNT = 2;
const SKELETON_CARD_COUNT = 6;
const INITIAL_VISIBLE_SHELVES = 3;
const INITIAL_CARDS_PER_SHELF = 4;

type ShelfFilterKey = "all" | DiscoverShelfId;

const SHELF_FILTER_LABELS: Readonly<Record<ShelfFilterKey, readonly [string, string]>> = {
  all: ["전체 선반", "All shelves"],
  weekday: ["요일 연재", "By weekday"],
  "top-rated": ["평점 상위", "Top rated"],
  free: ["무료·기다무", "Free & wait-free"],
  newest: ["최근 공개", "Recent releases"],
};

export function DiscoverShelfSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="skeleton-group">
      <span data-slot="skeleton" className="skeleton block h-3 w-20" aria-hidden="true" />
      <span data-slot="skeleton" className="skeleton mt-2 block h-6 w-56 max-w-full" aria-hidden="true" />
      <div className="mt-4 flex gap-3 overflow-hidden" aria-hidden="true">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <div key={index} className="w-[150px] shrink-0 sm:w-[172px]">
            <span data-slot="skeleton" className="skeleton block aspect-[3/4] w-full rounded-xl" />
            <span data-slot="skeleton" className="skeleton mt-2.5 block h-3.5 w-4/5" />
            <span data-slot="skeleton" className="skeleton mt-1.5 block h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface DiscoverShelvesProps {
  readonly snapshot: DiscoverHomeSnapshot | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
}

/**
 * 탐색 허브의 작품 레일 — 요일 연재·평점·무료·최신 네 줄을 실제 카탈로그 스냅샷으로 보여 준다.
 * 불러오는 동안에는 레일 모양 스켈레톤, 실패하면 재시도 블록을 같은 자리에 둔다.
 */
export function DiscoverShelves({ snapshot, loading, error, onRetry }: DiscoverShelvesProps) {
  const bt = useBilingual("DiscoverShelves");
  const [expandedShelves, setExpandedShelves] = useState(false);
  const [selectedShelf, setSelectedShelf] = useState<ShelfFilterKey>("all");
  const filterStripRef = useRef<HTMLDivElement>(null);
  const filterInk = useCatalogInkIndicator(filterStripRef, selectedShelf, {
    activeSelector: '[aria-pressed="true"]',
    itemSelector: "button",
    maxInsetPx: 6,
  });

  if (!snapshot) {
    if (error) {
      return (
        <ErrorState
          title={bt("추천 작품을 불러오지 못했어요", "Couldn't load the story picks")}
          message={bt(
            "검색과 아래 탐색 도구는 그대로 쓸 수 있어요. 잠시 뒤 다시 시도해 주세요.",
            "Search and the discovery tools below still work. Please try again in a moment.",
          )}
          onRetry={onRetry}
          className="discover-hub-error"
        />
      );
    }
    if (!loading) return null;
    const label = bt("추천 작품을 불러오는 중", "Loading story picks");
    return (
      <div className="flex flex-col gap-8 sm:gap-10">
        {Array.from({ length: SKELETON_SHELF_COUNT }, (_, index) => (
          <DiscoverShelfSkeleton key={index} label={label} />
        ))}
      </div>
    );
  }

  const shelves = buildDiscoverShelves(snapshot);
  if (shelves.length === 0) {
    return (
      <div
        role="status"
        data-testid="discover-shelves-empty"
        className="rounded-xl border border-dashed border-line bg-card/60 p-8 text-center"
      >
        <p className="text-sm font-semibold text-fg">
          {bt("현재 표시할 추천 작품이 없어요.", "No story picks are available right now.")}
        </p>
        <p className="mt-1 text-xs text-fg-3">
          {bt(
            "카탈로그를 다시 불러오거나 조건별 탐색에서 전체 작품을 둘러보세요.",
            "Reload the catalog or browse all stories in Explore.",
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-4 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
          >
            {bt("다시 시도", "Try again")}
          </button>
          <Link
            href="/explore"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-2"
          >
            {bt("조건으로 작품 찾기", "Explore by filters")}
          </Link>
        </div>
      </div>
    );
  }

  const copies = discoverShelfCopies(bt, snapshot);
  const availableFilterKeys: ShelfFilterKey[] = ["all", ...shelves.map((shelf) => shelf.id)];
  const activeFilter: ShelfFilterKey = availableFilterKeys.includes(selectedShelf) ? selectedShelf : "all";
  const visibleShelves =
    activeFilter === "all"
      ? expandedShelves
        ? shelves
        : shelves.slice(0, INITIAL_VISIBLE_SHELVES)
      : shelves.filter((shelf) => shelf.id === activeFilter);
  const hasHiddenShelfContent =
    activeFilter === "all" &&
    (shelves.length > INITIAL_VISIBLE_SHELVES ||
      shelves.some((shelf) => shelf.titles.length > INITIAL_CARDS_PER_SHELF));

  return (
    <div className="flex flex-col gap-6 sm:gap-8" data-discover-shelves="">
      {shelves.length > 1 ? (
        <div
          ref={filterStripRef}
          role="group"
          aria-label={bt("선반 주제 전환", "Filter story shelves")}
          onPointerMove={filterInk.onPointerMove}
          onPointerLeave={filterInk.onPointerLeave}
          onFocusCapture={filterInk.onFocusCapture}
          onBlurCapture={filterInk.onBlurCapture}
          className="discover-shelf-tabs"
        >
          {availableFilterKeys.map((key) => {
            const active = key === activeFilter;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedShelf(key)}
                className={cn(
                  "discover-shelf-tab",
                  active && "is-active",
                )}
              >
                {bt(...SHELF_FILTER_LABELS[key])}
              </button>
            );
          })}
          <span aria-hidden="true" className="discover-ink-indicator" style={filterInk.style} />
        </div>
      ) : null}

      <div
        key={`${activeFilter}-${expandedShelves ? "all" : "compact"}`}
        className="ink-cascade flex flex-col gap-10 sm:gap-12"
      >
        {visibleShelves.map((shelf) => {
          const copy = copies[shelf.id];
          const visibleTitles =
            activeFilter === "all" && !expandedShelves
              ? shelf.titles.slice(0, INITIAL_CARDS_PER_SHELF)
              : shelf.titles;
          return (
            <Section
              key={shelf.id}
              eyebrow={copy.eyebrow}
              title={copy.title}
              desc={copy.desc}
              action={{ label: copy.action, href: shelf.href }}
              className="discover-shelf-section"
            >
              <div data-ink-stagger="panel">
                <Rail ariaLabel={copy.title}>
                  {visibleTitles.map((item, idx) => (
                    <TitleCard
                      key={item.id}
                      title={item}
                      index={idx}
                      rank={idx + 1}
                      size="sm"
                      className="w-[150px] shrink-0 sm:w-[172px]"
                    />
                  ))}
                </Rail>
              </div>
            </Section>
          );
        })}
      </div>

      {hasHiddenShelfContent ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            aria-expanded={expandedShelves}
            data-testid="discover-shelves-more-toggle"
            onClick={() => setExpandedShelves((prev) => !prev)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-5 py-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg motion-reduce:transition-none"
          >
            {expandedShelves
              ? bt("추천 선반 접기", "Show fewer shelves")
              : bt("추천 선반 더보기", "More recommended shelves")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
