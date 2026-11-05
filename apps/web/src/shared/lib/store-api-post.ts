import { withCsrfProtection } from "./csrf";
import { useApp } from "./store";

const pendingSubscriptionWrites = new Set<{ userId: string; authGeneration: number }>();

/** 현재 세션의 구독 쓰기가 끝나기 전에 읽은 서버 스냅샷은 보류한다. */
export function hasPendingSubscriptionWrites(): boolean {
  const { userId, authGeneration } = useApp.getState();
  return [...pendingSubscriptionWrites].some((pending) => (
    pending.userId === userId && pending.authGeneration === authGeneration
  ));
}

// 로그인 시 변경을 DB API로 write-through (게스트는 localStorage만)
export function apiPost(path: string, body: unknown, method = "POST") {
  if (typeof window === "undefined") return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { sessionToken: token, userId, authGeneration } = useApp.getState();
  if (token) headers["x-user-id"] = token; // 서명 세션 토큰(서버가 검증해 실제 userId로 치환)
  const pending = path === "/api/me/subscription" && method === "POST" && userId
    ? { userId, authGeneration }
    : null;
  if (pending) pendingSubscriptionWrites.add(pending);
  fetch(path, withCsrfProtection({ method, headers, body: JSON.stringify(body) }))
    .catch(() => {})
    .finally(() => {
      if (pending) pendingSubscriptionWrites.delete(pending);
    });
}
