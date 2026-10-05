import { Rail, Section } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { buildDiscoverShelves, type DiscoverHomeSnapshot } from "./discover-home";
import { discoverShelfCopies } from "./discover-shelf-copy";
import { DiscoverShelfSkeleton } from "./DiscoverShelves";

export interface DiscoverWeekdayRailProps {
  readonly snapshot: DiscoverHomeSnapshot | null;
  readonly loading: boolean;
}

/**
 * 요일 연재 레일 한 줄 — 탐색 허브 레일 묶음에서 요일 줄만 뽑은 것이다.
 * 스냅샷의 요일은 생성 시점 값이라, 방문 시점 KST 요일과 같을 때만 "오늘 업데이트"로
 * 부르고 다르면 해당 요일 연재로 표기한다(DiscoverShelves와 같은 복사 규칙을 공유).
 * 스냅샷이 없으면(실패·빈 응답) 레일 자체를 만들지 않는다.
 */
export function DiscoverWeekdayRail({ snapshot, loading }: DiscoverWeekdayRailProps) {
  const bt = useBilingual("DiscoverShelves");

  if (!snapshot) {
    if (!loading) return null;
    return <DiscoverShelfSkeleton label={bt("추천 작품을 불러오는 중", "Loading story picks")} />;
  }

  const shelf = buildDiscoverShelves(snapshot).find((entry) => entry.id === "weekday");
  if (!shelf) return null;
  const copy = discoverShelfCopies(bt, snapshot).weekday;

  return (
    <Section
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
}
