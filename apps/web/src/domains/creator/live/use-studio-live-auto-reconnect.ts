import { useEffect, useRef, useState } from "react";

/**
 * 재연결 지연 사다리. 마지막 간격(30초)에 도달한 뒤에도 소진하지 않고 같은 간격으로
 * 계속 다시 시도한다 — 예전에는 3회(2+5+10초) 뒤 "exhausted"로 영구 정지해, 페이지
 * 로드 시점에 그보다 긴 장애가 있으면 새로고침 전까지 자동 동기화가 돌아오지 않았다.
 */
export const STUDIO_LIVE_AUTO_RECONNECT_DELAYS = [2_000, 5_000, 10_000, 30_000] as const;
export type StudioLiveConnectionRecovery = "idle" | "waiting" | "retrying" | "paused";

interface ReconnectInput {
  readonly scopeKey: string | null;
  readonly enabled: boolean;
  readonly failed: boolean;
  readonly connected: boolean;
  readonly retry: () => void;
}

/** Retry closed room generations, never a live socket, a local-only room or a terminal boundary. */
export function useStudioLiveAutoReconnect({ scopeKey, enabled, failed, connected, retry }: ReconnectInput): StudioLiveConnectionRecovery {
  const attempts = useRef(0);
  const [phase, setPhase] = useState<StudioLiveConnectionRecovery>("idle");
  useEffect(() => { attempts.current = 0; }, [scopeKey]);
  useEffect(() => {
    if (!enabled || connected) {
      attempts.current = 0;
      setPhase("idle");
      return;
    }
    if (!failed) { setPhase("idle"); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      cancel();
      if (navigator.onLine === false || document.visibilityState === "hidden") {
        setPhase("paused");
        return;
      }
      // 사다리의 마지막 간격으로 캡한다 — 시도가 쌓여도 간격만 유지되고 재시도는 멈추지 않는다.
      const delay = STUDIO_LIVE_AUTO_RECONNECT_DELAYS[
        Math.min(attempts.current, STUDIO_LIVE_AUTO_RECONNECT_DELAYS.length - 1)
      ];
      setPhase("waiting");
      timer = setTimeout(() => {
        timer = null;
        if (navigator.onLine === false || document.visibilityState === "hidden") {
          setPhase("paused");
          return;
        }
        attempts.current += 1;
        setPhase("retrying");
        retry();
      }, delay);
    };
    // 네트워크가 돌아온 것은 새 정보다 — 긴 백오프에 머물지 않고 빠른 사다리부터 다시 시작한다.
    const onOnline = () => {
      attempts.current = 0;
      schedule();
    };
    schedule();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancel();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [connected, enabled, failed, retry, scopeKey]);
  return phase;
}
