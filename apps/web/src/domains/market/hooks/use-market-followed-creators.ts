import { useCallback, useEffect, useState } from "react";

import {
  readScopedMarketJson,
  scopedMarketStorageKey,
  useMarketStorageOwnerKey,
  writeScopedMarketJson,
} from "./use-market-storage-owner";

export const MARKET_FOLLOWED_CREATORS_STORAGE_KEY = "toonspectrum:market:followed-creators:v1";
export const MARKET_FOLLOWED_CREATORS_EVENT = "toonspectrum:market:followed-creators-changed";
const MAX_FOLLOWED_CREATORS = 64;

export interface MarketFollowedCreator {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly followedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFollowedCreators(raw: unknown): MarketFollowedCreator[] {
  if (!Array.isArray(raw)) return [];
  const list: MarketFollowedCreator[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) continue;
    const normalizedId = item.id.trim().toLowerCase();
    if (seen.has(normalizedId)) continue;
    if (typeof item.name !== "string" || !item.name.trim()) continue;
    seen.add(normalizedId);
    list.push({
      id: normalizedId,
      name: item.name.trim(),
      avatar: typeof item.avatar === "string" ? item.avatar : null,
      followedAt: typeof item.followedAt === "string"
        ? item.followedAt
        : new Date().toISOString(),
    });
    if (list.length >= MAX_FOLLOWED_CREATORS) break;
  }
  return list;
}

export function useMarketFollowedCreators() {
  const ownerKey = useMarketStorageOwnerKey();
  const [followedCreators, setFollowedCreators] = useState<readonly MarketFollowedCreator[]>(() =>
    readScopedMarketJson(
      MARKET_FOLLOWED_CREATORS_STORAGE_KEY,
      ownerKey,
      parseFollowedCreators,
      [],
    ),
  );

  useEffect(() => {
    setFollowedCreators(
      readScopedMarketJson(
        MARKET_FOLLOWED_CREATORS_STORAGE_KEY,
        ownerKey,
        parseFollowedCreators,
        [],
      ),
    );
  }, [ownerKey]);

  useEffect(() => {
    const sync = (event: Event) => {
      if (event.type === "storage") {
        const storageEvent = event as StorageEvent;
        const expected = scopedMarketStorageKey(MARKET_FOLLOWED_CREATORS_STORAGE_KEY, ownerKey);
        if (storageEvent.key !== null && storageEvent.key !== expected) return;
      }
      setFollowedCreators(
        readScopedMarketJson(
          MARKET_FOLLOWED_CREATORS_STORAGE_KEY,
          ownerKey,
          parseFollowedCreators,
          [],
        ),
      );
    };
    window.addEventListener(MARKET_FOLLOWED_CREATORS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MARKET_FOLLOWED_CREATORS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [ownerKey]);

  const isFollowingCreator = useCallback(
    (publisherId: string) => {
      const normalized = publisherId.trim().toLowerCase();
      return followedCreators.some((creator) => creator.id === normalized);
    },
    [followedCreators],
  );

  const toggleFollowCreator = useCallback(
    (publisher: { id: string; name: string; avatar: string | null }): boolean => {
      const normalizedId = publisher.id.trim().toLowerCase();
      if (!normalizedId) return false;
      const current = readScopedMarketJson(
        MARKET_FOLLOWED_CREATORS_STORAGE_KEY,
        ownerKey,
        parseFollowedCreators,
        [],
      );
      const exists = current.some((creator) => creator.id === normalizedId);
      const next = exists
        ? current.filter((creator) => creator.id !== normalizedId)
        : [
          {
            id: normalizedId,
            name: publisher.name.trim() || normalizedId,
            avatar: publisher.avatar,
            followedAt: new Date().toISOString(),
          },
          ...current,
        ].slice(0, MAX_FOLLOWED_CREATORS);

      if (
        !writeScopedMarketJson(
          MARKET_FOLLOWED_CREATORS_STORAGE_KEY,
          ownerKey,
          MARKET_FOLLOWED_CREATORS_EVENT,
          next,
        )
      ) {
        return exists;
      }
      setFollowedCreators(next);
      return !exists;
    },
    [ownerKey],
  );

  return {
    followedCreators,
    followedCount: followedCreators.length,
    isFollowingCreator,
    toggleFollowCreator,
  };
}
