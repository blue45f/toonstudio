import { useEffect, useState } from "react";

import type { DiscoverHomeSnapshot } from "./discover-home";
import type { Title } from "@/shared/lib/types";

const STATIC_DIRECT_FILES: Record<string, string> = {
  "/api/home": "/data/home.json",
  "/api/calendar": "/data/calendar.json",
  "/api/insights": "/data/insights.json",
  "/api/tags": "/data/tags.json",
  "/api/authors": "/data/authors.json",
};

function normalizeSearchToken(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

/**
 * 로컬 크롤링 카탈로그 스냅샷(Title 배열)에서 외부 API 호출 없이
 * 제목·이명·작가·그림작가·장르·태그·시놉시스를 즉시 필터링한다.
 */
export function filterTitlesByLocalQuery<T extends Pick<Title, "title" | "author" | "genres" | "tags"> & Partial<Pick<Title, "altTitles" | "artist" | "synopsis">>>(
  titles: readonly T[],
  rawQuery: string,
): T[] {
  const normalized = normalizeSearchToken(rawQuery);
  if (!normalized) return [...titles];
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return [...titles];

  return titles.filter((item) => {
    const haystack = [
      item.title,
      ...(item.altTitles ?? []),
      item.author,
      item.artist ?? "",
      ...(item.genres ?? []),
      ...(item.tags ?? []),
      item.synopsis ?? "",
    ]
      .join(" ")
      .normalize("NFC")
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

export interface DiscoverLocalMatchResult {
  readonly titles: Title[];
  readonly genres: string[];
  readonly tags: string[];
}

/**
 * 탐색 허브(/discover)에 이미 로드된 로컬 크롤링 스냅샷(/data/home.json)에서
 * 입력 검색어와 일치하는 작품·장르·태그를 외부 API 없이 즉시 추출한다.
 */
export function collectDiscoverLocalMatches(
  snapshot: DiscoverHomeSnapshot | null | undefined,
  rawQuery: string,
  limit = 6,
): DiscoverLocalMatchResult {
  const normalized = normalizeSearchToken(rawQuery);
  if (!snapshot || !normalized) {
    return { titles: [], genres: [], tags: [] };
  }

  const pool: Title[] = [];
  const seenIds = new Set<string>();
  const pushUnique = (items: readonly Title[] | undefined) => {
    if (!items) return;
    for (const item of items) {
      if (!item?.id || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      pool.push(item);
    }
  };

  if (snapshot.spotlight) pushUnique([snapshot.spotlight]);
  pushUnique(snapshot.featured);
  pushUnique(snapshot.todayReleases);
  pushUnique(snapshot.topRated);
  pushUnique(snapshot.waitFree);
  pushUnique(snapshot.newest);

  const matchedTitles = filterTitlesByLocalQuery(pool, normalized).slice(0, limit);
  const matchedGenres = (snapshot.genres ?? [])
    .filter((genre) => normalizeSearchToken(genre).includes(normalized))
    .slice(0, 6);
  const snapshotWithTags = snapshot as DiscoverHomeSnapshot & {
    readonly tags?: readonly { readonly tag: string }[];
  };
  const tagCandidates = new Set<string>();
  for (const entry of snapshotWithTags.tags ?? []) {
    if (entry?.tag) tagCandidates.add(entry.tag);
  }
  for (const item of pool) {
    for (const tag of item.tags ?? []) {
      if (tag) tagCandidates.add(tag);
    }
  }
  const matchedTags = [...tagCandidates]
    .filter((tag) => normalizeSearchToken(tag).includes(normalized))
    .slice(0, 6);

  return {
    titles: matchedTitles,
    genres: matchedGenres,
    tags: matchedTags,
  };
}

let cachedLocalPoolPromise: Promise<{
  readonly titles: Title[];
  readonly tags: { readonly tag: string; readonly count: number }[];
}> | null = null;

async function loadLightweightLocalPool(): Promise<{
  readonly titles: Title[];
  readonly tags: { readonly tag: string; readonly count: number }[];
}> {
  if (!cachedLocalPoolPromise) {
    cachedLocalPoolPromise = (async () => {
      const fetchJson = async <R>(url: string): Promise<R | null> => {
        try {
          const res = await globalThis.fetch(url, { cache: "default" });
          const ct = res.headers.get("content-type") ?? "";
          if (!res.ok || !ct.includes("application/json")) return null;
          return (await res.json()) as R;
        } catch {
          return null;
        }
      };

      const [homeSnap, firstShard, tagsSnap] = await Promise.all([
        fetchJson<DiscoverHomeSnapshot>("/data/home.json"),
        fetchJson<Title[]>("/data/catalog/00.json"),
        fetchJson<{ readonly tags?: { readonly tag: string; readonly count: number }[] }>("/data/tags.json"),
      ]);

      const pool: Title[] = [];
      const seen = new Set<string>();
      const pushList = (items: readonly Title[] | undefined) => {
        if (!items) return;
        for (const item of items) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          pool.push(item);
        }
      };

      if (homeSnap) {
        if (homeSnap.spotlight) pushList([homeSnap.spotlight]);
        pushList(homeSnap.featured);
        pushList(homeSnap.todayReleases);
        pushList(homeSnap.topRated);
        pushList(homeSnap.waitFree);
        pushList(homeSnap.newest);
      }
      if (Array.isArray(firstShard)) {
        pushList(firstShard);
      }

      return {
        titles: pool,
        tags: tagsSnap?.tags?.slice(0, 18) ?? [],
      };
    })();
  }
  return cachedLocalPoolPromise;
}

async function resolveFromLocalStaticCatalog<T>(apiUrl: string): Promise<T | null> {
  if (typeof window === "undefined" || typeof globalThis.fetch !== "function") {
    return null;
  }

  const parsed = new URL(apiUrl, window.location.origin);
  const { pathname, searchParams } = parsed;

  if (STATIC_DIRECT_FILES[pathname] && [...searchParams.keys()].length === 0) {
    const response = await globalThis.fetch(STATIC_DIRECT_FILES[pathname], {
      cache: "default",
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) return null;
    return (await response.json()) as T;
  }

  if (pathname === "/api/explore") {
    const [{ titles, tags }, { normalizeExploreParams, EXPLORE_PAGE_SIZE }, { searchTitles }, { GENRES }] =
      await Promise.all([
        loadLightweightLocalPool(),
        import("@/shared/lib/server/explore"),
        import("@/shared/lib/search"),
        import("@/shared/lib/taxonomy"),
      ]);
    if (titles.length === 0) return null;

    const sp: Record<string, string | undefined> = {};
    for (const [key, value] of searchParams.entries()) {
      sp[key] = value;
    }
    const filters = normalizeExploreParams(sp);
    const matched = searchTitles(
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
    const showCount = Math.min(
      Math.max(Number(sp.show) || EXPLORE_PAGE_SIZE, EXPLORE_PAGE_SIZE),
      Math.max(matched.length, EXPLORE_PAGE_SIZE),
    );
    const cappedResults = matched.slice(0, Math.max(showCount + EXPLORE_PAGE_SIZE * 2, 240));
    const shown = cappedResults.slice(0, showCount);

    return {
      filters,
      current: {
        genre: filters.genre,
        tag: filters.tag,
        type: filters.type,
        sort: sp.sort ? filters.sort : undefined,
      },
      results: cappedResults,
      shown,
      hasMore: cappedResults.length > shown.length,
      showCount,
      pageSize: EXPLORE_PAGE_SIZE,
      tags,
      genres: GENRES,
      generatedAt: new Date().toISOString(),
      source: "local-static-fallback",
    } as unknown as T;
  }

  if (pathname === "/api/titles") {
    const { titles } = await loadLightweightLocalPool();
    if (titles.length === 0) return null;
    const idsRaw = searchParams.get("ids") ?? "";
    const ids = idsRaw.split(",").map((id) => id.trim()).filter(Boolean);
    const items = ids.length > 0 ? titles.filter((item) => ids.includes(item.id)) : titles.slice(0, 40);
    return { items, total: items.length } as unknown as T;
  }

  if (pathname.startsWith("/api/authors/")) {
    const authorName = decodeURIComponent(pathname.slice("/api/authors/".length));
    const { titles } = await loadLightweightLocalPool();
    const works = titles.filter((item) => item.author === authorName || item.artist === authorName);
    if (works.length > 0) {
      const genres = [...new Set(works.flatMap((w) => w.genres ?? []))].slice(0, 6);
      const tags = [...new Set(works.flatMap((w) => w.tags ?? []))].slice(0, 10);
      const platforms = [...new Set(works.flatMap((w) => (w.availability ?? []).map((a) => a.platform)))];
      const totalViews = works.reduce((sum, w) => sum + (w.stats?.views ?? 0), 0);
      const totalLikes = works.reduce((sum, w) => sum + (w.stats?.likes ?? 0), 0);
      const avgRating =
        works.reduce((sum, w) => sum + (w.stats?.ratingAvg ?? 0), 0) / Math.max(1, works.length);
      return {
        author: {
          name: authorName,
          workCount: works.length,
          totalViews,
          totalLikes,
          avgRating,
          genres,
          tags,
          platforms,
          yearRange: [
            Math.min(...works.map((w) => w.releaseYear)),
            Math.max(...works.map((w) => w.releaseYear)),
          ],
          ongoingCount: works.filter((w) => w.status === "ongoing").length,
          completedCount: works.filter((w) => w.status === "completed").length,
        },
        works,
        similarAuthors: [],
      } as unknown as T;
    }
  }

  const engine = await import("@/shared/catalog/catalog-static-engine");
  const response = await engine.handleStaticCatalogRequest(
    pathname,
    searchParams,
    undefined,
    globalThis.fetch.bind(window),
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) return null;
  return (await response.json()) as T;
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
    const delayMs = resource.error || isStaticEnv ? 0 : 250;
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
  }, [apiUrl, resource.data, resource.error, resource.loading]);

  const activeFallback =
    apiUrl && fallbackState?.url === apiUrl && !resource.data ? fallbackState.data : null;

  return {
    data: resource.data ?? activeFallback,
    loading: activeFallback ? false : resource.loading,
    error: activeFallback ? null : resource.error,
    notFound: activeFallback ? false : Boolean(resource.notFound),
    reload: resource.reload,
    isLocalFallback: Boolean(activeFallback),
  };
}
