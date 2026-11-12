import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { ENGINEERING_ATLAS_CATEGORIES, type EngineeringAtlasCategoryId, type EngineeringAtlasEntry } from "./engineering-atlas-types";
import { ENGINEERING_MAPS } from "./engineering-map-content";
import { filterMapRows } from "./engineering-map-filter";
import { ENGINEERING_MAP_IDS, type EngineeringMapId } from "./engineering-map-types";
import type { EngineeringStatus } from "./engineering-story-content";

export const ATLAS_PAGE_SIZE = 12;
export type AtlasCategory = "all" | EngineeringAtlasCategoryId;
export type AtlasStatus = "all" | EngineeringStatus;
export type AtlasView = "cards" | "maps";
interface AtlasFilters {
  readonly category: AtlasCategory;
  readonly status: AtlasStatus;
  readonly query: string;
  readonly page: number;
  readonly view: AtlasView;
  readonly map: EngineeringMapId | "";
}

const CATEGORY_IDS = new Set<string>(ENGINEERING_ATLAS_CATEGORIES.map((item) => item.id));
const STATUS_IDS = new Set<string>(["live", "configured", "experimental", "documented", "planned"]);

function filtersFromSearch(search: string): AtlasFilters {
  const params = new URLSearchParams(search);
  const category = params.get("category") ?? "all";
  const status = params.get("status") ?? "all";
  const page = Number(params.get("atlas-page") ?? "1");
  const map = ENGINEERING_MAP_IDS.find((id) => id === params.get("atlas-map")) ?? "";
  return {
    category: CATEGORY_IDS.has(category) ? category as EngineeringAtlasCategoryId : "all",
    status: STATUS_IDS.has(status) ? status as EngineeringStatus : "all",
    query: (params.get("q") ?? "").slice(0, 80),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    view: params.get("atlas-view") === "maps" ? "maps" : "cards",
    map,
  };
}

function hashId(hash: string): string {
  try { return decodeURIComponent(hash.slice(1)); }
  catch { return hash.slice(1); }
}

/** 기존 두 언어 전체 색인을 보존한다. 현재 페이지의 12개만 검색하지 않는다. */
function searchHaystack(entry: EngineeringAtlasEntry): string {
  return [entry.id, entry.name, entry.title.ko, entry.title.en, entry.tagline.ko, entry.tagline.en,
    ...entry.technologies, ...entry.keyPoints.flatMap((point) => [point.ko, point.en]),
    ...entry.usage.flatMap((usage) => [usage.feature.ko, usage.feature.en])].join(" ").toLowerCase();
}
const HAYSTACKS = new Map(ENGINEERING_ATLAS_ENTRIES.map((entry) => [entry.id, searchHaystack(entry)]));

function filterEntries(filters: AtlasFilters): readonly EngineeringAtlasEntry[] {
  const normalized = filters.query.trim().toLowerCase();
  return ENGINEERING_ATLAS_ENTRIES.filter((entry) => (filters.category === "all" || entry.category === filters.category)
    && (filters.status === "all" || entry.status === filters.status)
    && (!normalized || (HAYSTACKS.get(entry.id) ?? "").includes(normalized)));
}

/** 실제 제공하는 카드·본문·분야·지도·행 앵커만 소유한다. 무관한 해시는 정리하지 않는다. */
function atlasTarget(id: string) {
  const entry = ENGINEERING_ATLAS_ENTRIES.find((item) => [item.id, ...["title", "background", "usage", "samples", "links", "talk"].map(suffix => `${item.id}-${suffix}`)].includes(id));
  const category = ENGINEERING_ATLAS_CATEGORIES.find((item) => id === `category-${item.id}`);
  const map = ENGINEERING_MAPS.find((item) => id === `map-${item.id}` || id === `map-${item.id}-title`
    || item.rows.some(row => id === `map-${item.id}-${row.id}`));
  const row = map?.rows.find(item => id === `map-${map.id}-${item.id}`);
  return { entry, category, map, row, owned: Boolean(entry || category || map) };
}

function mapTargetVisible(target: ReturnType<typeof atlasTarget>, filters: AtlasFilters): boolean {
  if (!target.map || filters.category !== "all") return false;
  const rows = filterMapRows(target.map, filters.query.trim().toLowerCase(), filters.status);
  return target.row ? rows.some(row => row.id === target.row?.id) : rows.length > 0;
}

function destinationHasTarget(id: string, filters: AtlasFilters): boolean {
  const target = atlasTarget(id);
  if (!target.owned) return true;
  if (target.map) return filters.view === "maps" && filters.map === target.map.id && mapTargetVisible(target, filters);
  if (filters.view !== "cards") return false;
  const entries = filterEntries(filters);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(entries.length / ATLAS_PAGE_SIZE)));
  const displayed = entries.slice((page - 1) * ATLAS_PAGE_SIZE, page * ATLAS_PAGE_SIZE);
  return target.entry ? displayed.some(item => item.id === target.entry?.id) : displayed.some(item => item.category === target.category?.id);
}

