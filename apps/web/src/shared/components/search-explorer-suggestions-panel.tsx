import { Flame, Shapes } from "lucide-react";

import { GenreChip } from "./ui/chip";

import type { EmptyQuerySuggestions } from "./search-explorer-suggestions";

import { hasEmptyQuerySuggestions } from "./search-explorer-suggestions";
import { cn } from "@/shared/lib/utils";

export type SearchSuggestionsState = "loading" | "error" | "ready";

export interface SearchEmptyQuerySuggestionsPanelProps {
  t: (key: string) => string;
  state: SearchSuggestionsState;
  suggestions: EmptyQuerySuggestions;
  onPickTerm: (term: string) => void;
  onPickGenre: (genre: string) => void;
  onRetry: () => void;
}

// 빈 쿼리 추천 패널 — 인기 검색어 칩(클릭 시 그 검색어로 실제 검색 실행) +
// 장르 추천 태그(클릭 시 장르 필터 토글로 결과를 좁힌다).
// 로딩/에러/빈 추천 상태를 패널 안에서 완결한다: 로딩은 스켈레톤 칩,
// 에러는 재시도 버튼(호출자가 검색 재요청에 연결), 추천이 없으면 안내 문구.
export function SearchEmptyQuerySuggestionsPanel({
  t,
  state,
  suggestions,
  onPickTerm,
  onPickGenre,
  onRetry,
}: SearchEmptyQuerySuggestionsPanelProps) {
  return (
    <div
      className="mt-3 border-t border-line pt-3"
      data-search-suggestions=""
      aria-busy={state === "loading" || undefined}
    >
      <section aria-label={t("search.explorer.suggestions.popular")}>
        <p className="mb-2 inline-flex items-center gap-1 text-[0.72rem] font-medium text-fg-3">
          <Flame size={13} className="text-accent" />
          {t("search.explorer.suggestions.popular")}
        </p>
        {state === "loading" ? (
          <div
            className="flex flex-wrap gap-1.5"
            aria-label={t("search.explorer.suggestions.loading")}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <span
                key={index}
                className="skeleton h-7 w-16 rounded-full"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : state === "error" ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-[0.72rem] text-bad">
              {t("search.explorer.suggestions.error")}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.72rem] font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
            >
              {t("search.explorer.retry")}
            </button>
          </div>
        ) : suggestions.popularTerms.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.popularTerms.map((term, index) => (
              <button
                key={term}
                type="button"
                onClick={() => onPickTerm(term)}
                aria-label={t("search.explorer.suggestions.searchFor").replace(
                  "{query}",
                  term,
                )}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1",
                  "text-[0.72rem] font-medium text-fg-2 transition-colors hover:border-accent/50 hover:text-fg",
                )}
              >
                <span aria-hidden="true" className="numeral font-bold text-accent">
                  {index + 1}
                </span>
                {term}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {state === "ready" && suggestions.genreTags.length > 0 && (
        <section
          aria-label={t("search.explorer.suggestions.genres")}
          className="mt-3"
        >
          <p className="mb-2 inline-flex items-center gap-1 text-[0.72rem] font-medium text-fg-3">
            <Shapes size={13} className="text-accent" />
            {t("search.explorer.suggestions.genres")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.genreTags.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => onPickGenre(genre)}
                aria-label={t("search.explorer.suggestions.genreFilter").replace(
                  "{genre}",
                  genre,
                )}
              >
                <GenreChip genre={genre} size="sm" />
              </button>
            ))}
          </div>
        </section>
      )}

      {state === "ready" && !hasEmptyQuerySuggestions(suggestions) && (
        <p className="mt-2 text-[0.72rem] text-fg-3">
          {t("search.explorer.suggestions.empty")}
        </p>
      )}
    </div>
  );
}
