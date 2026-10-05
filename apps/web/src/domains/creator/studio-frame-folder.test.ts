import { describe, expect, it } from "vitest";

import {
  applySharedGutterDragPlan,
  applyVerticalGapDragPlan,
  formatFrameFolderGroupName,
  planBindSelectionToFrameFolder,
  planSharedGutterDrag,
  planSharedGutterSegments,
  planVerticalGapDrag,
  verticalGapDragKey,
} from "./studio-frame-folder";

type Item = { id: string; groupId?: string; noClip?: boolean };

describe("formatFrameFolderGroupName", () => {
  it("prefixes a cut-folder label", () => {
    expect(formatFrameFolderGroupName("1컷")).toBe("컷 폴더 · 1컷");
  });

  it("falls back when the frame label is empty", () => {
    expect(formatFrameFolderGroupName("   ")).toBe("컷 폴더");
  });
});

describe("planBindSelectionToFrameFolder", () => {
  it("returns null when seeds are empty or only the frame itself", () => {
    expect(
      planBindSelectionToFrameFolder({
        frameId: "frame-1",
        frameLabel: "1컷",
        groupId: "g1",
        seedIds: ["frame-1"],
        items: [{ id: "frame-1" }, { id: "ink" }],
        groups: [],
      })
    ).toBeNull();
  });

  it("groups members contiguously and forces noClip off", () => {
    const items: Item[] = [
      { id: "bg" },
      { id: "frame-1" },
      { id: "ink", noClip: true },
      { id: "tone" },
    ];
    const result = planBindSelectionToFrameFolder({
      frameId: "frame-1",
      frameLabel: "주인공 컷",
      groupId: "folder-1",
      seedIds: ["ink", "tone", "frame-1"],
      items,
      groups: [],
    });
    expect(result).not.toBeNull();
    expect(result!.group.name).toBe("컷 폴더 · 주인공 컷");
    expect([...result!.memberIds].sort()).toEqual(["ink", "tone"]);
    expect(result!.clearedNoClipIds).toEqual(["ink"]);
    const byId = new Map(result!.items.map((item) => [item.id, item]));
    expect(byId.get("ink")?.groupId).toBe("folder-1");
    expect(byId.get("tone")?.groupId).toBe("folder-1");
    expect(byId.get("ink")?.noClip).toBe(false);
    expect(byId.get("tone")?.noClip).toBe(false);
    expect(byId.get("frame-1")?.groupId).toBeUndefined();
    // Members stay contiguous in z-order after regroup.
    const memberPositions = result!.items
      .map((item, index) => (item.groupId === "folder-1" ? index : -1))
      .filter((index) => index >= 0);
    expect(memberPositions[memberPositions.length - 1]! - memberPositions[0]! + 1).toBe(
      memberPositions.length
    );
  });
});

describe("planSharedGutterSegments", () => {
  it("detects a vertical shared gutter between left and right frames", () => {
    const segments = planSharedGutterSegments([
      { id: "a", x: 0, y: 0, width: 100, height: 200 },
      { id: "b", x: 124, y: 20, width: 100, height: 200 },
    ]);
    const vertical = segments.filter((segment) => segment.axis === "v");
    expect(vertical).toHaveLength(1);
    expect(vertical[0]!.gap).toBe(24);
    expect(vertical[0]!.pos).toBe(112); // mid of 100..124
    expect(vertical[0]!.from).toBe(20);
    expect(vertical[0]!.to).toBe(200);
    expect(vertical[0]!.frameAId).toBe("a");
    expect(vertical[0]!.frameBId).toBe("b");
  });

  it("detects a horizontal shared gutter between stacked frames", () => {
    const segments = planSharedGutterSegments([
      { id: "top", x: 0, y: 0, width: 200, height: 100 },
      { id: "bottom", x: 10, y: 124, width: 200, height: 80 },
    ]);
    const horizontal = segments.filter((segment) => segment.axis === "h");
    expect(horizontal).toHaveLength(1);
    expect(horizontal[0]!.gap).toBe(24);
    expect(horizontal[0]!.pos).toBe(112);
  });

  it("ignores distant frames and non-overlapping edges", () => {
    expect(
      planSharedGutterSegments([
        { id: "a", x: 0, y: 0, width: 50, height: 50 },
        { id: "b", x: 400, y: 0, width: 50, height: 50 },
      ])
    ).toEqual([]);
    expect(
      planSharedGutterSegments([
        { id: "a", x: 0, y: 0, width: 50, height: 50 },
        { id: "b", x: 60, y: 200, width: 50, height: 50 },
      ])
    ).toEqual([]);
  });
});

