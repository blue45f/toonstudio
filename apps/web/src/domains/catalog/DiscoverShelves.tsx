import { ErrorState } from "@/shared/components/feedback/error-state";
import { Rail, Section } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { buildDiscoverShelves, type DiscoverHomeSnapshot } from "./discover-home";
import { discoverShelfCopies } from "./discover-shelf-copy";

const SKELETON_SHELF_COUNT = 2;
const SKELETON_CARD_COUNT = 6;

export function DiscoverShelfSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="skeleton-group">
      <span data-slot="skeleton" className="skeleton block h-3 w-20" aria-hidden="true" />
      <span data-slot="skeleton" className="skeleton mt-2 block h-6 w-56 max-w-full" aria-hidden="true" />
      <div className="mt-4 flex gap-3 overflow-hidden" aria-hidden="true">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <div key={index} className="w-[150px] shrink-0 sm:w-[172px]">
            <span data-slot="skeleton" className="skeleton block aspect-[3/4] w-full rounded-2xl" />
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
          className="p-8"
        />
      );
    }
    if (!loading) return null;
    const label = bt("추천 작품을 불러오는 중", "Loading story picks");
    return (
      <div className="flex flex-col gap-12">
        {Array.from({ length: SKELETON_SHELF_COUNT }, (_, index) => <DiscoverShelfSkeleton key={index} label={label} />)}
      </div>
    );
  }

  const copies = discoverShelfCopies(bt, snapshot);

  return (
    <div className="flex flex-col gap-12 sm:gap-14" data-discover-shelves="">
      {buildDiscoverShelves(snapshot).map((shelf) => {
        const copy = copies[shelf.id];
        return (
          <Section
            key={shelf.id}
            eyebrow={copy.eyebrow}
            title={copy.title}
            desc={copy.desc}
            action={{ label: copy.action, href: shelf.href }}
          >
            <Rail ariaLabel={copy.title}>
              {shelf.titles.map((item) => (
                <TitleCard key={item.id} title={item} />
              ))}
            </Rail>
          </Section>
        );
      })}
    </div>
  );
}
