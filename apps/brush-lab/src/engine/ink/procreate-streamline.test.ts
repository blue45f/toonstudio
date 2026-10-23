import { describe, expect, it } from "vitest";

import {
  applyCurvatureStreamline,
  applyPostStrokeCornerPreservingSmooth,
  computeTurningAngleRad,
  detectQuickShapePrimitive,
} from "./procreate-streamline";

import type { StreamlineSample } from "./procreate-streamline";

describe("procreate-streamline (클린룸 StreamLine·QuickShape·선 후보정)", () => {
  it("일직선 전진 표본의 회전 각도는 0이고 직각 꺾임은 π/2에 가깝다", () => {
    const straight = computeTurningAngleRad({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 });
    const rightAngle = computeTurningAngleRad({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 });
    expect(straight).toBeCloseTo(0, 5);
    expect(rightAngle).toBeCloseTo(Math.PI / 2, 5);
  });

  it("곡률 적응형 StreamLine은 직선 구간의 지터는 줄이고 날카로운 예각 코너 정점은 보존한다", () => {
    const jitteryLShape: StreamlineSample[] = [
      { x: 0, y: 0, pressure: 0.5, timeMs: 0 },
      { x: 10, y: 1.8, pressure: 0.5, timeMs: 8 },
      { x: 20, y: -1.6, pressure: 0.5, timeMs: 16 },
      { x: 30, y: 0, pressure: 0.6, timeMs: 24 }, // 직각 코너
      { x: 30, y: 15, pressure: 0.7, timeMs: 32 },
      { x: 30, y: 30, pressure: 0.8, timeMs: 40 },
    ];
    const smoothed = applyCurvatureStreamline(jitteryLShape, {
      streamlineAmount: 0.8,
      cornerAngleDeg: 50,
    });
    expect(smoothed).toHaveLength(jitteryLShape.length);
    // 직선 구간 지터 감소 확인
    expect(Math.abs(smoothed[1]?.y ?? 99)).toBeLessThan(Math.abs(jitteryLShape[1]?.y ?? 0));
    // 직각 코너(인덱스 3) 좌표 보존 확인
    expect(smoothed[3]?.x).toBeCloseTo(30, 5);
    expect(smoothed[3]?.y).toBeCloseTo(0, 5);
  });

  it("CSP 스타일 코너 보존 후보정은 시작·끝·코너 정점을 고정한 채 내부 정점을 매끄럽게 정돈한다", () => {
    const stroke: StreamlineSample[] = [
      { x: 0, y: 0, pressure: 0.5, timeMs: 0 },
      { x: 10, y: 3, pressure: 0.5, timeMs: 10 },
      { x: 20, y: 0, pressure: 0.5, timeMs: 20 },
      { x: 20, y: 20, pressure: 0.5, timeMs: 30 },
    ];
    const post = applyPostStrokeCornerPreservingSmooth(stroke, {
      cornerAngleDeg: 50,
      postCorrectionPasses: 3,
      postCorrectionLambda: 0.4,
    });
    expect(post[0]).toEqual(stroke[0]);
    expect(post[2]?.x).toBe(20);
    expect(post[2]?.y).toBe(0);
    expect(post[1]?.y).toBeLessThan(3);
  });

  it("QuickShape 판별기는 직선·원·다각선(꺾인 선)을 정확히 분류한다", () => {
    const linePts = [
      { x: 0, y: 0 },
      { x: 25, y: 0.3 },
      { x: 50, y: -0.2 },
      { x: 100, y: 0 },
    ];
    expect(detectQuickShapePrimitive(linePts).kind).toBe("line");

    const circlePts = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 23) * Math.PI * 2;
      return { x: 50 + Math.cos(a) * 30, y: 50 + Math.sin(a) * 30 };
    });
    const circleRes = detectQuickShapePrimitive(circlePts);
    expect(circleRes.kind).toBe("circle");
    expect(circleRes.snappedPoints.length).toBe(16);

    const polylinePts = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 40, y: 40 },
    ];
    const polyRes = detectQuickShapePrimitive(polylinePts, 50);
    expect(polyRes.kind).toBe("polyline");
    expect(polyRes.snappedPoints).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]);
  });
});
