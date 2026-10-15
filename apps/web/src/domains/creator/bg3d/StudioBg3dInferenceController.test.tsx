// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dInferenceController } from "./StudioBg3dInferenceController";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type { StudioBg3dInferenceControllerProps } from "./StudioBg3dInferenceController";

/** R3F 훅은 합성 상태로 대체한다 (View 포털 안의 카메라·이벤트 소스를 흉내 낸다). */
const fiberMock = vi.hoisted(() => ({ state: null as unknown }));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: unknown) => unknown) => selector(fiberMock.state),
}));

const HOST_RECT = { left: 100, top: 50, width: 800, height: 800 } as const;

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 2, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function entityGroup(id: string, position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.userData = { studioBg3dEntityId: id, studioBg3dEntityKind: "primitive" };
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

/** 월드 점의 화면 좌표(client px) — 호스트 사각형의 위치 오프셋을 포함한다. */
function clientOf(camera: THREE.Camera, point: [number, number, number]): { x: number; y: number } {
  const ndc = new THREE.Vector3(...point).project(camera);
  return {
    x: HOST_RECT.left + ((ndc.x + 1) / 2) * HOST_RECT.width,
    y: HOST_RECT.top + ((1 - ndc.y) / 2) * HOST_RECT.height,
  };
}

function makeHost(): HTMLElement {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => ({
    ...HOST_RECT,
    right: HOST_RECT.left + HOST_RECT.width,
    bottom: HOST_RECT.top + HOST_RECT.height,
    x: HOST_RECT.left,
    y: HOST_RECT.top,
    toJSON: () => ({}),
  });
  document.body.append(host);
  return host;
}

function pointer(type: string, at: { x: number; y: number }, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    clientX: at.x,
    clientY: at.y,
    pointerType: "mouse",
    isPrimary: true,
    bubbles: type !== "pointerleave",
    ...init,
  });
}

interface SetupOptions {
  readonly withConnected?: boolean;
  readonly begin?: boolean;
}

