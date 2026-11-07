import { useCallback, useEffect, useState } from "react";

import type { DiscoverHomeSnapshot } from "./discover-home";
import {
  collectDiscoverLocalMatches,
  type DiscoverLocalMatchResult,
  filterTitlesByLocalQuery,
  matchesHangulAwareQuery,
  normalizePlatformId,
  sanitizeCatalogApiData,
  sanitizeDiscoverHomeSnapshot,
  sanitizeTitleArray,
  sanitizeTitleRecord,
} from "./local-catalog-sanitize";
import type { PlatformId, SerialStatus, Title, WorkType } from "@/shared/lib/types";

export {
  collectDiscoverLocalMatches,
  type DiscoverLocalMatchResult,
  filterTitlesByLocalQuery,
  matchesHangulAwareQuery,
  normalizePlatformId,
  sanitizeCatalogApiData,
  sanitizeDiscoverHomeSnapshot,
  sanitizeTitleRecord,
};

const STATIC_DIRECT_FILES: Record<string, string> = {
  "/api/home": "/data/home.json",
  "/api/calendar": "/data/calendar.json",
  "/api/insights": "/data/insights.json",
  "/api/tags": "/data/tags.json",
  "/api/authors": "/data/authors.json",
};

interface LightweightLocalPool {
  readonly titles: Title[];
  readonly tags: { readonly tag: string; readonly count: number }[];
  readonly anySourceLoaded: boolean;
}

let cachedLocalPoolPromise: Promise<LightweightLocalPool> | null = null;

export function resetLocalCatalogFallbackCache(): void {
  cachedLocalPoolPromise = null;
}

async function loadLightweightLocalPool(): Promise<LightweightLocalPool> {
  if (!cachedLocalPoolPromise) {
    cachedLocalPoolPromise = (async () => {
      const fetchJson = async <R>(url: string): Promise<{ ok: boolean; data: R | null }> => {
        try {
          const res = await globalThis.fetch(url, { cache: "no-store" });
          const ct = res.headers.get("content-type") ?? "";
          if (!res.ok || !ct.includes("application/json")) {
            return { ok: false, data: null };
          }
          return { ok: true, data: (await res.json()) as R };
        } catch {
          return { ok: false, data: null };
        }
      };

      const [homeRes, firstShardRes, tagsRes] = await Promise.all([
        fetchJson<DiscoverHomeSnapshot>("/data/home.json"),
        fetchJson<Title[]>("/data/catalog/00.json"),
        fetchJson<{ readonly tags?: { readonly tag: string; readonly count: number }[] }>(
          "/data/tags.json",
        ),
      ]);

      const anySourceLoaded = homeRes.ok || firstShardRes.ok || tagsRes.ok;
      if (!anySourceLoaded) {
        // 모든 정적 소스가 실패한 경우 캐시를 고정하지 않고 다음 재시도에서 다시 요청하도록 비운다.
        cachedLocalPoolPromise = null;
        return { titles: [], tags: [], anySourceLoaded: false };
      }

      const pool: Title[] = [];
      const seen = new Set<string>();
      const pushList = (items: unknown) => {
        const sanitizedList = sanitizeTitleArray(items);
        for (const item of sanitizedList) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          pool.push(item);
        }
      };

      const homeSnap = homeRes.data ? sanitizeDiscoverHomeSnapshot(homeRes.data) : null;
      if (homeSnap) {
        if (homeSnap.spotlight) pushList([homeSnap.spotlight]);
        pushList(homeSnap.featured);
        pushList(homeSnap.todayReleases);
        pushList(homeSnap.topRated);
        pushList(homeSnap.waitFree);
        pushList(homeSnap.newest);
      }
      if (Array.isArray(firstShardRes.data)) {
        pushList(firstShardRes.data);
      }

      const sanitizedTags =
        tagsRes.data && Array.isArray(tagsRes.data.tags)
          ? tagsRes.data.tags
              .filter(
                (entry): entry is { readonly tag: string; readonly count: number } =>
                  Boolean(entry) &&
                  typeof entry === "object" &&
                  typeof entry.tag === "string" &&
                  entry.tag.trim().length > 0,
              )
              .map((entry) => ({
                tag: entry.tag.trim(),
                count:
                  typeof entry.count === "number" && Number.isFinite(entry.count) && entry.count >= 0
                    ? entry.count
                    : 0,
              }))
              .slice(0, 18)
          : [];

      return {
        titles: pool,
        tags: sanitizedTags,
        anySourceLoaded: true,
      };
    })();
  }
  return cachedLocalPoolPromise;
}

