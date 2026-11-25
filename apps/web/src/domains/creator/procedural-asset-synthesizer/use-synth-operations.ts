import { useLayoutEffect, useRef, useState } from "react";
import type { ProceduralAssetSynthResult } from "./procedural-asset-synth-engine";

type Status = "idle" | "pending" | "error" | "success";
type Callback<T> = (payload: T) => void | Promise<void>;
interface Notification<T> { readonly status: Status; readonly notify: (payload: T) => void; readonly retry: () => void; }
interface Job<T> { readonly payload: T; requiresRecipient: boolean; }

/** 비동기 알림은 직렬 처리하고 대기 중 입력은 가장 최신 값만 전달한다. */
export function useSynthNotification<T>(callback?: Callback<T>): Notification<T> {
  const latest = useRef(callback);
  const mounted = useRef(false);
  const busy = useRef(false);
  const queued = useRef<Job<T> | null>(null);
  const last = useRef<Job<T> | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  useLayoutEffect(() => { latest.current = callback; }, [callback]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; latest.current = undefined; queued.current = null; };
  }, []);
  async function flush(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    while (mounted.current && queued.current) {
      const job = queued.current; queued.current = null;
      const recipient = latest.current;
      if (!recipient && !job.requiresRecipient) { setStatus("idle"); continue; }
      setStatus("pending");
      try {
        if (!recipient) throw new Error("Recipient unavailable");
        job.requiresRecipient = true;
        const outcome = recipient(structuredClone(job.payload));
        if (outcome) await outcome;
        if (mounted.current && !queued.current) setStatus("success");
      } catch {
        if (mounted.current && !queued.current) setStatus("error");
      }
    }
    busy.current = false;
  }
  function notify(payload: T): void {
    const job = { payload: structuredClone(payload), requiresRecipient: latest.current !== undefined };
    queued.current = job; last.current = job;
    void flush();
  }
  function retry(): void {
    if (!last.current || busy.current) return;
    queued.current = last.current;
    void flush();
  }
  return { status, notify, retry };
}

interface Recipients {
  readonly onExportSvg?: (text: string, result: ProceduralAssetSynthResult) => void | Promise<void>;
  readonly onExportJson?: (text: string, result: ProceduralAssetSynthResult) => void | Promise<void>;
}
export interface SynthExportSnapshot { readonly kind: "svg" | "json"; readonly text: string; readonly result: ProceduralAssetSynthResult; }
interface Delivery { readonly payload: SynthExportSnapshot; copied: boolean; requiresRecipient: boolean; }
interface ExportOperation { readonly status: Status; readonly snapshot: SynthExportSnapshot | null; readonly run: (payload: SynthExportSnapshot) => Promise<void>; readonly retry: () => Promise<void>; }

export function useSynthExport(recipients: Recipients): ExportOperation {
  const latest = useRef(recipients);
  const mounted = useRef(false);
  const busy = useRef(false);
  const last = useRef<Delivery | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [snapshot, setSnapshot] = useState<SynthExportSnapshot | null>(null);
  useLayoutEffect(() => { latest.current = recipients; }, [recipients]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; latest.current = {}; };
  }, []);
  async function deliver(job: Delivery): Promise<void> {
    if (busy.current) return;
    busy.current = true; last.current = job;
    setSnapshot(job.payload); setStatus("pending");
    try {
      if (!job.copied) {
        if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(job.payload.text);
        job.copied = true;
      }
      if (!mounted.current) return;
      const payload = structuredClone(job.payload);
      const recipient = payload.kind === "svg" ? latest.current.onExportSvg : latest.current.onExportJson;
      if (recipient) { job.requiresRecipient = true; await recipient(payload.text, payload.result); }
      else if (job.requiresRecipient) throw new Error("Export recipient unavailable");
      if (mounted.current) setStatus("success");
    } catch {
      if (mounted.current) setStatus("error");
    } finally { busy.current = false; }
  }
  async function run(payload: SynthExportSnapshot): Promise<void> {
    if (busy.current) return;
    const recipient = payload.kind === "svg" ? latest.current.onExportSvg : latest.current.onExportJson;
    await deliver({ payload: structuredClone(payload), copied: false, requiresRecipient: recipient !== undefined });
  }
  async function retry(): Promise<void> { if (last.current) await deliver(last.current); }
  return { status, snapshot, run, retry };
}
