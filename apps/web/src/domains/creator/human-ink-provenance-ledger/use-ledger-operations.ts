import { useLayoutEffect, useRef, useState } from "react";

import type { HumanInkMerkleLedger } from "./human-ink-ledger-engine";
import { digestHumanInkNoteJson } from "./human-ink-note-digest";

type Status = "idle" | "pending" | "error" | "success";
type Callback<T> = (payload: T) => void | Promise<void>;
interface Notification<T> {
  readonly status: Status;
  readonly notify: (payload: T) => void;
  readonly retry: () => void;
}
interface Job<T> {
  readonly payload: T;
  requiresRecipient: boolean;
}

/** 비동기 알림은 직렬 처리하고 대기 중 입력은 가장 최신 값만 전달한다. */
export function useLedgerNotification<T>(callback?: Callback<T>): Notification<T> {
  const latest = useRef(callback);
  const mounted = useRef(false);
  const busy = useRef(false);
  const queued = useRef<Job<T> | null>(null);
  const last = useRef<Job<T> | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  useLayoutEffect(() => { latest.current = callback; }, [callback]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      latest.current = undefined;
      queued.current = null;
    };
  }, []);
  async function flush(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    while (mounted.current && queued.current) {
      const job = queued.current;
      queued.current = null;
      const recipient = latest.current;
      if (!recipient && !job.requiresRecipient) {
        setStatus("idle");
        continue;
      }
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
    queued.current = job;
    last.current = job;
    void flush();
  }
  function retry(): void {
    if (!last.current || busy.current) return;
    queued.current = last.current;
    void flush();
  }
  return { status, notify, retry };
}

interface Snapshot {
  readonly json: string;
  readonly ledger: HumanInkMerkleLedger;
}
interface Delivery {
  payload: Snapshot;
  prepared: boolean;
  copied: boolean;
  requiresRecipient: boolean;
}
interface ExportOperation {
  readonly status: Status;
  readonly snapshot: Snapshot | null;
  readonly run: (payload: Snapshot) => Promise<void>;
  readonly retry: () => Promise<void>;
}
export function useLedgerExport(callback?: (json: string, ledger: HumanInkMerkleLedger) => void | Promise<void>): ExportOperation {
  const latest = useRef(callback);
  const mounted = useRef(false);
  const busy = useRef(false);
  const last = useRef<Delivery | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useLayoutEffect(() => { latest.current = callback; }, [callback]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      latest.current = undefined;
    };
  }, []);
  async function deliver(job: Delivery): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    last.current = job;
    setSnapshot(job.payload);
    setStatus("pending");
    try {
      if (!job.prepared) {
        const noteDigest = await digestHumanInkNoteJson(job.payload.json);
        if (!mounted.current) return;
        const note: Record<string, unknown> = JSON.parse(job.payload.json);
        job.payload = { ...job.payload, json: JSON.stringify({ ...note, noteDigest }, null, 2) };
        job.prepared = true;
        setSnapshot(job.payload);
      }
      if (!job.copied) {
        if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
          throw new Error("Clipboard unavailable");
        }
        await navigator.clipboard.writeText(job.payload.json);
        job.copied = true;
      }
      if (!mounted.current) return;
      const recipient = latest.current;
      if (recipient) {
        job.requiresRecipient = true;
        await recipient(job.payload.json, structuredClone(job.payload.ledger));
      } else if (job.requiresRecipient) {
        throw new Error("Recipient unavailable");
      }
      if (mounted.current) setStatus("success");
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      busy.current = false;
    }
  }
  async function run(payload: Snapshot): Promise<void> {
    if (busy.current) return;
    await deliver({ payload: structuredClone(payload), prepared: false, copied: false, requiresRecipient: latest.current !== undefined });
  }
  async function retry(): Promise<void> {
    if (last.current) await deliver(last.current);
  }
  return { status, snapshot, run, retry };
}