export async function resolveFromLocalStaticCatalog<T>(apiUrl: string): Promise<T | null> {
  if (typeof window === "undefined" || typeof globalThis.fetch !== "function") {
    return null;
  }

  const parsed = new URL(apiUrl, window.location.origin);
  const { pathname, searchParams } = parsed;

  if (STATIC_DIRECT_FILES[pathname] && [...searchParams.keys()].length === 0) {
    try {
      const response = await globalThis.fetch(STATIC_DIRECT_FILES[pathname], {
        cache: "default",
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/json")) return null;
      const raw = (await response.json()) as T;
      return sanitizeCatalogApiData(pathname, raw);
    } catch {
      return null;
    }
  }

  if (pathname === "/api/explore") {
    const [
      { titles, tags, anySourceLoaded },
      { normalizeExploreParams, EXPLORE_PAGE_SIZE },
      { searchTitles },
      { GENRES },
    ] = await Promise.all([
      loadLightweightLocalPool(),
      import("@/shared/lib/server/explore"),
      import("@/shared/lib/search"),
      import("@/shared/lib/taxonomy"),
    ]);
    if (!anySourceLoaded) return null;

    const sp: Record<string, string | undefined> = {};
    for (const [key, value] of searchParams.entries()) {
      sp[key] = value;
    }
    const filters = normalizeExploreParams(sp);
    const facetMatched = searchTitles(
      titles,
      {
        types: filters.types,
        genres: filters.genres,
        tags: filters.tags,
        status: filters.status,
        platforms: filters.platforms,
        ageRatings: filters.ages,
        minRating: filters.minRating,
        yearMin: filters.yearMin,
        yearMax: filters.yearMax,
        freeOnly: filters.freeOnly || undefined,
        adaptedOnly: filters.adaptedOnly || undefined,
      },
      filters.sort,
    );
    const rawQ = (searchParams.get("q") ?? "").trim();
    const matched = rawQ ? filterTitlesByLocalQuery(facetMatched, rawQ) : facetMatched;
    const showCount = Math.min(
      Math.max(Number(sp.show) || EXPLORE_PAGE_SIZE, EXPLORE_PAGE_SIZE),
      Math.max(matched.length, EXPLORE_PAGE_SIZE),
    );
    const shown = matched.slice(0, showCount);

    return {
      filters,
      current: {
        genre: filters.genre,
        tag: filters.tag,
        type: filters.type,
        sort: sp.sort ? filters.sort : undefined,
      },
      results: matched,
      shown,
      hasMore: matched.length > shown.length,
      showCount,
      pageSize: EXPLORE_PAGE_SIZE,
      tags,
      genres: GENRES,
      generatedAt: new Date().toISOString(),
      source: "local-static-fallback",
    } as unknown as T;
  }

  if (pathname === "/api/search") {
    const [{ titles, tags, anySourceLoaded }, { searchTitles }] = await Promise.all([
      loadLightweightLocalPool(),
      import("@/shared/lib/search"),
    ]);
    if (!anySourceLoaded) return null;

    const rawQ = (searchParams.get("q") ?? "").trim();
    const sortParam = searchParams.get("sort") ?? "popular";
    const sort = (
      ["relevance", "rating", "popular", "trending", "bookmarks", "completion", "newest", "title"].includes(
        sortParam,
      )
        ? sortParam
        : "popular"
    ) as Parameters<typeof searchTitles>[2];
    const splitCsv = (val: string | null) =>
      (val ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    const types = splitCsv(searchParams.get("types")).filter(
      (v): v is WorkType => v === "webtoon" || v === "webnovel",
    );
    const genres = splitCsv(searchParams.get("genres"));
    const tagFilter = splitCsv(searchParams.get("tags"));
    const status = splitCsv(searchParams.get("status")).filter(
      (v): v is SerialStatus => v === "ongoing" || v === "completed" || v === "hiatus",
    );
    const platforms = splitCsv(searchParams.get("platforms")) as PlatformId[];
    const ageRatings = splitCsv(searchParams.get("ages")).filter(
      (v): v is Title["ageRating"] => v === "all" || v === "12" || v === "15" || v === "19",
    );
    const minRatingRaw = searchParams.get("minRating");
    const minRating =
      minRatingRaw && Number.isFinite(Number(minRatingRaw)) ? Number(minRatingRaw) : undefined;
    const freeOnly = searchParams.get("freeOnly") === "true" || undefined;
    const adaptedOnly = searchParams.get("adaptedOnly") === "true" || undefined;

    const facetMatched = searchTitles(
      titles,
      {
        types: types.length ? types : undefined,
        genres: genres.length ? genres : undefined,
        tags: tagFilter.length ? tagFilter : undefined,
        status: status.length ? status : undefined,
        platforms: platforms.length ? platforms : undefined,
        ageRatings: ageRatings.length ? ageRatings : undefined,
        minRating,
        freeOnly,
        adaptedOnly,
      },
      sort,
    );
    const matched = rawQ ? filterTitlesByLocalQuery(facetMatched, rawQ) : facetMatched;
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 24, 1), 80);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
    const pageItems = matched.slice(offset, offset + limit);
    let webtoonCount = 0;
    let webnovelCount = 0;
    for (const item of matched) {
      if (item.type === "webtoon") webtoonCount += 1;
      else if (item.type === "webnovel") webnovelCount += 1;
    }

    return {
      items: pageItems,
      total: matched.length,
      pagination: {
        offset,
        limit,
        hasMore: offset + pageItems.length < matched.length,
        nextOffset: offset + pageItems.length < matched.length ? offset + pageItems.length : null,
      },
      typeCountScope: "all",
      typeCount: {
        webtoon: webtoonCount,
        webnovel: webnovelCount,
      },
      catalog: {
        source: "local-static-fallback",
        platformCoverage: [],
        filteredPlatformCoverage: [],
      },
      topTags: tags.map((t) => t.tag),
      generatedAt: new Date().toISOString(),
    } as unknown as T;
  }

  if (pathname === "/api/titles") {
    const { titles, anySourceLoaded } = await loadLightweightLocalPool();
    if (!anySourceLoaded) return null;
    const idsRaw = searchParams.get("ids") ?? "";
    const ids = idsRaw.split(",").map((id) => id.trim()).filter(Boolean);
    const rawQ = (searchParams.get("q") ?? "").trim();
    const baseItems =
      ids.length > 0
        ? titles.filter((item) => ids.includes(item.id))
        : rawQ
          ? filterTitlesByLocalQuery(titles, rawQ).slice(0, 40)
          : titles.slice(0, 40);
    return { items: baseItems, total: baseItems.length } as unknown as T;
  }

  if (pathname.startsWith("/api/authors/")) {
    const authorName = decodeURIComponent(pathname.slice("/api/authors/".length));
    const { titles, anySourceLoaded } = await loadLightweightLocalPool();
    if (!anySourceLoaded) return null;
    const works = titles.filter((item) => item.author === authorName || item.artist === authorName);
    if (works.length > 0) {
      const genres = [...new Set(works.flatMap((w) => w.genres ?? []))].slice(0, 6);
      const tags = [...new Set(works.flatMap((w) => w.tags ?? []))].slice(0, 10);
      const platforms: PlatformId[] = [
        ...new Set(
          works.flatMap((w) =>
            (w.availability ?? [])
              .map((a) => normalizePlatformId(a?.platformId))
              .filter((id): id is PlatformId => id !== null),
          ),
        ),
      ];
      const totalViews = works.reduce((sum, w) => sum + (w.stats?.views ?? 0), 0);
      const totalLikes = works.reduce((sum, w) => sum + (w.stats?.likes ?? 0), 0);
      const avg =
        works.reduce((sum, w) => sum + (w.stats?.ratingAvg ?? 0), 0) / Math.max(1, works.length);
      return {
        author: authorName,
        works,
        totalViews,
        totalLikes,
        avg,
        avgRating: avg,
        genres,
        tags,
        platforms,
        generatedAt: new Date().toISOString(),
        source: "local-static-fallback",
      } as unknown as T;
    }
  }

  try {
    const engine = await import("@/shared/catalog/catalog-static-engine");
    const response = await engine.handleStaticCatalogRequest(
      pathname,
      searchParams,
      undefined,
      globalThis.fetch.bind(window),
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) return null;
    const raw = (await response.json()) as T;
    return sanitizeCatalogApiData(pathname, raw);
  } catch {
    return null;
  }
}

function parseSearchBridgeUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
}

