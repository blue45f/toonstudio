import { useEffect, useState } from "react";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";

export function useMarketStorageOwnerKey(): string {
  const [ownerKey, setOwnerKey] = useState<string>(() => getAuthUserId() ?? "guest");

  useEffect(() => {
    const syncOwner = (session: Session) => {
      setOwnerKey(session?.user.id ?? "guest");
    };
    authListeners.add(syncOwner);
    return () => {
      authListeners.delete(syncOwner);
    };
  }, []);

  return ownerKey;
}

export function scopedMarketStorageKey(baseKey: string, ownerKey?: string): string {
  return ownerKey ? `${baseKey}:${ownerKey}` : baseKey;
}

export function readScopedMarketJson<T>(
  baseKey: string,
  ownerKey: string,
  parse: (raw: unknown) => T,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(scopedMarketStorageKey(baseKey, ownerKey));
    if (raw === null) return fallback;
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function writeScopedMarketJson<T>(
  baseKey: string,
  ownerKey: string,
  eventName: string,
  value: T,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(scopedMarketStorageKey(baseKey, ownerKey), JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(eventName));
    return true;
  } catch {
    return false;
  }
}
