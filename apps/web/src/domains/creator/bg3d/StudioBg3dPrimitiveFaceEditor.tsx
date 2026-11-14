import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Redo2, Undo2, X } from "lucide-react";
import { useT } from "@/shared/lib/i18n";
import { activateStudioModalSheet } from "../useStudioModalSheet";
import { StudioHybridDccViewport as Viewport } from "../hybrid-dcc/StudioHybridDccViewportCore";
import { StudioHybridDccFaceModelingTools } from "../hybrid-dcc/StudioHybridDccFaceModelingTools";
import { useStudioHybridDccFaceModeling } from "../hybrid-dcc/useStudioHybridDccFaceModeling";
import { mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { workspaceComponentSelectionSource, workspaceReconcileSelectionAfterHistory, workspaceRedo, workspaceUndo } from "../hybrid-dcc/studio-hybrid-dcc-workspace";

import type { StudioBg3dFaceEditWorkspace } from "./studio-bg3d-face-edit-workspace";
import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioHybridDccViewportProps } from "../hybrid-dcc/StudioHybridDccViewportCore";
import type { StudioHybridDccWorkspaceEdit } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";

export type StudioBg3dPrimitiveFaceApplyResult = { readonly ok: true } | { readonly ok: false; readonly messageKo: string };
export interface StudioBg3dPrimitiveFaceEditorProps {
  readonly context: StudioBg3dFaceEditWorkspace;
  readonly onClose: () => void;
  readonly onApply: (context: StudioBg3dFaceEditWorkspace, workspace: StudioHybridDccWorkspace, signal: AbortSignal) => Promise<StudioBg3dPrimitiveFaceApplyResult>;
}

const BUTTON = "inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
const NEUTRAL_BUTTON = `${BUTTON} bg-panel text-fg`;