describe("planSharedGutterDrag + child reflow", () => {
  const left = { id: "L", x: 0, y: 0, width: 100, height: 200 };
  const right = { id: "R", x: 124, y: 0, width: 100, height: 200 };
  const segment = planSharedGutterSegments([left, right])[0]!;

  it("moves both frames while preserving the gutter gap", () => {
    const framesById = new Map([
      [left.id, left],
      [right.id, right],
    ]);
    const plan = planSharedGutterDrag({
      segment,
      framesById,
      delta: 10,
      elements: [
        { id: "ink-left", type: "image", x: 10, y: 10, width: 40, height: 40 },
        { id: "ink-right", type: "image", x: 140, y: 20, width: 40, height: 40 },
      ],
    });
    expect(plan).not.toBeNull();
    expect(plan!.appliedDelta).toBe(10);
    const byId = new Map(plan!.framePatches.map((patch) => [patch.id, patch]));
    expect(byId.get("L")).toMatchObject({ x: 0, width: 110 });
    expect(byId.get("R")).toMatchObject({ x: 134, width: 90 });
    // Gap remains 24.
    expect(byId.get("R")!.x - (byId.get("L")!.x + byId.get("L")!.width)).toBe(24);
    expect(plan!.childTranslates).toEqual([{ id: "ink-right", dx: 10, dy: 0 }]);

    const next = applySharedGutterDragPlan(
      [
        left,
        right,
        { id: "ink-left", type: "image", x: 10, y: 10, width: 40, height: 40 },
        { id: "ink-right", type: "image", x: 140, y: 20, width: 40, height: 40 },
      ],
      plan!
    );
    const inkRight = next.find((el) => el.id === "ink-right")!;
    expect(inkRight.x).toBe(150);
    const inkLeft = next.find((el) => el.id === "ink-left")!;
    expect(inkLeft.x).toBe(10);
  });

  it("clamps so neither frame collapses below min side", () => {
    const framesById = new Map([
      [left.id, left],
      [right.id, right],
    ]);
    const plan = planSharedGutterDrag({
      segment,
      framesById,
      delta: 1000,
      minSidePx: 24,
    });
    expect(plan!.appliedDelta).toBe(76); // 100 - 24
    const rightPatch = plan!.framePatches.find((patch) => patch.id === "R")!;
    expect(rightPatch.width).toBe(24);
  });

  it("reflows freehand points when the host frame translates", () => {
    const framesById = new Map([
      [left.id, left],
      [right.id, right],
    ]);
    const plan = planSharedGutterDrag({
      segment,
      framesById,
      delta: 5,
      elements: [{ id: "stroke", type: "draw", points: [130, 10, 150, 30] }],
    });
    const next = applySharedGutterDragPlan(
      [{ id: "stroke", type: "draw", points: [130, 10, 150, 30] }],
      plan!
    );
    expect(next[0]!.points).toEqual([135, 10, 155, 30]);
  });

  it("detects and drags a diagonal shared gutter between polygon cut frames", () => {
    // Frame A (left of cut): (0,0) to (200,0) to (150,200) to (0,200)
    const frameA = {
      id: "polyA",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      points: [0, 0, 200, 0, 150, 200, 0, 200],
    };
    // Frame B (right of cut): (210,0) to (400,0) to (400,200) to (160,200)
    const frameB = {
      id: "polyB",
      x: 160,
      y: 0,
      width: 240,
      height: 200,
      points: [50, 0, 240, 0, 240, 200, 0, 200],
    };

    const segments = planSharedGutterSegments([frameA, frameB]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.axis).toBe("d");
    expect(segments[0]!.frameAId).toBe("polyA");
    expect(segments[0]!.frameBId).toBe("polyB");
    expect(segments[0]!.gap).toBeCloseTo(9.7, 1);

    const framesById = new Map([
      [frameA.id, frameA],
      [frameB.id, frameB],
    ]);

    const plan = planSharedGutterDrag({
      segment: segments[0]!,
      framesById,
      delta: 10,
    });

    expect(plan).not.toBeNull();
    expect(plan!.appliedDelta).toBe(10);
    expect(plan!.framePatches).toHaveLength(2);
  });
});

