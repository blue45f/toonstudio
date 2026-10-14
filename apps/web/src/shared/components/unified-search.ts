import type { Title } from "@/shared/lib/types";

/**
 * 통합 검색 집계층 (unified-search-aggregation-layer)
 *
 * 지금까지 검색은 표면마다 따로 있었다 — 작품은 /search 탐색기(서버 카탈로그),
 * 소재는 /market/browse(서버 마켓), 강좌는 /learn(matchesSearch), 매뉴얼은
 * 매뉴얼 페이지(searchManual), 페이지는 사이트 디렉터리(searchSiteDirectory),
 * 도움말은 /help(help-search). 사용자는 "어디서 찾아야 하는지"부터 알아야 했다.
 *
 * 이 모듈은 그 모듈들을 새로 만들지 않고 **재사용해 유형별 섹션으로 모으는**
 * 얇은 집계층이다. 데이터가 없는 순수 코어(유형·섹션 조립·서버 결과 변환)라
 * 어느 청크에서 import해도 무겁지 않고, 로컬 데이터 기반 프로바이더는
 * `unified-search-providers.ts`로 분리해 지연 로드할 수 있게 했다.
 *
 * 섹션 순서(작품 → 소재 → 강좌 → 도움말 → 페이지)는 모든 표면이 공유한다.
 */

export type UnifiedSearchSectionKind = "works" | "assets" | "courses" | "help" | "pages";

/** 모든 통합 검색 표면이 같은 순서로 섹션을 보여준다. */
export const UNIFIED_SEARCH_SECTION_ORDER: readonly UnifiedSearchSectionKind[] = [
  "works",
  "assets",
  "courses",
  "help",
  "pages",
];

export type UnifiedSearchSectionLabel = readonly [ko: string, en: string];

export const UNIFIED_SEARCH_SECTION_LABELS: Record<UnifiedSearchSectionKind, UnifiedSearchSectionLabel> = {
  works: ["작품", "Works"],
  assets: ["소재", "Assets"],
  courses: ["강좌", "Courses"],
  help: ["도움말·매뉴얼", "Help & manual"],
  pages: ["페이지", "Pages"],
};

export interface UnifiedSearchItem {
  readonly kind: UnifiedSearchSectionKind;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly href: string;
}

export interface UnifiedSearchSection {
  readonly kind: UnifiedSearchSectionKind;
  readonly items: readonly UnifiedSearchItem[];
  /** 잘라서 보여주기 전 전체 건수. 링크 전용 섹션(소재 등)은 0일 수 있다. */
  readonly total: number;
  /** 해당 유형의 전용 검색 표면으로 같은 검색어를 들고 가는 주소. */
  readonly moreHref?: string;
}

export interface UnifiedSearchResult {
  readonly query: string;
  readonly sections: readonly UnifiedSearchSection[];
  /** 섹션 아이템 건수 합계(링크 전용 섹션 제외). */
  readonly totalCount: number;
}

export function emptyUnifiedSection(kind: UnifiedSearchSectionKind): UnifiedSearchSection {
  return { kind, items: [], total: 0 };
}

/** 작품 전용 검색(/search)의 쿼리 계약 — 탐색기가 읽는 `q` 파라미터와 같다. */
export function unifiedWorksMoreHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

/** 소재 전용 검색(/market/browse)의 쿼리 계약 — parseMarketBrowseQuery가 읽는 `q`와 같다. */
export function unifiedAssetsMoreHref(query: string): string {
  return `/market/browse?q=${encodeURIComponent(query)}`;
}

/** 강좌 전용 검색(/learn)의 쿼리 계약 — LearningHome이 읽는 `q` 파라미터와 같다. */
export function unifiedCoursesMoreHref(query: string): string {
  return `/learn?q=${encodeURIComponent(query)}`;
}

/** 도움말 검색은 /help 내부 상태라 쿼리를 실을 수 없다 — 도움말 홈으로 보낸다. */
export function unifiedHelpMoreHref(): string {
  return "/help";
}

/**
 * 서버 작품 검색(fetchSearchResponse/usePaginatedSearch)의 결과를 작품 섹션으로.
 * 변환 규칙은 커맨드 팔레트의 작품 행과 같다: 도착지는 `/title/<slug>`, 부제는 작가.
 */
export function worksSectionFromTitles(
  titles: readonly Title[],
  query: string,
  limit = 4,
  total: number = titles.length,
): UnifiedSearchSection {
  return {
    kind: "works",
    items: titles.slice(0, limit).map((title) => ({
      kind: "works",
      id: title.id,
      title: title.title,
      description: title.author,
      href: `/title/${title.slug}`,
    })),
    total,
    moreHref: unifiedWorksMoreHref(query),
  };
}

/** 마켓 리소스 레코드의 최소 구조 — 계약 타입을 import하지 않고 구조적으로 받는다. */
export interface UnifiedAssetRecord {
  readonly id: string;
  readonly name: string;
  readonly kind?: string;
}

/**
 * 서버 소재 검색(useMarketResources)의 결과를 소재 섹션으로.
 * 도착지 규칙은 MarketBrowsePage의 객체 소스와 같다: `/market/resource/<id>`.
 */
export function assetsSectionFromResources(
  records: readonly UnifiedAssetRecord[],
  query: string,
  limit = 4,
  total: number = records.length,
): UnifiedSearchSection {
  return {
    kind: "assets",
    items: records.slice(0, limit).map((record) => ({
      kind: "assets",
      id: record.id,
      title: record.name,
      description: record.kind,
      href: `/market/resource/${encodeURIComponent(record.id)}`,
    })),
    total,
    moreHref: unifiedAssetsMoreHref(query),
  };
}

/**
 * 소재처럼 전용 표면에서만 서버 검색이 되는 유형은, 로컬 집계에서는
 * 아이템 없이 "그 표면에서 같은 검색어로 찾기" 링크만 담은 섹션으로 둔다.
 * 링크 전용 섹션도 섹션으로 세어, 헤더 검색 하나로 소재까지 도달 가능하게 한다.
 */
export function assetsLinkSection(query: string): UnifiedSearchSection {
  const trimmed = query.trim();
  if (!trimmed) return emptyUnifiedSection("assets");
  return { kind: "assets", items: [], total: 0, moreHref: unifiedAssetsMoreHref(trimmed) };
}

/**
 * 프로바이더 결과들을 정본 순서로 정렬하고, 아이템도 "더 보기" 링크도 없는
 * 빈 섹션은 버린다. 같은 유형이 두 번 오면 먼저 온 섹션을 유지한다.
 */
export function assembleUnifiedSections(
  sections: readonly (UnifiedSearchSection | null | undefined)[],
): readonly UnifiedSearchSection[] {
  const byKind = new Map<UnifiedSearchSectionKind, UnifiedSearchSection>();
  for (const section of sections) {
    if (!section) continue;
    if (section.items.length === 0 && !section.moreHref) continue;
    if (!byKind.has(section.kind)) byKind.set(section.kind, section);
  }
  return UNIFIED_SEARCH_SECTION_ORDER.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind)!);
}

export function buildUnifiedSearchResult(
  query: string,
  sections: readonly (UnifiedSearchSection | null | undefined)[],
): UnifiedSearchResult {
  const assembled = assembleUnifiedSections(sections);
  return {
    query,
    sections: assembled,
    totalCount: assembled.reduce((sum, section) => sum + section.items.length, 0),
  };
}

export function unifiedSectionOf(
  result: UnifiedSearchResult,
  kind: UnifiedSearchSectionKind,
): UnifiedSearchSection | undefined {
  return result.sections.find((section) => section.kind === kind);
}
