import { describe, expect, it } from "vitest";

import {
  GENRE_SUGGESTION_LIMIT,
  POPULAR_TERM_LIMIT,
  buildEmptyQuerySuggestions,
  hasEmptyQuerySuggestions,
} from "./search-explorer-suggestions";

import { GENRES, TAGS } from "@/shared/lib/taxonomy";

describe("buildEmptyQuerySuggestions", () => {
  it("uses server topTags as the popular source, in order, capped at the limit", () => {
    const topTags = Array.from({ length: 20 }, (_, i) => `태그${i}`);
    const { popularTerms } = buildEmptyQuerySuggestions({ topTags });
    expect(popularTerms).toEqual(topTags.slice(0, POPULAR_TERM_LIMIT));
  });

  it("falls back to curated taxonomy TAGS only when the server returns no tags", () => {
    const { popularTerms } = buildEmptyQuerySuggestions({ topTags: [] });
    expect(popularTerms).toEqual([...TAGS].slice(0, POPULAR_TERM_LIMIT));
  });

  it("normalizes whitespace and removes case-insensitive duplicates and blanks", () => {
    const { popularTerms } = buildEmptyQuerySuggestions({
      topTags: ["  회귀  ", "회귀", "   ", "사이다 물", "사이다  물"],
    });
    expect(popularTerms).toEqual(["회귀", "사이다 물"]);
  });

  it("recommends genres in taxonomy order and excludes already-selected genres", () => {
    const { genreTags } = buildEmptyQuerySuggestions({
      topTags: ["회귀"],
      selectedGenres: [GENRES[0], GENRES[1]],
    });
    expect(genreTags).toEqual(
      [...GENRES].slice(2, 2 + GENRE_SUGGESTION_LIMIT),
    );
    expect(genreTags).not.toContain(GENRES[0]);
    expect(genreTags.length).toBeLessThanOrEqual(GENRE_SUGGESTION_LIMIT);
  });

  it("respects explicit limits, including zero", () => {
    const result = buildEmptyQuerySuggestions({
      topTags: ["a", "b", "c"],
      popularLimit: 2,
      genreLimit: 0,
    });
    expect(result.popularTerms).toEqual(["a", "b"]);
    expect(result.genreTags).toEqual([]);
  });

  it("hasEmptyQuerySuggestions reflects whether anything can be shown", () => {
    expect(
      hasEmptyQuerySuggestions({ popularTerms: [], genreTags: [] }),
    ).toBe(false);
    expect(
      hasEmptyQuerySuggestions({ popularTerms: ["회귀"], genreTags: [] }),
    ).toBe(true);
    expect(
      hasEmptyQuerySuggestions({ popularTerms: [], genreTags: ["로맨스"] }),
    ).toBe(true);
  });
});
