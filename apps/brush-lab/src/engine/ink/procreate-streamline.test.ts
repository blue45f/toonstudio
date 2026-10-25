import { describe, expect, it } from "vitest";

import {
  applyCurvatureStreamline,
  applyPostStrokeCornerPreservingSmooth,
  applyProcreateMotionFiltering,
  classifyAndPerfectifyProcreateQuickShape,
  computeTurningAngleRad,
  detectQuickShapePrimitive,
  evaluateProcreateDualTaperEnvelope,
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

  it("Procreate 5.3+ Motion Filtering은 시작·끝점 지연 없이 횡방향 고주파 손떨림을 억제하고 expression에 비례해 굴곡을 보존한다", () => {
    const tremorStroke: StreamlineSample[] = [
      { x: 0, y: 0, pressure: 0.4, timeMs: 0 },
      { x: 20, y: 6.5, pressure: 0.5, timeMs: 8 },
      { x: 40, y: -6.2, pressure: 0.6, timeMs: 16 },
      { x: 60, y: 5.8, pressure: 0.7, timeMs: 24 },
      { x: 80, y: -5.4, pressure: 0.6, timeMs: 32 },
      { x: 100, y: 0, pressure: 0.5, timeMs: 40 },
    ];
    const strongFiltered = applyProcreateMotionFiltering(tremorStroke, {
      amount01: 0.85,
      expression01: 0.1,
    });
    const expressiveFiltered = applyProcreateMotionFiltering(tremorStroke, {
      amount01: 0.85,
      expression01: 0.9,
    });

    // Zero-lag: 시작점과 끝점이 원본과 100% 일치
    expect(strongFiltered[0]).toEqual(tremorStroke[0]);
    expect(strongFiltered[strongFiltered.length - 1]).toEqual(tremorStroke[tremorStroke.length - 1]);

    // 횡방향 떨림(y) 진폭이 원본보다 현저히 감소하고, expression01이 높으면 더 많은 굴곡이 보존됨
    expect(Math.abs(strongFiltered[1]!.y)).toBeLessThan(Math.abs(tremorStroke[1]!.y));
    expect(Math.abs(strongFiltered[1]!.y)).toBeLessThan(Math.abs(expressiveFiltered[1]!.y));
  });

  it("이중 테이퍼(Pressure/Touch Taper)는 펜과 손가락 입력에 각각 독립적인 입출필 테이퍼 곡선을 적용한다", () => {
    const penEntry = evaluateProcreateDualTaperEnvelope(0.05, 0.8, "pen", {
      startLength01: 0.2,
      endLength01: 0.2,
      pressureSize01: 0.9,
      touchSize01: 0.2,
    });
    const touchEntry = evaluateProcreateDualTaperEnvelope(0.05, 0.8, "touch", {
      startLength01: 0.2,
      endLength01: 0.2,
      pressureSize01: 0.9,
      touchSize01: 0.2,
    });
    const midStroke = evaluateProcreateDualTaperEnvelope(0.5, 0.8, "pen");

    expect(penEntry.activeMode).toBe("pressure-taper");
    expect(touchEntry.activeMode).toBe("touch-taper");
    expect(penEntry.sizeMultiplier01).toBeLessThan(touchEntry.sizeMultiplier01);
    expect(midStroke.sizeMultiplier01).toBeCloseTo(1, 5);
  });

  it("QuickShape + Edit Shape 정형 변환기는 타원→정원, 사각형→정사각형, 삼각형→정삼각형, 호(Arc) 제어 노드를 생성한다", () => {
    const ellipsePts = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 23) * Math.PI * 2;
      return { x: 100 + Math.cos(a) * 60, y: 100 + Math.sin(a) * 30 };
    });
    const ellipseRes = classifyAndPerfectifyProcreateQuickShape(ellipsePts, {
      convertToPerfect: false,
    });
    expect(ellipseRes.kind).toBe("ellipse");
    expect(ellipseRes.controlNodes).toHaveLength(4);

    const perfectCircleRes = classifyAndPerfectifyProcreateQuickShape(ellipsePts, {
      convertToPerfect: true,
    });
    expect(perfectCircleRes.kind).toBe("circle");
    expect(perfectCircleRes.isPerfectVariant).toBe(true);

    const openArcPts = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 11) * Math.PI * 0.8;
      return { x: Math.cos(a) * 50, y: Math.sin(a) * 50 };
    });
    const arcRes = classifyAndPerfectifyProcreateQuickShape(openArcPts);
    expect(arcRes.kind).toBe("arc");
    expect(arcRes.controlNodes.map((n) => n.id)).toEqual(["start", "apex", "end"]);
  });
});
