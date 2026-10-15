// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addStudioBg3dMeasurementGuide,
  createStudioBg3dMeasurementDocument,
} from "./studio-bg3d-measurement";
import { useStudioBg3dInferenceHost } from "./useStudioBg3dInferenceHost";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dInferenceHostInput } from "./useStudioBg3dInferenceHost";

afterEach(() => {
  cleanup();
});

function primitive(id: string, position: [number, number, number]): BgPrimitive {
  return { id, kind: "box", position, rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c9a876", name: `상자 ${id}` };
}

function boxObject(position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

function makeHost(overrides: Partial<StudioBg3dInferenceHostInput> = {}) {
  const pickMeasurementPoint = vi.fn();
  const cancelMeasurementStep = vi.fn();
  const objects = new Map<string, THREE.Object3D>();
  const base: StudioBg3dInferenceHostInput = {
    open: true,
    primitives: [primitive("A", [0, 0.5, 0])],
    customModels: [],
    primitiveObjectsRef: { current: objects },
    modelRootCacheRef: { current: new Map() },
    viewportHostRef: { current: { clientHeight: 800 } as HTMLElement },
    measurementActive: false,
    measurementStartWorld: null,
    measurementDocument: createStudioBg3dMeasurementDocument("m"),
    effectiveIsQuadView: false,
    immersiveSceneActive: false,
    placementActive: false,
    selectedIds: new Set<string>(),
    firstSelectedId: null,
    transformSpace: "world",
    pickMeasurementPoint,
    cancelMeasurementStep,
  };
  return { host: { ...base, ...overrides }, pickMeasurementPoint, cancelMeasurementStep, objects };
}

function mount(initial: StudioBg3dInferenceHostInput) {
  return renderHook(({ host }) => useStudioBg3dInferenceHost(host), { initialProps: { host: initial } });
}

describe("에디터 호스트 ↔ 추론 서비스 연결", () => {
  it("줄자가 꺼져 있으면 세션이 없다", () => {
    const { host } = makeHost();
    const { result } = mount(host);
    expect(result.current.service.isActive()).toBe(false);
    expect(result.current.pointerToolActive).toBe(false);
  });

  it("줄자를 켜면 세션이 열리고 장면·시작점·단위가 서비스에 맞춰진다", () => {
    const { host } = makeHost();
    const { result, rerender } = mount(host);
    rerender({ host: { ...host, measurementActive: true, measurementStartWorld: [1, 0, 1] } });
    const snapshot = result.current.service.getSnapshot();
    expect(snapshot.session.active).toBe(true);
    expect(snapshot.session.tool).toBe("measure");
    expect(snapshot.session.referencePoint).toEqual([1, 0, 1]);
    expect(snapshot.session.unit).toBe("m");
    expect(snapshot.scene.stats?.entities).toBe(1);
    expect(result.current.pointerToolActive).toBe(true);
  });

  it("사면(quad) 뷰나 몰입 모드에서는 줄자가 켜져 있어도 세션을 열지 않는다", () => {
    const { host } = makeHost({ measurementActive: true, effectiveIsQuadView: true });
    const { result } = mount(host);
    expect(result.current.service.isActive()).toBe(false);
    const immersive = mount({ ...host, effectiveIsQuadView: false, immersiveSceneActive: true });
    expect(immersive.result.current.service.isActive()).toBe(false);
  });

  it("길이를 입력하면 줄자의 점 찍기를 끝점과 정확한 길이로 호출한다", () => {
    const { host, pickMeasurementPoint } = makeHost({ measurementActive: true, measurementStartWorld: [1, 0, 1] });
    const { result } = mount(host);
    act(() => {
      result.current.service.handleKey("key-down", { key: "ArrowRight" });
      result.current.service.setVcbText("2.4m");
      result.current.service.submitVcb();
    });
    expect(pickMeasurementPoint).toHaveBeenCalledTimes(1);
    const [point, meters] = pickMeasurementPoint.mock.calls[0] as [number[], number];
    expect(point[0]).toBeCloseTo(3.4, 12);
    expect(point[2]).toBe(1);
    expect(meters).toBeCloseTo(2.4, 12);
  });

  it("창 키보드 Esc가 줄자 취소 단계로 연결된다", () => {
    const { host, cancelMeasurementStep } = makeHost({ measurementActive: true, measurementStartWorld: [0, 0, 0] });
    mount(host);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(cancelMeasurementStep).toHaveBeenCalledTimes(1);
  });

  it("시작점이 바뀌면 기준점을 갱신하고, 같은 값으로 다시 렌더되면 잠금을 유지한다", () => {
    const { host } = makeHost({ measurementActive: true, measurementStartWorld: [0, 0, 0] });
    const { result, rerender } = mount(host);
    act(() => result.current.service.handleKey("key-down", { key: "ArrowRight" }));
    expect(result.current.service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
    rerender({ host: { ...host, measurementStartWorld: [0, 0, 0] } });
    expect(result.current.service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
    rerender({ host: { ...host, measurementStartWorld: [2, 0, 0] } });
    expect(result.current.service.getSnapshot().session.referencePoint).toEqual([2, 0, 0]);
    expect(result.current.service.getSnapshot().session.lock).toEqual({ kind: "none" });
  });

  it("측정이 끝나면 세션을 닫고 마지막 안내문은 남긴다", () => {
    const { host } = makeHost({ measurementActive: true, measurementStartWorld: [0, 0, 0] });
    const { result, rerender } = mount(host);
    act(() => result.current.service.handleKey("key-down", { key: "ArrowUp" }));
    const spoken = result.current.service.getSnapshot().live.text;
    rerender({ host: { ...host, measurementActive: false } });
    expect(result.current.service.isActive()).toBe(false);
    expect(result.current.service.getSnapshot().live.text).toBe(spoken);
  });

  it("장면이 바뀌면 색인을 다시 만들고 같은 장면이면 다시 만들지 않는다", () => {
    const { host } = makeHost({ measurementActive: true, measurementStartWorld: [0, 0, 0] });
    const { result, rerender } = mount(host);
    const builds = result.current.service.getSnapshot().scene.builds;
    rerender({ host: { ...host } });
    expect(result.current.service.getSnapshot().scene.builds).toBe(builds);
    rerender({ host: { ...host, primitives: [primitive("A", [0, 0.5, 0]), primitive("B", [4, 0.5, 0])] } });
    expect(result.current.service.getSnapshot().scene.builds).toBe(builds + 1);
    expect(result.current.service.getSnapshot().scene.stats?.entities).toBe(2);
  });

  it("영구 측정 가이드가 있으면 가이드 끝점이 후보가 된다", () => {
    let document = createStudioBg3dMeasurementDocument("m");
    const added = addStudioBg3dMeasurementGuide(document, { startWorld: [5, 0, 5], endWorld: [8, 0, 5] });
    if (!added.ok) throw new Error(added.message);
    document = added.document;
    const { host } = makeHost({ measurementActive: true, measurementStartWorld: [0, 0, 0], measurementDocument: document });
    const { result } = mount(host);
    const candidates = result.current.service.listPickCandidates(50);
    expect(candidates.some((candidate) => candidate.label.includes("측정 가이드 1"))).toBe(true);
  });

  it("키보드 점 고르기에서 고른 점은 줄자의 점 찍기로 전달된다", () => {
    const { host, pickMeasurementPoint } = makeHost({ measurementActive: true, measurementStartWorld: null });
    const { result } = mount(host);
    act(() => result.current.pickPoint([1, 2, 3]));
    expect(pickMeasurementPoint).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("선택한 객체의 월드 위치가 점 고르기 목록의 기준이 된다", () => {
    const objects = new Map<string, THREE.Object3D>([["B", boxObject([10, 0.5, 0])]]);
    const { host } = makeHost({
      measurementActive: true,
      measurementStartWorld: null,
      primitives: [primitive("A", [0, 0.5, 0]), primitive("B", [10, 0.5, 0])],
      primitiveObjectsRef: { current: objects },
      selectedIds: new Set(["B"]),
      firstSelectedId: "B",
    });
    const { result } = mount(host);
    const first = result.current.service.listPickCandidates(4);
    expect(first.every((candidate) => candidate.sourceId === "B")).toBe(true);
  });

  it("언마운트하면 진행 중인 드래그와 세션을 정리한다", () => {
    const { host } = makeHost({ measurementActive: true, measurementStartWorld: [0, 0, 0] });
    const { result, unmount } = mount(host);
    const service = result.current.service;
    unmount();
    expect(service.isActive()).toBe(false);
  });
});

describe("모델 배치 연결", () => {
  it("배치 미리보기 중에는 HUD·키보드 없는 추론 세션을 열고 끝나면 닫는다", () => {
    const { host } = makeHost({ placementActive: true });
    const { result, rerender } = mount(host);
    const snapshot = result.current.service.getSnapshot();
    expect(snapshot.session.active).toBe(true);
    expect(snapshot.options).toEqual({ keyboard: false, hud: false });
    expect(result.current.pointerToolActive).toBe(true);
    rerender({ host: { ...host, placementActive: false } });
    expect(result.current.service.isActive()).toBe(false);
    expect(result.current.pointerToolActive).toBe(false);
  });

  it("배치 목표점을 방금 계산된 추론 점으로 바꿔 준다", () => {
    const { host } = makeHost({ placementActive: true });
    const { result } = mount(host);
    act(() => {
      result.current.service.resolve({ cursor: { kind: "point", point: [0.52, 1, 0.5], worldPerPixel: 1 / 64 } });
    });
    const snapped = result.current.inferPlacementTarget({
      surfaceHit: { point: [0.52, 1, 0.5] as const, normal: [0, 1, 0] as const },
    });
    expect(snapped.surfaceHit.point).toEqual([0.5, 1, 0.5]);
  });

  it("줄자와 배치가 동시에 켜져 있으면 줄자가 우선한다", () => {
    const { host } = makeHost({ placementActive: true, measurementActive: true, measurementStartWorld: [0, 0, 0] });
    const { result } = mount(host);
    expect(result.current.service.getSnapshot().session.tool).toBe("measure");
  });
});

describe("기즈모 드래그 세션 연결", () => {
  function setupDrag() {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(1.5, 5, 10);
    camera.lookAt(1.5, 0.5, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const object = boxObject([0, 0.5, 0]);
    const objects = new Map<string, THREE.Object3D>([["A", object], ["N", boxObject([3, 0.5, 0])]]);
    const { host } = makeHost({
      primitives: [primitive("A", [0, 0.5, 0]), primitive("N", [3, 0.5, 0])],
      primitiveObjectsRef: { current: objects },
      selectedIds: new Set(["A"]),
      firstSelectedId: "A",
    });
    const view = mount(host);
    view.result.current.onCameraChange(camera);
    return { ...view, object };
  }

  it("컨트롤러가 카메라를 알리고 사라질 때 null을 알린다", () => {
    const { result } = setupDrag();
    expect(result.current.getCamera()).not.toBeNull();
    act(() => result.current.onCameraChange(null));
    expect(result.current.getCamera()).toBeNull();
  });

  it("컨트롤러가 알려 준 카메라와 현재 장면으로 이웃 상자 모서리에 붙인다", () => {
    const { result, object } = setupDrag();
    act(() => result.current.drag.begin(object));
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    let snapped = false;
    act(() => {
      snapped = result.current.drag.update("X").snapped;
    });
    expect(snapped).toBe(true);
    expect(object.position.x).toBeCloseTo(2, 9);
    // 자기 자신(선택한 상자 A)은 후보에서 빠진다.
    expect(result.current.service.getResult()?.sourceIds).toEqual(["N"]);
    act(() => {
      result.current.drag.end();
    });
  });

  it("Alt를 누른 채로는 붙이지 않는다", () => {
    const { result, object } = setupDrag();
    act(() => result.current.drag.begin(object));
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    expect(result.current.drag.update("X").snapped).toBe(false);
    fireEvent.keyUp(window, { key: "Alt", altKey: false });
    expect(result.current.drag.update("X").snapped).toBe(true);
    act(() => {
      result.current.drag.end();
    });
  });

  it("드래그 세션은 방향키 라우팅을 쓰지 않아 기즈모 조작 중 키를 가로채지 않는다", () => {
    const { result, object } = setupDrag();
    act(() => result.current.drag.begin(object));
    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    act(() => {
      result.current.drag.end();
    });
  });
});
