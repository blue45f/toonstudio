import { describe, expect, it } from "vitest";

import {
  computeBodyLineMaskAlphas,
  computeShaperStrokeWidths,
  encodeRayEdgePolarPoint,
  evaluateDynLevinGregoryMidpoint,
  extrudeTriangularPrismStrokeTube,
  interpolateDabs,
  reprojectRayEdgePolarPoint,
  shortestUvDelta,
  spacingPx,
  subdivideDynLevinGregory4Point,
  uvDistancePx,
} from "./uv-stroke";

import type { BrushSettings } from "../contracts";

const BRUSH: BrushSettings = { radiusPx: 10, color: "#000000", opacity: 1, hardness: 1, spacing: 0.5 };
const SIZE = { width: 100, height: 100 };

describe("interpolateDabs", () => {
  it("spacing×반지름 픽셀 간격으로 dab을 놓고 from은 제외한다", () => {
    const result = interpolateDabs({ u: 0.1, v: 0.5, pressure: 0 }, { u: 0.5, v: 0.5, pressure: 1 }, BRUSH, SIZE, { wrap: false });
    expect(spacingPx(BRUSH)).toBe(5);
    expect(result.lengthPx).toBeCloseTo(40, 9);
    expect(result.dabs).toHaveLength(8);
    expect(result.dabs[0]?.u).toBeCloseTo(0.15, 9);
    expect(result.dabs[7]?.u).toBeCloseTo(0.5, 9);
    expect(result.carry).toBeCloseTo(0, 9);
    for (let i = 1; i < result.dabs.length; i += 1) {
      const a = result.dabs[i - 1];
      const b = result.dabs[i];
      if (!a || !b) throw new Error("dab 누락");
      expect(uvDistancePx(a, b, SIZE, false)).toBeCloseTo(5, 9);
    }
    // 압력은 선형 보간
    expect(result.dabs[3]?.pressure).toBeCloseTo(0.5, 9);
  });

  it("세그먼트 사이의 carry를 이어받아 전체 간격이 일정하다", () => {
    const first = interpolateDabs({ u: 0, v: 0, pressure: 1 }, { u: 0.07, v: 0, pressure: 1 }, BRUSH, SIZE, { wrap: false });
    expect(first.dabs).toHaveLength(1);
    expect(first.carry).toBeCloseTo(2, 9);
    const second = interpolateDabs({ u: 0.07, v: 0, pressure: 1 }, { u: 0.2, v: 0, pressure: 1 }, BRUSH, SIZE, { wrap: false, carry: first.carry });
    expect(second.dabs[0]?.u).toBeCloseTo(0.1, 9);
    expect(second.dabs).toHaveLength(3);
    expect(second.carry).toBeCloseTo(0, 9);
  });

  it("UV 랩: 경계를 넘는 최단 경로로 보간하고 결과를 [0,1)로 감는다", () => {
    expect(shortestUvDelta({ u: 0.98, v: 0, pressure: 1 }, { u: 0.02, v: 0, pressure: 1 }, true)[0]).toBeCloseTo(0.04, 9);
    expect(shortestUvDelta({ u: 0.98, v: 0, pressure: 1 }, { u: 0.02, v: 0, pressure: 1 }, false)[0]).toBeCloseTo(-0.96, 9);
    const wrapped = interpolateDabs({ u: 0.98, v: 0.5, pressure: 1 }, { u: 0.02, v: 0.5, pressure: 1 }, { ...BRUSH, spacing: 0.1 }, SIZE);
    expect(wrapped.lengthPx).toBeCloseTo(4, 9);
    expect(wrapped.dabs).toHaveLength(4);
    expect(wrapped.dabs.map((d) => Number(d.u.toFixed(4)))).toEqual([0.99, 0, 0.01, 0.02]);
    for (const dab of wrapped.dabs) {
      expect(dab.u).toBeGreaterThanOrEqual(0);
      expect(dab.u).toBeLessThan(1);
    }
  });

  it("길이 0이면 dab 없이 carry를 유지한다", () => {
    const result = interpolateDabs({ u: 0.3, v: 0.3, pressure: 1 }, { u: 0.3, v: 0.3, pressure: 1 }, BRUSH, SIZE, { carry: 1.5 });
    expect(result.dabs).toHaveLength(0);
    expect(result.carry).toBe(1.5);
  });
});

