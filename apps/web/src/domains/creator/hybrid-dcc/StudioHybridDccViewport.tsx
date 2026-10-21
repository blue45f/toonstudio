/** Keep the established viewport API while connecting bounded, reversible authoring tools. */
import { useRef } from "react";

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

// eslint-disable-next-line react-refresh/only-export-components -- preserve the public viewport projection/test contracts
export * from "./StudioHybridDccViewportCore";

export function StudioHybridDccViewport({
  onRunWorkspaceEdit,
  ...props
}: StudioHybridDccViewportProps & StudioHybridDccFaceModelingHost) {
  const scopeRef = useRef<HTMLDivElement>(null);
  // 면 모델링 미리보기가 있는 동안에만 뷰포트가 결과 메시를 얹은 복사본 작업공간을 그린다.
  const faceModeling = useStudioHybridDccFaceModeling(props, onRunWorkspaceEdit);
  return (
    <div ref={scopeRef} className="min-w-0" data-studio-hybrid-dcc-selection-shell="true">
      <StudioHybridDccViewportCore {...faceModeling.viewportProps} />
      <StudioHybridDccMeshSelectionTools {...props} scopeRef={scopeRef} />
      <StudioHybridDccPrecisionTools {...props} />
      <StudioHybridDccFaceModelingTools model={faceModeling} />
      <StudioHybridDccTransformUtilities {...props} />
    </div>
  );
}
