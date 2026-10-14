import { describe, expect, it } from "vitest";

import {
  createStudioReferenceBoardDocument,
  createStudioReferenceBoardItem,
  type StudioReferenceBoardItem,
} from "./studio-reference-board";
import { studioReferenceItemFramePercent } from "./studio-reference-color-sampler";
import {
  arrangeStudioReferenceBoardByCriteria,
  referenceHueFromHex,
  sortStudioReferenceBoardItems,
  STUDIO_REFERENCE_BOARD_ARRANGE_OPTIONS,
} from "./studio-reference-board-arrange";

function item(
  id: string,
  index: number,
  asset: { name?: string; width?: number; height?: number } = {},
): StudioReferenceBoardItem {
  const result = createStudioReferenceBoardItem({
    id,
    asset: {
      sha256: `sha256:${String(index + 1).padStart(2, "0").repeat(32)}`,
      ...asset,
    },
    view: {
      centerX: 0.05 + index * 0.08,
      centerY: 0.9 - index * 0.06,
      zoom: 1.75,
      rotationDeg: index * 13,
      flipX: index % 2 === 0,
      flipY: false,
      opacity: 0.7,
      grayscale: index % 2 === 1,
    },
  });
  if (!result) throw new Error("reference fixture should be valid");
  return result;
}

function displayedHeight(candidate: StudioReferenceBoardItem): number {
  const frame = studioReferenceItemFramePercent(
    candidate.asset.width ?? 1,
    candidate.asset.height ?? 1,
  );
  return (frame.height / 100) * candidate.view.zoom;
}

function displayedWidth(candidate: StudioReferenceBoardItem): number {
  const frame = studioReferenceItemFramePercent(
    candidate.asset.width ?? 1,
    candidate.asset.height ?? 1,
  );
  return (frame.width / 100) * candidate.view.zoom;
}

describe("referenceHueFromHex", () => {
  it("maps pure colors to the color wheel and rejects near-gray or malformed values", () => {
    expect(referenceHueFromHex("#ff0000")).toBeCloseTo(0, 5);
    expect(referenceHueFromHex("#ffff00")).toBeCloseTo(60, 5);
    expect(referenceHueFromHex("#00ff00")).toBeCloseTo(120, 5);
    expect(referenceHueFromHex("#0000ff")).toBeCloseTo(240, 5);
    expect(referenceHueFromHex("#808080")).toBeNull();
    expect(referenceHueFromHex("not-a-color")).toBeNull();
  });
});

describe("sortStudioReferenceBoardItems", () => {
  it("sorts by Korean name, by intrinsic area, and by hue with unknowns last", () => {
    const items = [
      item("b", 0, { name: "다람쥐", width: 100, height: 100 }),
      item("a", 1, { name: "가방", width: 400, height: 100 }),
      item("c", 2, { name: "나비", width: 50, height: 50 }),
    ];
    expect(sortStudioReferenceBoardItems(items, "name").map((c) => c.id)).toEqual(["a", "c", "b"]);
    expect(sortStudioReferenceBoardItems(items, "size").map((c) => c.id)).toEqual(["a", "b", "c"]);
    const hues = new Map([["b", 240], ["a", 10]]);
    expect(
      sortStudioReferenceBoardItems(items, "hue", { dominantHues: hues }).map((c) => c.id),
    ).toEqual(["a", "b", "c"]);
    expect(sortStudioReferenceBoardItems(items, "keep")).toBe(items);
    expect(STUDIO_REFERENCE_BOARD_ARRANGE_OPTIONS.map((o) => o.sort)).toEqual([
      "keep",
      "name",
      "hue",
      "size",
    ]);
  });
});

describe("arrangeStudioReferenceBoardByCriteria", () => {
  it("keeps an empty board referentially stable", () => {
    const document = createStudioReferenceBoardDocument();
    expect(arrangeStudioReferenceBoardByCriteria(document, { sort: "name" })).toBe(document);
  });

  it("normalizes displayed heights, sorts by the chosen criterion, and packs without overlap", () => {
    const document = createStudioReferenceBoardDocument([
      item("wide", 0, { name: "다", width: 400, height: 100 }),
      item("tall", 1, { name: "가", width: 100, height: 400 }),
      item("square", 2, { name: "나", width: 200, height: 200 }),
    ]);

    const arranged = arrangeStudioReferenceBoardByCriteria(document, { sort: "name" });

    expect(arranged.items.map((c) => c.id)).toEqual(["tall", "square", "wide"]);
    const heights = arranged.items.map(displayedHeight);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1e-9);
    expect(arranged.items.every((c) => c.view.rotationDeg === 0)).toBe(true);
    expect(arranged.items.every((c) => c.view.zoom <= 1)).toBe(true);
    // Visual flags and identity survive the arrange.
    expect(arranged.items.find((c) => c.id === "wide")?.view.flipX).toBe(true);
    expect(arranged.items.find((c) => c.id === "tall")?.view.grayscale).toBe(true);
    expect(arranged.items.every((c) => c.view.opacity === 0.7)).toBe(true);
    // Packed inside the board area with no overlapping frames.
    for (const candidate of arranged.items) {
      const halfW = displayedWidth(candidate) / 2;
      const halfH = displayedHeight(candidate) / 2;
      expect(candidate.view.centerX - halfW).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(candidate.view.centerX + halfW).toBeLessThanOrEqual(0.88 + 1e-9);
      expect(candidate.view.centerY - halfH).toBeGreaterThanOrEqual(0.13 - 1e-9);
      expect(candidate.view.centerY + halfH).toBeLessThanOrEqual(0.85 + 1e-9);
    }
    for (let i = 0; i < arranged.items.length; i += 1) {
      for (let j = i + 1; j < arranged.items.length; j += 1) {
        const a = arranged.items[i];
        const b = arranged.items[j];
        if (!a || !b) continue;
        const overlapX = Math.abs(a.view.centerX - b.view.centerX)
          < (displayedWidth(a) + displayedWidth(b)) / 2 - 1e-9;
        const overlapY = Math.abs(a.view.centerY - b.view.centerY)
          < (displayedHeight(a) + displayedHeight(b)) / 2 - 1e-9;
        expect(overlapX && overlapY).toBe(false);
      }
    }
    // Arranging an already-arranged board is a no-op (referential stability).
    expect(arrangeStudioReferenceBoardByCriteria(arranged, { sort: "name" })).toBe(arranged);
  });

  it("wraps into uniform rows when one row cannot hold the normalized widths", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      item(`sq-${index}`, index, { width: 300, height: 300 }));
    const document = createStudioReferenceBoardDocument(many);
    const arranged = arrangeStudioReferenceBoardByCriteria(document, { sort: "keep" });
    const heights = arranged.items.map(displayedHeight);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1e-9);
    const rows = new Set(arranged.items.map((c) => c.view.centerY.toFixed(6)));
    expect(rows.size).toBeGreaterThan(1);
    expect(arranged.items.map((c) => c.id)).toEqual(many.map((c) => c.id));
  });

  it("falls back to asset dimensions supplied by the caller for size sorting", () => {
    const document = createStudioReferenceBoardDocument([
      item("small", 0, { name: "작은 그림" }),
      item("big", 1, { name: "큰 그림" }),
    ]);
    const dimensions = new Map([
      ["small", { width: 10, height: 10 }],
      ["big", { width: 900, height: 900 }],
    ]);
    const arranged = arrangeStudioReferenceBoardByCriteria(document, {
      sort: "size",
      dimensions,
    });
    expect(arranged.items.map((c) => c.id)).toEqual(["big", "small"]);
  });
});
