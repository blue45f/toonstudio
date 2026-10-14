import { describe, expect, it } from "vitest";

import {
  WRAP_AROUND_OFFSETS,
  ghostWrapStrokes,
  isWrapStrokeInsideTile,
  splitStrokeAtTileEdges,
  visibleWrapOffsets,
  wrapPointIntoTile,
  wrapStrokeBounds,
  type WrapAroundPoint,
  type WrapAroundTileSize,
} from "./studio-wrap-around";

const TILE: WrapAroundTileSize = { width: 100, height: 80 };

function totalLength(pieces: readonly (readonly WrapAroundPoint[])[]): number {
  let sum = 0;
  for (const piece of pieces) {
    for (let i = 0; i < piece.length - 1; i += 1) {
      const a = piece[i]!;
      const b = piece[i + 1]!;
      sum += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return sum;
}

function expectAllInside(pieces: readonly (readonly WrapAroundPoint[])[]): void {
  for (const piece of pieces) {
    expect(piece.length).toBeGreaterThanOrEqual(2);
    expect(isWrapStrokeInsideTile(piece, TILE)).toBe(true);
    for (const p of piece) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(TILE.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(TILE.height);
    }
  }
}

describe("wrapPointIntoTile", () => {
  it("wraps negative and overflowing coordinates into the tile", () => {
    expect(wrapPointIntoTile({ x: -10, y: 90 }, TILE)).toEqual({ x: 90, y: 10 });
    expect(wrapPointIntoTile({ x: 250, y: -160 }, TILE)).toEqual({ x: 50, y: 0 });
  });

  it("wraps a point exactly on the far edge back to 0", () => {
    expect(wrapPointIntoTile({ x: 100, y: 80 }, TILE)).toEqual({ x: 0, y: 0 });
    expect(wrapPointIntoTile({ x: 40, y: 30 }, TILE)).toEqual({ x: 40, y: 30 });
  });

  it("rejects a degenerate tile size", () => {
    expect(() => wrapPointIntoTile({ x: 0, y: 0 }, { width: 0, height: 80 })).toThrow();
  });
});

describe("visibleWrapOffsets / ghostWrapStrokes", () => {
  it("returns only the center offset for an interior stroke", () => {
    const bounds = wrapStrokeBounds([
      { x: 10, y: 10 },
      { x: 50, y: 40 },
    ])!;
    expect(visibleWrapOffsets(bounds, TILE)).toEqual([{ dx: 0, dy: 0 }]);
    expect(WRAP_AROUND_OFFSETS).toHaveLength(9);
  });

  it("shows a stroke crossing the right edge continuing on the left edge", () => {
    const stroke: WrapAroundPoint[] = [
      { x: 90, y: 40 },
      { x: 110, y: 40 },
    ];
    const ghosts = ghostWrapStrokes(stroke, TILE);
    const offsets = ghosts.map((g) => g.offset);
    expect(offsets).toContainEqual({ dx: 0, dy: 0 });
    expect(offsets).toContainEqual({ dx: -1, dy: 0 });
    // 반대편(왼쪽) 복사본은 x=0 가장자리에서 시작해 안쪽으로 이어진다.
    const wrapped = ghosts.find((g) => g.offset.dx === -1 && g.offset.dy === 0)!;
    expect(wrapped.points[0]).toEqual({ x: -10, y: 40 });
    expect(wrapped.points[1]).toEqual({ x: 10, y: 40 });
  });

  it("adds diagonal ghosts for a corner-crossing stroke", () => {
    const ghosts = ghostWrapStrokes(
      [
        { x: 95, y: 75 },
        { x: 105, y: 85 },
      ],
      TILE,
    );
    expect(ghosts.map((g) => g.offset)).toContainEqual({ dx: -1, dy: -1 });
    expect(ghosts).toHaveLength(4);
  });

  it("returns no ghosts for an empty stroke", () => {
    expect(ghostWrapStrokes([], TILE)).toEqual([]);
    expect(wrapStrokeBounds([])).toBeNull();
  });
});

describe("splitStrokeAtTileEdges", () => {
  it("keeps an interior stroke as a single untouched piece", () => {
    const stroke: WrapAroundPoint[] = [
      { x: 10, y: 10 },
      { x: 50, y: 40 },
      { x: 60, y: 20 },
    ];
    const pieces = splitStrokeAtTileEdges(stroke, TILE);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toEqual(stroke);
  });

  it("splits a right-edge crossing into in-tile pieces that preserve length", () => {
    const stroke: WrapAroundPoint[] = [
      { x: 90, y: 40 },
      { x: 110, y: 40 },
    ];
    const pieces = splitStrokeAtTileEdges(stroke, TILE);
    expect(pieces).toHaveLength(2);
    expectAllInside(pieces);
    expect(totalLength(pieces)).toBeCloseTo(20, 6);
    // 한 조각은 오른쪽 가장자리에서 끝나고, 다른 조각은 왼쪽 가장자리에서 시작한다.
    const flat = pieces.flat();
    expect(flat.some((p) => p.x === TILE.width)).toBe(true);
    expect(flat.some((p) => p.x === 0)).toBe(true);
  });

  it("splits a corner-crossing stroke into in-tile pieces", () => {
    const stroke: WrapAroundPoint[] = [
      { x: 95, y: 75 },
      { x: 105, y: 85 },
    ];
    const pieces = splitStrokeAtTileEdges(stroke, TILE);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expectAllInside(pieces);
    expect(totalLength(pieces)).toBeCloseTo(Math.hypot(10, 10), 6);
  });

  it("splits a multi-segment stroke that crosses, re-enters, and crosses again", () => {
    const stroke: WrapAroundPoint[] = [
      { x: 80, y: 10 },
      { x: 120, y: 10 }, // 오른쪽으로 나감 (고스트 좌표에서는 왼쪽 조각)
      { x: 120, y: 30 },
      { x: 80, y: 30 },
    ];
    const pieces = splitStrokeAtTileEdges(stroke, TILE);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expectAllInside(pieces);
  });

  it("wraps a single dot into the tile and drops empty strokes", () => {
    expect(splitStrokeAtTileEdges([{ x: -5, y: 85 }], TILE)).toEqual([[{ x: 95, y: 5 }]]);
    expect(splitStrokeAtTileEdges([], TILE)).toEqual([]);
  });

  it("keeps every piece inside the tile for a long wandering stroke (deterministic sweep)", () => {
    // 의사난수 없이 결정적인 사인 궤적으로 경계를 여러 번 넘나든다.
    const stroke: WrapAroundPoint[] = [];
    for (let i = 0; i <= 60; i += 1) {
      stroke.push({ x: 50 + 70 * Math.sin(i * 0.7), y: 40 + 55 * Math.cos(i * 0.43) });
    }
    const pieces = splitStrokeAtTileEdges(stroke, TILE);
    expect(pieces.length).toBeGreaterThan(1);
    expectAllInside(pieces);
  });
});
