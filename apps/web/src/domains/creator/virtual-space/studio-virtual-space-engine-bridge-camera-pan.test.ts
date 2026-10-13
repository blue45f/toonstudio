import { describe, expect, it } from "vitest";

import { StudioCameraPanStore } from "./studio-virtual-space-camera-pan";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";

describe("엔진 브리지의 카메라 둘러보기 저장소", () => {
  it("브리지마다 저장소를 하나 갖고, 다른 브리지와 공유하지 않는다", () => {
    const first = new StudioVirtualSpaceEngineBridge();
    const second = new StudioVirtualSpaceEngineBridge();
    expect(first.cameraPan).toBeInstanceOf(StudioCameraPanStore);
    expect(first.cameraPan).not.toBe(second.cameraPan);
    first.cameraPan.drag(10, 4);
    expect(first.cameraPan.consumeDrag()).toEqual({ x: 10, y: 4 });
    expect(second.cameraPan.consumeDrag()).toBeNull();
  });

  it("처음에는 둘러보기가 가능하고 옮겨지지 않은 상태다", () => {
    expect(new StudioVirtualSpaceEngineBridge().cameraPan.getSnapshot()).toEqual({ available: true, panned: false });
  });
});
