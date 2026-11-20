import { describe, expect, it } from "vitest";

import { studioLongBrushRoute } from "./studio-brush-long-route";

import type { StudioDurabilityViewport } from "./studio-durability-viewport";

const viewport = { width: 1440, height: 1100, devicePixelRatio: 1 };
function layout(zoom: number, x = 78, width = 1362): StudioDurabilityViewport {
  return {
    viewport, documentToScreen: [zoom, 0, 0, zoom, x, 35],
    stageBox: { x, y: 35, width, height: 2043 },
    visibleBox: { x, y: 100, width, height: 1000 },
    stageSize: { width, height: 2043 }, renderer: "compatibility",
  };
}

describe("long brush document distance", () => {
  it("fits the persisted 300 document px gate when each document pixel covers 1.89 CSS px", () => {
    const view = layout(1362 / 720);
    const { startX, endX } = studioLongBrushRoute(view);
    expect((endX - startX) / (1362 / 720)).toBeGreaterThanOrEqual(320);
    expect((startX + endX) / 2).toBeCloseTo(viewport.width * (0.34 + 0.69) / 2);
  });

  it("keeps the original CSS route at 1:1 and respects a clipped, offset manuscript", () => {
    const route = studioLongBrushRoute(layout(1));
    expect(route.startX).toBeCloseTo(viewport.width * 0.34);
    expect(route.endX).toBeCloseTo(viewport.width * 0.69);
    const clipped = studioLongBrushRoute(layout(1, 650, 520));
    expect(clipped.startX).toBeGreaterThanOrEqual(720);
    expect(clipped.endX).toBeLessThanOrEqual(1100);
    expect(clipped.endX - clipped.startX).toBeGreaterThanOrEqual(320);
  });

  it("rejects a viewport that cannot hold the required span", () => {
    expect(() => studioLongBrushRoute(layout(2, 300, 460))).toThrow("300 document px");
    expect(() => studioLongBrushRoute(layout(0))).toThrow("300 document px");
  });
});
