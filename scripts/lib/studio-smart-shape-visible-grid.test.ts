import { readFileSync } from "node:fs";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  measureStudioSmartShapeCanvasSpace, placeStudioSmartShapeGrid,
  requiresStudioSmartShapeOfflinePanel, studioSmartShapeFloatingReady, waitForStudioSmartShapeFloatingReady,
  type StudioSmartShapeCanvasSpace, type StudioSmartShapeFloatingReadiness, type StudioSmartShapeRect,
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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

  it("최초·실패 진단에 실제 target의 rect·managed·hidden·summary를 그대로 기록한다", () => {
    const { dom, stage, aside, details } = domFixture();
    dom.window.document.documentElement.dataset.studioConnectivity = "server-unavailable";
    dom.window.document.documentElement.dataset.studioNetworkFeatures = "local-only";
    aside.setAttribute("data-studio-shell-layout-managed", "true");
    aside.setAttribute("data-studio-shell-layout-hidden", "false");
    details.setAttribute("data-studio-offline-panel", "true");
    details.setAttribute("data-studio-local-only", "true");
    const before = dom.window.document.body.innerHTML;
    expect(measureStudioSmartShapeCanvasSpace(stage).floating).toEqual({
      connectivity: "server-unavailable", networkFeatures: "local-only", canvas,
      targets: [{ id: "offline-readiness", managed: "true", hidden: "false", localOnly: "true",
        summary: "로컬 작업 중", visible: true, rect: { left: 938, top: 779, right: 1083, bottom: 841 } }],
    });
    expect(dom.window.document.body.innerHTML).toBe(before);
    dom.window.close();
  });
});

const ready: StudioSmartShapeFloatingReadiness = {
  connectivity: "server-unavailable", networkFeatures: "local-only", canvas,
  targets: [{ id: "offline-readiness", managed: "true", hidden: "false", localOnly: "true",
    summary: "서버 장애 · 로컬 작업 중", visible: true,
    rect: { left: 938, top: 779, right: 1083, bottom: 841 } }],
};
const origin = "http://127.0.0.1:58449/studio/canvas";
const missingApi = ["smart-shapes: 502 http://127.0.0.1:58449/api/health/capabilities"];

describe("Smart Shape 준비는 관측한 정적 API 부재만 정상 안내와 연결한다", () => {
  it("자신이 띄운 preview에서 관측한 정확한 capabilities 502만 안내를 필수로 한다", () => {
    expect(requiresStudioSmartShapeOfflinePanel(true, missingApi, origin)).toBe(true);
  });
  it.each([
    [false, missingApi, origin],
    [true, [], origin],
    [true, ["smart-shapes: 200 http://127.0.0.1:58449/api/health/capabilities"], origin],
    [true, ["smart-shapes: 503 http://127.0.0.1:58449/api/health/capabilities"], origin],
    [true, ["smart-shapes: 502 http://127.0.0.1:58449/api/health/capabilities?probe=1"], origin],
    [true, ["smart-shapes: 502 http://127.0.0.1:58450/api/health/capabilities"], origin],
    [true, ["smart-shapes: 502 http://localhost:58449/api/health/capabilities"], origin],
    [true, ["smart-shapes: 502 http://127.0.0.1:58449/api/studio-realtime/tickets"], origin],
    [true, ["smart-shapes: 502 https://toonstudio.app/api/health/capabilities"], "https://toonstudio.app/studio/canvas"],
  ] as const)("외부/보지 못한 응답·다른 origin/path/status는 정적 API 부재 근거가 아니다 (%#)", (owns, errors, url) => {
    expect(requiresStudioSmartShapeOfflinePanel(owns, errors, url)).toBe(false);
  });

  it("실API가 부분 degraded여도 온라인 DOM을 정적 서버 장애로 바꾸지 않는다", () => {
    const live = { ...ready, connectivity: "online", networkFeatures: "enabled", targets: [] };
    expect(studioSmartShapeFloatingReady(live, requiresStudioSmartShapeOfflinePanel(false, missingApi, origin))).toBe(true);
    expect(studioSmartShapeFloatingReady(live, true)).toBe(false);
  });
  it.each([
    { ...ready, targets: [] },
    { ...ready, connectivity: "reconnecting" },
    { ...ready, networkFeatures: "enabled" },
    { ...ready, targets: [{ ...ready.targets[0]!, managed: null }] },
    { ...ready, targets: [{ ...ready.targets[0]!, hidden: "true" }] },
    { ...ready, targets: [{ ...ready.targets[0]!, visible: false }] },
    { ...ready, targets: [{ ...ready.targets[0]!, localOnly: "false" }] },
    { ...ready, targets: [{ ...ready.targets[0]!, rect: { left: 1280, top: 779, right: 1429, bottom: 841 } }] },
    { ...ready, targets: [{ ...ready.targets[0]!, rect: { left: 938, top: 779, right: NaN, bottom: 841 } }] },
  ])("미마운트·미관리·숨김·연결 확인 중·저장권위 미확정의 기존 화면 가장자리 rect는 준비 완료가 아니다 (%#)", (state) => {
    expect(studioSmartShapeFloatingReady(state, true)).toBe(false);
  });
});

