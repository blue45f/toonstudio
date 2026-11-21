import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";

import {
  analyzeSmartSelection,
  applyAutoLayoutToCanvasElements,
  exportAutoLayoutToCss,
  scrubSmartSelectionGap,
  solveAutoLayoutContainer,
  swapSmartSelectionSlots,
  tidySmartSelection,
  type FlexAutoLayoutContainer,
  type GridAutoLayoutContainer,
  type SmartSelectionItem,
} from "./studio-auto-layout-grid-engine";

import type { FrameEl } from "../studio-element-model";

describe("studio-auto-layout-grid-engine", () => {
  it("1D Flex Auto Layout에서 hug/fill/fixed, min/max, 패딩·갭·줄바꿈을 정확히 계산한다", () => {
    const flex: FlexAutoLayoutContainer = {
      mode: "flex",
      id: "container-row",
      x: 10,
      y: 20,
      width: 400,
      height: 100,
      widthMode: "fixed",
      heightMode: "hug",
      direction: "row",
      gap: 10,
      padding: { top: 12, right: 20, bottom: 12, left: 20 },
      alignItems: "center",
      children: [
        { id: "fixed-a", width: 80, height: 40, widthMode: "fixed" },
        { id: "fill-b", width: 50, height: 60, widthMode: "fill", minWidth: 100, maxWidth: 120 },
        { id: "fill-c", width: 50, height: 40, widthMode: "fill" },
      ],
    };

    const res = solveAutoLayoutContainer(flex);
    // 내부 가용 폭: 400 - 40(padding) = 360; 갭 20, fixed 80 -> fill 가용 260
    // fill-b는 maxWidth=120 클램프, fill-c는 나머지 140 배분
    expect(res.containerRect.width).toBe(400);
    expect(res.containerRect.height).toBe(84); // 60 + 12 + 12 (hug)
    expect(res.children[0]).toEqual({ id: "fixed-a", x: 30, y: 42, width: 80, height: 40 });
    expect(res.children[1]).toEqual({ id: "fill-b", x: 120, y: 32, width: 120, height: 60 });
    expect(res.children[2]).toEqual({ id: "fill-c", x: 250, y: 42, width: 140, height: 40 });

    // wrap 모드 줄바꿈 검증
    const wrapped = solveAutoLayoutContainer({
      ...flex,
      width: 220,
      wrap: "wrap",
      children: [
        { id: "w1", width: 80, height: 30 },
        { id: "w2", width: 80, height: 30 },
        { id: "w3", width: 80, height: 40 },
      ],
    });
    expect(wrapped.lineCount).toBe(2);
    expect(wrapped.children[2]!.y).toBeGreaterThan(wrapped.children[0]!.y + 30);
  });

  it("2D CSS Grid 솔버가 fr/px/auto 트랙과 colSpan/rowSpan 배치를 결정적으로 계산하고 CSS를 출력한다", () => {
    const grid: GridAutoLayoutContainer = {
      mode: "grid",
      id: "cut-grid",
      x: 0,
      y: 0,
      width: 440,
      height: 300,
      widthMode: "fixed",
      heightMode: "hug",
      columns: [
        { unit: "px", value: 100 },
        { unit: "fr", value: 1 },
        { unit: "fr", value: 2 },
      ],
      rows: [
        { unit: "px", value: 80 },
        { unit: "auto" },
      ],
      columnGap: 20,
      rowGap: 16,
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      children: [
        { id: "hero", width: 200, height: 80, colSpan: 2, rowSpan: 1 },
        { id: "side", width: 100, height: 150, colSpan: 1, rowSpan: 2 },
        { id: "c1", width: 80, height: 90 },
        { id: "c2", width: 80, height: 70 },
      ],
    };

    const res = solveAutoLayoutContainer(grid);
    // 내부 폭 420 - colGap(40) - px(100) = 280 -> 1fr=93.33, 2fr=186.67
    expect(res.columnWidths).toEqual([100, 93.33, 186.67]);
    expect(res.rowHeights).toEqual([80, 90]);
    const hero = res.children.find((c) => c.id === "hero")!;
    const side = res.children.find((c) => c.id === "side")!;
    expect(hero.width).toBeCloseTo(100 + 20 + 93.33, 1);
    expect(side.column).toBe(3);
    expect(side.rowSpan).toBe(2);
    expect(side.height).toBeCloseTo(80 + 16 + 90, 1);

    const css = exportAutoLayoutToCss(grid);
    expect(css).toContain("display: grid;");
    expect(css).toContain("grid-template-columns: 100px 1fr 2fr;");
    expect(css).toContain("column-gap: 20px;");

    // 캔버스 FrameEl 반영 확인
    const frames: FrameEl[] = [
      { id: "hero", type: "frame", x: 0, y: 0, width: 10, height: 10, stroke: rgbToHex(20, 20, 20) },
    ];
    const projected = applyAutoLayoutToCanvasElements(res, frames);
    expect((projected[0] as FrameEl).width).toBeCloseTo(hero.width, 1);
  });

  it("Smart Selection 패턴 감지 · 원클릭 Tidy · 간격 드래그 · 슬롯 스왑이 정확히 동작한다", () => {
    const messyRow: SmartSelectionItem[] = [
      { id: "a", x: 10, y: 20, width: 60, height: 40 },
      { id: "b", x: 82, y: 25, width: 80, height: 40 },
      { id: "c", x: 200, y: 18, width: 50, height: 40 },
    ];

    const initialAnalysis = analyzeSmartSelection(messyRow);
    expect(initialAnalysis.pattern).toBe("row");
    expect(initialAnalysis.uniformGapX).toBeNull();
    expect(initialAnalysis.gapHandles).toHaveLength(2);
    expect(initialAnalysis.swapHandles).toHaveLength(3);

    // 원클릭 Tidy Up (gapX = 20)
    const tidied = tidySmartSelection(messyRow, { gapX: 20 });
    expect(tidied.map((i) => i.x)).toEqual([10, 90, 190]);
    expect(analyzeSmartSelection(tidied).uniformGapX).toBe(20);

    // 간격 드래그 바: 20 -> 36px
    const scrubbed = scrubSmartSelectionGap(tidied, "x", 36);
    expect(scrubbed.map((i) => i.x)).toEqual([10, 106, 222]);
    expect(analyzeSmartSelection(scrubbed).uniformGapX).toBe(36);

    // 슬롯 스왑: a(폭60) <-> c(폭50) 자리 교체 후 겹침 없이 재정렬
    const swapped = swapSmartSelectionSlots(scrubbed, "a", "c");
    expect(swapped.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(swapped[0]!.x).toBe(10);
    expect(swapped[1]!.x).toBe(96); // 10 + 50 + 36
    expect(swapped[2]!.x).toBe(212); // 96 + 80 + 36
  });
});
