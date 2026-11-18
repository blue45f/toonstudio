import { afterEach, describe, expect, it, vi } from "vitest";

import { observeStudioEraserLatencyFixture } from "./studio-brush-latency-eraser-fixture";

afterEach(() => vi.unstubAllGlobals());

function pixelFixture() {
  let inkPixels = 0;
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const layer = { width: 400, height: 300, getBoundingClientRect: () => rect };
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: () => {
      const data = new Uint8ClampedArray(12 * 12 * 4).fill(255);
      for (let pixel = 0; pixel < inkPixels; pixel += 1) data.fill(0, pixel * 4, pixel * 4 + 3);
      return { data };
    },
  };
  vi.stubGlobal("document", {
    querySelector: () => ({ parentElement: { closest: () => ({ querySelectorAll: () => [layer] }) } }),
  });
  vi.stubGlobal("OffscreenCanvas", class { getContext() { return context; } });
  return { paint: (pixels: number) => { inkPixels = pixels; }, context };
}

describe("지우개 지연 측정의 실제 안료 준비", () => {
  it("빈 종이에서 지울 안료가 없으면 준비 완료로 보고하지 않는다", () => {
    pixelFixture();
    const points = [{ x: 100, y: 100 }];
    const before = observeStudioEraserLatencyFixture({ points });
    if (!before) throw new Error("기준 화면이 없습니다.");
    expect(observeStudioEraserLatencyFixture({ points, baseline: before.pixels })).toBe(false);
  });

  it("모든 경로 패치에 실제 안료가 생겨야 준비되고 선택 후 사라지면 실패한다", () => {
    const fixture = pixelFixture();
    const points = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const before = observeStudioEraserLatencyFixture({ points });
    if (!before) throw new Error("기준 화면이 없습니다.");
    fixture.paint(8);
    expect(observeStudioEraserLatencyFixture({ points, baseline: before.pixels }))
      .toMatchObject({ changedPixels: [8, 8] });
    fixture.paint(0);
    expect(observeStudioEraserLatencyFixture({ points, baseline: before.pixels })).toBe(false);
  });

  it("미미한 픽셀 잡음과 다른 개수의 기준 패치를 안료 증거로 채택하지 않는다", () => {
    const fixture = pixelFixture();
    const points = [{ x: 100, y: 100 }];
    const before = observeStudioEraserLatencyFixture({ points });
    if (!before) throw new Error("기준 화면이 없습니다.");
    fixture.paint(3);
    expect(observeStudioEraserLatencyFixture({ points, baseline: before.pixels })).toBe(false);
    expect(() => observeStudioEraserLatencyFixture({ points, baseline: [] })).toThrow("개수");
  });
});