function installLocalSearchBridgeOnWindow(targetWindow: Window & typeof globalThis): () => void {
  const currentFetch = targetWindow.fetch;
  if ((currentFetch as { __localSearchBridgeInstalled?: boolean }).__localSearchBridgeInstalled) {
    return () => undefined;
  }

  const bridgedFetch: typeof window.fetch = async (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const parsed = parseSearchBridgeUrl(rawUrl);
    const isSearchApi =
      parsed !== null &&
      parsed.origin === targetWindow.location.origin &&
      (parsed.pathname === "/api/search" || parsed.pathname === "/api/titles");

    if (!isSearchApi || !parsed) {
      return currentFetch.call(targetWindow, input, init);
    }

    try {
      const response = await currentFetch.call(targetWindow, input, init);
      const ct = response.headers.get("content-type") ?? "";
      if (response.ok && ct.includes("application/json")) {
        return response;
      }
      const fallbackData = await resolveFromLocalStaticCatalog(
        `${parsed.pathname}${parsed.search}`,
      );
      if (fallbackData) {
        return new Response(JSON.stringify(fallbackData), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return response;
    } catch (err) {
      const fallbackData = await resolveFromLocalStaticCatalog(
        `${parsed.pathname}${parsed.search}`,
      );
      if (fallbackData) {
        return new Response(JSON.stringify(fallbackData), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw err;
    }
  };

  Object.defineProperty(bridgedFetch, "__localSearchBridgeInstalled", {
    value: true,
    configurable: true,
  });
  Object.assign(targetWindow, { fetch: bridgedFetch });
  return () => {
    if (targetWindow.fetch === bridgedFetch) {
      Object.assign(targetWindow, { fetch: currentFetch });
    }
  };
}

/**
 * SearchPage(/search)에서 백엔드 `/api/search` 또는 `/api/titles` 요청이 실패할 때
 * 공유 SearchExplorer를 수정하지 않고 로컬 크롤링 풀로 안전하게 응답을 보강한다.
 */
export function useInstallLocalSearchBridge(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    const isJsdom =
      typeof navigator !== "undefined" && /jsdom/iu.test(navigator.userAgent);
    if (isJsdom) return;

    return installLocalSearchBridgeOnWindow(window);
  }, []);
}

/**
 * 백엔드 API 미기동 또는 일시 장애 시 로컬 크롤링 정적 스냅샷(/data/*.json)으로
 * 안전하게 폴백하는 훅. 단위 테스트(jsdom)의 동기 오류 상태 검증은 그대로 보존한다.
 */
export function useLocalCatalogFallback<T>(
  apiUrl: string | null,
  resource: {
    data: T | null;
    loading: boolean;
    error: string | null;
    notFound?: boolean;
    reload: () => void;
  },
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  reload: () => void;
  isLocalFallback: boolean;
} {
  const [fallbackState, setFallbackState] = useState<{
    url: string;
    data: T;
  } | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!apiUrl || resource.data) {
      return;
    }
    const isJsdom =
      typeof navigator !== "undefined" && /jsdom/iu.test(navigator.userAgent);
    const isStaticEnv = import.meta.env.VITE_CATALOG_SOURCE === "static";

    if (isJsdom && (resource.loading || !resource.error)) {
      return;
    }
    if (!isStaticEnv && resource.loading && !resource.error && isJsdom) {
      return;
    }

    let cancelled = false;
    const delayMs = resource.error || isStaticEnv || retryTick > 0 ? 0 : 250;
    const timer = globalThis.setTimeout(() => {
      void resolveFromLocalStaticCatalog<T>(apiUrl)
        .then((resolved) => {
          if (!cancelled && resolved) {
            setFallbackState({ url: apiUrl, data: resolved });
          }
        })
        .catch(() => {
          // 정적 카탈로그 샤드가 없는 테스트 환경에서는 원래 API 오류 상태를 유지한다.
        });
    }, delayMs);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [apiUrl, resource.data, resource.error, resource.loading, retryTick]);

  const reload = useCallback(() => {
    resetLocalCatalogFallbackCache();
    setFallbackState(null);
    setRetryTick((tick) => tick + 1);
    resource.reload();
  }, [resource]);

  const activeFallback =
    apiUrl && fallbackState?.url === apiUrl && !resource.data ? fallbackState.data : null;
  const rawData = resource.data ?? activeFallback;
  const sanitizedData = sanitizeCatalogApiData(apiUrl, rawData);

  return {
    data: sanitizedData,
    loading: activeFallback ? false : resource.loading,
    error: activeFallback ? null : resource.error,
    notFound: activeFallback ? false : Boolean(resource.notFound),
    reload,
    isLocalFallback: Boolean(activeFallback),
  };
}
