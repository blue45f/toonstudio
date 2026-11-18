import { describe, expect, it } from "vitest";

import {
  deleteVerticalDrawingSpace,
  insertVerticalDrawingSpace,
} from "./studio-shift-drawing";

import type { ShiftableDrawingElement } from "./studio-shift-drawing";

describe("studio-shift-drawing", () => {
  it("여백 삽입 후 같은 위치·크기 여백 삭제 시 걸침 요소를 포함해 원본 페이지로 정확히 왕복(round-trip)한다", () => {
    const initialElements: readonly ShiftableDrawingElement[] = [
      { id: "frame-1", type: "frame", name: "상단 컷", x: 40, y: 100, width: 720, height: 350 },
      { id: "bg-grad", type: "image", name: "배경 그라데이션", x: 0, y: 400, width: 800, height: 500 },
      { id: "bubble-2", type: "bubble", name: "하단 대사", x: 120, y: 700, width: 320, height: 140 },
      { id: "stroke-1", type: "draw", name: "속도선 획", points: [100, 620, 140, 780] },
    ];

    const inserted = insertVerticalDrawingSpace({
      canvasWidth: 800,
      canvasHeight: 2000,
      anchorY: 550,
      amountPx: 400,
      elements: initialElements,
    });

    expect(inserted.nextCanvasHeight).toBe(2400);
    expect(inserted.shiftedElementCount).toBe(2); // bubble-2, stroke-1
    expect(inserted.straddlingSplits).toHaveLength(1);
    expect(inserted.straddlingSplits[0]).toMatchObject({
      elementId: "bg-grad",
      topSlice: { y: 400, height: 150, sourceOffsetY: 0 },
      bottomSlice: { y: 950, height: 350, sourceOffsetY: 150 },
    });

    // 역연산: 동일 anchorY=550, amountPx=400 삭제
    const restored = deleteVerticalDrawingSpace({
      canvasWidth: 800,
      canvasHeight: inserted.nextCanvasHeight,
      anchorY: 550,
      amountPx: 400,
      elements: inserted.elements,
    });

    expect(restored.nextCanvasHeight).toBe(2000);
    expect(restored.elements).toEqual(initialElements);
  });

  it("split 모드에서는 기준선에 걸친 요소를 상단·하단 두 조각으로 분리한다", () => {
    const res = insertVerticalDrawingSpace({
      canvasWidth: 800,
      canvasHeight: 1600,
      anchorY: 500,
      amountPx: 250,
      straddlingMode: "split",
      elements: [{ id: "panel-a", type: "frame", x: 20, y: 300, width: 760, height: 450 }],
    });

    expect(res.elements).toEqual([
      { id: "panel-a__top", type: "frame", x: 20, y: 300, width: 760, height: 200 },
      { id: "panel-a__bottom", type: "frame", x: 20, y: 750, width: 760, height: 250 },
    ]);
  });

  it("여백 삭제 시 구간 내부에 완전히 들어간 요소는 제거 목록에 기록하고 아래 요소를 당긴다", () => {
    const res = deleteVerticalDrawingSpace({
      canvasWidth: 800,
      canvasHeight: 1800,
      anchorY: 400,
      amountPx: 300,
      elements: [
        { id: "sfx-inside", type: "sticker", x: 200, y: 450, width: 120, height: 80 },
        { id: "panel-below", type: "frame", x: 40, y: 900, width: 720, height: 400 },
      ],
    });

    expect(res.nextCanvasHeight).toBe(1500);
    expect(res.removedElementIds).toEqual(["sfx-inside"]);
    expect(res.elements).toEqual([
      { id: "panel-below", type: "frame", x: 40, y: 600, width: 720, height: 400 },
    ]);
  });
});
