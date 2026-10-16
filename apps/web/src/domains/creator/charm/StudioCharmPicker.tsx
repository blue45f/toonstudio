/**
 * 참 고르기 — 어떤 소재든 참 바에 고정/해제하는 선택기.
 *
 * 새 소재를 만들지 않는다. 기존 카탈로그(효과·스티커·소품·이모지·효과음·도형·일러스트·내 소재·말풍선·3D)를
 * 한 곳에서 검색하고, 기존 즐겨찾기(내장 일러스트/내 소재의 자산 즐겨찾기, 요소 카탈로그 즐겨찾기)는
 * "즐겨찾기" 분류로 모아 보여 준다. 고정 상태는 `aria-pressed` 토글 버튼으로 드러낸다.
 * 불러오기(loading)·빈 결과(empty)·오류(error)+다시 시도(retry)를 모두 갖는다.
 */

import { Search, Star, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { useStudioCatalogPreferences } from "../catalog/use-studio-catalog-preferences";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { bi } from "./studio-charm-copy";
import { studioCharmFavoriteIds } from "./studio-charm-favorites";
import { StudioCharmPreview } from "./StudioCharmPreview";

import type { StudioCatalogPreferencesRepository } from "../catalog/studio-catalog-preferences";
import type { StudioCharmCatalog } from "./studio-charm-catalog";
import type { StudioCharmDescriptor, StudioCharmSection } from "./studio-charm-descriptor";
import type { StudioCharmId } from "./studio-charm-model";
import type { StudioCharmCatalogStatus } from "./useStudioCharmCatalog";
import type { StudioCharmLibraryStatus } from "./useStudioCharmLibrary";

type PickerFilter = StudioCharmSection | "all" | "favorites";

const PAGE_SIZE = 60;

function sectionLabel(section: StudioCharmSection): string {
  switch (section) {
    case "effect": return bi("효과·선", "Effects");
    case "sticker": return bi("스티커", "Stickers");
    case "prop": return bi("소품", "Props");
    case "emoji": return bi("이모지", "Emoji");
    case "sfx": return bi("효과음", "Sound FX");
    case "shape": return bi("도형·장식", "Shapes");
    case "illustration": return bi("일러스트", "Illustrations");
    case "mine": return bi("내 소재", "My assets");
    case "bubble": return bi("말풍선", "Bubbles");
    case "object3d": return bi("3D", "3D");
  }
}

export interface StudioCharmPickerProps {
  readonly catalog: StudioCharmCatalog;
  readonly catalogStatus: StudioCharmCatalogStatus;
  readonly onRetryCatalog: () => void;
  /** 내 소재(보관함) 목록을 읽는 상태. 읽는 동안 "내 소재"는 비어 보이므로 빈 결과 안내를 미룬다. */
  readonly libraryStatus: StudioCharmLibraryStatus;
  readonly onRetryLibrary: () => void;
  readonly pinned: readonly StudioCharmId[];
  readonly capacity: number;
  /** 자산 즐겨찾기 ID(`raster:…`·`local:…`). */
  readonly assetFavoriteIds: readonly string[];
  readonly onToggle: (descriptor: StudioCharmDescriptor) => void;
  readonly onClose: () => void;
  /** 시험용: 요소 즐겨찾기 저장소 주입. */
  readonly acquireCatalogPreferences?: () => Promise<StudioCatalogPreferencesRepository>;
}

export function StudioCharmPicker({
  catalog,
  catalogStatus,
  onRetryCatalog,
  libraryStatus,
  onRetryLibrary,
  pinned,
  capacity,
  assetFavoriteIds,
  onToggle,
  onClose,
  acquireCatalogPreferences,
}: StudioCharmPickerProps) {
  useBilingualI18nRevision();
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PickerFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const elementPreferences = useStudioCatalogPreferences("elements", acquireCatalogPreferences);
  const favoriteCharmIds = useMemo(
    () => studioCharmFavoriteIds(assetFavoriteIds, elementPreferences.state.favoriteIds),
    [assetFavoriteIds, elementPreferences.state.favoriteIds],
  );
  const pinnedSet = useMemo(() => new Set<StudioCharmId>(pinned), [pinned]);
  const isFull = pinned.length >= capacity;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const found = catalog.search({
      query,
      section: filter === "favorites" ? "all" : filter,
      limit: 2_000,
    });
    return filter === "favorites" ? found.filter((descriptor) => favoriteCharmIds.has(descriptor.id)) : found;
  }, [catalog, favoriteCharmIds, filter, query]);
  const visible = matches.slice(0, limit);
  const loading = catalogStatus === "loading" || libraryStatus === "loading";
  const sections: readonly StudioCharmSection[] = [
    "effect", "sticker", "prop", "emoji", "sfx", "shape", "illustration", "mine", "bubble", "object3d",
  ];

  const chipClass = (active: boolean) => cn(
    "inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 text-[0.7rem] font-semibold pointer-coarse:min-h-11 max-lg:min-h-11",
    STUDIO_EASE,
    STUDIO_FOCUS_RING,
    "motion-reduce:transition-none",
    active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" data-studio-charm-picker="">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-bold text-fg">{bi("참 고르기", "Choose charms")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={bi("참 고르기 닫기", "Close the charm picker")}
          className={cn("grid size-11 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg", STUDIO_FOCUS_RING)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <label className="relative block">
        <span className="sr-only">{bi("참 검색", "Search charms")}</span>
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          maxLength={80}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setLimit(PAGE_SIZE);
          }}
          placeholder={bi("집중선 · 땀 · 소품 · 쾅", "Focus lines · sweat · props · bang")}
          className="min-h-11 w-full rounded-lg border border-line bg-card pl-8 pr-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </label>

      <div role="group" aria-label={bi("분류", "Category")} className="flex max-w-full gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => { setFilter("all"); setLimit(PAGE_SIZE); }}
          className={chipClass(filter === "all")}
        >
          {bi("전체", "All")}
        </button>
        <button
          type="button"
          aria-pressed={filter === "favorites"}
          onClick={() => { setFilter("favorites"); setLimit(PAGE_SIZE); }}
          className={cn(chipClass(filter === "favorites"), "gap-1")}
        >
          <Star size={12} aria-hidden="true" fill={filter === "favorites" ? "currentColor" : "none"} />
          {bi("즐겨찾기", "Favorites")}
        </button>
        {sections.map((section) => (
          <button
            key={section}
            type="button"
            aria-pressed={filter === section}
            onClick={() => { setFilter(section); setLimit(PAGE_SIZE); }}
            className={chipClass(filter === section)}
          >
            {sectionLabel(section)}
            <span className="ml-1 tabular-nums opacity-80">{catalog.sectionCounts[section]}</span>
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="text-[0.7rem] text-fg-3">
        {bi(
          `${matches.length}개 · 고정 ${pinned.length}/${capacity}`,
          `${matches.length} found · ${pinned.length}/${capacity} pinned`,
        )}
        {catalogStatus === "loading" ? bi(" · 효과·스티커를 불러오는 중…", " · loading effects and stickers…") : ""}
        {libraryStatus === "loading" ? bi(" · 내 소재를 불러오는 중…", " · loading your assets…") : ""}
      </p>

      {catalogStatus === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-bad/40 bg-bad/10 p-2 text-xs text-fg-2">
          <span className="min-w-0 flex-1">
            {bi("효과·스티커 목록을 불러오지 못했어요. 이모지와 도형은 그대로 쓸 수 있어요.", "Could not load effects and stickers. Emoji and shapes still work.")}
          </span>
          <button
            type="button"
            onClick={onRetryCatalog}
            className={cn("min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            {bi("다시 불러오기", "Retry")}
          </button>
        </div>
      ) : null}

      {libraryStatus === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-bad/40 bg-bad/10 p-2 text-xs text-fg-2">
          <span className="min-w-0 flex-1">
            {bi("내 소재 목록을 불러오지 못했어요. 다른 분류는 그대로 쓸 수 있어요.", "Could not load your assets. The other categories still work.")}
          </span>
          <button
            type="button"
            onClick={onRetryLibrary}
            className={cn("min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            {bi("내 소재 다시 불러오기", "Reload my assets")}
          </button>
        </div>
      ) : null}

      {isFull ? (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-fg-2">
          {bi(
            `참 바가 가득 찼어요(최대 ${capacity}개). 하나를 빼면 새로 고정할 수 있어요.`,
            `The charm bar is full (up to ${capacity}). Remove one to pin another.`,
          )}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]" aria-labelledby={headingId}>
        {loading && visible.length === 0 ? (
          <div role="status" aria-busy="true" className="grid grid-cols-3 gap-1.5">
            <span className="sr-only">{bi("목록을 불러오는 중", "Loading the list")}</span>
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} aria-hidden="true" className="skeleton h-20 rounded-lg" />
            ))}
          </div>
        ) : null}

        {visible.length === 0 && !loading ? (
          <div className="grid gap-2 rounded-lg border border-dashed border-line p-4 text-center">
            <p className="text-sm font-semibold text-fg-2">{bi("찾는 참이 없어요", "No matching charms")}</p>
            <p className="text-xs text-fg-3">
              {filter === "favorites"
                ? bi("즐겨찾기한 소재가 아직 없어요. 별 버튼으로 즐겨찾기를 만들면 여기에 모여요.", "No favorites yet. Star items in the asset panels and they appear here.")
                : bi("다른 낱말이나 분류로 찾아보세요. 예: 집중선, 땀, 소품", "Try another word or category, such as focus lines, sweat or props.")}
            </p>
            <button
              type="button"
              onClick={() => { setQuery(""); setFilter("all"); setLimit(PAGE_SIZE); }}
              className={cn("mx-auto min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
            >
              {bi("검색 지우기", "Clear search")}
            </button>
          </div>
        ) : null}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1.5">
          {visible.map((descriptor) => {
            const isPinned = pinnedSet.has(descriptor.id);
            const blocked = !isPinned && isFull;
            const aiLabel = descriptor.rights.aiGenerated ? bi(", AI 생성", ", AI-generated") : "";
            return (
              <li key={descriptor.id}>
                <button
                  type="button"
                  aria-pressed={isPinned}
                  aria-disabled={blocked ? true : undefined}
                  aria-label={`${descriptor.label}${aiLabel} — ${isPinned ? bi("참 바에서 빼기", "Remove from the charm bar") : bi("참 바에 고정", "Pin to the charm bar")}`}
                  title={`${descriptor.label} · ${descriptor.rights.summary}`}
                  data-studio-charm-pick={descriptor.id}
                  onClick={() => { if (!blocked) onToggle(descriptor); }}
                  className={cn(
                    "relative flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 text-center",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    "motion-reduce:transition-none",
                    isPinned ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-accent/50 hover:bg-raised",
                    blocked && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="block h-12 w-full"><StudioCharmPreview descriptor={descriptor} /></span>
                  <span className="line-clamp-2 min-h-[1.6rem] w-full break-all text-[0.64rem] leading-tight text-fg-2">
                    {descriptor.label}
                  </span>
                  {isPinned ? (
                    <span aria-hidden="true" className="absolute right-1 top-1 rounded-full bg-accent px-1 text-[0.55rem] font-bold text-on-accent">
                      {bi("고정", "Pinned")}
                    </span>
                  ) : null}
                  {descriptor.rights.aiGenerated ? (
                    <span aria-hidden="true" className="absolute left-1 top-1 rounded border border-line bg-panel px-0.5 text-[0.5rem] font-bold text-fg-2">AI</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {matches.length > visible.length ? (
          <button
            type="button"
            onClick={() => setLimit((value) => value + PAGE_SIZE)}
            className={cn("mt-2 min-h-11 w-full rounded-lg border border-line bg-card text-xs font-semibold text-fg-2 hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            {bi(`더 보기 (${visible.length}/${matches.length})`, `Show more (${visible.length}/${matches.length})`)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
