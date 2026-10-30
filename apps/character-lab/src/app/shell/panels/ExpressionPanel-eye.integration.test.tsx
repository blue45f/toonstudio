// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, DEFAULT_FRAMING, createDefaultRecipe, createPresetCatalog } from "../../../contracts";
import { eyeAnglesQuaternion } from "../../../contracts/eye-gaze";
import { createEyeGazeFixture, createUnweightedEyeGazeFixture } from "../../../render/testing/eye-gaze-fixture";
import { createNullEngineHarness } from "../../../render/testing/null-engine-harness";
import { createProceduralFixture } from "../../../render/testing/procedural-fixture";
import { planApply } from "../../../state/apply-plan";
import { createLabStore } from "../../../state/lab-store";
import { deserializeRecipe, serializeRecipe } from "../../../state/recipe-io";
import { createMockPhysicsProviderFactory } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { createApplyLoop } from "../apply-loop";

import { ExpressionPanel } from "./ExpressionPanel";

import type { Quat } from "../../../contracts";

const disposers: Array<() => void> = [];
afterEach(() => { cleanup(); disposers.splice(0).reverse().forEach((dispose) => dispose()); });

async function setup(model = createEyeGazeFixture()) {
  // 실제 store·적용 루프·Babylon 스킨 본을 사용한다. 물리만 정지 모의이며 GPU 픽셀 검증은 아니다.
  const harness = await createNullEngineHarness({ physicsProviders: createMockPhysicsProviderFactory() });
  disposers.push(() => harness.dispose());
  const catalog = createPresetCatalog([]);
  const recipe = createDefaultRecipe(); recipe.slots.expression = null;
  const store = createLabStore({ catalog, initial: { recipe, capabilities: ALL_AVAILABLE_CAPABILITIES } });
  const session = createMockEngineSession({ phase: "ready", backend: "webgl2", diagnostics: harness.engine.diagnostics });
  session.setEngine(harness.engine);
  const loop = createApplyLoop({ store, catalog, planner: planApply, engineSession: session, buildSource: () => ({ kind: "procedural", model }) });
  disposers.push(loop.start());
  await loop.flush(); await loop.flush();
  render(<MockLabProvider store={store} engineSession={session} shell={{ applyLoop: loop }}><ExpressionPanel /></MockLabProvider>);
  const flush = async (): Promise<void> => { await act(async () => { await loop.flush(); await loop.flush(); }); };
  return { engine: harness.engine, store, loop, session, flush };
}


function expectRotation(actual: Quat | undefined, expected: Quat): void {
  expect(actual).toBeDefined();
  actual?.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? 0, 12));
}

