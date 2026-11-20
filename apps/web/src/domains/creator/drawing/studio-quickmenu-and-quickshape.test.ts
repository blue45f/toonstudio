import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUICK_MENU_SLOTS,
  assignQuickMenuSlot,
  moveQuickShapeHandle,
  resolveQuickMenuSlotFromDrag,
  snapStrokeToQuickShape,
} from "./studio-quickmenu-and-quickshape";

describe("studio-quickmenu-and-quickshape (AC-016 T2 · T7)", () => {
  it("resolves 6 radial QuickMenu sectors outside deadzone and supports slot customization", () => {
    expect(resolveQuickMenuSlotFromDrag(DEFAULT_QUICK_MENU_SLOTS, 5, -5)).toBeNull();
    expect(resolveQuickMenuSlotFromDrag(DEFAULT_QUICK_MENU_SLOTS, 0, -48)?.actionId).toBe("undo");
    expect(resolveQuickMenuSlotFromDrag(DEFAULT_QUICK_MENU_SLOTS, 42, -24)?.index).toBe(1);
    expect(resolveQuickMenuSlotFromDrag(DEFAULT_QUICK_MENU_SLOTS, 42, 24)?.index).toBe(2);
    expect(resolveQuickMenuSlotFromDrag(DEFAULT_QUICK_MENU_SLOTS, 0, 48)?.actionId).toBe(
      "toggle-clipping-mask",
    );

    const customized = assignQuickMenuSlot(DEFAULT_QUICK_MENU_SLOTS, 0, "eyedropper");
    expect(customized[0]).toEqual({ index: 0, actionId: "eyedropper", labelKo: "스포이드" });
  });

  it("snaps held strokes into line, rectangle, ellipse, and triangle with editable handles", () => {
    // 400ms 미만 홀드는 스냅하지 않음
    expect(
      snapStrokeToQuickShape(
        [
          { x: 0, y: 0 },
          { x: 120, y: 4 },
        ],
        250,
      ),
    ).toBeNull();

    // 직선 스냅 + 핸들 이동
    const line = snapStrokeToQuickShape(
      [
        { x: 10, y: 20 },
        { x: 60, y: 22 },
        { x: 130, y: 21 },
      ],
      450,
    );
    expect(line?.kind).toBe("line");
    expect(line?.closed).toBe(false);
    const movedLine = moveQuickShapeHandle(line!, "end", 210, 80);
    expect(movedLine.handles[1]).toEqual({ id: "end", x: 210, y: 80 });
    expect(movedLine.boundingBox.width).toBe(200);

    // 사각형 스냅
    const rect = snapStrokeToQuickShape(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
        { x: 0, y: 0 },
      ],
      480,
    );
    expect(rect?.kind).toBe("rectangle");
    expect(rect?.handles).toHaveLength(4);

    // 타원 스냅
    const ellipsePts = Array.from({ length: 24 }, (_, idx) => {
      const rad = (idx / 24) * Math.PI * 2;
      return { x: 100 + Math.cos(rad) * 60, y: 100 + Math.sin(rad) * 40 };
    });
    const ellipse = snapStrokeToQuickShape(ellipsePts, 500);
    expect(ellipse?.kind).toBe("ellipse");

    // 삼각형 스냅
    const tri = snapStrokeToQuickShape(
      [
        { x: 50, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 50, y: 0 },
      ],
      500,
    );
    expect(tri?.kind).toBe("triangle");
    expect(tri?.handles).toHaveLength(3);
  });
});
