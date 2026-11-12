import { describe, expect, it } from "vitest";

import { failVisible } from "../contracts";
import { createMockEngine } from "../testing/mock-engine";

import { decodePng, isPng } from "./png-encoder";
import {
  QUAD_SHEET_PANEL_SPECS,
  buildQuadSheetPanels,
  clampQuadSheetCellSize,
  exportQuadReferenceSheetPng,
  stitchGrid2x2Rasters,
} from "./quad-reference-sheet";

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
  it("stitchGrid2x2Rasters가 좌상·우상·좌하·우하 셀을 정확한 격자에 배치하고 투명 배경(alpha=0)의 잔여 RGB를 straight-alpha [0,0,0,0]으로 정규화한다", () => {
    const tl = solidRaster(2, 2, [255, 0, 0, 255]);
    const tr = solidRaster(2, 2, [120, 80, 40, 0]); // alpha=0 이지만 더러운 RGB 바이트가 섞인 경우
    const bl = solidRaster(2, 2, [0, 0, 255, 255]);
    const br = solidRaster(2, 2, [255, 255, 0, 255]);

    const out = stitchGrid2x2Rasters([tl, tr, bl, br]);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);

    const px = (x: number, y: number) => Array.from(out.rgba.subarray((y * 4 + x) * 4, (y * 4 + x + 1) * 4));
    expect(px(0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(3, 0)).toEqual([0, 0, 0, 0]); // 투명 배경 정규화 확인
    expect(px(0, 3)).toEqual([0, 0, 255, 255]);
    expect(px(3, 3)).toEqual([255, 255, 0, 255]);
  });

  it("clampQuadSheetCellSize가 2048px 상한 초과 시 종횡비(2:3, 2:1 등)를 왜곡 없이 비례 축소하고 축소 여부를 표시한다", () => {
    // 2:3 웹툰 세로컷 비율 보존 (1600:2400 = 0.6667 → 1365:2048 = 0.6665)
    const vertical = clampQuadSheetCellSize(1600, 2400);
    expect(vertical).toEqual({ cellWidth: 1365, cellHeight: 2048, wasScaledDown: true });
    expect(Math.abs(vertical.cellWidth / vertical.cellHeight - 1600 / 2400)).toBeLessThan(0.001);

    // 2:1 가로 와이드 비율 보존 (4096:2048 → 2048:1024)
    expect(clampQuadSheetCellSize(4096, 2048)).toEqual({ cellWidth: 2048, cellHeight: 1024, wasScaledDown: true });

    // 3000:4096 세로 비율 보존 (→ 1500:2048)
    expect(clampQuadSheetCellSize(3000, 4096)).toEqual({ cellWidth: 1500, cellHeight: 2048, wasScaledDown: true });

    // 상한 이내 해상도는 원본 유지 및 wasScaledDown=false
    expect(clampQuadSheetCellSize(800, 1200)).toEqual({ cellWidth: 800, cellHeight: 1200, wasScaledDown: false });
    expect(clampQuadSheetCellSize(4, 8)).toEqual({ cellWidth: 16, cellHeight: 16, wasScaledDown: false });
  });

  it("buildQuadSheetPanels가 전신·바스트·클로즈업 잘림 방지 distanceScale 여유를 부여하고 좁은/넓은 셀 비율에서 추가 여유를 확대한다", () => {
    const square = buildQuadSheetPanels(1024, 1024);
    expect(square[0].camera.distanceScale).toBeGreaterThanOrEqual(1.15);
    expect(square[1].camera.distanceScale).toBeGreaterThanOrEqual(1.18);
    expect(square[2].camera.distanceScale).toBeGreaterThanOrEqual(1.24);
    expect(square[3].camera.distanceScale).toBeGreaterThanOrEqual(1.28);

    const narrowPortrait = buildQuadSheetPanels(600, 1200);
    expect(narrowPortrait[0].camera.distanceScale).toBeGreaterThan(square[0].camera.distanceScale);
    expect(narrowPortrait[3].camera.distanceScale).toBeGreaterThan(square[3].camera.distanceScale);
  });

  it("exportQuadReferenceSheetPng가 투명 배경(transparentBackground=true) 4컷을 캡처해 직교 알파가 보존된 PNG를 반환한다", async () => {
    const engine = createMockEngine();
    const origRender = engine.renderPasses.bind(engine);
    engine.renderPasses = async (req) => {
      const res = await origRender(req);
      // 중앙 픽셀만 불투명하고 모서리는 투명(더러운 RGB 포함)한 래스터 생성
      const rgba = new Uint8ClampedArray(req.width * req.height * 4);
      rgba[0] = 99; // (0,0) alpha=0 + dirty R=99
      const mid = (Math.floor(req.height / 2) * req.width + Math.floor(req.width / 2)) * 4;
      rgba.set([220, 140, 110, 255], mid);
      return { ...res, passes: { lit: { width: req.width, height: req.height, rgba } } };
    };

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

    const decoded = await decodePng(outcome.bytes);
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(80);
    // 모서리 투명 배경 픽셀은 [0,0,0,0]이고 각 셀 중앙 캐릭터 픽셀은 불투명하다
    expect(Array.from(decoded.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    const tlCenter = (20 * 64 + 16) * 4;
    expect(Array.from(decoded.rgba.subarray(tlCenter, tlCenter + 4))).toEqual([220, 140, 110, 255]);

    const renderCalls = engine.calls.filter((call) => call.method === "renderPasses");
    expect(renderCalls).toHaveLength(QUAD_SHEET_PANEL_SPECS.length);
    for (const call of renderCalls) {
      const arg = call.args[0] as { transparentBackground?: boolean };
      expect(arg.transparentBackground).toBe(true);
    }
  });

  it("크기 초과·물리 settle 실패·해상도 불일치·lit 누락·손상 버퍼에서 각각 명확한 한글 실패 코드를 반환한다", async () => {
    const engine = createMockEngine();
    const overSize = await exportQuadReferenceSheetPng(engine, { cellWidth: 2500, cellHeight: 512 });
    expect(!overSize.ok && overSize.failure.code).toBe("export-quad-sheet-size");

    const settleFailEngine = createMockEngine();
    settleFailEngine.settle = async () => {
      throw failVisible("physics-exploded", "물리 시뮬레이션 발산");
    };
    const settleOut = await exportQuadReferenceSheetPng(settleFailEngine, { cellWidth: 32, cellHeight: 32, settleSteps: 5 });
    expect(!settleOut.ok && settleOut.failure.code).toBe("physics-exploded");

    const sizeMismatchEngine = createMockEngine();
    const baseRender = sizeMismatchEngine.renderPasses.bind(sizeMismatchEngine);
    sizeMismatchEngine.renderPasses = async (req) => {
      const res = await baseRender(req);
      return { ...res, width: 16, height: 16 };
    };
    const mismatchOut = await exportQuadReferenceSheetPng(sizeMismatchEngine, { cellWidth: 32, cellHeight: 32 });
    expect(!mismatchOut.ok && mismatchOut.failure.code).toBe("export-capture-size");

    const corruptEngine = createMockEngine();
    corruptEngine.renderPasses = async (req) => {
      const res = await baseRender(req);
      return { ...res, passes: { lit: { width: req.width, height: req.height, rgba: new Uint8ClampedArray(8) } } };
    };
    const corruptOut = await exportQuadReferenceSheetPng(corruptEngine, { cellWidth: 32, cellHeight: 32 });
    expect(!corruptOut.ok && corruptOut.failure.code).toBe("export-capture-corrupt");
  });
});
