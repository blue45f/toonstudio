import { useLayoutEffect, useRef, useState } from "react";

export type NotificationStatus = "idle" | "local-only" | "pending" | "notified" | "failed";
interface ExampleNotification<T> {
  readonly status: NotificationStatus;
  readonly notify: (value: T) => void;
  readonly retry: () => void;
  readonly isPending: () => boolean;
}

/** 실패한 같은 예제 결과만 최신 수신자에게 재알림하며 계산과 저장은 실행하지 않는다. */
export function useExampleNotification<T>(callback?: (value: T) => void | Promise<void>): ExampleNotification<T> {
  const [status, setStatus] = useState<NotificationStatus>("idle");
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);
  const payloadRef = useRef<{ readonly value: T } | null>(null);
  const mountedRef = useRef(false);
  useLayoutEffect(() => { callbackRef.current = callback; }, [callback]);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function notify(value: T): void {
    if (pendingRef.current) return;
    payloadRef.current = { value };
    const current = callbackRef.current;
    if (!current) { setStatus("local-only"); return; }
    pendingRef.current = true;
    setStatus("pending");
    function finish(nextStatus: NotificationStatus): void {
      pendingRef.current = false;
      if (mountedRef.current) setStatus(nextStatus);
    }
    try {
      const response = current(value);
      if (response !== undefined) {
        void Promise.resolve(response).then(() => finish("notified"), () => finish("failed"));
      } else finish("notified");
    } catch {
      finish("failed");
    }
  }
  function retry(): void {
    if (payloadRef.current && !pendingRef.current) notify(payloadRef.current.value);
  }
  return { status, notify, retry, isPending: () => pendingRef.current };
}

