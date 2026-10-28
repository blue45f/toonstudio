import {
  createStudioBg3dSelectionArrayFromHost,
  inspectStudioBg3dSelectionArrayHost,
  type StudioBg3dExecuteSelectionArray,
  type StudioBg3dSelectionArrayHost,
  type StudioBg3dSelectionArraySummary,
} from "./studio-bg3d-selection-array";
import { createStudioBg3dWorkbenchInsertionFromHost, type StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";

export interface StudioBg3dWorkbenchHostPorts {
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly arraySelection?: StudioBg3dSelectionArraySummary;
  readonly onExecuteSelectionArray?: StudioBg3dExecuteSelectionArray;
}

/** 가변 편집기 호스트의 최신 읽기와 실제 장면 명령을 작업대에 연결한다. */
export function createStudioBg3dWorkbenchHostPorts(host: StudioBg3dSelectionArrayHost): StudioBg3dWorkbenchHostPorts {
  return {
    onInsertScenePrimitives: createStudioBg3dWorkbenchInsertionFromHost(host, { selectAllInserted: true, immediateHistory: true }),
    arraySelection: inspectStudioBg3dSelectionArrayHost(host),
    onExecuteSelectionArray: createStudioBg3dSelectionArrayFromHost(host),
  };
}
