import { useCallback, useEffect, useRef, useState } from "react";

type Recipient<T> = (payload: T) => void | Promise<void>;
/** 같은 결과의 재렌더는 알리지 않고, 실패 재시도는 최신 수신자에게 같은 payload를 보낸다. */
export function useExampleNotification<T>(payload: T, recipient: Recipient<T> | undefined) {
  const recipientRef = useRef(recipient);
  const mounted = useRef(true);
  const seen = useRef<T | undefined>(undefined);
  const busy = useRef(false);
  const queued = useRef<{ payload: T } | null>(null);
  const failed = useRef<{ payload: T } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const pump = useRef<() => void>(() => undefined);
  useEffect(() => { recipientRef.current = recipient; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const drain = useCallback(() => {
    if (busy.current || !queued.current || !mounted.current) return;
    const job = queued.current;
    queued.current = null;
    const current = recipientRef.current;
    if (!current) { failed.current = job; setError(true); return; }
    busy.current = true;
    setPending(true);
    setError(false);
    void (async () => {
      try {
        const result = current(job.payload);
        if (result) await result;
        failed.current = null;
      } catch {
        failed.current = job;
        if (mounted.current) setError(true);
      } finally {
        busy.current = false;
        if (mounted.current) { setPending(false); pump.current(); }
      }
    })();
  }, []);
  useEffect(() => { pump.current = drain; }, [drain]);
  useEffect(() => {
    if (seen.current === payload) return;
    seen.current = payload;
    if (recipientRef.current) { queued.current = { payload }; drain(); }
  }, [payload, drain]);
  const retry = (): void => {
    if (busy.current || !failed.current) return;
    queued.current = failed.current;
    drain();
  };
  return { pending, error, retry };
}

type ExportRecipient<T> = (text: string, payload: T) => void | Promise<void>;
/** 복사와 외부 알림을 단계별로 확인해 성공한 복사까지 재시도하지 않는다. */
export function useExampleCopy<T, K extends string>(recipients: Partial<Record<K, ExportRecipient<T>>>) {
  const recipientsRef = useRef(recipients);
  const mounted = useRef(true);
  const busy = useRef(false);
  const failed = useRef<{ kind: K; text: string; payload: T; copied: boolean; requiresRecipient: boolean } | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "copied" | "error">("idle");
  useEffect(() => { recipientsRef.current = recipients; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (job: NonNullable<typeof failed.current>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    failed.current = job;
    setState("pending");
    try {
      if (!job.copied) {
        if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("클립보드를 사용할 수 없습니다.");
        await navigator.clipboard.writeText(job.text);
        job.copied = true;
      }
      if (!mounted.current) return;
      const current = recipientsRef.current[job.kind];
      if (job.requiresRecipient && !current) throw new Error("재시도 수신자가 없습니다.");
      if (current) {
        job.requiresRecipient = true;
        await current(job.text, job.payload);
      }
      failed.current = null;
      if (mounted.current) setState("copied");
    } catch {
      if (mounted.current) setState("error");
    } finally { busy.current = false; }
  };
  const copy = (kind: K, text: string, payload: T): void => {
    if (busy.current) return;
    void run({ kind, text, payload, copied: false, requiresRecipient: Boolean(recipientsRef.current[kind]) });
  };
  const retry = (): void => { if (failed.current && !busy.current) void run(failed.current); };
  return { state, copy, retry };
}
