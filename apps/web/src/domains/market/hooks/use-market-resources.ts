import { useCallback, useEffect, useRef, useState } from "react";

import {
  authoritativeMarketCacheKey,
} from "../models/market-authority";
import {
  readCachedMarketPage,
  writeCachedMarketPage,
} from "../models/market-resource-cache";
import { listCreatorMarketplaceResources } from "../remotes/market-resource-remote";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceRecord,
  CreatorMarketplaceResourceSort,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { useT } from "@/shared/lib/i18n";

export interface MarketResourceQuery {
  readonly search?: string;
  readonly kind?: CreatorMarketplaceResourceKind;
  readonly license?: CreatorMarketplaceResourceLicense;
  readonly tag?: string;
  readonly publisher?: string;
  readonly sort: CreatorMarketplaceResourceSort;
  readonly limit: number;
}

export interface MarketResourcesPage {
  readonly items: readonly CreatorMarketplaceResourceRecord[];
  /** 첫 페이지 로딩. 커서 "더 보기" 로딩은 loadingMore로 구분한다. */
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  readonly loadMoreError: string | null;
  readonly hasMore: boolean;
  /** 네트워크 실패로 저장된 서버 목록을 보여주는 저하 상태. */
  readonly stale: boolean;
  readonly staleSavedAt: string | null;
  readonly loadMore: () => void;
  readonly reload: () => void;
}

/**
 * 첫 페이지 자동 재시도 백오프. 공개 목록은 서버 절전 해제(cold start) 구간에 첫 방문자가
 * 걸리기 쉬워, 캐시가 없을 때만 짧게 쉬고 다시 읽는다. 캐시가 있으면 stale 표시가 우선이라
 * 재시도하지 않는다. 타입드 읽기 자체의 시도 예산과는 별개다.
 */
const MARKET_AUTO_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000];

function remoteQuery(
  query: MarketResourceQuery,
  cursor?: string,
) {
  return {
    limit: query.limit,
    search: query.search,
    kind: query.kind,
    license: query.license,
    tag: query.tag,
    publisher: query.publisher,
    sort: query.sort,
    cursor,
  };
}

/**
 * Server catalog authority wrapper.
 *
 * Public results come only from the server or a cache written by a previous successful server
 * response. Local authoring drafts and bundled starter fixtures are intentionally excluded.
 */
export function useMarketResources(query: MarketResourceQuery | null): MarketResourcesPage {
  const t = useT();
  const [items, setItems] = useState<readonly CreatorMarketplaceResourceRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(query));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [stale, setStale] = useState(false);
  const [staleSavedAt, setStaleSavedAt] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const activeQueryRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const serializedQuery = query ? JSON.stringify(query) : null;
  const cacheKey = serializedQuery
    ? authoritativeMarketCacheKey(serializedQuery)
    : null;

  useEffect(() => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    activeQueryRef.current = serializedQuery;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    loadingMoreRef.current = false;

    if (!serializedQuery || !cacheKey) {
      cursorRef.current = null;
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
      setHasMore(false);
      setStale(false);
      setStaleSavedAt(null);
      return;
    }

    const parsedQuery = JSON.parse(serializedQuery) as MarketResourceQuery;
    const controller = new AbortController();
    cursorRef.current = null;
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setHasMore(false);
    setStale(false);
    setStaleSavedAt(null);

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attempt = (attemptIndex: number) => {
      listCreatorMarketplaceResources(remoteQuery(parsedQuery), controller.signal)
        .then((page) => {
          if (controller.signal.aborted || requestGenerationRef.current !== generation) return;
          const nextCursor = page.hasMore ? page.nextCursor : null;
          const pageHasMore = nextCursor !== null;
          setItems(page.items);
          cursorRef.current = nextCursor;
          setHasMore(pageHasMore);
          setLoading(false);
          writeCachedMarketPage(cacheKey, {
            items: page.items,
            hasMore: pageHasMore,
            nextCursor,
          });
        })
        .catch(() => {
          if (controller.signal.aborted || requestGenerationRef.current !== generation) return;
          const cached = readCachedMarketPage(cacheKey);
          if (cached) {
            setItems(cached.items);
            // A cached first page must never be combined with a newly fetched tail.
            setHasMore(false);
            cursorRef.current = null;
            setStale(true);
            setStaleSavedAt(cached.savedAt);
            setLoading(false);
            return;
          }
          // 캐시가 없는 첫 방문 실패는 곧바로 에러로 닫지 않는다. 재시도 동안 loading을
          // 유지해 스켈레톤이 에러 패널로 바뀌지 않게 하고, 백오프를 소진한 뒤에만 알린다.
          const retryDelay = MARKET_AUTO_RETRY_DELAYS_MS[attemptIndex];
          if (retryDelay !== undefined) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (controller.signal.aborted || requestGenerationRef.current !== generation) return;
              attempt(attemptIndex + 1);
            }, retryDelay);
            return;
          }
          setError(t("market.resources.loadFailed", "공개 마켓을 불러올 수 없어요. 잠시 후 다시 시도해 주세요."));
          setLoading(false);
        });
    };
    attempt(0);

    return () => {
      if (retryTimer !== null) clearTimeout(retryTimer);
      controller.abort();
      loadMoreControllerRef.current?.abort();
      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
        activeQueryRef.current = null;
        loadMoreControllerRef.current = null;
        loadingMoreRef.current = false;
      }
    };
  }, [cacheKey, refreshToken, serializedQuery, t]);

  const loadMore = useCallback(() => {
    if (
      !serializedQuery
      || !cacheKey
      || activeQueryRef.current !== serializedQuery
      || loadingMoreRef.current
      || !cursorRef.current
    ) return;

    const parsedQuery = JSON.parse(serializedQuery) as MarketResourceQuery;
    const cursor = cursorRef.current;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    listCreatorMarketplaceResources(
      remoteQuery(parsedQuery, cursor),
      controller.signal,
    )
      .then((page) => {
        if (
          controller.signal.aborted
          || requestGenerationRef.current !== generation
          || activeQueryRef.current !== serializedQuery
        ) return;

        const nextCursor = page.hasMore ? page.nextCursor : null;
        const pageHasMore = nextCursor !== null;
        setItems((previous) => {
          if (
            requestGenerationRef.current !== generation
            || activeQueryRef.current !== serializedQuery
          ) return previous;
          const seen = new Set(previous.map((record) => record.id));
          const merged = [
            ...previous,
            ...page.items.filter((record) => !seen.has(record.id)),
          ];
          writeCachedMarketPage(cacheKey, {
            items: merged,
            hasMore: pageHasMore,
            nextCursor,
          });
          return merged;
        });
        cursorRef.current = nextCursor;
        setHasMore(pageHasMore);
      })
      .catch(() => {
        if (
          controller.signal.aborted
          || requestGenerationRef.current !== generation
          || activeQueryRef.current !== serializedQuery
        ) return;
        setLoadMoreError(t("market.resources.loadMoreFailed", "추가 리소스를 불러오지 못했어요."));
      })
      .finally(() => {
        if (
          requestGenerationRef.current !== generation
          || activeQueryRef.current !== serializedQuery
          || loadMoreControllerRef.current !== controller
        ) return;
        loadMoreControllerRef.current = null;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [cacheKey, serializedQuery, t]);

  const reload = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    stale,
    staleSavedAt,
    loadMore,
    reload,
  };
}
