import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ReviewNotificationStatus = "idle" | "local-only" | "pending" | "notified" | "failed";
/** 실패한 예제 알림의 원문은 고정하고 수신자만 최신 것으로 선택한다. */
export function useReviewNotification<T>(callback?: (value: T) => void | Promise<void>) {
  const [status, setStatus] = useState<ReviewNotificationStatus>("idle");
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);
  const payloadRef = useRef<{ value: T; attempted: boolean } | null>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => { callbackRef.current = callback; }, [callback]);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = useCallback((job: NonNullable<typeof payloadRef.current>): void => {
    if (pendingRef.current || !mounted.current) return;
    const current = callbackRef.current;
    if (!current) { setStatus(job.attempted ? "failed" : "local-only"); return; }
    pendingRef.current = true;
    job.attempted = true;
    setStatus("pending");
    function finish(next: ReviewNotificationStatus): void {
      pendingRef.current = false;
      if (mounted.current) setStatus(next);
    }
    try {
      const response = current(job.value);
      if (response !== undefined) void Promise.resolve(response).then(() => finish("notified"), () => finish("failed"));
      else finish("notified");
    } catch { finish("failed"); }
  }, []);
  const notify = useCallback((value: T): void => {
    if (pendingRef.current) return;
    const job = { value, attempted: false };
    payloadRef.current = job;
    run(job);
  }, [run]);
  const retry = (): void => { if (payloadRef.current) run(payloadRef.current); };
  return { status, notify, retry, isPending: () => pendingRef.current };
}

export function useReviewClipboard() {
  return useReviewNotification<string>((text) => {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("클립보드를 지원하지 않습니다.");
    return navigator.clipboard.writeText(text);
  });
}
