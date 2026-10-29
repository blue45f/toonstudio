import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { applyStudioBg3dViewToThreeCamera } from "./studio-bg3d-camera-application";
import {
  applyStudioBg3dOrthographicFrustumPlan,
  planStudioBg3dOrthographicFrustum,
  readStudioBg3dCameraOrthographicHeight,
  recordStudioBg3dCameraOrthographicHeight,
  resizeStudioBg3dAuthoredOrthographicFrustum,
  resolveStudioBg3dOrthographicPlanes,
} from "./studio-bg3d-orthographic-frustum";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { snapshotStudioBg3dCaptureCamera } from "./studio-bg3d-tile-camera";

const VIEW = { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, projection: "orthographic" as const, orthographicHeight: 8, zoom: 2 };

describe("명시한 평행 카메라의 장면 단위 높이", () => {
  it.each([null, undefined])("초기 레이아웃 %s는 높이 계산을 거부하고 실제 크기 준비 뒤 복원한다", (viewport) => {
    expect(resolveStudioBg3dOrthographicPlanes(8, viewport)).toBeNull();
    const camera = new OrthographicCamera(0, 0, 0, 0);
    const before = camera.toJSON();
    expect(planStudioBg3dOrthographicFrustum(camera, 8, viewport)).toBeNull();
    expect(camera.toJSON()).toEqual(before);
    expect(recordStudioBg3dCameraOrthographicHeight(camera, 8)).toBe(true);
    expect(resizeStudioBg3dAuthoredOrthographicFrustum(camera, { width: 800, height: 400 })).toBe(true);
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-8, 8, 4, -4]);
  });
  it("실제 카메라 적용과 가로/세로 트랙 resize가 높이·zoom을 보존한다", () => {
    const camera = new OrthographicCamera(-400, 400, 200, -200);
    expect(applyStudioBg3dViewToThreeCamera(camera, null, VIEW, { width: 800, height: 400 })).toBe(true);
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-8, 8, 4, -4]);
    expect((camera.top - camera.bottom) / camera.zoom).toBe(4);
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBe(8);
    expect(resizeStudioBg3dAuthoredOrthographicFrustum(camera, { width: 400, height: 800 })).toBe(true);
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-2, 2, 4, -4]);
    expect(camera.zoom).toBe(2);
    const center = new Vector3().copy(camera.position).lerp(new Vector3(...VIEW.target), 0.5);
    expect(Number.isFinite(center.project(camera).y)).toBe(true);
  });

  it("명시한 높이가 없는 legacy/manual 카메라를 높이로 추정하지 않는다", () => {
    const camera = Object.assign(new OrthographicCamera(-200, 200, 150, -150), { manual: true });
    const original = camera.toJSON();
    const plan = planStudioBg3dOrthographicFrustum(camera, undefined, { width: 500, height: 500 });
    expect(plan).not.toBeNull();
    if (!plan) throw new Error("legacy 계획이 필요합니다.");
    applyStudioBg3dOrthographicFrustumPlan(camera, plan);
    expect(resizeStudioBg3dAuthoredOrthographicFrustum(camera, { width: 900, height: 500 })).toBe(false);
    expect(camera.toJSON()).toEqual(original);
    expect(camera.manual).toBe(true);
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBeUndefined();
  });

  it("높이를 제거하면 현재 트랙의 픽셀 절두체로 돌아가고 다시 추정하지 않는다", () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1);
    expect(applyStudioBg3dViewToThreeCamera(camera, null, VIEW, { width: 800, height: 400 })).toBe(true);
    const before = camera.toJSON();
    const { orthographicHeight, ...legacyView } = VIEW;
    expect(orthographicHeight).toBe(8);
    expect(applyStudioBg3dViewToThreeCamera(camera, null, legacyView)).toBe(false);
    expect(camera.toJSON()).toEqual(before);
    expect(applyStudioBg3dViewToThreeCamera(camera, null, legacyView, { width: 300, height: 600 })).toBe(true);
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-150, 150, 300, -300]);
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(camera, "manual")?.value).toBe(false);
  });

  it.each([0, -1, NaN, Infinity, 1e-7, 100_001])("무효 높이 %s는 제어기·카메라를 변경하기 전에 거부한다", (orthographicHeight) => {
    const camera = new OrthographicCamera(-4, 4, 3, -3);
    const target = new Vector3(1, 2, 3);
    const update = vi.fn();
    const before = camera.toJSON();
    expect(applyStudioBg3dViewToThreeCamera(camera, { target, update }, { ...VIEW, orthographicHeight }, { width: 800, height: 400 })).toBe(false);
    expect(camera.toJSON()).toEqual(before);
    expect(target.toArray()).toEqual([1, 2, 3]);
    expect(update).not.toHaveBeenCalled();
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBeUndefined();
  });

  it("높이 경계와 극단 종횡비는 임의 보정 없이 계산하고 무효 크기는 거부한다", () => {
    expect(resolveStudioBg3dOrthographicPlanes(1e-6, { width: 1, height: 10 })).toEqual({ left: -5e-8, right: 5e-8, top: 5e-7, bottom: -5e-7 });
    expect(resolveStudioBg3dOrthographicPlanes(100_000, { width: 10, height: 1 })).toEqual({ left: -500_000, right: 500_000, top: 50_000, bottom: -50_000 });
    for (const viewport of [{ width: 0, height: 10 }, { width: 1, height: NaN }, { width: Infinity, height: 1 }]) {
      expect(resolveStudioBg3dOrthographicPlanes(8, viewport)).toBeNull();
    }
  });

  it("원근 투영의 잠재 높이는 보존하며 다른 카메라에 메타데이터가 전파되지 않는다", () => {
    const perspective = new PerspectiveCamera();
    expect(applyStudioBg3dViewToThreeCamera(perspective, null, { ...VIEW, projection: "perspective" })).toBe(true);
    expect(readStudioBg3dCameraOrthographicHeight(perspective)).toBe(8);
    expect(recordStudioBg3dCameraOrthographicHeight(perspective, NaN)).toBe(false);
    expect(readStudioBg3dCameraOrthographicHeight(perspective)).toBe(8);
    expect(readStudioBg3dCameraOrthographicHeight(new PerspectiveCamera())).toBeUndefined();
  });

  it("타일 캡처 복제는 WeakMap을 공유하지 않아도 실제 절두체와 투영을 보존한다", () => {
    const camera = new OrthographicCamera();
    expect(applyStudioBg3dViewToThreeCamera(camera, null, VIEW, { width: 1200, height: 600 })).toBe(true);
    const frozen = snapshotStudioBg3dCaptureCamera(camera);
    expect(frozen).toBeInstanceOf(OrthographicCamera);
    expect(readStudioBg3dCameraOrthographicHeight(frozen)).toBeUndefined();
    expect(frozen.projectionMatrix.toArray()).toEqual(camera.projectionMatrix.toArray());
    if (!(frozen instanceof OrthographicCamera)) throw new Error("평행 카메라 복제가 필요합니다.");
    expect([frozen.left, frozen.right, frozen.top, frozen.bottom, frozen.zoom]).toEqual([-8, 8, 4, -4, 2]);
  });
});
