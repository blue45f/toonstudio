import { OrthographicCamera, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import { createStudioBg3dCameraMountUpdater, type StudioBg3dCameraMountState } from "./studio-bg3d-camera-mount";
import { readStudioBg3dCameraOrthographicHeight } from "./studio-bg3d-orthographic-frustum";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

const LEGACY: StudioBg3dCameraSettings = { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, projection: "orthographic" };
const PAGE: StudioBg3dCameraSettings = { ...LEGACY, position: [0, 12.7, 0], target: [0.254, 0.762, -0.508],
  up: [0, 0, -1], orthographicHeight: 3.6576, nearClip: 0.025, lensShift: [0.1, -0.2] };

describe("R3F가 보관한 카메라 mount callback의 최신 설정", () => {
  it("같은 최초 callback이 legacy→Page→Undo→Redo의 현재 높이·up·near·렌즈를 적용한다", () => {
    const state: { current: StudioBg3dCameraMountState } = { current: { view: LEGACY, viewport: { width: 800, height: 400 } } };
    const camera = new OrthographicCamera(-400, 400, 200, -200);
    camera.zoom = 1.7;
    const retainedOnUpdate = createStudioBg3dCameraMountUpdater(() => state.current);
    retainedOnUpdate(camera);
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBeUndefined();
    for (const current of [PAGE, LEGACY, PAGE]) {
      state.current = { view: current, viewport: { width: 900, height: 600 } };
      retainedOnUpdate(camera);
      expect(camera.zoom).toBe(1.7);
      expect(readStudioBg3dCameraOrthographicHeight(camera)).toBe(current.orthographicHeight);
      if (current.orthographicHeight !== undefined) {
        expect(camera.top - camera.bottom).toBe(3.6576);
        expect(camera.right - camera.left).toBeCloseTo(3.6576 * 1.5);
        expect(camera.up.toArray()).not.toEqual([0, 1, 0]);
        expect(camera.near).toBe(0.025);
        expect((camera.view?.offsetX ?? 0) / (camera.view?.fullWidth ?? 1)).toBeCloseTo(0.1);
        expect(Object.getOwnPropertyDescriptor(camera, "manual")?.value).toBe(true);
      } else {
        expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-450, 450, 300, -300]);
        expect(camera.up.toArray()).toEqual([0, 1, 0]);
        expect(camera.view?.enabled).not.toBe(true);
        expect(Object.getOwnPropertyDescriptor(camera, "manual")?.value).toBe(false);
      }
    }
  });

  it("최초 callback이 0/null layout 뒤 준비된 최신 DOM 크기를 읽는다", () => {
    const state: { current: StudioBg3dCameraMountState } = { current: { view: PAGE, viewport: null } };
    const camera = new OrthographicCamera(0, 0, 0, 0);
    const retainedOnUpdate = createStudioBg3dCameraMountUpdater(() => state.current);
    retainedOnUpdate(camera);
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBe(3.6576);
    state.current = { view: PAGE, viewport: { width: 300, height: 600 } };
    retainedOnUpdate(camera);
    expect(camera.right - camera.left).toBeCloseTo(3.6576 / 2);
  });

  it("원근 카메라의 새 설정도 같은 callback으로 읽고 잠재 높이는 보존한다", () => {
    const state: { current: StudioBg3dCameraMountState } = { current: { view: LEGACY, viewport: undefined } };
    const camera = new PerspectiveCamera(55, 2, 0.1, 200);
    const retainedOnUpdate = createStudioBg3dCameraMountUpdater(() => state.current);
    retainedOnUpdate(camera);
    state.current = { view: { ...PAGE, projection: "perspective" }, viewport: { width: 900, height: 600 } };
    retainedOnUpdate(camera);
    expect(readStudioBg3dCameraOrthographicHeight(camera)).toBe(3.6576);
    expect(camera.near).toBe(0.025);
    expect(camera.fov).toBe(55);
    expect(camera.up.toArray()).not.toEqual([0, 1, 0]);
  });
});