function setup(options: SetupOptions = {}) {
  const service = createStudioBg3dInferenceService();
  service.syncScene({
    entities: [{ id: "A", kind: "box", label: "상자 A", position: [0, 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  });
  if (options.begin !== false) service.begin("measure", { referencePoint: [4, 2, 0] });
  const camera = makeCamera();
  const host = makeHost();
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  fiberMock.state = {
    camera,
    gl: { domElement: canvas },
    events: options.withConnected === false ? {} : { connected: host },
  };
  const roots = new Map<string, THREE.Object3D>([["A", entityGroup("A", [0, 2, 0])]]);
  const objectsRef = { current: roots as ReadonlyMap<string, THREE.Object3D> | null | undefined };
  const props = (overrides: Partial<StudioBg3dInferenceControllerProps> = {}): StudioBg3dInferenceControllerProps => ({
    service,
    active: true,
    objectsRef,
    ...overrides,
  });
  return { service, camera, host, canvas, objectsRef, props };
}

beforeEach(() => {
  fiberMock.state = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("StudioBg3dInferenceController — R3F 접착", () => {
  it("활성일 때 이벤트 소스의 포인터를 View 카메라와 호스트 사각형 기준 레이로 바꿔 끝점을 해석한다", () => {
    const { service, camera, host, props } = setup();
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()?.kind).toBe("endpoint");
    expect(service.getResult()?.detail).toContain("상자 A");
  });

  it("호스트 사각형의 위치 오프셋을 빼고 계산한다 (오프셋을 무시하면 같은 화면 좌표가 다른 점이 된다)", () => {
    const { service, camera, host, props } = setup();
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    // 오프셋(100, 50)을 빼지 않은 좌표로는 모서리 근처가 아니다.
    host.dispatchEvent(pointer("pointerdown", { x: corner.x - HOST_RECT.left + 3, y: corner.y - HOST_RECT.top }));
    expect(service.getResult()?.kind).not.toBe("endpoint");
  });

  it("비활성이면 포인터를 듣지 않는다", () => {
    const { service, camera, host, props } = setup();
    render(<StudioBg3dInferenceController {...props({ active: false })} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()).toBeNull();
  });

  it("active가 꺼지면 리스너를 떼고, 다시 켜면 붙인다", () => {
    const { service, camera, host, props } = setup();
    const view = render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    const near = { x: corner.x + 3, y: corner.y };

    view.rerender(<StudioBg3dInferenceController {...props({ active: false })} />);
    host.dispatchEvent(pointer("pointerdown", near));
    expect(service.getResult()).toBeNull();

    view.rerender(<StudioBg3dInferenceController {...props({ active: true })} />);
    host.dispatchEvent(pointer("pointerdown", near));
    expect(service.getResult()?.kind).toBe("endpoint");
  });

  it("언마운트하면 리스너를 뗀다", () => {
    const { service, camera, host, props } = setup();
    const view = render(<StudioBg3dInferenceController {...props()} />);
    view.unmount();
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()).toBeNull();
  });

  it("이벤트 소스가 없으면 캔버스에 붙는다", () => {
    const { service, camera, canvas, props } = setup({ withConnected: false });
    // 캔버스의 사각형이 곧 뷰포트 사각형이다.
    canvas.getBoundingClientRect = () => ({
      ...HOST_RECT,
      right: HOST_RECT.left + HOST_RECT.width,
      bottom: HOST_RECT.top + HOST_RECT.height,
      x: HOST_RECT.left,
      y: HOST_RECT.top,
      toJSON: () => ({}),
    });
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    canvas.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()?.kind).toBe("endpoint");
  });

  it("뷰포트 위 컨트롤(툴바·HUD 버튼)에서 시작한 이벤트는 무시한다", () => {
    const { service, camera, host, props } = setup();
    const control = document.createElement("button");
    control.setAttribute("data-bg3d-viewport-control", "true");
    host.append(control);
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    control.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()).toBeNull();
  });

  it("포인터가 뷰포트를 벗어나면 마커가 남지 않게 결과를 비운다", () => {
    const { service, camera, host, props } = setup();
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()).not.toBeNull();
    host.dispatchEvent(pointer("pointerleave", { x: 0, y: 0 }));
    expect(service.getResult()).toBeNull();
  });

  it("세션이 없으면 포인터를 받아도 아무것도 하지 않는다", () => {
    const { service, camera, host, props } = setup({ begin: false });
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()).toBeNull();
    expect(service.isActive()).toBe(false);
  });

  it("보조 포인터(멀티터치의 둘째 손가락)는 무시한다", () => {
    const { service, camera, host, props } = setup();
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }, { isPrimary: false }));
    expect(service.getResult()).toBeNull();
  });
});

describe("StudioBg3dInferenceController — 카메라 알림", () => {
  it("비활성이어도 이 뷰의 카메라를 알리고 사라질 때 null을 알린다", () => {
    const { camera, props } = setup();
    const onCameraChange = vi.fn();
    const view = render(<StudioBg3dInferenceController {...props({ active: false, onCameraChange })} />);
    expect(onCameraChange).toHaveBeenLastCalledWith(camera);
    view.unmount();
    expect(onCameraChange).toHaveBeenLastCalledWith(null);
  });

  it("카메라가 바뀌면 이전 카메라를 비우고 새 카메라를 알린다", () => {
    const { camera, props } = setup();
    const onCameraChange = vi.fn();
    const view = render(<StudioBg3dInferenceController {...props({ onCameraChange })} />);
    const next = makeCamera();
    next.position.set(5, 2, 10);
    fiberMock.state = { ...(fiberMock.state as object), camera: next };
    view.rerender(<StudioBg3dInferenceController {...props({ onCameraChange })} />);
    const calls = onCameraChange.mock.calls.map((call) => call[0]);
    expect(calls).toEqual([camera, null, next]);
  });

  it("onCameraChange를 주지 않아도 동작한다 (사면 뷰)", () => {
    const { service, camera, host, props } = setup();
    render(<StudioBg3dInferenceController {...props()} />);
    const corner = clientOf(camera, [0.5, 2.5, 0.5]);
    host.dispatchEvent(pointer("pointerdown", { x: corner.x + 3, y: corner.y }));
    expect(service.getResult()?.kind).toBe("endpoint");
  });
});
