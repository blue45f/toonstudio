// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioSculptGestureToken, type StudioSculptGestureController } from "./studio-hybrid-dcc-sculpt-gesture";
import { useStudioHybridDccSculptPointer, type StudioSculptPointerEvent } from "./useStudioHybridDccSculptPointer";

const fiber = vi.hoisted((): { current: { gl: { domElement: HTMLCanvasElement }; raycaster: import("three").Raycaster } | null } => ({ current: null }));
vi.mock("@react-three/fiber", () => ({ useThree: () => {
  if (!fiber.current) throw new Error("포인터 fixture의 scene이 없습니다.");
  return fiber.current;
} }));
const disposers: Array<() => void> = [];
afterEach(() => { cleanup(); for (const dispose of disposers.splice(0)) dispose(); fiber.current = null; document.body.replaceChildren(); });

function fixture() {
  const canvas = document.createElement("canvas"), section = document.createElement("section");
  section.setAttribute("data-studio-hybrid-dcc-viewport", "true"); section.append(canvas); document.body.append(section); canvas.tabIndex = 0;
  const captured = new Set<number>();
  const set = vi.fn(function (this: HTMLCanvasElement, pointerId: number) { expect(this).toBe(canvas); captured.add(pointerId); });
  const release = vi.fn(function (this: HTMLCanvasElement, pointerId: number) { expect(this).toBe(canvas); captured.delete(pointerId); });
  const has = function (this: HTMLCanvasElement, pointerId: number) { expect(this).toBe(canvas); return captured.has(pointerId); };
  Object.defineProperties(canvas, { setPointerCapture: { value: set }, releasePointerCapture: { value: release }, hasPointerCapture: { value: has } });
  const sourceMesh = createStudioEditableMeshFromPolygons([{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }], [[0, 1, 2]]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material), group = new THREE.Group();
  group.position.x = 4; group.add(mesh); group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(4, 0, 3), new THREE.Vector3(0, 0, -1));
  fiber.current = { gl: { domElement: canvas }, raycaster }; disposers.push(() => { geometry.dispose(); material.dispose(); });
  const token = createStudioSculptGestureToken(); let valid = true;
  const begin = vi.fn(() => token), sample = vi.fn(), end = vi.fn(), cancel = vi.fn();
  const controller: StudioSculptGestureController = { begin, isCurrent: () => valid, sample, end, cancel };
  const legacy = vi.fn(), dragging = vi.fn();
  const options = { assetId: "triangle", sourceMesh, sourceMeshHash: hashStudioEditableMesh(sourceMesh), sourceMeshRevision: 1,
    objectRef: { current: group }, controller, legacyStroke: legacy, onDraggingChange: dragging };
  const event = (timeStamp: number, extra: Partial<StudioSculptPointerEvent> = {}): StudioSculptPointerEvent => ({
    pointerId: 4, timeStamp, button: 0, buttons: 1, isPrimary: true, target: canvas, eventObject: mesh, stopPropagation: vi.fn(), ...extra,
  });
  return { options, event, begin, sample, end, cancel, legacy, dragging, canvas, section, captured, release, raycaster,
    invalidate: () => { valid = false; } };
}
describe("실제 mesh ray와 포인터 수명 adapter", () => {
  it("world hit를 원본 group의 local 좌표로 변환하고 정상 up·늦은 lost를 한 번만 처리한다", () => {
    const f = fixture(), h = renderHook(useStudioHybridDccSculptPointer, { initialProps: f.options });
    act(() => h.result.current.onPointerDown(f.event(10)));
    expect(f.begin).toHaveBeenCalledWith({ assetId: "triangle", pointerId: 4, localPoint: { x: 0, y: 0, z: 0 } });
    f.raycaster.ray.origin.x = 4.1;
    act(() => h.result.current.onPointerMove(f.event(11)));
    expect(f.sample).toHaveBeenCalledTimes(1); expect(f.sample.mock.calls[0]?.[1].x).toBeCloseTo(.1, 12);
    act(() => h.result.current.onPointerUp(f.event(12)));
    act(() => h.result.current.onLostPointerCapture(f.event(13)));
    expect(f.end).toHaveBeenCalledTimes(1); expect(f.cancel).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.legacy).not.toHaveBeenCalled(); expect(f.dragging.mock.calls).toEqual([[true], [false]]);
  });
  it("capture의 이전 intersection이 남아 있어도 현재 ray가 빗나가면 가짜 sample을 만들지 않는다", () => {
    const f = fixture(), h = renderHook(useStudioHybridDccSculptPointer, { initialProps: f.options });
    act(() => h.result.current.onPointerDown(f.event(10))); f.raycaster.ray.origin.x = 100;
    act(() => h.result.current.onPointerMove(f.event(11)));
    expect(f.sample).not.toHaveBeenCalled(); act(() => h.result.current.onPointerUp(f.event(12)));
    expect(f.end).toHaveBeenCalledTimes(1);
  });
  it("새 controller의 거절은 기존 point callback으로 우회하지 않는다", () => {
    const f = fixture(), reject: StudioSculptGestureController = { ...f.options.controller, begin: () => null };
    const h = renderHook(useStudioHybridDccSculptPointer, { initialProps: { ...f.options, controller: reject } });
    act(() => h.result.current.onPointerDown(f.event(10))); act(() => h.result.current.onPointerMove(f.event(11)));
    expect(f.legacy).not.toHaveBeenCalled(); expect(f.captured.size).toBe(0);
  });
  it("동일 controller의 외부 lease 취소는 다음 layout에서 자신의 capture를 해제한다", () => {
    const f = fixture(), h = renderHook(useStudioHybridDccSculptPointer, { initialProps: f.options });
    act(() => h.result.current.onPointerDown(f.event(10))); f.invalidate(); h.rerender(f.options);
    expect(f.captured.size).toBe(0); expect(f.release).toHaveBeenCalledTimes(1);
    act(() => h.result.current.onPointerUp(f.event(12))); expect(f.end).not.toHaveBeenCalled();
  });
  it.each(["blur", "unmount"] as const)("%s는 drawing만 취소하고 source callback을 추가하지 않는다", (kind) => {
    const f = fixture(), h = renderHook(useStudioHybridDccSculptPointer, { initialProps: f.options });
    act(() => h.result.current.onPointerDown(f.event(10)));
    if (kind === "blur") act(() => { window.dispatchEvent(new Event("blur")); }); else h.unmount();
    expect(f.cancel).toHaveBeenCalledTimes(1); expect(f.end).not.toHaveBeenCalled(); expect(f.captured.size).toBe(0);
  });
  it("drawing Escape는 composing/input/inner dialog를 건드리지 않고 자신의 canvas에서만 취소한다", () => {
    const f = fixture(), h = renderHook(useStudioHybridDccSculptPointer, { initialProps: f.options });
    act(() => h.result.current.onPointerDown(f.event(10)));
    const input = document.createElement("input"), dialog = document.createElement("div"), button = document.createElement("button");
    dialog.setAttribute("role", "dialog"); dialog.append(button); f.section.append(input, dialog);
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      f.canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true })); });
    expect(f.cancel).not.toHaveBeenCalled();
    act(() => { f.canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(f.cancel).toHaveBeenCalledTimes(1); expect(f.end).not.toHaveBeenCalled(); expect(f.captured.size).toBe(0);
  });
  it("기존 point callback만 주어진 호출은 down/move를 계속 전달하고 up에서 capture를 정리한다", () => {
    const f = fixture(), h = renderHook(useStudioHybridDccSculptPointer, { initialProps: { ...f.options, controller: undefined } });
    act(() => h.result.current.onPointerDown(f.event(10))); act(() => h.result.current.onPointerMove(f.event(11)));
    expect(f.legacy).toHaveBeenCalledTimes(2); act(() => h.result.current.onPointerUp(f.event(12)));
    expect(f.captured.size).toBe(0); expect(f.begin).not.toHaveBeenCalled();
  });
});
