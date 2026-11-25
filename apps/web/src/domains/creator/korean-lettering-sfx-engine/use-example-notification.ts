import { useRef, useState } from "react";

type Action = () => void | Promise<void>;
type ActionProvider = () => Action | undefined;
type Status = "idle" | "pending" | "notified" | "failed";

/** 결과는 보관하되 실행 때마다 최신 수신자를 확인한다. 계산·메모리 변경은 재시도하지 않는다. */
export function useExampleNotification() {
  const busy = useRef(false);
  const actionProviderRef = useRef<ActionProvider | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const notify = (getAction?: ActionProvider): void => {
    if (busy.current) return;
    const action = getAction?.();
    if (!action) { actionProviderRef.current = null; setStatus("idle"); setError(null); return; }
    busy.current = true;
    actionProviderRef.current = getAction ?? null;
    setStatus("pending");
    setError(null);
    const done = (): void => { busy.current = false; actionProviderRef.current = null; setStatus("notified"); };
    const failed = (reason: unknown): void => {
      busy.current = false;
      setStatus("failed");
      setError(reason instanceof Error ? reason.message : "연결 핸들러의 결과 알림에 실패했습니다.");
    };
    try { const response = action(); if (response) void Promise.resolve(response).then(done, failed); else done(); }
    catch (reason) { failed(reason); }
  };
  return { status, error, pending: status === "pending", isPending: () => busy.current, notify, retry: () => notify(actionProviderRef.current ?? undefined) };
}
