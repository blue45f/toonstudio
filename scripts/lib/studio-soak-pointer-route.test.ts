import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioPointerStrokePoints } from "./studio-pointer-input-driver.mjs";
import { measureStudioSmartShapeCanvasSpace, type StudioSmartShapeCanvasSpace, type StudioSmartShapeRect } from "./studio-smart-shape-visible-grid";
import { assertStudioSoakPointerRoute, prepareStudioSoakPointerRoute, selectStudioSoakCanvasRect } from "./studio-soak-pointer-route";

import type { Page } from "playwright";

const canvas = { left: 0, top: 0, right: 454, bottom: 498 };
const hud = { left: 0, top: 411, right: 454, bottom: 475, label: "하단 HUD" };
const intersects = (a: StudioSmartShapeRect, b: StudioSmartShapeRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const rect = (box: { x: number; y: number; width: number; height: number }) => ({
  left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height,
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("소크 입력은 실측 가림을 뺀 최대 영역을 사용한다", () => {
  it("가림이 없으면 비율 여백 없이 전체 실제 캔버스를 사용한다", () => {
    expect(selectStudioSoakCanvasRect({ canvas, obstructions: [] })).toEqual({ x: 0, y: 0, width: 454, height: 498 });
  });

  it("원래 드라이버의 정확한 120×120 최소 영역을 유지한다", () => {
    expect(selectStudioSoakCanvasRect({ canvas: { left: 0.25, top: 1.5, right: 120.25, bottom: 121.5 }, obstructions: [] }))
      .toEqual({ x: 0.25, y: 1.5, width: 120, height: 120 });
  });

  it.each([6, 13])("실패한 HUD 위치를 cycle %i의 모든 포인터 점에서 피한다", (cycle) => {
    const original = createStudioPointerStrokePoints({ x: 0, y: 0, width: 454, height: 498 }, cycle);
    expect(original.some((p) => p.y >= hud.top && p.y < hud.bottom)).toBe(true);
    const box = selectStudioSoakCanvasRect({ canvas, obstructions: [hud] });
    expect(box).toEqual({ x: 0, y: 0, width: 454, height: 411 });
    const points = createStudioPointerStrokePoints(box, cycle);
    expect(points).toHaveLength(29);
    expect(points.every((p) => p.y < hud.top)).toBe(true);
    expect(points.map(({ x: _x, y: _y, ...input }) => input)).toEqual(original.map(({ x: _x, y: _y, ...input }) => input));
  });

  it("겹치는 controls와 캔버스 밖 가림도 순서와 무관하게 제외한다", () => {
    const obstructions = [hud, { left: 300, top: 0, right: 500, bottom: 180, label: "상단 도구" },
      { left: -100, top: 80, right: 90, bottom: 250, label: "왼쪽 안내" }, { left: 800, top: 0, right: 900, bottom: 100, label: "바깥" }];
    const box = selectStudioSoakCanvasRect({ canvas, obstructions });
    expect(box).toEqual(selectStudioSoakCanvasRect({ canvas, obstructions: [...obstructions].reverse() }));
    for (const obstacle of obstructions) expect(intersects(rect(box), obstacle)).toBe(false);
    expect(box.width).toBeGreaterThanOrEqual(120); expect(box.height).toBeGreaterThanOrEqual(120);
  });

  it("작은 정수 격자의 완전 탐색과 같은 최대 면적을 선택한다", () => {
    const canvas = { left: 0, top: 0, right: 300, bottom: 300 };
    for (let seed = 0; seed < 12; seed += 1) {
      const obstructions = [0, 1].map((index) => {
        const left = ((seed * 3 + index * 2) % 5) * 60, top = ((seed * 2 + index * 3) % 5) * 60;
        return { left, top, right: left + 60, bottom: top + 60, label: `control-${index}` };
      });
      let largest = 0;
      for (let left = 0; left <= 180; left += 60) for (let right = left + 120; right <= 300; right += 60) {
        for (let top = 0; top <= 180; top += 60) for (let bottom = top + 120; bottom <= 300; bottom += 60) {
          if (obstructions.every((o) => !intersects({ left, right, top, bottom }, o))) largest = Math.max(largest, (right - left) * (bottom - top));
        }
      }
      const box = selectStudioSoakCanvasRect({ canvas, obstructions });
      expect(box.width * box.height).toBe(largest);
    }
  });

  it.each([
    { canvas: { ...canvas, right: Number.NaN }, obstructions: [] },
    { canvas, obstructions: [{ ...hud, bottom: Number.POSITIVE_INFINITY }] },
  ])("유효하지 않은 실측을 정상 영역으로 취급하지 않는다", (space) => {
    expect(() => selectStudioSoakCanvasRect(space)).toThrow("유효한 실제");
  });

  it.each([
    { canvas: { ...canvas, right: 119 }, obstructions: [] },
    { canvas, obstructions: [{ ...canvas, label: "전면 가림" }] },
  ])("120×120 공간이 없으면 축소나 입력 생략으로 통과하지 않는다", (space) => {
    expect(() => selectStudioSoakCanvasRect(space)).toThrow("120×120");
  });

  it("측정 helper 결과를 기존 드라이버의 실제 29점에 연결한다", async () => {
    const space: StudioSmartShapeCanvasSpace = { canvas, obstructions: [hud] };
    const evaluate = vi.fn(async () => space);
    const stage = { first() { return this; }, evaluate };
    const page = { locator: (selector: string) => { expect(selector).toBe(".konvajs-content"); return stage; } } as unknown as Page;
    const route = await prepareStudioSoakPointerRoute(page, 6);
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(measureStudioSmartShapeCanvasSpace);
    expect(route.points).toEqual(createStudioPointerStrokePoints(route.box, 6, { steps: 28 }));
  });
});

function hitFixture(blockedIndex = -1, foreignCanvas = false) {
  const dom = new JSDOM('<div class="konvajs-content"><canvas></canvas></div><button>HUD</button><canvas id="foreign"></canvas>');
  const document = dom.window.document, stage = document.querySelector(".konvajs-content")!;
  const canvas = stage.querySelector("canvas")!, blocker = document.querySelector("button")!;
  vi.stubGlobal("document", document); vi.stubGlobal("HTMLCanvasElement", dom.window.HTMLCanvasElement);
  const points = createStudioPointerStrokePoints({ x: 0, y: 0, width: 454, height: 411 }, 6);
  document.elementFromPoint = vi.fn((x, y) => {
    const index = points.findIndex((p) => p.x === x && p.y === y);
    return index === blockedIndex ? blocker : foreignCanvas ? document.querySelector("#foreign") : canvas;
  });
  const locator = { first() { return this; }, evaluate: async (fn: (stage: Element, route: typeof points) => unknown, route: typeof points) => fn(stage, route) };
  const page = { locator: () => locator } as unknown as Page;
  return { page, points, document };
}

describe("소크 dispatch 직전 전체 경로의 실제 canvas 수신자를 확인한다", () => {
  it("첫 점과 끝점뿐 아니라 전체 29점을 확인한다", async () => {
    const f = hitFixture(); await expect(assertStudioSoakPointerRoute(f.page, f.points)).resolves.toBeUndefined();
    expect(f.document.elementFromPoint).toHaveBeenCalledTimes(29);
  });

  it("중간 점 하나가 HUD에 가려져도 입력 전에 명시적으로 실패한다", async () => {
    const f = hitFixture(14);
    await expect(assertStudioSoakPointerRoute(f.page, f.points)).rejects.toThrow('"index":14');
    expect(f.document.elementFromPoint).toHaveBeenCalledTimes(29);
  });

  it("다른 stage의 canvas를 대상 캔버스로 오인하지 않는다", async () => {
    const f = hitFixture(-1, true);
    await expect(assertStudioSoakPointerRoute(f.page, f.points)).rejects.toThrow("실제 캔버스");
  });

  it("비어 있거나 일부 점이 빠진 경로를 검증 성공으로 취급하지 않는다", async () => {
    const f = hitFixture();
    await expect(assertStudioSoakPointerRoute(f.page, f.points.slice(1))).rejects.toThrow("전체 29점");
    expect(f.document.elementFromPoint).not.toHaveBeenCalled();
  });
});
