import { OrthographicCamera } from "three";

import { applyStudioBg3dLensShiftToThreeCamera } from "./studio-bg3d-camera-application";
import { resolveStudioBg3dCameraNearClip, resolveStudioBg3dCameraUpVector } from "./studio-bg3d-camera-orientation";
import {
  applyStudioBg3dOrthographicFrustumPlan,
  planStudioBg3dOrthographicFrustum,
  recordStudioBg3dCameraOrthographicHeight,
} from "./studio-bg3d-orthographic-frustum";

import type { PerspectiveCamera } from "three";
import type { StudioBg3dFrustumViewport } from "./studio-bg3d-orthographic-frustum";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dCameraMountState {
  readonly view: StudioBg3dCameraSettings;
  readonly viewport: StudioBg3dFrustumViewport | null | undefined;
}

/** R3F가 최초 onUpdate를 보관해도 호출할 때 최신 정본 설정과 실제 트랙을 읽는다. */
export function createStudioBg3dCameraMountUpdater(read: () => StudioBg3dCameraMountState): (camera: PerspectiveCamera | OrthographicCamera) => void {
  return (camera) => {
    const { view, viewport } = read();
    const height = view.orthographicHeight;
    if (camera instanceof OrthographicCamera) {
      const plan = planStudioBg3dOrthographicFrustum(camera, height, viewport);
      if (plan) applyStudioBg3dOrthographicFrustumPlan(camera, plan);
      else {
        // 최초 레이아웃의 크기가 0이어도 높이를 기억해 다음 트랙 렌더에서 복원한다.
        recordStudioBg3dCameraOrthographicHeight(camera, height);
        Object.assign(camera, { manual: height !== undefined });
      }
    } else recordStudioBg3dCameraOrthographicHeight(camera, height);
    camera.near = resolveStudioBg3dCameraNearClip(view.nearClip);
    const up = resolveStudioBg3dCameraUpVector(view);
    camera.up.set(up[0], up[1], up[2]);
    applyStudioBg3dLensShiftToThreeCamera(camera, view.lensShift);
    camera.updateProjectionMatrix();
  };
}
