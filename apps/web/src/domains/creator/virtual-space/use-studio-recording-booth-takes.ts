import { useCallback, useEffect, useRef, useState } from "react";

import { studioRecordingTakeToProjectAsset, type StudioRecordingTake } from "./studio-virtual-space-recording-booth";
import type { StudioVirtualSpaceRecordedTake, UseStudioVirtualSpaceRecordingBoothInput } from "./use-studio-virtual-space-recording-booth";

const drafts = () => import("./studio-recording-booth-drafts");

export function useStudioRecordingBoothTakes(
  { draftScope, isGuest, projectId, onProjectAsset, onRequireLogin }: UseStudioVirtualSpaceRecordingBoothInput,
  setError: (message: string) => void,
  setLoginNudge: (active: boolean) => void,
) {
  const [takes, setTakes] = useState<readonly StudioVirtualSpaceRecordedTake[]>([]);
  const active = useRef(false);
  const saving = useRef(new Set<string>());
  useEffect(() => {
    active.current = true;
    let current = true;
    if (draftScope) void drafts().then(store => store.listStudioBoothDrafts(draftScope)).then(rows => {
      if (!current) return;
      setTakes(live => [...rows.filter(row => !live.some(entry => entry.take.id === row.take.id)).map(row => ({
        take: row.take, blob: null, addedToProject: false, saveState: "idle" as const, onDevice: true,
      })), ...live]);
    }).catch(() => { if (current) setError("local-load-failed"); });
    return () => { current = false; active.current = false; };
  }, [draftScope, setError]);

  const append = useCallback(async (take: StudioRecordingTake, blob: Blob | null) => {
    let onDevice = false;
    if (draftScope && blob) {
      try {
        await (await drafts()).saveStudioBoothDraft(draftScope, take, blob);
        onDevice = true;
      } catch { if (active.current) setError("local-save-failed"); }
    }
    if (active.current) setTakes(previous => [...previous.filter(item => item.take.id !== take.id),
      { take, blob, addedToProject: false, saveState: "idle", onDevice }]);
  }, [draftScope, setError]);

  const update = (id: string, patch: Partial<StudioVirtualSpaceRecordedTake>) => {
    if (active.current) setTakes(rows => rows.map(item => item.take.id === id ? { ...item, ...patch } : item));
  };

  async function getBlob(item: StudioVirtualSpaceRecordedTake) {
    if (item.blob || !item.onDevice || !draftScope) return item.blob;
    return (await drafts()).readStudioBoothDraft(draftScope, item.take.id);
  }

  async function downloadTake(id: string) {
    const item = takes.find(row => row.take.id === id);
    if (!item) return;
    try {
      const blob = await getBlob(item);
      if (!blob) throw new Error();
      const { downloadBlob } = await import("../export/studio-export");
      if (active.current) downloadBlob(blob, `${item.take.id}.webm`);
    } catch { if (active.current) setError("local-read-failed"); }
  }

  async function discardTake(id: string) {
    const item = takes.find(row => row.take.id === id);
    if (!item || saving.current.has(id) || item.addedToProject) return;
    saving.current.add(id);
    try {
      if (draftScope && item.onDevice) await (await drafts()).removeStudioBoothDraft(draftScope, id);
      if (active.current) setTakes(rows => rows.filter(row => row.take.id !== id));
    } catch { if (active.current) setError("local-remove-failed"); }
    finally { saving.current.delete(id); }
  }

  function addTakeToProject(id: string) {
    const item = takes.find(row => row.take.id === id);
    if (!item || item.addedToProject || saving.current.has(id)) return;
    if (isGuest) { setLoginNudge(true); onRequireLogin?.(); return; }
    if (!projectId) { setError("project-required"); return; }
    if (!onProjectAsset) { update(id, { saveState: "failed" }); return; }
    saving.current.add(id);
    update(id, { saveState: "saving" });
    void (async () => {
      try {
        const blob = item.blob || !item.onDevice ? item.blob : await getBlob(item);
        if (!active.current) return;
        if (await onProjectAsset(studioRecordingTakeToProjectAsset(item.take, projectId), blob) === false) throw new Error();
        update(id, { addedToProject: true, saveState: "saved" });
        if (draftScope && item.onDevice) {
          try {
            await (await drafts()).removeStudioBoothDraft(draftScope, id);
            update(id, { onDevice: false });
          } catch { if (active.current) setError("local-cleanup-failed"); }
        }
      } catch { update(id, { saveState: "failed" }); }
      finally { saving.current.delete(id); }
    })();
  }
  return { takes, append, addTakeToProject, downloadTake, discardTake };
}
