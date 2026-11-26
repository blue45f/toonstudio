import { isStudioVrmCharacterDocumentId } from "@toonstudio/contracts/studio-vrm-scene-fields";

import type { ImageEl } from "./studio-element-model";

interface StudioVrmCutEditControls {
  setPoserInitialDataUrl: (url: string) => void;
  setPoserInitialElementId: (id: string) => void;
  setPoserVrmOpen: (open: boolean) => void;
  setCharacterShaperOpen: (open: boolean) => void;
}

/** 선택한 컷을 삽입 결과의 갱신 대상으로 보존하고 원본 문서가 있는 캐릭터는 셰이퍼에서 연다. */
export function reopenStudioVrmCut(element: ImageEl, controls: StudioVrmCutEditControls): void {
  controls.setPoserInitialDataUrl(element.src);
  controls.setPoserInitialElementId(element.id);
  if (isStudioVrmCharacterDocumentId(element.vrmScene?.characterDocumentId)) {
    controls.setCharacterShaperOpen(true);
  } else {
    controls.setPoserVrmOpen(true);
  }
}
