import { useEffect } from "react";

import {
  acquireScreenWakeLock,
  type ScreenWakeLockLease,
} from "@/shared/lib/screen-wake-lock";

/**
 * enabled인 동안 화면 꺼짐 방지를 붙잡는다.
 * 센티넬은 탭이 숨겨지면 브라우저가 자동 해제하므로, 다시 보일 때 붙잡고 있지 않으면
 * 재획득한다. 미지원 환경에서는 아무 일도 일어나지 않는다 (실험 기능의 조용한 부재).
 */
export function useScreenWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    let disposed = false;
    let lease: ScreenWakeLockLease | null = null;

    const acquire = async (): Promise<void> => {
      if (disposed || document.visibilityState !== "visible") return;
      const next = await acquireScreenWakeLock();
      if (disposed) {
        await next?.release();
        return;
      }
      lease = next;
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") return;
      if (lease && lease.isActive()) return;
      void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lease?.release();
      lease = null;
    };
  }, [enabled]);
}
