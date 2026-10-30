// @vitest-environment jsdom
import { render } from "@testing-library/react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { describe, expect, it, vi } from "vitest";

import { BgViewportController } from "./StudioBg3dSceneNodes";
import { applyOrDeferStudioBg3dHistoryCamera, rememberStudioBg3dCameraBeforeViewportRemount } from "./studio-bg3d-camera-history-transition";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { BgViewportApi } from "./studio-bg3d-camera-application";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

interface PortalFixture {
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: { object?: THREE.Camera; target?: THREE.Vector3; update?: () => void } | null;
  size: { width: number; height: number };
}
const portal = vi.hoisted(() => ({ read: (): PortalFixture => { throw new Error("포털 상태가 필요합니다."); } }));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: PortalFixture) => unknown) => select(portal.read()),
  useFrame: vi.fn(),
}));

function view(projection: "perspective" | "orthographic"): StudioBg3dCameraSettings {
  return { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, position: [0, 1, 10], target: [0, 1, 0], projection,
    ...(projection === "orthographic" ? { orthographicHeight: 8, zoom: 2 } : {}) };
}

describe("실제 카메라 controller의 복원 준비 경계", () => {
  it("R3F size가 오래돼도 호출 시점의 실제 DOM 크기를 사용하고 무효 DOM은 fallback한다", () => {
    const camera = new THREE.OrthographicCamera();
    const controls = new OrbitControls(camera, document.createElement("div"));
    portal.read = () => ({ camera, controls, size: { width: 800, height: 400 } });
    const element = document.createElement("div");
    let rect = new DOMRect(0, 0, 300, 600);
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rect);
    const viewportElementRef: { current: HTMLElement | null } = { current: element };
    const onReady = vi.fn<(api: BgViewportApi | null) => void>();
    const rendered = render(<BgViewportController onReady={onReady} viewportElementRef={viewportElementRef} />);
    const api = onReady.mock.lastCall?.[0];
    expect(api?.applyView(view("orthographic"))).toBe(true);
    expect(camera.right - camera.left).toBe(4);
    expect(api?.readFramingState()?.viewportAspect).toBe(0.5);
    rect = new DOMRect(0, 0, 1200, 400);
    expect(api?.applyView(view("orthographic"))).toBe(true);
    expect(camera.right - camera.left).toBe(24);
    expect(api?.readFramingState()?.viewportAspect).toBe(3);
    rect = new DOMRect(0, 0, 0, 400);
    expect(api?.applyView(view("orthographic"))).toBe(true);
    expect(camera.right - camera.left).toBe(16);
    expect(api?.readFramingState()?.viewportAspect).toBe(2);
    viewportElementRef.current = null;
    expect(api?.readFramingState()?.viewportAspect).toBe(2);
    rendered.unmount();
    controls.dispose();
  });

  it("renderer만 다시 마운트돼도 기존 live 목표점·높이·zoom·렌즈를 새 controls로 복원한다", () => {
    const camera = new THREE.OrthographicCamera();
    const controls = new OrbitControls(camera, document.createElement("div"));
    const state: PortalFixture = { camera, controls, size: { width: 800, height: 400 } };
    portal.read = () => state;
    const pending: { current: StudioBg3dCameraSettings | null } = { current: view("orthographic") };
    const active: { current: BgViewportApi | null } = { current: null };
    const onReady = (api: BgViewportApi | null) => {
      if (api === null) rememberStudioBg3dCameraBeforeViewportRemount(active.current, pending);
      active.current = api;
      if (api && pending.current) applyOrDeferStudioBg3dHistoryCamera(api, pending, pending.current);
    };
    const first = render(<BgViewportController onReady={onReady} />);
    expect(active.current?.applyView({ ...view("orthographic"), target: [2, 3, 4], lensShift: [0.1, -0.2], zoom: 3 })).toBe(true);
    const original = active.current?.readView();
    if (!original) throw new Error("마운트 전 실제 시점이 필요합니다.");
    first.unmount();
    expect(pending.current).toEqual(original);
    const replacement = new THREE.OrthographicCamera();
    const replacementControls = new OrbitControls(replacement, document.createElement("div"));
    state.camera = replacement;
    state.controls = replacementControls;
    const second = render(<BgViewportController onReady={onReady} />);
    expect(pending.current).toBeNull();
    expect(replacementControls.target.distanceTo(new THREE.Vector3(...original.target))).toBeLessThan(1e-10);
    expect(active.current?.readView()).toMatchObject({ orthographicHeight: 8, zoom: 3, lensShift: [0.1, -0.2] });
    expect(replacement.position.distanceTo(new THREE.Vector3(...original.position))).toBeLessThan(1e-10);
    second.unmount();
    controls.dispose();
    replacementControls.dispose();
  });
  it("initialScene 없는 새 문서도 복원 lane 이후 canonical 기본 목표점을 적용한다", async () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = new OrbitControls(camera, document.createElement("div"));
    const state: PortalFixture = { camera, controls, size: { width: 800, height: 400 } };
    portal.read = () => state;
    const pending: { current: StudioBg3dCameraSettings | null } = { current: null };
    const onReady = vi.fn<(api: BgViewportApi | null) => void>();
    const rendered = render(<BgViewportController onReady={onReady} />);
    // 새 문서 복원도 mutation lane을 기다린 뒤 같은 API 또는 pending 경로를 사용한다.
    await Promise.resolve();
    const api = onReady.mock.lastCall?.[0] ?? null;
    expect(api).not.toBeNull();
    expect(applyOrDeferStudioBg3dHistoryCamera(api, pending, DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera)).toBe("applied");
    expect(pending.current).toBeNull();
    expect(controls.target.toArray()).toEqual(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera.target);
    expect(api?.readView().target).toEqual([0, 0.6, 0]);
    rendered.unmount();
    controls.dispose();
  });
  it.each(["perspective", "orthographic"] as const)("%s의 현재 controls가 준비될 때만 초기 목표점 복원을 소비한다", (projection) => {
    const camera = projection === "orthographic" ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
    const state: PortalFixture = { camera, controls: null, size: { width: 800, height: 400 } };
    portal.read = () => state;
    const pending: { current: StudioBg3dCameraSettings | null } = { current: view(projection) };
    const published: Array<BgViewportApi | null> = [];
    const onReady = (api: BgViewportApi | null) => {
      published.push(api);
      if (api && pending.current) applyOrDeferStudioBg3dHistoryCamera(api, pending, pending.current);
    };
    const rendered = render(<BgViewportController onReady={onReady} />);
    expect(published.every((api) => api === null)).toBe(true);
    expect(pending.current?.target).toEqual([0, 1, 0]);

    const staleControls = new OrbitControls(new THREE.PerspectiveCamera(), document.createElement("div"));
    state.controls = staleControls;
    rendered.rerender(<BgViewportController onReady={onReady} />);
    expect(published.every((api) => api === null)).toBe(true);
    expect(pending.current).not.toBeNull();

    const controls = new OrbitControls(camera, document.createElement("div"));
    controls.target.set(4, 5, 6);
    state.controls = controls;
    rendered.rerender(<BgViewportController onReady={onReady} />);
    expect(pending.current).toBeNull();
    expect(controls.target.toArray()).toEqual([0, 1, 0]);
    const api = published.at(-1);
    expect(api?.readView().target).toEqual([0, 1, 0]);
    for (let frame = 0; frame < 20; frame += 1) controls.update();
    expect(controls.target.toArray()).toEqual([0, 1, 0]);
    if (camera instanceof THREE.OrthographicCamera) {
      expect(api?.readView()).toMatchObject({ orthographicHeight: 8, zoom: 2 });
      expect(camera.top - camera.bottom).toBe(8);
    }
    rendered.unmount();
    controls.dispose();
    staleControls.dispose();
  });

  it("미완성 controls에 API를 발행하지 않고 이미 준비된 목표점을 기본값으로 덮지 않는다", () => {
    const camera = new THREE.PerspectiveCamera();
    const state: PortalFixture = { camera, controls: { object: camera, target: new THREE.Vector3(2, 3, 4) }, size: { width: 800, height: 400 } };
    portal.read = () => state;
    const onReady = vi.fn<(api: BgViewportApi | null) => void>();
    const rendered = render(<BgViewportController onReady={onReady} />);
    expect(onReady).toHaveBeenLastCalledWith(null);
    const controls = new OrbitControls(camera, document.createElement("div"));
    controls.target.set(2, 3, 4);
    state.controls = controls;
    rendered.rerender(<BgViewportController onReady={onReady} />);
    expect(onReady.mock.lastCall?.[0]?.readView().target).toEqual([2, 3, 4]);
    rendered.unmount();
    controls.dispose();
  });
});
