import { describe, expect, it } from "vitest";

import {
  applyCornerPinTransform,
  constrainIsopodTrapezoidQuad,
  constrainTrapezoidQuad,
  createIdentityCornerPinQuad,
  isConvexNonBowtieQuad,
  projectPointHomography,
  solveHomography8Dof,
  validateCornerPinQuad,
} from "./studio-corner-pin-transform";

import type { StudioImageDataLike } from "../studio-filters";

function createTestImage(width: number, height: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = (x * 29 + y * 7) & 0xff;
      data[idx + 1] = (x * 13 + y * 41) & 0xff;
      data[idx + 2] = (x * 53 + y * 19) & 0xff;
      data[idx + 3] = (x + y) % 5 === 0 ? 0 : 255;
    }
  }
  return { width, height, data };
}

describe("studio-corner-pin-transform", () => {
  it("8-DOF 호모그래피 솔버가 4개 원근 꼭짓점을 오차 없이 정확히 사영한다", () => {
    const src = createIdentityCornerPinQuad(100, 80);
    const dst = {
      topLeft: { x: 18, y: 10 },
      topRight: { x: 84, y: 14 },
      bottomRight: { x: 96, y: 75 },
      bottomLeft: { x: 4, y: 72 },
    };

    const H = solveHomography8Dof(src, dst);
    expect(H).not.toBeNull();

    const p0 = projectPointHomography(H!, src.topLeft)!;
    const p1 = projectPointHomography(H!, src.topRight)!;
    const p2 = projectPointHomography(H!, src.bottomRight)!;
    const p3 = projectPointHomography(H!, src.bottomLeft)!;

    expect(p0.x).toBeCloseTo(dst.topLeft.x, 6);
    expect(p0.y).toBeCloseTo(dst.topLeft.y, 6);
    expect(p1.x).toBeCloseTo(dst.topRight.x, 6);
    expect(p1.y).toBeCloseTo(dst.topRight.y, 6);
    expect(p2.x).toBeCloseTo(dst.bottomRight.x, 6);
    expect(p2.y).toBeCloseTo(dst.bottomRight.y, 6);
    expect(p3.x).toBeCloseTo(dst.bottomLeft.x, 6);
    expect(p3.y).toBeCloseTo(dst.bottomLeft.y, 6);
  });

  it("나비넥타이(자가교차) 및 오목 사각형을 정확히 거부한다", () => {
    const bowtie = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 100 },
      bottomRight: { x: 100, y: 0 },
      bottomLeft: { x: 0, y: 100 },
    };
    const bowtieCheck = validateCornerPinQuad(bowtie);
    expect(bowtieCheck.valid).toBe(false);
    expect(bowtieCheck.reason).toBe("bowtie-self-intersecting");
    expect(isConvexNonBowtieQuad(bowtie)).toBe(false);

    const concave = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 35, y: 25 },
      bottomLeft: { x: 0, y: 100 },
    };
    const concaveCheck = validateCornerPinQuad(concave);
    expect(concaveCheck.valid).toBe(false);
    expect(concaveCheck.reason).toBe("non-convex");
    expect(() => applyCornerPinTransform(createTestImage(8, 8), bowtie)).toThrow();
  });

  it("사다리꼴 및 등변사다리꼴(isopod) 제약 헬퍼가 평행축과 좌우 대칭을 유지한다", () => {
    const base = createIdentityCornerPinQuad(101, 81); // 0..100 x 0..80, midX = 50
    const trap = constrainTrapezoidQuad(base, "topLeft", { x: 15, y: 12 }, "horizontal");
    expect(trap.topLeft).toEqual({ x: 15, y: 12 });
    expect(trap.topRight).toEqual({ x: 100, y: 12 });

    const isopod = constrainIsopodTrapezoidQuad(
      base,
      "topLeft",
      { x: 20, y: 10 },
      "horizontal",
    );
    expect(isopod.topLeft).toEqual({ x: 20, y: 10 });
    expect(isopod.topRight).toEqual({ x: 80, y: 10 });
    expect(isopod.bottomLeft).toEqual({ x: 0, y: 80 });
    expect(isopod.bottomRight).toEqual({ x: 100, y: 80 });
  });

  it("항등 사각형에서 원본 RGBA 버퍼를 바이트 단위로 완벽히 재현한다", () => {
    const src = createTestImage(12, 10);
    const identity = createIdentityCornerPinQuad(12, 10);
    const warped = applyCornerPinTransform(src, identity);
    expect([...warped.data]).toEqual([...src.data]);
  });

  it("등변사다리꼴 원근 축소 시 상단 폭 안쪽에만 불투명 픽셀이 배치된다", () => {
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 220;
      data[i + 1] = 80;
      data[i + 2] = 40;
      data[i + 3] = 255;
    }
    const src: StudioImageDataLike = { width: 20, height: 20, data };
    const base = createIdentityCornerPinQuad(20, 20);
    const dst = constrainIsopodTrapezoidQuad(base, "topLeft", { x: 5, y: 2 }, "horizontal");
    const out = applyCornerPinTransform(src, dst);

    // 상단 바깥쪽(x=1, y=3)은 투명, 상단 중앙(x=10, y=3)은 채워져야 한다.
    expect(out.data[(3 * 20 + 1) * 4 + 3]).toBe(0);
    expect(out.data[(3 * 20 + 10) * 4 + 3]).toBe(255);
    expect(out.data[(3 * 20 + 10) * 4]).toBe(220);
  });
});
