import { Search } from "lucide-react";

import { RESOURCE_BUTTON } from "./navigation";
import { RESOURCE_SEARCH_CONFIG, type ResourceSearchProvider } from "./resource-search-config";

/** 검색 전·빈 결과용 조용한 선 아이콘 마커. */
export function EmptySearchArt() {
  return (
    <span aria-hidden="true" className="mb-3 grid size-10 place-items-center rounded-lg border border-line bg-card text-fg-3">
      <Search size={18} strokeWidth={1.75} />
    </span>
  );
}

/**
 * 검색 전 정직한 빈 상태 — 일러스트 + 안내 + 추천 키워드(다음 행동).
 * apiNote는 "검색할 때만 API를 호출한다"는 안내를 붙일 때만 true다. 큐레이션·
 * 카테고리 확인을 이미 시도한 표면(Poly Haven 카테고리 가이드)은 false로 둔다.
 */
export function ResourcePreSearchFallback({ provider, onRunSearch, apiNote }: { provider: ResourceSearchProvider; onRunSearch: (q: string) => void; apiNote: boolean }) {
  const config = RESOURCE_SEARCH_CONFIG[provider];
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-panel px-5 py-7 text-center">
      <EmptySearchArt />
      <p className="text-fg [word-break:keep-all]">검색어를 입력하거나 아래 추천 키워드로 바로 검색해 보세요.</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {config.examples.map((value) => <button key={value} type="button" className={RESOURCE_BUTTON} onClick={() => onRunSearch(value)}>{value}</button>)}
      </div>
      {apiNote && <p className="mt-3 text-xs text-fg-3">외부 API는 검색할 때만 호출합니다.</p>}
    </div>
  );
}