export function useAtlasNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFromSearch(location.search), [location.search]);
  const visible = useMemo(() => filterEntries(filters), [filters]);

  // Router 반영 전 이어진 조작은 마지막 요청 URL에 합친다. commit 뒤에는 URL을 다시 정본으로 쓴다.
  const pending = useRef<{ key: string; search: string; hash: string } | null>(null);
  useLayoutEffect(() => { pending.current = null; }, [location]);
  const update = useCallback((patch: Partial<AtlasFilters>, replace = false): void => {
    const base = pending.current?.key === location.key ? pending.current : location;
    const next = { ...filtersFromSearch(base.search), ...patch };
    const params = new URLSearchParams(base.search);
    const values = { category: next.category === "all" ? "" : next.category,
      status: next.status === "all" ? "" : next.status, q: next.query,
      "atlas-page": next.page > 1 ? String(next.page) : "",
      "atlas-view": next.view === "maps" ? "maps" : "", "atlas-map": next.map };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    const search = params.toString();
    const hash = destinationHasTarget(hashId(base.hash), next) ? base.hash : "";
    if (search === new URLSearchParams(base.search).toString() && hash === base.hash) return;
    pending.current = { key: location.key, search, hash };
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash }, { replace, state: location.state });
  }, [location, navigate]);

  const nativePopHref = useRef("");
  // 네이티브 앵커도 라우터와 같은 URL 문맥을 사용한다. 별도 저장소·스크롤 소유자는 만들지 않는다.
  useEffect(() => {
    const nativePop = () => { nativePopHref.current = window.location.href; };
    const nativeHash = () => {
      // 같은 POP 뒤의 hashchange는 Router가 복구한 query·caller state를 덮지 않는다.
      if (nativePopHref.current === window.location.href) { nativePopHref.current = ""; return; }
      if (window.location.pathname !== location.pathname || window.location.search !== location.search || window.location.hash === location.hash) return;
      navigate({ pathname: location.pathname, search: location.search, hash: window.location.hash }, { replace: true, state: location.state });
    };
    window.addEventListener("popstate", nativePop);
    window.addEventListener("hashchange", nativeHash);
    return () => { window.removeEventListener("popstate", nativePop); window.removeEventListener("hashchange", nativeHash); };
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const previous = useRef<{ hash: string; pathname: string; key: string } | null>(null);
  const prior = previous.current;
  const targetId = hashId(location.hash);
  // 같은 hash의 Back/forward는 URL의 페이지·목적·필터를 그대로 복구한다.
  const restoreHash = !prior || prior.hash !== location.hash || prior.pathname !== location.pathname;
  const resolved = atlasTarget(targetId);
  const targetMap = resolved.map;
  const target = resolved.entry ?? (resolved.category ? ENGINEERING_ATLAS_ENTRIES.find(item => item.category === resolved.category?.id) : undefined);
  const filteredIndex = target ? visible.findIndex((item) => item.id === target.id) : -1;
  const resetForHash = restoreHash && Boolean((targetMap && !mapTargetVisible(resolved, filters)) || (target && filteredIndex < 0));
  const effectiveVisible = resetForHash ? ENGINEERING_ATLAS_ENTRIES : visible;
  const targetIndex = target ? effectiveVisible.indexOf(target) : -1;
  const hashPatch = useMemo<Partial<AtlasFilters>>(() => !restoreHash || !targetId ? {} : targetMap
    ? { ...(resetForHash ? { category: "all", status: "all", query: "" } : {}), view: "maps", map: targetMap.id }
    : target ? { ...(resetForHash ? { category: "all", status: "all", query: "" } : {}), view: "cards", page: Math.floor(targetIndex / ATLAS_PAGE_SIZE) + 1 } : {}, [restoreHash, targetId, targetMap, target, resetForHash, targetIndex]);
  const effective = { ...filters, ...hashPatch };
  const pages = Math.max(1, Math.ceil(effectiveVisible.length / ATLAS_PAGE_SIZE));
  const page = Math.min(effective.page, pages);
  useEffect(() => {
    previous.current = { hash: location.hash, pathname: location.pathname, key: location.key };
    // 대상은 첫 커밋부터 구성한다. 공통 스크롤 소유자의 앵커 관찰을 URL 정규화가 취소하지 않게 한다.
    if (Object.keys(hashPatch).length) update(hashPatch, true);
    // 같은 해시를 유지한 검색 입력은 새 앵커 이동이 아니다.
  }, [hashPatch, location.hash, location.key, location.pathname, update]);

  return { ...effective, page, pages, visible: effectiveVisible, normalized: effective.query.trim().toLowerCase(), targetId, update };
}
