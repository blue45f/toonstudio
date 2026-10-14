import { fuzzyRankByTexts, type FuzzyRanked } from "@/shared/lib/fuzzy-search";

import {
  emptyUnifiedSection,
  unifiedAssetsMoreHref,
  unifiedCoursesMoreHref,
  unifiedHelpMoreHref,
  unifiedWorksMoreHref,
  type UnifiedSearchItem,
  type UnifiedSearchSection,
  type UnifiedSearchSectionKind,
} from "./unified-search";

/**
 * 통합 검색 집계층의 퍼지 어댑터 — `UnifiedSearchItem`을 공용 퍼지 엔진
 * (`shared/lib/fuzzy-search`, fuse.js)에 태우는 얇은 층.
 *
 * 집계층 코어(`unified-search.ts`)는 데이터 없는 순수 모듈이라 fuse.js를
 * 끌어오지 않는다. 퍼지가 필요한 표면만 이 어댑터를 import 하며, 전부
 * 검색 표면 전용 청크다(프로바이더·/search 패널·팔레트 동적 import).
 * 작품·소재처럼 서버가 색인을 가진 유형은 서버 응답을 아이템으로 만든
 * 뒤 이 어댑터로 클라이언트에서 재정렬·보강하고, 로컬 유형(강좌·
 * 도움말·페이지)은 프로바이더가 같은 엔진을 직접 쓴다.
 */

/** 통합 아이템의 검색 필드 — 제목 본문과 설명(작가·종류·요약). */
export function unifiedItemSearchTexts(item: UnifiedSearchItem): readonly string[] {
  return item.description ? [item.title, item.description] : [item.title];
}

/** 통합 아이템 풀을 오타 허용으로 랭킹한다(정확 먼저, 퍼지 뒤). */
export function fuzzyRankUnifiedItems(
  items: readonly UnifiedSearchItem[],
  query: string,
): FuzzyRanked<UnifiedSearchItem>[] {
  return fuzzyRankByTexts(items, query, unifiedItemSearchTexts);
}

const MORE_HREF_BY_KIND: Record<UnifiedSearchSectionKind, ((query: string) => string) | undefined> = {
  works: unifiedWorksMoreHref,
  assets: unifiedAssetsMoreHref,
  courses: unifiedCoursesMoreHref,
  help: () => unifiedHelpMoreHref(),
  pages: undefined,
};

/**
 * 아이템 풀 전체를 퍼지 랭킹해 섹션으로 만든다. 빈 질의는 빈 섹션
 * (집계층의 "빈 섹션은 조립에서 버려진다" 계약과 동일).
 */
export function fuzzyUnifiedSection(
  kind: UnifiedSearchSectionKind,
  pool: readonly UnifiedSearchItem[],
  query: string,
  limit = 4,
): UnifiedSearchSection {
  const trimmed = query.trim();
  if (!trimmed) return emptyUnifiedSection(kind);
  const ranked = fuzzyRankUnifiedItems(pool, trimmed);
  const moreHref = MORE_HREF_BY_KIND[kind]?.(trimmed);
  return {
    kind,
    items: ranked.slice(0, limit).map((entry) => entry.item),
    total: ranked.length,
    ...(moreHref ? { moreHref } : {}),
  };
}
