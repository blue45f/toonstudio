import { parseAiOperationsSnapshot } from "@toonstudio/contracts/ai-operations";
import { useCallback, useEffect, useRef, useState } from "react";


import { AdminApiError } from "../../../platform/http/admin-api";

import { loadAiOperations, saveAiOperations } from "./ai-operations-api";

import type { AiOperationsView, BoardSnapshot } from "@toonstudio/contracts/ai-operations";

export function useAiOperationsBoard(userIdentity: string) {
  const [server, setServer] = useState<AiOperationsView | null>(null);
  const [draft, setDraft] = useState<BoardSnapshot | null>(null);
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [conflict, setConflict] = useState(false);
  const sequence = useRef(0); const active = useRef(true); const request = useRef<AbortController | null>(null);
  const mutation = useRef<{ encoded: string; revision: number; id: string } | null>(null);
  const busyRef = useRef(false);
  const load = useCallback(async () => {
    if (!userIdentity.trim()) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const current = ++sequence.current; setBusy(true); busyRef.current = true; setError("");
    try {
      const result = await loadAiOperations(controller.signal);
      if (!active.current || controller.signal.aborted || current !== sequence.current) return;
      setServer(result); setDraft(result.snapshot); setDirty(false); setConflict(false); mutation.current = null;
      setNotice("저장된 운영 기록을 불러왔습니다. 외부 근거를 새로 수집한 것은 아닙니다.");
    } catch (cause) {
      if (!active.current || controller.signal.aborted || current !== sequence.current) return;
      setError(cause instanceof Error ? cause.message : "운영 기록을 읽지 못했습니다.");
      if (cause instanceof AdminApiError && [401, 403].includes(cause.status)) { setServer(null); setDraft(null); setDirty(false); }
    } finally { if (active.current && current === sequence.current) { setBusy(false); busyRef.current = false; } }
  }, [userIdentity]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; sequence.current += 1; request.current?.abort(); }; }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function replaceDraft(next: BoardSnapshot): string | null {
    if (!server?.canEdit || busyRef.current) return "현재 기록을 편집할 수 없습니다.";
    try { const parsed = parseAiOperationsSnapshot(next, server.snapshot ?? undefined); setDraft(parsed); setDirty(true); setNotice("화면에 변경을 적용했습니다. 서버에 저장을 눌러 확정하세요."); return null; }
    catch (cause) { return cause instanceof Error ? cause.message : "기록을 확인하세요."; }
  }
  async function save(): Promise<void> {
    if (!server?.canEdit || !draft || !dirty || conflict || busyRef.current) return;
    const current = sequence.current; busyRef.current = true; setBusy(true); setError("");
    try {
      const snapshot = parseAiOperationsSnapshot(draft, server.snapshot ?? undefined); const encoded = JSON.stringify(snapshot);
      if (!mutation.current || mutation.current.encoded !== encoded || mutation.current.revision !== server.revision) mutation.current = { encoded, revision: server.revision, id: crypto.randomUUID() };
      const result = await saveAiOperations({ expectedRevision: server.revision, mutationId: mutation.current.id, snapshot });
      if (!active.current || current !== sequence.current) return;
      setServer(result); setDraft(result.snapshot); setDirty(false); setConflict(false); mutation.current = null;
      setNotice("공용 운영 기록과 변경 이력을 서버에 저장했습니다. 운영 작업은 실행하지 않았습니다.");
    } catch (cause) {
      if (!active.current || current !== sequence.current) return;
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다. 입력한 기록은 현재 화면에 남아 있습니다.");
      if (cause instanceof AdminApiError && cause.status === 409) setConflict(true);
      if (cause instanceof AdminApiError && [401, 403].includes(cause.status)) { setServer(null); setDraft(null); setDirty(false); }
    } finally { if (active.current && current === sequence.current) { busyRef.current = false; setBusy(false); } }
  }
  return { server, draft, dirty, busy, error, notice, conflict, load, save, replaceDraft };
}
