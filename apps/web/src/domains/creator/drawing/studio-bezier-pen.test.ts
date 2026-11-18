import { describe, expect, it } from "vitest";

import {
  buildDrawElFromBezierPen,
  createInitialBezierPenState,
  reduceStudioBezierPen,
} from "./studio-bezier-pen";

describe("studio-bezier-pen", () => {
  it("click → 대칭 drag → altDrag(첨점 꺾기) → backspace → closePath 상태 전이가 순수하게 동작한다", () => {
    let s = createInitialBezierPenState("cubic-bezier");

    // 첫 정점(0, 0) 찍고 오른쪽으로 대칭 핸들 드래그(20, 0) → inHandle=(-20, 0), outHandle=(20, 0)
    s = reduceStudioBezierPen(s, { type: "click", x: 0, y: 0 });
    s = reduceStudioBezierPen(s, { type: "drag", x: 20, y: 0 });
    expect(s.anchors[0]!.handleKind).toBe("symmetric");
    expect(s.anchors[0]!.inHandle).toEqual({ x: -20, y: 0 });
    expect(s.anchors[0]!.outHandle).toEqual({ x: 20, y: 0 });

    // altDrag로 출구 핸들만 위쪽(0, 30)으로 꺾어 cusp 생성 → inHandle(-20, 0)은 그대로 보존!
    s = reduceStudioBezierPen(s, { type: "altDrag", x: 0, y: 30 });
    expect(s.anchors[0]!.handleKind).toBe("broken");
    expect(s.anchors[0]!.inHandle).toEqual({ x: -20, y: 0 });
    expect(s.anchors[0]!.outHandle).toEqual({ x: 0, y: 30 });

    // 두 번째 정점(100, 50)과 세 번째 잘못 찍은 정점(150, 99) 추가 후 backspace로 되돌리기
    s = reduceStudioBezierPen(s, { type: "click", x: 100, y: 50 });
    s = reduceStudioBezierPen(s, { type: "click", x: 150, y: 99 });
    expect(s.anchors).toHaveLength(3);

    s = reduceStudioBezierPen(s, { type: "backspace" });
    expect(s.anchors).toHaveLength(2);
    expect(s.anchors[1]!.x).toBe(100);

    // 포인터 이동 시 라이브 prediction 고무줄 경로 생성 및 시작점 근접 시 닫힘 예고 확인
    s = reduceStudioBezierPen(s, { type: "pointerMove", x: 80, y: 90 });
    expect(s.prediction.length).toBeGreaterThanOrEqual(4);
    expect(s.willCloseOnClick).toBe(false);

    s = reduceStudioBezierPen(s, { type: "pointerMove", x: 3, y: 4, closeRadiusPx: 10 });
    expect(s.willCloseOnClick).toBe(true);

    // closePath로 폐곡선 확정 및 적응형 평탄화 DrawEl 생성
    s = reduceStudioBezierPen(s, { type: "closePath" });
    expect(s.status).toBe("committed");
    expect(s.closed).toBe(true);

    const drawEl = buildDrawElFromBezierPen(s, {
      id: "bez-1",
      stroke: "#000000",
      strokeWidth: 3,
      flattenTolerancePx: 0.4,
    });
    expect(drawEl).not.toBeNull();
    // 곡률이 있는 3차 베지어 폐곡선이므로 세밀하게 적응 분할되어 정점 수가 충분히 많다.
    expect(drawEl!.points.length / 2).toBeGreaterThan(8);
    expect(drawEl!.points.slice(0, 2)).toEqual([0, 0]);
    expect(drawEl!.points.slice(-2)).toEqual([0, 0]);
  });

  it("polyline 모드와 continuous-curve 모드가 각각 직선 꺾은선과 부드러운 스플라인으로 평탄화된다", () => {
    let poly = createInitialBezierPenState("polyline");
    poly = reduceStudioBezierPen(poly, { type: "click", x: 0, y: 0 });
    poly = reduceStudioBezierPen(poly, { type: "click", x: 50, y: 40 });
    poly = reduceStudioBezierPen(poly, { type: "click", x: 100, y: 0 });
    poly = reduceStudioBezierPen(poly, { type: "commitOpen" });

    const polyEl = buildDrawElFromBezierPen(poly, {
      id: "poly-1",
      stroke: "#222222",
      strokeWidth: 2,
    });
    expect(polyEl!.points).toEqual([0, 0, 50, 40, 100, 0]);

    let spline = createInitialBezierPenState("continuous-curve");
    spline = reduceStudioBezierPen(spline, { type: "click", x: 0, y: 0 });
    spline = reduceStudioBezierPen(spline, { type: "click", x: 50, y: 40 });
    spline = reduceStudioBezierPen(spline, { type: "click", x: 100, y: 0 });
    spline = reduceStudioBezierPen(spline, { type: "commitOpen" });

    const splineEl = buildDrawElFromBezierPen(spline, {
      id: "spl-1",
      stroke: "#222222",
      strokeWidth: 2,
      flattenTolerancePx: 0.5,
    });
    expect(splineEl!.points.length / 2).toBeGreaterThan(6);
  });
});
