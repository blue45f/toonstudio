import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";
import { readStudioHybridDccToonBindings, type StudioHybridDccToonMaterialPreview } from "./studio-hybrid-dcc-toon-projection";
import { studioToonEditorFields, studioToonEditorRequest, studioToonEditorWidthMode, type StudioToonEditorFields } from "./studio-hybrid-dcc-toon-editor-session";
import { workspaceSetStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-workspace";

import type { StudioHybridDccViewportProps } from "../StudioHybridDccViewportCore";
import type { StudioHybridDccUvEditorHost } from "../useStudioHybridDccUvEditor";

function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** 재질 초안을 계정·프로젝트·원본 문서 세대에 묶고 명시 적용할 때만 command를 발행한다. */
export function useStudioHybridDccToonEditor(props: StudioHybridDccViewportProps, host: StudioHybridDccUvEditorHost, enabled: boolean) {
  const bt = useBilingual("StudioHybridDccToonEditor");
  const { workspace, editingDisabled = false } = props;
  const { workspaceDocumentId, onRunWorkspaceEdit: run } = host;
  const revision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId(); const assetId = workspace.activeAssetId;
  const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
  const sourceHash = record?.meshHash ?? "";
  const context = JSON.stringify([actor, revision, workspaceDocumentId, workspace.session.state.documentId, workspace.session.state.stateHash, assetId, sourceHash, enabled, Boolean(run)]);
  const slots = useMemo(() => record ? [...new Set(record.mesh.faces.map((face) => face.materialSlot))].sort((a, b) => a - b) : [], [record]);
  const bindings = useMemo(() => assetId ? readStudioHybridDccToonBindings(workspace.session.state, assetId, sourceHash) : {}, [assetId, sourceHash, workspace]);
  const initial = bindings[String(slots[0])] ?? createStudioHybridDccDefaultToonMaterial();
  const [slot, setSlot] = useState("all");
  const [fields, setFields] = useState(() => studioToonEditorFields(initial));
  const [dirty, setDirty] = useState(false), [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState(""), [operationError, setOperationError] = useState("");
  const [seenContext, setSeenContext] = useState(context);
  const [seenWorkspace, setSeenWorkspace] = useState(workspace);
  const epoch = useRef(0), lock = useRef(false), live = useRef(true);
  const pending = useRef<string | null>(null);
  const latest = useRef({ context, workspace }); latest.current = { context, workspace };
  const sectionRef = useRef<HTMLElement>(null);
  if (seenContext !== context || seenWorkspace !== workspace) {
    setSeenContext(context); setSeenWorkspace(workspace); epoch.current += 1;
    const applied = pending.current === workspace.session.state.stateHash;
    setSlot("all"); setFields(studioToonEditorFields(initial)); setDirty(false); setApplying(false); setOperationError("");
    if (dirty || applying) setNotice(applied ? bt("툰 재질을 적용했습니다. 한 번 되돌리기로 복원할 수 있습니다.", "Toon material applied. One undo step restores it.")
      : bt("문서·계정·선택이 바뀌어 재질 미리보기를 취소했습니다.", "The document, account or selection changed, so the material preview was cancelled."));
    lock.current = false; pending.current = null;
  }
  useEffect(() => { live.current = true; return () => { live.current = false; epoch.current += 1; }; }, []);
  const selectedSlots = slot === "all" ? slots : slots.filter((value) => String(value) === slot);
  const unavailable = !run ? bt("이 화면은 읽기 전용입니다.", "This view is read-only.")
    : !record ? bt("툰 재질을 편집할 오브젝트를 선택하세요.", "Select an object to edit its toon material.") : "";
  const locked = editingDisabled || applying || Boolean(unavailable) || !enabled;
  const candidate = useMemo(() => {
    try { return { material: studioToonEditorRequest(fields), error: "" }; }
    catch { return { material: null, error: bt("색은 6자리 hex, 그림자 경계는 -1..1, 선명도는 0..1, 외곽선 너비는 0 이상의 유한한 값으로 입력하세요.", "Use six-digit hex colors, a shadow boundary from -1 to 1, sharpness from 0 to 1, and a finite outline width of zero or greater.") }; }
  }, [bt, fields]);
  const changed = candidate.material && selectedSlots.some((value) => !bindings[String(value)] || hashStudioHybridDccToonMaterial(bindings[String(value)]!) !== hashStudioHybridDccToonMaterial(candidate.material!));
  const preview: StudioHybridDccToonMaterialPreview | undefined = enabled && !unavailable && dirty && changed && seenContext === context && seenWorkspace === workspace && candidate.material && assetId
    ? { assetId, sourceMeshHash: sourceHash, sourceStateHash: workspace.session.state.stateHash, slots: selectedSlots, material: candidate.material } : undefined;
  const cancel = () => { if (applying) return; epoch.current += 1; setFields(studioToonEditorFields(bindings[String(selectedSlots[0])] ?? initial)); setDirty(false); setOperationError(""); setNotice(bt("재질 미리보기를 취소했습니다.", "Material preview cancelled.")); };
  const cancelFromKey = useEffectEvent(cancel);
  useEffect(() => {
    if (!dirty || applying || !enabled) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || !(event.target instanceof Element) || !sectionRef.current?.contains(event.target)) return;
      const inner = event.target.closest('[role="dialog"], [aria-modal="true"], [data-studio-escape-scope="true"]');
      if (inner && !inner.contains(sectionRef.current)) return;
      event.preventDefault(); event.stopPropagation(); cancelFromKey();
    };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [applying, dirty, enabled]);
  useEffect(() => {
    if (!applying || editingDisabled) return;
    const timer = setTimeout(() => { lock.current = false; pending.current = null; setApplying(false); setOperationError(bt("재질 적용을 확인하지 못했습니다. 작업 기록을 확인하세요.", "The material edit could not be confirmed. Check the activity log.")); }, 0);
    return () => clearTimeout(timer);
  }, [applying, bt, editingDisabled]);
  const execute = (reset: boolean) => {
    if (locked || lock.current || !run || !assetId || !selectedSlots.length || !reset && !preview) return;
    const own = epoch.current;
    const current = () => live.current && own === epoch.current && latest.current.context === context && latest.current.workspace === workspace
      && getAuthSessionRevision() === revision && getAuthUserId() === actor;
    lock.current = true; setApplying(true); setOperationError("");
    run(bt(reset ? "기본 재질로 복원" : "툰 재질 적용", reset ? "Restore default material" : "Apply toon material"), (currentWorkspace, selection) => {
      try {
        if (!current() || currentWorkspace !== workspace) throw new Error(bt("원본 문서가 바뀌었습니다. 다시 선택하세요.", "The source document changed. Select again."));
        const result = workspaceSetStudioHybridDccToonMaterial(currentWorkspace, assetId, selectedSlots, reset ? null : preview!.material);
        if (result === workspace) { lock.current = false; setApplying(false); setDirty(false); setNotice(bt("재질에 바뀐 값이 없습니다.", "The material is unchanged.")); }
        pending.current = result.session.state.stateHash;
        return { workspace: result, selection };
      } catch (cause) { lock.current = false; setApplying(false); setOperationError(cause instanceof Error ? cause.message : bt("재질을 적용하지 못했습니다.", "Could not apply the material.")); throw cause; }
    }, current);
  };
  return { sectionRef, visible: enabled, fields, dirty, applying, locked, unavailable, slots, slot, preview, canApply: Boolean(preview && !locked),
    canReset: !locked && selectedSlots.some((value) => Boolean(bindings[String(value)])), error: operationError || (dirty ? candidate.error : ""),
    notice: notice || (preview ? bt("화면은 재질 미리보기입니다. 적용하면 한 번의 편집으로 기록됩니다.", "The view shows a material preview. Apply records one edit.") : dirty && !candidate.error ? bt("재질에 바뀐 값이 없습니다.", "The material is unchanged.") : ""),
    setSlot: (value: string) => { if (locked || value !== "all" && !slots.some((item) => String(item) === value)) return; epoch.current += 1; setSlot(value); const first = value === "all" ? slots[0] : Number(value); setFields(studioToonEditorFields(bindings[String(first)] ?? createStudioHybridDccDefaultToonMaterial())); setDirty(false); setOperationError(""); setNotice(""); },
    setField: <K extends keyof StudioToonEditorFields>(key: K, value: StudioToonEditorFields[K]) => { if (locked) return; setFields((previous) => key === "outlineMode" ? studioToonEditorWidthMode(previous, value as StudioToonEditorFields["outlineMode"]) : { ...previous, [key]: value }); setDirty(true); setNotice(""); setOperationError(""); },
    startPreview: () => { if (!locked) { setDirty(true); setNotice(""); } }, cancel, apply: () => execute(false), reset: () => execute(true) };
}
export type StudioHybridDccToonEditorState = ReturnType<typeof useStudioHybridDccToonEditor>;
