// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importPromoPanels } from "./promo-import";

const hoisted = vi.hoisted(() => ({
  gutter: vi.fn<(image: unknown, sourceHeight: number, maxParts?: number) => number[]>(),
}));
vi.mock("./promo-media", () => ({ readPromoFile: vi.fn(() => Promise.resolve("data:image/png;base64,aGVsbG8=")) }));
vi.mock("./promo-canvas", () => ({
  loadPromoImages: vi.fn((project: { panels: readonly { id: string }[] }) => Promise.resolve(new Map(project.panels.map((panel) => [panel.id, { naturalWidth: 400, naturalHeight: 4000, src: "" }])))),
}));
vi.mock("./promo-split", () => ({ promoGutterCuts: hoisted.gutter }));

/*
 * 가져오기는 길이별 컷 수 상한을 알아야 한다. 10초 쇼츠는 6컷이라, 여백 자동 분할이나 균등 분할이 상한을 넘는 컷을 만들면
 * 프로젝트가 타임라인을 계산할 수 없는 상태가 된다(promoTimeline이 거절). 상한 기본값 12는 기존 15·30·60초 동작 그대로다.
 */
const image = () => new File([new Uint8Array([1, 2, 3])], "page.png", { type: "image/png" });

beforeEach(() => {
  hoisted.gutter.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((id: string) => (id === "2d"
    ? { drawImage: vi.fn(), getImageData: () => ({ width: 192, height: 1920, data: new Uint8ClampedArray(0) }) }
    : null)) as HTMLCanvasElement["getContext"]);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,aGVsbG8=");
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("원고 가져오기의 컷 수 상한", () => {
  it("자동 분할에는 남은 컷 수(상한 − 이미 있는 컷)만 넘긴다", async () => {
    hoisted.gutter.mockReturnValue([0, 4000]);
    await importPromoPanels(image(), 0, "auto", undefined, 6);
    expect(hoisted.gutter).toHaveBeenLastCalledWith(expect.anything(), 4000, 6);
    await importPromoPanels(image(), 4, "auto", undefined, 6);
    expect(hoisted.gutter).toHaveBeenLastCalledWith(expect.anything(), 4000, 2);
  });

  it("상한을 생략하면 기존 12컷 규칙 그대로다", async () => {
    hoisted.gutter.mockReturnValue([0, 4000]);
    await importPromoPanels(image(), 3, "auto");
    expect(hoisted.gutter).toHaveBeenLastCalledWith(expect.anything(), 4000, 9);
  });

  it("자동 분할 결과가 상한을 넘으면 거절하고 어떤 컷도 만들지 않는다", async () => {
    hoisted.gutter.mockReturnValue([0, 500, 1000, 1500, 2000, 4000]);
    await expect(importPromoPanels(image(), 2, "auto", undefined, 6)).rejects.toThrow("최대 6컷까지");
    // 같은 결과라도 12컷 상한에서는 받는다.
    await expect(importPromoPanels(image(), 2, "auto", undefined, 12)).resolves.toHaveLength(5);
  });

  it("균등 분할도 상한을 넘으면 거절하고, 상한 안이면 그만큼 컷을 만든다", async () => {
    await expect(importPromoPanels(image(), 0, 8, undefined, 6)).rejects.toThrow("최대 6컷까지");
    const panels = await importPromoPanels(image(), 0, 6, undefined, 6);
    expect(panels).toHaveLength(6);
    expect(panels.map((panel) => panel.caption)).toEqual(["컷 1", "컷 2", "컷 3", "컷 4", "컷 5", "컷 6"]);
    await expect(importPromoPanels(image(), 1, 6, undefined, 6)).rejects.toThrow("최대 6컷까지");
  });

  it("상한 안에서는 12등분도 기존대로 만든다", async () => {
    const panels = await importPromoPanels(image(), 0, 12);
    expect(panels).toHaveLength(12);
  });
});
