import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioOilRibbonPaintContext } from "./studio-oil-ribbon-carrier-types";
import type { StudioOilRibbonIncrementalPaintInput } from "./studio-oil-ribbon-incremental-paint";

const mocked = vi.hoisted(() => ({
  canonical: vi.fn(() => ({ wetIntoWetApplied: true, usedLiveDestination: true, hitPass: false })),
  incremental: vi.fn(() => ({ wetIntoWetApplied: true, usedLiveDestination: true, hitPass: false })),
}));
vi.mock("./studio-oil-ribbon-paint", () => ({ paintStudioOilRibbonCarrier: mocked.canonical }));

const context = {} as StudioOilRibbonPaintContext;
const input = (id: string): StudioOilRibbonIncrementalPaintInput => ({
  incrementalKey: id, stroke: "#e4c735", opacity: 0.3, points: [{ x: 10, y: 20 }], radiusPx: 8,
  carrier: { version: "oil-ribbon-carrier-v1", sourceStationCount: 0, repeatedBodyStampCount: 0,
    body: null, bodyOpacity: 0, bristleLanes: [] },
});

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.doUnmock("./studio-oil-ribbon-incremental-paint"); vi.restoreAllMocks(); });

describe("유화 증분 최적화의 지연 로드", () => {
  it.each(["ended", "cancelled", "destroyed", "new-document", "next-stroke"])("첫 입력은 정본으로 칠하고 %s 이후 완료는 이전 획을 다시 칠하지 않는다", async (state) => {
    let release: (() => void) | undefined;
    const loaded = new Promise<void>((resolve) => { release = resolve; });
    vi.doMock("./studio-oil-ribbon-incremental-paint", async () => {
      await loaded;
      return { paintStudioOilRibbonCarrierIncremental: mocked.incremental };
    });
    const { paintStudioOilRibbonCarrierIncremental: paint } = await import("./studio-oil-live-paint");
    expect(paint(context, input(`${state}-page-a`))).toMatchObject({ usedLiveDestination: true });
    expect(mocked.canonical).toHaveBeenCalledTimes(1);
    expect(mocked.incremental).not.toHaveBeenCalled();
    release?.();
    await vi.dynamicImportSettled();
    // module 준비는 그리기·타이머·오래된 context 호출을 예약하지 않는다.
    expect(mocked.canonical).toHaveBeenCalledTimes(1);
    expect(mocked.incremental).not.toHaveBeenCalled();
    paint(context, input("new-page-b"));
    expect(mocked.incremental).toHaveBeenCalledExactlyOnceWith(context, input("new-page-b"));
  });

  it("로드 실패에도 같은 정본 혼색을 유지하며 반복 로드를 만들지 않는다", async () => {
    const load = vi.fn(() => { throw new Error("chunk unavailable"); });
    vi.doMock("./studio-oil-ribbon-incremental-paint", load);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { paintStudioOilRibbonCarrierIncremental: paint } = await import("./studio-oil-live-paint");
    paint(context, input("cancelled"));
    await vi.dynamicImportSettled();
    paint(context, input("next-stroke"));
    expect(mocked.canonical).toHaveBeenCalledTimes(2);
    expect(mocked.incremental).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
