import { formatI18nTemplate } from "@/shared/lib/i18n-bilingual-copy";

import {
  currentKstWeekDay,
  englishWeekDay,
  type DiscoverHomeSnapshot,
  type DiscoverShelfId,
} from "./discover-home";

export interface ShelfCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly desc: string;
  readonly action: string;
}

type BilingualText = (ko: string, en: string) => string;

/**
 * 레일별 표시 문구. 요일은 스냅샷 생성 시점 값이므로, 방문 시점 KST 요일과 다르면
 * "오늘"이라 부르지 않고 해당 요일 연재로 표기한다(탐색 허브와 홈 요일 레일의 공통 규칙).
 */
export function discoverShelfCopies(
  bt: BilingualText,
  snapshot: DiscoverHomeSnapshot,
): Record<DiscoverShelfId, ShelfCopy> {
  const day = snapshot.todayDay;
  const isToday = day === currentKstWeekDay();
  return {
    weekday: {
      eyebrow: isToday ? "TODAY" : "WEEKLY",
      title: isToday
        ? bt("오늘 업데이트되는 웹툰", "Webtoons updating today")
        : formatI18nTemplate(bt("{v0}요일 연재 인기작", "Popular {v0} serials"), { v0: bt(day, englishWeekDay(day)) }),
      desc: bt("연재 중인 웹툰을 조회 신호가 높은 순서로 보여 줘요.", "Ongoing webtoons, highest view signals first."),
      action: bt("연재 캘린더", "Release calendar"),
    },
    "top-rated": {
      eyebrow: "TOP RATED",
      title: bt("평점 랭킹 상위 작품", "Top of the rating ranking"),
      desc: bt("통합 랭킹의 평점 산식으로 고른 작품이에요.", "Picked with the unified ranking's rating formula."),
      action: bt("평점 랭킹 보기", "Rating ranking"),
    },
    free: {
      eyebrow: "FREE TO START",
      title: bt("무료·기다리면 무료로 시작", "Start free or wait-for-free"),
      desc: bt("무료 또는 기다리면 무료로 볼 수 있는 인기작이에요.", "Popular stories you can start free or wait-for-free."),
      action: bt("무료 작품 더 보기", "More free stories"),
    },
    newest: {
      eyebrow: "NEW",
      title: bt("최근 공개된 작품", "Recently released"),
      desc: bt("공개 연도가 가까운 작품부터 보여 줘요.", "Stories with the most recent release year first."),
      action: bt("탐색에서 더 보기", "More in Explore"),
    },
  };
}
