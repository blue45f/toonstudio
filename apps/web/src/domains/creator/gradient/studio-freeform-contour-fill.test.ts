import { describe, expect, it } from "vitest";

import {
  computeExactEuclideanDistanceTransform2D,
  evaluateContourTransferCurve,
  renderContourFill,
  renderFreeformGradient,
} from "./studio-freeform-contour-fill";

describe("studio-freeform-contour-fill", () => {
  it("Felzenszwalb 2D 유클리드 거리 변환이 전수 탐색 기준값과 소수점 오차 없이 정확히 일치한다", () => {
    const w = 13;
    const h = 11;
    const seeds = [
      { x: 2, y: 3 },
      { x: 10, y: 8 },
      { x: 6, y: 1 },
    ] as const;
    const mask = new Uint8Array(w * h);
    for (const s of seeds) mask[s.y * w + s.x] = 255;

    const edt = computeExactEuclideanDistanceTransform2D(mask, w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let bruteMin = Number.POSITIVE_INFINITY;
        for (const s of seeds) {
          bruteMin = Math.min(bruteMin, Math.hypot(x - s.x, y - s.y));
        }
        expect(edt[y * w + x]).toBeCloseTo(bruteMin, 9);
      }
    }
  });

  it("renderContourFill이 dA / (dA + dB) 거리비와 사용자 전이 곡선으로 등고선 색상을 혼합한다", () => {
    const w = 21;
    const h = 5;
    const maskA = new Uint8Array(w * h);
    const maskB = new Uint8Array(w * h);
    // 왼쪽 끝 열(x=0) = 경계 A(빨강), 오른쪽 끝 열(x=20) = 경계 B(파랑)
    for (let y = 0; y < h; y++) {
      maskA[y * w + 0] = 255;
      maskB[y * w + 20] = 255;
    }

    const linearRes = renderContourFill({
      width: w,
      height: h,
      boundaryAMask: maskA,
      boundaryBMask: maskB,
      colorA: [255, 0, 0, 255],
      colorB: [0, 0, 255, 255],
      transferCurve: "linear",
    });

    // x=0 은 순수 빨강, 정중앙 x=10 은 dA=10, dB=10 이므로 50:50 보라색, x=20 은 순수 파랑
    expect(linearRes.imageData.data[(2 * w + 0) * 4]).toBe(255);
    expect(linearRes.imageData.data[(2 * w + 0) * 4 + 2]).toBe(0);
    expect(linearRes.imageData.data[(2 * w + 10) * 4]).toBe(128);
    expect(linearRes.imageData.data[(2 * w + 10) * 4 + 2]).toBe(128);
    expect(linearRes.imageData.data[(2 * w + 20) * 4]).toBe(0);
    expect(linearRes.imageData.data[(2 * w + 20) * 4 + 2]).toBe(255);

    // 사용자 정의 꺾은선 전이 곡선 검증
    const customT = evaluateContourTransferCurve(0.25, [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.8 },
      { x: 1, y: 1 },
    ]);
    expect(customT).toBeCloseTo(0.8, 6);
  });

  it("renderFreeformGradient가 시드 점·색선에서 Shepard 및 Harmonic 보간을 마스크 내부에만 수행한다", () => {
    const w = 16;
    const h = 16;
    const regionMask = new Uint8Array(w * h);
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) regionMask[y * w + x] = 255;
    }

    const shepard = renderFreeformGradient({
      width: w,
      height: h,
      regionMask,
      method: "shepard",
      seeds: [
        { kind: "point", x: 3.5, y: 3.5, color: [255, 20, 20, 255] },
        {
          kind: "stroke",
          points: [
            { x: 12.5, y: 3.5 },
            { x: 12.5, y: 12.5 },
          ],
          color: [20, 80, 255, 255],
        },
      ],
    });

    const harmonic = renderFreeformGradient({
      width: w,
      height: h,
      regionMask,
      method: "harmonic",
      harmonicIterations: 30,
      seeds: [
        { kind: "point", x: 3.5, y: 3.5, color: [255, 20, 20, 255] },
        { kind: "point", x: 12.5, y: 12.5, color: [20, 80, 255, 255] },
      ],
    });

    // 시드 근방 색 우세 확인
    expect(shepard.imageData.data[(3 * w + 3) * 4]!).toBeGreaterThan(220);
    expect(shepard.imageData.data[(8 * w + 12) * 4 + 2]!).toBeGreaterThan(220);
    // 마스크 바깥(0, 0)은 미채색 유지
    expect(shepard.imageData.data[3]).toBe(0);

    // 조화 보간 중앙부(8, 8)는 두 시드 색의 부드러운 혼합값
    const midR = harmonic.imageData.data[(8 * w + 8) * 4]!;
    const midB = harmonic.imageData.data[(8 * w + 8) * 4 + 2]!;
    expect(midR).toBeGreaterThan(60);
    expect(midB).toBeGreaterThan(60);
  });
});
