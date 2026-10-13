// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { STUDIO_USER_ZOOM_STORAGE_KEY, StudioUserZoomStore } from "./studio-virtual-space-user-zoom";

afterEach(() => localStorage.clear());

describe("엔진 브리지의 사용자 줌 저장소", () => {
  it("브리지마다 저장소를 하나 갖고, 값은 이 기기에 저장되어 새 브리지가 이어받는다", () => {
    const first = new StudioVirtualSpaceEngineBridge();
    expect(first.userZoom).toBeInstanceOf(StudioUserZoomStore);
    expect(first.userZoom.get()).toBe(1);
    first.userZoom.apply("in");
    expect(localStorage.getItem(STUDIO_USER_ZOOM_STORAGE_KEY)).toBe("1.15");
    const second = new StudioVirtualSpaceEngineBridge();
    expect(second.userZoom.get()).toBe(1.15);
    expect(second.userZoom).not.toBe(first.userZoom);
  });
});
