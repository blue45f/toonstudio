import { describe, expect, it } from "vitest";

import type { StudioPoseFrameState } from "../studio-virtual-space-engine-bridge";
import { office2dSceneFor } from "./office2d-scene";
import { Office2dSelfPose } from "./office2d-self-pose";
import { studioVirtualToonHqManifest } from "./hq/toon-hq-manifest";

describe("명시 기립과 자동 착석", () => {
  it("한 번 소비한 기립 의도는 멈춰 있는 동안 유지하고 이동 뒤에는 자동 착석을 다시 허용한다", () => {
    const seat = office2dSceneFor(studioVirtualToonHqManifest(false)).seats[0];
    if (!seat) throw new Error("검증할 책상 좌석이 없습니다.");
    const pose: StudioPoseFrameState = { pose: "stand", poseBlend: 1, anchor: null };
    const input = { pose, moving: false, hasPath: false, point: seat.anchor, leasedPoint: seat.anchor,
      occupiedSeatIds: new Set<string>(), findSeat: () => seat };
    const controller = new Office2dSelfPose();
    expect(controller.resolveSeat({ ...input, request: null })).toBe(seat);
    expect(controller.resolveSeat({ ...input, request: "stand" })).toBeNull();
    expect(controller.resolveSeat({ ...input, request: null })).toBeNull();
    expect(controller.resolveSeat({ ...input, request: null, moving: true })).toBeNull();
    expect(controller.resolveSeat({ ...input, request: null })).toBe(seat);
  });
});
