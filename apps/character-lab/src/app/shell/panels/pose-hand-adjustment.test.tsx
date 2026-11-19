// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { PERFORMANCE_PRESETS, findHandPosePreset } from "../../../animation/presets";
import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe, createPresetCatalog } from "../../../contracts";
import { APPEARANCE_PRESETS } from "../../../presets";
import { createLabStore } from "../../../state/lab-store";
import { deserializeRecipe, serializeRecipe } from "../../../state/recipe-io";
import { MockLabProvider } from "../../../testing/mock-store";

import { adjustHandAxis, effectiveHandPose, matchesHandPosePreset, readHandSliders } from "./pose-hand-adjustment";
import { PosePanel } from "./PosePanel";

afterEach(cleanup);

it("브이 손목만 굽히고 Undo·저장본 재열기에서 양손 표정과 실제 표시 각도를 복구한다", () => {
  const catalog = createPresetCatalog([...APPEARANCE_PRESETS, ...PERFORMANCE_PRESETS]);
  const store = createLabStore({ catalog, now: () => 1000, initial: { recipe: createDefaultRecipe(), capabilities: ALL_AVAILABLE_CAPABILITIES } });
  store.dispatch({ type: "hand-pose/set", side: "left", presetId: "hand-pose/peace" });
  store.dispatch({ type: "hand-pose/set", side: "right", presetId: "hand-pose/fist" });
  const before = store.getState().recipe;
  render(<MockLabProvider store={store} catalog={catalog}><PosePanel /></MockLabProvider>);
  fireEvent.click(screen.getByLabelText("세부 왼손"));
  const wrist = screen.getByTestId("pose-fine-wrist-flex-slider") as HTMLInputElement;
  fireEvent.change(wrist, { target: { value: "32" } });
  expect(wrist.value).toBe("32");
  const current = store.getState().recipe;
  expect(current.handPose).toEqual(before.handPose);
  expect(current.pose.leftHand).toBeDefined();
  expect(current.pose.rightHand).toEqual(before.pose.rightHand);
  const checked = deserializeRecipe(serializeRecipe(current));
  if (!checked.ok) throw new Error(checked.failure.reasonKo);
  act(() => store.dispatch({ type: "history/undo" }));
  expect(wrist.value).toBe("0");
  expect(store.getState().recipe.handPose).toEqual(before.handPose);
  act(() => store.dispatch({ type: "recipe/load", recipe: checked.recipe }));
  expect(wrist.value).toBe("32");
  const effective = effectiveHandPose(store.getState().recipe);
  expect(matchesHandPosePreset(effective, "left", findHandPosePreset("peace"))).toBe(true);
  expect(matchesHandPosePreset(effective, "right", findHandPosePreset("fist"))).toBe(true);
  expect(matchesHandPosePreset(effective, "both", findHandPosePreset("peace"))).toBe(false);
  const peace = findHandPosePreset("peace");
  expect(peace.left.leftIndexIntermediate).toBeUndefined();
  const bentIndex = { ...effective, leftIndexIntermediate: findHandPosePreset("fist").left.leftIndexIntermediate };
  expect(matchesHandPosePreset(bentIndex, "left", peace)).toBe(false);
});

it("벌림 한 축을 바꿔도 구부린 손가락과 손목·반대 손은 그대로 남는다", () => {
  const peace = findHandPosePreset("peace").left;
  const fist = findHandPosePreset("fist").right;
  const hand = { ...peace, ...fist };
  const current = readHandSliders(hand, "left");
  const next = adjustHandAxis(hand, "left", "spreadDeg", current.spreadDeg - 7, value => value);
  expect(next.leftRingIntermediate).toEqual(peace.leftRingIntermediate);
  expect(next.leftIndexIntermediate).toEqual(peace.leftIndexIntermediate);
  expect(next.leftHand).toBeUndefined();
  expect(next.rightRingIntermediate).toBeUndefined();
  expect(readHandSliders(next, "left").spreadDeg).toBeCloseTo(current.spreadDeg - 7, 5);
  expect(readHandSliders(next, "left").curlDeg).toBeCloseTo(current.curlDeg, 6);
});
