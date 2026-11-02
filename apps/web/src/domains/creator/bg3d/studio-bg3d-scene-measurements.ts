/** 정규화된 장면 측정값을 읽는 편집기 어댑터. 결측에만 안정적인 cm 기본값을 적용한다. */
import {
  DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS,
  type StudioSpatialMeasurementDocument,
} from "@toonstudio/studio-project-model/spatial-measurement";
import { StudioBg3dSceneMeasurementsValidationError } from "./studio-bg3d-hierarchy";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";

export {
  assertStudioBg3dSceneMeasurementsInput,
  normalizeStudioBg3dSceneMeasurementsField,
  StudioBg3dSceneMeasurementsValidationError,
} from "./studio-bg3d-hierarchy";

export const DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS = DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS;

/** 문서 정본을 그대로 돌려주며 매 렌더마다 중첩 코덱을 재실행하지 않는다. */
export function readStudioBg3dSceneMeasurements(
  document: Pick<StudioBg3dSceneDocument, "measurements">,
): StudioSpatialMeasurementDocument {
  if (!Object.prototype.hasOwnProperty.call(document, "measurements")) {
    return DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS;
  }
  const measurements = document.measurements;
  if (measurements === undefined || measurements === null) throw new StudioBg3dSceneMeasurementsValidationError();
  return measurements;
}
