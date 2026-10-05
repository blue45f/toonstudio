import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";
import {
  CreatorMarketplaceResourceRecordSchema,
  type CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

export const MARKET_COMPARE_STORAGE_KEY = "toonspectrum:market:compare:v1";
export const MARKET_COMPARE_EVENT = "toonspectrum:market:compare-changed";
export const MARKET_COMPARE_MAX_ITEMS = 4;

/**
 * 소유자별 저장 키. 비교함은 개인 작업 공간이라 계정으로 나눠, 같은
 * 브라우저의 다른 계정에게 이전 계정의 비교 목록이 보이지 않게 한다
 * (찜·학습 기록과 같은 방식). ownerKey가 없으면 레거시 키(기존 호출·
 * 테스트 호환).
 */
export function compareStorageKey(ownerKey?: string): string {
  return ownerKey ? `${MARKET_COMPARE_STORAGE_KEY}:${ownerKey}` : MARKET_COMPARE_STORAGE_KEY;
}

export type MarketCompareToggleResult = "added" | "removed" | "limit";

function normalizeRecords(value: unknown): CreatorMarketplaceResourceRecord[] {
  if (!Array.isArray(value)) return [];

  const ids = new Set<string>();
  const records: CreatorMarketplaceResourceRecord[] = [];
  for (const candidate of value) {
    const parsed = CreatorMarketplaceResourceRecordSchema.safeParse(candidate);
    if (!parsed.success || ids.has(parsed.data.id)) continue;
    ids.add(parsed.data.id);
    records.push(parsed.data);
    if (records.length >= MARKET_COMPARE_MAX_ITEMS) break;
  }
  return records;
}

export function readMarketCompareRecords(
  ownerKey?: string,
): CreatorMarketplaceResourceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const scopedRaw = localStorage.getItem(compareStorageKey(ownerKey));
    if (scopedRaw !== null || !ownerKey || ownerKey === "guest") {
      return scopedRaw ? normalizeRecords(JSON.parse(scopedRaw) as unknown) : [];
    }
    // 스코프 키가 없으면 레거시 기록을 첫 계정이 claim 한다 — 읽은 자리에서
    // 스코프 키로 옮기고 레거시를 지워, 다음 계정이 또 claim 하지 않게 한다.
    // 게스트는 claim 하지 않는다 — 게스트 파티션은 빈 채로 시작한다.
    const legacyRaw = localStorage.getItem(MARKET_COMPARE_STORAGE_KEY);
    if (legacyRaw === null) return [];
    try {
      localStorage.setItem(compareStorageKey(ownerKey), legacyRaw);
      localStorage.removeItem(MARKET_COMPARE_STORAGE_KEY);
    } catch {
      // 이관 쓰기가 실패해도 읽은 값은 그대로 돌려준다.
    }
    return normalizeRecords(JSON.parse(legacyRaw) as unknown);
  } catch {
    return [];
  }
}

function saveMarketCompareRecords(
  records: readonly CreatorMarketplaceResourceRecord[],
  ownerKey?: string,
): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeRecords(records);
  try {
    localStorage.setItem(compareStorageKey(ownerKey), JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(MARKET_COMPARE_EVENT));
  } catch {
    // Browser storage can be unavailable. The current tab still keeps its in-memory state.
  }
}

export function useMarketCompare() {
  // 소유자 스코프: 생성 시점의 계정으로 시작하고, 세션 전환(로그인·로그아웃·
  // 계정 교체)마다 저장 키를 갈아끼운다 — 찜 훅의 세션 바인딩과 같은 계약.
  // 게스트는 "guest" 파티션을 쓴다.
  const [ownerKey, setOwnerKey] = useState(() => getAuthUserId() ?? "guest");
  const [compareItems, setCompareItems] = useState<CreatorMarketplaceResourceRecord[]>(
    () => readMarketCompareRecords(ownerKey),
  );

  useEffect(() => {
    const syncOwner = (session: Session) => {
      setOwnerKey(session?.user.id ?? "guest");
    };
    authListeners.add(syncOwner);
    return () => {
      authListeners.delete(syncOwner);
    };
  }, []);

  // 소유자가 바뀌면 그 파티션을 다시 읽어 화면 상태를 갈아끼운다.
  useEffect(() => {
    setCompareItems(readMarketCompareRecords(ownerKey));
  }, [ownerKey]);

  useEffect(() => {
    const refresh = (event?: Event) => {
      if (
        event instanceof StorageEvent
        && event.key !== null
        && event.key !== compareStorageKey(ownerKey)
      ) {
        return;
      }
      setCompareItems(readMarketCompareRecords(ownerKey));
    };
    window.addEventListener(MARKET_COMPARE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MARKET_COMPARE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [ownerKey]);

  const compareIds = useMemo(
    () => new Set(compareItems.map((record) => record.id)),
    [compareItems],
  );

  const isCompared = useCallback(
    (resourceId: string) => compareIds.has(resourceId),
    [compareIds],
  );

  const toggleCompare = useCallback(
    (record: CreatorMarketplaceResourceRecord): MarketCompareToggleResult => {
      const current = readMarketCompareRecords(ownerKey);
      const existing = current.some((candidate) => candidate.id === record.id);
      if (existing) {
        const next = current.filter((candidate) => candidate.id !== record.id);
        saveMarketCompareRecords(next, ownerKey);
        setCompareItems(next);
        return "removed";
      }

      if (current.length >= MARKET_COMPARE_MAX_ITEMS) return "limit";
      const parsed = CreatorMarketplaceResourceRecordSchema.safeParse(record);
      if (!parsed.success) return "limit";

      const next = [...current, parsed.data];
      saveMarketCompareRecords(next, ownerKey);
      setCompareItems(next);
      return "added";
    },
    [ownerKey],
  );

  const removeCompare = useCallback((resourceId: string): void => {
    const next = readMarketCompareRecords(ownerKey).filter(
      (candidate) => candidate.id !== resourceId,
    );
    saveMarketCompareRecords(next, ownerKey);
    setCompareItems(next);
  }, [ownerKey]);

  const clearCompare = useCallback((): void => {
    saveMarketCompareRecords([], ownerKey);
    setCompareItems([]);
  }, [ownerKey]);

  return {
    compareItems,
    compareCount: compareItems.length,
    isFull: compareItems.length >= MARKET_COMPARE_MAX_ITEMS,
    isCompared,
    toggleCompare,
    removeCompare,
    clearCompare,
  };
}