function preparationStage(states: readonly StudioSmartShapeFloatingReadiness[]) {
  let now = 0, index = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const dispose = vi.fn();
  const waitForFunction = vi.fn(async (_predicate: unknown, _argument: unknown, options: { timeout: number }) => { now += Math.min(16, options.timeout); return { dispose }; });
  const evaluate = vi.fn(async () => ({ canvas, obstructions: [], floating: states[Math.min(index++, states.length - 1)]! }));
  return { stage: { evaluate, page: () => ({ waitForFunction }) } as never, evaluate, waitForFunction, dispose };
}

describe("Smart Shape 초기 배치는 기존 deadline 안의 실제 연속 프레임만 채택한다", () => {
  it("응답 listener는 prepare 전에 설치하고 준비 완료 뒤 최종 stageBox와 그리드를 한 번만 결정한다", () => {
    const source = readFileSync(new URL("../verify-studio-brushes.mts", import.meta.url), "utf8");
    const start = source.indexOf("async function runSmartShapeMatrix(");
    const end = source.indexOf("async function runMobileTouchAudit(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const shape = source.slice(start, end);
    for (const token of ["collectBrowserErrors(page", "const preparationDeadline = Date.now() + 60_000", "await prepareStudioPage(",
      "await waitForStudioSmartShapeFloatingReady(", "const stageBox = await stage.boundingBox()", "const fixtureDefinitions:"]) expect(shape).toContain(token);
    expect(shape.indexOf("collectBrowserErrors(page")).toBeLessThan(shape.indexOf("await prepareStudioPage("));
    expect(shape.indexOf("const preparationDeadline = Date.now() + 60_000")).toBeLessThan(shape.indexOf("await prepareStudioPage("));
    expect(shape.indexOf("await waitForStudioSmartShapeFloatingReady(")).toBeLessThan(shape.indexOf("const stageBox = await stage.boundingBox()"));
    expect(shape.indexOf("const stageBox = await stage.boundingBox()")).toBeLessThan(shape.indexOf("const fixtureDefinitions:"));
    expect(shape.match(/placeStudioSmartShapeGrid\(/gu)).toHaveLength(1);
    expect(shape.indexOf("placeStudioSmartShapeGrid(")).toBeLessThan(shape.indexOf("for (const fixture of fixtures)"));
  });
  it("늦은 마운트와 뒤따른 위치 이동 뒤 세 번 같은 관측이 된 rect를 반환한다", async () => {
    const edge = { ...ready, targets: [{ ...ready.targets[0]!, rect: { left: 1280, top: 779, right: 1429, bottom: 841 } }] };
    const { stage, evaluate, dispose } = preparationStage([{ ...ready, targets: [] }, edge, ready, ready, ready]);
    const result = await waitForStudioSmartShapeFloatingReady(stage, 60_000, () => true);
    expect(result.floating).toEqual(ready);
    expect(evaluate).toHaveBeenCalledTimes(5);
    expect(dispose).toHaveBeenCalledTimes(4);
  });
  it("끝내 안정되지 않는 배치는 기존 남은 기한을 소모한 뒤 실패하며 새 60초를 더하지 않는다", async () => {
    const { stage, evaluate, waitForFunction } = preparationStage([{ ...ready, targets: [] }]);
    await expect(waitForStudioSmartShapeFloatingReady(stage, 40, () => true)).rejects.toThrow("초기 준비 기한");
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(waitForFunction.mock.calls.map((call) => call[2])).toEqual([{ timeout: 40 }, { timeout: 24 }, { timeout: 8 }]);
  });
  it("이미 만료된 준비 기한에는 추가 DOM 측정이나 새 프레임 대기를 시작하지 않는다", async () => {
    const { stage, evaluate, waitForFunction } = preparationStage([ready]);
    await expect(waitForStudioSmartShapeFloatingReady(stage, 0, () => true)).rejects.toThrow("초기 준비 기한");
    expect(evaluate).not.toHaveBeenCalled();
    expect(waitForFunction).not.toHaveBeenCalled();
  });
  it("브라우저 프레임 대기가 실패하면 원문을 보존하고 재시도하지 않는다", async () => {
    const { stage, evaluate, waitForFunction } = preparationStage([ready]);
    const failure = new Error("관측 프레임 시간 초과");
    waitForFunction.mockRejectedValueOnce(failure);
    await expect(waitForStudioSmartShapeFloatingReady(stage, 60_000, () => true)).rejects.toBe(failure);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(waitForFunction).toHaveBeenCalledOnce();
  });
  it("처음엔 정상인 위치도 정착 전에 다시 움직이면 안정 프레임을 다시 센다", async () => {
    const moved = { ...ready, targets: [{ ...ready.targets[0]!, rect: { ...ready.targets[0]!.rect, left: 930 } }] };
    const { stage, evaluate } = preparationStage([ready, ready, moved, moved, moved]);
    expect((await waitForStudioSmartShapeFloatingReady(stage, 60_000, () => true)).floating).toEqual(moved);
    expect(evaluate).toHaveBeenCalledTimes(5);
  });
});
