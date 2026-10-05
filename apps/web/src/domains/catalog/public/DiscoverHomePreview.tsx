import { useApiResource } from "@/platform/use-api-resource";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  DISCOVER_HOME_SNAPSHOT_URL,
  buildDiscoverShelves,
  pickDiscoverSpotlight,
  type DiscoverHomeSnapshot,
} from "../discover-home";
import { DiscoverSpotlight } from "../DiscoverSpotlight";
import { DiscoverWeekdayRail } from "../DiscoverWeekdayRail";

/**
 * 홈(/)의 발견 미리보기 — 탐색 허브와 같은 카탈로그 스냅샷으로 스포트라이트 1장과
 * 요일 연재 레일 1줄만 보여 주는 절제된 미리보기다. 레일 네 줄 전체는 /discover가 소유한다.
 * 스냅샷을 불러오지 못했거나 보여 줄 작품이 없으면 구간 자체를 만들지 않는다:
 * 홈은 제작 동선이 본분이라 발견 실패를 오류 블록으로 드러내지 않는다.
 */
export function DiscoverHomePreview() {
  const bt = useBilingual("DiscoverHomePreview");
  const home = useApiResource<DiscoverHomeSnapshot>(
    DISCOVER_HOME_SNAPSHOT_URL,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load story picks."),
  );

  const snapshot = home.data;
  if (!home.loading) {
    if (!snapshot) return null;
    const hasSpotlight = pickDiscoverSpotlight(snapshot) != null;
    const hasWeekdayRail = buildDiscoverShelves(snapshot).some((shelf) => shelf.id === "weekday");
    if (!hasSpotlight && !hasWeekdayRail) return null;
  }

  return (
    <section aria-label={bt("읽을 이야기 미리보기", "Stories to read")} className="flex flex-col gap-8">
      <DiscoverSpotlight snapshot={snapshot} loading={home.loading} />
      <DiscoverWeekdayRail snapshot={snapshot} loading={home.loading} />
    </section>
  );
}
