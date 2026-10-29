/**
 * 최근 요청 — 같은 요청을 다시 쓰기 쉽게 이번 세션에서만 기억한다.
 * 글은 메모리에만 두고 저장소에 쓰지 않는다(새로고침하면 사라진다). 사용자가 한 번에 지울 수 있다.
 */
export const RECENT_REQUEST_LIMIT = 5;
const MAX_REQUEST_CHARS = 400;

const recents = new Map<string, readonly string[]>();

export function recentRequests(kind: string): readonly string[] {
  return recents.get(kind) ?? [];
}

/** 맨 앞에 두고, 같은 글이 있으면 옮기며, 상한을 넘으면 오래된 것부터 버린다. 비었거나 너무 긴 글은 기억하지 않는다. */
export function pushRecentRequest(kind: string, text: string): readonly string[] {
  const value = text.replace(/\s+/gu, " ").trim();
  if (!value || value.length > MAX_REQUEST_CHARS) return recentRequests(kind);
  const next = [value, ...recentRequests(kind).filter((item) => item !== value)].slice(0, RECENT_REQUEST_LIMIT);
  recents.set(kind, next);
  return next;
}

export function clearRecentRequests(kind: string): void {
  recents.delete(kind);
}

/** 시험에서 기억을 모두 비운다. */
export function resetRecentRequestsForTests(): void {
  recents.clear();
}
