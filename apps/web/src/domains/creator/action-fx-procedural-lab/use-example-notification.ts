import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "local-only" | "pending" | "notified" | "failed";

/** 알림 재시도는 같은 결과를 최신 수신자에게 전달하며 계산·저장을 다시 실행하지 않는다. */
export function useExampleNotification<T>(callback?: (value: T) => void | Promise<void>) {
  const [state, setState] = useState<{ status: Status; error: string }>({ status: "idle", error: "" });
  const callbackRef = useRef(callback);
  const payload = useRef<{ value: T } | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = useCallback((value: T): void => {
    if (pending.current) return;
    payload.current = { value };
    const receiver = callbackRef.current;
    if (!receiver) { setState({ status: "local-only", error: "" }); return; }
    pending.current = true;
    const finish = (error?: unknown): void => {
      pending.current = false;
      if (mounted.current) setState({ status: error === undefined ? "notified" : "failed", error: error instanceof Error ? error.message : error === undefined ? "" : String(error) });
    };
    try {
      const response = receiver(value);
      if (response) {
        setState({ status: "pending", error: "" });
        void Promise.resolve(response).then(() => finish(), (error: unknown) => finish(error ?? new Error("처리 거부")));
      } else finish();
    } catch (error) { finish(error ?? new Error("처리 실패")); }
  }, []);
  const retry = (): void => { if (payload.current) notify(payload.current.value); };
  return { ...state, notify, retry, isPending: () => pending.current, value: payload.current?.value };
}
