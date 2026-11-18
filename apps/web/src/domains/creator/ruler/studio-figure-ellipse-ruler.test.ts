import { describe, expect, it } from "vitest";

import {
  beginConcentricEllipseSnapSession,
  beginParallelCurveSnapSession,
  createRulerFromVectorStroke,
  projectPointOntoRotatedEllipse,
  snapConcentricEllipsePoint,
  snapFigureRulerPoint,
  snapParallelCurvePoint,
} from "./studio-figure-ellipse-ruler";

describe("studio-figure-ellipse-ruler", () => {
  it("Newton-Raphson 회전 타원 최근접점 투영이 타원 방정식과 법선 직교 조건을 정밀하게 만족한다", () => {
    const ellipse = {
      centerX: 120,
      centerY: 80,
      radiusX: 100,
      radiusY: 40,
      rotationDeg: 35,
    };
    const query = { x: 210, y: 190 };
    const projected = projectPointOntoRotatedEllipse(ellipse, query);
    expect(projected).not.toBeNull();

    // 로컬 좌표로 되돌려 (lx/rx)^2 + (ly/ry)^2 === 1 확인
    const rad = (ellipse.rotationDeg * Math.PI) / 180;
    const dx = projected!.x - ellipse.centerX;
    const dy = projected!.y - ellipse.centerY;
    const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
    const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
    const implicitVal = (lx / ellipse.radiusX) ** 2 + (ly / ellipse.radiusY) ** 2;
    expect(implicitVal).toBeCloseTo(1, 9);

    // 로컬 접선 벡터 (-rx*sin(u), ry*cos(u)) 와 (queryLocal - projectedLocal) 내적 === 0 검증
    const qdx = query.x - ellipse.centerX;
    const qdy = query.y - ellipse.centerY;
    const qlx = qdx * Math.cos(rad) + qdy * Math.sin(rad);
    const qly = -qdx * Math.sin(rad) + qdy * Math.cos(rad);
    const tx = -ellipse.radiusX * (ly / ellipse.radiusY);
    const ty = ellipse.radiusY * (lx / ellipse.radiusX);
    const dotTangent = (qlx - lx) * tx + (qly - ly) * ty;
    expect(Math.abs(dotTangent)).toBeLessThan(1e-5);
  });

  it("동심 타원 특수 자(concentric-ellipse)는 시작점을 지나는 동심 배율 타원을 유지하며 스냅한다", () => {
    const ruler = {
      id: "ce-1",
      type: "concentric-ellipse" as const,
      centerX: 0,
      centerY: 0,
      radiusX: 50,
      radiusY: 25,
      rotationDeg: 0,
    };

    // 시작점 (100, 0) → 배율 k = 2 → 활성 타원 장반경 100, 단반경 50
    const session = beginConcentricEllipseSnapSession(ruler, { x: 100, y: 0 });
    expect(session).not.toBeNull();
    const topSnap = snapConcentricEllipsePoint(session!, { x: 0, y: 120 });
    expect(topSnap!.point.x).toBeCloseTo(0, 6);
    expect(topSnap!.point.y).toBeCloseTo(50, 6);
  });

  it("평행 곡선 자(parallel-curve)는 시작점 오프셋을 유지한 평행 궤적을 따라가고 벡터에서 자 작성을 지원한다", () => {
    const fromVector = createRulerFromVectorStroke({
      id: "vec-42",
      points: [0, 100, 50, 100, 100, 100, 150, 100],
    });
    if (!fromVector || fromVector.type !== "parallel-curve") {
      throw new Error("expected parallel-curve ruler spec");
    }

    // 곡선(y=100)에서 위쪽으로 25px 떨어진 (10, 75)에서 시작
    const session = beginParallelCurveSnapSession(fromVector, { x: 10, y: 75 });
    expect(session).not.toBeNull();
    const moved = snapParallelCurvePoint(session!, { x: 120, y: 40 });
    expect(moved!.point.x).toBeCloseTo(120, 6);
    expect(moved!.point.y).toBeCloseTo(75, 6);
  });

  it("도형 자(Figure ruler)가 사각형·다각형 외곽선으로 정확히 투영한다", () => {
    const rectSnap = snapFigureRulerPoint(
      {
        id: "fig-rect",
        type: "figure",
        shape: "rectangle",
        centerX: 100,
        centerY: 100,
        radiusX: 40,
        radiusY: 30,
        rotationDeg: 0,
      },
      { x: 110, y: 20 },
    );
    expect(rectSnap).toEqual({ x: 110, y: 70 });
  });
});
