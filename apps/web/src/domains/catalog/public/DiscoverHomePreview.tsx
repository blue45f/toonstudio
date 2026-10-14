import { ArrowRight } from "lucide-react";

import { useApiResource } from "@/platform/use-api-resource";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  DISCOVER_HOME_SNAPSHOT_URL,
  DISCOVER_HUB_HREF,
  buildDiscoverShelves,
  pickDiscoverSpotlight,
  type DiscoverHomeSnapshot,
} from "../discover-home";
import { DiscoverSpotlight } from "../DiscoverSpotlight";
import { DiscoverWeekdayRail } from "../DiscoverWeekdayRail";

/**
 * 홈(/)의 발견 미리보기 — 탐색 허브와 같은 카탈로그 스냅샷으로 스포트라이트 1장과
 * 요일 연재 레일 1줄만 보여 주는 절제된 미리보기다. 레일 네 줄 전체는 /discover가 소유한다.
 *
 * 미리보기 구간에는 명시적인 출구를 함께 표기한다:
 * - 구간 제목("읽을 이야기 미리보기") 옆의 "전체 보기"는 미리보기 전체의 출구로,
 *   스포트라이트·레일 전체를 소유한 탐색 허브(/discover)로 이어진다.
 * - 요일 레일은 자기 제목 옆에 "전체 보기"를 따로 두고, 도착지는 레일의 실제 전체
 *   목록인 연재 캘린더(shelf.href)를 그대로 쓴다.
 * 스냅샷을 불러오지 못했거나 보여 줄 작품이 없으면 구간 자체를 만들지 않는다:
 * 홈은 제작 동선이 본분이라 발견 실패를 오류 블록으로 드러내지 않고, 비어 있는
 * 구간에 출구만 남겨 거짓 도착지를 가리키는 일도 없다. 불러오는 동안에는 제목과
 * 출구를 먼저 같은 자리에 두고 아래에 스켈레톤을 채워 레이아웃이 흔들리지 않게 한다.
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

  const previewTitle = bt("읽을 이야기 미리보기", "Stories to read");
  const viewAllLabel = bt("전체 보기", "View all");

  return (
    <section aria-labelledby="discover-home-preview-title" className="flex flex-col gap-8">
      <header data-section-heading="" className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5 flex items-center gap-2 text-accent">DISCOVER</p>
          <h2 id="discover-home-preview-title" data-section-title="" className="text-pretty text-xl font-bold tracking-tight text-fg sm:text-2xl">
            {previewTitle}
          </h2>
          <p data-section-description="" className="mt-1.5 text-sm leading-relaxed text-fg-2">
            {bt(
              "오늘의 추천과 요일 연재를 미리 보여 드려요. 전체 작품은 탐색 허브에서 이어 볼 수 있어요.",
              "A featured pick and weekday serials up front — the full catalogue continues in Discover.",
            )}
          </p>
        </div>
        <Link
          href={DISCOVER_HUB_HREF}
          data-section-action=""
          className={buttonClass({ size: "sm", variant: "quiet", className: "group gap-1" })}
          // 링크 접근명에 구간 제목을 포함해 "전체 보기"만으로는 도착지를 알 수 없는 문제를 막는다(공유 Section과 같은 규칙).
          aria-label={`${previewTitle} ${viewAllLabel}`}
        >
          {viewAllLabel}
          <ArrowRight size={14} aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </header>
      <DiscoverSpotlight snapshot={snapshot} loading={home.loading} />
      <DiscoverWeekdayRail snapshot={snapshot} loading={home.loading} actionLabel={viewAllLabel} />
    </section>
  );
}
