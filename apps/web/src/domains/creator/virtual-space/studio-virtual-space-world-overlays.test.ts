import { describe, expect, it } from "vitest";

import { STUDIO_ROUTE_FADE_MS, STUDIO_ROUTE_RIPPLE_MS } from "./studio-virtual-space-move-path-display";
import {
  createStudioRouteOverlayMemory,
  drawStudioRouteOverlay,
  type StudioRouteOverlayFrame,
} from "./studio-virtual-space-world-overlays";

type Call = readonly [name: string, ...args: number[]];

/** 그리기 호출을 순서대로 기록하는 가짜 Graphics. */
function recorder() {
  const calls: Call[] = [];
  const graphics = {
    clear: () => { calls.push(["clear"]); return graphics; },
    lineStyle: (width: number, color: number, alpha: number) => { calls.push(["lineStyle", width, color, alpha]); return graphics; },
    fillStyle: (color: number, alpha: number) => { calls.push(["fillStyle", color, alpha]); return graphics; },
    fillEllipse: (x: number, y: number, w: number, h: number) => { calls.push(["fillEllipse", x, y, w, h]); return graphics; },
    strokeEllipse: (x: number, y: number, w: number, h: number) => { calls.push(["strokeEllipse", x, y, w, h]); return graphics; },
  };
  const count = (name: string) => calls.filter((call) => call[0] === name).length;
  return { graphics, calls, count };
}

const identity = (point: { x: number; y: number }) => point;

function frame(overrides: Partial<StudioRouteOverlayFrame> = {}): StudioRouteOverlayFrame {
  return {
    current: { x: 0, y: 0 },
    path: [{ x: 200, y: 0 }],
    moving: true,
    now: 10_000,
    wallNow: 10_000,
    markerStartedAt: 0,
    reducedMotion: false,
    portals: [],
    projectPoint: identity,
    memory: createStudioRouteOverlayMemory(),
    ...overrides,
  };
}

