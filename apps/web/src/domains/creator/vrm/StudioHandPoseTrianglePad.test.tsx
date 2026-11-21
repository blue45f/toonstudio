// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HAND_FINGER_LOCKS,
  computeHandTriangleWeights,
  evaluateHandTrianglePose,
} from "../character-shaper/studio-webtoon-21-body-and-3part-hair";

import { StudioHandPoseTrianglePad } from "./StudioHandPoseTrianglePad";
import { createStudioVrmHandPose } from "./studio-vrm-hand-poses";

afterEach(() => {
  cleanup();
});

describe("StudioHandPoseTrianglePad", () => {
  it("computes smooth 4-region weights and preserves locked fingers verbatim", () => {
    const atFist = computeHandTriangleWeights({ x: 0.08, y: 0.92 });
    expect(atFist.weights.fist).toBeGreaterThan(0.8);
    expect(
      atFist.weights.open + atFist.weights.fist + atFist.weights.point + atFist.weights.pinch,
    ).toBeCloseTo(1, 5);

    const atPinch = computeHandTriangleWeights({ x: 0.5, y: 0.63 });
    expect(atPinch.weights.pinch).toBeGreaterThan(0.95);

    // 검지를 펴기 상태로 잠근 뒤 주먹(fist) 꼭짓점으로 이동해도 검지 본 회전이 보존되어야 한다
    const openBaseline = createStudioVrmHandPose("right", "open");
    const lockedEval = evaluateHandTrianglePose(
      { x: 0.08, y: 0.92 },
      "right",
      { ...DEFAULT_HAND_FINGER_LOCKS, index: true },
      openBaseline,
    );
    expect(lockedEval.rotations.rightIndexProximal).toEqual(openBaseline.rightIndexProximal);
    expect(lockedEval.rotations.rightMiddleProximal[2]).toBeGreaterThan(0.5);
  });

  it("renders interactive 4-region vertices and finger lock chips", () => {
    const onChangePoint = vi.fn();
    const onToggleFingerLock = vi.fn();

    render(
      <StudioHandPoseTrianglePad
        side="right"
        point={{ x: 0.5, y: 0.06 }}
        lockedFingers={DEFAULT_HAND_FINGER_LOCKS}
        onChangePoint={onChangePoint}
        onToggleFingerLock={onToggleFingerLock}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "쥐기" }));
    expect(onChangePoint).toHaveBeenCalledTimes(1);
    const [, evaluation] = onChangePoint.mock.calls[0];
    expect(evaluation.dominantPoseKo).toBe("쥐기");

    fireEvent.click(screen.getByRole("button", { name: /검지 잠금/u }));
    expect(onToggleFingerLock).toHaveBeenCalledWith("index");
  });
});
