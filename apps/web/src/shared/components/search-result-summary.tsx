import { compactNumber } from "./search-explorer-utils";

import type { usePaginatedSearch } from "@/platform/use-paginated-search";
import { useT } from "@/shared/lib/i18n";

type SearchSummary = Pick<ReturnType<typeof usePaginatedSearch>,
  "total" | "data" | "loading" | "failed" | "moreFailed"
>;

/** 응답을 받지 못한 상태를 0건으로 해석하지 않는 표시 전용 요약이다. */
export function SearchResultSummary({ query, search, textSettling, hasConditions, errorInResults = false }: {
  query: string;
  search: SearchSummary;
  textSettling: boolean;
  hasConditions: boolean;
  errorInResults?: boolean;
}) {
  const t = useT();
  const pending = search.loading || textSettling;
  const confirmed = !pending && !search.failed && search.data !== null;
  const state = pending ? "loading" : search.failed ? "error"
    : !confirmed ? "loading" : search.moreFailed ? "moreError"
      : search.total > 0 ? "success" : query.trim() || hasConditions ? "notfound" : "empty";
  const resultText = state === "error" ? errorInResults ? null : t("search.explorer.error.title")
    : state === "loading" ? t("search.explorer.loading")
      : search.total > 0
        ? t("search.explorer.resultCount").replace("{count}", compactNumber(search.total))
        : t("search.explorer.noResult");
  // 성공 응답의 집계만 쓴다. 페이지 추가 실패는 이미 확인된 개수와 유형을 보존한다.
  const typeCount = confirmed ? search.data?.typeCount : null;
  const typeSummary = !typeCount ? null
    : typeCount.webtoon === 0 && typeCount.webnovel === 0
      ? t("search.explorer.typeSummary.empty")
      : [
          typeCount.webtoon
            ? `${t("search.explorer.type.webtoon")} ${compactNumber(typeCount.webtoon)}` : "",
          typeCount.webnovel
            ? `${t("search.explorer.type.webnovel")} ${compactNumber(typeCount.webnovel)}` : "",
        ].filter(Boolean).join(t("search.explorer.separator"));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3"
      role="status" aria-live="polite" data-search-result-state={state}>
      <span className="truncate">
        {t("search.explorer.search.label")}: {" "}
        <strong>{query ? `"${query}"` : t("search.queryAll")}</strong>
      </span>
      {resultText !== null ? <>
        <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
        <span>{resultText}</span>
      </> : null}
      {typeSummary !== null ? <>
        <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
        <span>{typeSummary}</span>
      </> : null}
    </div>
  );
}
