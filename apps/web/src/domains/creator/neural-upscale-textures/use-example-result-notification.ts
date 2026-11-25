import { useEffect, useRef, useState } from "react";

type NotificationStatus = "idle" | "pending" | "notified" | "failed";

/** 결과가 바뀔 때만 최신 콜백에 알린다. 실제 적용·저장 완료 응답으로 해석하지 않는다. */
export function useExampleResultNotification<T>(
  result: T, callback?: (result: T) => void | Promise<void>,
): NotificationStatus {
  const [status, setStatus] = useState<NotificationStatus>("idle");
  const callbackRef = useRef(callback);
  const deliveredRef = useRef<{ readonly result: T } | null>(null);
  const sequenceRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => {
    if (deliveredRef.current?.result === result) return;
    deliveredRef.current = { result };
    const sequence = ++sequenceRef.current;
    const currentCallback = callbackRef.current;
    // 이전 결과의 늦은 응답이나 닫힌 패널에는 상태를 반영하지 않는다.
    function publish(next: NotificationStatus): void {
      queueMicrotask(() => {
        if (mountedRef.current && sequence === sequenceRef.current) setStatus(next);
      });
    }
    if (!currentCallback) { publish("idle"); return; }
    try {
      const response = currentCallback(result);
      if (response) {
        publish("pending");
        void Promise.resolve(response).then(() => publish("notified"), () => publish("failed"));
      } else publish("notified");
    } catch { publish("failed"); }
  }, [result]);
  return status;
}
