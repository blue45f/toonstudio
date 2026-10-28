/** Keep the established viewport API while connecting bounded, reversible authoring tools. */
import { useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioHybridDccComponentTransformTools } from "./StudioHybridDccComponentTransformTools";
import { StudioHybridDccFaceModelingTools } from "./StudioHybridDccFaceModelingTools";
import { StudioHybridDccMeshSelectionTools } from "./StudioHybridDccMeshSelectionTools";
import { StudioHybridDccPrecisionTools } from "./StudioHybridDccPrecisionTools";
import { StudioHybridDccTransformUtilities } from "./StudioHybridDccTransformUtilities";
import { StudioHybridDccUvEditor } from "./StudioHybridDccUvEditor";
import { createStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import {
  StudioHybridDccViewport as StudioHybridDccViewportCore,
  type StudioHybridDccViewportProps,
} from "./StudioHybridDccViewportCore";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";
import { useStudioHybridDccComponentTransform } from "./useStudioHybridDccComponentTransform";
import { useStudioHybridDccUvEditor, type StudioHybridDccUvEditorHost } from "./useStudioHybridDccUvEditor";
import { StudioHybridDccToonEditor } from "./materials/StudioHybridDccToonEditor";
import { useStudioHybridDccToonEditor } from "./materials/useStudioHybridDccToonEditor";

// eslint-disable-next-line react-refresh/only-export-components -- preserve the public viewport projection/test contracts
export * from "./StudioHybridDccViewportCore";
const OBJECT_SELECTION = createStudioHybridDccComponentSelection();

export function StudioHybridDccViewport({
  onRunWorkspaceEdit, materialMode = false, workspaceDocumentId,
  ...props
}: StudioHybridDccViewportProps & StudioHybridDccUvEditorHost) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const bt = useBilingual("StudioHybridDccToonEditor");
  const [materialTool, setMaterialTool] = useState<"uv" | "toon">("uv");
  const uvMode = materialMode && materialTool === "uv";
  // 작업 모드를 바꾸면 메시 요소 선택의 미리보기를 닫고, UV도 하나의 표시 복사본만 사용한다.
  const geometryProps = materialMode ? { ...props, componentSelection: OBJECT_SELECTION, editingDisabled: true } : props;
  const faceModeling = useStudioHybridDccFaceModeling(geometryProps, onRunWorkspaceEdit);
  const componentTransform = useStudioHybridDccComponentTransform(geometryProps, onRunWorkspaceEdit, faceModeling.engaged);
  const uvEditor = useStudioHybridDccUvEditor(props, { materialMode: uvMode, workspaceDocumentId, onRunWorkspaceEdit }, !materialMode && (faceModeling.engaged || componentTransform.dirty));
  const toonEditor = useStudioHybridDccToonEditor(props, { workspaceDocumentId, onRunWorkspaceEdit }, materialMode && materialTool === "toon");
  const toolsProps = componentTransform.previewing ? { ...props, editingDisabled: true } : props;
  const faceTools = componentTransform.previewing
    ? { ...faceModeling, unavailable: componentTransform.otherToolsUnavailable, canApply: false }
    : faceModeling;
  return (
    <div ref={scopeRef} className="min-w-0" data-studio-hybrid-dcc-selection-shell="true">
      <StudioHybridDccViewportCore {...(materialMode ? { ...uvEditor.viewportProps, componentSelection: OBJECT_SELECTION } : componentTransform.previewing ? componentTransform.viewportProps : faceModeling.viewportProps)} uvChecker={uvMode} toonPreview={toonEditor.preview} />
      {!materialMode ? <><StudioHybridDccMeshSelectionTools {...toolsProps} scopeRef={scopeRef} />
      <StudioHybridDccComponentTransformTools model={componentTransform} />
      <StudioHybridDccPrecisionTools {...toolsProps} />
      <StudioHybridDccFaceModelingTools model={faceTools} />
      <StudioHybridDccTransformUtilities {...toolsProps} /></> : null}
      {materialMode ? <div role="group" aria-label={bt("재질 작업 선택", "Material tool")} className="mt-3 flex flex-wrap gap-2">
        {(["uv", "toon"] as const).map((tool) => <button key={tool} type="button" aria-pressed={materialTool === tool} disabled={props.editingDisabled} onClick={() => setMaterialTool(tool)}
          className={`min-h-11 rounded-lg border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${materialTool === tool ? "border-accent/60 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"}`}>{tool === "uv" ? bt("UV 편집", "UV editing") : bt("툰 재질", "Toon material")}</button>)}
      </div> : null}
      <StudioHybridDccUvEditor model={uvEditor} /><StudioHybridDccToonEditor model={toonEditor} />
    </div>
  );
}
