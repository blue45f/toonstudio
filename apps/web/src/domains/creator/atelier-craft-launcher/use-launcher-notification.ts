import { useCallback, useEffect, useRef, useState } from "react";

type Action = () => void | Promise<void>;
type ActionProvider = () => Action | undefined;
type Status = "idle" | "pending" | "notified" | "failed";

/** 보관한 결과를 최신 수신자에게만 재알림한다. 로컬 선택·핀 변경과 경로 이동은 재실행하지 않는다. */
export function useLauncherNotification() {
  const busy = useRef(false);
  const mounted = useRef(true);
  const actionProviderRef = useRef<ActionProvider | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const isPending = useCallback(() => busy.current, []);
  const notify = useCallback((getAction: ActionProvider): void => {
    if (busy.current) return;
    const action = getAction();
    if (!action) { actionProviderRef.current = null; setStatus("idle"); setError(null); return; }
    busy.current = true;
    actionProviderRef.current = getAction;
    setStatus("pending");
    setError(null);
    const done = (): void => {
      busy.current = false;
      actionProviderRef.current = null;
      if (mounted.current) setStatus("notified");
    };
    const failed = (reason: unknown): void => {
      busy.current = false;
      if (mounted.current) {
        setStatus("failed");
        setError(reason instanceof Error ? reason.message : "수신자 알림에 실패했습니다.");
      }
    };
    try { const response = action(); if (response) void Promise.resolve(response).then(done, failed); else done(); }
    catch (reason) { failed(reason); }
  }, []);
  return { status, error, pending: status === "pending", isPending, notify,
    retry: () => { const getAction = actionProviderRef.current; if (getAction) notify(getAction); } };
}