/** 선택한 원본의 권위만 가진 임시 면 편집기다. 프로젝트의 다른 DCC 작업공간을 덮지 않는다. */
export function StudioBg3dPrimitiveFaceEditor({ context, onClose, onApply }: StudioBg3dPrimitiveFaceEditorProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const [workspace, setWorkspace] = useState(context.workspace);
  const [selection, setSelection] = useState(context.selection);
  const current = useRef({ workspace, selection });
  current.current = { workspace, selection };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const close = useEffectEvent(() => { if (!busyRef.current) onClose(); });
  useLayoutEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    const body = element?.ownerDocument.body;
    const previousOverflow = body?.style.overflow;
    if (body) body.style.overflow = "hidden";
    const deactivate = element ? activateStudioModalSheet({ dialog: element, document: element.ownerDocument,
      root: element.ownerDocument.body, initialFocus: closeButton.current, onDismiss: close }) : () => {};
    return () => {
      mounted.current = false; controller.current?.abort("primitive-editor-closed"); deactivate();
      if (body) body.style.overflow = previousOverflow ?? "";
    };
  }, []);

  const run = (_label: string, edit: StudioHybridDccWorkspaceEdit) => {
    if (busyRef.current) return;
    try {
      const result = edit(current.current.workspace, current.current.selection);
      const nextSelection = workspaceReconcileSelectionAfterHistory(result.workspace, result.selection ?? current.current.selection);
      current.current = { workspace: result.workspace, selection: nextSelection };
      setWorkspace(result.workspace); setSelection(nextSelection); setMessage("");
    } catch {
      setMessage(t("studio.bg3d.primitiveEdit.editFailed", "면 편집을 확정하지 못했습니다. 도구의 오류 안내를 확인해 주세요."));
    }
  };
  const selectFace: NonNullable<StudioHybridDccViewportProps["onSelectComponent"]> = (assetId, mode, elementId, operation) => {
    if (busyRef.current || assetId !== context.assetId || mode !== "face") return;
    const source = workspaceComponentSelectionSource(current.current.workspace);
    if (!source) return;
    const result = mutateStudioHybridDccComponentSelection(current.current.selection, {
      mode: "face", operation, ids: [elementId], activeId: elementId, source,
    });
    if (result.ok) { current.current = { ...current.current, selection: result.value }; setSelection(result.value); }
  };
  const clearFace = () => {
    const source = workspaceComponentSelectionSource(current.current.workspace);
    if (busyRef.current || !source) return;
    const result = mutateStudioHybridDccComponentSelection(current.current.selection, { mode: "face", operation: "replace", ids: [], activeId: null, source });
    if (result.ok) { current.current = { ...current.current, selection: result.value }; setSelection(result.value); }
  };
  const viewportProps: StudioHybridDccViewportProps = { workspace, componentSelection: selection,
    onSelectAsset: (assetId) => { if (assetId === null) clearFace(); }, onSelectComponent: selectFace,
    onClearComponentSelection: clearFace, editingDisabled: busy,
    interactionDescription: t("studio.bg3d.primitiveEdit.viewportHelp", "마우스 왼쪽 드래그로 회전하고 오른쪽 드래그로 이동하며 휠로 확대합니다. 원본의 면을 클릭해 선택하고 Shift로 추가, Ctrl로 전환, Alt로 뺍니다. 도구의 미리보기를 확정한 뒤 배경 원본에 반영하세요. Ctrl 또는 Cmd와 Z는 면 편집 실행 취소, Shift와 Z 또는 Y는 다시 실행입니다. Escape는 진행 중인 미리보기를 취소하고, 미리보기가 없으면 면 편집기를 닫습니다."),
    onComponentSelectionError: () => setMessage(t("studio.bg3d.primitiveEdit.selectionFailed", "이 면을 선택하지 못했습니다. 다른 면을 다시 클릭하세요.")) };
  const tools = useStudioHybridDccFaceModeling(viewportProps, run);
  const previewActive = tools.engaged || tools.pending || tools.committing;
  const activeRecord = workspace.session.state.geometry.records[context.assetId];
  const changed = activeRecord?.meshHash !== context.initialMeshHash;
  const history = (direction: "undo" | "redo") => {
    if (busyRef.current || previewActive) return;
    if (direction === "undo" && current.current.workspace.session.undoStack.length <= context.initialUndoDepth) return;
    if (direction === "redo" && current.current.workspace.session.redoStack.length === 0) return;
    const next = direction === "undo" ? workspaceUndo(current.current.workspace) : workspaceRedo(current.current.workspace);
    const aligned = workspaceReconcileSelectionAfterHistory(next, current.current.selection);
    current.current = { workspace: next, selection: aligned }; setWorkspace(next); setSelection(aligned); setMessage("");
  };
  const handleHistoryKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.isComposing) return;
    if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault(); event.stopPropagation();
    history(key === "y" || event.shiftKey ? "redo" : "undo");
  });
  useEffect(() => {
    const element = dialog.current;
    element?.addEventListener("keydown", handleHistoryKey);
    return () => element?.removeEventListener("keydown", handleHistoryKey);
  }, []);
  const apply = async () => {
    if (busyRef.current || !changed || previewActive) return;
    busyRef.current = true; setBusy(true); setMessage("");
    const request = new AbortController(); controller.current = request;
    try {
      const result = await onApply(context, current.current.workspace, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      if (result.ok) onClose(); else setMessage(result.messageKo);
    } catch {
      if (mounted.current && !request.signal.aborted) setMessage(t("studio.bg3d.primitiveEdit.applyFailed", "편집 결과를 원본에 반영하지 못했습니다. 다시 시도하세요."));
    } finally {
      if (controller.current === request) controller.current = null;
      busyRef.current = false; if (mounted.current) setBusy(false);
    }
  };
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[160] flex items-center justify-center bg-canvas/85 p-0 backdrop-blur-sm sm:p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} data-studio-shortcut-boundary="true"
      className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden border border-line bg-panel text-fg shadow-2xl sm:h-[94dvh] sm:max-w-[1500px] sm:rounded-2xl">
      <header className="flex min-h-14 items-center gap-2 border-b border-line px-3">
        <div className="min-w-0 flex-1"><h2 id={titleId} className="text-sm font-bold">{context.kind === "authored-model"
          ? t("studio.bg3d.primitiveEdit.modelTitle", "선택한 편집 모델 면 편집") : t("studio.bg3d.primitiveEdit.title", "선택한 상자 면 편집")}</h2>
          <p className="truncate text-xs text-fg-2">{context.displayName || t("studio.bg3d.primitiveEdit.unnamed", "원본 메시")}</p></div>
        <button ref={closeButton} className={NEUTRAL_BUTTON} type="button" disabled={busy} onClick={() => { if (!busyRef.current) onClose(); }} aria-label={t("studio.bg3d.primitiveEdit.close", "면 편집 닫기")}><X size={18} aria-hidden /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-xs text-fg-2">{t("studio.bg3d.primitiveEdit.intro", "실제 원본의 면을 클릭해 편집하세요. 도구에서 먼저 확정한 뒤 배경 원본에 반영합니다. 면 치수는 도형의 로컬 단위이며 원래 위치·회전·배율을 유지합니다.")}</p>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]">
          <div className="min-w-0"><Viewport {...tools.viewportProps} /></div>
          <aside className="min-w-0"><StudioHybridDccFaceModelingTools model={tools} /></aside>
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
        <button type="button" className={NEUTRAL_BUTTON} disabled={busy || previewActive || workspace.session.undoStack.length <= context.initialUndoDepth}
          onClick={() => history("undo")}><Undo2 size={16} aria-hidden />{t("studio.bg3d.primitiveEdit.undo", "면 편집 실행 취소")}</button>
        <button type="button" className={NEUTRAL_BUTTON} disabled={busy || previewActive || workspace.session.redoStack.length === 0}
          onClick={() => history("redo")}><Redo2 size={16} aria-hidden />{t("studio.bg3d.primitiveEdit.redo", "면 편집 다시 실행")}</button>
        <p role={message ? "alert" : "status"} className={`min-w-0 flex-1 text-xs ${message ? "text-danger" : "text-fg-2"}`}>
          {message || (previewActive ? t("studio.bg3d.primitiveEdit.finishPreview", "도구의 미리보기를 확정하거나 취소한 뒤 원본에 반영하세요.") : t("studio.bg3d.primitiveEdit.beforeApply", "배경 원본은 반영 버튼을 누를 때 변경됩니다."))}
        </p>
        <button type="button" className={`${BUTTON} bg-accent text-on-accent`} disabled={busy || previewActive || !changed} onClick={() => { void apply(); }}>
          {busy ? t("studio.bg3d.primitiveEdit.applying", "배경 원본에 반영 중") : t("studio.bg3d.primitiveEdit.apply", "배경 원본에 반영")}
        </button>
      </footer>
    </div>
  </div>, document.body);
}
