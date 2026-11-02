import { useCallback, useEffect, useState } from "react";

import type { MarketBrowseQueryValues } from "../models/market-query";
import {
  readScopedMarketJson,
  scopedMarketStorageKey,
  useMarketStorageOwnerKey,
  writeScopedMarketJson,
} from "./use-market-storage-owner";

export const MARKET_SEARCH_HISTORY_STORAGE_KEY = "toonspectrum:market:search-history:v1";
export const MARKET_SEARCH_HISTORY_EVENT = "toonspectrum:market:search-history-changed";
const MAX_RECENT_SEARCHES = 10;
const MAX_SAVED_PRESETS = 8;

export interface MarketSavedFilterPreset {
  readonly id: string;
  readonly name: string;
  readonly query: MarketBrowseQueryValues;
  readonly savedAt: string;
}

interface SearchHistoryPayload {
  readonly recentSearches: readonly string[];
  readonly savedPresets: readonly MarketSavedFilterPreset[];
}

const EMPTY_PAYLOAD: SearchHistoryPayload = {
  recentSearches: [],
  savedPresets: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSearchHistoryPayload(raw: unknown): SearchHistoryPayload {
  if (!isRecord(raw)) return EMPTY_PAYLOAD;
  const recentSearches = Array.isArray(raw.recentSearches)
    ? [...new Set(
      raw.recentSearches
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item.length <= 80),
    )].slice(0, MAX_RECENT_SEARCHES)
    : [];

  const savedPresets: MarketSavedFilterPreset[] = [];
  if (Array.isArray(raw.savedPresets)) {
    for (const candidate of raw.savedPresets) {
      if (!isRecord(candidate)) continue;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) continue;
      if (typeof candidate.name !== "string" || !candidate.name.trim()) continue;
      if (!isRecord(candidate.query)) continue;
      savedPresets.push({
        id: candidate.id.trim(),
        name: candidate.name.trim().slice(0, 48),
        query: candidate.query as MarketBrowseQueryValues,
        savedAt: typeof candidate.savedAt === "string"
          ? candidate.savedAt
          : new Date().toISOString(),
      });
      if (savedPresets.length >= MAX_SAVED_PRESETS) break;
    }
  }

  return { recentSearches, savedPresets };
}

export function buildMarketQuerySearchParams(values: MarketBrowseQueryValues): URLSearchParams {
  const params = new URLSearchParams();
  if (values.search) params.set("q", values.search);
  if (values.kind) params.set("kind", values.kind);
  if (values.license) params.set("license", values.license);
  if (values.tag) params.set("tag", values.tag);
  if (values.publisher) params.set("publisher", values.publisher);
  if (values.containsAi !== undefined) params.set("containsAi", String(values.containsAi));
  if (values.engine) params.set("engine", values.engine);
  if (values.commercial !== undefined) params.set("commercial", String(values.commercial));
  if (values.origin) params.set("origin", values.origin);
  if (values.sort) params.set("sort", values.sort);
  return params;
}

