import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { createStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { downloadStudioHybridDccFile, readStudioHybridDccWorkfile, studioHybridDccDownloadName } from "./studio-hybrid-dcc-file-io";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile, STUDIO_HYBRID_DCC_WORKFILE_MIME } from "./studio-hybrid-dcc-workfile";
import { workspaceExportActiveMesh, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

import type { StudioHybridDccRunResult } from "./studio-hybrid-dcc-tool-catalog";

export type StudioHybridDccFileRun = (
  label: string,
  operation: () => StudioHybridDccWorkspace | StudioHybridDccRunResult | Promise<StudioHybridDccWorkspace | StudioHybridDccRunResult>,
  canCommit?: () => boolean,
) => Promise<void>;

function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 파일 검증과 교체 확인은 문서·계정 세대에 묶고, 확정은 기존 실행 큐 한 곳으로 보낸다. */
export function useStudioHybridDccFileTools({ workspace, workspaceDocumentId, busy, run }: {
  readonly workspace: StudioHybridDccWorkspace;
  readonly workspaceDocumentId?: string;
  readonly busy: boolean;
  readonly run: StudioHybridDccFileRun;
}) {
  const bt = useBilingual("StudioHybridDccFileTools");
  const authRevision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const targetId = workspaceDocumentId ?? workspace.session.state.documentId;
  const owner = JSON.stringify([actor, authRevision, workspaceDocumentId ?? null, workspace.session.state.documentId]);
  const latest = useRef({ owner, workspace });
  latest.current = { owner, workspace };
  const live = useRef(true);
  const generation = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const confirming = useRef(false);
  const [reading, setReading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{
    readonly name: string;
    readonly workspace: StudioHybridDccWorkspace;
    readonly current: () => boolean;
  } | null>(null);

  useLayoutEffect(() => {
    generation.current += 1;
    readController.current?.abort(); readController.current = null;
    setPending(null); setReading(false); setOpening(false); setError(""); setNotice("");
    confirming.current = false;
  }, [owner, workspace]);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; generation.current += 1; readController.current?.abort(); };
  }, []);

  const currentLease = () => {
    const own = ++generation.current;
    const source = workspace;
    return () => live.current && generation.current === own && latest.current.owner === owner
      && latest.current.workspace === source && getAuthSessionRevision() === authRevision && getAuthUserId() === actor;
  };
  const cancel = () => {
    generation.current += 1; readController.current?.abort(); readController.current = null;
    setPending(null); setReading(false); setError("");
    setNotice(bt("파일 열기를 취소했습니다. 현재 작업은 그대로입니다.", "File opening cancelled. The current work is unchanged."));
  };
  const save = () => {
    if (busy || reading || opening) return;
    const current = currentLease();
    try {
      const bytes = encodeStudioHybridDccWorkfile(workspace);
      if (!current()) return;
      downloadStudioHybridDccFile(bytes, STUDIO_HYBRID_DCC_WORKFILE_MIME, studioHybridDccDownloadName(targetId, "toon3d"));
      setError(""); setNotice(bt(".toon3d 작업파일 다운로드를 요청했습니다.", "The .toon3d workfile download was requested."));
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : bt("작업파일을 저장하지 못했습니다.", "Could not save the workfile.")); }
  };
  const saveObj = () => {
    if (busy || reading || opening) return;
    const current = currentLease();
    try {
      const result = workspaceExportActiveMesh(workspace, "obj").lastExport;
      if (!result) throw new Error(bt("내보낼 원본 메시가 없습니다.", "There is no source mesh to export."));
      if (!current()) return;
      downloadStudioHybridDccFile(result.text, "text/plain;charset=utf-8", studioHybridDccDownloadName(workspace.activeAssetId ?? targetId, "obj"));
      setError(""); setNotice(bt("선택한 원본 메시의 로컬 좌표를 OBJ로 저장합니다. 작업 전체는 .toon3d로 보관하세요.", "The selected source mesh is saved as OBJ in local coordinates. Use .toon3d to keep the workspace."));
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : bt("OBJ 파일을 저장하지 못했습니다.", "Could not save the OBJ file.")); }
  };
  return {
    reading, opening, pending, error, notice,
    disabled: busy || reading || opening,
    canSaveObj: Boolean(workspace.activeAssetId),
    save, saveObj, cancel,
    open: async (file: File) => {
      if (busy || opening) return;
      readController.current?.abort();
      const controller = new AbortController(); readController.current = controller;
      const current = currentLease();
      setReading(true); setPending(null); setError(""); setNotice("");
      try {
        const bytes = await readStudioHybridDccWorkfile(file, controller.signal);
        if (!current()) return;
        const decoded = decodeStudioHybridDccWorkfile(bytes, { documentId: targetId });
        if (current()) setPending({ name: file.name, workspace: decoded, current });
      } catch (cause) {
        if (current() && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : bt("작업파일을 열지 못했습니다.", "Could not open the workfile."));
      } finally {
        if (readController.current === controller) readController.current = null;
        if (current()) setReading(false);
      }
    },
    confirm: async () => {
      if (!pending || busy || confirming.current || !pending.current()) return;
      const choice = pending;
      confirming.current = true; setPending(null); setOpening(true); setError("");
      try {
        await run(bt("작업파일 열기", "Open workfile"), () => {
          if (!choice.current()) throw new DOMException("현재 문서가 바뀌어 파일 열기를 중단했습니다.", "AbortError");
          return { workspace: choice.workspace, selection: createStudioHybridDccComponentSelection() };
        }, choice.current);
      } finally {
        if (live.current && latest.current.owner === owner) { confirming.current = false; setOpening(false); }
      }
    },
  };
}

export type StudioHybridDccFileToolsModel = ReturnType<typeof useStudioHybridDccFileTools>;
