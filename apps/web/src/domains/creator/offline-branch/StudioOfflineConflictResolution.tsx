import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { offlineConflictText } from "./studio-offline-conflict-i18n";
import type { StudioOfflineBranchConflictDetail, StudioOfflineBranchResolveInput } from "./studio-offline-branch-runtime";

export interface StudioOfflineConflictResolutionProps {
  readonly conflicts: readonly StudioOfflineBranchConflictDetail[];
  readonly resolve: (input: StudioOfflineBranchResolveInput) => Promise<void>;
}

function conflictReason(code: StudioOfflineBranchConflictDetail["code"]): string {
  if (code === "target-changed") return offlineConflictText("targetChanged");
  if (code === "target-missing") return offlineConflictText("targetMissing");
  if (code === "target-exists") return offlineConflictText("targetExists");
  if (code === "payload-missing") return offlineConflictText("payloadMissing");
  if (code === "payload-corrupt") return offlineConflictText("payloadCorrupt");
  return offlineConflictText("unsupported");
}

const DISABLED_REASON_KEYS = {
  "not-owned": "notOwned", published: "published", offline: "offline",
  "page-missing": "pageMissing", "payload-unavailable": "payloadUnavailable", unavailable: "resolutionUnavailable",
} as const;

export function StudioOfflineConflictResolution({ conflicts, resolve }: StudioOfflineConflictResolutionProps) {
  useBilingualI18nRevision();
  const sectionRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const [busyOperation, setBusyOperation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const sectionId = useId();
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useLayoutEffect(() => {
    if (notice || actionError) sectionRef.current?.focus({ preventScroll: true });
  }, [notice, actionError]);

  const choose = async (detail: StudioOfflineBranchConflictDetail, action: StudioOfflineBranchResolveInput["action"]) => {
    if (inFlightRef.current || (action === "keep-canonical" ? !detail.canKeepCanonical : !detail.canReapplyLocal)) return;
    inFlightRef.current = true;
    setBusyOperation(detail.operationId);
    setActionError(null);
    setNotice(null);
    try {
      await resolve({ operationId: detail.operationId, action, expectedCanonicalFingerprint: detail.canonicalFingerprint });
      if (!mountedRef.current) return;
      setNotice(offlineConflictText(action === "keep-canonical" ? "kept" : "reapplied"));
    } catch {
      if (mountedRef.current) setActionError(offlineConflictText("failed"));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusyOperation(null);
    }
  };

  if (conflicts.length === 0 && busyOperation === null && !notice && !actionError) return null;
  return <section ref={sectionRef} tabIndex={-1} aria-labelledby={sectionId} className="mt-3 rounded-xl border border-warning/40 bg-warning/5 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" data-studio-offline-conflict-resolution>
    <h3 id={sectionId} className="text-sm font-bold">{offlineConflictText("title")}</h3>
    <p className="mt-1 text-xs leading-relaxed text-fg-3">{offlineConflictText("intro")}</p>
    <ul className="mt-3 space-y-3">
      {conflicts.slice(0, visibleCount).map((detail, index) => {
        const kind = offlineConflictText(detail.targetType === "stroke" ? "stroke" : detail.targetType === "layer-group" ? "group" : "element");
        const reasonId = `${sectionId}-${index}-reason`;
        const disabledReason = detail.disabledReasonCode
          ? offlineConflictText(DISABLED_REASON_KEYS[detail.disabledReasonCode]) : detail.disabledReason;
        const pageName = detail.pageNumber === null
          ? offlineConflictText("deletedPage")
          : detail.pageNumber !== undefined
            ? offlineConflictText("pageNumber", { number: detail.pageNumber })
            : detail.pageName || offlineConflictText("unknownPage");
        return <li key={detail.operationId} className="rounded-lg border border-line bg-card/70 p-3">
          <h4 className="break-words text-xs font-bold">{offlineConflictText("changeNumber", { number: index + 1 })} · {pageName} · {kind} · {offlineConflictText(detail.action === "delete" ? "remove" : "upsert")}</h4>
          <p id={reasonId} className="mt-1 text-xs leading-relaxed text-fg-2">{conflictReason(detail.code)}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <button type="button" disabled={busyOperation !== null || !detail.canKeepCanonical} aria-describedby={`${reasonId} ${reasonId}-keep`} aria-busy={busyOperation === detail.operationId} onClick={() => void choose(detail, "keep-canonical")} className="min-h-11 w-full rounded-lg border border-line px-3 py-2 text-xs font-bold hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{offlineConflictText("keep")}</button>
              <p id={`${reasonId}-keep`} className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{offlineConflictText("keepHelp")}</p>
            </div>
            <div>
              <button type="button" disabled={busyOperation !== null || !detail.canReapplyLocal} aria-describedby={`${reasonId} ${reasonId}-reapply${disabledReason ? ` ${reasonId}-disabled` : ""}`} aria-busy={busyOperation === detail.operationId} onClick={() => void choose(detail, "reapply-local")} className="min-h-11 w-full rounded-lg border border-accent/40 px-3 py-2 text-xs font-bold hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{offlineConflictText("reapply")}</button>
              <p id={`${reasonId}-reapply`} className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{offlineConflictText("reapplyHelp")}</p>
            </div>
          </div>
          {disabledReason ? <p id={`${reasonId}-disabled`} className="mt-2 text-xs leading-relaxed text-fg-3">{disabledReason}</p> : null}
          {busyOperation === detail.operationId ? <p className="mt-2 text-xs text-fg-3">{offlineConflictText("busy")}</p> : null}
        </li>;
      })}
    </ul>
    {busyOperation !== null && !conflicts.some((detail) => detail.operationId === busyOperation) ? <p role="status" className="mt-2 text-xs text-fg-3">{offlineConflictText("busy")}</p> : null}
    {conflicts.length > visibleCount ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-fg-3">{offlineConflictText("shown", { total: conflicts.length, count: visibleCount })}</p>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setVisibleCount((count) => count + 20)}>{offlineConflictText("showMore")}</button>
    </div> : null}
    {notice ? <p className="mt-2 text-xs leading-relaxed text-fg-2">{notice}</p> : null}
    {actionError ? <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">{actionError}</p> : null}
  </section>;
}
