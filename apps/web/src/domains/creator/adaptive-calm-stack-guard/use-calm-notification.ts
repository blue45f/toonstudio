import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type NotificationStatus = "idle" | "local-only" | "pending" | "notified" | "failed";
interface ExampleNotification<T> {
  readonly status: NotificationStatus;
  readonly notify: (value: T) => void;
  readonly retry: () => void;
  readonly isPending: () => boolean;
}

/** 같은 결과만 최신 수신자에게 재알림하며 계산·보정·복사를 다시 실행하지 않는다. */
export function useCalmNotification<T>(callback?: (value: T) => void | Promise<void>): ExampleNotification<T> {
  const [status, setStatus] = useState<NotificationStatus>("idle");
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);
  const payloadRef = useRef<{ readonly value: T; readonly requiresRecipient: boolean } | null>(null);
  const mountedRef = useRef(false);
  useLayoutEffect(() => { callbackRef.current = callback; }, [callback]);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const notify = useCallback(function notifyValue(value: T, requiresRecipient = false): void {
    if (pendingRef.current) return;
    const current = callbackRef.current;
    payloadRef.current = { value, requiresRecipient: requiresRecipient || Boolean(current) };
    if (!current) { setStatus(payloadRef.current.requiresRecipient ? "failed" : "local-only"); return; }
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
  }, []);

  function retry(): void {
    if (payloadRef.current && !pendingRef.current) notify(payloadRef.current.value, payloadRef.current.requiresRecipient);
  }
  return { status, notify, retry, isPending: () => pendingRef.current };
}
