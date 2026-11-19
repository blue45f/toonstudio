import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";

import type { CompositionCameraSnapshot } from "../ai/studio-composition-generation-brief";

/** 원고 PNG를 그리는 카메라의 방향과 투영을 읽는다. 직교 카메라에는 화각이 없다. */
export function readStudioMannequinCaptureCamera(
  camera: PerspectiveCamera | OrthographicCamera,
  fullBody: boolean,
): CompositionCameraSnapshot {
  const towardCamera = camera.getWorldDirection(new Vector3()).negate();
  const deg = 180 / Math.PI;
  const rounded = (value: number) => Math.round(value * 10) / 10 || 0;
  const orientation = {
    azimuthDegrees: rounded((Math.atan2(towardCamera.x, towardCamera.z) * deg + 360) % 360) % 360,
    elevationDegrees: rounded(Math.atan2(towardCamera.y, Math.hypot(towardCamera.x, towardCamera.z)) * deg),
    framing: fullBody ? "full-body" as const : "as-framed" as const,
  };
  if (camera instanceof OrthographicCamera) {
    return { ...orientation, projection: "orthographic", verticalSpanM: Number(((camera.top - camera.bottom) / camera.zoom).toFixed(4)) };
  }
  return { ...orientation, projection: "perspective", fovDegrees: rounded(camera.getEffectiveFOV()) };
}
