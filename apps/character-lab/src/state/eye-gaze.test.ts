import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, DEFAULT_EYE_GAZE, createDefaultRecipe, createPresetCatalog, parseRecipe } from "../contracts";
import { eyeAnglesQuaternion } from "../contracts/eye-gaze";

import { createLabStore } from "./lab-store";
import { deserializeRecipe, serializeRecipe } from "./recipe-io";

function setup() {
  const recipe = createDefaultRecipe();
  recipe.expression = { jawOpen: 0.4 };
  recipe.slots.expression = null;
  return createLabStore({ catalog: createPresetCatalog([]), initial: { recipe, capabilities: ALL_AVAILABLE_CAPABILITIES }, now: () => 1 });
}

describe("저장되는 안구 시선", () => {
  it("미지정 시 기존 플랜·JSON을 유지하고, 수동 시선은 실제 본 회전·대칭·undo/redo로 이어진다", () => {
    const store = setup();
    const before = store.getPlan();
    expect(before).not.toHaveProperty("eyeGaze");
    expect(serializeRecipe(store.getState().recipe)).not.toContain("eyeGaze");
    for (const yawDeg of [10, 20]) store.dispatch({ type: "eye-gaze/set", gaze: { ...DEFAULT_EYE_GAZE, left: { yawDeg, pitchDeg: 5 } }, coalesceKey: "left-yaw" });
    expect(store.getState().history.depth).toBe(1);
    expect(store.getPlan().boneRotations.leftEye).toEqual(eyeAnglesQuaternion({ yawDeg: 20, pitchDeg: 5 }));
    expect(store.getPlan().boneRotations.rightEye).toEqual(eyeAnglesQuaternion({ yawDeg: -20, pitchDeg: 5 }));
    expect(store.getPlan().morphWeights["facs:jawOpen"]).toBe(0.4);
    store.dispatch({ type: "history/undo" });
    expect(store.getPlan().boneRotations).toEqual(before.boneRotations);
    expect(store.getState().recipe.eyeGaze).toBeUndefined();
    store.dispatch({ type: "history/redo" });
    expect(store.getState().recipe.eyeGaze?.left.yawDeg).toBe(20);
  });

  it("비대칭 회전과 카메라 추적 설정은 strict 레시피 JSON으로 재현된다", () => {
    const store = setup();
    const gaze = { ...DEFAULT_EYE_GAZE, mode: "camera" as const, symmetry: false, left: { yawDeg: 12, pitchDeg: -3 }, right: { yawDeg: 4, pitchDeg: 7 } };
    store.dispatch({ type: "eye-gaze/set", gaze });
    const loaded = deserializeRecipe(serializeRecipe(store.getState().recipe));
    expect(loaded.ok && loaded.recipe.eyeGaze).toEqual(gaze);
    expect(store.getPlan().eyeGaze).toEqual(gaze);
    expect(store.getPlan().boneRotations.leftEye).toBeUndefined();
    store.dispatch({ type: "eye-gaze/set", gaze: { ...gaze, mode: "manual" } });
    expect(store.getPlan().boneRotations.rightEye).toEqual(eyeAnglesQuaternion(gaze.right));
  });

  it("범위 밖·NaN·추가 필드는 수신 경계에서 거부한다", () => {
    const store = setup();
    for (const yawDeg of [26, Number.NaN, Number.POSITIVE_INFINITY]) {
      store.dispatch({ type: "eye-gaze/set", gaze: { ...DEFAULT_EYE_GAZE, left: { yawDeg, pitchDeg: 0 } } });
    }
    expect(store.getState().history.depth).toBe(0);
    expect(store.getState().failures).toHaveLength(3);
    expect(parseRecipe({ ...createDefaultRecipe(), eyeGaze: { ...DEFAULT_EYE_GAZE, highlightEuler: [0, 0, 0] } }).ok).toBe(false);
  });
});
