import { useEffect, useState } from "react";
import { getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { OFFLINE_PREVIEW_SCOPE_KEY } from "@/domains/auth/public/session/offline-preview-scope";
import { offlineWorkCacheKey, readOfflineOwnerReceipt, type StudioOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

/** undefined는 현재 원고의 영수증을 조회 중, null은 열람할 수 없음을 뜻한다. */
export function useStudioOfflineOwnerPreviewGrant(workId: string): StudioOfflineOwnerReceipt | null | undefined {
  const [result, setResult] = useState<{ workId: string; receipt: StudioOfflineOwnerReceipt | null }>();
  useEffect(() => {
    let timer: number | undefined;
    let request: AbortController | undefined;
    function clear() {
      request?.abort();
      window.clearTimeout(timer);
      setResult({ workId, receipt: null });
    }
    function check() {
      clear();
      if (navigator.onLine || document.visibilityState === "hidden" || !workId) return;
      const controller = new AbortController();
      request = controller;
      setResult(undefined);
      void readOfflineOwnerReceipt(workId, controller.signal).then(value => {
        const actor = getAuthUserId();
        if (controller.signal.aborted) return;
        const remaining = value ? value.expiresAt - Date.now() : 0;
        if (!value || navigator.onLine || (actor && actor !== value.userId) || remaining <= 0) {
          clear();
          return;
        }
        setResult({ workId, receipt: value });
        timer = window.setTimeout(clear, remaining);
      }, () => {
        if (!controller.signal.aborted) clear();
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
  if (!workId || typeof document === "undefined" || navigator.onLine || document.visibilityState === "hidden") return null;
  if (result?.workId !== workId) return undefined;
  const { receipt } = result;
  const actor = getAuthUserId();
  return receipt && receipt.workId === workId && (!actor || actor === receipt.userId) ? receipt : null;
}
