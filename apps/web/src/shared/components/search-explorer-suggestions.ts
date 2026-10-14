// 빈 쿼리 추천 — 순수 로직. 인기 검색어 칩과 장르 추천 태그의 출처를 한곳에서 계산한다.
//
// 출처(둘 다 실재하는 데이터만 쓴다 — 검색어 로그 API는 서버에 없다):
// - 인기 검색어: 검색 응답의 topTags(서버 카탈로그 색인의 빈도순 태그 집계, search-client의
//   SearchResponse.topTags). 빈 쿼리 기본 정렬이 popular라 첫 응답이 곧 인기 집계다.
//   서버 태그가 비어 있을 때(빈 카탈로그 등)만 taxonomy의 큐레이션 태그(TAGS)로 하락한다.
// - 장르 추천 태그: taxonomy의 GENRES(큐레이션 순서 그대로). 이미 선택된 장르는
//   추천에서 빼고(선택분은 현재 필터 토큰으로 이미 보인다), 상한까지만 노출한다.
//
// 칩 클릭의 실행 연결(검색 실행·장르 토글)은 search-explorer.tsx가 담당하고,
// 여기서는 "다음 목록" 계산만 한다(부수효과 없음).

import { GENRES, TAGS } from "@/shared/lib/taxonomy";
import { normalizeQuery } from "@/shared/lib/recent-searches";

export const POPULAR_TERM_LIMIT = 8;
export const GENRE_SUGGESTION_LIMIT = 10;

export interface EmptyQuerySuggestions {
  popularTerms: string[];
  genreTags: string[];
}

// 정규화(공백 정리) + 대소문자 무시 중복 제거 + 빈 값 제외 + 상한 적용.
// 제외 집합(excludedFolded)에 든 항목도 빼낸다.
function collectTerms(
  values: readonly string[],
  limit: number,
  excludedFolded: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (out.length >= limit) break;
    const term = normalizeQuery(raw);
    if (!term) continue;
    const folded = term.toLocaleLowerCase("ko-KR");
    if (seen.has(folded) || excludedFolded.has(folded)) continue;
    seen.add(folded);
    out.push(term);
  }
  return out;
}

export function buildEmptyQuerySuggestions(input: {
  topTags: readonly string[];
  selectedGenres?: readonly string[];
  popularLimit?: number;
  genreLimit?: number;
}): EmptyQuerySuggestions {
  const popularLimit = Math.max(0, input.popularLimit ?? POPULAR_TERM_LIMIT);
  const genreLimit = Math.max(0, input.genreLimit ?? GENRE_SUGGESTION_LIMIT);

  // 서버 집계가 있으면 그것이 1차 출처, 없을 때만 큐레이션 태그로 하락한다.
  const popularSource = input.topTags.length > 0 ? input.topTags : TAGS;
  const popularTerms = collectTerms(popularSource, popularLimit, new Set());

  const selectedFolded = new Set(
    (input.selectedGenres ?? []).map((genre) =>
      normalizeQuery(genre).toLocaleLowerCase("ko-KR"),
    ),
  );
  const genreTags = collectTerms(GENRES, genreLimit, selectedFolded);

  return { popularTerms, genreTags };
}

// 추천이 하나라도 있는지 — 패널의 빈 상태 문구 노출 판정을 한곳에 둔다.
export function hasEmptyQuerySuggestions(
  suggestions: EmptyQuerySuggestions,
): boolean {
  return suggestions.popularTerms.length > 0 || suggestions.genreTags.length > 0;
}
