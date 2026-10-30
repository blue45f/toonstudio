import { describe, expect, it } from "vitest";

import { planCausalWatercolorBrushDabs } from "../../studio-causal-watercolor-brush";

import { compositeStudioWetPaperRaster, STUDIO_WET_PAPER_RASTER_LIMITS } from "./studio-wet-paper-composite";
import {
  normalizeStudioWetPaperBakeSettings,
  STUDIO_WET_PAPER_BAKE_LIMITS,
  STUDIO_WET_PAPER_BAKE_PROGRAM_IDS,
} from "./studio-wet-paper-programs";
import { advanceWetPaperSolve, createWetPaperSolve, finishWetPaperSolve } from "./studio-wet-paper-solver";
import { STUDIO_WET_PAPER_GRID_LIMITS } from "./studio-wet-paper-state";

/**
 * 가장 큰 격자의 실행 시간 상한(관대한 예산 — 시간을 재므로 vitest.perf-budget-files.mjs의 조용한 통과에서 돈다).
 *
 * 최악 입력: 1000 px 사각형을 40번 왕복하는 굵은(60 px) 낙서 — 획 범위·활성 셀 추정이 격자 상한에 걸려 셀 크기가
 * 커지는 경우다. 상한(셀 수·변·스텝 수)이 실행 시간의 근거이므로, 여기서는 상한이 지켜지는지와 한 베이크가
 * 예산 안에 끝나는지만 본다. 2026-10-29 측정(4코어 공유 · 부하 ≈1.5): 레인별 0.2–0.8 s.
 */
const WORST_CASE_BAKE_BUDGET_MS = 6_000;

function scribblePoints(): number[] {
  const points: number[] = [];
  for (let index = 0; index <= 1600; index += 1) {
    const t = index / 1600;
    points.push(100 + 1000 * (0.5 + 0.5 * Math.sin(t * 40 * Math.PI)), 100 + 1000 * t);
  }
  return points;
}

describe("wet-paper settled bake runtime budget (largest grid)", () => {
  it("bakes the capped worst-case scribble within a generous budget for every lane program", { timeout: 120_000 }, () => {
    const dabs = planCausalWatercolorBrushDabs(
      { points: scribblePoints(), baseWidth: 60, spacing: 60 * 0.14, seed: 9, maxDabs: 16_384 },
      true,
    ).map((dab) => dab.role === "core"
      ? { ...dab, radius: dab.radius * 0.82, opacity: Math.min(1, dab.opacity * 1.75) }
      : { ...dab, radius: dab.radius * 1.6, opacity: Math.min(1, dab.opacity * 0.44) });
    const report: string[] = [];
    for (const programId of STUDIO_WET_PAPER_BAKE_PROGRAM_IDS) {
      const settings = normalizeStudioWetPaperBakeSettings({ seed: 9, phase: "settled", programId });
      if (!settings) throw new Error(programId);
      const started = performance.now();
      const solve = createWetPaperSolve(dabs, settings);
      expect(solve, programId).not.toBeNull();
      if (!solve) continue;
      const { grid } = solve.state;
      expect(grid.cells, programId).toBeLessThanOrEqual(STUDIO_WET_PAPER_GRID_LIMITS.maxCells);
      expect(Math.max(grid.width, grid.height), programId).toBeLessThanOrEqual(STUDIO_WET_PAPER_GRID_LIMITS.maxSide);
      expect(solve.steps, programId).toBeLessThanOrEqual(STUDIO_WET_PAPER_BAKE_LIMITS.maxSteps);
      let maxProcessedCells = 0;
      while (!advanceWetPaperSolve(solve, 1)) {
        maxProcessedCells = Math.max(maxProcessedCells, solve.state.processCount * 16);
      }
      const result = finishWetPaperSolve(solve);
      expect(result, programId).not.toBeNull();
      if (!result) continue;
      const raster = compositeStudioWetPaperRaster(result, "#1f6feb");
      const elapsed = performance.now() - started;
      expect(maxProcessedCells, programId).toBeLessThanOrEqual(grid.cells);
      expect(raster && raster.width * raster.height, programId).toBeLessThanOrEqual(STUDIO_WET_PAPER_RASTER_LIMITS.maxPixels);
      report.push(`${programId} ${elapsed.toFixed(0)}ms grid ${grid.width}x${grid.height} cell ${grid.cellPx.toFixed(2)}px`);
      expect(elapsed, report.join(" · ")).toBeLessThan(WORST_CASE_BAKE_BUDGET_MS);
    }
  });
});
