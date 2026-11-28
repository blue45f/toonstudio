import { describe, expect, it, vi } from "vitest";

import { paintOffice2dRouteGuide } from "./office2d-route-guide";

const visible = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

function canvas() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), ellipse: vi.fn(), setLineDash: vi.fn(),
    lineCap: "butt" as CanvasLineCap, lineJoin: "round" as CanvasLineJoin,
    lineWidth: 0, fillStyle: "", strokeStyle: "",
  };
}

describe("2D 월드 바닥 길 안내", () => {
  it("화면을 가로지르는 경로와 모퉁이를 잇고 완전히 밖에 나간 구간은 건너뛴다", () => {
    const ctx = canvas();
    const route = [{ x: 150, y: 20 }, { x: 130, y: 90 }, { x: 35, y: 80 }, { x: 35, y: 130 }];
    paintOffice2dRouteGuide(ctx, { x: -60, y: 20 }, route, { x: 35, y: 130 }, visible, 1, 0, false);
    expect(ctx.moveTo.mock.calls).toEqual([[-60, 20], [130, 90]]);
    expect(ctx.lineTo.mock.calls).toEqual([[150, 20], [35, 80], [35, 130]]);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.ellipse).not.toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it("동작 줄이기에서는 시간이 지나도 목적지의 모양과 크기를 유지한다", () => {
    const destination = { x: 32, y: 40 };
    const draw = (time: number, reducedMotion: boolean) => {
      const ctx = canvas();
      paintOffice2dRouteGuide(ctx, { x: 12, y: 16 }, [destination], destination, visible, 2, time, reducedMotion);
      return ctx;
    };
    const stationary = draw(0, true);
    expect(stationary.ellipse.mock.calls).toEqual(draw(0.35, true).ellipse.mock.calls);
    expect(draw(0, false).ellipse.mock.calls).not.toEqual(draw(0.35, false).ellipse.mock.calls);
    expect(stationary.fill).toHaveBeenCalledOnce();
    expect(stationary.setLineDash).toHaveBeenCalledWith([2, 4.5]);
  });
});
