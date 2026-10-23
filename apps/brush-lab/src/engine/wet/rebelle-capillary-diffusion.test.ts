import { describe, expect, it } from "vitest";

import {
  computeGranulationFactor,
  createCapillaryWetGrid,
  depositWetPigmentDab,
  stepCapillaryDiffusion,
} from "./rebelle-capillary-diffusion";

describe("rebelle-capillary-diffusion (클린룸 내재화 모세관 수채 확산 엔진)", () => {
  it("초기 수채 격자를 결정론적 종이 높이맵과 함께 생성한다", () => {
    const gridA = createCapillaryWetGrid(16, 16);
    const gridB = createCapillaryWetGrid(16, 16);
    expect(gridA.width).toBe(16);
    expect(gridA.height).toBe(16);
    expect(gridA.paperHeight).toEqual(gridB.paperHeight);
  });

  it("과립화 계수는 종이 골짜기(낮은 높이)에서 봉우리보다 더 높다", () => {
    const valley = computeGranulationFactor(0.1, 0.8);
    const peak = computeGranulationFactor(0.9, 0.8);
    expect(valley).toBeGreaterThan(peak);
  });

  it("수분과 안료를 붓고 확산 스텝을 진행하면 주변 셀로 수분과 안료가 퍼지고 증발한다", () => {
    let grid = createCapillaryWetGrid(15, 15);
    depositWetPigmentDab(grid, 7, 7, 2.5, 0.9, 0.8, [0.1, 0.4, 0.9]);

    const centerIdx = 7 * 15 + 7;
    const edgeIdx = 7 * 15 + 10;
    expect(grid.wetness[centerIdx]).toBeGreaterThan(0.8);
    expect(grid.wetness[edgeIdx]).toBe(0);

    for (let i = 0; i < 6; i += 1) {
      grid = stepCapillaryDiffusion(grid, {
        diffusionRate: 0.2,
        evaporationRate: 0.03,
        fringeStrength: 0.4,
      });
    }

    // 중심 수분은 확산·증발로 감소하고 외곽 인접 셀로 수분이 퍼진다
    expect(grid.wetness[centerIdx]).toBeLessThan(0.9);
    expect(grid.wetness[7 * 15 + 9]).toBeGreaterThan(0);
  });

  it("노란색과 파란색 습식 안료가 만나면 Kubelka-Munk K/S 혼합으로 녹색 계열이 형성된다", () => {
    let grid = createCapillaryWetGrid(11, 11);
    depositWetPigmentDab(grid, 4, 5, 2.5, 0.95, 0.85, [0.95, 0.88, 0.08]); // 노랑
    depositWetPigmentDab(grid, 6, 5, 2.5, 0.95, 0.85, [0.06, 0.24, 0.88]); // 파랑

    grid = stepCapillaryDiffusion(grid, { diffusionRate: 0.22 });
    const midIdx = (5 * 11 + 5) * 3;
    const r = grid.pigmentRgb[midIdx] ?? 0;
    const g = grid.pigmentRgb[midIdx + 1] ?? 0;
    const b = grid.pigmentRgb[midIdx + 2] ?? 0;

    expect(g).toBeGreaterThan(r * 0.65);
    expect(g).toBeGreaterThan(b * 0.55);
  });
});
