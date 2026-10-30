/**
 * 젖은 종이 굽기의 젖음 전선 시험(실브라우저 확인에서 먹 번짐 후광 가장자리가 셀 크기 계단으로 보인 결함 회귀).
 *
 * - 솔버는 덮임(0/1)을 이항 필터로 편 전선 장을 함께 내고, 합성은 그 0.5 등고선을 전선으로 쓴다. 비스듬한 전선이
 *   셀 계단 대신 한 픽셀 안쪽의 곧은 선을 따른다(예전에는 셀 폭만큼 계단졌다).
 * - 전선에서 먼 안쪽 픽셀과 전선 장 없는 입력의 바이트는 그대로다.
 */
import { describe, expect, it } from "vitest";

import { compositeStudioWetPaperRaster, studioWetPaperRasterScale } from "./studio-wet-paper-composite";
import {
  normalizeStudioWetPaperBakeSettings,
  STUDIO_WET_PAPER_BAKE_PROGRAMS,
  STUDIO_WET_PAPER_BAKE_VERSION,
} from "./studio-wet-paper-programs";
import { smoothStudioWetPaperWetFront, solveStudioWetPaperBakeUncached } from "./studio-wet-paper-solver";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";
import type { StudioWetPaperBakeResult } from "./studio-wet-paper-solver";

const SIZE = 24;

/** 기울기 1/4 로 완만하게 내려가는 전선 아래가 덮인 반평면(전선이 네 셀마다 한 칸씩 계단진다). 밀도는 기준값. */
function diagonalResult(withEdge: boolean): StudioWetPaperBakeResult {
  const program = STUDIO_WET_PAPER_BAKE_PROGRAMS["curtis-watercolor-backrun"];
  const coverage = new Uint8Array(SIZE * SIZE);
  const density = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (y + 0.5 < 8 + (x + 0.5) / 4) continue;
      coverage[y * SIZE + x] = 1;
      density[y * SIZE + x] = program.referenceDensity;
    }
  }
  return {
    version: STUDIO_WET_PAPER_BAKE_VERSION,
    programId: "curtis-watercolor-backrun",
    width: SIZE,
    height: SIZE,
    originXPx: 0,
    originYPx: 0,
    cellPx: 4,
    density,
    coverage,
    ...(withEdge ? { edge: smoothStudioWetPaperWetFront(coverage, SIZE, SIZE) } : {}),
    sheet: program.sheet,
    grainDetail: 0,
    referenceDensity: program.referenceDensity,
    steps: program.steps,
    gridWidth: SIZE,
    gridHeight: SIZE,
    ledger: { waterIn: 0, waterEvaporated: 0, waterRemaining: 0, pigmentIn: 0, pigmentOut: 0 },
  };
}

/** 가운데 열들에서 위에서 내려오며 알파가 절반을 넘는 첫 y(픽셀 안 선형 보간)를 열마다 구한다. */
function frontPositions(result: StudioWetPaperBakeResult): { readonly scale: number; readonly fronts: number[] } {
  const raster = compositeStudioWetPaperRaster(result, "#1f6feb");
  if (!raster) throw new Error("no raster");
  const half = raster.rgba[((raster.height - 2) * raster.width + Math.floor(raster.width / 2)) * 4 + 3]! / 2;
  const fronts: number[] = [];
  for (let x = Math.floor(raster.width / 4); x < Math.floor((raster.width * 3) / 4); x += 1) {
    for (let y = 1; y < raster.height; y += 1) {
      const above = raster.rgba[((y - 1) * raster.width + x) * 4 + 3]!;
      const here = raster.rgba[(y * raster.width + x) * 4 + 3]!;
      if (above < half && here >= half) {
        fronts.push(y - (here - half) / Math.max(1, here - above));
        break;
      }
    }
  }
  return { scale: studioWetPaperRasterScale(result), fronts };
}

/** 행 번호에 대한 최소제곱 직선에서 가장 멀리 벗어난 거리(픽셀). */
function maxLineDeviation(values: readonly number[]): number {
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  const slope = numerator / denominator;
  return Math.max(...values.map((value, index) => Math.abs(value - (meanY + slope * (index - meanX)))));
}

describe("젖은 종이 굽기 · 젖음 전선", () => {
  it("비스듬한 전선이 셀 계단 대신 곧은 선을 따른다", () => {
    const stair = frontPositions(diagonalResult(false));
    const smooth = frontPositions(diagonalResult(true));
    expect(stair.scale).toBeGreaterThanOrEqual(3);
    expect(smooth.fronts.length).toBe(stair.fronts.length);
    // 이진 덮임 전선은 네 셀마다 한 셀(scale 픽셀)씩 계단진다(실측 약 1.3 px 벗어남).
    expect(maxLineDeviation(stair.fronts)).toBeGreaterThan(stair.scale / 4);
    // 펴진 전선은 곧은 선에서 픽셀 안쪽으로만 벗어난다(실측 약 0.47 px).
    expect(maxLineDeviation(smooth.fronts)).toBeLessThan(0.75);
  });

  it("전선에서 먼 안쪽과 전선 장 없는 입력은 그대로다", () => {
    const plain = compositeStudioWetPaperRaster(diagonalResult(false), "#1f6feb")!;
    const smooth = compositeStudioWetPaperRaster(diagonalResult(true), "#1f6feb")!;
    const scale = studioWetPaperRasterScale(diagonalResult(true));
    // 셀 (12, 21) 가운데는 전선(y ≈ 11)에서 열 셀 가까이 아래다.
    const inside = ((21 * scale + 1) * plain.width + 12 * scale + 1) * 4;
    expect([...smooth.rgba.subarray(inside, inside + 4)]).toEqual([...plain.rgba.subarray(inside, inside + 4)]);
    expect(plain.rgba[inside + 3]).toBeGreaterThan(0);
  });

  it("솔버가 덮임과 같은 크기의 결정적 전선 장을 낸다", () => {
    const dabs: WetPaperInputDab[] = Array.from({ length: 40 }, (_, index) => ({
      x: 30 + index * 4,
      y: 40 + index * 2.5,
      radius: 9,
      opacity: 0.6,
      role: "core" as const,
    }));
    const settings = normalizeStudioWetPaperBakeSettings({ seed: 11, phase: "settled", programId: "moxi-sumi-dispersion" })!;
    const first = solveStudioWetPaperBakeUncached(dabs, settings)!;
    const second = solveStudioWetPaperBakeUncached(dabs, settings)!;
    expect(first.edge).toBeDefined();
    expect(first.edge!.length).toBe(first.coverage.length);
    expect(Buffer.from(first.edge!)).toEqual(Buffer.from(second.edge!));
    // 덮인 셀 대부분은 전선 장 절반 위, 덮이지 않은 셀 대부분은 아래다(다른 곳은 전선 둘레 한 셀뿐).
    let agree = 0;
    first.coverage.forEach((covered, index) => {
      if ((covered === 1) === (first.edge![index]! >= 128)) agree += 1;
    });
    expect(agree / first.coverage.length).toBeGreaterThan(0.9);
  });
});
