// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStudioPsdPanelClip, cropToPanel } from "./studio-psd-panel-clip";

afterEach(() => vi.restoreAllMocks());

describe("PSD 개별 레이어의 실제 컷 경계", () => {
  function context() {
    const value = { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), rect: vi.fn(), closePath: vi.fn(), fill: vi.fn(), drawImage: vi.fn(),
      globalAlpha: 0.5, globalCompositeOperation: "source-over", fillStyle: "#fff" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(value as unknown as CanvasRenderingContext2D);
    return value;
  }
  it("캡처 원점과 출력 배율로 원고의 다각형 경계를 되살린다", () => {
    const ctx = context(), canvas = document.createElement("canvas");
    applyStudioPsdPanelClip(canvas, 5, 10, 2, { x: 10, y: 20, width: 100, height: 80,
      points: [0, 0, 100, 30, 60, 80] });
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, -10, -20);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
    expect(ctx.lineTo.mock.calls).toEqual([[110, 50], [70, 100]]);
    expect(ctx.globalCompositeOperation).toBe("destination-in");
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.fill).toHaveBeenCalledOnce(); expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it("컷과 겹치지 않는 캡처에서 원본 픽셀을 되돌려 내보내지 않는다", () => {
    const ctx = context(), canvas = document.createElement("canvas"); canvas.width = 20; canvas.height = 20;
    const result = cropToPanel(canvas, 0, 0, 1, { x: 100, y: 100, width: 20, height: 20 });
    expect(result.canvas).not.toBe(canvas);
    expect(result.canvas.width).toBe(1); expect(result.canvas.height).toBe(1);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
  it("선택 컷 좌표가 소수이면 경계 픽셀을 버리지 않고 마스크와 함께 보존한다", () => {
    const ctx = context(), canvas = document.createElement("canvas"); canvas.width = 20; canvas.height = 20;
    const result = cropToPanel(canvas, 0, 0, 1, { x: 2.25, y: 3.75, width: 5, height: 6 });
    expect(result).toMatchObject({ dx: 2, dy: 3 });
    expect(result.canvas.width).toBe(6); expect(result.canvas.height).toBe(7);
    expect(ctx.drawImage).toHaveBeenCalledWith(canvas, 2, 3, 6, 7, 0, 0, 6, 7);
  });
});
