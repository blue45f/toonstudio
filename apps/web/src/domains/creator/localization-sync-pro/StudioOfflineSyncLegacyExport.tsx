import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/shared/lib/i18n";

import { OfflineSyncLegacyExportError, readOfflineSyncLegacySnapshot, type OfflineSyncLegacySource } from "./studio-offline-sync-legacy-export";
import { OFFLINE_SYNC_COPY } from "./studio-offline-sync-storage-copy";

export function StudioOfflineSyncLegacyExport({ projectId }: { readonly projectId: string }) {
  return <OfflineSyncLegacyExportSession key={projectId} projectId={projectId} />;
}

function OfflineSyncLegacyExportSession({ projectId }: { readonly projectId: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  useLayoutEffect(() => () => { generation.current += 1; }, [projectId]);

  const exportCopy = async (source: OfflineSyncLegacySource) => {
    const token = ++generation.current;
    const label = source === "local-storage" ? "localStorage" : "IndexedDB";
    setBusy(true);
    setNotice(`${label}: ${t(OFFLINE_SYNC_COPY.reading)}`);
    try {
      const raw = await readOfflineSyncLegacySnapshot(projectId, source);
      if (token !== generation.current) return;
      if (raw === null) { setNotice(`${label}: ${t(OFFLINE_SYNC_COPY.absent)}`); return; }
      const { downloadBlob } = await import("../export/studio-export");
      if (token !== generation.current) return;
      downloadBlob(new Blob([raw], { type: "application/json" }), `toonstudio-offline-sync-${source}-original.json`);
      setNotice(`${label}: ${t(OFFLINE_SYNC_COPY.exported)}`);
    } catch (error) {
      if (token !== generation.current) return;
      const code = error instanceof OfflineSyncLegacyExportError ? error.code : "unavailable";
      setNotice(`${label}: ${t(OFFLINE_SYNC_COPY[code])}`);
    } finally { if (token === generation.current) setBusy(false); }
  };

  return <aside className="mt-3 space-y-2 rounded-xl border border-line bg-panel p-3" aria-label={t(OFFLINE_SYNC_COPY.recovery)}>
    <h4 className="text-sm font-bold text-fg">{t(OFFLINE_SYNC_COPY.recovery)}</h4>
    <p className="text-xs text-fg-2">{t(OFFLINE_SYNC_COPY.recoveryHint)}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void exportCopy("local-storage")} className="min-h-11 rounded-lg border border-line px-3 text-xs font-semibold text-fg focus-visible:ring-2 focus-visible:ring-accent">{t(OFFLINE_SYNC_COPY.localStorage)}</button>
      <button type="button" disabled={busy} onClick={() => void exportCopy("indexeddb")} className="min-h-11 rounded-lg border border-line px-3 text-xs font-semibold text-fg focus-visible:ring-2 focus-visible:ring-accent">{t(OFFLINE_SYNC_COPY.indexeddb)}</button>
    </div>
    {notice ? <p role="status" className="text-xs text-fg-2">{notice}</p> : null}
  </aside>;
}
