/**
 * SearchSmartIntentRibbon.tsx — /search 제로-막막함 스마트 의도 칩 바.
 *
 * 빈 검색창 앞에서 무엇을 입력할지 막막한 첫 방문자에게 6종 원탭 감성·장르 의도 칩을 제공하고,
 * 누르는 즉시 실제 검색어·장르·태그·가격·완결·정렬 URL 파라미터를 채워 검색을 실행한다.
 */

import { RotateCcw, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";

import type { CatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { countActiveTitleFilters } from "@/shared/lib/title-filters";

import "./catalog-wave4-fresh-ideas.css";
import {
  buildSearchIntentSearchParams,
  clearSearchIntentParams,
  matchActiveSearchIntent,
  SEARCH_SMART_INTENTS,
  type SearchSmartIntentChip,
} from "./search-smart-intent-model";

export interface SearchSmartIntentRibbonProps {
  readonly searchParams: URLSearchParams;
  readonly state: CatalogDiscoveryState;
  readonly onApplyParams: (next: URLSearchParams) => void;
}

export function SearchSmartIntentRibbon({
  searchParams,
  state,
  onApplyParams,
}: SearchSmartIntentRibbonProps) {
  const bt = useBilingual("SearchSmartIntentRibbon");
  const activeIntentId = matchActiveSearchIntent(state);
  const isBlankSearch = state.query.trim().length === 0 && countActiveTitleFilters(state.filters) === 0;

  const handleChipClick = (intent: SearchSmartIntentChip) => {
    if (activeIntentId === intent.id) {
      onApplyParams(clearSearchIntentParams(searchParams));
      return;
    }
    onApplyParams(buildSearchIntentSearchParams(searchParams, intent));
  };

  return (
    <section
      aria-labelledby="search-smart-intent-heading"
      data-testid="search-smart-intent-ribbon"
      className="catalog-w4-card mb-4 p-3.5 sm:p-4"
    >
      <span aria-hidden="true" className="catalog-w4-spectrum-strip" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="search-smart-intent-heading"
            className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]"
          >
            <Sparkles size={15} strokeWidth={1.6} className="shrink-0 text-accent" aria-hidden="true" />
            {bt("지금 끌리는 분위기로 바로 검색", "One-tap mood & genre search")}
          </h2>
          <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
            {isBlankSearch
              ? bt(
                  "검색어가 떠오르지 않아도 괜찮아요. 칩 하나를 누르면 조건과 검색어가 바로 채워집니다.",
                  "Not sure what to type? Tap any chip to fill the query and filters instantly.",
                )
              : bt(
                  "다른 분위기 칩을 누르면 현재 검색 조건을 한 번에 전환합니다.",
                  "Tap another chip to switch your query and filters in one click.",
                )}
          </p>
        </div>

        {activeIntentId ? (
          <button
            type="button"
            data-testid="search-smart-intent-clear"
            onClick={() => onApplyParams(clearSearchIntentParams(searchParams))}
            className="catalog-w4-action inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 hover:border-line-strong hover:text-fg [word-break:keep-all]"
          >
            <RotateCcw size={13} strokeWidth={1.6} aria-hidden="true" />
            {bt("의도 칩 해제", "Clear intent")}
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label={bt("감성·장르 스마트 검색 의도 6종", "Six smart search intent chips")}
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SEARCH_SMART_INTENTS.map((intent) => {
          const active = activeIntentId === intent.id;
          return (
            <button
              key={intent.id}
              type="button"
              data-testid={`search-intent-chip-${intent.id}`}
              aria-pressed={active}
              onClick={() => handleChipClick(intent)}
              style={{ "--w4-tone": intent.toneOklch } as CSSProperties}
              className="catalog-w4-chip flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left [word-break:keep-all]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: intent.toneOklch }}
                />
                <span className="truncate text-xs font-semibold text-fg">
                  {bt(intent.labelKo, intent.labelEn)}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-fg-3">
                {bt(intent.hintKo, intent.hintEn)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
