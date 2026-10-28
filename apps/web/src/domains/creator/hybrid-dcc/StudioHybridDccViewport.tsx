/** Keep the established viewport API while connecting bounded, reversible authoring tools. */
import { useRef } from "react";

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

// eslint-disable-next-line react-refresh/only-export-components -- preserve the public viewport projection/test contracts
export * from "./StudioHybridDccViewportCore";
const OBJECT_SELECTION = createStudioHybridDccComponentSelection();

export function StudioHybridDccViewport({
  onRunWorkspaceEdit, materialMode = false, workspaceDocumentId,
  ...props
}: StudioHybridDccViewportProps & StudioHybridDccUvEditorHost) {
  const scopeRef = useRef<HTMLDivElement>(null);
  // 작업 모드를 바꾸면 메시 요소 선택의 미리보기를 닫고, UV도 하나의 표시 복사본만 사용한다.
  const geometryProps = materialMode ? { ...props, componentSelection: OBJECT_SELECTION, editingDisabled: true } : props;
  const faceModeling = useStudioHybridDccFaceModeling(geometryProps, onRunWorkspaceEdit);
  const componentTransform = useStudioHybridDccComponentTransform(geometryProps, onRunWorkspaceEdit, faceModeling.engaged);
  const uvEditor = useStudioHybridDccUvEditor(props, { materialMode, workspaceDocumentId, onRunWorkspaceEdit }, !materialMode && (faceModeling.engaged || componentTransform.dirty));
  const toolsProps = componentTransform.previewing ? { ...props, editingDisabled: true } : props;
  const faceTools = componentTransform.previewing
    ? { ...faceModeling, unavailable: componentTransform.otherToolsUnavailable, canApply: false }
    : faceModeling;
  return (
    <div ref={scopeRef} className="min-w-0" data-studio-hybrid-dcc-selection-shell="true">
      <StudioHybridDccViewportCore {...(materialMode ? { ...uvEditor.viewportProps, componentSelection: OBJECT_SELECTION } : componentTransform.previewing ? componentTransform.viewportProps : faceModeling.viewportProps)} uvChecker={materialMode} />
      {!materialMode ? <><StudioHybridDccMeshSelectionTools {...toolsProps} scopeRef={scopeRef} />
      <StudioHybridDccComponentTransformTools model={componentTransform} />
      <StudioHybridDccPrecisionTools {...toolsProps} />
      <StudioHybridDccFaceModelingTools model={faceTools} />
      <StudioHybridDccTransformUtilities {...toolsProps} /></> : null}
      <StudioHybridDccUvEditor model={uvEditor} />
    </div>
  );
}
