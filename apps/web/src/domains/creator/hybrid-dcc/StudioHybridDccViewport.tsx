/** Keep the established viewport API while connecting bounded, reversible authoring tools. */
import { useRef } from "react";

import { StudioHybridDccComponentTransformTools } from "./StudioHybridDccComponentTransformTools";
import { StudioHybridDccFaceModelingTools } from "./StudioHybridDccFaceModelingTools";
import { StudioHybridDccMeshSelectionTools } from "./StudioHybridDccMeshSelectionTools";
import { StudioHybridDccPrecisionTools } from "./StudioHybridDccPrecisionTools";
import { StudioHybridDccTransformUtilities } from "./StudioHybridDccTransformUtilities";
import {
  StudioHybridDccViewport as StudioHybridDccViewportCore,
  type StudioHybridDccViewportProps,
} from "./StudioHybridDccViewportCore";
import {
  useStudioHybridDccFaceModeling,
  type StudioHybridDccFaceModelingHost,
} from "./useStudioHybridDccFaceModeling";
import { useStudioHybridDccComponentTransform } from "./useStudioHybridDccComponentTransform";

// eslint-disable-next-line react-refresh/only-export-components -- preserve the public viewport projection/test contracts
export * from "./StudioHybridDccViewportCore";

export function StudioHybridDccViewport({
  onRunWorkspaceEdit,
  ...props
}: StudioHybridDccViewportProps & StudioHybridDccFaceModelingHost) {
  const scopeRef = useRef<HTMLDivElement>(null);
  // 면 모델링과 요소 변형은 서로 잠그고, 결과 복사본만 미리보기 뷰포트에 올린다.
  const faceModeling = useStudioHybridDccFaceModeling(props, onRunWorkspaceEdit);
  const componentTransform = useStudioHybridDccComponentTransform(props, onRunWorkspaceEdit, faceModeling.engaged);
  const toolsProps = componentTransform.previewing ? { ...props, editingDisabled: true } : props;
  const faceTools = componentTransform.previewing
    ? { ...faceModeling, unavailable: componentTransform.otherToolsUnavailable, canApply: false }
    : faceModeling;
  return (
    <div ref={scopeRef} className="min-w-0" data-studio-hybrid-dcc-selection-shell="true">
      <StudioHybridDccViewportCore {...(componentTransform.previewing ? componentTransform.viewportProps : faceModeling.viewportProps)} />
      <StudioHybridDccMeshSelectionTools {...toolsProps} scopeRef={scopeRef} />
      <StudioHybridDccComponentTransformTools model={componentTransform} />
      <StudioHybridDccPrecisionTools {...toolsProps} />
      <StudioHybridDccFaceModelingTools model={faceTools} />
      <StudioHybridDccTransformUtilities {...toolsProps} />
    </div>
  );
}
