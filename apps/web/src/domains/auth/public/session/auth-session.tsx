import { useEffect, useState, type ReactNode } from "react";

import {
  subscribeSessionSyncRequests,
  type SessionSyncReason,
} from "./auth-session-state";
import {
  SessionContext,
  getAuthSession,
  listeners,
  persistSession,
  synchronizeServerSession,
  synchronizeServerSessionState,
  type Session,
  type SessionContextValue,
} from "./auth-session-store";

const SESSION_RETRY_DELAYS_MS = [250, 1_000, 3_000] as const;
/** 백엔드 콜드스타트·네트워크 행 상태에서도 3초 안에 게스트·로컬 캐시 화면을 먼저 개방한다. */
export const INITIAL_SESSION_READY_DEADLINE_MS = 3_000;

export function SessionProvider({ children, session = null }: { children: ReactNode; session?: Session }) {
  const [data, setData] = useState<Session>(() => session ?? getAuthSession());
  const [ready, setReady] = useState(() => Boolean(session?.user?.id));

  useEffect(() => {
    if (session?.user?.id) persistSession(session);
  }, [session]);

  useEffect(() => {
    let active = true;
    let requestGeneration = 0;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let startupDeadlineTimer: ReturnType<typeof setTimeout> | undefined =
      globalThis.setTimeout(() => {
        startupDeadlineTimer = undefined;
        if (active) setReady(true);
      }, INITIAL_SESSION_READY_DEADLINE_MS);

    const listener = (next: Session) => setData(next);

    function clearStartupDeadlineTimer() {
      if (startupDeadlineTimer === undefined) return;
      globalThis.clearTimeout(startupDeadlineTimer);
      startupDeadlineTimer = undefined;
    }

    function markSessionReady() {
      clearStartupDeadlineTimer();
      setReady(true);
    }

    function clearRetryTimer() {
      if (retryTimer === undefined) return;
      globalThis.clearTimeout(retryTimer);
      retryTimer = undefined;
    }

    function scheduleRetry(reason: SessionSyncReason) {
      if (
        !active
        || retryTimer !== undefined
        || retryAttempt >= SESSION_RETRY_DELAYS_MS.length
        || (typeof navigator !== "undefined" && navigator.onLine === false)
      ) {
        return;
      }

      const delay = SESSION_RETRY_DELAYS_MS[retryAttempt];
      retryAttempt += 1;
      retryTimer = globalThis.setTimeout(() => {
        retryTimer = undefined;
        requestSync(reason, false);
      }, delay);
    }

    function requestSync(
      reason: SessionSyncReason,
      resetRetryBudget = true,
    ) {
      if (!active) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        retryAttempt = 0;
        clearRetryTimer();
        // The last verified public profile remains the honest offline authority.
        // Do not flood DevTools with doomed session requests while disconnected.
        markSessionReady();
        return;
      }
      if (resetRetryBudget) {
        retryAttempt = 0;
        clearRetryTimer();
      }

      const generation = ++requestGeneration;
      void synchronizeServerSessionState(reason).then(
        (result) => {
          if (!active || generation !== requestGeneration) return;
          if (result.status !== "indeterminate") {
            retryAttempt = 0;
            clearRetryTimer();
            markSessionReady();
            return;
          }
          // Session transport availability must never block public rendering. Keep the last
          // locally known profile as the honest fallback, expose the application immediately,
          // and continue the bounded verification retries in the background.
          markSessionReady();
          scheduleRetry(reason);
        },
        () => {
          if (!active || generation !== requestGeneration) return;
          markSessionReady();
          scheduleRetry(reason);
        },
      );
    }

    const onFocus = () => requestSync("focus");
    const onOnline = () => requestSync("focus");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestSync("focus");
    };

    listeners.add(listener);
    const unsubscribeSyncRequests = subscribeSessionSyncRequests(requestSync);
    globalThis.addEventListener("focus", onFocus, { passive: true });
    globalThis.addEventListener("online", onOnline, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange, {
      passive: true,
    });
    requestSync("startup");
    return () => {
      active = false;
      requestGeneration += 1;
      clearStartupDeadlineTimer();
      clearRetryTimer();
      listeners.delete(listener);
      unsubscribeSyncRequests();
      globalThis.removeEventListener("focus", onFocus);
      globalThis.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const value: SessionContextValue = data?.user
    ? {
        data,
        ready,
        status: "authenticated",
        update: () => synchronizeServerSession("manual"),
      }
    : {
        data: null,
        ready,
        status: "unauthenticated",
        update: () => synchronizeServerSession("manual"),
      };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
