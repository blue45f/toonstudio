import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { workspaceTransformComponents } from "./studio-hybrid-dcc-component-transform";

import type { StudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import type { StudioHybridDccFaceModelingHost } from "./useStudioHybridDccFaceModeling";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

type TransformKind = Parameters<typeof workspaceTransformComponents>[2]["kind"];
type Axis = "x" | "y" | "z";
type Fields = Readonly<Record<Axis, string>>;
const defaults = (kind: TransformKind): Fields => ({ x: kind === "scale" ? "1" : "0", y: kind === "scale" ? "1" : "0", z: kind === "scale" ? "1" : "0" });
const selectionKey = (selection: StudioHybridDccComponentSelection | undefined) => JSON.stringify(selection ?? null);

/** 원본 작업공간은 보존하고, 임시 명령 결과는 뷰포트에만 올린다. */
export function useStudioHybridDccComponentTransform(
  props: StudioHybridDccViewportProps,
  run: StudioHybridDccFaceModelingHost["onRunWorkspaceEdit"],
  facePreviewActive: boolean,
) {
  const bt = useBilingual("StudioHybridDccComponentTransform");
  const { workspace, componentSelection: selection, editingDisabled = false } = props;
  const [kind, setKind] = useState<TransformKind>("translate");
  const [fields, setFields] = useState<Fields>(() => defaults("translate"));
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applying, setApplying] = useState(false);
  const applyLock = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const visible = Boolean(selection && selection.mode !== "object");
  const context = [workspace.session.state.documentId, workspace.session.state.stateHash, workspace.activeAssetId, selectionKey(selection)].join("|");
  const [seenContext, setSeenContext] = useState(context);
  if (seenContext !== context) {
    setSeenContext(context);
    setFields(defaults(kind));
    setDirty(false);
    setApplyError("");
    setApplying(false);
    applyLock.current = false;
    if (dirty) setNotice(applying
      ? bt("적용했습니다. 되돌리기 한 번으로 원래 메시를 복원할 수 있습니다.", "Applied. One undo step restores the original mesh.")
      : bt("문서나 선택이 바뀌어 변형 미리보기를 취소했습니다.", "The document or selection changed, so the transform preview was cancelled."));
  }
  const unavailable = !run
    ? bt("이 화면은 읽기 전용입니다.", "This view is read-only.")
    : props.onSculptStroke
      ? bt("조형을 마친 뒤 모델 모드에서 사용하세요.", "Finish sculpting and use this in model mode.")
      : facePreviewActive
        ? bt("면 모델링 미리보기를 적용하거나 취소한 뒤 사용하세요.", "Apply or cancel the face-modeling preview first.")
        : !selection?.elementIds.length
          ? bt("3D 화면에서 변형할 점·선·면을 선택하세요.", "Select vertices, edges or faces in the 3D view.")
          : null;

  const candidate = useMemo(() => {
    if (!visible || !selection || unavailable || !dirty) return { result: null, error: "", neutral: false };
    try {
      const value = { x: 0, y: 0, z: 0 };
      for (const axis of ["x", "y", "z"] as const) {
        const text = fields[axis].trim();
        if (!text || !Number.isFinite(Number(text))) throw new Error(bt("X·Y·Z에 유효한 숫자를 입력하세요.", "Enter a valid number for X, Y and Z."));
        value[axis] = Number(text) * (kind === "rotate" ? Math.PI / 180 : 1);
      }
      const neutral = Object.values(value).every((number) => number === (kind === "scale" ? 1 : 0));
      const result = neutral ? null : workspaceTransformComponents(workspace, selection, { kind, value });
      const unchanged = result?.workspace.session.state.stateHash === workspace.session.state.stateHash;
      return { result: unchanged ? null : result, error: "", neutral: neutral || unchanged };
    } catch (cause) {
      return { result: null, error: cause instanceof Error ? cause.message : bt("선택한 요소를 변형할 수 없습니다.", "The selected elements cannot be transformed."), neutral: false };
    }
  }, [bt, dirty, fields, kind, selection, unavailable, visible, workspace]);

  // 호스트 실행 큐가 실패하거나 요청을 거부한 경우에도 적용 대기를 끝낸다.
  useEffect(() => {
    if (!applying || editingDisabled) return;
    const timer = setTimeout(() => {
      applyLock.current = false;
      setApplying(false);
      setApplyError(bt("변형 확정을 확인하지 못했습니다. 작업 기록을 확인하고 다시 적용하세요.", "The transform could not be confirmed. Check the activity log before applying again."));
    }, 0);
    return () => clearTimeout(timer);
  }, [applying, bt, editingDisabled]);

  const cancel = () => {
    if (applying) return;
    setFields(defaults(kind));
    setDirty(false);
    setApplyError("");
    setNotice(bt("미리보기를 취소했습니다. 원본 메시와 되돌리기 기록은 보존됩니다.", "Preview cancelled. The original mesh and undo history are preserved."));
  };
  const cancelFromKey = useEffectEvent(cancel);
  useEffect(() => {
    if (!dirty || applying) return;
    const keydown = (event: KeyboardEvent) => {
      const shell = sectionRef.current?.closest('[data-studio-hybrid-dcc-selection-shell="true"]');
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented
        || !(event.target instanceof Node) || !shell?.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancelFromKey();
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [applying, dirty]);
  const locked = editingDisabled || applying || Boolean(unavailable);
  const previewing = Boolean(candidate.result);
  const canApply = Boolean(candidate.result && !locked);
  return {
    sectionRef, visible, kind, fields, dirty, applying, previewing, canApply, locked, unavailable,
    selectionCount: selection?.elementIds.length ?? 0,
    error: applyError || candidate.error,
    notice: notice || (previewing
      ? bt("화면은 미리보기입니다. 적용하면 한 번의 편집으로 기록됩니다.", "The view shows a preview. Apply records one edit.")
      : candidate.neutral ? bt("변경할 값을 입력하세요.", "Enter a value that changes the selection.") : ""),
    otherToolsUnavailable: bt("요소 변형 미리보기를 적용하거나 취소한 뒤 사용하세요.", "Apply or cancel the component-transform preview first."),
    setKind: (next: TransformKind) => {
      if (applying) return;
      setKind(next); setFields(defaults(next)); setDirty(false); setApplyError(""); setNotice("");
    },
    setField: (axis: Axis, text: string) => {
      if (locked) return;
      setFields((current) => ({ ...current, [axis]: text })); setDirty(true); setApplyError(""); setNotice("");
    },
    cancel,
    apply: () => {
      if (!canApply || !run || !selection || applyLock.current) return;
      applyLock.current = true;
      setApplying(true); setApplyError("");
      const factor = kind === "rotate" ? Math.PI / 180 : 1;
      const request = { kind, value: { x: Number(fields.x) * factor, y: Number(fields.y) * factor, z: Number(fields.z) * factor } };
      const expectedState = workspace.session.state.stateHash;
      const expectedSelection = selectionKey(selection);
      run(bt("선택 요소 변형", "Transform selected elements"), (current, currentSelection) => {
        try {
          if (current.session.state.stateHash !== expectedState || selectionKey(currentSelection) !== expectedSelection) throw new Error(bt("문서나 선택이 바뀌었습니다. 새 선택에서 다시 입력하세요.", "The document or selection changed. Enter the transform again for the new selection."));
          return workspaceTransformComponents(current, currentSelection, request);
        } catch (cause) {
          applyLock.current = false; setApplying(false);
          setApplyError(cause instanceof Error ? cause.message : bt("요소 변형을 적용하지 못했습니다.", "Could not apply the component transform."));
          throw cause;
        }
      });
    },
    viewportProps: candidate.result
      ? { ...props, workspace: candidate.result.workspace, componentSelection: candidate.result.selection, editingDisabled: true }
      : props,
  };
}

export type StudioHybridDccComponentTransformModel = ReturnType<typeof useStudioHybridDccComponentTransform>;
