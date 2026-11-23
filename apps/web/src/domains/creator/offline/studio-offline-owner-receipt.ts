import { OFFLINE_PREVIEW_SCOPE_KEY } from "@/domains/auth/public/session/offline-preview-scope";
import { apiPath } from "@/platform/api";
import { STUDIO_READER_CAPABILITY_HEADERS } from "@/platform/studio-reader-capabilities";

export interface StudioOfflineOwnerReceipt {
  readonly userId: string;
  readonly workId: string;
  readonly revision: number;
  readonly expiresAt: number;
}

declare global {
  interface Window {
    __toonstudioTakeOfflineOwnerResponse?: (
      href: string, capability: string, signal: AbortSignal,
    ) => Promise<{ response: Response; consume(): boolean } | null> | null;
  }
}

const READER_KEY = "toonstudio:offline-preview:reader:v1";
const capability = STUDIO_READER_CAPABILITY_HEADERS["x-studio-reader-capabilities"];
const MAX_AGE_MS = 300_000;
export const offlineWorkCacheKey = (id: string) => `toonstudio:offline-preview:work:v1:${encodeURIComponent(id)}`;

export function forgetOfflineOwnerReceipt(workId: string): void {
  try {
    localStorage.removeItem(offlineWorkCacheKey(workId));
    window.dispatchEvent(new Event(OFFLINE_PREVIEW_SCOPE_KEY));
  } catch { /* No persistent storage means no offline preview. */ }
}

// Only opaque cache selectors are persisted here. The browser HTTP cache selects
// the server's receipt with the actual HttpOnly cookie via Vary: Cookie.
function receiptUrl(workId: string, prepare: boolean): URL | null {
  const url = new URL(apiPath(`/creator/works/${encodeURIComponent(workId)}/team/document/offline-owner-receipt`), location.origin);
  if (url.origin !== location.origin) return null;
  let scope = localStorage.getItem(OFFLINE_PREVIEW_SCOPE_KEY);
  if (!scope && prepare) {
    scope = crypto.randomUUID();
    localStorage.setItem(OFFLINE_PREVIEW_SCOPE_KEY, scope);
  }
  if (!scope) return null;
  const key = offlineWorkCacheKey(workId);
  let version = localStorage.getItem(key);
  if (prepare && !version) {
    version = crypto.randomUUID();
    localStorage.setItem(key, version);
  }
  if (!version) return null;
  url.searchParams.set("scope", scope);
  url.searchParams.set("v", version);
  return url;
}

export async function readOfflineOwnerReceipt(
  workId: string,
  signal: AbortSignal,
  prepare = false,
): Promise<StudioOfflineOwnerReceipt | null> {
  try {
    const url = receiptUrl(workId, prepare);
    if (!url || signal.aborted) return null;
    const early = prepare ? null : await window.__toonstudioTakeOfflineOwnerResponse?.(url.href, capability, signal);
    if (signal.aborted) return null;
    const response = early?.response ?? await fetch(url, {
      mode: "same-origin", credentials: "same-origin", redirect: "error",
      cache: prepare ? "reload" : "only-if-cached", headers: STUDIO_READER_CAPABILITY_HEADERS, signal,
    });
    // A non-cached failure must not re-enable an older receipt after a known denial.
    if (!response.ok) {
      if (prepare && [401, 403, 404].includes(response.status) && receiptUrl(workId, false)?.href === url.href) {
        forgetOfflineOwnerReceipt(workId);
      }
      return null;
    }
    if (!response.headers.get("vary")?.split(",").some(key => key.trim().toLowerCase() === "cookie")) return null;
    const data: StudioOfflineOwnerReceipt | null = await response.json();
    const now = Date.now();
    if (!data || data.workId !== workId || typeof data.userId !== "string" || !data.userId.trim()
      || !Number.isSafeInteger(data.revision) || data.revision < 1 || !Number.isSafeInteger(data.expiresAt)
      || data.expiresAt <= now || data.expiresAt > now + MAX_AGE_MS || signal.aborted
      || receiptUrl(workId, false)?.href !== url.href) return null;
    if (early && !early.consume()) return null;
    // 초기 로더에는 기존 요청의 공개 reader 헤더만 전달한다. 사용자는 HTTP 쿠키로 확인한다.
    if (prepare && localStorage.getItem(READER_KEY) !== capability) localStorage.setItem(READER_KEY, capability);
    return data;
  } catch {
    // A miss, disabled cache, unsupported mode, or denied storage keeps the source locked.
    return null;
  }
}
