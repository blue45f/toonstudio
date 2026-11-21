/**
 * search-smart-intent-model.ts — /search 제로-막막함 6종 스마트 의도 칩 순수 모델.
 *
 * 빈 검색창 앞 첫 방문자가 원탭으로 실제 검색어·장르·태그·가격·완결·정렬 파라미터를
 * 즉시 적용하고 검색을 실행할 수 있도록 URL 파라미터 매핑과 활성 매칭을 제공한다.
 */

import {
  writeCatalogDiscoveryState,
  type CatalogDiscoveryState,
} from "@/shared/lib/catalog-discovery-state";
import type { SortKey } from "@/shared/lib/search";
import { EMPTY_TITLE_FILTERS, type TitleFilterState } from "@/shared/lib/title-filters";
import type { Pricing, SerialStatus } from "@/shared/lib/types";

export type SearchSmartIntentId =
  | "short-completed"
  | "regression-action"
  | "campus-romance"
  | "dreamy-rofan"
  | "free-start"
  | "bg3d-reference";

export interface SearchSmartIntentChip {
  readonly id: SearchSmartIntentId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly query: string;
  readonly genres: readonly string[];
  readonly tags: readonly string[];
  readonly status: readonly SerialStatus[];
  readonly pricing: readonly Pricing[];
  readonly sort: SortKey;
  readonly toneOklch: string;
}

export const SEARCH_SMART_INTENTS: readonly SearchSmartIntentChip[] = [
  {
    id: "short-completed",
    labelKo: "짧게 끝나는 완결작",
    labelEn: "Quick completed reads",
    hintKo: "완결 · 완독률순",
    hintEn: "Completed · high finish",
    query: "",
    genres: [],
    tags: [],
    status: ["completed"],
    pricing: [],
    sort: "completion",
    toneOklch: "var(--color-good)",
  },
  {
    id: "regression-action",
    labelKo: "긴장감 넘치는 회귀·액션",
    labelEn: "Tense regression & action",
    hintKo: "회귀 · 액션",
    hintEn: "Regression · Action",
    query: "회귀",
    genres: ["액션"],
    tags: [],
    status: [],
    pricing: [],
    sort: "relevance",
    toneOklch: "var(--color-accent)",
  },
  {
    id: "campus-romance",
    labelKo: "설레는 학원·로맨스",
    labelEn: "Campus romance",
    hintKo: "학원 · 로맨스 · 평점순",
    hintEn: "School · Romance · rated",
    query: "학원",
    genres: ["학원", "로맨스"],
    tags: [],
    status: [],
    pricing: [],
    sort: "rating",
    toneOklch: "oklch(0.75 0.16 5)",
  },
  {
    id: "dreamy-rofan",
    labelKo: "몽환 로판 세계관",
    labelEn: "Dreamy fantasy romance",
    hintKo: "로판 · 인기순",
    hintEn: "Rofan · popular",
    query: "로판",
    genres: ["로판"],
    tags: [],
    status: [],
    pricing: [],
    sort: "popular",
    toneOklch: "oklch(0.74 0.16 340)",
  },
  {
    id: "free-start",
    labelKo: "지금 무료로 시작",
    labelEn: "Start free now",
    hintKo: "무료·기다무",
    hintEn: "Free & wait-free",
    query: "",
    genres: [],
    tags: [],
    status: [],
    pricing: ["free", "wait-free"],
    sort: "popular",
    toneOklch: "var(--color-cool)",
  },
  {
    id: "bg3d-reference",
    labelKo: "3D 배경 참고작",
    labelEn: "3D background refs",
    hintKo: "배경 · 판타지 · 그림체",
    hintEn: "Background · Fantasy · art",
    query: "배경",
    genres: ["판타지"],
    tags: ["그림체甲"],
    status: [],
    pricing: [],
    sort: "rating",
    toneOklch: "var(--color-warn)",
  },
] as const;

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, idx) => item === right[idx]);
}

export function buildSearchIntentSearchParams(
  currentParams: URLSearchParams,
  intent: SearchSmartIntentChip,
): URLSearchParams {
  const filters: TitleFilterState = {
    ...EMPTY_TITLE_FILTERS,
    genres: [...intent.genres],
    tags: [...intent.tags],
    status: [...intent.status],
    pricing: [...intent.pricing],
  };

  const nextState: CatalogDiscoveryState = {
    query: intent.query,
    sort: intent.sort,
    view: "grid",
    filters,
    tasteGenres: [],
    seedId: null,
    diversity: "balanced",
  };

  return writeCatalogDiscoveryState(currentParams, nextState, {
    includeQuery: true,
    includeSort: true,
    includeView: false,
    includeFilters: true,
    includeRecommendation: false,
  });
}

export function clearSearchIntentParams(currentParams: URLSearchParams): URLSearchParams {
  const emptyState: CatalogDiscoveryState = {
    query: "",
    sort: "popular",
    view: "grid",
    filters: EMPTY_TITLE_FILTERS,
    tasteGenres: [],
    seedId: null,
    diversity: "balanced",
  };

  return writeCatalogDiscoveryState(currentParams, emptyState, {
    includeQuery: true,
    includeSort: true,
    includeView: false,
    includeFilters: true,
    includeRecommendation: false,
  });
}

export function matchActiveSearchIntent(
  state: Pick<CatalogDiscoveryState, "query" | "sort" | "filters">,
): SearchSmartIntentId | null {
  const normalizedQuery = state.query.trim();
  for (const intent of SEARCH_SMART_INTENTS) {
    if (normalizedQuery !== intent.query) continue;
    if (!sameStringList(state.filters.genres, intent.genres)) continue;
    if (!sameStringList(state.filters.tags, intent.tags)) continue;
    if (!sameStringList(state.filters.status, intent.status)) continue;
    if (!sameStringList(state.filters.pricing, intent.pricing)) continue;
    if (state.filters.platforms.length > 0 || state.filters.types.length > 0 || state.filters.savedOnly) {
      continue;
    }
    return intent.id;
  }
  return null;
}
