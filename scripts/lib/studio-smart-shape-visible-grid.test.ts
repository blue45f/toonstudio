import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  measureStudioSmartShapeCanvasSpace, placeStudioSmartShapeGrid,
  type StudioSmartShapeCanvasSpace, type StudioSmartShapeRect,
} from "./studio-smart-shape-visible-grid";

const canvas = { left: 350, top: 331, right: 1083, bottom: 995 };
const grid = [
  { kind: "line", box: { left: 495, top: 442, right: 988, bottom: 448 },
    path: [{ x: 495, y: 444 }, { x: 988, y: 446 }], enforceExtent: false },
  { kind: "polygon", box: { left: 878, top: 602, right: 988, bottom: 802 },
    path: [{ x: 933, y: 602 }, { x: 985.3, y: 671.1 }, { x: 965.3, y: 782 },
      { x: 900.6, y: 782 }, { x: 880.7, y: 671.1 }, { x: 933, y: 602 }],
    enforceExtent: true, expectedPolygonSides: 5 },
];
const badge = { left: 938, top: 779, right: 1083, bottom: 841, label: "offline-readiness" };
const overlaps = (a: StudioSmartShapeRect, b: StudioSmartShapeRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe("Smart Shape 증거 영역은 같은 크기의 그리드 전체로 옮긴다", () => {
  it("이미 노출된 그리드는 좌표와 메타데이터를 그대로 유지한다", () => {
    const result = placeStudioSmartShapeGrid(grid, { canvas, obstructions: [] });
    expect(result.translation).toEqual({ x: 0, y: 0 });
    expect(result.fixtures).toEqual(grid);
  });

  it("실패한 접힌 배지와 다른 controls를 모두 피하며 가장 가까운 평행이동만 선택한다", () => {
    const original = structuredClone(grid);
    const controls = [badge, { left: 350, top: 331, right: 1083, bottom: 400, label: "상단 도구" }];
    const result = placeStudioSmartShapeGrid(grid, { canvas, obstructions: controls });
    expect(result.translation).toEqual({ x: -79, y: 0 });
    expect(result.roi).toEqual({ left: 395, top: 421, right: 930, bottom: 823 });
    for (const control of controls) expect(overlaps(result.roi, control)).toBe(false);
    for (const [index, placed] of result.fixtures.entries()) {
      const source = grid[index]!;
      expect(placed.box.right - placed.box.left).toBe(source.box.right - source.box.left);
      expect(placed.box.bottom - placed.box.top).toBe(source.box.bottom - source.box.top);
      expect(placed.path).toEqual(source.path.map(({ x, y }) => ({ x: x - 79, y })));
      expect(placed.kind).toBe(source.kind);
      expect(placed.enforceExtent).toBe(source.enforceExtent);
      expect(placed.expectedPolygonSides).toBe(source.expectedPolygonSides);
    }
    expect(grid).toEqual(original);
  });

  it("배지가 없어도 다른 실제 control을 피하고 좌우가 막히면 위로만 옮긴다", () => {
    const obstruction = { left: 350, top: 800, right: 1083, bottom: 840, label: "하단 도구" };
    const result = placeStudioSmartShapeGrid(grid, { canvas, obstructions: [obstruction] });
    expect(result.translation).toEqual({ x: 0, y: -31 });
    expect(result.roi.bottom).toBe(792);
  });

  it("소수점 좌표의 기존 20px screenshot clip과 반올림도 예약 영역에 포함한다", () => {
    const fixtures = grid.map((fixture) => ({ ...fixture,
      box: { left: fixture.box.left + 0.7, top: fixture.box.top + 0.3,
        right: fixture.box.right + 0.7, bottom: fixture.box.bottom + 0.3 } }));
    const result = placeStudioSmartShapeGrid(fixtures, { canvas, obstructions: [badge] });
    for (const { box } of result.fixtures) {
      const x = Math.floor(box.left - 20), y = Math.floor(box.top - 20);
      expect(x).toBeGreaterThanOrEqual(result.roi.left);
      expect(y).toBeGreaterThanOrEqual(result.roi.top);
      expect(x + Math.ceil(box.right - box.left + 40)).toBeLessThanOrEqual(result.roi.right);
      expect(y + Math.ceil(box.bottom - box.top + 40)).toBeLessThanOrEqual(result.roi.bottom);
    }
  });

  it.each([
    { canvas, obstructions: [{ ...canvas, label: "전면 가림" }] },
    { canvas: { ...canvas, right: 700 }, obstructions: [] },
    { canvas, obstructions: [
      { left: 350, top: 331, right: 700, bottom: 995, label: "왼쪽" },
      { left: 710, top: 331, right: 1083, bottom: 995, label: "오른쪽" },
    ] },
  ])("전체 ROI 공간이 없으면 축소·일부 fixture 생략 없이 실패한다 (%#)", (space) => {
    expect(() => placeStudioSmartShapeGrid(grid, space)).toThrow("동일 크기");
  });

  it("가림 rect와 경로의 잘못된 실측은 정상 배치로 간주하지 않는다", () => {
    expect(() => placeStudioSmartShapeGrid(grid, { canvas, obstructions: [{ ...badge, right: NaN }] })).toThrow("유효한 실측");
    expect(() => placeStudioSmartShapeGrid([{ ...grid[0]!, path: [{ x: Infinity, y: 1 }] }],
      { canvas, obstructions: [] })).toThrow("유효한 실측");
    expect(() => placeStudioSmartShapeGrid([], { canvas, obstructions: [] })).toThrow("유효한 실측");
  });
});

function domFixture() {
  const dom = new JSDOM(`<main style="overflow-x:hidden;overflow-y:auto"><div class="konvajs-content"><canvas></canvas></div></main>
    <div id="background"><aside data-studio-shell-floating-target="offline-readiness"><details><summary>로컬 작업 중</summary></details></aside></div>
    <button aria-label="다른 도구">도구</button><div id="transparent" style="pointer-events:none"></div>
    <div id="hidden" style="visibility:hidden"></div>`);
  const { document } = dom.window;
  vi.stubGlobal("document", document);
  vi.stubGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 1100);
  const setRect = (selector: string, rect: StudioSmartShapeRect) => {
    const element = document.querySelector(selector)!;
    element.getBoundingClientRect = () => new dom.window.DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    return element;
  };
  const stage = setRect(".konvajs-content", { left: 320, top: 310, right: 1120, bottom: 1020 });
  const parent = setRect("main", { left: 340, top: 320, right: 1100, bottom: 1010 });
  Object.defineProperties(parent, {
    offsetWidth: { value: 760 }, offsetHeight: { value: 690 },
    clientLeft: { value: 10 }, clientTop: { value: 11 },
    clientWidth: { value: 733 }, clientHeight: { value: 664 },
  });
  const background = setRect("#background", { left: 0, top: 0, right: 1440, bottom: 1100 });
  const aside = setRect("aside", badge);
  const details = setRect("details", badge);
  const summary = setRect("summary", badge);
  const button = setRect("button", { left: 600, top: 350, right: 720, bottom: 400 });
  setRect("#transparent", canvas);
  setRect("#hidden", canvas);
  document.elementFromPoint = vi.fn((x, y) => {
    for (const element of [summary, button]) {
      const bounds = element.getBoundingClientRect();
      if (x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom) return element;
    }
    return stage.querySelector("canvas");
  });
  return { dom, stage, background, aside, details, summary, button };
}

