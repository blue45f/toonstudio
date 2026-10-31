/** Keep the established viewport API while connecting bounded, reversible authoring tools. */
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

import { StudioHybridDccComponentTransformTools } from "./StudioHybridDccComponentTransformTools";
import { StudioHybridDccFaceModelingTools } from "./StudioHybridDccFaceModelingTools";
import { StudioHybridDccBoundaryChordTools, type StudioBoundaryChordPickingMode } from "./StudioHybridDccBoundaryChordTools";
import { StudioHybridDccCoplanarEdgeDissolveTools } from "./StudioHybridDccCoplanarEdgeDissolveTools";
import { StudioHybridDccMeshSelectionTools } from "./StudioHybridDccMeshSelectionTools";
import { StudioHybridDccPrecisionTools } from "./StudioHybridDccPrecisionTools";
import { StudioHybridDccTransformUtilities } from "./StudioHybridDccTransformUtilities";
import { StudioHybridDccUvEditor } from "./StudioHybridDccUvEditor";
import { createStudioHybridDccComponentSelection, validateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { workspaceComponentSelectionSource } from "./studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";
import {
  StudioHybridDccViewport as StudioHybridDccViewportCore,
  type StudioHybridDccViewportProps,
} from "./StudioHybridDccViewportCore";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";
import { useStudioHybridDccComponentTransform } from "./useStudioHybridDccComponentTransform";
import { useStudioHybridDccCoplanarEdgeDissolve } from "./useStudioHybridDccCoplanarEdgeDissolve";
import { useStudioHybridDccUvEditor, type StudioHybridDccUvEditorHost } from "./useStudioHybridDccUvEditor";
import { StudioHybridDccToonEditor } from "./materials/StudioHybridDccToonEditor";
import { useStudioHybridDccToonEditor } from "./materials/useStudioHybridDccToonEditor";

// eslint-disable-next-line react-refresh/only-export-components -- preserve the public viewport projection/test contracts
export * from "./StudioHybridDccViewportCore";
const OBJECT_SELECTION = createStudioHybridDccComponentSelection();

export function StudioHybridDccViewport({
  onRunWorkspaceEdit, onRunWorkspaceUvAtlas, materialMode = false, workspaceDocumentId,
  ...props
}: StudioHybridDccViewportProps & StudioHybridDccUvEditorHost) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const healSectionRef = useRef<HTMLElement>(null);
  const bt = useBilingual("StudioHybridDccToonEditor");
  const t = useT();
  const [materialTool, setMaterialTool] = useState<"uv" | "toon">("uv");
  const [picking, setPicking] = useState<{ readonly context: string; readonly mode: StudioBoundaryChordPickingMode }>({ context: "", mode: null });
  const uvMode = materialMode && materialTool === "uv";
  // 작업 모드를 바꾸면 메시 요소 선택의 미리보기를 닫고, UV도 하나의 표시 복사본만 사용한다.
  const geometryProps = materialMode ? { ...props, componentSelection: OBJECT_SELECTION, editingDisabled: true } : props;
  const faceModeling = useStudioHybridDccFaceModeling(geometryProps, onRunWorkspaceEdit);
  const componentTransform = useStudioHybridDccComponentTransform(geometryProps, onRunWorkspaceEdit, faceModeling.engaged);
  const uvEditor = useStudioHybridDccUvEditor(props, { materialMode: uvMode, workspaceDocumentId, onRunWorkspaceEdit, onRunWorkspaceUvAtlas }, !materialMode && (faceModeling.engaged || componentTransform.dirty));
  const toonEditor = useStudioHybridDccToonEditor(props, { workspaceDocumentId, onRunWorkspaceEdit }, materialMode && materialTool === "toon");
  const toolsProps = componentTransform.previewing ? { ...props, editingDisabled: true } : props;
  const faceTools = componentTransform.previewing
    ? { ...faceModeling, unavailable: componentTransform.otherToolsUnavailable, canApply: false }
    : faceModeling;
  const chord = faceModeling.boundaryChord;
  const source = workspaceComponentSelectionSource(props.workspace), selection = props.componentSelection;
  // 선택 작업대와 같은 표시 권위를 사용한다. 숨김·표시 거부된 원본에는 보이지 않는 편집을 준비하지 않는다.
  const healingSourceVisible = useMemo(() => {
    const sourceAssetId = workspaceComponentSelectionSource(props.workspace)?.assetId;
    return sourceAssetId !== undefined
      && deriveStudioHybridDccViewportSnapshot(props.workspace, "edge").assets.some(({ assetId }) => assetId === sourceAssetId);
  }, [props.workspace]);
  // 카메라·투영 변경은 제외하고 문서·동적 revision·선택·작업 모드의 수명만 묶는다.
  const chordContext = JSON.stringify([props.workspace.session.state.documentId, props.workspace.session.state.stateHash,
    source?.assetId, source?.sourceHash, source?.meshRevision, selection, materialMode, Boolean(props.onSculptStroke || props.sculptGesture)]);
  if (picking.context !== chordContext && picking.mode !== null) setPicking({ context: chordContext, mode: null });
  const mode = picking.context === chordContext ? picking.mode : null;
  const legacyPreview = faceModeling.engaged && !chord.engaged;
  const healing = useStudioHybridDccCoplanarEdgeDissolve({
    workspace: props.workspace, selection: selection ?? OBJECT_SELECTION,
    enabled: Boolean(onRunWorkspaceEdit) && !materialMode && !props.onSculptStroke && !props.sculptGesture,
    disabled: Boolean(props.editingDisabled) || !healingSourceVisible || faceModeling.engaged || componentTransform.dirty || componentTransform.previewing || mode !== null,
    run: onRunWorkspaceEdit,
  });
  const chordUnavailable = !onRunWorkspaceEdit ? t("studio.bg3dScene.boundaryChord.unavailable.readOnly", undefined, "이 화면은 읽기 전용입니다.")
    : materialMode ? t("studio.bg3dScene.boundaryChord.unavailable.materialMode", undefined, "모델 모드에서 면 나누기를 사용하세요.")
      : props.onSculptStroke || props.sculptGesture ? t("studio.bg3dScene.boundaryChord.unavailable.sculptMode", undefined, "조형을 마친 뒤 모델 모드에서 사용하세요.")
        : componentTransform.dirty || componentTransform.previewing || legacyPreview || healing.engaged ? t("studio.bg3dScene.boundaryChord.unavailable.otherPreview", undefined, "다른 미리보기를 적용하거나 취소한 뒤 사용하세요.")
          : !source || !selection || selection.mode !== "face" || selection.elementIds.length !== 1
            || !validateStudioHybridDccComponentSelection(selection, source).ok ? t("studio.bg3dScene.boundaryChord.unavailable.singleFace", undefined, "현재 오브젝트의 한 면을 선택하세요.") : null;
  const chordActive = mode !== null || chord.engaged;
  const geometryActive = chordActive || healing.engaged;
  const healingUnavailable = !onRunWorkspaceEdit ? t("studio.bg3dScene.coplanarEdgeHeal.unavailable.readOnly", undefined, "이 화면은 읽기 전용입니다.")
    : materialMode ? t("studio.bg3dScene.coplanarEdgeHeal.unavailable.materialMode", undefined, "모델 모드에서 모서리 치유를 사용하세요.")
      : props.onSculptStroke || props.sculptGesture ? t("studio.bg3dScene.coplanarEdgeHeal.unavailable.sculptMode", undefined, "조형을 마친 뒤 모델 모드에서 사용하세요.")
        : faceModeling.engaged || componentTransform.dirty || componentTransform.previewing || chordActive ? t("studio.bg3dScene.coplanarEdgeHeal.unavailable.otherPreview", undefined, "다른 미리보기를 적용하거나 취소한 뒤 사용하세요.")
          : source && !healingSourceVisible ? t("studio.bg3dScene.coplanarEdgeHeal.unavailable.hiddenSource", undefined, "숨겨졌거나 표시할 수 없는 오브젝트에는 치유를 적용하지 않습니다.")
          : !source || !selection || selection.mode !== "edge" || selection.elementIds.length === 0
            || !validateStudioHybridDccComponentSelection(selection, source).ok ? t("studio.bg3dScene.coplanarEdgeHeal.unavailable.selectionRequired", undefined, "현재 오브젝트에서 합칠 두 면 사이의 모서리를 선택하세요.") : null;
  const projectionProps = materialMode ? { ...uvEditor.viewportProps, componentSelection: OBJECT_SELECTION }
    : healing.preview ? { ...props, workspace: healing.preview.workspace, componentSelection: healing.preview.selection, editingDisabled: true }
      : componentTransform.previewing ? componentTransform.viewportProps : faceModeling.viewportProps;
  const startPicking = (next: Exclude<StudioBoundaryChordPickingMode, null>) => {
    if (chordUnavailable || props.editingDisabled || chord.pending || chord.applying) return;
    faceModeling.setOpen(true); setPicking({ context: chordContext, mode: next });
    scopeRef.current?.querySelector<HTMLCanvasElement>("canvas[tabindex]")?.focus();
  };
  const stopPicking = () => {
    chord.cancel(); setPicking({ context: chordContext, mode: null });
    scopeRef.current?.querySelector<HTMLButtonElement>('[data-studio-boundary-start="edge"]')?.focus();
  };
  const stopHealing = () => {
    healing.cancel();
    const button = scopeRef.current?.querySelector<HTMLButtonElement>("[data-studio-coplanar-preview]");
    button?.focus();
    if (button?.ownerDocument.activeElement !== button) scopeRef.current?.querySelector<HTMLCanvasElement>("canvas[tabindex]")?.focus();
  };
  const cancelPickingFromKey = useEffectEvent((event: KeyboardEvent) => {
    const scope = scopeRef.current;
    if (!scope || (mode === null && !healing.engaged) || event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
    const target = event.target, focused = scope.ownerDocument.activeElement;
    if (target instanceof Element) {
      const inner = target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-studio-escape-scope="true"]');
      if (inner && !inner.contains(scope)) return;
    }
    if (!(target instanceof Node && scope.contains(target)) && !(focused && scope.contains(focused))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (healing.engaged) stopHealing(); else stopPicking();
  });
  useEffect(() => {
    // 첫 점 전에도 Esc를 소유하고, 점 선택 후 기존 preview Esc보다 먼저 같은 listener가 처리한다.
    const view = scopeRef.current?.ownerDocument.defaultView;
    view?.addEventListener("keydown", cancelPickingFromKey, true);
    return () => view?.removeEventListener("keydown", cancelPickingFromKey, true);
  }, []);
  const sculptAvailable = !materialMode && !faceModeling.engaged && !componentTransform.previewing && !healing.engaged;
  return (
    <div ref={scopeRef} className="min-w-0" data-studio-hybrid-dcc-selection-shell="true">
      <StudioHybridDccViewportCore {...projectionProps} editingDisabled={projectionProps.editingDisabled || chord.pending || chord.applying || healing.engaged}
        boundaryEndpointMarkers={mode !== null && !chord.preview ? chord.endpoints : undefined}
        onBoundaryEndpointPick={mode !== null ? (pick) => {
          if (chordUnavailable || props.editingDisabled || chord.pending || chord.applying || pick.assetId !== source?.assetId) return false;
          return chord.pickEndpoint(pick.hit, mode, pick.projection);
        } : undefined} uvChecker={uvMode} toonPreview={toonEditor.preview}
        sculptGesture={sculptAvailable ? props.sculptGesture : undefined} sculptPreview={sculptAvailable ? props.sculptPreview : undefined} />
      {!materialMode ? <><StudioHybridDccMeshSelectionTools {...(geometryActive ? { ...toolsProps, editingDisabled: true } : toolsProps)} scopeRef={scopeRef} />
      {!geometryActive ? <StudioHybridDccComponentTransformTools model={componentTransform} /> : null}
      <StudioHybridDccPrecisionTools {...(geometryActive ? { ...toolsProps, editingDisabled: true } : toolsProps)} />
      <StudioHybridDccBoundaryChordTools model={chord} mode={mode} onModeChange={startPicking}
        unavailable={chordUnavailable} busy={Boolean(props.editingDisabled)} sectionRef={chordActive ? faceModeling.sectionRef : undefined}
        onCancel={stopPicking}
        onRestart={() => { chord.clear(); startPicking(mode ?? "edge"); }} />
      <StudioHybridDccCoplanarEdgeDissolveTools model={{ ...healing, cancel: stopHealing }} unavailable={healingUnavailable}
        busy={Boolean(props.editingDisabled)} sectionRef={healSectionRef} />
      {!geometryActive ? <StudioHybridDccFaceModelingTools model={faceTools} /> : null}
      <StudioHybridDccTransformUtilities {...(geometryActive ? { ...toolsProps, editingDisabled: true } : toolsProps)} /></> : null}
      {materialMode ? <div role="group" aria-label={bt("재질 작업 선택", "Material tool")} className="mt-3 flex flex-wrap gap-2">
        {(["uv", "toon"] as const).map((tool) => <button key={tool} type="button" aria-pressed={materialTool === tool} disabled={props.editingDisabled} onClick={() => setMaterialTool(tool)}
          className={`min-h-11 rounded-lg border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${materialTool === tool ? "border-accent/60 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"}`}>{tool === "uv" ? bt("UV 편집", "UV editing") : bt("툰 재질", "Toon material")}</button>)}
      </div> : null}
      <StudioHybridDccUvEditor model={uvEditor} /><StudioHybridDccToonEditor model={toonEditor} />
    </div>
  );
}
