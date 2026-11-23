// Opaque cache namespace. It carries no identity and grants no access.
export const OFFLINE_PREVIEW_SCOPE_KEY = "toonstudio:offline-preview:scope:v1";

export function invalidateOfflinePreviewScope(): void {
  try {
    window.localStorage.removeItem(OFFLINE_PREVIEW_SCOPE_KEY);
    window.dispatchEvent(new Event(OFFLINE_PREVIEW_SCOPE_KEY));
  } catch { /* Storage is optional, including during SSR. */ }
}
