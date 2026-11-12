import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { isPng } from "./png-encoder";
import { QUAD_SHEET_PANEL_SPECS, clampQuadSheetCellSize, exportQuadReferenceSheetPng, stitchGrid2x2Rasters } from "./quad-reference-sheet";

import type { CapturedRaster } from "../contracts";

function solidRaster(width: number, height: number, rgba: readonly [number, number, number, number]): CapturedRaster {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = rgba[0];
    buf[i + 1] = rgba[1];
    buf[i + 2] = rgba[2];
    buf[i + 3] = rgba[3];
  }
  return { width, height, rgba: buf };
}

describe("quad-reference-sheet (2×2 4컷 종합 캐릭터 설정시트)", () => {
  it("stitchGrid2x2Rasters가 좌상·우상·좌하·우하 셀을 정확한 2×2 격자 좌표에 배치한다", () => {
    const tl = solidRaster(2, 2, [255, 0, 0, 255]);
    const tr = solidRaster(2, 2, [0, 255, 0, 255]);
    const bl = solidRaster(2, 2, [0, 0, 255, 255]);
    const br = solidRaster(2, 2, [255, 255, 0, 255]);

    const out = stitchGrid2x2Rasters([tl, tr, bl, br]);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);

    const px = (x: number, y: number) => Array.from(out.rgba.subarray((y * 4 + x) * 4, (y * 4 + x + 1) * 4));
    expect(px(0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(3, 0)).toEqual([0, 255, 0, 255]);
    expect(px(0, 3)).toEqual([0, 0, 255, 255]);
    expect(px(3, 3)).toEqual([255, 255, 0, 255]);
  });

  it("clampQuadSheetCellSize가 총 해상도 4096px 이하가 되도록 셀 크기를 2048px 이하로 제한한다", () => {
    expect(clampQuadSheetCellSize(3000, 4096)).toEqual({ cellWidth: 2048, cellHeight: 2048 });
    expect(clampQuadSheetCellSize(4, 8)).toEqual({ cellWidth: 16, cellHeight: 16 });
  });

  it("exportQuadReferenceSheetPng가 전신 0°·전신 35°·상반신·얼굴 클로즈업 4컷을 캡처해 -quad-sheet.png를 반환한다", async () => {
    const engine = createMockEngine();
    const outcome = await exportQuadReferenceSheetPng(
      engine,
      { cellWidth: 32, cellHeight: 40, settleSteps: 3 },
      { now: () => 500 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.receipt.fileName).toBe("character-mock-64x80-quad-sheet.png");
    expect(outcome.receipt.width).toBe(64);
    expect(outcome.receipt.height).toBe(80);
    expect(isPng(outcome.bytes)).toBe(true);

    const renderCalls = engine.calls.filter((call) => call.method === "renderPasses");
    expect(renderCalls).toHaveLength(QUAD_SHEET_PANEL_SPECS.length);
    const modes = renderCalls.map((c) => (c.args[0] as { camera?: { mode: string } }).camera?.mode);
    expect(modes).toEqual(["full-body", "full-body", "bust", "face"]);
  });

  it("최대 PNG 치수(4096px)를 초과하는 셀 크기는 export-quad-sheet-size로 거부한다", async () => {
    const engine = createMockEngine();
    const outcome = await exportQuadReferenceSheetPng(engine, { cellWidth: 2500, cellHeight: 512 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.code).toBe("export-quad-sheet-size");
  });
});
