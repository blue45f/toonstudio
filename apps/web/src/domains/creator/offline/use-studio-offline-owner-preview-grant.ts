import { useEffect, useState } from "react";
import { getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { OFFLINE_PREVIEW_SCOPE_KEY } from "@/domains/auth/public/session/offline-preview-scope";
import { offlineWorkCacheKey, readOfflineOwnerReceipt, type StudioOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

export function useStudioOfflineOwnerPreviewGrant(workId: string): StudioOfflineOwnerReceipt | null {
  const [receipt, setReceipt] = useState<StudioOfflineOwnerReceipt | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    let request: AbortController | undefined;
    function clear() {
      request?.abort();
      window.clearTimeout(timer);
      setReceipt(null);
    }
    function check() {
      clear();
      if (navigator.onLine || document.visibilityState === "hidden" || !workId) return;
      const controller = new AbortController();
      request = controller;
      void readOfflineOwnerReceipt(workId, controller.signal).then(value => {
        const actor = getAuthUserId();
        if (!value || controller.signal.aborted || navigator.onLine || (actor && actor !== value.userId)) return;
        const remaining = value.expiresAt - Date.now();
        if (remaining <= 0) return;
        setReceipt(value);
        timer = window.setTimeout(clear, remaining);
      });
    }
    function changed(event: StorageEvent) {
      if (event.key === null || event.key === OFFLINE_PREVIEW_SCOPE_KEY || event.key === offlineWorkCacheKey(workId)) check();
    }
    check();
    listeners.add(check);
    window.addEventListener("storage", changed);
    window.addEventListener(OFFLINE_PREVIEW_SCOPE_KEY, check);
    window.addEventListener("offline", check);
    window.addEventListener("online", clear);
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      request?.abort();
      window.clearTimeout(timer);
      listeners.delete(check);
      window.removeEventListener("storage", changed);
      window.removeEventListener(OFFLINE_PREVIEW_SCOPE_KEY, check);
      window.removeEventListener("offline", check);
      window.removeEventListener("online", clear);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [workId]);
  const actor = getAuthUserId();
  return receipt && !navigator.onLine && receipt.workId === workId && (!actor || actor === receipt.userId) ? receipt : null;
}
