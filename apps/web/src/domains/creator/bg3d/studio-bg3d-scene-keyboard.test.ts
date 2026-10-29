// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioBg3dSceneKeyboardHandler, type StudioBg3dSceneKeyboardPorts } from "./studio-bg3d-scene-keyboard";
import type { StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); });
function harness() {
  const captureInFlightRef = { current: false }, webXrSessionStateRef = { current: { status: "idle" } };
  const physicsPhaseRef: { current: StudioBg3dPhysicsPhase } = { current: "idle" };
  const selectedIdsRef = { current: new Set(["original-box"]) }, measurementActiveRef = { current: false };
  const deleteRef = { current: vi.fn<StudioBg3dSceneKeyboardPorts["deleteSelected"]>() };
  const undo = vi.fn<StudioBg3dSceneKeyboardPorts["undo"]>(), redo = vi.fn<StudioBg3dSceneKeyboardPorts["redo"]>();
  const cancelMeasurement = vi.fn<StudioBg3dSceneKeyboardPorts["cancelMeasurement"]>();
  const setTransformMode = vi.fn<StudioBg3dSceneKeyboardPorts["setTransformMode"]>();
  const ports: StudioBg3dSceneKeyboardPorts = { captureInFlightRef, webXrSessionStateRef, physicsPhaseRef, selectedIdsRef,
    measurementActiveRef, deleteSelected: () => deleteRef.current(), undo, redo, cancelMeasurement, setTransformMode };
  const handler = createStudioBg3dSceneKeyboardHandler(ports);
  window.addEventListener("keydown", handler);
  cleanups.push(() => window.removeEventListener("keydown", handler));
  const target = document.createElement("button"); document.body.append(target); target.focus();
  return { ports, captureInFlightRef, webXrSessionStateRef, physicsPhaseRef, selectedIdsRef, measurementActiveRef,
    deleteRef, undo, redo, cancelMeasurement, setTransformMode, handler, target };
}
function dispatch(target: EventTarget, options: KeyboardEventInit, prevented = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...options });
  if (prevented) event.preventDefault(); target.dispatchEvent(event); return event;
}
function expectNoActions(h: ReturnType<typeof harness>): void {
  expect(h.deleteRef.current).not.toHaveBeenCalled(); expect(h.undo).not.toHaveBeenCalled(); expect(h.redo).not.toHaveBeenCalled();
  expect(h.cancelMeasurement).not.toHaveBeenCalled(); expect(h.setTransformMode).not.toHaveBeenCalled();
}

