import {
  BookmarkPlus,
  CheckCircle2,
  Cpu,
  History,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  X,
} from "lucide-react";

import { useMarketFollowedCreators } from "../hooks/use-market-followed-creators";
import {
  buildMarketQuerySearchParams,
  useMarketSearchHistory,
} from "../hooks/use-market-search-history";

import type { MarketBrowseQueryValues } from "../models/market-query";
import type { MarketDisplaySortMode } from "../models/market-similar-resources";
import type {
  CreatorMarketplaceResourceEngine,
  CreatorMarketplaceResourceProvenanceOrigin,
} from "@/shared/lib/creator-marketplace-resource-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketBrowseFacetBarProps {
  readonly query: MarketBrowseQueryValues;
  readonly hasActiveFilters: boolean;
  readonly displaySort: MarketDisplaySortMode;
  readonly onChangeDisplaySort: (mode: MarketDisplaySortMode) => void;
  readonly onPatchParams: (patch: Record<string, string | null>) => void;
  readonly onApplyPresetSearch: (searchParams: string) => void;
}

const ENGINE_OPTIONS: readonly {
  readonly value: CreatorMarketplaceResourceEngine;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { value: "canvas2d", labelKo: "Canvas 2D 호환", labelEn: "Canvas 2D" },
  { value: "webgl2", labelKo: "WebGL2 호환", labelEn: "WebGL2" },
  { value: "webgpu", labelKo: "WebGPU 호환", labelEn: "WebGPU" },
  { value: "three", labelKo: "Three.js 3D 호환", labelEn: "Three.js 3D" },
] as const;

const ORIGIN_OPTIONS: readonly {
  readonly value: CreatorMarketplaceResourceProvenanceOrigin;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { value: "original", labelKo: "창작 원본(Original)", labelEn: "Original work" },
  { value: "permissive", labelKo: "공개 라이선스(Permissive)", labelEn: "Permissive source" },
] as const;

const QUICK_WORKFLOW_TAGS = [
  "학교",
  "배경",
  "로판",
  "선화",
  "야경",
  "포즈",
] as const;

function facetPillClass(active: boolean): string {
  return cn(
    "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
    active
      ? "border-accent bg-accent text-on-accent shadow-xs"
      : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
  );
}

/**
 * 마켓 탐색 고도화 패싯 바:
 * - 서버 연동 패싯: AI 미포함만(`containsAi=false`), 상업 연재 허용(`commercial=true`), 호환 엔진(`engine`), 출처 구분(`origin`), 빠른 태그
 * - 팔로우 중인 배급자 빠른 필터 및 스토어 이동
 * - 최근 검색어 칩 & 저장한 필터 프리셋
 * - 현재 페이지 보조 정렬
 */
