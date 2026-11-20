import { describe, expect, it } from "vitest";

import { STUDIO_HAND_PRESETS } from "../studio-hand-pose-scanner";
import {
  createStudioMannequinHandPoseChangeHandler,
  studioMannequinFingerPoseToHandPose,
} from "./studio-mannequin-hand-pose-adapter";

import type { StudioMannequinFingerSplayMap } from "./studio-mannequin-ecorche-anatomy";
import type { StudioMannequinFingerPose } from "./studio-mannequin-model";

const asymmetricPose: StudioMannequinFingerPose = {
  left: {
    thumb: [5, 15, 25], index: [10, 20, 30], middle: [12, 22, 32],
    ring: [14, 24, 34], little: [16, 26, 36],
  },
  right: {
    thumb: [60, 40, 20], index: [70, 50, 30], middle: [80, 60, 40],
    ring: [90, 70, 50], little: [95, 75, 55],
  },
};
const leftSplay: Partial<StudioMannequinFingerSplayMap> = { thumb: -3, index: -6, middle: 2, ring: 5, little: 7 };
const rightSplay: Partial<StudioMannequinFingerSplayMap> = { thumb: 4, index: 8, middle: -1, ring: -5, little: -7 };

function createEditor() {
  let fingerPose = asymmetricPose;
  let leftSplayDeg = leftSplay;
  let rightSplayDeg = rightSplay;
  const change = createStudioMannequinHandPoseChangeHandler(
    (update) => { fingerPose = update(fingerPose); },
    (update) => { leftSplayDeg = update(leftSplayDeg); },
    (update) => { rightSplayDeg = update(rightSplayDeg); },
  );
  return { change, read: () => ({ fingerPose, leftSplayDeg, rightSplayDeg }) };
}

describe("마네킹 손 포즈 편집 어댑터", () => {
  it("검지 벌림만 편집하면 비대칭인 양손의 모든 마디와 다른 손가락 벌림을 보존한다", () => {
    const editor = createEditor();
    const display = studioMannequinFingerPoseToHandPose(asymmetricPose, rightSplay);
    editor.change({ ...display, index: { ...display.index, spread: 0.5 } }, {
      kind: "finger", finger: "index", field: "spread",
    });

    const result = editor.read();
    expect(result.fingerPose).toBe(asymmetricPose);
    expect(result.fingerPose.left?.index).toEqual([10, 20, 30]);
    expect(result.fingerPose.right?.index).toEqual([70, 50, 30]);
    expect(result.fingerPose.left?.middle).toEqual([12, 22, 32]);
    expect(result.fingerPose.right?.middle).toEqual([80, 60, 40]);
    expect(result.leftSplayDeg).toEqual({ thumb: -3, index: 9, middle: 2, ring: 5, little: 7 });
    expect(result.rightSplayDeg).toEqual({ thumb: 4, index: 9, middle: -1, ring: -5, little: -7 });
  });

  it("검지 굽힘만 편집하면 양손 검지만 바꾸고 나머지 마디와 모든 벌림을 보존한다", () => {
    const editor = createEditor();
    const display = studioMannequinFingerPoseToHandPose(asymmetricPose, rightSplay);
    editor.change({ ...display, index: { ...display.index, flex: 0.25 } }, {
      kind: "finger", finger: "index", field: "flex",
    });

    const result = editor.read();
    expect(result.fingerPose).toEqual({
      left: { ...asymmetricPose.left, index: [25, 25, 25] },
      right: { ...asymmetricPose.right, index: [25, 25, 25] },
    });
    expect(result.fingerPose.left?.middle).toEqual([12, 22, 32]);
    expect(result.fingerPose.right?.middle).toEqual([80, 60, 40]);
    expect(result.leftSplayDeg).toBe(leftSplay);
    expect(result.rightSplayDeg).toBe(rightSplay);
  });

  it("전체 프리셋은 기존 비대칭 포즈 대신 모든 손가락 굽힘과 벌림을 양손에 적용한다", () => {
    const editor = createEditor();
    const fist = STUDIO_HAND_PRESETS.find((preset) => preset.id === "fist");
    if (!fist) throw new Error("주먹 쥐기 프리셋이 필요합니다.");
    editor.change(fist.pose, { kind: "preset" });

    const result = editor.read();
    const expectedFingers = {
      thumb: [90, 90, 90], index: [95, 95, 95], middle: [95, 95, 95],
      ring: [95, 95, 95], little: [95, 95, 95],
    };
    expect(result.fingerPose).toEqual({ left: expectedFingers, right: expectedFingers });
    expect(result.leftSplayDeg).toEqual({ thumb: -9, index: 0, middle: 0, ring: 0, little: 0 });
    expect(result.rightSplayDeg).toEqual(result.leftSplayDeg);
  });
});