describe("배경 장면 keyboard authority 경계", () => {
  it("실제 중첩 dialog의 버튼·SVG target에서 Delete/Undo/Redo/변형 키를 배경으로 보내지 않는다", () => {
    const h = harness(); h.measurementActiveRef.current = true;
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-studio-shortcut-boundary", "true"); document.body.append(dialog); dialog.append(h.target);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); h.target.append(icon);
    const keys: KeyboardEventInit[] = [{ key: "Delete" }, { key: "Backspace" }, { key: "z", ctrlKey: true },
      { key: "z", metaKey: true, shiftKey: true }, { key: "y", ctrlKey: true }, { key: "t" }, { key: "r" }, { key: "s" }];
    for (const target of [h.target, icon]) for (const key of keys) expect(dispatch(target, key).defaultPrevented).toBe(false);
    expectNoActions(h);
  });

  it("안쪽 도구가 preventDefault한 이벤트와 IME 조합 이벤트를 다시 실행하지 않는다", () => {
    const h = harness();
    dispatch(h.target, { key: "Delete" }, true); dispatch(h.target, { key: "z", ctrlKey: true }, true);
    dispatch(h.target, { key: "r" }, true); dispatch(h.target, { key: "Backspace", isComposing: true });
    expectNoActions(h);
  });

  it.each(["input", "textarea", "select"])("%s 입력 중 배경 명령은 실행되지 않는다", (tag) => {
    const h = harness(), input = document.createElement(tag); input.setAttribute("contenteditable", "false");
    document.body.append(input); dispatch(input, { key: "Delete" }); dispatch(input, { key: "z", ctrlKey: true });
    dispatch(input, { key: "t" }); expectNoActions(h);
  });

  it("contenteditable 안의 자식도 보호하고 명시 false 영역의 일반 단축키는 유지한다", () => {
    const h = harness(), input = document.createElement("div"), child = document.createElement("span");
    input.setAttribute("contenteditable", "true"); input.append(child); document.body.append(input);
    dispatch(child, { key: "Delete" }); dispatch(child, { key: "z", metaKey: true }); expectNoActions(h);
    input.setAttribute("contenteditable", "false");
    expect(dispatch(child, { key: "Delete" }).defaultPrevented).toBe(true); expect(h.deleteRef.current).toHaveBeenCalledOnce();
  });

  it("등록 뒤 갱신된 capture/XR 상태를 읽고 idle/error일 때만 기존 명령을 전달한다", () => {
    const h = harness();
    h.captureInFlightRef.current = true;
    dispatch(h.target, { key: "Delete" }); dispatch(h.target, { key: "z", ctrlKey: true }); dispatch(h.target, { key: "t" });
    h.captureInFlightRef.current = false;
    for (const status of ["requesting", "presenting", "ending", "future-state"]) {
      h.webXrSessionStateRef.current = { status };
      dispatch(h.target, { key: "Delete" }); dispatch(h.target, { key: "z", ctrlKey: true }); dispatch(h.target, { key: "r" });
    }
    expectNoActions(h);
    h.webXrSessionStateRef.current = { status: "error" }; dispatch(h.target, { key: "Delete" });
    h.webXrSessionStateRef.current = { status: "idle" }; dispatch(h.target, { key: "Backspace" });
    expect(h.deleteRef.current).toHaveBeenCalledTimes(2);
  });

  it("삭제는 최신 선택과 physics transient 단계를 따르고 callback ref 교체도 즉시 반영한다", () => {
    const h = harness(); h.selectedIdsRef.current = new Set(); dispatch(h.target, { key: "Delete" });
    h.selectedIdsRef.current = new Set(["latest-box"]);
    const transient: StudioBg3dPhysicsPhase[] = ["loading", "running", "paused", "complete", "baking"];
    for (const phase of transient) { h.physicsPhaseRef.current = phase; dispatch(h.target, { key: "Delete" }); }
    expectNoActions(h);
    h.physicsPhaseRef.current = "idle"; expect(dispatch(h.target, { key: "Delete" }).defaultPrevented).toBe(true);
    const previous = h.deleteRef.current, replacement = vi.fn(); h.deleteRef.current = replacement;
    h.physicsPhaseRef.current = "error"; dispatch(h.target, { key: "Backspace" });
    expect(previous).toHaveBeenCalledOnce(); expect(replacement).toHaveBeenCalledOnce();
  });

  it("수정키 Z/ShiftZ/Y는 기존 undo/redo action과 preventDefault를 유지한다", () => {
    const h = harness();
    for (const options of [{ key: "Z", ctrlKey: true }, { key: "z", metaKey: true }]) expect(dispatch(h.target, options).defaultPrevented).toBe(true);
    for (const options of [{ key: "z", ctrlKey: true, shiftKey: true }, { key: "Z", metaKey: true, shiftKey: true },
      { key: "y", ctrlKey: true }, { key: "Y", metaKey: true }]) expect(dispatch(h.target, options).defaultPrevented).toBe(true);
    expect(h.undo).toHaveBeenCalledTimes(2); expect(h.redo).toHaveBeenCalledTimes(4); expect(h.deleteRef.current).not.toHaveBeenCalled();
  });

  it("T/R/S의 기존 변형·줄자 취소와 수정키 조합의 비처리 의미를 유지한다", () => {
    const h = harness();
    dispatch(h.target, { key: "T" }); expect(h.cancelMeasurement).not.toHaveBeenCalled();
    h.measurementActiveRef.current = true; dispatch(h.target, { key: "r" }); dispatch(h.target, { key: "S" });
    expect(h.setTransformMode.mock.calls).toEqual([["translate"], ["rotate"], ["scale"]]);
    expect(h.cancelMeasurement.mock.calls).toEqual([["변형 도구로 전환해 줄자 측정을 취소했습니다."], ["변형 도구로 전환해 줄자 측정을 취소했습니다."]]);
    expect(dispatch(h.target, { key: "r", ctrlKey: true }).defaultPrevented).toBe(false);
    dispatch(h.target, { key: "s", metaKey: true }); dispatch(h.target, { key: "q" });
    expect(h.setTransformMode).toHaveBeenCalledTimes(3);
  });

  it("effect 정리와 같은 listener 해제 뒤에는 배경 명령을 실행하지 않는다", () => {
    const h = harness(); window.removeEventListener("keydown", h.handler); dispatch(h.target, { key: "Delete" }); expectNoActions(h);
  });
});
