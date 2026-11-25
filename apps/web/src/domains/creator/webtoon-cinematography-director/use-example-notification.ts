import { useEffect, useRef, useState } from "react";

type Status = "idle" | "local-only" | "pending" | "notified" | "failed";

/** 같은 예제 결과만 재알림한다. 계산·좌표 보정·저장은 재실행하지 않는다. */
export function useExampleNotification<T>(callback?: (value: T) => void | Promise<void>) {
  const [status, setStatus] = useState<Status>("idle");
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);
  const payloadRef = useRef<{ readonly value: T } | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  function notify(value: T): void {
    if (pendingRef.current) return;
    payloadRef.current = { value };
    const current = callbackRef.current;
    if (!current) { setStatus("local-only"); return; }
    pendingRef.current = true;
    function finish(failed: boolean): void {
      pendingRef.current = false;
      if (mountedRef.current) setStatus(failed ? "failed" : "notified");
    }
    try {
      const response = current(value);
      if (response) {
        setStatus("pending");
        void Promise.resolve(response).then(() => finish(false), () => finish(true));
      } else finish(false);
    } catch { finish(true); }
  }
  function retry(): void {
    if (payloadRef.current && !pendingRef.current) notify(payloadRef.current.value);
  }
  return { status, notify, retry, isPending: () => pendingRef.current };
}
