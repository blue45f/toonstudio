import { describe, expect, it } from "vitest";

import {
  advanceStudioWetPaperRasterJob,
  compositeStudioWetPaperRaster,
  createStudioWetPaperRasterJob,
  parseStudioWetPaperPigmentColor,
  STUDIO_WET_PAPER_RASTER_LIMITS,
  studioWetPaperOverWhite,
  studioWetPaperRasterScale,
} from "./studio-wet-paper-composite";
import { STUDIO_WET_PAPER_BAKE_PROGRAMS, STUDIO_WET_PAPER_BAKE_VERSION } from "./studio-wet-paper-programs";

import type { StudioWetPaperBakeResult } from "./studio-wet-paper-solver";

/** 균일 밀도 D의 합성 입력(종이 결 0 — Beer–Lambert만 본다). */
function uniformResult(density: number, options: { covered?: boolean; grain?: number } = {}): StudioWetPaperBakeResult {
  const width = 6;
  const height = 4;
  const program = STUDIO_WET_PAPER_BAKE_PROGRAMS["curtis-watercolor-backrun"];
  return {
    version: STUDIO_WET_PAPER_BAKE_VERSION,
    programId: "curtis-watercolor-backrun",
    width,
    height,
    originXPx: 10,
    originYPx: 20,
    cellPx: 2.5,
    density: new Float32Array(width * height).fill(density),
    coverage: new Uint8Array(width * height).fill(options.covered === false ? 0 : 1),
    sheet: program.sheet,
    grainDetail: options.grain ?? 0,
    referenceDensity: program.referenceDensity,
    steps: program.steps,
    gridWidth: width,
    gridHeight: height,
    ledger: { waterIn: 0, waterEvaporated: 0, waterRemaining: 0, pigmentIn: 0, pigmentOut: 0 },
  };
}

function centrePixel(result: StudioWetPaperBakeResult, color: string): readonly [number, number, number] {
  const raster = compositeStudioWetPaperRaster(result, color);
  if (!raster) throw new Error("no raster");
  const index = Math.floor(raster.height / 2) * raster.width + Math.floor(raster.width / 2);
  return studioWetPaperOverWhite(raster.rgba, index);
}

describe("wet-paper Beer–Lambert composite", () => {
  it("shows exactly the stroke colour over white at the reference density", () => {
    const reference = STUDIO_WET_PAPER_BAKE_PROGRAMS["curtis-watercolor-backrun"].referenceDensity;
    const [red, green, blue] = centrePixel(uniformResult(reference), "#1f6feb");
    expect(red * 255).toBeCloseTo(0x1f, -0.5);
    expect(green * 255).toBeCloseTo(0x6f, -0.5);
    expect(blue * 255).toBeCloseTo(0xeb, -0.5);
  });

  it("follows transmittance T = C^(D / D_ref): double density squares the colour", () => {
    const reference = STUDIO_WET_PAPER_BAKE_PROGRAMS["curtis-watercolor-backrun"].referenceDensity;
    const color = { red: 0x80 / 255, green: 0xc0 / 255, blue: 0xe0 / 255 };
    for (const factor of [0.5, 2]) {
      const pixel = centrePixel(uniformResult(reference * factor), "#80c0e0");
      expect(pixel[0]).toBeCloseTo(color.red ** factor, 2);
      expect(pixel[1]).toBeCloseTo(color.green ** factor, 2);
      expect(pixel[2]).toBeCloseTo(color.blue ** factor, 2);
    }
  });

  it("leaves uncovered paper transparent and refuses unparseable colours", () => {
    const raster = compositeStudioWetPaperRaster(uniformResult(1, { covered: false }), "#000000");
    expect(raster).not.toBeNull();
    expect(raster?.rgba.every((value) => value === 0)).toBe(true);
    expect(compositeStudioWetPaperRaster(uniformResult(1), "not-a-colour")).toBeNull();
    expect(parseStudioWetPaperPigmentColor("rgb(255, 0, 0)")).toEqual({ red: 1, green: 0, blue: 0 });
  });

  it("produces the same bytes whether rows are composited at once or sliced", () => {
    const result = uniformResult(0.7, { grain: 0.4 });
    const whole = compositeStudioWetPaperRaster(result, "#334455");
    const job = createStudioWetPaperRasterJob(result, "#334455");
    expect(whole && job).toBeTruthy();
    if (!whole || !job) return;
    let rounds = 0;
    while (!advanceStudioWetPaperRasterJob(job, 1)) rounds += 1;
    expect(rounds).toBe(job.raster.height - 1);
    expect(Buffer.from(job.raster.rgba)).toEqual(Buffer.from(whole.rgba));
    // 종이 결은 문서 좌표 고정이라 래스터 안에서 밀도를 흔든다(입자 침전 레인의 고운 결).
    const alphas = new Set<number>();
    for (let index = 3; index < whole.rgba.length; index += 4) alphas.add(whole.rgba[index] ?? 0);
    expect(alphas.size).toBeGreaterThan(1);
  });

  it("keeps the raster within its pixel cap for very large bakes", () => {
    const big = { ...uniformResult(0.5), width: 512, height: 512, cellPx: 12 };
    const scale = studioWetPaperRasterScale(big);
    expect(big.width * scale * big.height * scale).toBeLessThanOrEqual(STUDIO_WET_PAPER_RASTER_LIMITS.maxPixels);
    expect(scale).toBeGreaterThanOrEqual(1);
    const fine = { ...uniformResult(0.5), cellPx: 5 };
    // 굵은 셀은 문서 약 1.25 px 픽셀로 올려 합성한다.
    expect(fine.cellPx / studioWetPaperRasterScale(fine)).toBeCloseTo(1.25, 5);
  });
});