afterEach(() => vi.unstubAllGlobals());

describe("Smart Shape 준비는 DOM을 바꾸지 않고 실제 가림을 관측한다", () => {
  it("viewport·스크롤 잘림을 적용하고 접힌 배지와 외부 control만 예약한다", () => {
    const { dom, stage, details } = domFixture();
    const before = dom.window.document.body.innerHTML;
    const space = measureStudioSmartShapeCanvasSpace(stage);
    expect(space.canvas).toEqual(canvas);
    expect(space.obstructions).toEqual([
      badge, { left: 600, top: 350, right: 720, bottom: 400, label: "다른 도구" },
    ]);
    expect(details.hasAttribute("open")).toBe(false);
    expect(dom.window.document.body.innerHTML).toBe(before);
    dom.window.close();
  });

  it("상위 배경의 큰 rect를 전면 control로 오인하지 않고 viewport를 넘는 영역을 제외한다", () => {
    const { dom, stage } = domFixture();
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 900);
    const space = measureStudioSmartShapeCanvasSpace(stage);
    expect(space.canvas).toEqual({ ...canvas, right: 1000, bottom: 900 });
    expect(space.obstructions[0]).toEqual({ ...badge, right: 1000 });
    expect(space.obstructions.every((rect) => rect.right - rect.left < 200)).toBe(true);
    dom.window.close();
  });

  it("투명해도 실제 입력을 받는 외부 요소는 가림으로 보존한다", () => {
    const { dom, stage } = domFixture();
    const blocker = dom.window.document.createElement("div");
    blocker.style.opacity = "0";
    blocker.getBoundingClientRect = () => new dom.window.DOMRect(400, 500, 50, 50);
    dom.window.document.body.appendChild(blocker);
    dom.window.document.elementFromPoint = vi.fn(() => blocker);
    const space: StudioSmartShapeCanvasSpace = measureStudioSmartShapeCanvasSpace(stage);
    expect(space.obstructions).toEqual([{ left: 400, top: 500, right: 450, bottom: 550, label: "div" }]);
    dom.window.close();
  });
});
