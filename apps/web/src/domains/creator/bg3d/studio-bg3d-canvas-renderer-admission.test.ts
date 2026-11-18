// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { acceptStudioBg3dViewportRenderer } from "./studio-bg3d-canvas-renderer-admission";

describe("3D 배경 뷰포트의 렌더러 수명", () => {
  it("새 캔버스가 열린 뒤 이전 WebGPU 장치의 초기화가 끝나면 이전 장치만 해제한다", () => {
    const host = document.createElement("div");
    const detached = { domElement: document.createElement("canvas"), isWebGPURenderer: true, dispose: vi.fn() };
    const active = { domElement: document.createElement("canvas"), isWebGPURenderer: true, dispose: vi.fn() };
    host.append(detached.domElement);
    host.replaceChildren(active.domElement);
    expect(acceptStudioBg3dViewportRenderer(host, active)).toBe(true);
    expect(acceptStudioBg3dViewportRenderer(host, detached)).toBe(false);
    expect(detached.dispose).toHaveBeenCalledOnce();
    expect(active.dispose).not.toHaveBeenCalled();
  });

  it("R3F 자체가 제거하는 WebGL 컨텍스트를 이중 해제하지 않는다", () => {
    const renderer = { domElement: document.createElement("canvas"), dispose: vi.fn() };
    expect(acceptStudioBg3dViewportRenderer(null, renderer)).toBe(false);
    expect(renderer.dispose).not.toHaveBeenCalled();
  });
});
