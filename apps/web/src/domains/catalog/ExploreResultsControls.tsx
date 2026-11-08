import { ChevronDown, LayoutGrid, Rows3, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type ResultDensity = "comfortable" | "compact";

interface ExploreResultsControlsProps {
  query: string;
  onQueryChange: (query: string) => void;
  density: ResultDensity;
  onDensityChange: (density: ResultDensity) => void;
}

/** 1차 조건 도구줄은 간결하게 두고, 결과 내 검색과 표시 설정은 필요할 때 연다. */
export function ExploreResultsControls({ query, onQueryChange, density, onDensityChange }: ExploreResultsControlsProps) {
  const bt = useBilingual("ExplorePage");
  const [open, setOpen] = useState(() => query.trim().length > 0);
  const summaryRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();
  const clearQuery = () => {
    onQueryChange("");
    searchRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && open && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      summaryRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <details
      className="explore-results-controls"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={summaryRef} onKeyDown={handleKeyDown}>
        <Search size={15} aria-hidden="true" />
        <span>{bt("결과 내 검색·표시", "Search and display results")}</span>
        {trimmedQuery ? <span className="explore-results-controls-query">‘{trimmedQuery}’</span> : null}
        {density === "compact" ? <span className="explore-page-selection-count">{bt("조밀", "Compact")}</span> : null}
        <ChevronDown size={14} className="explore-results-controls-chevron" aria-hidden="true" />
      </summary>
      <div className="explore-results-controls-body">
        <div role="search" aria-label={bt("결과 내 작품·작가·태그 검색", "Filter results by title, author, or tag")} className="explore-results-controls-search">
          <Search size={15} aria-hidden="true" className="explore-results-controls-search-icon" />
          <input
            ref={searchRef}
            type="search"
            onKeyDown={handleKeyDown}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={bt("결과 내 제목·작가·태그 필터…", "Filter by title, author, tag…")}
            aria-label={bt("결과 내 제목·작가·태그 필터", "Filter by title, author, tag")}
          />
          {query.length > 0 ? <button type="button" onKeyDown={handleKeyDown} onClick={clearQuery} aria-label={bt("검색어 지우기", "Clear search query")} className="explore-results-controls-clear"><X size={14} aria-hidden="true" /></button> : null}
        </div>
        <div className="explore-results-controls-density" role="group" aria-label={bt("카드 밀도", "Card density")}>
          {([
            { key: "comfortable", label: ["표준", "Standard"], Icon: LayoutGrid },
            { key: "compact", label: ["조밀", "Compact"], Icon: Rows3 },
          ] as const).map(({ key, label, Icon }) => (
            <button type="button" onKeyDown={handleKeyDown} key={key} onClick={() => onDensityChange(key)} aria-pressed={density === key} className={cn("explore-results-controls-density-button", density === key && "is-active")}>
              <Icon size={13} aria-hidden="true" />{bt(label[0], label[1])}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
