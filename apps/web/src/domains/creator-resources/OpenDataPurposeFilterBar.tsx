import { Database, Search, ShieldCheck, X } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { OPEN_DATA_PROVIDERS } from "./resource-search-config";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("OpenDataPurposeFilterBar", ko, en);

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
  readonly enLabel: string;
}[] = [
  { id: "all", label: "전체 제공처", enLabel: "All Archives" },
  { id: "history", label: "시대·역사·고증", enLabel: "History & Period" },
  { id: "spatial", label: "배경·3D·장소", enLabel: "3D & Locations" },
  { id: "nature-costume", label: "복식·생물·과학", enLabel: "Costume & Science" },
  { id: "dialogue-audio", label: "어휘·음악·학교", enLabel: "Lexicon, Audio & School" },
  { id: "keyless", label: "가입·키 없음 즉시", enLabel: "Instant No-Key" },
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

/**
 * 시안 H (Open Data Archive Pinboard) — 28개 공공·박물관 고증 아카이브 목적별 필터 및 한·영 44px 검색 바.
 */
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
  useBilingualI18nRevision();
  const isFiltered = purpose !== "all" || query.trim().length > 0;

  return (
    <section
      aria-label={bi("창작 목적별 제공처 필터", "Archive provider filter by creative purpose")}
      data-testid="open-data-purpose-filter-bar"
      className="overflow-hidden rounded-2xl border border-line-strong/75 bg-[linear-gradient(155deg,color-mix(in_oklch,var(--color-accent)_8%,var(--color-panel)),var(--color-card))] shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/65 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
          <Database size={13} aria-hidden="true" />
          <span>{bi("OPEN ARCHIVE DESK · 공공·박물관 고증 핀보드", "OPEN ARCHIVE DESK · PUBLIC & MUSEUM PINBOARD")}</span>
        </span>
        <span className="numeral tnum inline-flex items-center gap-1.5 rounded-full border border-good/35 bg-good/10 px-2.5 py-0.5 text-[11px] font-semibold text-good">
          <ShieldCheck size={12} aria-hidden="true" />
          <span>
            {bi(
              `활성 아카이브 ${matchCount}/${totalCount}곳 · CC0/레퍼런스 구분`,
              `${matchCount}/${totalCount} Active Archives · CC0 vs Reference Split`,
            )}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {OPEN_DATA_PURPOSE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={purpose === item.id}
              onClick={() => onSelectPurpose(item.id)}
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {bi(item.label, item.enLabel)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-accent/60 lg:w-64">
            <Search size={15} className="shrink-0 text-fg-3" aria-hidden="true" />
            <span className="sr-only">{bi("제공처·고증 키워드 필터", "Filter archives and research keywords")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => onChangeQuery(event.target.value)}
              placeholder={bi("제공처·용도 빠른 필터", "Filter archives or purpose")}
              className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
            />
            {query ? (
              <button
                type="button"
                aria-label={bi("필터 검색어 지우기", "Clear filter query")}
                onClick={() => onChangeQuery("")}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg"
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
              {bi(`필터 초기화 (${matchCount}/${totalCount})`, `Reset (${matchCount}/${totalCount})`)}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
