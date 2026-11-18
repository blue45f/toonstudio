import { ArrowUpRight, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS,
  CreatorMarketplaceResourceSearchQuerySchema,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export function MarketHomeSearch({
  className,
  queryValue,
  onQueryChange,
}: {
  readonly className?: string;
  readonly queryValue?: string;
  readonly onQueryChange?: (query: string) => void;
} = {}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = queryValue ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const composing = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const bt = useBilingual("MarketHomeSearch");
  const navigate = useNavigate();

  return (
    <div className={cn("max-w-xl", className ?? "mt-5")}>
      <form
        role="search"
        aria-label={bt("소재 마켓 통합 검색", "Search the material market")}
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (composing.current) return;
          const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(query);
          setInvalid(!parsed.success);
          if (parsed.success) {
            navigate(`/market/browse${parsed.data ? `?${new URLSearchParams({ q: parsed.data })}` : ""}`);
          }
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label={bt("찾고 싶은 소재", "Find materials")}
            value={query}
            placeholder={bt("어떤 장면을 만들고 있나요?", "What scene are you creating?")}
            maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setInvalid(false);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            }}
            className="h-11 w-full rounded-[9px] border border-line bg-card pl-10 pr-3 text-base text-fg placeholder:text-fg-3 outline-none transition-colors duration-150 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 sm:h-12 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <button
          type="submit"
          className={buttonClass({
            variant: "solid",
            size: "md",
            className: "h-11 shrink-0 rounded-[9px] px-5 text-sm font-medium sm:h-12",
          })}
        >
          {bt("검색", "Search")}
        </button>
      </form>

      {invalid ? (
        <p role="alert" id={errorId} className="mt-2 text-sm text-bad">
          {bt("검색어의 길이나 문자를 확인해 주세요", "Please check the length and characters in your search")}
        </p>
      ) : null}

      <nav
        aria-label={bt("소재 검색 시작점", "Material search ideas")}
        className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1"
      >
        <span className="mr-1 text-xs text-fg-3">{bt("추천 검색어", "Try")}</span>
        {["학교 배경", "펜선", "말풍선", "3D 소품"].map((term) => (
          <Link
            key={term}
            href={`/market/browse?${new URLSearchParams({ q: term })}`}
            style={{ minInlineSize: 44 }}
            className="ink-arrow inline-flex min-h-11 items-center gap-0.5 rounded-[8px] px-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-raised/60 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>{term}</span>
            <ArrowUpRight className="size-3 text-fg-3" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