export function useMarketSearchHistory() {
  const ownerKey = useMarketStorageOwnerKey();
  const [payload, setPayload] = useState<SearchHistoryPayload>(() =>
    readScopedMarketJson(
      MARKET_SEARCH_HISTORY_STORAGE_KEY,
      ownerKey,
      parseSearchHistoryPayload,
      EMPTY_PAYLOAD,
    ),
  );

  useEffect(() => {
    setPayload(
      readScopedMarketJson(
        MARKET_SEARCH_HISTORY_STORAGE_KEY,
        ownerKey,
        parseSearchHistoryPayload,
        EMPTY_PAYLOAD,
      ),
    );
  }, [ownerKey]);

  useEffect(() => {
    const sync = (event: Event) => {
      if (event.type === "storage") {
        const storageEvent = event as StorageEvent;
        const expected = scopedMarketStorageKey(MARKET_SEARCH_HISTORY_STORAGE_KEY, ownerKey);
        if (storageEvent.key !== null && storageEvent.key !== expected) return;
      }
      setPayload(
        readScopedMarketJson(
          MARKET_SEARCH_HISTORY_STORAGE_KEY,
          ownerKey,
          parseSearchHistoryPayload,
          EMPTY_PAYLOAD,
        ),
      );
    };
    window.addEventListener(MARKET_SEARCH_HISTORY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MARKET_SEARCH_HISTORY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [ownerKey]);

  const recordRecentSearch = useCallback((rawTerm: string) => {
    const term = rawTerm.trim();
    if (!term || term.length > 80) return;
    const current = readScopedMarketJson(
      MARKET_SEARCH_HISTORY_STORAGE_KEY,
      ownerKey,
      parseSearchHistoryPayload,
      EMPTY_PAYLOAD,
    );
    const nextRecent = [
      term,
      ...current.recentSearches.filter((existing) => existing !== term),
    ].slice(0, MAX_RECENT_SEARCHES);
    const next: SearchHistoryPayload = {
      ...current,
      recentSearches: nextRecent,
    };
    if (
      writeScopedMarketJson(
        MARKET_SEARCH_HISTORY_STORAGE_KEY,
        ownerKey,
        MARKET_SEARCH_HISTORY_EVENT,
        next,
      )
    ) {
      setPayload(next);
    }
  }, [ownerKey]);

  const removeRecentSearch = useCallback((term: string) => {
    const current = readScopedMarketJson(
      MARKET_SEARCH_HISTORY_STORAGE_KEY,
      ownerKey,
      parseSearchHistoryPayload,
      EMPTY_PAYLOAD,
    );
    const next: SearchHistoryPayload = {
      ...current,
      recentSearches: current.recentSearches.filter((item) => item !== term),
    };
    if (
      writeScopedMarketJson(
        MARKET_SEARCH_HISTORY_STORAGE_KEY,
        ownerKey,
        MARKET_SEARCH_HISTORY_EVENT,
        next,
      )
    ) {
      setPayload(next);
    }
  }, [ownerKey]);

  const clearRecentSearches = useCallback(() => {
    const current = readScopedMarketJson(
      MARKET_SEARCH_HISTORY_STORAGE_KEY,
      ownerKey,
      parseSearchHistoryPayload,
      EMPTY_PAYLOAD,
    );
    const next: SearchHistoryPayload = { ...current, recentSearches: [] };
    if (
      writeScopedMarketJson(
        MARKET_SEARCH_HISTORY_STORAGE_KEY,
        ownerKey,
        MARKET_SEARCH_HISTORY_EVENT,
        next,
      )
    ) {
      setPayload(next);
    }
  }, [ownerKey]);

  const saveFilterPreset = useCallback((name: string, query: MarketBrowseQueryValues): boolean => {
    const trimmedName = name.trim().slice(0, 48);
    if (!trimmedName) return false;
    const current = readScopedMarketJson(
      MARKET_SEARCH_HISTORY_STORAGE_KEY,
      ownerKey,
      parseSearchHistoryPayload,
      EMPTY_PAYLOAD,
    );
    const preset: MarketSavedFilterPreset = {
      id: `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedName,
      query,
      savedAt: new Date().toISOString(),
    };
    const next: SearchHistoryPayload = {
      ...current,
      savedPresets: [
        preset,
        ...current.savedPresets.filter((item) => item.name !== trimmedName),
      ].slice(0, MAX_SAVED_PRESETS),
    };
    if (
      !writeScopedMarketJson(
        MARKET_SEARCH_HISTORY_STORAGE_KEY,
        ownerKey,
        MARKET_SEARCH_HISTORY_EVENT,
        next,
      )
    ) {
      return false;
    }
    setPayload(next);
    return true;
  }, [ownerKey]);

  const removeFilterPreset = useCallback((presetId: string) => {
    const current = readScopedMarketJson(
      MARKET_SEARCH_HISTORY_STORAGE_KEY,
      ownerKey,
      parseSearchHistoryPayload,
      EMPTY_PAYLOAD,
    );
    const next: SearchHistoryPayload = {
      ...current,
      savedPresets: current.savedPresets.filter((item) => item.id !== presetId),
    };
    if (
      writeScopedMarketJson(
        MARKET_SEARCH_HISTORY_STORAGE_KEY,
        ownerKey,
        MARKET_SEARCH_HISTORY_EVENT,
        next,
      )
    ) {
      setPayload(next);
    }
  }, [ownerKey]);

  return {
    recentSearches: payload.recentSearches,
    savedPresets: payload.savedPresets,
    recordRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    saveFilterPreset,
    removeFilterPreset,
  };
}
