import { useCallback, useEffect, useState } from "react";

import {
  readScopedMarketJson,
  scopedMarketStorageKey,
  useMarketStorageOwnerKey,
  writeScopedMarketJson,
} from "./use-market-storage-owner";

export const MARKET_COLLECTIONS_STORAGE_KEY = "toonspectrum:market:collections:v1";
export const MARKET_COLLECTIONS_EVENT = "toonspectrum:market:collections-changed";
const MAX_COLLECTIONS = 16;

export interface MarketWishlistCollection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly resourceIds: readonly string[];
  readonly updatedAt: string;
}

interface MarketCollectionsPayload {
  readonly collections: readonly MarketWishlistCollection[];
  readonly memos: Readonly<Record<string, string>>;
}

const EMPTY_PAYLOAD: MarketCollectionsPayload = {
  collections: [],
  memos: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCollectionsPayload(raw: unknown): MarketCollectionsPayload {
  if (!isRecord(raw)) return EMPTY_PAYLOAD;
  const collections: MarketWishlistCollection[] = [];
  if (Array.isArray(raw.collections)) {
    for (const candidate of raw.collections) {
      if (!isRecord(candidate)) continue;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) continue;
      if (typeof candidate.name !== "string" || !candidate.name.trim()) continue;
      const resourceIds = Array.isArray(candidate.resourceIds)
        ? [...new Set(candidate.resourceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
        : [];
      collections.push({
        id: candidate.id.trim(),
        name: candidate.name.trim().slice(0, 48),
        description: typeof candidate.description === "string"
          ? candidate.description.trim().slice(0, 140)
          : "",
        resourceIds,
        updatedAt: typeof candidate.updatedAt === "string"
          ? candidate.updatedAt
          : new Date().toISOString(),
      });
      if (collections.length >= MAX_COLLECTIONS) break;
    }
  }

  const memos: Record<string, string> = {};
  if (isRecord(raw.memos)) {
    for (const [key, value] of Object.entries(raw.memos)) {
      if (typeof value === "string" && value.trim()) {
        memos[key] = value.trim().slice(0, 240);
      }
    }
  }

  return { collections, memos };
}

export function useMarketCollections() {
  const ownerKey = useMarketStorageOwnerKey();
  const [payload, setPayload] = useState<MarketCollectionsPayload>(() =>
    readScopedMarketJson(
      MARKET_COLLECTIONS_STORAGE_KEY,
      ownerKey,
      parseCollectionsPayload,
      EMPTY_PAYLOAD,
    ),
  );

  useEffect(() => {
    setPayload(
      readScopedMarketJson(
        MARKET_COLLECTIONS_STORAGE_KEY,
        ownerKey,
        parseCollectionsPayload,
        EMPTY_PAYLOAD,
      ),
    );
  }, [ownerKey]);

  useEffect(() => {
    const sync = (event: Event) => {
      if (event.type === "storage") {
        const storageEvent = event as StorageEvent;
        const expected = scopedMarketStorageKey(MARKET_COLLECTIONS_STORAGE_KEY, ownerKey);
        if (storageEvent.key !== null && storageEvent.key !== expected) return;
      }
      setPayload(
        readScopedMarketJson(
          MARKET_COLLECTIONS_STORAGE_KEY,
          ownerKey,
          parseCollectionsPayload,
          EMPTY_PAYLOAD,
        ),
      );
    };
    window.addEventListener(MARKET_COLLECTIONS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MARKET_COLLECTIONS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [ownerKey]);

  const createCollection = useCallback(
    (name: string, description = "", initialResourceIds: readonly string[] = []): MarketWishlistCollection | null => {
      const trimmedName = name.trim().slice(0, 48);
      if (!trimmedName) return null;
      const current = readScopedMarketJson(
        MARKET_COLLECTIONS_STORAGE_KEY,
        ownerKey,
        parseCollectionsPayload,
        EMPTY_PAYLOAD,
      );
      if (current.collections.length >= MAX_COLLECTIONS) return null;
      const collection: MarketWishlistCollection = {
        id: `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        description: description.trim().slice(0, 140),
        resourceIds: [...new Set(initialResourceIds)],
        updatedAt: new Date().toISOString(),
      };
      const next: MarketCollectionsPayload = {
        ...current,
        collections: [collection, ...current.collections],
      };
      if (
        !writeScopedMarketJson(
          MARKET_COLLECTIONS_STORAGE_KEY,
          ownerKey,
          MARKET_COLLECTIONS_EVENT,
          next,
        )
      ) {
        return null;
      }
      setPayload(next);
      return collection;
    },
    [ownerKey],
  );

  const renameCollection = useCallback(
    (collectionId: string, name: string, description?: string): boolean => {
      const trimmedName = name.trim().slice(0, 48);
      if (!trimmedName) return false;
      const current = readScopedMarketJson(
        MARKET_COLLECTIONS_STORAGE_KEY,
        ownerKey,
        parseCollectionsPayload,
        EMPTY_PAYLOAD,
      );
      const next: MarketCollectionsPayload = {
        ...current,
        collections: current.collections.map((item) =>
          item.id === collectionId
            ? {
              ...item,
              name: trimmedName,
              description: description !== undefined
                ? description.trim().slice(0, 140)
                : item.description,
              updatedAt: new Date().toISOString(),
            }
            : item,
        ),
      };
      if (
        !writeScopedMarketJson(
          MARKET_COLLECTIONS_STORAGE_KEY,
          ownerKey,
          MARKET_COLLECTIONS_EVENT,
          next,
        )
      ) {
        return false;
      }
      setPayload(next);
      return true;
    },
    [ownerKey],
  );

  const deleteCollection = useCallback((collectionId: string) => {
    const current = readScopedMarketJson(
      MARKET_COLLECTIONS_STORAGE_KEY,
      ownerKey,
      parseCollectionsPayload,
      EMPTY_PAYLOAD,
    );
    const next: MarketCollectionsPayload = {
      ...current,
      collections: current.collections.filter((item) => item.id !== collectionId),
    };
    if (
      writeScopedMarketJson(
        MARKET_COLLECTIONS_STORAGE_KEY,
        ownerKey,
        MARKET_COLLECTIONS_EVENT,
        next,
      )
    ) {
      setPayload(next);
    }
  }, [ownerKey]);

  const toggleResourceInCollection = useCallback(
    (collectionId: string, resourceId: string): boolean => {
      const current = readScopedMarketJson(
        MARKET_COLLECTIONS_STORAGE_KEY,
        ownerKey,
        parseCollectionsPayload,
        EMPTY_PAYLOAD,
      );
      let added = false;
      const next: MarketCollectionsPayload = {
        ...current,
        collections: current.collections.map((collection) => {
          if (collection.id !== collectionId) return collection;
          const exists = collection.resourceIds.includes(resourceId);
          added = !exists;
          return {
            ...collection,
            resourceIds: exists
              ? collection.resourceIds.filter((id) => id !== resourceId)
              : [resourceId, ...collection.resourceIds],
            updatedAt: new Date().toISOString(),
          };
        }),
      };
      if (
        writeScopedMarketJson(
          MARKET_COLLECTIONS_STORAGE_KEY,
          ownerKey,
          MARKET_COLLECTIONS_EVENT,
          next,
        )
      ) {
        setPayload(next);
      }
      return added;
    },
    [ownerKey],
  );

  const setResourceMemo = useCallback((resourceId: string, rawMemo: string) => {
    const current = readScopedMarketJson(
      MARKET_COLLECTIONS_STORAGE_KEY,
      ownerKey,
      parseCollectionsPayload,
      EMPTY_PAYLOAD,
    );
    const trimmed = rawMemo.trim().slice(0, 240);
    const nextMemos = { ...current.memos };
    if (trimmed) {
      nextMemos[resourceId] = trimmed;
    } else {
      delete nextMemos[resourceId];
    }
    const next: MarketCollectionsPayload = {
      ...current,
      memos: nextMemos,
    };
    if (
      writeScopedMarketJson(
        MARKET_COLLECTIONS_STORAGE_KEY,
        ownerKey,
        MARKET_COLLECTIONS_EVENT,
        next,
      )
    ) {
      setPayload(next);
    }
  }, [ownerKey]);

  return {
    collections: payload.collections,
    memos: payload.memos,
    createCollection,
    renameCollection,
    deleteCollection,
    toggleResourceInCollection,
    setResourceMemo,
  };
}
