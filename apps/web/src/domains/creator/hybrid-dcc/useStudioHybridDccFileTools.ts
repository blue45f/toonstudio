import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { createStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { downloadStudioHybridDccFile, readStudioHybridDccWorkfile, studioHybridDccDownloadName } from "./studio-hybrid-dcc-file-io";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { decodeWorkfileInWorker, encodeWorkfileInWorker } from "./studio-hybrid-dcc-workfile-worker-client";
import { STUDIO_HYBRID_DCC_WORKFILE_MIME } from "./studio-hybrid-dcc-workfile";
import { workspaceExportActiveMesh, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { resolveStudioHybridDccExportToonMaterials } from "./materials/studio-hybrid-dcc-toon-export";

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
  const fileController = useRef<AbortController | null>(null);
  const confirming = useRef(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    fileController.current?.abort(); fileController.current = null;
    setPending(null); setReading(false); setSaving(false); setOpening(false); setError(""); setNotice("");
    confirming.current = false;
  }, [owner, workspace]);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; generation.current += 1; fileController.current?.abort(); };
  }, []);

  const currentLease = () => {
    const own = ++generation.current;
    const source = workspace;
    return () => live.current && generation.current === own && latest.current.owner === owner
      && latest.current.workspace === source && getAuthSessionRevision() === authRevision && getAuthUserId() === actor;
  };
  const cancel = () => {
    generation.current += 1; fileController.current?.abort(); fileController.current = null;
    setPending(null); setReading(false); setSaving(false); setError("");
    setNotice(bt("파일 작업을 취소했습니다.", "File operation cancelled."));
  };
  const save = async () => {
    if (busy || fileController.current || opening) return;
    const controller = new AbortController();
    fileController.current = controller;
    setSaving(true); setNotice(""); setError("");
    const current = currentLease();
    try {
      const bytes = await encodeWorkfileInWorker(workspace, controller.signal);
      if (!current()) return;
      downloadStudioHybridDccFile(bytes, STUDIO_HYBRID_DCC_WORKFILE_MIME, studioHybridDccDownloadName(targetId, "toon3d"));
      setError(""); setNotice(bt(".toon3d 작업파일 다운로드를 요청했습니다.", "The .toon3d workfile download was requested."));
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : bt("작업파일을 저장하지 못했습니다.", "Could not save the workfile.")); }
    finally {
      if (fileController.current === controller) fileController.current = null;
      if (current()) setSaving(false);
    }
  };
  const saveObj = () => {
    if (busy || fileController.current || opening) return;
    const current = currentLease();
    try {
      const result = workspaceExportActiveMesh(workspace, "obj").lastExport;
      if (!result) throw new Error(bt("내보낼 원본 메시가 없습니다.", "There is no source mesh to export."));
      if (!current()) return;
      downloadStudioHybridDccFile(result.text, "text/plain;charset=utf-8", studioHybridDccDownloadName(workspace.activeAssetId ?? targetId, "obj"));
      setError(""); setNotice(bt("선택한 원본 메시의 로컬 좌표를 OBJ로 저장합니다. 작업 전체는 .toon3d로 보관하세요.", "The selected source mesh is saved as OBJ in local coordinates. Use .toon3d to keep the workspace."));
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : bt("OBJ 파일을 저장하지 못했습니다.", "Could not save the OBJ file.")); }
  };
  const saveGlb = () => {
    if (busy || fileController.current || opening) return;
    const current = currentLease();
    try {
      const assetId = workspace.activeAssetId;
      const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
      if (!assetId || !record) throw new Error(bt("내보낼 원본 메시가 없습니다.", "There is no source mesh to export."));
      if (record.modifierStack.modifiers.length > 0) {
        throw new Error(bt("비파괴 변형이 적용되어 있습니다. 먼저 변형을 원본 메시로 확정한 뒤 GLB로 저장하세요.", "Non-destructive modifiers are active. Apply the modifier stack before exporting GLB."));
      }
      const actualSlots = new Set(record.mesh.faces.map(({ materialSlot }) => materialSlot));
      const toonMaterials = resolveStudioHybridDccExportToonMaterials(workspace.session.state.materials, assetId, actualSlots);
      const exported = exportStudioHybridDccMeshGlb({
        assetId, mesh: record.mesh, sourceRevision: record.revision, sourceHash: record.meshHash,
        ...(toonMaterials ? { toonMaterials } : {}),
      });
      if (!exported.ok) {
        throw new Error(exported.report.errors[0]?.detail ?? bt("GLB 파일을 생성하지 못했습니다.", "Could not generate the GLB file."));
      }
      if (!current()) return;
      downloadStudioHybridDccFile(exported.bytes, exported.mimeType, studioHybridDccDownloadName(assetId, "glb"));
      setError(""); setNotice(bt("선택한 메시를 표준 GLB 2.0 바이너리로 저장했습니다.", "Saved the selected mesh as a standard GLB 2.0 binary."));
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : bt("GLB 파일을 저장하지 못했습니다.", "Could not save the GLB file.")); }
  };
  const saveStl = () => {
    if (busy || fileController.current || opening) return;
    const current = currentLease();
    try {
      const result = workspaceExportActiveMesh(workspace, "stl").lastExport;
      if (!result) throw new Error(bt("내보낼 원본 메시가 없습니다.", "There is no source mesh to export."));
      if (!current()) return;
      downloadStudioHybridDccFile(result.text, "model/stl;charset=utf-8", studioHybridDccDownloadName(workspace.activeAssetId ?? targetId, "stl"));
      setError(""); setNotice(bt("선택한 메시를 3D 프린팅·CAD 호환 STL로 저장했습니다.", "Saved the selected mesh as CAD/3D-printing STL."));
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : bt("STL 파일을 저장하지 못했습니다.", "Could not save the STL file.")); }
  };
  return {
    reading, saving, opening, pending, error, notice,
    disabled: busy || reading || saving || opening,
    canSaveObj: Boolean(workspace.activeAssetId),
    save, saveObj, saveGlb, saveStl, cancel,
    open: async (file: File) => {
      if (busy || saving || opening) return;
      fileController.current?.abort();
      const controller = new AbortController(); fileController.current = controller;
      const current = currentLease();
      setReading(true); setPending(null); setError(""); setNotice("");
      try {
        const bytes = await readStudioHybridDccWorkfile(file, controller.signal);
        if (!current()) return;
        const decoded = await decodeWorkfileInWorker(bytes, targetId, controller.signal);
        if (current()) setPending({ name: file.name, workspace: decoded, current });
      } catch (cause) {
        if (current() && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : bt("작업파일을 열지 못했습니다.", "Could not open the workfile."));
      } finally {
        if (fileController.current === controller) fileController.current = null;
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
