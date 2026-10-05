import { useCallback, useEffect, useState } from "react";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import { findMergedMarketResourceById } from "../models/market-custom-registry";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

export const MARKET_WISHLIST_STORAGE_KEY = "toonspectrum:market:wishlist";
export const MARKET_WISHLIST_EVENT = "toonspectrum:market:wishlist-changed";

/**
 * 소유자별 저장 키. 찜 목록은 개인 기록이라 계정으로 나눠, 같은 브라우저의
 * 다른 계정에게 이전 계정의 찜이 보이지 않게 한다(학습 기록과 같은 방식).
 * ownerKey가 없으면 레거시 키(기존 호출·테스트 호환).
 */
export function wishlistStorageKey(ownerKey?: string): string {
  return ownerKey ? `${MARKET_WISHLIST_STORAGE_KEY}:${ownerKey}` : MARKET_WISHLIST_STORAGE_KEY;
}

function storageFailureMessage(): string {
  return translateCurrentStaticSourceText("domains.market.wishlist", "ko", "찜 목록을 브라우저에 저장하지 못했어요. 저장 공간·사이트 권한을 확인한 뒤 다시 시도해 주세요.");
}

function parseWishlistIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.filter((id): id is string =>
        typeof id === "string" && id.trim().length > 0,
      ))];
    }
  } catch {
    // quota
  }
  return [];
}

function getStoredWishlistIds(ownerKey?: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const scopedRaw = localStorage.getItem(wishlistStorageKey(ownerKey));
    if (scopedRaw !== null || !ownerKey || ownerKey === "guest") {
      return parseWishlistIds(scopedRaw);
    }
    // 스코프 키가 없으면 레거시 기록을 첫 계정이 claim 한다 — 읽은 자리에서
    // 스코프 키로 옮기고 레거시를 지워, 다음 계정이 또 claim 하지 않게 한다.
    // 게스트는 claim 하지 않는다 — 게스트 파티션은 빈 채로 시작한다.
    const legacyRaw = localStorage.getItem(MARKET_WISHLIST_STORAGE_KEY);
    if (legacyRaw === null) return [];
    try {
      localStorage.setItem(wishlistStorageKey(ownerKey), legacyRaw);
      localStorage.removeItem(MARKET_WISHLIST_STORAGE_KEY);
    } catch {
      // 이관 쓰기가 실패해도 읽은 값은 그대로 돌려준다.
    }
    return parseWishlistIds(legacyRaw);
  } catch {
    return [];
  }
}

function saveWishlistIds(ids: string[], ownerKey?: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(wishlistStorageKey(ownerKey), JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(MARKET_WISHLIST_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useMarketWishlist() {
  const [storageError, setStorageError] = useState<string | null>(null);
  // 소유자 스코프: 생성 시점의 계정으로 시작하고, 세션 전환(로그인·로그아웃·
  // 계정 교체)마다 저장 키를 갈아끼운다 — 학습 실습 훅의 세션 바인딩과
  // 같은 계약. 게스트는 "guest" 파티션을 쓴다.
  const [ownerKey, setOwnerKey] = useState(() => getAuthUserId() ?? "guest");
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => getStoredWishlistIds(ownerKey));

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
    setWishlistIds(getStoredWishlistIds(ownerKey));
    setStorageError(null);
  }, [ownerKey]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      // 다른 탭의 변경은 활성 소유자 키(또는 전체 삭제)일 때만 반영한다.
      if (event.type === "storage") {
        const storageEvent = event as StorageEvent;
        if (storageEvent.key !== null && storageEvent.key !== wishlistStorageKey(ownerKey)) return;
      }
      setWishlistIds(getStoredWishlistIds(ownerKey));
    };
    window.addEventListener(MARKET_WISHLIST_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(MARKET_WISHLIST_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [ownerKey]);

  const isWishlisted = useCallback(
    (id: string) => wishlistIds.includes(id),
    [wishlistIds],
  );

  const toggleWishlist = useCallback((record: CreatorMarketplaceResourceRecord): boolean => {
    const current = getStoredWishlistIds(ownerKey);
    const exists = current.includes(record.id);
    let next: string[];
    if (exists) {
      next = current.filter((id) => id !== record.id);
    } else {
      next = [record.id, ...current];
    }
    if (!saveWishlistIds(next, ownerKey)) {
      setStorageError(storageFailureMessage());
      return exists;
    }
    setStorageError(null);
    setWishlistIds(next);
    return !exists;
  }, [ownerKey]);

  const removeFromWishlist = useCallback((id: string): void => {
    const next = getStoredWishlistIds(ownerKey).filter((candidate) => candidate !== id);
    if (!saveWishlistIds(next, ownerKey)) {
      setStorageError(storageFailureMessage());
      return;
    }
    setStorageError(null);
    setWishlistIds(next);
  }, [ownerKey]);

  const wishlistItems: CreatorMarketplaceResourceRecord[] = wishlistIds
    .map((id) => findMergedMarketResourceById(id))
    .filter((item): item is CreatorMarketplaceResourceRecord => item !== null);

  return {
    wishlistIds,
    wishlistItems,
    wishlistCount: wishlistIds.length,
    isWishlisted,
    toggleWishlist,
    removeFromWishlist,
    storageError,
  };
}