describe("안구 UI → 레시피 → 적용 루프 → 실제 눈 본", () => {
  it("무가중 눈 본은 한글 사유와 함께 시선 제어를 비활성화하고 F10/history를 소비하지 않는다", async () => {
    const { engine, store, flush } = await setup(createUnweightedEyeGazeFixture());
    expect(engine.eyeGaze().status).toBe("unavailable");
    expect(screen.getByText(/안구 본에 연결된 스킨 가중치 또는 부착 형상이 없습니다/)).toBeDefined();
    expect(screen.getByLabelText("카메라 응시").matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "현재 시선 고정 (F10)" }).matches(":disabled")).toBe(true);
    const revision = store.getState().history.revision;
    const key = new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true });
    fireEvent(window, key); await flush();
    expect(key.defaultPrevented).toBe(false);
    expect(store.getState().history.revision).toBe(revision);
    expect(store.getState().recipe.eyeGaze).toBeUndefined();
  });

  it("수동 슬라이더·대칭 해제·undo가 실제 좌우 본 회전을 바꾼다", async () => {
    const { engine, store, loop, flush } = await setup();
    fireEvent.change(screen.getByLabelText("턱 열기"), { target: { value: "0.4" } }); await flush();
    fireEvent.change(screen.getByLabelText("좌측 안구 수평 시선 (Yaw°)"), { target: { value: "20" } }); await flush();
    expect(store.getState().recipe.eyeGaze?.left.yawDeg).toBe(20);
    expect(loop.lastReceipt()?.appliedBones).toBeGreaterThanOrEqual(2);
    expect(engine.inspectRig()?.morphInfluences["facs:jawOpen"]).toBe(0.4);
    expectRotation(engine.readBone("leftEye")?.localRotation, eyeAnglesQuaternion({ yawDeg: 20, pitchDeg: 0 }));
    expectRotation(engine.readBone("rightEye")?.localRotation, eyeAnglesQuaternion({ yawDeg: -20, pitchDeg: 0 }));
    fireEvent.click(screen.getByLabelText("좌우 안구 대칭 회전")); await flush();
    fireEvent.change(screen.getByLabelText("우측 안구 수평 시선 (Yaw°)"), { target: { value: "9" } }); await flush();
    expectRotation(engine.readBone("rightEye")?.localRotation, eyeAnglesQuaternion({ yawDeg: 9, pitchDeg: 0 }));
    act(() => store.dispatch({ type: "history/undo" })); await flush();
    expectRotation(engine.readBone("rightEye")?.localRotation, eyeAnglesQuaternion({ yawDeg: -20, pitchDeg: 0 }));
  });

  it("카메라 응시·현재 시선 고정·undo와 JSON 저장이 동일한 실제 회전을 유지한다", async () => {
    const { engine, store, flush } = await setup();
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: 13 });
    fireEvent.click(screen.getByLabelText("카메라 응시")); await flush();
    const following = engine.readBone("leftEye")?.localRotation;
    expect(store.getState().recipe.eyeGaze?.mode).toBe("camera");
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: -8 }); engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).not.toEqual(following);
    const current = engine.eyeGaze();
    fireEvent.click(screen.getByRole("button", { name: "현재 시선 고정 (F10)" })); await flush();
    const fixed = engine.readBone("leftEye")?.localRotation;
    expect(current.status === "available" && store.getState().recipe.eyeGaze?.left).toEqual(current.status === "available" && current.left);
    const loaded = deserializeRecipe(serializeRecipe(store.getState().recipe));
    expect(loaded.ok && loaded.recipe.eyeGaze).toEqual(store.getState().recipe.eyeGaze);
    engine.setCamera({ ...DEFAULT_FRAMING, yawDeg: 20 }); engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).toEqual(fixed);
    act(() => store.dispatch({ type: "history/undo" })); await flush();
    expect(store.getState().recipe.eyeGaze?.mode).toBe("camera");
    expect(engine.readBone("leftEye")?.localRotation).not.toEqual(fixed);
  });

  it("F10은 실제 좌우 pose를 history 1회로 고정하고 반복 키와 cleanup 후 입력은 처리하지 않는다", async () => {
    const { engine, store, flush } = await setup();
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: 7 });
    fireEvent.click(screen.getByLabelText("카메라 응시")); await flush();
    const captured = engine.eyeGaze();
    if (captured.status !== "available") throw new Error(captured.reasonKo);
    const depth = store.getState().history.depth;
    const key = new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true });
    fireEvent(window, key); await flush();
    expect(key.defaultPrevented).toBe(true);
    expect(store.getState().history.depth).toBe(depth + 1);
    expect(store.getState().recipe.eyeGaze).toMatchObject({ mode: "manual", symmetry: false, frozenPose: captured.frozenPose });
    const repeated = new KeyboardEvent("keydown", { key: "F10", repeat: true, bubbles: true, cancelable: true });
    fireEvent(window, repeated); await flush();
    expect(repeated.defaultPrevented).toBe(false);
    expect(store.getState().history.depth).toBe(depth + 1);
    for (const name of ["leftEye", "rightEye"] as const) expectRotation(engine.readBone(name)?.localRotation, captured.frozenPose[name]);
    cleanup();
    const afterCleanup = new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true });
    fireEvent(window, afterCleanup); await flush();
    expect(afterCleanup.defaultPrevented).toBe(false);
    expect(store.getState().history.depth).toBe(depth + 1);
  });

  it("텍스트 편집·엔진 없음·안구 본 미지원에서는 F10을 소비하거나 history를 만들지 않는다", async () => {
    const { engine, store, session, flush } = await setup();
    const revision = store.getState().history.revision;
    for (const tag of ["input", "textarea", "select", "div"] as const) {
      const host = document.createElement(tag);
      let target: Element = host;
      if (tag === "div") {
        host.setAttribute("contenteditable", "true");
        target = document.createElement("span"); host.append(target);
      }
      document.body.append(host);
      const event = new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true });
      fireEvent(target, event); await flush();
      expect(event.defaultPrevented).toBe(false);
      expect(store.getState().history.revision).toBe(revision);
      host.remove();
    }
    session.setEngine(null);
    const noEngine = new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true });
    fireEvent(window, noEngine); await flush();
    expect(noEngine.defaultPrevented).toBe(false);
    session.setEngine(engine);
    await engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    const noEyeBones = new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true });
    fireEvent(window, noEyeBones); await flush();
    expect(noEyeBones.defaultPrevented).toBe(false);
    expect(store.getState().history.revision).toBe(revision);
    expect(store.getState().recipe.eyeGaze).toBeUndefined();
  });
});