describe("SHAPER 3D 표면 앵커링 펜선 엔진(LineData)", () => {
  it("Ray-Edge 극좌표(v0d, v1d) 인코딩 후 변형된 삼각형 정점(V0', V1', V2')에서 정확히 재투영한다", () => {
    const v0 = [0, 0, 0] as const;
    const v1 = [2, 0, 0] as const;
    const v2 = [0, 2, 0] as const;
    const p = [0.5, 0.5, 0] as const;
    const { v0d, v1d } = encodeRayEdgePolarPoint(v0, v1, v2, p);
    expect(v0d).toBeCloseTo(0.5, 6);
    expect(v1d).toBeCloseTo(0.5, 6);

    const restored = reprojectRayEdgePolarPoint(v0, v1, v2, v0d, v1d);
    expect(restored[0]).toBeCloseTo(0.5, 6);
    expect(restored[1]).toBeCloseTo(0.5, 6);
    expect(restored[2]).toBeCloseTo(0, 6);

    // 삼각형이 2배 스케일 + Z축으로 +1 이동한 변형 상태에서도 무게중심이 보존된다.
    const deformed = reprojectRayEdgePolarPoint([0, 0, 1], [4, 0, 1], [0, 4, 1], v0d, v1d);
    expect(deformed).toEqual([1, 1, 1]);
  });

  it("Dyn-Levin-Gregory 4-점 보간 세분화: P_step = 9/16*(Pi+Pi+1) - 1/16*(Pi-1+Pi+2)", () => {
    const mid = evaluateDynLevinGregoryMidpoint([0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 0, 0]);
    expect(mid[0]).toBeCloseTo(1.5, 6);
    expect(mid[1]).toBeCloseTo(9 / 8, 6);
    expect(mid[2]).toBeCloseTo(0, 6);

    const subdivided = subdivideDynLevinGregory4Point([[0, 0, 0], [1, 1, 0], [2, 0, 0]], 2);
    // N=3 -> 1회: 5개 -> 2회: 9개, 원래 제어점 [0,0,0], [1,1,0], [2,0,0]을 그대로 통과한다.
    expect(subdivided).toHaveLength(9);
    expect(subdivided[0]).toEqual([0, 0, 0]);
    expect(subdivided[4]).toEqual([1, 1, 0]);
    expect(subdivided[8]).toEqual([2, 0, 0]);
  });

  it("가상 필압(fake)은 양 끝이 0이고 중앙이 최대인 사인 곡선이며, 타블렛 필압(pen)은 2*p 배율이다", () => {
    const fakeWidths = computeShaperStrokeWidths({ count: 5, thickness: 0.02, pressureMode: "fake" });
    expect(fakeWidths[0]).toBeCloseTo(0, 6);
    expect(fakeWidths[2]).toBeCloseTo(0.02, 6);
    expect(fakeWidths[4]).toBeCloseTo(0, 6);

    const penWidths = computeShaperStrokeWidths({
      count: 3,
      thickness: 0.01,
      pressureMode: "pen",
      pressures: [0.25, 0.5, 1.0],
    });
    expect(penWidths[0]).toBeCloseTo(0.005, 6);
    expect(penWidths[1]).toBeCloseTo(0.01, 6);
    expect(penWidths[2]).toBeCloseTo(0.02, 6);
  });

  it("3각기둥(Triangular Prism) 튜브 압출: 3N 정점과 18(N-1) 인덱스 및 법선 방향 +0.2w 오프셋을 생성한다", () => {
    const points = [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 2],
    ] as const;
    const normals = [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ] as const;
    const widths = [0.1, 0.2, 0.1];
    const tube = extrudeTriangularPrismStrokeTube({
      points,
      surfaceNormals: normals,
      widths,
      alphas: [1, 1, 0],
    });
    expect(tube.positions.length).toBe(3 * 3 * 3);
    expect(tube.indices.length).toBe(2 * 18);
    expect(tube.alphas[0]).toBeCloseTo(1, 6);
    expect(tube.alphas[8]).toBeCloseTo(0, 6);
    // k=0 정점은 중심축(+0.2w)에서 다시 +0.5w만큼 법선 방향(+y)으로 이동하므로 y = 0.7 * w
    expect(tube.positions[3 * 3 + 1]).toBeCloseTo(0.7 * 0.2, 5);
  });

  it("의상 마스크(bodyMaskTex) Red 채널 > 0.5인 UV 지점의 신체 펜선 알파를 0으로 은폐한다", () => {
    const rgba = new Uint8Array([
      0, 0, 0, 255,     // (0,0): r=0 -> 가려지지 않음
      200, 0, 0, 255,   // (1,0): r=200/255 > 0.5 -> 의상에 가려짐
    ]);
    const alphas = computeBodyLineMaskAlphas(
      [
        [0.1, 0.5],
        [0.9, 0.5],
      ],
      [{ width: 2, height: 1, rgba }],
    );
    expect(alphas[0]).toBe(1);
    expect(alphas[1]).toBe(0);
  });
});