export function MarketBrowseFacetBar({
  query,
  hasActiveFilters,
  displaySort,
  onChangeDisplaySort,
  onPatchParams,
  onApplyPresetSearch,
}: MarketBrowseFacetBarProps) {
  const t = useBilingual("MarketBrowseFacetBar");
  const { followedCreators } = useMarketFollowedCreators();
  const {
    recentSearches,
    savedPresets,
    removeRecentSearch,
    clearRecentSearches,
    saveFilterPreset,
    removeFilterPreset,
  } = useMarketSearchHistory();

  const handleSaveCurrentPreset = () => {
    const parts: string[] = [];
    if (query.search) parts.push(`“${query.search}”`);
    if (query.kind) parts.push(query.kind);
    if (query.containsAi === false) parts.push("No-AI");
    if (query.commercial === true) parts.push(t("상업허용", "Commercial"));
    if (query.engine) parts.push(query.engine);
    if (query.tag) parts.push(`#${query.tag}`);
    if (query.license) parts.push(query.license);
    const label = parts.length > 0 ? parts.join(" · ") : t("사용자 맞춤 필터", "Custom filter");
    saveFilterPreset(label, query);
  };

  return (
    <section
      aria-label={t("고급 권리·호환성·발견 필터", "Advanced rights, compatibility & discovery filters")}
      data-testid="market-browse-facet-bar"
      className="mt-4 space-y-3 rounded-2xl border border-line bg-card/75 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-bold text-fg-3">
            {t("권리·AI·호환성:", "Rights & engines:")}
          </span>

          <button
            type="button"
            aria-pressed={query.containsAi === false}
            onClick={() =>
              onPatchParams({
                containsAi: query.containsAi === false ? null : "false",
              })
            }
            className={facetPillClass(query.containsAi === false)}
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("AI 미포함만", "No-AI only")}
          </button>

          <button
            type="button"
            aria-pressed={query.commercial === true}
            onClick={() =>
              onPatchParams({
                commercial: query.commercial === true ? null : "true",
              })
            }
            className={facetPillClass(query.commercial === true)}
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("상업 연재 허용", "Commercial serial OK")}
          </button>

          {ENGINE_OPTIONS.map((option) => {
            const active = query.engine === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onPatchParams({
                    engine: active ? null : option.value,
                  })
                }
                className={facetPillClass(active)}
              >
                <Cpu className="size-3" aria-hidden="true" />
                {t(option.labelKo, option.labelEn)}
              </button>
            );
          })}

          {ORIGIN_OPTIONS.map((option) => {
            const active = query.origin === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onPatchParams({
                    origin: active ? null : option.value,
                  })
                }
                className={facetPillClass(active)}
              >
                {t(option.labelKo, option.labelEn)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-fg-3">
            <span>{t("화면 정렬", "View order")}</span>
            <select
              aria-label={t("불러온 목록 보조 정렬", "Secondary sort for loaded items")}
              value={displaySort}
              onChange={(event) =>
                onChangeDisplaySort(event.target.value as MarketDisplaySortMode)
              }
              className="h-8 rounded-lg border border-line bg-panel px-2 text-xs font-medium text-fg focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <option value="server">{t("서버 기본 순서", "Server order")}</option>
              <option value="updatedDesc">{t("최근 업데이트순", "Recently updated")}</option>
              <option value="nameAsc">{t("이름 가나다순", "Name A–Z")}</option>
              <option value="byteSizeAsc">{t("경량 패키지순", "Smallest manifest")}</option>
              <option value="entriesDesc">{t("구성 항목 많은 순", "Most entries")}</option>
            </select>
          </label>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={handleSaveCurrentPreset}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft/40 px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
            >
              <BookmarkPlus className="size-3.5" aria-hidden="true" />
              {t("필터 프리셋 저장", "Save filter preset")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2.5">
        <span className="mr-1 inline-flex items-center gap-1 text-xs font-bold text-fg-3">
          <Sparkles className="size-3 text-accent" aria-hidden="true" />
          {t("장르·작업 태그:", "Quick tags:")}
        </span>
        {QUICK_WORKFLOW_TAGS.map((tag) => {
          const active = query.tag === tag;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => onPatchParams({ tag: active ? null : tag })}
              className={cn(
                "min-h-7 rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors",
                active
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              #{tag}
            </button>
          );
        })}
      </div>

      {followedCreators.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-bold text-fg-3">
            <Store className="size-3.5 text-accent" aria-hidden="true" />
            {t("팔로잉 배급자:", "Following:")}
          </span>
          {followedCreators.map((creator) => {
            const active = query.publisher === creator.id;
            return (
              <span
                key={creator.id}
                className="inline-flex items-center overflow-hidden rounded-full border border-line bg-panel text-xs"
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onPatchParams({ publisher: active ? null : creator.id })
                  }
                  className={cn(
                    "min-h-7 px-2.5 py-0.5 font-semibold transition-colors",
                    active ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg",
                  )}
                >
                  {creator.name}
                </button>
                <Link
                  href={`/market/creator/${encodeURIComponent(creator.id)}`}
                  aria-label={`${creator.name} 스토어 이동`}
                  className="border-l border-line px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-raised"
                >
                  {t("스토어", "Store")}
                </Link>
              </span>
            );
          })}
        </div>
      ) : null}

      {recentSearches.length > 0 || savedPresets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5 text-xs">
          {savedPresets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-fg-3">{t("저장 프리셋:", "Saved presets:")}</span>
              {savedPresets.map((preset) => (
                <span
                  key={preset.id}
                  className="inline-flex items-center overflow-hidden rounded-lg border border-accent/35 bg-accent-soft/30"
                >
                  <button
                    type="button"
                    onClick={() =>
                      onApplyPresetSearch(
                        buildMarketQuerySearchParams(preset.query).toString(),
                      )
                    }
                    className="min-h-7 px-2 py-0.5 font-semibold text-accent hover:underline"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`${preset.name} 프리셋 삭제`}
                    onClick={() => removeFilterPreset(preset.id)}
                    className="border-l border-accent/25 px-1.5 py-0.5 text-fg-3 hover:text-bad"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {recentSearches.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-bold text-fg-3">
                <History className="size-3" aria-hidden="true" />
                {t("최근 검색:", "Recent:")}
              </span>
              {recentSearches.slice(0, 6).map((term) => (
                <span
                  key={term}
                  className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-panel"
                >
                  <button
                    type="button"
                    onClick={() => onPatchParams({ q: term })}
                    className="min-h-7 px-2 py-0.5 text-fg-2 hover:text-fg"
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    aria-label={`최근 검색어 ${term} 삭제`}
                    onClick={() => removeRecentSearch(term)}
                    className="border-l border-line px-1.5 py-0.5 text-fg-3 hover:text-fg"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearRecentSearches}
                aria-label={t("최근 검색어 전체 지우기", "Clear all recent searches")}
                className="inline-flex min-h-7 items-center gap-1 rounded-lg px-1.5 text-fg-3 hover:text-fg"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
