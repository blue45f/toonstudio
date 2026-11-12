import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";

describe("명시 자세 요청의 관측과 소비 경계", () => {
  it("이미 서 있는 경우에도 일어서기 요청을 읽되 상태 판정 뒤에는 한 번만 소비한다", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    bridge.requestPose("stand");
    expect(bridge.getPendingPoseRequest()).toBe("stand");
    expect(bridge.getPendingPoseRequest()).toBe("stand");
    const state = bridge.updatePoseState({ position: { x: 100, y: 100 }, moving: false, seatAnchors: [], openArea: true, now: 10 });
    expect(state.pose).toBe("stand");
    expect(bridge.getPendingPoseRequest()).toBeNull();
    bridge.updatePoseState({ position: { x: 100, y: 100 }, moving: true, seatAnchors: [], openArea: true, now: 20 });
    expect(bridge.getPendingPoseRequest()).toBeNull();
  });
});