describe("drawStudioRouteOverlay 길 안내", () => {
  it("이동 중에는 안내 점과 목적지 마커를 그리고 목적지를 기억한다", () => {
    const { graphics, count } = recorder();
    const input = frame();
    drawStudioRouteOverlay(graphics, input);
    // 점 하나는 후광+심 두 번, 마커 중심점은 한 번 채운다.
    expect(count("fillEllipse")).toBeGreaterThan(8);
    // 마커는 후광 링 + 밝은 링. 클릭한 지 오래돼 파문은 없다.
    expect(count("strokeEllipse")).toBe(2);
    expect(input.memory).toMatchObject({ destination: { x: 200, y: 0 }, visible: true, fadeStartedAt: null });
  });

  it("클릭 직후에는 파문이 한 번 더 퍼지고 시간이 지나면 사라진다", () => {
    const fresh = recorder();
    drawStudioRouteOverlay(fresh.graphics, frame({ markerStartedAt: 10_000 - STUDIO_ROUTE_RIPPLE_MS / 2 }));
    expect(fresh.count("strokeEllipse")).toBe(3);
    const stale = recorder();
    drawStudioRouteOverlay(stale.graphics, frame({ markerStartedAt: 10_000 - STUDIO_ROUTE_RIPPLE_MS - 1 }));
    expect(stale.count("strokeEllipse")).toBe(2);
  });

  it("안내 점은 시간이 지나면 목적지 쪽으로 흐르고, 모션 줄이기에서는 멈춰 있다", () => {
    const dotsAt = (wallNow: number, reducedMotion: boolean) => {
      const { graphics, calls } = recorder();
      drawStudioRouteOverlay(graphics, frame({ wallNow, now: wallNow, reducedMotion }));
      return calls.filter((call) => call[0] === "fillEllipse" && call[3] === 5.6).map((call) => call[1]!);
    };
    const early = dotsAt(10_000, false);
    const later = dotsAt(10_200, false);
    expect(later.length).toBeGreaterThan(0);
    expect(later[0]).not.toBeCloseTo(early[0]!, 3);
    expect(dotsAt(10_000, true)).toEqual(dotsAt(10_700, true));
  });

  it("경로·마커·포털 링은 모두 투영 좌표로 그린다(고저차가 있는 바닥에서 어긋나지 않는다)", () => {
    const lift = (point: { x: number; y: number }) => ({ x: point.x, y: point.y - 12 });
    const { graphics, calls } = recorder();
    drawStudioRouteOverlay(graphics, frame({ projectPoint: lift, path: [{ x: 120, y: 40 }] }));
    const marker = calls.find((call) => call[0] === "strokeEllipse")!;
    expect(marker[1]).toBe(120);
    expect(marker[2]).toBe(28);
    const dotYs = calls.filter((call) => call[0] === "fillEllipse" && call[3] === 5.6).map((call) => call[2]!);
    // 경로는 (0,0)→(120,40)을 12px 들어 올린 (0,-12)→(120,28) 위에만 있다.
    expect(dotYs.length).toBeGreaterThan(0);
    expect(dotYs.every((y) => y >= -12 && y <= 28)).toBe(true);
  });

  it("도착하면 마커가 커지며 옅어지다가 사라지고 기억을 비운다", () => {
    const memory = createStudioRouteOverlayMemory();
    // 이동 중
    drawStudioRouteOverlay(recorder().graphics, frame({ memory }));
    expect(memory.visible).toBe(true);
    // 도착: 경로가 비고 멈췄다 → 페이드 시작
    const arrive = recorder();
    drawStudioRouteOverlay(arrive.graphics, frame({ memory, path: [], moving: false, wallNow: 11_000, now: 11_000 }));
    expect(memory).toMatchObject({ visible: false, fadeStartedAt: 11_000, destination: { x: 200, y: 0 } });
    expect(arrive.count("strokeEllipse")).toBe(2);
    expect(arrive.count("fillEllipse")).toBe(1);
    // 페이드 중간: 더 커지고 더 옅다
    const mid = recorder();
    drawStudioRouteOverlay(mid.graphics, frame({ memory, path: [], moving: false, wallNow: 11_000 + STUDIO_ROUTE_FADE_MS / 2, now: 11_000 }));
    const widthOf = (calls: readonly Call[]) => calls.find((call) => call[0] === "strokeEllipse")![3]!;
    expect(widthOf(mid.calls)).toBeGreaterThan(widthOf(arrive.calls));
    const alphaOf = (calls: readonly Call[]) => calls.filter((call) => call[0] === "lineStyle").at(-1)![3]!;
    expect(alphaOf(mid.calls)).toBeLessThan(alphaOf(arrive.calls));
    // 페이드 끝: 아무것도 그리지 않고 기억을 비운다
    const done = recorder();
    drawStudioRouteOverlay(done.graphics, frame({ memory, path: [], moving: false, wallNow: 11_000 + STUDIO_ROUTE_FADE_MS + 5, now: 11_000 }));
    expect(done.count("strokeEllipse")).toBe(0);
    expect(memory).toMatchObject({ destination: null, fadeStartedAt: null, visible: false });
  });

  it("모션 줄이기에서는 도착 즉시 마커를 지운다", () => {
    const memory = createStudioRouteOverlayMemory();
    drawStudioRouteOverlay(recorder().graphics, frame({ memory, reducedMotion: true }));
    const arrive = recorder();
    drawStudioRouteOverlay(arrive.graphics, frame({ memory, reducedMotion: true, path: [], moving: false }));
    expect(arrive.count("strokeEllipse")).toBe(0);
    expect(memory.destination).toBeNull();
  });

  it("페이드 도중 새 목적지를 고르면 페이드를 접고 새 길 안내를 그린다", () => {
    const memory = createStudioRouteOverlayMemory();
    drawStudioRouteOverlay(recorder().graphics, frame({ memory }));
    drawStudioRouteOverlay(recorder().graphics, frame({ memory, path: [], moving: false, wallNow: 11_000, now: 11_000 }));
    expect(memory.fadeStartedAt).toBe(11_000);
    const next = recorder();
    drawStudioRouteOverlay(next.graphics, frame({ memory, path: [{ x: 50, y: 50 }], wallNow: 11_100, now: 11_100, markerStartedAt: 11_100 }));
    expect(memory).toMatchObject({ visible: true, fadeStartedAt: null, destination: { x: 50, y: 50 } });
    expect(next.count("strokeEllipse")).toBe(3);
  });

  it("목적지가 없고 기억도 없으면 아무것도 그리지 않는다", () => {
    const { graphics, calls } = recorder();
    drawStudioRouteOverlay(graphics, frame({ path: [], moving: false }));
    expect(calls).toEqual([["clear"]]);
  });

  it("가장 가까운 포털이 가까우면 바닥 펄스 링을 그린다", () => {
    const { graphics, count } = recorder();
    drawStudioRouteOverlay(graphics, frame({
      path: [], moving: false,
      portals: [{ id: "p", point: { x: 30, y: 0 }, radius: 20 } as StudioRouteOverlayFrame["portals"][number]],
    }));
    expect(count("strokeEllipse")).toBe(1);
  });
});
