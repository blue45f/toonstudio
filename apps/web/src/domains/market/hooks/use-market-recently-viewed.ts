import { useCallback, useEffect, useState } from "react";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import {
  readScopedMarketJson,
  scopedMarketStorageKey,
  useMarketStorageOwnerKey,
  writeScopedMarketJson,
} from "./use-market-storage-owner";

export const MARKET_RECENTLY_VIEWED_STORAGE_KEY = "toonspectrum:market:recently-viewed:v1";
export const MARKET_RECENTLY_VIEWED_EVENT = "toonspectrum:market:recently-viewed-changed";
const MAX_RECENTLY_VIEWED = 16;

export interface MarketRecentlyViewedSnapshot {
  readonly id: string;
  readonly name: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly license: CreatorMarketplaceResourceLicense;
  readonly containsAi: boolean;
  readonly publisher: {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
  };
  readonly manifestByteSize: number;
  readonly entryCount: number;
  readonly resourceVersion: string;
  readonly viewedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSnapshots(raw: unknown): MarketRecentlyViewedSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const snapshots: MarketRecentlyViewedSnapshot[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) continue;
    if (seen.has(item.id)) continue;
    if (typeof item.name !== "string" || typeof item.kind !== "string" || typeof item.license !== "string") {
      continue;
    }
    const pub = isRecord(item.publisher) ? item.publisher : null;
    if (!pub || typeof pub.id !== "string" || typeof pub.name !== "string") continue;
    seen.add(item.id);
    snapshots.push({
      id: item.id,
      name: item.name,
      kind: item.kind as CreatorMarketplaceResourceKind,
      license: item.license as CreatorMarketplaceResourceLicense,
      containsAi: Boolean(item.containsAi),
      publisher: {
        id: pub.id,
        name: pub.name,
        avatar: typeof pub.avatar === "string" ? pub.avatar : null,
      },
      manifestByteSize: typeof item.manifestByteSize === "number" ? item.manifestByteSize : 0,
      entryCount: typeof item.entryCount === "number" ? item.entryCount : 1,
      resourceVersion: typeof item.resourceVersion === "string" ? item.resourceVersion : "1.0.0",
      viewedAt: typeof item.viewedAt === "string" ? item.viewedAt : new Date().toISOString(),
    });
    if (snapshots.length >= MAX_RECENTLY_VIEWED) break;
  }
  return snapshots;
}

export function toRecentlyViewedSnapshot(
  record: CreatorMarketplaceResourceRecord,
  viewedAt = new Date().toISOString(),
): MarketRecentlyViewedSnapshot {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    license: record.license,
    containsAi: record.containsAi,
    publisher: {
      id: record.publisher.id,
      name: record.publisher.name,
      avatar: record.publisher.avatar,
    },
    manifestByteSize: record.manifestByteSize,
    entryCount: record.entries.length,
    resourceVersion: record.resourceVersion,
    viewedAt,
  };
}

export function useMarketRecentlyViewed() {
  const ownerKey = useMarketStorageOwnerKey();
  const [recentlyViewed, setRecentlyViewed] = useState<readonly MarketRecentlyViewedSnapshot[]>(() =>
    readScopedMarketJson(MARKET_RECENTLY_VIEWED_STORAGE_KEY, ownerKey, parseSnapshots, []),
  );

  useEffect(() => {
    setRecentlyViewed(
      readScopedMarketJson(MARKET_RECENTLY_VIEWED_STORAGE_KEY, ownerKey, parseSnapshots, []),
    );
  }, [ownerKey]);

  useEffect(() => {
    const sync = (event: Event) => {
      if (event.type === "storage") {
        const storageEvent = event as StorageEvent;
        const expected = scopedMarketStorageKey(MARKET_RECENTLY_VIEWED_STORAGE_KEY, ownerKey);
        if (storageEvent.key !== null && storageEvent.key !== expected) return;
      }
      setRecentlyViewed(
        readScopedMarketJson(MARKET_RECENTLY_VIEWED_STORAGE_KEY, ownerKey, parseSnapshots, []),
      );
    };
    window.addEventListener(MARKET_RECENTLY_VIEWED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MARKET_RECENTLY_VIEWED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [ownerKey]);

  const recordRecentlyViewed = useCallback((record: CreatorMarketplaceResourceRecord) => {
    const current = readScopedMarketJson(
      MARKET_RECENTLY_VIEWED_STORAGE_KEY,
      ownerKey,
      parseSnapshots,
      [],
    );
    const snapshot = toRecentlyViewedSnapshot(record);
    const next = [
      snapshot,
      ...current.filter((item) => item.id !== record.id),
    ].slice(0, MAX_RECENTLY_VIEWED);
    if (
      writeScopedMarketJson(
        MARKET_RECENTLY_VIEWED_STORAGE_KEY,
        ownerKey,
        MARKET_RECENTLY_VIEWED_EVENT,
        next,
      )
    ) {
      setRecentlyViewed(next);
    }
  }, [ownerKey]);

  const removeRecentlyViewed = useCallback((id: string) => {
    const current = readScopedMarketJson(
      MARKET_RECENTLY_VIEWED_STORAGE_KEY,
      ownerKey,
      parseSnapshots,
      [],
    );
    const next = current.filter((item) => item.id !== id);
    if (
      writeScopedMarketJson(
        MARKET_RECENTLY_VIEWED_STORAGE_KEY,
        ownerKey,
        MARKET_RECENTLY_VIEWED_EVENT,
        next,
      )
    ) {
      setRecentlyViewed(next);
    }
  }, [ownerKey]);

  const clearRecentlyViewed = useCallback(() => {
    if (
      writeScopedMarketJson(
        MARKET_RECENTLY_VIEWED_STORAGE_KEY,
        ownerKey,
        MARKET_RECENTLY_VIEWED_EVENT,
        [],
      )
    ) {
      setRecentlyViewed([]);
    }
  }, [ownerKey]);

  return {
    recentlyViewed,
    recordRecentlyViewed,
    removeRecentlyViewed,
    clearRecentlyViewed,
  };
}
