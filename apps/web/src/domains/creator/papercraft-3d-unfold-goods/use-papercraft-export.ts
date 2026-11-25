import { useLayoutEffect, useRef, useState } from "react";
import type { PapercraftDielineResult, PaperFoldPreviewResult } from "./papercraft-unfold-engine";

export type PapercraftExportSnapshot =
  | { readonly kind: "svg"; readonly text: string; readonly dieline: PapercraftDielineResult }
  | { readonly kind: "json"; readonly text: string; readonly dieline: PapercraftDielineResult; readonly preview: PaperFoldPreviewResult };
interface Recipients {
  readonly onExportSvg?: (text: string, dieline: PapercraftDielineResult) => void | Promise<void>;
  readonly onExportJson?: (text: string, dieline: PapercraftDielineResult, preview: PaperFoldPreviewResult) => void | Promise<void>;
}
interface Delivery { readonly payload: PapercraftExportSnapshot; copied: boolean; requiresRecipient: boolean; }
type ExportStatus = "idle" | "pending" | "error" | "success";
interface ExportOperation {
  readonly status: ExportStatus;
  readonly snapshot: PapercraftExportSnapshot | null;
  readonly run: (payload: PapercraftExportSnapshot) => Promise<void>;
  readonly retry: () => Promise<void>;
}

export function usePapercraftExport(recipients: Recipients): ExportOperation {
  const latest = useRef(recipients);
  const mounted = useRef(false);
  const busy = useRef(false);
  const delivery = useRef<Delivery | null>(null);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [snapshot, setSnapshot] = useState<PapercraftExportSnapshot | null>(null);
  useLayoutEffect(() => { latest.current = recipients; }, [recipients]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; latest.current = {}; };
  }, []);

  async function deliver(record: Delivery): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    delivery.current = record;
    setSnapshot(record.payload);
    setStatus("pending");
    try {
      if (!record.copied) {
        if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(record.payload.text);
        record.copied = true;
      }
      if (!mounted.current) return;
      const payload = structuredClone(record.payload);
      if (payload.kind === "svg") {
        const recipient = latest.current.onExportSvg;
        if (recipient) { record.requiresRecipient = true; await recipient(payload.text, payload.dieline); }
        else if (record.requiresRecipient) throw new Error("SVG recipient unavailable");
      } else {
        const recipient = latest.current.onExportJson;
        if (recipient) { record.requiresRecipient = true; await recipient(payload.text, payload.dieline, payload.preview); }
        else if (record.requiresRecipient) throw new Error("JSON recipient unavailable");
      }
      if (mounted.current) setStatus("success");
    } catch {
      if (mounted.current) setStatus("error");
    } finally { busy.current = false; }
  }
  async function run(payload: PapercraftExportSnapshot): Promise<void> {
    if (busy.current) return;
    const recipient = payload.kind === "svg" ? latest.current.onExportSvg : latest.current.onExportJson;
    await deliver({ payload: structuredClone(payload), copied: false, requiresRecipient: recipient !== undefined });
  }
  async function retry(): Promise<void> {
    if (delivery.current) await deliver(delivery.current);
  }
  return { status, snapshot, run, retry };
}
