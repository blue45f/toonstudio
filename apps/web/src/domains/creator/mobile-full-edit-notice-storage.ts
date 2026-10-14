const KEY_PREFIX = "toonstudio-mobile-full-edit-notice-dismissed:";

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/**
 * 풀 편집 표면의 모바일 안내를 닫았는지 세션 단위로 기억하는 키.
 * 브라우저 호환 안내(browser-compat-dismissal)와 같은 방식: 세션이 바뀌면 다시 안내한다.
 * 표면마다 키를 나눠, 한 표면에서 닫았어도 다른 풀 편집 표면 첫 진입에서는 안내가 나온다.
 */
export function mobileFullEditNoticeStorageKey(surfaceId: string): string {
  return `${KEY_PREFIX}${surfaceId}`;
}

/** Storage getters themselves can throw in private or embedded browser contexts. */
export function isMobileFullEditNoticeDismissed(
  surfaceId: string,
  getStorage: () => SessionStore = () => globalThis.sessionStorage,
): boolean {
  try {
    return getStorage().getItem(mobileFullEditNoticeStorageKey(surfaceId)) === "true";
  } catch {
    return false;
  }
}

export function dismissMobileFullEditNotice(
  surfaceId: string,
  getStorage: () => SessionStore = () => globalThis.sessionStorage,
): void {
  try {
    getStorage().setItem(mobileFullEditNoticeStorageKey(surfaceId), "true");
  } catch {
    // Dismissing the current notice must work even when persistence is unavailable.
  }
}
