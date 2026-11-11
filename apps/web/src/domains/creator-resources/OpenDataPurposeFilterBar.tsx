import { Search, X } from "lucide-react";

import type { OPEN_DATA_PROVIDERS } from "./resource-search-config";

export type OpenDataPurposeId =
  | "all"
  | "history"
  | "spatial"
  | "nature-costume"
  | "dialogue-audio"
  | "keyless";

type OpenDataProviderId = (typeof OPEN_DATA_PROVIDERS)[number];

export const OPEN_DATA_PURPOSE_FILTERS: readonly {
  readonly id: OpenDataPurposeId;
  readonly label: string;
}[] = [
  { id: "all", label: "전체 제공처" },
  { id: "history", label: "시대·역사·고증" },
  { id: "spatial", label: "배경·3D·장소" },
  { id: "nature-costume", label: "복식·생물·과학" },
  { id: "dialogue-audio", label: "어휘·음악·학교" },
  { id: "keyless", label: "가입·키 없음 즉시" },
] as const;

const PURPOSE_MAP: Readonly<Record<Exclude<OpenDataPurposeId, "all" | "keyless">, ReadonlySet<OpenDataProviderId>>> = {
  history: new Set<OpenDataProviderId>(["kheritage", "internetarchive", "europeana", "dpla", "smithsonian", "wikimedia"]),
  spatial: new Set<OpenDataProviderId>(["ambientcg", "tourapi", "kheritage"]),
  "nature-costume": new Set<OpenDataProviderId>(["vam", "gbif", "nasa", "smithsonian"]),
  "dialogue-audio": new Set<OpenDataProviderId>(["korean", "musicbrainz", "neis"]),
};

export function matchesOpenDataPurpose(
  provider: OpenDataProviderId,
  purpose: OpenDataPurposeId,
  isKeyless: boolean,
): boolean {
  if (purpose === "all") return true;
  if (purpose === "keyless") return isKeyless;
  return PURPOSE_MAP[purpose].has(provider);
}

export function OpenDataPurposeFilterBar({
  purpose,
  query,
  matchCount,
  totalCount,
  onSelectPurpose,
  onChangeQuery,
  onReset,
}: {
  readonly purpose: OpenDataPurposeId;
  readonly query: string;
  readonly matchCount: number;
  readonly totalCount: number;
  readonly onSelectPurpose: (purpose: OpenDataPurposeId) => void;
  readonly onChangeQuery: (query: string) => void;
  readonly onReset: () => void;
}) {
  const isFiltered = purpose !== "all" || query.trim().length > 0;

  return (
    <section
      aria-label="창작 목적별 제공처 필터"
      data-testid="open-data-purpose-filter-bar"
      className="rounded-2xl border border-line bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {OPEN_DATA_PURPOSE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={purpose === item.id}
              onClick={() => onSelectPurpose(item.id)}
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 lg:w-64">
            <Search size={15} className="shrink-0 text-fg-3" aria-hidden="true" />
            <span className="sr-only">제공처·고증 키워드 필터</span>
            <input
              type="search"
              value={query}
              onChange={(event) => onChangeQuery(event.target.value)}
              placeholder="제공처·용도 빠른 필터"
              className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
            />
            {query ? (
              <button
                type="button"
                aria-label="필터 검색어 지우기"
                onClick={() => onChangeQuery("")}
                className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          {isFiltered ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-accent hover:border-accent/60"
            >
              필터 초기화 ({matchCount}/{totalCount})
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
