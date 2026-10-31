import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioUvDefaultFields, studioUvTransformRequest, type StudioUvFields } from "./studio-hybrid-dcc-uv-editor-session";
import { workspacePackUvActive } from "./studio-hybrid-dcc-uv-pack-workspace";
import { useStudioHybridDccUvAtlas } from "./useStudioHybridDccUvAtlas";
import {
  createStudioHybridDccUvSelection,
  deriveStudioHybridDccUvEditorModel,
  workspaceTransformUvIslands,
  workspaceUnwrapUvActive,
  type StudioHybridDccUvMode,
  type StudioHybridDccUvSelection,
  type StudioHybridDccUvTransform,
} from "./studio-hybrid-dcc-uv-edit";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";
import type { StudioHybridDccUvAtlasRun } from "./studio-hybrid-dcc-uv-atlas-host";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

export interface StudioHybridDccUvEditorHost {
  readonly materialMode?: boolean;
  readonly workspaceDocumentId?: string;
  readonly onRunWorkspaceEdit?: (label: string, edit: StudioHybridDccWorkspaceEdit, canCommit?: () => boolean) => void;
  readonly onRunWorkspaceUvAtlas?: StudioHybridDccUvAtlasRun;
}
function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** 선택·임시 값만 보유한다. 커널 결과는 표시용 복사본이며 명시 적용 전에는 호스트에 발행하지 않는다. */
export function useStudioHybridDccUvEditor(
  props: StudioHybridDccViewportProps,
  host: StudioHybridDccUvEditorHost,
  otherPreviewActive: boolean,
) {
  const bt = useBilingual("StudioHybridDccUvEditor");
  const { workspace, editingDisabled = false } = props;
  const { materialMode = false, workspaceDocumentId, onRunWorkspaceEdit: run } = host;
  const authRevision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const owner = JSON.stringify([actor, authRevision, workspaceDocumentId, workspace.session.state.documentId]);
  const context = JSON.stringify([owner, materialMode, workspace.activeAssetId, workspace.session.state.stateHash, props.componentSelection]);
  const [islandIds, setIslandIds] = useState<readonly number[]>([]);
  const [cornerIds, setCornerIds] = useState<readonly number[]>([]);
  const [selectionMode, setSelectionMode] = useState<"island" | "corner">("island");
  const [kind, setKind] = useState<StudioHybridDccUvTransform["kind"]>("translate");
  const [fields, setFields] = useState<StudioUvFields>(() => studioUvDefaultFields("translate"));
  const [unwrapMode, setUnwrapMode] = useState<StudioHybridDccUvMode>("box");
  const [packMargin, setPackMargin] = useState("0.02");
  const [packRotate, setPackRotate] = useState(true);
  const [packError, setPackError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");
  const [operationError, setOperationError] = useState("");
  const atlas = useStudioHybridDccUvAtlas({ workspace, workspaceDocumentId, enabled: materialMode, editingDisabled,
    blocked: otherPreviewActive || dirty || applying, run: host.onRunWorkspaceUvAtlas });
  const sectionRef = useRef<HTMLElement>(null);
  const lock = useRef(false);
  const live = useRef(true);
  const epoch = useRef(0);
  const pending = useRef<{ readonly owner: string; readonly stateHash: string; readonly selection?: StudioHybridDccUvSelection } | null>(null);
  const latest = useRef({ context, workspace }); latest.current = { context, workspace };
  const [seenContext, setSeenContext] = useState(context);
  if (seenContext !== context) {
    setSeenContext(context); epoch.current += 1;
    const applied = pending.current?.owner === owner && pending.current.stateHash === workspace.session.state.stateHash;
    setIslandIds(applied ? pending.current?.selection?.islandIds ?? [] : []);
    setCornerIds(applied ? pending.current?.selection?.cornerIds ?? [] : []);
    setFields(studioUvDefaultFields(kind)); setDirty(false); setApplying(false); setOperationError(""); setPackError("");
    if (dirty || applying) setNotice(applied
      ? bt("UV를 적용했습니다. 되돌리기 한 번으로 복원할 수 있습니다.", "UVs applied. One undo step restores them.")
      : bt("문서·계정·선택이 바뀌어 UV 미리보기를 취소했습니다.", "The document, account or selection changed, so the UV preview was cancelled."));
    lock.current = false; pending.current = null;
  }
  useEffect(() => { live.current = true; return () => { live.current = false; epoch.current += 1; }; }, []);
  const source = useMemo(() => {
    try { return { model: deriveStudioHybridDccUvEditorModel(workspace), error: "" }; }
    catch (cause) { return { model: null, error: cause instanceof Error ? cause.message : bt("UV 원본을 읽지 못했습니다.", "Could not read the UV source.") }; }
  }, [bt, workspace]);
  const unavailable = !run ? bt("이 화면은 읽기 전용입니다.", "This view is read-only.")
    : otherPreviewActive ? bt("다른 메시 미리보기를 적용하거나 취소한 뒤 사용하세요.", "Apply or cancel the other mesh preview first.")
      : !workspace.activeAssetId ? bt("UV를 편집할 오브젝트를 선택하세요.", "Select an object to edit its UVs.") : null;
  const sameContext = seenContext === context;
  const selection = useMemo(() => source.model ? createStudioHybridDccUvSelection(workspace, sameContext ? islandIds : [], sameContext ? cornerIds : []) : null, [cornerIds, islandIds, sameContext, source.model, workspace]);
  const selectedCorners = useMemo(() => new Set([
    ...cornerIds, ...(source.model?.islands.filter(({ id }) => islandIds.includes(id)).flatMap(({ cornerIds: ids }) => ids) ?? []),
  ]), [cornerIds, islandIds, source.model]);
  const candidate = useMemo(() => {
    if (!sameContext || !materialMode || !dirty || !selection || unavailable) return { result: null, request: null, error: "", neutral: false };
    const request = studioUvTransformRequest(kind, fields);
    if (!request) return { result: null, request: null, error: bt("UV 값에 유한한 숫자를 입력하세요.", "Enter finite numbers for the UV transform."), neutral: false };
    try {
      const result = workspaceTransformUvIslands(workspace, selection, request);
      const unchanged = result.workspace.session.state.stateHash === workspace.session.state.stateHash;
      return { result: unchanged ? null : result, request, error: "", neutral: unchanged };
    } catch (cause) { return { result: null, request, error: cause instanceof Error ? cause.message : bt("UV를 변형할 수 없습니다.", "Could not transform the UVs."), neutral: false }; }
  }, [bt, dirty, fields, kind, materialMode, sameContext, selection, unavailable, workspace]);
  const displayModel = useMemo(() => candidate.result ? deriveStudioHybridDccUvEditorModel(candidate.result.workspace) : source.model, [candidate.result, source.model]);
  const locked = editingDisabled || applying || atlas.busy || Boolean(unavailable);
  const resetDraft = () => { setFields(studioUvDefaultFields(kind)); setDirty(false); setOperationError(""); setNotice(""); };
  const cancel = () => {
    if (applying) return;
    epoch.current += 1; resetDraft(); setNotice(bt("UV 미리보기를 취소했습니다. 원본과 편집 이력은 그대로입니다.", "UV preview cancelled. The source and edit history are unchanged."));
  };
  const cancelFromKey = useEffectEvent(cancel);
  useEffect(() => {
    if (!dirty || applying || !materialMode) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || !(event.target instanceof Element) || !sectionRef.current?.contains(event.target)) return;
      const innerScope = event.target.closest('[role="dialog"], [aria-modal="true"], [data-studio-escape-scope="true"]');
      if (innerScope && !innerScope.contains(sectionRef.current)) return;
      event.preventDefault(); event.stopPropagation(); cancelFromKey();
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [applying, dirty, materialMode]);
  useEffect(() => {
    if (!applying || editingDisabled) return;
    const timer = setTimeout(() => { lock.current = false; pending.current = null; setApplying(false); setOperationError(bt("UV 적용을 확인하지 못했습니다. 작업 기록을 확인하세요.", "The UV edit could not be confirmed. Check the activity log.")); }, 0);
    return () => clearTimeout(timer);
  }, [applying, bt, editingDisabled]);
  const lease = () => {
    const captured = epoch.current;
    return () => live.current && epoch.current === captured && latest.current.context === context && latest.current.workspace === workspace
      && getAuthSessionRevision() === authRevision && getAuthUserId() === actor;
  };
  const execute = (label: string, operation: (current: typeof workspace) => { readonly workspace: typeof workspace; readonly selection?: StudioHybridDccUvSelection }) => {
    if (locked || !run || lock.current) return;
    const current = lease(); lock.current = true; setApplying(true); setOperationError("");
    run(label, (currentWorkspace, componentSelection) => {
      try {
        if (!current() || currentWorkspace !== workspace) throw new Error(bt("문서나 UV 선택이 바뀌었습니다. 다시 선택하세요.", "The document or UV selection changed. Select again."));
        const result = operation(currentWorkspace);
        if (result.workspace === currentWorkspace) { lock.current = false; setApplying(false); setNotice(bt("UV에 바뀐 값이 없습니다.", "The UVs are unchanged.")); }
        pending.current = { owner, stateHash: result.workspace.session.state.stateHash, selection: result.selection };
        return { workspace: result.workspace, selection: componentSelection };
      } catch (cause) {
        lock.current = false; setApplying(false);
        setOperationError(cause instanceof Error ? cause.message : bt("UV 적용에 실패했습니다.", "Could not apply the UV edit.")); throw cause;
      }
    }, current);
  };
  return {
    sectionRef, visible: materialMode, sourceModel: source.model, displayModel, selectionMode, islandIds, cornerIds, selectedCorners, atlas,
    kind, fields, unwrapMode, packMargin, packRotate, packError, dirty, applying, locked, unavailable, selectedCount: selectedCorners.size,
    previewing: Boolean(candidate.result), canApply: Boolean(candidate.result && !locked),
    error: operationError || candidate.error || packError || source.error,
    notice: notice || (candidate.result ? bt("2D와 3D 화면은 미리보기입니다. 적용하면 한 번의 편집으로 기록됩니다.", "The 2D and 3D views show a preview. Apply records one edit.") : candidate.neutral ? bt("변경할 값을 입력하세요.", "Enter a value that changes the selection.") : ""),
    setUnwrapMode,
    setPackMargin: (text: string) => { if (locked || dirty) return; setPackMargin(text); setPackError(""); setOperationError(""); },
    setPackRotate: (rotate: boolean) => { if (locked || dirty) return; setPackRotate(rotate); setPackError(""); setOperationError(""); },
    pack: () => {
      if (locked || dirty || !source.model) return;
      const margin = packMargin.trim() === "" ? NaN : Number(packMargin);
      if (!Number.isFinite(margin)) { setPackError(bt("UV 여백에 유한한 숫자를 입력하세요.", "Enter a finite number for the UV margin.")); return; }
      if (margin < 0 || margin > 0.25) { setPackError(bt("UV 여백은 0 이상 0.25 이하로 입력하세요.", "Enter a UV margin from 0 to 0.25.")); return; }
      execute(bt("UV 아일랜드 정리", "Pack UV islands"), (current) => ({ workspace: workspacePackUvActive(current, { margin, rotate: packRotate }) }));
    },
    setSelectionMode: (mode: "island" | "corner") => { if (locked) return; epoch.current += 1; setSelectionMode(mode); setIslandIds([]); setCornerIds([]); resetDraft(); },
    select: (id: number, additive: boolean) => {
      if (locked || !source.model) return;
      epoch.current += 1; resetDraft();
      const update = (ids: readonly number[]) => additive ? ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] : [id];
      if (selectionMode === "island") setIslandIds(update); else setCornerIds(update);
    },
    selectAll: () => { if (locked || !source.model) return; epoch.current += 1; resetDraft(); if (selectionMode === "island") setIslandIds(source.model.islands.map(({ id }) => id)); else setCornerIds(source.model.corners.map(({ halfEdgeId }) => halfEdgeId)); },
    clearSelection: () => { if (locked) return; epoch.current += 1; setIslandIds([]); setCornerIds([]); resetDraft(); },
    setKind: (next: StudioHybridDccUvTransform["kind"]) => { if (locked) return; setKind(next); setFields(studioUvDefaultFields(next)); setDirty(false); setOperationError(""); setNotice(""); },
    setField: (axis: keyof StudioUvFields, value: string) => { if (locked) return; setFields((current) => ({ ...current, [axis]: value })); setDirty(true); setOperationError(""); setNotice(""); },
    dragTranslate: (u: number, v: number) => { if (locked || !selectedCorners.size) return; setKind("translate"); setFields({ u: String(u), v: String(v), angle: "0" }); setDirty(true); setOperationError(""); setNotice(""); },
    cancel,
    apply: () => { const request = candidate.request; if (candidate.result && request && selection) execute(bt("UV 선택 변형", "Transform selected UVs"), (current) => workspaceTransformUvIslands(current, selection, request)); },
    unwrap: () => execute(bt("UV 펼치기", "Unwrap UVs"), (current) => ({ workspace: workspaceUnwrapUvActive(current, unwrapMode) })),
    viewportProps: candidate.result ? { ...props, workspace: candidate.result.workspace, editingDisabled: true } : atlas.busy ? { ...props, editingDisabled: true } : props,
  };
}

export type StudioHybridDccUvEditorState = ReturnType<typeof useStudioHybridDccUvEditor>;
