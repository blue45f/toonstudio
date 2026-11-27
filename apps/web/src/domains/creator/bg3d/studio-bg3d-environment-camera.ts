import { Matrix4, Object3D, Vector3 } from "three";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
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

/** 막 배치될 모델도 렌더 트리에 붙은 인스턴스와 같은 변환으로 추천 구도를 잡는다. */
export function frameStudioBg3dPlacedEnvironmentCamera(
  camera: EnvironmentCamera,
  before: StudioBg3dCameraSettings,
  model: Pick<BgCustomModelInstance, "position" | "rotation" | "scale">,
  sourceRoot: Object3D,
): StudioBg3dCameraSettings | null {
  const instance = new Object3D();
  instance.position.set(...model.position);
  instance.rotation.set(...model.rotation);
  instance.scale.set(...model.scale);
  return frameStudioBg3dEnvironmentCamera(camera, before, instance, sourceRoot);
}
