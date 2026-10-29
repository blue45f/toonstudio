import {
  createStudioBg3dSelectionArrayFromHost,
  inspectStudioBg3dSelectionArrayHost,
  type StudioBg3dExecuteSelectionArray,
  type StudioBg3dSelectionArrayHost,
  type StudioBg3dSelectionArraySummary,
} from "./studio-bg3d-selection-array";
import { createStudioBg3dSkpSourceReaderFromHost, inspectStudioBg3dSkpSourceSelection, type StudioBg3dReadSkpSceneSource, type StudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";
import { createStudioBg3dWorkbenchInsertionFromHost, type StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import type { StudioBg3dApplySkpSourceCamera, StudioBg3dSkpCameraRestoreHost } from "./studio-bg3d-skp-camera-restore-types";
import type { StudioBg3dPrimitiveEditPorts } from "./studio-bg3d-primitive-edit-ports";

import type { StudioBg3dSceneGlbExportPorts } from "./studio-bg3d-scene-glb-ports";

export interface StudioBg3dWorkbenchHostPorts extends StudioBg3dPrimitiveEditPorts, StudioBg3dSceneGlbExportPorts {
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly arraySelection?: StudioBg3dSelectionArraySummary;
  readonly onExecuteSelectionArray?: StudioBg3dExecuteSelectionArray;
  readonly skpSourceSelection?: StudioBg3dSkpSourceSelection;
  readonly onReadSkpSceneSource?: StudioBg3dReadSkpSceneSource;
  readonly onApplySkpSourceCamera?: StudioBg3dApplySkpSourceCamera;
}

/** 가변 편집기 호스트의 최신 읽기와 실제 장면 명령을 작업대에 연결한다. */
export function createStudioBg3dWorkbenchHostPorts(host: StudioBg3dSelectionArrayHost & StudioBg3dSkpCameraRestoreHost): StudioBg3dWorkbenchHostPorts {
  const applySkpCamera: StudioBg3dApplySkpSourceCamera = async (request) => {
    try {
      const { applyStudioBg3dSkpSourceCamera } = await import("./studio-bg3d-skp-camera-restore-command");
      return applyStudioBg3dSkpSourceCamera(host, request);
    } catch {
      return { ok: false, code: "unavailable", messageKo: "원본 카메라 도구를 준비하지 못했습니다. 다시 시도하세요." };
    }
  };
  return {
    onInsertScenePrimitives: createStudioBg3dWorkbenchInsertionFromHost(host, { selectAllInserted: true, immediateHistory: true }),
    arraySelection: inspectStudioBg3dSelectionArrayHost(host),
    onExecuteSelectionArray: createStudioBg3dSelectionArrayFromHost(host),
    skpSourceSelection: inspectStudioBg3dSkpSourceSelection(host),
    onReadSkpSceneSource: createStudioBg3dSkpSourceReaderFromHost(host),
    onApplySkpSourceCamera: applySkpCamera,
  };
}
