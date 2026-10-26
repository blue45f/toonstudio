import { describe, expect, it } from "vitest";

import {
  CSP_SHARPYUV_MATRIX_SPECS,
  applyCspAiliaActivationTensor,
  computeCspAiliaHanukeEnclosedGapMap,
  convertCspRgbaToSharpYuv420,
  factorizeCspQdldlMatrix,
  solveCspConstrainedMeshWarpGridOsqp,
  solveCspOsqpQuadraticProgram,
  solveCspQdldlSystem,
} from "../studio-csp-osqp-sharpyuv-ailia-engine";

describe("studio-csp-osqp-sharpyuv-ailia-engine", () => {
  it("factorizes and solves quasi-definite KKT systems via QDLDL (libosqp.dylib)", () => {
    // 3x3 symmetric quasi-definite matrix (2 positive, 1 negative pivot)
    const K = new Float64Array([
      4, 1, 2,
      1, 3, -1,
      2, -1, -2,
    ]);
    const rhs = new Float64Array([9, 4, -3]);
    const factor = factorizeCspQdldlMatrix(3, K);
    expect(factor.positiveEigenCount).toBe(2);

    const sol = solveCspQdldlSystem(factor, rhs);
    // Verify K * sol == rhs
    for (let i = 0; i < 3; i += 1) {
      const lhs = K[i * 3]! * sol[0]! + K[i * 3 + 1]! * sol[1]! + K[i * 3 + 2]! * sol[2]!;
      expect(lhs).toBeCloseTo(rhs[i]!, 5);
    }
  });

  it("solves box-constrained quadratic programs and mesh warp grids via OSQP ADMM (libosqp.dylib)", () => {
    // Minimize 0.5 * (2*x0^2 + 2*x1^2) - 6*x0 - 4*x1  (unconstrained optimum: [3, 2])
    // Subject to 0 <= x0 <= 2, 0 <= x1 <= 1.5  (constrained optimum: [2, 1.5])
    const P = new Float64Array([2, 0, 0, 2]);
    const q = new Float64Array([-6, -4]);
    const A = new Float64Array([1, 0, 0, 1]);
    const l = new Float64Array([0, 0]);
    const u = new Float64Array([2, 1.5]);

    const res = solveCspOsqpQuadraticProgram({
      nVars: 2,
      mConstraints: 2,
      P,
      q,
      A,
      l,
      u,
      rho: 1.0,
      maxIter: 100,
    });
    expect(res.status).toBe("solved");
    expect(res.x[0]).toBeCloseTo(2.0, 3);
    expect(res.x[1]).toBeCloseTo(1.5, 3);

    // 3x3 mesh grid warp with top-left pinned at (0,0) and bottom-right dragged to (120, 140)
    const rest: { x: number; y: number }[] = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        rest.push({ x: c * 50, y: r * 50 });
      }
    }
    const warped = solveCspConstrainedMeshWarpGridOsqp({
      cols: 3,
      rows: 3,
      restPositionsXY: rest,
      pinnedVertices: [
        { vertexIndex: 0, targetX: 0, targetY: 0 },
        { vertexIndex: 8, targetX: 120, targetY: 140 },
      ],
    });
    expect(warped.deformedPositionsXY[0]?.x).toBeCloseTo(0, 2);
    expect(warped.deformedPositionsXY[8]?.x).toBeCloseTo(120, 2);
    expect(warped.deformedPositionsXY[8]?.y).toBeCloseTo(140, 2);
    // Center vertex should smoothly interpolate
    expect(warped.deformedPositionsXY[4]?.x).toBeGreaterThan(50);
    expect(warped.deformedPositionsXY[4]?.y).toBeGreaterThan(50);
  });

  it("converts RGBA line-art buffers to SharpYUV 4:2:0 across all 5 matrix presets (libsharpyuv.dylib)", () => {
    expect(Object.keys(CSP_SHARPYUV_MATRIX_SPECS)).toEqual([
      "webp",
      "rec601Limited",
      "rec601Full",
      "rec709Limited",
      "rec709Full",
    ]);

    // 4x2 buffer with high-contrast red-on-black comic line art
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, 10, 10, 10, 255, 255, 255, 255, 255, 0, 0, 255, 255,
      10, 10, 10, 255, 255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 255, 255,
    ]);
    const yuv = convertCspRgbaToSharpYuv420({
      width: 4,
      height: 2,
      rgbaBytes: rgba,
      matrixId: "webp",
      iterations: 3,
    });
    expect(yuv.yPlane.length).toBe(8);
    expect(yuv.uPlane.length).toBe(2);
    expect(yuv.vPlane.length).toBe(2);
    expect(yuv.vPlane[0]).toBeGreaterThan(128);
  });

  it("evaluates ailia neural activations and detects enclosed paint gaps (libailia.dylib)", () => {
    const src = new Float32Array([-2.0, 0.0, 2.0]);
    const sig = applyCspAiliaActivationTensor(src, "Sigmoid");
    expect(sig[1]).toBeCloseTo(0.5, 5);

    const hswish = applyCspAiliaActivationTensor(src, "HardSwish");
    expect(hswish[1]).toBeCloseTo(0.0, 5);
    expect(hswish[2]).toBeCloseTo(2.0 * (2.0 / 6 + 0.5), 4);

    const prelu = applyCspAiliaActivationTensor(src, "ParametricRelu", 0.25);
    expect(prelu[0]).toBeCloseTo(-0.5, 5);
    expect(prelu[2]).toBeCloseTo(2.0, 5);

    // 5x5 canvas: row 1 is line art, row 3..4 is fill, leaving row 2 as a 1px unpainted gap (hanuke)
    const lineAlpha = new Uint8Array(25);
    const fillAlpha = new Uint8Array(25);
    for (let x = 0; x < 5; x += 1) {
      lineAlpha[1 * 5 + x] = 255;
      fillAlpha[3 * 5 + x] = 255;
      fillAlpha[4 * 5 + x] = 255;
    }
    const gap = computeCspAiliaHanukeEnclosedGapMap({
      width: 5,
      height: 5,
      lineAlphaBytes: lineAlpha,
      fillAlphaBytes: fillAlpha,
      maxGapRadiusPx: 1,
    });
    expect(gap.detectedGapPixelCount).toBe(5);
    expect(gap.gapMaskBytes[2 * 5 + 2]).toBe(255);
  });
});
