import { Matrix4, Vector3 } from "three";
import type { Object3D } from "three";
import type { StudioBg3dEnvironmentAsset } from "./studio-bg3d-environment-catalog";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

type EnvironmentCamera = StudioBg3dEnvironmentAsset["camera"];

/** 카탈로그 좌표는 GLB의 미터 단위다. 렌더러의 정규화와 계층 전체의 변환을 순서대로 적용한다. */
export function frameStudioBg3dEnvironmentCamera(
  camera: EnvironmentCamera,
  before: StudioBg3dCameraSettings,
  instance: Object3D,
  sourceRoot: Object3D,
): StudioBg3dCameraSettings | null {
  instance.updateWorldMatrix(true, false);
  if (sourceRoot.matrixAutoUpdate) sourceRoot.updateMatrix();
  const sourceToWorld = new Matrix4().multiplyMatrices(instance.matrixWorld, sourceRoot.matrix);
  if (!sourceToWorld.elements.every(Number.isFinite) || Math.abs(sourceToWorld.determinant()) < 1e-14) return null;
  const position = new Vector3(...camera.position).applyMatrix4(sourceToWorld);
  const target = new Vector3(...camera.target).applyMatrix4(sourceToWorld);
  const viewDirection = target.clone().sub(position);
  const distance = viewDirection.length();
  if (!Number.isFinite(distance) || distance < 1e-5) return null;
  const up = new Vector3(0, 1, 0).transformDirection(sourceToWorld);
  viewDirection.normalize();
  up.addScaledVector(viewDirection, -up.dot(viewDirection));
  if (up.lengthSq() < 1e-10) return null;
  return {
    ...before,
    position: position.toArray(),
    target: target.toArray(),
    up: up.normalize().toArray(),
    fovDegrees: camera.fovDegrees,
    zoom: 1,
    lensShift: [0, 0],
    ...(before.projection === "orthographic"
      ? { orthographicHeight: 2 * distance * Math.tan(camera.fovDegrees * Math.PI / 360) }
      : {}),
  };
}
