import { useEffect, useRef, useState } from "react";

type ExportRecipient<T> = (text: string, payload: T) => void | Promise<void>;
/** 복사와 외부 알림을 단계별로 확인해 성공한 복사까지 재시도하지 않는다. */
export function useCalmCopy<T, K extends string>(recipients: Partial<Record<K, ExportRecipient<T>>>) {
  const recipientsRef = useRef(recipients);
  const mounted = useRef(true);
  const busy = useRef(false);
  const failed = useRef<{ kind: K; text: string; payload: T; copied: boolean; requiresRecipient: boolean } | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "copied" | "error">("idle");
  const [bytes, setBytes] = useState(0);
  useEffect(() => { recipientsRef.current = recipients; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (job: NonNullable<typeof failed.current>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    failed.current = job;
    setBytes(new TextEncoder().encode(job.text).byteLength);
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
  return { state, bytes, copy, retry, isPending: () => busy.current };
}