describe("planVerticalGapDrag (세로 공백 드래그 패널링)", () => {
  const top = { id: "top", x: 0, y: 0, width: 200, height: 100 };
  const bottom = { id: "bottom", x: 0, y: 124, width: 200, height: 80 };
  const third = { id: "third", x: 0, y: 228, width: 200, height: 60 };
  const side = { id: "side", x: 400, y: 124, width: 100, height: 80 };
  const frames = [top, bottom, third, side];
  const segment = planSharedGutterSegments([top, bottom]).filter(
    (candidate) => candidate.axis === "h"
  )[0]!;

  it("widens the gap: top stays, the whole stack below translates, sizes preserved", () => {
    const plan = planVerticalGapDrag({
      segment,
      frames,
      delta: 30,
      elements: [
        { id: "ink-top", type: "image", x: 10, y: 10, width: 40, height: 40 },
        { id: "ink-bottom", type: "image", x: 10, y: 140, width: 40, height: 40 },
        { id: "loose-below", type: "image", x: 60, y: 300, width: 30, height: 30 },
        { id: "loose-outside", type: "image", x: 420, y: 300, width: 30, height: 30 },
      ],
    });
    expect(plan).not.toBeNull();
    expect(plan!.appliedDelta).toBe(30);
    expect(plan!.nextGap).toBe(54);
    const byId = new Map(plan!.framePatches.map((patch) => [patch.id, patch]));
    expect(byId.get("bottom")).toMatchObject({ y: 154, height: 80 });
    expect(byId.get("third")).toMatchObject({ y: 258, height: 60 });
    expect(byId.has("top")).toBe(false);
    expect(byId.has("side")).toBe(false);
    expect(plan!.elementTranslates).toEqual([
      { id: "ink-bottom", dx: 0, dy: 30 },
      { id: "loose-below", dx: 0, dy: 30 },
    ]);

    const next = applyVerticalGapDragPlan(
      [
        top,
        bottom,
        third,
        side,
        { id: "ink-bottom", type: "image", x: 10, y: 140, width: 40, height: 40 },
      ],
      plan!
    );
    expect(next.find((el) => el.id === "top")).toBe(top);
    expect(next.find((el) => el.id === "side")).toBe(side);
    expect(next.find((el) => el.id === "bottom")).toMatchObject({ y: 154 });
    expect(next.find((el) => el.id === "ink-bottom")).toMatchObject({ y: 170 });
  });

  it("clamps shrinking at gap zero so frames never overlap", () => {
    const plan = planVerticalGapDrag({ segment, frames, delta: -100 });
    expect(plan!.appliedDelta).toBe(-24);
    expect(plan!.nextGap).toBe(0);
    const bottomPatch = plan!.framePatches.find((patch) => patch.id === "bottom")!;
    expect(bottomPatch.y).toBe(100); // top frame bottom edge
  });

  it("returns null for non-horizontal segments and missing frames", () => {
    const vertical = planSharedGutterSegments([
      { id: "a", x: 0, y: 0, width: 100, height: 200 },
      { id: "b", x: 124, y: 0, width: 100, height: 200 },
    ])[0]!;
    expect(planVerticalGapDrag({ segment: vertical, frames, delta: 10 })).toBeNull();
    expect(planVerticalGapDrag({ segment, frames: [top], delta: 10 })).toBeNull();
  });

  it("zero delta is an identity plan", () => {
    const plan = planVerticalGapDrag({ segment, frames, delta: 0 });
    expect(plan!.appliedDelta).toBe(0);
    const elements = [top, bottom];
    expect(applyVerticalGapDragPlan(elements, plan!)).toBe(elements);
  });

  it("exposes a stable coalesce key distinct from the co-edit key", () => {
    expect(verticalGapDragKey(segment)).toBe(`vertical-gap:h:top:bottom`);
  });
});

